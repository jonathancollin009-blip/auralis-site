/**
 * Sonde de configuration : verifie que les Cloudflare Pages Functions sont
 * bien actives sur ce projet avant d'y batir le collecteur de statistiques.
 * Le fichier _headers n'ayant eu aucun effet, rien ne garantissait que le
 * site soit servi par un projet Pages standard.
 */
export function onRequest(context) {
  return new Response(JSON.stringify({
    ok: true,
    at: new Date().toISOString(),
    bindings: Object.keys(context.env || {}),
  }), { headers: { "content-type": "application/json" } });
}
