'use strict'

const { iif } = require("rxjs");
const { tap } = require('rxjs/operators');
const { ConsoleLogger } = require('@nebulae/backend-node-tools').log;

const VehicleStatsDA = require("./data-access/VehicleStatsDA");

/**
 * Singleton instance
 * @type { VehicleStatsES }
 */
let instance;

class VehicleStatsES {

    constructor() {
    }

    /**     
     * Generates and returns an object that defines the Event-Sourcing events handlers.
     * 
     * The map is a relationship of: AGGREGATE_TYPE VS { EVENT_TYPE VS  { fn: rxjsFunction, instance: invoker_instance } }
     * 
     * ## Example
     *  { "User" : { "UserAdded" : {fn: handleUserAdded$, instance: classInstance } } }
     */
    generateEventProcessorMap() {
        return {
            'VehicleStats': {
                "VehicleStatsUpdated": { fn: instance.handleVehicleStatsUpdated$, instance, processOnlyOnSync: false },
            }
        }
    };

    /**
     * Using the VehicleStatsUpdated events restores the MaterializedView
     * This is just a recovery strategy
     * @param {*} VehicleStatsUpdatedEvent Vehicle Stats Updated Event
     */
    handleVehicleStatsUpdated$({ etv, aid, av, data, user, timestamp }) {
        const aggregateDataMapper = [
            /*etv=0 mapper*/ () => { throw new Error('etv 0 is not an option') },
            /*etv=1 mapper*/ (eventData) => { return { ...eventData }; }
        ];
        const aggregateData = aggregateDataMapper[etv](data);
        return VehicleStatsDA.updateVehicleStatsFromRecovery$(aid, aggregateData, av).pipe(
            tap(() => ConsoleLogger.i(`VehicleStatsES.handleVehicleStatsUpdated: aid=${aid}, timestamp=${timestamp}`))
        )
    }
}

/**
 * @returns {VehicleStatsES}
 */
module.exports = () => {
    if (!instance) {
        instance = new VehicleStatsES();
        ConsoleLogger.i(`${instance.constructor.name} Singleton created`);
    }
    return instance;
};
