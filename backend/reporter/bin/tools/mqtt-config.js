"use strict";

const { ConsoleLogger } = require('@nebulae/backend-node-tools').log;

/**
 * MQTT Configuration for Vehicle Statistics
 */
class MQTTConfig {
    constructor() {
        this.config = {
            // MQTT Broker Configuration
            mqtt: {
                host: process.env.MQTT_HOST || 'localhost',
                port: parseInt(process.env.MQTT_PORT) || 1883,
                username: process.env.MQTT_USERNAME || '',
                password: process.env.MQTT_PASSWORD || '',
                clientId: `vehicle-reporter-${Date.now()}`,
                clean: true,
                reconnectPeriod: 5000,
                connectTimeout: 30 * 1000,
                will: {
                    topic: 'fleet/reporter/status',
                    payload: 'offline',
                    qos: 1,
                    retain: true
                }
            },
            
            // Topics
            topics: {
                vehicleGenerated: 'fleet/vehicles/generated',
                reporterStatus: 'fleet/reporter/status',
                fleetStatisticsUpdated: 'fleet-statistics-updated',
                materializedViewUpdates: 'emi-gateway-materialized-view-updates'
            },
            
            // WebSocket Configuration
            websocket: {
                port: parseInt(process.env.WEBSOCKET_PORT) || 3002,
                path: '/ws',
                heartbeatInterval: 30000,
                maxConnections: 1000
            }
        };
    }

    /**
     * Get MQTT configuration
     */
    getMQTTConfig() {
        return this.config.mqtt;
    }

    /**
     * Get WebSocket configuration
     */
    getWebSocketConfig() {
        return this.config.websocket;
    }

    /**
     * Get topics configuration
     */
    getTopics() {
        return this.config.topics;
    }

    /**
     * Validate configuration
     */
    validate() {
        const errors = [];

        if (!this.config.mqtt.host) {
            errors.push('MQTT_HOST is required');
        }

        if (!this.config.mqtt.port || this.config.mqtt.port < 1 || this.config.mqtt.port > 65535) {
            errors.push('MQTT_PORT must be a valid port number (1-65535)');
        }

        if (errors.length > 0) {
            throw new Error(`Configuration validation failed: ${errors.join(', ')}`);
        }

        ConsoleLogger.i('MQTT configuration validated successfully');
        return true;
    }

    /**
     * Log configuration (without sensitive data)
     */
    logConfig() {
        ConsoleLogger.i('MQTT Configuration:');
        ConsoleLogger.i(`  Host: ${this.config.mqtt.host}`);
        ConsoleLogger.i(`  Port: ${this.config.mqtt.port}`);
        ConsoleLogger.i(`  Client ID: ${this.config.mqtt.clientId}`);
        ConsoleLogger.i(`  Clean Session: ${this.config.mqtt.clean}`);
        ConsoleLogger.i(`  Reconnect Period: ${this.config.mqtt.reconnectPeriod}ms`);
        ConsoleLogger.i(`  Connect Timeout: ${this.config.mqtt.connectTimeout}ms`);
        
        ConsoleLogger.i('Topics:');
        Object.entries(this.config.topics).forEach(([key, value]) => {
            ConsoleLogger.i(`  ${key}: ${value}`);
        });

        ConsoleLogger.i('WebSocket Configuration:');
        ConsoleLogger.i(`  Port: ${this.config.websocket.port}`);
        ConsoleLogger.i(`  Path: ${this.config.websocket.path}`);
        ConsoleLogger.i(`  Heartbeat Interval: ${this.config.websocket.heartbeatInterval}ms`);
        ConsoleLogger.i(`  Max Connections: ${this.config.websocket.maxConnections}`);
    }
}

module.exports = MQTTConfig;
