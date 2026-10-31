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
//   path is a file; an access action (ADMIN_ACTIONS or SELF_ACTIONS) is one a server handler
//   serves, named as action: '<name>' outside tests; and any other name (a log event, an audit
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
//   only new sessions, so an SCP keyed on aws:TokenIssueTime ends the live ones), and the set-up's
//   step N confirming each alert subscription with authentication and reading it back
//   (--authenticate-on-unsubscribe true, ConfirmationWasAuthenticated), since CloudFormation can't.
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
  if (/^(?:apps|packages|db|docs|scripts|infra)\//.test(name)) return world.files.has(name) ? undefined : 'no such file'
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
    files: new Set(['apps/server/src/admin/people.ts']),
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
      '- `person.reset_pin`, `person.change_phone`',
      '- `sms_provider_unstated`, `PIN_RULE_SESSION`, `sms_provider_lost`',
    ].join('\n')
    expect(missingCodePaths('a.md', text, planted)).toEqual([
      'a.md: gone(): no migration creates that function',
      'a.md: nowhere(): no migration creates that function',
      'a.md: /api/admin/cases: the api registers no such path',
      'a.md: /dpo/cases: the web app has no such path',
      'a.md: apps/server/src/admin/cases.ts: no such file',
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
  })
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

// What security-alerts.md and the set-up runbook leave out of the two steps no code can hold
// (C0.11 review 1 DETECTION-05, DETECTION-08; TECH-SPEC T24 items 4 and 5).
function landingZoneProblems(alerts: string, setUp: string): string[] {
  const found: string[] = []
  const containment = alerts.split(/^### Containing an unexpected session$/m)[1]?.split(/^##+ /m)[0]
  if (containment === undefined) found.push('security-alerts.md: no "### Containing an unexpected session"')
  else {
    if (!/\bstops only new sessions\b/.test(containment)) found.push('security-alerts.md: no "stops only new sessions"')
    if (!containment.includes('aws:TokenIssueTime')) found.push('security-alerts.md: no aws:TokenIssueTime')
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

describe('RB-07 (C0.11 review 1 DETECTION-05, DETECTION-08): the landing zone’s runbooks keep containment and authenticated subscriptions', () => {
  it('finds each gap on planted text, and passes the right words', () => {
    const alerts =
      '## Steps\n\n### Containing an unexpected session\n\nRemoving someone from a group stops only new sessions, so an SCP denies where `aws:TokenIssueTime` is before then.\n\n## Check it worked\n'
    const setUp =
      '### N. Confirm each email subscription\n\n`aws sns confirm-subscription --authenticate-on-unsubscribe true`, then `ConfirmationWasAuthenticated` prints `true`.\n\n### O. Next\n'
    expect(landingZoneProblems(alerts, setUp)).toEqual([])
    expect(landingZoneProblems(alerts.replace('stops only new sessions', 'ends every session'), setUp)).toEqual([
      'security-alerts.md: no "stops only new sessions"',
    ])
    expect(landingZoneProblems(alerts.replace('aws:TokenIssueTime', 'aws:CurrentTime'), setUp)).toEqual([
      'security-alerts.md: no aws:TokenIssueTime',
    ])
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
