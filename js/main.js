// ===== Menu mobile =====
const toggle = document.getElementById('navToggle');
const links  = document.getElementById('navLinks');
if (toggle && links) {
  toggle.addEventListener('click', () => links.classList.toggle('open'));
  links.querySelectorAll('a').forEach(a =>
    a.addEventListener('click', () => links.classList.remove('open'))
  );
}

// ===== Bilingue FR / EN =====
// Chaque element traduisible porte data-fr / data-en (contenu HTML).
// Les champs avec placeholder portent data-fr-ph / data-en-ph.
function setLang(lang) {
  document.querySelectorAll('[data-fr]').forEach(el => {
    const t = el.getAttribute('data-' + lang);
    if (t !== null) el.innerHTML = t;
  });
  document.querySelectorAll('[data-fr-ph]').forEach(el => {
    const t = el.getAttribute('data-' + lang + '-ph');
    if (t !== null) el.setAttribute('placeholder', t);
  });
  document.documentElement.lang = lang;
  try { localStorage.setItem('auralis_lang', lang); } catch (e) {}
  document.querySelectorAll('.lang-btn').forEach(b => b.textContent = (lang === 'fr' ? 'EN' : 'FR'));
}

(function () {
  let lang = 'fr';
  try { lang = localStorage.getItem('auralis_lang') || 'fr'; } catch (e) {}
  setLang(lang);
  document.querySelectorAll('.lang-btn').forEach(b =>
    b.addEventListener('click', () => {
      const cur = (document.documentElement.lang === 'en') ? 'en' : 'fr';
      setLang(cur === 'fr' ? 'en' : 'fr');
    })
  );
})();
