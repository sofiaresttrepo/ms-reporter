# 🔧 Configuración de Entorno - ms-reporter

## ⚠️ **ACCIÓN REQUERIDA**

El error `MongoDB not initialized` indica que necesitas configurar las variables de entorno.

## ✅ **Pasos para Solucionar**

### **Paso 1: Crear archivo .env**
Crea un archivo `.env` en `ms-reporter/backend/reporter/` con el siguiente contenido:

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

### **Paso 2: Verificar MongoDB**
```bash
# Verificar que MongoDB esté corriendo
sudo systemctl status mongodb
# o
brew services list | grep mongodb

# Si no está corriendo, iniciarlo:
sudo systemctl start mongodb
# o
brew services start mongodb-community
```

### **Paso 3: Crear base de datos**
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

# Salir
exit
```

### **Paso 4: Reiniciar microservicios**
```bash
# Detener procesos actuales (Ctrl+C)
# Luego reiniciar:

# Generador
cd ms-generator/backend/generator
npm start

# Reporter
cd ms-reporter/backend/reporter
npm start
```

## 🔍 **Verificación**

### **Verificar que funcione:**
1. **Revisar logs** del ms-reporter
2. **Buscar mensajes** como:
   - "MongoDB connected to dbName= reporter"
   - "VehicleStatsDA MongoDB connection verified"
   - "VehicleStatsDA started"

### **Probar la query:**
1. **Ir a**: `http://localhost:4001`
2. **Navegar a**: Settings → Fleet Dashboard
3. **Debería mostrar**: Estadísticas de flota (inicialmente vacías)

## 🚨 **Si Aún Hay Errores**

### **Verificar variables de entorno:**
```bash
cd ms-reporter/backend/reporter
node -e "require('dotenv').config(); console.log('MONGODB_URL:', process.env.MONGODB_URL); console.log('MONGODB_DB_NAME:', process.env.MONGODB_DB_NAME);"
```

### **Verificar que el archivo .env esté en la ubicación correcta:**
```bash
ls -la ms-reporter/backend/reporter/.env
```

### **Verificar permisos:**
```bash
chmod 644 ms-reporter/backend/reporter/.env
```

## 📝 **Notas Importantes**

- **MongoDB debe estar ejecutándose** antes de iniciar el ms-reporter
- **Las variables de entorno** deben estar configuradas correctamente
- **La base de datos** debe existir y ser accesible
- **Los permisos** deben estar configurados correctamente

## 🎯 **Resultado Esperado**

Una vez configurado correctamente, deberías ver:
- ✅ **Logs de conexión** a MongoDB
- ✅ **Dashboard funcionando** sin errores
- ✅ **Estadísticas** mostrándose correctamente
- ✅ **Comunicación** entre microservicios funcionando
