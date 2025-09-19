# Vehicle Reporter Configuration

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```bash
# MongoDB Configuration
MONGODB_URL=mongodb://localhost:27017
MONGODB_DATABASE=reporter

# MQTT Configuration
MQTT_HOST=localhost
MQTT_PORT=1883
MQTT_USERNAME=
MQTT_PASSWORD=

# WebSocket Configuration
WEBSOCKET_PORT=3002

# Microservice Configuration
MICROBACKEND_KEY=your-microbackend-key
PORT=3000

# Logging
LOG_LEVEL=info
```

## MongoDB Collections

The reporter uses the following collections:

1. **fleet_statistics**: Single document with aggregated statistics
2. **processed_vehicles**: Collection of processed vehicle IDs for idempotency

## Database Schema

### fleet_statistics
```javascript
{
  _id: ObjectId,
  totalVehicles: Number,
  vehiclesByType: {
    "Sedan": Number,
    "SUV": Number,
    // ... other types
  },
  vehiclesByPowerSource: {
    "Gasoline": Number,
    "Electric": Number,
    // ... other sources
  },
  vehiclesByDecade: {
    "2000s": Number,
    "2010s": Number,
    // ... other decades
  },
  vehiclesBySpeedRange: {
    "0-100": Number,
    "101-200": Number,
    "201+": Number
  },
  totalHpSum: Number,
  totalHpCount: Number,
  averageHp: Number
}
```

### processed_vehicles
```javascript
{
  _id: String, // Vehicle aid (hash)
  processedAt: Number // Timestamp
}
```

## Running the Application

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the microservice:
   ```bash
   npm start
   ```

3. Access the frontend:
   - Open http://localhost:3000
   - Navigate to Fleet Dashboard

## Performance Features

- **Batch Processing**: Events are processed in 1-second batches using `bufferTime(1000)`
- **Idempotency**: Duplicate vehicles are filtered using MongoDB lookups
- **Real-time Updates**: WebSocket notifications for live dashboard updates
- **Efficient Aggregation**: MongoDB atomic operations for statistics updates

## Monitoring

- Check MQTT topics: `fleet/vehicles/generated`, `fleet-statistics-updated`
- Monitor MongoDB collections: `fleet_statistics`, `processed_vehicles`
- WebSocket updates: Real-time dashboard updates
