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
}

/**
 * @returns {VehicleStatsDA}
 */
module.exports = VehicleStatsDA;
