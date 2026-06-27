# Auralis — Site vitrine

Site vitrine d'Auralis (générateur de fréquences bien-être), déployé sur **Cloudflare Pages** → https://aura-lis.ca

Site **statique** (HTML/CSS/JS, sans build) :

| Fichier | Rôle |
|---|---|
| `index.html` | Page d'accueil (hero, concept, modes, aperçu fréquences, méthode, FAQ, communauté) |
| `frequences.html` | Catalogue des molécules / fréquences (bilingue FR/EN) |
| `protocoles.html` | Protocoles bien-être (bilingue FR/EN) |
| `css/style.css` | Thème cosmique |
| `js/main.js` | Menu mobile + bascule de langue (FR/EN) |
| `images/` | Visuels |

## Déploiement
Cloudflare Pages connecté à ce dépôt GitHub → chaque `push` sur `main` republie le site automatiquement.
Pas de commande de build (site statique), répertoire de sortie = racine.

## ⚠️ Cadrage santé
Auralis est un appareil de **bien-être / relaxation**, pas un dispositif médical. Aucune allégation de diagnostic/traitement/guérison. Disclaimer présent dans le pied de page et la FAQ.
