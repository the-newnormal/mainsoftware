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
// - RB-09 (C0.11 PR 4 review 4 SCRIPTS-01): no git command in a runbook's code names main by a short name
//   (`main`, `origin/main`, `origin/HEAD` or `origin`), only by its full ref (refs/remotes/origin/main, read
//   with git show-ref --verify, after git fetch origin +refs/heads/main:refs/remotes/origin/main): a tag of
//   any short name, which anyone who can push a branch can push and a plain git pull brings, wins its lookup
//   (git only warns that it is ambiguous), so a forged record's commit would read as on main, and a fetch or
//   pull given `origin main` takes such a tag over the branch. Code is read as GFM renders it: fenced blocks
//   (backticks or tildes after any indent, list or quote marker, closed only by a run of the same character at
//   least as long), indented blocks (four columns past the list item or quote a line sits in, or opened by a list
//   marker's fifth blank, unless it continues a paragraph) and inline spans; a line of HTML that shows code (<pre>,
//   <code>, <kbd> …) is found outright. Each piece is split into commands as bash splits it (quotes and escapes
//   taken off, a line ended by \ joined to the next, a $(…) or `…` read as commands of its own, a comment skipped,
//   a <placeholder> read as text), so a later command that only says main isn't one (review 5 GUARDS-02), and a
//   word that holds code of its own (what bash -c, ssh, env -S or eval runs) is read as code too. A runbook's code
//   is read as one script: a variable a git command expands takes every value any span or block gives it, joined
//   into the word as bash joins it, so a full ref built from parts passes and a short name built from parts is
//   found; a variable the runbook never sets, one bash sets ($_, BASH_REMATCH, a positional parameter), one given
//   an array, appended to, set by read, mapfile, getopts, let, printf -v, a declaration with an option or a ${…}
//   operator, any variable of a runbook that evals or sources, an unquoted expansion or a *, ? or [ outside quotes
//   in git's words or a for list (which bash splits and matches against file names), and output that reaches git
//   but git show-ref --hash's (a printf that joins words, rev-parse --abbrev-ref or a file can print a short name;
//   only git credential takes piped input) are computed (EXPAND-A4-01, round 6). Code that runs git (a word that is
//   git, a path ending /git or git-<command>, a value that is, or a command named by an expansion of one) is also
//   found where bash computes text no word holds: a here-document, a process substitution, ANSI-C or locale
//   quoting, an unquoted brace expansion, arithmetic, a ( inside a word (an array's list or an extended pattern),
//   any ${…} but a plain ${NAME}, a function's definition, a command named by an expansion, and eval, source, read,
//   mapfile, readarray, alias, let, getopts, hash, enable, trap, coproc, printf -v and a declaration with an option
//   (EXPAND-A3-02, round 6). In a command that runs git every word after git is read, whatever the subcommand, but
//   the value of git's own -C, -c, --git-dir, --work-tree, --namespace or --config-env ahead of the subcommand and
//   the repository a fetch, pull, push or ls-remote names first; in code that runs git, so is the value a variable
//   is set to, a for loop's list and set's words as written, and every word of a command substituted into git's
//   words or into such a value. A word names main when a part of it between =, :, .., a blank, < or > (an option's
//   value, a refspec's or a tree-ish's two sides, a range's ends, a word bash would split), past a leading -, + or
//   ^ and a trailing }, and cut at ^, ~ or @{, is main, origin, or a name ending /main or /HEAD that doesn't start
//   refs/. A name that reaches git another way (read from a file, git's own configuration or aliases, the person's
//   own shell aliases and functions, or a git put on the PATH under another name) isn't seen: review keeps that
//   out.
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

// A part of a word as bash builds it: text, with whether it was quoted (so neither split nor matched against
// file names); a parameter ($NAME, ${NAME}, $1, $@, $_ …), with whether it was quoted; or a command
// substitution's output ($(…), `…`), whose commands are listed.
type WordPart = { text: string; quoted: boolean } | { name: string; quoted: boolean } | { output: ShellCommand[] }

// A shell command as bash splits it: its words with their quotes and escapes taken off (a parameter kept as
// written, a command substitution's place holding a stand-in that names nothing), each word's parts and where
// it starts and ends in the code, and where the command starts. A command substitution's commands are
// commands of their own whose output is part of the command they sit in (parent); a command whose output a
// pipe hands to the next names that one (pipeTo). A word starting with # begins a comment, which runs nothing.
// A placeholder a runbook asks the person to fill in (<commit>, <chosen commit>: a < and a lower-case word or
// words, without a / or a quote, and a >) is a word's text, never a redirection.
type ShellCommand = {
  at: number
  words: string[]
  parts: WordPart[][]
  spans: Array<[number, number]>
  parent?: ShellCommand
  pipeTo?: ShellCommand
}

// A span's or block's commands, and where bash computes text the reader can't take as written (computed): a
// here-document's body, a process substitution, ANSI-C or locale quoting ($'…', $"…"), an unquoted brace
// expansion ({a,b}, {a..b}), an arithmetic expansion or command ($((…)), ((…))), a function's definition, a (
// inside a word (an array's list, NAME=(…), or an extended pattern, @(…)), and any ${…} but a plain ${NAME} (a
// default, an alternative, an assignment, a substitution, a slice, a case change or an indirection all hand
// git text no word holds). Besides: the names given an array, and the names a ${…} operator reads or sets
// (operated), whose values the reader never knows.
type ShellCode = { commands: ShellCommand[]; computed: number[]; arrays: string[]; operated: string[] }

const PLACEHOLDER = /<[a-z][a-z0-9 _'-]*>/y
const PARAMETER = /\$(?:([A-Za-z_][A-Za-z0-9_]*)|([0-9@*#?$!-]))/y
const ARRAY_TARGET = /^([A-Za-z_][A-Za-z0-9_]*)(?:\[[^\]]*\])?\+?=$/

function shellCode(code: string): ShellCode {
  const commands: ShellCommand[] = []
  const computed: number[] = []
  const arrays: string[] = []
  const operated: string[] = []
  let i = 0
  // Reads commands to the end of the code, or to close (the ) of a $(…), or the ` that ends a `…`), each a
  // part of parent when it sits in one's word; returns the commands it read, its substitutions' included.
  const list = (close?: string, parent?: ShellCommand): ShellCommand[] => {
    const first = commands.length
    const fresh = (): ShellCommand => ({ at: -1, words: [], parts: [], spans: [], parent })
    let current = fresh()
    let word: string | undefined
    let parts: WordPart[] = []
    let from = 0
    let piped: ShellCommand | undefined
    let brace = 0
    let braceList = false
    const add = (part: WordPart, written: string) => {
      if (current.at < 0) current.at = i
      if (word === undefined) {
        word = ''
        from = i
      }
      word += written
      const last = parts[parts.length - 1]
      if ('text' in part && last !== undefined && 'text' in last && last.quoted === part.quoted) last.text += part.text
      else parts.push(part)
    }
    const append = (text: string, quoted: boolean) => add({ text, quoted }, text)
    const endWord = () => {
      if (word !== undefined) {
        current.words.push(word)
        current.parts.push(parts)
        current.spans.push([from, i])
      }
      word = undefined
      parts = []
      brace = 0
      braceList = false
    }
    // Ends the command; with pipe, its output goes to the next command this list reads.
    const endCommand = (pipe = false) => {
      endWord()
      if (current.words.length === 0) return
      commands.push(current)
      if (piped !== undefined) piped.pipeTo = current
      piped = pipe ? current : undefined
      current = fresh()
    }
    const substitution = (end: string) => {
      const output = list(end, current)
      return { output }
    }
    // ${…} at i (the $): a parameter when it holds a name or a position alone, else computed.
    const braced = (quoted: boolean) => {
      const close = code.indexOf('}', i + 2)
      if (close < 0) {
        append('$', quoted)
        i++
        return
      }
      const inner = code.slice(i + 2, close)
      const written = code.slice(i, close + 1)
      if (/^(?:[A-Za-z_][A-Za-z0-9_]*|[0-9]+)$/.test(inner)) add({ name: inner, quoted }, written)
      else {
        computed.push(i)
        const name = /^[!#]?([A-Za-z_][A-Za-z0-9_]*)/.exec(inner)?.[1]
        if (name !== undefined) operated.push(name)
        add({ text: written, quoted }, written)
      }
      i = close + 1
    }
    // $NAME, a position or a special parameter at i; false when the $ stands for itself.
    const plain = (quoted: boolean) => {
      PARAMETER.lastIndex = i
      const match = PARAMETER.exec(code)
      if (match === null) return false
      add({ name: match[1] ?? match[2] ?? '', quoted }, match[0])
      i += match[0].length
      return true
    }
    while (i < code.length) {
      const ch = code[i] ?? ''
      const next = code[i + 1] ?? ''
      if (ch === close) {
        i++
        break
      }
      PLACEHOLDER.lastIndex = i
      const placeholder = ch === '<' ? PLACEHOLDER.exec(code) : null
      if (placeholder !== null) {
        append(placeholder[0], true)
        i += placeholder[0].length
      } else if (ch === '\\') {
        if (next !== '\n') append(next, true)
        i += 2
      } else if (ch === ' ' || ch === '\t') {
        endWord()
        i++
      } else if (ch === '|') {
        // A pipe hands its output on; || and |& are a list's and a pipe's own operators.
        const pipe = next !== '|'
        endCommand(pipe)
        i += next === '|' || next === '&' ? 2 : 1
      } else if (ch === '(') {
        // A subshell's ( ends the command before it. Inside a word it is an array's list or an extended
        // pattern, and with ( or ) after it a function's definition or an arithmetic command: all computed.
        if (word !== undefined || next === ')' || next === '(') computed.push(i)
        const target = word === undefined ? undefined : ARRAY_TARGET.exec(word)?.[1]
        if (target !== undefined) arrays.push(target)
        endCommand()
        i++
      } else if (ch === '\n' || ch === ';' || ch === ')' || (ch === '&' && next !== '>')) {
        endCommand()
        i++
      } else if (ch === '<' || ch === '>' || ch === '&') {
        // A redirection's operator (<, >>, >&, &>, <<<, >|): its target is a word of the command. A
        // here-document (<<, <<-) and a process substitution (<(…), >(…)) are computed.
        endWord()
        const start = i
        while (i < code.length && '<>&|'.includes(code[i] ?? '')) i++
        const operator = code.slice(start, i)
        if ((operator.startsWith('<<') && !operator.startsWith('<<<')) || code[i] === '(') computed.push(start)
      } else if (ch === '#' && word === undefined) {
        while (i < code.length && code[i] !== '\n') i++
      } else if (ch === "'" || (ch === '$' && next === "'")) {
        const ansi = ch === '$'
        if (ansi) computed.push(i)
        append('', true)
        i += ansi ? 2 : 1
        while (i < code.length && code[i] !== "'") {
          const escaped = ansi && code[i] === '\\'
          append(code[i + (escaped ? 1 : 0)] ?? '', true)
          i += escaped ? 2 : 1
        }
        i++
      } else if (ch === '"' || (ch === '$' && next === '"')) {
        if (ch === '$') {
          computed.push(i)
          i++
        }
        append('', true)
        i++
        while (i < code.length && code[i] !== '"') {
          const c = code[i] ?? ''
          const n = code[i + 1] ?? ''
          if (c === '\\' && n === '\n') i += 2
          else if (c === '\\' && n !== '' && '$`"\\'.includes(n)) {
            append(n, true)
            i += 2
          } else if (c === '$' && n === '{') {
            braced(true)
          } else if (c === '$' && n === '(') {
            if (code[i + 2] === '(') computed.push(i)
            i += 2
            add(substitution(')'), '\0')
          } else if (c === '`') {
            i++
            add(substitution('`'), '\0')
          } else if (!(c === '$' && plain(true))) {
            append(c, true)
            i++
          }
        }
        i++
      } else if (ch === '$' && next === '{') {
        braced(false)
      } else if (ch === '$' && next === '(') {
        if (code[i + 2] === '(') computed.push(i)
        append('', false)
        i += 2
        add(substitution(')'), '\0')
      } else if (ch === '`') {
        append('', false)
        i++
        add(substitution('`'), '\0')
      } else if (!(ch === '$' && plain(false))) {
        // An unquoted {…} holding a , or a .. is a brace expansion.
        if (ch === '{') brace++
        else if (brace > 0 && (ch === ',' || (ch === '.' && next === '.'))) braceList = true
        else if (brace > 0 && ch === '}') {
          if (braceList) computed.push(i)
          brace--
        }
        append(ch, false)
        i++
      }
    }
    endCommand()
    return commands.slice(first)
  }
  list()
  return { commands, computed, arrays, operated }
}

// Whether a word names main by a short name as a revision: any part of it between =, :, .., a blank, < or >
// (an option's value, either side of a refspec or a tree-ish's path, either end of a range, a word bash would
// split), past a leading -, + or ^ and a trailing }, and cut at ^, ~ or @{, is main, origin
// (refs/remotes/origin/HEAD's shortest name), or any name ending /main or /HEAD that isn't a full ref
// (origin/main, origin/HEAD): a tag of any of these wins its lookup. refs/heads/main, refs/remotes/origin/main,
// HEAD, a path such as infra/main.ts and another word such as maintenance pass.
const namesShortMain = (word: string) =>
  word.split(/=|:|\.\.\.?|[\s<>]+/).some(part => {
    const name =
      part
        .replace(/^[-+^]+/, '')
        .replace(/\}+$/, '')
        .split(/[\^~]|@\{/, 1)[0] ?? ''
    return name === 'main' || name === 'origin' || (/\/(?:main|HEAD)$/.test(name) && !name.startsWith('refs/'))
  })

// git, by name or by path, and any of its own commands run directly (git-merge-base, …/git-core/git-log).
const isGit = (word: string) => /(?:^|\/)git(?:-[A-Za-z0-9-]+)?$/.test(word)

// git's own options, before the subcommand, whose value is a folder, a namespace or a setting, never a revision.
const GIT_PATH_OPTIONS = ['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--config-env']

// The subcommands whose first word that isn't an option names the repository (origin), never a revision.
const REPOSITORY_FIRST = ['fetch', 'pull', 'push', 'ls-remote']

// Where the words a command gives git stand, whatever its subcommand (merge-base, ls-tree, worktree, archive,
// describe…): every word after git (git itself as a word or a path's last part, after a keyword, an assignment
// or another program such as xargs) but the value of one of GIT_PATH_OPTIONS before the subcommand, and the
// repository a fetch, pull, push or ls-remote names first.
function gitArguments(words: readonly string[]): number[] {
  const start = words.findIndex(isGit)
  if (start < 0) return []
  const found: number[] = []
  let j = start + 1
  for (; j < words.length && (words[j] ?? '').startsWith('-'); j++) {
    const word = words[j] ?? ''
    if (GIT_PATH_OPTIONS.includes(word)) j++
    else if (!GIT_PATH_OPTIONS.some(option => option.startsWith('--') && word.startsWith(`${option}=`))) found.push(j)
  }
  const rest = words.map((_, k) => k).slice(j)
  if (REPOSITORY_FIRST.includes(words[rest[0] ?? -1] ?? '')) {
    const repository = rest.findIndex((k, n) => n > 0 && !(words[k] ?? '').startsWith('-'))
    if (repository > 0) rest.splice(repository, 1)
  }
  return [...found, ...rest]
}

// The values a command sets a variable to (NAME=value, alone or as an export's word), a for loop's list and
// set's positional parameters, which code that runs git can hand to it.
const ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)(?:\[[^\]]*\])?(\+?)=/
const variableValues = (words: readonly string[]): string[] => [
  ...words.filter(word => ASSIGNMENT.test(word)).map(word => word.replace(ASSIGNMENT, '')),
  ...(['for', 'select'].includes(words[0] ?? '') && words[2] === 'in' ? words.slice(3) : []),
  ...(words[0] === 'set' ? words.slice(1) : []),
]

// A command's name, past the keywords and assignments ahead of it; none for a for, select or case header.
const KEYWORDS = new Set(['if', 'then', 'elif', 'else', 'fi', 'do', 'done', 'while', 'until', '!', '{', '}', 'time'])
const nameAt = (words: readonly string[]): number =>
  ['for', 'select', 'case'].includes(words[0] ?? '')
    ? -1
    : words.findIndex(word => !KEYWORDS.has(word) && !ASSIGNMENT.test(word))
const commandName = (words: readonly string[]): string | undefined => words[nameAt(words)]

// The builtins that set a variable from input or by name, run text as code, or define or map a command, none of
// which the reader sees as the words git gets; printf -v and a declaration given an option (declare -n, a
// reference to another variable, or -a, an array) join them.
const COMPUTING = new Set([
  'alias',
  'eval',
  'source',
  '.',
  'read',
  'mapfile',
  'readarray',
  'function',
  'let',
  'getopts',
  'hash',
  'enable',
  'trap',
  'coproc',
])
const DECLARING = new Set(['declare', 'typeset', 'local', 'export', 'readonly'])
// The variables a command sets other than by NAME=value: read's, mapfile's and getopts' names, printf -v's,
// let's, and a declaration's under an option.
function setByName(words: readonly string[]): string[] {
  const at = nameAt(words)
  const name = words[at] ?? ''
  const rest = words.slice(at + 1)
  const names = (from: readonly string[]) =>
    from.map(word => /^([A-Za-z_][A-Za-z0-9_]*)/.exec(word)?.[1]).filter(found => found !== undefined)
  if (['read', 'mapfile', 'readarray', 'getopts', 'let'].includes(name)) return names(rest)
  if (name === 'printf')
    return names(
      rest.flatMap((word, k) => (word === '-v' ? [rest[k + 1] ?? ''] : word.startsWith('-v') ? [word.slice(2)] : [])),
    )
  if (DECLARING.has(name) && rest.some(word => /^[-+]/.test(word)))
    return names(rest.filter(word => !/^[-+]/.test(word)))
  return []
}
const computes = (words: readonly string[]) => {
  const name = commandName(words)
  if (name === undefined) return false
  return /[$\0]/.test(name) || COMPUTING.has(name) || setByName(words).length > 0
}

// Whether a command runs git; whether a pipe hands its output to one that does (through others too); and the
// one that receives it.
const runsGit = (command: ShellCommand) => command.words.some(isGit)
const receivingGit = (command: ShellCommand): ShellCommand | undefined =>
  command.pipeTo === undefined ? undefined : runsGit(command.pipeTo) ? command.pipeTo : receivingGit(command.pipeTo)
// Whether a command sits in the word of one that runs git or hands git its output, or of a variable's value or
// a for list: its words reach git as that word's text.
const feedsGit = (command: ShellCommand): boolean =>
  command.parent !== undefined &&
  (runsGit(command.parent) ||
    receivingGit(command.parent) !== undefined ||
    feedsGit(command.parent) ||
    command.parent.words.some(word => ASSIGNMENT.test(word)) ||
    ['for', 'select', 'set'].includes(command.parent.words[0] ?? ''))

// The one output the reader lets reach git: git show-ref's with --hash, which prints object names alone (the
// full ref it is given is read as any git command's is). Any other command's output, git's own included
// (rev-parse --abbrev-ref prints origin/main), or a printf's or a sed's that joins or rewrites its words, could
// be main's short name.
function printsHashes(command: ShellCommand): boolean {
  if (!isGit(commandName(command.words) ?? '')) return false
  const words = gitArguments(command.words).map(k => command.words[k] ?? '')
  return words[0] === 'show-ref' && words.some(word => /^--hash(?:=\d+)?$/.test(word))
}

// The code a text holds, each piece with the line it starts on, as GFM renders it: its fenced blocks (a run of
// three or more backticks or tildes, after any indent, list markers or quote markers, closed by a run of the
// same character at least as long with nothing after it, within three columns of the fence's own list item,
// or else by the end of that item or of the file), its indented blocks (a line four or more columns past the
// content of the list item it sits in, past a quote's marker, or past the margin outside both, that doesn't
// continue a paragraph, and the rest of a list marker's line after its fifth blank), then the inline spans of
// any backtick run in what is left. Each line's quote markers (a > after any indent) are taken off first. A
// reading that takes more for code than GFM does only reads more.
const QUOTE = /^(?:[ \t]*>[ \t]?)+/
const SPAN = /(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/g
const LIST_MARKER = /^( *)([-+*]|\d{1,9}[.)])( +|$)/
const FENCE = /^( *)(`{3,}|~{3,})(.*)$/
const expandTabs = (line: string) =>
  [...line].reduce((out, ch) => (ch === '\t' ? out + ' '.repeat(4 - (out.length % 4)) : out + ch), '')
const columnOf = (line: string) => line.length - line.trimStart().length
function codeOf(text: string): { pieces: Array<[number, string]>; prose: string } {
  const found: Array<[number, string]> = []
  const rest: string[] = []
  const open: number[] = []
  let fence: { char: string; length: number; margin: number; start: number; body: string[] } | undefined
  let indented: { start: number; body: string[] } | undefined
  let paragraph = false
  const endFence = () => {
    if (fence !== undefined) found.push([fence.start, fence.body.join('\n')])
    fence = undefined
  }
  const endIndented = () => {
    if (indented !== undefined) found.push([indented.start, indented.body.join('\n')])
    indented = undefined
  }
  text.split('\n').forEach((raw, index) => {
    const number = index + 1
    const unquoted = raw.replace(QUOTE, '')
    const line = expandTabs(unquoted)
    const blank = line.trim() === ''
    const column = columnOf(line)
    if (fence !== undefined) {
      // A line less indented than the fence's list item ends that item, and the fence with it.
      if (blank || column >= fence.margin) {
        const closing = FENCE.exec(line)
        if (
          closing !== null &&
          column <= fence.margin + 3 &&
          (closing[2] ?? '')[0] === fence.char &&
          (closing[2] ?? '').length >= fence.length &&
          (closing[3] ?? '').trim() === ''
        )
          endFence()
        else fence.body.push(unquoted)
        rest.push('')
        return
      }
      endFence()
    }
    if (blank) {
      indented?.body.push('')
      paragraph = false
      rest.push(raw)
      return
    }
    // A quote starts its own margin: a line in one is read against the quote's content alone, and leaves the
    // list items around it open.
    const quoted = unquoted !== raw
    const listStart = LIST_MARKER.exec(line) !== null && column < (open[open.length - 1] ?? 0) + 4
    if (!quoted && !(paragraph && !listStart))
      while (open.length > 0 && column < (open[open.length - 1] ?? 0)) open.pop()
    let margin = quoted ? 0 : (open[open.length - 1] ?? 0)
    if (column >= margin + 4 && !paragraph) {
      if (indented === undefined) indented = { start: number, body: [] }
      indented.body.push(unquoted)
      rest.push('')
      return
    }
    endIndented()
    // Each list marker opens an item whose content starts past it and up to four blanks after it; past five or
    // more, the item opens with an indented block.
    let content = line
    let start = 0
    let opensBlock = false
    for (let marker = LIST_MARKER.exec(content); marker !== null; marker = LIST_MARKER.exec(content)) {
      const blanks = (marker[3] ?? '').length
      const width = (marker[1] ?? '').length + (marker[2] ?? '').length + (blanks > 4 || blanks === 0 ? 1 : blanks)
      start += width
      if (!quoted) open.push(start)
      content = content.slice(width)
      opensBlock = blanks > 4 && content.trim() !== ''
      if (blanks > 4) break
    }
    if (opensBlock) {
      indented = { start: number, body: [content] }
      paragraph = false
      rest.push('')
      return
    }
    margin = quoted ? start : (open[open.length - 1] ?? 0)
    const opening = FENCE.exec(content)
    if (opening !== null && !((opening[2] ?? '')[0] === '`' && (opening[3] ?? '').includes('`'))) {
      fence = {
        char: (opening[2] ?? '')[0] ?? '',
        length: (opening[2] ?? '').length,
        margin,
        start: number + 1,
        body: [],
      }
      paragraph = false
      rest.push('')
      return
    }
    // A heading, a table row or a thematic break ends a paragraph; any other text starts or continues one.
    paragraph = !/^\s*(?:#{1,6}(?:\s|$)|\||(?:[-*_=]\s*){3,}$)/.test(content)
    rest.push(raw)
  })
  endFence()
  endIndented()
  const left = rest.join('\n')
  const lineAt = (index: number | undefined) => left.slice(0, index).split('\n').length
  for (const span of left.matchAll(SPAN)) found.push([lineAt(span.index), span[2] ?? ''])
  return { pieces: found, prose: left.replace(SPAN, span => span.replace(/[^\n]/g, ' ')) }
}

// HTML a page shows as code, which the reader doesn't take apart: a runbook writes code in backticks or a
// fence, never in these.
const HTML_CODE = /<(?:pre|code|kbd|samp|tt|xmp|listing|plaintext)\b/i

// One runbook's code read as one script: every piece, and every word in it that holds code of its own (bash
// -c's, ssh's, env -S's, eval's), each with the piece it sits in and the line its findings go to.
type Unit = { shell: ShellCode; lineOf: (at: number) => number; piece: number; depth: number }

// The variables bash sets itself, which a runbook never gives a value: $_ (the last word of the command before),
// REPLY, BASH_REMATCH and the rest, and the positional and special parameters.
const BASH_SETS =
  /^(?:_|REPLY|MAPFILE|OPTARG|OPTIND|PIPESTATUS|COPROC|DIRSTACK|GROUPS|RANDOM|SRANDOM|SECONDS|LINENO|EPOCHSECONDS|EPOCHREALTIME|HISTCMD|PWD|OLDPWD|FUNCNAME|BASH_\w*|COMP_\w*|[0-9]+|[@*#?$!-])$/

// A word's text after expansion (every value, joined), or undefined when bash computes it: the value of a
// variable the runbook sets is each value it is ever given, in any piece; a variable it never sets, one bash
// sets, one an array, a read, an eval anywhere in the runbook or a ${…} operator may set, one appended to (+=),
// and a value set from a computed word are computed. Where bash splits the word and matches it against file
// names (splits: git's own words and a for list, never a variable's value), an unquoted parameter or a *, ?
// or [ outside quotes is computed too. A command substitution passes only when it prints hashes.
type Source = { parts: WordPart[]; computed: boolean; splits: boolean } | 'computed'
type Variables = { table: Map<string, Source[]>; everything: boolean }
const VALUES_LIMIT = 64
function expand(
  parts: readonly WordPart[],
  splits: boolean,
  variables: Variables,
  seen: ReadonlySet<string>,
): string[] | undefined {
  let out = ['']
  for (const part of parts) {
    let values: string[]
    if ('text' in part) {
      if (splits && !part.quoted && /[*?[]/.test(part.text)) return undefined
      values = [part.text]
    } else if ('name' in part) {
      if ((splits && !part.quoted) || variables.everything || BASH_SETS.test(part.name) || seen.has(part.name))
        return undefined
      const sources = variables.table.get(part.name)
      if (sources === undefined) return undefined
      values = []
      for (const source of sources) {
        if (source === 'computed' || source.computed) return undefined
        const value = expand(source.parts, source.splits, variables, new Set([...seen, part.name]))
        if (value === undefined) return undefined
        values.push(...value)
      }
    } else {
      const [command] = part.output
      if (part.output.length !== 1 || command === undefined || !printsHashes(command)) return undefined
      values = ['\0']
    }
    out = out.flatMap(before => values.map(value => before + value))
    if (out.length > VALUES_LIMIT) return undefined
  }
  return out
}

function unitsOf(pieces: ReadonlyArray<[number, string]>): Unit[] {
  const units: Unit[] = []
  const read = (code: string, lineOf: (at: number) => number, piece: number, depth: number) => {
    const shell = shellCode(code)
    units.push({ shell, lineOf, piece, depth })
    if (depth >= 4) return
    for (const command of shell.commands) {
      for (const word of command.words) {
        if (/[\s;&|<>()$`'"\\]/.test(word)) read(word, () => lineOf(command.at), piece, depth + 1)
      }
    }
  }
  pieces.forEach(([line, code], piece) => {
    read(code, at => line + code.slice(0, at).split('\n').length - 1, piece, 0)
  })
  return units
}

function variablesOf(units: readonly Unit[]): Variables {
  const table = new Map<string, Source[]>()
  const set = (name: string, source: Source) => table.set(name, [...(table.get(name) ?? []), source])
  let everything = false
  for (const { shell, depth } of units) {
    for (const name of [...shell.arrays, ...shell.operated]) set(name, 'computed')
    const inWord = (k: number, command: ShellCommand) => {
      const [from, to] = command.spans[k] ?? [0, 0]
      return shell.computed.some(at => at >= from && at < to)
    }
    for (const command of shell.commands) {
      const { words, parts } = command
      // eval and source may set any variable; so may ., but inside a word a . is far likelier jq's.
      if (['eval', 'source', ...(depth === 0 ? ['.'] : [])].includes(commandName(words) ?? '')) everything = true
      for (const name of setByName(words)) set(name, 'computed')
      words.forEach((word, k) => {
        const match = ASSIGNMENT.exec(word)
        if (match === null) return
        const name = match[1] ?? ''
        if (match[2] === '+' || word.slice(name.length).startsWith('[')) {
          set(name, 'computed')
          return
        }
        // The value's parts: the word's past the NAME= ahead of them, which is text.
        let skip = match[0].length
        const value: WordPart[] = []
        for (const part of parts[k] ?? []) {
          if (skip > 0 && 'text' in part) {
            const taken = Math.min(skip, part.text.length)
            skip -= taken
            if (taken < part.text.length) value.push({ text: part.text.slice(taken), quoted: part.quoted })
          } else value.push(part)
        }
        set(name, { parts: value, computed: inWord(k, command), splits: false })
      })
      if (['for', 'select'].includes(words[0] ?? '')) {
        const name = words[1] ?? ''
        if (words[2] !== 'in') set(name, 'computed')
        else
          for (let k = 3; k < words.length; k++)
            set(name, { parts: parts[k] ?? [], computed: inWord(k, command), splits: true })
      }
    }
  }
  return { table, everything }
}

// The lines on which code that runs git names main by a short name or computes text the reader can't take as
// written, piece by piece. A runbook's code is read as one script: a variable a git command expands takes every
// value any piece gives it. In code that runs git (a word that is git, a value that is, or a command named by an
// expansion that may be), git's own words are expanded and read; the values a variable, a for loop's list or
// set takes there, and every word of a command substituted into git's words or into such a value, are read as
// written; and a command whose output a pipe hands to git is found, unless git reads it as a credential
// helper's input or it prints hashes. Last, each line of HTML that shows code.
function shortMainAt(text: string): number[] {
  const { pieces, prose } = codeOf(text)
  const units = unitsOf(pieces)
  const variables = variablesOf(units)
  const byPiece = pieces.map(() => new Set<number>())
  for (const { shell, lineOf, piece } of units) {
    // A command named by an expansion that a value any piece sets makes git (G=git, then "$G" log).
    const namedByExpansion = (command: ShellCommand) => {
      const at = nameAt(command.words)
      if (!/[$\0]/.test(command.words[at] ?? '')) return false
      return expand(command.parts[at] ?? [], false, variables, new Set())?.some(isGit) === true
    }
    const gitRuns = shell.commands.some(
      command => runsGit(command) || variableValues(command.words).some(isGit) || namedByExpansion(command),
    )
    const found = byPiece[piece]
    if (!gitRuns || found === undefined) continue
    for (const at of shell.computed) found.add(lineOf(at))
    for (const command of shell.commands) {
      const { at, words, parts, spans } = command
      const inWord = (k: number) =>
        shell.computed.some(position => position >= (spans[k]?.[0] ?? 0) && position < (spans[k]?.[1] ?? 0))
      const read = [...(feedsGit(command) ? words : []), ...variableValues(words)]
      const receiver = receivingGit(command)
      const fed =
        receiver !== undefined &&
        !printsHashes(command) &&
        receiver.words[gitArguments(receiver.words)[0] ?? -1] !== 'credential'
      const expanded =
        runsGit(command) &&
        gitArguments(words).some(k => {
          const values = inWord(k) ? undefined : expand(parts[k] ?? [], true, variables, new Set())
          return values === undefined || values.some(namesShortMain)
        })
      if (computes(words) || fed || expanded || read.some(namesShortMain)) found.add(lineOf(at))
    }
  }
  const html = prose.split('\n').flatMap((line, index) => (HTML_CODE.test(line) ? [index + 1] : []))
  return [...byPiece.flatMap(found => [...found].sort((a, b) => a - b)), ...html]
}

describe('RB-09 (C0.11 PR 4 review 4 SCRIPTS-01, review 5 GUARDS-02): every git command in a runbook names main by its full ref', () => {
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

  it('reads past git’s own options, under any subcommand, in every form of a revision, on planted text', () => {
    const text = [
      '`git -C "$HOME/my clone" merge-base --is-ancestor "$c" origin/main`',
      '`git --no-pager log --oneline origin/main`, `git -c core.pager=cat log origin/main`',
      '`git ls-tree origin/main infra/src/release/floors.ts`, `git worktree add ../x origin/main`',
      '`git archive origin/main`, `git describe --contains origin/main`, `git branch --contains=origin/main`',
      '`git show origin/main:infra/src/release/floors.ts`, `git log origin/main..HEAD`, `git log "$c"...origin/main`',
      '`git rev-parse main^{commit}`, `git rev-list -1 main~1`, `git rev-parse main@{u}`, `git log ^main HEAD`',
      '`git fetch origin main:refs/remotes/origin/main`, `git fetch origin +main:refs/remotes/origin/main`',
      '`c=$(git rev-parse \'origin/main\')`, `git log "$(git rev-parse main)"`, `command git log >&2 origin/main`',
      `\`/usr/bin/git log "\${ref:-origin/main}"\`, \`git --attr-source=origin/main log\``,
      '```sh',
      'git merge-base --is-ancestor \\',
      '  "$c" origin/main',
      'ref=origin/main',
      'for r in main; do git log "$r"; done',
      '```',
    ].join('\n')
    expect(shortMainAt(text)).toEqual([11, 13, 14, 1, 2, 2, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 6, 7, 7, 8, 8, 8, 9, 9])
  })

  // Each variable git is handed has its value in the runbook, as every runbook's check gives it (c="<commit>"):
  // one bash or the person's shell sets is computed (EXPAND-A4-01, round 6).
  it('passes the full ref, git’s option values, a path, another word, a comment, and a later command that only says main, on planted text', () => {
    const text = [
      '```sh',
      'c="<commit>"; git fetch origin +refs/heads/main:refs/remotes/origin/main',
      'm=$(git show-ref --verify --hash refs/remotes/origin/main) || echo stop',
      'git merge-base --is-ancestor "$c" "$m" && echo "the commit is on main"',
      'echo the commit is on main # not git log main',
      '```',
      '   ```sh',
      '   git -C main log refs/remotes/origin/main..HEAD; git -c init.defaultBranch=main log -- infra/main.ts',
      '   ```',
      '`git ls-remote origin refs/heads/main`, `git log origin/main-next maintenance`, `main=1 git log`',
      '`git --work-tree=main --git-dir=main/.git --namespace main log refs/remotes/origin/main`',
      'A `git pull` on branch main, and `ref=origin/main` with no git in its span.',
    ].join('\n')
    expect(shortMainAt(text)).toEqual([])
  })

  // main's other short names, and every way bash hands git text no word holds: an expansion's default or
  // alternative, a here-document, brace expansion, ANSI-C or locale quoting, output piped or substituted into
  // git or into a value, printf -v, read, set, eval, a function and a command named by a variable (EXPAND-A3-02,
  // round 6); and the git line after printf -v, which hands git the value printf -v computed (EXPAND-A4-01,
  // round 6).
  it('finds main by its other short names and each way bash computes what git gets, on planted text', () => {
    const text = [
      `\`git merge-base --is-ancestor "$c" "\${ref-origin/main}"\``,
      `\`ref=1; git merge-base --is-ancestor "$c" "\${ref+origin/main}"\``,
      '`git merge-base --is-ancestor "$c" origin/HEAD`, `git log upstream/main`',
      '`git merge-base --is-ancestor "$c" origin`, `git rev-parse origin^{commit}`',
      '`git merge-base --is-ancestor "$c" origin/{main,}`, `git log origin/ma{i..i}n`',
      `\`git merge-base --is-ancestor "$c" $'origin/\\x6dain'\`, \`git log $"origin/main"\``,
      '`echo origin/main | xargs git merge-base --is-ancestor "$c"`, `printf %s origin/main | git rev-parse --stdin`',
      '`git log "$(echo origin/main)"`, `m=$(printf %s origin/main); git log "$m"`, `set -- origin/main; git log "$1"`',
      `\`git log "\${ref/x/y}"\`, \`git log "\${!ref}"\`, \`git log $((1))\`, \`git rev-parse --stdin < <(echo x)\``,
      '`f() { git log "$1"; }; f x`, `G=git; "$G" log x`, `eval git log x`',
      '```sh',
      'git rev-parse --verify --end-of-options --stdin <<EOF',
      'origin/main',
      'EOF',
      '```',
      '```sh',
      'printf -v m %s origin/main',
      'git merge-base --is-ancestor "$c" "$m"',
      'read -r m',
      '```',
    ].join('\n')
    expect(shortMainAt(text)).toEqual([
      12, 17, 18, 19, 1, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 8, 9, 9, 9, 9, 10, 10, 10,
    ])
  })

  it('passes a repository named first, plain variables, HEAD and @{u}, and output that never reaches git, on planted text', () => {
    const text = [
      'With `c="<commit>"` set: `git fetch origin`, `git fetch --prune origin +refs/heads/main:refs/remotes/origin/main`, `git pull origin`',
      '`git ls-remote origin refs/heads/main`, `git push origin refs/heads/topic`',
      `\`git rev-parse HEAD\`, \`git log "\${c}"\`, \`git cat-file -e <commit>^{commit}\`, \`git log -1 @{u}\``,
      '`git log refs/remotes/origin/HEAD`, `git log "$c"; echo origin/main`',
      `\`printf '%s\\n' "$c" | grep -qxE '[0-9a-f]{40}' && git log "$c"\``,
      `\`printf 'protocol=https\\nhost=github.com\\n\\n' | git credential reject\``,
    ].join('\n')
    expect(shortMainAt(text)).toEqual([])
  })

  // Each way bash or Markdown still handed git a short name past the reader (EXPAND-A4-01, round 6), one text
  // each, and the rest of that class: an array; a value bash splits; values joined or appended; BASH_REMATCH and $_;
  // git inside the word bash -c, env -S or ssh runs; a value set in another span, or never set; output that isn't
  // git show-ref's hashes (a printf that joins its words, rev-parse --abbrev-ref, a file); a git named by a
  // variable or hash -p, or run as git-merge-base; a reference, a read, a ${…} operator or an eval elsewhere; a
  // pattern bash matches against file names; an indented code block (in a list, a quote, a quote in a list, by a
  // tab, or opened by a list marker's fifth blank), a tilde fence in a list item or a quote, a longer fence that a
  // shorter run doesn't close, one a deeper run doesn't close, and HTML.
  it('finds each way bash or Markdown hands git a short name that the reader once missed, on planted text', () => {
    const sh = (...lines: string[]) => ['```sh', ...lines, '```'].join('\n')
    const found = {
      array: sh('c="<commit>"', 'refs=(origin/main)', 'git merge-base --is-ancestor "$c" "$refs"'),
      declaredArray: sh('c="<commit>"', 'declare -a refs=(origin/main)', 'git merge-base --is-ancestor "$c" "$refs"'),
      splitValue: sh('c="<commit>"', "r='origin/main '", 'git merge-base --is-ancestor "$c" $r'),
      splitList: sh(
        'c="<commit>"',
        'refs="origin/main HEAD"',
        'for r in $refs; do git merge-base --is-ancestor "$c" "$r"; done',
      ),
      joined: sh('c="<commit>"', 'r=origin/', `git merge-base --is-ancestor "$c" "\${r}main"`),
      appended: sh('c="<commit>"', 'r=origin/ma', 'r+=in', 'git merge-base --is-ancestor "$c" "$r"'),
      rematch: sh('c="<commit>"', '[[ origin/main =~ .+ ]]', 'git merge-base --is-ancestor "$c" "$BASH_REMATCH"'),
      lastWord: sh('c="<commit>"', 'echo origin/main', 'git merge-base --is-ancestor "$c" "$_"'),
      bashC: `\`bash -c 'git merge-base --is-ancestor "$0" origin/main' "$c"\``,
      envS: '`env -S "git merge-base --is-ancestor $c origin/main"`',
      nested: `\`bash -c 'ssh host "git log origin/main"'\``,
      otherSpan: 'Set `ref=origin/main` and `c="<commit>"`, then run `git merge-base --is-ancestor "$c" "$ref"`.',
      unset: '`git merge-base --is-ancestor "$c" "$REF"`',
      printfJoin: sh('c="<commit>"', 'm=$(printf %s%s origin/ma in)', 'git merge-base --is-ancestor "$c" "$m"'),
      abbrevRef: sh(
        'c="<commit>"',
        'm=$(git rev-parse --abbrev-ref refs/remotes/origin/main)',
        'git merge-base --is-ancestor "$c" "$m"',
      ),
      fileRead: sh('c="<commit>"', 'git merge-base --is-ancestor "$c" "$(cat ref.txt)"'),
      gitNamedElsewhere: 'Set `G=git`, then `"$G" merge-base --is-ancestor x origin/main`.',
      hashed: 'Run `hash -p /usr/bin/git g`, then `g merge-base --is-ancestor x origin/main`.',
      dashed: '`git-merge-base --is-ancestor x origin/main`',
      reference:
        'Set `m=origin/main` and `declare -n r=m`, then `c="<commit>"; git merge-base --is-ancestor "$c" "$r"`.',
      readElsewhere:
        'Run `read -r m`, then `c="<commit>"; m=$(git show-ref --verify --hash refs/remotes/origin/main); git merge-base --is-ancestor "$c" "$m"`.',
      operatorElsewhere: `Run \`: "\${m:=origin/main}"\`, then \`c="<commit>"; m=$(git show-ref --verify --hash refs/remotes/origin/main); git merge-base --is-ancestor "$c" "$m"\`.`,
      evalElsewhere:
        'Run `eval "$SETUP"`, then `c="<commit>"; m=$(git show-ref --verify --hash refs/remotes/origin/main); git merge-base --is-ancestor "$c" "$m"`.',
      glob: sh('c="<commit>"', 'git merge-base --is-ancestor "$c" origin/mai?'),
      indented: 'Run this in the clone:\n\n    git merge-base --is-ancestor "$c" origin/main\n',
      indentedInList: '1. Check it:\n\n        git merge-base --is-ancestor "$c" origin/main\n\n2. Then go on.',
      tabIndented: 'Run:\n\n\tgit log origin/main\n',
      quotedIndented: '> Run:\n>\n>     git log origin/main\n',
      quotedInList: '1. Step\n\n   >     git log origin/main\n',
      itemOpensBlock: '-     git log origin/main\n',
      tildeFenceInQuote: '1. Step\n   - Sub item\n\n     > ~~~\n     > git log origin/main\n     > ~~~\n',
      tildeFenceInList: '1. Check:\n\n   ~~~sh\n   git log origin/main\n   ~~~\n',
      longerFence: '````sh\n```\ngit log origin/main\n````\n',
      deepClosing: '```sh\n    ```\ngit log origin/main\n```\n',
      html: 'Run <code>git log origin/main</code> first.',
    }
    expect(Object.fromEntries(Object.entries(found).map(([name, text]) => [name, shortMainAt(text)]))).toEqual({
      array: [3, 4],
      declaredArray: [3, 4],
      splitValue: [3, 4],
      splitList: [3, 4],
      joined: [4],
      appended: [5],
      rematch: [4],
      lastWord: [4],
      bashC: [1],
      envS: [1],
      nested: [1],
      otherSpan: [1],
      unset: [1],
      printfJoin: [4],
      abbrevRef: [4],
      fileRead: [3],
      gitNamedElsewhere: [1],
      hashed: [1],
      dashed: [1],
      reference: [1],
      readElsewhere: [1],
      operatorElsewhere: [1],
      evalElsewhere: [1],
      glob: [3],
      indented: [3],
      indentedInList: [3],
      tabIndented: [3],
      quotedIndented: [3],
      quotedInList: [3],
      itemOpensBlock: [1],
      tildeFenceInQuote: [5],
      tildeFenceInList: [4],
      longerFence: [2, 3],
      deepClosing: [2, 3],
      html: [1],
    })
  })

  // What the stricter reading still passes: a full ref built from a variable, hashes piped into git, values set
  // in other spans, a full ref in an indented block, a paragraph whose lines run on past its list item's indent,
  // which GFM shows as text, and a runbook's placeholders.
  it('passes a full ref however bash builds it, values from other spans, and text GFM shows as text, on planted text', () => {
    const passes = {
      fullRefFromParts: [
        '```sh',
        'c="<commit>"',
        'prefix=refs/remotes/origin',
        'git merge-base --is-ancestor "$c" "$prefix/main"',
        '```',
      ].join('\n'),
      hashesPiped: '`git show-ref --hash refs/remotes/origin/main | git cat-file --batch-check`',
      valuesElsewhere:
        'Fetch first, `m=$(git show-ref --verify --hash refs/remotes/origin/main)`, set `c="<commit>"`, then run `git merge-base --is-ancestor "$c" "$m"`.',
      indentedFullRef: 'Run:\n\n    git fetch origin +refs/heads/main:refs/remotes/origin/main\n',
      continuedParagraph: '1. A step whose text\n       runs on, indented past the item: git log main is prose here',
      placeholders: '`git merge-base --is-ancestor <chosen commit> <current commit>`',
    }
    expect(Object.fromEntries(Object.entries(passes).map(([name, text]) => [name, shortMainAt(text)]))).toEqual(
      Object.fromEntries(Object.keys(passes).map(name => [name, []])),
    )
  })

  it('no runbook names main by a short name in a git command', () => {
    const runbooks = repoFiles().filter(isRunbook).sort()
    expect(runbooks.length).toBeGreaterThan(1)
    expect(runbooks.flatMap(path => shortMainAt(readRepoFile(path)).map(line => `${path}:${line}`))).toEqual([])
  })
})
