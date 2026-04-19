---
name: release-connector
description: Use when preparing a new build of TJ Connector for distribution on macOS or Windows. Guides through PyInstaller build, codesigning, notarization, and antivirus-friendly packaging following sign-and-export-macos.md.
---

# Release Connector

El TJ Connector es un binario que el usuario instala en su máquina. Un build mal firmado = Gatekeeper bloquea la app en macOS, o antivirus lo marca como sospechoso en Windows. Este skill guía el proceso completo.

## Pre-requisitos

- Python 3.12.12 activo en el entorno.
- Dependencias de `tj-connector/requirements.txt` instaladas.
- Icono oficial en `icons/app.icns` (macOS) o equivalente `.ico` (Windows).
- **macOS**: Apple Developer ID válido, Xcode CLI tools, credenciales `notarytool` configuradas.
- **Windows**: certificado de firma (Authenticode). Opcional, pero mejora trust score con antivirus.

## Procedimiento para macOS (canónico)

Seguir `sign-and-export-macos.md` al pie. Puntos críticos que este skill refuerza:

### 1. Build con PyInstaller
```bash
cd tj-connector
pyinstaller connector.spec
# Produce dist/TJ_Connector.app
```
Verificar el resultado: el `.app` debe ser < 40MB. Si excede, hay imports sueltos (revisar `hiddenimports`).

### 2. Copiar a /tmp/ antes de firmar
```bash
cp -R dist/TJ_Connector.app /tmp/TJ_Connector.app
```
**Razón crítica** (ver `TECHNICAL_LOG.md`): macOS inyecta "Finder Info" metadata en carpetas de usuario (Desktop, Downloads). Estos metadatos rompen codesign. Firmar desde `/tmp/` elimina el problema.

### 3. Firmar con Hardened Runtime
```bash
codesign --force --deep --sign "Developer ID Application: <TU NOMBRE>" \
  --options=runtime \
  --entitlements tj-connector/entitlements.plist \
  /tmp/TJ_Connector.app
```
- `--options=runtime`: activa Hardened Runtime (Apple lo exige para notarización).
- `--entitlements`: permite JIT + red local, sin esto `ib_insync` no puede abrir el socket a TWS.

### 4. Notarizar con notarytool
```bash
# Comprimir primero
ditto -c -k --keepParent /tmp/TJ_Connector.app /tmp/TJ_Connector.zip

# Enviar a Apple
xcrun notarytool submit /tmp/TJ_Connector.zip \
  --keychain-profile "<TU PERFIL>" \
  --wait
```
Si Apple rechaza, leer el log JSON — típicamente es un binario nested sin firmar. Firmarlo y reintentar.

### 5. Staple del ticket
```bash
xcrun stapler staple /tmp/TJ_Connector.app
```
Esto embebe el ticket de notarización en el `.app`, permitiendo que funcione offline la primera vez.

### 6. Empaquetar para distribución
Crear un `.dmg` con `create-dmg` o similar. Evitar `.zip` directos: Gatekeeper los trata con más sospecha.

## Procedimiento para Windows

### 1. Build con PyInstaller
```bash
cd tj-connector
pyinstaller connector.spec
# Produce dist\TJ_Connector.exe
```

### 2. Firmar (opcional pero recomendado)
```bash
signtool sign /fd SHA256 /a /t http://timestamp.digicert.com dist\TJ_Connector.exe
```
Sin firma Authenticode, SmartScreen muestra advertencia "editor desconocido" al usuario.

### 3. Verificar antivirus-friendliness
- Subir a `virustotal.com` antes de distribución. Esperar 0-2 detecciones (algunos heurísticos flagean PyInstaller siempre). Si > 3, revisar dependencias.
- Si aparece flag de Windows Defender, submitir a Microsoft para whitelist.

### 4. Instalador
Construir instalador con `Inno Setup` o `NSIS`. Incluir uninstaller limpio (debe borrar la carpeta `%APPDATA%\TradingJournalPro\.encryption_key` opcionalmente, preguntando al usuario).

## Verificación post-build

Antes de distribuir:

- [ ] Corrida limpia: abrir el Connector en una máquina sin Python instalado → arranca, abre el navegador, aparece en system tray.
- [ ] Detección correcta: la web app detecta el Connector vía `GET localhost:8765/status`.
- [ ] Datos live: con TWS abierto, el portfolio muestra posiciones reales.
- [ ] `/ibkr-safety-audit` corrido en el código fuente sin hallazgos.
- [ ] Versión bumpeada en `tj-connector/main.py` y en el payload de `/status`.
- [ ] CHANGELOG del Connector actualizado.
- [ ] Release en GitHub con los binarios firmados, no con los raw de PyInstaller.

## Troubleshooting común

- **"TJ_Connector.app is damaged"**: la app fue descargada vía browser que inyectó quarantine bit. En la primera apertura, clic derecho → "Open". O correr `xattr -dr com.apple.quarantine /Applications/TJ_Connector.app`.
- **Socket refused a TWS**: el usuario tiene TWS cerrado o puerto custom. El Connector no puede adivinar — mostrar error claro con el puerto configurado.
- **Notarytool "invalid signature"**: hay un binario nested (típicamente `.dylib` en `Frameworks/`) sin firmar. Firmar recursivamente antes del zip.
