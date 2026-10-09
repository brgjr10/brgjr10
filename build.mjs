// Generates every SVG card used by the brgjr10 profile README.
//
//   node build.mjs
//
// Writes assets/<name>.svg (light) and assets/dark/<name>.svg (dark).
// Content lives in data.mjs, which reads data.live.json from sync.mjs — no
// number in an SVG is typed by hand.
//
// Design system follows the house dark theme: #0d1117 / #161b22 / #30363d /
// #58a6ff, with a matching light set for readers on GitHub's light mode.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as D from './data.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const MONO =
  "ui-monospace, SFMono-Regular, 'Cascadia Code', Menlo, Consolas, 'DejaVu Sans Mono', monospace";
const SANS = "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";

const THEMES = {
  light: {
    id: 'l',
    bg: '#ffffff',
    panel: '#f6f8fa',
    panel2: '#eef1f4',
    border: '#d0d7de',
    borderSoft: '#e6eaee',
    text: '#1f2328',
    muted: '#59636e',
    faint: '#8c959f',
    accent: '#0969da',
    green: '#1a7f37',
    amber: '#9a6700',
    red: '#cf222e',
    purple: '#8250df',
    pink: '#bf3989',
    cyan: '#1b7c83',
    orange: '#bc4c00',
    gridOpacity: 0.55,
    glow: 0.14
  },
  dark: {
    id: 'd',
    bg: '#0d1117',
    panel: '#161b22',
    panel2: '#1c2128',
    border: '#30363d',
    borderSoft: '#21262d',
    text: '#e6edf3',
    muted: '#8b949e',
    faint: '#6e7681',
    accent: '#58a6ff',
    green: '#3fb950',
    amber: '#d29922',
    red: '#f85149',
    purple: '#bc8cff',
    pink: '#f778ba',
    cyan: '#39c5cf',
    orange: '#ffa657',
    gridOpacity: 0.4,
    glow: 0.26
  }
};

const W = 1000;

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Monospace advance width is exact enough to lay text out deterministically.
const monoW = (s, size, ls = 0) => s.length * size * 0.6 + ls * Math.max(0, s.length - 1);
const r2 = (n) => Math.round(n * 100) / 100;

// Long values get an ellipsis rather than overflowing their column.
const clip = (s, max) => {
  const str = String(s ?? '');
  return str.length > max ? `${str.slice(0, Math.max(1, max - 1)).trimEnd()}…` : str;
};

const fmtBytes = (b) =>
  b >= 1048576 ? `${(b / 1048576).toFixed(1)}M` : b >= 1024 ? `${Math.round(b / 1024)}K` : `${b}`;

let t = THEMES.dark;
const P = (name) => t[name];

// ---------- primitives ----------

function T(x, y, str, o = {}) {
  const a = [`x="${r2(x)}"`, `y="${r2(y)}"`, `fill="${o.fill || P('text')}"`];
  a.push(`font-size="${o.size || 12}"`);
  if (o.weight) a.push(`font-weight="${o.weight}"`);
  if (o.family === 'sans') a.push(`font-family="${SANS}"`);
  if (o.anchor) a.push(`text-anchor="${o.anchor}"`);
  if (o.ls) a.push(`letter-spacing="${o.ls}"`);
  if (o.op != null) a.push(`opacity="${o.op}"`);
  return `<text ${a.join(' ')}>${esc(str)}</text>`;
}

function R(x, y, w, h, o = {}) {
  const a = [`x="${r2(x)}"`, `y="${r2(y)}"`, `width="${r2(w)}"`, `height="${r2(h)}"`];
  if (o.rx != null) a.push(`rx="${o.rx}"`);
  a.push(`fill="${o.fill || 'none'}"`);
  if (o.stroke) a.push(`stroke="${o.stroke}"`);
  if (o.op != null) a.push(`opacity="${o.op}"`);
  if (o.sw) a.push(`stroke-width="${o.sw}"`);
  if (o.dash) a.push(`stroke-dasharray="${o.dash}"`);
  return `<rect ${a.join(' ')}/>`;
}

const L = (x1, y1, x2, y2, o = {}) =>
  `<line x1="${r2(x1)}" y1="${r2(y1)}" x2="${r2(x2)}" y2="${r2(y2)}" stroke="${o.stroke || P('border')}"${
    o.sw ? ` stroke-width="${o.sw}"` : ''
  }${o.op != null ? ` opacity="${o.op}"` : ''}${o.dash ? ` stroke-dasharray="${o.dash}"` : ''}/>`;

const CIR = (cx, cy, r, o = {}) =>
  `<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(r)}" fill="${o.fill || 'none'}"${
    o.stroke ? ` stroke="${o.stroke}"` : ''
  }${o.sw ? ` stroke-width="${o.sw}"` : ''}${o.op != null ? ` opacity="${o.op}"` : ''}${
    o.cls ? ` class="${o.cls}"` : ''
  }/>`;

function chipRow(items, o) {
  const { x, y, maxW, size = 10.5, h = 20, gap = 6, vgap = 6 } = o;
  const fill = o.fill || P('panel2');
  const stroke = o.stroke || P('border');
  const color = o.color || P('muted');
  let cx = x;
  let cy = y;
  let out = '';
  let rows = 1;
  for (const label of items) {
    const w = Math.ceil(monoW(label, size)) + 18;
    if (cx > x && cx + w > x + maxW) {
      cx = x;
      cy += h + vgap;
      rows += 1;
    }
    out += R(cx, cy, w, h, { rx: 5, fill, stroke, op: 0.85 });
    out += T(cx + 9, cy + h / 2 + 3.7, label, { size, fill: color });
    cx += w + gap;
  }
  return { markup: out, height: (rows - 1) * (h + vgap) + h, rows };
}

// Greedy wrap on spaces, then on " · " for short field values.
function wrapMono(str, maxChars) {
  const words = String(str).split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (!cur.length) cur = w;
    else if ((cur + ' ' + w).length <= maxChars) cur += ' ' + w;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur.length) lines.push(cur);
  return lines;
}

function doc(w, h, body, css = '') {
  const p = t.id;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" font-family="${MONO}" font-size="12">
<defs>
<pattern id="${p}grid" width="26" height="26" patternUnits="userSpaceOnUse"><path d="M26 0H0v26" fill="none" stroke="${P('border')}" stroke-width="1"/></pattern>
<radialGradient id="${p}glow" cx="50%" cy="0%" r="62%"><stop offset="0" stop-color="${P('accent')}" stop-opacity="${P('glow')}"/><stop offset="1" stop-color="${P('accent')}" stop-opacity="0"/></radialGradient>
<linearGradient id="${p}rule" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${P('accent')}"/><stop offset="1" stop-color="${P('accent')}" stop-opacity="0.12"/></linearGradient>
<linearGradient id="${p}fade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${P('bg')}" stop-opacity="0"/><stop offset="0.5" stop-color="${P('bg')}"/><stop offset="1" stop-color="${P('bg')}" stop-opacity="0"/></linearGradient>
</defs>
<style>
text { white-space: pre; }
.blink { animation: ${p}blink 2.4s ease-in-out infinite; }
@keyframes ${p}blink { 0%,100% { opacity: 1 } 50% { opacity: 0.25 } }
${css}
</style>
<rect width="${w}" height="${h}" fill="${P('bg')}"/>
${body}
</svg>`;
}

const backdrop = (w, h, grid = false) =>
  (grid ? `<rect width="${w}" height="${h}" fill="url(#${t.id}grid)" opacity="${P('gridOpacity')}"/>` : '') +
  `<rect width="${w}" height="${h}" fill="url(#${t.id}fade)" opacity="0"/>`;

const cardHead = (kicker, heading, right) => {
  let b = T(40, 54, kicker, { size: 10.5, fill: P('accent'), ls: 2 });
  b += T(40, 82, heading, { size: 17, weight: 600, family: 'sans' });
  if (right) b += T(960, 54, right, { size: 10.5, fill: P('faint'), anchor: 'end' });
  return b;
};

// ---------- cards ----------

function header() {
  const h = 448;
  let b = `<rect width="${W}" height="${h}" fill="url(#${t.id}grid)" opacity="${P('gridOpacity')}"/>`;
  b += `<ellipse cx="500" cy="10" rx="640" ry="300" fill="url(#${t.id}glow)"/>`;

  // corner brackets
  const br = `stroke="${P('accent')}" stroke-width="1.5" fill="none" opacity="0.7"`;
  b += `<path d="M28 52V28h24" ${br}/><path d="M948 28h24v24" ${br}/>`;
  b += `<path d="M28 396v24h24" ${br}/><path d="M948 420h24v-24" ${br}/>`;

  b += T(40, 74, `~/${D.profile.handle}`, { size: 12.5, fill: P('faint') });

  // Live push recency instead of a hand-asserted "SYSTEM ONLINE".
  const pushed = D.snapshot.lastPushRel.toUpperCase();
  const hours = D.snapshot.lastPush ? (Date.now() - Date.parse(D.snapshot.lastPush)) / 36e5 : 1e9;
  const tone = hours < 24 ? 'green' : hours < 168 ? 'amber' : 'faint';
  b += T(960, 74, `PUSHED ${pushed}`, { size: 11, fill: P(tone), anchor: 'end', ls: 1.2 });
  b += CIR(960 - monoW(`PUSHED ${pushed}`, 11, 1.2) - 14, 70, 3.5, { fill: P(tone) });
  b += CIR(960 - monoW(`PUSHED ${pushed}`, 11, 1.2) - 14, 70, 8, {
    stroke: P(tone),
    op: 0.4,
    sw: 1,
    cls: 'blink'
  });

  b += T(40, 172, D.profile.name, { size: 62, weight: 700, family: 'sans', ls: 1 });
  b += R(40, 196, 54, 4, { fill: P('accent'), rx: 2 });
  b += T(108, 201, D.siteProse.tagline, {
    size: 11.5,
    fill: P('accent'),
    ls: 1.6
  });

  b += T(40, 252, D.profile.title, { size: 18, fill: P('text'), ls: 0.4 });
  b += T(40, 292, D.siteProse.blurb[0], {
    size: 13,
    fill: P('muted')
  });
  b += T(40, 314, D.siteProse.blurb[1], {
    size: 13,
    fill: P('muted')
  });

  let cx = 40;
  for (const label of D.headerChips) {
    const w = Math.ceil(monoW(label, 10.5)) + 20;
    b += R(cx, 336, w, 26, { rx: 13, fill: P('panel'), stroke: P('border') });
    b += T(cx + 10, 353, label, { size: 10.5, fill: P('muted'), ls: 0.6 });
    cx += w + 10;
  }

  b += L(40, 382, 960, 382, { op: 0.7 });

  // Two marquee rows, stacked. Every copy translates exactly one text-width and
  // the copies are spaced one width apart, so the strip tiles without a gap and
  // without two runs of text landing on the same pixels. The row count covers the
  // viewport plus one full copy on each end, which is what makes the loop seamless
  // in both directions.
  const strip = (text, y, dur, dir, opacity) => {
    const w = monoW(text, 11, 2);
    const copies = Math.ceil(W / w) + 2;
    let g = '';
    for (let i = 0; i < copies; i += 1) {
      const from = (i - 1) * w;
      const to = from - dir * w;
      g += `<g><animateTransform attributeName="transform" type="translate" from="${r2(from)} 0" to="${r2(to)} 0" dur="${dur}s" repeatCount="indefinite" calcMode="linear"/>${T(0, y, text, {
        size: 11,
        fill: P('faint'),
        ls: 2
      })}</g>`;
    }
    return `<g opacity="${opacity}">${g}</g>`;
  };
  b += strip(D.marqueeTop, 406, 52, 1, 0.72);
  b += strip(D.marqueeBottom, 432, 64, -1, 0.5);

  return doc(W, h, b);
}

function divider(sec) {
  const h = 76;
  let b = '';
  b += R(40, 18, 4, 40, { fill: P('accent'), rx: 2 });
  b += T(62, 50, sec.n, { size: 20, weight: 700, fill: P('accent'), family: 'sans' });
  const label = sec.label;
  b += T(104, 50, label, { size: 15, fill: P('text'), ls: 4.5 });
  const ruleFrom = 104 + monoW(label, 15, 4.5) + 22;
  b += `<rect x="${r2(ruleFrom)}" y="37" width="${r2(960 - ruleFrom)}" height="2" fill="url(#${t.id}rule)"/>`;
  b += T(960, 50, sec.title, { size: 11, fill: P('faint'), anchor: 'end', ls: 1 });
  return doc(W, h, b);
}

function whoami() {
  const d = D.whoami;
  const h = 500;
  let b = backdrop(W, h);
  b += R(40, 40, 620, 390, { rx: 14, fill: P('panel'), stroke: P('border') });
  b += R(680, 40, 280, 390, { rx: 14, fill: P('panel'), stroke: P('border') });

  b += T(66, 78, d.kicker, { size: 10.5, fill: P('accent'), ls: 2 });
  b += T(66, 112, d.heading, { size: 21, weight: 600, family: 'sans', ls: 0.3 });
  b += L(66, 130, 640, 130, { op: 0.6 });

  let y = 158;
  for (const para of d.body) {
    for (const line of para) {
      b += T(66, y, line, { size: 12.5, fill: P('text'), op: 0.86 });
      y += 21;
    }
    y += 16;
  }
  b += T(66, y + 4, D.rig[0], {
    size: 12.5,
    fill: P('text'),
    op: 0.86
  });
  b += T(66, y + 25, D.rig[1], {
    size: 12.5,
    fill: P('text'),
    op: 0.86
  });

  // right column: label/value rows, wrapped
  b += T(702, 78, 'ACCOUNT', { size: 10.5, fill: P('accent'), ls: 2 });
  b += L(702, 92, 938, 92, { op: 0.6 });
  let ry = 106;
  for (const [label, value] of d.facts) {
    b += T(702, ry, label, { size: 9.5, fill: P('faint'), ls: 1.6 });
    const lines = wrapMono(value, 35);
    lines.forEach((line, i) => {
      b += T(702, ry + 18 + i * 15, line, { size: 11, fill: P('text') });
    });
    ry += 14 + lines.length * 15;
  }

  // priorities strip
  b += R(40, 446, 920, 38, { rx: 10, fill: P('panel2'), stroke: P('border') });
  b += T(62, 470, 'PRIORITIES', { size: 10, fill: P('faint'), ls: 2 });
  let px = 168;
  d.priorities.forEach((p, i) => {
    if (i) {
      b += T(px, 470, '→', { size: 12, fill: P('accent') });
      px += monoW('→', 12) + 10;
    }
    b += T(px, 470, p, { size: 11, fill: P('accent'), ls: 1.2 });
    px += monoW(p, 11, 1.2) + 10;
  });

  return doc(W, h, b);
}

// Dense one-row-per-repo table. Scales to any repo count and stays scannable,
// which matters more here than the card grid the old hardcoded list used.
function repos() {
  const d = D.projects;
  const rowH = 26;
  const top = 104;
  const h = top + d.rows.length * rowH + 14;

  let b = backdrop(W, h);
  b += cardHead(d.kicker, d.heading, `${d.count} repos · ${d.starTotal} stars · newest push ${D.snapshot.lastPushRel}`);

  d.rows.forEach((r, i) => {
    const y = top + i * rowH;
    const base = y + 17;
    if (i % 2 === 1) b += R(40, y, 920, rowH, { fill: P('panel'), op: 0.45 });
    b += T(40, base, String(r.rank).padStart(2, '0'), { size: 9, fill: P('faint') });
    b += T(68, base, clip(r.name, 30), { size: 11.5, fill: P('accent') });
    b += T(300, base, clip(r.subtitle, 64), { size: 10.5, fill: P('muted') });
    b += T(836, base, clip(r.lang, 18), { size: 10, fill: P(r.color), anchor: 'end' });
    b += T(
      880,
      base,
      r.stars ? `★${r.stars}` : '·',
      { size: 10, fill: r.stars ? P('amber') : P('faint'), anchor: 'end' }
    );
    b += T(960, base, r.pushed, { size: 9.5, fill: P('faint'), anchor: 'end' });
    if (i < d.rows.length - 1) b += L(40, y + rowH, 960, y + rowH, { stroke: P('borderSoft'), op: 0.6 });
  });

  return doc(W, h, b);
}

function telemetry() {
  const d = D.telemetry;
  const tileW = 218;
  const tileH = 96;
  const tileY = 90;
  const gap = 16;
  const h = 342;

  let b = backdrop(W, h);
  b += cardHead(d.kicker, d.heading, `github api · synced ${D.snapshot.taken}`);

  d.tiles.forEach((tile, i) => {
    const x = 40 + i * (tileW + gap);
    b += R(x, tileY, tileW, tileH, { rx: 12, fill: P('panel'), stroke: P('border') });
    b += T(x + 16, tileY + 24, tile.label, { size: 9.5, fill: P('muted'), ls: 1.8 });
    b += T(x + 16, tileY + 62, tile.value, { size: 30, weight: 700, fill: P('accent'), family: 'sans' });
    b += T(x + 16, tileY + 80, clip(tile.note, 32), { size: 9, fill: P('faint') });
    const bw = Math.max(6, (tileW - 32) * (tile.pct / 100));
    b += R(x + 16, tileY + 88, tileW - 32, 4, { rx: 2, fill: P('panel2') });
    b += `<rect x="${x + 16}" y="${tileY + 88}" width="${r2(bw)}" height="4" rx="2" fill="${P('accent')}">
<animate attributeName="width" from="0" to="${r2(bw)}" dur="1.1s" begin="${0.15 * i}s" fill="freeze" calcMode="spline" keySplines="0.2 0.8 0.2 1" keyTimes="0;1"/></rect>`;
  });

  // Activity pulse — the real per-week commit histogram. Bar height is the
  // commit count for that week; a week with no commits draws a flat stub so the
  // gap stays visible instead of being hidden by a decorative animation.
  b += T(40, 218, 'COMMITS PER WEEK', { size: 9.5, fill: P('faint'), ls: 2 });
  b += T(960, 218, `${d.totalWeeks} commits · ${d.activeWeeks} of ${d.weeks.length} weeks active`, {
    size: 9.5,
    fill: P('faint'),
    anchor: 'end'
  });
  b += L(40, 230, 960, 230, { stroke: P('borderSoft') });

  const base = 288;
  const maxBar = 40;
  const areaW = 920;
  const n = d.weeks.length;
  const barW = Math.max(8, Math.floor((areaW - (n - 1) * 21) / n));
  const step = barW + 21;
  const spanW = step * (n - 1) + barW;

  d.weeks.forEach((w, i) => {
    const x = 40 + i * step;
    const isLast = i === n - 1;
    const height = w.count ? Math.max(3, Math.round((w.count / d.weekMax) * maxBar)) : 3;
    const fill = w.count ? (isLast ? P('green') : P('accent')) : P('panel2');
    b += R(x, base - height, barW, height, { rx: 3, fill, op: w.count ? 0.9 : 1 });
    if (isLast && w.count) b += CIR(x + barW / 2, base - height - 8, 3, { fill: P('green'), cls: 'blink' });
    if (w.count) {
      b += T(x + barW / 2, base - height - 13, String(w.count), {
        size: 9,
        fill: P(isLast ? 'green' : 'faint'),
        anchor: 'middle'
      });
    }
    if (i % 2 === 0 || isLast) {
      b += T(x + barW / 2, base + 14, w.end.slice(5), {
        size: 8.5,
        fill: P(isLast ? 'green' : 'faint'),
        anchor: 'middle'
      });
    }
  });

  b += L(40, base + 0.5, 40 + spanW, base + 0.5, { stroke: P('border'), op: 0.7 });

  return doc(W, h, b);
}

// Commit history by month straight from search/commits. The previous version of
// this card was a hand-written career narrative with fixed dates, which is
// exactly the kind of claim the API cannot keep honest.
function history() {
  const d = D.timeline;
  const top = 120;
  const baseline = 268;
  const chartW = 600;
  const n = d.months.length;
  const h = 336;

  let b = backdrop(W, h);
  b += cardHead(d.kicker, d.heading, `${d.months.reduce((s, m) => s + m.count, 0)} commits · ${d.months.length} months`);

  const gap = 4;
  const barW = Math.max(6, Math.floor((chartW - (n - 1) * gap) / n));
  const step = barW + gap;
  const spanW = step * (n - 1) + barW;

  d.months.forEach((m, i) => {
    const x = 40 + i * step;
    const height = Math.round((m.count / d.max) * 108);
    if (m.count) {
      b += `<rect x="${r2(x)}" y="${r2(baseline - height)}" width="${r2(barW)}" height="${height}" rx="3" fill="${P('accent')}" opacity="0.85">
<animate attributeName="y" from="${baseline}" to="${r2(baseline - height)}" dur="0.7s" begin="${r2(0.02 * i)}s" fill="freeze" calcMode="spline" keySplines="0.2 0.8 0.2 1" keyTimes="0;1"/>
<animate attributeName="height" from="0" to="${height}" dur="0.7s" begin="${r2(0.02 * i)}s" fill="freeze" calcMode="spline" keySplines="0.2 0.8 0.2 1" keyTimes="0;1"/></rect>`;
    } else {
      b += R(x, baseline - 3, barW, 3, { rx: 2, fill: P('panel2') });
    }
    const [yyyy, mm] = m.month.split('-');
    b += T(x + barW / 2, baseline + 14, `${mm}/${yyyy.slice(2)}`, {
      size: 8,
      fill: P(m.count ? 'muted' : 'faint'),
      anchor: 'middle'
    });
  });
  b += L(40, baseline + 0.5, 40 + spanW, baseline + 0.5, { stroke: P('border'), op: 0.7 });
  b += T(40, baseline + 30, `month · peak ${D.snapshot.peakMonth} = ${D.snapshot.peakMonthCommits} commits`, {
    size: 9,
    fill: P('faint')
  });

  // milestones straight off the account
  b += R(700, 108, 260, 188, { rx: 12, fill: P('panel'), stroke: P('border') });
  b += T(722, 134, 'MILESTONES', { size: 10, fill: P('accent'), ls: 2 });
  b += L(722, 146, 938, 146, { stroke: P('borderSoft') });
  d.milestones.forEach(([label, value], i) => {
    const y = 172 + i * 32;
    b += T(722, y, label, { size: 9, fill: P('faint'), ls: 1.4 });
    b += T(722, y + 14, clip(value, 30), { size: 11, fill: P('text') });
  });

  return doc(W, h, b);
}

function stack() {
  const d = D.stack;
  const rowH = 28;
  const top = 112;
  const barX = 250;
  const barW = 520;
  const h = top + d.rows.length * rowH + 26;

  let b = backdrop(W, h);
  b += cardHead(d.kicker, d.heading, `${d.totalRepos} repos aggregated`);

  b += T(40, 96, 'LANGUAGE', { size: 9, fill: P('faint'), ls: 1.6 });
  b += T(barX, 96, 'SHARE OF BYTES', { size: 9, fill: P('faint'), ls: 1.6 });
  b += T(915, 96, 'SHARE', { size: 9, fill: P('faint'), ls: 1.6, anchor: 'end' });
  b += T(960, 96, 'SIZE', { size: 9, fill: P('faint'), ls: 1.6, anchor: 'end' });

  d.rows.forEach((row, i) => {
    const y = top + i * rowH;
    const base = y + 15;
    b += T(40, base, clip(row.label, 30), { size: 11.5, fill: P('text') });
    b += R(barX, base - 8, barW, 12, { rx: 6, fill: P('panel2') });
    if (row.pct > 0) {
      const w = Math.max(4, (barW * row.pct) / 100);
      b += `<rect x="${r2(barX)}" y="${r2(base - 8)}" width="${r2(w)}" height="12" rx="6" fill="${P(row.color)}" opacity="0.9">
<animate attributeName="width" from="0" to="${r2(w)}" dur="0.8s" begin="${r2(0.04 * i)}s" fill="freeze" calcMode="spline" keySplines="0.2 0.8 0.2 1" keyTimes="0;1"/></rect>`;
    }
    b += T(915, base, `${row.pct}%`, { size: 10.5, fill: P(row.color), anchor: 'end' });
    b += T(960, base, `${fmtBytes(row.bytes)}B`, { size: 9.5, fill: P('faint'), anchor: 'end' });
  });

  return doc(W, h, b);
}

function footer() {
  const d = D.footer;
  const h = 232;
  let b = backdrop(W, h);
  b += T(40, 54, 'LAST SYNC', { size: 10.5, fill: P('accent'), ls: 2 });
  b += L(40, 66, 600, 66, { op: 0.6 });

  d.rows.forEach(([label, value], i) => {
    const y = 96 + i * 26;
    b += CIR(46, y - 4, 3, { fill: P('accent') });
    b += T(60, y, label, { size: 9.5, fill: P('accent'), ls: 1.8 });
    b += T(208, y, clip(value, 56), { size: 11.5, fill: P('text'), op: 0.9 });
  });

  b += R(640, 78, 320, 108, { rx: 12, fill: P('panel'), stroke: P('border') });
  b += T(660, 104, 'HANDLE', { size: 9.5, fill: P('faint'), ls: 2 });
  b += T(660, 130, `@${D.profile.handle}`, { size: 16, fill: P('accent'), weight: 600 });
  b += T(660, 152, `${D.profile.name} · ${D.profile.location}`, { size: 10.5, fill: P('muted') });
  b += T(660, 172, clip(D.profile.portfolio.replace('https://', ''), 44), { size: 10.5, fill: P('muted') });

  b += L(40, 202, 960, 202, { op: 0.7 });
  b += T(500, 222, `© ${new Date(D.snapshot.generatedAt).getUTCFullYear()} ${D.profile.handle} · ${d.sign}`, {
    size: 10,
    fill: P('faint'),
    anchor: 'middle'
  });

  return doc(W, h, b);
}

// ---------- build ----------

const CARDS = {
  header,
  whoami,
  repos,
  telemetry,
  stack
};

mkdirSync(join(ROOT, 'assets', 'dark'), { recursive: true });

let count = 0;
for (const themeName of ['light', 'dark']) {
  t = THEMES[themeName];
  const dir = themeName === 'dark' ? join(ROOT, 'assets', 'dark') : join(ROOT, 'assets');
  for (const [name, build] of Object.entries(CARDS)) {
    writeFileSync(join(dir, `${name}.svg`), build(), 'utf8');
    count += 1;
  }
  for (const sec of D.sections) {
    writeFileSync(join(dir, `s${sec.n}.svg`), divider(sec), 'utf8');
    count += 1;
  }
}

console.log(
  `generated ${count} svg files (${Object.keys(CARDS).length + D.sections.length} cards x 2 themes)`
);