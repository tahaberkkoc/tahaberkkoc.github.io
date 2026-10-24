import * as V from './views.js';

const D = JSON.parse(document.getElementById('site-data').textContent);
const main = document.getElementById('main');
const header = document.querySelector('.site-header');
const nav = document.querySelector('.site-nav');
const indicator = document.querySelector('.nav-indicator');
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const docCache = new Map();

// The current page's Overleaf document is embedded in the HTML; keep it.
try {
  const embedded = JSON.parse(document.getElementById('doc-data').textContent);
  if (embedded) docCache.set(embedded.slug, embedded);
} catch { /* no embedded doc */ }

let current = V.matchRoute(D, location.pathname);
document.querySelector('.site-main')?.setAttribute('data-view', current.key);
let navigating = false;

// ------------------------------------------------------------------ navigation indicator
function moveIndicator(animate = true) {
  if (!indicator) return;
  const active = nav.querySelector('.nav-link.is-active');
  if (!animate) document.documentElement.classList.add('no-anim');
  if (!active) {
    indicator.style.width = '0px';
  } else {
    const navBox = nav.getBoundingClientRect();
    const box = active.getBoundingClientRect();
    indicator.style.width = `${box.width}px`;
    indicator.style.transform = `translateX(${box.left - navBox.left}px)`;
    indicator.style.backgroundColor = getComputedStyle(active).getPropertyValue('--accent');
  }
  if (!animate) requestAnimationFrame(() => document.documentElement.classList.remove('no-anim'));
}

function setActiveNav(key) {
  nav.querySelectorAll('.nav-link').forEach((a) => {
    const on = a.dataset.key === key;
    a.classList.toggle('is-active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  document.body.style.setProperty('--accent', V.accentOf(D, key));
  moveIndicator(true);
}

// ------------------------------------------------------------------ routing
async function loadDoc(slug) {
  if (docCache.has(slug)) return docCache.get(slug);
  const res = await fetch(`${D.base}data/projects/${encodeURIComponent(slug)}.json`);
  const doc = res.ok ? await res.json() : null;
  docCache.set(slug, doc);
  return doc;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function go(url, { push = true } = {}) {
  const target = new URL(url, location.href);
  const route = V.matchRoute(D, target.pathname);
  const samePage = route.key === current.key && route.slug === current.slug;
  if (samePage) {
    if (target.hash) scrollToHash(target.hash, true);
    else window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    if (push && target.href !== location.href) history.pushState({}, '', target.href);
    return;
  }
  if (navigating) return;
  navigating = true;
  document.body.classList.add('nav-busy');
  closeMenu();

  const navKey = V.navKey(route);
  // start the header animation (name shrink/grow + nav underline) right away
  document.body.dataset.page = navKey;
  setActiveNav(navKey);

  const docPromise = route.key === 'project' ? loadDoc(route.slug).catch(() => null) : Promise.resolve(null);
  main.classList.add('is-leaving');
  const [doc] = await Promise.all([docPromise, wait(reduced ? 0 : 200)]);

  main.innerHTML = V.renderRoute(D, route, doc);
  document.title = V.pageTitle(D, route).replace(/<[^>]*>/g, '');
  if (push) history.pushState({}, '', target.href);
  current = route;
  main.dataset.view = route.key;

  window.scrollTo(0, 0);
  main.classList.remove('is-leaving');
  main.classList.add('is-entering');
  setTimeout(() => { main.classList.remove('is-entering'); document.body.classList.remove('nav-busy'); }, 900);
  initPage();
  if (target.hash) requestAnimationFrame(() => scrollToHash(target.hash, true));
  main.focus({ preventScroll: true });
  navigating = false;
}

document.addEventListener('click', (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target.closest('a');
  if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
  const href = a.getAttribute('href');
  if (!href) return;
  if (href.startsWith('#')) { // in-page reference: smooth scroll + flash
    e.preventDefault();
    scrollToHash(href, true);
    history.pushState({}, '', href);
    return;
  }
  const u = new URL(a.href, location.href);
  if (u.origin !== location.origin || !u.pathname.startsWith(D.base)) return;
  if (/\.(pdf|png|jpe?g|svg|json|zip)$/i.test(u.pathname) || u.pathname.includes('/media/')) return;
  e.preventDefault();
  go(u.href);
});

window.addEventListener('popstate', () => go(location.href, { push: false }));

function scrollToHash(hash, flash) {
  let el = null;
  try { el = document.getElementById(decodeURIComponent(hash.slice(1))); } catch { /* bad hash */ }
  if (!el) return;
  el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  if (flash) {
    const target = el.closest('.math-display, figure, li, .doc-theorem') || el;
    target.classList.remove('flash');
    void target.offsetWidth; // restart animation
    target.classList.add('flash');
  }
}

// ------------------------------------------------------------------ mobile menu
const toggle = document.querySelector('.nav-toggle');
function closeMenu() {
  header.classList.remove('nav-open');
  if (toggle) toggle.setAttribute('aria-expanded', 'false');
}
if (toggle) {
  toggle.addEventListener('click', () => {
    const open = !header.classList.contains('nav-open');
    header.classList.toggle('nav-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  });
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

// ------------------------------------------------------------------ header shadow on scroll
const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 4);
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

// ------------------------------------------------------------------ per-page behaviour
let observers = [];
function initPage() {
  observers.forEach((o) => o.disconnect());
  observers = [];
  initReveal();
  initProjects();
  initContact();
  initGallery();
  initToc();
}

// photo viewer for the Interests gallery
let lightbox = null, galleryKey = null, galleryRO = null;
function initGallery() {
  const tiles = [...main.querySelectorAll('.gal-tile[data-i]')];
  if (!tiles.length) { if (lightbox) { lightbox.classList.remove('open'); document.documentElement.style.overflow = ''; } return; }
  const photos = D.interests.gallery;
  // size every tile to its photo's proportions: row span = column width / aspect ratio
  const grid = main.querySelector('.gallery');
  const layout = () => {
    const W = grid.clientWidth, narrow = window.matchMedia('(max-width: 900px)').matches;
    const gap = narrow ? 8 : 10;
    const targets = narrow ? [210, 150, 180, 140] : [340, 240, 290, 220];
    const all = [...grid.querySelectorAll('.gal-tile')];
    const ar = (t) => parseFloat(t.style.getPropertyValue('--ar') || 1.5);
    const rowH = (row) => (W - gap * (row.length - 1)) / row.reduce((a, t) => a + ar(t), 0);
    let y = 0, r = 0;
    for (let i = 0; i < all.length; r++) {
      const target = targets[r % targets.length];
      let row = [all[i++]];
      // add photos while the row height gets closer to this row's target height ([big] photos get a row of their own)
      while (i < all.length && row[0].dataset.big !== '1' && all[i].dataset.big !== '1') {
        const cur = rowH(row), next = rowH([...row, all[i]]);
        if (Math.abs(next - target) < Math.abs(cur - target)) row.push(all[i++]); else break;
      }
      let h = rowH(row);
      const last = i >= all.length;
      if (last && h > target * 1.15) h = target; // do not blow up a short final row
      let x = 0;
      row.forEach((t) => {
        const w = ar(t) * h;
        Object.assign(t.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
        x += w + gap;
      });
      y += h + gap;
    }
    grid.style.height = Math.max(0, y - gap) + 'px';
  };
  layout();
  if (galleryRO) galleryRO.disconnect();
  galleryRO = new ResizeObserver(layout); galleryRO.observe(grid);
  if (!lightbox) {
    lightbox = document.createElement('div');
    lightbox.className = 'lightbox';
    lightbox.setAttribute('role', 'dialog');
    lightbox.setAttribute('aria-modal', 'true');
    lightbox.innerHTML = '<span class="lb-count"></span><button type="button" class="lb-close" aria-label="Close">&times;</button><button type="button" class="lb-prev" aria-label="Previous">&#8249;</button><button type="button" class="lb-next" aria-label="Next">&#8250;</button><figure><img alt=""><figcaption></figcaption></figure>';
    document.body.appendChild(lightbox);
  }
  const img = lightbox.querySelector('img'), cap = lightbox.querySelector('figcaption'), count = lightbox.querySelector('.lb-count');
  let idx = 0, startX = null;
  const strip = (h) => String(h || '').replace(/<[^>]*>/g, '');
  const show = (i) => {
    idx = (i + photos.length) % photos.length;
    const p = photos[idx];
    img.src = p.src; img.alt = strip(p.caption);
    cap.innerHTML = p.caption || '';
    count.textContent = `${idx + 1} / ${photos.length}`;
  };
  const open = (i) => { show(i); lightbox.classList.add('open'); document.documentElement.style.overflow = 'hidden'; lightbox.querySelector('.lb-close').focus(); };
  const close = () => { lightbox.classList.remove('open'); document.documentElement.style.overflow = ''; };
  tiles.forEach((t) => {
    t.addEventListener('click', () => open(+t.dataset.i));
    t.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(+t.dataset.i); } });
  });
  lightbox.onclick = (e) => {
    if (e.target.closest('.lb-prev')) show(idx - 1);
    else if (e.target.closest('.lb-next')) show(idx + 1);
    else if (e.target.closest('.lb-close') || !e.target.closest('img, figcaption')) close();
  };
  lightbox.ontouchstart = (e) => { startX = e.touches[0].clientX; };
  lightbox.ontouchend = (e) => { if (startX == null) return; const dx = e.changedTouches[0].clientX - startX; startX = null; if (Math.abs(dx) > 50) show(idx + (dx < 0 ? 1 : -1)); };
  const onKey = (e) => {
    if (!lightbox.classList.contains('open')) return;
    if (e.key === 'Escape') close(); else if (e.key === 'ArrowLeft') show(idx - 1); else if (e.key === 'ArrowRight') show(idx + 1);
  };
  if (galleryKey) document.removeEventListener('keydown', galleryKey);
  galleryKey = onKey;
  document.addEventListener('keydown', onKey);
  close();
}

function initReveal() {
  const els = main.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window) || reduced) { els.forEach((el) => el.classList.add('in')); return; }
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
  }, { rootMargin: '0px 0px -6% 0px' });
  els.forEach((el) => io.observe(el));
  observers.push(io);
}

function initProjects() {
  const preview = main.querySelector('.project-preview');
  if (!preview) return;
  const items = [...main.querySelectorAll('.project-item')];
  let active = items.find((i) => i.classList.contains('is-active'))?.dataset.slug;
  let timer = null;
  const show = (slug) => {
    if (slug === active) return;
    active = slug;
    items.forEach((i) => i.classList.toggle('is-active', i.dataset.slug === slug));
    const p = D.projects.find((x) => x.slug === slug);
    clearTimeout(timer);
    preview.classList.add('swap');
    timer = setTimeout(() => {
      preview.innerHTML = V.projectPreview(D, p);
      requestAnimationFrame(() => preview.classList.remove('swap'));
    }, reduced ? 0 : 140);
  };
  // narrow screens: a tap opens/closes the project's details; the "read the full write-up" link inside goes to the page
  const narrow = window.matchMedia('(max-width: 900px)');
  items.forEach((item) => item.addEventListener('click', (e) => {
    if (!narrow.matches) return;
    e.preventDefault();
    const li = item.closest('li');
    const open = li.classList.toggle('is-open');
    item.setAttribute('aria-expanded', open ? 'true' : 'false');
  }));
  items.forEach((item) => {
    item.addEventListener('mouseenter', () => show(item.dataset.slug));
    item.addEventListener('focus', () => show(item.dataset.slug));
  });
  // preload the documents for snappier navigation
  items.forEach((item) => item.addEventListener('mouseenter', () => loadDoc(item.dataset.slug).catch(() => {}), { once: true }));
}

function initContact() {
  const form = main.querySelector('.contact-form');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      let ok = true;
      form.querySelectorAll('input, textarea').forEach((f) => {
        const valid = f.checkValidity() && f.value.trim() !== '';
        f.closest('.field').classList.toggle('invalid', !valid);
        if (!valid) ok = false;
      });
      const btn = form.querySelector('.send-btn');
      if (!ok) {
        btn.classList.remove('shake'); void btn.offsetWidth; btn.classList.add('shake');
        return;
      }
      if (typeof window.onContactSubmit === 'function') { window.onContactSubmit(new FormData(form)); return; }
      const note = form.querySelector('.form-note');
      const say = (txt) => { if (note && txt) { note.textContent = txt; note.hidden = false; } };
      const endpoint = form.dataset.endpoint;
      if (endpoint) {
        btn.disabled = true;
        const data = new FormData(form);
        if (form.dataset.key) { data.append('access_key', form.dataset.key); data.append('from_name', 'Portfolio contact form'); }
        fetch(endpoint, { method: 'POST', body: data, headers: { Accept: 'application/json' } })
          .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok || j.success === false) throw new Error(j.message || String(r.status)); form.reset(); say(note.dataset.sent); })
          .catch(() => say(note.dataset.error))
          .finally(() => { btn.disabled = false; });
        return;
      }
      // no form service: open the visitor's mail app, addressed to the mail link from site.tex
      const to = (D.site.socials.find((x) => /^mailto:/i.test(x.url)) || {}).url?.replace(/^mailto:/i, '') || '';
      const val = (n) => (form.elements[n]?.value || '').trim();
      const body = `${val('message')}\n\n--\n${val('email')}`;
      say(note.dataset.note);
      location.href = `mailto:${to}?subject=${encodeURIComponent(val('subject'))}&body=${encodeURIComponent(body)}`;
    });
    form.addEventListener('input', (e) => e.target.closest('.field')?.classList.remove('invalid'));
  }
  main.querySelectorAll('.copy-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.copy);
        btn.classList.add('copied');
        setTimeout(() => btn.classList.remove('copied'), 1600);
      } catch { /* clipboard unavailable */ }
    });
  });
}

function initToc() {
  const tocBtn = main.querySelector('.toc-collapse');
  if (tocBtn) {
    const aside = tocBtn.closest('.doc-toc');
    tocBtn.addEventListener('click', () => { const o = aside.classList.toggle('is-open'); tocBtn.setAttribute('aria-expanded', o ? 'true' : 'false'); });
    // on narrow screens the list collapses again after a jump
    aside.addEventListener('click', (e) => { if (e.target.closest('a') && window.matchMedia('(max-width: 1100px)').matches) { aside.classList.remove('is-open'); tocBtn.setAttribute('aria-expanded', 'false'); } });
  }
  main.querySelectorAll('.toc-toggle').forEach((b) => b.addEventListener('click', () => {
    const g = b.closest('.toc-group'); const open = g.classList.toggle('is-open');
    b.setAttribute('aria-expanded', open ? 'true' : 'false');
  }));
  const links = [...main.querySelectorAll('.doc-toc a')];
  if (!links.length || !('IntersectionObserver' in window)) return;
  const byId = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));
  const headings = [...byId.keys()].map((id) => document.getElementById(id)).filter(Boolean);
  const visible = new Set(); let lastCur = null;
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) { if (en.isIntersecting) visible.add(en.target); else visible.delete(en.target); }
    let cur = headings.find((h) => visible.has(h));
    if (!cur) cur = headings.filter((h) => h.getBoundingClientRect().top < 120).pop() || headings[0];
    links.forEach((a) => a.classList.toggle('is-current', byId.get(cur.id) === a));
    const cl = byId.get(cur.id); let g = cl && cl.closest('.toc-sub') ? cl.closest('.toc-sub').closest('.toc-group') : null; while (g) { if (!g.classList.contains('is-open') && cur !== lastCur) { g.classList.add('is-open'); g.querySelector('.toc-toggle').setAttribute('aria-expanded', 'true'); } g = g.parentElement.closest('.toc-group'); }
    lastCur = cur;
  }, { rootMargin: '-90px 0px -60% 0px' });
  headings.forEach((h) => io.observe(h));
  observers.push(io);
}

// ------------------------------------------------------------------ cursor dot
// On devices with a mouse the pointer becomes a soft, translucent grey dot.
function initCursor() {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  const dot = document.createElement('div');
  dot.className = 'cursor-dot';
  dot.setAttribute('aria-hidden', 'true');
  document.body.appendChild(dot);
  document.documentElement.classList.add('has-cursor');

  let x = -100, y = -100, dx = x, dy = y, shown = false, raf = 0;
  const FIELD = 'input, textarea, select, [contenteditable]';
  const HOT = 'a, button, [role="button"], summary, label, .project-item';

  const tick = () => {
    const k = reduced ? 1 : 0.28;
    dx += (x - dx) * k; dy += (y - dy) * k;
    dot.style.transform = `translate3d(${dx}px, ${dy}px, 0) translate(-50%, -50%)`;
    raf = (Math.abs(x - dx) > 0.1 || Math.abs(y - dy) > 0.1) ? requestAnimationFrame(tick) : 0;
  };
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    x = e.clientX; y = e.clientY;
    if (!shown) { dx = x; dy = y; shown = true; dot.classList.add('on'); }
    const t = e.target instanceof Element ? e.target : null;
    dot.classList.toggle('hot', !!(t && t.closest(HOT)));
    dot.classList.toggle('off', !!(t && t.closest(FIELD)));
    if (!raf) raf = requestAnimationFrame(tick);
  }, { passive: true });
  document.addEventListener('pointerdown', () => dot.classList.add('down'));
  document.addEventListener('pointerup', () => dot.classList.remove('down'));
  document.documentElement.addEventListener('pointerleave', () => { shown = false; dot.classList.remove('on'); });
}

// ------------------------------------------------------------------ boot
main.setAttribute('tabindex', '-1');
initCursor();
moveIndicator(false);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => moveIndicator(false));
window.addEventListener('resize', () => moveIndicator(false));
initPage();
if (location.hash) setTimeout(() => scrollToHash(location.hash, false), 50);
