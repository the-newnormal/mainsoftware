// What the database's guard can't see, kept from deleting held data (C0.10 LH-33; TECH-SPEC T23
// items 8 and 19). The guard (lifecycle_guard() and lifecycle_no_truncate(), 0013) refuses any
// role's DELETE of a guarded row that isn't logged or is held, and check 8 decides every delete path
// the database allows and refuses, in any function body, TRUNCATE, DROP TABLE, DETACH PARTITION and
// the guard turned off, its functions replaced or its triggers replaced or conditioned, each as a
// plain statement, and in a DYNAMIC_DDL function's string literals too, and a DYNAMIC_DDL function
// whose body isn't the one pinned with it, since a string built at run time or a verb passed to
// format() as an argument is read by no check (bodyDdlProblems, apps/server/scripts/catalogues.ts);
// check 1 and helperBodyProblems refuse EXECUTE outside DYNAMIC_DDL. So LCG-03 leaves function
// bodies to check 8, and a changed DYNAMIC_DDL body to the reviewed change that pins it (R2CODE-01).
// Neither sees S3, a migration's top-level DDL, a table the guard isn't on yet, or code a superuser
// runs with triggers off. Each case is first proved on planted files:
// - LCG-02, S3: no script in apps/, packages/, infra/ or scripts/ names an S3 call that deletes an
//   object or changes how objects expire or are locked (DeleteObject, DeleteObjects, the bucket
//   lifecycle and versioning calls, Object Lock's legal hold, retention and configuration), as a
//   command class or a client method, in an import, a re-export, require(), vi.mock() or a string;
//   and no CDK code in infra/ gives a lifecycle rule an expiry without a tag filter, so lifecycle
//   rules only change storage class and an expiry is only ever the tag-filtered backstop (CLAUDE.md,
//   Database, S3; PRD B.6). The allow-lists stay empty until C0.15 adds its S3 deletion module and
//   C0.12 the tag-filtered backstop, each with its reason;
// - LCG-03, migrations: a migration numbered above 0013 holds, outside its function bodies (a DO
//   block's body counts, since it runs in the migration), no TRUNCATE (but in a trigger's event list,
//   which empties nothing, as check 8 reads it), DROP TABLE, DETACH PARTITION, DISABLE TRIGGER, DROP
//   TRIGGER, ENABLE ALWAYS TRIGGER or ENABLE REPLICA TRIGGER, no replacement, drop or change of the
//   guard's functions or lifecycle_held() (DB-07), no CREATE OR REPLACE TRIGGER of a guard's trigger,
//   no guard's trigger created with a WHEN condition or an UPDATE OF list (check 7d refuses both on
//   the fresh build too), and no DELETE from a table of a class whose holds apply or that is kept, or
//   from deletion_log, unless its file and statement are on the reviewed list below with why;
// - LCG-04, server code: no runtime file under apps/server/src/ outside apps/server/src/lifecycle/
//   (tests and the testing/ folder aside) deletes from or truncates such a table, as SQL text or
//   through Kysely's deleteFrom();
// - LCG-05, replica mode: no file in apps/, scripts/ or db/tests/ that sets session_replication_role
//   to replica, which turns the guard off, deletes from or truncates a guarded table before it sets
//   it back to origin (or resets it), or, for a transaction-local setting (SET LOCAL, set_config()
//   with true) outside db/tests/, a COMMIT or ROLLBACK ends its transaction, or the file ends. A
//   session-level setting outlives a COMMIT; a ROLLBACK TO SAVEPOINT ends neither the transaction
//   nor the setting, so it ends nothing here; and a db/tests/ file's transaction never ends
//   (scripts/test-db.sh refuses a test that ends it), so there a COMMIT or ROLLBACK ends nothing
//   either (R2CODE-02, TESTS-06).
// The tables come from the code and the migrations themselves: holds-apply and kept tables from
// packages/shared RETENTION_CLASSES, guarded ones from the triggers the migrations create. Comments
// are stripped first, so a comment that names something proves nothing.
import { RETENTION_CLASSES } from '@hearth/shared'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { withoutComments } from './imports'
import { isScript, readRepoFile, repoFiles } from './repo-files'

const SELF = 'scripts/guards/lifecycle.test.ts'

// --- LCG-02: S3 deletes, lifecycle rules and Object Lock -------------------------------------------

// The S3 calls that delete an object or change how objects expire or are locked, as SDK v3 command
// classes (DeleteObjectCommand) and as the aggregated client's methods (s3.deleteObject).
const S3_CALL =
  /\b(?:deleteObjects?|putBucketLifecycleConfiguration|deleteBucketLifecycle|putBucketVersioning|putObjectLegalHold|putObjectRetention|putObjectLockConfiguration)(?:Command)?\b/gi

// The files that may name one, each with its reason: C0.15's S3 deletion module joins with its first
// delete, and nothing else.
const S3_ALLOWED: ReadonlyArray<{ path: string; why: string }> = []

// The CDK files that may give a lifecycle rule an untagged expiry: none. C0.12's backstop carries a
// tag filter, so it needs no entry.
const LIFECYCLE_ALLOWED: ReadonlyArray<{ path: string; why: string }> = []

// Each S3 call a script names, as "path: name", comments stripped and strings kept.
function s3Calls(files: ReadonlyMap<string, string>): string[] {
  const found: string[] = []
  for (const [path, text] of files) {
    for (const [name] of withoutComments(path, text).matchAll(S3_CALL)) found.push(`${path}: ${name}`)
  }
  return found
}

// A property's name as written, quoted or not.
const propertyName = (property: ts.ObjectLiteralElementLike): string | undefined =>
  property.name && (ts.isIdentifier(property.name) || ts.isStringLiteralLike(property.name))
    ? property.name.text
    : undefined

// An expiry a lifecycle rule can set (CDK's LifecycleRule, and the raw CloudFormation shapes).
const EXPIRY = new Set([
  'expiration',
  'expirationDate',
  'expirationInDays',
  'expiredObjectDeleteMarker',
  'noncurrentVersionExpiration',
  'noncurrentVersionExpirationInDays',
])
const TAG_FILTER = new Set(['tagFilters', 'tagFilter'])

// Each object literal in a CDK file that sets an expiry with no tag filter beside it, as "path:line".
function untaggedExpiries(files: ReadonlyMap<string, string>): string[] {
  const found: string[] = []
  for (const [path, text] of files) {
    const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true)
    const visit = (node: ts.Node): void => {
      if (ts.isObjectLiteralExpression(node)) {
        const names = node.properties.map(propertyName)
        if (
          names.some(name => name !== undefined && EXPIRY.has(name)) &&
          !names.some(n => n !== undefined && TAG_FILTER.has(n))
        ) {
          found.push(`${path}:${file.getLineAndCharacterOfPosition(node.getStart()).line + 1}`)
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(file)
  }
  return found
}

describe('LCG-02 (C0.10 LH-33): no S3 delete, lifecycle or Object Lock call outside its allow-list', () => {
  it('finds each kind on planted files, and passes what may be named', () => {
    const files = new Map([
      ['apps/server/src/storage/a.ts', "import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'"],
      ['apps/server/src/storage/b.ts', "export { DeleteObjectsCommand as Many } from '@aws-sdk/client-s3'"],
      ['scripts/c.ts', "vi.mock('@aws-sdk/client-s3', () => ({ PutObjectLegalHoldCommand: class {} }))"],
      [
        'infra/src/d.ts',
        "await s3.putBucketLifecycleConfiguration({ Bucket: b })\nconst x = require('x').deleteObject",
      ],
      ['packages/e.ts', "const name = 'PutObjectRetention' + 'Command'"],
      ['apps/server/src/f.ts', '// DeleteObjectCommand, in a comment only\nconst ok = new GetObjectCommand({})'],
    ])
    expect(s3Calls(files)).toEqual([
      'apps/server/src/storage/a.ts: DeleteObjectCommand',
      'apps/server/src/storage/b.ts: DeleteObjectsCommand',
      'scripts/c.ts: PutObjectLegalHoldCommand',
      'infra/src/d.ts: putBucketLifecycleConfiguration',
      'infra/src/d.ts: deleteObject',
      'packages/e.ts: PutObjectRetention',
    ])
    const cdk = new Map([
      [
        'infra/src/buckets.ts',
        [
          'new Bucket(this, "a", { lifecycleRules: [{ transitions: [{ storageClass: IA, transitionAfter: Duration.days(30) }] }] })',
          'new Bucket(this, "b", { lifecycleRules: [{ expiration: Duration.days(120) }] })',
          'bucket.addLifecycleRule({ noncurrentVersionExpiration: Duration.days(1) })',
          'bucket.addLifecycleRule({ expiration: Duration.days(400), tagFilters: { released: "yes" } })',
          'new CfnBucket(this, "c", { lifecycleConfiguration: { rules: [{ status: "Enabled", "expirationInDays": 5 }] } })',
        ].join('\n'),
      ],
    ])
    expect(untaggedExpiries(cdk)).toEqual([
      'infra/src/buckets.ts:2',
      'infra/src/buckets.ts:3',
      'infra/src/buckets.ts:5',
    ])
  })

  // It reads every script in four folders, about 3 s alone, so Vitest's 5 s default is too close when
  // every workspace's tests share the machine, as for ai-free.test.ts's scan.
  it('no script in apps/, packages/, infra/ or scripts/ names one, and no CDK lifecycle rule expires untagged', () => {
    const allowed = new Set(S3_ALLOWED.map(entry => entry.path))
    const scripts = repoFiles().filter(path => /^(?:apps|packages|infra|scripts)\//.test(path) && isScript(path))
    expect(scripts.length).toBeGreaterThan(0)
    const files = new Map(
      scripts.filter(path => path !== SELF && !allowed.has(path)).map(path => [path, readRepoFile(path)] as const),
    )
    expect(s3Calls(files)).toEqual([])
    const lifecycleAllowed = new Set(LIFECYCLE_ALLOWED.map(entry => entry.path))
    const cdk = new Map(
      scripts
        .filter(path => path.startsWith('infra/') && !lifecycleAllowed.has(path))
        .map(path => [path, readRepoFile(path)] as const),
    )
    expect(untaggedExpiries(cdk)).toEqual([])
    // Every allow-list entry gives its reason and names a file that exists.
    const all = new Set(repoFiles())
    for (const entry of [...S3_ALLOWED, ...LIFECYCLE_ALLOWED]) {
      expect(entry.why.trim().length).toBeGreaterThan(0)
      expect(all.has(entry.path)).toBe(true)
    }
  }, 30_000)
})

// --- The tables the guards protect ------------------------------------------------------------------

// The tables of classes whose holds apply or that are kept, from packages/shared, and deletion_log,
// the log the guard depends on (its own class is exempt, but nothing but C2.9's purge, a function
// body, may delete from it).
function protectedTables(): Set<string> {
  const tables = new Set<string>(['deletion_log'])
  for (const cls of Object.values(RETENTION_CLASSES)) {
    if (cls.holds === 'apply' || cls.holds === 'kept') for (const table of cls.tables) tables.add(table)
  }
  return tables
}

// The tables a migration puts a guard trigger on: lifecycle_guard('<table>'), lifecycle_no_truncate(),
// deletion_log_kept() or legal_holds_kept().
function guardedTablesIn(migrations: readonly string[]): Set<string> {
  const tables = new Set<string>()
  for (const sql of migrations) {
    for (const [, table] of sql.matchAll(
      /\bcreate\s+trigger\s+\w+\s+before\s+[\w\s]+?\s+on\s+public\.([a-z_][a-z0-9_]*)\s+for\s+each\s+(?:row|statement)\s+execute\s+function\s+public\.(?:lifecycle_guard|lifecycle_no_truncate|deletion_log_kept|legal_holds_kept)\b/gi,
    )) {
      if (table !== undefined) tables.add(table.toLowerCase())
    }
  }
  return tables
}

const MIGRATION = /^db\/migrations\/(\d{4})_[^/]+\.sql$/
const migrationFiles = () => repoFiles().filter(path => MIGRATION.test(path))

// Each DELETE or TRUNCATE in a text that names one of the tables, or a table named only at run time
// (a format() placeholder, an interpolation, a variable), with where it starts: SQL in a migration
// or test, SQL in a string, or Kysely's deleteFrom(). A table named at run time could be any table,
// so it counts as one of them.
function deleteHits(text: string, tables: ReadonlySet<string>): Array<[string, number]> {
  const hits: Array<[string, number]> = []
  const named = (verb: string, raw: string, at: number) => {
    const table = raw.replace(/^["'`]|["'`]$/g, '').toLowerCase()
    if (!/^[a-z_][a-z0-9_]*$/.test(table)) hits.push([`${verb} a table named at run time`, at])
    else if (tables.has(table)) hits.push([`${verb} ${table}`, at])
  }
  const target = String.raw`(?:only\s+)?(?:"?public"?\.)?("?[^\s;(),]+)`
  for (const match of text.matchAll(new RegExp(String.raw`\bdelete\s+from\s+${target}`, 'gi'))) {
    named('delete from', match[1] ?? '', match.index)
  }
  for (const match of text.matchAll(new RegExp(String.raw`\btruncate\s+(?:table\s+)?${target}`, 'gi'))) {
    named('truncate', match[1] ?? '', match.index)
  }
  // deleteFrom() takes its table as a string literal; anything else (a variable) is named at run time.
  for (const match of text.matchAll(/\.deleteFrom\(\s*([^\s,)]+)/g)) {
    const raw = (match[1] ?? '').replace(/^(["'`])public\./, '$1')
    named('delete from', /^["'`]/.test(raw) ? raw : `$${raw}`, match.index)
  }
  return hits.sort((a, b) => a[1] - b[1])
}
const deletesOf = (text: string, tables: ReadonlySet<string>): string[] =>
  deleteHits(text, tables).map(([what]) => what)

// --- LCG-03: destructive statements in later migrations -------------------------------------------

// PR 1's migration (0013): only later migrations are held to LCG-03.
const LAST_REVIEWED_MIGRATION = 13

// Statements in later migrations reviewed as safe, each by file and statement (whitespace folded,
// lower case), with why. Empty until a migration needs one.
const REVIEWED_STATEMENTS: ReadonlyArray<{ file: string; statement: string; why: string }> = []

// A migration's SQL with its comments removed and its function bodies blanked, so only what runs at
// migration time is left: top-level statements, string literals, and DO blocks' bodies (which run in
// the migration, so they count, with their own comments removed and their dollar-quoted strings,
// format() templates included, kept).
function migrationTimeSql(sql: string, inDoBody = false): string {
  let out = ''
  let i = 0
  while (i < sql.length) {
    const rest = sql.slice(i)
    if (rest.startsWith('--')) {
      const end = sql.indexOf('\n', i)
      i = end === -1 ? sql.length : end
    } else if (rest.startsWith('/*')) {
      const end = sql.indexOf('*/', i + 2)
      i = end === -1 ? sql.length : end + 2
      out += ' '
    } else if (sql[i] === "'") {
      let j = i + 1
      while (j < sql.length && !(sql[j] === "'" && sql[j + 1] !== "'")) j += sql[j] === "'" ? 2 : 1
      out += sql.slice(i, j + 1)
      i = j + 1
    } else {
      const tag = rest.match(/^\$([A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0]
      if (tag === undefined) {
        out += sql[i]
        i += 1
        continue
      }
      const end = sql.indexOf(tag, i + tag.length)
      const body = sql.slice(i + tag.length, end === -1 ? sql.length : end)
      i = end === -1 ? sql.length : end + tag.length
      if (inDoBody) out += `${tag}${body}${tag}`
      else if (/\bdo\s*(?:language\s+\w+\s*)?$/i.test(out)) out += `${tag}${migrationTimeSql(body, true)}${tag}`
      else out += `${tag}${tag}`
    }
  }
  return out
}

// The guard's functions, and the hold decision every guard and definer asks (DB-07).
const GUARD_FUNCTIONS = 'lifecycle_guard|lifecycle_no_truncate|deletion_log_kept|legal_holds_kept|lifecycle_held'
// The guard's triggers, each named as its function (check 7d).
const GUARD_TRIGGERS = 'lifecycle_guard|lifecycle_no_truncate|deletion_log_kept|legal_holds_kept'

// What LCG-03 refuses, by name.
const DESTRUCTIVE: ReadonlyArray<[string, RegExp]> = [
  // A TRUNCATE in a trigger's event list (BEFORE TRUNCATE, OR TRUNCATE) empties nothing: 0014's guard
  // on the provenance tables, and C2.9's per-partition triggers. Check 8's DESTRUCTIVE reads it so too.
  ['truncate', /(?<!\b(?:before|after|or)\s+)\btruncate\b/gi],
  ['drop table', /\bdrop\s+table\b/gi],
  ['detach partition', /\bdetach\s+partition\b/gi],
  ['disable trigger', /\bdisable\s+trigger\b/gi],
  ['drop trigger', /\bdrop\s+trigger\b/gi],
  ['enable always trigger', /\benable\s+always\s+trigger\b/gi],
  ['enable replica trigger', /\benable\s+replica\s+trigger\b/gi],
  // CREATE OR REPLACE TRIGGER swaps a guard's trigger for one check 7d must then catch, with no DROP
  // TRIGGER for this to see: one that names a guard's trigger or function anywhere in its statement.
  [
    'a guard trigger replaced',
    new RegExp(
      String.raw`\bcreate\s+or\s+replace\s+(?:constraint\s+)?trigger\b(?=[^;]*\b(?:${GUARD_TRIGGERS})\b)`,
      'gi',
    ),
  ],
  // A guard fires for every row and every column: never with a WHEN or an UPDATE OF list (LH-11).
  [
    'a guard trigger with a WHEN condition or an UPDATE OF list',
    new RegExp(
      String.raw`\bcreate\s+(?:constraint\s+)?trigger\b(?=[^;]*\bexecute\s+(?:function|procedure)\s+(?:"?public"?\.)?"?(?:${GUARD_TRIGGERS})\b)(?=[^;]*(?:\bwhen\s*\(|\bupdate\s+of\b))`,
      'gi',
    ),
  ],
  [
    'a guard function replaced, dropped or changed',
    new RegExp(
      String.raw`\b(?:create\s+or\s+replace|drop|alter)\s+function\s+(?:if\s+exists\s+)?(?:"?public"?\.)?"?(?:${GUARD_FUNCTIONS})\b`,
      'gi',
    ),
  ],
]

// The statement around an index, between the semicolons either side, folded and lower case.
function statementAt(sql: string, at: number): string {
  const start = sql.lastIndexOf(';', at) + 1
  const end = sql.indexOf(';', at)
  return sql
    .slice(start, end === -1 ? undefined : end)
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

// Each destructive statement in the migrations above LAST_REVIEWED_MIGRATION that the reviewed list
// doesn't name, as "path: what: statement".
function destructiveStatements(
  files: ReadonlyMap<string, string>,
  tables: ReadonlySet<string>,
  reviewed: ReadonlyArray<{ file: string; statement: string }>,
): string[] {
  const found: string[] = []
  for (const [path, text] of files) {
    const number = Number(path.match(MIGRATION)?.[1] ?? '0')
    if (number <= LAST_REVIEWED_MIGRATION) continue
    const sql = migrationTimeSql(text)
    const hits: Array<[string, number]> = []
    for (const [what, pattern] of DESTRUCTIVE) for (const match of sql.matchAll(pattern)) hits.push([what, match.index])
    for (const hit of deleteHits(sql, tables)) if (hit[0].startsWith('delete from')) hits.push(hit)
    for (const [what, at] of hits.sort((a, b) => a[1] - b[1])) {
      const statement = statementAt(sql, at)
      if (!reviewed.some(entry => entry.file === path && entry.statement === statement)) {
        found.push(`${path}: ${what}: ${statement}`)
      }
    }
  }
  return found
}

describe('LCG-03 (C0.10 LH-33, DB-07): later migrations hold no destructive or guard-disabling statement unless reviewed', () => {
  const tables = new Set(['cases', 'audit_events', 'people', 'deletion_log'])

  it('finds each kind on planted migrations, and passes function bodies, 0013 itself and reviewed statements', () => {
    const files = new Map([
      // 0013 and earlier aren't held to it.
      ['db/migrations/0013_x.sql', 'truncate public.cases;'],
      [
        'db/migrations/0014_a.sql',
        [
          '-- truncate in a comment, and drop table in one too',
          'create or replace function public.lifecycle_kinds() returns setof text language sql as $$ select 1 $$;',
          'create function public.purge() returns void language plpgsql as $f$ begin delete from public.audit_events; truncate public.cases; end $f$;',
          'truncate public.cases cascade;',
          'delete from public.people where org_id is null;',
          'delete from public.working_hours where false;',
          'alter table public.cases disable trigger lifecycle_guard;',
          'drop trigger lifecycle_guard on public.legal_holds;',
          'alter table public.cases enable always trigger lifecycle_guard;',
          'create or replace function public.lifecycle_guard() returns trigger language plpgsql as $$ begin return old; end $$;',
          'drop function public.lifecycle_held(uuid, uuid[], text, uuid);',
          'alter table public.data_access_events detach partition public.data_access_events_2026_01;',
          'drop table public.old_thing;',
          'alter table public.cases enable replica trigger lifecycle_guard;',
          "create or replace trigger lifecycle_guard before delete on public.cases for each row execute function public.lifecycle_guard('cases');",
          "create trigger lifecycle_guard before delete on public.sessions for each row when (old.ended_at is not null) execute function public.lifecycle_guard('sessions');",
          'create trigger legal_holds_kept before update of released_at on public.legal_holds for each row execute function public.legal_holds_kept();',
          // A guard's trigger created plainly, and another trigger replaced, pass.
          "create trigger lifecycle_guard before delete on public.devices for each row execute function public.lifecycle_guard('devices');",
          'create or replace trigger touch before update on public.teams for each row when (old.name is distinct from new.name) execute function public.touch();',
          // A TRUNCATE in a trigger's event list empties nothing, so it passes (0014's guard).
          'create trigger lifecycle_no_truncate before truncate on public.provenance_items for each statement execute function public.lifecycle_no_truncate();',
          'create trigger audit after insert or truncate on public.x for each statement execute function public.f();',
        ].join('\n'),
      ],
      [
        'db/migrations/0015_b.sql',
        [
          "do $$ begin execute format($q$delete from public.%I$q$, 'audit_events'); end $$;",
          'do language plpgsql $body$ begin -- truncate in a DO comment\n delete from deletion_log; end $body$;',
          "comment on table public.cases is 'truncate never';",
          'delete from public.cases where id = $1;',
        ].join('\n'),
      ],
    ])
    const reviewed = [{ file: 'db/migrations/0015_b.sql', statement: 'delete from public.cases where id = $1' }]
    expect(destructiveStatements(files, tables, reviewed)).toEqual([
      'db/migrations/0014_a.sql: truncate: truncate public.cases cascade',
      'db/migrations/0014_a.sql: delete from people: delete from public.people where org_id is null',
      'db/migrations/0014_a.sql: disable trigger: alter table public.cases disable trigger lifecycle_guard',
      'db/migrations/0014_a.sql: drop trigger: drop trigger lifecycle_guard on public.legal_holds',
      'db/migrations/0014_a.sql: enable always trigger: alter table public.cases enable always trigger lifecycle_guard',
      'db/migrations/0014_a.sql: a guard function replaced, dropped or changed: create or replace function public.lifecycle_guard() returns trigger language plpgsql as $$$$',
      'db/migrations/0014_a.sql: a guard function replaced, dropped or changed: drop function public.lifecycle_held(uuid, uuid[], text, uuid)',
      'db/migrations/0014_a.sql: detach partition: alter table public.data_access_events detach partition public.data_access_events_2026_01',
      'db/migrations/0014_a.sql: drop table: drop table public.old_thing',
      'db/migrations/0014_a.sql: enable replica trigger: alter table public.cases enable replica trigger lifecycle_guard',
      "db/migrations/0014_a.sql: a guard trigger replaced: create or replace trigger lifecycle_guard before delete on public.cases for each row execute function public.lifecycle_guard('cases')",
      "db/migrations/0014_a.sql: a guard trigger with a WHEN condition or an UPDATE OF list: create trigger lifecycle_guard before delete on public.sessions for each row when (old.ended_at is not null) execute function public.lifecycle_guard('sessions')",
      'db/migrations/0014_a.sql: a guard trigger with a WHEN condition or an UPDATE OF list: create trigger legal_holds_kept before update of released_at on public.legal_holds for each row execute function public.legal_holds_kept()',
      "db/migrations/0015_b.sql: delete from a table named at run time: do $$ begin execute format($q$delete from public.%i$q$, 'audit_events')",
      'db/migrations/0015_b.sql: delete from deletion_log: do language plpgsql $body$ begin delete from deletion_log',
      "db/migrations/0015_b.sql: truncate: comment on table public.cases is 'truncate never'",
    ])
  })

  it('every migration after 0013 holds none, outside the reviewed list', () => {
    const files = new Map(migrationFiles().map(path => [path, readRepoFile(path)] as const))
    // The migrations are read, so an empty map would mean the guard reads nothing.
    expect(files.size).toBeGreaterThanOrEqual(LAST_REVIEWED_MIGRATION)
    expect(destructiveStatements(files, protectedTables(), REVIEWED_STATEMENTS)).toEqual([])
    for (const entry of REVIEWED_STATEMENTS) expect(entry.why.trim().length).toBeGreaterThan(0)
  })
})

// --- LCG-04: deletes in server code ---------------------------------------------------------------

const SERVER = 'apps/server/src/'
const LIFECYCLE = `${SERVER}lifecycle/`
const isServerRuntime = (path: string) =>
  path.startsWith(SERVER) &&
  /\.ts$/.test(path) &&
  !/\.test\.ts$/.test(path) &&
  !path.startsWith(`${SERVER}testing/`) &&
  !path.startsWith(LIFECYCLE)

// Each delete of a protected table in the server's runtime code, as "path: delete <table>".
function serverDeletes(files: ReadonlyMap<string, string>, tables: ReadonlySet<string>): string[] {
  return [...files].flatMap(([path, text]) =>
    isServerRuntime(path) ? deletesOf(withoutComments(path, text), tables).map(hit => `${path}: ${hit}`) : [],
  )
}

describe('LCG-04 (C0.10 LH-33): no server code outside apps/server/src/lifecycle/ deletes from a held or kept table', () => {
  it('finds each form on planted files, and passes the lifecycle module, tests and other tables', () => {
    const tables = new Set(['cases', 'sessions', 'people'])
    const files = new Map([
      ['apps/server/src/a.ts', 'await trx.execute(sql`delete from public.cases where id = $1`)'],
      ['apps/server/src/b.ts', "await trx.deleteFrom('sessions').where('id', '=', id).execute()"],
      ['apps/server/src/c.ts', "const q = 'TRUNCATE TABLE people'\nawait trx.deleteFrom(table).execute()"],
      [
        'apps/server/src/d.ts',
        "// delete from public.cases, in a comment\nawait trx.deleteFrom('working_hours').execute()",
      ],
      ['apps/server/src/lifecycle/sweep.ts', 'await trx.execute(sql`delete from public.cases`)'],
      ['apps/server/src/e.test.ts', "await trx.deleteFrom('cases').execute()"],
      ['apps/server/src/testing/stack.ts', "await query('delete from public.people')"],
    ])
    expect(serverDeletes(files, tables)).toEqual([
      'apps/server/src/a.ts: delete from cases',
      'apps/server/src/b.ts: delete from sessions',
      'apps/server/src/c.ts: truncate people',
      'apps/server/src/c.ts: delete from a table named at run time',
    ])
  })

  it('the server’s runtime code holds none', () => {
    const files = new Map(
      repoFiles()
        .filter(isServerRuntime)
        .map(path => [path, readRepoFile(path)] as const),
    )
    expect(files.size).toBeGreaterThan(0)
    expect(serverDeletes(files, protectedTables())).toEqual([])
  })
})

// --- LCG-05: deletes in replica mode ----------------------------------------------------------------

// A setting of session_replication_role to replica, and back to origin or the default, or reset (SQL,
// set_config(), or SQL in a string), which ends either kind of setting.
const TO_REPLICA = /session_replication_role['"]?\s*(?:=|\bto\b|,)\s*['"]?replica\b/gi
const BACK =
  /session_replication_role['"]?\s*(?:=|\bto\b|,)\s*['"]?(?:origin|default)\b|\breset\s+(?:session_replication_role|all)\b/i
// The end of a transaction, which ends only a transaction-local setting: a session-level one (a
// plain SET, or set_config() with false or an is_local it can't read) outlives a COMMIT, and a
// ROLLBACK undoes it only if it ran in that transaction, which the text can't show. A ROLLBACK TO
// SAVEPOINT (with or without WORK or TRANSACTION) ends neither the transaction nor a setting made
// before the savepoint. One made after it is undone by it, but the text can't show which, so the
// guard reads on, as it does past a session-level ROLLBACK; where that over-reports, set the role
// back to origin explicitly. A rollback on an error path can't be told apart in the text either.
// END and ABORT aren't read: as bare words they would stop the reading at an END IF, a CASE's END or
// client.end(), and hide a later delete (R2CODE-02, TESTS-06, LH-33).
const TX_END = /\b(?:commit|rollback)\b(?!\s+(?:work\s+|transaction\s+)?to\b)/i

// Whether the setting to replica that the match at..end is lasts only for its transaction: SET LOCAL,
// or set_config() whose is_local is true.
const isLocal = (code: string, at: number, end: number): boolean =>
  /\bset\s+local\s+["']?$/i.test(code.slice(0, at)) || /^['"]?\s*,\s*true\b/i.test(code.slice(end))

// A file's text with its comments removed: SQL's line and block comments, a shell script's, or a
// TypeScript or JavaScript file's.
function codeText(path: string, text: string): string {
  if (path.endsWith('.sql')) return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, '')
  if (path.endsWith('.sh')) return text.replace(/(^|\s)#[^\n]*/g, '$1')
  return withoutComments(path, text)
}

// Each delete of a guarded table between a setting to replica and the next return to origin (or, for
// a transaction-local setting outside db/tests/, its transaction's end, or the file's end), as
// "path: delete <table>". scripts/test-db.sh refuses a db/tests/ file that ends its own transaction,
// so any COMMIT or ROLLBACK there is a savepoint's or text in a string, and never ends the setting
// (R2CODE-02).
function replicaDeletes(files: ReadonlyMap<string, string>, guarded: ReadonlySet<string>): string[] {
  const found: string[] = []
  for (const [path, text] of files) {
    const code = codeText(path, text)
    const txEnds = !path.startsWith('db/tests/')
    for (const match of code.matchAll(TO_REPLICA)) {
      const from = match.index + match[0].length
      const rest = code.slice(from)
      const ends = [rest.search(BACK), txEnds && isLocal(code, match.index, from) ? rest.search(TX_END) : -1].filter(
        at => at !== -1,
      )
      const segment = ends.length === 0 ? rest : rest.slice(0, Math.min(...ends))
      for (const hit of deletesOf(segment, guarded)) found.push(`${path}: ${hit}`)
    }
  }
  return found
}

describe('LCG-05 (C0.10 LH-33, LH-11): nothing deletes a guarded table with triggers off', () => {
  it('finds a delete or TRUNCATE in replica mode on planted files, and passes one after the return to origin', () => {
    const guarded = new Set(['cases', 'case_steps', 'legal_holds', 'deletion_log'])
    const files = new Map([
      [
        'db/tests/900_a.sql',
        [
          'set local session_replication_role = replica;',
          'update public.people set deactivated_at = null;',
          'delete from public.case_steps where false;',
          'set local session_replication_role = origin;',
          'delete from public.cases where false;',
        ].join('\n'),
      ],
      [
        'db/tests/901_b.sql',
        "perform set_config('session_replication_role', 'replica', true);\n-- delete from public.cases\ntruncate public.legal_holds;",
      ],
      [
        'apps/server/src/testing/c.ts',
        "await q('begin')\nawait q('set local session_replication_role = replica')\nawait q('delete from public.deletion_log')\nawait q('commit')\nawait q('delete from public.cases')",
      ],
      [
        'scripts/d.ts',
        "await q('set local session_replication_role = replica')\nawait q('update public.cases set note = null')",
      ],
      // TESTS-06: a session-level setting outlives a COMMIT or a ROLLBACK, so only a return to
      // origin or a reset ends it.
      [
        'apps/server/src/testing/e.ts',
        "await q('set session_replication_role = replica')\nawait q('commit')\nawait q('delete from public.cases')",
      ],
      [
        'db/tests/902_f.sql',
        "select set_config('session_replication_role', 'replica', false);\ncommit;\ntruncate public.legal_holds;",
      ],
      [
        'scripts/g.ts',
        "await q('set session_replication_role to replica')\nawait q('rollback')\nawait q('reset session_replication_role')\nawait q('delete from public.cases')",
      ],
      // R2CODE-02, TESTS-06, LH-33: a ROLLBACK TO SAVEPOINT ends neither the transaction nor a
      // transaction-local setting made before the savepoint, and a db/tests/ file's transaction never
      // ends (scripts/test-db.sh), so a COMMIT there, even in a string, ends nothing.
      [
        'db/tests/903_savepoint.sql',
        'set local session_replication_role = replica;\nsavepoint s;\nrollback to savepoint s;\ndelete from public.cases;',
      ],
      [
        'db/tests/904_string.sql',
        "set local session_replication_role = replica;\nselect 'commit';\ndelete from public.case_steps;",
      ],
      [
        'apps/server/src/testing/h.ts',
        "await q('set local session_replication_role = replica')\nawait q('savepoint a')\nawait q('rollback to savepoint a')\nawait q('delete from public.legal_holds')",
      ],
      [
        'scripts/i.ts',
        "await q(\"select set_config('session_replication_role', 'replica', true)\")\nawait q('rollback work to savepoint s')\nawait q('ROLLBACK TRANSACTION TO s')\nawait q('truncate public.legal_holds')",
      ],
    ])
    expect(replicaDeletes(files, guarded)).toEqual([
      'db/tests/900_a.sql: delete from case_steps',
      'db/tests/901_b.sql: truncate legal_holds',
      'apps/server/src/testing/c.ts: delete from deletion_log',
      'apps/server/src/testing/e.ts: delete from cases',
      'db/tests/902_f.sql: truncate legal_holds',
      'db/tests/903_savepoint.sql: delete from cases',
      'db/tests/904_string.sql: delete from case_steps',
      'apps/server/src/testing/h.ts: delete from legal_holds',
      'scripts/i.ts: truncate legal_holds',
    ])
  })

  it('the migrations put the guard on its tables, and no file in apps/, scripts/ or db/tests/ deletes one in replica mode', () => {
    const guarded = guardedTablesIn(migrationFiles().map(readRepoFile))
    // 0013 guards these, so a smaller set would mean the guard reads nothing.
    for (const table of ['cases', 'case_steps', 'legal_holds', 'deletion_log']) expect(guarded).toContain(table)
    const files = new Map(
      repoFiles()
        .filter(path => /^(?:apps|scripts)\//.test(path) || /^db\/tests\//.test(path))
        .filter(path => path !== SELF && (isScript(path) || path.endsWith('.sql') || path.endsWith('.sh')))
        .map(path => [path, readRepoFile(path)] as const)
        .filter(([, text]) => text.includes('session_replication_role')),
    )
    // Several files set replica mode today, so an empty map would mean the guard reads nothing.
    expect(files.size).toBeGreaterThan(0)
    expect(replicaDeletes(files, guarded)).toEqual([])
  })
})

// --- What the docs say C0.10 built (review DOCS-02, DOCS-03, DOCS-05, DOCS-06, R2DOCS-01, R2DOCS-02,
// R2DOCS-05) ---
// Text pins on the sentences the review corrected, each beside the code fact it describes, so the
// old wording can't come back while the code says otherwise. A comment's line breaks in ci.yml are
// folded first, so a pin reads a wrapped sentence whole.
const folded = (text: string): string => text.replace(/\n\s*#\s*/g, ' ').replace(/\s+/g, ' ')

describe('C0.10 review: CLAUDE.md, TECH-SPEC and ci.yml say what 0013 and its checks do', () => {
  const claude = folded(readRepoFile('CLAUDE.md'))

  it('DOCS-02: OD-27’s revoke is described as carried, as 032 pins nobody reading the actor', () => {
    expect(readRepoFile('db/tests/032_worker_roles.sql')).toContain(
      "'a role may read an outbox event''s actor (OD-27, LCD-31)'",
    )
    expect(claude).not.toMatch(/until the revoke C0\.9 OD-27/)
    expect(claude).toContain('since 0013 carried C0.9 OD-27’s revoke'.replace('’', "'"))
    expect(claude).toMatch(/which 032 pins \(LCD-31\)/)
  })

  it('DOCS-03: only a guarded path’s tables carry the guard, beside checked and exempt paths', () => {
    expect(readRepoFile('apps/server/src/lifecycle/deletes.ts')).toContain(
      'export type DeletePath = { guarded: true } | { checked: true; decision: string } | { exempt: string; decision: string }',
    )
    expect(claude).toContain('Every table a `guarded` delete path deletes from carries')
    expect(claude).toContain('as `guarded`, `checked` or `exempt`')
  })

  it('DOCS-05: LCR-15 is is_held() against a request being sent, never against a deletion', () => {
    const concurrency = readRepoFile('apps/server/scripts/check-concurrency.ts')
    expect(concurrency).toMatch(/'LCR-15 [^']*is_held\(\) of a person waits for a request for a copy they are sending/)
    for (const [path, text] of [
      ['CLAUDE.md', claude],
      ['docs/TECH-SPEC.md', folded(readRepoFile('docs/TECH-SPEC.md'))],
      ['.github/workflows/ci.yml', folded(readRepoFile('.github/workflows/ci.yml'))],
    ] as const) {
      expect(text, path).toMatch(/is_held\(\)`? against a request being sent/)
      expect(text, path).not.toMatch(/a release, `?is_held\(\)/)
    }
  })

  it('DOCS-06: the class rule leaves out the migrator’s ledger, as check 7 does', () => {
    expect(readRepoFile('apps/server/scripts/check-catalogues.ts')).toContain(
      "c.relname not in ('kysely_migration', 'kysely_migration_lock')",
    )
    expect(claude).toContain(
      'Every table of `public` (the migrator’s ledger, `kysely_migration` and `kysely_migration_lock`, aside;'.replace(
        '’',
        "'",
      ),
    )
  })

  it('R2DOCS-01: a checked path deletes only from a table a leaver’s reduction marks, neither guarded nor kept, and T23 says so', () => {
    // The code fact: check 8 refuses a checked path into a guarded or kept table, or one whose class
    // marks no leaver's reduction (catalogues.ts, GUARD-02), and today only working_hours is left.
    expect(readRepoFile('apps/server/scripts/catalogues.ts')).toContain('!holds.reduction.has(table)')
    const guarded = guardedTablesIn(migrationFiles().map(path => readRepoFile(path)))
    const checkable = Object.values(RETENTION_CLASSES)
      .filter(cls => 'reduction' in cls && cls.reduction === 'apply' && cls.holds !== 'kept')
      .flatMap(cls => cls.tables)
      .filter(table => !guarded.has(table))
    expect(checkable).toEqual(['working_hours'])
    const spec = folded(readRepoFile('docs/TECH-SPEC.md'))
    expect(spec).toContain("only for a table whose class marks a leaver's reduction (`reduction: 'apply'`)")
    expect(spec).toContain('today `working_hours` alone; LH-58, GUARD-02')
    // CLAUDE.md's matching sentences (Database, the guard bullet; Testing and CI, check 8).
    expect(claude).toContain(
      "Check 8 lets a `checked` path delete only from a table whose class marks a leaver's reduction (`reduction: 'apply'`)",
    )
    expect(claude).toContain(
      'a checked one only to a table a leaver’s reduction marks and logging each row'.replace('’', "'"),
    )
    expect(claude).not.toMatch(/check 8 refuses a `checked` path into a guarded table\./)
  })

  it('R2CODE-01, HOLDS-03: CLAUDE.md names the pinned DYNAMIC_DDL bodies and READ COMMITTED for hold decisions', () => {
    expect(readRepoFile('apps/server/scripts/catalogues.ts')).toContain('export const DYNAMIC_DDL')
    expect(claude).toContain(
      "in a function body or a `DYNAMIC_DDL` function's strings, each `DYNAMIC_DDL` body being the one",
    )
    expect(readRepoFile('db/migrations/0013_lifecycle_holds.sql')).toMatch(/transaction_isolation/)
    expect(claude).toContain(
      'every hold decision (`lifecycle_held()` refuses any other level, 25000), under READ COMMITTED',
    )
  })

  it('R2DOCS-02: T23 records no DPO confirmation of Q13, whose periods the registry still proposes, and LH-53 has one status', () => {
    expect(RETENTION_CLASSES.messages.status).toBe('proposed')
    const raw = readRepoFile('docs/TECH-SPEC.md')
    const spec = folded(raw)
    expect(spec).not.toMatch(/the retention defaults \([^)]*Q13/)
    expect(spec).toContain("the retention defaults (the cases default, LH-47, and LH-53's figures)")
    expect(spec).toContain('**LH-53, confirmed:**')
    // T23's own "Still open" sentence: T22 has one too.
    const start = raw.indexOf('## T23:')
    const t23 = folded(raw.slice(start, raw.indexOf('\n## ', start + 1)))
    const open = t23.match(/Still open, for the DPO or a later step: .*?\.(?:\s|$)/)?.[0]
    expect(open).toBeDefined()
    expect(open).not.toContain('LH-53')
    expect(open).toContain('PRD Q13')
  })

  it('R2DOCS-05: TECH-SPEC’s summaries name what C0.10 built and the review added', () => {
    const spec = readRepoFile('docs/TECH-SPEC.md')
    const index = spec.match(/^\| T23 \|[^\n]*/m)?.[0] ?? ''
    expect(index).not.toContain('every table the deletion code deletes from')
    expect(index).toContain('a guard on every table a `guarded` delete path deletes from')
    const ci = spec.match(/^- CI's `migrations` job:[^\n]*/m)?.[0] ?? ''
    const t23Tests = spec.match(/^- \*\*DB tests:\*\* `db\/tests\/180_[^\n]*/m)?.[0] ?? ''
    // C0.10's DB tests, 180 onwards, from the folder itself.
    const dbTests = repoFiles()
      .map(path => path.match(/^db\/tests\/(\d{3}_[^/]+\.sql)$/)?.[1])
      .filter((name): name is string => name !== undefined && Number(name.slice(0, 3)) >= 180)
    expect(dbTests).toContain('198_lifecycle_isolation.sql')
    for (const file of dbTests) {
      expect(ci, file).toContain(file)
      expect(t23Tests, file).toContain(file)
    }
    for (const line of [index, ci]) expect(line).not.toMatch(/every table of `public` in exactly one/)
    const guards = spec.match(/^- \*\*Guards:\*\* `scripts\/guards\/design-ids[^\n]*/m)?.[0] ?? ''
    for (const id of ['LCG-01', 'LCG-02 to LCG-05', 'LCG-06', 'LCG-07', 'RB-06']) expect(guards, id).toContain(id)
  })
})
