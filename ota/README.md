# OTA — mises à jour du firmware Auralis

Ce dossier héberge les mises à jour du firmware, servies par Cloudflare en **HTTPS** :

- `firmware.bin` — le binaire de la dernière version (export « Auralis_v2.ino.bin » de l'IDE, **pas** le `.merged.bin`).
- `version.txt` — un simple nombre = numéro de la dernière version (doit correspondre à `FW_VERSION` du firmware).

URL utilisées par l'appareil (`OTA_BASE` = `https://aura-lis.ca/ota`) :
- `https://aura-lis.ca/ota/version.txt`
- `https://aura-lis.ca/ota/firmware.bin`

## Publier une mise à jour (avec l'IDE)
1. Dans l'IDE : bump `FW_VERSION`, **Croquis → Exporter les binaires compilés**.
2. Copier `Auralis_v2/build/esp32.esp32.esp32s3/Auralis_v2.ino.bin` ici en `firmware.bin`.
3. Mettre le nouveau numéro dans `version.txt`.
4. `git push` → Cloudflare republie → les appareils voient la nouvelle version.

## Publier sans l'IDE (headless, à distance) — validé 2026-07-01
1. Bump `FW_VERSION` dans `Auralis_v2.ino`.
2. Compiler avec `arduino-cli` (binaire standalone, réutilise le core + libs de l'IDE) :
   - FQBN = champ `fqbn` de `Auralis_v2/build/esp32.esp32.esp32s3/build.options.json`
     (clés critiques : `FlashSize=16M, PartitionScheme=min_spiffs, PSRAM=opi`).
   - Env : `ARDUINO_DIRECTORIES_DATA=…/AppData/Local/Arduino15`, `ARDUINO_DIRECTORIES_USER=…/Documents/Arduino`.
   - `arduino-cli compile --fqbn "<fqbn>" --build-path <out> <sketchdir>` (⚠️ **ne PAS** passer `--libraries` :
     bute sur le dossier parasite `libraries/Arduino` → erreur trompeuse « instance is no longer valid »).
3. Copier `<out>/Auralis_v2.ino.bin` ici en `firmware.bin`, `version.txt` = nouveau numéro, `git push`.

## ⚠️ Pièges
- **Cache négatif Cloudflare** : si `version.txt` est interrogé **avant** que le déploiement soit fini, le 404
  est mis en cache et l'URL canonique reste 404 quelques minutes (l'URL avec `?t=...` répond 200). Attendre / re-tester.
- **Vieux firmware** : un boîtier dont `OTA_BASE` pointait encore vers une IP locale ne verra pas la MAJ → un dernier reflash câble.

## Historique
- **v6** (2026-07-01) — 1ʳᵉ publication PROD. Ajout fréquence **432 Hz** (« Accord 432 Hz ») au mode Chakras. Compilé headless (arduino-cli), bin octet-identique à un export IDE.
