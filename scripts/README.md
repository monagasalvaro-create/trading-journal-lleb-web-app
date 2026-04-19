# scripts/

Utilidades de desarrollo, build y mantenimiento operativo. No forman parte del runtime de producción — el backend y el frontend no las importan.

## Runtime helpers

- `run_app.py` — lanzador legacy de desktop (PyInstaller). Arranca el backend en un thread y abre el navegador. Solo para testing local del bundle; en producción Railway corre `uvicorn main:app` directo.
- `build_app.py` — build orquestador para PyInstaller.
- `setup_macos.sh` — setup inicial de entorno en macOS.

## Migrations y mantenimiento de DB

Scripts históricos de migración/backfill. El flujo oficial de schema vive en `backend/migrations.py` (versionado, idempotente). Usa los de aquí solo si necesitas repetir una migración manual en una DB específica.

- `migrate_db.py`
- `migrate_add_date_column.py`
- `migrate_add_notes.py`
- `fix_db.py`

## Otros

- `check_api.py` — smoke test manual contra la API local.
- `version.py` — helpers de versionado para el bundle.

## Convenciones

- Cada script debe poder ejecutarse desde la raíz del repo con `python scripts/<name>.py`.
- No agregar imports relativos a backend/ dentro de scripts — si necesitas lógica del backend, importa el módulo completo (`from backend.models import ...`) con el `sys.path` apuntando a la raíz.
