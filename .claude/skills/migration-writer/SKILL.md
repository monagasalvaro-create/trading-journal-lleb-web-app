---
name: migration-writer
description: Use when adding a new database migration to backend/migrations.py. Guides through writing additive, idempotent migrations that preserve legacy data. Ensures SCHEMA_VERSION is bumped correctly and the change is backward-compatible with DB v(N-1).
---

# Migration Writer

Las migraciones en Trading Journal Pro son **aditivas e idempotentes**. Nunca se borra una columna, nunca se reescribe una tabla, nunca se modifica una migración pasada. Este es un producto en venta con datos reales.

## Pre-requisitos antes de escribir

1. Lee el final de `backend/migrations.py` para identificar la `SCHEMA_VERSION` actual (ej. `7`).
2. Lee `backend/models.py` para ver el modelo ORM que refleja el estado futuro.
3. Confirma que la columna o tabla nueva NO rompe queries existentes.

## Template de migración

```python
# En backend/migrations.py, al final de la cadena de if-blocks:
if current_version < N:  # Donde N es SCHEMA_VERSION actual + 1
    logger.info(f"Applying migration v{N}: <descripción corta>")
    
    # Idempotencia: check si la columna ya existe
    result = await conn.execute(text("""
        SELECT COUNT(*) FROM pragma_table_info('<tabla>')
        WHERE name = '<columna_nueva>'
    """))
    exists = result.scalar() > 0
    
    if not exists:
        await conn.execute(text("""
            ALTER TABLE <tabla>
            ADD COLUMN <columna_nueva> <TIPO> DEFAULT <valor_default> NOT NULL
        """))
    
    current_version = N
    await conn.execute(text(f"UPDATE schema_version SET version = {N}"))
```

## Reglas obligatorias

1. **`DEFAULT` siempre**: las filas existentes necesitan un valor. Para `user_id`, usar `'system'`. Para flags booleanos, un valor explícito (`0` o `1`). Para strings opcionales, `''` o `NULL` si la columna es nullable.
2. **Idempotencia**: la migración debe ser corrible dos veces sin fallar. Usar `pragma_table_info` para verificar columnas existentes antes del `ALTER`.
3. **No tocar `models.py` antes de escribir la migración**: los dos deben ser coherentes, pero si agregas la columna al ORM sin migrar, la app crashea en boot contra DB vieja.
4. **Nunca `DROP COLUMN`**: soft-deprecate. Si la columna debe desaparecer, primero deja de usarla, en una release posterior se evalúa.
5. **Nunca modificar una migración pasada**: si te equivocaste en v5, escribe v8 que arregla el error.
6. **PostgreSQL compatibility**: las migraciones deben correr en ambos dialects. Usa sintaxis ANSI SQL cuando sea posible. Para chequeos de columna, adapta: `pragma_table_info` (SQLite) vs `information_schema.columns` (PostgreSQL). Ya hay helper en `migrations.py`, reusarlo.

## Checklist antes de commit

- [ ] `SCHEMA_VERSION` incrementada en la cabecera del archivo.
- [ ] Migración tiene check de idempotencia (correr dos veces = no-op la segunda).
- [ ] `DEFAULT` explícito para filas existentes.
- [ ] `models.py` actualizado en el MISMO commit.
- [ ] Probado localmente: borrar `trading_journal.db`, arrancar backend contra DB limpia y verificar boot OK.
- [ ] Probado localmente: arrancar con una DB de la versión anterior y confirmar upgrade sin errores.
- [ ] Si la columna almacena datos sensibles (token, password), pasa por `crypto.encrypt()` al escribir.

## Uso de esta skill

1. El usuario invoca `/migration-writer` y describe el cambio (ej. "añadir columna `is_archived` a Trade").
2. Leo `migrations.py` para determinar la próxima versión.
3. Genero el bloque de migración siguiendo el template.
4. Genero la edición correspondiente en `models.py`.
5. Listo el checklist a correr antes del commit.

No ejecuto la migración automáticamente — entrego el código y el usuario confirma.
