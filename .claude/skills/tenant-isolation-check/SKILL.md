---
name: tenant-isolation-check
description: Use when reviewing diffs or new routers that query models with user_id column (Trade, Settings, AccountEquity, AssetBoardItem, BoardNote). Scans for SQLAlchemy queries missing .where(Model.user_id == user_id) filters. Critical security check before any PR that touches backend/routers/ or backend/models.py.
---

# Tenant Isolation Check

Trading Journal Pro es multi-tenant: cada usuario tiene su propio `user_id` y **jamás** puede ver datos de otros usuarios. La regla no-negociable #1 del proyecto exige que todo query a tablas con `user_id` filtre por él. Un olvido = leak entre clientes pagando.

## Cuándo ejecutarse

- Cambios en `backend/routers/*.py` (excepto `auth.py` que es intencionalmente user-agnostic pre-login).
- Cambios en `backend/models.py` que añaden nuevas tablas.
- Nuevos imports de `select()`, `insert()`, `update()`, `delete()` desde SQLAlchemy.
- Cualquier función nueva que reciba `user_id` como parámetro.

## Modelos con columna `user_id` (a la fecha)

- `Trade`
- `Settings`
- `AccountEquity`
- `AssetBoardItem`
- `BoardNote`

Si se añade otro modelo con `user_id` en `migrations.py`, agregarlo a esta lista.

## Procedimiento

1. Identifica el scope del review: archivos cambiados en el diff, o archivos nombrados por el usuario.
2. Para cada archivo `.py` en scope, busca:
   - `select(<Model>)` sin un `.where(<Model>.user_id == user_id)` subsecuente en la misma cadena.
   - `session.query(<Model>)` (legacy, no debería existir) sin filtro user_id.
   - `update(<Model>)` o `delete(<Model>)` sin filtro user_id.
   - Joins multi-tabla donde al menos una tabla tiene `user_id` pero no se filtra.
3. Para cada hallazgo, reporta:
   - Archivo y línea.
   - Snippet del query.
   - Severidad: **crítica** si es endpoint público, **alta** si es helper interno.
   - Fix sugerido: la línea exacta con `.where(...)` añadida.
4. Reporta también falsos positivos conocidos (endpoints admin, scripts de migración) para distinguir.

## Ejemplo de query problemática

```python
# MAL — cualquier user ve todos los trades
stmt = select(Trade).where(Trade.account_id == account_id)
result = await session.execute(stmt)
```

```python
# BIEN
stmt = select(Trade).where(
    Trade.user_id == user_id,
    Trade.account_id == account_id
)
result = await session.execute(stmt)
```

## Output esperado

Formato Markdown con secciones por severidad. Si no hay hallazgos, confirmar: `✅ Tenant isolation: OK. N archivos revisados, K queries validadas.`

Al final siempre recordar: este check NO reemplaza tests de aislamiento. Idealmente cada endpoint nuevo tiene un test `test_<endpoint>_isolation` que registra dos usuarios y verifica que el user B no ve datos del user A.
