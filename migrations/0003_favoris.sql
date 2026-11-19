-- Favoris de la version web, rattaches au compte (2026-11-19) -- voir web-auth.js.
-- Avant, ils ne vivaient que dans le localStorage du navigateur : Safari les
-- efface apres 7 jours sans visite, et ils ne suivaient pas d'un appareil a
-- l'autre. Appliquer : npx wrangler d1 migrations apply auralis-web --remote

-- Un enregistrement par courriel : la liste complete des favoris (JSON, le
-- meme tableau que localStorage "auralis_favorites") et sa revision.
CREATE TABLE favorites (
  email      TEXT PRIMARY KEY,
  data       TEXT NOT NULL,
  updated_at INTEGER NOT NULL   -- revision, en millisecondes Unix
);
