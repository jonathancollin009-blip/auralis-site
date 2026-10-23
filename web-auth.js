/**
 * Abonnement web annuel a la version ordinateur de l'app (aura-lis.ca/app).
 *
 * - Paiement : Stripe Checkout, abonnement annuel a renouvellement automatique.
 *   Le webhook recopie la fin de periode payee dans D1 (users.period_end) ;
 *   c'est la seule source de verite pour l'acces, Stripe n'est jamais
 *   interroge au chargement de /app.
 * - Connexion sans mot de passe : code a 6 chiffres envoye par courriel
 *   (Resend), puis cookie de session HttpOnly. Maximum 2 appareils connectes
 *   par courriel (4 au forfait Famille) : une connexion de trop deconnecte
 *   la plus ancienne.
 * - /app n'est verrouillee que si WEB_GATE = "1" : on peut deployer tout ceci
 *   sans fermer l'acces public, puis basculer le jour du lancement.
 *
 * Secrets (npx wrangler secret put ...) : STRIPE_SECRET_KEY,
 * STRIPE_WEBHOOK_SECRET, RESEND_API_KEY. Variables (wrangler.jsonc) :
 * WEB_GATE, STRIPE_PRICE_ID (Individuel), STRIPE_PRICE_ID_FAMILLE, STRIPE_TAX,
 * MAIL_FROM.
 * En local, DEV_LOG_CODES = "1" ecrit le code dans la console au lieu de
 * l'envoyer (aucun courriel ne part sans RESEND_API_KEY).
 */

const MAX_DEVICES = 2;           // forfait Individuel, et acces offerts
const MAX_DEVICES_FAMILLE = 4;
const SESSION_DAYS = 180;
const CODE_TTL = 10 * 60;        // un code vaut 10 minutes
const CODE_RESEND = 60;          // pas plus d'un envoi par minute et par courriel
const CODE_MAX_TRIES = 5;
const GRACE = 3 * 86400;         // 3 jours de marge si un renouvellement tarde
const COOKIE = "aur_s";
const ACCESS_STATUSES = ["active", "trialing", "past_due"];

const now = () => Math.floor(Date.now() / 1000);

function json(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

async function sha256(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomToken() {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function normEmail(v) {
  const e = typeof v === "string" ? v.trim().toLowerCase() : "";
  return e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

function langOf(v) {
  return v === "en" || v === "es" ? v : "fr";
}

function getCookie(request, name) {
  const c = request.headers.get("cookie") || "";
  for (const part of c.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

function sessionCookie(value, maxAge) {
  return `${COOKIE}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

/* Les POST viennent toujours de nos propres pages : un Origin different (ou
   absent) est refuse, ce qui suffit contre le CSRF avec SameSite=Lax. */
function sameOrigin(request) {
  return request.headers.get("origin") === new URL(request.url).origin;
}

function deviceLabel(request) {
  const ua = request.headers.get("user-agent") || "";
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) && !/Mobile/.test(ua) ? "Mac"
    : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Linux/.test(ua) ? "Linux" : "Appareil";
  const br = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome"
    : /Safari\//.test(ua) ? "Safari" : "";
  return br ? `${os} · ${br}` : os;
}

function deviceLimit(u) {
  return (u && u.max_devices) || MAX_DEVICES;
}

/* Deconnecte les sessions les plus anciennes au-dela de la limite. */
function trimSessions(env, email, limit) {
  return env.DB.prepare(
    "DELETE FROM sessions WHERE email = ? AND token_hash NOT IN " +
    "(SELECT token_hash FROM sessions WHERE email = ? ORDER BY created_at DESC, rowid DESC LIMIT ?)"
  ).bind(email, email, limit);
}

export function hasAccess(u, t = now()) {
  if (!u) return false;
  if (u.comp_until && u.comp_until > t) return true;
  return ACCESS_STATUSES.includes(u.sub_status) && !!u.period_end && u.period_end + GRACE > t;
}

/* Session courante (ou null). Prolonge last_seen au plus une fois par jour
   pour ne pas ecrire dans D1 a chaque requete. */
async function getSession(request, env) {
  const tok = getCookie(request, COOKIE);
  if (!tok || !env.DB) return null;
  const h = await sha256(tok);
  const s = await env.DB.prepare(
    "SELECT s.token_hash, s.email, s.created_at, s.last_seen, u.* FROM sessions s JOIN users u ON u.email = s.email WHERE s.token_hash = ?"
  ).bind(h).first();
  if (!s) return null;
  const t = now();
  if (t - s.last_seen > SESSION_DAYS * 86400) {
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(h).run();
    return null;
  }
  if (t - s.last_seen > 86400) {
    await env.DB.prepare("UPDATE sessions SET last_seen = ? WHERE token_hash = ?").bind(t, h).run();
  }
  return s;
}

/* ---- Courriel du code ---- */

const MAIL_TEXT = {
  fr: { subj: "Votre code de connexion Auralis : ", intro: "Voici votre code de connexion à Auralis :", end: "Il est valide 10 minutes. Si vous n'avez rien demandé, ignorez ce courriel." },
  en: { subj: "Your Auralis sign-in code: ", intro: "Here is your Auralis sign-in code:", end: "It is valid for 10 minutes. If you did not request it, you can ignore this email." },
  es: { subj: "Su código de acceso a Auralis: ", intro: "Este es su código de acceso a Auralis:", end: "Es válido durante 10 minutos. Si no lo ha solicitado, ignore este correo." },
};

async function sendCode(env, email, code, lang) {
  const m = MAIL_TEXT[lang];
  if (env.DEV_LOG_CODES === "1") {
    console.log(`[auralis-web] code pour ${email} : ${code}`);
    if (!env.RESEND_API_KEY) return true;
  }
  if (!env.RESEND_API_KEY) return false;
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:480px;margin:auto;padding:24px;color:#111">
<p style="font-size:20px;font-weight:700;letter-spacing:3px;margin:0 0 18px"><span style="color:#4aa8d0">AURA</span><span style="color:#b57fc4">LIS</span></p>
<p>${m.intro}</p>
<p style="font-size:34px;font-weight:700;letter-spacing:8px;margin:18px 0">${code}</p>
<p style="color:#666;font-size:14px">${m.end}</p></div>`;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: env.MAIL_FROM || "Auralis <connexion@mail.aura-lis.ca>",
      to: [email],
      subject: m.subj + code,
      html,
      text: `${m.intro}\n\n${code}\n\n${m.end}`,
    }),
  });
  if (!r.ok) console.log("[auralis-web] Resend", r.status, await r.text());
  return r.ok;
}

/* ---- Connexion ---- */

async function readJson(request) {
  if (Number(request.headers.get("content-length") || 0) > 4096) return null;
  try { return await request.json(); } catch (e) { return null; }
}

async function handleCode(request, env) {
  const body = await readJson(request);
  const email = normEmail(body && body.email);
  if (!email) return json({ error: "email" }, 400);
  const t = now();
  const prev = await env.DB.prepare("SELECT sent_at FROM login_codes WHERE email = ?").bind(email).first();
  if (prev && t - prev.sent_at < CODE_RESEND) {
    return json({ error: "wait", retry: CODE_RESEND - (t - prev.sent_at) }, 429);
  }
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
  const code = String(n).padStart(6, "0");
  await env.DB.prepare(
    "INSERT INTO login_codes (email, code_hash, expires_at, attempts, sent_at) VALUES (?, ?, ?, 0, ?) " +
    "ON CONFLICT(email) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, sent_at = excluded.sent_at"
  ).bind(email, await sha256(email + ":" + code), t + CODE_TTL, t).run();
  const sent = await sendCode(env, email, code, langOf(body.lang));
  return sent ? json({ ok: true }) : json({ error: "mail" }, 502);
}

async function handleVerify(request, env) {
  const body = await readJson(request);
  const email = normEmail(body && body.email);
  const code = body && typeof body.code === "string" ? body.code.replace(/\D/g, "") : "";
  if (!email || code.length !== 6) return json({ error: "bad" }, 400);
  const t = now();
  const row = await env.DB.prepare("SELECT * FROM login_codes WHERE email = ?").bind(email).first();
  if (!row || row.expires_at < t) return json({ error: "expired" }, 400);
  if (row.attempts >= CODE_MAX_TRIES) return json({ error: "tries" }, 429);
  if ((await sha256(email + ":" + code)) !== row.code_hash) {
    await env.DB.prepare("UPDATE login_codes SET attempts = attempts + 1 WHERE email = ?").bind(email).run();
    return json({ error: "bad", left: CODE_MAX_TRIES - row.attempts - 1 }, 400);
  }

  const tok = randomToken();
  const prevUser = await env.DB.prepare("SELECT max_devices FROM users WHERE email = ?").bind(email).first();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM login_codes WHERE email = ?").bind(email),
    env.DB.prepare("INSERT INTO users (email, created_at) VALUES (?, ?) ON CONFLICT(email) DO NOTHING").bind(email, t),
    env.DB.prepare("INSERT INTO sessions (token_hash, email, device, created_at, last_seen) VALUES (?, ?, ?, ?, ?)")
      .bind(await sha256(tok), email, deviceLabel(request), t, t),
    // Garde les sessions les plus recentes, deconnecte les autres.
    trimSessions(env, email, deviceLimit(prevUser)),
  ]);
  const u = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
  return json({ ok: true, access: hasAccess(u) }, 200, { "set-cookie": sessionCookie(tok, SESSION_DAYS * 86400) });
}

async function handleLogout(request, env) {
  const tok = getCookie(request, COOKIE);
  if (tok) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(tok)).run();
  return json({ ok: true }, 200, { "set-cookie": sessionCookie("", 0) });
}

async function handleMe(request, env) {
  const s = await getSession(request, env);
  if (!s) return json({ error: "auth" }, 401);
  const dev = await env.DB.prepare("SELECT token_hash, device, last_seen FROM sessions WHERE email = ? ORDER BY created_at DESC")
    .bind(s.email).all();
  return json({
    email: s.email,
    access: hasAccess(s),
    status: s.sub_status || null,
    period_end: s.period_end || null,
    cancel_at_end: !!s.cancel_at_end,
    comp_until: s.comp_until || null,
    customer: !!s.stripe_customer,
    devices: dev.results.map((d) => ({ device: d.device, last_seen: d.last_seen, current: d.token_hash === s.token_hash })),
    max_devices: deviceLimit(s),
    plan: s.max_devices === MAX_DEVICES_FAMILLE ? "famille" : "individuel",
  });
}

/* ---- Stripe ---- */

async function stripe(env, method, path, params) {
  const r = await fetch("https://api.stripe.com/v1/" + path, {
    method,
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: params ? new URLSearchParams(params).toString() : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`Stripe ${path} ${r.status} ${data.error && data.error.message}`);
  return data;
}

async function handleCheckout(request, env) {
  const s = await getSession(request, env);
  if (!s) return json({ error: "auth" }, 401);
  if (hasAccess(s) && !s.comp_until) return json({ error: "already" }, 409);
  const body = (await readJson(request)) || {};
  const famille = body.plan === "famille";
  if (famille && !env.STRIPE_PRICE_ID_FAMILLE) return json({ error: "plan" }, 400);
  let customer = s.stripe_customer;
  if (!customer) {
    customer = (await stripe(env, "POST", "customers", { email: s.email, "metadata[source]": "auralis-web" })).id;
    await env.DB.prepare("UPDATE users SET stripe_customer = ? WHERE email = ?").bind(customer, s.email).run();
  }
  const origin = new URL(request.url).origin;
  const p = {
    mode: "subscription",
    customer,
    "line_items[0][price]": famille ? env.STRIPE_PRICE_ID_FAMILLE : env.STRIPE_PRICE_ID,
    "line_items[0][quantity]": "1",
    success_url: origin + "/compte?paye=1",
    cancel_url: origin + "/compte",
    locale: langOf(body.lang),
    allow_promotion_codes: "true",
  };
  if (env.STRIPE_TAX === "1") {
    p["automatic_tax[enabled]"] = "true";
    p["customer_update[address]"] = "auto";
    p.billing_address_collection = "required";
  }
  const cs = await stripe(env, "POST", "checkout/sessions", p);
  return json({ url: cs.url });
}

async function handlePortal(request, env) {
  const s = await getSession(request, env);
  if (!s) return json({ error: "auth" }, 401);
  if (!s.stripe_customer) return json({ error: "nocustomer" }, 400);
  const ps = await stripe(env, "POST", "billing_portal/sessions", {
    customer: s.stripe_customer,
    return_url: new URL(request.url).origin + "/compte",
  });
  return json({ url: ps.url });
}

/* On relit toujours l'abonnement chez Stripe plutot que de faire confiance
   a l'objet de l'evenement : les webhooks peuvent arriver dans le desordre,
   un vieil evenement "updated" ne doit pas ecraser un etat plus recent.
   current_period_end est sur l'abonnement (anciennes versions d'API) ou sur
   ses items (depuis 2025-03-31). Le portail client annule maintenant avec
   une date cancel_at, sans toujours lever cancel_at_period_end.
   Le tarif de l'abonnement donne le forfait : un changement de forfait dans
   le portail arrive ici par customer.subscription.updated. */
async function syncSubscription(env, subId) {
  const sub = await stripe(env, "GET", "subscriptions/" + encodeURIComponent(subId));
  const item = sub.items && sub.items.data && sub.items.data[0];
  const periodEnd = sub.current_period_end || (item && item.current_period_end) || null;
  const cancelAtEnd = sub.cancel_at_period_end || !!sub.cancel_at;
  const priceId = item && item.price && item.price.id;
  const famille = !!env.STRIPE_PRICE_ID_FAMILLE && priceId === env.STRIPE_PRICE_ID_FAMILLE;
  const r = await env.DB.prepare(
    "UPDATE users SET sub_status = ?, period_end = ?, cancel_at_end = ?, max_devices = ? WHERE stripe_customer = ?"
  ).bind(sub.status, periodEnd, cancelAtEnd ? 1 : 0, famille ? MAX_DEVICES_FAMILLE : null, sub.customer).run();
  if (!r.meta.changes) { console.log("[auralis-web] abonnement sans client connu", sub.id, sub.customer); return; }
  // Retour au forfait Individuel : deconnecte les appareils en trop.
  if (!famille) {
    const u = await env.DB.prepare("SELECT email FROM users WHERE stripe_customer = ?").bind(sub.customer).first();
    if (u) await trimSessions(env, u.email, MAX_DEVICES).run();
  }
}

async function verifyStripeSignature(payload, header, secret) {
  const parts = Object.create(null);
  const v1 = [];
  for (const kv of (header || "").split(",")) {
    const [k, v] = kv.split("=");
    if (k === "v1") v1.push(v); else parts[k] = v;
  }
  const ts = Number(parts.t);
  if (!ts || !v1.length || Math.abs(now() - ts) > 300) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${ts}.${payload}`));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return v1.some((s) => s.length === hex.length && crypto.subtle.timingSafeEqual(new TextEncoder().encode(s), new TextEncoder().encode(hex)));
}

async function handleWebhook(request, env) {
  const payload = await request.text();
  if (!(await verifyStripeSignature(payload, request.headers.get("stripe-signature"), env.STRIPE_WEBHOOK_SECRET))) {
    return new Response("bad signature", { status: 400 });
  }
  const ev = JSON.parse(payload);
  const o = ev.data && ev.data.object;
  let subId = null;
  if (ev.type === "checkout.session.completed") subId = o.subscription;
  else if (ev.type.startsWith("customer.subscription.")) subId = o.id;
  else if (ev.type === "invoice.paid") {
    subId = o.subscription || (o.parent && o.parent.subscription_details && o.parent.subscription_details.subscription);
  }
  if (subId) await syncSubscription(env, subId);
  return new Response("ok");
}

/* ---- Verrou de /app ---- */

async function gateApp(request, env) {
  if (env.WEB_GATE !== "1") return env.ASSETS.fetch(request);
  const s = await getSession(request, env);
  const url = new URL(request.url);
  if (!s) return Response.redirect(url.origin + "/connexion?suite=app", 302);
  if (!hasAccess(s)) return Response.redirect(url.origin + "/compte", 302);
  const r = await env.ASSETS.fetch(request);
  const h = new Headers(r.headers);
  h.set("cache-control", "private, no-store");
  return new Response(r.body, { status: r.status, headers: h });
}

/* Point d'entree appele par worker.js : renvoie une Response si la requete
   concerne l'abonnement web, sinon null. */
export async function handleWeb(request, env) {
  const p = new URL(request.url).pathname;
  if (p === "/app" || p === "/app.html") return gateApp(request, env);
  if (!p.startsWith("/api/auth/") && !p.startsWith("/api/web/") && p !== "/api/stripe/webhook") return null;
  if (!env.DB) return json({ error: "indisponible" }, 503);
  if (request.method !== "GET" && p !== "/api/stripe/webhook" && !sameOrigin(request)) return json({ error: "origin" }, 403);
  try {
    if (request.method === "POST") {
      if (p === "/api/auth/code") return await handleCode(request, env);
      if (p === "/api/auth/verify") return await handleVerify(request, env);
      if (p === "/api/auth/logout") return await handleLogout(request, env);
      if (p === "/api/web/checkout") return await handleCheckout(request, env);
      if (p === "/api/web/portal") return await handlePortal(request, env);
      if (p === "/api/stripe/webhook") return await handleWebhook(request, env);
    }
    if (request.method === "GET" && p === "/api/web/me") return await handleMe(request, env);
  } catch (e) {
    console.log("[auralis-web] erreur", p, e && e.message);
    return json({ error: "server" }, 500);
  }
  return json({ error: "not found" }, 404);
}
