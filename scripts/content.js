// Reads the LaTeX content folder and turns it into plain data for the views.
import fs from 'node:fs';
import path from 'node:path';
import { Renderer } from './latex/render.js';
import { parse, Stream, plain } from './latex/parser.js';

export const PALETTE = {
  // strong accents (navigation underline, buttons)
  red: '#ff3131', green: '#57db29', cyan: '#22c4e1', orange: '#ff914d', yellow: '#ffd21f',
  blue: '#0a66c2', purple: '#8c52ff', pink: '#ff66c4', gray: '#737373',
};
export const SOFT = {
  // soft tones (section underlines, borders)
  blue: '#a8d3ff', red: '#ffa8a8', purple: '#b89af4', green: '#a6e39a', orange: '#ffc59e', yellow: '#ffe17a',
  cyan: '#9be3f0', pink: '#ffb3df', gray: '#d9d9d9',
};

function toColor(name, table, fallback) {
  if (!name) return fallback;
  const n = name.trim();
  if (table[n]) return table[n];
  if (/^#?[0-9a-f]{6}$/i.test(n)) return n.startsWith('#') ? n : '#' + n;
  return fallback;
}

export function loadContent(root, { warn = () => {}, resolveAsset }) {
  const read = (rel) => {
    const p = path.join(root, rel);
    return fs.existsSync(p) && fs.statSync(p).isFile() ? fs.readFileSync(p, 'utf8') : null;
  };

  const makeRenderer = (file, custom = {}, customEnvs = {}, baseDir = root, assetScope = '') => {
    const r = new Renderer({
      readFile: (rel) => {
        const p = path.join(baseDir, rel);
        return fs.existsSync(p) && fs.statSync(p).isFile() ? fs.readFileSync(p, 'utf8') : null;
      },
      resolveAsset: (rel, gp) => resolveAsset(baseDir, rel, gp, assetScope),
      warn: (m) => warn(`${file}: ${m}`),
      custom,
      customEnvs,
    });
    return r;
  };

  const run = (file, custom, customEnvs) => {
    const src = read(file);
    if (src == null) { warn(`Missing content file: ${file}`); return null; }
    const r = makeRenderer(file, custom, customEnvs);
    r.blocks(parse(src));
    return r;
  };

  const inlineArg = (s, r) => r.inline(s.arg()).trim();
  const plainArg = (s) => plain(s.arg() || []);
  const blocksOf = (n, r) => r.blocks(n.children);

  // ---------------------------------------------------------------- site
  const site = { name: '', title: '', description: '', lang: 'en', socials: [], nav: [], footer: '' };
  run('site.tex', {
    SiteName: (s, r) => { site.name = inlineArg(s, r); return ''; },
    SiteTitle: (s) => { site.title = plainArg(s).replace(/~/g, '~'); return ''; },
    SiteDescription: (s) => { site.description = plainArg(s); return ''; },
    SiteLanguage: (s) => { site.lang = plainArg(s); return ''; },
    Social: (s, r) => {
      const icon = plainArg(s);
      const url = plain(s.arg() || []).replace(/\\([#%&_~])/g, '$1');
      const label = inlineArg(s, r);
      site.socials.push({ icon, url, label });
      return '';
    },
    Nav: (s, r) => {
      const color = plain(s.opt() || []);
      const key = plainArg(s);
      const label = inlineArg(s, r);
      site.nav.push({ key, label, accent: toColor(color, PALETTE, PALETTE.gray) });
      return '';
    },
    FooterText: (s, r) => { site.footer = inlineArg(s, r); return ''; },
  });
  if (!site.title) site.title = site.name;

  // Shared helpers for simple pages
  const pageCommon = (page) => ({
    PageTitle: (s, r) => { page.titleColor = toColor(plain(s.opt() || []), PALETTE, null); page.title = inlineArg(s, r); return ''; },
    Label: (s, r) => { const k = plainArg(s); page.labels[k] = inlineArg(s, r); return ''; },
  });
  const introEnv = (page) => ({ Intro: (n, s, r) => { page.intro = blocksOf(n, r); return ''; } });

  // ---------------------------------------------------------------- home
  const home = { greeting: '', photo: null, about: '', labels: {} };
  run('pages/home.tex', {
    ...pageCommon(home),
    Greeting: (s, r) => { home.greeting = inlineArg(s, r); return ''; },
    Photo: (s) => {
      const alt = plain(s.opt() || []);
      const rel = plainArg(s);
      const asset = resolveAsset(root, rel, [''], '');
      if (!asset) warn(`pages/home.tex: photo not found: ${rel}`);
      home.photo = asset ? { src: asset.url, alt: alt || site.name } : null;
      return '';
    },
  }, {
    About: (n, s, r) => { home.about = blocksOf(n, r); return ''; },
  });

  // ---------------------------------------------------------------- background
  const background = { title: '', sections: [], labels: {} };
  let curSection = null;
  let curEntry = null;
  const ensureSection = () => {
    if (!curSection) { curSection = { title: '', color: SOFT.blue, entries: [], skills: [] }; background.sections.push(curSection); }
    return curSection;
  };
  run('pages/background.tex', {
    ...pageCommon(background),
    // \Download{assets/file.pdf}{Label}: a download button at the top of the page
    Download: (s, r) => {
      const rel = plainArg(s);
      const label = inlineArg(s, r);
      const asset = resolveAsset(root, rel, [''], '', true);
      if (!asset) { warn(`pages/background.tex: download file not found: ${rel}`); return ''; }
      background.download = { href: asset.url, label, name: rel.split('/').pop() };
      return '';
    },
    Section: (s, r) => {
      const color = toColor(plain(s.opt() || []), SOFT, SOFT.blue);
      curSection = { title: inlineArg(s, r), color, entries: [], skills: [] };
      curSection.id = r.uniqueId(plain([{ type: 'text', value: curSection.title }]));
      background.sections.push(curSection);
      curEntry = null;
      return '';
    },
    Entry: (s, r) => {
      const link = plain(s.opt() || []);
      curEntry = {
        link: link || null, title: inlineArg(s, r), date: inlineArg(s, r), location: inlineArg(s, r), note: inlineArg(s, r),
        roles: [], highlights: [],
      };
      ensureSection().entries.push(curEntry);
      return '';
    },
    Position: (s, r) => {
      const link = plain(s.opt() || []);
      curEntry = {
        kind: 'job', link: link || null, title: inlineArg(s, r), date: inlineArg(s, r), location: inlineArg(s, r), note: inlineArg(s, r),
        roles: [], highlights: [], subs: [],
      };
      ensureSection().entries.push(curEntry);
      return '';
    },
    Also: (s, r) => {
      const name = inlineArg(s, r);
      const date = inlineArg(s, r);
      if (curEntry) curEntry.subs.push({ name, date, highlights: [] });
      return '';
    },
    Role: (s, r) => {
      const role = inlineArg(s, r);
      if (curEntry) curEntry.roles.push(role);
      return '';
    },
    SkillGroup: (s, r) => {
      const name = inlineArg(s, r);
      const items = r.inline(s.arg()).split(/,(?![^<]*>)/).map((x) => x.trim()).filter(Boolean);
      ensureSection().skills.push({ name, items });
      curEntry = null;
      return '';
    },
  }, {
    Highlights: (n, s, r) => {
      const items = [];
      let cur = null;
      const st = new Stream(n.children);
      while (!st.done()) {
        const t = st.next();
        if (t.type === 'macro' && t.name === 'item') { st.opt(); cur = []; items.push(cur); continue; }
        if (cur) cur.push(t);
      }
      const html = items.map((nodes) => r.inline(nodes).trim());
      if (curEntry) {
        const target = curEntry.subs && curEntry.subs.length ? curEntry.subs[curEntry.subs.length - 1] : curEntry;
        target.highlights.push(...html);
      }
      return '';
    },
  });

  // ---------------------------------------------------------------- projects page
  const projectsPage = { title: 'Projects', titleColor: null, intro: '', labels: {}, categories: [] };
  run('pages/projects.tex', {
    ...pageCommon(projectsPage),
    Category: (s, r) => { const cn = plain(s.opt() || []); const color = toColor(cn, PALETTE, null); const soft = toColor(cn, SOFT, null); const key = plainArg(s); projectsPage.categories.push({ key, color, soft, title: inlineArg(s, r) }); return ''; },
  }, introEnv(projectsPage));

  // ---------------------------------------------------------------- interests
  const interests = { title: 'Interests', titleColor: null, intro: '', items: [], gallery: [], labels: {} };
  run('pages/interests.tex', {
    ...pageCommon(interests),
    Interest: (s, r) => {
      const icon = plain(s.opt() || []) || 'sparkles';
      interests.items.push({ icon, title: inlineArg(s, r), subtitle: inlineArg(s, r), description: inlineArg(s, r) });
      return '';
    },
    // \GalleryImage[wide|tall|big]{assets/gallery/photo.jpg}{caption}
    GalleryImage: (s, r) => {
      const shape = plain(s.opt() || []).trim();
      const rel = plainArg(s);
      const caption = inlineArg(s, r);
      const asset = resolveAsset(root, rel, [''], '');
      if (!asset) { warn(`pages/interests.tex: gallery image not found: ${rel}`); return ''; }
      interests.gallery.push({ src: asset.url, caption, shape, w: asset.w || 0, h: asset.h || 0 });
      return '';
    },
  }, introEnv(interests));

  // ---------------------------------------------------------------- contact
  const contact = { title: 'Contact', titleColor: null, intro: '', formTitle: '', fields: [], button: 'Send', note: '', endpoint: '', accessKey: '', sent: '', error: '', labels: {} };
  run('pages/contact.tex', {
    ...pageCommon(contact),
    FormTitle: (s, r) => { contact.formTitle = inlineArg(s, r); return ''; },
    FormField: (s, r) => {
      const type = plain(s.opt() || []) || 'text';
      contact.fields.push({ type, name: plainArg(s), label: inlineArg(s, r), placeholder: plainArg(s) });
      return '';
    },
    FormButton: (s, r) => { contact.button = inlineArg(s, r); return ''; },
    FormNote: (s, r) => { contact.note = inlineArg(s, r); return ''; },
    FormEndpoint: (s) => { contact.endpoint = plainArg(s); return ''; },
    FormAccessKey: (s) => { contact.accessKey = plainArg(s); return ''; },
    FormSent: (s, r) => { contact.sent = inlineArg(s, r); return ''; },
    FormError: (s, r) => { contact.error = inlineArg(s, r); return ''; },
  }, introEnv(contact));

  // ---------------------------------------------------------------- projects
  const projects = [];
  const projDir = path.join(root, 'projects');
  const folders = fs.existsSync(projDir) ? fs.readdirSync(projDir).filter((f) => fs.statSync(path.join(projDir, f)).isDirectory()) : [];
  for (const slug of folders) {
    const dir = path.join(projDir, slug);
    const metaFile = path.join(dir, 'project.tex');
    if (!fs.existsSync(metaFile)) { warn(`projects/${slug}: no project.tex, skipped`); continue; }
    const p = { slug, title: slug, category: '', order: 999, date: '', tags: [], cover: null, summary: '', links: [], document: 'main.tex', hidden: false };
    const r = makeRenderer(`projects/${slug}/project.tex`, {
      ProjectTitle: (s, rr) => { p.title = inlineArg(s, rr); return ''; },
      ProjectCategory: (s) => { p.category = plainArg(s); return ''; },
      ProjectSlug: (s) => { p.urlSlug = plainArg(s).replace(/[^A-Za-z0-9_-]/g, '-'); return ''; },
      ProjectOrder: (s) => { p.order = parseFloat(plainArg(s)) || 999; return ''; },
      ProjectDate: (s, rr) => { p.date = inlineArg(s, rr); return ''; },
      ProjectTags: (s, rr) => { p.tags = rr.inline(s.arg()).split(',').map((x) => x.trim()).filter(Boolean); return ''; },
      ProjectCover: (s) => {
        const rel = plainArg(s);
        const a = resolveAsset(dir, rel, [''], `projects/${slug}`);
        if (!a) warn(`projects/${slug}: cover not found: ${rel}`);
        p.cover = a ? a.url : null;
        return '';
      },
      ProjectLink: (s, rr) => { p.links.push({ label: inlineArg(s, rr), url: plain(s.arg() || []) }); return ''; },
      ProjectPDF: (s, rr) => {
        const rel = plainArg(s);
        const label = inlineArg(s, rr);
        const a = resolveAsset(dir, rel, [''], `projects/${slug}`, true);
        if (!a) warn(`projects/${slug}: download file not found: ${rel}`);
        else p.pdf = { href: a.url, label, name: rel.split('/').pop() };
        return '';
      },
      ProjectDocument: (s) => { p.document = plainArg(s); return ''; },
      ProjectStatus: (s, rr) => { p.status = inlineArg(s, rr); return ''; },
      ProjectHidden: () => { p.hidden = true; return ''; },
      ProjectAuthors: (s, rr) => { p.authors = inlineArg(s, rr); return ''; },
      ProjectSupervisor: (s, rr) => { (p.supervisors = p.supervisors || []).push({ role: inlineArg(s, rr), name: inlineArg(s, rr) }); return ''; },
      ProjectAbstractFirst: () => { p.abstractFirst = true; return ''; },
      ProjectSkipTitlePage: () => { p.skipTitle = true; return ''; },
    }, {
      ProjectSummary: (n, s, rr) => { p.summary = blocksOf(n, rr); return ''; },
    }, dir, `projects/${slug}`);
    r.blocks(parse(fs.readFileSync(metaFile, 'utf8')));
    if (p.urlSlug) p.slug = p.urlSlug;

    // the Overleaf document
    p.doc = null;
    const docPath = path.join(dir, p.document);
    if (p.document && fs.existsSync(docPath)) {
      const dr = makeRenderer(`projects/${slug}/${p.document}`, {}, {}, dir, `projects/${slug}`);
      dr.opts.referencesTitle = projectsPage.labels.references || 'References';
      let src = fs.readFileSync(docPath, 'utf8');
      if (p.skipTitle) {
        // drop the title page: everything between \begin{document} and the first \clearpage (if it holds no heading)
        src = src.replace(/(\\begin\{document\})([\s\S]*?\\clearpage)/, (m, a, b) => (/\\(chapter|section)/.test(b) ? m : a));
        src = src.replace(/\\begin\{titlepage\}[\s\S]*?\\end\{titlepage\}/, '');
      }
      if (p.abstractFirst) {
        // web only: show the abstract before the acknowledgments
        const blk = (name) => { const a = src.indexOf(`\\chapterx{${name}}`); if (a < 0) return null; const c = src.indexOf('\\clearpage', a); return c < 0 ? null : [a, c + '\\clearpage'.length]; };
        const ak = blk('ACKNOWLEDGMENTS'), ab = blk('ABSTRACT');
        if (ak && ab && ak[0] < ab[0]) src = src.slice(0, ak[0]) + src.slice(ab[0], ab[1]) + '\n\n' + src.slice(ak[0], ak[1]) + src.slice(ab[1]);
      }
      p.doc = dr.renderDocument(src);
    } else if (p.document) {
      warn(`projects/${slug}: document ${p.document} not found`);
    }
    if (!p.hidden) projects.push(p);
  }
  projects.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));

  return { site, home, background, projectsPage, projects, interests, contact };
}
