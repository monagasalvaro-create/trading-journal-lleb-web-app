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

## 4. Migración del Connector: Python (FastAPI + ib_insync) → Node.js (@stoqey/ib)

**Fecha**: 2026-04-25 (en progreso, ver `bridge/` y plan en `C:\Users\monag\.claude\plans\clever-sniffing-gray.md`).

### Razones del cambio

1. **`ib_insync` descontinuado**: Interactive Brokers anunció en febrero 2026 que `ib_insync` ya no recibe soporte. Su recomendación oficial son los clientes mantenidos en Java/C#/Node, lo que dejó al connector Python en un camino sin salida.
2. **Distribución frágil con PyInstaller**: el binario empaquetado fallaba en macOS por interacciones entre Gatekeeper y módulos C (`asyncio`, `pywin32` shims). El usuario reportó que el connector Python no arrancaba en macOS — sin error visible.
3. **Tamaño y complejidad**: PyInstaller incluye todo el runtime Python + ib_insync + dependencias C → ~80 MB. Un binario Node empaquetado con `pkg` queda en ~40 MB y arranca instantáneo.

### Decisión

Reescribir el connector como `bridge/` en Node.js 18 + `@stoqey/ib` (port del Java client v10.32.01, oct 2024, activamente mantenido). **Mismo contrato HTTP REST en `127.0.0.1:8765`**, drop-in replacement: el frontend (`frontend/src/lib/connector.ts`) no se toca.

### Tradeoff: Safari y mixed content

El estudio de viabilidad mostró que Safari (macOS + iOS) bloquea silenciosamente las peticiones HTTP/WebSocket desde HTTPS hacia `localhost`, incluso aunque otros navegadores las permitan ([WebKit Bug 171934](https://bugs.webkit.org/show_bug.cgi?id=171934), abierto desde 2017). La solución correcta requiere TLS con cert válido (truco Plex: dominio dedicado + Let's Encrypt + cert distribuido en el binario), lo cual añade complejidad de DNS, dominio y rotación cada 90 días.

**Decisión**: postergar TLS. Soportar Chrome/Firefox/Edge/Brave/Opera/Vivaldi (~70-80% de usuarios desktop). Mostrar banner explicativo en Safari (`IBKRConnectionError.tsx`) recomendando otro navegador. Migrar a TLS si la demanda lo justifica.

### Diferencias técnicas con el Python anterior

- `getAccountUpdates()` de `IBApiNext` requiere esperar la primera carga real de datos (no la primera emisión vacía del Observable). El helper `waitForAccountSnapshot` en `bridge/src/ibClient.js` lo maneja con un poll de 200ms hasta que `value` o `portfolio` tenga entradas.
- `getMarketDataSnapshot` no acepta generic ticks (TWS lo rechaza con `"Snapshot market data subscription is not applicable to generic ticks"`). Para implied volatility se necesita streaming `getMarketData`. El connector Python tampoco lograba IV real para STK contracts (solo OPT lo expone), por lo que ambos caen al fallback `iv = 0.25`. Los strikes calculados son matemáticamente equivalentes.

### Pasos pendientes

Ver `C:\Users\monag\.claude\plans\clever-sniffing-gray.md` (resumen del progreso). Pasos 7-11: empaquetar con `pkg`, reescribir CI `release-connector.yml`, tagear `connector-v0.4.0`, validar contra Railway producción, borrar `tj-connector/`.

---

> [!IMPORTANT]
> **Recomendación para Desarrollos Futuros**: El connector Python fue reemplazado por `bridge/` en Node.js. Para builds en macOS del bridge, validar que `pkg` empaqueta `@stoqey/ib` correctamente; si falla, considerar Node SEA o `bun build --compile`. La promesa read-only (`docs/privacy_disclosure.md.resolved`) sigue vigente — auditar `bridge/src/` con grep `placeOrder|cancelOrder|modifyOrder` antes de cada release.
