# Log Técnico: Problemas Resueltos y Decisiones de Arquitectura

Este documento resume los desafíos técnicos enfrentados durante el desarrollo y estabilización de **Trading Journal Pro**, las razones detrás del cambio de versión de Python y un reporte de errores críticos corregidos.

---

## 1. Versión de Python y Estabilidad del Entorno

### El Problema (Python 3.14)
Inicialmente, el sistema intentaba utilizar **Python 3.14** (versión experimental/pre-release). Esto causó fallos críticos en cascada:
- **Incompatibilidad de Librerías Core**: Librerías fundamentales como `uvloop` y `ib_insync` no estaban preparadas para las estructuras internas de Python 3.14.
- **Fallos de Compilación de Extensiones C**: Muchas dependencias que requieren compilación nativa fallaban al no encontrar cabeceras compatibles, impidiendo incluso la instalación del `requirements.txt`.
- **Inestabilidad de Asyncio**: La gestión del event loop en macOS con la versión 3.14 presentaba cuelgues aleatorios al intentar conectar con la API de Interactive Brokers.

### La Solución (Python 3.12.12)
Se realizó una migración forzada a **Python 3.12.12**. 
- **Razón**: Es la versión más estable y ampliamente soportada actualmente por el ecosistema de trading y async de Python.
- **Resultado**: Instalación limpia de dependencias y estabilidad total en la comunicación con TWS/Gateway.

### Forzado de Loop Estándar
Se detectó que `uvloop` (el motor por defecto de Uvicorn) presentaba problemas de permisos y sockets en macOS Apple Silicon dentro de entornos empaquetados.
- **Cambio**: Se configuró la aplicación para usar explícitamente el loop estándar de `asyncio` (`--loop asyncio`), eliminando errores de "Event loop closed".

---

## 2. Errores de Producción y Onboarding

### Credenciales de IBKR
- **Problema**: Los usuarios a menudo copiaban el Flex Token con espacios invisibles al final, lo que causaba que la validación de IBKR fallara silenciosamente.
- **Cambio**: Se implementó `.trim()` en todos los campos de credenciales tanto en la pantalla de bienvenida como en configuración.

### Flujo de Bienvenida (Onboarding)
- **Problema**: La aplicación ocultaba automáticamente el mensaje de bienvenida si detectaba cualquier dato previo, impidiendo que el usuario lo reiniciara manualmente si se equivocaba.
- **Cambio**: Se añadió un flag de "Forced Onboarding" y un botón en Configuración para resetear el tour, garantizando que el usuario siempre pueda volver a la guía inicial.

---

## 3. Desafíos de Distribución (macOS)

### Firmado de Código (Codesign)
- **Problema**: macOS impide firmar archivos que contienen "Finder Info" (metadatos inyectados automáticamente al mover archivos por carpetas de usuario como Desktop o Downloads).
- **Lección**: La aplicación **siempre** debe copiarse a `/tmp/` antes de firmar para limpiar estos metadatos.

### Notarización de Apple
- **Hardened Runtime**: Apple rechaza cualquier aplicación que no tenga habilitado el *Hardened Runtime*. Se añadió el flag `--options=runtime` al comando de firmado.
- **Entitlements**: Se configuró el archivo `entitlements.plist` para permitir específicamente el acceso a la red local y JIT, necesarios para que el backend de Python funcione dentro del sandbox de Apple.

### Recursos Faltantes en el Build
- **Icono .icns**: PyInstaller fallaba al no encontrar un archivo `.icns` nativo. Se implementó un script de conversión usando `sips` e `iconutil` para generar el icono oficial a partir de un PNG de alta resolución.
- **TypeScript Errors**: El compilador de producción (`tsc`) bloqueaba el build por variables no utilizadas. Se realizó una limpieza de código en `AccountManager.tsx`, `Sidebar.tsx` y otros para permitir una compilación de producción "limpia".

---

> [!IMPORTANT]
> **Recomendación para Desarrollos Futuros**: No subir la versión de Python por encima de la 3.12 hasta que `ib_insync` y `uvloop` publiquen compatibilidad oficial. Para builds en macOS, usar siempre el flujo documentado en `sign-and-export-macos.md`.
