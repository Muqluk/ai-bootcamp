/* Instruments: cost meter, session cost model, A/B readout.
   Mounted into every div.tool[data-tool] on the page. Prices from reference/facts-2026-11-11.md.
   Pure functions are exported for node tests; mounting is skipped without a DOM. */
(function () {
  'use strict';

  /* ---------- prices (USD per million tokens) ---------- */
  var MODELS = {
    opus: { label: 'Opus 5.5', inp: 4, out: 20, cr: 0.05 },
    sonnet: { label: 'Sonnet 5.5', inp: 2, out: 10, cr: 0.05 },
    haiku: { label: 'Haiku 5.5', inp: 0.1, out: 0.5, cr: 0.1, stepAt: 100000, inpHi: 0.5, outHi: 2.5 },
    fable: { label: 'Fable 5.2', inp: 8, out: 40, cr: 0.025 }
  };
  var ORDER = ['opus', 'sonnet', 'haiku', 'fable'];
  var CW5 = 1.25, CW1 = 2;

  /* per-token rates for a model at a given prompt length (input + cache read + cache write) */
  function rates(model, prompt) {
    var m = MODELS[model] || MODELS.sonnet;
    var hi = m.stepAt != null && prompt > m.stepAt;
    var inp = (hi ? m.inpHi : m.inp) / 1e6, out = (hi ? m.outHi : m.out) / 1e6;
    return { inp: inp, out: out, cr: inp * m.cr, cw5: inp * CW5, cw1: inp * CW1, hi: hi };
  }

  function num(x) { x = Number(x); return isFinite(x) && x > 0 ? x : 0; }

  /* ---------- formatting ---------- */
  function sep(s) { return s.replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function fmtInt(n) { n = Math.round(Number(n) || 0); return (n < 0 ? '-' : '') + sep(String(Math.abs(n))); }
  function fmtUSD(x) {
    x = Number(x) || 0;
    var a = Math.abs(x), s = a < 1 ? a.toFixed(4) : a.toFixed(2), p = s.split('.');
    return (x < 0 ? '-$' : '$') + sep(p[0]) + '.' + p[1];
  }
  function fmtPct(f) { return (Math.round((Number(f) || 0) * 1000) / 10).toFixed(1) + '%'; }
  function fmtNum(x, d) { x = Number(x) || 0; var s = Math.abs(x).toFixed(d), p = s.split('.'); return (x < 0 ? '-' : '') + sep(p[0]) + (p[1] ? '.' + p[1] : ''); }

  /* ---------- 1. cost meter ---------- */
  var USAGE_FIELDS = ['input_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens', 'output_tokens'];
  function hasUsageFields(o) {
    if (!o || typeof o !== 'object') return false;
    for (var i = 0; i < USAGE_FIELDS.length; i++) if (o[USAGE_FIELDS[i]] != null) return true;
    return false;
  }

  /* model id or alias to a priced model key, or null when it is not one of the four current ones */
  function mapModel(id) {
    var s = String(id || '').toLowerCase();
    if (/^(opus|sonnet|haiku|fable)$/.test(s)) return s;
    var m = /(opus|sonnet|haiku)[-_ .]?5[-_.]5(?!\d)/.exec(s);
    if (m) return m[1];
    if (/(fable|mythos)[-_ .]?5[-_.]2(?!\d)/.test(s)) return 'fable';
    return null;
  }

  function pickUsage(o) {
    if (!o || typeof o !== 'object') return null;
    if (o.usage && typeof o.usage === 'object') return o.usage;
    if (o.message && o.message.usage && typeof o.message.usage === 'object') return o.message.usage;
    if (hasUsageFields(o)) return o;
    return null;
  }

  /* lenient parse: a full result object, a bare usage object, an array or stream-json lines */
  function parseInput(text) {
    var s = String(text == null ? '' : text).trim();
    if (!s) return { error: 'Paste a JSON result or a usage object.' };
    var obj = null, cands = [], i;
    try { obj = JSON.parse(s); } catch (e) {
      var a = s.indexOf('{'), b = s.lastIndexOf('}');
      if (a >= 0 && b > a) { try { obj = JSON.parse(s.slice(a, b + 1)); } catch (e2) { obj = null; } }
      if (obj == null) {
        var lines = s.split(/\r?\n/);
        for (i = 0; i < lines.length; i++) { try { var l = JSON.parse(lines[i]); if (l && typeof l === 'object') cands.push(l); } catch (e3) { /* skip */ } }
      }
    }
    if (obj != null) cands = Object.prototype.toString.call(obj) === '[object Array]' ? obj : [obj];
    var src = null;
    for (i = cands.length - 1; i >= 0; i--) if (cands[i] && cands[i].type === 'result' && pickUsage(cands[i])) { src = cands[i]; break; }
    if (!src) for (i = cands.length - 1; i >= 0; i--) if (pickUsage(cands[i])) { src = cands[i]; break; }
    if (!src) return { error: obj == null && !cands.length ? 'That is not valid JSON.' : 'No usage object found (expected input_tokens, output_tokens and the cache fields).' };
    var res = { usage: pickUsage(src), totalCost: null, model: null, models: 0 };
    if (typeof src.total_cost_usd === 'number' && isFinite(src.total_cost_usd)) res.totalCost = src.total_cost_usd;
    if (src.modelUsage && typeof src.modelUsage === 'object') {
      var best = -1;
      for (var k in src.modelUsage) {
        if (!Object.prototype.hasOwnProperty.call(src.modelUsage, k)) continue;
        res.models++;
        var mk = mapModel(k), mu = src.modelUsage[k] || {}, c = num(mu.costUSD);
        if (mk && c > best) { best = c; res.model = mk; }
      }
    }
    if (!res.model) res.model = mapModel(src.model || (src.message && src.message.model));
    return res;
  }

  /* token counts with the cache write split into 5-minute and 1-hour parts; ttl decides only when the split is absent */
  function normUsage(u, ttl) {
    u = u || {};
    var c = (u.cache_creation && typeof u.cache_creation === 'object') ? u.cache_creation : {};
    var s5 = num(c.ephemeral_5m_input_tokens), s1 = num(c.ephemeral_1h_input_tokens), split = s5 + s1 > 0;
    var cw = num(u.cache_creation_input_tokens) || (s5 + s1), cw5, cw1;
    if (split) { var rest = Math.max(0, cw - s5 - s1); cw5 = s5 + (ttl === '1h' ? 0 : rest); cw1 = s1 + (ttl === '1h' ? rest : 0); }
    else if (ttl === '1h') { cw5 = 0; cw1 = cw; } else { cw5 = cw; cw1 = 0; }
    return { input: num(u.input_tokens), cw: cw5 + cw1, cw5: cw5, cw1: cw1, cr: num(u.cache_read_input_tokens), output: num(u.output_tokens), split: split };
  }

  function costUsage(u, model, ttl) {
    var n = normUsage(u, ttl), prompt = n.input + n.cw + n.cr, r = rates(model, prompt);
    var c = { input: n.input * r.inp, cw: n.cw5 * r.cw5 + n.cw1 * r.cw1, cr: n.cr * r.cr, output: n.output * r.out };
    c.total = c.input + c.cw + c.cr + c.output;
    var noCache = prompt * r.inp + n.output * r.out;
    return { tokens: n, cost: c, total: c.total, noCache: noCache, saving: noCache > 0 ? (noCache - c.total) / noCache : 0, prompt: prompt, rates: r, hi: r.hi };
  }

  /* ---------- 2. session cost model ---------- */
  /* k cold restarts spread evenly over turns 2..T */
  function restartTurns(T, k) {
    T = Math.max(1, Math.floor(T)); k = Math.max(0, Math.min(Math.floor(k) || 0, T - 1));
    var out = [];
    for (var j = 1; j <= k; j++) out.push(1 + Math.round(j * T / (k + 1)));
    return out;
  }

  function sessionRun(p, k) {
    var T = Math.max(1, Math.floor(num(p.turns)) || 1), prefix = num(p.prefix), add = num(p.added), outT = num(p.output);
    var caching = p.caching !== false, ttl = p.ttl === '1h' ? '1h' : '5m';
    var cold = {}, rt = restartTurns(T, k);
    for (var i = 0; i < rt.length; i++) cold[rt[i]] = 1;
    var tk = { input: 0, cw: 0, cr: 0, output: 0 }, cs = { input: 0, cw: 0, cr: 0, output: 0 }, noCache = 0, first = 0, last = 0;
    for (var t = 1; t <= T; t++) {
      var H = prefix + (t - 1) * (add + outT), prompt = H + add, r = rates(p.model, prompt), cwr = ttl === '1h' ? r.cw1 : r.cw5, turn;
      noCache += prompt * r.inp + outT * r.out;
      if (!caching) { tk.input += prompt; cs.input += prompt * r.inp; turn = prompt * r.inp; }
      else if (t === 1 || cold[t]) { tk.cw += prompt; cs.cw += prompt * cwr; turn = prompt * cwr; }
      else { var rd = H - outT, wr = add + outT; tk.cr += rd; tk.cw += wr; cs.cr += rd * r.cr; cs.cw += wr * cwr; turn = rd * r.cr + wr * cwr; } // the previous answer is new to the cache, so it is written along with this turn's input
      tk.output += outT; cs.output += outT * r.out; turn += outT * r.out;
      if (t === 1) first = turn;
      if (t === T) last = turn;
    }
    var total = cs.input + cs.cw + cs.cr + cs.output;
    return { turns: T, tokens: tk, cost: cs, total: total, noCache: noCache, saving: noCache > 0 ? (noCache - total) / noCache : 0, first: first, last: last, restartTurns: caching ? rt : [] };
  }

  function sessionModel(p) {
    var k = p.caching === false ? 0 : num(p.restarts);
    var r = sessionRun(p, k);
    r.restartExtra = r.restartTurns.length ? r.total - sessionRun(p, 0).total : 0;
    return r;
  }

  /* ---------- 3. A/B readout ---------- */
  function parseAB(text) {
    var lines = String(text == null ? '' : text).split(/\r?\n/), pairs = [], bad = [], seen = false, header = false;
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i].trim();
      if (!l) continue;
      var f = l.split(/[\s,;]+/).filter(function (x) { return x !== ''; });
      var ok = f.length === 2 && /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(f[0]) && /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(f[1]);
      if (ok) pairs.push([Number(f[0]), Number(f[1])]);
      else if (!seen) header = true;
      else bad.push(i + 1);
      seen = true;
    }
    return { pairs: pairs, bad: bad, header: header };
  }

  /* exact two-sided sign test: k wins of n non-tied pairs, p = 0.5 */
  function signTest(k, n) {
    n = Math.floor(n); k = Math.floor(k);
    if (n <= 0) return 1;
    var lo = Math.min(k, n - k), sum = 0, j;
    if (n <= 1000) {
      var term = Math.pow(2, -n);
      for (j = 0; j <= lo; j++) { sum += term; term = term * (n - j) / (j + 1); }
    } else {
      var lt = -n * Math.LN2;
      for (j = 0; j <= lo; j++) { sum += Math.exp(lt); lt += Math.log(n - j) - Math.log(j + 1); }
    }
    return Math.min(1, 2 * sum);
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /* 95% paired bootstrap percentile interval of the mean difference */
  function bootstrapCI(diffs, B, seed) {
    var n = diffs.length; B = B || 10000;
    if (!n) return [0, 0];
    var rnd = mulberry32(seed == null ? 20261111 : seed), means = new Array(B);
    for (var b = 0; b < B; b++) {
      var s = 0;
      for (var i = 0; i < n; i++) s += diffs[Math.floor(rnd() * n)];
      means[b] = s / n;
    }
    means.sort(function (x, y) { return x - y; });
    return [means[Math.floor(0.025 * B)], means[Math.ceil(0.975 * B) - 1]];
  }

  function abAnalyze(pairs) {
    var n = pairs.length, sa = 0, sb = 0, wa = 0, wb = 0, ties = 0, diffs = [];
    for (var i = 0; i < n; i++) {
      var a = pairs[i][0], b = pairs[i][1];
      sa += a; sb += b; diffs.push(b - a);
      if (b > a) wb++; else if (a > b) wa++; else ties++;
    }
    var r = { n: n, meanA: n ? sa / n : 0, meanB: n ? sb / n : 0, winsA: wa, winsB: wb, ties: ties };
    r.meanDiff = r.meanB - r.meanA;
    r.p = signTest(wb, wa + wb);
    r.ci = bootstrapCI(diffs, 10000, 20261111);
    var excl = r.ci[0] > 0 || r.ci[1] < 0;
    r.clear = n >= 2 && excl && r.p < 0.05;
    r.verdict = !r.clear ? 'No clear difference' : (r.meanDiff > 0 ? 'B is better' : 'A is better');
    r.more = r.clear ? 0 : moreNeeded(r);
    return r;
  }

  /* rough extra cases needed for both tests to pass if the effect holds; null when it cannot be estimated */
  function moreNeeded(r) {
    if (r.n < 2 || r.meanDiff === 0) return null;
    var m = r.winsA + r.winsB, need = r.n;
    if (!m) return null;
    var lead = r.meanDiff > 0 ? r.winsB : r.winsA, q = lead / m;
    if (q <= 0.5) return null;
    need = Math.max(need, Math.ceil(Math.pow(1.96 / (2 * q - 1), 2) * r.n / m));
    var half = (r.ci[1] - r.ci[0]) / 2;
    if (half > 0) need = Math.max(need, Math.ceil(r.n * Math.pow(half / Math.abs(r.meanDiff), 2)));
    var more = Math.max(need - r.n, 5);
    return more > 100000 ? null : more;
  }

  var api = {
    MODELS: MODELS, rates: rates, mapModel: mapModel, parseInput: parseInput, normUsage: normUsage, costUsage: costUsage,
    restartTurns: restartTurns, sessionModel: sessionModel, parseAB: parseAB, signTest: signTest, mulberry32: mulberry32,
    bootstrapCI: bootstrapCI, abAnalyze: abAnalyze, fmtInt: fmtInt, fmtUSD: fmtUSD, fmtPct: fmtPct
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document === 'undefined') return;

  /* ---------- DOM helpers ---------- */
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  /* space-between keeps controls in one grid row level when a label wraps to two lines */
  function labelled(text, control) { var l = el('label'); l.style.alignContent = 'space-between'; l.appendChild(el('span', '', text)); l.appendChild(control); return l; }
  function para(cls, text) { var p = el('p', cls, text); p.style.margin = '0'; return p; }
  function select(opts, val) {
    var s = el('select');
    opts.forEach(function (o) { var op = el('option', '', o[1]); op.value = o[0]; s.appendChild(op); });
    s.value = val; return s;
  }
  function modelSelect(val) { return select(ORDER.map(function (k) { return [k, MODELS[k].label]; }), val || 'sonnet'); }
  function numInput(val, min, max, step) {
    var i = el('input'); i.type = 'number'; i.value = String(val); i.min = String(min); if (max != null) i.max = String(max); i.step = String(step || 1); i.inputMode = 'numeric'; return i;
  }
  function readNum(i, def, min, max) {
    var v = Number(i.value);
    if (i.value === '' || !isFinite(v)) v = def;
    return Math.min(max, Math.max(min, Math.floor(v)));
  }
  function button(text) { var b = el('button', 'btn', text); b.type = 'button'; return b; }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  var TYPES = [['input', 'in', 'Input'], ['cw', 'cw', 'Cache write'], ['cr', 'cr', 'Cache read'], ['output', 'out', 'Output']];
  function legend() { var l = el('div', 'legend'); TYPES.forEach(function (t) { l.appendChild(el('span', 'tok ' + t[1], t[2])); }); return l; }
  function bar(vals, caption, fmt) {
    var wrap = el('div'), sum = 0, desc = [];
    wrap.style.display = 'grid'; wrap.style.gap = '4px';
    TYPES.forEach(function (t) { sum += vals[t[0]] || 0; });
    var b = el('div', 'bar');
    TYPES.forEach(function (t) {
      var v = vals[t[0]] || 0;
      if (sum > 0 && v > 0) {
        var s = el('span', t[1]); s.style.width = (100 * v / sum) + '%'; s.title = t[2] + ': ' + fmt(v) + ' (' + fmtPct(v / sum) + ')';
        b.appendChild(s);
      }
      desc.push(t[2] + ' ' + (sum > 0 ? fmtPct(v / sum) : '0%'));
    });
    b.setAttribute('role', 'img'); b.setAttribute('aria-label', caption + ': ' + desc.join(', '));
    wrap.appendChild(el('div', 'note', caption)); wrap.appendChild(b);
    return wrap;
  }
  function typeTable(tokens, costs, rateCol) {
    var w = el('div', 'tablewrap'), t = el('table'), th = el('thead'), hr = el('tr'), tb = el('tbody'), st = 0, sc = 0;
    var heads = ['Type', 'Tokens'].concat(rateCol ? ['Per million'] : []).concat(['Cost']);
    heads.forEach(function (h, i) { hr.appendChild(el('th', i ? 'num' : '', h)); });
    th.appendChild(hr); t.appendChild(th);
    TYPES.forEach(function (ty) {
      var r = el('tr'), c0 = el('td');
      c0.appendChild(el('span', 'tok ' + ty[1], ty[2])); r.appendChild(c0);
      r.appendChild(el('td', 'num', fmtInt(tokens[ty[0]])));
      if (rateCol) r.appendChild(el('td', 'num', rateCol[ty[0]]));
      r.appendChild(el('td', 'num', fmtUSD(costs[ty[0]])));
      st += tokens[ty[0]]; sc += costs[ty[0]];
      tb.appendChild(r);
    });
    var tr = el('tr'); tr.appendChild(el('td', '', 'Total')); tr.appendChild(el('td', 'num', fmtInt(st)));
    if (rateCol) tr.appendChild(el('td', 'num', ''));
    tr.appendChild(el('td', 'num', fmtUSD(sc))); tr.style.fontWeight = '600'; tb.appendChild(tr);
    t.appendChild(tb); w.appendChild(t); return w;
  }
  function liveBox() { var o = el('div'); o.setAttribute('aria-live', 'polite'); o.style.display = 'grid'; o.style.gap = '10px'; o.style.minWidth = '0'; return o; }
  function perM(x) { var v = x * 1e6; return '$' + (v < 0.01 ? v.toFixed(4) : v < 1 ? v.toFixed(3) : v.toFixed(2)); }

  /* ---------- mount: cost meter ---------- */
  var COST_SAMPLE = JSON.stringify({
    type: 'result', subtype: 'success', is_error: false, duration_ms: 2310, num_turns: 1, result: '4',
    session_id: '00000000-0000-4000-8000-000000000000', total_cost_usd: 0.00158877,
    usage: { input_tokens: 2, cache_creation_input_tokens: 7207, cache_read_input_tokens: 14517, output_tokens: 4,
      cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 7207 } },
    modelUsage: { 'claude-haiku-5-5': { inputTokens: 2, outputTokens: 4, cacheReadInputTokens: 14517, cacheCreationInputTokens: 7207, costUSD: 0.00158877 } }
  }, null, 2);

  function mountCost(root) {
    root.appendChild(el('h4', '', 'Cost meter'));
    var ta = el('textarea'); ta.spellcheck = false; ta.rows = 6;
    ta.placeholder = '{"type":"result", ... "usage":{...}}  or just  {"input_tokens":..., ...}';
    root.appendChild(labelled('Paste the JSON from claude -p --output-format json, or only its usage object', ta));
    var g = el('div', 'grid'), ms = modelSelect('sonnet'), ttl = select([['5m', '5-minute (1.25x input)'], ['1h', '1-hour (2x input)']], '5m');
    var ttlL = labelled('Cache write lifetime', ttl);
    g.appendChild(labelled('Model', ms)); g.appendChild(ttlL); root.appendChild(g);
    var row = el('div', 'row'), sample = button('Load sample'), clr = button('Clear');
    row.appendChild(sample); row.appendChild(clr); root.appendChild(row);
    var out = liveBox(); root.appendChild(out);
    var lastText = null;

    function render() {
      clear(out);
      var p = parseInput(ta.value);
      if (ta.value !== lastText) { lastText = ta.value; if (!p.error && p.model) ms.value = p.model; }
      if (p.error) { out.appendChild(para('note', ta.value.trim() ? p.error : 'Paste a result above, or load the sample.')); return; }
      var r = costUsage(p.usage, ms.value, ttl.value), t = r.tokens;
      ttlL.style.opacity = t.split ? '0.6' : '';
      ttl.disabled = t.split;
      ttl.title = t.split ? 'The pasted usage has the 5-minute / 1-hour split, so it is used instead.' : '';
      var cwRate = t.cw1 && t.cw5 ? perM(r.rates.cw5) + ' / ' + perM(r.rates.cw1) : perM(t.cw1 ? r.rates.cw1 : r.rates.cw5);
      out.appendChild(typeTable(t, r.cost));
      out.appendChild(para('note', 'Per million tokens: input ' + perM(r.rates.inp) + ', cache write ' + cwRate + (t.cw1 && t.cw5 ? ' (5-minute / 1-hour)' : '') +
        ', cache read ' + perM(r.rates.cr) + ', output ' + perM(r.rates.out) + '.'));
      if (t.split) out.appendChild(para('note', 'Cache write split from the paste: ' + fmtInt(t.cw5) + ' 5-minute, ' + fmtInt(t.cw1) + ' 1-hour.'));
      out.appendChild(bar(t, 'Share by tokens', fmtInt));
      out.appendChild(bar(r.cost, 'Share by cost', fmtUSD));
      out.appendChild(legend());
      var tot = el('div'); tot.appendChild(el('div', 'note', 'Total at list price, ' + MODELS[ms.value].label + (r.hi ? ' (prompt over 100,000 tokens: higher price step)' : '')));
      tot.appendChild(el('div', 'big', fmtUSD(r.total))); out.appendChild(tot);
      out.appendChild(para('', 'Without caching (all ' + fmtInt(r.prompt) + ' prompt tokens at the input price): ' + fmtUSD(r.noCache) + '. Caching saves ' + fmtPct(r.saving) + '.'));
      if (p.totalCost != null) {
        var d = r.total - p.totalCost;
        out.appendChild(para('', 'Reported total_cost_usd: ' + fmtUSD(p.totalCost) + ' (' + String(p.totalCost) + '). Computed minus reported: ' + fmtUSD(d) +
          (p.totalCost > 0 ? ' (' + fmtPct(d / p.totalCost) + ')' : '') + '.'));
      }
      if (p.models > 1) out.appendChild(para('note', 'This run used ' + p.models + ' models; every token above is priced at the selected one.'));
      out.appendChild(para('note', 'On a subscription plan this is the list-price equivalent, not a charge.'));
    }
    ta.addEventListener('input', render); ms.addEventListener('change', render); ttl.addEventListener('change', render);
    sample.addEventListener('click', function () { ta.value = COST_SAMPLE; render(); });
    clr.addEventListener('click', function () { ta.value = ''; render(); ta.focus(); });
    render();
  }

  /* ---------- mount: session cost model ---------- */
  function mountSession(root) {
    root.appendChild(el('h4', '', 'Session cost model'));
    var g = el('div', 'grid');
    var f = {
      model: modelSelect('sonnet'),
      turns: numInput(40, 1, 2000),
      prefix: numInput(20000, 0, 1000000, 1000),
      added: numInput(3000, 0, 1000000, 500),
      output: numInput(500, 0, 128000, 100),
      caching: select([['on', 'On'], ['off', 'Off']], 'on'),
      ttl: select([['5m', '5-minute'], ['1h', '1-hour']], '5m'),
      restarts: numInput(0, 0, 1999)
    };
    g.appendChild(labelled('Model', f.model));
    g.appendChild(labelled('Turns', f.turns));
    g.appendChild(labelled('Fixed prefix tokens (system, tools, instruction files)', f.prefix));
    g.appendChild(labelled('Tokens added per turn', f.added));
    g.appendChild(labelled('Output tokens per turn', f.output));
    g.appendChild(labelled('Prompt caching', f.caching));
    g.appendChild(labelled('Cache lifetime', f.ttl));
    g.appendChild(labelled('Cold restarts (cache expired)', f.restarts));
    root.appendChild(g);
    var out = liveBox(); root.appendChild(out);

    function params(caching) {
      var T = readNum(f.turns, 40, 1, 2000);
      return {
        model: f.model.value, turns: T, prefix: readNum(f.prefix, 20000, 0, 1e7), added: readNum(f.added, 3000, 0, 1e7),
        output: readNum(f.output, 500, 0, 1e6), caching: caching, ttl: f.ttl.value, restarts: readNum(f.restarts, 0, 0, T - 1)
      };
    }
    function render() {
      clear(out);
      var on = f.caching.value === 'on', p = params(on), r = sessionModel(p), off = sessionModel(params(false));
      f.ttl.disabled = !on; f.restarts.disabled = !on;
      out.appendChild(typeTable(r.tokens, r.cost));
      out.appendChild(bar(r.tokens, 'Share by tokens', fmtInt));
      out.appendChild(bar(r.cost, 'Share by cost', fmtUSD));
      out.appendChild(legend());
      var tot = el('div'); tot.appendChild(el('div', 'note', 'Session total, ' + r.turns + ' turns, ' + MODELS[p.model].label));
      tot.appendChild(el('div', 'big', fmtUSD(r.total))); out.appendChild(tot);
      if (on) out.appendChild(para('', 'With caching off: ' + fmtUSD(off.total) + '. Caching saves ' + fmtPct(off.total > 0 ? (off.total - r.total) / off.total : 0) + '.'));
      else out.appendChild(para('', 'Caching is off, so every prompt token is billed at the input price.'));
      out.appendChild(para('', 'Cost per turn: ' + fmtUSD(r.first) + ' on turn 1, ' + fmtUSD(r.last) + ' on turn ' + r.turns + '.'));
      if (on && r.restartTurns.length) {
        out.appendChild(para('', 'Cold restarts on turn' + (r.restartTurns.length > 1 ? 's ' : ' ') + r.restartTurns.join(', ') + ' add ' + fmtUSD(r.restartExtra) +
          ' (' + fmtPct(r.total > 0 ? r.restartExtra / r.total : 0) + ' of the total).'));
      } else if (on) out.appendChild(para('note', 'No cold restarts: every turn after the first reads the earlier context from cache.'));
      out.appendChild(para('note', 'Model: turn t sends prefix + (t-1) x (added + output) + this turn\'s added tokens. With caching, what is already cached is a cache read; the previous answer and the new input are a cache write; a cold restart writes it all again.'));
    }
    Object.keys(f).forEach(function (k) { f[k].addEventListener('input', render); f[k].addEventListener('change', render); });
    render();
  }

  /* ---------- mount: A/B readout ---------- */
  var AB_SAMPLE = 'A,B\n6,8\n5,7\n7,7\n4,6\n8,9\n6,5\n5,8\n7,9\n3,5\n6,7\n8,8\n5,6\n6,9\n7,6\n4,7\n5,7\n6,8\n7,8\n5,5\n6,7';

  function mountAB(root) {
    root.appendChild(el('h4', '', 'A/B readout'));
    var ta = el('textarea'); ta.spellcheck = false; ta.rows = 6; ta.placeholder = 'A,B\n6,8\n5,7\n...';
    root.appendChild(labelled('One case per line: score for A, then score for B (comma, tab or space). Higher is better.', ta));
    var row = el('div', 'row'), sample = button('Load sample'), clr = button('Clear');
    row.appendChild(sample); row.appendChild(clr); root.appendChild(row);
    var out = liveBox(); root.appendChild(out);
    var timer = null;

    function statTable(rows) {
      var w = el('div', 'tablewrap'), t = el('table'), tb = el('tbody');
      rows.forEach(function (r) { var tr = el('tr'); tr.appendChild(el('td', '', r[0])); tr.appendChild(el('td', 'num', r[1])); tb.appendChild(tr); });
      t.appendChild(tb); w.appendChild(t); return w;
    }
    function render() {
      clear(out);
      var pr = parseAB(ta.value);
      if (pr.bad.length) out.appendChild(para('note', 'Could not read ' + pr.bad.length + ' line' + (pr.bad.length > 1 ? 's' : '') + ' (line ' + pr.bad.slice(0, 8).join(', ') + (pr.bad.length > 8 ? ', ...' : '') + ').'));
      if (pr.pairs.length < 2) { out.appendChild(para('note', 'Paste at least two cases, or load the sample.')); return; }
      var r = abAnalyze(pr.pairs), d = 3;
      out.appendChild(statTable([
        ['Cases (n)', fmtInt(r.n)], ['Mean of A', fmtNum(r.meanA, d)], ['Mean of B', fmtNum(r.meanB, d)],
        ['Mean difference (B minus A)', fmtNum(r.meanDiff, d)], ['Wins for B', fmtInt(r.winsB)], ['Wins for A', fmtInt(r.winsA)], ['Ties', fmtInt(r.ties)],
        ['Sign test p (two-sided, ' + fmtInt(r.winsA + r.winsB) + ' non-tied)', r.p < 0.0001 ? r.p.toExponential(2) : r.p.toFixed(4)],
        ['95% bootstrap interval of the difference', fmtNum(r.ci[0], d) + ' to ' + fmtNum(r.ci[1], d)]
      ]));
      var v = para('verdict', r.verdict + '.');
      v.style.color = r.clear ? 'var(--good)' : 'var(--fg)';
      out.appendChild(v);
      if (!r.clear) {
        out.appendChild(para('', r.more != null
          ? 'Roughly ' + fmtInt(r.more) + ' more cases of this kind would be needed to tell, if the difference holds.'
          : 'Collect more cases.'));
      }
      out.appendChild(para('note', 'Clear means the interval excludes 0 and the sign test p is below 0.05. Bootstrap: 10,000 resamples, fixed seed. Check cost and latency before you switch.'));
    }
    function later() { if (timer) clearTimeout(timer); timer = setTimeout(render, 150); }
    ta.addEventListener('input', later);
    sample.addEventListener('click', function () { ta.value = AB_SAMPLE; render(); });
    clr.addEventListener('click', function () { ta.value = ''; render(); ta.focus(); });
    render();
  }

  var MOUNT = { cost: mountCost, session: mountSession, ab: mountAB };
  [].forEach.call(document.querySelectorAll('div.tool[data-tool]'), function (root) {
    var fn = MOUNT[root.getAttribute('data-tool')];
    if (!fn || root.getAttribute('data-mounted')) return;
    root.setAttribute('data-mounted', '1');
    try { fn(root); } catch (e) { root.appendChild(para('note', 'This instrument could not start.')); }
  });
})();
