// HTML templates shared by the build (pre-rendering) and the browser (page transitions).
// Pure string functions: no DOM access here.

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const icon = (D, name, cls = 'icon') => {
  const svg = D.icons[name] || D.icons.link || '';
  return `<span class="${cls}" aria-hidden="true">${svg}</span>`;
};
const stripTags = (h) => String(h ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

export const PAGE_KEYS = ['home', 'background', 'projects', 'interests', 'contact'];

export function url(D, path = '') {
  return D.base + path.replace(/^\//, '');
}

export function pagePath(key) {
  return key === 'home' ? '' : `${key}/`;
}

// ------------------------------------------------------------------ header
export function header(D, activeKey) {
  const items = D.site.nav.map((n) => `
      <li><a class="nav-link${n.key === activeKey ? ' is-active' : ''}" href="${url(D, pagePath(n.key))}" data-key="${esc(n.key)}"
        style="--accent:${n.accent}"${n.key === activeKey ? ' aria-current="page"' : ''}>${n.label}</a></li>`).join('');
  return `
  <header class="site-header">
    <div class="header-inner">
      <a class="brand" href="${url(D)}" aria-label="${esc(stripTags(D.site.name))} — ${esc(stripTags(navLabel(D, 'home')))}"><span class="brand-text">${D.site.name}</span></a>
      <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav" aria-label="Menu">
        ${icon(D, 'menu', 'icon icon-open')}${icon(D, 'x', 'icon icon-close')}
      </button>
      <nav class="site-nav" id="site-nav" aria-label="Main">
        <ul>${items}
        </ul>
        <span class="nav-indicator" aria-hidden="true"></span>
      </nav>
    </div>
  </header>`;
}

export function navLabel(D, key) {
  const n = D.site.nav.find((x) => x.key === key);
  return n ? n.label : key;
}

export function accentOf(D, key) {
  const n = D.site.nav.find((x) => x.key === key);
  return n ? n.accent : '#737373';
}

export function pageTitle(D, route) {
  const name = stripTags(D.site.name);
  if (route.key === 'project') {
    const p = D.projects.find((x) => x.slug === route.slug);
    return p ? `${stripTags(p.title)} · ${name}` : name;
  }
  if (route.key === '404') return `404 · ${name}`;
  return `${stripTags(navLabel(D, route.key))} · ${name}`;
}

// ------------------------------------------------------------------ pages
export function home(D) {
  const h = D.home;
  const photo = h.photo
    ? `<img decoding="async" src="${esc(h.photo.src)}" alt="${esc(h.photo.alt)}" width="900" height="675" fetchpriority="high">`
    : '<div class="photo-empty"></div>';
  const socials = D.site.socials.map((s) => `
        <a href="${esc(s.url)}" class="footer-icon" aria-label="${esc(stripTags(s.label))}" title="${esc(stripTags(s.label))}"${/^https?:/.test(s.url) ? ' target="_blank" rel="noopener"' : ''}>${icon(D, socialIcon(D, s.icon))}</a>`).join('');
  return `
  <section class="home" aria-labelledby="greeting">
    <figure class="home-photo">${photo}</figure>
    <div class="home-text">
      <h1 class="greeting" id="greeting">${splitLetters(h.greeting)}</h1>
      <div class="about prose">${h.about}</div>
    </div>
  </section>
  <footer class="home-footer">
    <div class="footer-tab">${socials}
    </div>
  </footer>`;
}

function splitLetters(html) {
  // animate each character of a plain greeting; fall back to raw HTML if it has markup
  if (/<|&/.test(html)) return html;
  return [...html].map((c, i) => `<span class="ch" style="--i:${i}">${c === ' ' ? '&nbsp;' : esc(c)}</span>`).join('');
}

export function socialIcon(D, name) {
  if (D.icons['brand-' + name]) return 'brand-' + name;
  return D.icons[name] ? name : 'link';
}

export function background(D) {
  const b = D.background;
  const sections = b.sections.map((sec) => {
    const entries = sec.entries.map((e) => {
      const title = e.link ? `<a href="${esc(e.link)}" target="_blank" rel="noopener">${e.title}</a>` : e.title;
      const sub = (e.location || e.note)
        ? `<div class="entry-sub"><span class="entry-loc">${e.location}</span>${e.note ? `<span class="entry-note">${e.note}</span>` : ''}</div>` : '';
      const roles = e.roles.map((r) => `<p class="entry-role">${fixLinks(D, r)}</p>`).join('');
      const list = (items) => items.length ? `<ul class="entry-highlights">${items.map((x) => `<li>${x}</li>`).join('')}</ul>` : '';
      const subs = (e.subs || []).map((s) => `
          <div class="entry-also"><span class="entry-role">${fixLinks(D, s.name)}</span>${s.date ? `<span class="entry-date">${s.date}</span>` : ''}</div>${list(s.highlights)}`).join('');
      const hl = list(e.highlights) + subs;
      return `
        <article class="entry reveal${e.kind === 'job' ? ' is-job' : ''}">
          <div class="entry-head"><h3 class="entry-title">${title}</h3>${e.date ? `<span class="entry-date">${e.date}</span>` : ''}</div>
          ${sub}${roles}${hl}
        </article>`;
    }).join('');
    const skills = sec.skills.map((g) => `
        <div class="skill-group reveal${g.name ? '' : ' no-name'}">
          ${g.name ? `<h3 class="skill-name">${g.name}</h3>` : ''}
          <ul class="chips">${g.items.map((it, i) => `<li style="--i:${i}">${it}</li>`).join('')}</ul>
        </div>`).join('');
    return `
    <section class="bg-section" style="--sec:${sec.color}" id="${esc(sec.id || '')}">
      <h2 class="section-title"><span>${sec.title}</span></h2>
      <div class="entries">${entries}${skills}</div>
    </section>`;
  }).join('');
  const title = b.title ? `<h1 class="page-title" style="--sec:${b.titleColor || accentOf(D, 'background')}"><span>${b.title}</span></h1>` : `<h1 class="sr-only">${navLabel(D, 'background')}</h1>`;
  const dl = b.download ? `<a class="download-btn" href="${esc(b.download.href)}" download="${esc(b.download.name)}">${icon(D, 'download')}<span>${b.download.label}</span></a>` : '';
  return `<div class="bg-page">${title}${dl}${sections}</div>`;
}

const creditsHtml = (p) => (p.authors || (p.supervisors && p.supervisors.length) ? `<div class="project-credits">${p.authors ? `<p class="project-authors">${p.authors}</p>` : ''}${(p.supervisors || []).map((x) => `<p class="project-supervisor"><span>${x.role}</span> ${x.name}</p>`).join('')}</div>` : '');

// \href{project:slug}{text} in LaTeX points at another project page
const fixLinks = (D, html) => String(html || '').replace(/href="project:([\w-]+)"/g, (_, slug) => `href="${url(D, `projects/${slug}/`)}"`);

export function projectPreview(D, p) {
  if (!p) return '';
  const L = D.projectsPage.labels;
  const tags = p.tags.length ? `<ul class="tags">${p.tags.map((t) => `<li>${t}</li>`).join('')}</ul>` : '';
  const img = p.cover
    ? `<img decoding="async" src="${esc(p.cover)}" alt="" loading="lazy">`
    : `<span class="photo-placeholder">${L.nophoto || ''}</span>`;
  const gc = (D.projectsPage.categories || []).find((c) => c.key === p.category)?.color;
  return `
      <div class="preview-desc"${gc ? ` style="--gc:${gc}"` : ''}>
        ${p.date || p.status ? `<p class="preview-date">${p.status ? `<span class="status-badge">${p.status}</span> ` : ''}${p.date || ''}</p>` : ''}
        ${creditsHtml(p)}
        <div class="preview-summary prose">${fixLinks(D, p.summary)}</div>
        ${tags}
        <a class="read-more" href="${url(D, `projects/${p.slug}/`)}">${L.readmore || 'Read more'} ${icon(D, 'arrow-right')}</a>
      </div>
      <a class="preview-photo" href="${url(D, `projects/${p.slug}/`)}" tabindex="-1" aria-hidden="true">${img}</a>`;
}

export function projects(D) {
  const P = D.projectsPage;
  const cats = P.categories || [];
  const groups = [];
  const loose = D.projects.filter((p) => !cats.some((c) => c.key === p.category));
  if (loose.length) groups.push({ title: '', items: loose });
  for (const c of cats) {
    const items = D.projects.filter((p) => p.category === c.key);
    if (items.length) groups.push({ title: c.title, color: c.color, soft: c.soft, items });
  }
  const ordered = groups.flatMap((g) => g.items);
  let n = 0;
  const item = (p, g) => { const i = n++; return `
      <li class="reveal" style="--i:${i}${g.soft ? `;--line:${g.soft}` : ''}">
        <a class="project-item${i === 0 ? ' is-active' : ''}" href="${url(D, `projects/${p.slug}/`)}" data-slug="${esc(p.slug)}">
          <span class="project-title">${p.title}${p.status ? ` <span class="status-badge">${p.status}</span>` : ''}<span class="project-link-icon">${D.icons.link}</span></span><span class="project-chevron" aria-hidden="true">${icon(D, 'chevron-down')}</span>
        </a>
        <div class="project-mobile">
          ${p.cover ? `<img decoding="async" src="${esc(p.cover)}" alt="" loading="lazy">` : ''}
          <div class="prose">${fixLinks(D, p.summary)}</div>
          <a class="read-more" href="${url(D, `projects/${p.slug}/`)}">${D.projectsPage.labels.readmore || 'Read more'} ${icon(D, 'arrow-right')}</a>
        </div>
      </li>`; };
  const list = groups.map((g) => (g.title ? `
      <li class="group-head" role="presentation"><h2${g.color ? ` style="--accent:${g.color}"` : ''}>${g.title}</h2></li>` : '') + g.items.map((p) => item(p, g)).join('')).join('');
  return `
  <div class="projects-page">
    <h1 class="page-title" style="--sec:${P.titleColor || accentOf(D, 'projects')}"><span>${P.title}</span></h1>
    ${P.intro ? `<div class="page-intro prose">${P.intro}</div>` : ''}
    <div class="projects-layout">
      <ul class="project-list">${list}
      </ul>
      <aside class="project-preview" aria-live="polite">${projectPreview(D, ordered[0])}
      </aside>
    </div>
  </div>`;
}

export function project(D, p, doc) {
  const L = D.projectsPage.labels;
  const tags = p.tags.length ? `<ul class="tags">${p.tags.map((t) => `<li>${t}</li>`).join('')}</ul>` : '';
  const pdf = p.pdf ? `<a class="download-btn" href="${esc(p.pdf.href)}" download="${esc(p.pdf.name)}">${icon(D, 'download')}<span>${p.pdf.label}</span></a>` : '';
  const links = p.links.length || p.pdf ? `<div class="project-links">${pdf}${p.links.map((l) => `<a class="btn-link" href="${esc(l.url)}" target="_blank" rel="noopener">${l.label} ${icon(D, 'arrow-up-right')}</a>`).join('')}</div>` : '';
  const toc = doc && doc.toc.length > 1 ? `
      <aside class="doc-toc" aria-label="${esc(stripTags(L.contents || 'Contents'))}">
        <button type="button" class="toc-title toc-collapse" aria-expanded="false"><span>${L.contents || 'Contents'}</span>${icon(D, 'chevron-down')}</button>
        <div class="toc-body"><ol>${tocHtml(D, doc.toc)}</ol></div>
      </aside>` : '';
  const body = fixLinks(D, doc ? doc.html : `<div class="prose">${p.summary}</div>`);
  return `
  <article class="project-page">
    <a class="back-link" href="${url(D, 'projects/')}">${icon(D, 'arrow-left')} ${L.back || 'Projects'}</a>
    <header class="project-header">
      ${p.date || p.status ? `<p class="project-date">${p.status ? `<span class="status-badge">${p.status}</span> ` : ''}${p.date || ''}</p>` : ''}
      <h1 class="project-h1">${p.title}</h1>
      ${creditsHtml(p)}
      ${tags}${links}
    </header>
    ${p.cover ? `<figure class="project-cover"><img decoding="async" src="${esc(p.cover)}" alt=""></figure>` : ''}
    ${doc && p.summary ? `<section class="doc-abstract project-summary prose"><h2 class="abstract-title">Overview</h2>${fixLinks(D, p.summary)}</section>` : ''}
    <div class="doc-layout${toc ? ' has-toc' : ''}">
      <div class="doc-body prose">${body}</div>${toc}
    </div>
  </article>`;
}

export function interests(D) {
  const I = D.interests;
  // photo gallery in justified rows: every photo keeps its own proportions (placeholders are blank 3:2 tiles)
  const gallery = (I.gallery && I.gallery.length)
    ? I.gallery.map((g, i) => {
        const ar = g.w && g.h ? (g.w / g.h).toFixed(4) : '1.5';
        // column span (of 12): sizes vary, proportions never do; \GalleryImage[big|small] overrides the automatic rhythm
        const land = ar >= 1;
        const auto = land ? [6, 4, 5, 4, 7, 4, 5][i % 7] : [3, 4, 3, 2][i % 4];
        const span = g.shape === 'big' ? (land ? 8 : 5) : g.shape === 'small' ? (land ? 3 : 2) : auto;
        return `<figure class="gal-tile reveal" style="--i:${i};--ar:${ar};--span:${span};--spanm:${span >= 6 ? 6 : 3}" data-i="${i}"${g.shape === 'big' ? ' data-big="1"' : ''} tabindex="0" role="button" aria-label="${esc(stripTags(g.caption || 'Open photo'))}"><img decoding="async" src="${esc(g.src)}" alt="${esc(stripTags(g.caption || ''))}" loading="lazy">${g.caption ? `<figcaption>${g.caption}</figcaption>` : ''}</figure>`;
      }).join('')
    : [1.5, 0.75, 1.5, 1.5, 0.75, 1.5].map((ar, i) => `<figure class="gal-tile gal-ph reveal" style="--i:${i};--ar:${ar}" aria-hidden="true"></figure>`).join('');
  const inline = I.items.map((it) => `
      <li title="${esc(stripTags(it.description || ''))}"><span class="interest-icon">${D.icons[it.icon] || D.icons.sparkles || ''}</span><span class="interest-name">${it.title}</span>${it.subtitle ? `<span class="interest-sub">${it.subtitle}</span>` : ''}</li>`).join('');
  return `
  <div class="interests-page">
    <h1 class="page-title" style="--sec:${I.titleColor || accentOf(D, 'interests')}"><span>${I.title}</span></h1>
    <ul class="interest-inline">${inline}
    </ul>
    ${I.intro ? `<div class="page-intro gallery-intro prose">${I.intro}</div>` : ''}
    <div class="gallery">${gallery}</div>
  </div>`;
}

export function contact(D) {
  const C = D.contact;
  const links = D.site.socials.map((s) => {
    const isMail = s.url.startsWith('mailto:');
    const copy = isMail ? `<button class="copy-btn" type="button" data-copy="${esc(s.url.replace(/^mailto:/, ''))}" aria-label="Copy">${icon(D, 'copy', 'icon i-copy')}${icon(D, 'check', 'icon i-check')}</button>` : '';
    return `
        <li><a href="${esc(s.url)}"${/^https?:/.test(s.url) ? ' target="_blank" rel="noopener"' : ''}>${icon(D, socialIcon(D, s.icon), 'icon contact-icon')}<span class="link-label">${s.label}</span></a>${copy}</li>`;
  }).join('');
  const fields = C.fields.map((f) => {
    const id = `f-${esc(f.name)}`;
    const control = f.type === 'textarea'
      ? `<textarea id="${id}" name="${esc(f.name)}" placeholder="${esc(f.placeholder)}" rows="7" required></textarea>`
      : `<input id="${id}" name="${esc(f.name)}" type="${f.type === 'email' ? 'email' : 'text'}" placeholder="${esc(f.placeholder)}" required${f.type === 'email' ? ' autocomplete="email"' : ''}>`;
    return `
        <div class="field"><label for="${id}">${f.label}</label>${control}</div>`;
  }).join('');
  return `
  <div class="contact-page">
    <h1 class="sr-only">${C.title}</h1>
    <div class="contact-layout">
      <div class="contact-info">
        ${C.intro ? `<div class="contact-intro prose">${C.intro}</div>` : ''}
        <ul class="contact-links">${links}
        </ul>
      </div>
      <form class="contact-form" novalidate${C.endpoint ? ` data-endpoint="${esc(C.endpoint)}"` : ''}${C.accessKey ? ` data-key="${esc(C.accessKey)}"` : ''}>
        ${C.formTitle ? `<h2 class="form-title">${C.formTitle}</h2>` : ''}${fields}
        <div class="form-actions">
          <p class="form-note" role="status" hidden data-note="${esc(C.note)}" data-sent="${esc(C.sent)}" data-error="${esc(C.error)}"></p>
          <button class="send-btn" type="submit">${C.button}</button>
        </div>
      </form>
    </div>
  </div>`;
}

export function notFound(D) {
  return `
  <div class="notfound">
    <p class="nf-code">404</p>
    <p>This page doesn't exist.</p>
    <a class="back-link" href="${url(D)}">${icon(D, 'arrow-left')} ${navLabel(D, 'home')}</a>
  </div>`;
}

// ------------------------------------------------------------------ routing
export function matchRoute(D, pathname) {
  let p = pathname;
  if (p.startsWith(D.base)) p = p.slice(D.base.length);
  else if (p + '/' === D.base) p = '';
  p = p.replace(/index\.html$/, '').replace(/^\/+|\/+$/g, '');
  if (p === '') return { key: 'home' };
  const parts = p.split('/');
  if (parts[0] === 'projects' && parts[1]) {
    const slug = decodeURIComponent(parts[1]);
    return D.projects.some((x) => x.slug === slug) ? { key: 'project', slug } : { key: '404' };
  }
  if (parts.length === 1 && PAGE_KEYS.includes(parts[0])) return { key: parts[0] };
  return { key: '404' };
}

export function renderRoute(D, route, doc) {
  switch (route.key) {
    case 'home': return home(D);
    case 'background': return background(D);
    case 'projects': return projects(D);
    case 'interests': return interests(D);
    case 'contact': return contact(D);
    case 'project': return project(D, D.projects.find((x) => x.slug === route.slug), doc);
    default: return notFound(D);
  }
}

// which nav item is highlighted for a route
export function navKey(route) {
  return route.key === 'project' ? 'projects' : route.key;
}

// Contents list: an entry owns the deeper entries that follow it (chapter > section > subsection); they stay collapsed until its arrow is used.
function tocHtml(D, toc) {
  const link = (t) => `<a href="#${t.id}">${t.num ? `<span class="toc-num">${t.num}</span>` : ''}${t.title}</a>`;
  const root = { kids: [], depth: -1 };
  const stack = [root];
  for (const t of toc) {
    const d = t.depth ?? (t.level === 1 ? 1 : 2);
    while (stack.length > 1 && stack[stack.length - 1].depth >= d) stack.pop();
    const node = { t, depth: d, kids: [] };
    stack[stack.length - 1].kids.push(node);
    stack.push(node);
  }
  const render = (nodes, lvl) => nodes.map((n) => {
    const cls = `toc-l${lvl === 0 ? 1 : 2}`;
    if (!n.kids.length) return `<li class="${cls}"><div class="toc-row"><span class="toc-toggle-spacer"></span>${link(n.t)}</div></li>`;
    return `<li class="${cls} toc-group"><div class="toc-row"><button type="button" class="toc-toggle" aria-expanded="false" aria-label="Toggle subsections">${icon(D, 'chevron-down')}</button>${link(n.t)}</div><ol class="toc-sub">${render(n.kids, lvl + 1)}</ol></li>`;
  }).join('');
  return render(root.kids, 0);
}
