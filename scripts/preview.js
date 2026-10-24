// Creates ONE self-contained file (preview.html) that opens by double-click, no server needed.
//   npm run preview
// Page changes inside it happen in memory (the address bar does not change).
// dev.js calls makePreview({ build: false }) after every rebuild, so preview.html stays fresh.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from './build.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

export async function makePreview({ build: doBuild = true } = {}) {
if (doBuild) { process.env.BASE_PATH = '/'; await build({ quiet: false }); }

// --- client code: views.js + patched app.js, inlined as one classic script
let views = fs.readFileSync(path.join(ROOT, 'src/js/views.js'), 'utf8');
const names = [...views.matchAll(/^export (?:async )?(?:function|const) (\w+)/gm)].map((m) => m[1]);
views = views.replace(/^export /gm, '');
let app = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
const rep = (a, b) => { if (!app.includes(a)) throw new Error('preview patch failed near: ' + a.slice(0, 40)); app = app.replace(a, b); };
rep("import * as V from './views.js';", '');
rep("let current = V.matchRoute(D, location.pathname);", "let current = { key: 'home' };\nfor (const [k, v] of Object.entries(D.docs)) docCache.set(k, v);");
rep("if (push && target.href !== location.href) history.pushState({}, '', target.href);", '');
rep("if (push) history.pushState({}, '', target.href);", '');
rep("    history.pushState({}, '', href);\n    return;", '    return;');
rep("  const u = new URL(a.href, location.href);\n  if (u.origin !== location.origin || !u.pathname.startsWith(D.base)) return;", "  if (!/^\\/(?!\\/)/.test(href)) return;\n  const u = new URL(href, 'http://x');");
rep("if (location.hash) setTimeout", "if (false) setTimeout");
const script = `const V=(()=>{${views}\nreturn {${names.join(',')}};})();\n${app}`;

// --- data with images inlined
const idx = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
const D = JSON.parse(/id="site-data">([\s\S]*?)<\/script>/.exec(idx)[1].replace(/\\u003c/g, '<'));
D.docs = {};
for (const p of D.projects) D.docs[p.slug] = JSON.parse(fs.readFileSync(path.join(DIST, 'data/projects', p.slug + '.json'), 'utf8'));
const mime = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', svg: 'image/svg+xml', webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf' };
let json = JSON.stringify(D).replace(/\/media\/[^"\\\s<>']+\.(jpg|jpeg|png|svg|webp|gif|pdf)/g, (m, e) => `data:${mime[e]};base64,${fs.readFileSync(path.join(DIST, m)).toString('base64')}`);
json = json.replace(/</g, '\\u003c');

// --- first screen + css (KaTeX fonts inlined)
const V = await import(pathToFileURL(path.join(ROOT, 'src/js/views.js')).href + `?t=${Date.now()}`);
const D2 = JSON.parse(json.replace(/\\u003c/g, '<'));
let katex = fs.readFileSync(path.join(DIST, 'assets/katex/katex.min.css'), 'utf8');
katex = katex.replace(/src:url\(fonts\/([\w-]+)\.woff2\)[^}]*/g, (_, n) => `src:url(data:font/woff2;base64,${fs.readFileSync(path.join(DIST, 'assets/katex/fonts', n + '.woff2')).toString('base64')}) format("woff2")`);
const css = fs.readFileSync(path.join(DIST, 'assets/styles/main.css'), 'utf8');

const html = `<!doctype html>
<html lang="${D.site.lang || 'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${D.site.title.replace(/<[^>]*>/g, '')}</title>
<link rel="icon" type="image/png" href="data:image/png;base64,${fs.readFileSync(path.join(ROOT, 'public/favicon.png')).toString('base64')}">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Urbanist:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400;1,500;1,600&display=swap">
<style>${katex}\n${css}</style></head>
<body data-page="home" style="--accent:${V.accentOf(D2, 'home')}">
<script>document.documentElement.classList.add('js')</script>
${V.header(D2, 'home')}
<main id="main" class="site-main" tabindex="-1">${V.renderRoute(D2, { key: 'home' }, null)}</main>
<script type="application/json" id="site-data">${json}</script>
<script type="application/json" id="doc-data">null</script>
<script>${script.replace(/<\/script/g, '<\\/script')}</script>
</body></html>`;
fs.writeFileSync(path.join(ROOT, 'preview.html'), html);
console.log(`✓ preview.html güncellendi (${Math.round(html.length / 1024)} KB) — çift tıklayıp açabilirsin`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  makePreview().catch((e) => { console.error(e); process.exit(1); });
}
