// Pre-render the Mermaid diagrams to SVG so every page works offline with no library in it.
//   node tools/render-diagrams.mjs [--force] [--check]
// Finds every <pre class="mermaid">source</pre> in site/*.html, hashes the source text as written (sha1, first 12 hex, CR removed;
// build.ps1 computes the same hash), and for each one without site/diagrams/<hash>.svg renders it with Mermaid in headless
// Chrome. Mermaid is pinned: version 12.3.0 from jsDelivr, fetched once into the scratch cache and verified by SHA-256.
// The SVG keeps Mermaid's layout; colours are overridden by style.css (.mm rules) so diagrams follow the page theme.
// --check renders nothing and exits 1 when a diagram is missing. A source that fails to parse is reported with Mermaid's message.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const VERSION = '12.3.0';
const URL = `https://cdn.jsdelivr.net/npm/mermaid@${VERSION}/dist/mermaid.min.js`;
const SHA256 = process.env.MERMAID_SHA256 || '336df803d87a38b70a01e736e666c8f7601d2ce42f5e47c8fafe5d721074b9a3';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const site = join(root, 'site'), outDir = join(site, 'diagrams');
const cache = join(tmpdir(), 'ai-bootcamp', 'vendor'), work = join(tmpdir(), 'ai-bootcamp', 'render');
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const force = process.argv.includes('--force'), check = process.argv.includes('--check');
for (const d of [outDir, cache, work]) mkdirSync(d, { recursive: true });

const unescape = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const jobs = new Map();
for (const f of readdirSync(site).filter(n => n.endsWith('.html'))) {
  const html = readFileSync(join(site, f), 'utf8');
  for (const m of html.matchAll(/<pre class="mermaid">([\s\S]*?)<\/pre>/g)) {
    const raw = m[1].replace(/\r/g, '');
    const hash = createHash('sha1').update(raw, 'utf8').digest('hex').slice(0, 12);
    if (!jobs.has(hash)) jobs.set(hash, { hash, src: unescape(raw).trim(), files: [f] }); else jobs.get(hash).files.push(f);
  }
}
const todo = [...jobs.values()].filter(j => force || !existsSync(join(outDir, j.hash + '.svg')));
console.log(`diagrams: ${jobs.size} found, ${todo.length} to render`);
if (check) process.exit(todo.length ? 1 : 0);
if (!todo.length) process.exit(0);

const lib = join(cache, `mermaid-${VERSION}.min.js`);
if (!existsSync(lib)) { execFileSync('curl', ['-sSL', '--fail', '-A', 'Mozilla/5.0', '-o', lib, URL]); }
const got = createHash('sha256').update(readFileSync(lib)).digest('hex');
if (SHA256 === 'PIN_ME') { console.log(`mermaid ${VERSION} sha256 ${got} (not pinned yet: put this value in SHA256)`); }
else if (got !== SHA256) { console.error(`mermaid ${VERSION}: sha256 ${got} does not match the pinned ${SHA256}`); process.exit(2); }

const page = `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:"Segoe UI",Arial,sans-serif;width:1100px}</style></head><body>
<div id="out"></div>
<script src="${pathToFileURL(lib).href}"></script>
<script>
const jobs = ${JSON.stringify(todo).replace(/</g, '\\u003c')};
mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'strict', htmlLabels: false, fontFamily: '"Segoe UI", Arial, sans-serif', fontSize: 14,
  flowchart: { htmlLabels: false, curve: 'basis', useMaxWidth: true, nodeSpacing: 36, rankSpacing: 44 }, sequence: { useMaxWidth: true }, state: { useMaxWidth: true } });
(async () => {
  const out = document.getElementById('out');
  for (const j of jobs) {
    const d = document.createElement('div'); d.setAttribute('data-hash', j.hash);
    try { const r = await mermaid.render('mm' + j.hash, j.src); d.className = 'ok'; d.innerHTML = r.svg; }
    catch (e) { d.className = 'err'; d.textContent = String(e && e.message || e); }
    out.appendChild(d);
  }
  document.title = 'done';
})();
</script></body></html>`;
const pagePath = join(work, 'render.html');
writeFileSync(pagePath, page);
const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--allow-file-access-from-files', '--virtual-time-budget=60000', '--dump-dom', pathToFileURL(pagePath).href],
  { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
if (!dom.includes('<title>done</title>')) { console.error('render: the page did not finish; see ' + pagePath); process.exit(2); }
let bad = 0;
for (const j of todo) {
  const ok = dom.match(new RegExp(`<div data-hash="${j.hash}" class="ok">([\\s\\S]*?</svg>)</div>`));
  if (!ok) {
    const err = dom.match(new RegExp(`<div data-hash="${j.hash}" class="err">([\\s\\S]*?)</div>`));
    console.error(`FAIL ${j.hash} (${j.files.join(', ')}): ${err ? unescape(err[1]).split('\n').slice(0, 6).join(' | ') : 'no output'}\n  first line: ${j.src.split('\n')[0]}`);
    bad++; continue;
  }
  let svg = ok[1];
  if (/<script|<foreignObject|\son\w+=|javascript:/i.test(svg)) { console.error(`FAIL ${j.hash}: the SVG contains a script, a foreignObject or a handler`); bad++; continue; }
  const kind = (j.src.match(/^\s*([A-Za-z-]+)/) || [, 'diagram'])[1].toLowerCase();
  svg = svg.replace(/^<svg ([^>]*)>/, (all, attrs) => `<svg class="mm mm-${kind}" role="img" ${attrs.replace(/\s(class|role|aria-roledescription)="[^"]*"/g, '')}>`);
  writeFileSync(join(outDir, j.hash + '.svg'), svg);
  console.log(`ok ${j.hash} ${kind} (${j.files.join(', ')}) ${Math.round(svg.length / 1024)} KB`);
}
process.exit(bad ? 1 : 0);
