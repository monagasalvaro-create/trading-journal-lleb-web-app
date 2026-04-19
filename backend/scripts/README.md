# backend/scripts/

Scripts ad-hoc del backend: checks, verificaciones y fixups que no forman parte del runtime. No los importa ningún router ni módulo de negocio.

## Verificación de datos

- `check_dates.py` — auditoría de fechas en tabla `trades`.
- `check_schema.py` — inspección del esquema SQL actual.
- `verify_dates.py`, `verify_specific.py`, `verify_trades.py` — validadores manuales.
- `query_trades.py` — query libre contra la DB.

## Fixups

- `fix_nav_dates.py` — parche puntual de fechas NAV en registros de equity.

## Uso

Ejecutar desde la raíz del proyecto:

```bash
cd backend
python scripts/check_dates.py
```

Requieren que `DATABASE_URL` esté seteado (o una DB local accesible).

## No confundir

`backend/fetch_live_portfolio.py` **no** es un script — es un módulo importado por `backend/routers/portfolio.py` para exponer el portfolio live del Connector. Mantener en `backend/`.
