// Writes README.md with every generated card inlined as a base64 data URI.
//
//   node readme.mjs
//
// Why inline instead of assets/foo.svg: GitHub sanitises SVGs served from the
// repo, which strips the <style> block the animation classes live in. A data URI
// is passed through untouched, so the cards animate. The cost is a ~120KB
// README, well under GitHub's render cutoff, and this script is what keeps it
// from rotting — the workflow reruns it on every push.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as D from './data.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));

const CARDS = ['header', 'whoami', 'repos', 'telemetry', 'stack'];
const SECTIONS = ['s01', 's02', 's03', 's04'];

// Section kickers double as the divider alt text.
const altFor = {
  header: `${D.profile.name} — ${D.profile.title}`,
  s01: '01 — identity',
  whoami: 'what I build',
  s02: '02 — projects',
  repos: `${D.projects.count} public repos`,
  s03: '03 — telemetry',
  telemetry: 'github telemetry',
  s04: '04 — stack',
  stack: 'languages'
};

const RAW_BASE = 'https://raw.githubusercontent.com/brgjr10/brgjr10/main/assets';

// The interactive portfolio lives one level above the README.
// Project Pages URL for this repo; override with PROFILE_SITE_URL
// if the page is hosted somewhere else.
const SITE_URL = process.env.PROFILE_SITE_URL || 'https://brgjr10.github.io/brgjr10/';

const embed = (name) => {
  const light = `${RAW_BASE}/${name}.svg`;
  const dark = `${RAW_BASE}/dark/${name}.svg`;
  const alt = altFor[name] ?? name;
  return `<picture><source srcset="${dark}" media="(prefers-color-scheme: dark)"><img src="${light}" alt="${alt}"></picture>`;
};



const lines = [
  `[**▸ interactive portfolio — every repo, searchable and sortable**](${SITE_URL})`,
  '',
  embed('header'),
  '',
  embed('s01'),
  embed('whoami'),
  '',
  embed('s02'),
  embed('repos'),
  '',
  embed('s03'),
  embed('telemetry'),
  '',
  embed('s04'),
  embed('stack'),
  ''
];

const out = lines.join('\n');
writeFileSync(join(ROOT, 'README.md'), out, 'utf8');
console.log(
  `wrote README.md — ${CARDS.length + SECTIONS.length} cards, ${(out.length / 1024).toFixed(0)}KB`
);