# Trading Journal Pro — Guía para Claude Code

SaaS comercial para traders de Interactive Brokers. Seguridad, aislamiento multi-tenant y la promesa de `docs/privacy_disclosure.md.resolved`: la app **nunca** opera en cuentas de usuarios.

## Stack

- **Backend**: FastAPI, Python 3.12.12 (NO subir versión), SQLAlchemy async, Uvicorn `--loop asyncio` (NO `uvloop`).
- **Frontend**: React 18 + TypeScript + Vite + TanStack Query 5 + Radix UI + Tailwind.
- **DB**: PostgreSQL en dev (docker-compose) y prod (Railway). `DATABASE_URL` es obligatorio — el backend no arranca sin él.
- **Auth**: JWT HS256 `python-jose`, bcrypt `passlib`. Access 15m, refresh 7d con rotation.
- **Cripto**: `cryptography.fernet` para Flex Token IBKR en reposo.
- **Deploy**: Railway.app. `Dockerfile` (raíz, multi-stage) + `railway.json`. CI en `.github/workflows/ci.yml`.

## Arquitectura de dos productos

1. **Web app** (servidor): `backend/` + `frontend/` estático via FastAPI. Guarda trades, métricas, equity. **Nunca** habla con TWS.
2. **TJ Bridge** (`bridge/`): binario `pkg` Node.js en máquina del usuario. Micro-API en `http://127.0.0.1:8765` (solo localhost). Datos live **jamás** tocan el servidor. **Reemplaza al `tj-connector/` Python** que está en proceso de retiro (ver `docs/TECHNICAL_LOG.md` sección 4).

Detección: `GET http://localhost:8765/status` timeout 800ms. Presente → bridge corriendo. Ausente → UI de descarga.

> [!NOTE]
> **Migración Python → Node.js en curso (2026-04).** El bridge Node está implementado y validado contra TWS local (ver `bridge/`). Pendiente: build con `pkg`, reescribir `.github/workflows/release-connector.yml` y publicar `connector-v0.4.0`. Plan completo y estado en `C:\Users\monag\.claude\plans\clever-sniffing-gray.md`. **No borrar `tj-connector/` todavía** — sigue siendo el binario distribuido hasta que se publique v0.4.0.

## Estado del proyecto

| Fase | Estado | Notas |
|------|--------|-------|
| Fase 1 — Reorganización de archivos | ✅ Completada | Scripts, docs, tests reubicados |
| Fase 2 — PostgreSQL único | ✅ Completada | SQLite eliminado; docker-compose con Postgres 16 |
| Fase 3 — Deploy Railway | ✅ Completada | Dockerfile multi-stage, railway.json, GitHub Actions CI |
| Fase 4 — Distribución TJ Connector | ✅ Completada | Descarga del Connector desde la web app y CI via GitHub Actions |
| Fase 4.1 — Migración Connector Python → Bridge Node.js | 🚧 En progreso | `bridge/` implementado y validado local. Pendiente `pkg` build + CI + release v0.4.0. Ver plan en `~/.claude/plans/clever-sniffing-gray.md` |

Ver `docs/plan.md` para el roadmap detallado.

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

## Aislamiento multi-tenant — estado por router

| Router | user_id filtrado | Notas |
|--------|-----------------|-------|
| `routers/trades.py` | ✅ | Completo |
| `routers/metrics.py` | ✅ | Completo |
| `routers/accounts.py` | ✅ | rename/delete con ownership check |
| `routers/settings.py` | ✅ | `get_or_create_settings(db, account_id, user_id)` — siempre los 3 args |
| `routers/sync.py` | ✅ | Trade, AccountEquity, Settings, purge, last-sync filtran user_id |
| `routers/assets.py` | ✅ | Completo |

Patrón correcto en cualquier endpoint:

```python
user_id = get_user_id_from_request(request) or "system"
result = await db.execute(
    select(Model).where(Model.account_id == account_id, Model.user_id == user_id)
)
```

`"system"` es el fallback para datos legacy pre-autenticación. Nunca omitir el filtro en tablas con `user_id`.

## Modelos con columna user_id (migración v7)

Trade · Settings · AccountEquity · AssetBoardItem · BoardNote

Todos filtran con `.where(Model.user_id == user_id)`. Si se añade un modelo con datos privados de usuario, debe incluir `user_id` desde el primer commit y una migración correspondiente.

## Archivos críticos

| Archivo | Qué hace | Cuándo tocar |
|---------|----------|--------------|
| `backend/main.py` | App FastAPI, middleware, CORS, mount estático | Config global / rutas exentas |
| `backend/auth_middleware.py` | Valida JWT, inyecta `user_id` en `request.state` | Lista de rutas exentas |
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
| `Dockerfile` (raíz) | Multi-stage: node→frontend dist + python backend | Railway deploy |
| `railway.json` | Builder DOCKERFILE + healthcheck `/api/health` | Railway config |
| `.github/workflows/ci.yml` | Test (Postgres 16) + Docker build | CI/CD |

## Desarrollo local

```bash
cd backend && uvicorn main:app --reload --loop asyncio --port 8000
cd frontend && npm run dev          # Vite en 5173
cd tj-connector && python main.py   # opcional, datos live TWS
```

**Env vars** (`DATABASE_URL`, `JWT_SECRET`, `FERNET_KEY`, `ENVIRONMENT`, `ALLOWED_ORIGINS`). Ver `.env.example`. Nunca commitear `.env`.

## Deploy Railway

`Dockerfile` raíz: stage 1 (`node:20-alpine`) build frontend → stage 2 (`python:3.12-slim`) backend + `COPY --from=frontend-builder /frontend/dist /frontend/dist`. `get_frontend_path()` en `main.py:24` resuelve a `/frontend/dist` cuando WORKDIR=/app.

Variables Railway (configurar manualmente en el dashboard tras primer deploy):

| Variable | Cómo generar |
|----------|-------------|
| `DATABASE_URL` | Auto-inyectada por addon Postgres |
| `JWT_SECRET` | `python -c "import secrets; print(secrets.token_hex(32))"` |
| `FERNET_KEY` | `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| `ALLOWED_ORIGINS` | Dominio real sin barra final (ej. `https://app.tudominio.com`) |
| `ENVIRONMENT` | `production` |

GitHub Actions CI requiere secret `FERNET_KEY_CI` configurado en Settings → Secrets del repo.

## Patrones clave

**Nueva migración**: `if current_version < N: ALTER TABLE ... ADD COLUMN ... DEFAULT` + incrementar `SCHEMA_VERSION`. Verificar idempotencia. Siempre incluir `user_id DEFAULT 'system'` en tablas nuevas con datos de usuario.

**Settings router**: `get_or_create_settings(db, account_id, user_id)` — siempre los tres argumentos. Nunca llamar sin `user_id` o filtrará datos cross-tenant.

**Nuevo router**: `APIRouter(prefix="/api/foo")` → registrar en `main.py` → cada endpoint con `Request` param → `get_user_id_from_request(request)`. Si exento de auth → agregar a `auth_middleware.py` con justificación.

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
- Omitir `.where(Model.user_id == user_id)` en queries sobre tablas con esa columna.

## Seguridad — checklist antes de cada PR

- [ ] Queries con `user_id` filtran por él (correr `tenant-isolation-check`).
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
| `AttributeError: has no attribute 'user_id'` | Columna en DB pero no en ORM | Verificar `models.py` declara la columna |
| `UniqueViolation` en settings_pkey | Dos users crean `id="default"` | `accounts.py` genera UUID para users reales |
| `bcrypt` error en login/registro | bcrypt>=4.1 incompatible con passlib 1.7.4 | Pin `bcrypt==4.0.1` en requirements |
| `FERNET_KEY` inválida en Railway | Variable no configurada o mal copiada | Generar con Fernet.generate_key(), pegar sin espacios |
| Frontend muestra pantalla en blanco en prod | `dist/` no copiado en Docker stage 2 | Verificar `COPY --from=frontend-builder /frontend/dist /frontend/dist` |
| `email-validator` ImportError al arrancar | Pydantic EmailStr requiere la lib | Está en `backend/requirements.txt` — verificar pip install |
| `/api/auth/me` siempre 401 en prod | `auth_middleware.py` eximía todo `/api/auth/` incl. `/me` | Exempt list narrowed a `login/register/refresh` — `/me` requiere JWT |
| Pantalla en blanco tras login | Hooks llamados después de `return` condicional en `App` | `App` split en auth-gate + `AppContent`; nunca poner hooks tras early return |

## Convenciones

- Python: `snake_case` / `PascalCase` clases / `UPPER_SNAKE` constantes. Type hints obligatorios.
- TypeScript: `camelCase` / `PascalCase` componentes. `interface` sobre `type` para objetos.
- Commits: `tipo: resumen corto` (`feat:`, `fix:`, `chore:`). Sin `--no-verify`.
- PRs auth/crypto/connector: correr `security-reviewer-tj` antes de merge.
- PRs con `models.py`: incluir diff de `migrations.py` en el mismo commit.
- Logging: `INFO` prod / `DEBUG` dev. Ofuscar emails (`u***@dominio.com`).

## Pendientes de seguridad (antes de 50 usuarios)

- ✔ `routers/assets.py` — Multi-tenant isolation added en Fase 4.
- `routers/sync.py /demo-data` — DEV-only, protegido por `TRADING_JOURNAL_DEV`. No crítico en prod.
- `routers/metrics.py` — confirmar que `if user_id:` no sea bypassable con string vacío.

## Referencias

- `docs/TECHNICAL_LOG.md` — decisiones técnicas (Python 3.12, uvloop, codesign).
- `docs/privacy_disclosure.md.resolved` — promesa de seguridad. Leer antes de tocar Connector o auth.
- `docs/sign-and-export-macos.md` — firmado del Connector para macOS.
- `docs/plan.md` — roadmap de producción (Fases 1-4).
- `.env.example` — variables requeridas.
- `.claude/skills/` — skills custom: `tenant-isolation-check`, `ibkr-safety-audit`, `migration-writer`, `release-connector`.
