# Trading Journal Pro — Guía para Claude Code

Aplicación comercial (SaaS) para traders de Interactive Brokers. Producto en venta, no experimento. Cada decisión de código debe considerar seguridad, aislamiento multi-tenant y la promesa explícita de `docs/privacy_disclosure.md.resolved`: la app **nunca** puede operar en cuentas de usuarios.

## Stack

- **Backend**: FastAPI, Python 3.12.12 (NO subir versión — ver `docs/TECHNICAL_LOG.md`), SQLAlchemy async, Uvicorn con `--loop asyncio` (NO `uvloop`).
- **Frontend**: React 18 + TypeScript + Vite + TanStack Query 5 + Radix UI + Tailwind.
- **DB**: SQLite en dev (`sqlite+aiosqlite`), PostgreSQL en producción (`postgresql+asyncpg`). Misma URL via env.
- **Auth**: JWT HS256 vía `python-jose`, hash `passlib[bcrypt]`. Access 15m, refresh 7d con rotation.
- **Cripto**: `cryptography.fernet` para Flex Token IBKR en reposo.
- **IBKR**: `ib_insync` (socket TWS local, solo en TJ Connector) + Flex Query HTTPS (en backend servidor).
- **Deploy**: Railway.app previsto. `backend/Dockerfile` + `docker-compose.yml`.

## Arquitectura de dos productos

1. **Web app** (servidor): `backend/` + `frontend/` servido estático por FastAPI. Guarda trades, métricas, equity. **Nunca** habla con TWS.
2. **TJ Connector** (`tj-connector/`): binario PyInstaller que corre en la máquina del usuario. Expone micro-API en `http://127.0.0.1:8765` (solo localhost, nunca `0.0.0.0`) para datos live de TWS. Los datos live **jamás** tocan el servidor.

La web app detecta el Connector con `GET http://localhost:8765/status` con timeout 800ms. Presente → usa Connector para portfolio/strikes. Ausente → muestra UI de descarga.

## Reglas no-negociables

1. **Aislamiento multi-tenant**: todo query a modelos con columna `user_id` debe filtrar `.where(Model.user_id == user_id)`. El `user_id` viene del request state inyectado por `auth_middleware.py`. Nunca confiar en payloads del cliente.
2. **X-Account-ID sigue intacto**: el sistema multi-cuenta dentro de un mismo usuario ya funciona y está probado. No reestructurar ni renombrar.
3. **Migraciones aditivas**: sumar columnas con `DEFAULT` en `migrations.py` al final, nunca reescribir tablas ni modificar migraciones existentes. `user_id` legacy = `'system'`.
4. **Flex Token encriptado siempre**: pasar por `crypto.encrypt()` antes de guardar, `crypto.decrypt()` al leer. Nunca loggear el token en claro.
5. **TJ Connector es read-only**: jamás agregar llamadas a `placeOrder`, `cancelOrder`, `modifyOrder`, `reqExecutions` que escriban, ni cualquier API de escritura de `ib_insync`. Esta es la promesa de `docs/privacy_disclosure.md.resolved` y es una barrera de seguridad estructural.
6. **Connector escucha SOLO `127.0.0.1`**: nunca `0.0.0.0`, nunca rutas externas. CORS del Connector estricto al dominio web app.
7. **Cliente API único**: frontend usa `frontend/src/lib/api.ts` (servidor) o `frontend/src/lib/connector.ts` (Connector local). Nunca `fetch` directo desde componentes.
8. **Early return**: validaciones primero, camino feliz al final. No anidar if/else profundos.
9. **No silenciar errores**: si un `try/except` no puede manejar el error, lo re-lanza. Sin `except Exception: pass`.
10. **Pywebview está eliminado**: no reintroducir. `scripts/run_app.py` abre navegador con `webbrowser.open()`.

## Archivos críticos — contexto rápido

| Archivo | Qué hace | Cuándo tocar |
|---------|----------|--------------|
| `backend/main.py` | App FastAPI, middleware, CORS, mount estático | Solo para config global o rutas exentas |
| `backend/auth_middleware.py` | Valida JWT, inyecta `user_id` en request state | Cambios en lista de rutas exentas |
| `backend/auth_utils.py` | Emisión/verificación JWT, hash bcrypt | Cambios en política de tokens |
| `backend/routers/auth.py` | `/register /login /refresh /me` | Features nuevas de auth |
| `backend/crypto.py` | Fernet encrypt/decrypt Flex Token | **Nunca** cambiar sin migración |
| `backend/models.py` | SQLAlchemy ORM (User, Trade, Settings, AccountEquity, AssetBoardItem, BoardNote) | Solo columnas nuevas vía `migrations.py` |
| `backend/migrations.py` | Migraciones versionadas aditivas | Agregar al final, nunca modificar pasadas |
| `backend/routers/trades.py` | CRUD trades (filtrado por `user_id`) | Solo añadir endpoints |
| `backend/routers/metrics.py` | Equity curve, heatmap, performance | Extensiones de métricas |
| `backend/routers/sync.py` | Flex Query IBKR HTTPS, parser XML, retry | Cambios de integración IBKR |
| `backend/routers/accounts.py` | CRUD cuentas multi-account | Gestión de cuentas |
| `backend/routers/assets.py` | Asset board + órdenes planificadas | UI de portfolio board |
| `backend/ibkr_account.py` / `ibkr_positions.py` | Wrappers ib_insync | **Solo lectura** |
| `frontend/src/App.tsx` | Root: auth check → login → app + onboarding | Routing de alto nivel |
| `frontend/src/lib/api.ts` | Fetch cliente, bearer token, refresh 401, X-Account-ID | Cambios globales de networking |
| `frontend/src/components/Auth/LoginPage.tsx` | Login + register UI | Features de auth |
| `frontend/src/components/Dashboard/*` | Vistas principales | Features de UI |
| `frontend/src/components/ui/ConnectionStatus.tsx` | Polling `/api/health` cada 10s | Rara vez |
| `tj-connector/api.py` | Micro-API 127.0.0.1:8765 (/status, /portfolio, /strikes) | Endpoints del Connector |
| `tj-connector/ibkr_bridge.py` | Conexión TWS vía ib_insync | **Solo lectura** IBKR |

## Workflows de desarrollo

### Correr localmente
```bash
# Backend
cd backend && uvicorn main:app --reload --loop asyncio --port 8000

# Frontend
cd frontend && npm run dev  # Vite en 5173

# TJ Connector (opcional, solo si quieres datos live de TWS)
cd tj-connector && python main.py
```

### Variables de entorno (ver `.env.example`)
`DATABASE_URL`, `JWT_SECRET`, `FERNET_KEY`, `ENVIRONMENT`, `ALLOWED_ORIGINS`. Generar `JWT_SECRET` con `secrets.token_hex(32)`, `FERNET_KEY` con `Fernet.generate_key()`. **Nunca** commitear `.env`.

### Añadir una migración
1. Editar `backend/migrations.py`, sumar bloque `if current_version < N: ALTER TABLE ... ADD COLUMN ... DEFAULT ...`.
2. Incrementar `SCHEMA_VERSION`.
3. Verificar idempotencia (checkear si la columna ya existe antes del ALTER).
4. Test: arrancar contra DB v(N-1) y confirmar upgrade limpio.

### Añadir un router
1. Crear `backend/routers/foo.py` con `APIRouter(prefix="/api/foo", tags=["foo"])`.
2. Registrar en `backend/main.py` via `app.include_router(...)`.
3. Cada endpoint recibe `user_id: str = Depends(get_current_user_id)` y filtra queries por él.
4. **Si el endpoint no debe requerir auth**, agregarlo a la lista de exentos en `auth_middleware.py` con justificación.

### Añadir un componente frontend
1. Nunca `fetch()` directo — usar `api` de `lib/api.ts` o `connectorApi` de `lib/connector.ts`.
2. Estado servidor: TanStack Query (`useQuery`/`useMutation`). Nunca fetch dentro de `useEffect`.
3. Traducciones en `frontend/src/lib/i18n.tsx` (ES/EN).

### Cuando tocar `scripts/run_app.py`
Solo para desarrollo/empaquetado local (bundle PyInstaller). En producción Railway no lo usa — corre `uvicorn main:app` directo.

## Qué NO hacer

- No subir Python > 3.12 (uvloop/ib_insync no listos).
- No usar `uvloop` en el backend (crashes en macOS packaged).
- No reintroducir `pywebview`, `QtWebEngine`, ni dependencias nativas similares.
- No hacer fetch desde componentes React sin pasar por `lib/api.ts` o `lib/connector.ts`.
- No borrar columnas de DB. Si una columna debe desaparecer, soft-deprecate y llenar `NULL` — nunca `DROP COLUMN`.
- No commitear `.env`, claves Fernet, ni `trading_journal.db`.
- No silenciar errores de IBKR: si `ib_insync` falla, propagar a la UI con mensaje claro (ver `IBKRConnectionError.tsx`).
- No agregar dependencias sin justificación (aumenta el tamaño del build del Connector).
- No modificar `backend/routers/trades.py`, `metrics.py`, `sync.py` salvo instrucción explícita — son lógica de negocio estable.
- No cambiar `backend/crypto.py` ni la estrategia de encriptación sin migración: romperla invalida todos los tokens guardados.

## Seguridad — chequeo mental antes de cada PR

- ¿Este query lee/escribe datos con `user_id`? → debe filtrar por `user_id`.
- ¿Este endpoint es nuevo y no está en rutas exentas? → el middleware lo protege, verificar que el handler use el `user_id` del state.
- ¿Estoy tocando el Connector? → cero `placeOrder`/`cancelOrder`/escrituras.
- ¿Estoy loggeando un Flex Token, password hash, JWT o email? → no.
- ¿CORS del backend sigue restringido a `ALLOWED_ORIGINS` en producción? → sí.

## Testing

Stack actual: mínimo. Priorizar cuando se añadan tests:
- Backend: `pytest` + `httpx.AsyncClient` para endpoints. Cubrir aislamiento `user_id` como test crítico.
- Frontend: Vitest + Testing Library para componentes de auth y estado.
- E2E: Playwright contra dev server (registro → login → sync → ver trades).

## Flujo de una request autenticada (referencia mental)

1. Frontend: `api.ts` lee `accessToken` de `localStorage` → inyecta `Authorization: Bearer <token>` + `X-Account-ID: <uuid>`.
2. Backend: `JWTAuthMiddleware` intercepta. Si la ruta está exenta (`/api/auth/*`, `/api/health`, SPA estático) → pasa sin validar. Si no → valida JWT, extrae `sub` → `request.state.user_id`.
3. Router: endpoint usa `Depends(get_current_user_id)` → recibe `user_id` → filtra `.where(Model.user_id == user_id)`.
4. 401 en frontend: `api.ts` intenta `POST /api/auth/refresh` una vez. Éxito → reintenta la request original. Falla → `clearAuthTokens()` + reload, vuelve a LoginPage.

Si vas a agregar un endpoint, sigue este flujo. Si vas a saltártelo, documenta el por qué en el código.

## Debugging — fallas conocidas

| Síntoma | Causa probable | Fix |
|---------|----------------|-----|
| Event loop closed (macOS) | uvloop activo | Arrancar con `--loop asyncio` |
| Flex Token "invalid" | Espacios invisibles al copiar | `.trim()` ya aplicado; si reaparece, revisar frontend settings |
| Onboarding no reaparece | Flag de "seen" en localStorage | Botón reset en Settings (ya implementado) |
| `ib_insync` timeout | TWS cerrado o puerto incorrecto (7497 TWS / 4002 Gateway) | Verificar settings del usuario + TWS corriendo |
| Build PyInstaller falla | Variables no usadas en TypeScript | `tsc` strict bloquea; limpiar antes de build |
| Codesign falla en macOS | Finder Info en binario | Copiar a `/tmp/` antes de firmar |
| CORS 403 en prod | `ALLOWED_ORIGINS` vacío o con espacios | Separar por coma sin espacios |
| 401 en todos los endpoints | Middleware exento mal configurado o token expirado | Revisar `auth_middleware.py` lista de exentos |

## Convenciones de código

- **Python**: `snake_case` funciones/variables, `PascalCase` clases, `UPPER_SNAKE` constantes. Type hints obligatorios en funciones públicas.
- **TypeScript**: `camelCase` funciones/variables, `PascalCase` componentes/tipos. Preferir `interface` sobre `type` para objetos.
- **Imports**: absolutos desde `backend/` y `frontend/src/`. No usar `../../../` de más de 2 niveles.
- **Errores HTTP**: usar `HTTPException(status_code, detail)` de FastAPI. `detail` siempre en inglés (i18n del lado frontend).
- **Traducciones**: todo texto user-facing en `frontend/src/lib/i18n.tsx`, nunca hardcoded.
- **Tamaño de funciones**: si una función pasa 60 líneas, considerar split. Lógica crítica de métricas es la excepción documentada.

## Patrones de estado y datos

- **Estado de servidor**: `TanStack Query` (`useQuery` / `useMutation`). Query keys compuestos: `['trades', accountId, userId]`. Invalidar con `queryClient.invalidateQueries({queryKey:['trades']})` tras mutaciones.
- **Estado local persistido**: `hooks/usePersistedState.ts` para configuración de UI que debe sobrevivir reload. NO usar para tokens ni datos sensibles.
- **Tokens JWT**: `localStorage` con keys `accessToken` / `refreshToken`. Leer/escribir solo vía helpers en `lib/api.ts`. Nunca tocarlos desde componentes.
- **Tablas grandes**: `@tanstack/react-table` con virtualización si pasan 500 filas. La tabla de trades ya tiene paginación server-side.
- **Formularios**: estado local con `useState` para formularios simples; no traer dependencias extra (react-hook-form) salvo que crezca la complejidad.

## Convenciones de commits y PRs

- **Formato de commit**: `tipo: resumen corto` (ej. `feat: login UI`, `fix: trim Flex Token`, `chore: bump deps`). Cuerpo opcional, siempre en español o inglés consistente.
- **Nunca**: `git commit --no-verify` ni `--no-gpg-sign`. Si el hook falla, arreglar la causa.
- **PRs de auth/crypto/connector**: siempre correr el subagent `security-reviewer-tj` antes de merge. Documentar en la descripción.
- **PRs que tocan `models.py`**: incluir el diff de `migrations.py` en el mismo commit. Reviewers rechazan migraciones fuera de su PR.
- **Mensaje tipo `bump v*`**: solo para releases con tag. Incluir CHANGELOG breve en el cuerpo.

## Logging y observabilidad

- **Backend**: usar el logger estándar de Python (`logging`). Nivel `INFO` en prod, `DEBUG` solo en dev. Nunca loggear el contenido de `Flex Token`, `password`, `JWT`, ni emails completos (ofuscar a `u***@dominio.com`).
- **Frontend**: `console.error` solo para errores que el usuario no verá. Para estados visibles, usar `Toast` del módulo `components/ui/`.
- **Sentry**: pendiente de integrar en el backend (Railway). Reservar la configuración de `sentry_sdk.init()` en `main.py` bajo `if ENVIRONMENT == "production"`.
- **Métricas de app**: Railway provee métricas básicas de uptime y latencia. Para producto comercial, evaluar `PostHog` o `Plausible` para analytics de uso (sin PII).

## Checklist pre-release

Antes de promover a producción:

- [ ] `git diff` no contiene logs de tokens, passwords, ni JWTs.
- [ ] Skill `tenant-isolation-check` corrida sobre el diff, sin hallazgos.
- [ ] Skill `ibkr-safety-audit` en `tj-connector/` y `backend/ibkr_*.py`, sin hallazgos.
- [ ] Migraciones nuevas testeadas contra DB de la versión anterior.
- [ ] `ALLOWED_ORIGINS` configurado al dominio real en Railway.
- [ ] `ENVIRONMENT=production` → CORS y logging restrictivos.
- [ ] Variables `JWT_SECRET` y `FERNET_KEY` rotables pero NO cambiadas en este release (cambiarlas invalida sesiones y tokens).
- [ ] Si tocaste el Connector: firmado y notarizado en macOS (`docs/sign-and-export-macos.md`), antivirus friendly en Windows.

## Referencias

- `docs/TECHNICAL_LOG.md` — historia de decisiones (Python 3.12, uvloop, codesign macOS).
- `docs/ai_instructions.md.resolved` — plan arquitectónico de la transformación pywebview→web.
- `docs/privacy_disclosure.md.resolved` — promesa de seguridad al usuario. Lectura obligatoria antes de tocar Connector o auth.
- `docs/sign-and-export-macos.md` — flujo de firmado del Connector para macOS.
- `.env.example` — variables requeridas.
- `.claude/skills/` — skills custom del proyecto (tenant-isolation-check, ibkr-safety-audit, migration-writer, release-connector).
- `.claude/agents/` — subagents especializados (security-reviewer-tj, ibkr-integration-reviewer).
