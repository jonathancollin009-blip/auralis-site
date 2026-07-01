# OTA — mises à jour du firmware Auralis

Ce dossier héberge les mises à jour du firmware, servies par Cloudflare en **HTTPS** :

- `firmware.bin` — le binaire de la dernière version (export « Auralis_v2.ino.bin » de l'IDE, **pas** le `.merged.bin`).
- `version.txt` — un simple nombre = numéro de la dernière version (doit correspondre à `FW_VERSION` du firmware).

URL utilisées par l'appareil (`OTA_BASE` = `https://aura-lis.ca/ota`) :
- `https://aura-lis.ca/ota/version.txt`
- `https://aura-lis.ca/ota/firmware.bin`

## Publier une mise à jour
1. Dans l'IDE : bump `FW_VERSION`, **Croquis → Exporter les binaires compilés**.
2. Copier `Auralis_v2/build/esp32.esp32.esp32s3/Auralis_v2.ino.bin` ici en `firmware.bin`.
3. Mettre le nouveau numéro dans `version.txt`.
4. `git push` → Cloudflare republie → les appareils voient la nouvelle version.
