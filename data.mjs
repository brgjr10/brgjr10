// Content for the brgjr10 profile README cards.
//
// House rule: every fact on a card comes from data.live.json, which sync.mjs
// writes straight from the GitHub REST API. Nothing here is hand-counted, so
// the cards cannot drift from the real account. If a number or status is not
// something the API can answer, it does not go on a card.
//
//   node sync.mjs && node build.mjs && node readme.mjs && node verify.mjs
//
// data.mjs only owns the parts GitHub cannot know: the written voice, the
// section list, and layout constants.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const live = JSON.parse(readFileSync(join(ROOT, 'data.live.json'), 'utf8'));

// ---------- derived helpers ----------

const NOW = new Date(live.generatedAt);

const relTime = (iso) => {
  if (!iso) return 'never';
  const then = new Date(iso);
  const mins = Math.max(0, Math.round((NOW - then) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 31) return `${days}d ago`;
  const months = Math.round(days / 30.44);
  if (months < 24) return `${months}mo ago`;
  return `${Math.round(months / 12)}y ago`;
};

const monthLabel = (key) => {
  const [y, m] = key.split('-');
  return `${['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][+m - 1]} ${y.slice(2)}`;
};

const yearOf = (iso) => String(new Date(iso).getUTCFullYear());
const sinceDate = new Date(live.profile.createdAt);
const since = `${['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][sinceDate.getUTCMonth()]} ${sinceDate.getUTCFullYear()}`;

const topLang = live.languages[0]?.name || '—';
const codeLang = live.languages.filter((l) => l.name !== 'HTML' && l.name !== 'CSS')[0]?.name || topLang;

// ---------- live snapshot ----------

export const profile = {
  handle: live.profile.login,
  name: live.profile.name,
  title: live.profile.bio || 'Full-Stack Developer',
  location: live.profile.location,
  portfolio: live.profile.blog || `https://${live.handle}.github.io/`
};

export const snapshot = {
  taken: NOW.toISOString().slice(0, 10),
  generatedAt: live.generatedAt,
  publicRepos: live.totals.publicRepos,
  commits: live.totals.commits,
  stars: live.totals.stars,
  languages: live.totals.languages,
  followers: live.profile.followers,
  lastPush: live.totals.lastPush,
  lastPushRel: relTime(live.totals.lastPush),
  activeThisMonth: live.totals.activeThisMonth,
  peakMonth: live.totals.peakMonth,
  peakMonthCommits: live.totals.peakMonthCommits,
  memberSince: since,
  memberSinceRel: relTime(live.profile.createdAt)
};

// ---------- sections ----------

export const sections = [
  { n: '01', label: 'IDENTITY', title: 'whoami' },
  { n: '02', label: 'PROJECTS', title: 'repos' },
  { n: '03', label: 'TELEMETRY', title: 'activity' },
  { n: '04', label: 'STACK', title: 'languages' }
];

// ---------- header ----------

// Every chip is an API answer: location and account age from /users, the repo
// count from the profile, the language mix from the aggregated /languages calls.
export const headerChips = [
  live.profile.location.toUpperCase(),
  `${live.totals.publicRepos} PUBLIC REPOS`,
  `TOP LANGUAGE: ${topLang.toUpperCase()}`,
  `GITHUB SINCE ${since.toUpperCase()}`
];

export const marqueeTop = live.languages
  .map((l) => l.name.toUpperCase())
  .concat(['DOCKER', 'PROMETHEUS', 'GRAFANA', 'PI-HOLE', 'QDRANT', 'REDIS'])
  .join(' · ') + ' · ';

export const marqueeBottom =
  `${live.totals.commits} COMMITS · ${live.totals.publicRepos} REPOS · ${live.totals.stars} STARS · ${live.languages.length} LANGUAGES · ${live.totals.activeThisMonth} COMMITS THIS MONTH · LAST PUSH ${snapshot.lastPushRel.toUpperCase()} · `;

// ---------- 01 identity ----------

// The prose is the one thing GitHub cannot supply, so it stays hand-written.
// The fact column is entirely API-derived — the old hand-typed STATUS row and
// the homelab inventory are gone because nothing can keep them honest.
const BODY = [
  [
    'I build tools that make operations less manual: browser automation for',
    'enterprise systems, Electron desktop apps, React dashboards, and the',
    'self-hosted services that hold all of it together.'
  ],
  [
    'Most projects start as a spreadsheet somebody complains about and end as a',
    'scheduled script, a live monitor, or an MCP server an agent can call.',
    'Reliability first — a dashboard nobody trusts is worse than no dashboard.'
  ]
];

// The two closing lines under the prose.
const RIG = [
  'Home lab is the test rig: ZimaOS, a Raspberry Pi 5, and a PC that',
  'never sleeps. If it does not survive a reboot, it does not ship.'
];

export const whoami = {
  kicker: '01 / whoami',
  heading: 'WHAT I ACTUALLY BUILD',
  body: BODY,
  facts: [
    ['ROLE', live.profile.bio || 'Full-stack developer'],
    ['LOCATION', live.profile.location],
    ['MEMBER SINCE', `@${live.handle} · ${since}`],
    ['PUBLIC REPOS', `${live.totals.publicRepos}`],
    ['COMMITS', `${live.totals.commits} on the default branch`],
    ['TOP LANGUAGES', live.languages.slice(0, 3).map((l) => l.name).join(' · ')],
    ['FOLLOWERS', `${live.profile.followers}`],
    ['LAST PUSH', `${snapshot.lastPushRel} · ${live.totals.lastPush ? live.totals.lastPush.slice(0, 10) : '—'}`]
  ],
  priorities: ['RELIABILITY', 'READABILITY', 'PERFORMANCE', 'EXPERIENCE']
};

// ---------- 02 projects ----------

// One row per public repo, straight from /user/repos. Descriptions come from
// the repo's own `description` field; the fallback chain is topics, then
// language, then a dash. Nothing is curated by hand, so a new repo shows up
// here on the next commit with no edit to this file.
const LANG_TINT = {
  JavaScript: 'amber',
  TypeScript: 'accent',
  Python: 'green',
  HTML: 'orange',
  CSS: 'pink',
  PowerShell: 'purple',
  Rust: 'red',
  Dockerfile: 'cyan',
  Shell: 'green'
};

// Fall back to topics, but never to the language — the language already has its
// own column, and repeating it reads like a description that says nothing.
const describe = (r) => r.description || r.topics.join(' · ') || '';

export const projects = {
  kicker: '02 / projects',
  heading: 'EVERY PUBLIC REPO',
  count: live.repos.length,
  starTotal: live.totals.stars,
  starRepos: live.totals.starRepos,
  rows: live.repos.map((r, i) => ({
    name: r.name,
    subtitle: describe(r),
    lang: r.language || '—',
    color: LANG_TINT[r.language] || 'faint',
    stars: r.stars,
    pushed: relTime(r.pushedAt),
    rank: i + 1
  }))
};

// ---------- 03 telemetry ----------

// Tiles are all API counters. The activity pulse is the real per-week commit
// histogram from search/commits — the old version was a decorative equalizer
// and the service "up/down" rows underneath it were hand-typed, so both are
// gone rather than faked.
export const telemetry = {
  kicker: '03 / telemetry',
  heading: 'GITHUB SNAPSHOT',
  tiles: [
    {
      label: 'PUBLIC REPOS',
      value: String(live.totals.publicRepos),
      note: `owned repos ${live.totals.ownedRepos}`,
      pct: Math.min(100, live.totals.publicRepos * 3)
    },
    {
      label: 'COMMITS',
      value: String(live.totals.commits),
      note: `author:@${live.handle}`,
      pct: Math.min(100, Math.round((live.totals.commits / 1000) * 100))
    },
    {
      label: 'STARS EARNED',
      value: String(live.totals.stars),
      note: live.totals.starRepos.length
        ? `${live.totals.starRepos[0]}${live.totals.starRepos.length > 1 ? ` +${live.totals.starRepos.length - 1} more` : ''}`
        : 'none yet',
      pct: Math.min(100, live.totals.stars * 20)
    },
    {
      label: 'LANGUAGES',
      value: String(live.totals.languages),
      note: `peak ${live.totals.peakMonth} = ${live.totals.peakMonthCommits} commits`,
      pct: Math.min(100, live.totals.languages * 8)
    }
  ],
  weeks: live.activity.weeks,
  weekMax: Math.max(1, ...live.activity.weeks.map((w) => w.count)),
  totalWeeks: live.totals.commits,
  activeWeeks: live.activity.weeks.filter((w) => w.count > 0).length
};

// ---------- 04 the route ----------

// The old card was a hand-written career narrative — four invented phases with
// fixed dates, impossible to keep true. It is now the commit history the search
// API actually returns, bucketed by month from account creation, with the
// account-age milestones GitHub can verify laid over it.
export const timeline = {
  kicker: '04 / the route',
  heading: 'COMMIT HISTORY',
  months: live.activity.months,
  max: Math.max(1, ...live.activity.months.map((m) => m.count)),
  milestones: [
    ['ACCOUNT CREATED', since],
    ['FIRST COMMIT MONTH', live.activity.months.find((m) => m.count > 0)?.month || '—'],
    ['BUSIEST MONTH', `${monthLabel(live.totals.peakMonth)} · ${live.totals.peakMonthCommits}`],
    ['THIS MONTH', `${live.totals.activeThisMonth} commits`]
  ]
};

// ---------- 05 stack ----------

// Language mix straight from the aggregated /languages endpoint. Byte share is
// shown as fetched, including HTML's large share — that is what the repos
// actually contain, and hiding it would make the card a lie.
export const stack = {
  kicker: '04 / stack',
  heading: 'LANGUAGES BY SIZE ACROSS ALL REPOS',
  totalRepos: live.repos.length,
  rows: live.languages.map((l) => ({
    label: l.name,
    pct: l.pct,
    bytes: l.bytes,
    color: LANG_TINT[l.name] || 'accent'
  }))
};

// ---------- footer ----------

// Was a hand-typed "currently building / running / learning" block. Replaced
// with facts the API can restate tomorrow and still be right.
export const footer = {
  rows: [
    ['LAST PUSH', `${snapshot.lastPushRel} · ${live.totals.lastPush ? live.totals.lastPush.slice(0, 10) : '—'}`],
    ['COMMITS THIS MONTH', `${live.totals.activeThisMonth} of ${live.totals.commits} total`],
    ['BUSIEST MONTH', `${monthLabel(live.totals.peakMonth)} · ${live.totals.peakMonthCommits} commits`],
    ['GENERATED', `${snapshot.taken} from the GitHub API`]
  ],
  sign: 'every card here is a generated SVG · regenerated on every commit'
};

// ---------- the prose / data boundary ----------

// Every hand-written string that reaches a card. verify.mjs exempts exactly
// these from the "no untracked numbers" rule, so the writing stays editable
// while any number typed outside this list still fails the build. Adding a line
// of prose means adding it here — that is the entire contract.
//
// Digits are allowed to appear in these strings ("Raspberry Pi 5") because they
// are part of the writing, not a count of something GitHub reports.
export const PROSE = [
  'OPERATIONS AUTOMATION · SELF-HOSTED · LOCAL AI',
  'Shipping browser automation, Electron apps, live dashboards, and the Docker',
  'services that keep them running. Everything self-hosted where it can be.',
  ...BODY.flat(),
  ...RIG,
  footer.sign
];
