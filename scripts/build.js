// Builds the static site into dist/ from content/ (LaTeX) and src/ (design).
//   node scripts/build.js            -> production build
//   BASE_PATH=/repo/ node scripts/build.js   (when hosted in a sub folder, e.g. GitHub Pages)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { loadContent } from './content.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = path.join(ROOT, 'content');
const SRC = path.join(ROOT, 'src');
const PUBLIC = path.join(ROOT, 'public');
const DIST = path.join(ROOT, 'dist');

const UI_ICONS = ['menu', 'x', 'link', 'arrow-left', 'arrow-right', 'arrow-up-right', 'copy', 'check', 'sparkles', 'mail', 'chevron-down', 'download'];
const IMAGE_EXT = ['', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.avif', '.pdf', '.eps'];

const c = { dim: (s) => `\x1b[2m${s}\x1b[0m`, yellow: (s) => `\x1b[33m${s}\x1b[0m`, green: (s) => `\x1b[32m${s}\x1b[0m`, red: (s) => `\x1b[31m${s}\x1b[0m` };

function normBase(b) {
  if (!b) return '/';
  if (!b.startsWith('/')) b = '/' + b;
  if (!b.endsWith('/')) b += '/';
  return b.replace(/\/+/g, '/');
}

function copyDir(from, to) {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const a = path.join(from, e.name);
    const b = path.join(to, e.name);
    if (e.isDirectory()) copyDir(a, b);
    else fs.copyFileSync(a, b);
  }
}

function hashOf(files) {
  const h = crypto.createHash('sha1');
  for (const f of files) if (fs.existsSync(f)) h.update(fs.readFileSync(f));
  return h.digest('hex').slice(0, 8);
}

function tryConvertPdf(src, dest) {
  const attempts = [
    ['pdftoppm', ['-png', '-singlefile', '-r', '200', src, dest.replace(/\.png$/, '')]],
    ['sips', ['-s', 'format', 'png', src, '--out', dest]],
    ['magick', ['-density', '200', `${src}[0]`, dest]],
    ['convert', ['-density', '200', `${src}[0]`, dest]],
  ];
  for (const [cmd, args] of attempts) {
    try {
      const r = spawnSync(cmd, args, { stdio: 'ignore' });
      if (r.status === 0 && fs.existsSync(dest)) return true;
    } catch { /* try next */ }
  }
  return false;
}

// width/height of a JPEG or PNG without extra dependencies (used for the gallery layout)
function rasterSize(file) {
  try {
    const fd = fs.openSync(file, 'r');
    const head = Buffer.alloc(32);
    fs.readSync(fd, head, 0, 32, 0);
    if (head.readUInt32BE(0) === 0x89504e47) { fs.closeSync(fd); return { w: head.readUInt32BE(16), h: head.readUInt32BE(20) }; }
    if (head[0] === 0xff && head[1] === 0xd8) {
      const size = fs.fstatSync(fd).size;
      const buf = Buffer.alloc(Math.min(size, 1 << 20));
      fs.readSync(fd, buf, 0, buf.length, 0);
      fs.closeSync(fd);
      let i = 2;
      while (i + 9 < buf.length) {
        if (buf[i] !== 0xff) { i++; continue; }
        const m = buf[i + 1];
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
        i += 2 + buf.readUInt16BE(i + 2);
      }
      return null;
    }
    fs.closeSync(fd);
  } catch { /* unknown size */ }
  return null;
}

export async function build({ dev = false, quiet = false } = {}) {
  const t0 = Date.now();
  const base = normBase(process.env.BASE_PATH);
  const warnings = [];
  const warn = (m) => warnings.push(m);

  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  // -------------------------------------------------------------- assets referenced from LaTeX
  const copied = new Map();
  const resolveAsset = (baseDir, rel, graphicspath = [''], scope = '', raw = false) => {
    rel = rel.replace(/^\.\//, '');
    for (const gp of graphicspath) {
      for (const ext of IMAGE_EXT) {
        const p = path.join(baseDir, gp, rel + ext);
        if (!fs.existsSync(p) || !fs.statSync(p).isFile()) continue;
        const ck = p + (raw ? '#raw' : '');
        if (copied.has(ck)) return copied.get(ck);
        let relOut = path.relative(baseDir, p).split(path.sep).join('/');
        if (relOut.startsWith('..')) relOut = path.basename(p);
        let outRel = ['media', scope, relOut].filter(Boolean).join('/');
        const dest = path.join(DIST, outRel);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        let type = 'image';
        const lower = p.toLowerCase();
        if (raw) {
          fs.copyFileSync(p, dest); // downloads are kept exactly as they are
        } else if (lower.endsWith('.pdf')) {
          const png = dest.replace(/\.pdf$/i, '.png');
          if (tryConvertPdf(p, png)) outRel = outRel.replace(/\.pdf$/i, '.png');
          else { fs.copyFileSync(p, dest); type = 'pdf'; warn(`${rel}: could not convert PDF figure to PNG (install poppler / use PNG); embedding the PDF instead`); }
        } else if (lower.endsWith('.eps')) {
          warn(`${rel}: EPS figures can't be shown in browsers, please export it as PNG/PDF`);
          return null;
        } else {
          fs.copyFileSync(p, dest);
        }
        const res = { url: base + outRel, type, ...(type === 'image' ? rasterSize(p) || {} : {}) };
        copied.set(ck, res);
        return res;
      }
    }
    return null;
  };

  const content = loadContent(CONTENT, { warn, resolveAsset });

  // -------------------------------------------------------------- icons
  const icons = {};
  const iconFile = (name) => {
    for (const dir of [path.join(CONTENT, 'icons'), path.join(SRC, 'icons')]) {
      const f = path.join(dir, name + '.svg');
      if (fs.existsSync(f)) return f;
    }
    return null;
  };
  const addIcon = (name, preferBrand = false) => {
    const names = preferBrand ? ['brand-' + name, name] : [name];
    for (const n of names) {
      if (icons[n]) return;
      const f = iconFile(n);
      if (f) { icons[n] = fs.readFileSync(f, 'utf8').replace(/<!--[\s\S]*?-->/g, '').replace(/<\?xml[^>]*>/, '').trim(); return; }
    }
    warn(`Icon not found: ${name} (add content/icons/${name}.svg)`);
  };
  UI_ICONS.forEach((n) => addIcon(n));
  content.site.socials.forEach((s) => addIcon(s.icon, true));
  content.interests.items.forEach((it) => addIcon(it.icon));

  // -------------------------------------------------------------- data
  const docs = {};
  const projects = content.projects.map((p) => {
    docs[p.slug] = p.doc;
    const { doc, document, hidden, ...rest } = p;
    return { ...rest, hasDoc: !!doc };
  });
  const data = {
    base,
    site: content.site,
    home: content.home,
    background: content.background,
    projectsPage: content.projectsPage,
    projects,
    interests: content.interests,
    contact: content.contact,
    icons,
  };
  fs.mkdirSync(path.join(DIST, 'data', 'projects'), { recursive: true });
  for (const [slug, doc] of Object.entries(docs)) {
    fs.writeFileSync(path.join(DIST, 'data', 'projects', `${slug}.json`), JSON.stringify(doc ? { html: doc.html, toc: doc.toc } : null));
  }

  // -------------------------------------------------------------- static files
  copyDir(path.join(SRC, 'styles'), path.join(DIST, 'assets', 'styles'));
  copyDir(path.join(SRC, 'js'), path.join(DIST, 'assets', 'js'));
  copyDir(PUBLIC, DIST);
  // KaTeX stylesheet + fonts (for the math in project pages)
  let katexDir = null;
  try {
    const require = createRequire(import.meta.url);
    katexDir = path.join(path.dirname(require.resolve('katex/package.json')), 'dist');
  } catch { /* handled below */ }
  if (katexDir && fs.existsSync(katexDir)) {
    fs.mkdirSync(path.join(DIST, 'assets', 'katex'), { recursive: true });
    fs.copyFileSync(path.join(katexDir, 'katex.min.css'), path.join(DIST, 'assets', 'katex', 'katex.min.css'));
    copyDir(path.join(katexDir, 'fonts'), path.join(DIST, 'assets', 'katex', 'fonts'));
  }

  // -------------------------------------------------------------- html pages
  const views = await import(pathToFileURL(path.join(SRC, 'js', 'views.js')).href + `?t=${Date.now()}`);
  const template = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
  const version = hashOf([path.join(SRC, 'styles', 'main.css'), path.join(SRC, 'js', 'app.js'), path.join(SRC, 'js', 'views.js')]);
  const favHash = hashOf(['favicon.svg', 'favicon.png', 'apple-touch-icon.png'].map((f) => path.join(PUBLIC, f)).filter((f) => fs.existsSync(f)));
  const json = JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const stripTags = (h) => String(h || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  const reload = dev ? `<script>new EventSource('${base}__reload').onmessage = () => location.reload();</script>` : '';

  const writePage = (route, outFile) => {
    const doc = route.key === 'project' ? docs[route.slug] : null;
    const navKey = views.navKey(route);
    const p = route.key === 'project' ? content.projects.find((x) => x.slug === route.slug) : null;
    const description = p ? stripTags(p.summary).slice(0, 200) : content.site.description;
    const html = template
      .replace(/{{lang}}/g, content.site.lang || 'en')
      .replace(/{{title}}/g, stripTags(views.pageTitle(data, route)).replace(/"/g, '&quot;'))
      .replace(/{{description}}/g, description.replace(/"/g, '&quot;'))
      .replace(/{{base}}/g, base)
      .replace(/{{fav}}/g, favHash)
      .replace(/{{v}}/g, version)
      .replace(/{{page}}/g, navKey)
      .replace(/{{accent}}/g, views.accentOf(data, navKey))
      .replace('{{header}}', () => views.header(data, navKey))
      .replace('{{main}}', () => views.renderRoute(data, route, doc))
      .replace('{{data}}', () => json)
      .replace('{{doc}}', () => (doc ? JSON.stringify({ slug: route.slug, html: doc.html, toc: doc.toc }).replace(/</g, '\\u003c') : 'null'))
      .replace('{{devscript}}', reload);
    const dest = path.join(DIST, outFile);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, html);
  };

  writePage({ key: 'home' }, 'index.html');
  for (const key of ['background', 'projects', 'interests', 'contact']) writePage({ key }, `${key}/index.html`);
  for (const p of content.projects) writePage({ key: 'project', slug: p.slug }, `projects/${p.slug}/index.html`);
  writePage({ key: '404' }, '404.html');

  if (!quiet) {
    if (warnings.length) {
      console.log(c.yellow(`\n⚠ ${warnings.length} warning${warnings.length > 1 ? 's' : ''}:`));
      for (const w of warnings) console.log(c.yellow('  • ') + w);
    }
    console.log(c.green(`✓ Built ${content.projects.length} project(s) into dist/ in ${Date.now() - t0} ms`) + c.dim(`  (base ${base})`));
  }
  return { warnings, data };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  build().catch((e) => { console.error(c.red('✗ Build failed:'), e); process.exit(1); });
}
