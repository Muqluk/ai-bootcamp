// Node test for site/tools.js maths. Run: node tools/test-tools.js
'use strict';
var path = require('path');
var fs = require('fs');
var T = require(path.join(__dirname, '..', 'site', 'tools.js'));

var passed = 0, failed = 0;
function ok(cond, name) { if (cond) { passed++; } else { failed++; console.log('FAIL ' + name); } }
function near(a, b, tol, name) { ok(Math.abs(a - b) <= tol, name + ' (got ' + a + ', want ' + b + ')'); }

var src = fs.readFileSync(path.join(__dirname, '..', 'site', 'tools.js'), 'utf8');
ok(src.toLowerCase().indexOf('</script') < 0, 'tools.js has no closing script tag');
ok(!/innerHTML/.test(src), 'tools.js does not use innerHTML');

// Haiku 5.5 anchor: real run, total_cost_usd 0.00158877
var anchorUsage = { input_tokens: 2, cache_creation_input_tokens: 7207, cache_read_input_tokens: 14517, output_tokens: 4,
  cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 7207 } };
var a = T.costUsage(anchorUsage, 'haiku', '5m');
near(a.total, 0.00158877, 1e-7, 'Haiku anchor with split');
var noSplit = { input_tokens: 2, cache_creation_input_tokens: 7207, cache_read_input_tokens: 14517, output_tokens: 4 };
near(T.costUsage(noSplit, 'haiku', '1h').total, 0.00158877, 1e-7, 'Haiku anchor, no split, 1-hour select');
ok(T.costUsage(noSplit, 'haiku', '5m').total < a.total, '5-minute writes cost less than 1-hour');
near(a.noCache, (2 + 7207 + 14517) * 0.1e-6 + 4 * 0.5e-6, 1e-12, 'without-caching cost');

// Haiku price step above 100k prompt tokens
var lo = T.costUsage({ input_tokens: 100000, output_tokens: 1000 }, 'haiku');
var hi = T.costUsage({ input_tokens: 100001, output_tokens: 1000 }, 'haiku');
near(lo.total, 100000 * 0.1e-6 + 1000 * 0.5e-6, 1e-12, 'Haiku at 100,000 uses low step');
near(hi.total, 100001 * 0.5e-6 + 1000 * 2.5e-6, 1e-12, 'Haiku above 100,000 uses high step');
var mixed = T.costUsage({ input_tokens: 10, cache_read_input_tokens: 95000, cache_creation_input_tokens: 6000, output_tokens: 0 }, 'haiku');
ok(mixed.hi, 'Haiku step counts cache reads and writes in prompt length');
ok(!T.costUsage({ input_tokens: 200000 }, 'sonnet').hi, 'no step on Sonnet');

// cache read multipliers per model
near(T.costUsage({ cache_read_input_tokens: 1e6 }, 'opus').total, 4 * 0.05, 1e-12, 'Opus cache read 0.05x');
near(T.costUsage({ cache_read_input_tokens: 1e6 }, 'sonnet').total, 2 * 0.05, 1e-12, 'Sonnet cache read 0.05x');
near(T.costUsage({ cache_read_input_tokens: 1e6 }, 'fable').total, 8 * 0.025, 1e-12, 'Fable cache read 0.025x');
near(T.costUsage({ cache_creation_input_tokens: 1e6 }, 'opus', '5m').total, 5, 1e-12, 'Opus 5-minute write 1.25x');

// parser
var full = JSON.stringify({ type: 'result', total_cost_usd: 0.00158877, usage: anchorUsage, modelUsage: { 'claude-haiku-5-5': { costUSD: 0.00158877 } } });
var p1 = T.parseInput(full);
ok(!p1.error && p1.usage.cache_read_input_tokens === 14517, 'parser accepts full result object');
ok(p1.totalCost === 0.00158877, 'parser reads total_cost_usd');
ok(p1.model === 'haiku', 'parser maps modelUsage to haiku');
var p2 = T.parseInput(JSON.stringify(noSplit));
ok(!p2.error && p2.usage.input_tokens === 2 && p2.totalCost === null, 'parser accepts bare usage object');
var p3 = T.parseInput('Output was:\n' + full + '\n');
ok(!p3.error && p3.usage.output_tokens === 4, 'parser tolerates text around the JSON');
var p4 = T.parseInput('{"type":"system"}\n{"type":"result","usage":{"input_tokens":5,"output_tokens":1}}');
ok(!p4.error && p4.usage.input_tokens === 5, 'parser accepts stream-json lines');
ok(!!T.parseInput('not json').error, 'parser rejects garbage');
ok(!!T.parseInput('{"a":1}').error, 'parser rejects JSON without usage');
ok(T.mapModel('claude-sonnet-4-5') === null, 'older model does not map');
ok(T.mapModel('claude-opus-5-5-20261001') === 'opus', 'dated id maps');

// session model
var base = { model: 'sonnet', turns: 40, prefix: 20000, added: 3000, output: 500, caching: true, ttl: '5m', restarts: 0 };
var off = T.sessionModel(Object.assign({}, base, { caching: false }));
var want = 0;
for (var t = 1; t <= 40; t++) want += (20000 + (t - 1) * 3500 + 3000) * 2e-6 + 500 * 10e-6;
near(off.total, want, 1e-9, 'session caching off equals turns at plain prices');
ok(off.tokens.cw === 0 && off.tokens.cr === 0, 'caching off has no cache tokens');
var hoff = T.sessionModel({ model: 'haiku', turns: 60, prefix: 20000, added: 3000, output: 500, caching: false });
var hwant = 0;
for (t = 1; t <= 60; t++) { var pr = 20000 + (t - 1) * 3500 + 3000, big = pr > 100000; hwant += pr * (big ? 0.5e-6 : 0.1e-6) + 500 * (big ? 2.5e-6 : 0.5e-6); }
near(hoff.total, hwant, 1e-9, 'Haiku session caching off applies the step per turn');
var on = T.sessionModel(base);
ok(on.total < off.total, 'caching lowers session cost');
near(on.noCache, off.total, 1e-9, 'noCache field equals caching-off run');
ok(on.tokens.cw === 20000 + 3000 + 39 * (3000 + 500), 'cache writes: turn 1 whole prompt, then the previous answer plus new input');
var prev = on.total, inc = true;
[1, 2, 5, 10].forEach(function (k) { var r = T.sessionModel(Object.assign({}, base, { restarts: k })); if (!(r.total > prev) || !(r.restartExtra > 0)) inc = false; prev = r.total; });
ok(inc, 'cold restarts strictly increase cost');
ok(JSON.stringify(T.restartTurns(40, 1)) === '[21]', 'one restart in the middle');
ok(JSON.stringify(T.restartTurns(5, 9)) === '[2,3,4,5]', 'restarts capped at turns-1');
ok(on.last > on.first || on.first > 0, 'per-turn costs present');

// sign test
near(T.signTest(9, 10), 0.021484375, 1e-15, 'sign test 9 of 10');
near(T.signTest(1, 10), 0.021484375, 1e-15, 'sign test 1 of 10 symmetric');
ok(T.signTest(5, 10) === 1, 'sign test 5 of 10 is 1');
ok(T.signTest(0, 0) === 1, 'sign test no non-ties is 1');
near(T.signTest(10, 10), 2 / 1024, 1e-15, 'sign test 10 of 10');
var big = T.signTest(1100, 2000);
ok(big > 0 && big < 1e-4, 'sign test large n in log space');

// bootstrap
var diffs = [1, -2, 3, 0.5, 2, -1, 4, 1.5];
var c1 = T.bootstrapCI(diffs, 10000, 7), c2 = T.bootstrapCI(diffs, 10000, 7);
ok(c1[0] === c2[0] && c1[1] === c2[1], 'bootstrap is deterministic');
var pairsC = []; for (var i = 0; i < 15; i++) pairsC.push([i, i + 2]);
var rc = T.abAnalyze(pairsC);
ok(rc.ci[0] <= 2 && rc.ci[1] >= 2, 'constant difference interval contains the true difference');
ok(rc.verdict === 'B is better', 'constant +2 on 15 cases: B is better');

// A/B parse and verdict
var pab = T.parseAB('A,B\n1,2\n\n3\t4\n5 6\nfoo bar\n7;8\n');
ok(pab.pairs.length === 4 && pab.bad.length === 1 && pab.header, 'parseAB: header skipped, blanks ignored, one bad line');
var r1 = T.abAnalyze(T.parseAB('A,B\n6,8\n5,7\n7,7\n4,6\n8,9\n6,5\n5,8\n7,9\n3,5\n6,7\n8,8\n5,6\n6,9\n7,6\n4,7\n5,7\n6,8\n7,8\n5,5\n6,7').pairs);
ok(r1.winsB === 15 && r1.winsA === 2 && r1.ties === 3 && r1.verdict === 'B is better', 'sample data gives B is better');
var r2 = T.abAnalyze([[1, 2], [2, 1], [3, 3], [4, 5], [5, 4]]);
ok(r2.verdict === 'No clear difference', 'balanced data: no clear difference');
var r3 = T.abAnalyze([[5, 4], [6, 5], [5, 5], [7, 6], [4, 4.5]]);
ok(!r3.clear && (r3.more === null || r3.more > 0), 'small A lead: not clear, estimate or collect more');

// formatting
ok(T.fmtInt(1234567) === '1,234,567', 'fmtInt separators');
ok(T.fmtUSD(0.00158877) === '$0.0016', 'fmtUSD under $1');
ok(T.fmtUSD(1234.567) === '$1,234.57', 'fmtUSD above $1');

console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
