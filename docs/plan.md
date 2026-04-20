# Plan de producción — Trading Journal Pro

Hoja de ruta para convertir la app de escritorio/demo en SaaS web para 50–100 usuarios.
Actualizar el estado de cada fase al completarla.

---

## Estado actual

| Fase | Estado | Commit(s) |
|------|--------|-----------|
| Fase 1 — Reorganización de archivos | ✅ Completada | `7d9c4dc`, `7a006ed`, `859d60b` |
| Fase 2 — PostgreSQL único | ✅ Completada | ver commits de Fase 2 |
| Fase 3 — Deploy Railway | ✅ Completada | ver commits de Fase 3 |
| Fase 4 — Canal de distribución Connector | ⏳ Pendiente | — |

Remote: `https://github.com/monagasalvaro-create/trading-journal-lleb-web-app.git` (branch `main`)

---

## Fase 1 — Reorganización de archivos ✅

Completada en commits `7d9c4dc` + `7a006ed`. Cambios realizados:

- `docs/` — documentación dispersa (TECHNICAL_LOG.md, ai_instructions.md.resolved, privacy_disclosure.md.resolved, sign-and-export-macos.md, Documento_*.md, INSTRUCCIONES_MULTIPLATAFORMA.md).
- `scripts/` — helpers de dev/build (run_app.py, build_app.py, migrate_db.py, fix_db.py, etc.) + README.md explicativo.
- `backend/tests/` — movidos test_*.py + __init__.py + conftest.py stub.
- `backend/scripts/` — scripts ad-hoc del backend (check_*, verify_*, query_trades, fix_nav_dates) + README.md.
- `backend/fetch_live_portfolio.py` queda en `backend/` (es módulo importado por `routers/portfolio.py`, no un script).
- CLAUDE.md actualizado con nuevas rutas; añadida referencia a `docs/plan.md`.

---

## Fase 2 — PostgreSQL único ✅

**Objetivo**: eliminar la divergencia SQLite dev / PostgreSQL prod. Una sola DB en todos los entornos.

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `docker-compose.yml` | Añadir servicio `postgres:16-alpine` con volumen + healthcheck. Backend `depends_on` postgres. |
| `backend/database.py` | Requerir `DATABASE_URL` obligatorio. Eliminar rama SQLite y lógica `sys._MEIPASS`. Fallar con mensaje claro si falta. |
| `backend/requirements.txt` | Añadir `asyncpg~=0.29`. Eliminar `aiosqlite`. |
| `requirements.txt` (raíz) | Mismo cambio si aplica. |
| `backend/migrations.py` | Revisar cada bloque: reemplazar `PRAGMA` por `information_schema`. Verificar que `ADD COLUMN IF NOT EXISTS` funcione en Postgres. |
| `.env.example` | Marcar `DATABASE_URL` como obligatorio, con ejemplo `postgresql+asyncpg://...`. |
| `CLAUDE.md` | Actualizar línea DB: "PostgreSQL vía docker-compose en dev y Railway en prod." |

### Verificación

```bash
docker-compose up -d postgres
cd backend && uvicorn main:app --reload --loop asyncio --port 8000
# Confirmar: registro → login → sync → trades visibles en Postgres
```

Correr skill `migration-writer` antes de commit si se añaden migraciones nuevas.

---

## Fase 3 — Deploy Railway ✅

**URL de producción**: `https://trading-journal-lleb-web-app-production.up.railway.app`

### Archivos modificados / creados

| Archivo | Cambio real |
|---------|-------------|
| `Dockerfile` (raíz) | Multi-stage: `node:20-alpine` build frontend → `python:3.12-slim` + `COPY --from=frontend-builder /frontend/dist /frontend/dist`. CMD shell form con `${PORT:-8000}`. |
| `railway.json` | Builder DOCKERFILE, healthcheckPath `/api/health`. Sin `startCommand` (CMD del Dockerfile lo maneja). |
| `.github/workflows/ci.yml` | Job `test` (pytest + Postgres 16 service), job `build` (Docker smoke). |
| `tj-connector/api.py` | Dominio real Railway en `_WEB_APP_ORIGINS`. |
| `.gitignore` | `lib/` → `/lib/` (raíz); `frontend/src/lib/` se estaba ignorando y el build de Railway fallaba. |

### Variables configuradas en Railway

| Variable | Cómo |
|----------|------|
| `DATABASE_URL` | Auto-inyectada por addon Postgres — NO configurar manualmente |
| `JWT_SECRET` | `python -c "import secrets; print(secrets.token_hex(32))"` |
| `FERNET_KEY` | `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| `ALLOWED_ORIGINS` | `https://trading-journal-lleb-web-app-production.up.railway.app` |
| `ENVIRONMENT` | `production` |

GitHub Actions CI requiere secret `FERNET_KEY_CI` en Settings → Secrets del repo.

### Hotfixes post-deploy (commit `34438d3`)

Dos bugs encontrados al probar login en producción:

1. **`backend/auth_middleware.py`** — exempt prefix `/api/auth/` incluía `/api/auth/me`, que requiere JWT. `request.state.user_id` nunca se inyectaba → 401 permanente → loop clearAuthTokens + reload. Fix: narrowed a `login`, `register`, `refresh` únicamente.
2. **`frontend/src/App.tsx`** — hooks (`useTheme`, `useQuery` × 2, `useState` × 3, etc.) se llamaban después de `if (!isAuthenticated) return <LoginPage/>`. Al hacer login, React detectaba distinto número de hooks entre renders → pantalla en blanco. Fix: split en `App` (auth gate) + `AppContent`.

---

## Fase 4 — Canal de distribución TJ Connector ⏳

**Objetivo**: usuarios pueden descargar el Connector desde la web app (sin instrucciones manuales).

### Archivos a crear/modificar

| Archivo | Cambio |
|---------|--------|
| `.github/workflows/release-connector.yml` (nuevo) | En tags `connector-v*`: build macOS + Windows con PyInstaller. macOS: firmar + notarizar. Publicar en GitHub Releases. |
| `backend/routers/downloads.py` (nuevo) | `GET /api/downloads/connector/latest?platform=mac\|win` → 302 al asset de la última Release. Exento de auth. |
| `backend/main.py` | Registrar router `downloads`. Agregar `/api/downloads/*` a exentos en `auth_middleware.py`. |
| `frontend/src/components/ui/IBKRConnectionError.tsx` | Detectar plataforma, ofrecer link a `/api/downloads/connector/latest?platform=X`. |

### Verificación

- Tag `connector-v0.3.0` → GitHub Actions build y publica artefacto.
- `GET /api/downloads/connector/latest?platform=mac` → 302 al artefacto correcto.
- UI muestra botón de descarga cuando Connector no detectado.

---

## Checklist pre-release (resumen)

- [ ] `tenant-isolation-check` y `ibkr-safety-audit` sin hallazgos.
- [ ] Migraciones testeadas contra DB v(N-1).
- [ ] `ALLOWED_ORIGINS` = dominio real.
- [ ] `ENVIRONMENT=production`.
- [ ] `JWT_SECRET` y `FERNET_KEY` NO rotados en este release.
- [ ] Connector firmado/notarizado si hubo cambios.
- [ ] Sin logs de tokens, passwords o JWTs en el diff.
