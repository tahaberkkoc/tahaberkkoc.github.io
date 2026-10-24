// LaTeX → HTML renderer.
// Covers the parts of LaTeX that show up in typical Overleaf papers/reports:
// sectioning, text formatting, lists, math (KaTeX), figures, subfigures, tables,
// algorithms, theorems, footnotes, cross-references, citations (BibTeX) and
// user macros from the preamble. Anything unknown degrades gracefully: the
// command is dropped and its braced arguments are rendered as text.

import katex from 'katex';
import { parse, Stream, stringify, plain } from './parser.js';
import { parseBib, formatBibEntry, citeAuthor } from './bib.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const escapeHtml = esc;

const typo = (t) => esc(t)
  .replace(/---/g, '—').replace(/--/g, '–')
  .replace(/``/g, '“').replace(/''/g, '”')
  .replace(/`/g, '‘').replace(/'/g, '’')
  .replace(/\?`/g, '¿').replace(/!`/g, '¡');

const SYMBOLS = {
  ldots: '…', dots: '…', textellipsis: '…', LaTeX: '<span class="latex-logo">L<sup>a</sup>T<sub>e</sub>X</span>',
  TeX: '<span class="latex-logo">T<sub>e</sub>X</span>', LaTeXe: 'LaTeX2ε',
  textbackslash: '\\', textasciitilde: '~', textasciicircum: '^', textbar: '|', textless: '&lt;', textgreater: '&gt;',
  textbullet: '•', textperiodcentered: '·', textdagger: '†', textdaggerdbl: '‡', dag: '†', ddag: '‡', textdegree: '°', degree: '°',
  copyright: '©', textcopyright: '©', textregistered: '®', texttrademark: '™', S: '§', P: '¶', pounds: '£', euro: '€', EUR: '€',
  i: 'ı', j: 'ȷ', ss: 'ß', o: 'ø', O: 'Ø', ae: 'æ', AE: 'Æ', oe: 'œ', OE: 'Œ', aa: 'å', AA: 'Å', l: 'ł', L: 'Ł',
  textquoteleft: '‘', textquoteright: '’', textquotedblleft: '“', textquotedblright: '”', guillemotleft: '«', guillemotright: '»',
  textendash: '–', textemdash: '—', textunderscore: '_', textmu: 'µ', textpm: '±', texttimes: '×',
  '&': '&amp;', '%': '%', '$': '$', '#': '#', '_': '_', '{': '{', '}': '}', ' ': ' ', ',': '&thinsp;', ';': ' ', ':': ' ',
  '!': '', '/': '', '-': '&shy;', '@': '', '>': ' ', '<': '', quad: '&emsp;', qquad: '&emsp;&emsp;', enspace: '&ensp;',
  thinspace: '&thinsp;', negthinspace: '', hfill: ' ', hfil: ' ', dotfill: ' ', hrulefill: ' ', noindent: '', indent: '',
  centering: '', raggedright: '', raggedleft: '', relax: '', protect: '', selectfont: '', normalsize: '', null: '',
  maketitle: null, tableofcontents: '', listoffigures: '', listoftables: '', newpage: '', clearpage: '', cleardoublepage: '',
  pagebreak: '', nopagebreak: '', bigskip: '', medskip: '', smallskip: '', vfill: '', vfil: '', break: '', sloppy: '',
  fussy: '', frenchspacing: '', nonfrenchspacing: '', raggedbottom: '', flushbottom: '', onecolumn: '', twocolumn: '',
  restoregeometry: '', ignorespaces: '', unskip: '', strut: '', backmatter: '',
  printindex: '', makeatletter: '', makeatother: '', FloatBarrier: '', hline: '', toprule: '', midrule: '', bottomrule: '',
  item: '', endhead: '', endfirsthead: '', endfoot: '', endlastfoot: '', newline: '<br>', linebreak: '<br>', par: null,
  bf: null, it: null, em: null, // declarations (handled in groups)
  checkmark: '✓', and: ', ', ding: '', textsection: '§',
};

// Commands to swallow together with their arguments: o = optional, m = mandatory, s = star
const IGNORE = {
  vspace: 'sm', hspace: 'sm', 'vspace*': 'm', 'hspace*': 'm', addtocontents: 'mm', begingroup: '', endgroup: '', fill: '', singlespacing: '', doublespacing: '', onehalfspacing: '', setlength: 'mm', addtolength: 'mm', setcounter: 'mm', addtocounter: 'mm', stepcounter: 'm',
  refstepcounter: 'm', pagestyle: 'm', thispagestyle: 'm', pagenumbering: 'm', bibliographystyle: 'm', usepackage: 'om',
  RequirePackage: 'om', documentclass: 'om', geometry: 'm', newgeometry: 'm', hypersetup: 'm', captionsetup: 'om', definecolor: 'mmm',
  linespread: 'm', fontsize: 'mm', addcontentsline: 'mmm', setstretch: 'm', index: 'm', lstset: 'm', setminted: 'om',
  DeclareGraphicsExtensions: 'm', setcitestyle: 'm', allowdisplaybreaks: 'o', theoremstyle: 'm', setlist: 'om', newcolumntype: 'mom',
  phantom: 'm', hphantom: 'm', vphantom: 'm', includepdf: 'om', titleformat: 'momm', titlespacing: 'smmmm', renewenvironment: 'mmm',
  newenvironment: 'mommm', newcounter: 'mo', numberwithin: 'mm', AtBeginDocument: 'm', urlstyle: 'm', pdfbookmark: 'omm',
  enlargethispage: 'm', rule: 'omm', vskip: '', hskip: '', kern: '', addbibresource: 'om', DeclareFieldFormat: 'omm',
  tcbuselibrary: 'm', usetikzlibrary: 'm', pgfplotsset: 'm', sisetup: 'm', crefname: 'mmm', Crefname: 'mmm',
  newacronym: 'ommm', glsaddall: 'o', makeglossaries: '', printglossaries: '', footnotemark: 'o', footnotetext: 'om',
  algrenewcommand: 'mm', algnewcommand: 'mm', SetKwInOut: 'mm', SetAlgoLined: '', DontPrintSemicolon: '', marginpar: 'm',
  thanks: 'm', fancyhead: 'om', fancyfoot: 'om', fancyhf: 'm', lhead: 'm', rhead: 'm', chead: 'm', lfoot: 'm', rfoot: 'm', cfoot: 'm',
  pretitle: 'm', posttitle: 'm', preauthor: 'm', postauthor: 'm', predate: 'm', postdate: 'm', affil: 'om', email: 'm',
};

const WRAP = {
  textbf: 'strong', textit: 'em', emph: 'em', textsl: 'em', underline: 'u', uline: 'u', texttt: 'code', textsuperscript: 'sup',
  textsubscript: 'sub', sout: 's', st: 's', hl: 'mark', textsc: 'span class="sc"', textmd: '', textup: '', textrm: '',
  textnormal: '', textsf: '', mbox: '', hbox: '', text: '', fbox: 'span class="fbox"', framebox: 'span class="fbox"',
  makebox: '', textls: '', enquote: 'q', mintinline: 'code', path: 'code', nolinkurl: 'code', textsubscript_: 'sub',
};

const DECLS = {
  bf: 'strong', bfseries: 'strong', it: 'em', itshape: 'em', em: 'em', sl: 'em', slshape: 'em', tt: 'code', ttfamily: 'code',
  sc: 'span class="sc"', scshape: 'span class="sc"', small: 'span class="small"', footnotesize: 'span class="small"',
  scriptsize: 'span class="small"', tiny: 'span class="small"', large: 'span class="large"', Large: 'span class="large"',
  LARGE: 'span class="large"', huge: 'span class="large"', Huge: 'span class="large"', normalfont: '', rmfamily: '',
  sffamily: '', upshape: '', mdseries: '', normalsize: '',
};

const ACCENTS = {
  "'": '́', '`': '̀', '^': '̂', '"': '̈', '~': '̃', '=': '̄', '.': '̇', u: '̆',
  v: '̌', H: '̋', c: '̧', k: '̨', r: '̊', d: '̣', b: '̱',
};

const SECTION_LEVELS = { part: 0, chapter: 1, section: 2, subsection: 3, subsubsection: 4, paragraph: 5, subparagraph: 6, subsubsubsection: 5 };

const DEFAULT_THEOREMS = {
  theorem: 'Theorem', lemma: 'Lemma', proposition: 'Proposition', corollary: 'Corollary', definition: 'Definition',
  remark: 'Remark', example: 'Example', assumption: 'Assumption', problem: 'Problem', claim: 'Claim', conjecture: 'Conjecture',
  note: 'Note', observation: 'Observation', hypothesis: 'Hypothesis', thm: 'Theorem', lem: 'Lemma', prop: 'Proposition',
  cor: 'Corollary', defn: 'Definition', rem: 'Remark', exmp: 'Example', assum: 'Assumption',
};

const KIND_NAMES = {
  section: 'Section', subsection: 'Section', subsubsection: 'Section', chapter: 'Chapter', figure: 'Figure', subfigure: 'Figure',
  table: 'Table', equation: 'Equation', algorithm: 'Algorithm', item: 'Item', footnote: 'Footnote', appendix: 'Appendix',
};

const NAMED_COLORS = new Set(['red', 'blue', 'green', 'black', 'white', 'gray', 'grey', 'orange', 'purple', 'brown', 'cyan',
  'magenta', 'yellow', 'violet', 'teal', 'olive', 'pink', 'lime', 'darkgray', 'lightgray']);

const SI_UNITS = {
  meter: 'm', metre: 'm', second: 's', kilogram: 'kg', gram: 'g', kelvin: 'K', celsius: '°C', degreeCelsius: '°C', watt: 'W',
  joule: 'J', newton: 'N', pascal: 'Pa', hertz: 'Hz', volt: 'V', ampere: 'A', ohm: 'Ω', percent: '%', hour: 'h', minute: 'min',
  liter: 'L', litre: 'L', radian: 'rad', degree: '°', bar: 'bar', decibel: 'dB', farad: 'F', henry: 'H', coulomb: 'C',
  kilo: 'k', mega: 'M', giga: 'G', tera: 'T', milli: 'm', micro: 'µ', nano: 'n', pico: 'p', centi: 'c', per: '/',
  squared: '²', cubed: '³', square: '', cubic: '', tothe: '^', day: 'd', mole: 'mol', candela: 'cd', byte: 'B', bit: 'bit',
};

let uid = 0;

export class Renderer {
  /**
   * @param {object} opts
   *  - readFile(relPath) => string | null      (relative to the document root)
   *  - resolveAsset(relPath, graphicspath[]) => { url, type } | null
   *  - custom: { [macroName]: (stream, renderer) => html | {block} }
   *  - customEnvs: { [envName]: (envNode, stream, renderer) => html | {block} }
   *  - warn(message)
   */
  constructor(opts = {}) {
    this.opts = opts;
    this.warnings = [];
    this.warned = new Set();
    this.katexMacros = {};
    this.textMacros = new Map();
    this.colors = new Map();
    this.counters = { part: 0, chapter: 0, section: 0, subsection: 0, subsubsection: 0, paragraph: 0, subparagraph: 0,
      figure: 0, table: 0, equation: 0, footnote: 0, algorithm: 0, subfigure: 0 };
    this.thmCounters = new Map();
    this.theorems = new Map(Object.entries(DEFAULT_THEOREMS).map(([k, v]) => [k, { title: v, counter: k }]));
    this.labels = new Map();
    this.currentRef = null;
    this.footnotes = [];
    this.citeNums = new Map();
    this.nociteAll = false;
    this.bib = new Map();
    this.manualBib = null;
    this.bibFiles = [];
    this.toc = [];
    this.meta = { title: null, author: null, date: null };
    this.appendix = false;
    this.usesChapters = false;
    this.graphicspath = [''];
    this.ids = new Set();
    this.float = null; // current float context { kind }
    this.depth = 0;
    this.state = {}; // free-form state for custom handlers
  }

  warn(msg) {
    if (this.warned.has(msg)) return;
    this.warned.add(msg);
    this.warnings.push(msg);
    if (this.opts.warn) this.opts.warn(msg);
  }

  uniqueId(base) {
    let id = (base || 'x').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .replace(/ı/g, 'i').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'x';
    let candidate = id;
    let k = 2;
    while (this.ids.has(candidate)) candidate = `${id}-${k++}`;
    this.ids.add(candidate);
    return candidate;
  }

  // ------------------------------------------------------------------ document
  renderDocument(src) {
    const begin = src.indexOf('\\begin{document}');
    let preamble = '';
    let body = src;
    if (begin !== -1) {
      preamble = src.slice(0, begin);
      body = src.slice(begin + '\\begin{document}'.length);
      const end = body.lastIndexOf('\\end{document}');
      if (end !== -1) body = body.slice(0, end);
    }
    this.processPreamble(parse(preamble));
    this.scanAlgorithm2eSetup(src);
    const nodes = parse(body);
    let html = this.blocks(nodes);
    if (this.footnotes.length) {
      html += `<section class="footnotes"><ol>${this.footnotes.map((f, i) =>
        `<li id="fn-${i + 1}">${f} <a href="#fnref-${i + 1}" class="fn-back" aria-label="Back to text">↩</a></li>`).join('')}</ol></section>`;
    }
    html = this.finalize(html);
    return { html, toc: this.toc, meta: this.metaHtml(), warnings: this.warnings };
  }

  metaHtml() {
    const r = (nodes) => (nodes ? this.inline(nodes).trim() : null);
    return { title: r(this.meta.title), author: r(this.meta.author), date: r(this.meta.date) };
  }

  scanAlgorithm2eSetup(src) {
    const a = this.a2eState();
    const txt = (x) => x.replace(/\\textbf\{([^}]*)\}/g, '$1').replace(/\\/g, '');
    let m;
    const io = /\\SetKwIn(?:Out|put)\{(\w+)\}\{([^}]*)\}/g;
    while ((m = io.exec(src))) a.io[m[1]] = txt(m[2]);
    const kw = /\\SetKw\{(\w+)\}\{([^}]*)\}/g;
    while ((m = kw.exec(src))) a.kw[m[1]] = txt(m[2]);
    const lp = /\\SetKwFor\{(\w+)\}\{([^}]*)\}\{([^}]*)\}\{([^}]*)\}/g;
    while ((m = lp.exec(src))) a.loops[m[1]] = [txt(m[2]), txt(m[3])];
  }
  processPreamble(nodes) {
    const s = new Stream(nodes);
    while (!s.done()) {
      const n = s.next();
      if (n.type !== 'macro') continue;
      const name = n.name;
      if (this.defineMacro(name, s)) continue;
      switch (name) {
        case 'title': s.opt(); this.meta.title = s.arg(); break;
        case 'author': s.opt(); this.meta.author = s.arg(); break;
        case 'date': this.meta.date = s.arg(); break;
        case 'addbibresource': s.opt(); this.loadBib(plain(s.arg())); break;
        case 'bibliography': this.loadBib(plain(s.arg())); break;
        case 'graphicspath': this.setGraphicsPath(s.arg()); break;
        case 'input': case 'include': case 'subfile': {
          const src = this.readInput(plain(s.arg()));
          if (src != null) this.processPreamble(parse(src));
          break;
        }
        default: break;
      }
    }
  }

  setGraphicsPath(nodes) {
    const dirs = [];
    for (const n of nodes || []) if (n.type === 'group') dirs.push(plain(n.children));
    if (!dirs.length && nodes) dirs.push(plain(nodes));
    this.graphicspath = ['', ...dirs];
  }

  readInput(path) {
    if (!this.opts.readFile) return null;
    const candidates = path.endsWith('.tex') ? [path] : [path + '.tex', path];
    for (const c of candidates) {
      const src = this.opts.readFile(c);
      if (src != null) return src;
    }
    this.warn(`\\input file not found: ${path}`);
    return null;
  }

  loadBib(list) {
    for (let f of list.split(',').map((x) => x.trim()).filter(Boolean)) {
      if (!f.endsWith('.bib')) f += '.bib';
      if (this.bibFiles.includes(f)) continue;
      this.bibFiles.push(f);
      const src = this.opts.readFile ? this.opts.readFile(f) : null;
      if (src == null) { this.warn(`Bibliography file not found: ${f}`); continue; }
      for (const e of parseBib(src)) this.bib.set(e.key, e);
    }
  }

  // \newcommand & friends. Returns true if handled.
  defineMacro(name, s) {
    if (/^(newcommand|renewcommand|providecommand)\*?$/.test(name)) {
      s.star();
      const nameNodes = s.arg();
      const macroName = nameNodes && nameNodes[0] && nameNodes[0].type === 'macro' ? nameNodes[0].name : plain(nameNodes).replace(/^\\/, '');
      const nargs = parseInt(plain(s.opt()) || '0', 10) || 0;
      const def = s.opt();
      const body = s.arg();
      const raw = stringify(body);
      if (!macroName) return true;
      this.katexMacros['\\' + macroName] = raw;
      this.textMacros.set(macroName, { nargs, def: def ? stringify(def) : null, raw });
      return true;
    }
    if (name === 'def' || name === 'gdef') {
      const target = s.next();
      if (!target || target.type !== 'macro') return true;
      let nargs = 0;
      while (!s.done() && s.peek().type !== 'group') {
        const t = s.next();
        if (t.type === 'char' && t.value === '#') nargs++;
      }
      const raw = stringify(s.arg());
      this.katexMacros['\\' + target.name] = raw;
      this.textMacros.set(target.name, { nargs, def: null, raw });
      return true;
    }
    if (name === 'DeclareMathOperator' || name === 'DeclareMathOperator*') {
      const star = name.endsWith('*') || s.star();
      const nm = s.arg();
      const macroName = nm && nm[0] && nm[0].type === 'macro' ? nm[0].name : plain(nm).replace(/^\\/, '');
      const text = stringify(s.arg());
      this.katexMacros['\\' + macroName] = `\\operatorname${star ? '*' : ''}{${text}}`;
      return true;
    }
    if (name === 'newtheorem' || name === 'newtheorem*') {
      const star = name.endsWith('*') || s.star();
      const env = plain(s.arg());
      const shared = s.opt();
      const title = plain(s.arg());
      const within = s.opt();
      this.theorems.set(env, { title, counter: star ? null : (shared ? plain(shared) : env), within: within ? plain(within) : null });
      return true;
    }
    if (name === 'definecolor') {
      const cname = plain(s.arg());
      const model = plain(s.arg());
      const spec = plain(s.arg());
      let css = null;
      if (model === 'HTML') css = '#' + spec;
      else if (model === 'RGB') css = `rgb(${spec})`;
      else if (model === 'rgb') css = `rgb(${spec.split(',').map((x) => Math.round(parseFloat(x) * 255)).join(',')})`;
      if (css) this.colors.set(cname, css);
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ core
  // Render a sequence as block-level HTML (with paragraphs).
  blocks(nodes) {
    const s = nodes instanceof Stream ? nodes : new Stream(nodes);
    let out = '';
    let para = '';
    const flush = () => {
      const t = para.trim();
      if (t && t.replace(/<br>/g, '').trim()) out += `<p>${t.replace(/^(<br>\s*)+|(\s*<br>)+$/g, '')}</p>`;
      para = '';
    };
    while (!s.done()) {
      const n = s.next();
      if (n.type === 'parbreak') { flush(); continue; }
      const r = this.node(n, s);
      if (r == null) continue;
      if (typeof r === 'object') {
        if (r.parbreak) { flush(); continue; }
        flush();
        out += r.block;
      } else {
        para += r;
      }
    }
    flush();
    return out;
  }

  // Render a sequence as inline HTML.
  inline(nodes) {
    if (!nodes) return '';
    const s = new Stream(nodes);
    let out = '';
    while (!s.done()) {
      const n = s.next();
      if (n.type === 'parbreak') { out += ' '; continue; }
      const r = this.node(n, s);
      if (r == null) continue;
      out += typeof r === 'object' ? (r.block || ' ') : r;
    }
    return out;
  }

  node(n, s) {
    switch (n.type) {
      case 'text': return typo(n.value);
      case 'ws': return ' ';
      case 'char':
        if (n.value === '~') return '&nbsp;';
        if (n.value === '&') return ' ';
        return esc(n.value);
      case 'group': return this.group(n.children);
      case 'math': return this.math(n);
      case 'verb': return `<code>${esc(n.raw)}</code>`;
      case 'macro': return this.macro(n.name, s);
      case 'env': return this.env(n, s);
      default: return '';
    }
  }

  group(children) {
    const idx = children.findIndex((c) => c.type === 'macro' && (DECLS[c.name] !== undefined || c.name === 'color'));
    if (idx === -1) return this.inline(children);
    const before = this.inline(children.slice(0, idx));
    const decl = children[idx].name;
    let rest = children.slice(idx + 1);
    if (decl === 'color') {
      const rs = new Stream(rest);
      const color = this.color(plain(rs.arg()));
      const inner = this.group(rs.nodes.slice(rs.i));
      return before + (color ? `<span style="color:${color}">${inner}</span>` : inner);
    }
    const inner = this.group(rest);
    const tag = DECLS[decl];
    if (!tag) return before + inner;
    return before + `<${tag}>${inner}</${tag.split(' ')[0]}>`;
  }

  color(name) {
    if (this.colors.has(name)) return this.colors.get(name);
    const base = name.split('!')[0];
    if (this.colors.has(base)) return this.colors.get(base);
    if (NAMED_COLORS.has(base)) return base;
    return null;
  }

  // ------------------------------------------------------------------ macros
  macro(name, s) {
    const custom = this.opts.custom && this.opts.custom[name];
    if (custom) return custom(s, this);

    if (this.defineMacro(name, s)) return '';

    if (this.textMacros.has(name)) return this.expandMacro(name, s);

    if (name in SYMBOLS) {
      const v = SYMBOLS[name];
      if (v !== null) return v;
    }

    if (WRAP[name] !== undefined) {
      if (name === 'makebox' || name === 'framebox') { s.opt(); s.opt(); }
      if (name === 'mintinline') s.arg();
      const tag = WRAP[name];
      const content = (name === 'path' || name === 'nolinkurl') ? esc(plain(s.arg())) : this.inline(s.arg());
      return tag ? `<${tag}>${content}</${tag.split(' ')[0]}>` : content;
    }

    if (IGNORE[name] !== undefined) {
      for (const k of IGNORE[name]) {
        if (k === 's') s.star();
        else if (k === 'o') s.opt();
        else s.arg();
      }
      return '';
    }

    if (name in ACCENTS) {
      const arg = s.arg();
      const base = arg ? this.inline(arg) : '';
      return (base.slice(0, 1) + ACCENTS[name] + base.slice(1)).normalize('NFC');
    }

    switch (name) {
      case 'par': return { parbreak: true };
      case '\\': case 'tabularnewline': s.star(); s.opt(); return '<br>';
      case 'today': return new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
      case 'maketitle': return { block: this.titleBlock() };
      case 'frontmatter': this.frontMatter = true; return '';
      case 'mainmatter': this.frontMatter = false; this.counters.chapter = 0; return '';
      case 'appendix': this.appendix = true; this.counters.section = 0; this.counters.chapter = 0; return '';
      case 'url': {
        const u = plain(s.arg());
        return `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(u.replace(/^https?:\/\//, ''))}</a>`;
      }
      case 'href': {
        const u = stringify(s.arg()).replace(/\\([#%&_~])/g, '$1').trim();
        const t = this.inline(s.arg());
        const ext = /^https?:/.test(u);
        return `<a href="${esc(u)}"${ext ? ' target="_blank" rel="noopener"' : ''}>${t}</a>`;
      }
      case 'textcolor': {
        s.opt();
        const c = this.color(plain(s.arg()));
        const t = this.inline(s.arg());
        return c ? `<span style="color:${c}">${t}</span>` : t;
      }
      case 'colorbox': {
        const c = this.color(plain(s.arg()));
        const t = this.inline(s.arg());
        return `<span class="colorbox"${c ? ` style="background:${c}"` : ''}>${t}</span>`;
      }
      case 'color': s.arg(); return '';
      case 'ensuremath': return this.math({ type: 'math', display: false, raw: stringify(s.arg()) });
      case 'footnote': {
        s.opt();
        const content = this.inline(s.arg());
        this.footnotes.push(content);
        const k = this.footnotes.length;
        return `<sup class="fn-ref" id="fnref-${k}"><a href="#fn-${k}">${k}</a></sup>`;
      }
      case 'label': return this.label(plain(s.arg()));
      case 'ref': case 'pageref': case 'nameref': return this.refPlaceholder(name === 'pageref' ? 'page' : 'ref', s.arg());
      case 'eqref': return this.refPlaceholder('eq', s.arg());
      case 'autoref': case 'cref': case 'Cref': case 'autoref*': case 'cref*': case 'Cref*': case 'Autoref': case 'vref':
        return this.refPlaceholder('auto', s.arg());
      case 'cite': case 'citep': case 'citet': case 'parencite': case 'textcite': case 'autocite': case 'citeauthor':
      case 'citeyear': case 'footcite': case 'cite*': case 'citep*': case 'citet*': case 'Cite': case 'Citet': case 'Citep':
      case 'citealp': case 'citealt': case 'supercite': case 'smartcite': case 'nptextcite':
        return this.cite(name.replace('*', ''), s);
      case 'nocite': {
        const keys = plain(s.arg());
        if (keys.trim() === '*') this.nociteAll = true;
        else keys.split(',').map((k) => k.trim()).filter(Boolean).forEach((k) => this.citeNum(k));
        return '';
      }
      case 'bibliography': this.loadBib(plain(s.arg())); return { block: '\u0001bibliography\u0001' };
      case 'printbibliography': s.opt(); return { block: '\u0001bibliography\u0001' };
      case 'addbibresource': s.opt(); this.loadBib(plain(s.arg())); return '';
      case 'graphicspath': this.setGraphicsPath(s.arg()); return '';
      case 'includegraphics': case 'includegraphics*': return this.includegraphics(s);
      case 'caption': case 'caption*': case 'captionof': case 'subcaption': return this.caption(name, s);
      case 'subfloat': return this.subfloat(s);
      case 'input': case 'include': case 'subfile': case 'import': case 'subimport': {
        let path = plain(s.arg());
        if (name === 'import' || name === 'subimport') path = path + plain(s.arg());
        const src = this.readInput(path);
        if (src != null) {
          const inner = src.includes('\\begin{document}')
            ? src.slice(src.indexOf('\\begin{document}') + 16, src.lastIndexOf('\\end{document}') === -1 ? undefined : src.lastIndexOf('\\end{document}'))
            : src;
          s.insert(parse(inner));
        }
        return '';
      }
      case 'lstinputlisting': {
        const o = s.opt();
        const path = plain(s.arg());
        const src = this.opts.readFile ? this.opts.readFile(path) : null;
        const lang = /language=([\w+#-]+)/.exec(plain(o) || '');
        if (src == null) { this.warn(`Listing not found: ${path}`); return ''; }
        return { block: `<pre class="code"><code${lang ? ` class="language-${esc(lang[1].toLowerCase())}"` : ''}>${esc(src)}</code></pre>` };
      }
      case 'SI': case 'qty': case 'SIrange': {
        s.opt();
        const v = plain(s.arg());
        let v2 = null;
        if (name === 'SIrange') v2 = plain(s.arg());
        const u = this.siUnit(s.arg());
        return `${esc(v)}${v2 ? '–' + esc(v2) : ''}&nbsp;${u}`;
      }
      case 'si': case 'unit': s.opt(); return this.siUnit(s.arg());
      case 'num': s.opt(); return esc(plain(s.arg()));
      case 'ang': s.opt(); return esc(plain(s.arg())) + '°';
      case 'mintinline': s.arg(); return `<code>${esc(plain(s.arg()))}</code>`;
      case 'item': return '';
      case 'hline': case 'cline': case 'cmidrule': return '';
      case 'multicolumn': { s.arg(); s.arg(); return this.inline(s.arg()); }
      case 'multirow': { s.opt(); s.arg(); s.opt(); s.arg(); return this.inline(s.arg()); }
      case 'acrshort': case 'acrlong': case 'acrfull': case 'gls': case 'Gls': case 'glspl': case 'ac': case 'acs': case 'acl':
        return esc(plain(s.arg()));
      case 'qedhere': case 'qed': return ' ∎';
      case 'Return': case 'KwRet': case 'KwReturn': return '<strong class="alg-kw">return</strong> ';
      case 'KwTo': return ' <strong class="alg-kw">to</strong> ';
      case 'KwFrom': return ' <strong class="alg-kw">from</strong> ';
      default: break;
    }

    if (name in SECTION_LEVELS || (name.endsWith('*') && name.slice(0, -1) in SECTION_LEVELS)) return this.section(name, s);

    if (name.length === 1 && !/[a-zA-Z]/.test(name)) return esc(name);

    if (name in DECLS) return '';
    if (this.a2e && this.a2e.kw[name]) return ` <strong class="alg-kw">${this.a2e.kw[name]}</strong> `;
    this.warn(`Unsupported command \\${name} (its arguments are shown as plain text)`);
    return '';
  }

  expandMacro(name, s) {
    const m = this.textMacros.get(name);
    if (this.depth > 50) return '';
    const args = [];
    let first = 0;
    if (m.def != null) {
      const o = s.opt();
      args.push(o ? stringify(o) : m.def);
      first = 1;
    }
    for (let k = first; k < m.nargs; k++) args.push(stringify(s.arg() || []));
    const body = m.raw.replace(/#(\d)/g, (_, d) => args[+d - 1] ?? '');
    this.depth++;
    const nodes = parse(body);
    this.depth--;
    s.insert(nodes.length === 1 && nodes[0].type === 'group' ? nodes : [{ type: 'group', children: nodes }]);
    return '';
  }

  siUnit(nodes) {
    let out = '';
    let pendingPer = false;
    for (const n of nodes || []) {
      if (n.type === 'macro' && SI_UNITS[n.name] !== undefined) {
        const u = SI_UNITS[n.name];
        if (u === '/') { pendingPer = true; continue; }
        if (u === '²' || u === '³') { out += u; continue; }
        if (pendingPer) { out += '/'; pendingPer = false; }
        out += u;
      } else if (n.type === 'text') out += esc(n.value);
      else if (n.type === 'char' && n.value === '^') out += '^';
      else if (n.type === 'group') out += this.siUnit(n.children);
      else if (n.type === 'math') out += this.math(n);
    }
    return out.replace(/\^\{?(-?\d)\}?/g, '<sup>$1</sup>').replace(/\./g, '·').replace(/~/g, '&nbsp;');
  }

  titleBlock() {
    const parts = [];
    if (this.meta.author) {
      const authors = this.meta.author.slice();
      const html = this.inline(authors.map((n) => (n.type === 'macro' && n.name === 'and' ? { type: 'text', value: '\u0002' } : n)))
        .split('\u0002').map((a) => `<span class="doc-author">${a.replace(/<br>/g, ', ').replace(/,\s*$/, '').trim()}</span>`).join('');
      parts.push(`<div class="doc-authors">${html}</div>`);
    }
    if (this.meta.date) {
      const d = this.inline(this.meta.date).trim();
      if (d) parts.push(`<div class="doc-date">${d}</div>`);
    }
    return parts.length ? `<header class="doc-titleblock">${parts.join('')}</header>` : '';
  }

  // ------------------------------------------------------------------ sections
  section(name, s) {
    let star = name.endsWith('*');
    let base = star ? name.slice(0, -1) : name;
    if (!star && s.star()) star = true;
    if (this.frontMatter && base === 'chapter') star = true;
    const short = s.opt();
    const titleNodes = s.arg() || [];
    const title = this.inline(titleNodes).trim();
    const level = SECTION_LEVELS[base];
    if (base === 'chapter') {
      this.usesChapters = true;
      // \chapter*{CHAPTER 4 ...}: use the number written in the title for the sections below
      const mc = star && /^\s*chapter\s+(\d+)/i.exec(plain(titleNodes).replace(/\\\\|\s+/g, ' ').trim());
      if (mc) { this.counters.chapter = +mc[1]; this.counters.section = this.counters.subsection = this.counters.subsubsection = 0; this.counters.figure = this.counters.table = this.counters.equation = 0; this.chapterTyped = true; }
    }

    let num = null;
    if (!star && level >= 1 && level <= 4) {
      this.counters[base]++;
      if (base === 'subsection' && this.counters.section === 0) this.subOnly = true;
      if (base === 'section' || base === 'chapter') this.subOnly = false;
      const order = ['chapter', 'section', 'subsection', 'subsubsection'];
      for (const k of order.slice(order.indexOf(base) + 1)) this.counters[k] = 0;
      if (base === 'chapter') this.counters.figure = this.counters.table = this.counters.equation = 0;
      const start = this.usesChapters ? 0 : 1;
      const parts = [];
      for (let k = start; k <= order.indexOf(base); k++) {
        if (this.subOnly && order[k] === 'section') continue; // sections are skipped: \subsection directly under a chapter
        let v = this.counters[order[k]];
        if (k === start && this.appendix) v = String.fromCharCode(64 + v);
        parts.push(v);
      }
      if (this.usesChapters && parts[0] === 0) parts.shift();
      num = parts.join('.');
    }
    const id = this.uniqueId('sec-' + (num ? num + '-' : '') + plain(short || titleNodes));
    this.currentRef = { id, num: num || '', kind: this.appendix && level <= 2 ? 'appendix' : base };

    if (level >= 5) {
      // run-in heading
      return `<strong class="runin" id="${id}">${title}</strong> `;
    }
    const tag = { 0: 'h2', 1: 'h2', 2: 'h2', 3: 'h3', 4: 'h4' }[level];
    if (level <= 3) this.toc.push({ level: level <= 2 ? 1 : 2, depth: level, num, title, id });
    const numHtml = num ? `<span class="sec-num">${num}</span>` : '';
    return { block: `<${tag} id="${id}" class="doc-heading">${numHtml}${title}</${tag}>` };
  }

  label(key) {
    if (!key) return '';
    if (this.currentRef) {
      this.labels.set(key, this.currentRef);
      return '';
    }
    const id = this.uniqueId('ref-' + key);
    this.labels.set(key, { id, num: '?', kind: 'item' });
    return `<span id="${id}"></span>`;
  }

  refPlaceholder(mode, nodes) {
    const keys = plain(nodes).split(',').map((k) => k.trim()).filter(Boolean);
    return keys.map((k) => `\u0001ref:${mode}:${k}\u0001`).join(', ');
  }

  // ------------------------------------------------------------------ citations
  citeNum(key) {
    if (!this.citeNums.has(key)) this.citeNums.set(key, this.citeNums.size + 1);
    return this.citeNums.get(key);
  }

  cite(mode, s) {
    const o1 = s.opt();
    const o2 = s.opt();
    const keys = plain(s.arg()).split(',').map((k) => k.trim()).filter(Boolean);
    keys.forEach((k) => this.citeNum(k));
    const post = o2 ? this.inline(o2) : o1 ? this.inline(o1) : '';
    const pre = o2 ? this.inline(o1) : '';
    return `\u0001cite:${mode}:${keys.join(',')}:${encodeURIComponent(pre)}:${encodeURIComponent(post)}\u0001`;
  }

  // ------------------------------------------------------------------ math
  math(n) {
    const render = (tex, display) => {
      try {
        return katex.renderToString(tex, {
          displayMode: display, throwOnError: false, strict: 'ignore', trust: false,
          macros: { ...this.katexMacros }, output: 'htmlAndMathml',
        });
      } catch (e) {
        this.warn(`Math error: ${e.message}`);
        return `<code class="math-error">${esc(tex)}</code>`;
      }
    };
    if (!n.display) return render(n.raw, false);

    const env = n.env || null;
    const base = env ? env.replace('*', '') : null;
    const numbered = env && !env.endsWith('*') && !['displaymath', 'math'].includes(env);
    let anchors = '';
    let firstId = null;

    const takeLabels = (tex) => {
      const labels = [];
      tex = tex.replace(/\\label\s*\{([^}]*)\}/g, (_, k) => { labels.push(k.trim()); return ''; });
      return [tex, labels];
    };
    const numberEq = (labels) => {
      const num = (this.usesChapters ? `${this.counters.chapter}.` : '') + (++this.counters.equation);
      const id = this.uniqueId('eq-' + num);
      if (!firstId) firstId = id; else anchors += `<span id="${id}" class="anchor"></span>`;
      for (const l of labels) this.labels.set(l, { id, num, kind: 'equation' });
      return num;
    };

    let tex;
    if (!env || base === 'displaymath' || base === 'math') {
      [tex] = takeLabels(n.raw);
    } else if (base === 'equation') {
      let labels;
      [tex, labels] = takeLabels(n.raw);
      const off = /\\(nonumber|notag)\b/.test(tex);
      tex = tex.replace(/\\(nonumber|notag)\b/g, '');
      if (numbered && !off && !/\\tag\b/.test(tex)) tex += `\\tag{${numberEq(labels)}}`;
    } else {
      // multi-line environments: number each row
      let raw = n.raw;
      let argPrefix = '';
      if (base === 'alignat' || base === 'flalign') {
        const m = /^\s*\{[^}]*\}/.exec(raw);
        if (m) { argPrefix = base === 'alignat' ? m[0] : ''; raw = raw.slice(m[0].length); }
      }
      const rows = splitRows(raw);
      const out = rows.map((row, idx) => {
        let [r, labels] = takeLabels(row);
        const off = /\\(nonumber|notag)\b/.test(r);
        r = r.replace(/\\(nonumber|notag)\b/g, '');
        const isLast = idx === rows.length - 1;
        const wantsNum = numbered && !off && !/\\tag\b/.test(r) && r.trim() !== '' && (base !== 'multline' || isLast);
        if (wantsNum) r += `\\tag{${numberEq(labels)}}`;
        else if (labels.length && this.counters.equation) labels.forEach((l) => this.labels.set(l, { id: firstId, num: String(this.counters.equation), kind: 'equation' }));
        return r;
      }).filter((r, idx) => !(idx === rows.length - 1 && r.trim() === ''));
      let target = { align: 'align*', flalign: 'align*', eqnarray: 'align*', alignat: 'alignat*', gather: 'gather*', multline: 'gather*' }[base] || 'gather*';
      if (base === 'eqnarray') {
        // eqnarray uses "a &=& b": collapse to align style
        for (let k = 0; k < out.length; k++) out[k] = out[k].replace(/&\s*([^&]*?)\s*&/, '&$1 ');
      }
      tex = `\\begin{${target}}${argPrefix}${out.join('\\\\')}\\end{${target}}`;
    }
    // comments and \resizebox wrappers (text-mode only) are not valid inside KaTeX math
    tex = tex.replace(/(^|[^\\])%[^\n]*/g, '$1');
    for (;;) {
      const m = /\\(?:resizebox|scalebox)\*?\s*\{[^{}]*\}(?:\s*\{[^{}]*\})?\s*\{/.exec(tex);
      if (!m) break;
      let depth = 1, i = m.index + m[0].length;
      while (i < tex.length && depth) { const c = tex[i]; if (c === '\\') i++; else if (c === '{') depth++; else if (c === '}') depth--; i++; }
      let inner = tex.slice(m.index + m[0].length, i - 1).trim();
      if (inner.startsWith('$') && inner.endsWith('$')) inner = inner.replace(/^\$+|\$+$/g, '');
      tex = tex.slice(0, m.index) + inner + tex.slice(i);
    }
    const html = render(tex, true);
    return { block: `<div class="math-display"${firstId ? ` id="${firstId}"` : ''}>${anchors}${html}</div>` };
  }

  // ------------------------------------------------------------------ floats
  includegraphics(s) {
    s.star();
    const o = plain(s.opt());
    const path = plain(s.arg()).replace(/\\([_#%&{}~])/g, '$1').replace(/\\_/g, '_');
    const asset = this.opts.resolveAsset ? this.opts.resolveAsset(path, this.graphicspath) : null;
    if (!asset) { this.warn(`Image not found: ${path}`); return `<span class="missing-figure">[missing figure: ${esc(path)}]</span>`; }
    let style = '';
    const w = /(?:^|,)\s*width\s*=\s*([\d.]*)\s*\\(textwidth|linewidth|columnwidth|hsize)/.exec(o);
    const wAbs = /(?:^|,)\s*width\s*=\s*([\d.]+)\s*(cm|mm|in|pt|em|px)/.exec(o);
    const scale = /(?:^|,)\s*scale\s*=\s*([\d.]+)/.exec(o);
    if (w) style = `width:${Math.min(100, Math.round(parseFloat(w[1] || '1') * 100))}%`;
    else if (wAbs) {
      const f = { cm: 37.8, mm: 3.78, in: 96, pt: 1.33, em: 16, px: 1 }[wAbs[2]];
      style = `width:${Math.round(parseFloat(wAbs[1]) * f)}px`;
    } else if (scale) style = `width:${Math.min(100, Math.round(parseFloat(scale[1]) * 100))}%`;
    const alt = esc(path.split('/').pop().replace(/\.[a-z]+$/i, '').replace(/[-_]/g, ' '));
    if (asset.type === 'pdf') {
      return `<object class="doc-pdf" data="${esc(asset.url)}" type="application/pdf"${style ? ` style="${style}"` : ''}><a href="${esc(asset.url)}">${alt} (PDF)</a></object>`;
    }
    return `<img src="${esc(asset.url)}" alt="${alt}" loading="lazy"${style ? ` style="${style}"` : ''}>`;
  }

  caption(name, s) {
    let kind = this.float ? this.float.kind : 'figure';
    if (name === 'captionof') { kind = plain(s.arg()); }
    const star = name === 'caption*' || s.star();
    s.opt();
    const text = this.inline(s.arg());
    if (star || name === 'caption*') return { block: `<figcaption>${text}</figcaption>` };
    let label;
    let num;
    if (kind === 'subfigure') {
      const f = this.float;
      f.sub = (f.sub || 0) + 1;
      const letter = String.fromCharCode(96 + f.sub);
      const parentNum = (this.float.parent && this.float.parent.num) || ((this.usesChapters ? `${this.counters.chapter}.` : '') + (this.counters.figure + 1));
      num = `${parentNum}${letter}`;
      label = `(${letter})`;
    } else {
      this.counters[kind] = (this.counters[kind] || 0) + 1;
      num = (this.usesChapters ? `${this.counters.chapter}.` : '') + this.counters[kind];
      if (this.float) this.float.num = num;
      label = `${KIND_NAMES[kind] || kind} ${num}:`;
    }
    const id = this.uniqueId(`${kind}-${num}`);
    this.currentRef = { id, num, kind };
    return { block: `<figcaption id="${id}"><span class="cap-label">${label}</span> ${text}</figcaption>` };
  }

  floatEnv(kind, n, s, cls) {
    const body = new Stream(n.children);
    if (kind === 'figure' || kind === 'table' || kind === 'algorithm') body.opt();
    if (n.name === 'wrapfigure' || n.name === 'wraptable') { body.opt(); body.arg(); body.opt(); body.arg(); }
    const prevFloat = this.float;
    const prevRef = this.currentRef;
    this.float = { kind, parent: prevFloat };
    if (kind === 'algorithm' && this.isAlgorithm2e(n.children)) {
      const html2e = this.algorithm2e(n.children);
      this.float = prevFloat;
      this.currentRef = prevRef;
      return { block: `<figure class="${cls}">${html2e}</figure>` };
    }
    let html = this.blocks(body);
    this.float = prevFloat;
    this.currentRef = prevRef;
    return { block: `<figure class="${cls}">${html}</figure>` };
  }

  subfloat(s) {
    const cap = s.opt();
    s.opt();
    const content = s.arg();
    const prev = this.float;
    this.float = { kind: 'subfigure', parent: prev, sub: prev ? prev.sub : 0 };
    let capHtml = '';
    const inner = this.inline(content);
    if (cap) {
      const stream = new Stream([{ type: 'group', children: cap }]);
      const r = this.caption('caption', stream);
      capHtml = r.block;
    }
    if (prev) prev.sub = this.float.sub;
    this.float = prev;
    return `<span class="subfigure">${inner}${capHtml}</span>`;
  }

  // ------------------------------------------------------------------ environments
  env(n, s) {
    const name = n.name;
    const customEnv = this.opts.customEnvs && this.opts.customEnvs[name];
    if (customEnv) return customEnv(n, s, this);

    if (n.verbatim) {
      if (name === 'comment') return '';
      let lang = '';
      const mm = /^\{([^}]*)\}/.exec(n.args || '');
      if (name === 'minted' && mm) lang = mm[1];
      const ml = /language\s*=\s*\{?([\w+#-]+)/.exec(n.args || '');
      if (ml) lang = ml[1];
      const cap = /caption\s*=\s*\{([^}]*)\}|caption\s*=\s*([^,\]]*)/.exec(n.args || '');
      let capHtml = '';
      if (cap) {
        this.counters.listing = (this.counters.listing || 0) + 1;
        capHtml = `<figcaption><span class="cap-label">Listing ${this.counters.listing}:</span> ${esc(cap[1] || cap[2])}</figcaption>`;
      }
      const code = `<pre class="code"><code${lang ? ` class="language-${esc(lang.toLowerCase())}"` : ''}>${esc(n.raw.replace(/\s+$/, ''))}</code></pre>`;
      return { block: capHtml ? `<figure class="doc-listing">${code}${capHtml}</figure>` : code };
    }

    const body = () => this.blocks(n.children);

    switch (name) {
      case 'document': return { block: body() };
      case 'abstract': return { block: `<section class="doc-abstract"><h2 class="abstract-title">Abstract</h2>${body()}</section>` };
      case 'list': case 'itemize': case 'enumerate': case 'description': case 'compactitem': case 'compactenum': case 'inparaenum':
      case 'enumerate*': case 'itemize*': case 'asparaenum': case 'outline': case 'checklist':
        return { block: this.list(n) };
      case 'figure': case 'figure*': case 'wrapfigure': case 'SCfigure':
        return this.floatEnv('figure', n, s, 'doc-figure');
      case 'table': case 'table*': case 'wraptable':
        return this.floatEnv('table', n, s, 'doc-table');
      case 'algorithm': case 'algorithm*':
        return this.floatEnv('algorithm', n, s, 'doc-algorithm');
      case 'subfigure': case 'subtable': case 'minipage': {
        const bs = new Stream(n.children);
        bs.opt(); bs.opt(); bs.opt();
        const w = plain(bs.arg());
        const m = /([\d.]*)\s*\\(textwidth|linewidth|columnwidth)/.exec(w);
        const style = m ? ` style="flex-basis:${Math.round(parseFloat(m[1] || '1') * 100)}%"` : '';
        if (name === 'minipage') return { block: `<div class="minipage"${style}>${this.blocks(bs)}</div>` };
        const prev = this.float;
        this.float = { kind: name === 'subtable' ? 'table' : 'subfigure', parent: prev, sub: prev ? prev.sub : 0 };
        const html = this.blocks(bs);
        if (prev) prev.sub = this.float.sub;
        this.float = prev;
        return { block: `<div class="subfigure"${style}>${html}</div>` };
      }
      case 'tabular': case 'tabular*': case 'tabularx': case 'tabulary': case 'longtable': case 'array': case 'longtable*':
      case 'supertabular': case 'xltabular': case 'tblr':
        return { block: this.tabular(n) };
      case 'center': return { block: `<div class="center">${body()}</div>` };
      case 'flushleft': case 'raggedright': return { block: `<div class="flushleft">${body()}</div>` };
      case 'flushright': case 'raggedleft': return { block: `<div class="flushright">${body()}</div>` };
      case 'quote': case 'quotation': case 'verse': case 'displayquote':
        return { block: `<blockquote>${body()}</blockquote>` };
      case 'proof': {
        const bs = new Stream(n.children);
        const o = bs.opt();
        const title = o ? this.inline(o) : 'Proof';
        return { block: `<div class="doc-proof"><em class="proof-title">${title}.</em> ${this.blocks(bs)}<span class="qed">∎</span></div>` };
      }
      case 'algorithmic': return { block: this.algorithmic(n) };
      case 'multicols': case 'multicols*': {
        const bs = new Stream(n.children);
        const k = parseInt(plain(bs.arg()), 10) || 2;
        return { block: `<div class="multicols" style="columns:${k}">${this.blocks(bs)}</div>` };
      }
      case 'thebibliography': return { block: this.thebibliography(n) };
      case 'small': case 'footnotesize': case 'scriptsize': case 'large': case 'Large': case 'normalsize': case 'adjustbox':
      case 'landscape': case 'singlespace': case 'onehalfspace': case 'doublespace': case 'spacing': case 'resizebox':
      case 'tcolorbox': case 'framed': case 'mdframed': case 'titlepage': case 'sloppypar': case 'appendices': case 'subequations':
        if (name === 'appendices') { this.appendix = true; this.counters.section = 0; }
        if (name === 'tcolorbox' || name === 'framed' || name === 'mdframed') return { block: `<div class="doc-box">${body()}</div>` };
        return { block: body() };
      case 'tikzpicture': case 'axis': case 'circuitikz':
        this.warn('TikZ drawings cannot be rendered on the web: export them as PDF/PNG and use \\includegraphics');
        return { block: '<div class="missing-figure">[TikZ figure]</div>' };
      default: break;
    }

    const thm = this.theorems.get(name.replace('*', ''));
    if (thm) {
      const bs = new Stream(n.children);
      const o = bs.opt();
      let num = '';
      if (thm.counter && !name.endsWith('*')) {
        const c = (this.thmCounters.get(thm.counter) || 0) + 1;
        this.thmCounters.set(thm.counter, c);
        num = (thm.within && this.counters[thm.within] ? `${this.counters[thm.within]}.` : '') + c;
      }
      const id = this.uniqueId(`${name}-${num}`);
      const prevRef = this.currentRef;
      this.currentRef = { id, num, kind: thm.title };
      const html = this.blocks(bs);
      this.currentRef = prevRef;
      return { block: `<div class="doc-theorem thm-${esc(name.replace('*', ''))}" id="${id}"><strong class="thm-title">${esc(thm.title)}${num ? ' ' + num : ''}${o ? ` <span class="thm-note">(${this.inline(o)})</span>` : ''}.</strong> ${html}</div>` };
    }

    this.warn(`Unsupported environment "${name}" (rendered as plain content)`);
    return { block: `<div class="env-${esc(name.replace(/[^a-z0-9-]/gi, ''))}">${body()}</div>` };
  }

  list(n) {
    const name = n.name;
    const s = new Stream(n.children);
    if (name === 'list') { s.arg(); s.arg(); }
    const listOpt = name === 'list' ? null : s.opt();
    const items = [];
    let cur = null;
    while (!s.done()) {
      const t = s.next();
      if (t.type === 'macro' && t.name === 'item') {
        cur = { label: s.opt(), nodes: [] };
        items.push(cur);
        continue;
      }
      if (cur) cur.nodes.push(t);
      else if (t.type === 'macro') this.node(t, s); // e.g. \setlength before first item
    }
    const unwrap = (h) => {
      const m = /^<p>([\s\S]*)<\/p>$/.exec(h);
      return m && !m[1].includes('<p>') ? m[1] : h;
    };
    if (name === 'description' || name === 'list') {
      return `<dl class="doc-description">${items.map((it) => `<dt>${this.inline(it.label)}</dt><dd>${unwrap(this.blocks(it.nodes))}</dd>`).join('')}</dl>`;
    }
    const ordered = /enum/.test(name);
    let type = '';
    const lo = plain(listOpt || []);
    if (/\\alph|\(a\)|^a/.test(lo)) type = ' type="a"';
    else if (/\\Alph|^A/.test(lo)) type = ' type="A"';
    else if (/\\roman|^i/.test(lo)) type = ' type="i"';
    else if (/\\Roman|^I/.test(lo)) type = ' type="I"';
    const tag = ordered ? 'ol' : 'ul';
    const lis = items.map((it) => {
      const prevRef = this.currentRef;
      const content = unwrap(this.blocks(it.nodes));
      this.currentRef = prevRef;
      if (it.label) return `<li class="custom-label"><span class="item-label">${this.inline(it.label)}</span>${content}</li>`;
      return `<li>${content}</li>`;
    }).join('');
    return `<${tag} class="doc-list"${type}>${lis}</${tag}>`;
  }

  tabular(n) {
    const s = new Stream(n.children);
    const name = n.name;
    if (name === 'tabular*' || name === 'tabularx' || name === 'tabulary' || name === 'xltabular') s.arg();
    s.opt();
    const spec = this.colSpec(s.arg());
    const rows = [];
    let row = { cells: [[]], ruleBefore: false };
    const pushRow = () => { rows.push(row); row = { cells: [[]], ruleBefore: false }; };
    let caption = '';
    while (!s.done()) {
      const t = s.next();
      if (t.type === 'macro') {
        if (t.name === '\\' || t.name === 'tabularnewline' || t.name === 'cr') { s.star(); s.opt(); pushRow(); continue; }
        if (['hline', 'toprule', 'midrule', 'bottomrule', 'specialrule', 'Xhline'].includes(t.name)) {
          if (t.name === 'specialrule') { s.arg(); s.arg(); s.arg(); }
          if (t.name === 'Xhline') s.arg();
          const onlyEmpty = row.cells.length === 1 && row.cells[0].every((x) => x.type === 'ws');
          if (onlyEmpty) row.ruleBefore = true; else if (rows.length) rows[rows.length - 1].ruleAfter = true;
          continue;
        }
        if (t.name === 'cline' || t.name === 'cmidrule') {
          const nx = s.peek();
          if (nx && nx.type === 'text' && nx.value.startsWith('(')) {
            const close = nx.value.indexOf(')');
            if (close !== -1 && close < nx.value.length - 1) nx.value = nx.value.slice(close + 1); else s.next();
          }
          s.opt(); s.arg();
          row.ruleBefore = true;
          continue;
        }
        if (['endhead', 'endfirsthead', 'endfoot', 'endlastfoot', 'addlinespace', 'noalign'].includes(t.name)) {
          if (t.name === 'addlinespace') s.opt();
          if (t.name === 'noalign') s.arg();
          continue;
        }
        if (t.name === 'caption') {
          const r = this.caption('caption', s);
          caption = r.block;
          continue;
        }
        if (t.name === 'label') { this.label(plain(s.arg())); continue; }
      }
      if (t.type === 'char' && t.value === '&') { row.cells.push([]); continue; }
      row.cells[row.cells.length - 1].push(t);
    }
    if (row.cells.some((c) => c.some((x) => x.type !== 'ws' && x.type !== 'parbreak'))) pushRow();
    else if (row.ruleBefore && rows.length) rows[rows.length - 1].ruleAfter = true;

    const headerSplit = rows.length > 1 && (rows[0].ruleAfter || rows[1].ruleBefore);
    const renderRow = (r, isHead) => {
      let col = 0;
      const cells = r.cells.map((nodes) => {
        const cs = new Stream(nodes);
        cs.skipWs(true);
        let colspan = 1;
        let align = spec[col] || 'left';
        const first = cs.peek();
        let inner;
        if (first && first.type === 'macro' && first.name === 'multicolumn') {
          cs.next();
          colspan = parseInt(plain(cs.arg()), 10) || 1;
          align = this.colSpec(cs.arg())[0] || align;
          inner = this.inline(cs.arg()) + this.inline(cs.nodes.slice(cs.i));
        } else {
          inner = this.inline(cs.nodes.slice(cs.i));
        }
        col += colspan;
        const tag = isHead ? 'th' : 'td';
        return `<${tag}${colspan > 1 ? ` colspan="${colspan}"` : ''}${align !== 'left' ? ` style="text-align:${align}"` : ''}>${inner.trim()}</${tag}>`;
      }).join('');
      const cls = [r.ruleBefore ? 'rule-top' : '', r.ruleAfter ? 'rule-bottom' : ''].filter(Boolean).join(' ');
      return `<tr${cls ? ` class="${cls}"` : ''}>${cells}</tr>`;
    };
    const head = headerSplit ? `<thead>${renderRow(rows[0], true)}</thead>` : '';
    const bodyRows = (headerSplit ? rows.slice(1) : rows).map((r) => renderRow(r, false)).join('');
    return `<div class="table-scroll"><table class="doc-tabular">${head}<tbody>${bodyRows}</tbody></table></div>${caption}`;
  }

  colSpec(nodes) {
    const out = [];
    const s = new Stream(nodes || []);
    while (!s.done()) {
      const t = s.next();
      if (t.type === 'text') {
        for (const ch of t.value) {
          if (ch === 'l' || ch === 'L') out.push('left');
          else if (ch === 'c' || ch === 'C') out.push('center');
          else if (ch === 'r' || ch === 'R') out.push('right');
          else if (ch === 'X' || ch === 'J') out.push('left');
          else if (ch === 'p' || ch === 'm' || ch === 'b') { out.push('left'); }
          else if (ch === '@' || ch === '>' || ch === '<' || ch === '!') { /* argument follows as group */ }
        }
      } else if (t.type === 'char' && t.value === '*') {
        // never produced (* lives in text); handled below
      }
    }
    // handle *{n}{spec}
    const raw = stringify(nodes || []);
    const rep = /\*\{(\d+)\}\{([^}]*)\}/.exec(raw);
    if (rep) {
      const inner = this.colSpec(parse(rep[2]));
      const res = [];
      const before = this.colSpec(parse(raw.slice(0, rep.index)));
      for (let k = 0; k < +rep[1]; k++) res.push(...inner);
      const after = this.colSpec(parse(raw.slice(rep.index + rep[0].length)));
      return [...before, ...res, ...after];
    }
    // groups (p{3cm}, @{}, >{..}) have been skipped because they are 'group' nodes
    return out;
  }

  // ---- algorithm2e (\KwIn, \For{..}{..}, \If, \tcp, \; ...)
  isAlgorithm2e(children) {
    const A2E = new Set(['KwIn', 'KwOut', 'KwInput', 'KwOutput', 'For', 'ForEach', 'ForAll', 'While', 'If', 'lIf', 'tcp', 'tcc', 'BlankLine', ';', 'Input', 'Output', 'SetKwInOut', 'SetKwInput', 'DontPrintSemicolon', 'Repeat']);
    if (children.some((c) => c.type === 'env' && /^algorithmic/.test(c.name))) return false;
    return children.some((c) => c.type === 'macro' && (A2E.has(c.name) || (this.a2e && (this.a2e.io[c.name] || this.a2e.loops[c.name]))));
  }

  algorithm2e(children) {
    const a = this.a2eState();
    const kw = (w) => `<strong class="alg-kw">${w}</strong>`;
    const rows = [];
    let caption = '';
    const LOOPS = Object.assign({ For: ['for', 'do'], ForEach: ['for each', 'do'], ForAll: ['for all', 'do'], While: ['while', 'do'] }, a.loops);
    const run = (nodes, indent) => {
      const s = new Stream(nodes);
      let cur = null;
      const start = (html = '', num = true) => { cur = { indent, html, num }; rows.push(cur); return cur; };
      const ensure = () => cur || start('');
      const flush = () => { cur = null; };
      const block = (html, num = false) => { flush(); rows.push({ indent, html, num }); };
      const header = (html) => { flush(); rows.push({ indent, html, num: true }); };
      while (!s.done()) {
        const t = s.next();
        if (t.type === 'macro') {
          const nm = t.name;
          if (nm === 'caption' || nm === 'caption*') { const r = this.node(t, s); caption = (r && r.block) || ''; continue; }
          if (nm === 'label') { this.node(t, s); continue; }
          if (nm === ';') { flush(); continue; }
          if (['DontPrintSemicolon', 'PrintSemicolon', 'SetAlgoNoLine', 'SetAlgoNoEnd', 'SetAlgoLined', 'LinesNumbered', 'LinesNotNumbered', 'SetAlgoVlined', 'nllabel'].includes(nm)) continue;
          if (nm === 'BlankLine') { flush(); continue; }
          if (['SetAlFnt', 'SetAlCapFnt', 'SetKwSty', 'SetNlSty', 'SetAlgoCaptionSeparator'].includes(nm)) { s.opt(); s.arg(); continue; }
          if (['SetKwInOut', 'SetKwInput', 'SetKw', 'SetKwProg', 'SetKwData', 'SetKwFunction'].includes(nm)) { s.arg(); s.arg(); if (nm === 'SetKwProg') { s.arg(); s.arg(); } continue; }
          if (['SetKwFor', 'SetKwIF', 'SetKwRepeat', 'SetKwSwitch'].includes(nm)) { const c = nm === 'SetKwFor' ? 4 : nm === 'SetKwRepeat' ? 3 : 6; for (let i = 0; i < c; i++) s.arg(); continue; }
          if (a.io[nm]) { const c = s.arg() || []; block(`${kw(a.io[nm] + ':')} ${this.inline(c)}`); continue; }
          if (nm === 'tcp' || nm === 'tcc' || nm === 'tcp*') {
            s.star();
            const c = this.inline(s.arg() || []);
            const span = `<span class="alg-comment">▷ ${c}</span>`;
            if (cur && cur.html.trim()) cur.html += ` ${span}`;
            else block(span.replace('class="alg-comment"', 'class="alg-comment alg-comment-line"'));
            continue;
          }
          if (LOOPS[nm]) {
            const cond = this.inline(s.arg() || []);
            const body = s.arg() || [];
            header(`${kw(LOOPS[nm][0])} ${cond} ${kw(LOOPS[nm][1])}`);
            run(body, indent + 1);
            continue;
          }
          if (nm === 'If' || nm === 'uIf') { const c = this.inline(s.arg() || []); const b = s.arg() || []; header(`${kw('if')} ${c} ${kw('then')}`); run(b, indent + 1); continue; }
          if (nm === 'ElseIf' || nm === 'uElseIf') { const c = this.inline(s.arg() || []); const b = s.arg() || []; header(`${kw('else if')} ${c} ${kw('then')}`); run(b, indent + 1); continue; }
          if (nm === 'Else' || nm === 'uElse') { const b = s.arg() || []; header(kw('else')); run(b, indent + 1); continue; }
          if (nm === 'lIf') { const c = this.inline(s.arg() || []); const b = this.inline(s.arg() || []); header(`${kw('if')} ${c} ${kw('then')} ${b}`); continue; }
          if (nm === 'lElseIf') { const c = this.inline(s.arg() || []); const b = this.inline(s.arg() || []); header(`${kw('else if')} ${c} ${kw('then')} ${b}`); continue; }
          if (nm === 'lElse') { const b = this.inline(s.arg() || []); header(`${kw('else')} ${b}`); continue; }
          if (nm === 'Repeat') { const b = s.arg() || []; const c = this.inline(s.arg() || []); header(kw('repeat')); run(b, indent + 1); header(`${kw('until')} ${c}`); continue; }
          if (nm === 'Return' || nm === 'KwRet' || nm === 'KwReturn') { ensure().html += `${kw('return')} `; continue; }
          if (nm === 'KwTo') { ensure().html += ` ${kw('to')} `; continue; }
          if (nm === 'KwFrom') { ensure().html += ` ${kw('from')} `; continue; }
          if (nm === 'KwIn' || nm === 'KwOut') { /* handled via io */ }
          if (a.kw[nm]) { ensure().html += ` ${kw(a.kw[nm])} `; continue; }
        }
        if (!cur && (t.type === 'ws' || t.type === 'parbreak')) continue;
        if (t.type === 'parbreak') continue;
        const r = this.node(t, s);
        if (r != null && typeof r === 'object') {
          if (r.block) block(r.block);
          continue;
        }
        if (r === '' || r == null) continue;
        ensure().html += r;
      }
    };
    run(children, 0);
    let k = 0;
    const html = rows.filter((r) => r.html.replace(/<[^>]*>/g, '').trim() || /<(img|svg|span class="math)/.test(r.html)).map((r) => {
      const num = r.num ? `<span class="alg-num">${++k}:</span>` : '<span class="alg-num"></span>';
      return `<div class="alg-line" style="--indent:${r.indent}">${num}<span class="alg-body">${r.html.trim()}</span></div>`;
    }).join('');
    return `${caption}${html ? `<div class="doc-algorithmic doc-alg2e">${html}</div>` : ''}`;
  }

  a2eState() {
    if (!this.a2e) this.a2e = { io: { KwIn: 'Input', KwOut: 'Output', KwInput: 'Input', KwOutput: 'Output', Input: 'Input', Output: 'Output', Data: 'Data', Result: 'Result' }, loops: {}, kw: {} };
    return this.a2e;
  }

  algorithmic(n) {
    const s = new Stream(n.children);
    const numbered = !!s.opt();
    const lines = [];
    let indent = 0;
    let cur = null;
    const kw = (w) => `<strong class="alg-kw">${w}</strong>`;
    const start = (html, extraIndent = 0) => { cur = { indent: indent + extraIndent, html }; lines.push(cur); };
    const STMT = new Set(['State', 'STATE', 'Statex', 'If', 'IF', 'ElsIf', 'ELSIF', 'Else', 'ELSE', 'EndIf', 'ENDIF', 'For', 'FOR',
      'ForAll', 'FORALL', 'EndFor', 'ENDFOR', 'While', 'WHILE', 'EndWhile', 'ENDWHILE', 'Repeat', 'REPEAT', 'Until', 'UNTIL',
      'Loop', 'LOOP', 'EndLoop', 'ENDLOOP', 'Require', 'REQUIRE', 'Ensure', 'ENSURE', 'Function', 'EndFunction', 'Procedure',
      'EndProcedure', 'Input', 'Output', 'KwIn', 'KwOut', 'Return', 'RETURN', 'Comment', 'COMMENT', 'Call', 'PRINT', 'Print']);
    while (!s.done()) {
      const t = s.next();
      if (t.type === 'macro' && STMT.has(t.name)) {
        const nm = t.name.toLowerCase();
        switch (nm) {
          case 'state': start(''); break;
          case 'statex': start(''); cur.nonum = true; break;
          case 'if': start(`${kw('if')} ${this.inline(s.arg())} ${kw('then')}`); indent++; break;
          case 'elsif': indent = Math.max(0, indent - 1); start(`${kw('else if')} ${this.inline(s.arg())} ${kw('then')}`); indent++; break;
          case 'else': indent = Math.max(0, indent - 1); start(kw('else')); indent++; break;
          case 'endif': indent = Math.max(0, indent - 1); start(kw('end if')); break;
          case 'for': start(`${kw('for')} ${this.inline(s.arg())} ${kw('do')}`); indent++; break;
          case 'forall': start(`${kw('for all')} ${this.inline(s.arg())} ${kw('do')}`); indent++; break;
          case 'endfor': indent = Math.max(0, indent - 1); start(kw('end for')); break;
          case 'while': start(`${kw('while')} ${this.inline(s.arg())} ${kw('do')}`); indent++; break;
          case 'endwhile': indent = Math.max(0, indent - 1); start(kw('end while')); break;
          case 'repeat': start(kw('repeat')); indent++; break;
          case 'until': indent = Math.max(0, indent - 1); start(`${kw('until')} ${this.inline(s.arg())}`); break;
          case 'loop': start(kw('loop')); indent++; break;
          case 'endloop': indent = Math.max(0, indent - 1); start(kw('end loop')); break;
          case 'require': case 'input': case 'kwin': start(`${kw(nm === 'require' ? 'Require:' : 'Input:')} `); cur.nonum = true; if (nm === 'kwin') cur.html += this.inline(s.arg()); break;
          case 'ensure': case 'output': case 'kwout': start(`${kw(nm === 'ensure' ? 'Ensure:' : 'Output:')} `); cur.nonum = true; if (nm === 'kwout') cur.html += this.inline(s.arg()); break;
          case 'function': case 'procedure': {
            const fname = this.inline(s.arg());
            const args = this.inline(s.arg());
            start(`${kw(nm)} <span class="sc">${fname}</span>(${args})`);
            indent++;
            break;
          }
          case 'endfunction': case 'endprocedure': indent = Math.max(0, indent - 1); start(kw(nm === 'endfunction' ? 'end function' : 'end procedure')); break;
          case 'return': if (!cur) start(''); cur.html += `${kw('return')} `; break;
          case 'print': if (!cur) start(''); cur.html += `${kw('print')} `; break;
          case 'comment': { const c = this.inline(s.arg()); if (!cur) start(''); cur.html += ` <span class="alg-comment">▷ ${c}</span>`; break; }
          case 'call': { const f = this.inline(s.arg()); const a = this.inline(s.arg()); if (!cur) start(''); cur.html += `<span class="sc">${f}</span>(${a})`; break; }
          default: break;
        }
        continue;
      }
      if (!cur) { if (t.type === 'ws' || t.type === 'parbreak') continue; start(''); }
      const r = this.node(t, s);
      if (r != null) cur.html += typeof r === 'object' ? (r.block || '') : r;
    }
    let k = 0;
    const rows = lines.map((l) => {
      const num = numbered && !l.nonum ? `<span class="alg-num">${++k}:</span>` : '';
      return `<div class="alg-line" style="--indent:${l.indent}">${num}<span class="alg-body">${l.html.trim()}</span></div>`;
    }).join('');
    return `<div class="doc-algorithmic">${rows}</div>`;
  }

  thebibliography(n) {
    const s = new Stream(n.children);
    s.arg();
    this.manualBib = this.manualBib || new Map();
    let cur = null;
    const items = [];
    while (!s.done()) {
      const t = s.next();
      if (t.type === 'macro' && t.name === 'bibitem') {
        s.opt();
        cur = { key: plain(s.arg()), nodes: [] };
        items.push(cur);
        continue;
      }
      if (t.type === 'macro' && t.name === 'newblock') continue;
      if (cur) cur.nodes.push(t);
    }
    for (const it of items) this.manualBib.set(it.key, this.inline(it.nodes).trim());
    return '\u0001bibliography\u0001';
  }

  // ------------------------------------------------------------------ finalize
  finalize(html) {
    // references list
    const bibHtml = () => {
      const entries = [];
      if (this.nociteAll) {
        for (const k of this.bib.keys()) this.citeNum(k);
        if (this.manualBib) for (const k of this.manualBib.keys()) this.citeNum(k);
      }
      if (this.manualBib) for (const k of this.manualBib.keys()) this.citeNum(k);
      const sorted = [...this.citeNums.entries()].sort((a, b) => a[1] - b[1]);
      for (const [key, num] of sorted) {
        let body;
        if (this.manualBib && this.manualBib.has(key)) body = this.manualBib.get(key);
        else if (this.bib.has(key)) body = formatBibEntry(this.bib.get(key), (t) => this.inline(parse(t)));
        else { body = `<span class="ref-missing">Missing reference: ${esc(key)}</span>`; this.warn(`Citation key not found: ${key}`); }
        entries.push(`<li id="ref-${esc(key)}" value="${num}"><span class="bib-num">[${num}]</span> ${body}</li>`);
      }
      if (!entries.length) return '';
      const heading = this.opts.referencesTitle || 'References';
      const id = this.uniqueId('references');
      this.toc.push({ level: 1, num: null, title: esc(heading), id });
      return `<section class="doc-references"><h2 id="${id}" class="doc-heading">${esc(heading)}</h2><ol class="bib-list">${entries.join('')}</ol></section>`;
    };
    let bibDone = false;
    html = html.replace(/\u0001bibliography\u0001/g, () => { if (bibDone) return ''; bibDone = true; return bibHtml(); });

    html = html.replace(/\u0001cite:([^:]*):([^:]*):([^:]*):([^\u0001]*)\u0001/g, (_, mode, keys, pre, post) => {
      pre = decodeURIComponent(pre);
      post = decodeURIComponent(post);
      const ks = keys.split(',');
      const link = (k) => `<a href="#ref-${esc(k)}" class="cite">${this.citeNums.get(k)}</a>`;
      if (mode === 'citet' || mode === 'textcite' || mode === 'Citet' || mode === 'citealt') {
        return ks.map((k) => {
          const e = this.bib.get(k);
          const who = e ? citeAuthor(e, (t) => this.inline(parse(t))) : esc(k);
          return `${who} [${link(k)}${post ? ', ' + post : ''}]`;
        }).join(', ');
      }
      if (mode === 'citeauthor') return ks.map((k) => { const e = this.bib.get(k); return e ? citeAuthor(e, (t) => this.inline(parse(t))) : esc(k); }).join(', ');
      if (mode === 'citeyear') return ks.map((k) => { const e = this.bib.get(k); return e && e.fields.year ? esc(e.fields.year) : '?'; }).join(', ');
      return `<span class="cite-group">[${pre ? pre + ' ' : ''}${ks.map(link).join(', ')}${post ? ', ' + post : ''}]</span>`;
    });

    html = html.replace(/\u0001ref:([^:]*):([^\u0001]*)\u0001/g, (_, mode, key) => {
      const l = this.labels.get(key);
      if (!l) { this.warn(`Undefined reference: ${key}`); return '<span class="ref-missing">??</span>'; }
      if (mode === 'page') return `<a href="#${l.id}">↗</a>`;
      if (mode === 'eq') return `(<a href="#${l.id}" class="xref">${l.num}</a>)`;
      if (mode === 'auto') {
        const kn = KIND_NAMES[l.kind] || (l.kind && l.kind[0] === l.kind[0].toUpperCase() ? l.kind : '');
        const num = l.kind === 'equation' ? `(${l.num})` : l.num;
        return `<a href="#${l.id}" class="xref">${kn ? kn + '&nbsp;' : ''}${num}</a>`;
      }
      return `<a href="#${l.id}" class="xref">${l.num}</a>`;
    });
    return html;
  }
}

// Split the body of an align-like environment into rows at top-level \\ .
function splitRows(raw) {
  const rows = [];
  let depth = 0;
  let envDepth = 0;
  let cur = '';
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === '\\') {
      if (raw[i + 1] === '\\' && depth === 0 && envDepth === 0) {
        rows.push(cur);
        cur = '';
        i++;
        // optional spacing argument [2pt]
        const m = /^\s*\[[^\]]*\]/.exec(raw.slice(i + 1));
        if (m) i += m[0].length;
        continue;
      }
      if (raw.startsWith('begin{', i + 1)) envDepth++;
      if (raw.startsWith('end{', i + 1)) envDepth--;
      cur += c + (raw[i + 1] || '');
      i++;
      continue;
    }
    if (c === '{') depth++;
    if (c === '}') depth--;
    cur += c;
  }
  rows.push(cur);
  return rows;
}
