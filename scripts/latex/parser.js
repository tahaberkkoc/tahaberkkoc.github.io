// Minimal, forgiving LaTeX parser.
// Produces a flat-ish AST: text, ws, parbreak, special chars, groups, macros,
// environments (with raw bodies for verbatim / math), and math nodes.
// Macro arguments are NOT attached at parse time; the renderer reads them from
// the following siblings (just like TeX does), see Stream below.

export const MATH_ENVS = new Set([
  'equation', 'equation*', 'align', 'align*', 'gather', 'gather*', 'multline', 'multline*',
  'eqnarray', 'eqnarray*', 'flalign', 'flalign*', 'alignat', 'alignat*', 'displaymath', 'math',
]);

export const VERBATIM_ENVS = new Set([
  'verbatim', 'verbatim*', 'Verbatim', 'lstlisting', 'minted', 'comment', 'filecontents', 'filecontents*',
]);

const SPECIAL = new Set(['&', '~', '[', ']', '#', '^', '_']);

export function parse(src) {
  const p = new Parser(src.replace(/\r\n?/g, '\n'));
  return p.parseSeq(null);
}

class Parser {
  constructor(src) {
    this.s = src;
    this.i = 0;
  }

  eof() { return this.i >= this.s.length; }

  // Parse until a closing brace (end === '}') or \end{name} (end = {env}) or EOF.
  parseSeq(end) {
    const out = [];
    let text = '';
    const flush = () => { if (text) { out.push({ type: 'text', value: text }); text = ''; } };

    while (!this.eof()) {
      const c = this.s[this.i];

      if (c === '%') { // comment: skip to end of line and leading spaces of next line
        flush();
        const nl = this.s.indexOf('\n', this.i);
        if (nl === -1) { this.i = this.s.length; break; }
        this.i = nl + 1;
        while (this.s[this.i] === ' ' || this.s[this.i] === '\t') this.i++;
        continue;
      }

      if (c === '}') {
        if (end === '}') { flush(); this.i++; return out; }
        this.i++; // stray brace: ignore
        continue;
      }

      if (c === '{') {
        flush();
        this.i++;
        out.push({ type: 'group', children: this.parseSeq('}') });
        continue;
      }

      if (c === '$') {
        flush();
        out.push(this.parseDollarMath());
        continue;
      }

      if (c === ' ' || c === '\t' || c === '\n') {
        flush();
        out.push(this.parseWhitespace());
        continue;
      }

      if (SPECIAL.has(c)) {
        flush();
        out.push({ type: 'char', value: c });
        this.i++;
        continue;
      }

      if (c === '\\') {
        flush();
        const node = this.parseMacro(end);
        if (node === END_REACHED) return out;
        if (node) out.push(node);
        continue;
      }

      text += c;
      this.i++;
    }
    flush();
    return out;
  }

  parseWhitespace() {
    let newlines = 0;
    while (!this.eof()) {
      const c = this.s[this.i];
      if (c === '\n') newlines++;
      else if (c !== ' ' && c !== '\t') {
        // a comment line between blank lines should not break the paragraph logic
        break;
      }
      this.i++;
    }
    return newlines >= 2 ? { type: 'parbreak' } : { type: 'ws' };
  }

  parseDollarMath() {
    const display = this.s[this.i + 1] === '$';
    const delim = display ? '$$' : '$';
    this.i += delim.length;
    const start = this.i;
    while (!this.eof()) {
      if (this.s[this.i] === '\\') { this.i += 2; continue; }
      if (this.s.startsWith(delim, this.i)) {
        const raw = this.s.slice(start, this.i);
        this.i += delim.length;
        return { type: 'math', display, raw };
      }
      this.i++;
    }
    return { type: 'math', display, raw: this.s.slice(start) };
  }

  readUntil(closing) {
    const start = this.i;
    const idx = this.s.indexOf(closing, this.i);
    if (idx === -1) { this.i = this.s.length; return this.s.slice(start); }
    this.i = idx + closing.length;
    return this.s.slice(start, idx);
  }

  parseMacro(end) {
    this.i++; // backslash
    if (this.eof()) return null;
    let name;
    if (/[a-zA-Z@]/.test(this.s[this.i])) {
      const m = /^[a-zA-Z@]+/.exec(this.s.slice(this.i, this.i + 64));
      name = m[0];
      this.i += name.length;
      if (this.s[this.i] === '*' && STARRABLE.test(name)) { name += '*'; this.i++; }
      // TeX skips spaces (and a single newline) after control words
      let j = this.i;
      while (this.s[j] === ' ' || this.s[j] === '\t') j++;
      if (this.s[j] === '\n') {
        let k = j + 1;
        while (this.s[k] === ' ' || this.s[k] === '\t') k++;
        if (this.s[k] !== '\n') j = k; // don't eat a paragraph break
      }
      this.i = j;
    } else {
      name = this.s[this.i];
      this.i++;
    }

    if (name === '(') return { type: 'math', display: false, raw: this.readUntil('\\)') };
    if (name === '[') return { type: 'math', display: true, raw: this.readUntil('\\]') };

    if (name === 'verb' || name === 'verb*' || name === 'lstinline') {
      // \lstinline may have [opts]
      if (name === 'lstinline' && this.s[this.i] === '[') this.readUntil(']');
      let delim = this.s[this.i];
      this.i++;
      if (delim === '{') delim = '}';
      return { type: 'verb', raw: this.readUntil(delim) };
    }

    if (name === 'begin') {
      const envName = this.readBraced();
      if (envName == null) return { type: 'macro', name: 'begin' };
      if (MATH_ENVS.has(envName)) {
        const raw = this.readUntil(`\\end{${envName}}`);
        return { type: 'math', display: true, env: envName, raw };
      }
      if (VERBATIM_ENVS.has(envName)) {
        // capture optional/required args on the first line (lstlisting[..], minted{lang})
        let args = '';
        const m = /^(\[[^\]\n]*\])?(\{[^}\n]*\})?/.exec(this.s.slice(this.i));
        if (m) { args = m[0]; this.i += m[0].length; }
        const raw = this.readUntil(`\\end{${envName}}`).replace(/^\n/, '');
        return { type: 'env', name: envName, verbatim: true, args, raw };
      }
      const children = this.parseSeq({ env: envName });
      return { type: 'env', name: envName, children };
    }

    if (name === 'end') {
      const save = this.i;
      const envName = this.readBraced();
      if (end && typeof end === 'object' && end.env === envName) return END_REACHED;
      // mismatched \end: ignore it
      if (envName == null) this.i = save;
      return null;
    }

    return { type: 'macro', name };
  }

  readBraced() {
    let j = this.i;
    while (this.s[j] === ' ') j++;
    if (this.s[j] !== '{') return null;
    const close = this.s.indexOf('}', j);
    if (close === -1) return null;
    this.i = close + 1;
    return this.s.slice(j + 1, close).trim();
  }
}

const END_REACHED = Symbol('end');
const STARRABLE = /^(section|subsection|subsubsection|chapter|part|paragraph|subparagraph|vspace|hspace|caption|newcommand|renewcommand|providecommand|item|cite|citep|citet|footnote|cref|Cref|newtheorem|DeclareMathOperator|addcontentsline|includegraphics|Section)$/;

// ---------------------------------------------------------------------------
// Stream: sequential access to sibling nodes, with TeX-style argument reading.
export class Stream {
  constructor(nodes) {
    this.nodes = nodes.slice();
    this.i = 0;
  }
  done() { return this.i >= this.nodes.length; }
  peek() { return this.nodes[this.i]; }
  next() { return this.nodes[this.i++]; }
  insert(nodes) { this.nodes.splice(this.i, 0, ...nodes); }

  skipWs(allowPar = false) {
    while (!this.done()) {
      const n = this.peek();
      if (n.type === 'ws' || (allowPar && n.type === 'parbreak')) this.i++;
      else break;
    }
  }

  // Required argument: {group} or a single token.
  arg() {
    const save = this.i;
    this.skipWs(true);
    if (this.done()) { this.i = save; return null; }
    const n = this.peek();
    if (n.type === 'group') { this.i++; return n.children; }
    if (n.type === 'text') {
      this.i++;
      if (n.value.length > 1) {
        this.nodes.splice(this.i, 0, { type: 'text', value: n.value.slice(1) });
        return [{ type: 'text', value: n.value[0] }];
      }
      return [n];
    }
    if (n.type === 'macro' || n.type === 'char' || n.type === 'math') { this.i++; return [n]; }
    this.i = save;
    return null;
  }

  // Optional argument: [ ... ] (brackets inside groups are hidden).
  opt() {
    const save = this.i;
    this.skipWs(false);
    const n = this.peek();
    if (!n || n.type !== 'char' || n.value !== '[') { this.i = save; return null; }
    this.i++;
    const out = [];
    let depth = 0;
    while (!this.done()) {
      const t = this.next();
      if (t.type === 'char' && t.value === '[') depth++;
      if (t.type === 'char' && t.value === ']') {
        if (depth === 0) return out;
        depth--;
      }
      out.push(t);
    }
    this.i = save;
    return null;
  }

  star() {
    const n = this.peek();
    if (n && n.type === 'text' && n.value.startsWith('*')) {
      if (n.value.length === 1) this.i++;
      else this.nodes[this.i] = { type: 'text', value: n.value.slice(1) };
      return true;
    }
    return false;
  }
}

// Turn nodes back into LaTeX source (used for raw arguments like URLs, keys, paths).
export function stringify(nodes) {
  if (!nodes) return '';
  let s = '';
  for (const n of nodes) {
    switch (n.type) {
      case 'text': s += n.value; break;
      case 'ws': s += ' '; break;
      case 'parbreak': s += '\n\n'; break;
      case 'char': s += n.value; break;
      case 'group': s += '{' + stringify(n.children) + '}'; break;
      case 'macro': s += '\\' + n.name + (/[a-zA-Z]$/.test(n.name) ? ' ' : ''); break;
      case 'math':
        if (n.env) s += `\\begin{${n.env}}${n.raw}\\end{${n.env}}`;
        else s += n.display ? `\\[${n.raw}\\]` : `$${n.raw}$`;
        break;
      case 'verb': s += n.raw; break;
      case 'env':
        if (n.verbatim) s += `\\begin{${n.name}}${n.args || ''}${n.raw}\\end{${n.name}}`;
        else s += `\\begin{${n.name}}${stringify(n.children)}\\end{${n.name}}`;
        break;
      default: break;
    }
  }
  return s;
}

// Plain text (no markup) of nodes, e.g. for keys, labels, alt texts.
export function plain(nodes) {
  return stringify(nodes).replace(/\\[a-zA-Z@]+\*?\s?/g, '').replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
}
