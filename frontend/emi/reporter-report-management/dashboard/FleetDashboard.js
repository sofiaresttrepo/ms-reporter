/* React core */
import React, { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, Typography, Grid, Box, Paper, Chip } from '@material-ui/core';
import { FuseAnimate, FusePageCarded, FuseLoading } from '@fuse';
/* GraphQL Client hooks */
import { useQuery, useSubscription } from "@apollo/react-hooks";
/* Redux */
import { useDispatch, useSelector } from 'react-redux';
import withReducer from 'app/store/withReducer';
import * as AppActions from 'app/store/actions';
import * as Actions from '../store/actions';
import reducer from '../store/reducers';
/* Tools */
import { MDText } from 'i18n-react';
import i18n from "../i18n";
/* GQL queries to use */
import {
    FleetStatistics,
    onFleetStatisticsUpdated
} from "../gql/FleetStatistics";

/**
 * Statistic Card Component - Memoized for performance
 */
const StatisticCard = React.memo(({ title, value, color = "primary", subtitle }) => (
    <Card>
        <CardContent>
            <Typography variant="h4" color={color} gutterBottom>
                {value}
            </Typography>
            <Typography variant="h6" color="textPrimary">
                {title}
            </Typography>
            {subtitle && (
                <Typography variant="body2" color="textSecondary">
                    {subtitle}
                </Typography>
            )}
        </CardContent>
    </Card>
));

/**
 * Category Breakdown Component - Memoized for performance
 */
const CategoryBreakdown = React.memo(({ title, data, color = "primary" }) => {
    if (!data || Object.keys(data).length === 0) {
        return (
            <Card>
                <CardContent>
                    <Typography variant="h6" gutterBottom>
                        {title}
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                        No data available
                    </Typography>
                </CardContent>
            </Card>
        );
    }

    const sortedEntries = Object.entries(data)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10); // Show top 10

    return (
        <Card>
            <CardContent>
                <Typography variant="h6" gutterBottom>
                    {title}
                </Typography>
                <Box display="flex" flexWrap="wrap" gap={1}>
                    {sortedEntries.map(([key, value]) => (
                        <Chip
                            key={key}
                            label={`${key}: ${value}`}
                            color={color}
                            variant="outlined"
                            size="small"
                        />
                    ))}
                </Box>
            </CardContent>
        </Card>
    );
});

function FleetDashboard(props) {
    //Redux dispatcher
    const dispatch = useDispatch();

    // current logged user
    const loggedUser = useSelector(({ auth }) => auth.user);

    // Fleet statistics state
    const [statistics, setStatistics] = useState({
        totalVehicles: 0,
        vehiclesByType: {},
        vehiclesByPowerSource: {},
        vehiclesByDecade: {},
        vehiclesBySpeedRange: {},
        averageHp: 0,
        totalHpSum: 0,
        totalHpCount: 0
    });

    //Translation services
    let T = new MDText(i18n.get(loggedUser.locale));

    // GraphQL operations
    const { data: fleetData, loading: fleetLoading, error: fleetError } = useQuery(FleetStatistics().query, {
        fetchPolicy: "cache-and-network",
        pollInterval: 5000 // Poll every 5 seconds as fallback
    });

    const onFleetStatsUpdatedResult = useSubscription(onFleetStatisticsUpdated().query);

    // Handle initial data load
    useEffect(() => {
        if (fleetData && fleetData.VehicleStatsFleetStatistics) {
            setStatistics(fleetData.VehicleStatsFleetStatistics);
        }
    }, [fleetData]);

    // Handle real-time updates via WebSocket
    useEffect(() => {
        if (onFleetStatsUpdatedResult.data && onFleetStatsUpdatedResult.data.FleetStatisticsUpdated) {
            const updatedStats = onFleetStatsUpdatedResult.data.FleetStatisticsUpdated;
            setStatistics(updatedStats);
        }
    }, [onFleetStatsUpdatedResult.data]);

    // Handle errors
    useEffect(() => {
        if (fleetError) {
            dispatch(AppActions.showMessage({
                message: fleetError.message || "Error loading fleet statistics",
                variant: 'error'
            }));
        }
    }, [fleetError, dispatch]);

    // Memoized calculations
    const totalVehicles = statistics.totalVehicles || 0;
    const averageHp = statistics.averageHp || 0;
    const totalHpSum = statistics.totalHpSum || 0;
    const totalHpCount = statistics.totalHpCount || 0;

    // Show loading state
    if (fleetLoading) {
        return <FuseLoading />;
    }

    return (
        <FusePageCarded
            classes={{
                toolbar: "p-0",
                header: "min-h-72 h-72 sm:h-136 sm:min-h-136"
            }}
            header={
                <div className="flex flex-1 w-full items-center justify-between">
                    <div className="flex flex-col items-start max-w-full">
                        <Typography className="text-16 sm:text-20">
                            Fleet Statistics Dashboard
                        </Typography>
                        <Typography variant="caption">
                            Real-time fleet analytics and insights
                        </Typography>
                    </div>
                </div>
            }
            content={
                <div className="p-16 sm:p-24">
                    <Grid container spacing={3}>
                        {/* Main Statistics */}
                        <Grid item xs={12}>
                            <Grid container spacing={2}>
                                <Grid item xs={12} sm={6} md={3}>
                                    <StatisticCard
                                        title="Total Vehicles"
                                        value={totalVehicles.toLocaleString()}
                                        color="primary"
                                    />
                                </Grid>
                                <Grid item xs={12} sm={6} md={3}>
                                    <StatisticCard
                                        title="Average HP"
                                        value={averageHp.toFixed(1)}
                                        color="secondary"
                                        subtitle="Horsepower"
                                    />
                                </Grid>
                                <Grid item xs={12} sm={6} md={3}>
                                    <StatisticCard
                                        title="Total HP"
                                        value={totalHpSum.toLocaleString()}
                                        color="textPrimary"
                                        subtitle="Combined Power"
                                    />
                                </Grid>
                                <Grid item xs={12} sm={6} md={3}>
                                    <StatisticCard
                                        title="HP Count"
                                        value={totalHpCount.toLocaleString()}
                                        color="textSecondary"
                                        subtitle="Vehicles Measured"
                                    />
                                </Grid>
                            </Grid>
                        </Grid>

                        {/* Category Breakdowns */}
                        <Grid item xs={12} md={6}>
                            <CategoryBreakdown
                                title="Vehicles by Type"
                                data={statistics.vehiclesByType}
                                color="primary"
                            />
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <CategoryBreakdown
                                title="Vehicles by Power Source"
                                data={statistics.vehiclesByPowerSource}
                                color="secondary"
                            />
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <CategoryBreakdown
                                title="Vehicles by Decade"
                                data={statistics.vehiclesByDecade}
                                color="textPrimary"
                            />
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <CategoryBreakdown
                                title="Vehicles by Speed Range"
                                data={statistics.vehiclesBySpeedRange}
                                color="textSecondary"
                            />
                        </Grid>

                        {/* Additional Insights */}
                        <Grid item xs={12}>
                            <Card>
                                <CardContent>
                                    <Typography variant="h6" gutterBottom>
                                        Fleet Insights
                                    </Typography>
                                    <Grid container spacing={2}>
                                        <Grid item xs={12} sm={6}>
                                            <Paper style={{ padding: '16px', backgroundColor: '#f5f5f5' }}>
                                                <Typography variant="body1" color="textPrimary">
                                                    <strong>Most Common Type:</strong> {
                                                        (() => {
                                                            const entries = Object.entries(statistics.vehiclesByType || {});
                                                            const sorted = entries.sort(([,a], [,b]) => b - a);
                                                            return sorted.length > 0 ? sorted[0][0] : 'N/A';
                                                        })()
                                                    }
                                                </Typography>
                                            </Paper>
                                        </Grid>
                                        <Grid item xs={12} sm={6}>
                                            <Paper style={{ padding: '16px', backgroundColor: '#f5f5f5' }}>
                                                <Typography variant="body1" color="textPrimary">
                                                    <strong>Most Common Power Source:</strong> {
                                                        (() => {
                                                            const entries = Object.entries(statistics.vehiclesByPowerSource || {});
                                                            const sorted = entries.sort(([,a], [,b]) => b - a);
                                                            return sorted.length > 0 ? sorted[0][0] : 'N/A';
                                                        })()
                                                    }
                                                </Typography>
                                            </Paper>
                                        </Grid>
                                        <Grid item xs={12} sm={6}>
                                            <Paper style={{ padding: '16px', backgroundColor: '#f5f5f5' }}>
                                                <Typography variant="body1" color="textPrimary">
                                                    <strong>Most Common Decade:</strong> {
                                                        (() => {
                                                            const entries = Object.entries(statistics.vehiclesByDecade || {});
                                                            const sorted = entries.sort(([,a], [,b]) => b - a);
                                                            return sorted.length > 0 ? sorted[0][0] : 'N/A';
                                                        })()
                                                    }
                                                </Typography>
                                            </Paper>
                                        </Grid>
                                        <Grid item xs={12} sm={6}>
                                            <Paper style={{ padding: '16px', backgroundColor: '#f5f5f5' }}>
                                                <Typography variant="body1" color="textPrimary">
                                                    <strong>Most Common Speed Range:</strong> {
                                                        (() => {
                                                            const entries = Object.entries(statistics.vehiclesBySpeedRange || {});
                                                            const sorted = entries.sort(([,a], [,b]) => b - a);
                                                            return sorted.length > 0 ? sorted[0][0] : 'N/A';
                                                        })()
                                                    }
                                                </Typography>
                                            </Paper>
                                        </Grid>
                                    </Grid>
                                </CardContent>
                            </Card>
                        </Grid>
                    </Grid>
                </div>
            }
            innerScroll
        />
    );
}

export default withReducer('FleetDashboard', reducer)(FleetDashboard);
