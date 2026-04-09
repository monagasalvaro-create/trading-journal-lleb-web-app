# My Trading Journal Pro

Una aplicación de diario de trading de alto rendimiento con análisis financiero avanzado y auditoría psicológica de operaciones.

## Características Principales

- 📊 **Dashboard con Diseño Bento** - Tarjetas KPI visualmente impactantes con efectos de glassmorphism.
- 📈 **Curva de Equidad Estilo TradingView** - Gráficos profesionales que muestran el P&L real vs. potencial.
- 🗓️ **Calendario de Actividad tipo GitHub** - Visualiza tu consistencia operativa a lo largo del año.
- 🏷️ **Etiquetas Psicológicas** - Audita tus operaciones por FOMO, Revenge Trading, Salida Prematura y Violación de Reglas.
- ✨ **Modo "Disciplina Perfecta"** - Descubre cuál sería tu P&L si no cometieras errores operativos.
- 🌓 **Modo Oscuro/Claro** - Soporte nativo para preferencias de sistema.
- 🔄 **Integración con IBKR** - Sincronización de operaciones mediante el servicio Flex de Interactive Brokers.

## Instalación y Configuración

### 1. Requisitos Previos

- Python 3.10+
- Node.js 18+ (para desarrollo del frontend)
- Docker (opcional, para despliegue rápido)

### 2. Instalación Local

**Pasos iniciales:**
```bash
# Instalar dependencias globales
pip install -r requirements.txt
```

**Configuración del Backend:**
```bash
cd backend
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

**Configuración del Frontend:**
```bash
cd frontend
npm install
npm run dev
```

### 3. Uso con Docker (Recomendado)

Si prefieres usar Docker para un despliegue rápido:

```bash
# Construir e iniciar contenedores
docker-compose up --build

# Backend disponible en: http://localhost:8000
# Frontend disponible en: http://localhost:5173
```

## Gestión de Versiones y Actualizaciones

Este proyecto utiliza **PyUpdater** para gestionar el empaquetado y las actualizaciones automáticas. 

- La fuente de verdad para la versión actual es `version.py`.
- Las compilaciones se realizan mediante PyInstaller utilizando los archivos `.spec` incluidos.
- **Nota técnica:** La carpeta `.pyupdater/` está excluida del repositorio por seguridad, ya que contiene llaves privadas de firma.

## Estructura del Proyecto

```
TradingJournal/
├── backend/            # Lógica del servidor FastAPI y base de datos
├── frontend/           # Interfaz de usuario en React + Vite
├── scripts/            # Scripts de utilidad y automatización
├── version.py          # Definición de versión del proyecto
├── requirements.txt    # Dependencias consolidadas
└── docker-compose.yml  # Configuración de Docker
```

## Licencia

Este proyecto está bajo la Licencia MIT.
