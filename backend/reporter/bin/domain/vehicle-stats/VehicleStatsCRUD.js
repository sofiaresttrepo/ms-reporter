"use strict";

const uuidv4 = require("uuid/v4");
const { of, forkJoin, from, iif, throwError, Subject, interval, timer, Observable } = require("rxjs");
const { mergeMap, catchError, map, toArray, pluck, takeUntil, tap, bufferTime, filter, switchMap } = require('rxjs/operators');
const crypto = require('crypto');

const Event = require("@nebulae/event-store").Event;
const { CqrsResponseHelper } = require('@nebulae/backend-node-tools').cqrs;
const { ConsoleLogger } = require('@nebulae/backend-node-tools').log;
const { CustomError, INTERNAL_SERVER_ERROR_CODE, PERMISSION_DENIED } = require("@nebulae/backend-node-tools").error;
const { brokerFactory } = require("@nebulae/backend-node-tools").broker;

const broker = brokerFactory();
const eventSourcing = require("../../tools/event-sourcing").eventSourcing;
const VehicleStatsDA = require("./data-access/VehicleStatsDA");

const READ_ROLES = ["REPORT_READ"];
const WRITE_ROLES = ["REPORT_WRITE"];
const REQUIRED_ATTRIBUTES = [];
const MATERIALIZED_VIEW_TOPIC = "emi-gateway-materialized-view-updates";
const MQTT_TOPIC = "fleet/vehicles/generated";
const WEBSOCKET_TOPIC = "fleet-statistics-updated";

/**
 * Singleton instance
 * @type { VehicleStatsCRUD }
 */
let instance;

class VehicleStatsCRUD {
  constructor() {
    this.events$ = new Subject();
    this.isProcessing = false;
    this.processingSubscription = null;
  }

  /**     
   * Generates and returns an object that defines the CQRS request handlers.
   * 
   * The map is a relationship of: AGGREGATE_TYPE VS { MESSAGE_TYPE VS  { fn: rxjsFunction, instance: invoker_instance } }
   * 
   * ## Example
   *  { "CreateUser" : { "somegateway.someprotocol.mutation.CreateUser" : {fn: createUser$, instance: classInstance } } }
   */
  generateRequestProcessorMap() {
    return {
      'VehicleStats': {
        "emigateway.graphql.query.VehicleStatsFleetStatistics": { fn: instance.getFleetStatistics$, instance, jwtValidation: { roles: READ_ROLES, attributes: REQUIRED_ATTRIBUTES } },
      }
    }
  };

  /**  
   * Gets fleet statistics
   *
   * @param {*} args args
   */
  getFleetStatistics$({ args }, authToken) {
    return VehicleStatsDA.getFleetStatistics$().pipe(
      mergeMap(rawResponse => CqrsResponseHelper.buildSuccessResponse$(rawResponse)),
      catchError(err => iif(() => err.name === 'MongoTimeoutError', throwError(err), CqrsResponseHelper.handleError$(err)))
    );
  }

  /**
   * Start processing vehicle events - DISABLED in favor of VehicleEventsProcessor
   */
  startProcessing$() {
    ConsoleLogger.i("VehicleStatsCRUD.startProcessing$ is disabled - using VehicleEventsProcessor instead");
    return of("VehicleStatsCRUD processing disabled");
  }

  /**
   * Stop processing vehicle events
   */
  stopProcessing$() {
    if (!this.isProcessing) {
      ConsoleLogger.i("Vehicle stats processing is not running");
      return of(null);
    }

    this.isProcessing = false;
    ConsoleLogger.i("Stopping vehicle stats processing");

    if (this.processingSubscription) {
      this.processingSubscription.unsubscribe();
      this.processingSubscription = null;
    }

    return of(null);
  }

  /**
   * Subscribe to MQTT events
   */
  subscribeToMQTTEvents$() {
    try {
      // Try different broker methods for MQTT subscription
      if (broker.getMessages$) {
        broker.getMessages$(MQTT_TOPIC, "MQTT").subscribe({
          next: (event) => {
            ConsoleLogger.i(`Received MQTT event: ${event.et} for aid: ${event.aid}`);
            this.events$.next(event);
          },
          error: (err) => {
            ConsoleLogger.e("Error receiving MQTT events:", err);
          }
        });
      } else if (broker.subscribe$) {
        broker.subscribe$(MQTT_TOPIC).subscribe({
          next: (event) => {
            ConsoleLogger.i(`Received MQTT event: ${event.et} for aid: ${event.aid}`);
            this.events$.next(event);
          },
          error: (err) => {
            ConsoleLogger.e("Error receiving MQTT events:", err);
          }
        });
      } else {
        ConsoleLogger.w("MQTT broker methods not available, using mock data for testing");
        // For testing purposes, generate mock events
        this.startMockDataGeneration();
      }
    } catch (error) {
      ConsoleLogger.e("Error setting up MQTT subscription:", error);
      // Fallback to mock data for testing
      this.startMockDataGeneration();
    }
  }

  /**
   * Start mock data generation for testing when MQTT is not available
   */
  startMockDataGeneration() {
    ConsoleLogger.i("Starting mock vehicle data generation for testing");
    const mockInterval = setInterval(() => {
      if (!this.isProcessing) {
        clearInterval(mockInterval);
        return;
      }
      
      const mockVehicle = {
        aid: `mock-${Date.now()}-${Math.random()}`,
        et: "Generated",
        data: {
          type: ['Sedan', 'SUV', 'Hatchback'][Math.floor(Math.random() * 3)],
          powerSource: ['Gasoline', 'Electric', 'Hybrid'][Math.floor(Math.random() * 3)],
          hp: Math.floor(Math.random() * 500) + 50,
          year: Math.floor(Math.random() * 25) + 2000,
          topSpeed: Math.floor(Math.random() * 200) + 100
        }
      };
      
      this.events$.next(mockVehicle);
    }, 1000); // Generate mock data every second
  }

  /**
   * Start batch processing with bufferTime
   */
  startBatchProcessing$() {
    this.processingSubscription = this.events$.pipe(
      bufferTime(1000), // Buffer events for 1 second
      filter(events => events.length > 0), // Only process if there are events
      switchMap(eventBatch => this.processEventBatch$(eventBatch))
    ).subscribe({
      next: (result) => {
        if (result) {
          ConsoleLogger.i(`Processed batch of ${result.processedCount} vehicles`);
        }
      },
      error: (err) => {
        ConsoleLogger.e("Error in batch processing:", err);
      }
    });
  }

  /**
   * Process a batch of events
   * @param {Array} eventBatch Array of events to process
   */
  processEventBatch$(eventBatch) {
    ConsoleLogger.i(`Processing batch of ${eventBatch.length} events`);

    // Extract vehicle data and aids
    const vehicles = eventBatch.map(event => ({
      aid: event.aid,
      type: event.data.type,
      powerSource: event.data.powerSource,
      hp: event.data.hp,
      year: event.data.year,
      topSpeed: event.data.topSpeed
    }));

    const aids = vehicles.map(v => v.aid);

    return VehicleStatsDA.getProcessedVehicleIds$(aids).pipe(
      mergeMap(processedIds => {
        // Filter out already processed vehicles
        const newVehicles = vehicles.filter(v => !processedIds.includes(v.aid));
        
        if (newVehicles.length === 0) {
          ConsoleLogger.i("No new vehicles to process in this batch");
          return of(null);
        }

        ConsoleLogger.i(`Processing ${newVehicles.length} new vehicles out of ${vehicles.length} total`);

        // Update statistics
        return VehicleStatsDA.updateFleetStatistics$(newVehicles).pipe(
          mergeMap(updatedStats => {
            if (updatedStats) {
              // Send updated stats via WebSocket
              this.sendStatsViaWebSocket$(updatedStats);
              
              // Mark vehicles as processed
              return VehicleStatsDA.markVehiclesAsProcessed$(aids).pipe(
                map(() => ({
                  processedCount: newVehicles.length,
                  totalCount: vehicles.length,
                  stats: updatedStats
                }))
              );
            }
            return of(null);
          })
        );
      }),
      catchError(err => {
        ConsoleLogger.e("Error processing event batch:", err);
        return of(null);
      })
    );
  }

  /**
   * Send updated statistics via WebSocket
   * @param {Object} stats Updated statistics
   */
  sendStatsViaWebSocket$(stats) {
    broker.send$(WEBSOCKET_TOPIC, "FleetStatisticsUpdated", stats).subscribe({
      next: () => ConsoleLogger.i("Statistics sent via WebSocket"),
      error: (err) => ConsoleLogger.e("Error sending statistics via WebSocket:", err)
    });
  }

  /**
   * Generate an Modified event 
   * @param {string} modType 'CREATE' | 'UPDATE' | 'DELETE'
   * @param {*} aggregateType 
   * @param {*} aggregateId 
   * @param {*} authToken 
   * @param {*} data 
   * @returns {Event}
   */
  buildAggregateMofifiedEvent(modType, aggregateType, aggregateId, authToken, data) {
    return new Event({
      eventType: `${aggregateType}Modified`,
      eventTypeVersion: 1,
      aggregateType: aggregateType,
      aggregateId,
      data: {
        modType,
        ...data
      },
      user: authToken.preferred_username
    })
  }
}

/**
 * @returns {VehicleStatsCRUD}
 */
module.exports = () => {
  if (!instance) {
    instance = new VehicleStatsCRUD();
    ConsoleLogger.i(`${instance.constructor.name} Singleton created`);
  }
  return instance;
};
