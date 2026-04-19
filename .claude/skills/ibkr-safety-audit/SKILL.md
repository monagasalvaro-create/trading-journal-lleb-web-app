---
name: ibkr-safety-audit
description: Use before releasing the TJ Connector or merging any PR that touches backend/ibkr_*.py, backend/routers/sync.py, or tj-connector/*.py. Scans for any use of ib_insync write APIs (placeOrder, cancelOrder, modifyOrder, etc.) that would violate the read-only promise in privacy_disclosure.md.resolved.
---

# IBKR Safety Audit

La promesa de `privacy_disclosure.md.resolved` es explícita: **Trading Journal Pro jamás puede operar en la cuenta IBKR de un usuario**. Esta promesa se sostiene estructuralmente — el código simplemente no contiene las APIs de escritura de `ib_insync`. Si alguna vez aparece una, el contrato con el usuario se rompe.

## Cuándo ejecutarse

- Antes de cada release del Connector (obligatorio).
- Tras cualquier PR que añada imports nuevos de `ib_insync`.
- Tras tocar `tj-connector/ibkr_bridge.py`, `tj-connector/strike_engine.py`, `backend/ibkr_account.py`, `backend/ibkr_positions.py`, `backend/strike_calculator.py`.

## APIs de escritura a detectar

Las siguientes funciones de `ib_insync` pueden colocar, modificar o cancelar órdenes, o transferir posiciones/fondos. **Ninguna** debe aparecer en el código:

- `placeOrder` — colocar orden
- `cancelOrder` — cancelar orden
- `modifyOrder` — modificar orden
- `reqGlobalCancel` — cancelar todas las órdenes
- `exerciseOptions` — ejercer opciones
- `transferPosition` — transferir posición entre cuentas
- `placeOrderAsync` — variante async
- `reqAccountUpdates(True, ...)` con flag de suscripción (ambiguo, revisar caso)

## Procedimiento

1. Correr grep recursivo en los paths objetivo:
   ```
   grep -rnE "\b(placeOrder|cancelOrder|modifyOrder|reqGlobalCancel|exerciseOptions|transferPosition|placeOrderAsync)\b" tj-connector/ backend/ibkr_*.py backend/routers/sync.py backend/routers/portfolio.py backend/strike_calculator.py backend/fetch_live_portfolio.py backend/routers/strike_calculator.py backend/routers/assets.py
   ```
2. Para cada hit, reportar:
   - Archivo y línea.
   - Contexto (3 líneas arriba y abajo).
   - Si es código muerto (import sin uso), comentado, o activo.
3. Verificar también que los métodos `IB()` creados NO asignen `clientId` con permiso de trading (por default `ib_insync` conecta en read-only si el usuario así configuró TWS).
4. Confirmar que `CORS` del Connector está restringido a dominios específicos (nunca `allow_origins=["*"]` en `tj-connector/api.py`).
5. Confirmar que el Connector bindea solo `127.0.0.1` — grep por `host="0.0.0.0"` o `host='0.0.0.0'` debe retornar cero.

## Output esperado

- **Sin hallazgos** (estado normal): `✅ IBKR Safety: OK. 0 write-APIs detectadas. Connector bindeado a 127.0.0.1. CORS restrictivo confirmado.`
- **Con hallazgos**: lista estructurada con severidad **crítica** para cualquier API de escritura, y **alta** para `host=0.0.0.0` o CORS abierto.

## Qué hacer si aparece un hallazgo

1. **No mergear**. La regla no-negociable #5 es bloqueante.
2. Si la API de escritura existe por error (import sin uso), removerla.
3. Si existe intencionalmente, la funcionalidad está fuera del alcance del producto — requiere decisión de producto, actualización de `privacy_disclosure.md.resolved`, y aviso a los usuarios pagando.
4. Bajo ninguna circunstancia se aprueba como "hotfix temporal".
