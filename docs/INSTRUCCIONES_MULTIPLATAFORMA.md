# Guía de Compilación Multiplataforma (Windows & macOS)

Este proyecto usa **un solo código fuente** para ambas plataformas. Solo cambia el proceso de empaquetado.

## Arquitectura del Proyecto

```
TradingJournal/
├── frontend/          ← 100% compartido (React + Vite)
├── backend/           ← 100% compartido (FastAPI + SQLite)
├── run_app.py         ← 100% compartido (detecta SO automáticamente)
├── build_app.py       ← Script de build (selecciona spec según SO)
├── specs/
│   ├── windows.spec   ← PyInstaller config → genera .exe
│   └── macos.spec     ← PyInstaller config → genera .app
└── scripts/
    └── setup_macos.sh ← Script de setup automático para Mac
```

## Requisitos Previos

| Requisito | Windows | macOS |
|-----------|---------|-------|
| **Python** | 3.10+ | 3.10+ (via Homebrew) |
| **Node.js** | 18+ | 18+ (via Homebrew) |
| **Build tool** | PyInstaller | PyInstaller |
| **Native GUI** | WinForms/.NET (automático) | Cocoa/WebKit (automático) |

## Compilación en Windows

```powershell
# 1. Abrir terminal en la carpeta del proyecto
# 2. Ejecutar:
python build_app.py
```

El script detecta Windows automáticamente y usa `specs/windows.spec`.
El ejecutable se genera en: `dist/TradingJournalPro.exe`

## Compilación en macOS (Apple Silicon)

### Opción A: Setup Automático (recomendado para primera vez)

```bash
# 1. Abrir Terminal en la carpeta del proyecto
# 2. Ejecutar:
bash scripts/setup_macos.sh
```

Este script automáticamente:
- Instala Homebrew (si no está instalado)
- Instala Python y Node.js
- Crea un entorno virtual
- Instala todas las dependencias
- Compila la aplicación
- Ofrece copiarla a /Applications

### Opción B: Build Manual

```bash
# 1. Instalar herramientas (si no las tienes)
brew install python node

# 2. Crear y activar entorno virtual
python3 -m venv venv
source venv/bin/activate

# 3. Instalar dependencias
pip install -r backend/requirements.txt
pip install pyinstaller
cd frontend && npm install && cd ..

# 4. Compilar
python build_app.py
```

La aplicación se genera en: `dist/TradingJournalPro.app`

## Solución de Problemas en macOS

### "La app no se puede abrir porque es de un desarrollador no verificado"

Esto es normal para apps compiladas localmente. Hay dos soluciones:

**Solución 1 - Terminal:**
```bash
xattr -cr dist/TradingJournalPro.app
```

**Solución 2 - Manual:**
1. Ve a la carpeta `dist` en Finder
2. Haz **clic derecho** (o Control+Clic) en `TradingJournalPro.app`
3. Selecciona **Abrir**
4. En la ventana emergente, pulsa **Abrir** de nuevo

### "La app no se puede abrir" (sin más detalles)

```bash
# Verificar que la arquitectura es correcta (debe decir arm64)
file dist/TradingJournalPro.app/Contents/MacOS/TradingJournalPro

# Si dice x86_64, recompila con el spec correcto
python build_app.py --target macos
```

### Permisos de red

macOS puede pedir permiso para conexiones de red la primera vez. Haz clic en **Permitir** — la app necesita conexión local al backend (puerto 8000).

## Notas Importantes

- **No se puede compilar para macOS desde Windows** (ni viceversa). PyInstaller no hace cross-compilation. Cada plataforma se compila en su propia máquina.
- **Apple Silicon (M1/M2/M3/M4)** — El spec de macOS está configurado para `arm64`. No se necesita Rosetta.
- **Base de datos** — SQLite es compatible en ambas plataformas sin cambios.
- **El código de la aplicación es idéntico** — Solo cambia el empaquetado final.
