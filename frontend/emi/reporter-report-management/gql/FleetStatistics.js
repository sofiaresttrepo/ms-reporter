import { gql } from "apollo-boost";

export const FleetStatistics = () => ({
    query: gql`
        query FleetStatistics {
            VehicleStatsFleetStatistics {
                _id
                totalVehicles
                vehiclesByType {
                    SUV
                    PickUp
                    Sedan
                    Coupe
                    Convertible
                    Truck
                    Van
                    Hatchback
                }
                vehiclesByDecade {
                    decade1980s
                    decade1990s
                    decade2000s
                    decade2010s
                    decade2020s
                }
                vehiclesBySpeedClass {
                    Lento
                    Normal
                    Rapido
                }
                hpStats { 
                    min 
                    max 
                    sum 
                    count 
                    avg 
                }
                lastUpdated
            }
        }
    `,
    fetchPolicy: "cache-and-network"
});

export const onFleetStatisticsUpdated = () => ({
    query: gql`
        subscription FleetStatisticsUpdated {
            FleetStatisticsUpdated {
                _id
                totalVehicles
                vehiclesByType {
                    SUV
                    PickUp
                    Sedan
                    Coupe
                    Convertible
                    Truck
                    Van
                    Hatchback
                }
                vehiclesByDecade {
                    decade1980s
                    decade1990s
                    decade2000s
                    decade2010s
                    decade2020s
                }
                vehiclesBySpeedClass {
                    Lento
                    Normal
                    Rapido
                }
                hpStats { 
                    min 
                    max 
                    sum 
                    count 
                    avg 
                }
                lastUpdated
            }
        }
    `,
    fetchPolicy: "no-cache"
});
