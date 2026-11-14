/**
 * Page protegee aura-lis.ca/outil : mode d'emploi du studio audio interne.
 *
 * Module du Worker (liste dans .assetsignore : ce n'est pas une page statique,
 * le contenu n'est donc jamais servi sans le mot de passe). Le mot de passe est
 * verifie ici, cote serveur ; en cas de succes, un cookie signe (HttpOnly) donne
 * acces pendant 30 jours. Mot de passe par defaut : « outil » ; il peut etre
 * remplace sans toucher au code avec le secret OUTIL_PASSWORD du Worker.
 */

const MDP_DEFAUT = "outil";
const TTL = 30 * 24 * 3600;

async function empreinte(env) {
  const mdp = (env && env.OUTIL_PASSWORD) || MDP_DEFAUT;
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("auralis-outil-v1:" + mdp));
  return [...new Uint8Array(b)].map((v) => v.toString(16).padStart(2, "0")).join("");
}

function egal(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function autorise(request, env) {
  const m = /(?:^|;\s*)outil=([0-9a-f]{64})/.exec(request.headers.get("cookie") || "");
  return !!m && egal(m[1], await empreinte(env));
}

const ENTETES = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "x-robots-tag": "noindex, nofollow",
};

const STYLE = `
:root{--bg:#0b1020;--carte:#141b33;--texte:#e8ecf8;--doux:#9aa6c8;--accent:#7fd4ff;--ligne:#26304f}
@media (prefers-color-scheme:light){:root{--bg:#f4f6fb;--carte:#fff;--texte:#16203a;--doux:#5b678a;--accent:#0a6aa8;--ligne:#d7ddec}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--texte);font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:760px;margin:0 auto;padding:28px 16px 64px}
h1{font-size:1.6rem;margin:0 0 4px}h2{font-size:1.15rem;margin:28px 0 8px;color:var(--accent)}
p,li{color:var(--texte)}.doux{color:var(--doux)}
.carte{background:var(--carte);border:1px solid var(--ligne);border-radius:12px;padding:16px 18px;margin:12px 0}
code,kbd{background:var(--bg);border:1px solid var(--ligne);border-radius:6px;padding:1px 6px;font-size:.92em}
input,button{font:inherit;padding:10px 12px;border-radius:8px;border:1px solid var(--ligne)}
input{background:var(--bg);color:var(--texte);width:100%;max-width:320px}
button{background:var(--accent);color:#04121f;border:0;font-weight:600;cursor:pointer}
.err{color:#ff8a8a;margin:8px 0 0}
`;

function enveloppe(titre, corps) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${titre}</title><style>${STYLE}</style></head><body><main>${corps}</main></body></html>`;
}

function pageConnexion(erreur) {
  return enveloppe("Accès à l'outil", `
<h1>Outil Auralis</h1>
<p class="doux">Cette page est réservée. Entrez le mot de passe.</p>
<form method="post" action="/outil" class="carte">
  <label for="m">Mot de passe</label><br>
  <input id="m" name="mdp" type="password" autocomplete="current-password" autofocus required>
  <p><button type="submit">Entrer</button></p>
  ${erreur ? '<p class="err" role="alert">Mot de passe incorrect.</p>' : ""}
</form>`);
}

function pageOutil() {
  return enveloppe("Studio audio Auralis", `
<h1>Studio audio Auralis</h1>
<p class="doux">Mode d'emploi de l'outil interne pour améliorer le rendu des pistes audio (Suno ou autres). Version d'essai.</p>

<div class="carte"><b>Important.</b> L'outil n'est pas un site : c'est un logiciel qui tourne sur votre ordinateur. Vos fichiers audio n'en sortent jamais et vos originaux ne sont jamais modifiés. Les nouveaux fichiers sont écrits dans un dossier à part (voir « Retrouver vos fichiers »).</div>

<h2>Ce que l'outil fait</h2>
<ul>
  <li><b>Analyse</b> d'une piste : niveau, fréquences, problèmes éventuels.</li>
  <li><b>Mesure contre la grille Factor 9</b> : toutes les notes détectées, avec leur écart en Hz par rapport à la case la plus proche (précision de 0,1 Hz), pour le mélange ou piste par piste.</li>
  <li><b>Réaccordage automatique</b> sur la grille Factor 9 : chaque note tenue, avec ses harmoniques, est déplacée vers la case choisie (12 menus réglables, ou « Ne pas modifier »).</li>
  <li><b>Import des pistes séparées par Suno</b> (voix, basse, batterie, guitare…). La séparation automatique en pistes n'est pas incluse dans l'application Mac.</li>
  <li><b>Nettoyage</b> des artefacts, nettoyage des graves, réverbération et <b>mastering</b>.</li>
  <li><b>Écoute avant / après</b> directement dans la fenêtre.</li>
</ul>

<h2>1. Ouvrir l'outil</h2>
<div class="carte">
<p style="margin-top:0"><b>Sur Mac</b> (application « Studio audio Auralis », reçue par WeTransfer) :</p>
<ol>
  <li>Double-cliquez sur le fichier <code>.zip</code> reçu : l'application « Studio audio Auralis » apparaît à côté.</li>
  <li>Glissez-la dans le dossier <b>Applications</b> (colonne de gauche du Finder). À faire une seule fois.</li>
  <li>Double-cliquez dessus. Au premier lancement, le Mac peut proposer d'installer <b>Rosetta</b> : cliquez sur « Installer », tapez le mot de passe de votre session, et attendez. Si macOS demande de confirmer l'ouverture, cliquez sur <b>Ouvrir</b>.</li>
  <li>Une fenêtre « Studio audio Auralis » s'ouvre : c'est l'outil.</li>
</ol>
<p><b>Sur Windows</b> (ordinateur de Jonathan) : double-cliquez sur l'icône « Studio audio Auralis » du bureau.</p>
<p style="margin-bottom:0"><b>Pour fermer :</b> fermez simplement la fenêtre de l'outil.</p>
</div>

<h2>2. Charger une chanson et ses pistes Suno</h2>
<div class="carte">
<ol>
  <li>Dans Suno, téléchargez la chanson complète en WAV et, si vous voulez traiter les pistes une par une, ses pistes séparées (« Titre (Bass).wav », « Titre (Vocals).wav »…).</li>
  <li>Dans le Finder (ou l'Explorateur), sélectionnez la chanson <b>et</b> ses pistes, puis <b>glissez-les toutes ensemble</b> dans la zone en pointillés du haut de la fenêtre. (Sous Windows, <kbd>Ctrl</kbd> + <kbd>C</kbd> puis <kbd>Ctrl</kbd> + <kbd>V</kbd> fonctionne aussi.)</li>
  <li>La ligne « Chanson en cours » indique ce qui est chargé. <b>Une seule chanson à la fois :</b> une nouvelle chanson remplace la précédente.</li>
</ol></div>

<h2>3. Mesurer, traiter, vérifier</h2>
<div class="carte">
<ol>
  <li>Cliquez sur <b>« Mesurer la piste complète »</b> pour voir les notes et leur écart en Hz par rapport à la grille Factor 9.</li>
  <li>Cochez les traitements voulus (case en haut de chaque carte), par exemple « Réaccorder sur la grille Factor 9 », et réglez les 12 menus de notes si besoin.</li>
  <li>Cliquez sur <b>« Traiter la piste »</b> (tout en bas) et attendez « Traitement terminé. » à côté du bouton : de quelques secondes à une minute.</li>
  <li>Dans « Écoute », comparez « Original » et « Traité » (écouteurs ou moniteurs de qualité si possible).</li>
  <li>Cliquez sur <b>« Mesurer la version traitée »</b> : « Exact » veut dire à 0,1 Hz près de la grille.</li>
</ol></div>

<h2>4. Retrouver vos fichiers</h2>
<div class="carte">
<ul style="margin:0">
  <li><b>Mac :</b> dans le dossier <code>Documents</code>, puis <code>Studio audio Auralis</code>.</li>
  <li><b>Windows :</b> dans le dossier de l'outil, puis <code>output</code>, puis <code>studio_audio</code>.</li>
  <li>Vos fichiers d'origine ne sont jamais modifiés.</li>
</ul></div>

<h2>Si quelque chose ne va pas</h2>
<div class="carte"><ul style="margin:0">
  <li><b>Un bandeau rouge apparaît en haut :</b> suivez ce qu'il dit (en général : fermer la fenêtre, puis rouvrir l'outil).</li>
  <li><b>L'application ne s'ouvre pas (Mac) :</b> fermez-la complètement (<kbd>Cmd</kbd> + <kbd>Q</kbd>), rouvrez-la, et acceptez l'installation de Rosetta si elle est proposée. Si elle ne s'ouvre toujours pas, écrivez à Jonathan avec la version de macOS (menu pomme, puis « À propos de ce Mac »).</li>
  <li><b>Rien ne se passe quand vous cliquez :</b> fermez la fenêtre et rouvrez l'outil.</li>
  <li><b>Un fichier ne se charge pas :</b> essayez de le télécharger de nouveau depuis Suno en WAV.</li>
  <li><b>Un traitement est lent :</b> c'est normal pour les longues chansons. Attendez, ne fermez rien.</li>
  <li><b>Dans tous les cas :</b> prenez une capture d'écran de la fenêtre (<kbd>Cmd</kbd> + <kbd>Maj</kbd> + <kbd>4</kbd> sur Mac, <kbd>Windows</kbd> + <kbd>Maj</kbd> + <kbd>S</kbd> sur Windows) et envoyez-la à Jonathan. Sur Mac, le fichier <code>studio.log</code> du dossier <code>Studio audio Auralis</code> aide aussi à comprendre.</li>
</ul></div>

<h2>Ce qu'on aimerait savoir</h2>
<div class="carte">
<ul>
  <li>Le réaccordage s'entend-il (flottement, notes plus ou moins justes, accords) ?</li>
  <li>Les réglages manquants, les mots peu clairs, ce qui est lent ou confus.</li>
  <li>Le mastering et le nettoyage des graves : trop ou pas assez ?</li>
</ul>
<p class="doux" style="margin:0">Envoyez vos remarques à Jonathan, avec la piste et les réglages utilisés si possible.</p>
</div>

<p class="doux" style="margin-top:28px">Ne partagez pas cette page ni le mot de passe.</p>`);
}

/** Retourne une Response si l'URL est /outil, sinon null. */
export async function handleOutil(request, env) {
  const url = new URL(request.url);
  if (url.pathname !== "/outil" && url.pathname !== "/outil/" && url.pathname !== "/outil.html") return null;
  if (url.pathname !== "/outil") return Response.redirect(url.origin + "/outil", 301);

  if (request.method === "POST") {
    let mdp = "";
    try { mdp = String((await request.formData()).get("mdp") || ""); } catch (e) { /* formulaire illisible */ }
    const attendu = await empreinte(env);
    const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("auralis-outil-v1:" + mdp));
    const recu = [...new Uint8Array(b)].map((v) => v.toString(16).padStart(2, "0")).join("");
    if (!egal(recu, attendu)) return new Response(pageConnexion(true), { status: 401, headers: ENTETES });
    return new Response(null, {
      status: 303,
      headers: { location: "/outil", "set-cookie": `outil=${attendu}; Path=/outil; Max-Age=${TTL}; HttpOnly; Secure; SameSite=Lax`, "cache-control": "no-store" },
    });
  }
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("method not allowed", { status: 405 });
  if (await autorise(request, env)) return new Response(pageOutil(), { headers: ENTETES });
  return new Response(pageConnexion(false), { headers: ENTETES });
}
