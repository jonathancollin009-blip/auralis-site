-- Forfait Famille (4 appareils) -- voir web-auth.js.
-- Appliquer : npx wrangler d1 migrations apply auralis-web --remote

-- Nombre d'appareils permis, recopie depuis le tarif Stripe par le webhook.
-- NULL = forfait Individuel (2 appareils), y compris les acces offerts.
ALTER TABLE users ADD COLUMN max_devices INTEGER;
