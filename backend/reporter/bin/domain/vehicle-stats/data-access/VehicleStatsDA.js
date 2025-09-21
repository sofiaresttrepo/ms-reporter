"use strict";

let mongoDB = undefined;
const { map, mapTo, catchError } = require("rxjs/operators");
const { of, Observable, defer, throwError } = require("rxjs");

const { CustomError } = require("@nebulae/backend-node-tools").error;

const CollectionName = 'fleet_statistics';
const ProcessedVehiclesCollection = 'processed_vehicles';

class VehicleStatsDA {
  static start$(mongoDbInstance) {
    return Observable.create(observer => {
      if (mongoDbInstance) {
        mongoDB = mongoDbInstance;
        observer.next(`${this.name} using given mongo instance`);
      } else {
        mongoDB = require("../../../tools/mongo-db/MongoDB").singleton();
        observer.next(`${this.name} using singleton system-wide mongo instance`);
      }
      
      // Verificar que la conexión esté establecida inmediatamente
      if (mongoDB && mongoDB.db) {
        observer.next(`${this.name} MongoDB connection verified`);
        observer.next(`${this.name} started`);
        observer.complete();
      } else {
        // Si no está listo, esperar un poco
        setTimeout(() => {
          if (mongoDB && mongoDB.db) {
            observer.next(`${this.name} MongoDB connection verified`);
            observer.next(`${this.name} started`);
            observer.complete();
          } else {
            observer.error(new Error(`${this.name} MongoDB connection not established`));
          }
        }, 1000);
      }
    });
  }

  static stop$() {
    return Observable.create(observer => {
      observer.next(`${this.name} stopped`);
      observer.complete();
    });
  }

  /**
   * Gets fleet statistics
   */
  static getFleetStatistics$() {
    if (!mongoDB || !mongoDB.db) {
      return throwError(new Error('MongoDB not initialized. Please ensure the database connection is established.'));
    }
    
    const collection = mongoDB.db.collection(CollectionName);
    return defer(() => collection.findOne({})).pipe(
      map((res) => {
        return res !== null
          ? { ...res, id: res._id }
          : {
              totalVehicles: 0,
              vehiclesByType: {},
              vehiclesByPowerSource: {},
              vehiclesByDecade: {},
              vehiclesBySpeedRange: {},
              totalHpSum: 0,
              totalHpCount: 0,
              averageHp: 0
            }
      }),
      catchError(err => {
        console.error('Error getting fleet statistics:', err);
        return of({
          totalVehicles: 0,
          vehiclesByType: {},
          vehiclesByPowerSource: {},
          vehiclesByDecade: {},
          vehiclesBySpeedRange: {},
          totalHpSum: 0,
          totalHpCount: 0,
          averageHp: 0
        });
      })
    );
  }

  /**
   * Updates fleet statistics with new vehicles
   * @param {Array} vehicles Array of new vehicles to process
   */
  static updateFleetStatistics$(vehicles) {
    if (!vehicles || vehicles.length === 0) {
      return of(null);
    }

    const collection = mongoDB.db.collection(CollectionName);
    
    // Calculate statistics for the new vehicles
    const stats = this.calculateVehicleStats(vehicles);
    
    return defer(() => 
      collection.findOneAndUpdate(
        {},
        {
          $inc: {
            totalVehicles: stats.totalVehicles,
            totalHpSum: stats.totalHpSum,
            totalHpCount: stats.totalHpCount,
            ...stats.vehiclesByType,
            ...stats.vehiclesByPowerSource,
            ...stats.vehiclesByDecade,
            ...stats.vehiclesBySpeedRange
          }
        },
        {
          upsert: true,
          returnOriginal: false
        }
      )
    ).pipe(
      map(result => {
        if (result && result.value) {
          const updatedStats = result.value;
          // Recalculate average HP
          updatedStats.averageHp = updatedStats.totalHpCount > 0 
            ? Math.round(updatedStats.totalHpSum / updatedStats.totalHpCount * 100) / 100
            : 0;
          
          // Update the document with the new average
          return collection.findOneAndUpdate(
            { _id: updatedStats._id },
            { $set: { averageHp: updatedStats.averageHp } },
            { returnOriginal: false }
          );
        }
        return result;
      }),
      map(result => result && result.value ? { ...result.value, id: result.value._id } : null)
    );
  }

  /**
   * Calculate statistics for a batch of vehicles
   * @param {Array} vehicles Array of vehicles
   */
  static calculateVehicleStats(vehicles) {
    const stats = {
      totalVehicles: vehicles.length,
      totalHpSum: 0,
      totalHpCount: vehicles.length,
      vehiclesByType: {},
      vehiclesByPowerSource: {},
      vehiclesByDecade: {},
      vehiclesBySpeedRange: {}
    };

    vehicles.forEach(vehicle => {
      // Count by type
      const type = vehicle.type || 'Unknown';
      stats.vehiclesByType[`vehiclesByType.${type}`] = 1;

      // Count by power source
      const powerSource = vehicle.powerSource || 'Unknown';
      stats.vehiclesByPowerSource[`vehiclesByPowerSource.${powerSource}`] = 1;

      // Count by decade
      const year = vehicle.year || 2000;
      const decade = Math.floor(year / 10) * 10;
      const decadeKey = `${decade}s`;
      stats.vehiclesByDecade[`vehiclesByDecade.${decadeKey}`] = 1;

      // Count by speed range
      const topSpeed = vehicle.topSpeed || 0;
      let speedRange = '0-100';
      if (topSpeed > 200) speedRange = '201+';
      else if (topSpeed > 100) speedRange = '101-200';
      stats.vehiclesBySpeedRange[`vehiclesBySpeedRange.${speedRange}`] = 1;

      // Sum HP
      stats.totalHpSum += vehicle.hp || 0;
    });

    return stats;
  }

  /**
   * Get processed vehicle IDs
   * @param {Array} aids Array of vehicle aids to check
   */
  static getProcessedVehicleIds$(aids) {
    const collection = mongoDB.db.collection(ProcessedVehiclesCollection);
    return defer(() => 
      collection.find({ _id: { $in: aids } }).toArray()
    ).pipe(
      map(results => results.map(r => r._id))
    );
  }

  /**
   * Mark vehicles as processed
   * @param {Array} aids Array of vehicle aids to mark as processed
   */
  static markVehiclesAsProcessed$(aids) {
    if (!aids || aids.length === 0) {
      return of(null);
    }

    const collection = mongoDB.db.collection(ProcessedVehiclesCollection);
    const documents = aids.map(aid => ({ _id: aid, processedAt: Date.now() }));
    
    return defer(() => 
      collection.insertMany(documents, { ordered: false })
    ).pipe(
      map(result => result)
    );
  }

  /**
   * Update vehicle stats from recovery
   * @param {String} _id Vehicle Stats ID
   * @param {*} properties Properties to update
   * @param {Number} av Aggregate version
   */
  static updateVehicleStatsFromRecovery$(_id, properties, av) {
    const collection = mongoDB.db.collection(CollectionName);
    return defer(() =>
      collection.updateOne(
        { _id },
        { $set: { ...properties } },
        {
          returnOriginal: false,
          upsert: true
        }
      )
    ).pipe(
      map(result => result && result.value ? { ...result.value, id: result.value._id } : undefined)
    );
  }

  // ===== FLEET STATISTICS METHODS =====

  /**
   * Gets processed aids from processed_vehicles collection
   * @param {Array} aids - Array of aids to check
   * @returns {Observable} Observable with array of processed aids
   */
  static getProcessedAids$(aids) {
    const collection = mongoDB.db.collection('processed_vehicles');
    return defer(() => collection.find(
      { aid: { $in: aids } },
      { projection: { aid: 1, _id: 0 } }
    ).toArray())
      .pipe(
        map(results => results.map(r => r.aid))
      );
  }

  /**
   * Inserts processed aids in bulk
   * @param {Array} aids - Array of aids to insert
   * @returns {Observable} Observable with result
   */
  static insertProcessedAids$(aids) {
    const collection = mongoDB.db.collection('processed_vehicles');
    const documents = aids.map(aid => ({ aid, processedAt: new Date() }));

    return defer(() => collection.insertMany(documents))
      .pipe(
        map(result => result.insertedCount)
      );
  }

  /**
   * Updates fleet statistics with batch data
   * @param {Object} batchStats - Statistics from the batch
   * @returns {Observable} Observable with updated statistics
   */
  static updateFleetStatistics$(batchStats) {
    const collection = mongoDB.db.collection('fleet_statistics');
    const update = {
      $inc: {
        totalVehicles: batchStats.totalVehicles
      },
      $set: {
        lastUpdated: new Date().toISOString()
      }
    };

    // Add type increments
    Object.keys(batchStats.vehiclesByType).forEach(type => {
      update.$inc[`vehiclesByType.${type}`] = batchStats.vehiclesByType[type];
    });

    // Add decade increments
    Object.keys(batchStats.vehiclesByDecade).forEach(decade => {
      update.$inc[`vehiclesByDecade.${decade}`] = batchStats.vehiclesByDecade[decade];
    });

    // Add speed class increments
    Object.keys(batchStats.vehiclesBySpeedClass).forEach(speedClass => {
      update.$inc[`vehiclesBySpeedClass.${speedClass}`] = batchStats.vehiclesBySpeedClass[speedClass];
    });

    // Add HP stats increments
    update.$inc['hpStats.sum'] = batchStats.hpStats.sum;
    update.$inc['hpStats.count'] = batchStats.hpStats.count;

    // Add min/max operations
    if (batchStats.hpStats.min !== Infinity) {
      update.$min = { 'hpStats.min': batchStats.hpStats.min };
    }
    if (batchStats.hpStats.max !== -Infinity) {
      update.$max = { 'hpStats.max': batchStats.hpStats.max };
    }

    return defer(() => collection.findOneAndUpdate(
      { _id: 'real_time_fleet_stats' },
      update,
      { 
        returnOriginal: false,
        upsert: true
      }
    ))
      .pipe(
        map(result => {
          const stats = result.value;
          // Calculate average
          if (stats.hpStats && stats.hpStats.count > 0) {
            stats.hpStats.avg = stats.hpStats.sum / stats.hpStats.count;
          }
          
          // Map decade keys to GraphQL-compatible names
          if (stats.vehiclesByDecade) {
            const mappedDecades = {};
            Object.keys(stats.vehiclesByDecade).forEach(decade => {
              const mappedKey = `decade${decade}`;
              mappedDecades[mappedKey] = stats.vehiclesByDecade[decade];
            });
            stats.vehiclesByDecade = mappedDecades;
          }
          
          return stats;
        })
      );
  }

  /**
   * Gets current fleet statistics
   * @returns {Observable} Observable with fleet statistics
   */
  static GetFleetStatistics$() {
    const collection = mongoDB.db.collection('fleet_statistics');
    
    return defer(() => collection.findOne({ _id: 'real_time_fleet_stats' }))
      .pipe(
        map(stats => {
          if (!stats) {
            return {
              _id: 'real_time_fleet_stats',
              totalVehicles: 0,
              vehiclesByType: {},
              vehiclesByDecade: {},
              vehiclesBySpeedClass: {},
              hpStats: { min: 0, max: 0, sum: 0, count: 0, avg: 0 },
              lastUpdated: new Date().toISOString()
            };
          }
          
          // Calculate average if not present
          if (stats.hpStats && stats.hpStats.count > 0 && !stats.hpStats.avg) {
            stats.hpStats.avg = stats.hpStats.sum / stats.hpStats.count;
          }
          
          // Map decade keys to GraphQL-compatible names
          if (stats.vehiclesByDecade) {
            const mappedDecades = {};
            Object.keys(stats.vehiclesByDecade).forEach(decade => {
              const mappedKey = `decade${decade}`;
              mappedDecades[mappedKey] = stats.vehiclesByDecade[decade];
            });
            stats.vehiclesByDecade = mappedDecades;
          }
          
          return stats;
        })
      );
  }
}

/**
 * @returns {VehicleStatsDA}
 */
module.exports = VehicleStatsDA;
