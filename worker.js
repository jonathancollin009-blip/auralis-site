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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/e") {
      if (request.method === "POST") return handleEvents(request, env);
      return new Response("method not allowed", { status: 405 });
    }
    return env.ASSETS.fetch(request);
  },
};
