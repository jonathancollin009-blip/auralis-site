# Abonnement web annuel — aura-lis.ca/app

Version ordinateur de l'app, 29,99 $/an, renouvellement automatique, 2 appareils max.
Code : `web-auth.js` (Worker), `connexion.html`, `compte.html`, `css/compte.css`, `migrations/`.

## Fonctionnement

- **Connexion** : courriel → code à 6 chiffres (Resend) → cookie de session 180 jours.
- **Limite** : 2 appareils ; une 3ᵉ connexion déconnecte la plus ancienne.
- **Paiement** : Stripe Checkout (abonnement annuel) ; gestion (carte, factures, annulation) par le portail client Stripe.
- **Accès** : `users.period_end` (recopié par le webhook Stripe) + 3 jours de grâce. Annulation = accès jusqu'à la fin de la période payée.
- **Verrou** : `/app` n'est verrouillée que si `WEB_GATE = "1"` (wrangler.jsonc). À `"0"`, la version web reste ouverte comme avant.

## À faire par Jonathan

### 1. Stripe (commencer en **mode test**)
1. Créer le compte sur stripe.com : Auralis fréquences inc., NEQ, compte bancaire en CAD.
2. **Catalogue de produits → Ajouter un produit** : « Auralis Web », prix **29,99 CAD**, **récurrent, annuel**, taxes **en sus** (exclusive). Copier l'ID du prix (`price_...`).
3. **Paramètres → Taxes** : adresse d'origine (Québec), inscriptions **TPS/TVH** et **TVQ** avec tes numéros. Code fiscal du produit : *Software as a service (SaaS) — personal use*.
4. **Paramètres → Facturation → Portail client** : activer « Annuler l'abonnement » (**à la fin de la période**), « Mettre à jour le moyen de paiement », « Historique des factures ». Désactiver le changement de forfait.
5. **Paramètres → Facturation → Courriels clients** : activer les reçus et le rappel avant renouvellement.
6. **Développeurs → Webhooks → Ajouter une destination** : `https://aura-lis.ca/api/stripe/webhook`, événements :
   `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`.
   Copier le **secret de signature** (`whsec_...`).
7. **Développeurs → Clés API** : copier la **clé secrète** (`sk_test_...` puis `sk_live_...`).

### 2. Resend (envoi des codes)
1. Compte sur resend.com (gratuit jusqu'à 3 000 courriels/mois).
2. **Domains → Add** `aura-lis.ca`, ajouter les enregistrements DNS proposés dans Cloudflare (DNS de aura-lis.ca), attendre « Verified ».
3. **API Keys → Create** : copier la clé (`re_...`).

## Mise en ligne (Claude)

```bash
cd auralis-site
# base creee le 2026-10-18 (id dans wrangler.jsonc)
npx wrangler d1 migrations apply auralis-web --remote
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
npx wrangler secret put RESEND_API_KEY
# wrangler.jsonc : STRIPE_PRICE_ID = "price_...", WEB_GATE = "0"
git push                                       # déploie, /app reste ouverte
```

Tester en mode test (carte `4242 4242 4242 4242`), puis passer aux clés live.
**Lancement** : `WEB_GATE = "1"` + push → `/app` exige un abonnement.

## Accès offert (Jonathan, testeurs)

```bash
npx wrangler d1 execute auralis-web --remote --command \
 "INSERT INTO users (email, created_at, comp_until) VALUES ('adresse@exemple.com', strftime('%s','now'), strftime('%s','now','+1 year'))
  ON CONFLICT(email) DO UPDATE SET comp_until = excluded.comp_until"
```

## Avant le lancement

- [ ] Mettre à jour `confidentialite.html` : la version web collecte maintenant un courriel (compte, paiement via Stripe). La politique actuelle dit « aucun compte, aucun courriel ».
- [ ] Page de vente (lien depuis l'accueil) + PWA (installation sur ordinateur).
- [ ] Ne jamais mentionner l'offre web dans l'app iOS (règles Apple).

## Test local

```bash
printf 'DEV_LOG_CODES=1\nWEB_GATE=1\nSTRIPE_WEBHOOK_SECRET=whsec_test123\n' > .dev.vars
npx wrangler d1 migrations apply auralis-web --local
npx wrangler dev        # les codes s'affichent dans la console
```
