// Pulls every number on the profile README from the GitHub REST API and writes
// data.live.json. build.mjs reads only that file for anything factual, so the
// README can never drift from the real account again.
//
//   node sync.mjs
//
// Auth: set GITHUB_TOKEN (the workflow passes its own token) or GH_TOKEN.
// Unauthenticated works too, but drops to 60 req/hr — enough for the calls
// below only if the token is missing and the repo count stays small.
//
// Everything written here is something GitHub can answer. If a field is not in
// this file, it does not belong on a card — that is the rule the whole README
// is now built on.

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, 'data.live.json');
const HANDLE = process.env.PROFILE_HANDLE || 'brgjr10';

// Token choice matters more than it looks. The workflow's built-in GITHUB_TOKEN
// is an installation token scoped to the profile repo alone, so
// search/commits can only see commits in that repo and the commit total comes
// back far too low. PROFILE_TOKEN should be a classic PAT with public_repo and
// read:user, which sees the whole account.
const TOKEN = process.env.PROFILE_TOKEN || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const TOKEN_KIND = !TOKEN ? 'none' : TOKEN.startsWith('ghs_') ? 'installation' : TOKEN.startsWith('ghp_') ? 'pat' : 'oauth';
const SCOPED_TO_THIS_REPO = TOKEN_KIND === 'installation';
const API = process.env.GITHUB_API_URL || 'https://api.github.com';
const WEEKS = 16;

// ---------- transport ----------

const headers = {
  accept: 'application/vnd.github+json',
  'x-github-api-version': '2022-11-28',
  'user-agent': 'brgjr10-profile-readme'
};
if (TOKEN) headers.authorization = `Bearer ${TOKEN}`;

async function api(path, params = {}) {
  const url = new URL(path.startsWith('http') ? path : `${API}/${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  for (let attempt = 0; attempt < 4; attempt += 1) {
    let res;
    try {
      res = await fetch(url, { headers });
    } catch (err) {
      if (attempt === 3) throw err;
      const wait = 1200 * (attempt + 1);
      console.warn(`fetch failed for ${url.pathname}${url.search}: ${err.message}; retrying in ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    // Secondary rate limits and transient 5xx are worth one more try; a 404 is not.
    if (res.status === 404) return null;
    if (res.status === 403 || res.status === 429 || res.status >= 500) {
      const wait = Number(res.headers.get('retry-after') || 0) * 1000 || 1200 * (attempt + 1);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url.pathname}${url.search}`);
    return res.json();
  }
  throw new Error(`gave up on ${url.pathname}${url.search}`);
}

// search/commits is its own rate-limit bucket (30/min authenticated), so the
// weekly buckets, monthly buckets, and per-repo counts all run sequentially
// through here with a floor between them. 2200ms keeps a sustained run under
// the secondary limit even with the per-repo queries added below.
let lastSearch = 0;
async function searchCommits(q) {
  const floor = 2200;
  const wait = lastSearch + floor - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastSearch = Date.now();
  const res = await api('search/commits', { q, per_page: 1 });
  return res ? res.total_count : 0;
}

const iso = (d) => d.toISOString().slice(0, 10);
const monthKey = (d) => d.toISOString().slice(0, 7);

// ---------- readme cover images ----------

// Hosts that only ever serve badges. A README's first image is
// often a workflow or coverage badge, which makes a terrible
// cover — so those are skipped in favor of the first real image.
const BADGE_HOSTS = [
  'shields.io', 'img.shields.io', 'badgen.net', 'flat.badgen.net',
  'circleci.com', 'coveralls.io', 'scrutinizer-ci.com', 'travis-ci.org',
  'ci.appveyor.com', 'badge.fury.io', 'versioneye.com', 'codacy.com',
  'codeclimate.com', 'sonarcloud.io', 'dev.azure.com', 'visualstudio.com'
];

// The cover image of a README: the first image in document order
// that is not a badge. Relative paths resolve against the repo
// root on the default branch, which is how GitHub renders them.
// Only https URLs are kept — http: would be mixed content on the
// https site, and data: URIs would bloat the JSON.
const readmeCover = (md, fullName, defaultBranch) => {
  if (!md) return '';
  const candidates = [];
  const anyImg = /(?:!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)|<img[^>]+?src=["']([^"']+)["'])/gi;
  let m;
  while ((m = anyImg.exec(md))) candidates.push(m[1] || m[2]);
  for (const raw of candidates) {
    const url = normalizeImageUrl(raw, fullName, defaultBranch);
    if (url && !isBadgeUrl(url)) return url;
  }
  return '';
};

// Absolute URLs pass through, with one rewrite: GitHub serves
// the bytes of a repo-hosted image from raw.githubusercontent.com,
// not from the /blob or /raw HTML pages, so those links are
// pointed at the file directly. Anything else unparseable,
// plain http:, or a data: URI is dropped.
const normalizeImageUrl = (src, fullName, defaultBranch) => {
  let url = String(src).trim();
  if (!url) return '';
  if (url.startsWith('//')) url = 'https:' + url;
  if (/^https:\/\//i.test(url)) {
    const gh = url.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/(blob|raw)\/([^/]+)\/(.+)$/i);
    if (gh) return `https://raw.githubusercontent.com/${gh[1]}/${gh[3]}/${gh[4]}`;
    return url;
  }
  if (/^https?:\/\//i.test(url) || url.startsWith('data:')) return '';
  const clean = url.replace(/^[./]+/, '');
  return `https://raw.githubusercontent.com/${fullName}/${defaultBranch}/${clean}`;
};

// Badges live either on a dedicated badge host, or on github.com
// under /actions/workflows/ (workflow status badges). Everything
// else on github.com — pasted screenshots under /user-attachments,
// release assets, repo images — is a real image and a valid cover.
const isBadgeUrl = (url) => {
  try {
    const { hostname, pathname } = new URL(url);
    const host = hostname.replace(/^www\./, '');
    if (host === 'github.com' && pathname.includes('/actions/workflows/')) return true;
    return BADGE_HOSTS.includes(host);
  } catch (e) {
    return false;
  }
};

// ---------- collection ----------

async function collect() {
  const profile = await api(`users/${HANDLE}`);
  if (!profile) throw new Error(`user ${HANDLE} not found`);

  // Owner repos, newest push first. /user/repos includes private repos when the
  // token belongs to the profile owner. Private repos are counted but never
  // listed: this snapshot is committed to a public repository, so a private
  // repo's name, description, or cover image must not end up in it.
  const owned = [];
  for (let page = 1; page <= 5; page += 1) {
    const batch = await api('user/repos', {
      per_page: 100,
      page,
      affiliation: 'owner',
      sort: 'pushed'
    });
    if (!batch || !batch.length) break;
    owned.push(...batch.filter((r) => !r.fork));
    if (batch.length < 100) break;
  }
  const ownedCount = owned.length;

  const repos = [];
  const languageBytes = new Map();
  for (const r of owned) {
    if (r.private) continue;
    // Per-repo language breakdown. The map is already fetched for the
    // aggregate stack card; keeping it per repo is what lets the
    // portfolio site break each repo down without another API call.
    const langs = await api(`repos/${r.full_name}/languages`);
    // Commits by the account author in this repo. GitHub shows a commit
    // count only when you open the repo — aggregating all of them in one
    // sortable view is depth the repo list alone does not give.
    const commitCount = await searchCommits(`repo:${r.full_name} author:${HANDLE}`);
    // The README's cover image, so the portfolio can show a real
    // thumbnail per repo instead of a wall of text.
    const readme = await api(`repos/${r.full_name}/readme`);
    let readmeImage = '';
    if (readme && readme.content && readme.encoding === 'base64') {
      const md = Buffer.from(readme.content, 'base64').toString('utf8');
      readmeImage = readmeCover(md, r.full_name, r.default_branch || 'main');
    }
    repos.push({
      name: r.name,
      description: r.description || '',
      language: r.language || '',
      stars: r.stargazers_count,
      forks: r.forks_count,
      topics: r.topics || [],
      createdAt: r.created_at,
      pushedAt: r.pushed_at,
      url: r.html_url,
      private: !!r.private,
      archived: !!r.archived,
      defaultBranch: r.default_branch || 'main',
      size: r.size || 0,
      openIssues: r.open_issues_count || 0,
      license: (r.license && r.license.spdx_id) || '',
      homepage: r.homepage || '',
      watchers: r.watchers_count || 0,
      hasPages: !!r.has_pages,
      languages: langs || {},
      commits: commitCount,
      readmeImage
    });
    if (langs) {
      for (const [name, bytes] of Object.entries(langs)) {
        languageBytes.set(name, (languageBytes.get(name) || 0) + bytes);
      }
    }
  }

  repos.sort((a, b) => b.stars - a.stars || b.pushedAt.localeCompare(a.pushedAt));

  const languages = [...languageBytes.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, bytes]) => ({ name, bytes }));
  const totalBytes = languages.reduce((sum, l) => sum + l.bytes, 0) || 1;

  const totalCommits = await searchCommits(`author:${HANDLE}`);

  // Real activity history: one bucket per week for the activity pulse, and one
  // per month for the timeline. Months start at account creation so the whole
  // history is represented rather than an arbitrary trailing window.
  const created = new Date(profile.created_at);
  const now = new Date();

  const weeks = [];
  for (let i = WEEKS - 1; i >= 0; i -= 1) {
    const end = new Date(now);
    end.setUTCDate(end.getUTCDate() - i * 7);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 6);
    const count = await searchCommits(
      `author:${HANDLE} committer-date:${iso(start)}..${iso(end)}`
    );
    weeks.push({ end: iso(end), count });
  }

  const months = [];
  const cursor = new Date(Date.UTC(created.getUTCFullYear(), created.getUTCMonth(), 1));
  while (cursor <= now) {
    const start = new Date(cursor);
    const end = new Date(cursor);
    end.setUTCMonth(end.getUTCMonth() + 1);
    end.setUTCDate(end.getUTCDate() - 1);
    const bounded = end > now ? now : end;
    const count = await searchCommits(
      `author:${HANDLE} committer-date:${iso(start)}..${iso(bounded)}`
    );
    months.push({ month: monthKey(start), count });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  const stars = repos.reduce((sum, r) => sum + r.stars, 0);
  const starRepos = repos
    .filter((r) => r.stars > 0)
    .sort((a, b) => b.stars - a.stars)
    .map((r) => r.name);
  const lastPush = repos
    .map((r) => r.pushedAt)
    .sort()
    .at(-1) || null;
  const activeThisMonth = months.at(-1)?.count || 0;
  const peakMonth = months.reduce((best, m) => (m.count > best.count ? m : best), months[0] || { month: '—', count: 0 });

  return {
    generatedAt: new Date().toISOString(),
    handle: HANDLE,
    // Recorded so the commit count's trustworthiness is visible in the artifact
    // rather than buried in a log line.
    tokenKind: TOKEN_KIND,
    commitsScopedToThisRepo: SCOPED_TO_THIS_REPO,
    profile: {
      login: profile.login,
      name: profile.name || profile.login,
      location: profile.location || 'Location not set',
      bio: profile.bio || '',
      blog: profile.blog || '',
      avatar: profile.avatar_url,
      createdAt: profile.created_at,
      followers: profile.followers,
      following: profile.following,
      publicRepos: profile.public_repos
    },
    totals: {
      publicRepos: profile.public_repos,
      ownedRepos: ownedCount,
      commits: totalCommits,
      stars,
      starRepos,
      languages: languages.length,
      lastPush,
      activeThisMonth,
      peakMonth: peakMonth.month,
      peakMonthCommits: peakMonth.count
    },
    languages: languages.map((l) => ({
      name: l.name,
      bytes: l.bytes,
      pct: Math.round((l.bytes / totalBytes) * 1000) / 10
    })),
    activity: { weeks, months },
    repos
  };
}

// ---------- write ----------

const data = await collect();
writeFileSync(OUT, JSON.stringify(data, null, 2) + '\n', 'utf8');

const t = data.totals;
console.log(`synced ${data.handle} from the GitHub API`);
console.log(`  generated   ${data.generatedAt}`);
console.log(`  token       ${data.tokenKind}${SCOPED_TO_THIS_REPO ? '  <-- scoped to this repo, commit counts will be low' : ''}`);
console.log(`  repos       ${t.publicRepos} public / ${t.ownedRepos} owned`);
console.log(`  commits     ${t.commits} (${t.activeThisMonth} this month, peak ${t.peakMonth} = ${t.peakMonthCommits})`);
console.log(`  stars       ${t.stars}${t.starRepos.length ? ` on ${t.starRepos.join(', ')}` : ''}`);
console.log(`  languages   ${data.languages.length} — ${data.languages.slice(0, 5).map((l) => `${l.name} ${l.pct}%`).join(', ')}`);
console.log(`  activity    ${data.activity.weeks.length} weeks, ${data.activity.months.length} months`);
console.log(`  last push   ${t.lastPush}`);
if (SCOPED_TO_THIS_REPO) {
  console.warn(
    '\n  WARNING: using an installation token. search/commits only sees commits in this\n' +
      '  repository, so the commit counts are wrong. Add a PROFILE_TOKEN secret\n' +
      '  (classic PAT: public_repo + read:user) to get account-wide numbers.'
  );
}
// The headline commit count is one account-wide search. A token that can
// read private repos (a classic PAT with the repo scope, or gh's own
// token) silently counts commits made in private repos too — activity
// this snapshot must not publish, since those repos are never listed.
// The listed repos' own counts are the public floor; a large gap means
// the token is counting commits outside it.
const listedRepoCommits = data.repos.reduce((sum, r) => sum + r.commits, 0);
if (data.totals.commits > listedRepoCommits * 1.1) {
  console.warn(
    '\n  WARNING: the account-wide commit search returned ' +
      `${data.totals.commits} commits, but the listed repos only\n` +
      `  account for ${listedRepoCommits}. The token can read commits outside the\n` +
      '  listed public repos (private repos it can access, most likely) and is\n' +
      '  counting them in the published totals. Use a classic PAT with public_repo\n' +
      '  + read:user so the numbers cover public repos only.'
  );
}
console.log(`wrote ${OUT}`);
