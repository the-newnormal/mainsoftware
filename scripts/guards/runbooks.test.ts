// The runbooks and the DPO's procedures (docs/runbooks/; C0.9 OD-21, PD-81, TECH-SPEC T22 item 46)
// stay usable, and safe to publish in this public repository. Each rule is first proved on planted
// text, then held on the real files:
// - RB-01: the README links every other Markdown file in the folder, and every relative link in a
//   runbook resolves: to a file and, with an anchor, to one of that file's headings;
// - RB-02: each runbook but the README has the fixed sections, in order, with ## Code paths last.
//   Others, such as ## Don't, may sit between them;
// - RB-03: no runbook holds a phone number (+ and digits with spaces, hyphens, dots or brackets, or
//   a Singapore number written locally), an email address, an AWS account id (12 digits, run
//   together or in hyphenated fours), an ARN, a Twilio SID, a link other than one on the PDPC's site,
//   or a link by any scheme but http(s), since a runbook names roles only (CLAUDE.md, Security and
//   privacy). A finding names the line and the kind, never the value. These are shapes (identifying.ts,
//   which the Owner bootstrap guard's BSG-01 shares): a person's name or a postal address has none, so
//   review keeps those out;
// - RB-04: every name a ## Code paths section lists in backticks exists now, so a runbook never
//   leans on code that isn't there. A name() is a function a migration creates; an /api/… path is
//   one the server registers (api.ts's prefixes joined to each route module's paths); any other
//   /… path is one of the web app's (APP_PATHS, or NOTICE_PATH outside the shell); a repository
//   path (under apps/, packages/, db/, docs/, scripts/, infra/ or .github/) is a file; an access
//   action (ADMIN_ACTIONS or SELF_ACTIONS) is one a server handler serves, named as
//   action: '<name>' outside tests; and any other name (a log event, an audit
//   result, a constant) appears in the server's or the packages' runtime code. Only that section
//   is read, so a step may say in words what a later step brings, and a code path is listed only
//   once it exists;
// - RB-05 (C0.9 OD-18, PD-86): every purpose CONDUCT_WITHDRAWABLE lists has a row in
//   withdrawal-by-hand.md's table whose "How you stop it for one person" cell says how, since the
//   notice tells people such a purpose stops for them; and every row names a real purpose. "Says
//   how" is a heuristic (a cell that isn't empty and doesn't start by saying it can't be done, isn't
//   possible or isn't active yet), which the DPO's review of every change backs up;
// - RB-06 (C0.10 review PRIVACY-02, LH-61): access-request.md names the log dialog's leaver label
//   as the picker shows it (CASE_COPY.people.leftOn). While the dialog says to log someone it can't
//   tell apart from another person as someone without a Hearth account (CASE_COPY.people.same),
//   access-request.md and the README say that a request is never linked after it is logged (0012's
//   cases_fixed()), and that a legal hold on their person stands in for the link (T23 item 11);
// - RB-07 (C0.11 review 1 DETECTION-05, DETECTION-08): the landing zone's runbooks keep the two
//   steps no code can hold: security-alerts.md's containment (removing someone from a group stops
//   only new sessions, so an SCP keyed on aws:TokenIssueTime ends the live ones, OAAR's among them;
//   an account in Recovery, where OAAR isn't fenced, moves back into its OU first; step 4 sees, before
//   the cut-off, a call from a session issued before it refused by the SCP, and moves the cut-off
//   later if none is (review 14 CR-24, review 15 G15-01, G15-02); management's paragraph, ahead of
//   the revoke, does the same for its inline deny with a session issued after the provisioning
//   (review 14 I14-01, review 15 CR-26, CR-27, CodeRabbit after round 16); each probe signs out in a
//   named folder (review 16b G2) and signs in again there before it probes (CodeRabbit after round
//   16); and after its cut-off, management reads the groups, the set's assignments in every account
//   and the user again, redoing step 1 and the list if a live session undid it (review 16b G3,
//   O16b-01, O16b-05, X-02)), and the set-up's step N
//   confirming each alert subscription with authentication and reading it back
//   (--authenticate-on-unsubscribe true, ConfirmationWasAuthenticated), since CloudFormation can't;
// - RB-08 (C0.11 review 12 CR-19, P2-04, review 13 T13-04): every table row has as many cells as its
//   header, counted as GFM counts them, and no unescaped | inside backticks, where GFM splits the row
//   too, so a | in a command is written \| (the page shows a plain |); a delimiter row has its
//   header's cells too, since GFM renders no table otherwise, and no table sits in a quote, which RB-08
//   doesn't read;
// - RB-09 (C0.11 PR 4 review 4 SCRIPTS-01): no git command in a runbook's code names main by a short
//   name (`main` or `origin/main`), only by its full ref (refs/remotes/origin/main, read with
//   git show-ref --verify, after git fetch origin +refs/heads/main:refs/remotes/origin/main): a tag of
//   either short name, which anyone who can push a branch can push, wins a short name's lookup (git
//   only warns that it is ambiguous), so a forged record's commit would read as on main, and a fetch or
//   pull given `origin main` takes such a tag over the branch.
// Comments are stripped before the server's and the packages' code is searched, so a mention in a
// comment proves nothing.
import { posix } from 'node:path'
import { CONDUCT_WITHDRAWABLE, PURPOSE_KEYS } from '@hearth/shared'
import { describe, expect, it } from 'vitest'
import { APP_PATHS, NOTICE_PATH } from '../../apps/web/src/router/paths.ts'
import { CASE_COPY } from '../../apps/web/src/strings/dpo-case.ts'
import { ADMIN_ACTIONS, SELF_ACTIONS } from '../../packages/access/src/requests.ts'
import { IDENTIFYING } from './identifying'
import { withoutComments } from './imports'
import { readRepoFile, repoFiles } from './repo-files'

const { dirname, join, normalize } = posix

const DIR = 'docs/runbooks/'
const README = `${DIR}README.md`
const ACCESS_REQUEST = `${DIR}access-request.md`
const WITHDRAWAL = `${DIR}withdrawal-by-hand.md`
const SECURITY_ALERTS = `${DIR}security-alerts.md`
const AWS_SET_UP = `${DIR}aws-account-set-up.md`

// The runbook folder's own Markdown files, README included.
const isRunbook = (path: string) =>
  path.startsWith(DIR) && path.endsWith('.md') && !path.slice(DIR.length).includes('/')

// A text with its fenced code blocks and inline code blanked, so a link or heading inside code
// isn't read as one. Line breaks are kept, so line numbers still count.
function prose(text: string): string {
  return text
    .replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, block => block.replace(/[^\n]/g, ' '))
    .replace(/`[^`\n]*`/g, span => ' '.repeat(span.length))
}

// The headings a text holds, at a level (## is 2), outside code.
function headingsOf(text: string, level?: number): string[] {
  const found: string[] = []
  for (const [, hashes = '', title = ''] of prose(text).matchAll(/^(#{1,6})[ \t]+(.+?)[ \t#]*$/gm)) {
    if (level === undefined || hashes.length === level) found.push(title)
  }
  return found
}

// GitHub's anchor for a heading: lower case, punctuation dropped, each space a hyphen.
const slugOf = (heading: string) =>
  heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N} _-]/gu, '')
    .replace(/ /g, '-')

// --- RB-01: indexed, and every link resolves -----------------------------------------------------

// The targets of a text's Markdown links, [text](target), outside code.
const linksIn = (text: string): string[] =>
  [...prose(text).matchAll(/\[[^\]\n]*\]\(([^)\s]+)\)/g)].map(match => match[1] ?? '')

// Each relative link that doesn't resolve, as "path: target". read answers a repository file's
// text, or undefined when there is none. A link with a scheme (https:, mailto:) is RB-03's.
function brokenLinks(files: ReadonlyMap<string, string>, read: (path: string) => string | undefined): string[] {
  const found: string[] = []
  for (const [path, text] of files) {
    for (const target of linksIn(text)) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue
      const [file = '', anchor] = target.split('#', 2)
      const resolved = file === '' ? path : normalize(join(dirname(path), decodeURIComponent(file)))
      const linked = resolved === path ? text : read(resolved)
      if (linked === undefined) found.push(`${path}: ${target}`)
      else if (anchor !== undefined && !headingsOf(linked).some(heading => slugOf(heading) === anchor)) {
        found.push(`${path}: ${target}`)
      }
    }
  }
  return found
}

// Each runbook the README doesn't link to.
function unindexed(readme: string, runbooks: readonly string[]): string[] {
  const linked = new Set(linksIn(readme).map(target => normalize(join(DIR, target.split('#', 1)[0] ?? ''))))
  return runbooks.filter(path => path !== README && !linked.has(path))
}

describe('RB-01 (C0.9 OD-21): the README indexes every runbook, and every link resolves', () => {
  it('finds an unindexed runbook and a broken link or anchor on planted files', () => {
    const files = new Map([
      [README, '# Runbooks\n\n[One](one.md) and [Two](two.md#steps), and `[Three](three.md)` in code.\n'],
      [
        `${DIR}one.md`,
        '# One\n\n## Steps\n\nSee [two](two.md#missing), [the README](README.md#runbooks) and [out](../gone.md).\n',
      ],
      [
        `${DIR}two.md`,
        "# Two\n\n## Steps\n\n## Before C0.16's console: what exists\n\n[This](#before-c016s-console-what-exists)\n",
      ],
      [`${DIR}three.md`, '# Three\n'],
    ])
    expect(unindexed(files.get(README) ?? '', [...files.keys()])).toEqual([`${DIR}three.md`])
    expect(brokenLinks(files, path => files.get(path))).toEqual([
      `${DIR}one.md: two.md#missing`,
      `${DIR}one.md: ../gone.md`,
    ])
  })

  it('the README links every runbook, and every link in them resolves', () => {
    const all = new Set(repoFiles())
    const runbooks = [...all].filter(isRunbook).sort()
    expect(runbooks).toContain(README)
    expect(runbooks.length).toBeGreaterThan(1)
    expect(unindexed(readRepoFile(README), runbooks)).toEqual([])
    const files = new Map(runbooks.map(path => [path, readRepoFile(path)] as const))
    expect(brokenLinks(files, path => (all.has(path) ? readRepoFile(path) : undefined))).toEqual([])
  })
})

// --- RB-02: the fixed sections ---------------------------------------------------------------------

const SECTIONS = [
  'Use this when',
  'Who does what',
  'Before you start',
  'Steps',
  'Check it worked',
  'Afterwards',
  'Code paths',
] as const

// What is wrong with a runbook's ## sections: one missing or repeated, out of order, or Code paths
// not last.
function sectionProblems(text: string): string[] {
  const headings = headingsOf(text, 2)
  const found: string[] = []
  let last = -1
  for (const section of SECTIONS) {
    const at = headings.indexOf(section)
    if (at === -1) found.push(`no ## ${section}`)
    else if (headings.lastIndexOf(section) !== at) found.push(`## ${section} twice`)
    else if (at < last) found.push(`## ${section} out of order`)
    else last = at
  }
  if (headings.at(-1) !== 'Code paths' && headings.includes('Code paths')) found.push('## Code paths not last')
  return found
}

describe('RB-02 (C0.9 PD-81): each runbook has the fixed sections, in order, Code paths last', () => {
  const sections = (names: readonly string[]) => names.map(name => `## ${name}\n\ntext\n`).join('\n')

  it('finds a missing, repeated or misplaced section on planted text', () => {
    expect(sectionProblems(`# A\n\n${sections([...SECTIONS.slice(0, 6), "Don't", 'Code paths'])}`)).toEqual([])
    expect(sectionProblems(sections(SECTIONS.filter(name => name !== 'Steps')))).toEqual(['no ## Steps'])
    expect(sectionProblems(sections(['Who does what', 'Use this when', ...SECTIONS.slice(2)]))).toEqual([
      '## Who does what out of order',
    ])
    expect(sectionProblems(sections([...SECTIONS, "Don't"]))).toEqual(['## Code paths not last'])
    expect(sectionProblems(sections([...SECTIONS.slice(0, 4), 'Steps', ...SECTIONS.slice(4)]))).toEqual([
      '## Steps twice',
    ])
    // A heading inside a code block isn't one.
    expect(sectionProblems(`${sections(SECTIONS.slice(0, 6))}\n\`\`\`\n## Code paths\n\`\`\`\n`)).toEqual([
      'no ## Code paths',
    ])
  })

  it('every runbook but the README has them', () => {
    const runbooks = repoFiles().filter(path => isRunbook(path) && path !== README)
    expect(runbooks.length).toBeGreaterThan(0)
    expect(runbooks.flatMap(path => sectionProblems(readRepoFile(path)).map(problem => `${path}: ${problem}`))).toEqual(
      [],
    )
  })
})

// --- RB-03: nothing that identifies anyone -------------------------------------------------------

// What a public runbook must never hold is IDENTIFYING's shapes (identifying.ts, which BSG-01 in
// owner-bootstrap.test.ts shares, so the two guards hold one list), and links.

// The one site a runbook may link to: the PDPC's, for its breach notification form.
const LINKABLE = new Set(['www.pdpc.gov.sg'])

// The host of every link or bare web address a line holds.
const hostsIn = (line: string): string[] =>
  [...line.matchAll(/\b(?:https?:\/\/|www\.)[^\s<>()[\]`'"]*/gi)].map(([address]) =>
    address
      .replace(/^https?:\/\//i, '')
      .split(/[/?#:]/, 1)
      .join('')
      .replace(/[.,;]+$/, '')
      .toLowerCase(),
  )

// The scheme of every address with one (s3://, ftp://) and every Markdown link with one
// ([text](mailto:…)) a line holds, lower case. A scheme named in prose or code (`mailto:`) is none.
const schemesIn = (line: string): string[] =>
  [...line.matchAll(/\b([a-z][a-z0-9+.-]*):\/\/|\]\(\s*<?([a-z][a-z0-9+.-]*):/gi)].map(([, address, link]) =>
    (address ?? link ?? '').toLowerCase(),
  )

// Each finding, as "path:line: kind", each kind once a line.
function identifying(path: string, text: string): string[] {
  const found: string[] = []
  for (const [index, line] of text.split('\n').entries()) {
    const kinds = new Set(IDENTIFYING.filter(({ pattern }) => pattern.test(line)).map(({ kind }) => kind))
    for (const host of hostsIn(line)) if (!LINKABLE.has(host)) kinds.add(`a link to ${host}`)
    for (const scheme of schemesIn(line)) if (scheme !== 'https' && scheme !== 'http') kinds.add(`a link by ${scheme}:`)
    for (const kind of kinds) found.push(`${path}:${index + 1}: ${kind}`)
  }
  return found
}

describe('RB-03 (C0.9 OD-21, PD-81): no runbook holds a number, an address, an account or a link', () => {
  it('finds each kind on planted lines, and passes what a runbook may say', () => {
    const planted = [
      'Call +65 6123 4567.',
      'Or 9123 4567, or 61234567.',
      'Write to someone@example.org.',
      'Account 123456789012.',
      'Role arn:aws:iam::x:role/y.',
      `Service ${['VA', 'a'.repeat(32)].join('')}.`,
      'See https://example.com/x and www.example.org.',
      'Through its online form on www.pdpc.gov.sg, or https://www.pdpc.gov.sg/report.',
      'Start with + and the country code, such as +65. Within 30 calendar days, 500 people, 2,000 characters.',
      'Use `mailto:` and `tel:` links; ACRA’s BizFile+ on 23 Oct 2026 (2026-10-23), step 2 (of 7).',
      'Call +1 (415) 555-0100, or +65.6123.4567.',
      'Account 1234-5678-9012.',
      'Bucket s3://hearth-prod-recordings-acme/ and [the share](ftp://files.acme.example/dpo).',
      'Write [to the DPO](mailto:dpo) or [call](tel:0).',
      // A Verify verification's SID (PRIVACY-04), built here so no file holds one.
      `Verification ${['VE', '0a'.repeat(16)].join('')}.`,
    ].join('\n')
    expect(identifying('x.md', planted)).toEqual([
      'x.md:1: a phone number',
      'x.md:2: a phone number',
      'x.md:3: an email address',
      'x.md:4: a 12-digit run (an AWS account id)',
      'x.md:5: an ARN',
      'x.md:6: a Twilio SID',
      'x.md:7: a link to example.com',
      'x.md:7: a link to www.example.org',
      'x.md:11: a phone number',
      'x.md:12: a 12-digit run (an AWS account id)',
      'x.md:13: a link by s3:',
      'x.md:13: a link by ftp:',
      'x.md:14: a link by mailto:',
      'x.md:14: a link by tel:',
      'x.md:15: a Twilio SID',
    ])
  })

  it('no runbook holds one', () => {
    const runbooks = repoFiles().filter(isRunbook)
    expect(runbooks.length).toBeGreaterThan(0)
    expect(runbooks.flatMap(path => identifying(path, readRepoFile(path)))).toEqual([])
  })
})

// --- RB-04: every code path exists ---------------------------------------------------------------

// What the code holds, for checking a runbook's code paths against.
interface CodeWorld {
  // The public functions the migrations create.
  functions: ReadonlySet<string>
  // Every path the api registers, its prefixes joined.
  apiPaths: ReadonlySet<string>
  // The web app's paths: APP_PATHS, and NOTICE_PATH outside the shell.
  webPaths: ReadonlySet<string>
  // The repository's files.
  files: ReadonlySet<string>
  // The access actions packages/access names.
  actions: ReadonlySet<string>
  // The actions a server handler serves (action: '<name>' outside tests).
  served: ReadonlySet<string>
  // Whether the server's or the packages' runtime code holds a name.
  mentions: (name: string) => boolean
}

// The backticked names a runbook's ## Code paths section lists.
function codePathsOf(text: string): string[] {
  const start = text.search(/^## Code paths[ \t]*$/m)
  if (start === -1) return []
  const rest = text.slice(start).replace(/^## Code paths[^\n]*\n/, '')
  const end = rest.search(/^## /m)
  return [...(end === -1 ? rest : rest.slice(0, end)).matchAll(/`([^`\n]+)`/g)].map(match => match[1] ?? '')
}

// Why a code path doesn't exist, or undefined when it does.
function codePathProblem(name: string, world: CodeWorld): string | undefined {
  const fn = name.match(/^([a-z_][a-z0-9_]*)\(\)$/)
  if (fn) return world.functions.has(fn[1] ?? '') ? undefined : 'no migration creates that function'
  if (name.startsWith('/api/')) return world.apiPaths.has(name) ? undefined : 'the api registers no such path'
  if (name.startsWith('/')) return world.webPaths.has(name) ? undefined : 'the web app has no such path'
  if (/^(?:apps|packages|db|docs|scripts|infra|\.github)\//.test(name)) {
    return world.files.has(name) ? undefined : 'no such file'
  }
  if (world.actions.has(name)) return world.served.has(name) ? undefined : 'no server handler serves that action'
  return world.mentions(name) ? undefined : 'the code holds no such name'
}

const missingCodePaths = (path: string, text: string, world: CodeWorld): string[] =>
  codePathsOf(text).flatMap(name => {
    const problem = codePathProblem(name, world)
    return problem === undefined ? [] : [`${path}: ${name}: ${problem}`]
  })

// The functions migrations create (create function, or create or replace function).
function functionsIn(sources: readonly string[]): Set<string> {
  const found = new Set<string>()
  for (const sql of sources) {
    for (const [, name] of sql.matchAll(
      /\bcreate\s+(?:or\s+replace\s+)?function\s+public\.([a-z_][a-z0-9_]*)\s*\(/gi,
    )) {
      if (name !== undefined) found.add(name.toLowerCase())
    }
  }
  return found
}

// The source of one exported route function: from its declaration to the next export.
function routeFunction(source: string, name: string): string {
  const start = source.search(new RegExp(`^export (?:async )?function ${name}\\b`, 'm'))
  if (start === -1) return ''
  const next = source.slice(start + 1).search(/^export /m)
  return next === -1 ? source.slice(start) : source.slice(start, start + 1 + next)
}

// Every path the api registers: api.ts registers each route function under /api, with its own
// prefix or none, and each function registers its paths on the scope it is given. A function's '/'
// is its prefix itself (GET /api/devices), and a parameter (:person) stays as written.
function apiPathsOf(read: (path: string) => string): Set<string> {
  const api = read('apps/server/src/api.ts')
  if (!api.includes("{ prefix: '/api' }")) throw new Error('api.ts no longer registers its routes under /api')
  const modules = new Map<string, string>()
  for (const [, names = '', spec = ''] of api.matchAll(/import\s*\{([^}]*)\}\s*from\s*'#src\/([^']+)'/g)) {
    for (const name of names.split(',')) modules.set(name.trim().replace(/^type\s+/, ''), `apps/server/src/${spec}`)
  }
  const paths = new Set<string>()
  for (const [, route = '', prefix = ''] of api.matchAll(
    /\bscope\.register\((\w+)\(api\)(?:,\s*\{\s*prefix:\s*'([^']*)'\s*\})?\)/g,
  )) {
    const module = modules.get(route)
    if (module === undefined) throw new Error(`api.ts registers ${route}, imported from no #src module`)
    const body = routeFunction(read(module), route)
    for (const [, path = ''] of body.matchAll(/\bscope\.(?:get|post|put|patch|delete)\(\s*'([^']*)'/g)) {
      paths.add(`/api${prefix}${path === '/' ? '' : path}`)
    }
  }
  return paths
}

// Server and package source that runs, not tests or their helpers.
const isRuntimeSource = (path: string) =>
  /^(?:apps\/server\/src|packages)\//.test(path) &&
  /\.tsx?$/.test(path) &&
  !/\.test\.tsx?$/.test(path) &&
  !/(?:^|\/)testing\//.test(path)

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function realWorld(): CodeWorld {
  const all = repoFiles()
  const runtime = all.filter(isRuntimeSource).map(path => withoutComments(path, readRepoFile(path)))
  const server = all
    .filter(path => path.startsWith('apps/server/src/') && isRuntimeSource(path))
    .map(path => withoutComments(path, readRepoFile(path)))
  const served = new Set<string>()
  // TypeScript's printer, which strips the comments, writes every string in double quotes.
  for (const source of server) {
    for (const [, action] of source.matchAll(/\baction:\s*["']([a-z_.]+)["']/g))
      if (action !== undefined) served.add(action)
  }
  const code = runtime.join('\n')
  return {
    functions: functionsIn(all.filter(path => /^db\/migrations\/[^/]+\.sql$/.test(path)).map(readRepoFile)),
    apiPaths: apiPathsOf(readRepoFile),
    webPaths: new Set<string>([...APP_PATHS, NOTICE_PATH]),
    files: new Set(all),
    actions: new Set([...ADMIN_ACTIONS, ...SELF_ACTIONS]),
    served,
    mentions: name => new RegExp(`(?<![\\w$])${escapeRegExp(name)}(?![\\w$])`).test(code),
  }
}

describe('RB-04 (C0.9 PD-81): every code path a runbook names exists now', () => {
  const sources: Record<string, string> = {
    'apps/server/src/api.ts': [
      "import { adminRoutes } from '#src/admin/routes.ts'",
      "import { deviceRoutes, type Other } from '#src/devices/routes.ts'",
      'app.register(async scope => {',
      "  await scope.register(deviceRoutes(api), { prefix: '/devices' })",
      "  await scope.register(adminRoutes(api), { prefix: '/admin' })",
      "}, { prefix: '/api' })",
    ].join('\n'),
    // otherRoutes isn't registered, so its path isn't served.
    'apps/server/src/admin/routes.ts': [
      'export function adminRoutes(api: Api) {',
      "  scope.post('/people/reset-pin', handler)",
      "  scope.get('/people/:person/devices', handler)",
      '}',
      'export function otherRoutes(api: Api) {',
      "  scope.post('/cases', handler)",
      '}',
    ].join('\n'),
    // A module's '/' is its prefix itself.
    'apps/server/src/devices/routes.ts': "export function deviceRoutes(api: Api) {\n  scope.get(\n    '/', handler)\n}",
  }
  const planted: CodeWorld = {
    functions: functionsIn([
      'create function public.publish_notice(\n  seen integer)',
      'create or replace function public.bootstrap_transfer_clearance(x text)',
      'drop function public.gone(integer);',
    ]),
    apiPaths: apiPathsOf(path => sources[path] ?? ''),
    webPaths: new Set(['/dpo/transfers', '/notice']),
    files: new Set(['apps/server/src/admin/people.ts', '.github/workflows/deploy.yml']),
    actions: new Set(['person.reset_pin', 'person.change_phone']),
    served: new Set(['person.reset_pin']),
    mentions: name => ['sms_provider_unstated', 'PIN_RULE_SESSION'].includes(name),
  }

  it('reads only the Code paths section, and each rule passes what exists and fails what doesn’t', () => {
    const text = [
      '# A',
      '## Steps',
      '`/dpo/cases` waits for a later step, so a step may name it.',
      '## Code paths',
      '- `publish_notice()` and `bootstrap_transfer_clearance()`, but not `gone()` or `nowhere()`',
      '- `/api/admin/people/reset-pin`, `/api/admin/people/:person/devices`, `/api/devices`, `/api/admin/cases`',
      '- `/notice`, `/dpo/transfers`, `/dpo/cases`',
      '- `apps/server/src/admin/people.ts`, `apps/server/src/admin/cases.ts`',
      '- `.github/workflows/deploy.yml`, `.github/workflows/gone.yml`',
      '- `person.reset_pin`, `person.change_phone`',
      '- `sms_provider_unstated`, `PIN_RULE_SESSION`, `sms_provider_lost`',
    ].join('\n')
    expect(missingCodePaths('a.md', text, planted)).toEqual([
      'a.md: gone(): no migration creates that function',
      'a.md: nowhere(): no migration creates that function',
      'a.md: /api/admin/cases: the api registers no such path',
      'a.md: /dpo/cases: the web app has no such path',
      'a.md: apps/server/src/admin/cases.ts: no such file',
      'a.md: .github/workflows/gone.yml: no such file',
      'a.md: person.change_phone: no server handler serves that action',
      'a.md: sms_provider_lost: the code holds no such name',
    ])
    expect([...planted.apiPaths].sort()).toEqual([
      '/api/admin/people/:person/devices',
      '/api/admin/people/reset-pin',
      '/api/devices',
    ])
  })

  it('the real code paths, as the runbooks use them', () => {
    const world = realWorld()
    // Each kind is found, so an empty set can't pass every runbook by accident.
    expect(world.functions).toContain('bootstrap_transfer_clearance')
    expect(world.apiPaths).toContain('/api/admin/people/reset-pin')
    expect(world.apiPaths).toContain('/api/devices')
    expect(world.apiPaths).toContain('/api/session')
    expect(world.webPaths).toContain('/notice')
    expect(world.served).toContain('person.reset_pin')
    expect(world.served).not.toContain('person.change_phone')
    expect(world.mentions('PIN_RULE_SESSION')).toBe(true)
    expect(world.mentions('sms_provider_lost')).toBe(false)
    const runbooks = repoFiles().filter(path => isRunbook(path) && path !== README)
    expect(runbooks.every(path => codePathsOf(readRepoFile(path)).length > 0)).toBe(true)
    expect(runbooks.flatMap(path => missingCodePaths(path, readRepoFile(path), world))).toEqual([])
  }, 30_000)
})

// --- RB-05: a stop by hand for every purpose CONDUCT_WITHDRAWABLE lists ---------------------------

// A "How you stop it for one person" cell that starts by saying it can't yet be done, or points
// elsewhere: a heuristic, which the DPO's review of every change backs up.
const NOT_HOW =
  /^(?:(?:it )?(?:can['’]?t|cannot)\b|(?:it(?:['’]s| is) )?not (?:possible|yet|active)\b|n\/a\b|none\b|nothing\b|as above\b|the step that makes it active\b)/i

// The withdrawal table's rows: each purpose key and its "How you stop it for one person" cell.
function withdrawalRows(text: string): Map<string, string> | undefined {
  const lines = prose(text.replace(/`([a-z_]+)`/g, '$1')).split('\n')
  const header = lines.findIndex(line => line.startsWith('|') && line.includes('How you stop it for one person'))
  if (header === -1) return undefined
  const cellsOf = (line: string) =>
    line
      .replace(/^\|/, '')
      .replace(/\|\s*$/, '')
      .split('|')
      .map(cell => cell.trim())
  const column = cellsOf(lines[header] ?? '').indexOf('How you stop it for one person')
  const rows = new Map<string, string>()
  for (const line of lines.slice(header + 2)) {
    if (!line.startsWith('|')) break
    const cells = cellsOf(line)
    rows.set(cells[0] ?? '', cells[column] ?? '')
  }
  return rows
}

// What is wrong with the table for this list of purposes.
function withdrawalProblems(text: string, withdrawable: readonly string[], purposes: readonly string[]): string[] {
  const rows = withdrawalRows(text)
  if (rows === undefined) return ['no "How you stop it for one person" table']
  const found: string[] = []
  for (const key of withdrawable) {
    const how = rows.get(key)
    if (how === undefined) found.push(`${key}: no row`)
    else if (how === '' || NOT_HOW.test(how)) found.push(`${key}: its row doesn't say how`)
  }
  for (const key of rows.keys()) if (!purposes.includes(key)) found.push(`${key}: not a purpose`)
  return found
}

describe('RB-05 (C0.9 OD-18, PD-86): each purpose CONDUCT_WITHDRAWABLE lists has its row', () => {
  const table = [
    '| Purpose | What stops for the person | How you stop it for one person | What continues |',
    '|---|---|---|---|',
    '| `security_audit` | nothing yet | it can’t be: the audit log is append-only | everything |',
    "| `backups` | nothing yet | it can't be: backups can't be changed | everything |",
    '| `content_delivery` | not active in C0 | the step that makes it active fills this row | n/a |',
    '| `access_logs` | not active in C0 | as above | n/a |',
    '| `presence_receipts` | the receipts | the DPO turns them off for the person on the roster | the rest |',
    '| `session_slides` | the slides | It cannot be stopped until C2.11 | n/a |',
    '| `session_sharing` | the sharing | Not possible yet | n/a |',
    '| `people_insights` | the counts | n/a | n/a |',
    '',
    'Text after the table.',
  ].join('\n')

  it('passes an empty list and a purpose whose row says how, and fails the rest, on planted text', () => {
    const purposes = [
      'security_audit',
      'backups',
      'content_delivery',
      'access_logs',
      'presence_receipts',
      'session_slides',
      'session_sharing',
      'people_insights',
    ]
    expect(withdrawalProblems(table, [], purposes)).toEqual([])
    expect(withdrawalProblems(table, ['presence_receipts'], purposes)).toEqual([])
    expect(
      withdrawalProblems(
        table,
        [
          'security_audit',
          'backups',
          'content_delivery',
          'access_logs',
          'session_slides',
          'session_sharing',
          'people_insights',
          'recording_meetings',
        ],
        purposes,
      ),
    ).toEqual([
      "security_audit: its row doesn't say how",
      "backups: its row doesn't say how",
      "content_delivery: its row doesn't say how",
      "access_logs: its row doesn't say how",
      "session_slides: its row doesn't say how",
      "session_sharing: its row doesn't say how",
      "people_insights: its row doesn't say how",
      'recording_meetings: no row',
    ])
    expect(withdrawalProblems(table, [], purposes.slice(1))).toEqual(['security_audit: not a purpose'])
    expect(withdrawalProblems('No table here.', [], purposes)).toEqual(['no "How you stop it for one person" table'])
  })

  it('withdrawal-by-hand.md has a row that says how for every purpose CONDUCT_WITHDRAWABLE lists', () => {
    const text = readRepoFile(WITHDRAWAL)
    expect(withdrawalRows(text)?.size).toBeGreaterThan(0)
    // The real table is read as written: the audit log can never be stopped for one person.
    expect(withdrawalProblems(text, ['security_audit'], PURPOSE_KEYS)).toEqual([
      "security_audit: its row doesn't say how",
    ])
    expect(withdrawalProblems(text, CONDUCT_WITHDRAWABLE, PURPOSE_KEYS)).toEqual([])
  })
})

// --- RB-06: how a requester is linked, as the log dialog says --------------------------------------

// What access-request.md (or the README, with no label) leaves out about linking a requester: the
// leaver label as the log dialog's picker shows it, and, while the dialog says to log someone it
// can't tell apart from another person as someone without a Hearth account, that a request is
// never linked after it is logged and what stands in for the link (PRIVACY-02).
function linkProblems(text: string, copy: { leftOn?: (label: string, day: string) => string; same: string }): string[] {
  const found: string[] = []
  if (copy.leftOn !== undefined) {
    // ", left on <day>" with the label's punctuation dropped: "left on <day>".
    const label = copy.leftOn('', '<day>').replace(/^[^\p{L}]+/u, '')
    if (!text.includes(`"${label}"`)) found.push(`no "${label}"`)
  }
  if (/\bas someone without a Hearth account\b/.test(copy.same)) {
    if (!/\bnever linked\b/.test(text)) found.push('no "never linked"')
    if (!/\bcan[’']t tell two people apart\b/.test(text)) found.push('no "can’t tell two people apart"')
    if (!/\blegal hold on their person\b/.test(text)) found.push('no "legal hold on their person"')
  }
  return found
}

describe('RB-06 (C0.10 review PRIVACY-02, LH-61): the runbooks say how a requester is linked, as the log dialog does', () => {
  const same = 'Two people here read the same. Log it as someone without a Hearth account.'
  const leftOn = (label: string, day: string) => `${label}, left on ${day}`

  it('finds a wrong label and a missing exception on planted text, and passes the right words', () => {
    const old = 'Log it against their former person (shown as "Has left"), never as someone without an account.'
    expect(linkProblems(old, { leftOn, same })).toEqual([
      'no "left on <day>"',
      'no "never linked"',
      'no "can’t tell two people apart"',
      'no "legal hold on their person"',
    ])
    const fixed =
      'Listed as "left on <day>". A request is never linked after it is logged. If the dialog can’t tell two people apart, log it so, and place a legal hold on their person.'
    expect(linkProblems(fixed, { leftOn, same })).toEqual([])
    // A dialog that never says to log someone at the organisation as an outsider needs no exception.
    expect(linkProblems('Listed as "left on <day>".', { leftOn, same: 'Neither can be picked.' })).toEqual([])
    expect(linkProblems('Nothing here.', { same })).toEqual([
      'no "never linked"',
      'no "can’t tell two people apart"',
      'no "legal hold on their person"',
    ])
  })

  it('access-request.md and the README say what the log dialog does', () => {
    // The dialog does tell the DPO to log someone it can't tell apart as an outsider, so the
    // exception is required, not skipped.
    expect(CASE_COPY.people.same).toMatch(/\bas someone without a Hearth account\b/)
    expect(linkProblems(readRepoFile(ACCESS_REQUEST), CASE_COPY.people)).toEqual([])
    expect(linkProblems(readRepoFile(README), { same: CASE_COPY.people.same })).toEqual([])
  })
})

// --- RB-07: the landing zone's containment and authenticated subscriptions --------------------------

// Whether a probe, after it signs out in its folder, signs in again in that folder before its first
// call: a probe made before the new sign-in reuses the session the sign-out ended, or no session at
// all, so its refusal shows nothing (CodeRabbit after C0.11 PR 2's round 16).
const PROBE_SIGN_OUT = '`HOME=<the folder> aws sso logout`'
const PROBE_SIGN_IN = '`HOME=<the folder> aws sso login --profile '
const PROBE_CALL = '`HOME=<the folder> aws iam get-account-summary --profile '
function signsInAgainBeforeProbe(text: string): boolean {
  const signOut = text.indexOf(PROBE_SIGN_OUT)
  const signIn = signOut < 0 ? -1 : text.indexOf(PROBE_SIGN_IN, signOut)
  const probe = text.indexOf(PROBE_CALL)
  return signIn >= 0 && probe > signIn
}

// What security-alerts.md and the set-up runbook leave out of the two steps no code can hold
// (C0.11 review 1 DETECTION-05, DETECTION-08; TECH-SPEC T24 items 4 and 5).
function landingZoneProblems(alerts: string, setUp: string): string[] {
  const found: string[] = []
  const containment = alerts.split(/^### Containing an unexpected session$/m)[1]?.split(/^##+ /m)[0]
  if (containment === undefined) found.push('security-alerts.md: no "### Containing an unexpected session"')
  else {
    if (!/\bstops only new sessions\b/.test(containment)) found.push('security-alerts.md: no "stops only new sessions"')
    if (!containment.includes('aws:TokenIssueTime')) found.push('security-alerts.md: no aws:TokenIssueTime')
    // OAAR's sessions are ended by the SCP too, and an account in Recovery, where NoOaar doesn't bind,
    // goes back into its OU (C0.11 review 2 FIXES-01).
    if (!containment.includes('*:role/OrganizationAccountAccessRole')) {
      found.push('security-alerts.md: the SCP names no *:role/OrganizationAccountAccessRole')
    }
    if (!/\bmoves it back into its own OU\b/.test(containment)) {
      found.push('security-alerts.md: no "moves it back into its own OU"')
    }
    // Organizations applies the SCP only after a delay, and a session it hasn't bound by the cut-off can
    // take a role issued after it, so step 4 has a call from a session issued before the cut-off seen
    // refused by it before the cut-off, and moves the cut-off later if none is (C0.11 review 14 CR-24).
    // Both are read in step 4 alone, so a check made after the cut-off, or words moved to another step,
    // fail (C0.11 review 15 G15-01, G15-02).
    const step4 = containment.match(/^4\. [\s\S]*?(?=^5\. )/m)?.[0] ?? ''
    if (
      !/\bchecks? before the cut-off that it binds: [^.]*\bissued before the cut-off\b[^.]*`with an explicit deny in a service control policy`/.test(
        step4,
      )
    ) {
      found.push('security-alerts.md: step 4 has no check that the SCP binds before its cut-off')
    }
    if (!/\bIf none is refused by the cut-off, move the cut-off\b/.test(step4)) {
      found.push("security-alerts.md: step 4 doesn't move the cut-off later when the SCP hasn't bound by it")
    }
    // Each probe signs out in the folder that holds its profile: a sign-out elsewhere leaves the role
    // credentials the CLI cached for an older session, which an earlier cut-off refuses in the same
    // words (C0.11 review 16b G2).
    if (!step4.includes('`HOME=<the folder> aws sso logout`')) {
      found.push("security-alerts.md: step 4's probe doesn't sign out in a named folder")
    } else if (!signsInAgainBeforeProbe(step4)) {
      found.push("security-alerts.md: step 4's probe doesn't sign in again in its folder before it probes")
    }
    // So does a permission set's inline deny in management, and until it binds the set's old sessions
    // can still take roles, so management's paragraph, ahead of the revoke, has a call seen refused by
    // it before its cut-off, from a session issued after the provisioning, so the refusal is the new
    // statement's, and moves the cut-off later if none is (C0.11 review 14 I14-01, review 15 CR-26,
    // CR-27; CodeRabbit after round 16). Both are read from "No SCP binds management." up to the
    // revoke, so a check made after the revoke fails.
    const management = containment.split(/^No SCP binds management\./m)[1]?.split('*Revoke active sessions*')[0] ?? ''
    if (
      !/\bfirst sees, before the cut-off, a call\b[^.]*\bissued after the provisioning\b[^.]*`with an explicit deny in an identity-based policy`/.test(
        management,
      )
    ) {
      found.push(
        'security-alerts.md: management has no check, before the revoke, that its inline deny binds by its cut-off',
      )
    }
    if (!/\bIf none is refused by the cut-off, the Owner moves the cut-off\b/.test(management)) {
      found.push(
        "security-alerts.md: management doesn't move the cut-off later when its inline deny hasn't bound by it",
      )
    }
    if (!management.includes('`HOME=<the folder> aws sso logout`')) {
      found.push("security-alerts.md: management's probe doesn't sign out in a named folder")
    } else if (!signsInAgainBeforeProbe(management)) {
      found.push("security-alerts.md: management's probe doesn't sign in again in its folder before it probes")
    }
    // Until the inline deny binds, a live session can put its person back in the group or the
    // assignment, in any account, or enable the user again, and sign in after the cut-off. So after the
    // cut-off, ahead of the revoke, one bullet reads them again and, if it or the search finds step 1
    // undone, redoes step 1 with a later cut-off, provisioned and checked, and goes through the list
    // again, since a session issued after the first cut-off can undo the redo too (C0.11 review 16b G3,
    // O16b-01, O16b-02, O16b-05, X-02).
    const afterCutOff = management.split(/\bsigned in again after the cut-off:/)[1] ?? ''
    if (
      !/^- Reads again each group's members and the set's assignments in every account\b[^\n]*\bstill disabled\b[^\n]*\bor the search below\b[^\n]*\bthe Owner redoes step 1\b[^\n]*, then moves the cut-off later, provisions the set again and checks again\b[^\n]*\bgoes through this list again from its first bullet\b/m.test(
        afterCutOff,
      )
    ) {
      found.push("security-alerts.md: management doesn't read the group and the assignments again after its cut-off")
    }
  }
  const stepN = setUp.split(/^### N\. .*$/m)[1]?.split(/^##+ /m)[0]
  if (stepN === undefined) found.push('aws-account-set-up.md: no step N')
  else {
    if (!stepN.includes('--authenticate-on-unsubscribe true')) {
      found.push('aws-account-set-up.md: step N has no --authenticate-on-unsubscribe true')
    }
    if (!stepN.includes('ConfirmationWasAuthenticated')) {
      found.push('aws-account-set-up.md: step N reads no ConfirmationWasAuthenticated')
    }
  }
  return found
}

describe('RB-07 (C0.11 review 1 DETECTION-05, DETECTION-08, review 2 FIXES-01, review 14 CR-24, I14-01, review 15 G15-01, G15-02, CR-26, CR-27, review 16b G2, G3, O16b-01, O16b-05, X-02): the landing zone’s runbooks keep containment, OAAR’s, the checks that each deny binds by its cut-off and management’s read after it included, and authenticated subscriptions', () => {
  // Step 4's check and its fallback, and management's, each a sentence of its own.
  const scpCheck =
    'So the person on call checks before the cut-off that it binds: a call from their own session, issued before the cut-off, is refused `with an explicit deny in a service control policy`.'
  const scpLater = 'If none is refused by the cut-off, move the cut-off a few minutes later and check again.'
  const inlineCheck =
    'The Owner first sees, before the cut-off, a call from their own session issued after the provisioning, refused `with an explicit deny in an identity-based policy`.'
  const inlineLater = 'If none is refused by the cut-off, the Owner moves the cut-off later and checks again.'
  const revoke = '- Uses IAM’s *Revoke active sessions* on each role.'
  // Each probe's sign-out in its folder, its sign-in there again and its call, and management's read
  // after its cut-off.
  const scpSignIn = '`HOME=<the folder> aws sso login --profile hearth-<env>-entry`'
  const scpSignOut = `Sign out in the helper's folder and in again: \`HOME=<the folder> aws sso logout\`, then ${scpSignIn}.`
  const scpProbe =
    'Call `HOME=<the folder> aws iam get-account-summary --profile hearth-<env>-entry` until it is refused.'
  const inlineSignIn = '`HOME=<the folder> aws sso login --profile <that profile>`'
  const inlineSignOut = `They sign out and in again in the set's folder: \`HOME=<the folder> aws sso logout\`, then ${inlineSignIn}.`
  const inlineProbe =
    'Then they call `HOME=<the folder> aws iam get-account-summary --profile <that profile>` until it is refused.'
  const reread =
    "- Reads again each group's members and the set's assignments in every account, and whether the user is still disabled. If it, or the search below, shows step 1 undone, the Owner redoes step 1, then moves the cut-off later, provisions the set again and checks again, and goes through this list again from its first bullet."
  const step4Missing = 'security-alerts.md: step 4 has no check that the SCP binds before its cut-off'
  const step4NotLater = "security-alerts.md: step 4 doesn't move the cut-off later when the SCP hasn't bound by it"
  const inlineMissing =
    'security-alerts.md: management has no check, before the revoke, that its inline deny binds by its cut-off'
  const inlineNotLater =
    "security-alerts.md: management doesn't move the cut-off later when its inline deny hasn't bound by it"
  const step4NoFolder = "security-alerts.md: step 4's probe doesn't sign out in a named folder"
  const inlineNoFolder = "security-alerts.md: management's probe doesn't sign out in a named folder"
  const step4NoSignIn = "security-alerts.md: step 4's probe doesn't sign in again in its folder before it probes"
  const inlineNoSignIn = "security-alerts.md: management's probe doesn't sign in again in its folder before it probes"
  const noReread = "security-alerts.md: management doesn't read the group and the assignments again after its cut-off"

  it('finds each gap on planted text, and passes the right words', () => {
    const alerts = [
      '## Steps',
      '',
      '### Containing an unexpected session',
      '',
      'Removing someone from a group stops only new sessions.',
      '',
      '3. If the account sits in `Recovery`, moves it back into its own OU.',
      `4. An SCP denies where \`aws:TokenIssueTime\` is before the cut-off and \`aws:PrincipalArn\` is like \`*:role/OrganizationAccountAccessRole\`. ${scpCheck}`,
      `   - ${scpSignOut}`,
      `   - ${scpProbe}`,
      `   - ${scpLater}`,
      '5. Looks in the trail.',
      '',
      `No SCP binds management. ${inlineCheck} ${inlineSignOut} ${inlineProbe} ${inlineLater} Then, signed in again after the cut-off:`,
      '',
      reread,
      revoke,
      '',
      '## Check it worked',
      '',
    ].join('\n')
    const setUp =
      '### N. Confirm each email subscription\n\n`aws sns confirm-subscription --authenticate-on-unsubscribe true`, then `ConfirmationWasAuthenticated` prints `true`.\n\n### O. Next\n'
    expect(landingZoneProblems(alerts, setUp)).toEqual([])
    expect(landingZoneProblems(alerts.replace('stops only new sessions', 'ends every session'), setUp)).toEqual([
      'security-alerts.md: no "stops only new sessions"',
    ])
    expect(landingZoneProblems(alerts.replace('aws:TokenIssueTime', 'aws:CurrentTime'), setUp)).toEqual([
      'security-alerts.md: no aws:TokenIssueTime',
    ])
    expect(
      landingZoneProblems(
        alerts.replace('`*:role/OrganizationAccountAccessRole`', '`*:role/hearth-break-glass`'),
        setUp,
      ),
    ).toEqual(['security-alerts.md: the SCP names no *:role/OrganizationAccountAccessRole'])
    expect(landingZoneProblems(alerts.replace('moves it back into its own OU', 'stays where it is'), setUp)).toEqual([
      'security-alerts.md: no "moves it back into its own OU"',
    ])
    // Step 4's check: the refusal's words, made before the cut-off, from a session issued before it, in
    // step 4 itself, and the cut-off moved later when none comes.
    expect(landingZoneProblems(alerts.replace('explicit deny in a service control policy', 'error'), setUp)).toEqual([
      step4Missing,
    ])
    expect(
      landingZoneProblems(
        alerts.replace('checks before the cut-off that it binds', 'checks once the cut-off has passed that it binds'),
        setUp,
      ),
    ).toEqual([step4Missing])
    expect(landingZoneProblems(alerts.replace('issued before the cut-off', 'issued at any time'), setUp)).toEqual([
      step4Missing,
    ])
    expect(
      landingZoneProblems(
        alerts.replace(` ${scpCheck}`, '').replace('5. Looks in the trail.', `5. Looks in the trail. ${scpCheck}`),
        setUp,
      ),
    ).toEqual([step4Missing])
    expect(landingZoneProblems(alerts.replace(scpLater, 'If none is refused, wait.'), setUp)).toEqual([step4NotLater])
    expect(landingZoneProblems(alerts.replace('5. Looks in the trail.', 'Looks in the trail.'), setUp)).toEqual([
      step4Missing,
      step4NotLater,
      step4NoFolder,
    ])
    // Each probe signs out in its folder: the sign-out round 15 left in management, in no folder, fails
    // (C0.11 review 16b G2).
    expect(landingZoneProblems(alerts.replace(scpSignOut, 'Sign out: `aws sso logout`.'), setUp)).toEqual([
      step4NoFolder,
    ])
    expect(
      landingZoneProblems(alerts.replace(inlineSignOut, 'They sign out with `aws sso logout` and in again.'), setUp),
    ).toEqual([inlineNoFolder])
    // And signs in again in that folder before it probes: no sign-in, one in another folder, or the
    // probe ahead of the sign-in, fails (CodeRabbit after round 16).
    expect(landingZoneProblems(alerts.replace(`, then ${scpSignIn}`, ''), setUp)).toEqual([step4NoSignIn])
    expect(
      landingZoneProblems(alerts.replace(scpSignIn, '`aws sso login --profile hearth-<env>-entry`'), setUp),
    ).toEqual([step4NoSignIn])
    expect(
      landingZoneProblems(
        alerts.replace(`   - ${scpSignOut}\n   - ${scpProbe}`, `   - ${scpProbe}\n   - ${scpSignOut}`),
        setUp,
      ),
    ).toEqual([step4NoSignIn])
    expect(landingZoneProblems(alerts.replace(`, then ${inlineSignIn}`, ''), setUp)).toEqual([inlineNoSignIn])
    expect(
      landingZoneProblems(alerts.replace(inlineSignIn, '`aws sso login --profile <that profile>`'), setUp),
    ).toEqual([inlineNoSignIn])
    expect(
      landingZoneProblems(alerts.replace(`${inlineSignOut} ${inlineProbe}`, `${inlineProbe} ${inlineSignOut}`), setUp),
    ).toEqual([inlineNoSignIn])
    // Management's check: the refusal's words, before the cut-off, in its own paragraph ahead of the
    // revoke, and the cut-off moved later when none comes.
    expect(landingZoneProblems(alerts.replace('explicit deny in an identity-based policy', 'error'), setUp)).toEqual([
      inlineMissing,
    ])
    expect(
      landingZoneProblems(alerts.replace('first sees, before the cut-off, a call', 'first sees a call'), setUp),
    ).toEqual([inlineMissing])
    // From a session issued after the provisioning, so the refusal is the new statement's (CodeRabbit
    // after round 16).
    expect(
      landingZoneProblems(alerts.replace('issued after the provisioning', 'issued before the provisioning'), setUp),
    ).toEqual([inlineMissing])
    expect(landingZoneProblems(alerts.replace(' issued after the provisioning,', ''), setUp)).toEqual([inlineMissing])
    expect(
      landingZoneProblems(alerts.replace(` ${inlineCheck}`, '').replace(revoke, `${revoke}\n- ${inlineCheck}`), setUp),
    ).toEqual([inlineMissing])
    expect(
      landingZoneProblems(
        alerts
          .replace(` ${inlineCheck}`, '')
          .replace('5. Looks in the trail.', `5. Looks in the trail. ${inlineCheck}`),
        setUp,
      ),
    ).toEqual([inlineMissing])
    expect(landingZoneProblems(alerts.replace(inlineLater, 'If none is refused, the Owner waits.'), setUp)).toEqual([
      inlineNotLater,
    ])
    expect(landingZoneProblems(alerts.replace('No SCP binds management.', 'In management:'), setUp)).toEqual([
      inlineMissing,
      inlineNotLater,
      inlineNoFolder,
      noReread,
    ])
    // Management's read after its cut-off: missing, made before the cut-off or after the revoke, without
    // the user's state, or with no redo, fails (C0.11 review 16b G3).
    expect(landingZoneProblems(alerts.replace(`${reread}\n`, ''), setUp)).toEqual([noReread])
    expect(
      landingZoneProblems(
        alerts
          .replace(`${reread}\n`, '')
          .replace(' Then, signed in again', ` ${reread.slice(2)} Then, signed in again`),
        setUp,
      ),
    ).toEqual([noReread])
    expect(
      landingZoneProblems(alerts.replace(`${reread}\n`, '').replace(revoke, `${revoke}\n${reread}`), setUp),
    ).toEqual([noReread])
    expect(landingZoneProblems(alerts.replace(', and whether the user is still disabled', ''), setUp)).toEqual([
      noReread,
    ])
    expect(
      landingZoneProblems(alerts.replace(' the Owner redoes step 1, then moves the cut-off later', ' note it'), setUp),
    ).toEqual([noReread])
    // The read covers every account, the search's finding redoes step 1 too, and the redo is provisioned,
    // checked and followed by the list again (C0.11 review 16b O16b-01, O16b-05, X-02).
    expect(landingZoneProblems(alerts.replace('in every account', 'in management'), setUp)).toEqual([noReread])
    expect(landingZoneProblems(alerts.replace(', or the search below,', ''), setUp)).toEqual([noReread])
    expect(landingZoneProblems(alerts.replace(', provisions the set again and checks again', ''), setUp)).toEqual([
      noReread,
    ])
    expect(
      landingZoneProblems(alerts.replace(', and goes through this list again from its first bullet', ''), setUp),
    ).toEqual([noReread])
    expect(landingZoneProblems('## Steps\n', setUp)).toEqual([
      'security-alerts.md: no "### Containing an unexpected session"',
    ])
    // Only step N counts: the same words in another step don't.
    const moved =
      '### N. Confirm each email subscription\n\nOpen the link.\n\n### O. Next\n\n`--authenticate-on-unsubscribe true` and `ConfirmationWasAuthenticated`\n'
    expect(landingZoneProblems(alerts, moved)).toEqual([
      'aws-account-set-up.md: step N has no --authenticate-on-unsubscribe true',
      'aws-account-set-up.md: step N reads no ConfirmationWasAuthenticated',
    ])
    expect(landingZoneProblems(alerts, '## Steps\n')).toEqual(['aws-account-set-up.md: no step N'])
  })

  it('security-alerts.md and the set-up runbook hold both', () => {
    expect(landingZoneProblems(readRepoFile(SECURITY_ALERTS), readRepoFile(AWS_SET_UP))).toEqual([])
  })
})

// --- RB-08: every table row has its header's cells -------------------------------------------------

// Each table row, outside fenced code, whose cells differ in number from its header's, as "line: its
// cells, its header's", and each with an unescaped | inside backticks, as "line: a | in code". GFM
// splits a row on every pipe no backslash escapes, inside a code span too, and drops the cells past the
// header's, so an unescaped | in a command loses the rest of its row, or splits the command where a row
// is a cell short. A delimiter row whose cells differ from its header's makes no table at all, as
// "line: delimiter n, its header m", and a table in a quote, which the rest doesn't read, is reported
// as "line: a table in a quote"; a delimiter row needs a pipe, so a setext --- under a line with a |
// makes a heading, not a table. A table ends at a blank line or the start of another block (a heading,
// a list item, a quote, a fence).
const TABLE_DELIMITER = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/
const TABLE_ENDS = /^\s*$|^\s*(?:#|>|[-*+]\s|\d+[.)]\s|```|~~~)/
const QUOTED = /^(?:\s*>)+\s?/
const cellCount = (row: string) =>
  row
    .trim()
    .replace(/^\|/, '')
    .replace(/(?<!\\)\|$/, '')
    .split(/(?<!\\)\|/).length
// A code span is a run of backticks up to the next run of the same length.
const pipeInCode = (row: string) =>
  [...row.matchAll(/(?<!`)(`+)(?!`)([\s\S]*?[^`])\1(?!`)/g)].some(span => /(?<!\\)\|/.test(span[2] ?? ''))

function rowsOffHeader(text: string): string[] {
  const lines = text
    .replace(/^[ \t]*(```|~~~)[^\n]*\n[\s\S]*?^[ \t]*\1[^\n]*$/gm, block => block.replace(/[^\n]/g, ' '))
    .split('\n')
  const found: string[] = []
  for (let i = 0; i + 1 < lines.length; i++) {
    const header = lines[i] ?? ''
    const delimiter = lines[i + 1] ?? ''
    if (!header.includes('|') || !delimiter.includes('|')) continue
    if (QUOTED.test(header) && QUOTED.test(delimiter) && TABLE_DELIMITER.test(delimiter.replace(QUOTED, ''))) {
      found.push(`${i + 1}: a table in a quote`)
      continue
    }
    if (!TABLE_DELIMITER.test(delimiter)) continue
    const width = cellCount(header)
    if (cellCount(delimiter) !== width) {
      found.push(`${i + 2}: delimiter ${cellCount(delimiter)}, its header ${width}`)
      continue
    }
    for (i += 2; i < lines.length && !TABLE_ENDS.test(lines[i] ?? ''); i++) {
      const cells = cellCount(lines[i] ?? '')
      if (cells !== width) found.push(`${i + 1}: ${cells}, its header ${width}`)
      if (pipeInCode(lines[i] ?? '')) found.push(`${i + 1}: a | in code`)
    }
  }
  return found
}

describe('RB-08 (C0.11 review 12 CR-19): every table row has its header’s cells, a | in a command escaped', () => {
  it('finds a row an unescaped | splits, one short of cells, one with an unescaped | in code of any backtick run, a delimiter short of its header, or a table in a quote (C0.11 review 12 P2-04, review 13 T13-04, T13-05), on planted text, and passes the rest', () => {
    const text = [
      '| Alert | First check |',
      '|---|---|',
      "| A1 | `jq '.a \\| .b'` |",
      "| A2 | `jq '.a | .b'` |",
      '| A3 |',
      '',
      '```sh',
      '| x | y |',
      '|---|---|',
      '| a | b | c |',
      '```',
      '',
      '  | Indented | Too |',
      '  |---|---|',
      '  | a | b | c |',
      '- a list item | not a row',
      '',
      '| Alert | First check | Note |',
      '|---|---|---|',
      "| A10 | `jq '.a | .b'` |",
      '| A11 | `a` | `b` |',
      '| A12 | ``echo `x` | y`` |',
      '| A13 | ``a ` b`` | `c` |',
      '',
      '| One | Two | Three |',
      '|---|---|',
      '| a | b | c |',
      '',
      '> | Quoted | Table |',
      '> |---|---|',
      '> | x | `a | b` |',
      '',
      'Not | a table',
      '---',
    ].join('\n')
    expect(rowsOffHeader(text)).toEqual([
      '4: 3, its header 2',
      '4: a | in code',
      '5: 1, its header 2',
      '15: 3, its header 2',
      '20: a | in code',
      '22: a | in code',
      '26: delimiter 2, its header 3',
      '29: a table in a quote',
    ])
  })

  it('every table in the runbooks', () => {
    const runbooks = repoFiles().filter(isRunbook).sort()
    expect(runbooks.length).toBeGreaterThan(1)
    expect(runbooks.flatMap(path => rowsOffHeader(readRepoFile(path)).map(row => `${path}:${row}`))).toEqual([])
  })
})

// --- RB-09: main by its full ref in every git command ---------------------------------------------

// A git command that reads or moves a revision, naming main or origin/main by its short name: never after
// a /, so refs/heads/main and refs/remotes/origin/main pass, and never before a /, :, . or -, so a path,
// a refspec's source or another word passes.
const SHORT_MAIN =
  /\bgit\s+(?:-C\s+\S+\s+)?(?:merge-base|rev-parse|rev-list|show|diff|log|checkout|switch|fetch|pull|cat-file|merge|reset)\b[^`]*?(?<![\w/.:+-])(?:origin\/)?main(?![\w/.:-])/

// The code a text holds, each with the line it starts on: its fenced blocks (from the line after the fence),
// then its inline spans of any backtick run.
function codeOf(text: string): Array<[number, string]> {
  const found: Array<[number, string]> = []
  const fenced = /^(```|~~~)[^\n]*\n([\s\S]*?)^\1[^\n]*$/gm
  const lineAt = (from: string, index: number | undefined) => from.slice(0, index).split('\n').length
  for (const block of text.matchAll(fenced)) found.push([lineAt(text, block.index) + 1, block[2] ?? ''])
  const rest = text.replace(fenced, block => block.replace(/[^\n]/g, ' '))
  for (const span of rest.matchAll(/(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/g)) {
    found.push([lineAt(rest, span.index), span[2] ?? ''])
  }
  return found
}

// The lines whose code names main by a short name in a git command.
const shortMainAt = (text: string) =>
  codeOf(text)
    .filter(([, code]) => SHORT_MAIN.test(code))
    .map(([line]) => line)

describe('RB-09 (C0.11 PR 4 review 4 SCRIPTS-01): every git command in a runbook names main by its full ref', () => {
  it('finds main or origin/main by a short name in a fetch, a pull, an ancestry check or the floors loop, inline or fenced, on planted text, and passes the full ref', () => {
    const text = [
      'Fetch first (`git fetch origin main`), then check (`git merge-base --is-ancestor "<commit>" origin/main`).',
      'Pull it: ``git pull origin main``.',
      '```sh',
      'n=; for c in "<commit>"; do git merge-base --is-ancestor "$c" origin/main && n=$c; done',
      '```',
      'Or `git -C clone rev-parse main`, or `git checkout main`.',
      'Fetch (`git fetch origin +refs/heads/main:refs/remotes/origin/main`), then',
      '`m=$(git show-ref --verify --hash refs/remotes/origin/main) && git merge-base --is-ancestor "$c" "$m"`.',
      'A `git pull` on branch main, never a pull given `origin main`, and the file `infra/main.ts`.',
      'A checkout of `main`, and `git log --oneline maintenance`.',
    ].join('\n')
    expect(shortMainAt(text)).toEqual([4, 1, 1, 2, 6, 6])
  })

  it('no runbook names main by a short name in a git command', () => {
    const runbooks = repoFiles().filter(isRunbook).sort()
    expect(runbooks.length).toBeGreaterThan(1)
    expect(runbooks.flatMap(path => shortMainAt(readRepoFile(path)).map(line => `${path}:${line}`))).toEqual([])
  })
})
