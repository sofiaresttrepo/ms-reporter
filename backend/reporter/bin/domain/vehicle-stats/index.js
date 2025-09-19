"use strict";

const { empty, Observable, concat } = require("rxjs");
const { tap } = require("rxjs/operators");

const VehicleStatsCRUD = require("./VehicleStatsCRUD")();
const VehicleStatsES = require("./VehicleStatsES")();
const DataAcess = require("./data-access/");

module.exports = {
  /**
   * domain start workflow
   */
  start$: concat(
    DataAcess.VehicleStatsDA.start$(),
    Observable.create(observer => {
      // Auto-start processing when the service starts
      VehicleStatsCRUD.startProcessing$().subscribe({
        next: (result) => {
          observer.next("Vehicle stats processing started automatically");
        },
        error: (err) => {
          observer.error(err);
        },
        complete: () => {
          observer.complete();
        }
      });
    })
  ),
  /**
   * start for syncing workflow
   * @returns {Observable}
   */
  startForSyncing$: DataAcess.VehicleStatsDA.start$(),
  /**
   * start for getting ready workflow
   * @returns {Observable}
   */
  startForGettingReady$: empty(),
  /**
   * Stop workflow
   * @returns {Observable}
   */
  stop$: DataAcess.VehicleStatsDA.stop$(),
  /**
   * @returns {VehicleStatsCRUD}
   */
  VehicleStatsCRUD: VehicleStatsCRUD,
  /**
   * CRUD request processors Map
   */
  cqrsRequestProcessorMap: VehicleStatsCRUD.generateRequestProcessorMap(),
  /**
   * @returns {VehicleStatsES}
   */
  VehicleStatsES,
  /**
   * EventSoircing event processors Map
   */
  eventSourcingProcessorMap: VehicleStatsES.generateEventProcessorMap(),
};
