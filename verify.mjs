// Post-build sanity checks. Run after build.mjs / readme.mjs:
//
//   node verify.mjs
//
// Covers the three things that have actually broken on this README before:
// theme drift, cards referencing files that do not exist, and hand-typed numbers
// quietly going stale. The last check is the one that matters most — it fails if
// a digit reaches a card without coming from data.live.json.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const fail = [];
const ok = [];

const CARDS = ['header', 'whoami', 'repos', 'telemetry', 'stack'];
const SECTIONS = ['s01', 's02', 's03', 's04'];

// ---------- 1. theme divergence ----------

const darkHeader = readFileSync(join(ROOT, 'assets/dark/header.svg'), 'utf8');
const lightHeader = readFileSync(join(ROOT, 'assets/header.svg'), 'utf8');
if (!darkHeader.includes('#0d1117')) fail.push('dark header missing dark bg');
else ok.push('dark theme uses #0d1117');
if (!lightHeader.includes('#ffffff')) fail.push('light header missing white bg');
else ok.push('light theme uses #ffffff');
if (darkHeader === lightHeader) fail.push('themes are identical');

// ---------- 2. expected asset set ----------

const light = readdirSync(join(ROOT, 'assets')).filter((f) => f.endsWith('.svg'));
const dark = new Set(readdirSync(join(ROOT, 'assets/dark')).filter((f) => f.endsWith('.svg')));
const expected = [...CARDS, ...SECTIONS].map((n) => `${n}.svg`);
for (const f of light) if (!dark.has(f)) fail.push(`assets/dark/${f} missing`);
for (const f of expected) {
  if (!light.includes(f)) fail.push(`assets/${f} missing`);
  if (!dark.has(f)) fail.push(`assets/dark/${f} missing`);
}
const stale = light.filter((f) => !expected.includes(f));
if (stale.length) fail.push(`stale assets not in the card list: ${stale.join(', ')}`);
ok.push(`${expected.length} cards present in both themes`);

// Removed cards must be gone, not just unreferenced.
for (const gone of ['ecosystem.svg', 'timeline.svg', 'history.svg', 'footer.svg']) {
  if (light.includes(gone) || dark.has(gone)) fail.push(`${gone} should have been removed`);
}

// ---------- 3. content hygiene ----------

const bodies = new Map();
for (const f of light) bodies.set(f, readFileSync(join(ROOT, 'assets', f), 'utf8'));
for (const f of dark) bodies.set(`dark/${f}`, readFileSync(join(ROOT, 'assets/dark', f), 'utf8'));
for (const [name, body] of bodies) {
  if (body.includes('undefined')) fail.push(`${name} contains undefined`);
  if (body.includes('NaN')) fail.push(`${name} contains NaN`);
  if (body.includes('TODO')) fail.push(`${name} contains TODO`);
}

// ---------- 4. marquee geometry ----------
//
// The old header drew two strips whose two copies each slid a full viewport
// width, which left a dead gap for most of the cycle and read as overlapping
// text. The invariant now: each row is one baseline, copies are spaced exactly
// one text-width apart, and each copy travels exactly one text-width. That is
// what makes the loop seamless with no overlap.

const monoW = (s, size, ls = 0) => s.length * size * 0.6 + ls * Math.max(0, s.length - 1);
const headerBody = bodies.get('header.svg');
const marquees = [...headerBody.matchAll(/opacity="[\d.]+">((?:<g>.*?<\/g>)+)<\/g>/gs)].map((m) => m[1]);

if (marquees.length !== 2) {
  fail.push(`expected 2 marquee rows, found ${marquees.length}`);
} else {
  const rows = marquees.map((row) => {
    const copies = [...row.matchAll(/from="(-?[\d.]+) 0" to="(-?[\d.]+) 0"/g)].map((m) => ({
      from: Number(m[1]),
      to: Number(m[2])
    }));
    const text = (row.match(/>([^<>]+)<\/text>/) || [])[1] || '';
    return { copies, width: monoW(text, 11, 2), text };
  });

  rows.forEach((row, i) => {
    const label = row.text.slice(0, 28) || `row ${i + 1}`;
    if (row.copies.length < 2) fail.push(`marquee row ${i + 1} has ${row.copies.length} copies, need >= 2`);

    const travel = row.copies.map((c) => Math.abs(c.to - c.from));
    if (travel.some((d) => Math.abs(d - row.width) > 0.5)) {
      fail.push(
        `marquee row ${i + 1} copies travel ${[...new Set(travel)].join('/')}px but the text is ${r2(row.width)}px wide`
      );
    }
    const starts = row.copies.map((c) => c.from).sort((a, b) => a - b);
    const gaps = starts.slice(1).map((v, k) => r2(v - starts[k]));
    if (gaps.some((g) => Math.abs(g - row.width) > 0.5)) {
      fail.push(`marquee row ${i + 1} copies are spaced ${[...new Set(gaps)].join('/')}px apart, need ${r2(row.width)}px`);
    }
    // Coverage must hold for the whole cycle, not just at t=0. Each copy sits
    // at (i - 1) * width and slides by exactly one width, so the union of all
    // copies spans [(leftEdge0 - slide*t), (rightEdge0 - slide*t)]. Sampling the
    // loop is enough to catch an off-by-one-copy, which is the actual bug.
    const dir = row.copies[0].to <= row.copies[0].from ? 1 : -1;
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const left = Math.min(...row.copies.map((c) => c.from - dir * row.width * t));
      const right = Math.max(...row.copies.map((c) => Math.max(c.from, c.to) - dir * row.width * t + row.width));
      if (left > 0 || right < 1000) {
        fail.push(`marquee row ${i + 1} leaves a gap at t=${t} (${r2(left)}..${r2(right)} of 0..1000)`);
        break;
      }
    }
    ok.push(`marquee row ${i + 1} "${label}…" — ${row.copies.length} copies, ${r2(row.width)}px pitch, no gap at any point in the loop`);
  });

  // Vertical separation between the two stacked rows. Several copies share one
  // baseline, so collapse to the distinct values before measuring.
  const baselines = [
    ...new Set([...headerBody.matchAll(/<text x="0" y="([\d.]+)"/g)].map((m) => Number(m[1])))
  ].sort((a, b) => a - b);
  if (baselines.length < 2) fail.push('could not find both marquee baselines');
  else {
    const gap = r2(baselines[1] - baselines[0]);
    if (gap < 16) fail.push(`marquee rows only ${gap}px apart, they will read as one overlapping line`);
    else ok.push(`marquee rows ${gap}px apart (font-size 11) — stacked, not overlaid`);
  }
}

function r2(n) {
  return Math.round(n * 100) / 100;
}

// ---------- 4b. nothing spills off the card ----------
//
// Cards are 1000px wide with a 40px gutter. A string that grew (a long repo
// description, a new language name) must not run off the edge or past the
// bottom, so measure every text node against its own card box.

const W = 1000;
const MARGIN = 40;
const monoAdvance = (s, size, ls = 0) => s.length * size * 0.6 + ls * Math.max(0, s.length - 1);
let spill = 0;

for (const [name, body] of bodies) {
  if (name.startsWith('dark/')) continue;
  const cardH = Number((body.match(/height="(\d+)"/) || [])[1]);

  // Marquee copies sit inside <g> elements carrying an <animateTransform>, so
  // their x is a sliding offset rather than a layout position and they are
  // meant to run past the gutter. Record those ranges and skip anything inside.
  const animated = [...body.matchAll(/<g>\s*<animateTransform[\s\S]*?<\/g>/g)].map((m) => [
    m.index,
    m.index + m[0].length
  ]);
  const isSliding = (idx) => animated.some(([a, b]) => idx >= a && idx < b);

  for (const match of body.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)) {
    if (isSliding(match.index)) continue;
    const attrs = match[1];
    const text = match[2];
    const at = (k) => {
      const m = attrs.match(new RegExp(`${k}="(-?[\\d.]+)"`));
      return m ? Number(m[1]) : 0;
    };
    const size = Number((attrs.match(/font-size="([\d.]+)"/) || [])[1] || 12);
    const ls = Number((attrs.match(/letter-spacing="([\d.]+)"/) || [])[1] || 0);
    const anchor = (attrs.match(/text-anchor="(\w+)"/) || [])[1] || 'start';
    // Sans text is narrower than the mono metric; 0.92 keeps the check
    // conservative without demanding a real text-measuring engine.
    const width = monoAdvance(text, size, ls) * (attrs.includes('font-family') ? 0.92 : 1);
    const x = at('x');
    const y = at('y');
    const left = anchor === 'end' ? x - width : anchor === 'middle' ? x - width / 2 : x;
    const right = left + width;
    if (left < MARGIN - 2 || right > W - MARGIN + 2) {
      fail.push(`${name}: "${text}" spans ${r2(left)}..${r2(right)}, outside the ${MARGIN}..${W - MARGIN} gutter`);
      spill += 1;
    }
    if (cardH && y > cardH - 6) {
      fail.push(`${name}: "${text}" baseline at y=${y} is below the ${cardH}px card height`);
      spill += 1;
    }
    if (spill > 12) break;
  }
  if (spill > 12) break;
}
if (!spill) ok.push('no text spills outside the card gutter or below its height');

// ---------- 4c. nothing overlaps on the same baseline ----------
//
// Overlapping text is the failure that prompted this pipeline, so check it
// directly rather than trusting the layout math. Two nodes sharing a baseline
// must not have overlapping horizontal extents.

let collided = 0;
for (const [name, body] of bodies) {
  if (name.startsWith('dark/')) continue;
  const cardH = Number((body.match(/height="(\d+)"/) || [])[1]);
  const animated = [...body.matchAll(/<g>\s*<animateTransform[\s\S]*?<\/g>/g)].map((m) => [
    m.index,
    m.index + m[0].length
  ]);
  const isSliding = (idx) => animated.some(([a, b]) => idx >= a && idx < b);

  const lanes = new Map();
  for (const match of body.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)) {
    if (isSliding(match.index)) continue;
    const attrs = match[1];
    const text = match[2];
    if (!text.trim()) continue;
    const num = (k) => {
      const m = attrs.match(new RegExp(`${k}="(-?[\\d.]+)"`));
      return m ? Number(m[1]) : 0;
    };
    const size = Number((attrs.match(/font-size="([\d.]+)"/) || [])[1] || 12);
    const ls = Number((attrs.match(/letter-spacing="([\d.]+)"/) || [])[1] || 0);
    const anchor = (attrs.match(/text-anchor="(\w+)"/) || [])[1] || 'start';
    const width = monoAdvance(text, size, ls) * (attrs.includes('font-family') ? 0.92 : 1);
    const x = num('x');
    const left = anchor === 'end' ? x - width : anchor === 'middle' ? x - width / 2 : x;
    if (!lanes.has(Math.round(num('y')))) lanes.set(Math.round(num('y')), []);
    lanes.get(Math.round(num('y'))).push({ left, right: left + width, text });
  }

  for (const [y, items] of lanes) {
    items.sort((a, b) => a.left - b.left);
    for (let i = 1; i < items.length; i += 1) {
      // 1px of slack absorbs rounding in the advance-width estimate.
      if (items[i].left < items[i - 1].right - 1) {
        fail.push(
          `${name}: y=${y} "${items[i - 1].text}" (ends ${r2(items[i - 1].right)}) overlaps "${items[i].text}" (starts ${r2(items[i].left)})`
        );
        collided += 1;
        if (collided > 8) break;
      }
    }
    if (collided > 8) break;
  }
  if (collided > 8) break;
  void cardH;
}
if (!collided) ok.push('no two text nodes overlap on any shared baseline');
//
// Every number rendered as text has to exist in data.live.json, otherwise it is
// something a human typed and it will go stale. Strings declared in
// data.mjs's PROSE list are exempt — that is the prose, and prose is allowed to
// contain digits. Section numbers are structural and allowed explicitly.

const { PROSE } = await import('./data.mjs');
const prose = new Set(PROSE);
const live = readFileSync(join(ROOT, 'data.live.json'), 'utf8');
const rawNumbers = (live.match(/\d+/g) || []).map(Number);

// Numbers a card is allowed to render: everything in data.live.json, plus the
// specific reformattings build.mjs performs. Keeping this list explicit is the
// point — if a card starts inventing a number, nothing here covers it.
const allowedNumbers = new Set();
for (const n of rawNumbers) {
  const bare = String(n).replace(/^0+(?=\d)/, '');
  allowedNumbers.add(bare);
  allowedNumbers.add(String(n));
  // fmtBytes: bytes -> "530K" / "22.6M"
  allowedNumbers.add(String(Math.round(n / 1024)));
  allowedNumbers.add(String(Math.round(n / 1024 / 1024)));
  allowedNumbers.add((n / 1048576).toFixed(1));
  // Month labels render "2026-09" as "09/26" — the two-digit year is a slice.
  if (n >= 1900 && n <= 2999) allowedNumbers.add(String(n).slice(2));
}
const structural = new Set(SECTIONS.map((s) => s.replace('s', '')));
const offenders = new Map();

for (const [name, body] of bodies) {
  if (name.startsWith('dark/')) continue; // both themes render identical text
  for (const [, text] of body.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)) {
    if (prose.has(text)) continue;
    for (const token of text.match(/\d+/g) || []) {
      const bare = token.replace(/^0+(?=\d)/, '');
      if (allowedNumbers.has(bare) || allowedNumbers.has(token) || structural.has(bare)) continue;
      if (!offenders.has(token)) offenders.set(token, new Set());
      offenders.get(token).add(`${name} — "${text}"`);
    }
  }
}

if (offenders.size) {
  for (const [token, where] of offenders) {
    fail.push(`number "${token}" is not in data.live.json and not declared prose: ${[...where][0]}`);
  }
} else {
  ok.push('every number on every card traces back to data.live.json or declared prose');
}

// ---------- 6. no untrackable claims ----------
//
// Narrow on purpose. The removed items were hand-typed status assertions, not
// incidental words: an availability line the profile owner has to retype, and
// the per-service "up" rows under the activity pulse. Tool names in the marquee
// and the prose are left alone — they are the voice, not a status readout.

const BANNED = [
  ['Open to interesting problems', 'hand-written availability line'],
  ['SYSTEM ONLINE', 'hand-asserted status'],
  ['OPEN TO', 'hand-written availability line']
];
for (const [needle, why] of BANNED) {
  const hit = [...bodies.entries()].filter(([, b]) => b.includes(needle));
  if (hit.length) fail.push(`untrackable claim "${needle}" (${why}) still in ${hit.map(([n]) => n).join(', ')}`);
}

// The old service rows rendered each state as a text node reading exactly "up".
// Nothing legitimate renders that, so it is a precise marker for a typed status.
for (const [name, body] of bodies) {
  for (const [, text] of body.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)) {
    if (text.trim().toLowerCase() === 'up') {
      fail.push(`"${text}" service state in ${name} — hand-typed, not tracked`);
      break;
    }
  }
}
ok.push('no hand-written availability or service-status claims left on any card');

// ---------- 7. README wiring ----------

const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
const RAW_BASE = 'https://raw.githubusercontent.com/brgjr10/brgjr10/main/assets';
if (!readme.includes(RAW_BASE)) fail.push('README does not reference raw asset URLs');
ok.push('README references raw asset URLs');

const pictures = [...readme.matchAll(/<picture>[\s\S]*?<\/picture>/g)];
if (!pictures.length) fail.push('README contains no <picture> theme-switching elements');

for (const card of CARDS) {
  const light = `${RAW_BASE}/${card}.svg`;
  const dark = `${RAW_BASE}/dark/${card}.svg`;
  if (!readme.includes(light)) fail.push(`light assets/${card}.svg not referenced`);
  if (!readme.includes(dark)) fail.push(`dark assets/${card}.svg not referenced`);
}
for (const sec of SECTIONS) {
  const light = `${RAW_BASE}/${sec}.svg`;
  const dark = `${RAW_BASE}/dark/${sec}.svg`;
  if (!readme.includes(light)) fail.push(`light assets/${sec}.svg not referenced`);
  if (!readme.includes(dark)) fail.push(`dark assets/${sec}.svg not referenced`);
}
ok.push('every generated card has light and dark references in README.md');

// ---------- 8. portfolio site ----------
//
// index.html is site.mjs's stamp of data.live.json into
// site.html. The checks that matter: the stamp ran, the
// embedded DATA parses, and it is the same account and the
// same repo list as the snapshot — a stale or partial stamp
// would fail here rather than ship a lying page.

const sitePath = join(ROOT, 'index.html');
if (!existsSync(sitePath)) {
  fail.push('index.html missing — run node site.mjs');
} else {
  const site = readFileSync(sitePath, 'utf8');
  if (site.includes('/*__PROFILE_DATA__*/')) fail.push('index.html still has the un-stamped data placeholder');
  if (site.includes('undefined')) fail.push('index.html contains undefined');
  if (site.includes('NaN')) fail.push('index.html contains NaN');
  // The count-up animation sets textContent on everything it
  // selects, and the monthly histogram bars carry data-count
  // (for their tooltip). An unscoped [data-count] selector
  // therefore counts the bars up too and replaces each bar's
  // <i> — the chart flashes on and then empties. The selector
  // must stay scoped to the stat numbers (.v[data-count]).
  if (site.includes("$$('[data-count]')")) fail.push('index.html count-up selector is unscoped and would wipe the histogram bars');

  const stamp = site.match(/const DATA = (\{[\s\S]*?\});\s*<\/script>/);
  if (!stamp) {
    fail.push('index.html has no stamped DATA object');
  } else {
    const liveData = JSON.parse(live);
    let stamped;
    try {
      stamped = JSON.parse(stamp[1]);
    } catch (err) {
      fail.push('index.html DATA is not valid JSON: ' + err.message);
    }
    if (stamped) {
      if (stamped.handle !== liveData.handle) {
        fail.push(`index.html DATA handle is @${stamped.handle}, data.live.json says @${liveData.handle}`);
      }
      const stampedNames = (stamped.repos || []).map((r) => r.name);
      const liveNames = liveData.repos.map((r) => r.name);
      if (JSON.stringify(stampedNames) !== JSON.stringify(liveNames)) {
        fail.push('index.html repo list does not match data.live.json');
      }
      // Covers are rendered as <img src> on a public https page, so
      // anything sync produced must be an https URL — a stray http:
      // would be mixed content, anything else would be a red flag.
      for (const r of stamped.repos || []) {
        if (r.readmeImage && !/^https:\/\//.test(r.readmeImage)) {
          fail.push(`repo ${r.name} has a non-https readmeImage: ${r.readmeImage}`);
        }
      }
      for (const r of liveData.repos) {
        if (r.private) fail.push(`private repo ${r.name} must not be in the public snapshot`);
      }
      if (!stamped.prose || !stamped.prose.marqueeTop || !stamped.prose.facts) {
        fail.push('index.html DATA is missing the prose payload');
      }
      if (!stamped.activity || !stamped.activity.weeks || !stamped.activity.months) {
        fail.push('index.html DATA is missing the activity history');
      }
      if (stamped.generatedAt !== liveData.generatedAt) {
        fail.push('index.html DATA generatedAt does not match data.live.json');
      }
    }
  }
  ok.push('index.html stamped from the same data.live.json (account, repos, prose, activity)');
}

// ---------- report ----------

for (const line of ok) console.log('  ok   ' + line);
for (const line of fail) console.log('  FAIL ' + line);
console.log(fail.length ? `\n${fail.length} problem(s)` : '\nall checks passed');
process.exitCode = fail.length ? 1 : 0;