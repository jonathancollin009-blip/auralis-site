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
<p class="doux">Outil interne pour améliorer le rendu des pistes audio (Suno ou autres). Version d'essai.</p>

<div class="carte"><b>Important.</b> L'outil ne fonctionne pas dans le navigateur, sur ce site. Il s'installe et tourne sur votre propre ordinateur (Windows) : vos fichiers audio n'en sortent jamais, et les originaux ne sont jamais modifiés. Les nouveaux fichiers sont écrits dans un dossier <code>output/studio_audio/</code>.</div>

<h2>Ce que l'outil fait</h2>
<ul>
  <li><b>Analyse</b> d'une piste : niveau, fréquences, problèmes éventuels.</li>
  <li><b>Mesure contre la grille Factor 9</b> : toutes les notes détectées, avec leur écart en Hz par rapport à la case la plus proche (précision de 0,1 Hz), pour le mélange ou piste par piste.</li>
  <li><b>Réaccordage automatique</b> sur la grille Factor 9 : chaque note tenue, avec ses harmoniques, est déplacée vers la case choisie (12 menus réglables, ou « Ne pas modifier »).</li>
  <li><b>Séparation en pistes</b> (voix, basse, batterie, autres) ou import de pistes déjà séparées par Suno.</li>
  <li><b>Nettoyage</b> des artefacts, nettoyage des graves, réverbération et <b>mastering</b>.</li>
  <li><b>Écoute avant / après</b> directement dans la page.</li>
</ul>

<h2>Installation, pas à pas</h2>
<p class="doux">À faire une seule fois. Comptez 15 à 20 minutes. Rien de ce qui suit ne modifie vos fichiers personnels. Si une étape ne ressemble pas à ce qui est décrit, arrêtez-vous et écrivez à Jonathan avec une capture d'écran.</p>

<div class="carte"><b>Étape 1 — Recevoir et placer le dossier</b>
<ol>
  <li>Jonathan vous envoie un fichier <code>.zip</code> (le dossier de l'outil).</li>
  <li>Faites un <b>clic droit</b> sur le fichier, puis <b>« Extraire tout… »</b>, puis <b>« Extraire »</b>.</li>
  <li>Déplacez le dossier obtenu à un endroit simple, par exemple directement dans <code>Documents</code>. Évitez le bureau et les dossiers synchronisés (OneDrive).</li>
  <li>Ne changez pas le contenu du dossier et ne déplacez pas les fichiers à l'intérieur. Vous devez y trouver un dossier <code>tools</code>, qui contient un dossier <code>studio_audio</code>.</li>
</ol></div>

<div class="carte"><b>Étape 2 — Installer Python</b>
<p style="margin-top:6px">Python est le moteur qui fait fonctionner l'outil.</p>
<ol>
  <li>Allez sur <code>python.org/downloads</code> et cliquez sur le gros bouton jaune « Download Python ».</li>
  <li>Ouvrez le fichier téléchargé.</li>
  <li><b>Très important :</b> dans la première fenêtre, en bas, <b>cochez la case « Add python.exe to PATH »</b> (« Ajouter python.exe au PATH »).</li>
  <li>Cliquez sur <b>« Install Now »</b>, acceptez la question de Windows (« Oui »), attendez, puis cliquez sur <b>« Close »</b>.</li>
</ol></div>

<div class="carte"><b>Étape 3 — Ouvrir une fenêtre de commandes</b>
<p style="margin-top:6px">C'est la fenêtre noire où on tape du texte. On s'en sert pour les étapes 4 et 5.</p>
<ol>
  <li>Appuyez sur la touche <kbd>Windows</kbd> du clavier (entre Ctrl et Alt).</li>
  <li>Tapez <code>cmd</code>.</li>
  <li>Cliquez sur <b>« Invite de commandes »</b>. Une fenêtre noire s'ouvre.</li>
  <li>Pour taper une commande : copiez la ligne grise, faites un <b>clic droit</b> dans la fenêtre noire (cela colle le texte), puis appuyez sur <kbd>Entrée</kbd>.</li>
  <li><b>Vérification :</b> collez <code>python --version</code> puis Entrée. Vous devez voir « Python 3.… ». Si le message dit que Python est introuvable, refaites l'étape 2 en cochant bien la case « Add python.exe to PATH ».</li>
</ol></div>

<div class="carte"><b>Étape 4 — Installer les deux modules de calcul</b>
<p style="margin-top:6px">Dans la même fenêtre noire :</p>
<ol>
  <li>Collez <code>pip install numpy scipy</code> puis Entrée.</li>
  <li>Attendez la fin (une à deux minutes). Le texte défile, c'est normal. C'est fini quand vous revoyez la ligne avec le curseur qui clignote, après un message « Successfully installed… ».</li>
</ol></div>

<div class="carte"><b>Étape 5 — Installer ffmpeg</b>
<p style="margin-top:6px">ffmpeg permet à l'outil de lire vos fichiers audio (mp3, wav, m4a…).</p>
<ol>
  <li>Dans la fenêtre noire, collez <code>winget install Gyan.FFmpeg</code> puis Entrée.</li>
  <li>Si Windows pose une question (« Y/N » ou « O/N »), tapez <code>Y</code> (ou <code>O</code>) puis Entrée.</li>
  <li>Attendez le message « Installé correctement » (« Successfully installed »).</li>
  <li><b>Fermez la fenêtre noire</b> avec la croix, puis rouvrez-en une (étape 3). C'est nécessaire pour que Windows reconnaisse ffmpeg.</li>
  <li><b>Vérification :</b> collez <code>ffmpeg -version</code> puis Entrée. Vous devez voir « ffmpeg version … ». Si winget n'existe pas sur votre ordinateur, dites-le à Jonathan.</li>
</ol></div>

<div class="carte"><b>Étape 6 (facultative) — Séparation en pistes</b>
<p style="margin-top:6px">Elle sépare voix, basse, batterie et autres instruments. Elle n'est pas nécessaire pour mesurer les notes, nettoyer, masteriser ou réaccorder le mélange complet. Elle est utile pour réaccorder instrument par instrument.</p>
<ol>
  <li>Prévoyez <b>5 Go libres</b> sur le disque et une bonne connexion internet.</li>
  <li>Dans le dossier de l'outil, ouvrez <code>tools</code>, puis <code>studio_audio</code>.</li>
  <li>Double-cliquez sur <code>Installer la separation en pistes.bat</code>. Si Windows affiche « Windows a protégé votre ordinateur », cliquez sur <b>« Informations complémentaires »</b>, puis <b>« Exécuter quand même »</b>.</li>
  <li>Une fenêtre noire s'ouvre et affiche beaucoup de texte pendant 5 à 15 minutes. <b>Ne la fermez pas.</b> C'est fini quand elle affiche « Installé. Carte graphique : True » (ou False), puis « Appuyez sur une touche ». Appuyez sur une touche.</li>
  <li>« Carte graphique : False » est normal si vous n'avez pas de carte NVIDIA. La séparation fonctionne quand même, mais beaucoup plus lentement (plusieurs minutes par chanson).</li>
</ol></div>

<h2>Utilisation, pas à pas</h2>
<div class="carte">
<ol>
  <li>Dans le dossier de l'outil, ouvrez <code>tools</code>, puis <code>studio_audio</code>, et double-cliquez sur <code>Lancer le studio audio.bat</code>. (Même avertissement de Windows possible : « Informations complémentaires », puis « Exécuter quand même ».)</li>
  <li>Une <b>fenêtre noire</b> s'ouvre : <b>laissez-la ouverte</b> pendant toute l'utilisation. Elle fait fonctionner l'outil.</li>
  <li>Votre navigateur s'ouvre tout seul sur l'outil (adresse <code>127.0.0.1</code> suivie d'un numéro, comme 8791). S'il ne s'ouvre pas, copiez cette adresse depuis la fenêtre noire dans la barre d'adresse.</li>
  <li><b>Charger une chanson :</b> glissez un fichier audio dans la page, ou utilisez le bouton de choix de fichier.</li>
  <li><b>Lire les mesures :</b> l'outil analyse la piste et affiche ses notes, avec leur écart en Hz par rapport à la grille Factor 9.</li>
  <li><b>Choisir les traitements :</b> chaque carte a une case à cocher en haut. Cochez ceux que vous voulez essayer. Pour le réaccordage, ouvrez la carte « Réaccorder sur la grille Factor 9 » et cochez-la.</li>
  <li>Cliquez sur <b>« Traiter la piste »</b> et attendez (de quelques secondes à quelques minutes).</li>
  <li><b>Écouter :</b> comparez « avant » et « après ». Utilisez des écouteurs ou des moniteurs de qualité si possible.</li>
  <li>Cliquez sur <b>« Mesurer la version traitée »</b> pour voir où tombent maintenant les notes sur la grille.</li>
  <li><b>Retrouver les fichiers :</b> les nouvelles pistes sont dans le dossier de l'outil, dans <code>output</code>, puis <code>studio_audio</code>. Vos fichiers d'origine ne sont jamais modifiés.</li>
  <li><b>Quitter :</b> fermez la page du navigateur, puis la fenêtre noire (croix, ou touches <kbd>Ctrl</kbd> + <kbd>C</kbd>).</li>
</ol></div>

<h2>Si quelque chose ne va pas</h2>
<div class="carte"><ul>
  <li><b>« Python n'est pas reconnu… »</b> : Python n'est pas installé, ou la case « Add python.exe to PATH » n'était pas cochée. Refaites l'étape 2.</li>
  <li><b>« No module named numpy »</b> : refaites l'étape 4.</li>
  <li><b>« Décodage impossible » ou rien ne se charge</b> : ffmpeg est absent. Refaites l'étape 5, sans oublier de rouvrir la fenêtre noire.</li>
  <li><b>La page ne s'ouvre pas</b> : regardez l'adresse écrite dans la fenêtre noire et copiez-la dans votre navigateur.</li>
  <li><b>Un traitement est très lent</b> : c'est normal pour la séparation en pistes sans carte graphique NVIDIA. Attendez, ne fermez rien.</li>
  <li><b>Dans tous les cas</b> : prenez une capture d'écran (touches <kbd>Windows</kbd> + <kbd>Maj</kbd> + <kbd>S</kbd>) de la fenêtre noire et de la page, et envoyez-la à Jonathan.</li>
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
