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

const embed = (name) => {
  const svg = readFileSync(join(ROOT, `assets/${name}.svg`), 'utf8');
  return `![${altFor[name] ?? name}](data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')})`;
};

// Only the live-derived parts of the badge row; the rest is static positioning.
const badge = (label, href, { fill = 'ffffff', logo = '', logoColor = '000000' } = {}) => {
  const params = new URLSearchParams({ label, style: 'flat-square', color: fill });
  if (logo) {
    params.set('logo', logo);
    params.set('logoColor', logoColor);
  }
  return `[![${label}](https://img.shields.io/badge?${params})](${href})`;
};

const badges = [
  badge(D.profile.handle.toUpperCase(), D.profile.portfolio),
  badge('REPOS', `https://github.com/${D.profile.handle}?tab=repositories`, { logo: 'github' }),
  badge('FOLLOW', `https://github.com/${D.profile.handle}`, { logo: 'github' }),
  badge('COMMITS', `https://github.com/${D.profile.handle}/graphs/commit-activity`, {
    logo: 'git-commit'
  }),
  ...D.stack.rows.slice(0, 4).map((l) =>
    badge(l.label.toUpperCase(), `https://github.com/${D.profile.handle}?tab=repositories`, {
      fill: '161b22'
    })
  )
].join(' ');

const lines = [
  embed('header'),
  '',
  badges,
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