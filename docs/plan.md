# Plan de producción — Trading Journal Pro

Hoja de ruta para convertir la app de escritorio/demo en SaaS web para 50–100 usuarios.
Actualizar el estado de cada fase al completarla.

---

## Estado actual

| Fase | Estado | Commit(s) |
|------|--------|-----------|
| Fase 1 — Reorganización de archivos | ✅ Completada | `7d9c4dc`, `7a006ed`, `859d60b` |
| Fase 2 — PostgreSQL único | ✅ Completada | ver commits de Fase 2 |
| Fase 3 — Deploy Railway | ⏳ Pendiente | — |
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

## Fase 2 — PostgreSQL único ⏳

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

## Fase 3 — Deploy Railway ⏳

**Objetivo**: app corriendo en Railway con Postgres addon, frontend servido por el mismo proceso.

### Archivos a crear/modificar

| Archivo | Cambio |
|---------|--------|
| `railway.json` (nuevo) | Builder DOCKERFILE, startCommand uvicorn, healthcheckPath `/api/health`. |
| `backend/Dockerfile` | Multi-stage: stage 1 build frontend (node), stage 2 Python copia `dist/`. |
| `.github/workflows/ci.yml` (nuevo) | Job `test` (pytest + Postgres service), job `build` (Docker smoke), job `deploy` (Railway webhook en push a main). |
| `tj-connector/api.py` | CORS include dominio Railway en `ALLOWED_ORIGINS`. |

### Variables Railway a configurar

- `DATABASE_URL` — inyectada automáticamente por addon Postgres.
- `JWT_SECRET` — `secrets.token_hex(32)`.
- `FERNET_KEY` — `Fernet.generate_key()`.
- `ALLOWED_ORIGINS` — dominio real (ej. `https://app.tradingjournalpro.com`).
- `ENVIRONMENT=production`.

### Verificación

```bash
railway up  # desde rama staging
curl https://<staging>.up.railway.app/api/health  # → {"status":"ok"}
```

Correr skill `security-reviewer-tj` sobre el diff completo antes de merge a main.

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
