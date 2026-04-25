# TWS Bridge — implementación actual

## Qué es

Bridge local en Node.js que conecta la web app con Trader Workstation (TWS) o IB Gateway de Interactive Brokers. La web app no puede hablar con TWS directamente; este bridge resuelve eso.

Reemplaza al `tj-connector/` Python anterior (FastAPI + `ib_insync` + PyInstaller). Ver razones en `docs/TECHNICAL_LOG.md` sección 4.

## Arquitectura

```
[Web app HTTPS] ──HTTP REST──▶ [Bridge 127.0.0.1:8765] ──IB API──▶ [TWS 127.0.0.1:7497/7496/4001/4002]
```

- El bridge expone `http://127.0.0.1:8765` — modernos navegadores tratan loopback como secure context y aceptan peticiones HTTP desde páginas HTTPS, **excepto Safari** (ver sección de compatibilidad).
- El bridge se conecta a TWS mediante `@stoqey/ib` (port mantenido del Java IB API v10.32.01).
- Cada usuario corre su propia instancia local.

## Stack

| Capa | Tecnología |
|---|---|
| Runtime | Node.js 18 LTS (probado con Node 24) |
| Cliente IB | `@stoqey/ib@^1.3.21` (`IBApiNext`) |
| HTTP server | `express@^4.21.2` |
| CORS | `cors@^2.8.5` |
| Reactive | `rxjs@^7.8.1` |
| Empaquetado | `pkg` → `node18-win-x64`, `node18-macos-x64`, `node18-macos-arm64` |
| Distribución | GitHub Releases vía tags `connector-v*` |

## Estructura del proyecto

```
bridge/
├── src/
│   ├── index.js          # Entry: levanta servidor HTTP + auto-conecta a TWS
│   ├── ibClient.js       # Wrapper IBApiNext (read-only)
│   ├── server.js         # Express con rutas /status, /portfolio, /positions, /strikes/:symbol
│   └── cors.js           # Whitelist de orígenes (Railway prod + dev local)
├── package.json
├── package-lock.json
├── .gitignore
└── README.md
```

## Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/status` | Health check. La web app lo poll para detectar si el bridge está corriendo. |
| GET | `/portfolio` | NetLiquidation, P&L y posiciones con marketValue. |
| GET | `/positions` | Posiciones abiertas con flag `has_stop` por símbolo. |
| GET | `/strikes/:symbol` | Precio actual + IV + niveles 1-SD weekly y monthly. |

Mensajes son JSON. Solo método `GET`. CORS restringido al whitelist de orígenes en `bridge/src/cors.js`.

## Comportamiento clave

- Al arrancar: levanta servidor HTTP en `127.0.0.1:8765`. El servidor solo bindea a loopback, nunca `0.0.0.0`.
- Al recibir una request: abre conexión a TWS (auto-detecta puerto entre `7497, 7496, 4001, 4002`), corre la query, devuelve el resultado y desconecta. Cada llamada es independiente.
- Si TWS no está abierto: responde `{success: false, message: "Cannot connect to TWS..."}` con código 200 (el frontend lo maneja como estado).
- **Read-only**: nunca llama `placeOrder`, `cancelOrder`, `modifyOrder`. Garantía verificada por grep en CI.

## Compatibilidad de navegadores

| Navegador | Funciona |
|---|---|
| Chrome (desktop) | ✅ |
| Edge (desktop) | ✅ |
| Firefox 84+ (desktop) | ✅ |
| Brave / Opera / Vivaldi | ✅ (Chromium-based) |
| Safari (macOS) | ❌ |
| iOS (todos) | ❌ — no aplica, TWS es desktop-only |

**Safari** bloquea silenciosamente cualquier petición HTTP desde una página HTTPS hacia `localhost` ([WebKit Bug 171934](https://bugs.webkit.org/show_bug.cgi?id=171934), abierto desde 2017). El frontend detecta Safari via `navigator.userAgent` y muestra un banner en `IBKRConnectionError.tsx` recomendando Chrome/Firefox/Edge.

Si en el futuro se necesita soporte Safari, la solución es TLS con cert válido (truco Plex: dominio dedicado + Let's Encrypt + cert distribuido en el binario). Documentado como path futuro.

## Build comandos

```bash
cd bridge
npm ci

# Dev
npm start                # node src/index.js

# Empaquetar
npm run build            # todos los targets
npm run build:win        # solo Windows .exe
npm run build:mac        # solo macOS Intel + ARM
```

## Integración con la web app

### 1. Detectar OS y mostrar prompt de descarga

```ts
function getOS() {
  const p = navigator.userAgent;
  if (p.includes('Win')) return 'windows';
  if (p.includes('Mac')) return 'mac';
  return 'unknown';
}
```

### 2. Detectar bridge al cargar la página

```ts
async function isConnectorRunning(): Promise<boolean> {
  try {
    const res = await fetch('http://localhost:8765/status', {
      signal: AbortSignal.timeout(800),
    });
    return res.ok;
  } catch {
    return false;
  }
}

const running = await isConnectorRunning();
if (!running) showDownloadModal(getOS());
```

### 3. Llamar a un endpoint

```ts
const res = await fetch('http://localhost:8765/portfolio');
const data = await res.json();
if (data.success) updatePortfolioUI(data);
```

(Implementación real en `frontend/src/lib/connector.ts`.)

## Configuración TWS requerida (una vez por usuario)

1. TWS → *Edit → Global Configuration → API → Settings*
2. Habilitar *"Enable ActiveX and Socket Clients"*
3. Socket port: `7497` (TWS live), `7496` (TWS paper), `4001` (Gateway live), `4002` (Gateway paper). El bridge auto-detecta los cuatro.
4. Agregar `127.0.0.1` a *Trusted IPs*.

## Variables de entorno

```
BRIDGE_PORT=8765         # opcional, default 8765
```

## Notas de plataforma

- **macOS**: Binarios sin firmar bloqueados por Gatekeeper. Usuario debe correr `xattr -cr <binary>` una vez. Para distribución amplia, firmar con Apple Developer ID (`codesign --options=runtime`) + notarizar con `notarytool`.
- **Windows**: SmartScreen muestra warning en primera ejecución. Para silent install, firmar con cert EV. Mientras: instruir "More info → Run anyway".
- **Auto-start opcional**: Usar `auto-launch` package o LaunchAgent (macOS) / Task Scheduler (Windows). No incluido en v0.4.0.

## Qué NO hacer

- No exponer el server en `0.0.0.0` — solo loopback.
- No agregar endpoints de escritura a IBKR (placeOrder, cancelOrder, modifyOrder).
- No empaquetar TWS — los usuarios lo instalan separadamente desde IB.
- No almacenar credenciales IB en el bridge — TWS maneja la auth.
