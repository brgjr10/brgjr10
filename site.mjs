// Stamps data.live.json into site.html to produce index.html — the
// standalone portfolio page.
//
//   node site.mjs
//
// Why stamp instead of fetching at runtime: one self-contained file,
// no CORS or 404 to worry about, works from file:// and from GitHub
// Pages, and the page can never render without its data. The cost is
// a few tens of KB — nothing next to the base64 README this same
// pipeline already ships.
//
// Facts come from data.live.json (written by sync.mjs). Prose comes
// from data.mjs, so the site and the SVG cards share one voice.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as D from './data.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const live = JSON.parse(readFileSync(join(ROOT, 'data.live.json'), 'utf8'));

const payload = {
  ...live,
  prose: {
    tagline: D.siteProse.tagline,
    blurb: D.siteProse.blurb,
    marqueeTop: D.marqueeTop,
    marqueeBottom: D.marqueeBottom,
    body: D.whoami.body,
    rig: D.rig,
    priorities: D.whoami.priorities,
    facts: D.whoami.facts,
    sign: D.siteProse.sign
  }
};

const PLACEHOLDER = '/*__PROFILE_DATA__*/null';
let template = readFileSync(join(ROOT, 'site.html'), 'utf8');
if (!template.includes(PLACEHOLDER)) {
  throw new Error('site.html is missing the ' + PLACEHOLDER + ' placeholder');
}
// A "</" inside a JSON string would close the script block early.
const json = JSON.stringify(payload).replace(/<\//g, '<\\/');
template = template.replace(PLACEHOLDER, json);

writeFileSync(join(ROOT, 'index.html'), template, 'utf8');
console.log(
  `wrote index.html — ${(template.length / 1024).toFixed(0)}KB, ` +
  `${live.repos.length} repos, ${live.totals.commits} commits of data inlined`
);
