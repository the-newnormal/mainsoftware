// The first-Owner bootstrap script (scripts/owner-bootstrap.ts and scripts/owner-bootstrap/;
// CLAUDE.md, Database › Admin powers; TECH-SPEC T22 items 63 to 71) holds no identifying value,
// reaches nothing but Postgres, prints through one printer, never becomes an override and shares
// the rules it checks rather than copying them. "The script" is scripts/owner-bootstrap.ts and
// every non-test file in scripts/owner-bootstrap/. Each rule is first proved on planted text, then
// held on the real files, as RB-01 to RB-05 do. Code is read from TypeScript's syntax tree, so a
// comment proves nothing (BSG-01 alone reads comments, on purpose):
// - BSG-01 (R1, PD-120): no phone number, email address, AWS account id, ARN or Twilio SID
//   (identifying.ts, which RB-03 shares), nor a number written with 00 for the international prefix
//   or nationally after a trunk 0 (two shapes of BSG-01's own, each of at least ten digits;
//   TESTS-01), in the script, its tests, its check, its harness and its tests, its integration suite
//   or its runbook, comments included. A finding names the file, line and kind, never the value. Allowed,
//   by the whole run of digits once spaces, brackets, dots and dashes are gone, a leading 00 dropped
//   and a trunk 0 read as the United Kingdom's 44: Ofcom's drama range (exactly 447700900 and three
//   more, or that prefix followed by a pattern's three digits); in input.ts alone, the seed's
//   twelve; the id of Kysely's migration lock as the installed Kysely writes it (S3, BSU-12); and a
//   match inside a uuid, which is a uuid's groups, not a number.
// - BSG-02 (PD-116, R7): parseArgs takes exactly --commit and --database, with positionals; only
//   the entry names process.argv; only readEnvironment() in the entry reads process.env, and only
//   the variables section 2.1 lists, by a name the guard can read, deleting OWNER_BOOTSTRAP_INPUT
//   once read; nothing reads process.stdin; the script imports only pg, zod, @hearth/shared,
//   node:util, node:crypto and, in target.ts alone and for readdir alone, node:fs/promises, and its
//   own files by a path ending .ts; nothing names fetch (nor XMLHttpRequest, WebSocket or
//   EventSource). Nothing under apps/ or packages/ loads the
//   script's modules (static or dynamic, re-export, require(), vi.mock()), and only the harness
//   (apps/server/src/testing/owner-bootstrap.ts) names the script's path, to spawn it.
// - BSG-03 (PD-131): no console, process.stdout or process.stderr outside output.ts; the printer
//   takes only the Line union; process.stdout.isTTY is read once, in output.ts, and only for the
//   founder_name line; and the entry's if (import.meta.main), before it calls main(), registers with
//   process.on() a handler for each of uncaughtException and unhandledRejection that exits through
//   report(outcomeOf(…)), and one for each of SIGINT, SIGTERM and SIGHUP that exits through
//   report(interrupted(…)), so Node's own print of an error never runs (TESTS-02, R1).
// - BSG-04 (R4, PD-125): outside steps.ts, db/migrations/, db/tests/, the server's testing/ and
//   scripts/ folders, scripts/check-*.sh, test files and Markdown, nothing names
//   bootstrap_transfer_clearance, hearth.break_glass, twilio_reclear or hearth.owner_bootstrap
//   (coverage.ts may name the function, as data). In steps.ts, twilio_reclear sits only in what
//   recover() alone reaches, every value hearth.break_glass is set to is a literal the guard can
//   follow, recover() sets twilio_reclear, and setUp() and correctNumber() set '' and nothing else.
//   A literal in a type sets nothing, so it isn't read.
// - BSG-05 (R1): every query() in steps.ts takes as its text a literal or a constant from its SQL
//   table (through a helper's parameter only when every call passes one), never a template with ${,
//   a concatenation or a value.
// - BSG-06 (R3, R6, PD-121): every set_config in the script passes true, and none takes a role; no
//   SET, RESET, SESSION AUTHORIZATION, COMMENT ON, ALTER DATABASE, ALTER ROLE or ALTER SYSTEM
//   statement; the role is taken only by the entry's start-up option, exactly section 1.4's string.
//   No migration or seed holds "comment on database", in any case, comments stripped.
// - BSG-07 (PD-118, PD-119, PD-127): input.ts imports normalisePhone, aiCopyIn, flatText,
//   orgNameProblems, TransferFactsBody, transferProblems, NOTICE_TRANSFER_FACTS and
//   NOTICE_FREE_TEXT_FIELDS from @hearth/shared, and holds no regular expression of its own for an
//   AI_COPY word or a transfer fact, nor one for a number outside the fiction rule's and the seed
//   list's own declarations (a heuristic: a pattern naming a word, a fact or a problem code, a
//   country code or a day, or one holding \d, [0-9] or \+); steps.ts reads FLAGS, PURPOSE_KEYS and
//   PROVIDERS, and its recovery statement reads the DPO's record only through public.notice_facts(
//   (the entry as it stood crosses only as opaque ::text).
// - BSG-08 (T22 item 37, PD-124): in the entry, environmentProblems() and the input's parse (a
//   function of input.ts that reaches orgNameProblems()) run before the first connect(), helpers
//   followed where they are called; insert into public.orgs appears only in what steps.ts's setUp()
//   alone reaches, and setUp() takes the parsed document's type, never raw JSON; input.ts calls
//   orgNameProblems() on the organisation field.
// - BSG-09 (PD-133): CI's migrations job runs the check after check-access-sql.ts and before
//   db:types; no workflow runs the script or sets its input; writes.ts's suite union holds
//   'first-owner' and the integration suite starts its stack with firstOrg: 'bootstrap'. The two
//   runbooks name only modes, flags and variables the script (or pg, or Node) reads, every mode is
//   named in a runbook, no runbook reads the input with read or exports it, every command that
//   loads it is one of section 2.1's three forms, first-owner-set-up.md installs with npm ci
//   --ignore-scripts and never a bare npm ci, twilio-withdrawn.md links its "Running the Owner
//   bootstrap script" section, first-owner-set-up.md pauses the deploy pipeline for every run,
//   before it installs the checkout (DOCS-02), and both runbooks resume it, every Ctrl-D comes with
//   Enter, a printed line is named by what it
//   prints (never by its kind in output.ts) and is said to start only with owner-bootstrap:, the
//   set-up runbook checks the AWS CLI's history is off when it loads the input from the secret, and
//   .env.example documents both of the script's variables, commented, with no values.
// - BSG-10 (OD-32): the server image's .dockerignore admits nothing under scripts/.
// - BSG-11 (R2DOCS-03): BUILD-PLAN's C0.12 row and TECH-SPEC item 71's C0.12 bullet give the
//   bootstrap secret to the DPO alone, with the break-glass role only loading it into a run, and
//   never say "readable only under the break-glass role"; the set-up runbook's Who does what says
//   the same, the DPO checks the number in the secret, a run is repeated once a secret that couldn't
//   be read can be (nothing is pasted), and the person on call never checks, reads, views, opens, sees or pastes the
//   secret, the number or the document.
import { existsSync, readFileSync } from 'node:fs'
import { join, posix } from 'node:path'
import { AI_COPY, NOTICE_TRANSFER_FACTS, TRANSFER_PROBLEMS, TransferFactsBody } from '@hearth/shared'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { ACCOUNT_ID, type IdentifyingMatch, identifyingMatches, PHONE_NUMBER } from './identifying'
import { moduleImports, withoutComments } from './imports'
import { readRepoFile, repoFiles, root } from './repo-files'
import { workflowJobs } from './workflow'

const ENTRY = 'scripts/owner-bootstrap.ts'
const DIR = 'scripts/owner-bootstrap/'
const INPUT = `${DIR}input.ts`
const TARGET = `${DIR}target.ts`
const STEPS = `${DIR}steps.ts`
const OUTPUT = `${DIR}output.ts`
const CHECK = 'apps/server/scripts/check-owner-bootstrap.ts'
const HARNESS = 'apps/server/src/testing/owner-bootstrap.ts'
const HARNESS_TEST = 'apps/server/src/testing/owner-bootstrap.test.ts'
const SUITE = 'apps/server/src/auth/first-owner.integration.test.ts'
const RUNBOOK = 'docs/runbooks/first-owner-set-up.md'
const WITHDRAWN = 'docs/runbooks/twilio-withdrawn.md'
const COVERAGE = 'apps/server/src/outbox/coverage.ts'
const WRITES = 'apps/server/src/testing/writes.ts'
const CI = '.github/workflows/ci.yml'
const ENV_EXAMPLE = '.env.example'
const DOCKERIGNORE = 'apps/server/Dockerfile.dockerignore'

// The files the guard reads that this PR adds or changes, so a rename can't pass by reading nothing.
const REQUIRED = [
  ENTRY,
  INPUT,
  TARGET,
  STEPS,
  OUTPUT,
  CHECK,
  HARNESS,
  HARNESS_TEST,
  SUITE,
  RUNBOOK,
  WITHDRAWN,
  WRITES,
  CI,
]

const MODE_FUNCTIONS = ['setUp', 'recover', 'correctNumber'] as const

const isTest = (path: string) => /\.test\.tsx?$/.test(path)
const inScript = (path: string) => path === ENTRY || (path.startsWith(DIR) && path.endsWith('.ts') && !isTest(path))
const isCode = (path: string) => /\.[cm]?[jt]sx?$/.test(path)
const BINARY = /\.(?:png|jpe?g|gif|webp|ico|xlsx|xlsm|xls|docx|pptx|pdf|woff2?|zip|gz)$/i

type Sources = ReadonlyMap<string, string>

// --- Reading code ---------------------------------------------------------------------------------

const parse = (path: string, text: string): ts.SourceFile =>
  ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)

// Every node under a root, in document order.
function nodesOf(top: ts.Node): ts.Node[] {
  const found: ts.Node[] = []
  const visit = (node: ts.Node): void => {
    found.push(node)
    ts.forEachChild(node, visit)
  }
  visit(top)
  return found
}

const lineOf = (node: ts.Node): number => node.getSourceFile().getLineAndCharacterOfPosition(node.getStart()).line + 1
const at = (node: ts.Node): string => `${node.getSourceFile().fileName}:${lineOf(node)}`
const contains = (outer: ts.Node, inner: ts.Node): boolean => outer.pos <= inner.pos && inner.end <= outer.end

// An expression seen through brackets and type assertions: (x), x as T, x satisfies T, <T>x, x!.
function unwrap(node: ts.Expression): ts.Expression {
  let inner = node
  while (
    ts.isParenthesizedExpression(inner) ||
    ts.isAsExpression(inner) ||
    ts.isSatisfiesExpression(inner) ||
    ts.isTypeAssertionExpression(inner) ||
    ts.isNonNullExpression(inner)
  ) {
    inner = inner.expression
  }
  return inner
}

// A string or template literal's text, each ${…} written as ${}; undefined for anything else.
function textOf(node: ts.Node): string | undefined {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (ts.isTemplateExpression(node)) {
    return node.head.text + node.templateSpans.map(span => `\${}${span.literal.text}`).join('')
  }
  return undefined
}

// A literal string or template, with no ${…}: the only text that is constant.
const constantText = (node: ts.Node): string | undefined =>
  ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ? node.text : undefined

// Whether a node sits where only a type can be, which the code never runs.
function inType(node: ts.Node): boolean {
  for (let up = node.parent; up !== undefined; up = up.parent) if (ts.isTypeNode(up)) return true
  return false
}

const MOCKERS = new Set(['mock', 'doMock', 'unmock', 'doUnmock', 'importActual', 'importMock'])

// Whether a call loads the module its first argument names: import(), require() or vi.mock() and
// its kin.
function loadsModule(call: ts.CallExpression): boolean {
  if (call.expression.kind === ts.SyntaxKind.ImportKeyword) return true
  const callee = unwrap(call.expression)
  if (ts.isIdentifier(callee)) return callee.text === 'require'
  return (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    callee.expression.text === 'vi' &&
    MOCKERS.has(callee.name.text)
  )
}

// Whether a literal is a module specifier (an import or export of any kind, or a module loaded or
// mocked by a call), which names a file.
const isSpecifier = (node: ts.Node): boolean =>
  ts.isImportDeclaration(node.parent) ||
  ts.isExportDeclaration(node.parent) ||
  ts.isExternalModuleReference(node.parent) ||
  ts.isLiteralTypeNode(node.parent) ||
  (ts.isCallExpression(node.parent) && node.parent.arguments[0] === node && loadsModule(node.parent))

// The string and template literals a file's code holds, outside types and module specifiers.
function literalsOf(file: ts.SourceFile): { node: ts.Node; text: string }[] {
  return nodesOf(file).flatMap(node => {
    const text = textOf(node)
    return text === undefined || inType(node) || isSpecifier(node) ? [] : [{ node, text }]
  })
}

const propertyName = (name: ts.PropertyName): string | undefined =>
  ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name) ? name.text : undefined

// process.<member>, or process['<member>'].
function isProcessMember(
  node: ts.Node,
  member: string,
): node is ts.PropertyAccessExpression | ts.ElementAccessExpression {
  if (ts.isPropertyAccessExpression(node)) {
    return ts.isIdentifier(node.expression) && node.expression.text === 'process' && node.name.text === member
  }
  if (ts.isElementAccessExpression(node)) {
    return (
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'process' &&
      constantText(node.argumentExpression) === member
    )
  }
  return false
}

// The function a call names: f(…) or x.f(…).
const calleeName = (call: ts.CallExpression): string | undefined => {
  const callee = unwrap(call.expression)
  if (ts.isIdentifier(callee)) return callee.text
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text
  return undefined
}

// A function-like node's name: a declaration's own, or the const it initialises.
function functionName(fn: ts.Node): string | undefined {
  if ((ts.isFunctionDeclaration(fn) || ts.isMethodDeclaration(fn)) && fn.name && ts.isIdentifier(fn.name)) {
    return fn.name.text
  }
  if ((ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) && ts.isVariableDeclaration(fn.parent)) {
    return ts.isIdentifier(fn.parent.name) ? fn.parent.name.text : undefined
  }
  return undefined
}

const isFunctionLike = (node: ts.Node): node is ts.SignatureDeclaration & { body?: ts.Node } =>
  ts.isFunctionDeclaration(node) ||
  ts.isFunctionExpression(node) ||
  ts.isArrowFunction(node) ||
  ts.isMethodDeclaration(node)

// The top-level function (declared, or a const holding one) of a file, by name.
function topFunction(file: ts.SourceFile, name: string): ts.SignatureDeclaration | undefined {
  for (const statement of file.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === name) return statement
    if (ts.isVariableStatement(statement)) {
      for (const decl of statement.declarationList.declarations) {
        const init = decl.initializer && unwrap(decl.initializer)
        if (ts.isIdentifier(decl.name) && decl.name.text === name && init && isFunctionLike(init)) return init
      }
    }
  }
  return undefined
}

// The top-level name a node belongs to: its function's or const's name, or NAME.key for a property
// of a top-level const object (the script's SQL table); undefined at the top level itself.
function ownerOf(node: ts.Node): string | undefined {
  let top: ts.Node = node
  while (top.parent !== undefined && !ts.isSourceFile(top.parent)) top = top.parent
  if (ts.isFunctionDeclaration(top)) return top.name?.text
  if (!ts.isVariableStatement(top)) return undefined
  const decl = top.declarationList.declarations.find(d => contains(d, node))
  if (decl === undefined || !ts.isIdentifier(decl.name)) return undefined
  const init = decl.initializer && unwrap(decl.initializer)
  if (init && ts.isObjectLiteralExpression(init)) {
    const property = init.properties.find(p => contains(p, node))
    const key = property && ts.isPropertyAssignment(property) ? propertyName(property.name) : undefined
    if (key !== undefined) return `${decl.name.text}.${key}`
  }
  return decl.name.text
}

// The names a file declares at its top level (functions, consts, imports), each with its keys when
// it is a const object.
function topNames(file: ts.SourceFile): Map<string, string[]> {
  const names = new Map<string, string[]>()
  for (const statement of file.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) names.set(statement.name.text, [])
    if (ts.isVariableStatement(statement)) {
      for (const decl of statement.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name)) continue
        const init = decl.initializer && unwrap(decl.initializer)
        const keys =
          init && ts.isObjectLiteralExpression(init)
            ? init.properties.flatMap(p => (ts.isPropertyAssignment(p) ? (propertyName(p.name) ?? []) : []))
            : []
        names.set(decl.name.text, keys)
      }
    }
    if (ts.isImportDeclaration(statement)) {
      const bindings = statement.importClause?.namedBindings
      if (statement.importClause?.name) names.set(statement.importClause.name.text, [])
      if (bindings && ts.isNamedImports(bindings)) for (const e of bindings.elements) names.set(e.name.text, [])
      if (bindings && ts.isNamespaceImport(bindings)) names.set(bindings.name.text, [])
    }
  }
  return names
}

const isDeclaredName = (node: ts.Identifier): boolean => {
  const parent = node.parent
  return (
    ((ts.isFunctionDeclaration(parent) ||
      ts.isVariableDeclaration(parent) ||
      ts.isParameter(parent) ||
      ts.isImportSpecifier(parent) ||
      ts.isImportClause(parent) ||
      ts.isPropertyAssignment(parent) ||
      ts.isPropertySignature(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isBindingElement(parent)) &&
      parent.name === node) ||
    (ts.isPropertyAccessExpression(parent) && parent.name === node)
  )
}

// What each top-level name refers to: the top-level names its code mentions (NAME.key for a key of
// a const object, and every key when the object is used whole).
function referenceGraph(file: ts.SourceFile): Map<string, Set<string>> {
  const names = topNames(file)
  const graph = new Map<string, Set<string>>()
  for (const node of nodesOf(file)) {
    if (!ts.isIdentifier(node) || !names.has(node.text) || isDeclaredName(node) || inType(node)) continue
    const from = ownerOf(node)
    if (from === undefined) continue
    const keys = names.get(node.text) ?? []
    const parent = node.parent
    const key = ts.isPropertyAccessExpression(parent) && parent.expression === node ? parent.name.text : undefined
    const targets =
      key !== undefined && keys.includes(key)
        ? [`${node.text}.${key}`]
        : [node.text, ...keys.map(k => `${node.text}.${k}`)]
    const set = graph.get(from) ?? new Set<string>()
    for (const target of targets) set.add(target)
    graph.set(from, set)
  }
  return graph
}

// The roots (mode functions) from which a top-level name is reached, itself included.
function reachers(graph: ReadonlyMap<string, ReadonlySet<string>>, target: string, roots: readonly string[]): string[] {
  return roots.filter(rootName => {
    const seen = new Set<string>([rootName])
    const queue = [rootName]
    while (queue.length > 0) {
      const name = queue.shift() ?? ''
      if (name === target) return true
      for (const next of graph.get(name) ?? []) {
        if (!seen.has(next)) {
          seen.add(next)
          queue.push(next)
        }
      }
    }
    return false
  })
}

// Where a name is bound, seen from a node: a function's parameter (with the function and its
// index), a for-of variable (with the iterated expression), a const's initializer, or an import.
type Binding =
  | { kind: 'param'; fn: ts.SignatureDeclaration; index: number }
  | { kind: 'for-of'; iterated: ts.Expression }
  | { kind: 'value'; init: ts.Expression }
  | { kind: 'import'; from: string; name: string }

function bindingOf(id: ts.Identifier): Binding | undefined {
  const name = id.text
  const declares = (decl: ts.VariableDeclaration) => ts.isIdentifier(decl.name) && decl.name.text === name
  for (let scope: ts.Node | undefined = id.parent; scope !== undefined; scope = scope.parent) {
    if (isFunctionLike(scope)) {
      const index = scope.parameters.findIndex(p => ts.isIdentifier(p.name) && p.name.text === name)
      if (index !== -1) return { kind: 'param', fn: scope, index }
    }
    if (ts.isForOfStatement(scope) && ts.isVariableDeclarationList(scope.initializer)) {
      if (scope.initializer.declarations.some(declares)) return { kind: 'for-of', iterated: scope.expression }
    }
    if (ts.isBlock(scope) || ts.isSourceFile(scope)) {
      for (const statement of scope.statements) {
        if (ts.isVariableStatement(statement)) {
          const decl = statement.declarationList.declarations.find(declares)
          if (decl?.initializer) return { kind: 'value', init: decl.initializer }
        }
        if (
          ts.isSourceFile(scope) &&
          ts.isImportDeclaration(statement) &&
          ts.isStringLiteral(statement.moduleSpecifier)
        ) {
          const bindings = statement.importClause?.namedBindings
          if (bindings && ts.isNamedImports(bindings)) {
            const element = bindings.elements.find(e => e.name.text === name)
            if (element) {
              return {
                kind: 'import',
                from: statement.moduleSpecifier.text,
                name: (element.propertyName ?? element.name).text,
              }
            }
          }
        }
      }
    }
  }
  return undefined
}

// The calls in a file to a function, by its name.
const callsTo = (file: ts.SourceFile, name: string): ts.CallExpression[] =>
  nodesOf(file).filter(
    (node): node is ts.CallExpression =>
      ts.isCallExpression(node) && ts.isIdentifier(unwrap(node.expression)) && calleeName(node) === name,
  )

// A relative import from one script file, as a repository path.
const resolveRelative = (from: string, specifier: string): string =>
  posix.normalize(posix.join(posix.dirname(from), specifier))

const ITERATORS = new Set(['filter', 'some', 'every', 'find', 'findIndex', 'map', 'flatMap', 'forEach'])

// Every string an expression can be, when the guard can follow it: a literal; a const, a for-of
// variable or an imported const (another script file's array) that holds strings; a parameter of a
// named function, through every call's argument; or the element a callback is given by filter(),
// some() and the rest on such an array. undefined when it can't.
function stringsOf(expr: ts.Expression, files: ReadonlyMap<string, ts.SourceFile>, depth = 0): string[] | undefined {
  if (depth > 8) return undefined
  const e = unwrap(expr)
  const text = constantText(e)
  if (text !== undefined) return [text]
  if (ts.isArrayLiteralExpression(e)) {
    const parts = e.elements.map(element => stringsOf(element, files, depth + 1))
    return parts.every(part => part !== undefined) ? parts.flat() : undefined
  }
  if (!ts.isIdentifier(e)) return undefined
  const binding = bindingOf(e)
  if (binding === undefined) return undefined
  if (binding.kind === 'value') return stringsOf(binding.init, files, depth + 1)
  if (binding.kind === 'for-of') return stringsOf(binding.iterated, files, depth + 1)
  if (binding.kind === 'import') {
    if (!binding.from.startsWith('.')) return undefined
    const file = files.get(resolveRelative(e.getSourceFile().fileName, binding.from))
    const statement = file?.statements.find(
      s =>
        ts.isVariableStatement(s) &&
        s.declarationList.declarations.some(d => ts.isIdentifier(d.name) && d.name.text === binding.name),
    )
    const decl =
      statement && ts.isVariableStatement(statement)
        ? statement.declarationList.declarations.find(d => ts.isIdentifier(d.name) && d.name.text === binding.name)
        : undefined
    return decl?.initializer && file ? stringsOf(decl.initializer, files, depth + 1) : undefined
  }
  const name = functionName(binding.fn)
  if (name !== undefined) {
    const calls = callsTo(e.getSourceFile(), name)
    if (calls.length === 0) return undefined
    const parts = calls.map(call => {
      const arg = call.arguments[binding.index]
      return arg === undefined ? undefined : stringsOf(arg, files, depth + 1)
    })
    return parts.every(part => part !== undefined) ? parts.flat() : undefined
  }
  // A callback: the element of the array it iterates.
  const call = binding.fn.parent
  if (binding.index === 0 && ts.isCallExpression(call) && call.arguments.includes(binding.fn as ts.Expression)) {
    const callee = unwrap(call.expression)
    if (ts.isPropertyAccessExpression(callee) && ITERATORS.has(callee.name.text)) {
      return stringsOf(callee.expression, files, depth + 1)
    }
  }
  return undefined
}

// The script's files, parsed.
const parsedScript = (sources: Sources): Map<string, ts.SourceFile> =>
  new Map([...sources].filter(([path]) => inScript(path)).map(([path, text]) => [path, parse(path, text)] as const))

// One file of the script, or an error naming it.
function scriptFile(files: ReadonlyMap<string, ts.SourceFile>, path: string): ts.SourceFile {
  const file = files.get(path)
  if (file === undefined) throw new Error(`${path} is missing`)
  return file
}

// --- BSG-01: no identifying values ----------------------------------------------------------------

// The files BSG-01 reads: the script and its tests, the check, the harness and its tests, the
// integration suite and the runbook.
const readsIdentifying = (path: string): boolean =>
  path === ENTRY || path.startsWith(DIR) || [CHECK, HARNESS, HARNESS_TEST, SUITE, RUNBOOK].includes(path)

// Ofcom's drama range, +44 7700 900000 to +44 7700 900999, by its digits.
const FICTION_DIGITS = /^447700900\d{3}$/
// The seed's twelve numbers (db/seed/tembusu.sql), +65 8000 0001 to +65 8000 0012.
const SEED_DIGITS = /^65800000(?:0[1-9]|1[0-2])$/
const UUID_SHAPE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

// BSG-01's own two shapes, beyond identifying.ts's list (which RB-03 shares as the design set it):
// a number written with 00 for the international prefix, and one written nationally after a trunk
// 0 (07700 900123, or (0)7700 900123), each standing alone (not inside a word, a uuid's later
// group, a decimal, a time or a path) and a match only with at least ten digits once spaces,
// hyphens, dots and brackets are gone, so a migration's number (0011) or a short run is none.
const OWN_SHAPES: readonly RegExp[] = [
  /(?<![\w.:/+-])00[ -]?[1-9][\d ().-]*\d(?!\w)/g,
  /(?<![\w.:/+-])(?:\(0\) ?|0)[1-9][\d ().-]*\d(?!\w)/g,
]

// Every match of BSG-01's own shapes on a line, as a phone number.
function ownMatches(line: string): IdentifyingMatch[] {
  return OWN_SHAPES.flatMap(pattern =>
    [...line.matchAll(pattern)].flatMap(match => {
      const start = match.index ?? 0
      return match[0].replace(/[ ().-]/g, '').length >= 10
        ? [{ kind: PHONE_NUMBER, start, end: start + match[0].length, text: match[0] }]
        : []
    }),
  )
}

// A run's digits as E.164 writes them: an international 00 dropped, and a trunk 0 read as the
// United Kingdom's, the only country whose numbers BSG-01 allows any of, so the drama range passes
// written either way (0044 7700 900123, 07700 900123) and every other number still fails.
const internationalDigits = (digits: string): string =>
  digits.startsWith('00') ? digits.slice(2) : digits.startsWith('0') ? `44${digits.slice(1)}` : digits

// The id of Kysely's migration lock, as the installed Kysely writes it (postgres-adapter.js's
// LOCK_ID), which S3 takes and BSU-12 pins.
function kyselyLockId(): string {
  const path = [
    'node_modules/kysely/dist/dialect/postgres/postgres-adapter.js',
    'node_modules/kysely/dist/esm/dialect/postgres/postgres-adapter.js',
  ]
    .map(candidate => join(root, candidate))
    .find(candidate => existsSync(candidate))
  const id =
    path === undefined ? undefined : /\bLOCK_ID\s*=\s*BigInt\(\s*'(\d+)'\s*\)/.exec(readFileSync(path, 'utf8'))?.[1]
  if (id === undefined) throw new Error("Kysely's postgres-adapter.js no longer names its LOCK_ID")
  return id
}

// Whether a phone-number or account-id match is one BSG-01 allows: the drama range, a seed number
// (in input.ts alone) or Kysely's lock id, each by the whole run of digits around it, the range and
// the seed read through internationalDigits() so that 00 or a trunk 0 doesn't hide them.
function allowedNumber(line: string, start: number, end: number, seed: boolean, lockId: string): boolean {
  let from = start
  let to = end
  while (from > 0 && /\d/.test(line[from - 1] ?? '')) from -= 1
  while (to < line.length && /\d/.test(line[to] ?? '')) to += 1
  const run = line.slice(from, to).replace(/[+ ().-]/g, '')
  if (run === lockId) return true
  const digits = internationalDigits(run)
  if (FICTION_DIGITS.test(digits)) return true
  if (seed && SEED_DIGITS.test(digits)) return true
  // The range written as a pattern: its prefix, then three digits.
  return digits === '447700900' && /^(?:\\d|\[0-9\])\{3\}/.test(line.slice(to))
}

// Each finding in one file, as "path:line: kind", each kind once a line.
function identifyingIn(path: string, text: string, lockId: string): string[] {
  const found: string[] = []
  const seed = path === INPUT
  for (const [index, line] of text.split('\n').entries()) {
    const matches = [...identifyingMatches(line), ...ownMatches(line)]
    const uuids = [...line.matchAll(UUID_SHAPE)].map(m => [m.index ?? 0, (m.index ?? 0) + m[0].length] as const)
    const allowed = matches
      .filter(
        m => (m.kind === PHONE_NUMBER || m.kind === ACCOUNT_ID) && allowedNumber(line, m.start, m.end, seed, lockId),
      )
      .map(m => [m.start, m.end] as const)
    const inside = (spans: readonly (readonly [number, number])[], start: number, end: number) =>
      spans.some(([s, e]) => s <= start && end <= e)
    const kinds = new Set<string>()
    for (const m of matches) {
      if (!inside(uuids, m.start, m.end) && !inside(allowed, m.start, m.end)) kinds.add(m.kind)
    }
    for (const kind of kinds) found.push(`${path}:${index + 1}: ${kind}`)
  }
  return found
}

describe('BSG-01 (R1, PD-120, T22 item 70): no identifying value in the script, its tests, check, harness, suite or runbook', () => {
  const lockId = kyselyLockId()
  // Built here, so this file holds no plausible live number.
  const real = (...parts: string[]) => parts.join(' ')

  it("allows the drama range in each grouping and form, the seed in input.ts, Kysely's lock and a uuid, and finds the rest", () => {
    const planted = [
      'Call +44 7700 900123, +447700900123, +44-7700-900-123, +44.7700.900.123 or +44 (7700) 900123.',
      'Digits 447700900123, and the range +44 7700 900000 to +44 7700 900999.',
      String.raw`const FICTION = /^\+447700900\d{3}$/`,
      "const dpo = '00000000-0000-4000-8000-000000000001'",
      `select pg_advisory_xact_lock(${lockId})`,
      'Thirteen digits: 4477009001234.',
      'Thirteen with a plus: +44 7700 900123 4.',
      `Out of range: ${real('+44', '7700', '901123')}.`,
      `A seed number: ${real('+65', '8000', '0001')}.`,
      `Locally: ${real('9123', '4567')}.`,
      'Write to someone@example.org.',
      'Role arn:aws:iam::x:role/y.',
      `Service ${['VA', 'a'.repeat(32)].join('')}.`,
      `Another run: ${lockId}0.`,
      'Account 1234-5678-9012.',
      // PRIVACY-04: a verification's SID, built here so no file holds one.
      `Verification ${['VE', '0a'.repeat(16)].join('')}.`,
      // TESTS-01: BSG-01's own shapes, the range written nationally or with 00, and what isn't a number.
      'Nationally 07700 900123, 07700900123, (07700) 900123 or (0)7700 900123.',
      'With 00: 0044 7700 900123, 00447700900123, 00 44 7700 900123 or 0044-7700-900-123.',
      `Out of range, with 00: ${real('0044', '7700', '901123')}.`,
      `Out of range, nationally: ${real('07700', '901123')}.`,
      "const id = '00123456-7890-4abc-8def-0123456789ab'",
      'Migrations 0011 and 0012_request_cases.sql, at 09:00:00 on 2026-10-27, a ratio of 0.25.',
    ].join('\n')
    expect(identifyingIn(`${DIR}steps.test.ts`, planted, lockId)).toEqual([
      `${DIR}steps.test.ts:6: ${ACCOUNT_ID}`,
      `${DIR}steps.test.ts:7: ${PHONE_NUMBER}`,
      `${DIR}steps.test.ts:8: ${PHONE_NUMBER}`,
      `${DIR}steps.test.ts:9: ${PHONE_NUMBER}`,
      `${DIR}steps.test.ts:10: ${PHONE_NUMBER}`,
      `${DIR}steps.test.ts:11: an email address`,
      `${DIR}steps.test.ts:12: an ARN`,
      `${DIR}steps.test.ts:13: a Twilio SID`,
      `${DIR}steps.test.ts:14: ${ACCOUNT_ID}`,
      `${DIR}steps.test.ts:15: ${ACCOUNT_ID}`,
      `${DIR}steps.test.ts:16: a Twilio SID`,
      `${DIR}steps.test.ts:19: ${PHONE_NUMBER}`,
      `${DIR}steps.test.ts:20: ${PHONE_NUMBER}`,
    ])
    // The uuid passes as a uuid, not because the shapes miss it: its first groups read as a 00 run.
    expect(ownMatches("const id = '00123456-7890-4abc-8def-0123456789ab'")).not.toEqual([])
    // The seed's twelve only in input.ts, and only those twelve.
    const seed = [real('+65', '8000', '0001'), real('+65', '8000', '0012'), real('+65', '8000', '0013')]
    expect(identifyingIn(INPUT, seed.join('\n'), lockId)).toEqual([`${INPUT}:3: ${PHONE_NUMBER}`])
    expect(identifyingIn(TARGET, seed.slice(0, 1).join('\n'), lockId)).toEqual([`${TARGET}:1: ${PHONE_NUMBER}`])
    // A finding never holds the value.
    expect(identifyingIn('x.ts', 'Thirteen digits: 4477009001234.', lockId).join('')).not.toMatch(/\d{5}/)
  })

  it('the real files hold none', () => {
    // The files themselves are held to exist by the test below that lists what this PR adds.
    const files = repoFiles().filter(readsIdentifying)
    expect(files).toEqual(expect.arrayContaining([ENTRY, INPUT, TARGET, STEPS, OUTPUT]))
    expect(files.flatMap(path => identifyingIn(path, readRepoFile(path), lockId))).toEqual([])
  })
})

// --- BSG-02: inputs and reach ---------------------------------------------------------------------

// The variables the script reads (section 2.1): its input, the TLS name, the target, where and how
// pg would connect (PGSSLNEGOTIATION, which pg refuses to make a client with unless it is postgres or
// direct, read so that refusal comes before connecting, IO-03), and the five agent and CI markers,
// by their presence only.
const ENV_NAMES = new Set([
  'OWNER_BOOTSTRAP_INPUT',
  'OWNER_BOOTSTRAP_TLS_NAME',
  'DEPLOY_ENV',
  'PGHOST',
  'PGHOSTADDR',
  'PGSERVICE',
  'PGSERVICEFILE',
  'PGSSLMODE',
  'PGSSLNEGOTIATION',
  'CLAUDECODE',
  'CLAUDE_CODE_ENTRYPOINT',
  'AI_AGENT',
  'CI',
  'GITHUB_ACTIONS',
])
const PACKAGES = new Set(['pg', 'zod', '@hearth/shared', 'node:util', 'node:crypto', 'node:fs/promises'])

// What is wrong with the script's command line: parseArgs once, taking exactly --commit (a
// boolean) and --database (a string) with positionals, strict; process.argv named once, by the
// entry.
function argumentProblems(files: ReadonlyMap<string, ts.SourceFile>): string[] {
  const found: string[] = []
  const calls = [...files.values()].flatMap(file =>
    nodesOf(file).filter(
      (node): node is ts.CallExpression => ts.isCallExpression(node) && calleeName(node) === 'parseArgs',
    ),
  )
  if (calls.length !== 1) found.push(`parseArgs is called ${calls.length} times, not once`)
  for (const call of calls) {
    const config = call.arguments[0] && unwrap(call.arguments[0])
    if (config === undefined || !ts.isObjectLiteralExpression(config)) {
      found.push(`${at(call)}: parseArgs isn't given its options as written`)
      continue
    }
    const property = (name: string) => {
      const p = config.properties.find(q => ts.isPropertyAssignment(q) && propertyName(q.name) === name)
      return p && ts.isPropertyAssignment(p) ? unwrap(p.initializer) : undefined
    }
    let options = property('options')
    if (options && ts.isIdentifier(options)) {
      const binding = bindingOf(options)
      options = binding?.kind === 'value' ? unwrap(binding.init) : undefined
    }
    const shape =
      options && ts.isObjectLiteralExpression(options)
        ? options.properties
            .map(p => {
              const value = ts.isPropertyAssignment(p) ? unwrap(p.initializer) : undefined
              const spec =
                value && ts.isObjectLiteralExpression(value)
                  ? value.properties.map(q =>
                      ts.isPropertyAssignment(q) ? `${q.name.getText()}=${q.initializer.getText()}` : '?',
                    )
                  : ['?']
              return `${p.name?.getText() ?? '?'}(${spec.join(',')})`
            })
            .sort()
            .join(' ')
        : undefined
    if (shape !== "commit(type='boolean') database(type='string')") {
      found.push(`${at(call)}: parseArgs takes options other than --commit and --database`)
    }
    if (property('allowPositionals')?.kind !== ts.SyntaxKind.TrueKeyword) {
      found.push(`${at(call)}: parseArgs doesn't allow the mode as a positional`)
    }
    if (property('strict')?.kind === ts.SyntaxKind.FalseKeyword) found.push(`${at(call)}: parseArgs isn't strict`)
  }
  const argv = [...files.values()].flatMap(file => nodesOf(file).filter(node => isProcessMember(node, 'argv')))
  for (const node of argv) if (node.getSourceFile().fileName !== ENTRY) found.push(`${at(node)}: names process.argv`)
  if (argv.length > 1) found.push(`process.argv is named ${argv.length} times, not once`)
  return found
}

// The variables one use of process.env (or of a const that holds it) reads: a property, an element
// by a name the guard can follow, or a destructuring; undefined when it is used whole or by a name
// chosen at run time. deletes says whether it deletes the one variable it names.
function envUse(
  use: ts.Expression,
  files: ReadonlyMap<string, ts.SourceFile>,
): { names: string[] | undefined; deletes: boolean } {
  const parent = use.parent
  if (ts.isPropertyAccessExpression(parent) && parent.expression === use) {
    return { names: [parent.name.text], deletes: ts.isDeleteExpression(parent.parent) }
  }
  if (ts.isElementAccessExpression(parent) && parent.expression === use) {
    const names = stringsOf(parent.argumentExpression, files)
    return { names, deletes: ts.isDeleteExpression(parent.parent) && names?.length === 1 }
  }
  if (ts.isVariableDeclaration(parent) && parent.initializer === use && ts.isObjectBindingPattern(parent.name)) {
    const named = parent.name.elements.every(e => e.dotDotDotToken === undefined)
    return {
      names: named ? parent.name.elements.map(e => (e.propertyName ?? e.name).getText()) : undefined,
      deletes: false,
    }
  }
  return { names: undefined, deletes: false }
}

// The variables the entry's readEnvironment() reads, and what is wrong with how the script reads
// the environment: process.env anywhere else, used whole, by a name the guard can't follow or not
// in section 2.1's list; OWNER_BOOTSTRAP_INPUT not deleted once read; process.stdin read at all. A
// const in readEnvironment() that holds process.env (const env = process.env) reads as it does.
function environmentReads(files: ReadonlyMap<string, ts.SourceFile>): { names: Set<string>; problems: string[] } {
  const names = new Set<string>()
  const problems: string[] = []
  let deleted = false
  const entry = files.get(ENTRY)
  const reader = entry === undefined ? undefined : topFunction(entry, 'readEnvironment')
  for (const file of files.values()) {
    for (const node of nodesOf(file)) {
      if (isProcessMember(node, 'stdin')) problems.push(`${at(node)}: reads process.stdin`)
      if (!isProcessMember(node, 'env')) continue
      if (reader === undefined || file !== entry || !contains(reader, node)) {
        problems.push(`${at(node)}: reads process.env outside readEnvironment()`)
        continue
      }
      const parent = node.parent
      const uses: ts.Expression[] = [node]
      if (ts.isVariableDeclaration(parent) && parent.initializer === node && ts.isIdentifier(parent.name)) {
        const alias = parent.name
        uses.splice(0, 1)
        for (const n of nodesOf(reader)) {
          if (ts.isIdentifier(n) && n.text === alias.text && n !== alias && !isDeclaredName(n)) uses.push(n)
        }
      }
      for (const use of uses) {
        const read = envUse(use, files)
        if (read.names === undefined) {
          problems.push(`${at(use)}: reads process.env whole, or by a name chosen at run time`)
          continue
        }
        if (read.deletes && read.names[0] === 'OWNER_BOOTSTRAP_INPUT') deleted = true
        for (const name of read.names) {
          names.add(name)
          if (!ENV_NAMES.has(name)) problems.push(`${at(use)}: reads ${name}, which section 2.1 doesn't list`)
        }
      }
    }
  }
  if (!deleted) problems.push(`${ENTRY}: readEnvironment() doesn't delete OWNER_BOOTSTRAP_INPUT once read`)
  return { names, problems }
}

// What the script loads that it may not: a module outside pg, zod, @hearth/shared, node:util,
// node:crypto and node:fs/promises (target.ts alone, readdir alone), a module chosen at run time, or
// a relative path that doesn't end .ts or leaves the script; and any use of fetch.
function reachProblems(files: ReadonlyMap<string, ts.SourceFile>): string[] {
  const found: string[] = []
  for (const [path, file] of files) {
    for (const entry of moduleImports(file.text, path)) {
      const spec = entry.specifier
      if (spec === undefined) found.push(`${path}: loads a module chosen at run time`)
      else if (spec.startsWith('.')) {
        const target = resolveRelative(path, spec)
        if (!spec.endsWith('.ts')) found.push(`${path}: imports ${spec}, a relative path that doesn't end .ts`)
        else if (!inScript(target)) found.push(`${path}: imports ${spec}, outside the script`)
      } else if (!PACKAGES.has(spec)) found.push(`${path}: imports ${spec}`)
      else if (spec === 'node:fs/promises' && path !== TARGET) found.push(`${path}: imports node:fs/promises`)
    }
    for (const statement of file.statements) {
      if (!ts.isImportDeclaration(statement) || constantText(statement.moduleSpecifier) !== 'node:fs/promises') continue
      const clause = statement.importClause
      const bindings = clause?.namedBindings
      const only =
        clause?.name === undefined &&
        bindings !== undefined &&
        ts.isNamedImports(bindings) &&
        bindings.elements.every(e => (e.propertyName ?? e.name).text === 'readdir')
      if (!only) found.push(`${at(statement)}: takes more than readdir from node:fs/promises`)
    }
    for (const node of nodesOf(file)) {
      if (ts.isIdentifier(node) && ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource'].includes(node.text)) {
        found.push(`${at(node)}: names ${node.text}`)
      }
    }
  }
  return found
}

// The script's path, as a spawn names it: scripts/owner-bootstrap.ts or its folder, or the file
// on its own.
const NAMES_SCRIPT = /(?:^|[/\\])scripts[/\\]owner-bootstrap(?:\.ts)?(?:$|[/\\])|^owner-bootstrap(?:\.ts)?$/

// Whether a module specifier from a file resolves into the script: its entry (with or without .ts)
// or anything in its folder; a bare specifier that names the folder counts too.
function intoScript(path: string, spec: string): boolean {
  if (!spec.startsWith('.')) return /scripts\/owner-bootstrap/.test(spec)
  const target = resolveRelative(path, spec)
  return target === ENTRY || `${target}.ts` === ENTRY || target.startsWith(DIR)
}

// What under apps/ and packages/ reaches the script: an import of any kind, or a vi.mock()-style
// call, that resolves into it, and a literal naming its path anywhere but the harness.
function loadedFromApps(sources: Sources): string[] {
  const found: string[] = []
  for (const [path, text] of sources) {
    if (!/^(?:apps|packages)\//.test(path) || !isCode(path)) continue
    if (!text.includes('owner-bootstrap')) continue
    const file = parse(path, text)
    const specifiers = moduleImports(text, path).flatMap(entry => entry.specifier ?? [])
    for (const node of nodesOf(file)) {
      if (!ts.isCallExpression(node) || !loadsModule(node) || node.expression.kind === ts.SyntaxKind.ImportKeyword)
        continue
      const spec = node.arguments[0] && constantText(unwrap(node.arguments[0]))
      if (spec !== undefined && !specifiers.includes(spec)) specifiers.push(spec)
    }
    for (const spec of specifiers) if (intoScript(path, spec)) found.push(`${path}: loads ${spec}`)
    if (path === HARNESS) continue
    for (const { node, text: literal } of literalsOf(file)) {
      if (NAMES_SCRIPT.test(literal)) found.push(`${at(node)}: names the script's path`)
    }
  }
  return found
}

// Whether the harness names the script's path, as its spawn must.
const harnessNamesScript = (text: string): boolean =>
  literalsOf(parse(HARNESS, text)).some(({ text: literal }) => NAMES_SCRIPT.test(literal))

// --- Planted script: the shape the real one has, small -------------------------------------------

const START_OPTIONS =
  '-c role=hearth_owner -c transaction_timeout=30s -c lock_timeout=2s -c idle_in_transaction_session_timeout=5s -c debug_print_plan=off'

const PLANTED: Record<string, string> = {
  [ENTRY]: [
    "import { randomUUID } from 'node:crypto'",
    "import pg from 'pg'",
    "import { parseArguments, parseDocument } from './owner-bootstrap/input.ts'",
    "import { interrupted, outcomeOf, printer, processSink, report } from './owner-bootstrap/output.ts'",
    "import { setUp } from './owner-bootstrap/steps.ts'",
    "import { AGENT_MARKERS, environmentProblems } from './owner-bootstrap/target.ts'",
    '',
    `const START = '${START_OPTIONS}'`,
    '',
    'function readEnvironment() {',
    '  const input = process.env.OWNER_BOOTSTRAP_INPUT',
    '  delete process.env.OWNER_BOOTSTRAP_INPUT',
    '  const markers = AGENT_MARKERS.filter(name => process.env[name] !== undefined)',
    "  const read = (name: string) => process.env[name] ?? ''",
    "  return { input, deployEnv: process.env.DEPLOY_ENV, host: read('PGHOST'), markers }",
    '}',
    '',
    'async function open(database: string) {',
    '  const client = new pg.Client({ database, options: START })',
    '  await client.connect()',
    '  return client',
    '}',
    '',
    'async function main() {',
    '  const args = parseArguments(process.argv.slice(2))',
    '  const env = readEnvironment()',
    '  const problems = environmentProblems(env)',
    "  const doc = parseDocument('set-up', env.input)",
    '  const client = await open(args.database)',
    '  await setUp(client, doc, randomUUID())',
    "  printer(processSink)({ kind: 'kept_nothing' })",
    '  return 0',
    '}',
    '',
    'if (import.meta.main) {',
    '  const phase = { committing: undefined }',
    '  const print = printer(processSink)',
    '  const fail = (error: unknown) => process.exit(report(outcomeOf(error, phase), print))',
    "  process.on('uncaughtException', fail)",
    "  process.on('unhandledRejection', fail)",
    "  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {",
    '    process.on(signal, () => process.exit(report(interrupted(phase), print)))',
    '  }',
    '  process.exitCode = await main()',
    '}',
  ].join('\n'),
  [INPUT]: [
    "import { parseArgs } from 'node:util'",
    'import {',
    '  aiCopyIn,',
    '  flatText,',
    '  NOTICE_FREE_TEXT_FIELDS,',
    '  NOTICE_TRANSFER_FACTS,',
    '  normalisePhone,',
    '  orgNameProblems,',
    '  TransferFactsBody,',
    '  transferProblems,',
    "} from '@hearth/shared'",
    "import { z } from 'zod'",
    '',
    "export const MODES = ['set-up', 'recover', 'correct-number'] as const",
    'const DATABASE_NAME = /^[a-z_][a-z0-9_]{0,62}$/',
    'const WORD_KEY = /^[A-Za-z_]{1,40}$/',
    "const FICTION_PREFIX = '+44' + '7700' + '900'",
    String.raw`const isFiction = (e164: string) => e164.startsWith(FICTION_PREFIX) && /^\d{3}$/.test(e164.slice(12))`,
    'export interface SetUpDocument { organisation: string; e164: string }',
    'export function parseArguments(args: string[]) {',
    '  return parseArgs({',
    '    args,',
    "    options: { commit: { type: 'boolean' }, database: { type: 'string' } },",
    '    strict: true,',
    '    allowPositionals: true,',
    '  })',
    '}',
    'export function parseSetUp(json: unknown): SetUpDocument | undefined {',
    '  const doc = z.object({ organisation: z.string(), number: z.string(), facts: TransferFactsBody }).parse(json)',
    '  if (orgNameProblems(doc.organisation).length > 0) return undefined',
    "  if (aiCopyIn(flatText(doc.organisation)) || transferProblems({ provider: 'twilio', ...doc.facts }, '2026-10-27').length) return undefined",
    '  const e164 = normalisePhone(doc.number) ?? ""',
    '  return isFiction(e164) ? { organisation: doc.organisation.trim(), e164 } : undefined',
    '}',
    'export function parseDocument(mode: string, text: string | undefined): SetUpDocument | undefined {',
    '  return NOTICE_TRANSFER_FACTS.length + NOTICE_FREE_TEXT_FIELDS.length > 0 ? parseSetUp(JSON.parse(text ?? "")) : undefined',
    '}',
  ].join('\n'),
  [TARGET]: [
    "import { readdir } from 'node:fs/promises'",
    "export const AGENT_MARKERS = ['CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'AI_AGENT', 'CI', 'GITHUB_ACTIONS'] as const",
    'export function environmentProblems(env: unknown): string[] {',
    '  return env === undefined ? ["deploy_env_missing"] : []',
    '}',
    "export const checkout = () => readdir(new URL('../../db/migrations/', import.meta.url))",
  ].join('\n'),
  [OUTPUT]: [
    "import { DatabaseError } from 'pg'",
    "export type Line = { kind: 'kept_nothing' } | { kind: 'founder_name'; name: string }",
    'export interface Sink { out(text: string): void; terminal(): boolean }',
    'export const processSink: Sink = {',
    '  out: text => {',
    '    process.stdout.write(text)',
    '  },',
    '  terminal: () => process.stdout.isTTY === true,',
    '}',
    'export type Print = (line: Line) => void',
    'export function printer(sink: Sink): Print {',
    '  return line => {',
    "    const shown = line.kind === 'founder_name' && sink.terminal()",
    "    sink.out(shown ? 'name' : 'length')",
    '  }',
    '}',
    'export const isDatabaseError = (e: unknown) => e instanceof DatabaseError',
    'export interface Outcome { line: Line; exit: number }',
    'export interface Phase { committing: string | undefined }',
    "export const outcomeOf = (error: unknown, phase: Phase): Outcome => ({ line: { kind: 'kept_nothing' }, exit: isDatabaseError(error) && phase.committing ? 4 : 3 })",
    "export const interrupted = (phase: Phase): Outcome => ({ line: { kind: 'kept_nothing' }, exit: phase.committing ? 4 : 3 })",
    'export function report(outcome: Outcome, print: Print): number {',
    '  print(outcome.line)',
    '  return outcome.exit',
    '}',
  ].join('\n'),
  [STEPS]: [
    "import { FLAGS, PROVIDERS, PURPOSE_KEYS } from '@hearth/shared'",
    "import type { SetUpDocument } from './input.ts'",
    '',
    'export const SQL = {',
    "  begin: 'begin isolation level read committed read write',",
    "  prologue: `select pg_catalog.set_config('lock_timeout', '2s', true), pg_catalog.set_config('hearth.break_glass', $1, true)`,",
    "  locks: `select pg_advisory_xact_lock(hashtextextended('hearth.owner_bootstrap', 0)), pg_advisory_xact_lock($1::bigint)`,",
    "  insertOrg: 'insert into public.orgs (id, name) values ($1, $2)',",
    "  removeNumber: 'update public.phone_numbers set removed_at = now() where org_id = $1 and id = $2',",
    "  clear: 'select public.bootstrap_transfer_clearance($1, $2::uuid) as id',",
    '  reclear: `with latest as (select v.id from public.notice_versions v), linked as (select l.clearance_id from public.notice_version_providers l),',
    '  recorded as (select public.notice_facts(public.transfer_register_facts(t)) as facts from public.transfer_register t),',
    '  before as (select public.transfer_register_facts(t)::text as facts from public.transfer_register t)',
    "  select public.bootstrap_transfer_clearance('twilio', $2::uuid) as clearance`,",
    '} as const',
    '',
    'export interface Queryable { query(text: string, values?: readonly unknown[]): Promise<unknown> }',
    '',
    "async function prologue(db: Queryable, marker: '' | 'twilio_reclear'): Promise<void> {",
    '  await db.query(SQL.begin)',
    '  await db.query(SQL.prologue, [marker])',
    '}',
    '',
    'export async function setUp(db: Queryable, doc: SetUpDocument, id: string): Promise<void> {',
    "  await prologue(db, '')",
    '  await db.query(SQL.locks, [String(Object.keys(FLAGS).length + PURPOSE_KEYS.length + PROVIDERS.length)])',
    '  await db.query(SQL.insertOrg, [id, doc.organisation])',
    "  await db.query(SQL.clear, ['twilio', id])",
    '}',
    '',
    'export async function recover(db: Queryable, dpo: string): Promise<void> {',
    "  const reclearMarker = 'twilio_reclear'",
    '  await prologue(db, reclearMarker)',
    '  await db.query(SQL.reclear, [dpo])',
    '}',
    '',
    'export async function correctNumber(db: Queryable, id: string): Promise<void> {',
    "  await prologue(db, '')",
    '  await db.query(SQL.removeNumber, [id])',
    '}',
  ].join('\n'),
}

// The planted script with texts replaced in one file, each of which must be there.
function plantAll(path: string, edits: readonly (readonly [string, string])[]): Map<string, string> {
  const sources = new Map(Object.entries(PLANTED))
  let text = sources.get(path) ?? ''
  for (const [from, to] of edits) {
    if (!text.includes(from)) throw new Error(`the planted ${path} has no ${JSON.stringify(from)}`)
    text = text.replace(from, to)
  }
  sources.set(path, text)
  return sources
}
const plant = (path: string, from: string, to: string): Map<string, string> => plantAll(path, [[from, to]])
const planted = (): Map<string, string> => new Map(Object.entries(PLANTED))

// The line a text first appears on in a planted file, for the findings a case expects.
function lineIn(sources: Sources, path: string, needle: string): number {
  const index = (sources.get(path) ?? '').indexOf(needle)
  if (index === -1) throw new Error(`the planted ${path} has no ${JSON.stringify(needle)}`)
  return (sources.get(path) ?? '').slice(0, index).split('\n').length
}

// The real files the guard reads: every text file git tracks or would add.
let realCache: Map<string, string> | undefined
function realSources(): Map<string, string> {
  realCache ??= new Map(
    repoFiles()
      .filter(path => !BINARY.test(path))
      .map(path => [path, readRepoFile(path)] as const),
  )
  return realCache
}

describe('BSG: the files the guard reads exist', () => {
  it('each file this PR adds or changes is there, so no rule passes by reading nothing', () => {
    const all = new Set(repoFiles())
    expect(REQUIRED.filter(path => !all.has(path))).toEqual([])
  })
})

describe('BSG-02 (PD-116, R7): the script takes its inputs only from its two options and section 2.1’s variables, and reaches only Postgres', () => {
  const all = (sources: Sources) => {
    const files = parsedScript(sources)
    return [...argumentProblems(files), ...environmentReads(files).problems, ...reachProblems(files)]
  }

  it('passes the planted script and fails each way in', () => {
    expect(all(planted())).toEqual([])
    expect([...environmentReads(parsedScript(planted())).names].sort()).toEqual([
      'AI_AGENT',
      'CI',
      'CLAUDECODE',
      'CLAUDE_CODE_ENTRYPOINT',
      'DEPLOY_ENV',
      'GITHUB_ACTIONS',
      'OWNER_BOOTSTRAP_INPUT',
      'PGHOST',
    ])
    // One finding, on the line a planted text sits on.
    const finds = (path: string, edits: readonly (readonly [string, string])[], needle: string, problem: string) => {
      const sources = plantAll(path, edits)
      expect(all(sources)).toEqual([`${path}:${lineIn(sources, path, needle)}: ${problem}`])
    }
    const options = "options: { commit: { type: 'boolean' }, database: { type: 'string' } }"
    const other = 'parseArgs takes options other than --commit and --database'
    finds(
      INPUT,
      [[options, "options: { commit: { type: 'boolean' }, database: { type: 'string' }, pin: { type: 'string' } }"]],
      'parseArgs(',
      other,
    )
    finds(
      INPUT,
      [[options, "options: { commit: { type: 'string' }, database: { type: 'string' } }"]],
      'parseArgs(',
      other,
    )
    finds(INPUT, [['    strict: true,', '    strict: false,']], 'parseArgs(', "parseArgs isn't strict")
    finds(
      INPUT,
      [['    allowPositionals: true,\n', '']],
      'parseArgs(',
      "parseArgs doesn't allow the mode as a positional",
    )
    const checkout = 'export const checkout'
    const argv = plant(TARGET, checkout, `const argv = process.argv\n${checkout}`)
    expect(all(argv)).toEqual([
      `${TARGET}:${lineIn(argv, TARGET, 'process.argv')}: names process.argv`,
      'process.argv is named 2 times, not once',
    ])
    finds(
      TARGET,
      [[checkout, `const host = process.env.PGHOST\n${checkout}`]],
      'process.env',
      'reads process.env outside readEnvironment()',
    )
    finds(
      ENTRY,
      [['  const markers', '  const token = process.env.PGPASSWORD\n  const markers']],
      'PGPASSWORD',
      "reads PGPASSWORD, which section 2.1 doesn't list",
    )
    finds(
      ENTRY,
      [["host: read('PGHOST')", "host: read('HOME')"]],
      "process.env[name] ?? ''",
      "reads HOME, which section 2.1 doesn't list",
    )
    finds(
      ENTRY,
      [['  const markers', '  const everything = { ...process.env }\n  const markers']],
      'everything',
      'reads process.env whole, or by a name chosen at run time',
    )
    finds(
      ENTRY,
      [["process.env[name] ?? ''", "process.env[name.trim()] ?? ''"]],
      'name.trim()',
      'reads process.env whole, or by a name chosen at run time',
    )
    // A const that holds process.env reads as it does, and may not be passed on whole.
    const alias = plantAll(ENTRY, [
      [
        '  const input = process.env.OWNER_BOOTSTRAP_INPUT',
        '  const env = process.env\n  const input = env.OWNER_BOOTSTRAP_INPUT',
      ],
      ['  delete process.env.OWNER_BOOTSTRAP_INPUT', '  delete env.OWNER_BOOTSTRAP_INPUT'],
    ])
    expect(all(alias)).toEqual([])
    finds(
      ENTRY,
      [
        [
          '  const input = process.env.OWNER_BOOTSTRAP_INPUT',
          '  const env = process.env\n  const input = env.OWNER_BOOTSTRAP_INPUT\n  report(env)',
        ],
      ],
      'report(env)',
      'reads process.env whole, or by a name chosen at run time',
    )
    expect(all(plant(ENTRY, '  delete process.env.OWNER_BOOTSTRAP_INPUT\n', ''))).toEqual([
      `${ENTRY}: readEnvironment() doesn't delete OWNER_BOOTSTRAP_INPUT once read`,
    ])
    finds(
      TARGET,
      [[checkout, `process.stdin.on('data', () => {})\n${checkout}`]],
      'process.stdin',
      'reads process.stdin',
    )
    const readdir = "import { readdir } from 'node:fs/promises'"
    for (const module of [
      'node:net',
      'node:http',
      'node:https',
      'node:dns',
      'node:readline',
      'node:child_process',
      'node:fs',
      'ioredis',
      '@aws-sdk/client-secrets-manager',
      'fs/promises',
      'kysely',
    ]) {
      expect(all(plant(TARGET, readdir, `${readdir}\nimport '${module}'`))).toEqual([`${TARGET}: imports ${module}`])
    }
    const types = "import type { SetUpDocument } from './input.ts'"
    expect(
      all(plant(STEPS, types, `${types}\nimport { FakeVerify } from '../../apps/server/src/auth/sms/fake.ts'`)),
    ).toEqual([`${STEPS}: imports ../../apps/server/src/auth/sms/fake.ts, outside the script`])
    expect(
      all(plant(STEPS, types, `${types}\nimport type { Writes } from '../../apps/server/src/testing/writes.ts'`)),
    ).toEqual([`${STEPS}: imports ../../apps/server/src/testing/writes.ts, outside the script`])
    expect(all(plant(STEPS, "from './input.ts'", "from './input'"))).toEqual([
      `${STEPS}: imports ./input, a relative path that doesn't end .ts`,
    ])
    const fsInSteps = plant(STEPS, types, `${types}\nimport { readFile } from 'node:fs/promises'`)
    expect(all(fsInSteps)).toEqual([
      `${STEPS}: imports node:fs/promises`,
      `${STEPS}:${lineIn(fsInSteps, STEPS, 'readFile')}: takes more than readdir from node:fs/promises`,
    ])
    finds(
      TARGET,
      [[readdir, "import { readdir, writeFile } from 'node:fs/promises'"]],
      'writeFile',
      'takes more than readdir from node:fs/promises',
    )
    expect(all(plant(TARGET, checkout, `const load = (m: string) => import(m)\n${checkout}`))).toEqual([
      `${TARGET}: loads a module chosen at run time`,
    ])
    finds(TARGET, [[checkout, `await fetch('https://example.org')\n${checkout}`]], 'fetch', 'names fetch')
  })

  it('finds an app that loads the script or names its path, and lets the harness spawn it', () => {
    const sources = new Map([
      ['apps/server/src/a.ts', "import { setUp } from '../../../scripts/owner-bootstrap/steps.ts'"],
      ['apps/server/src/b.test.ts', "vi.mock('../../../scripts/owner-bootstrap/output.ts', () => ({}))"],
      ['packages/shared/src/c.ts', "export * from '../../../scripts/owner-bootstrap.ts'"],
      ['apps/server/src/d.ts', "const steps = await import('../../../scripts/owner-bootstrap/steps.ts')"],
      ['apps/server/scripts/e.ts', "spawn('node', [join(root, 'scripts', 'owner-bootstrap.ts')])"],
      [
        'apps/server/scripts/f.ts',
        "import { runOwnerBootstrap } from '../src/testing/owner-bootstrap.ts'\nconst name = 'hearth-owner-bootstrap'",
      ],
      [HARNESS, "const SCRIPT = new URL('../../../../scripts/owner-bootstrap.ts', import.meta.url)"],
      ['apps/web/src/g.ts', '// scripts/owner-bootstrap.ts is a person’s tool'],
    ])
    expect(loadedFromApps(sources)).toEqual([
      'apps/server/src/a.ts: loads ../../../scripts/owner-bootstrap/steps.ts',
      'apps/server/src/b.test.ts: loads ../../../scripts/owner-bootstrap/output.ts',
      'packages/shared/src/c.ts: loads ../../../scripts/owner-bootstrap.ts',
      'apps/server/src/d.ts: loads ../../../scripts/owner-bootstrap/steps.ts',
      "apps/server/scripts/e.ts:1: names the script's path",
    ])
    expect(harnessNamesScript(sources.get(HARNESS) ?? '')).toBe(true)
  })

  it('the real script reads only what it may, and only the harness names it', () => {
    const sources = realSources()
    expect(all(sources)).toEqual([])
    // The entry reads its input and the target at least, so an empty read can't pass.
    expect([...environmentReads(parsedScript(sources)).names]).toEqual(
      expect.arrayContaining(['OWNER_BOOTSTRAP_INPUT', 'DEPLOY_ENV', 'PGHOST']),
    )
    expect(loadedFromApps(sources)).toEqual([])
    expect(harnessNamesScript(sources.get(HARNESS) ?? '')).toBe(true)
  })
})

// --- BSG-03: one printer --------------------------------------------------------------------------

// Whether a node runs only for the founder_name line: under a condition, a case or the other side of
// an && that names it.
function forFounderName(node: ts.Node): boolean {
  const names = (n: ts.Node) => n.getText().includes("'founder_name'") || n.getText().includes('"founder_name"')
  for (
    let child: ts.Node = node, up = node.parent;
    up !== undefined && !isFunctionLike(child);
    child = up, up = up.parent
  ) {
    if (
      ts.isBinaryExpression(up) &&
      up.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
      up.right === child &&
      names(up.left)
    )
      return true
    if (ts.isIfStatement(up) && up.thenStatement === child && names(up.expression)) return true
    if (ts.isConditionalExpression(up) && up.whenTrue === child && names(up.condition)) return true
    if (ts.isCaseClause(up) && names(up.expression)) return true
  }
  return false
}

// What is wrong with the script's printing: console, process.stdout or process.stderr outside
// output.ts; no Line union, or a printer that takes anything else; process.stdout.isTTY read other
// than once, or for anything but the founder_name line.
function printerProblems(files: ReadonlyMap<string, ts.SourceFile>): string[] {
  const found: string[] = []
  for (const [path, file] of files) {
    if (path === OUTPUT) continue
    for (const node of nodesOf(file)) {
      if (ts.isIdentifier(node) && node.text === 'console' && !isDeclaredName(node))
        found.push(`${at(node)}: names console`)
      if (isProcessMember(node, 'stdout') || isProcessMember(node, 'stderr'))
        found.push(`${at(node)}: writes outside output.ts`)
    }
  }
  const output = files.get(OUTPUT)
  if (output === undefined) return [...found, `${OUTPUT} is missing`]
  const line = output.statements.find(
    (s): s is ts.TypeAliasDeclaration => ts.isTypeAliasDeclaration(s) && s.name.text === 'Line',
  )
  if (line === undefined || !ts.isUnionTypeNode(line.type)) found.push(`${OUTPUT}: no Line union`)
  const takesLine = (params: readonly ts.ParameterDeclaration[]) =>
    params.length === 1 &&
    params[0]?.type !== undefined &&
    ts.isTypeReferenceNode(params[0].type) &&
    params[0].type.typeName.getText() === 'Line'
  const print = topFunction(output, 'print')
  const printType = output.statements.find(
    (s): s is ts.TypeAliasDeclaration => ts.isTypeAliasDeclaration(s) && s.name.text === 'Print',
  )
  const printer = topFunction(output, 'printer')
  const viaPrinter =
    printType !== undefined &&
    ts.isFunctionTypeNode(printType.type) &&
    takesLine(printType.type.parameters) &&
    printer?.type !== undefined &&
    printer.type.getText() === 'Print'
  if (!(print !== undefined && takesLine(print.parameters)) && !viaPrinter) {
    found.push(`${OUTPUT}: the printer takes something other than a Line`)
  }
  const tty = nodesOf(output).filter(
    (n): n is ts.PropertyAccessExpression => ts.isPropertyAccessExpression(n) && n.name.text === 'isTTY',
  )
  if (tty.length !== 1) found.push(`${OUTPUT}: reads isTTY ${tty.length} times, not once`)
  for (const read of tty) {
    if (!isProcessMember(read.expression, 'stdout')) {
      found.push(`${at(read)}: reads isTTY of something other than process.stdout`)
      continue
    }
    // Read under the founder_name line's own condition; or the whole of a small getter (a sink's
    // terminal()), every call of which is.
    if (forFounderName(read)) continue
    let fn: ts.Node | undefined = read.parent
    while (fn !== undefined && !isFunctionLike(fn)) fn = fn.parent
    const body = fn !== undefined && isFunctionLike(fn) ? fn.body : undefined
    const getter =
      body !== undefined &&
      (!ts.isBlock(body) || (body.statements.length === 1 && ts.isReturnStatement(body.statements[0] as ts.Statement)))
    const holder = getter && fn !== undefined ? (ts.isMethodDeclaration(fn) ? fn : fn.parent) : undefined
    const name =
      holder !== undefined &&
      (ts.isPropertyAssignment(holder) || ts.isVariableDeclaration(holder) || ts.isMethodDeclaration(holder)) &&
      ts.isIdentifier(holder.name)
        ? holder.name.text
        : undefined
    if (name === undefined) {
      found.push(`${at(read)}: reads isTTY for more than the founder_name line`)
      continue
    }
    const calls = nodesOf(output).filter(
      (n): n is ts.CallExpression => ts.isCallExpression(n) && calleeName(n) === name,
    )
    for (const call of calls)
      if (!forFounderName(call)) found.push(`${at(call)}: reads isTTY for more than the founder_name line`)
  }
  return found
}

// The entry's process-level handlers (TESTS-02, R1): Node's own print of an uncaught error would
// show a DatabaseError's detail, and a stop would leave no line saying whether anything was kept.
const ERROR_EVENTS = ['uncaughtException', 'unhandledRejection'] as const
const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const

// Whether an expression is import.meta.main.
function isImportMetaMain(expr: ts.Expression): boolean {
  const e = unwrap(expr)
  return (
    ts.isPropertyAccessExpression(e) &&
    e.name.text === 'main' &&
    ts.isMetaProperty(e.expression) &&
    e.expression.keywordToken === ts.SyntaxKind.ImportKeyword &&
    e.expression.name.text === 'meta'
  )
}

// The function a handler argument is: written in place, a const holding one, or a function the file
// declares at its top level.
function handlerOf(arg: ts.Expression): ts.Node | undefined {
  const e = unwrap(arg)
  if (ts.isArrowFunction(e) || ts.isFunctionExpression(e)) return e
  if (!ts.isIdentifier(e)) return undefined
  const binding = bindingOf(e)
  const init = binding?.kind === 'value' ? unwrap(binding.init) : undefined
  if (init !== undefined && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) return init
  return topFunction(e.getSourceFile(), e.text)
}

// Whether a handler exits with what report() returns for the outcome a maker of output.ts gives:
// process.exit(report(<maker>(…), …)).
function exitsThrough(handler: ts.Node, maker: string): boolean {
  const named = (node: ts.Expression | undefined, name: string): node is ts.CallExpression => {
    const call = node === undefined ? undefined : unwrap(node)
    return (
      call !== undefined &&
      ts.isCallExpression(call) &&
      ts.isIdentifier(unwrap(call.expression)) &&
      calleeName(call) === name
    )
  }
  return nodesOf(handler).some(node => {
    if (!ts.isCallExpression(node) || !isProcessMember(unwrap(node.expression), 'exit')) return false
    const report = node.arguments[0] === undefined ? undefined : unwrap(node.arguments[0])
    return named(report, 'report') && named(report.arguments[0], maker)
  })
}

// What is wrong with the entry's handlers: no if (import.meta.main), or, run by it directly and
// before it calls main(), no process.on() for each of uncaughtException and unhandledRejection
// whose handler exits through report(outcomeOf(…)), or for each of SIGINT, SIGTERM and SIGHUP
// whose handler exits through report(interrupted(…)). An event is read as stringsOf() reads it, so
// a loop over a literal list counts for each of its signals.
function handlerProblems(files: ReadonlyMap<string, ts.SourceFile>): string[] {
  const entry = files.get(ENTRY)
  if (entry === undefined) return [`${ENTRY} is missing`]
  const block = entry.statements.find((s): s is ts.IfStatement => ts.isIfStatement(s) && isImportMetaMain(s.expression))
  if (block === undefined) return [`${ENTRY}: no if (import.meta.main) at its top level`]
  // Only what the block itself runs: a call inside a function it holds runs only if that is called.
  const direct = (node: ts.Node): boolean => {
    for (let up = node.parent; up !== undefined && up !== block; up = up.parent) if (isFunctionLike(up)) return false
    return true
  }
  const calls = nodesOf(block.thenStatement).filter(ts.isCallExpression).filter(direct)
  const main = calls.find(call => ts.isIdentifier(unwrap(call.expression)) && calleeName(call) === 'main')
  if (main === undefined) return [`${ENTRY}: if (import.meta.main) never calls main()`]
  const handlers = new Map<string, ts.Node[]>()
  for (const call of calls) {
    const callee = unwrap(call.expression)
    if (!ts.isPropertyAccessExpression(callee) || callee.name.text !== 'on') continue
    if (!ts.isIdentifier(callee.expression) || callee.expression.text !== 'process') continue
    if (call.end > main.getStart()) continue
    const [event, handler] = call.arguments
    const fn = handler === undefined ? undefined : handlerOf(handler)
    if (event === undefined || fn === undefined) continue
    for (const name of stringsOf(event, files) ?? []) handlers.set(name, [...(handlers.get(name) ?? []), fn])
  }
  const found: string[] = []
  const want = [
    ...ERROR_EVENTS.map(event => [event, 'outcomeOf'] as const),
    ...SIGNALS.map(event => [event, 'interrupted'] as const),
  ]
  for (const [event, maker] of want) {
    if (!(handlers.get(event) ?? []).some(fn => exitsThrough(fn, maker)))
      found.push(`${ENTRY}: no ${event} handler, before main(), that exits through report(${maker}(…))`)
  }
  return found
}

describe('BSG-03 (PD-131): one printer, which takes only a Line', () => {
  it('passes the planted script and fails each other way out', () => {
    const check = (sources: Sources) => printerProblems(parsedScript(sources))
    expect(check(planted())).toEqual([])
    const mark = "  await prologue(db, '')\n  await db.query(SQL.locks"
    const logged = plant(STEPS, mark, `  console.log(doc)\n${mark}`)
    expect(check(logged)).toEqual([`${STEPS}:${lineIn(logged, STEPS, 'console')}: names console`])
    const written = plant(
      ENTRY,
      '  const client = await open',
      "  process.stderr.write('x')\n  const client = await open",
    )
    expect(check(written)).toEqual([`${ENTRY}:${lineIn(written, ENTRY, 'process.stderr')}: writes outside output.ts`])
    const union = "export type Line = { kind: 'kept_nothing' } | { kind: 'founder_name'; name: string }"
    expect(check(plant(OUTPUT, union, 'export type Line = { kind: string }'))).toEqual([`${OUTPUT}: no Line union`])
    expect(
      check(plant(OUTPUT, 'export type Print = (line: Line) => void', 'export type Print = (line: string) => void')),
    ).toEqual([`${OUTPUT}: the printer takes something other than a Line`])
    expect(
      check(
        plant(
          OUTPUT,
          'export type Print = (line: Line) => void',
          'export type Print = (line: Line, extra: string) => void',
        ),
      ),
    ).toEqual([`${OUTPUT}: the printer takes something other than a Line`])
    const always = plant(
      OUTPUT,
      "    const shown = line.kind === 'founder_name' && sink.terminal()",
      '    const shown = sink.terminal()',
    )
    expect(check(always)).toEqual([
      `${OUTPUT}:${lineIn(always, OUTPUT, 'sink.terminal()')}: reads isTTY for more than the founder_name line`,
    ])
    const twice = plant(
      OUTPUT,
      "    sink.out(shown ? 'name' : 'length')",
      "    sink.out(shown ? 'name' : 'length')\n    if (process.stdout.isTTY) sink.out('colour')",
    )
    expect(check(twice)).toEqual([
      `${OUTPUT}: reads isTTY 2 times, not once`,
      `${OUTPUT}:${lineIn(twice, OUTPUT, 'if (process.stdout.isTTY)')}: reads isTTY for more than the founder_name line`,
    ])
  })

  it('the entry hands every uncaught error and every stop to output.ts, on planted text (TESTS-02)', () => {
    const check = (sources: Sources) => handlerProblems(parsedScript(sources))
    expect(check(planted())).toEqual([])
    const none = (event: string, maker: string) =>
      `${ENTRY}: no ${event} handler, before main(), that exits through report(${maker}(…))`
    // Each handler missing.
    expect(check(plant(ENTRY, "  process.on('uncaughtException', fail)\n", ''))).toEqual([
      none('uncaughtException', 'outcomeOf'),
    ])
    expect(check(plant(ENTRY, "  process.on('unhandledRejection', fail)\n", ''))).toEqual([
      none('unhandledRejection', 'outcomeOf'),
    ])
    // A signal missing from the loop, and the loop gone.
    const signals = "['SIGINT', 'SIGTERM', 'SIGHUP'] as const"
    expect(check(plant(ENTRY, signals, "['SIGINT', 'SIGTERM'] as const"))).toEqual([none('SIGHUP', 'interrupted')])
    expect(
      check(plant(ENTRY, '    process.on(signal, () => process.exit(report(interrupted(phase), print)))\n', '')),
    ).toEqual(SIGNALS.map(signal => none(signal, 'interrupted')))
    // A signal handler that reports the stop as an error.
    expect(check(plant(ENTRY, 'report(interrupted(phase), print)', 'report(outcomeOf(signal, phase), print)'))).toEqual(
      SIGNALS.map(signal => none(signal, 'interrupted')),
    )
    // An error handler that reports as a stop, or reports without exiting.
    expect(check(plant(ENTRY, 'report(outcomeOf(error, phase), print)', 'report(interrupted(phase), print)'))).toEqual(
      ERROR_EVENTS.map(event => none(event, 'outcomeOf')),
    )
    expect(
      check(
        plant(
          ENTRY,
          'process.exit(report(outcomeOf(error, phase), print))',
          '{\n    report(outcomeOf(error, phase), print)\n  }',
        ),
      ),
    ).toEqual(ERROR_EVENTS.map(event => none(event, 'outcomeOf')))
    // Registered once main() has run, or outside if (import.meta.main).
    const run = '  process.exitCode = await main()\n'
    const late = plantAll(ENTRY, [
      [run, ''],
      ['  const fail =', `${run}  const fail =`],
    ])
    expect(check(late)).toEqual([
      ...ERROR_EVENTS.map(event => none(event, 'outcomeOf')),
      ...SIGNALS.map(signal => none(signal, 'interrupted')),
    ])
    expect(check(plant(ENTRY, 'if (import.meta.main) {', 'if (import.meta.url) {'))).toEqual([
      `${ENTRY}: no if (import.meta.main) at its top level`,
    ])
    expect(check(plant(ENTRY, run, ''))).toEqual([`${ENTRY}: if (import.meta.main) never calls main()`])
    // Registered only inside a function the block never calls.
    const wrapped = plantAll(ENTRY, [
      ["  process.on('uncaughtException', fail)\n", "  const install = () => process.on('uncaughtException', fail)\n"],
    ])
    expect(check(wrapped)).toEqual([none('uncaughtException', 'outcomeOf')])
  })

  it('the real script prints only through output.ts, and its entry hands every error and stop to it', () => {
    const files = parsedScript(realSources())
    expect([...printerProblems(files), ...handlerProblems(files)]).toEqual([])
  })
})

// --- BSG-04: the seam -----------------------------------------------------------------------------

const SEAM = /\b(?:bootstrap_transfer_clearance|twilio_reclear)\b|\bhearth\.(?:break_glass|owner_bootstrap)\b/g
const MARKER = 'twilio_reclear'

// Where the seam's names may appear: steps.ts, the migrations and DB tests that define and test the
// function, the server's test harness and CI checks, the shell checks, test files and Markdown; and
// coverage.ts, the function alone, as data.
const seamAllowed = (path: string, name: string): boolean =>
  path === STEPS ||
  path.startsWith('db/migrations/') ||
  path.startsWith('db/tests/') ||
  path.startsWith('apps/server/src/testing/') ||
  path.startsWith('apps/server/scripts/') ||
  /^scripts\/check-[^/]+\.sh$/.test(path) ||
  isTest(path) ||
  path.endsWith('.md') ||
  (path === COVERAGE && name === 'bootstrap_transfer_clearance')

// Each file outside the allowed ones that names the seam, as "path: name", code read with its
// comments stripped.
function seamOutside(sources: Sources): string[] {
  const found: string[] = []
  for (const [path, text] of sources) {
    if (!text.match(SEAM)) continue
    const code = isCode(path) ? withoutComments(path, text) : text
    for (const name of new Set([...code.matchAll(SEAM)].map(m => m[0]))) {
      if (!seamAllowed(path, name)) found.push(`${path}: ${name}`)
    }
  }
  return found
}

// The literal values a query's parameter can take, followed back from the values array through a
// helper's parameter to every call, and the top-level name each value sits in.
function valuesOf(
  expr: ts.Expression,
  depth = 0,
): { value: string | undefined; owner: string | undefined; node: ts.Node }[] {
  const e = unwrap(expr)
  const text = constantText(e)
  if (text !== undefined) return [{ value: text, owner: ownerOf(e), node: e }]
  const binding = depth < 6 && ts.isIdentifier(e) ? bindingOf(e) : undefined
  if (binding?.kind === 'value') return valuesOf(binding.init, depth + 1)
  if (binding?.kind === 'param') {
    const name = functionName(binding.fn)
    const calls = name === undefined ? [] : callsTo(e.getSourceFile(), name)
    if (calls.length > 0) {
      return calls.flatMap(call => {
        const arg = call.arguments[binding.index]
        return arg === undefined ? [{ value: undefined, owner: ownerOf(call), node: call }] : valuesOf(arg, depth + 1)
      })
    }
  }
  return [{ value: undefined, owner: ownerOf(e), node: e }]
}

// The query() calls of a file whose text is a given SQL table entry or const.
const queriesOf = (file: ts.SourceFile, owner: string): ts.CallExpression[] =>
  nodesOf(file).filter((node): node is ts.CallExpression => {
    if (!ts.isCallExpression(node) || calleeName(node) !== 'query' || node.arguments[0] === undefined) return false
    const text = unwrap(node.arguments[0])
    return text.getText() === owner
  })

// What is wrong with steps.ts's use of the seam: twilio_reclear in anything a mode other than
// recover() reaches; a marker value the guard can't follow or other than '' and twilio_reclear;
// recover() not setting twilio_reclear; setUp() or correctNumber() not setting ''.
function seamInSteps(steps: ts.SourceFile): string[] {
  const found: string[] = []
  const graph = referenceGraph(steps)
  const modesOf = (owner: string | undefined): string[] =>
    owner === undefined
      ? []
      : MODE_FUNCTIONS.includes(owner as never)
        ? [owner]
        : reachers(graph, owner, MODE_FUNCTIONS)
  for (const name of MODE_FUNCTIONS) if (topFunction(steps, name) === undefined) found.push(`${STEPS}: no ${name}()`)
  for (const { node, text } of literalsOf(steps)) {
    if (!text.includes(MARKER)) continue
    const modes = modesOf(ownerOf(node))
    if (modes.length !== 1 || modes[0] !== 'recover')
      found.push(`${at(node)}: twilio_reclear where ${modes.join(', ') || 'no mode'} reaches it`)
  }
  const setBy = new Map<string, Set<string>>()
  for (const { node, text } of literalsOf(steps)) {
    for (const match of text.matchAll(
      /\bset_config\s*\(\s*'hearth\.break_glass'\s*,\s*('(?:[^']|'')*'|\$(\d+))\s*,/g,
    )) {
      const literal = match[1] ?? ''
      const param = match[2]
      let values: { value: string | undefined; owner: string | undefined; node: ts.Node }[]
      if (param === undefined)
        values = [{ value: literal.slice(1, -1).replaceAll("''", "'"), owner: ownerOf(node), node }]
      else {
        const owner = ownerOf(node) ?? ''
        const queries = queriesOf(steps, owner)
        if (queries.length === 0)
          found.push(`${at(node)}: the marker's statement is sent by no query() the guard can find`)
        values = queries.flatMap(query => {
          const array = query.arguments[1] && unwrap(query.arguments[1])
          const element = array && ts.isArrayLiteralExpression(array) ? array.elements[Number(param) - 1] : undefined
          return element === undefined ? [{ value: undefined, owner: ownerOf(query), node: query }] : valuesOf(element)
        })
      }
      for (const { value, owner, node: where } of values) {
        const modes = modesOf(owner)
        if (value === undefined) found.push(`${at(where)}: sets the marker to a value the guard can't follow`)
        else if (value !== '' && value !== MARKER)
          found.push(`${at(where)}: sets the marker to something other than '' or twilio_reclear`)
        else {
          if (value === MARKER && (modes.length !== 1 || modes[0] !== 'recover')) {
            found.push(`${at(where)}: sets twilio_reclear where ${modes.join(', ') || 'no mode'} reaches it`)
          }
          for (const mode of modes) setBy.set(mode, (setBy.get(mode) ?? new Set()).add(value))
        }
      }
    }
  }
  if (!setBy.get('recover')?.has(MARKER)) found.push(`${STEPS}: recover() doesn't set twilio_reclear`)
  for (const mode of ['setUp', 'correctNumber']) {
    const set = setBy.get(mode)
    if (set === undefined || !set.has('')) found.push(`${STEPS}: ${mode}() doesn't set the marker to ''`)
    else if (set.size > 1) found.push(`${STEPS}: ${mode}() sets the marker to more than ''`)
  }
  return found
}

describe('BSG-04 (R4, PD-125): only steps.ts names the seam, and only recover() sets twilio_reclear', () => {
  it('finds a name outside the allowed files, on planted text', () => {
    const sources = new Map([
      [
        'apps/server/src/auth/sign-in.ts',
        `await trx.query("select set_config('hearth.break_glass', 'twilio_reclear', true)")`,
      ],
      ['apps/server/src/admin/people.ts', '// bootstrap_transfer_clearance() is the bootstrap’s alone'],
      [COVERAGE, "const exempt = ['bootstrap_transfer_clearance']\nconst x = 'hearth.owner_bootstrap'"],
      ['apps/server/src/testing/stack.ts', `query("select set_config('hearth.break_glass', 'twilio_reclear', true)")`],
      ['apps/server/scripts/check-concurrency.ts', 'select public.bootstrap_transfer_clearance(…)'],
      ['scripts/check-notice-upgrade.sh', "set_config('hearth.break_glass', 'twilio_reclear', true)"],
      ['db/migrations/0011_dpo_contact.sql', "current_setting('hearth.break_glass', true) = 'twilio_reclear'"],
      ['docs/runbooks/twilio-withdrawn.md', '`bootstrap_transfer_clearance()`'],
      ['scripts/guards/x.test.ts', "'twilio_reclear'"],
      [`${DIR}steps.test.ts`, "'twilio_reclear'"],
      ['.github/workflows/ci.yml', `run: psql -c "select set_config('hearth.break_glass', 'twilio_reclear', true)"`],
      [OUTPUT, "const why = 'twilio_reclear'"],
      [ENTRY, '// only steps.ts names hearth.owner_bootstrap'],
    ])
    expect(seamOutside(sources)).toEqual([
      'apps/server/src/auth/sign-in.ts: hearth.break_glass',
      'apps/server/src/auth/sign-in.ts: twilio_reclear',
      `${COVERAGE}: hearth.owner_bootstrap`,
      '.github/workflows/ci.yml: hearth.break_glass',
      '.github/workflows/ci.yml: twilio_reclear',
      `${OUTPUT}: twilio_reclear`,
    ])
  })

  it('passes the planted steps.ts, and fails twilio_reclear outside recover() or a marker other than ’’', () => {
    const check = (sources: Sources) => seamInSteps(scriptFile(parsedScript(sources), STEPS))
    const line = (sources: Sources, needle: string) => `${STEPS}:${lineIn(sources, STEPS, needle)}`
    expect(check(planted())).toEqual([])
    const prologue = "async function prologue(db: Queryable, marker: '' | 'twilio_reclear')"
    const unused = plant(STEPS, prologue, `const RECLEAR = 'twilio_reclear'\n${prologue}`)
    expect(check(unused)).toEqual([`${line(unused, 'RECLEAR')}: twilio_reclear where no mode reaches it`])
    const shared = plantAll(STEPS, [
      [prologue, `const RECLEAR = 'twilio_reclear'\n${prologue}`],
      ['  await db.query(SQL.prologue, [marker])', '  await db.query(SQL.prologue, [marker || RECLEAR])'],
    ])
    expect(check(shared)).toContain(
      `${line(shared, 'RECLEAR =')}: twilio_reclear where setUp, recover, correctNumber reaches it`,
    )
    const setUp = 'export async function setUp(db: Queryable, doc: SetUpDocument, id: string): Promise<void> {\n'
    const inSetUp = plant(STEPS, `${setUp}  await prologue(db, '')`, `${setUp}  await prologue(db, 'twilio_reclear')`)
    expect(check(inSetUp)).toEqual([
      `${line(inSetUp, "prologue(db, 'twilio_reclear')")}: twilio_reclear where setUp reaches it`,
      `${line(inSetUp, "prologue(db, 'twilio_reclear')")}: sets twilio_reclear where setUp reaches it`,
      `${STEPS}: setUp() doesn't set the marker to ''`,
    ])
    const correct = 'export async function correctNumber(db: Queryable, id: string): Promise<void> {\n'
    const off = plant(STEPS, `${correct}  await prologue(db, '')`, `${correct}  await prologue(db, 'off')`)
    expect(check(off)).toEqual([
      `${line(off, "prologue(db, 'off')")}: sets the marker to something other than '' or twilio_reclear`,
      `${STEPS}: correctNumber() doesn't set the marker to ''`,
    ])
    const typed = plant(
      STEPS,
      "  const reclearMarker = 'twilio_reclear'\n  await prologue(db, reclearMarker)",
      '  await prologue(db, dpo)',
    )
    expect(check(typed)).toEqual([
      `${line(typed, 'prologue(db, dpo)')}: sets the marker to a value the guard can't follow`,
      `${STEPS}: recover() doesn't set twilio_reclear`,
    ])
    const literal = plant(
      STEPS,
      "pg_catalog.set_config('hearth.break_glass', $1, true)",
      "pg_catalog.set_config('hearth.break_glass', 'twilio_reclear', true)",
    )
    expect(check(literal)).toEqual([
      `${line(literal, "'hearth.break_glass', 'twilio_reclear'")}: twilio_reclear where setUp, recover, correctNumber reaches it`,
      `${line(literal, "'hearth.break_glass', 'twilio_reclear'")}: sets twilio_reclear where setUp, recover, correctNumber reaches it`,
      `${STEPS}: setUp() doesn't set the marker to ''`,
      `${STEPS}: correctNumber() doesn't set the marker to ''`,
    ])
    // A mode that reaches both values sets more than ''.
    const both = plantAll(STEPS, [
      [
        '  prologue: `select',
        "  reclear0: `select pg_catalog.set_config('hearth.break_glass', 'twilio_reclear', true)`,\n  prologue: `select",
      ],
      ['  await db.query(SQL.begin)\n', '  await db.query(SQL.begin)\n  await db.query(SQL.reclear0)\n'],
    ])
    expect(check(both)).toEqual([
      `${line(both, 'reclear0:')}: twilio_reclear where setUp, recover, correctNumber reaches it`,
      `${line(both, 'reclear0:')}: sets twilio_reclear where setUp, recover, correctNumber reaches it`,
      `${STEPS}: setUp() sets the marker to more than ''`,
      `${STEPS}: correctNumber() sets the marker to more than ''`,
    ])
    expect(check(plant(STEPS, `${correct}  await prologue(db, '')\n`, correct))).toEqual([
      `${STEPS}: correctNumber() doesn't set the marker to ''`,
    ])
  })

  it('the real files: the seam’s names only where allowed, and twilio_reclear only in recover()', () => {
    const sources = realSources()
    expect(seamOutside(sources)).toEqual([])
    expect(seamInSteps(scriptFile(parsedScript(sources), STEPS))).toEqual([])
  })
})

// --- BSG-05: constant SQL -------------------------------------------------------------------------

// Whether a query's text is constant: a literal; a const, or a key of a const object (the SQL
// table), holding one; either branch of a condition being one; or a helper's parameter that every
// call gives one.
function constantSql(expr: ts.Expression, depth = 0): boolean {
  if (depth > 6) return false
  const e = unwrap(expr)
  if (constantText(e) !== undefined) return true
  if (ts.isConditionalExpression(e)) return constantSql(e.whenTrue, depth + 1) && constantSql(e.whenFalse, depth + 1)
  if ((ts.isPropertyAccessExpression(e) || ts.isElementAccessExpression(e)) && ts.isIdentifier(unwrap(e.expression))) {
    const key = ts.isPropertyAccessExpression(e) ? e.name.text : constantText(e.argumentExpression)
    const binding = bindingOf(unwrap(e.expression) as ts.Identifier)
    const table = binding?.kind === 'value' ? unwrap(binding.init) : undefined
    if (key === undefined || table === undefined || !ts.isObjectLiteralExpression(table)) return false
    const entry = table.properties.find(p => ts.isPropertyAssignment(p) && propertyName(p.name) === key)
    return (
      entry !== undefined && ts.isPropertyAssignment(entry) && constantText(unwrap(entry.initializer)) !== undefined
    )
  }
  if (!ts.isIdentifier(e)) return false
  const binding = bindingOf(e)
  if (binding?.kind === 'value') return constantSql(binding.init, depth + 1)
  if (binding?.kind === 'param') {
    const name = functionName(binding.fn)
    const calls = name === undefined ? [] : callsTo(e.getSourceFile(), name)
    return (
      calls.length > 0 &&
      calls.every(
        call =>
          call.arguments[binding.index] !== undefined &&
          constantSql(call.arguments[binding.index] as ts.Expression, depth + 1),
      )
    )
  }
  return false
}

// Each query() in steps.ts whose text isn't constant.
function sqlProblems(steps: ts.SourceFile): string[] {
  const queries = nodesOf(steps).filter(
    (node): node is ts.CallExpression => ts.isCallExpression(node) && calleeName(node) === 'query',
  )
  if (queries.length === 0) return [`${STEPS}: no query() call`]
  return queries.flatMap(call => {
    const first = call.arguments[0] && unwrap(call.arguments[0])
    let text: ts.Expression | undefined = first
    if (first && ts.isObjectLiteralExpression(first)) {
      const p = first.properties.find(q => ts.isPropertyAssignment(q) && propertyName(q.name) === 'text')
      text = p && ts.isPropertyAssignment(p) ? p.initializer : undefined
    }
    return text !== undefined && constantSql(text) ? [] : [`${at(call)}: query() given text that isn't a constant`]
  })
}

describe('BSG-05 (R1, PD-119): every statement is a constant, every value a bound parameter', () => {
  it('passes the planted steps.ts and fails a template, a concatenation or a value', () => {
    const check = (sources: Sources) => sqlProblems(scriptFile(parsedScript(sources), STEPS))
    expect(check(planted())).toEqual([])
    const insert = '  await db.query(SQL.insertOrg, [id, doc.organisation])'
    const fails = (to: string) => {
      const sources = plant(STEPS, insert, to)
      expect(check(sources)).toEqual([
        `${STEPS}:${lineIn(sources, STEPS, to.trim())}: query() given text that isn't a constant`,
      ])
    }
    fails(`  await db.query(\`insert into public.orgs (id, name) values (\${id}, $1)\`, [doc.organisation])`)
    fails("  await db.query('insert into public.orgs (name) values (' + doc.organisation + ')')")
    fails('  await db.query(doc.organisation)')
    fails(`  await db.query({ text: \`select \${id}\` })`)
    expect(check(plant(STEPS, insert, '  await db.query({ text: SQL.insertOrg, values: [id] })'))).toEqual([])
    expect(check(plant(STEPS, insert, '  await db.query(id ? SQL.insertOrg : SQL.begin, [id])'))).toEqual([])
    // A helper's text is constant only when every call gives it a constant.
    const setUp = 'export async function setUp('
    const helper = `async function run(db: Queryable, text: string) {\n  await db.query(text)\n}\n${setUp}`
    const given = plantAll(STEPS, [
      [setUp, helper],
      [insert, `${insert}\n  await run(db, SQL.begin)`],
    ])
    expect(check(given)).toEqual([])
    const valued = plantAll(STEPS, [
      [setUp, helper],
      [insert, `${insert}\n  await run(db, SQL.begin)\n  await run(db, doc.organisation)`],
    ])
    expect(check(valued)).toEqual([
      `${STEPS}:${lineIn(valued, STEPS, 'db.query(text)')}: query() given text that isn't a constant`,
    ])
  })

  it('the real steps.ts sends only constants', () => {
    expect(sqlProblems(scriptFile(parsedScript(realSources()), STEPS))).toEqual([])
  })
})

// --- BSG-06: settings and server objects ----------------------------------------------------------

// A literal is SQL when a query() is given it or it starts as a statement does.
const SQL_START =
  /^\s*(?:select|insert|update|delete|with|begin|commit|rollback|set|reset|comment|alter|lock|do|call|create|drop|grant|revoke|truncate|start|savepoint|release|show|discard|notify|listen|copy|explain|analyze|vacuum)\s/

// The statements no script may send: one that changes a setting or the role outside set_config(…,
// true), and one that changes a server object (a comment, a database, a role, the system).
const FORBIDDEN: readonly { what: string; pattern: RegExp }[] = [
  {
    what: 'SET',
    pattern:
      /(?:^|;)\s*set\s+(?:local\s+|session\s+)?(?:role\b|session\s+authorization\b|[a-z_][\w.]*\s*(?:=|\bto\b))/i,
  },
  { what: 'RESET', pattern: /(?:^|;)\s*reset\s+(?:all|role|session\s+authorization|[a-z_][\w.]*)\s*(?:;|$)/i },
  { what: 'SET ROLE', pattern: /\bset\s+(?:local\s+|session\s+)?role\b/i },
  { what: 'SESSION AUTHORIZATION', pattern: /\bsession\s+authorization\b/i },
  { what: 'COMMENT ON', pattern: /\bcomment\s+on\s+[a-z]/i },
  { what: 'ALTER DATABASE, ROLE or SYSTEM', pattern: /\balter\s+(?:database|role|user|system)\b/i },
]

// Each set_config(…) call's arguments, split at the commas outside brackets and quotes.
function setConfigArgs(text: string): string[][] {
  const calls: string[][] = []
  for (const match of text.matchAll(/\bset_config\s*\(/gi)) {
    const args: string[] = []
    let depth = 0
    let quoted = false
    let arg = ''
    for (const ch of text.slice((match.index ?? 0) + match[0].length)) {
      if (ch === "'") quoted = !quoted
      if (!quoted && ch === '(') depth += 1
      if (!quoted && ch === ')') {
        if (depth === 0) break
        depth -= 1
      }
      if (!quoted && depth === 0 && ch === ',') {
        args.push(arg.trim())
        arg = ''
      } else arg += ch
    }
    args.push(arg.trim())
    calls.push(args)
  }
  return calls
}

// Whether a literal is a client's options: the value of an options property, or a const that one
// names.
function givenAsOptions(node: ts.Node, file: ts.SourceFile): boolean {
  const isOptions = (n: ts.Node): n is ts.PropertyAssignment =>
    ts.isPropertyAssignment(n) && propertyName(n.name) === 'options'
  if (isOptions(node.parent)) return true
  const decl = node.parent
  if (!ts.isVariableDeclaration(decl) || !ts.isIdentifier(decl.name)) return false
  const name = decl.name.text
  return nodesOf(file).some(n => isOptions(n) && unwrap(n.initializer).getText() === name)
}

// What is wrong with the settings the script sends: a set_config() not transaction-local or taking
// a role, a forbidden statement, and a role taken anywhere but the entry's start-up option, which
// must be exactly section 1.4's.
function settingsProblems(files: ReadonlyMap<string, ts.SourceFile>): string[] {
  const found: string[] = []
  const queried = new Set<ts.Node>()
  for (const file of files.values()) {
    for (const node of nodesOf(file)) {
      if (ts.isCallExpression(node) && calleeName(node) === 'query' && node.arguments[0])
        queried.add(unwrap(node.arguments[0]))
    }
  }
  let options = 0
  for (const [path, file] of files) {
    for (const { node, text } of literalsOf(file)) {
      for (const args of setConfigArgs(text)) {
        if (args[2]?.toLowerCase() !== 'true') found.push(`${at(node)}: a set_config() that isn't transaction-local`)
        if (/^'(?:role|session_authorization)'$/i.test(args[0] ?? ''))
          found.push(`${at(node)}: takes a role through set_config()`)
      }
      if (queried.has(node) || SQL_START.test(text)) {
        for (const { what, pattern } of FORBIDDEN)
          if (pattern.test(text)) found.push(`${at(node)}: a ${what} statement`)
      }
      // A literal that takes a role: in the entry, exactly section 1.4's start-up option, given to
      // the client as its options (directly or through a const); nowhere else.
      if (!/(?:^|\s)-c\s*role\s*=|\brole\s*=\s*hearth_owner\b/.test(text)) continue
      if (path !== ENTRY || text !== START_OPTIONS) {
        found.push(`${at(node)}: takes a role other than by the entry's start-up option`)
      } else if (givenAsOptions(node, file)) options += 1
      else found.push(`${at(node)}: the start-up option isn't given to the client as its options`)
    }
  }
  if (options !== 1)
    found.push(`${ENTRY}: the start-up option, exactly section 1.4's, is given ${options} times, not once`)
  return found
}

// SQL with its comments gone (-- to the line's end, /* … */ nested), strings and dollar-quoted text
// kept, in lower case. A comment inside a function's body is a comment too.
function sqlWithoutComments(source: string): string {
  let out = ''
  let i = 0
  while (i < source.length) {
    const c = source[i]
    if (c === '-' && source[i + 1] === '-') {
      while (i < source.length && source[i] !== '\n') i += 1
    } else if (c === '/' && source[i + 1] === '*') {
      let depth = 0
      do {
        if (source[i] === '/' && source[i + 1] === '*') {
          depth += 1
          i += 2
        } else if (source[i] === '*' && source[i + 1] === '/') {
          depth -= 1
          i += 2
        } else i += 1
      } while (i < source.length && depth > 0)
      out += ' '
    } else if (c === "'") {
      const start = i
      i += 1
      while (i < source.length && !(source[i] === "'" && source[i + 1] !== "'")) i += source[i] === "'" ? 2 : 1
      i += 1
      out += source.slice(start, i)
    } else {
      out += c
      i += 1
    }
  }
  return out.toLowerCase()
}

// Each migration or seed that gives every environment one marker.
const markersInSql = (sources: Sources): string[] =>
  [...sources]
    .filter(([path]) => /^db\/(?:migrations|seed)\/[^/]+\.sql$/.test(path))
    .filter(([, text]) => /\bcomment\s+on\s+database\b/.test(sqlWithoutComments(text)))
    .map(([path]) => `${path}: comment on database`)

describe('BSG-06 (R3, R6, PD-121): settings are transaction-local, the role is a start-up option, and nothing changes a server object', () => {
  it('passes the planted script and fails each way to change a setting, the role or a server object', () => {
    const check = (sources: Sources) => settingsProblems(parsedScript(sources))
    expect(check(planted())).toEqual([])
    const lock = "pg_catalog.set_config('lock_timeout', '2s', true)"
    expect(check(plant(STEPS, lock, "pg_catalog.set_config('lock_timeout', '2s', false)"))).toEqual([
      `${STEPS}:6: a set_config() that isn't transaction-local`,
    ])
    expect(check(plant(STEPS, lock, "pg_catalog.set_config('role', 'hearth_owner', true)"))).toEqual([
      `${STEPS}:6: takes a role through set_config()`,
    ])
    const begin = "  begin: 'begin isolation level read committed read write',"
    for (const [statement, what] of [
      ['set role hearth_owner', 'SET'],
      ['set lock_timeout = 5000', 'SET'],
      ['set local statement_timeout to 0', 'SET'],
      ['reset all', 'RESET'],
      ['set session authorization hearth_owner', 'SET'],
      ['comment on database hearth is $$hearth-env:prod$$', 'COMMENT ON'],
      ['alter database hearth set log_statement = none', 'ALTER DATABASE, ROLE or SYSTEM'],
      ['alter role hearth_app nobypassrls', 'ALTER DATABASE, ROLE or SYSTEM'],
      ['alter system set log_parameter_max_length = 0', 'ALTER DATABASE, ROLE or SYSTEM'],
    ] as const) {
      expect(check(plant(STEPS, begin, `${begin}\n  x: '${statement}',`))).toContain(`${STEPS}:6: a ${what} statement`)
    }
    // An UPDATE's SET is no setting, and a message that says "set up" is no statement.
    expect(check(plant(STEPS, begin, `${begin}\n  y: 'set up the organisation',`))).toEqual([])
    expect(
      check(
        plant(ENTRY, `const START = '${START_OPTIONS}'`, "const START = '-c role=hearth_owner -c lock_timeout=2s'"),
      ),
    ).toEqual([
      `${ENTRY}:8: takes a role other than by the entry's start-up option`,
      `${ENTRY}: the start-up option, exactly section 1.4's, is given 0 times, not once`,
    ])
    expect(check(plant(ENTRY, 'options: START', "options: '-c lock_timeout=2s'"))).toEqual([
      `${ENTRY}:8: the start-up option isn't given to the client as its options`,
      `${ENTRY}: the start-up option, exactly section 1.4's, is given 0 times, not once`,
    ])
    expect(check(plant(ENTRY, 'options: START', `options: '${START_OPTIONS}'`))).toEqual([
      `${ENTRY}:8: the start-up option isn't given to the client as its options`,
    ])
    expect(
      check(
        plant(
          TARGET,
          'export function environmentProblems',
          `const OTHER = '-c role=hearth_owner'\nexport function environmentProblems`,
        ),
      ),
    ).toEqual([`${TARGET}:3: takes a role other than by the entry's start-up option`])
  })

  it('finds a migration or the seed that sets the marker, comments stripped, on planted text', () => {
    const sources = new Map([
      ['db/migrations/0013_a.sql', '-- C0.12 sets the comment on database, never a migration\nselect 1;'],
      [
        'db/migrations/0014_b.sql',
        "create function f() returns void language plpgsql as $$\nbegin\n  -- comment on database x\n  execute 'COMMENT ON DATABASE ' || current_database() || ' IS ''hearth-env:prod''';\nend $$;",
      ],
      ['db/seed/tembusu.sql', '/* nothing */ Comment  On\n  Database hearth is null;'],
      ['db/tests/900_x.sql', 'comment on database x is null;'],
    ])
    expect(markersInSql(sources)).toEqual([
      'db/migrations/0014_b.sql: comment on database',
      'db/seed/tembusu.sql: comment on database',
    ])
  })

  it('the real script and the real migrations and seed', () => {
    const sources = realSources()
    expect(settingsProblems(parsedScript(sources))).toEqual([])
    expect([...sources.keys()].some(path => path.startsWith('db/migrations/'))).toBe(true)
    expect(markersInSql(sources)).toEqual([])
  })
})

// --- BSG-07: shared rules imported, not copied ----------------------------------------------------

const INPUT_IMPORTS = [
  'normalisePhone',
  'aiCopyIn',
  'flatText',
  'orgNameProblems',
  'TransferFactsBody',
  'transferProblems',
  'NOTICE_TRANSFER_FACTS',
  'NOTICE_FREE_TEXT_FIELDS',
]
const STEPS_IMPORTS = ['FLAGS', 'PURPOSE_KEYS', 'PROVIDERS']

// The values a file imports from @hearth/shared and uses outside the import.
function sharedUsed(file: ts.SourceFile): Set<string> {
  const imported = new Set<string>()
  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement) || constantText(statement.moduleSpecifier) !== '@hearth/shared') continue
    if (statement.importClause?.isTypeOnly) continue
    const bindings = statement.importClause?.namedBindings
    if (bindings && ts.isNamedImports(bindings)) {
      for (const e of bindings.elements) if (!e.isTypeOnly) imported.add(e.name.text)
    }
  }
  const used = new Set<string>()
  for (const node of nodesOf(file)) {
    if (ts.isIdentifier(node) && imported.has(node.text) && !ts.isImportSpecifier(node.parent)) used.add(node.text)
  }
  return used
}

// The transfer facts' fields and keys, and their problem codes, lower case.
const snake = (field: string) => field.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)
const FACT_WORDS = [
  ...Object.keys(TransferFactsBody.shape),
  ...Object.keys(TransferFactsBody.shape).map(snake),
  ...NOTICE_TRANSFER_FACTS,
  ...TRANSFER_PROBLEMS,
].map(word => word.toLowerCase())

// Why a regular expression in input.ts is one of its own for a rule it must share, or undefined:
// its words (escapes and syntax gone) hold one AI_COPY refuses, in either case; it names a fact or
// a problem code, or has a country code's or a day's shape; or it matches digits or a plus outside
// the fiction rule's and the seed list's own declarations.
function copiedRule(source: string, owner: string | undefined): string | undefined {
  const plain = source.replace(/\\./g, ' ').replace(/[()[\]{}?:|*+^$.,=!<>-]/g, ' ')
  if (/[✦✧✨]/u.test(source) || AI_COPY.some(pattern => pattern.test(plain) || pattern.test(plain.toUpperCase()))) {
    return 'an AI_COPY word'
  }
  const words = plain.toLowerCase().match(/[a-z_]+/g) ?? []
  if (words.some(word => FACT_WORDS.includes(word)) || /\[A-Z\]\{2\}|\[a-z\]\{2\}|\\d\{4\}-\\d\{2\}/i.test(source))
    return 'a transfer fact'
  if (/\\d|\[0-9\]|\\\+/.test(source) && !/fiction|seed/i.test(owner ?? '')) return 'a number'
  return undefined
}

// What input.ts and steps.ts copy that they must import: a shared rule not imported and used, a
// regular expression of input.ts's own for a word, a fact or a number, and a recovery statement that
// reads the DPO's record other than through notice_facts().
function sharedRuleProblems(files: ReadonlyMap<string, ts.SourceFile>): string[] {
  const found: string[] = []
  const input = files.get(INPUT)
  const steps = files.get(STEPS)
  if (input === undefined || steps === undefined) return [`${INPUT} or ${STEPS} is missing`]
  const inputUses = sharedUsed(input)
  for (const name of INPUT_IMPORTS) if (!inputUses.has(name)) found.push(`${INPUT}: doesn't import and use ${name}`)
  for (const node of nodesOf(input)) {
    let source: string | undefined
    if (ts.isRegularExpressionLiteral(node)) source = node.text.slice(1, node.text.lastIndexOf('/'))
    else if (
      (ts.isNewExpression(node) || ts.isCallExpression(node)) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'RegExp'
    ) {
      const arg = node.arguments?.[0]
      source = arg === undefined ? undefined : textOf(arg)
    }
    if (source === undefined) continue
    const why = copiedRule(source, ownerOf(node))
    if (why !== undefined) found.push(`${at(node)}: a pattern of its own for ${why}`)
  }
  const stepsUses = sharedUsed(steps)
  for (const name of STEPS_IMPORTS) if (!stepsUses.has(name)) found.push(`${STEPS}: doesn't import and use ${name}`)
  const recovery = literalsOf(steps).filter(
    ({ text }) => text.includes('bootstrap_transfer_clearance(') && text.includes('notice_version_providers'),
  )
  if (recovery.length !== 1) found.push(`${STEPS}: ${recovery.length} recovery statements, not one`)
  for (const { node, text } of recovery) {
    if (!/public\.notice_facts\(\s*public\.transfer_register_facts\(/.test(text)) {
      found.push(`${at(node)}: the recovery statement doesn't take the DPO's record through public.notice_facts(`)
    }
    for (const match of text.matchAll(/public\.transfer_register_facts\(\s*[\w.]+\s*\)/g)) {
      const before = text.slice(0, match.index ?? 0)
      const after = text.slice((match.index ?? 0) + match[0].length)
      if (!/public\.notice_facts\(\s*$/.test(before) && !/^\s*::\s*text\b/.test(after)) {
        found.push(
          `${at(node)}: the recovery statement reads the entry's facts other than through public.notice_facts(`,
        )
      }
    }
  }
  return found
}

describe('BSG-07 (PD-118, PD-119, PD-127): input.ts and steps.ts import the shared rules rather than copy them', () => {
  it('passes the planted script and fails a missing import or a copied rule', () => {
    const check = (sources: Sources) => sharedRuleProblems(parsedScript(sources))
    expect(check(planted())).toEqual([])
    expect(check(plant(INPUT, '  aiCopyIn,\n', ''))).toEqual([`${INPUT}: doesn't import and use aiCopyIn`])
    const word = 'const WORD_KEY = /^[A-Za-z_]{1,40}$/'
    expect(check(plant(INPUT, word, `${word}\nconst ASK = /\\bask\\b/i`))).toEqual([
      `${INPUT}:17: a pattern of its own for an AI_COPY word`,
    ])
    expect(check(plant(INPUT, word, `${word}\nconst AI = new RegExp('\\\\bAI\\\\b')`))).toEqual([
      `${INPUT}:17: a pattern of its own for an AI_COPY word`,
    ])
    expect(check(plant(INPUT, word, `${word}\nconst COUNTRY = /^[A-Z]{2}$/`))).toEqual([
      `${INPUT}:17: a pattern of its own for a transfer fact`,
    ])
    expect(check(plant(INPUT, word, `${word}\nconst DAY = /^\\d{4}-\\d{2}-\\d{2}$/`))).toEqual([
      `${INPUT}:17: a pattern of its own for a transfer fact`,
    ])
    expect(check(plant(INPUT, word, `${word}\nconst RETENTION = /provider_retention/`))).toEqual([
      `${INPUT}:17: a pattern of its own for a transfer fact`,
    ])
    expect(check(plant(INPUT, word, `${word}\nconst E164 = /^\\+[1-9]\\d{6,14}$/`))).toEqual([
      `${INPUT}:17: a pattern of its own for a number`,
    ])
    // The fiction rule's own pattern is allowed.
    expect(check(plant(INPUT, word, `${word}\nconst isSeedNumber = (n: string) => /^\\+65\\d{8}$/.test(n)`))).toEqual(
      [],
    )
    expect(
      check(
        plant(
          STEPS,
          "import { FLAGS, PROVIDERS, PURPOSE_KEYS } from '@hearth/shared'",
          "import { FLAGS, PURPOSE_KEYS } from '@hearth/shared'\nconst PROVIDERS = ['twilio', 'aws']",
        ),
      ),
    ).toEqual([`${STEPS}: doesn't import and use PROVIDERS`])
    expect(
      check(
        plant(
          STEPS,
          'select public.notice_facts(public.transfer_register_facts(t)) as facts',
          'select public.transfer_register_facts(t) as facts',
        ),
      ),
    ).toEqual([
      `${STEPS}:11: the recovery statement doesn't take the DPO's record through public.notice_facts(`,
      `${STEPS}:11: the recovery statement reads the entry's facts other than through public.notice_facts(`,
    ])
  })

  it('the real input.ts and steps.ts', () => {
    expect(sharedRuleProblems(parsedScript(realSources()))).toEqual([])
  })
})

// --- BSG-08: order --------------------------------------------------------------------------------

// The calls a function makes in document order, each call to another top-level function of the same
// file replaced by that function's calls (once each), so a helper's work counts where it is called.
function callSequence(file: ts.SourceFile, fn: ts.Node, seen = new Set<ts.Node>()): ts.CallExpression[] {
  seen.add(fn)
  const sequence: ts.CallExpression[] = []
  const visit = (node: ts.Node): void => {
    ts.forEachChild(node, visit)
    if (!ts.isCallExpression(node)) return
    const name = calleeName(node)
    const local = name !== undefined && ts.isIdentifier(unwrap(node.expression)) ? topFunction(file, name) : undefined
    if (local !== undefined && !seen.has(local)) sequence.push(...callSequence(file, local, seen))
    sequence.push(node)
  }
  ts.forEachChild(fn, visit)
  return sequence
}

// The top-level functions of input.ts that reach orgNameProblems(): the input's parse.
function parsersOf(input: ts.SourceFile): string[] {
  const graph = referenceGraph(input)
  const functions = input.statements.flatMap(s => {
    if (ts.isFunctionDeclaration(s) && s.name) return [s.name.text]
    if (ts.isVariableStatement(s))
      return s.declarationList.declarations.flatMap(d =>
        ts.isIdentifier(d.name) && d.initializer && isFunctionLike(unwrap(d.initializer)) ? [d.name.text] : [],
      )
    return []
  })
  return reachers(graph, 'orgNameProblems', functions)
}

// What is wrong with the order: the input's parse or environmentProblems() after the first
// connect(), or missing; insert into public.orgs anywhere but what setUp() alone reaches; setUp()
// taking anything but the parsed document; input.ts not holding the organisation to
// orgNameProblems().
function orderProblems(files: ReadonlyMap<string, ts.SourceFile>): string[] {
  const found: string[] = []
  const entry = files.get(ENTRY)
  const input = files.get(INPUT)
  const steps = files.get(STEPS)
  if (entry === undefined || input === undefined || steps === undefined)
    return [`${ENTRY}, ${INPUT} or ${STEPS} is missing`]
  const parsers = parsersOf(input)
  const imported = new Set<string>()
  for (const statement of entry.statements) {
    if (!ts.isImportDeclaration(statement) || constantText(statement.moduleSpecifier) !== './owner-bootstrap/input.ts')
      continue
    const bindings = statement.importClause?.namedBindings
    if (bindings && ts.isNamedImports(bindings))
      for (const e of bindings.elements)
        if (parsers.includes((e.propertyName ?? e.name).text)) imported.add(e.name.text)
  }
  const main = topFunction(entry, 'main')
  const sequence = callSequence(entry, main ?? entry)
  const connect = sequence.findIndex(call => {
    const callee = unwrap(call.expression)
    return ts.isPropertyAccessExpression(callee) && callee.name.text === 'connect'
  })
  const first = (test: (call: ts.CallExpression) => boolean) => sequence.findIndex(test)
  const parse = first(call => imported.has(calleeName(call) ?? '') && ts.isIdentifier(unwrap(call.expression)))
  const env = first(call => calleeName(call) === 'environmentProblems')
  if (connect === -1) found.push(`${ENTRY}: no connect()`)
  if (parse === -1 || (connect !== -1 && parse > connect))
    found.push(`${ENTRY}: the input isn't parsed before the first connect()`)
  if (env === -1 || (connect !== -1 && env > connect))
    found.push(`${ENTRY}: environmentProblems() doesn't run before the first connect()`)
  const graph = referenceGraph(steps)
  for (const [path, file] of files) {
    for (const { node, text } of literalsOf(file)) {
      if (!/\binsert\s+into\s+public\.orgs\b/i.test(text)) continue
      const owner = ownerOf(node)
      const modes =
        path !== STEPS || owner === undefined
          ? []
          : owner === 'setUp'
            ? ['setUp']
            : reachers(graph, owner, MODE_FUNCTIONS)
      if (modes.length !== 1 || modes[0] !== 'setUp')
        found.push(`${at(node)}: insert into public.orgs outside what setUp() alone reaches`)
    }
  }
  const setUp = topFunction(steps, 'setUp')
  const parsedTypes = new Set(
    input.statements.flatMap(s => {
      const fn = ts.isFunctionDeclaration(s) && s.name && parsers.includes(s.name.text) ? s : undefined
      return fn?.type ? (fn.type.getText().match(/\w+/g) ?? []) : []
    }),
  )
  const params = setUp?.parameters ?? []
  // Raw JSON would come in untyped, or as unknown, any, object or a Record; an id is a string.
  const raw = params.some(
    p =>
      p.type === undefined ||
      [ts.SyntaxKind.UnknownKeyword, ts.SyntaxKind.AnyKeyword, ts.SyntaxKind.ObjectKeyword].includes(p.type.kind) ||
      (ts.isTypeReferenceNode(p.type) && ['Record', 'JSON', 'Object'].includes(p.type.typeName.getText())),
  )
  const takesDocument = params.some(
    p => p.type !== undefined && ts.isTypeReferenceNode(p.type) && parsedTypes.has(p.type.typeName.getText()),
  )
  if (setUp === undefined || raw || !takesDocument)
    found.push(`${STEPS}: setUp() takes something other than the parsed set-up document`)
  const checksName = nodesOf(input).some(
    node =>
      ts.isCallExpression(node) &&
      calleeName(node) === 'orgNameProblems' &&
      node.arguments[0] !== undefined &&
      /(?:^|\.)organisation$/.test(unwrap(node.arguments[0]).getText()),
  )
  if (!checksName) found.push(`${INPUT}: the organisation isn't held to orgNameProblems()`)
  return found
}

describe('BSG-08 (T22 item 37, PD-124): the input and the environment are checked before connecting, and only setUp() creates the org', () => {
  it('passes the planted script and fails each order', () => {
    const check = (sources: Sources) => orderProblems(parsedScript(sources))
    expect(check(planted())).toEqual([])
    const parse = "  const doc = parseDocument('set-up', env.input)\n"
    const open = '  const client = await open(args.database)\n'
    expect(check(plant(ENTRY, `${parse}${open}`, `${open}${parse}`))).toEqual([
      `${ENTRY}: the input isn't parsed before the first connect()`,
    ])
    expect(check(plant(ENTRY, '  const problems = environmentProblems(env)\n', ''))).toEqual([
      `${ENTRY}: environmentProblems() doesn't run before the first connect()`,
    ])
    // A helper that connects counts where it is called.
    const args = '  const args = parseArguments(process.argv.slice(2))\n'
    expect(check(plant(ENTRY, args, `${args}  await open(args.database)\n`))).toEqual([
      `${ENTRY}: the input isn't parsed before the first connect()`,
      `${ENTRY}: environmentProblems() doesn't run before the first connect()`,
    ])
    expect(check(plant(ENTRY, '  await client.connect()\n', ''))).toEqual([`${ENTRY}: no connect()`])
    const again = plantAll(STEPS, [
      ["  removeNumber: 'update", "  again: 'insert into public.orgs (id) values ($1)',\n  removeNumber: 'update"],
      ['await db.query(SQL.removeNumber, [id])', 'await db.query(SQL.again, [id])'],
    ])
    expect(check(again)).toEqual([
      `${STEPS}:${lineIn(again, STEPS, 'again:')}: insert into public.orgs outside what setUp() alone reaches`,
    ])
    const shared = plant(STEPS, 'await db.query(SQL.removeNumber, [id])', 'await db.query(SQL.insertOrg, [id])')
    expect(check(shared)).toEqual([
      `${STEPS}:${lineIn(shared, STEPS, 'insertOrg:')}: insert into public.orgs outside what setUp() alone reaches`,
    ])
    expect(check(plant(STEPS, 'doc: SetUpDocument', 'doc: unknown'))).toEqual([
      `${STEPS}: setUp() takes something other than the parsed set-up document`,
    ])
    expect(check(plant(STEPS, 'doc: SetUpDocument', 'doc: Record<string, string>'))).toEqual([
      `${STEPS}: setUp() takes something other than the parsed set-up document`,
    ])
    expect(check(plant(INPUT, 'orgNameProblems(doc.organisation)', 'orgNameProblems(doc.number)'))).toEqual([
      `${INPUT}: the organisation isn't held to orgNameProblems()`,
    ])
  })

  it('the real entry, input.ts and steps.ts', () => {
    expect(orderProblems(parsedScript(realSources()))).toEqual([])
  })
})

// --- BSG-09: CI wiring and the docs ---------------------------------------------------------------

// What pg 8.23.1 reads of the environment itself (connection-parameters.js: 'PG' and the key), and
// the CA bundle Node reads: a runbook may name these as well as the script's own.
const PG_READS = ['PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE', 'PGSSLMODE', 'PGSSLNEGOTIATION']
const NODE_READS = ['NODE_EXTRA_CA_CERTS']
const VARIABLE_SHAPE =
  /^(?:OWNER_BOOTSTRAP_[A-Z0-9_]+|DEPLOY_ENV|PG[A-Z]+|NODE_[A-Z0-9_]+|CLAUDECODE|CLAUDE_CODE_[A-Z_]+|AI_AGENT|GITHUB_ACTIONS|CI)$/

// Section 2.1's two ways to load the input, each set for one command: from the secret, at the
// version id read before the plan, so the commit runs on the document the plan checked; or (the
// recovery document alone, which holds no name or number) typed once with echo on into doc, an
// unexported shell variable that the plan and the commit both read. Nothing is pasted or typed twice:
// a commit's printed lines can't show that it ran on the plan's document (a set-up's prints no
// summary, a recovery's prints the reason only as a length), so only the same bytes bind it.
const LOADS = [
  /^OWNER_BOOTSTRAP_INPUT="\$\(aws secretsmanager get-secret-value --secret-id <[^>]+> --version-id <[^>]+> --query SecretString --output text\)" node scripts\/owner-bootstrap\.ts /,
  /^OWNER_BOOTSTRAP_INPUT="\$doc" node scripts\/owner-bootstrap\.ts recover\b/,
]

// The Line kinds whose printed text doesn't start with the kind, so a runbook naming one as
// "`<kind>` line" names a label nobody sees (output.ts's render(); committing, committed and next
// print their kind).
const UNPRINTED_KINDS = [
  'target',
  'organisation',
  'founder_name',
  'number',
  'reviews',
  'inputs',
  'dpo_sessions',
  'twilio_now',
  'log_warning',
  'facts_source',
  'changed',
  'send_state',
  'kept_nothing',
  'connect_failed',
  'refused',
  'lost',
  'interrupted',
  'unexpected',
]

// The code a Markdown text holds: each inline span, and each line of a fenced block.
function codeUnits(text: string): string[] {
  const units: string[] = []
  let fence: string | undefined
  for (const line of text.split('\n')) {
    const marker = /^\s*(```|~~~)/.exec(line)?.[1]
    if (marker !== undefined && (fence === undefined || fence === marker)) {
      fence = fence === undefined ? marker : undefined
      continue
    }
    if (fence !== undefined) units.push(line)
    else for (const [, span] of line.matchAll(/`([^`\n]+)`/g)) units.push(span ?? '')
  }
  return units
}

// What the script has: its modes (the array that lists set-up), its flags (parseArgs's options)
// and the variables it reads.
interface ScriptSurface {
  modes: string[]
  flags: string[]
  variables: Set<string>
}

function surfaceOf(files: ReadonlyMap<string, ts.SourceFile>): ScriptSurface {
  const modes =
    [...files.values()]
      .flatMap(file => nodesOf(file).filter(ts.isArrayLiteralExpression))
      .map(array => array.elements.map(e => constantText(unwrap(e))))
      .find(values => values.includes('set-up') && values.every(v => v !== undefined))
      ?.flatMap(v => v ?? []) ?? []
  const flags = [...files.values()]
    .flatMap(file =>
      nodesOf(file).filter(
        (n): n is ts.PropertyAssignment => ts.isPropertyAssignment(n) && propertyName(n.name) === 'options',
      ),
    )
    .flatMap(p => {
      const value = unwrap(p.initializer)
      return ts.isObjectLiteralExpression(value) &&
        p.parent.parent &&
        ts.isCallExpression(p.parent.parent) &&
        calleeName(p.parent.parent) === 'parseArgs'
        ? value.properties.flatMap(q => (q.name ? `--${q.name.getText()}` : []))
        : []
    })
  const variables = new Set([...environmentReads(files).names, ...PG_READS, ...NODE_READS])
  return { modes, flags, variables }
}

// What is wrong with the runbooks: a mode, flag or variable the script doesn't have; a mode no
// runbook names; the input read with read, exported, or loaded any way but section 2.1's two; doc
// read without being typed once by doc="$(cat)", or never unset; a
// bare npm ci; no link to the section that prepares a run; the deploy pipeline not paused, paused
// only after the checkout is installed, or not resumed; Ctrl-D without Enter; a printed line named by its kind, or said to start with anything
// but owner-bootstrap:; and the input loaded from the secret without checking the AWS CLI's history.
function runbookProblems(runbooks: Sources, surface: ScriptSurface): string[] {
  const found: string[] = []
  const placeholder = (word: string) => /^<[^>]+>$/.test(word)
  for (const [path, text] of runbooks) {
    const units = codeUnits(text)
    if (/\bexport\s+OWNER_BOOTSTRAP_INPUT\b/.test(text)) found.push(`${path}: exports OWNER_BOOTSTRAP_INPUT`)
    for (const unit of units) {
      if (unit.includes('OWNER_BOOTSTRAP_INPUT') && /(?:^|[\s;|&(])read\b/.test(unit))
        found.push(`${path}: reads OWNER_BOOTSTRAP_INPUT with read`)
      if (/OWNER_BOOTSTRAP_INPUT=/.test(unit) && !LOADS.some(form => form.test(unit))) {
        found.push(`${path}: loads OWNER_BOOTSTRAP_INPUT other than by section 2.1's two commands`)
      }
      if (LOADS[1]?.test(unit) && !text.includes('doc="$(cat)"'))
        found.push(`${path}: reads doc without typing it once with doc="$(cat)"`)
      if (LOADS[1]?.test(unit) && !/\bunset doc\b/.test(text)) found.push(`${path}: never unsets doc`)
      if (![RUNBOOK, WITHDRAWN].includes(path)) continue
      // The script's own words: after its path in a command, after a mode written alone, or a
      // flag written alone.
      const words = unit.trim().split(/\s+/)
      const script = words.findIndex(word => word.endsWith('owner-bootstrap.ts'))
      const own =
        script !== -1
          ? words.slice(script + 1)
          : surface.modes.includes(words[0] ?? '') || /^--[a-z-]+$/.test(unit.trim())
            ? words
            : []
      const mode = script !== -1 ? own[0] : undefined
      if (mode !== undefined && !surface.modes.includes(mode) && !placeholder(mode) && mode !== '…') {
        found.push(`${path}: names a mode the script doesn't have: ${mode}`)
      }
      for (const flag of own.filter(word => /^--[a-z]/.test(word))) {
        if (!surface.flags.includes(flag)) found.push(`${path}: names a flag the script doesn't have: ${flag}`)
      }
      for (const [variable] of unit.matchAll(/\b[A-Z][A-Z0-9_]*\b/g)) {
        if (VARIABLE_SHAPE.test(variable) && !surface.variables.has(variable))
          found.push(`${path}: names a variable the script doesn't read: ${variable}`)
      }
    }
  }
  const named = [...runbooks.values()].flatMap(codeUnits).join('\n')
  for (const mode of surface.modes) {
    if (!new RegExp(`(?<![\\w-])${mode}(?![\\w-])`).test(named)) found.push(`no runbook names the ${mode} mode`)
  }
  const setUp = runbooks.get(RUNBOOK) ?? ''
  if (!setUp.includes('npm ci --ignore-scripts')) found.push(`${RUNBOOK}: doesn't install with npm ci --ignore-scripts`)
  if (/\bnpm ci\b(?! --ignore-scripts)/.test(setUp)) found.push(`${RUNBOOK}: names a bare npm ci`)
  if (!(runbooks.get(WITHDRAWN) ?? '').includes('first-owner-set-up.md#running-the-owner-bootstrap-script')) {
    found.push(`${WITHDRAWN}: doesn't link "Running the Owner bootstrap script"`)
  }
  // The deploy pipeline is paused for every mode, the recovery mode included, which takes no
  // migration lock (PD-124), and resumed afterwards.
  if (!/\bdeploy pipeline paused\b/.test(setUp))
    found.push(`${RUNBOOK}: doesn't pause the deploy pipeline for every run`)
  // It is paused before the checkout is installed, so no deploy migrates the database past the
  // commit checked out (DOCS-02).
  const paused = setUp.search(/\bdeploy pipeline paused\b/)
  const installed = setUp.indexOf('npm ci --ignore-scripts')
  if (paused !== -1 && installed !== -1 && installed < paused)
    found.push(`${RUNBOOK}: installs the checkout before the deploy pipeline is paused`)
  for (const path of [RUNBOOK, WITHDRAWN]) {
    const text = runbooks.get(path) ?? ''
    if (!/\bresumes the deploy pipeline\b/.test(text)) found.push(`${path}: doesn't resume the deploy pipeline`)
    // Ctrl-D ends a line-mode read only at the start of a line, so a paste without a final newline
    // needs Enter first.
    if (text.split('\n').some(line => line.includes('Ctrl-D') && !/\bEnter\b/.test(line)))
      found.push(`${path}: says Ctrl-D without Enter`)
    // A printed line is named by what it prints, never by its kind in output.ts.
    for (const [, kind] of text.matchAll(/`([a-z_]+)` line\b/g)) {
      if (kind !== undefined && UNPRINTED_KINDS.includes(kind))
        found.push(`${path}: names the ${kind} line by its kind, not by what it prints`)
    }
    // Every line starts owner-bootstrap: (output.ts's sink).
    if (/\bstarts? `(?!owner-bootstrap:)/.test(text))
      found.push(`${path}: says a line starts with something other than owner-bootstrap:`)
  }
  // The AWS CLI's own history keeps each response's body, the secret's value among it.
  if (codeUnits(setUp).some(unit => LOADS[0]?.test(unit)) && !setUp.includes('aws configure get cli_history'))
    found.push(`${RUNBOOK}: loads the input from the secret without checking the AWS CLI's history is off`)
  return [...new Set(found)]
}

// What is wrong with CI's wiring: the check missing from the migrations job or out of place, a
// workflow running the script or setting its input, the suite's union or stack.
function wiringProblems(sources: Sources): string[] {
  const found: string[] = []
  const migrations = workflowJobs(sources.get(CI) ?? '').find(job => job.id === 'migrations')
  const steps = migrations?.steps ?? []
  const index = (pattern: RegExp) => steps.findIndex(step => pattern.test(step))
  const access = index(/^run: node scripts\/check-access-sql\.ts$/m)
  const check = index(/^run: node apps\/server\/scripts\/check-owner-bootstrap\.ts$/m)
  const types = index(/^run: npm run db:types$/m)
  if (access === -1 || types === -1)
    found.push(`${CI}: the migrations job no longer runs check-access-sql.ts and db:types`)
  if (check === -1) found.push(`${CI}: the migrations job doesn't run check-owner-bootstrap.ts`)
  else if (!(access < check && check < types))
    found.push(`${CI}: check-owner-bootstrap.ts runs outside check-access-sql.ts … db:types`)
  if (steps.filter(step => step.includes('check-owner-bootstrap.ts')).length > 1)
    found.push(`${CI}: check-owner-bootstrap.ts runs more than once`)
  for (const [path, text] of sources) {
    if (!/^\.github\/workflows\/[^/]+\.ya?ml$/.test(path)) continue
    const code = text
      .split('\n')
      .map(line => line.replace(/(?:^|\s)#.*$/, ''))
      .join('\n')
    if (/(?<![\w-])scripts\/owner-bootstrap(?:\.ts|\/)/.test(code))
      found.push(`${path}: runs the Owner bootstrap script`)
    if (code.includes('OWNER_BOOTSTRAP_INPUT')) found.push(`${path}: sets OWNER_BOOTSTRAP_INPUT`)
  }
  const writes = sources.get(WRITES)
  const union =
    writes === undefined
      ? []
      : nodesOf(parse(WRITES, writes)).filter(
          (n): n is ts.ParameterDeclaration => ts.isParameter(n) && n.name.getText() === 'suite',
        )
  const holds = union.some(
    p =>
      p.type !== undefined &&
      ts.isUnionTypeNode(p.type) &&
      p.type.types.some(t => ts.isLiteralTypeNode(t) && constantText(t.literal) === 'first-owner'),
  )
  if (!holds) found.push(`${WRITES}: the suite union doesn't hold 'first-owner'`)
  const suite = sources.get(SUITE)
  const starts =
    suite !== undefined &&
    nodesOf(parse(SUITE, suite)).some(n => {
      if (!ts.isCallExpression(n) || calleeName(n) !== 'startStack') return false
      const options = n.arguments[0] && unwrap(n.arguments[0])
      return (
        options !== undefined &&
        ts.isObjectLiteralExpression(options) &&
        options.properties.some(
          p =>
            ts.isPropertyAssignment(p) &&
            propertyName(p.name) === 'firstOrg' &&
            constantText(unwrap(p.initializer)) === 'bootstrap',
        )
      )
    })
  if (!starts) found.push(`${SUITE}: doesn't start its stack with firstOrg: 'bootstrap'`)
  const example = sources.get(ENV_EXAMPLE) ?? ''
  for (const name of ['OWNER_BOOTSTRAP_INPUT', 'OWNER_BOOTSTRAP_TLS_NAME']) {
    const lines = example.split('\n').filter(line => new RegExp(`\\b${name}\\b`).test(line))
    if (lines.length === 0) found.push(`${ENV_EXAMPLE}: doesn't document ${name}`)
    if (lines.some(line => !/^\s*#/.test(line))) found.push(`${ENV_EXAMPLE}: sets ${name} rather than documenting it`)
    if (lines.some(line => new RegExp(`\\b${name}=\\S`).test(line))) found.push(`${ENV_EXAMPLE}: gives ${name} a value`)
  }
  return found
}

describe('BSG-09 (PD-133): CI runs the check, no workflow runs the script, and the runbooks name only what it has', () => {
  const surface: ScriptSurface = {
    modes: ['set-up', 'recover', 'correct-number'],
    flags: ['--commit', '--database'],
    variables: new Set([...ENV_NAMES, ...PG_READS, ...NODE_READS]),
  }

  it('reads the planted script’s modes, flags and variables', () => {
    const read = surfaceOf(parsedScript(planted()))
    expect(read.modes).toEqual(surface.modes)
    expect(read.flags).toEqual(surface.flags)
    expect([...read.variables]).toEqual(
      expect.arrayContaining(['OWNER_BOOTSTRAP_INPUT', 'PGPASSWORD', 'NODE_EXTRA_CA_CERTS']),
    )
  })

  it('passes planted runbooks and fails each slip', () => {
    const fromSecret =
      'OWNER_BOOTSTRAP_INPUT="$(aws secretsmanager get-secret-value --secret-id <the secret> --version-id <the version id> --query SecretString --output text)" node scripts/owner-bootstrap.ts <mode> --database <the database>'
    const typed = 'OWNER_BOOTSTRAP_INPUT="$doc" node scripts/owner-bootstrap.ts recover --database <the database>'
    const good = new Map([
      [
        RUNBOOK,
        [
          '# Setting up',
          'First the deploy pipeline paused, then install with `npm ci --ignore-scripts`; set `DEPLOY_ENV`, `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `NODE_EXTRA_CA_CERTS` and `OWNER_BOOTSTRAP_TLS_NAME`, and no `PGDATABASE`.',
          `From the secret: \`${fromSecret}\`. Never \`read\` or \`export\`: a one-line \`read\` takes only the first line.`,
          'Run `set-up --database <the database>`, then with `--commit`; a wrong number: `correct-number`.',
          'Prepare: `aws configure get cli_history` prints nothing, and the terminal ready. Paste, then press Enter and Ctrl-D. Every line starts `owner-bootstrap:`. Afterwards the person on call resumes the deploy pipeline.',
          '```sh',
          'doc="$(cat)"',
          typed,
          '```',
          'Once the commit has run, `unset doc`.',
        ].join('\n'),
      ],
      [
        WITHDRAWN,
        `Prepare the run as [Running the Owner bootstrap script](first-owner-set-up.md#running-the-owner-bootstrap-script) says, then \`doc="$(cat)"\`: type it once, then Enter and Ctrl-D. Then \`${typed}\`, and check the line starting \`named DPO\`. Afterwards, \`unset doc\` and resumes the deploy pipeline.`,
      ],
      ['docs/runbooks/breach.md', '# Breach'],
    ])
    expect(runbookProblems(good, surface)).toEqual([])
    const slip = (path: string, from: string, to: string) => {
      const sources = new Map(good)
      const text = sources.get(path) ?? ''
      if (!text.includes(from)) throw new Error(`the planted ${path} has no ${from}`)
      sources.set(path, text.replace(from, to))
      return runbookProblems(sources, surface)
    }
    expect(slip(RUNBOOK, 'Run `set-up --database', 'Run `set-up --dry-run --database')).toEqual([
      `${RUNBOOK}: names a flag the script doesn't have: --dry-run`,
    ])
    expect(slip(RUNBOOK, 'then with `--commit`', 'then with `--yes`')).toEqual([
      `${RUNBOOK}: names a flag the script doesn't have: --yes`,
    ])
    expect(slip(WITHDRAWN, 'owner-bootstrap.ts recover', 'owner-bootstrap.ts reset-pin')).toEqual([
      `${WITHDRAWN}: loads OWNER_BOOTSTRAP_INPUT other than by section 2.1's two commands`,
      `${WITHDRAWN}: names a mode the script doesn't have: reset-pin`,
    ])
    expect(slip(RUNBOOK, '`OWNER_BOOTSTRAP_TLS_NAME`', '`OWNER_BOOTSTRAP_FILE`')).toEqual([
      `${RUNBOOK}: names a variable the script doesn't read: OWNER_BOOTSTRAP_FILE`,
    ])
    expect(slip(RUNBOOK, 'a wrong number: `correct-number`', 'a wrong number: the DPO')).toEqual([
      'no runbook names the correct-number mode',
    ])
    expect(slip('docs/runbooks/breach.md', '# Breach', '# Breach\n\n`read -rs OWNER_BOOTSTRAP_INPUT`')).toEqual([
      `docs/runbooks/breach.md: reads OWNER_BOOTSTRAP_INPUT with read`,
    ])
    expect(
      slip('docs/runbooks/breach.md', '# Breach', '# Breach\n\nThen export OWNER_BOOTSTRAP_INPUT for the session.'),
    ).toEqual([`docs/runbooks/breach.md: exports OWNER_BOOTSTRAP_INPUT`])
    expect(
      slip(
        RUNBOOK,
        fromSecret,
        "OWNER_BOOTSTRAP_INPUT='{…}' node scripts/owner-bootstrap.ts set-up --database <the database>",
      ),
    ).toEqual([`${RUNBOOK}: loads OWNER_BOOTSTRAP_INPUT other than by section 2.1's two commands`])
    // Nothing is pasted, not even with echo off: only a pinned version binds a commit to its plan.
    expect(
      slip(
        RUNBOOK,
        'Never `read`',
        'Pasted: `OWNER_BOOTSTRAP_INPUT="$(stty -echo; cat; stty echo)" node scripts/owner-bootstrap.ts set-up --database <the database>`. Never `read`',
      ),
    ).toEqual([`${RUNBOOK}: loads OWNER_BOOTSTRAP_INPUT other than by section 2.1's two commands`])
    // The secret is loaded at the version the plan read, never its current value.
    expect(slip(RUNBOOK, ' --version-id <the version id>', '')).toEqual([
      `${RUNBOOK}: loads OWNER_BOOTSTRAP_INPUT other than by section 2.1's two commands`,
    ])
    // The recovery document is typed once, into doc, which both runs read and which goes after.
    expect(
      slip(
        WITHDRAWN,
        typed,
        'OWNER_BOOTSTRAP_INPUT="$(cat)" node scripts/owner-bootstrap.ts recover --database <the database>',
      ),
    ).toEqual([`${WITHDRAWN}: loads OWNER_BOOTSTRAP_INPUT other than by section 2.1's two commands`])
    expect(slip(WITHDRAWN, '`doc="$(cat)"`: type it once', 'type it once')).toEqual([
      `${WITHDRAWN}: reads doc without typing it once with doc="$(cat)"`,
    ])
    expect(slip(RUNBOOK, 'Once the commit has run, `unset doc`.', '')).toEqual([`${RUNBOOK}: never unsets doc`])
    // Echo on is for the recovery document alone.
    expect(slip(WITHDRAWN, 'owner-bootstrap.ts recover', 'owner-bootstrap.ts set-up')).toEqual([
      `${WITHDRAWN}: loads OWNER_BOOTSTRAP_INPUT other than by section 2.1's two commands`,
    ])
    expect(slip(RUNBOOK, '`npm ci --ignore-scripts`', '`npm ci`')).toEqual([
      `${RUNBOOK}: doesn't install with npm ci --ignore-scripts`,
      `${RUNBOOK}: names a bare npm ci`,
    ])
    expect(
      slip(WITHDRAWN, '(first-owner-set-up.md#running-the-owner-bootstrap-script)', '(first-owner-set-up.md)'),
    ).toEqual([`${WITHDRAWN}: doesn't link "Running the Owner bootstrap script"`])
    // DOCS-01: the pipeline is paused for every mode and resumed after.
    expect(slip(RUNBOOK, 'First the deploy pipeline paused, then install', 'Install')).toEqual([
      `${RUNBOOK}: doesn't pause the deploy pipeline for every run`,
    ])
    // DOCS-02: and paused before the checkout is installed.
    expect(
      slip(
        RUNBOOK,
        'First the deploy pipeline paused, then install with `npm ci --ignore-scripts`;',
        'Install with `npm ci --ignore-scripts`, then the deploy pipeline paused;',
      ),
    ).toEqual([`${RUNBOOK}: installs the checkout before the deploy pipeline is paused`])
    expect(slip(WITHDRAWN, 'resumes the deploy pipeline', 'records the use')).toEqual([
      `${WITHDRAWN}: doesn't resume the deploy pipeline`,
    ])
    // DOCS-05: Ctrl-D comes with Enter.
    expect(slip(WITHDRAWN, 'then Enter and Ctrl-D', 'then Ctrl-D')).toEqual([`${WITHDRAWN}: says Ctrl-D without Enter`])
    // DOCS-04: a line is named by what it prints, and every line starts owner-bootstrap:.
    expect(slip(WITHDRAWN, 'the line starting `named DPO`', 'its `inputs` line')).toEqual([
      `${WITHDRAWN}: names the inputs line by its kind, not by what it prints`,
    ])
    expect(slip(RUNBOOK, 'Every line starts `owner-bootstrap:`', 'A failure starts `could not connect:`')).toEqual([
      `${RUNBOOK}: says a line starts with something other than owner-bootstrap:`,
    ])
    // PRIVACY-03: the AWS CLI's history is checked before the secret is read.
    expect(slip(RUNBOOK, '`aws configure get cli_history` prints nothing, and', '')).toEqual([
      `${RUNBOOK}: loads the input from the secret without checking the AWS CLI's history is off`,
    ])
  })

  it('passes planted CI wiring and fails each slip', () => {
    const ci = [
      'name: CI',
      'jobs:',
      '  migrations:',
      '    steps:',
      '      - run: node scripts/check-access-sql.ts',
      '      # The first-Owner bootstrap script (scripts/owner-bootstrap.ts), run as a person runs it.',
      '      - run: node apps/server/scripts/check-owner-bootstrap.ts',
      '      - run: npm run db:types',
    ].join('\n')
    const good = new Map([
      [CI, ci],
      ['.github/workflows/secrets.yml', 'jobs:\n  gitleaks:\n    steps:\n      - run: gitleaks detect'],
      [WRITES, "export function expectEveryWriteCovered(db: Db, suite: 'sign-in' | 'first-owner' | 'web') {}"],
      [SUITE, "const stack = await startStack({ firstOrg: 'bootstrap' })"],
      [
        ENV_EXAMPLE,
        '# Owner bootstrap script (never the server)\n# OWNER_BOOTSTRAP_INPUT=\n# OWNER_BOOTSTRAP_TLS_NAME=\nDEPLOY_ENV=local',
      ],
    ])
    expect(wiringProblems(good)).toEqual([])
    const slip = (path: string, from: string, to: string) => {
      const sources = new Map(good)
      const text = sources.get(path) ?? ''
      if (!text.includes(from)) throw new Error(`the planted ${path} has no ${from}`)
      sources.set(path, text.replace(from, to))
      return wiringProblems(sources)
    }
    expect(slip(CI, '      - run: node apps/server/scripts/check-owner-bootstrap.ts\n', '')).toEqual([
      `${CI}: the migrations job doesn't run check-owner-bootstrap.ts`,
    ])
    expect(
      slip(
        CI,
        '      - run: npm run db:types',
        '      - run: npm run db:types\n      - run: node apps/server/scripts/check-owner-bootstrap.ts',
      ),
    ).toEqual([`${CI}: check-owner-bootstrap.ts runs more than once`])
    expect(slip(CI, '      - run: node scripts/check-access-sql.ts\n', '').slice(0, 1)).toEqual([
      `${CI}: the migrations job no longer runs check-access-sql.ts and db:types`,
    ])
    expect(
      slip(
        '.github/workflows/secrets.yml',
        'gitleaks detect',
        'node scripts/owner-bootstrap.ts set-up --database hearth',
      ),
    ).toEqual(['.github/workflows/secrets.yml: runs the Owner bootstrap script'])
    expect(
      slip(
        '.github/workflows/secrets.yml',
        '      - run: gitleaks detect',
        '      - env:\n          OWNER_BOOTSTRAP_INPUT: x\n        run: gitleaks detect',
      ),
    ).toEqual(['.github/workflows/secrets.yml: sets OWNER_BOOTSTRAP_INPUT'])
    expect(slip(WRITES, "| 'first-owner' ", '')).toEqual([`${WRITES}: the suite union doesn't hold 'first-owner'`])
    expect(slip(SUITE, "firstOrg: 'bootstrap'", "firstOrg: 'seed'")).toEqual([
      `${SUITE}: doesn't start its stack with firstOrg: 'bootstrap'`,
    ])
    expect(slip(ENV_EXAMPLE, '# OWNER_BOOTSTRAP_TLS_NAME=', 'OWNER_BOOTSTRAP_TLS_NAME=')).toEqual([
      `${ENV_EXAMPLE}: sets OWNER_BOOTSTRAP_TLS_NAME rather than documenting it`,
    ])
    expect(slip(ENV_EXAMPLE, '# OWNER_BOOTSTRAP_INPUT=', '# OWNER_BOOTSTRAP_INPUT={}')).toEqual([
      `${ENV_EXAMPLE}: gives OWNER_BOOTSTRAP_INPUT a value`,
    ])
    expect(slip(ENV_EXAMPLE, '# OWNER_BOOTSTRAP_INPUT=\n', '')).toEqual([
      `${ENV_EXAMPLE}: doesn't document OWNER_BOOTSTRAP_INPUT`,
    ])
  })

  it('the real CI, writes.ts, integration suite and .env.example', () => {
    expect(wiringProblems(realSources())).toEqual([])
  })

  it('the real runbooks name only what the real script has', () => {
    const sources = realSources()
    const real = surfaceOf(parsedScript(sources))
    expect(real.modes).toEqual(['set-up', 'recover', 'correct-number'])
    expect(real.flags.sort()).toEqual(['--commit', '--database'])
    const runbooks = new Map([...sources].filter(([path]) => /^docs\/runbooks\/[^/]+\.md$/.test(path)))
    expect(runbooks.has(RUNBOOK)).toBe(true)
    expect(runbookProblems(runbooks, real)).toEqual([])
    // Every kind the wording rule knows is still one of output.ts's line kinds.
    const output = sources.get(OUTPUT) ?? ''
    expect(UNPRINTED_KINDS.filter(kind => !output.includes(`kind: '${kind}'`))).toEqual([])
  })
})

// --- BSG-10: the image ----------------------------------------------------------------------------

// What lets the server image carry the script: an ignore file that doesn't start by leaving
// everything out, or an exception (!…) that could admit something under scripts/ (one naming
// scripts, or one starting with a pattern).
function imageProblems(text: string): string[] {
  const lines = text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line !== '' && !line.startsWith('#'))
  const found: string[] = []
  if (lines[0] !== '**') found.push(`${DOCKERIGNORE}: doesn't start by leaving everything out (**)`)
  for (const line of lines.filter(l => l.startsWith('!'))) {
    const pattern = line.slice(1).replace(/^\//, '')
    if (/^scripts(?:\/|$)/.test(pattern) || /^[*?[]/.test(pattern))
      found.push(`${DOCKERIGNORE}: ${line} could admit the script`)
  }
  return found
}

describe('BSG-10 (OD-32, PD-114): the server image never carries the script', () => {
  it('finds an exception that could admit scripts/, on planted text', () => {
    const good =
      '# What the image may read\n**\n!package.json\n!apps/server/\n!packages/\n!db/migrations/\napps/server/scripts\n'
    expect(imageProblems(good)).toEqual([])
    expect(imageProblems(`${good}!scripts/owner-bootstrap.ts\n`)).toEqual([
      `${DOCKERIGNORE}: !scripts/owner-bootstrap.ts could admit the script`,
    ])
    expect(imageProblems(`${good}!/scripts\n`)).toEqual([`${DOCKERIGNORE}: !/scripts could admit the script`])
    expect(imageProblems(`${good}!**/owner-bootstrap*\n`)).toEqual([
      `${DOCKERIGNORE}: !**/owner-bootstrap* could admit the script`,
    ])
    expect(imageProblems(good.replace('**\n', ''))).toEqual([
      `${DOCKERIGNORE}: doesn't start by leaving everything out (**)`,
    ])
  })

  it('the real .dockerignore', () => {
    expect(imageProblems(readRepoFile(DOCKERIGNORE))).toEqual([])
  })
})

// --- BSG-11: who reaches the bootstrap secret -----------------------------------------------------

// C0.12's words in both plan files, so only the DPO ever sees the founder's whole number
// (R2DOCS-03).
const SECRET_ACCESS =
  'written, checked and corrected in the AWS console by the DPO alone, through access to that one secret and nothing else, and read under the break-glass role only to load it into a run'
const PLANS = ['docs/BUILD-PLAN.md', 'docs/TECH-SPEC.md'] as const

// What lets anyone but the DPO see what the bootstrap secret holds: a plan file without C0.12's
// words, or with the old "readable only under the break-glass role"; a set-up runbook whose Who
// does what doesn't give the secret to the DPO, in which the DPO doesn't check the number or a run
// isn't repeated once a secret that couldn't be read can be, or with a sentence in which the person on call
// checks, reads, views, opens, sees or pastes the secret, the number or the document.
function secretAccessProblems(sources: Sources): string[] {
  const found: string[] = []
  for (const path of PLANS) {
    const text = sources.get(path) ?? ''
    if (!text.includes(SECRET_ACCESS)) found.push(`${path}: C0.12 doesn't give the bootstrap secret to the DPO alone`)
    if (text.includes('readable only under the break-glass role'))
      found.push(`${path}: C0.12 makes the bootstrap secret readable only under the break-glass role`)
  }
  const runbook = sources.get(RUNBOOK) ?? ''
  const who = runbook.split(/^## /m).find(section => section.startsWith('Who does what')) ?? ''
  if (!who.includes('The DPO writes, checks and corrects the bootstrap secret'))
    found.push(`${RUNBOOK}: Who does what doesn't give the bootstrap secret to the DPO`)
  if (!runbook.includes('The DPO checks the number in the secret'))
    found.push(`${RUNBOOK}: the DPO doesn't check the number in the secret`)
  if (!runbook.includes('runs the command again once the secret can be read'))
    found.push(`${RUNBOOK}: doesn't have the run repeated once the secret can be read`)
  const sentences = runbook.split(/(?<=[.!?])\s+/)
  if (
    sentences.some(
      sentence =>
        /\bperson on call (?:checks|reads|views|opens|sees|pastes)\b/.test(sentence) &&
        /\b(?:secret|the number|whole number|the document)\b/.test(sentence),
    )
  )
    found.push(`${RUNBOOK}: has the person on call see what the secret holds`)
  return found
}

describe('BSG-11 (R2DOCS-03): the DPO alone writes and checks the bootstrap secret, and the plan says so', () => {
  const good = new Map([
    ['docs/BUILD-PLAN.md', `| C0.12 | … one secret per environment, ${SECRET_ACCESS} (never by a service) … |`],
    ['docs/TECH-SPEC.md', `- **C0.12:** one bootstrap secret per environment, ${SECRET_ACCESS} (never by a service);`],
    [
      RUNBOOK,
      [
        '## Who does what',
        '- The DPO writes, checks and corrects the bootstrap secret in the AWS console. The person on call only loads it into a run.',
        '## Running the Owner bootstrap script',
        "If the secret can't be read, the person on call runs the command again once the secret can be read.",
        '## Steps',
        '1. The person on call checks that Database Activity Streams are off: they would record the name and number.',
        '2. The DPO checks the number in the secret, which is still there.',
      ].join('\n'),
    ],
  ])
  const slip = (path: string, from: string, to: string) => {
    const sources = new Map(good)
    const text = sources.get(path) ?? ''
    if (!text.includes(from)) throw new Error(`the planted ${path} has no ${from}`)
    sources.set(path, text.replace(from, to))
    return secretAccessProblems(sources)
  }

  it('passes the planted docs and fails each slip', () => {
    expect(secretAccessProblems(good)).toEqual([])
    expect(slip('docs/BUILD-PLAN.md', SECRET_ACCESS, 'readable only under the break-glass role')).toEqual([
      "docs/BUILD-PLAN.md: C0.12 doesn't give the bootstrap secret to the DPO alone",
      'docs/BUILD-PLAN.md: C0.12 makes the bootstrap secret readable only under the break-glass role',
    ])
    expect(slip('docs/TECH-SPEC.md', 'by the DPO alone', 'by the person on call')).toEqual([
      "docs/TECH-SPEC.md: C0.12 doesn't give the bootstrap secret to the DPO alone",
    ])
    expect(slip(RUNBOOK, 'The DPO writes, checks and corrects', 'The DPO writes')).toEqual([
      `${RUNBOOK}: Who does what doesn't give the bootstrap secret to the DPO`,
    ])
    expect(slip(RUNBOOK, '2. The DPO checks the number', '2. The person on call checks the number')).toEqual([
      `${RUNBOOK}: the DPO doesn't check the number in the secret`,
      `${RUNBOOK}: has the person on call see what the secret holds`,
    ])
    expect(
      slip(
        RUNBOOK,
        "If the secret can't be read, the person on call runs the command again once the secret can be read.",
        "If the secret can't be read, the person on call pastes the document.",
      ),
    ).toEqual([
      `${RUNBOOK}: doesn't have the run repeated once the secret can be read`,
      `${RUNBOOK}: has the person on call see what the secret holds`,
    ])
    expect(
      slip(RUNBOOK, 'only loads it into a run.', 'only loads it into a run. The person on call opens the secret.'),
    ).toEqual([`${RUNBOOK}: has the person on call see what the secret holds`])
  })

  it('the real plan, spec and runbook', () => {
    expect(secretAccessProblems(realSources())).toEqual([])
  })
})
