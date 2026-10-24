// Tiny BibTeX parser + formatter (IEEE-like style).

export function parseBib(src) {
  const entries = [];
  let i = 0;
  while (true) {
    const at = src.indexOf('@', i);
    if (at === -1) break;
    const m = /^@\s*(\w+)\s*[{(]/.exec(src.slice(at));
    if (!m) { i = at + 1; continue; }
    const type = m[1].toLowerCase();
    let j = at + m[0].length;
    if (type === 'comment' || type === 'preamble' || type === 'string') {
      i = skipBalanced(src, j - 1);
      continue;
    }
    const comma = src.indexOf(',', j);
    if (comma === -1) break;
    const key = src.slice(j, comma).trim();
    j = comma + 1;
    const fields = {};
    while (j < src.length) {
      while (/[\s,]/.test(src[j])) j++;
      if (src[j] === '}' || src[j] === ')') { j++; break; }
      const fm = /^([\w-]+)\s*=\s*/.exec(src.slice(j));
      if (!fm) { j++; continue; }
      const name = fm[1].toLowerCase();
      j += fm[0].length;
      let value = '';
      const parts = [];
      // value may be concatenation: "a" # {b} # 2020
      while (true) {
        while (src[j] === ' ' || src[j] === '\n' || src[j] === '\t') j++;
        if (src[j] === '{') {
          const end = skipBalanced(src, j);
          parts.push(src.slice(j + 1, end - 1));
          j = end;
        } else if (src[j] === '"') {
          let k = j + 1;
          let depth = 0;
          while (k < src.length && !(src[k] === '"' && depth === 0)) {
            if (src[k] === '{') depth++;
            if (src[k] === '}') depth--;
            k++;
          }
          parts.push(src.slice(j + 1, k));
          j = k + 1;
        } else {
          const vm = /^[\w.:-]+/.exec(src.slice(j));
          if (vm) { parts.push(vm[0]); j += vm[0].length; }
        }
        while (src[j] === ' ' || src[j] === '\n' || src[j] === '\t') j++;
        if (src[j] === '#') { j++; continue; }
        break;
      }
      value = parts.join('');
      fields[name] = value.replace(/\s+/g, ' ').trim();
    }
    entries.push({ type, key, fields });
    i = j;
  }
  return entries;
}

function skipBalanced(src, start) {
  const open = src[start];
  const close = open === '(' ? ')' : '}';
  let depth = 0;
  for (let k = start; k < src.length; k++) {
    if (src[k] === '\\') { k++; continue; }
    if (src[k] === open) depth++;
    else if (src[k] === close) { depth--; if (depth === 0) return k + 1; }
  }
  return src.length;
}

function splitAuthors(s) {
  return s.split(/\s+and\s+/i).map((a) => a.trim()).filter(Boolean);
}

function shortName(a) {
  if (/^others$/i.test(a)) return 'et al.';
  let first;
  let last;
  if (a.includes(',')) {
    const [l, ...f] = a.split(',');
    last = l.trim();
    first = f.join(' ').trim();
  } else {
    const parts = a.split(/\s+/);
    last = parts.pop();
    first = parts.join(' ');
  }
  const initials = first.split(/[\s-]+/).filter(Boolean).map((p) => (p.startsWith('{') ? p : p[0] + '.')).join(' ');
  return (initials ? initials + ' ' : '') + last;
}

function lastName(a) {
  if (a.includes(',')) return a.split(',')[0].trim();
  return a.trim().split(/\s+/).pop();
}

export function citeAuthor(entry, render) {
  const authors = splitAuthors(entry.fields.author || entry.fields.editor || '');
  if (!authors.length) return render(entry.key);
  if (authors.length === 1) return render(lastName(authors[0]));
  if (authors.length === 2) return render(`${lastName(authors[0])} and ${lastName(authors[1])}`);
  return render(lastName(authors[0])) + ' <em>et al.</em>';
}

export function formatBibEntry(e, render) {
  const f = e.fields;
  const head = [];
  const out = [];
  const authors = splitAuthors(f.author || f.editor || '');
  if (authors.length) {
    const names = authors.map(shortName);
    let list;
    if (names.length > 6) list = names.slice(0, 3).join(', ') + ' et al.';
    else if (names.length === 1) list = names[0];
    else list = names.slice(0, -1).join(', ') + (names.length > 2 ? ',' : '') + ' and ' + names[names.length - 1];
    head.push(render(list) + ',');
  }
  if (f.title) {
    const isBook = /book|thesis|manual/.test(e.type) && !/inbook|incollection/.test(e.type);
    const t = render(f.title);
    head.push(isBook ? `<em>${t}</em>,` : `“${t},”`);
  }
  const venue = f.journal || f.journaltitle || f.booktitle || f.publisher || f.school || f.institution || f.howpublished || f.organization;
  if (venue) out.push((f.booktitle && !f.journal ? 'in ' : '') + `<em>${render(venue)}</em>`);
  if (f.volume) out.push(`vol.&nbsp;${render(f.volume)}`);
  if (f.number) out.push(`no.&nbsp;${render(f.number)}`);
  if (f.pages) out.push(`pp.&nbsp;${render(f.pages.replace(/-+/g, '–'))}`);
  const year = f.year || (f.date ? f.date.slice(0, 4) : '');
  if (year) out.push((f.month ? render(f.month) + ' ' : '') + render(year));
  let s = (head.join(' ') + ' ' + out.join(', ')).trim().replace(/,\s*$/, '').replace(/,”$/, '”') + '.';
  const link = f.doi ? `https://doi.org/${f.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, '')}` : f.url;
  if (link) s += ` <a href="${link.replace(/"/g, '&quot;')}" target="_blank" rel="noopener" class="bib-link">${f.doi ? 'doi' : 'link'}</a>`;
  return s;
}
