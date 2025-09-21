"use strict";

const { empty, Observable } = require("rxjs");
const { mergeMap } = require("rxjs/operators");

const VehicleStatsCRUD = require("./VehicleStatsCRUD")();
const VehicleStatsES = require("./VehicleStatsES")();
const VehicleEventsProcessor = require("./VehicleEventsProcessor")();
const DataAcess = require("./data-access/");

module.exports = {
  /**
   * domain start workflow
   */
  start$: DataAcess.VehicleStatsDA.start$().pipe(
    mergeMap(() => VehicleEventsProcessor.start$())
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
  /**
   * @returns {VehicleEventsProcessor}
   */
  VehicleEventsProcessor,
};
