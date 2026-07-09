# OTA — canal DÉDIÉ à la variante `boitier_marc`

⚠️ **Canal séparé du firmware public.** Ce dossier ne sert **qu'au boîtier de Marc**
(variante `boitier_marc` : Mode Bien-être avec les 12 protocoles d'harmonisation
en plus). Le firmware `boitier_marc` a `OTA_BASE = https://aura-lis.ca/ota-marc`
et **ne regarde jamais** `/ota` (le firmware public).

- `firmware.bin` — dernière version de **boitier_marc** (export `boitier_marc.ino.bin`, PAS `.merged.bin`).
- `version.txt` — entier encodé de la version marc (`major*10000 + minor*100 + patch`).

## Numérotation (indépendante du public)
Le canal marc a sa **propre suite** de versions, distincte du public `6.x` (~60000).
Départ : **`10100`** (affiché « marc-1.1 »). Pour publier une nouvelle version marc :
1. Dans `boitier_marc.ino` : bump `FW_VERSION` (ex. `10200`) + `FW_VERSION_STR` (« marc-1.2 »).
2. Compiler, copier `boitier_marc.ino.bin` ici en `firmware.bin`.
3. Mettre le nouveau numéro dans `version.txt` (ex. `10200`).
4. `git push` → Cloudflare republie → le boîtier de Marc voit la MAJ.

## ⛔ Ne JAMAIS mélanger avec /ota
- Ne pas copier le firmware public ici (Marc perdrait ses 12 protocoles).
- Ne pas copier `boitier_marc` dans `/ota` (les boîtiers normaux recevraient les protocoles maladies, dont cancer).
