#!/bin/bash

echo "🔧 Configurando ms-reporter..."

# Crear archivo .env si no existe
if [ ! -f "backend/reporter/.env" ]; then
    echo "📝 Creando archivo .env..."
    cat > backend/reporter/.env << EOF
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
EOF
    echo "✅ Archivo .env creado"
else
    echo "✅ Archivo .env ya existe"
fi

# Verificar que MongoDB esté corriendo
echo "🔍 Verificando MongoDB..."
if command -v mongod &> /dev/null; then
    if pgrep -x "mongod" > /dev/null; then
        echo "✅ MongoDB está corriendo"
    else
        echo "⚠️  MongoDB no está corriendo. Iniciando..."
        if command -v systemctl &> /dev/null; then
            sudo systemctl start mongodb
        elif command -v brew &> /dev/null; then
            brew services start mongodb-community
        else
            echo "❌ No se pudo iniciar MongoDB automáticamente"
            echo "   Por favor, inicia MongoDB manualmente"
        fi
    fi
else
    echo "❌ MongoDB no está instalado"
    echo "   Por favor, instala MongoDB primero"
fi

# Crear base de datos y colecciones
echo "🗄️  Configurando base de datos..."
mongo --eval "
use reporter;
db.createCollection('fleet_statistics');
db.createCollection('processed_vehicles');
print('✅ Base de datos y colecciones creadas');
" 2>/dev/null || echo "⚠️  No se pudo conectar a MongoDB. Asegúrate de que esté corriendo."

echo "🎉 Configuración completada!"
echo ""
echo "📋 Próximos pasos:"
echo "1. Verifica que MongoDB esté corriendo"
echo "2. Inicia el microservicio: cd backend/reporter && npm start"
echo "3. Ve a http://localhost:4001 para probar el dashboard"
