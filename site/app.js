/* AI/LLM Bootcamp page script. One file for the catalogue page and every module page.
   Reads the manifest (module list, links, edition) that the build embeds, then:
   - theme: a "Theme:" dropdown at the top right, remembered per viewer; light or dark follows the host page or the system
   - module page: part navigation on the hash (#overview, #l1.., #labs, #calls, #ref, #share), lab step ticks, lab done,
     drill answers, progress code. State is kept per module in localStorage, so each module page stands alone.
   - catalogue page: module cards with level, time and prerequisites, a level filter, and progress where it can be read. */
(function () {
  'use strict';
  var PRISTINE = ''; try { PRISTINE = '<!doctype html>\n' + document.documentElement.outerHTML; } catch (e) {}
  var root = document.documentElement;
  var MAN = { modules: [] }; try { MAN = JSON.parse(document.getElementById('manifest').textContent); } catch (e) {}
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function put(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function modById(id) { return MAN.modules.filter(function (x) { return x.id === id; })[0]; }
  function num(id) { return +id.slice(1); }
  function mins(n) { n = +n || 0; return n >= 60 ? (Math.round(n / 6) / 10) + ' h' : n + ' min'; }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
  function link(a, href) { if (href) a.href = href; return a; }

  /* ---- theme ---- */
  var THEMES = [['a', 'Meter'], ['b', 'Workbench'], ['c', 'Blueprint'], ['d', 'Classroom'], ['e', 'Console']];
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null, forced = null;
  function mode() { var t = forced || root.getAttribute('data-theme'); root.setAttribute('data-mode', t === 'dark' || (t !== 'light' && mq && mq.matches) ? 'dark' : 'light'); }
  var sel = document.getElementById('theme');
  function pick(s, keep) { if (!/^[a-e]$/.test(s)) s = 'a'; root.setAttribute('data-style', s); if (sel) sel.value = s; if (keep) put('ai-bootcamp-theme', s); }
  if (sel) {
    THEMES.forEach(function (t) { var o = el('option', '', t[1]); o.value = t[0]; sel.appendChild(o); });
    sel.addEventListener('change', function () { pick(sel.value, true); });
  }
  var qs = /[?&]style=([1-5a-e])/.exec(location.search), qm = /[?&]mode=(light|dark)/.exec(location.search);
  if (qm) forced = qm[1];
  pick(qs ? (/\d/.test(qs[1]) ? 'abcde'.charAt(+qs[1] - 1) : qs[1]) : (get('ai-bootcamp-theme') || 'a'), false);
  mode();
  if (mq && mq.addEventListener) mq.addEventListener('change', mode);
  try { new MutationObserver(mode).observe(root, { attributes: true, attributeFilter: ['data-theme'] }); } catch (e) {}

  /* ---- code blocks: caption with a file name or "shell", plus a copy button ---- */
  [].forEach.call(document.querySelectorAll('pre'), function (pre) {
    var box = el('div', 'codebox'), c = el('div', 'cap');
    c.appendChild(el('span', '', pre.getAttribute('data-file') ? 'file  ' + pre.getAttribute('data-file') : (pre.getAttribute('data-cap') || 'shell')));
    var b = el('button', 'copy', 'Copy'); b.type = 'button';
    b.addEventListener('click', function () {
      var t = pre.textContent;
      function pickText() { try { var r = document.createRange(); r.selectNodeContents(pre); var s = getSelection(); s.removeAllRanges(); s.addRange(r); b.textContent = 'Selected'; } catch (e) {} }
      try { navigator.clipboard.writeText(t).then(function () { b.textContent = 'Copied'; }, pickText); } catch (e) { pickText(); }
      setTimeout(function () { b.textContent = 'Copy'; }, 1600);
    });
    c.appendChild(b); pre.parentNode.insertBefore(box, pre); box.appendChild(c); box.appendChild(pre);
  });

  function levelChip(lv) { return el('span', 'chip lv-' + lv, lv); }
  function readState(id) { var S = { labs: {}, steps: {}, drill: [], seen: {} }; try { var r = JSON.parse(get('ai-bootcamp-v2-' + id) || 'null'); if (r && typeof r === 'object') { ['labs', 'steps', 'seen'].forEach(function (k) { if (r[k] && typeof r[k] === 'object') S[k] = r[k]; }); if (r.drill && r.drill.length != null) S.drill = r.drill; } } catch (e) {} return S; }
  function doneCount(S) { var n = 0, k; for (k in S.labs) if (S.labs[k]) n++; (S.drill || []).forEach(function (x) { if (x != null) n++; }); return n; }

  var hn = document.getElementById('home-notes');
  function homeNotes() { var off = get('ai-bootcamp-home') === '0'; if (hn) hn.checked = !off; document.body.classList.toggle('hide-home', off); }
  if (hn) hn.addEventListener('change', function () { put('ai-bootcamp-home', hn.checked ? '1' : '0'); homeNotes(); });
  homeNotes();

  /* ---- save a copy of this page as one file ---- */
  /* Inside a hosted viewer the page may be given a save function; it is asked for once, at load. Everywhere else
     (a file on disk, a plain web server) it stays null and the button uses an ordinary download link. */
  var DL = null;
  try {
    if (window.claude && typeof window.claude.use === 'function') {
      Promise.resolve(window.claude.use('downloads')).then(function (d) { DL = d || null; }, function () { DL = null; });
    }
  } catch (e) { DL = null; }
  [].forEach.call(document.querySelectorAll('[data-save]'), function (b) {
    b.addEventListener('click', function () {
      var msg = b.parentNode.querySelector('.note') || b;
      var name = b.getAttribute('data-save');
      function say(t) { if (msg !== b) msg.textContent = t; }
      function viaLink() {
        try {
          var a = el('a'); a.href = URL.createObjectURL(new Blob([PRISTINE], { type: 'text/html' })); a.download = name;
          document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
          say('Saved as ' + name + ' if your browser allows downloads from this page. If nothing happened, use the file from the export set instead.');
        } catch (e) { say('This page cannot start a download here. Use the file from the export set instead.'); }
      }
      if (DL && typeof DL.save === 'function') {
        DL.save({ filename: name, data: PRISTINE }).then(function () { say('Saved as ' + name + '.'); }, function (err) {
          var code = err && err.code;
          if (code === 'declined') return;
          if (code === 'rate_limited') { say('A save is already waiting for your answer. Wait a moment, then try again.'); return; }
          viaLink();
        });
      } else { viaLink(); }
    });
  });

  /* ================= catalogue page ================= */
  var cards = document.getElementById('cards');
  if (cards) {
    var filter = get('ai-bootcamp-level') || 'all', fbar = document.getElementById('levels');
    var draw = function () {
      cards.textContent = '';
      MAN.modules.forEach(function (m) {
        if (filter !== 'all' && m.level !== filter) return;
        var c = link(el(m.href ? 'a' : 'div', 'mcard'), m.href);
        var top = el('div', 'chips'); top.appendChild(el('span', 'n', 'MODULE ' + num(m.id))); top.appendChild(levelChip(m.level)); top.appendChild(el('span', 'chip', mins(m.minutes))); c.appendChild(top);
        c.appendChild(el('span', 't', m.title)); c.appendChild(el('span', 's', m.sub));
        c.appendChild(el('span', 'pre', (m.lessons || 0) + ' lessons · ' + (m.labs || 0) + ' labs · ' + (m.prereq.length ? 'after ' + m.prereq.map(function (p) { var x = modById(p); return x ? num(p) + ' ' + x.title : p; }).join(', ') : 'no prerequisites')));
        if (!m.href) c.appendChild(el('span', 'pre', 'Published as its own page; ask for the link or use the file set.'));
        var S = readState(m.id), d = doneCount(S), total = (m.labs || 0) + (m.calls || 0);
        if (d && total) { var mt = el('div', 'meter'), sp = el('span'); sp.style.width = Math.min(100, Math.round(100 * d / total)) + '%'; mt.appendChild(sp); c.appendChild(mt); }
        cards.appendChild(c);
      });
      if (fbar) [].forEach.call(fbar.children, function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-level') === filter ? 'true' : 'false'); });
    };
    if (fbar) ['all', 'foundation', 'practitioner', 'advanced'].forEach(function (lv) {
      var b = el('button', 'btn', lv === 'all' ? 'All levels' : cap(lv)); b.type = 'button'; b.setAttribute('data-level', lv);
      b.addEventListener('click', function () { filter = lv; put('ai-bootcamp-level', lv); draw(); }); fbar.appendChild(b);
    });
    draw();
    [].forEach.call(document.querySelectorAll('[data-mod]'), function (a) { var m = modById(a.getAttribute('data-mod')); if (m) { if (!a.textContent) a.textContent = num(m.id) + '. ' + m.title; link(a, m.href); } });
    var tot = document.getElementById('totals');
    if (tot) { var tl = 0, tm = 0; MAN.modules.forEach(function (m) { tl += m.labs || 0; tm += +m.minutes || 0; }); tot.textContent = MAN.modules.length + ' modules, ' + tl + ' labs, about ' + Math.round(tm / 60) + ' hours in all'; }
    return;
  }

  /* ================= module page ================= */
  var m = document.querySelector('section.module'); if (!m) return;
  var id = m.id, me = modById(id) || { prereq: [], level: m.getAttribute('data-level') || '', minutes: m.getAttribute('data-minutes') }, KEY = 'ai-bootcamp-v2-' + id;
  var S = readState(id);
  function save() { put(KEY, JSON.stringify(S)); }
  var nav = document.getElementById('nav'), pager = document.getElementById('pager'), crumb = document.getElementById('crumb'), share = document.getElementById('view-share');
  var overview = m.querySelector('.overview'), labsEl = m.querySelector('.labs'), ref = m.querySelector('.reference');
  var lessons = [].slice.call(m.querySelectorAll('.lesson')), labEls = [].slice.call(m.querySelectorAll('article.lab'));
  var drill = el('div', 'drill'); m.appendChild(drill);
  var qsn = []; try { qsn = JSON.parse(m.querySelector('script.drill').textContent); } catch (e) {}

  var parts = [];
  if (overview) parts.push({ key: 'overview', n: '', title: 'Overview', el: overview });
  lessons.forEach(function (l, i) { parts.push({ key: 'l' + (i + 1), n: String(i + 1), title: l.getAttribute('data-title') || 'Lesson ' + (i + 1), el: l, kind: 'Lesson ' + (i + 1) + ' of ' + lessons.length, min: l.getAttribute('data-minutes') }); });
  if (labsEl && labEls.length) parts.push({ key: 'labs', n: 'L', title: 'Labs', el: labsEl, kind: labEls.length + ' labs' });
  if (qsn.length) parts.push({ key: 'calls', n: '?', title: 'Calls', el: drill, kind: qsn.length + ' judgment calls' });
  if (ref && ref.children.length) parts.push({ key: 'ref', n: '#', title: 'Cheat sheet', el: ref, kind: 'Reference' });

  /* header: full on the overview, slim on the other parts */
  var head = el('div', 'mhead'), kick = el('div', 'kicker'), h = el('h1', '', m.getAttribute('data-title')), meta = el('div', 'meta'), chips = el('div', 'chips');
  head.appendChild(kick); head.appendChild(h); head.appendChild(meta); head.appendChild(chips); m.insertBefore(head, m.firstChild);
  chips.appendChild(levelChip(me.level || 'practitioner')); chips.appendChild(el('span', 'chip', mins(m.getAttribute('data-minutes'))));
  chips.appendChild(el('span', 'chip', lessons.length + ' lessons')); chips.appendChild(el('span', 'chip', labEls.length + ' labs'));
  (me.prereq || []).forEach(function (p) { var x = modById(p); if (x) chips.appendChild(link(el(x.href ? 'a' : 'span', 'chip'), x.href)).textContent = 'after ' + num(p) + ' ' + x.title; });
  if (!(me.prereq || []).length) chips.appendChild(el('span', 'chip', 'no prerequisites'));

  /* overview extras: the parts of this module, what to take next, the progress code */
  if (overview) {
    var pl = el('div', 'panel'); pl.appendChild(el('div', 'kicker', 'In this module')); var ul = el('ol', 'partlist');
    parts.forEach(function (p) { if (p.key === 'overview') return; var li = el('li'), a = el('a'); a.href = '#' + p.key; a.appendChild(el('span', 'n', p.n)); a.appendChild(el('span', '', p.title)); a.appendChild(el('span', 'm', p.min ? p.min + ' min' : (p.kind || ''))); li.appendChild(a); ul.appendChild(li); });
    pl.appendChild(ul); overview.appendChild(pl);
    var nexts = MAN.modules.filter(function (x) { return x.prereq.indexOf(id) >= 0; });
    if (nexts.length || MAN.catalogue) {
      var nx = el('div', 'panel'); nx.appendChild(el('div', 'kicker', 'Where to go from here')); var row = el('div', 'chips'); row.style.marginTop = '8px';
      nexts.forEach(function (x) { var a = link(el(x.href ? 'a' : 'span', 'chip'), x.href); a.textContent = num(x.id) + ' ' + x.title; row.appendChild(a); });
      if (MAN.catalogue) { var ca = link(el('a', 'chip'), MAN.catalogue); ca.textContent = 'All modules'; row.appendChild(ca); }
      nx.appendChild(row); overview.appendChild(nx);
    }
    var pp = el('div', 'panel'); pp.appendChild(el('div', 'kicker', 'Progress code'));
    var pd = el('p', 'muted', 'Progress for this module lives in this browser only. To move it to another device or another copy of this page, copy the code here and load it there.'); pd.style.marginTop = '6px'; pp.appendChild(pd);
    var pr = el('div', 'row'), pc = el('input'); pc.type = 'text'; pc.setAttribute('aria-label', 'Progress code'); pc.style.cssText = 'flex:1;min-width:200px;font-family:var(--font-mono);font-size:0.8rem';
    var b1 = el('button', 'btn', 'Copy mine'), b2 = el('button', 'btn', 'Load'), pm = el('p', 'note'); b1.type = b2.type = 'button'; pm.style.marginBottom = '0';
    pr.appendChild(pc); pr.appendChild(b1); pr.appendChild(b2); pp.appendChild(pr); pp.appendChild(pm); overview.appendChild(pp);
    b1.addEventListener('click', function () {
      try { pc.value = 'AIB2.' + id + '.' + btoa(unescape(encodeURIComponent(JSON.stringify(S)))); } catch (e) { pm.textContent = 'Could not build the code.'; return; }
      pc.select(); try { navigator.clipboard.writeText(pc.value).then(function () { pm.textContent = 'Copied.'; }, function () { pm.textContent = 'Selected. Copy it with Ctrl+C.'; }); } catch (e) { pm.textContent = 'Selected. Copy it with Ctrl+C.'; }
    });
    b2.addEventListener('click', function () {
      try { var v = pc.value.trim(), pre = 'AIB2.' + id + '.'; if (v.indexOf(pre) !== 0) throw 0; var o = JSON.parse(decodeURIComponent(escape(atob(v.slice(pre.length))))); if (!o || typeof o !== 'object') throw 0; put(KEY, JSON.stringify(o)); location.reload(); }
      catch (e) { pm.textContent = 'That is not a progress code for this module. It starts with AIB2.' + id + '.'; }
    });
  }

  /* labs */
  labEls.forEach(function (lab, li) {
    var lh = el('div', 'labhead'); lh.appendChild(el('h3', '', 'Lab ' + (li + 1) + '  ' + lab.getAttribute('data-title'))); lh.appendChild(el('span', 'meta', lab.getAttribute('data-minutes') + ' min')); lab.insertBefore(lh, lab.firstChild);
    [].forEach.call(lab.querySelectorAll('ol.steps > li'), function (step, si) {
      var c = el('input', 'tick'); c.type = 'checkbox'; c.setAttribute('aria-label', 'Step ' + (si + 1) + ' done'); c.checked = (S.steps[lab.id] || []).indexOf(si) >= 0;
      c.addEventListener('change', function () { var a = (S.steps[lab.id] || []).filter(function (x) { return x !== si; }); if (c.checked) a.push(si); S.steps[lab.id] = a; save(); });
      step.insertBefore(c, step.firstChild);
    });
    var foot = el('div', 'labfoot'), btn = el('button', 'btn'); btn.type = 'button';
    function paint() { var d = !!S.labs[lab.id]; lab.classList.toggle('done', d); btn.textContent = d ? 'Done. Undo' : 'Mark lab done'; }
    btn.addEventListener('click', function () { if (S.labs[lab.id]) delete S.labs[lab.id]; else S.labs[lab.id] = 1; save(); paint(); progress(); });
    foot.appendChild(btn); lab.appendChild(foot); paint();
  });

  /* calls */
  qsn.forEach(function (q, qi) {
    var box = el('div', 'q'); box.appendChild(el('div', 'qt', (qi + 1) + '. ' + q.q));
    var opts = el('div', 'opts'), why = el('div', 'why', q.why); why.hidden = true;
    var btns = q.o.map(function (o, oi) {
      var b = el('button', 'opt'); b.type = 'button'; b.appendChild(el('span', 'k', 'ABCD'.charAt(oi))); b.appendChild(el('span', '', o));
      b.addEventListener('click', function () { S.drill[qi] = oi; save(); mark(); progress(); }); opts.appendChild(b); return b;
    });
    function mark() { var a = S.drill[qi]; btns.forEach(function (b, oi) { b.classList.toggle('right', a != null && oi === q.a); b.classList.toggle('wrong', a === oi && oi !== q.a); }); why.hidden = a == null; }
    box.appendChild(opts); box.appendChild(why); drill.appendChild(box); mark();
  });
  if (qsn.length) { var reset = el('button', 'btn', 'Clear my answers'); reset.type = 'button'; reset.style.justifySelf = 'start'; reset.addEventListener('click', function () { S.drill = []; save(); location.reload(); }); drill.appendChild(reset); }

  /* navigation */
  parts.forEach(function (p) {
    var a = el('a', 'navlink'); a.href = '#' + p.key; a.appendChild(el('span', 'n', p.n || '·')); a.appendChild(el('span', '', p.title)); a.appendChild(el('span', 'p')); nav.appendChild(a); p.nav = a;
  });
  var shareNav = null;
  if (share) { shareNav = el('a', 'navlink'); shareNav.href = '#share'; shareNav.appendChild(el('span', 'n', '\u2197')); shareNav.appendChild(el('span', '', 'Export and share')); shareNav.appendChild(el('span', 'p')); nav.appendChild(shareNav); }
  function progress() {
    parts.forEach(function (p) {
      var t = p.nav.querySelector('.p'), txt = '', full = false;
      if (p.key === 'labs') { var d = labEls.filter(function (l) { return S.labs[l.id]; }).length; txt = d ? d + '/' + labEls.length : ''; full = d === labEls.length; }
      else if (p.key === 'calls') { var a = S.drill.filter(function (x) { return x != null; }).length; txt = a ? a + '/' + qsn.length : ''; full = a === qsn.length; }
      else if (S.seen[p.key]) { txt = '✓'; full = true; }
      t.textContent = txt; t.classList.toggle('full', full);
    });
  }
  function route() {
    var key = (location.hash || '#overview').slice(1), isShare = key === 'share' && share;
    var cur = parts.filter(function (p) { return p.key === key; })[0]; if (!cur && !isShare) cur = parts[0];
    m.hidden = !!isShare; if (share) share.hidden = !isShare;
    if (shareNav) shareNav.classList.toggle('active', !!isShare);
    parts.forEach(function (p) { p.el.hidden = p !== cur; p.nav.classList.toggle('active', p === cur); });
    if (cur) {
      var first = cur.key === 'overview';
      kick.textContent = 'Module ' + num(id) + (first ? ' · ' + cap(me.level || '') : ' · ' + m.getAttribute('data-title'));
      h.textContent = first ? m.getAttribute('data-title') : cur.title;
      meta.textContent = first ? m.getAttribute('data-sub') : (cur.kind || '') + (cur.min ? ' · about ' + cur.min + ' min' : '');
      chips.hidden = !first;
      if (/^l\d+$/.test(cur.key) && !S.seen[cur.key]) { S.seen[cur.key] = 1; save(); }
      if (crumb) crumb.textContent = 'Module ' + num(id) + ' · ' + m.getAttribute('data-title') + (first ? '' : ' · ' + cur.title);
      var i = parts.indexOf(cur); pager.textContent = '';
      if (i > 0) { var pv = el('a', 'btn', '← ' + parts[i - 1].title); pv.href = '#' + parts[i - 1].key; pager.appendChild(pv); }
      if (i < parts.length - 1) { var nx2 = el('a', 'btn primary next', parts[i + 1].title + ' →'); nx2.href = '#' + parts[i + 1].key; pager.appendChild(nx2); }
      try { cur.nav.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) {}
    } else { pager.textContent = ''; if (crumb) crumb.textContent = 'Export and share'; }
    progress(); window.scrollTo(0, 0);
  }
  route(); window.addEventListener('hashchange', route);
})();
