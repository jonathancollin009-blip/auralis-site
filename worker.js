/**
 * Collecteur de statistiques d'usage -- strictement anonyme (voir /confidentialite).
 *
 * Aucun identifiant n'est recu ni ecrit : pas de compte, pas d'identifiant
 * d'appareil ou publicitaire, pas d'IP (Analytics Engine ne l'enregistre que
 * si on la met explicitement dans un blob, ce qu'on ne fait pas ici). Chaque
 * evenement est ecrit seul, sans lien possible entre deux evenements d'une
 * meme personne au-dela du lot recu dans une seule requete.
 *
 * Le reste du site est un Worker "assets seulement" (voir wrangler.jsonc) :
 * ce script n'intercepte QUE /api/e, tout le reste passe par env.ASSETS.fetch
 * -- comportement identique a avant l'ajout de ce fichier.
 *
 * Schema d'un evenement, envoye en lot par le client (voir NA_STATS cote app) :
 *   {t:"screen", s:"<ecran>"}
 *   {t:"play",   k:"<freq|music|geo|proto|pulse|bin>", id:"<slug>"}
 *   {t:"end",    k:"<meme>",                            id:"<slug>", sec:<ecoute reelle>}
 *
 * `end` est ce qui compte le plus : une lecture coupee a 40 s et une lecture
 * ecoutee jusqu'au bout ont le meme evenement `play`, seul `end.sec` distingue
 * les deux.
 */

const MAX_EVENTS = 40;      // au-dela, lot suspect ou bogue cote client -- on tronque
const MAX_STR = 64;         // longueur max d'un champ texte, evite tout abus
const MAX_BODY = 8192;      // un lot de 40 evenements tient large dans 8 Ko

function clip(v) {
  return typeof v === "string" ? v.slice(0, MAX_STR) : "";
}

async function handleEvents(request, env) {
  const len = Number(request.headers.get("content-length") || 0);
  if (len > MAX_BODY) return new Response("payload too large", { status: 413 });

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response("bad json", { status: 400 });
  }
  const events = Array.isArray(body && body.events) ? body.events.slice(0, MAX_EVENTS) : [];
  if (!events.length) return new Response(null, { status: 204 });

  for (const e of events) {
    const t = clip(e && e.t);
    if (t !== "screen" && t !== "play" && t !== "end") continue;

    const blobs = t === "screen"
      ? ["screen", clip(e.s), ""]
      : [t, clip(e.k), clip(e.id)];
    const doubles = t === "end" && isFinite(e.sec) ? [Math.max(0, Number(e.sec))] : [0];

    try {
      env.AE.writeDataPoint({ blobs, doubles, indexes: [t] });
    } catch (err) {
      // Analytics Engine indisponible (ex. juste apres un premier deploiement,
      // avant que le jeu de donnees existe) : on ne fait jamais echouer la
      // requete du client pour une statistique perdue.
    }
  }
  return new Response(null, { status: 204 });
}

/* L'app empaquetee s'execute depuis https://localhost (Android) ou
   capacitor://localhost (iOS) : ses envois sont cross-origin. Le client passe
   par sendBeacon en text/plain, ce qui reste une requete "simple" (aucun
   prevol), mais l'en-tete evite une erreur dans la console. `*` est sans
   consequence : l'endpoint n'accepte que des ecritures anonymes et ne renvoie
   aucune donnee. */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

/* ---- Page de lecture des statistiques (/stats) ----
   Protegee par mot de passe (STATS_PASS) via l'authentification Basic du
   navigateur : la premiere visite declenche l'invite native, le navigateur
   memorise ensuite les identifiants pour cette origine et les rejoue tout
   seul sur les appels fetch("/api/stats-data") qui suivent -- aucun
   formulaire ni cookie a gerer.

   Le compte Cloudflare n'est pas un secret (il apparait deja dans chaque URL
   du tableau de bord) ; seuls le jeton et le mot de passe le sont, et les
   deux restent cote serveur -- ni l'un ni l'autre ne descend jamais dans le
   navigateur. */
const ACCOUNT_ID = "24c1f2ab04e788d9f5e1c3c36a10c6a5";

function checkAuth(request, env) {
  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Basic ") || !env.STATS_PASS) return false;
  let decoded;
  try { decoded = atob(auth.slice(6)); } catch (e) { return false; }
  const i = decoded.indexOf(":");
  const pass = i >= 0 ? decoded.slice(i + 1) : decoded;
  return pass === env.STATS_PASS;
}

function unauthorized() {
  return new Response("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Auralis stats"' },
  });
}

async function aeQuery(env, sql) {
  const r = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/analytics_engine/sql`,
    { method: "POST", headers: { Authorization: `Bearer ${env.CF_API_TOKEN}` }, body: sql }
  );
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`requete Analytics Engine echouee (${r.status}): ${txt.slice(0, 300)}`);
  }
  const j = await r.json();
  return j.data || [];
}

/* `days` est valide en amont (1, 7 ou 30 uniquement) avant d'entrer dans le
   texte SQL : jamais de valeur non maitrisee interpolee dans une requete. */
async function handleStatsData(request, env) {
  const url = new URL(request.url);
  const raw = url.searchParams.get("range");
  const days = raw === "1" ? 1 : raw === "30" ? 30 : 7;
  try {
    const [screens, plays, ends] = await Promise.all([
      aeQuery(env, `SELECT blob2 AS name, count() AS n FROM auralis_events WHERE blob1='screen' AND timestamp > NOW() - INTERVAL '${days}' DAY GROUP BY blob2 ORDER BY n DESC LIMIT 40`),
      aeQuery(env, `SELECT blob2 AS kind, blob3 AS id, count() AS n FROM auralis_events WHERE blob1='play' AND timestamp > NOW() - INTERVAL '${days}' DAY GROUP BY blob2, blob3 ORDER BY n DESC LIMIT 200`),
      aeQuery(env, `SELECT blob2 AS kind, blob3 AS id, count() AS n, sum(double1) AS total_sec, avg(double1) AS avg_sec FROM auralis_events WHERE blob1='end' AND timestamp > NOW() - INTERVAL '${days}' DAY GROUP BY blob2, blob3 ORDER BY total_sec DESC LIMIT 200`),
    ]);
    return new Response(JSON.stringify({ days, screens, plays, ends }), {
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e && e.message) || e) }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });
  }
}

const STATS_HTML = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Auralis — Statistiques</title>
<style>
  :root{--bg:#070d1c;--pan:#111a33;--line:#26325a;--cyan:#7fd8f0;--mauve:#b98fe0;--gold:#e9c96a;--txt:#e8edf8;--dim:#93a2c2}
  *{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--txt);font:15px/1.5 -apple-system,system-ui,sans-serif;padding:20px 16px 60px}
  h1{font-size:1.3rem;margin:0 0 4px} .sub{color:var(--dim);font-size:.85rem;margin:0 0 20px}
  .range{display:flex;gap:8px;margin-bottom:22px}
  .range button{background:var(--pan);border:1px solid var(--line);color:var(--txt);padding:7px 14px;border-radius:10px;font:inherit;cursor:pointer}
  .range button.on{border-color:var(--cyan);color:var(--cyan)}
  section{background:var(--pan);border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin-bottom:16px}
  h2{font-size:.95rem;margin:0 0 10px;color:var(--mauve)}
  table{width:100%;border-collapse:collapse;font-size:.86rem}
  th{text-align:left;color:var(--dim);font-weight:600;font-size:.72rem;text-transform:uppercase;letter-spacing:.03em;padding:4px 8px;border-bottom:1px solid var(--line)}
  td{padding:6px 8px;border-bottom:1px solid #ffffff0c}
  td.num{text-align:right;font-variant-numeric:tabular-nums;color:var(--cyan)}
  .empty{color:var(--dim);font-size:.85rem;padding:6px 8px}
  .err{color:#f5a3a3}
</style></head><body>
  <h1>Statistiques Auralis</h1>
  <p class="sub">Strictement anonyme — aucun identifiant, voir /confidentialite</p>
  <div class="range">
    <button data-r="1">24 heures</button>
    <button data-r="7" class="on">7 jours</button>
    <button data-r="30">30 jours</button>
  </div>
  <div id="out">Chargement…</div>
<script>
var KIND_LABEL = {freq:"Fr\u00e9quences",geo:"G\u00e9om\u00e9trie sacr\u00e9e",music:"Musiques",proto:"Protocoles",pulse:"432 Hz",bin:"Binauraux"};
var KIND_ORDER = ["freq","music","geo","proto","pulse","bin"];
function fmtDur(s){ s=Math.round(s||0); var h=Math.floor(s/3600),m=Math.floor((s%3600)/60),x=s%60;
  return h>0 ? (h+"h"+(m<10?"0":"")+m) : (m+":"+(x<10?"0":"")+x); }
function el(tag, cls, txt){ var e=document.createElement(tag); if(cls)e.className=cls; if(txt!=null)e.textContent=txt; return e; }
function table(headers, rows, empty){
  if(!rows.length) return el("p","empty",empty);
  var t=document.createElement("table");
  var thead=document.createElement("thead"), tr=document.createElement("tr");
  headers.forEach(function(h){ tr.appendChild(el("th",null,h)); }); thead.appendChild(tr); t.appendChild(thead);
  var tbody=document.createElement("tbody");
  rows.forEach(function(r){ var row=document.createElement("tr");
    r.forEach(function(c,i){ row.appendChild(el("td", i>0?"num":null, String(c))); }); tbody.appendChild(row); });
  t.appendChild(tbody); return t;
}
function render(data){
  var out=document.getElementById("out"); out.innerHTML="";
  if(data.error){ out.appendChild(el("p","err","Erreur : "+data.error)); return; }

  var s1=el("section"); s1.appendChild(el("h2","\u00c9crans les plus visit\u00e9s"));
  var screens=(data.screens||[]).map(function(r){ return [r.name||"(?)", r.n]; });
  s1.appendChild(table(["\u00c9cran","Vues"], screens, "Aucune donn\u00e9e pour l'instant.")); out.appendChild(s1);

  var byKind={}, endByKey={};
  (data.ends||[]).forEach(function(r){ endByKey[r.kind+"|"+r.id]=r; });
  (data.plays||[]).forEach(function(r){
    var key=r.kind+"|"+r.id, e=endByKey[key]||{};
    (byKind[r.kind]=byKind[r.kind]||[]).push({
      id:r.id, plays:r.n, ends:e.n||0, total:e.total_sec||0, avg:e.avg_sec||0 });
  });
  KIND_ORDER.forEach(function(k){
    var rows=(byKind[k]||[]).slice().sort(function(a,b){ return b.total-a.total || b.plays-a.plays; });
    var sec=el("section"); sec.appendChild(el("h2", null, KIND_LABEL[k]||k));
    sec.appendChild(table(["Nom","Lectures","\u00c9cout\u00e9 (total)","Moy./lecture"],
      rows.map(function(r){ return [r.id, r.plays, fmtDur(r.total), fmtDur(r.avg)]; }),
      "Aucune donn\u00e9e pour l'instant."));
    out.appendChild(sec);
  });
}
function load(days){
  document.querySelectorAll(".range button").forEach(function(b){ b.classList.toggle("on", b.dataset.r===String(days)); });
  document.getElementById("out").textContent="Chargement\u2026";
  fetch("/api/stats-data?range="+days).then(function(r){ return r.json(); }).then(render)
    .catch(function(e){ document.getElementById("out").innerHTML=""; document.getElementById("out").appendChild(el("p","err","Erreur : "+e)); });
}
document.querySelectorAll(".range button").forEach(function(b){ b.addEventListener("click", function(){ load(b.dataset.r); }); });
load(7);
</script></body></html>`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/e") {
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
      if (request.method === "POST") {
        const r = await handleEvents(request, env);
        const h = new Headers(r.headers);
        for (const [k, v] of Object.entries(CORS)) h.set(k, v);
        return new Response(r.body, { status: r.status, headers: h });
      }
      return new Response("method not allowed", { status: 405, headers: CORS });
    }

    if (url.pathname === "/stats") {
      if (!checkAuth(request, env)) return unauthorized();
      return new Response(STATS_HTML, { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    if (url.pathname === "/api/stats-data") {
      if (!checkAuth(request, env)) return unauthorized();
      return handleStatsData(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};
