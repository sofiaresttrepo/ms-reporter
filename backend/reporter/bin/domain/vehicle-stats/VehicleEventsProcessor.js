'use strict'

const { Subject, from } = require('rxjs');
const { bufferTime, filter, mergeMap, tap, catchError } = require('rxjs/operators');
const { ConsoleLogger } = require('@nebulae/backend-node-tools').log;
const { brokerFactory } = require('@nebulae/backend-node-tools').broker;
const crypto = require('crypto');

const VehicleStatsDA = require('./data-access/VehicleStatsDA');

/**
 * Singleton instance
 * @type { VehicleEventsProcessor }
 */
let instance;

class VehicleEventsProcessor {
    constructor() {
        this.events$ = new Subject();
        this.broker = brokerFactory();
        this.isProcessing = false;
    }

    /**
     * Generates a deterministic aid from vehicle data when missing
     * @param {Object} vehicleData
     * @returns {string}
     */
    generateAidFromVehicleData(vehicleData) {
        const stableStringify = (obj) => {
            if (obj === null || typeof obj !== 'object') { return JSON.stringify(obj); }
            if (Array.isArray(obj)) {
                return '[' + obj.map(item => stableStringify(item)).join(',') + ']';
            }
            const keys = Object.keys(obj).sort();
            const keyValues = keys.map(k => `${JSON.stringify(k)}:${stableStringify(obj[k])}`);
            return '{' + keyValues.join(',') + '}';
        };
        const payload = stableStringify(vehicleData || {});
        return crypto.createHash('sha256').update(payload).digest('hex');
    }

    /**
     * Inicia el procesamiento de eventos de vehículos
     */
    start$() {
        ConsoleLogger.i('VehicleEventsProcessor: Starting vehicle events processing...');
        
        // Configurar suscripción MQTT
        this.broker.configMessageListener$([process.env.MQTT_TOPIC_GENERATED || 'fleet/vehicles/generated'])
            .pipe(
                tap(topics => ConsoleLogger.i(`VehicleEventsProcessor: Subscribed to topics: ${JSON.stringify(topics)}`)),
                catchError(error => {
                    ConsoleLogger.e('VehicleEventsProcessor: Error subscribing to MQTT topics', error);
                    return from([]);
                })
            )
            .subscribe(
                topics => ConsoleLogger.i(`VehicleEventsProcessor: Successfully subscribed to ${topics.length} topics`),
                error => ConsoleLogger.e('VehicleEventsProcessor: Error in MQTT subscription', error),
                () => ConsoleLogger.i('VehicleEventsProcessor: MQTT subscription completed')
            );

        // Suscribirse a mensajes entrantes
        this.broker.incomingMessages$
            .pipe(
                filter(message => message && message.topic === (process.env.MQTT_TOPIC_GENERATED || 'fleet/vehicles/generated')),
                tap(event => ConsoleLogger.i(`VehicleEventsProcessor: Received event: ${JSON.stringify(event)}`)),
                catchError(error => {
                    ConsoleLogger.e('VehicleEventsProcessor: Error receiving MQTT events', error);
                    return from([]);
                })
            )
            .subscribe(
                event => {
                    // El evento MQTT tiene esta estructura:
                    // { id, type: "VehicleGenerated", data: { at, et, aid, timestamp, data: {...} } }
                    const envelope = event && event.data ? event.data : event;
                    if (!envelope) { 
                        ConsoleLogger.w(`VehicleEventsProcessor: No envelope found in event: ${JSON.stringify(event)}`);
                        return; 
                    }
                    
                    // Verificar que tenga la estructura esperada
                    if (!envelope.aid || !envelope.data) {
                        ConsoleLogger.w(`VehicleEventsProcessor: Invalid envelope structure: ${JSON.stringify(envelope)}`);
                        return;
                    }
                    
                    ConsoleLogger.i(`VehicleEventsProcessor: Processing envelope: ${JSON.stringify(envelope)}`);
                    this.events$.next(envelope);
                },
                error => ConsoleLogger.e('VehicleEventsProcessor: Error in MQTT message processing', error),
                () => ConsoleLogger.i('VehicleEventsProcessor: MQTT message processing completed')
            );

        // Configurar pipeline de procesamiento por lotes
        this.events$
            .pipe(
                bufferTime(1000), // Buffer de 1 segundo
                filter(batch => batch.length > 0),
                tap(batch => ConsoleLogger.i(`VehicleEventsProcessor: Processing batch of ${batch.length} events`))
            )
            .subscribe(
                async (batch) => {
                    if (this.isProcessing) {
                        ConsoleLogger.w('VehicleEventsProcessor: Previous batch still processing, skipping...');
                        return;
                    }
                    
                    this.isProcessing = true;
                    try {
                        await this.processBatch$(batch);
                    } catch (error) {
                        ConsoleLogger.e('VehicleEventsProcessor: Error processing batch', error);
                    } finally {
                        this.isProcessing = false;
                    }
                },
                error => ConsoleLogger.e('VehicleEventsProcessor: Error in batch processing', error)
            );

        // Retornar Observable que se completa inmediatamente
        return from([{ message: 'VehicleEventsProcessor started successfully' }]);
    }

    /**
     * Procesa un lote de eventos
     * @param {Array} batch - Lote de eventos a procesar
     */
    async processBatch$(batch) {
        ConsoleLogger.i(`VehicleEventsProcessor: Processing batch of ${batch.length} events`);

        // 1. Extraer aids únicos del batch
        const aids = batch.map(event => event.aid).filter(aid => aid);
        
        if (aids.length === 0) {
            ConsoleLogger.w('VehicleEventsProcessor: No valid aids in batch, skipping...');
            return;
        }

        // 2. Verificar idempotencia - obtener aids ya procesados
        const processedAids = await VehicleStatsDA.getProcessedAids$(aids).toPromise();
        const processedAidsSet = new Set(processedAids);

        // 3. Filtrar eventos frescos (no procesados)
        const freshEvents = batch.filter(event => 
            event.aid && !processedAidsSet.has(event.aid)
        );

        if (freshEvents.length === 0) {
            ConsoleLogger.i('VehicleEventsProcessor: No fresh events to process, skipping...');
            return;
        }

        ConsoleLogger.i(`VehicleEventsProcessor: Processing ${freshEvents.length} fresh events out of ${batch.length} total`);

        // 4. Procesar eventos frescos
        ConsoleLogger.i(`VehicleEventsProcessor: About to process ${freshEvents.length} fresh events`);
        try {
            await this.processFreshEvents$(freshEvents);
            ConsoleLogger.i(`VehicleEventsProcessor: Successfully completed processFreshEvents$`);
        } catch (error) {
            ConsoleLogger.e(`VehicleEventsProcessor: Error in processFreshEvents$: ${error.message}`);
            ConsoleLogger.e(`VehicleEventsProcessor: Error stack: ${error.stack}`);
        }
    }

    /**
     * Procesa eventos frescos y actualiza estadísticas
     * @param {Array} freshEvents - Eventos frescos a procesar
     */
    async processFreshEvents$(freshEvents) {
        ConsoleLogger.i(`VehicleEventsProcessor: Starting to process ${freshEvents.length} fresh events`);
        
        try {
            // 5. Derivar campos y construir acumuladores
            ConsoleLogger.i(`VehicleEventsProcessor: Calculating batch stats...`);
            const batchStats = this.calculateBatchStats(freshEvents);
            ConsoleLogger.i(`VehicleEventsProcessor: Calculated batch stats: ${JSON.stringify(batchStats)}`);

            // 6. Actualizar estadísticas en MongoDB
            ConsoleLogger.i(`VehicleEventsProcessor: Updating fleet statistics in MongoDB...`);
            ConsoleLogger.i(`VehicleEventsProcessor: Batch stats to update: ${JSON.stringify(batchStats)}`);
            const updatedStats = await VehicleStatsDA.updateFleetStatistics$(batchStats).toPromise();
            ConsoleLogger.i(`VehicleEventsProcessor: Fleet statistics updated in MongoDB: ${JSON.stringify(updatedStats)}`);

            // 7. Insertar aids procesados
            const freshAids = freshEvents.map(event => event.aid);
            ConsoleLogger.i(`VehicleEventsProcessor: Inserting ${freshAids.length} processed aids...`);
            await VehicleStatsDA.insertProcessedAids$(freshAids).toPromise();
            ConsoleLogger.i(`VehicleEventsProcessor: Processed aids inserted successfully`);

            // 8. Notificar por WebSocket
            ConsoleLogger.i(`VehicleEventsProcessor: Sending WebSocket notification...`);
            await this.notifyWebSocket$(updatedStats);

            ConsoleLogger.i(`VehicleEventsProcessor: Successfully processed ${freshEvents.length} events`);
        } catch (error) {
            ConsoleLogger.e(`VehicleEventsProcessor: Error processing fresh events: ${error.message}`);
            ConsoleLogger.e(`VehicleEventsProcessor: Error stack: ${error.stack}`);
            throw error;
        }
    }

    /**
     * Calcula estadísticas del lote
     * @param {Array} events - Eventos a procesar
     * @returns {Object} Estadísticas del lote
     */
    calculateBatchStats(events) {
        ConsoleLogger.i(`VehicleEventsProcessor: Calculating stats for ${events.length} events`);
        
        const stats = {
            totalVehicles: events.length,
            vehiclesByType: {},
            vehiclesByDecade: {},
            vehiclesBySpeedClass: {},
            hpStats: {
                sum: 0,
                count: events.length,
                min: Infinity,
                max: -Infinity
            }
        };

        events.forEach(event => {
            const { data } = event;
            if (!data) {
                ConsoleLogger.w(`VehicleEventsProcessor: Event without data: ${JSON.stringify(event)}`);
                return;
            }

            const { type, powerSource, hp, year, topSpeed } = data;
            ConsoleLogger.i(`VehicleEventsProcessor: Processing vehicle - type: ${type}, hp: ${hp}, year: ${year}, topSpeed: ${topSpeed}`);

            // Vehículos por tipo
            if (type) {
                stats.vehiclesByType[type] = (stats.vehiclesByType[type] || 0) + 1;
            }

            // Vehículos por década
            if (year) {
                const decade = Math.floor(year / 10) * 10 + 's';
                stats.vehiclesByDecade[decade] = (stats.vehiclesByDecade[decade] || 0) + 1;
            }

            // Clasificación por velocidad
            if (topSpeed) {
                let speedClass;
                if (topSpeed < 140) speedClass = 'Lento';
                else if (topSpeed <= 240) speedClass = 'Normal';
                else speedClass = 'Rapido';
                
                stats.vehiclesBySpeedClass[speedClass] = (stats.vehiclesBySpeedClass[speedClass] || 0) + 1;
            }

            // Estadísticas de HP
            if (hp && typeof hp === 'number') {
                stats.hpStats.sum += hp;
                stats.hpStats.min = Math.min(stats.hpStats.min, hp);
                stats.hpStats.max = Math.max(stats.hpStats.max, hp);
            }
        });

        // Limpiar valores infinitos
        if (stats.hpStats.min === Infinity) stats.hpStats.min = 0;
        if (stats.hpStats.max === -Infinity) stats.hpStats.max = 0;

        return stats;
    }

    /**
     * Notifica cambios por WebSocket
     * @param {Object} stats - Estadísticas actualizadas
     */
    async notifyWebSocket$(stats) {
        try {
            // Enviar notificación por broker para WebSocket
            await this.broker.send$(
                'emi-gateway-materialized-view-updates',
                'FleetStatisticsUpdated',
                stats
            ).toPromise();
            ConsoleLogger.i('VehicleEventsProcessor: WebSocket notification sent');
        } catch (error) {
            ConsoleLogger.e('VehicleEventsProcessor: Error sending WebSocket notification', error);
        }
    }

    /**
     * Detiene el procesamiento
     */
    stop$() {
        ConsoleLogger.i('VehicleEventsProcessor: Stopping...');
        this.events$.complete();
        return from([{ message: 'VehicleEventsProcessor stopped' }]);
    }
}

/**
 * @returns {VehicleEventsProcessor}
 */
module.exports = () => {
    if (!instance) {
        instance = new VehicleEventsProcessor();
        ConsoleLogger.i(`${instance.constructor.name} Singleton created`);
    }
    return instance;
};
