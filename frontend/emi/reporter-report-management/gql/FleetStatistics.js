import { gql } from "apollo-boost";

export const FleetStatistics = () => ({
    query: gql`
        query FleetStatistics {
            VehicleStatsFleetStatistics {
                totalVehicles
                vehiclesByType
                vehiclesByPowerSource
                vehiclesByDecade
                vehiclesBySpeedRange
                averageHp
                totalHpSum
                totalHpCount
            }
        }
    `,
    fetchPolicy: "cache-and-network"
});

export const onFleetStatisticsUpdated = () => ({
    query: gql`
        subscription FleetStatisticsUpdated {
            FleetStatisticsUpdated {
                totalVehicles
                vehiclesByType
                vehiclesByPowerSource
                vehiclesByDecade
                vehiclesBySpeedRange
                averageHp
                totalHpSum
                totalHpCount
            }
        }
    `,
    fetchPolicy: "no-cache"
});
