# Trading Journal Pro — Guía para Claude Code

SaaS comercial para traders de Interactive Brokers. Seguridad, aislamiento multi-tenant y la promesa de `docs/privacy_disclosure.md.resolved`: la app **nunca** opera en cuentas de usuarios.

## Stack

- **Backend**: FastAPI, Python 3.12.12 (NO subir versión), SQLAlchemy async, Uvicorn `--loop asyncio` (NO `uvloop`).
- **Frontend**: React 18 + TypeScript + Vite + TanStack Query 5 + Radix UI + Tailwind.
- **DB**: PostgreSQL en dev (docker-compose) y prod (Railway). `DATABASE_URL` es obligatorio — el backend no arranca sin él.
- **Auth**: JWT HS256 `python-jose`, bcrypt `passlib`. Access 15m, refresh 7d con rotation.
- **Cripto**: `cryptography.fernet` para Flex Token IBKR en reposo.
- **Deploy**: Railway.app. `backend/Dockerfile` + `docker-compose.yml`.

## Arquitectura de dos productos

1. **Web app** (servidor): `backend/` + `frontend/` estático via FastAPI. Guarda trades, métricas, equity. **Nunca** habla con TWS.
2. **TJ Connector** (`tj-connector/`): binario PyInstaller en máquina del usuario. Micro-API en `http://127.0.0.1:8765` (solo localhost). Datos live **jamás** tocan el servidor.

Detección: `GET http://localhost:8765/status` timeout 800ms. Presente → Connector. Ausente → UI de descarga.

## Reglas no-negociables

1. **Multi-tenant**: todo query con `user_id` filtra `.where(Model.user_id == user_id)`. `user_id` viene del middleware, nunca del cliente.
2. **X-Account-ID intacto**: multi-cuenta por usuario ya funciona. No reestructurar.
3. **Migraciones aditivas**: solo `ADD COLUMN ... DEFAULT` al final de `migrations.py`. Nunca modificar pasadas. `user_id` legacy = `'system'`.
4. **Flex Token encriptado**: `crypto.encrypt()` al guardar, `crypto.decrypt()` al leer. Nunca loggear en claro.
5. **Connector read-only**: cero `placeOrder`, `cancelOrder`, `modifyOrder` ni cualquier escritura de `ib_insync`.
6. **Connector en 127.0.0.1 solo**: nunca `0.0.0.0`. CORS estricto al dominio de la web app.
7. **Cliente API único**: frontend usa `lib/api.ts` (servidor) o `lib/connector.ts` (Connector). Nunca `fetch` directo.
8. **Early return**: validaciones primero. Sin if/else profundos.
9. **No silenciar errores**: `try/except` sin manejo → re-lanzar. Sin `except Exception: pass`.
10. **Sin pywebview**: eliminado. `scripts/run_app.py` usa `webbrowser.open()`.

## Archivos críticos

| Archivo | Qué hace | Cuándo tocar |
|---------|----------|--------------|
| `backend/main.py` | App FastAPI, middleware, CORS, mount estático | Config global / rutas exentas |
| `backend/auth_middleware.py` | Valida JWT, inyecta `user_id` | Lista de rutas exentas |
| `backend/auth_utils.py` | JWT emisión/verificación, bcrypt | Política de tokens |
| `backend/routers/auth.py` | `/register /login /refresh /me` | Features de auth |
| `backend/crypto.py` | Fernet encrypt/decrypt | **Nunca** sin migración |
| `backend/models.py` | ORM (User, Trade, Settings, AccountEquity, AssetBoardItem, BoardNote) | Solo columnas nuevas vía migrations |
| `backend/migrations.py` | Migraciones versionadas | Solo agregar al final |
| `backend/routers/trades.py` | CRUD trades por `user_id` | Solo añadir endpoints |
| `backend/routers/metrics.py` | Equity curve, heatmap, performance | Extensiones de métricas |
| `backend/routers/sync.py` | Flex Query IBKR HTTPS, XML, retry | Integración IBKR |
| `backend/routers/accounts.py` | CRUD cuentas multi-account | Gestión de cuentas |
| `backend/routers/assets.py` | Asset board + órdenes planificadas | UI portfolio board |
| `backend/ibkr_account.py` / `ibkr_positions.py` | Wrappers ib_insync | **Solo lectura** |
| `frontend/src/App.tsx` | Root: auth → login → app + onboarding | Routing de alto nivel |
| `frontend/src/lib/api.ts` | Fetch cliente, bearer, refresh 401, X-Account-ID | Networking global |
| `frontend/src/lib/i18n.tsx` | Traducciones ES/EN | Todo texto user-facing |
| `tj-connector/api.py` | Micro-API 127.0.0.1:8765 | Endpoints del Connector |
| `tj-connector/ibkr_bridge.py` | Conexión TWS ib_insync | **Solo lectura** |

## Desarrollo local

```bash
cd backend && uvicorn main:app --reload --loop asyncio --port 8000
cd frontend && npm run dev          # Vite en 5173
cd tj-connector && python main.py   # opcional, datos live TWS
```

**Env vars** (`DATABASE_URL`, `JWT_SECRET`, `FERNET_KEY`, `ENVIRONMENT`, `ALLOWED_ORIGINS`). Ver `.env.example`. Nunca commitear `.env`.

## Patrones clave

**Nueva migración**: `if current_version < N: ALTER TABLE ... ADD COLUMN ... DEFAULT` + incrementar `SCHEMA_VERSION`. Verificar idempotencia.

**Nuevo router**: `APIRouter(prefix="/api/foo")` → registrar en `main.py` → cada endpoint con `user_id: str = Depends(get_current_user_id)`. Si exento de auth → agregar a `auth_middleware.py` con justificación.

**Frontend**: TanStack Query para estado servidor. Query keys: `['trades', accountId, userId]`. Traducir en `i18n.tsx`.

**Flujo auth**: `api.ts` inyecta `Bearer + X-Account-ID` → middleware valida JWT → `request.state.user_id` → endpoint filtra por él. 401 → refresh una vez → falla → `clearAuthTokens()` + reload.

## Prohibiciones

- Python > 3.12 / uvloop / pywebview / QtWebEngine.
- `fetch()` directo desde componentes React.
- `DROP COLUMN` en DB. Soft-deprecate con NULL si hay que retirar.
- Commitear `.env`, claves Fernet, `trading_journal.db`.
- Modificar `trades.py`, `metrics.py`, `sync.py` sin instrucción explícita.
- Cambiar `crypto.py` sin migración (invalida todos los tokens).
- Agregar deps sin justificación (agranda el build del Connector).

## Seguridad — checklist antes de cada PR

- [ ] Queries con `user_id` filtran por él.
- [ ] Endpoints nuevos sin auth → justificados en `auth_middleware.py`.
- [ ] Connector: cero escrituras IBKR.
- [ ] Sin logs de tokens, passwords, JWT, emails completos.
- [ ] CORS restringido a `ALLOWED_ORIGINS`.
- [ ] Skills `tenant-isolation-check` + `ibkr-safety-audit` corridas en PR de auth/connector.
- [ ] Migraciones nuevas testeadas contra DB v(N-1).
- [ ] Connector firmado/notarizado (macOS) si hubo cambios en `tj-connector/`.

## Debugging — síntomas conocidos

| Síntoma | Causa | Fix |
|---------|-------|-----|
| Event loop closed (macOS) | uvloop activo | `--loop asyncio` |
| Flex Token "invalid" | Espacios invisibles | `.trim()` en frontend |
| `ib_insync` timeout | TWS cerrado | Puerto 7497 (TWS) / 4002 (Gateway) |
| CORS 403 prod | `ALLOWED_ORIGINS` con espacios | Separar por coma sin espacios |
| 401 en todos endpoints | Middleware mal configurado | Revisar lista exentos en `auth_middleware.py` |
| Build PyInstaller falla | TS vars no usadas | Limpiar antes de `tsc` |

## Convenciones

- Python: `snake_case` / `PascalCase` clases / `UPPER_SNAKE` constantes. Type hints obligatorios.
- TypeScript: `camelCase` / `PascalCase` componentes. `interface` sobre `type` para objetos.
- Commits: `tipo: resumen corto` (`feat:`, `fix:`, `chore:`). Sin `--no-verify`.
- PRs auth/crypto/connector: correr `security-reviewer-tj` antes de merge.
- PRs con `models.py`: incluir diff de `migrations.py` en el mismo commit.
- Logging: `INFO` prod / `DEBUG` dev. Ofuscar emails (`u***@dominio.com`).

## Referencias

- `docs/TECHNICAL_LOG.md` — decisiones técnicas (Python 3.12, uvloop, codesign).
- `docs/privacy_disclosure.md.resolved` — promesa de seguridad. Leer antes de tocar Connector o auth.
- `docs/sign-and-export-macos.md` — firmado del Connector para macOS.
- `docs/plan.md` — roadmap de producción (Fases 1-4).
- `.env.example` — variables requeridas.
- `.claude/skills/` — skills custom: `tenant-isolation-check`, `ibkr-safety-audit`, `migration-writer`, `release-connector`.
