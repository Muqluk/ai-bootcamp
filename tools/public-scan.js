#!/usr/bin/env node
// Public-release scan: greps the whole tree for anything that should not be published.
//   node tools/public-scan.js [--root DIR]
// Exit 0 = clean, 1 = at least one hit (each printed as path:line: rule: excerpt), 2 = usage error.
// Extra patterns (personal names, employer names, anything you keep out of the repo) go one regex per line in a file named by
// the PUBLIC_SCAN_EXTRA environment variable, or in tools/.scan-extra.txt (git-ignored). Lines starting with # are comments.
// No packages: Node built-ins only.
'use strict';
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
let root = path.join(__dirname, '..');
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--root' && args[i + 1]) root = path.resolve(args[++i]);
  else { console.error('usage: node tools/public-scan.js [--root DIR]'); process.exit(2); }
}

// [rule name, regex]. Case-sensitive unless the regex says otherwise.
const RULES = [
  ['email-address', /\b[A-Za-z0-9._%+-]+@(?!example\.(com|org|net|invalid)\b|users\.noreply\.github\.com\b|(?<=\bnoreply@)anthropic\.com\b)[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b/],
  ['private-ip-172.16', /\b172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}\b/],
  ['private-ip-10', /\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/],
  ['private-ip-192.168', /\b192\.168\.\d{1,3}\.\d{1,3}\b/],
  ['internal-domain', /([a-z0-9-]\.(local|internal|corp|lan)(?![.\w-]))/i],
  ['unc-share-path', /\\\\[A-Za-z0-9_.-]+\\[A-Za-z0-9_$.-]+/],
  ['local-repo-path', /C:[\\/]+(repo|scratch)\b/i],
  ['user-profile-path', /C:[\\/]+Users[\\/]+(?!you\b|<|%|\$|\{|\.\.\.|Public\b|Default\b|name\b|USERNAME\b|username\b|user\b|me\b|alice\b)[A-Za-z0-9._-]+/i],
  ['unix-home-path', /\/(home|Users)\/(?!you\b|user\b|me\b|name\b|username\b|alice\b|<|\$|\{|\.\.\.)[a-z][A-Za-z0-9._-]+/],
  ['tracker-id', /\bW-\d{2,}\b/],
  ['herdr-pane-id', /\bw\d+:p[A-Za-z0-9]+\b/],
  // A permission rule such as Read(./secrets/**) is documented syntax, not a path on this machine.
  ['secrets-path', /(?<!\b(?:Read|Edit|Write)\(\.?\/)\bsecrets[\\/]/i],
  ['github-token', /\bgh[pousr]_[A-Za-z0-9]{20,}/],
  ['anthropic-key', /\bsk-ant-[A-Za-z0-9_-]{10,}/],
  ['aws-key', /\bAKIA[0-9A-Z]{16}\b/],
  ['private-key-block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['bearer-token', /\bBearer\s+[A-Za-z0-9._~+\/-]{24,}/],
  ['template-leftover', /\{\{[A-Z_]+\}\}/, /^dist\//],
  ['edition-marker', /<!--\/?(HOME|PORTABLE)-->/],
];

// Extra rules from the user's private list. Never committed.
const extraFiles = [process.env.PUBLIC_SCAN_EXTRA, path.join(__dirname, '.scan-extra.txt')].filter(Boolean);
for (const f of extraFiles) {
  if (!fs.existsSync(f)) continue;
  for (const raw of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    try { RULES.push(['extra:' + path.basename(f), new RegExp(line, 'i')]); }
    catch (e) { console.error(`public-scan: bad regex in ${f}: ${line}`); process.exit(2); }
  }
}

const SKIP_DIRS = new Set(['.git', 'node_modules', 'out']);
const SELF = path.resolve(__filename);
const IMAGE = /\.(png|jpe?g|gif|webp|tiff?|bmp|heic|avif)$/i;
const BINARY = /\.(zip|ico|woff2?|ttf|otf|pdf|gz|7z|exe|dll)$/i;

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) yield* walk(p); }
    else if (e.isFile()) yield p;
  }
}

let hits = 0, files = 0;
const rel = p => path.relative(root, p).split(path.sep).join('/');
function hit(file, line, rule, text) {
  hits++;
  console.log(`${rel(file)}:${line}: ${rule}: ${text.replace(/\s+/g, ' ').slice(0, 140)}`);
}

for (const file of walk(root)) {
  if (path.resolve(file) === SELF) continue;
  if (path.basename(file) === '.scan-extra.txt') continue;
  files++;
  const buf = fs.readFileSync(file);
  if (IMAGE.test(file)) {
    // Raster metadata: EXIF, XMP, and PNG text chunks can carry names, paths, GPS and software strings.
    if (/\.png$/i.test(file) && buf.length > 8 && buf.toString('latin1', 1, 4) === 'PNG') {
      // Walk the chunks: compressed pixel data can contain any byte pattern, so only chunk names are reliable.
      const ok = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'pHYs', 'sRGB', 'gAMA', 'cHRM']);
      for (let o = 8; o + 12 <= buf.length; o += 12 + buf.readUInt32BE(o)) {
        const t = buf.toString('latin1', o + 4, o + 8);
        if (!ok.has(t)) hit(file, 0, 'image-metadata:png-chunk-' + t, 'strip metadata from this image');
      }
      continue;
    }
    const s = buf.toString('latin1');
    for (const [name, re] of [['exif', /Exif\0\0|eXIf/], ['xmp', /<x:xmpmeta|http:\/\/ns\.adobe\.com\/xap/], ['png-text', /tEXt|iTXt|zTXt/], ['gps', /GPS/], ['icc-or-comment', /\xFF\xFE../]]) {
      if (re.test(s)) hit(file, 0, 'image-metadata:' + name, 'strip metadata from this image');
    }
    continue;
  }
  if (BINARY.test(file)) {
    // Archives and fonts are not read as text; a committed zip would hide content from the scan.
    if (/\.(zip|gz|7z)$/i.test(file)) hit(file, 0, 'archive-in-tree', 'archives are not scanned; build them, do not commit them');
    continue;
  }
  const lines = buf.toString('utf8').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    for (const [name, re, only] of RULES) {
      if (only && !only.test(rel(file))) continue;
      const m = re.exec(lines[i]);
      if (m) hit(file, i + 1, name, lines[i].slice(Math.max(0, m.index - 30), m.index + 80));
    }
  }
}

console.log(hits ? `public-scan: ${hits} hit(s) in ${files} files` : `public-scan: clean (${files} files, ${RULES.length} rules)`);
process.exit(hits ? 1 : 0);
