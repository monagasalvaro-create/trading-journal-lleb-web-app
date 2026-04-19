---
description: how to sign, verify, and notarize the macOS application for distribution
---

# Workflow: Firmar, Verificar y Notarizar la Aplicación macOS

## Contexto y Lecciones Aprendidas

Este workflow incorpora lecciones críticas aprendidas en sesiones anteriores. El error más común es intentar firmar la `.app` desde su ubicación original en el Desktop o en la carpeta `dist/`. macOS inyecta automáticamente metadatos Finder (`com.apple.FinderInfo`, `com.apple.provenance`) a archivos ubicados en carpetas del usuario (Desktop, Documentos, Downloads). Esto hace que `codesign --verify --strict` falle con el error:
```
resource fork, Finder information, or similar detritus not allowed
```
**La solución siempre es copiar la `.app` a `/tmp/` antes de firmar.**

---

## Variables de Referencia

```
DEVELOPER_ID  = "Developer ID Application: Alvaro Monagas (L89CBD4HM5)"
TEAM_ID       = "L89CBD4HM5"
APPLE_ID      = "monagasalvaro@gmail.com"
ENTITLEMENTS  = "/Users/alfredomonagasalvarez/Desktop/TJ/Trading Journal 02/TradingJournal/entitlements.plist"
APP_SOURCE    = "/Users/alfredomonagasalvarez/Desktop/TJ/Trading Journal 02/TradingJournal/dist/TradingJournalPro.app"
TEMP_DIR      = "/tmp/notarize_tj"
KEYCHAIN_PROF = "TJ LLELB"
```

---

## PASO 1: Compilar la Aplicación

```bash
cd "/Users/alfredomonagasalvarez/Desktop/TJ/Trading Journal 02/TradingJournal"
python3 build_app.py --target macos
```

- El resultado estará en `dist/TradingJournalPro.app`.
- PyInstaller intentará firmar automáticamente, pero puede fallar. No importa; la firma se rehará en el Paso 3.

---

## PASO 2: Copiar a /tmp/ (OBLIGATORIO)

> [!CAUTION]
> Nunca omitas este paso. Firmar directamente en `dist/` o en el Desktop **siempre falla** con el error de metadatos Finder.

```bash
# Limpiar cualquier sesión anterior
rm -rf /tmp/notarize_tj

# Copiar la app al directorio temporal limpio
mkdir -p /tmp/notarize_tj
cp -R "/Users/alfredomonagasalvarez/Desktop/TJ/Trading Journal 02/TradingJournal/dist/TradingJournalPro.app" /tmp/notarize_tj/

# Eliminar TODOS los atributos extendidos de macOS
find /tmp/notarize_tj/TradingJournalPro.app -print0 | xargs -0 xattr -c
```

---

## PASO 3: Firmar con Hardened Runtime (OBLIGATORIO para Notarización)

```bash
/usr/bin/codesign \
  -s "Developer ID Application: Alvaro Monagas (L89CBD4HM5)" \
  --force \
  --deep \
  --all-architectures \
  --timestamp \
  --options=runtime \
  --entitlements "/Users/alfredomonagasalvarez/Desktop/TJ/Trading Journal 02/TradingJournal/entitlements.plist" \
  /tmp/notarize_tj/TradingJournalPro.app
```

> [!NOTE]
> `--options=runtime` es lo que activa el **Hardened Runtime**. Sin este flag, Apple rechaza la notarización inmediatamente. `--timestamp` requiere conexión a internet.

---

## PASO 4: Verificar la Firma

```bash
/usr/bin/codesign -vvv --deep --strict /tmp/notarize_tj/TradingJournalPro.app
```

**Resultado esperado al final:**
```
TradingJournalPro.app: valid on disk
TradingJournalPro.app: satisfies its Designated Requirement
```

Si aparece `resource fork, Finder information, or similar detritus not allowed`, regresar al Paso 2 y limpiar los atributos de nuevo.

---

## PASO 5: Crear el ZIP para Notarización

> [!IMPORTANT]
> Usar `ditto`, **no** `zip`. El comando `zip` no preserva los resource forks de macOS correctamente.

```bash
ditto -c -k --keepParent \
  /tmp/notarize_tj/TradingJournalPro.app \
  /tmp/notarize_tj/TradingJournalPro.zip
```

---

## PASO 6: Enviar a Notarización de Apple

Se puede usar el **Keychain Profile** (recomendado) o credenciales directas.

### Opción A — Con Keychain Profile (más seguro):
```bash
xcrun notarytool submit /tmp/notarize_tj/TradingJournalPro.zip \
  --keychain-profile "TJ LLELB" \
  --wait
```

### Opción B — Con credenciales directas:
```bash
xcrun notarytool submit /tmp/notarize_tj/TradingJournalPro.zip \
  --apple-id "monagasalvaro@gmail.com" \
  --password "<APP_SPECIFIC_PASSWORD>" \
  --team-id "L89CBD4HM5" \
  --wait
```

> [!NOTE]
> La contraseña de Apple ID no funciona aquí. Hay que usar una **App-Specific Password** generada en [appleid.apple.com](https://appleid.apple.com) → Seguridad → Contraseñas de aplicación. La contraseña usada anteriormente fue `wgfy-vgfq-hqko-nnqe` (puede haber expirado).

**Guardar el `id` del envío que devuelva Apple.**

---

## PASO 7: Monitorear el Estado

Si se interrumpe el `--wait`, revisar el estado con:

```bash
xcrun notarytool info <SUBMISSION_ID> --keychain-profile "TJ LLELB"
```

O revisar el historial completo:

```bash
xcrun notarytool history --keychain-profile "TJ LLELB"
```

**Estados posibles:**
- `In Progress` → Apple está procesando. Esperar (normalmente 5-15 min, raramente horas).
- `Accepted` → ¡Éxito! Proceder al Paso 8.
- `Invalid` → Apple rechazó la firma. Ver los logs con `xcrun notarytool log <ID>` para obtener detalles.

> [!WARNING]
> Si el status dice `In Progress` por **más de 2 horas**, verificar en [appstoreconnect.apple.com](https://appstoreconnect.apple.com) si hay un aviso de **"Accept Updated License Agreement"**. Esto es la causa #1 de que Apple deje los envíos en espera infinita.

---

## PASO 8: Grapar el Ticket (Staple)

Una vez que Apple devuelva `status: Accepted`:

```bash
xcrun stapler staple /tmp/notarize_tj/TradingJournalPro.app

# Verificar que el staple fue exitoso
xcrun stapler validate /tmp/notarize_tj/TradingJournalPro.app
```

**Resultado esperado:**
```
The staple and validate action worked!
```

---

## PASO 9: Copiar la App Final a dist/

```bash
rm -rf "/Users/alfredomonagasalvarez/Desktop/TJ/Trading Journal 02/TradingJournal/dist/TradingJournalPro.app"
cp -R /tmp/notarize_tj/TradingJournalPro.app \
  "/Users/alfredomonagasalvarez/Desktop/TJ/Trading Journal 02/TradingJournal/dist/"
```

---

## PASO 10 (Opcional): Crear DMG para Distribución

```bash
hdiutil create \
  -volname "TradingJournalPro" \
  -srcfolder "/Users/alfredomonagasalvarez/Desktop/TJ/Trading Journal 02/TradingJournal/dist/TradingJournalPro.app" \
  -ov -format UDZO \
  "/Users/alfredomonagasalvarez/Desktop/TJ/Trading Journal 02/TradingJournal/dist/TradingJournalPro.dmg"
```

El DMG también puede notarizarse repitiendo los Pasos 6-8 usando el `.dmg` en lugar del `.zip`.

---

## Bypass para Uso Local (Sin Notarización)

Si la app es solo para uso propio y no se necesita distribuir a otros, se puede saltar la notarización:

```bash
# Quitar la cuarentena de macOS
xattr -d com.apple.quarantine "/Users/alfredomonagasalvarez/Desktop/TJ/Trading Journal 02/TradingJournal/dist/TradingJournalPro.app"
```

O bien: **Click derecho sobre la .app → Abrir → Abrir** (solo la primera vez).

---

## Checklist Rápido

- [ ] Compilar con `build_app.py`
- [ ] Copiar a `/tmp/notarize_tj/`
- [ ] Limpiar xattrs con `find ... | xargs -0 xattr -c`
- [ ] Firmar con `--options=runtime --timestamp --entitlements`
- [ ] Verificar con `codesign -vvv --deep --strict`
- [ ] Crear ZIP con `ditto`
- [ ] Enviar con `notarytool submit --wait`
- [ ] Ejecutar `stapler staple` cuando Apple devuelva `Accepted`
- [ ] Copiar la app grapada de vuelta a `dist/`
