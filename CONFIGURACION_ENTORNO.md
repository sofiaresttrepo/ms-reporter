# 🔧 Configuración de Entorno - ms-reporter

## Problema Identificado
El error `Cannot read properties of undefined (reading 'db')` indica que la conexión a MongoDB no se ha inicializado correctamente.

## ✅ Solución

### 1. **Crear archivo .env**
Crea un archivo `.env` en la raíz del ms-reporter con el siguiente contenido:

```bash
# MongoDB Configuration
MONGODB_URL=mongodb://localhost:27017
MONGODB_DB_NAME=reporter

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

### 2. **Verificar que MongoDB esté ejecutándose**
```bash
# Verificar que MongoDB esté corriendo
sudo systemctl status mongodb
# o
brew services list | grep mongodb
```

### 3. **Crear la base de datos**
```bash
# Conectar a MongoDB
mongo

# Crear la base de datos
use reporter

# Crear las colecciones
db.createCollection("fleet_statistics")
db.createCollection("processed_vehicles")

# Verificar que se crearon
show collections
```

### 4. **Reiniciar el microservicio**
```bash
cd ms-reporter/backend/reporter
npm start
```

## 🔍 Verificación

### Verificar que la conexión funcione:
1. **Revisar logs** del ms-reporter
2. **Buscar mensajes** como:
   - "MongoDB connected to dbName= reporter"
   - "VehicleStatsDA started"

### Si aún hay errores:
1. **Verificar variables de entorno**:
   ```bash
   echo $MONGODB_URL
   echo $MONGODB_DB_NAME
   ```

2. **Verificar que el archivo .env esté en la ubicación correcta**:
   ```bash
   ls -la ms-reporter/.env
   ```

3. **Verificar permisos**:
   ```bash
   chmod 644 ms-reporter/.env
   ```

## 🚀 Próximos Pasos

Una vez que se resuelva el error de MongoDB:

1. **Probar la query** de estadísticas
2. **Verificar que el dashboard** funcione
3. **Probar la generación** de vehículos
4. **Verificar la comunicación** entre microservicios

## 📝 Notas Importantes

- **MongoDB debe estar ejecutándose** antes de iniciar el ms-reporter
- **Las variables de entorno** deben estar configuradas correctamente
- **La base de datos** debe existir y ser accesible
- **Los permisos** deben estar configurados correctamente
