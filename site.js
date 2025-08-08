// Simple responsive nav menu toggle
const menuBtn = document.querySelector('.menu-button');
const dropdown = document.querySelector('.dropdown-menu');
const navLinks = document.querySelectorAll('.nav-links a');
const dropLinks = document.querySelectorAll('.dropdown-menu a');

function closeMenu() {
  dropdown?.classList.remove('show');
  if (menuBtn) menuBtn.setAttribute('aria-expanded', 'false');
  if (dropdown) dropdown.setAttribute('aria-hidden', 'true');
}

menuBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  const willShow = !dropdown.classList.contains('show');
  dropdown.classList.toggle('show', willShow);
  menuBtn.setAttribute('aria-expanded', String(willShow));
  dropdown.setAttribute('aria-hidden', String(!willShow));
});

document.addEventListener('click', (e) => {
  if (!dropdown?.classList.contains('show')) return;
  if (!dropdown.contains(e.target) && e.target !== menuBtn) {
    closeMenu();
  }
});

function setActive(hash) {
  [...navLinks, ...dropLinks].forEach(a => a.classList.remove('active'));
  const match = document.querySelectorAll(`a[href="${hash}"]`);
  match.forEach(a => a.classList.add('active'));
}

window.addEventListener('hashchange', () => setActive(location.hash || '#home'));
setActive(location.hash || '#home'); 