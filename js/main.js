// ===== Menu mobile =====
const toggle = document.getElementById('navToggle');
const links  = document.getElementById('navLinks');
if (toggle && links) {
  toggle.addEventListener('click', () => links.classList.toggle('open'));
  links.querySelectorAll('a').forEach(a =>
    a.addEventListener('click', () => links.classList.remove('open'))
  );
}

// ===== Multilingue FR / EN / ES =====
// Chaque element traduisible porte data-fr / data-en / data-es (contenu HTML).
// Les champs avec placeholder portent data-fr-ph / data-en-ph / data-es-ph.
// Repli sur le francais si une traduction manque (evite le melange de langues).
var LANGS = ['fr', 'en', 'es'];
var LANG_NEXT = { fr: 'EN', en: 'ES', es: 'FR' };   // libelle = langue du prochain clic
function setLang(lang) {
  if (LANGS.indexOf(lang) === -1) lang = 'fr';
  document.querySelectorAll('[data-fr]').forEach(function (el) {
    var t = el.getAttribute('data-' + lang);
    if (t === null) t = el.getAttribute('data-fr');
    if (t !== null) el.innerHTML = t;
  });
  document.querySelectorAll('[data-fr-ph]').forEach(function (el) {
    var t = el.getAttribute('data-' + lang + '-ph');
    if (t === null) t = el.getAttribute('data-fr-ph');
    if (t !== null) el.setAttribute('placeholder', t);
  });
  document.documentElement.lang = lang;
  try { localStorage.setItem('auralis_lang', lang); } catch (e) {}
  document.querySelectorAll('.lang-btn').forEach(function (b) { b.textContent = LANG_NEXT[lang]; });
}

(function () {
  var lang = 'fr';
  try { lang = localStorage.getItem('auralis_lang') || 'fr'; } catch (e) {}
  if (LANGS.indexOf(lang) === -1) lang = 'fr';
  setLang(lang);
  document.querySelectorAll('.lang-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      var idx = LANGS.indexOf(document.documentElement.lang);
      setLang(LANGS[(idx + 1) % LANGS.length]);
    });
  });
})();
