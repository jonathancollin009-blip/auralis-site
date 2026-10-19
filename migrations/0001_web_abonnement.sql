-- Abonnement web annuel (aura-lis.ca/app) -- voir web-auth.js.
-- Appliquer : npx wrangler d1 migrations apply auralis-web --remote

-- Un client = un courriel. L'acces depend uniquement de period_end (fin de la
-- periode payee, en secondes Unix) recopie depuis Stripe par le webhook, ou de
-- comp_until (acces offert, rempli a la main pour Jonathan, testeurs, etc.).
CREATE TABLE users (
  email           TEXT PRIMARY KEY,
  stripe_customer TEXT UNIQUE,
  sub_status      TEXT,              -- statut Stripe : active, past_due, canceled...
  period_end      INTEGER,           -- fin de la periode payee (s Unix)
  cancel_at_end   INTEGER DEFAULT 0, -- 1 = annule, s'arrete a period_end
  comp_until      INTEGER,           -- acces offert jusqu'a (s Unix)
  created_at      INTEGER NOT NULL
);

-- Codes de connexion a 6 chiffres envoyes par courriel. On ne garde que le
-- hachage ; un seul code valide par courriel a la fois.
CREATE TABLE login_codes (
  email      TEXT PRIMARY KEY,
  code_hash  TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0,
  sent_at    INTEGER NOT NULL
);

-- Appareils connectes. Maximum 2 par courriel : une 3e connexion deconnecte
-- la plus ancienne. Le jeton du cookie n'est jamais stocke en clair.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  device     TEXT,
  created_at INTEGER NOT NULL,
  last_seen  INTEGER NOT NULL
);
CREATE INDEX sessions_email ON sessions(email);
