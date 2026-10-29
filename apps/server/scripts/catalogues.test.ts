import { readdirSync, readFileSync } from 'node:fs'
import {
  ACTIVE_FROM_START,
  AI_PROVIDERS,
  DELETION_CAUSES,
  FLAGS,
  HOLD_KINDS,
  HOLD_TARGET_KINDS,
  NOTICE_TRANSFER_FACTS,
  PINNED_PURPOSES,
  PROVIDERS,
  PURPOSES,
  REFUSED_COPY_HOLD,
  RETENTION_CLASSES,
  type RetentionClass,
  retentionClassDefaults,
} from '@hearth/shared'
import { describe, expect, it } from 'vitest'
import { DELETE_PATHS, type DeletePath, GUARDED_TABLES } from '#src/lifecycle/deletes.ts'
import type { Coverage } from '#src/outbox/coverage.ts'
import {
  aiClassProblems,
  bindingProblems,
  bodyDdlProblems,
  bodyProblems,
  bodyWrites,
  type ClassDefault,
  checkpointBindings,
  classTableProblems,
  contentProblems,
  coverageProblems,
  dayIntervals,
  deletePathProblems,
  deletePathsOf,
  eventProblems,
  type Fn,
  type ForeignKey,
  fixedAgeProblems,
  flagProblems,
  type Grant,
  guardProblems,
  helperBodyProblems,
  holdsTables,
  matchProblems,
  noticeFactProbe,
  noticeFactProblems,
  type OrgRegisters,
  type ProviderDefault,
  type PurposeDefault,
  type RegisterCode,
  type Relation,
  recordedDecisions,
  registerProblems,
  resolverProblems,
  retentionDefaultProblems,
  roleProblems,
  stringLiterals,
  stripComments,
  type TriggerRow,
  type Vocabularies,
  vocabularyProblems,
} from './catalogues.ts'

const writes: Record<string, Coverage> = {
  'hearth_app people:INSERT': { events: ['person.added'] },
  'hearth_app people.full_name:UPDATE': { events: ['person.updated'] },
  'hearth_app audit_events:INSERT': { exempt: 'the audit log is itself the record of the change' },
  'keep_history()': { exempt: 'a check', writes: [] },
}
const grants = [
  { role: 'hearth_app', table: 'people', op: 'INSERT' },
  { role: 'hearth_app', table: 'people', op: 'UPDATE', column: 'full_name' },
  { role: 'hearth_app', table: 'audit_events', op: 'INSERT' },
] as const
const functions = [{ key: 'keep_history()', definer: false, trigger: true }]

describe('C0.6 T16 item 7 check-catalogues: every way to write is covered', () => {
  it('passes when every grant and reachable function has its entry and no entry is stale', () => {
    expect(coverageProblems(writes, grants, functions)).toEqual([])
  })

  it('names a grant with no entry, with the key to add', () => {
    const problems = coverageProblems(
      writes,
      [...grants, { role: 'hearth_app', table: 'people', op: 'UPDATE', column: 'phone' }],
      functions,
    )
    expect(problems).toEqual([
      "hearth_app may UPDATE public.people.phone, but apps/server/src/outbox/coverage.ts doesn't say which event covers it or why it's exempt: add 'hearth_app people.phone:UPDATE'",
    ])
  })

  it('names a new definer or trigger function with no entry, and one whose entry lists no writes', () => {
    const problems = coverageProblems({ ...writes, 'set_x(text)': { events: ['flag.changed'] } }, grants, [
      ...functions,
      { key: 'set_x(text)', definer: true, trigger: false },
      { key: 'zz()', definer: false, trigger: true },
    ])
    expect(problems).toEqual([
      "apps/server/src/outbox/coverage.ts's 'set_x(text)' must list the writes it makes (writes: [] if none)",
      expect.stringContaining('the trigger function public.zz() can run in a runtime transaction'),
    ])
  })

  it('names a stale entry: a grant or function that no longer exists', () => {
    expect(coverageProblems(writes, grants.slice(1), functions)).toEqual([
      expect.stringContaining(
        "covers 'hearth_app people:INSERT', which no runtime role's grant or reachable function matches",
      ),
    ])
  })

  it('needs MATCH for every table an event covers, naming a real column', () => {
    const columns = new Set(['people.id'])
    expect(matchProblems(writes, { people: 'id' }, columns)).toEqual([])
    expect(matchProblems(writes, {}, columns)).toEqual([
      expect.stringContaining("'hearth_app people:INSERT' needs an event, but MATCH"),
      expect.stringContaining("'hearth_app people.full_name:UPDATE' needs an event, but MATCH"),
    ])
    expect(matchProblems(writes, { people: 'person_id' }, columns)).toEqual([
      "apps/server/src/outbox/coverage.ts's MATCH names public.people.person_id, which doesn't exist",
    ])
    // A function's writes count too.
    expect(
      matchProblems({ 'f()': { events: ['flag.changed'], writes: ['feature_flags.enabled:UPDATE'] } }, {}, columns),
    ).toEqual([expect.stringContaining('which column of feature_flags the event must name')])
  })

  it('refuses an exemption for a content table: one whose writes append events with a snapshot', () => {
    const content: Record<string, Coverage> = {
      'hearth_app messages:INSERT': { events: ['message.created'] },
      'hearth_app messages.body:UPDATE': { exempt: 'nobody reads it' },
    }
    expect(contentProblems(content, type => type === 'message.created')).toEqual([
      expect.stringContaining("'hearth_app messages.body:UPDATE' is exempt, but writes messages, which holds content"),
    ])
    expect(contentProblems(content, () => false)).toEqual([])
    expect(contentProblems(writes)).toEqual([])
  })

  it('CONTRACT-7: a content table is content whatever its entries say: an all-exempt one, or one a function writes, is refused', () => {
    // Every entry exempt, by grant and through a definer function: nothing carries a snapshot, so
    // only CONTENT_TABLES says messages is content.
    const exempt: Record<string, Coverage> = {
      'hearth_app messages:INSERT': { exempt: 'nobody reads it' },
      'post_message(uuid, text)': { exempt: 'a check', writes: ['messages:INSERT'] },
      'hearth_app people:INSERT': { exempt: 'not content' },
    }
    expect(contentProblems(exempt, () => false, ['messages'])).toEqual([
      "'hearth_app messages:INSERT' is exempt, but writes messages, which holds content, whose every write appends its event with an ACL snapshot",
      "'post_message(uuid, text)' is exempt, but writes messages, which holds content, whose every write appends its event with an ACL snapshot",
    ])
    expect(contentProblems(exempt, () => false, [])).toEqual([])
    // A grant covered by a snapshot event makes the table content, so an exempt function writing
    // it is refused too.
    const mixed: Record<string, Coverage> = {
      'hearth_app messages:INSERT': { events: ['message.created'] },
      'post_message(uuid, text)': { exempt: 'a check', writes: ['messages:INSERT'] },
    }
    expect(contentProblems(mixed, type => type === 'message.created', [])).toEqual([
      expect.stringContaining("'post_message(uuid, text)' is exempt, but writes messages"),
    ])
  })

  it('CONTRACT-1: reads the tables a function body writes, schema-qualified, by operation', () => {
    expect(
      bodyWrites(`
        update public.people set full_name = x where id = y;
        insert into public.audit_events (org_id) values (o);
        insert into public.outbox_floors as f (org_id) values (o) on conflict (org_id) do update set last_id = 1;
        delete from public.jobs j using doomed d where j.id = d.id;
        select 1 from public.people for no key update;
        DELETE  FROM  public.Jobs;`),
    ).toEqual([
      { table: 'people', op: 'UPDATE', column: 'full_name' },
      { table: 'audit_events', op: 'INSERT' },
      { table: 'outbox_floors', op: 'INSERT' },
      { table: 'outbox_floors', op: 'UPDATE', column: 'last_id' },
      { table: 'jobs', op: 'DELETE' },
    ])
  })

  it('R2DB-3: reads an upsert’s DO UPDATE SET as an UPDATE of each column it sets', () => {
    expect(
      bodyWrites(`insert into public.outbox_floors as f (org_id, last_tx) values (o, t)
        on conflict (org_id) do update set last_tx = excluded.last_tx, last_id = greatest(f.last_id, 1)
        where f.org_id = o;`),
    ).toEqual([
      { table: 'outbox_floors', op: 'INSERT' },
      { table: 'outbox_floors', op: 'UPDATE', column: 'last_tx' },
      { table: 'outbox_floors', op: 'UPDATE', column: 'last_id' },
    ])
  })

  it('R2DB-3: reads ONLY, quoted names and every column of a SET list, and stops where the list ends', () => {
    expect(bodyWrites('delete from only public.jobs; update only public.schedules set paused = true;')).toEqual([
      { table: 'jobs', op: 'DELETE' },
      { table: 'schedules', op: 'UPDATE', column: 'paused' },
    ])
    expect(
      bodyWrites(`delete from "public"."jobs";
        update public."people" p set "full_name" = n, title = case when x then 'a' else 'b' end,
          (manager_id, department_id) = (m, d), tags = array[1, 2]
        from public.teams t, public.orgs o where p.id = t.id returning p.id, p.org_id;`),
    ).toEqual([
      { table: 'jobs', op: 'DELETE' },
      { table: 'people', op: 'UPDATE', column: 'full_name' },
      { table: 'people', op: 'UPDATE', column: 'title' },
      { table: 'people', op: 'UPDATE', column: 'manager_id' },
      { table: 'people', op: 'UPDATE', column: 'department_id' },
      { table: 'people', op: 'UPDATE', column: 'tags' },
    ])
    expect(
      bodyWrites('with d as (delete from public.jobs returning id) update public.t set a = 1 returning a, b'),
    ).toEqual([
      { table: 'jobs', op: 'DELETE' },
      { table: 't', op: 'UPDATE', column: 'a' },
    ])
  })

  it('Qodo-18 #3: reads quoted table and column names of any case and characters, and refuses a name it can’t read', () => {
    expect(
      bodyWrites(`insert into public."AuditData" (org_id) values (o);
        INSERT INTO "public"."Audit ""Log""" (org_id) values (o);
        delete from only public."Jobs-Old";
        update public."People" "P" set "FullName" = n, ("Title", plain) = (t, p), "Tags"[1] = x where "P".id = y;
        merge into public."Café" c using s on c.id = s.id when matched then update set "Prix" = 1;
        update public.people set "Full""Name" = n;`),
    ).toEqual([
      { table: 'AuditData', op: 'INSERT' },
      { table: 'Audit "Log"', op: 'INSERT' },
      { table: 'Jobs-Old', op: 'DELETE' },
      { table: 'People', op: 'UPDATE', column: 'FullName' },
      { table: 'People', op: 'UPDATE', column: 'Title' },
      { table: 'People', op: 'UPDATE', column: 'plain' },
      { table: 'People', op: 'UPDATE', column: 'Tags' },
      { table: 'Café', op: 'UPDATE', column: 'Prix' },
      { table: 'people', op: 'UPDATE', column: 'Full"Name' },
    ])
    // Unquoted names fold to lower case, as Postgres folds them.
    expect(bodyWrites('UPDATE public.People SET FullName = n;')).toEqual([
      { table: 'people', op: 'UPDATE', column: 'fullname' },
    ])
    // A name after public. it can't read is the table '?', which no entry lists.
    expect(bodyWrites('insert into public.9x (a) values (1);')).toEqual([{ table: '?', op: 'INSERT' }])
    const fn: Fn = {
      key: 'f()',
      definer: true,
      trigger: false,
      source: 'insert into public."AuditData" (a) values (1);',
    }
    expect(bodyProblems({ 'f()': { exempt: 'a check', writes: ['auditdata:INSERT'] } }, [fn], [], {})).toEqual([
      expect.stringContaining('runs insert into public.AuditData, but its entry'),
    ])
    expect(bodyProblems({ 'f()': { exempt: 'a check', writes: ['AuditData:INSERT'] } }, [fn], [], {})).toEqual([])
    const unreadable: Fn = { ...fn, source: 'delete from public.9x;' }
    expect(bodyProblems({ 'f()': { exempt: 'a check', writes: [] } }, [unreadable], [], {})).toEqual([
      expect.stringContaining("runs delete from a table of public whose name check-catalogues can't read"),
    ])
  })

  it('Qodo-18 round 3 #4: reads a MERGE by its own action clauses: an update-only one is only its UPDATE', () => {
    const source = `merge into public.jobs j using src s on j.id = s.id
        when matched then update set state = 'cancelled'
        when not matched then do nothing;
      if found then insert into public.audit_events (org_id) values (o);
      else delete from public.outbox_events where false;
      end if;
      if not found then delete from public.outbox_events where false; end if;`
    // The statements after the MERGE's ';' are their own: their THEN INSERT and THEN DELETE
    // write audit_events and outbox_events, never jobs.
    expect(bodyWrites(source)).toEqual([
      { table: 'jobs', op: 'UPDATE', column: 'state' },
      { table: 'audit_events', op: 'INSERT' },
      { table: 'outbox_events', op: 'DELETE' },
    ])
    const fn: Fn = { key: 'f()', definer: true, trigger: false, source }
    expect(
      bodyProblems(
        { 'f()': { exempt: 'a check', writes: ['jobs.state:UPDATE', 'audit_events:INSERT', 'outbox_events:DELETE'] } },
        [fn],
        [],
        {},
      ),
    ).toEqual([])
    // A MERGE that only deletes, or only inserts, is that alone.
    expect(bodyWrites('merge into public.jobs j using s on true when matched then delete;')).toEqual([
      { table: 'jobs', op: 'DELETE' },
    ])
    expect(
      bodyWrites('merge into public.jobs j using s on false when not matched then insert (id) values (s.id);'),
    ).toEqual([{ table: 'jobs', op: 'INSERT' }])
  })

  it('Qodo-18 round 4 #3: reads each MERGE’s THEN UPDATE SET within its own statement, so two MERGEs never share columns', () => {
    expect(
      bodyWrites(`merge into public.jobs j using src s on j.id = s.id
          when matched then update set state = 'cancelled';
        merge into public.schedule_runs r using src s on r.id = s.id
          when matched then update set reason = 'crash';`),
    ).toEqual([
      { table: 'jobs', op: 'UPDATE', column: 'state' },
      { table: 'schedule_runs', op: 'UPDATE', column: 'reason' },
    ])
  })

  it('R2DB-3: reads MERGE INTO as an INSERT, a DELETE and an UPDATE of the columns it sets', () => {
    expect(
      bodyWrites(`merge into public.jobs j using src s on j.id = s.id
        when matched and s.done then update set state = 'succeeded', lease_token = null
        when matched then delete
        when not matched then insert (id) values (s.id);`),
    ).toEqual([
      { table: 'jobs', op: 'INSERT' },
      { table: 'jobs', op: 'DELETE' },
      { table: 'jobs', op: 'UPDATE', column: 'state' },
      { table: 'jobs', op: 'UPDATE', column: 'lease_token' },
    ])
  })

  it('R2DB-3: ignores writes named in comments and string literals', () => {
    expect(
      bodyWrites(`-- we never delete from public.people
        /* nor insert into public.jobs /* nested */ here */
        raise exception 'update public.people set full_name = x';
        perform pg_catalog.format(E'delete from public.jobs \\' it', $q$insert into public.jobs$q$);
        select $1;`),
    ).toEqual([])
  })

  it('CONTRACT-1: names a function whose body writes a table its writes leave out, unless every caller holds that write', () => {
    const entries: Record<string, Coverage> = {
      'rename_person(uuid, text)': { events: ['person.updated'], writes: ['people.full_name:UPDATE'] },
      'set_x(text)': { events: ['flag.changed'], writes: ['feature_flags.enabled:UPDATE'] },
      'end_all()': { exempt: 'a check', writes: [] },
    }
    const body = [
      {
        key: 'rename_person(uuid, text)',
        definer: true,
        trigger: false,
        executors: ['hearth_app'],
        source:
          'update public.people set full_name = n; delete from public.jobs; insert into public.feature_flags (key) values (k);',
      },
      // Its audit row is covered by its one caller's own grant.
      {
        key: 'set_x(text)',
        definer: true,
        trigger: false,
        executors: ['hearth_app'],
        source: 'update public.feature_flags set enabled = e; insert into public.audit_events (action) values (a);',
      },
      // A trigger's caller is whoever writes its table, so only its writes count.
      {
        key: 'end_all()',
        definer: false,
        trigger: true,
        executors: [],
        source: 'insert into public.audit_events values (1);',
      },
    ]
    expect(bodyProblems(entries, body, grants, {})).toEqual([
      "public.rename_person(uuid, text) runs delete from public.jobs, but its entry in apps/server/src/outbox/coverage.ts doesn't list that write: add 'jobs:DELETE' to its writes",
      "public.rename_person(uuid, text) runs insert into public.feature_flags, but its entry in apps/server/src/outbox/coverage.ts doesn't list that write: add 'feature_flags:INSERT' to its writes",
      "public.end_all() runs insert into public.audit_events, but its entry in apps/server/src/outbox/coverage.ts doesn't list that write: add 'audit_events:INSERT' to its writes",
    ])
    // A caller without the grant doesn't excuse it.
    expect(
      bodyProblems(
        entries,
        body.slice(1, 2).map(fn => ({ ...fn, executors: ['hearth_app', 'hearth_queue'] })),
        grants,
        {},
      ),
    ).toEqual([expect.stringContaining('public.set_x(text) runs insert into public.audit_events')])
  })

  it('R2DB-3: compares an UPDATE column by column, in the caller-grant excuse too', () => {
    const entries: Record<string, Coverage> = {
      'finish(uuid)': { exempt: 'a check', writes: ['jobs.state:UPDATE'] },
      'rename(uuid)': { events: ['person.updated'], writes: [] },
    }
    const fns = [
      {
        key: 'finish(uuid)',
        definer: true,
        trigger: false,
        executors: ['hearth_queue'],
        source: 'update public.jobs set state = 1, lease_token = null where id = $1;',
      },
      // hearth_app may update people.full_name, but not people.title.
      {
        key: 'rename(uuid)',
        definer: true,
        trigger: false,
        executors: ['hearth_app'],
        source: 'update public.people set full_name = n, title = t;',
      },
    ]
    expect(bodyProblems(entries, fns, grants, {})).toEqual([
      "public.finish(uuid) runs update public.jobs set lease_token, but its entry in apps/server/src/outbox/coverage.ts doesn't list that write: add 'jobs.lease_token:UPDATE' to its writes",
      "public.rename(uuid) runs update public.people set title, but its entry in apps/server/src/outbox/coverage.ts doesn't list that write: add 'people.title:UPDATE' to its writes",
    ])
    // An upsert's update counts too: the floor's last_tx is written by the DO UPDATE.
    expect(
      bodyProblems(
        { 'floor(uuid)': { exempt: 'a check', writes: ['outbox_floors:INSERT', 'outbox_floors.last_id:UPDATE'] } },
        [
          {
            key: 'floor(uuid)',
            definer: true,
            trigger: false,
            executors: ['hearth_queue'],
            source:
              'insert into public.outbox_floors (org_id) values (o) on conflict (org_id) do update set last_id = 1, last_tx = 2;',
          },
        ],
        grants,
        {},
      ),
    ).toEqual([expect.stringContaining("add 'outbox_floors.last_tx:UPDATE' to its writes")])
  })

  it('R2DB-3: refuses a body it can’t read: BEGIN ATOMIC, and EXECUTE outside DYNAMIC_DDL', () => {
    const entries: Record<string, Coverage> = {
      'atomic()': { exempt: 'a check', writes: [] },
      'dynamic()': { exempt: 'a check', writes: [] },
      'ddl()': { exempt: 'a check', writes: [] },
      'quiet()': { exempt: 'a check', writes: [] },
    }
    const fns = [
      { key: 'atomic()', definer: true, trigger: false, executors: [], source: '', atomic: true },
      {
        key: 'dynamic()',
        definer: true,
        trigger: false,
        executors: [],
        source: "begin execute pg_catalog.format('delete from public.%I', t); end",
      },
      { key: 'ddl()', definer: true, trigger: false, executors: [], source: "begin execute 'create table x ()'; end" },
      // The word only in a comment or a message is no EXECUTE.
      {
        key: 'quiet()',
        definer: true,
        trigger: false,
        executors: [],
        source: "begin -- never execute anything\n raise exception 'cannot execute this'; end",
      },
    ]
    expect(bodyProblems(entries, fns, grants, { 'ddl()': 'creates a table' })).toEqual([
      "public.atomic() is written with BEGIN ATOMIC, whose writes check-catalogues can't read: write its body as a quoted string (as $$ ... $$)",
      "public.dynamic() runs dynamic SQL (EXECUTE), whose writes check-catalogues can't read: write them as plain statements, or, if it only changes the schema, add it to DYNAMIC_DDL in apps/server/scripts/catalogues.ts with why",
    ])
    expect(bodyProblems(entries, fns.slice(2), grants, { 'ddl()': 'x', 'gone()': 'y' })).toEqual([
      'DYNAMIC_DDL in apps/server/scripts/catalogues.ts lists gone(), which no reachable function is: remove it',
    ])
  })
})

describe('C0.6 check-catalogues: the catalogues equal the database', () => {
  it('compares the event names both ways', () => {
    expect(eventProblems(['a.done', 'b.done'], ['b.done', 'a.done'])).toEqual([])
    expect(eventProblems(['a.done', 'b.done'], ['b.done', 'c.done'])).toEqual([
      'a.done is in packages/shared EVENTS but not in outbox_events_type: a migration adds it',
      'c.done is in outbox_events_type but not in packages/shared EVENTS: add it to the catalogue',
    ])
  })

  it('compares the flag registry with feature_flag_defaults() both ways, and keeps every AI flag off and locked', () => {
    const defaults = Object.entries(FLAGS).map(([key, spec]) => ({ key, enabled: spec.default, locked: spec.locked }))
    expect(flagProblems(FLAGS, defaults)).toEqual([])
    const changed = defaults.map(row => (row.key === 'core.system' ? { ...row, locked: false } : row))
    expect(flagProblems(FLAGS, changed)).toEqual([
      'core.system: FLAGS says default true, locked true; feature_flag_defaults() says true, false',
    ])
    expect(flagProblems(FLAGS, [...defaults, { key: 'ai.extra', enabled: true, locked: false }])).toEqual([
      'ai.extra is in feature_flag_defaults() but not in packages/shared FLAGS: register it',
      'ai.extra is an AI flag, so feature_flag_defaults() must keep it off and locked until A0',
    ])
    expect(
      flagProblems(
        FLAGS,
        defaults.filter(row => row.key !== 'ai.ask'),
      ),
    ).toEqual(['ai.ask is in packages/shared FLAGS but not in feature_flag_defaults(): a migration adds it'])
    const unlocked = { ...FLAGS, 'ai.ask': { ...FLAGS['ai.ask'], locked: false } }
    expect(flagProblems(unlocked, defaults)).toContain(
      'ai.ask is an AI flag, so FLAGS must keep it off and locked until A0',
    )
  })

  it('compares the job roles both ways', () => {
    expect(roleProblems(['hearth_queue'], ['hearth_queue'])).toEqual([])
    expect(roleProblems(['hearth_queue', 'hearth_job_x'], ['hearth_queue', 'hearth_job_y'])).toEqual([
      "hearth_job_x is in apps/server/src/db/roles.ts JOB_ROLES, but hearth_worker can't SET it in the database",
      "hearth_worker can SET hearth_job_y, which apps/server/src/db/roles.ts JOB_ROLES doesn't list",
    ])
  })
})

describe('C0.7 T16 item 3 check-catalogues: each consumer is bound to its role in outbox_checkpoints_own_row()', () => {
  // 0008's body, as pg_proc.prosrc holds it.
  const BODY = `
declare
  owner_role oid := (select r.oid from pg_catalog.pg_roles r where r.rolname = new.role_name);
  bound text := case new.consumer
                  when 'offboarding' then 'hearth_job_offboarding'
                  when 'revocation' then 'hearth_job_revocation'
                end;
begin
  if owner_role is null or not pg_catalog.pg_has_role(current_user, owner_role, 'USAGE')
     or (bound is not null and new.role_name <> bound) then
    raise exception 'Only the role that runs a consumer may move its checkpoint.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end
`
  const consumers = [
    { name: 'offboarding', role: 'hearth_job_offboarding' },
    { name: 'revocation', role: 'hearth_job_revocation' },
  ]
  const probes = consumers.map(c => ({ consumer: c.name, otherRefused: true, ownAccepted: true }))

  it('reads the binding from the body, and passes when it equals the consumers both ways and the trigger enforces it', () => {
    const bound = checkpointBindings(BODY)
    expect(bound).toEqual(
      new Map([
        ['offboarding', 'hearth_job_offboarding'],
        ['revocation', 'hearth_job_revocation'],
      ]),
    )
    expect(bindingProblems(consumers, bound, probes)).toEqual([])
  })

  it('names a consumer that isn’t bound, one bound to another role, and a bound name no consumer has', () => {
    const extra = [...consumers, { name: 'indexer', role: 'hearth_job_indexer' }]
    expect(
      bindingProblems(extra, checkpointBindings(BODY), [
        ...probes,
        { consumer: 'indexer', otherRefused: true, ownAccepted: true },
      ]),
    ).toEqual([
      "the worker's consumer indexer isn't bound in outbox_checkpoints_own_row(): the migration that adds it binds it to hearth_job_indexer",
    ])
    const moved = BODY.replace("then 'hearth_job_revocation'", "then 'hearth_job_offboarding'")
    expect(bindingProblems(consumers, checkpointBindings(moved), probes)).toEqual([
      "the worker's consumer revocation runs as hearth_job_revocation, but outbox_checkpoints_own_row() binds it to hearth_job_offboarding",
    ])
    expect(bindingProblems(consumers.slice(0, 1), checkpointBindings(BODY), probes.slice(0, 1))).toEqual([
      'outbox_checkpoints_own_row() binds revocation to hearth_job_revocation, but no consumer the worker runs (apps/server/src/worker/index.ts productionRegistries) is called revocation',
    ])
  })

  it('fails closed on a binding it can’t read: none, an ELSE, a comment, a name twice, or a second CASE', () => {
    expect(checkpointBindings('begin return new; end')).toBeUndefined()
    expect(
      checkpointBindings(
        BODY.replace('                end;', "                  else 'hearth_queue'\n                end;"),
      ),
    ).toBeUndefined()
    expect(
      checkpointBindings(BODY.replace("when 'revocation'", "-- old\n                  when 'revocation'")),
    ).toBeUndefined()
    expect(checkpointBindings(BODY.replace("when 'revocation'", "when 'offboarding'"))).toBeUndefined()
    expect(checkpointBindings(`${BODY}\n${BODY}`)).toBeUndefined()
    expect(bindingProblems(consumers, undefined, probes)).toEqual([
      "check-catalogues can't read outbox_checkpoints_own_row()'s binding: keep it one CASE on new.consumer holding only when '<consumer>' then '<role>' pairs",
    ])
  })

  it('names a probe the trigger answered against the binding, and a consumer it didn’t try', () => {
    expect(
      bindingProblems(consumers, checkpointBindings(BODY), [
        { consumer: 'offboarding', otherRefused: false, ownAccepted: true },
        { consumer: 'revocation', otherRefused: true, ownAccepted: false },
      ]),
    ).toEqual([
      'a checkpoint of offboarding naming a role other than hearth_job_offboarding was accepted',
      'a checkpoint of revocation naming hearth_job_revocation was refused',
    ])
    expect(bindingProblems(consumers, checkpointBindings(BODY), probes.slice(1))).toEqual([
      "check-catalogues didn't try a checkpoint of offboarding",
    ])
  })
})

describe('RGS-19 C0.9 T22 item 18 check 6: the registers’ starting rows equal the code that judges them', () => {
  const code: RegisterCode = {
    purposes: PURPOSES,
    pinned: PINNED_PURPOSES,
    activeFromStart: ACTIVE_FROM_START,
    providers: PROVIDERS,
    aiProviders: AI_PROVIDERS,
  }
  // processing_register_defaults() and transfer_register_defaults() as migration 0009 writes them.
  const purposeDefaults: PurposeDefault[] = Object.entries(PURPOSES).map(([purpose, spec]) => ({
    purpose,
    ai: spec.ai,
    pinned: (PINNED_PURPOSES as readonly string[]).includes(purpose),
    needs_switch: spec.needsSwitch,
    status: (ACTIVE_FROM_START as readonly string[]).includes(purpose) ? 'active' : 'planned',
  }))
  const providerDefaults: ProviderDefault[] = PROVIDERS.map(provider => ({
    provider,
    ai: (AI_PROVIDERS as readonly string[]).includes(provider),
  }))
  const ORG = 'a0000000-0000-4000-8000-000000000001'
  const org: OrgRegisters = { org: ORG, purposes: purposeDefaults, providers: providerDefaults, drifted: [] }
  const changing = (purpose: string, change: Partial<PurposeDefault>) =>
    purposeDefaults.map(row => (row.purpose === purpose ? { ...row, ...change } : row))

  it('passes when the defaults functions and every org’s rows equal PURPOSES, PINNED_PURPOSES, ACTIVE_FROM_START, PROVIDERS and AI_PROVIDERS', () => {
    expect(registerProblems(code, purposeDefaults, providerDefaults, [org])).toEqual([])
    // A database with no org yet has nothing more to compare.
    expect(registerProblems(code, purposeDefaults, providerDefaults, [])).toEqual([])
  })

  it('C0.9 PD-06 PD-87: compares the starting status with ACTIVE_FROM_START, so security_audit, backups and request_handling start active though not pinned', () => {
    // "Active exactly when pinned" is not the rule: Hearth already processes for each.
    const pinnedOnly = purposeDefaults.map(row => ({ ...row, status: row.pinned ? 'active' : 'planned' }))
    expect(registerProblems(code, pinnedOnly, providerDefaults, [])).toEqual([
      'security_audit: packages/shared says ai false, pinned false, needs_switch false, status active (PURPOSES, PINNED_PURPOSES, ACTIVE_FROM_START); processing_register_defaults() says ai false, pinned false, needs_switch false, status planned',
      'backups: packages/shared says ai false, pinned false, needs_switch false, status active (PURPOSES, PINNED_PURPOSES, ACTIVE_FROM_START); processing_register_defaults() says ai false, pinned false, needs_switch false, status planned',
      'request_handling: packages/shared says ai false, pinned false, needs_switch false, status active (PURPOSES, PINNED_PURPOSES, ACTIVE_FROM_START); processing_register_defaults() says ai false, pinned false, needs_switch false, status planned',
    ])
    expect(registerProblems(code, changing('presence_receipts', { status: 'active' }), providerDefaults, [])).toEqual([
      'presence_receipts: packages/shared says ai false, pinned false, needs_switch false, status planned (PURPOSES, PINNED_PURPOSES, ACTIVE_FROM_START); processing_register_defaults() says ai false, pinned false, needs_switch false, status active',
    ])
  })

  it('C0.9 PD-04 PD-07 PD-11: names a purpose whose ai, pinned or needs_switch differs from code', () => {
    expect(registerProblems(code, changing('org_brain', { ai: false }), providerDefaults, [])).toEqual([
      'org_brain: packages/shared says ai true, pinned false, needs_switch true, status planned (PURPOSES, PINNED_PURPOSES, ACTIVE_FROM_START); processing_register_defaults() says ai false, pinned false, needs_switch true, status planned',
    ])
    expect(registerProblems(code, changing('security_audit', { pinned: true }), providerDefaults, [])).toHaveLength(1)
    // The transcription test set needs no switch: withdrawal there is by deletion.
    expect(
      registerProblems(code, changing('transcription_test_set', { needs_switch: true }), providerDefaults, []),
    ).toHaveLength(1)
    // And the code side: a purpose PINNED_PURPOSES gains is a migration's change too.
    expect(
      registerProblems({ ...code, pinned: [...PINNED_PURPOSES, 'backups'] }, purposeDefaults, providerDefaults, []),
    ).toEqual([
      'backups: packages/shared says ai false, pinned true, needs_switch false, status active (PURPOSES, PINNED_PURPOSES, ACTIVE_FROM_START); processing_register_defaults() says ai false, pinned false, needs_switch false, status active',
    ])
  })

  it('compares the purposes and providers both ways', () => {
    const fewer = purposeDefaults.filter(row => row.purpose !== 'backups')
    const extra = [
      ...purposeDefaults,
      { purpose: 'extra', ai: false, pinned: false, needs_switch: false, status: 'planned' },
    ]
    expect(registerProblems(code, fewer, providerDefaults, [])).toEqual([
      'backups is in packages/shared PURPOSES but not in processing_register_defaults(): a migration adds it, with rows for the orgs already there',
    ])
    expect(registerProblems(code, extra, providerDefaults, [])).toEqual([
      'extra is in processing_register_defaults() but not in packages/shared PURPOSES: add it',
    ])
    expect(
      registerProblems(code, purposeDefaults, [...providerDefaults.slice(1), { provider: 'carrier', ai: false }], []),
    ).toEqual([
      'aws is in packages/shared PROVIDERS but not in transfer_register_defaults(): a migration adds it, with rows for the orgs already there',
      'carrier is in transfer_register_defaults() but not in packages/shared PROVIDERS: add it',
    ])
    const bedrock = providerDefaults.map(row => (row.provider === 'bedrock' ? { ...row, ai: false } : row))
    expect(registerProblems(code, purposeDefaults, bedrock, [])).toEqual([
      'bedrock: packages/shared says ai true (AI_PROVIDERS); transfer_register_defaults() says ai false',
    ])
  })

  it('C0.9 PD-03: names an org missing a row, holding one the defaults don’t list, or whose version 1 differs', () => {
    const missing: OrgRegisters = {
      ...org,
      purposes: purposeDefaults.filter(row => row.purpose !== 'accounts'),
      providers: providerDefaults.filter(row => row.provider !== 'twilio'),
    }
    expect(registerProblems(code, purposeDefaults, providerDefaults, [missing])).toEqual([
      `org ${ORG} has no version 1 of accounts in processing_register`,
      `org ${ORG} has no twilio entry in transfer_register`,
    ])
    const odd: OrgRegisters = {
      ...org,
      purposes: [
        ...changing('backups', { status: 'planned' }),
        { ...(purposeDefaults[0] as PurposeDefault), purpose: 'old' },
      ],
      providers: [
        ...providerDefaults.map(row => (row.provider === 'openai' ? { ...row, ai: false } : row)),
        { provider: 'old', ai: false },
      ],
    }
    expect(registerProblems(code, purposeDefaults, providerDefaults, [odd])).toEqual([
      `org ${ORG}'s version 1 of backups says ai false, pinned false, needs_switch false, status planned; processing_register_defaults() says ai false, pinned false, needs_switch false, status active`,
      `org ${ORG} has old in processing_register, which processing_register_defaults() doesn't list`,
      `org ${ORG}'s openai entry says ai false; transfer_register_defaults() says ai true`,
      `org ${ORG} has old in transfer_register, which transfer_register_defaults() doesn't list`,
    ])
  })

  it('C0.9 PD-04: names a later version whose fixed columns aren’t its version 1’s', () => {
    expect(
      registerProblems(code, purposeDefaults, providerDefaults, [
        { ...org, drifted: [{ purpose: 'security_audit', version: 2 }] },
      ]),
    ).toEqual([
      `org ${ORG}'s version 2 of security_audit has other fixed columns (ai, pinned, needs_switch) than its version 1: every version copies them`,
    ])
  })
})

describe('C0.9 PD-41 T22 item 18 check 6: NOTICE_TRANSFER_FACTS equals what notice_facts() states', () => {
  // notice_facts() as 0010 writes it: the seven stated keys, each from the snapshot's own.
  const stated = (keys: readonly string[], probe: Record<string, string>) =>
    Object.fromEntries(keys.map(key => [key, probe[key] ?? null]))
  const probe = noticeFactProbe([...NOTICE_TRANSFER_FACTS, 'review_on', 'safeguard', 'countries_confirmed'])

  it('passes when notice_facts() states exactly NOTICE_TRANSFER_FACTS, each from its own key', () => {
    expect(probe.services).toBe('v:services')
    expect(noticeFactProblems(NOTICE_TRANSFER_FACTS, stated(NOTICE_TRANSFER_FACTS, probe))).toEqual([])
  })

  it('names a fact either side lacks, one read from another key, and no answer', () => {
    expect(
      noticeFactProblems(NOTICE_TRANSFER_FACTS, stated([...NOTICE_TRANSFER_FACTS.slice(1), 'review_on'], probe)),
    ).toEqual([
      "services is in packages/shared NOTICE_TRANSFER_FACTS but notice_facts() doesn't state it",
      "notice_facts() states review_on, which packages/shared NOTICE_TRANSFER_FACTS doesn't list",
    ])
    expect(
      noticeFactProblems(NOTICE_TRANSFER_FACTS, { ...stated(NOTICE_TRANSFER_FACTS, probe), training: 'v:safeguard' }),
    ).toEqual(['notice_facts() states training from another fact of the snapshot'])
    expect(noticeFactProblems(NOTICE_TRANSFER_FACTS, undefined)).toEqual(['notice_facts() returned no object'])
    expect(noticeFactProblems(NOTICE_TRANSFER_FACTS, ['services'])).toEqual(['notice_facts() returned no object'])
  })
})

// --- C0.10: checks 7 and 8 on planted input (TECH-SPEC T23 item 19) -----------------------------

const classes: Readonly<Record<string, RetentionClass>> = RETENTION_CLASSES
// retention_class_defaults() as migration 0013 writes it: the registry's own rows.
const classRows: ClassDefault[] = retentionClassDefaults()
// Every table of public as 0001 to 0014 make them, each its own root.
const TABLES = Object.values(classes).flatMap(spec => spec.tables)
const relations: Relation[] = TABLES.map(name => ({ name, root: name }))
const changingClass = (key: string, change: Partial<ClassDefault>) =>
  classRows.map(row => (row.key === key ? { ...row, ...change } : row))

// The guard's triggers as 0013 and 0014 create them.
const guardTrigger = (table: string): TriggerRow => ({
  relation: table,
  root: table,
  name: 'lifecycle_guard',
  fn: 'lifecycle_guard',
  type: 11,
  enabled: 'O',
  args: [table],
  conditional: false,
  columns: 0,
})
const truncateTrigger = (table: string): TriggerRow => ({
  relation: table,
  root: table,
  name: 'lifecycle_no_truncate',
  fn: 'lifecycle_no_truncate',
  type: 34,
  enabled: 'O',
  args: [],
  conditional: false,
  columns: 0,
})
const TRIGGERS: TriggerRow[] = [
  ...GUARDED_TABLES.flatMap(table => [guardTrigger(table), truncateTrigger(table)]),
  truncateTrigger('deletion_log'),
  { ...truncateTrigger('deletion_log'), name: 'deletion_log_kept', fn: 'deletion_log_kept', type: 31 },
  { ...truncateTrigger('legal_holds'), name: 'legal_holds_kept', fn: 'legal_holds_kept', type: 19 },
]
const APPLY = holdsTables(classes).apply

describe('LCV-03 C0.10 T23 items 3 and 4 check 7: the retention registry against the database', () => {
  it('7a LH-04 R2DB-01: passes when retention_class_defaults() lists exactly the registry’s Postgres and S3 classes, and names each difference both ways', () => {
    expect(retentionDefaultProblems(classRows, classRows)).toEqual([])
    expect(retentionDefaultProblems(classRows, changingClass('cases', { days: 365, tables: ['cases'] }))).toEqual([
      'cases: packages/shared RETENTION_CLASSES says days 731, tables [case_steps, cases]; retention_class_defaults() says days 365, tables [cases]',
    ])
    // Tables compare as sets: their order is no one's.
    expect(retentionDefaultProblems(classRows, changingClass('cases', { tables: ['case_steps', 'cases'] }))).toEqual([])
    // objects too (R2DB-01): a class with S3 objects that the function says has none, and the reverse.
    expect(retentionDefaultProblems(classRows, changingClass('drive_trash', { objects: false }))).toEqual([
      'drive_trash: packages/shared RETENTION_CLASSES says objects true; retention_class_defaults() says objects false',
    ])
    expect(retentionDefaultProblems(classRows, changingClass('cases', { objects: true }))).toEqual([
      'cases: packages/shared RETENTION_CLASSES says objects false; retention_class_defaults() says objects true',
    ])
    expect(
      retentionDefaultProblems(classRows, [
        ...classRows.filter(row => row.key !== 'legal_holds'),
        { ...(classRows[0] as ClassDefault), key: 'extra' },
      ]),
    ).toEqual([
      'legal_holds is a Postgres or S3 class in packages/shared RETENTION_CLASSES but not in retention_class_defaults(): a migration replaces the function with it',
      'extra is in retention_class_defaults() but not a Postgres or S3 class in packages/shared RETENTION_CLASSES: add it there',
    ])
    expect(retentionDefaultProblems(classRows, [...classRows, classRows[0] as ClassDefault])).toEqual([
      'retention_class_defaults() lists org_settings twice',
    ])
    // Valkey's, the logs' and the backups' classes are code's and infra/'s alone (LH-07).
    expect(classRows.map(row => row.key)).not.toContain('valkey_sign_in')
  })

  it('7b LH-04: every table of public is in exactly one class, and every listed table exists', () => {
    expect(classTableProblems(classes, TABLES)).toEqual([])
    expect(classTableProblems(classes, [...TABLES, 'messages'])).toEqual([
      "public.messages is in no retention class: add it to one class's tables in packages/shared RETENTION_CLASSES, and to retention_class_defaults()",
    ])
    const twice = { ...classes, other: { ...classes.audit_log, tables: ['audit_events'] } } as Record<
      string,
      RetentionClass
    >
    expect(classTableProblems(twice, TABLES)).toEqual([
      'public.audit_events is in more than one retention class (audit_log, other): keep it in one',
    ])
    expect(
      classTableProblems(
        classes,
        TABLES.filter(table => table !== 'legal_holds'),
      ),
    ).toEqual(["the retention class legal_holds lists legal_holds, which isn't a table of public"])
  })

  it('7e LH-06: every AI class has a finite period through its chain, and none is kept', () => {
    expect(aiClassProblems(classRows)).toEqual([])
    expect(aiClassProblems(changingClass('ai_notes', { period_kind: 'while', days: null, anchor: null }))).toEqual([
      'the AI retention class ai_notes has no finite period: give it a day count, or a follows chain that ends at one or at its source (LH-06)',
    ])
    // A follows chain ends at a finite class or at its source, never in a loop or at a while class.
    expect(
      aiClassProblems(changingClass('transcripts', { period_kind: 'follows', days: null, follows: 'machine_output' })),
    ).toEqual([
      expect.stringContaining('transcripts has no finite period'),
      expect.stringContaining('machine_output has no finite period'),
    ])
    expect(aiClassProblems(changingClass('machine_output', { follows: 'roster' }))).toEqual([
      expect.stringContaining('machine_output has no finite period'),
    ])
    expect(aiClassProblems(changingClass('personal_memory', { days: null }))).toEqual([
      expect.stringContaining('personal_memory has no finite period'),
    ])
    expect(aiClassProblems(changingClass('ai_feedback', { holds: 'kept' }))).toEqual([
      'the AI retention class ai_feedback is kept: every AI class is deleted (LH-06)',
    ])
  })

  it('7f LH-09 LH-15 LH-18 LH-19: the hold and deletion vocabularies, the refused-copy figures and each days class’s period equal the database’s', () => {
    const periods = Object.fromEntries(
      classRows.flatMap(row => (row.period_kind === 'days' && row.days !== null ? [[row.key, row.days]] : [])),
    )
    const code: Vocabularies = {
      holdTargetKinds: HOLD_TARGET_KINDS,
      deletionCauses: DELETION_CAUSES,
      holdKinds: HOLD_KINDS,
      refusedCopyHold: REFUSED_COPY_HOLD,
      periods,
    }
    expect(periods.cases).toBe(731)
    expect(vocabularyProblems(code, { ...code })).toEqual([])
    expect(
      vocabularyProblems(code, {
        ...code,
        holdTargetKinds: [...HOLD_TARGET_KINDS.filter(kind => kind !== 'room'), 'meeting'],
        deletionCauses: [...DELETION_CAUSES, 'replay'],
        holdKinds: HOLD_KINDS.filter(kind => kind !== 'case'),
        refusedCopyHold: { days: 30, noticeMarginDays: 7 },
        periods: { ...periods, cases: 365, audit_log: null },
      }),
    ).toEqual([
      'room is in packages/shared HOLD_TARGET_KINDS but not in legal_holds_target_kind',
      'meeting is in legal_holds_target_kind but not in packages/shared HOLD_TARGET_KINDS',
      'replay is in deletion_causes() but not in packages/shared DELETION_CAUSES',
      'case is in packages/shared HOLD_KINDS but not in lifecycle_kinds()',
      'packages/shared REFUSED_COPY_HOLD says 30 days and a 14-day margin; refused_copy_hold() says 30 and 7',
      'retention_period_days() gave no period for audit_log, whose default is 731 days',
      'retention_period_days() answers 365 days for cases; its default is 731',
    ])
    expect(vocabularyProblems(code, { ...code, refusedCopyHold: undefined })).toEqual([
      'refused_copy_hold() answered no row',
    ])
  })
})

describe('LCV-04 C0.10 T23 items 3, 8 and 12 check 7: fixed ages, the guard and the resolvers', () => {
  it('7c DB-10: reads interval literals with comments stripped and strings kept, so an interval in a comment never counts', () => {
    const body = `
      -- interval '7 days' was the old age
      /* and interval '9 days' /* nested */ before that */
      delete from public.jobs j where (j.state = 'dead' and j.finished_at < now() - interval '30 days')
        or j.finished_at < now() - INTERVAL  '14 days' or j.finished_at < now() - interval '14 days';
      raise exception 'never -- a comment inside a string';`
    expect(dayIntervals(body)).toEqual(['14 days', '30 days'])
    expect(stripComments(body)).toContain("'never -- a comment inside a string'")
    expect(stripComments(body)).not.toContain('7 days')
    expect(stringLiterals("execute format('create table %I', n); -- 'drop'\n select $q$x$q$, E'it''s'")).toEqual([
      'create table %I',
      'x',
      "it''s",
    ])
    const bodies = new Map([
      ['purge_outbox', ["where e.at < pg_catalog.now() - interval '14 days'"]],
      ['purge_jobs', [body]],
      ['purge_schedule_runs', ["interval '90 days' -- interval '1 day'"]],
      ['deletion_log_kept', ["if old.at > pg_catalog.now() - interval '731 days' then"]],
    ])
    expect(fixedAgeProblems(classes, bodies)).toEqual([])
    // The age lives only in a comment: it doesn't count.
    expect(
      fixedAgeProblems(
        classes,
        new Map([...bodies, ['deletion_log_kept', ["-- interval '731 days'\n interval '365 days'"]]]),
      ),
    ).toEqual([
      "the retention class deletion_log says public.deletion_log_kept() fixes '731 days'; its body holds interval '365 days'",
    ])
    expect(fixedAgeProblems(classes, new Map([...bodies, ['purge_outbox', []]]))).toEqual([
      'the retention class outbox says public.purge_outbox() fixes its age, but there is no such function',
    ])
  })

  it('7d LH-11 LH-12 C010-SPEC-09: passes the guard as 0013 and 0014 put it, and names a guard missing, disabled, enabled ALWAYS, misnamed, mis-typed or naming another table, and one on a table GUARDED_TABLES doesn’t list', () => {
    expect(guardProblems(GUARDED_TABLES, relations, TRIGGERS, APPLY)).toEqual([])
    const changing = (table: string, fn: string, change: Partial<TriggerRow>) =>
      TRIGGERS.map(t => (t.relation === table && t.fn === fn ? { ...t, ...change } : t))
    expect(
      guardProblems(GUARDED_TABLES, relations, changing('cases', 'lifecycle_guard', { enabled: 'A' }), APPLY),
    ).toEqual([
      "public.cases's lifecycle_guard is enabled ALWAYS; it must be enabled the default way (O), so it fires for every writer and not in a replica's apply (LH-11)",
    ])
    expect(
      guardProblems(GUARDED_TABLES, relations, changing('legal_holds', 'lifecycle_guard', { enabled: 'D' }), APPLY),
    ).toEqual([expect.stringContaining("public.legal_holds's lifecycle_guard is enabled nowhere (disabled)")])
    expect(
      guardProblems(GUARDED_TABLES, relations, changing('case_steps', 'lifecycle_guard', { args: ['cases'] }), APPLY),
    ).toEqual(["public.case_steps's lifecycle_guard names 'cases'; it must name its own table, 'case_steps'"])
    expect(guardProblems(GUARDED_TABLES, relations, changing('cases', 'lifecycle_guard', { type: 9 }), APPLY)).toEqual([
      "public.cases's lifecycle_guard fires AFTER DELETE FOR EACH ROW; it must fire BEFORE DELETE FOR EACH ROW",
    ])
    expect(
      guardProblems(GUARDED_TABLES, relations, changing('cases', 'lifecycle_guard', { name: 'guard' }), APPLY),
    ).toEqual(["public.cases's trigger executing lifecycle_guard() is named guard: name it lifecycle_guard"])
    expect(
      guardProblems(
        GUARDED_TABLES,
        relations,
        TRIGGERS.filter(t => !(t.relation === 'deletion_log' && t.fn === 'lifecycle_no_truncate')),
        APPLY,
      ),
    ).toEqual([
      'public.deletion_log has no trigger executing lifecycle_no_truncate(): the migration that adds it creates "lifecycle_no_truncate" BEFORE TRUNCATE FOR EACH STATEMENT',
    ])
    // A guard on a table GUARDED_TABLES doesn't list, and a trigger named as a guard that runs
    // another function.
    expect(
      guardProblems(
        GUARDED_TABLES,
        relations,
        [...TRIGGERS, guardTrigger('devices'), { ...truncateTrigger('sessions'), fn: 'keep_history' }],
        APPLY,
      ),
    ).toEqual([
      "public.devices carries lifecycle_guard(), but GUARDED_TABLES in apps/server/src/lifecycle/deletes.ts doesn't list it: add the table with its first delete path, or drop the trigger",
      "public.sessions's trigger lifecycle_no_truncate executes keep_history(), not lifecycle_no_truncate(): a guard's trigger is named as its function",
    ])
    // A guarded table must be a table whose class's holds apply.
    expect(
      guardProblems(
        [...GUARDED_TABLES, 'orgs'],
        relations,
        [...TRIGGERS, guardTrigger('orgs'), truncateTrigger('orgs')],
        APPLY,
      ),
    ).toEqual([
      "GUARDED_TABLES lists orgs, whose retention class's holds don't apply: the guard belongs only on tables the deletion code deletes held-checked",
    ])
  })

  it('7d LH-11 GUARD-04 TESTS-01: names a guard, a partition’s clone or a history trigger with a WHEN condition or an UPDATE OF list, which lets the rows or updates it leaves out past it', () => {
    const changing = (table: string, fn: string, change: Partial<TriggerRow>) =>
      TRIGGERS.map(t => (t.relation === table && t.fn === fn ? { ...t, ...change } : t))
    // create trigger lifecycle_guard ... for each row when (false), or when (a setting is off).
    expect(
      guardProblems(GUARDED_TABLES, relations, changing('cases', 'lifecycle_guard', { conditional: true }), APPLY),
    ).toEqual([
      "public.cases's lifecycle_guard fires only WHEN a condition holds; a guard has no WHEN, so it fires for every row (LH-11)",
    ])
    expect(
      guardProblems(
        GUARDED_TABLES,
        relations,
        changing('deletion_log', 'lifecycle_no_truncate', { conditional: true }),
        APPLY,
      ),
    ).toEqual([
      "public.deletion_log's lifecycle_no_truncate fires only WHEN a condition holds; a guard has no WHEN, so it fires for every row (LH-11)",
    ])
    // before update of s3_done_at or delete, and before update of released_at: the same tgtype.
    expect(
      guardProblems(GUARDED_TABLES, relations, changing('deletion_log', 'deletion_log_kept', { columns: 1 }), APPLY),
    ).toEqual([
      "public.deletion_log's deletion_log_kept fires only on UPDATE OF one column; a guard has no column list, so it fires on every update, whatever it changes (LH-11)",
    ])
    expect(
      guardProblems(
        GUARDED_TABLES,
        relations,
        changing('legal_holds', 'legal_holds_kept', { columns: 2, conditional: true }),
        APPLY,
      ),
    ).toEqual([
      "public.legal_holds's legal_holds_kept fires only WHEN a condition holds; a guard has no WHEN, so it fires for every row (LH-11)",
      "public.legal_holds's legal_holds_kept fires only on UPDATE OF 2 columns; a guard has no column list, so it fires on every update, whatever it changes (LH-11)",
    ])
    // A partition's clone, and the TRUNCATE refusal a step adds to a partition, are held to it too.
    const parted: Relation[] = [...relations, { name: 'legal_holds_2026', root: 'legal_holds' }]
    const clone: TriggerRow = { ...guardTrigger('legal_holds'), relation: 'legal_holds_2026', root: 'legal_holds' }
    const partTruncate: TriggerRow = {
      ...truncateTrigger('legal_holds'),
      relation: 'legal_holds_2026',
      root: 'legal_holds',
    }
    expect(guardProblems(GUARDED_TABLES, parted, [...TRIGGERS, clone, partTruncate], APPLY)).toEqual([])
    expect(
      guardProblems(
        GUARDED_TABLES,
        parted,
        [...TRIGGERS, { ...clone, conditional: true }, { ...partTruncate, conditional: true }],
        APPLY,
      ),
    ).toEqual([
      "public.legal_holds_2026's lifecycle_guard fires only WHEN a condition holds; a guard has no WHEN, so it fires for every row (LH-11)",
      "public.legal_holds_2026's lifecycle_no_truncate fires only WHEN a condition holds; a guard has no WHEN, so it fires for every row (LH-11)",
    ])
  })

  it('7d C010-SPEC-09: every partition of a guarded table carries the guard naming its parent', () => {
    const parted: Relation[] = [...relations, { name: 'legal_holds_2026', root: 'legal_holds' }]
    const clone: TriggerRow = { ...guardTrigger('legal_holds'), relation: 'legal_holds_2026' }
    expect(guardProblems(GUARDED_TABLES, parted, [...TRIGGERS, clone], APPLY)).toEqual([])
    expect(guardProblems(GUARDED_TABLES, parted, TRIGGERS, APPLY)).toEqual([
      expect.stringContaining('public.legal_holds_2026 has no trigger executing lifecycle_guard()'),
    ])
    expect(
      guardProblems(GUARDED_TABLES, parted, [...TRIGGERS, { ...clone, args: ['legal_holds_2026'] }], APPLY),
    ).toEqual([
      "public.legal_holds_2026's lifecycle_guard names 'legal_holds_2026'; it must name its parent, 'legal_holds'",
    ])
  })

  it('7g LH-12 LH-18 LH-56: names a resolver that raised, and a holds-apply table with no anchors or more than one row', () => {
    expect(
      resolverProblems([
        { call: "lifecycle_persons_of(org, 'device', <random id>)" },
        { call: "lifecycle_row_anchors(org, 'cases', <a row with a random id>)", wantRows: 1, rows: 1 },
      ]),
    ).toEqual([])
    expect(
      resolverProblems([
        {
          call: "lifecycle_row_anchors(org, 'messages', <a row with a random id>)",
          wantRows: 1,
          error: '22023 (lifecycle_row_anchors() has no anchors for that table.)',
        },
        {
          call: "lifecycle_lock_target(org, 'channel', <random id>, 'share')",
          error: '22023 (Hearth can’t lock that kind of record yet.)',
        },
        { call: "lifecycle_row_anchors(org, 'devices', <a row with a random id>)", wantRows: 1, rows: 2 },
      ]),
    ).toEqual([
      "lifecycle_row_anchors(org, 'messages', <a row with a random id>) raised 22023 (lifecycle_row_anchors() has no anchors for that table.): the step that adds that kind or table replaces the resolver to know it",
      "lifecycle_lock_target(org, 'channel', <random id>, 'share') raised 22023 (Hearth can’t lock that kind of record yet.): the step that adds that kind or table replaces the resolver to know it",
      "lifecycle_row_anchors(org, 'devices', <a row with a random id>) returned 2 rows; the guard reads exactly 1",
    ])
  })
})

// A function's body as the latest migration that defines it writes it, which is what DYNAMIC_DDL
// pins for a DYNAMIC_DDL function (R2CODE-01).
function latestMigrationBody(name: string): string {
  const dir = new URL('../../../db/migrations/', import.meta.url)
  let body: string | undefined
  for (const file of readdirSync(dir).sort()) {
    const sql = readFileSync(new URL(file, dir), 'utf8')
    const defines = new RegExp(String.raw`\bcreate\s+(?:or\s+replace\s+)?function\s+public\.${name}\s*\(`, 'gi')
    for (const match of sql.matchAll(defines)) {
      const quote = /\bas\s+(\$[A-Za-z0-9_]*\$)/.exec(sql.slice(match.index))
      if (quote === null) continue
      const open = match.index + quote.index + quote[0].length
      body = sql.slice(open, sql.indexOf(quote[1] ?? '$$', open))
    }
  }
  if (body === undefined) throw new Error(`no migration defines public.${name}()`)
  return body
}

// lifecycle_no_truncate()'s body as 0013 writes it: TRUNCATE only in its message.
const NO_TRUNCATE = `begin
  raise exception 'Rows here are deleted only through Hearth''s deletion code, never TRUNCATE.' using errcode = 'HF010';
end`

describe('LCV-05 C0.10 T23 item 9 check 8: every delete path the database allows is decided', () => {
  // LH ids T23 never records, built so that scripts/guards/design-ids.test.ts (LCG-01) doesn't read
  // them as citations.
  const UNRECORDED = `LH-${99}`
  const OUTSIDE_T23 = `LH-${77}`
  // The delete paths as 0001 to 0014 build them.
  const fns: Fn[] = [
    {
      key: 'purge_outbox(integer)',
      definer: true,
      trigger: false,
      source: 'delete from public.outbox_events e where e.org_id = org;',
    },
    {
      key: 'purge_jobs(integer)',
      definer: true,
      trigger: false,
      source: 'delete from public.jobs j where j.org_id = org;',
    },
    {
      key: 'purge_schedule_runs(integer)',
      definer: true,
      trigger: false,
      source:
        'with gone as (delete from public.schedule_runs r using doomed d where r.id = d.id returning 1) select 1;',
    },
    {
      key: 'delete_case(uuid, text, boolean)',
      definer: true,
      trigger: false,
      source:
        'perform public.lifecycle_held(org, a, k, i); delete from public.cases x where x.id = c; delete from public.case_steps s where s.case_id = c;',
    },
    {
      key: 'create_data_access_partitions(integer)',
      definer: true,
      trigger: false,
      // As 0005 writes it, which DYNAMIC_DDL pins (R2CODE-01).
      source: latestMigrationBody('create_data_access_partitions'),
    },
    {
      key: 'lifecycle_guard()',
      definer: true,
      trigger: true,
      source: 'if exists (select 1 from public.deletion_log) then return old; end if;',
    },
    // 0014's two paths into the provenance registry (LH-41), each deleting items and their edges.
    {
      key: 'lifecycle_cascade(text, uuid, bigint, integer)',
      definer: true,
      trigger: false,
      source: `perform public.lifecycle_held(org, '{}', k, i);
        perform public.log_deletion('provenance', 'provenance_items', c::text, 'cascade', null, parent, null, null, false);
        delete from public.provenance_items p where p.id = c;
        update public.provenance_sources e set gone_at = pg_catalog.now() where e.source_id = i;
        delete from public.provenance_sources e where e.item = c;`,
    },
    {
      key: 'provenance_forget(text, uuid, text, bigint)',
      definer: true,
      trigger: false,
      source: `logged := public.log_deletion('provenance', 'provenance_items', r::text, cause, null, parent, null, null, false);
        delete from public.provenance_items p where p.id = r;
        delete from public.provenance_sources e where e.item = r;`,
    },
  ]
  const deleteGrants: Grant[] = [
    { role: 'hearth_app', table: 'working_hours', op: 'DELETE' },
    { role: 'hearth_app', table: 'working_hours', op: 'INSERT' },
  ]
  const keys: ForeignKey[] = [
    { table: 'jobs', name: 'jobs_org_id_schedule_run_id_fkey', action: 'n', parent: 'schedule_runs' },
    { table: 'schedule_runs', name: 'schedule_runs_org_id_resumed_from_fkey', action: 'n', parent: 'schedule_runs' },
    {
      table: 'notice_acknowledgments',
      name: 'notice_acknowledgments_org_id_person_id_device_id_fkey',
      action: 'n',
      parent: 'devices',
    },
    { table: 'passkeys', name: 'passkeys_org_id_user_id_created_device_id_fkey', action: 'n', parent: 'devices' },
  ]
  const holds = holdsTables(classes)
  const recorded = (decision: string) => ['LH-26', 'LH-48', 'LH-58', 'T15 item 16'].includes(decision)
  const found = deletePathsOf(deleteGrants, fns, keys)
  const problemsOf = (
    paths = found,
    entries: Readonly<Record<string, DeletePath>> = DELETE_PATHS,
    guarded: readonly string[] = GUARDED_TABLES,
  ) => deletePathProblems(entries, guarded, paths, holds, recorded)

  it('finds each path as check 1 finds writes, and passes DELETE_PATHS as it stands', () => {
    expect(found.map(path => [path.key, path.deletes])).toEqual([
      ['ddl create_data_access_partitions(integer)', []],
      ['delete_case(uuid, text, boolean)', ['cases', 'case_steps']],
      ['fk jobs.jobs_org_id_schedule_run_id_fkey', []],
      ['fk notice_acknowledgments.notice_acknowledgments_org_id_person_id_device_id_fkey', []],
      ['fk passkeys.passkeys_org_id_user_id_created_device_id_fkey', []],
      ['fk schedule_runs.schedule_runs_org_id_resumed_from_fkey', []],
      ['hearth_app working_hours:DELETE', ['working_hours']],
      ['lifecycle_cascade(text, uuid, bigint, integer)', ['provenance_items', 'provenance_sources']],
      ['provenance_forget(text, uuid, text, bigint)', ['provenance_items', 'provenance_sources']],
      ['purge_jobs(integer)', ['jobs']],
      ['purge_outbox(integer)', ['outbox_events']],
      ['purge_schedule_runs(integer)', ['schedule_runs']],
    ])
    expect(problemsOf()).toEqual([])
  })

  it('LH-12 LH-41: the provenance registry’s two paths are guarded, and an edge table the guard leaves off is named', () => {
    const forget = 'provenance_forget(text, uuid, text, bigint)'
    expect(
      problemsOf(
        found.filter(path => path.key === forget),
        { [forget]: { guarded: true } },
        GUARDED_TABLES.filter(table => table !== 'provenance_sources'),
      ),
    ).toEqual([
      "provenance_forget(text, uuid, text, bigint) is guarded in DELETE_PATHS in apps/server/src/lifecycle/deletes.ts, but deletes from public.provenance_sources, which GUARDED_TABLES doesn't list: a table gets lifecycle_guard() with its first delete path (LH-12)",
    ])
    // Exempt, either would delete from a table whose class's holds apply.
    expect(
      problemsOf(
        found.filter(path => path.key === forget),
        { [forget]: { exempt: 'a withdrawn leftover', decision: 'LH-48' } },
      ),
    ).toEqual([
      "provenance_forget(text, uuid, text, bigint) is exempt in DELETE_PATHS in apps/server/src/lifecycle/deletes.ts, but deletes from public.provenance_items, public.provenance_sources, whose retention class's holds apply: make it guarded or checked",
    ])
  })

  it('names an unlisted DELETE grant, an unlisted definer delete and an unlisted ON DELETE CASCADE, and a stale entry', () => {
    const more = deletePathsOf(
      [...deleteGrants, { role: 'hearth_app', table: 'sessions', op: 'DELETE' }],
      [
        ...fns,
        {
          key: 'forget_device(uuid)',
          definer: true,
          trigger: false,
          source: 'delete from public.devices d where d.id = x;',
        },
      ],
      [...keys, { table: 'case_steps', name: 'case_steps_org_id_case_id_fkey', action: 'c', parent: 'cases' }],
    )
    expect(problemsOf(more)).toEqual([
      "fk case_steps.case_steps_org_id_case_id_fkey deletes from public.case_steps, but DELETE_PATHS in apps/server/src/lifecycle/deletes.ts doesn't decide it: add 'fk case_steps.case_steps_org_id_case_id_fkey' as guarded, checked or exempt with its decision",
      "forget_device(uuid) deletes from public.devices, but DELETE_PATHS in apps/server/src/lifecycle/deletes.ts doesn't decide it: add 'forget_device(uuid)' as guarded, checked or exempt with its decision",
      "hearth_app sessions:DELETE deletes from public.sessions, but DELETE_PATHS in apps/server/src/lifecycle/deletes.ts doesn't decide it: add 'hearth_app sessions:DELETE' as guarded, checked or exempt with its decision",
    ])
    expect(problemsOf(found.filter(path => path.key !== 'purge_jobs(integer)'))).toEqual([
      "DELETE_PATHS in apps/server/src/lifecycle/deletes.ts decides 'purge_jobs(integer)', which no delete path the database allows matches: remove it",
    ])
  })

  it('DB-10: a SET NULL key into a holds-apply child passes as exempt, while a CASCADE key with the same child fails, and a cascade from a guarded table into an unguarded child names both', () => {
    const into = (action: 'c' | 'n') =>
      deletePathsOf([], [], [{ table: 'sessions', name: 'sessions_device_fkey', action, parent: 'devices' }], {})
    const exempt = { 'fk sessions.sessions_device_fkey': { exempt: 'the link only', decision: 'LH-48' } }
    expect(problemsOf(into('n'), exempt)).toEqual([])
    expect(problemsOf(into('c'), exempt)).toEqual([
      "fk sessions.sessions_device_fkey is exempt in DELETE_PATHS in apps/server/src/lifecycle/deletes.ts, but deletes from public.sessions, whose retention class's holds apply: make it guarded or checked",
    ])
    const fromGuarded = deletePathsOf(
      [],
      [],
      [{ table: 'phone_numbers', name: 'phone_numbers_case_fkey', action: 'c', parent: 'cases' }],
      {},
    )
    expect(problemsOf(fromGuarded, {})).toEqual([
      'fk phone_numbers.phone_numbers_case_fkey cascades a delete of guarded public.cases into unguarded public.phone_numbers: guard the child, or list the key in DELETE_PATHS in apps/server/src/lifecycle/deletes.ts with why',
    ])
  })

  it('LH-12: names a guarded path to an unguarded table, an exempt path to a holds-apply table, and any path to a kept table', () => {
    const paths = deletePathsOf(
      [],
      [
        { key: 'sweep_devices(integer)', definer: true, trigger: false, source: 'delete from public.devices;' },
        { key: 'purge_audit(integer)', definer: true, trigger: false, source: 'delete from public.audit_events;' },
        { key: 'drop_person(uuid)', definer: true, trigger: false, source: 'delete from public.people;' },
      ],
      [],
      {},
    )
    expect(
      problemsOf(paths, {
        'sweep_devices(integer)': { guarded: true },
        'purge_audit(integer)': { exempt: 'old rows', decision: 'LH-26' },
        'drop_person(uuid)': { exempt: 'a leaver', decision: 'LH-48' },
      }),
    ).toEqual([
      'drop_person(uuid) deletes from public.people, whose retention class keeps every row as history',
      "purge_audit(integer) is exempt in DELETE_PATHS in apps/server/src/lifecycle/deletes.ts, but deletes from public.audit_events, whose retention class's holds apply: make it guarded or checked",
      "sweep_devices(integer) is guarded in DELETE_PATHS in apps/server/src/lifecycle/deletes.ts, but deletes from public.devices, which GUARDED_TABLES doesn't list: a table gets lifecycle_guard() with its first delete path (LH-12)",
    ])
    // With the guard on devices, the same path passes.
    expect(
      problemsOf(paths.slice(2), { 'sweep_devices(integer)': { guarded: true } }, [...GUARDED_TABLES, 'devices']),
    ).toEqual([])
  })

  it('LH-58: a checked path must ask lifecycle_held() or is_held() in its body, comments and strings aside, delete from no guarded or kept table, and cite a recorded decision', () => {
    const reduce = (source: string): Fn => ({ key: 'reduce_leaver(uuid)', definer: true, trigger: false, source })
    const entry = { 'reduce_leaver(uuid)': { checked: true, decision: 'LH-58' } } as const
    const logs =
      "perform public.log_deletion('working_hours', 'working_hours', w.id::text, 'retention', null, null, null, null, false);"
    const asks = `if public.lifecycle_held(org, array[p], $$person$$, p) then return; end if; ${logs} delete from public.working_hours w where w.person_id = p;`
    expect(problemsOf(deletePathsOf([], [reduce(asks)], [], {}), entry)).toEqual([])
    expect(
      problemsOf(
        deletePathsOf([], [reduce(`select public.is_held(k, i); ${logs} delete from public.working_hours;`)], [], {}),
        entry,
      ),
    ).toEqual([])
    const never = `-- lifecycle_held(org) is asked elsewhere\n raise notice 'is_held(x)'; ${logs} delete from public.working_hours;`
    expect(problemsOf(deletePathsOf([], [reduce(never)], [], {}), entry)).toEqual([
      'reduce_leaver(uuid) is checked in DELETE_PATHS in apps/server/src/lifecycle/deletes.ts, but its body never calls lifecycle_held() or is_held(): ask it and skip a held row, or guard its tables (LH-58)',
    ])
    expect(
      problemsOf(
        deletePathsOf([], [reduce(`${asks} delete from public.cases; delete from public.people;`)], [], {}),
        entry,
      ),
    ).toEqual([
      'reduce_leaver(uuid) deletes from public.people, whose retention class keeps every row as history',
      "reduce_leaver(uuid) is checked in DELETE_PATHS in apps/server/src/lifecycle/deletes.ts, but deletes from public.cases, public.people: a guarded table's path is guarded, and a kept table has none",
    ])
    expect(
      problemsOf(deletePathsOf([], [reduce(asks)], [], {}), {
        'reduce_leaver(uuid)': { checked: true, decision: UNRECORDED },
      }),
    ).toEqual([
      `'reduce_leaver(uuid)' in DELETE_PATHS in apps/server/src/lifecycle/deletes.ts cites ${UNRECORDED}, which isn't an LH id docs/TECH-SPEC.md T23 records or a TECH-SPEC item (T<n> item <m>)`,
    ])
    // A grant can't ask anything itself.
    expect(
      problemsOf(deletePathsOf(deleteGrants, [], [], {}), {
        'hearth_app working_hours:DELETE': { checked: true, decision: 'LH-58' },
      }),
    ).toEqual([
      'hearth_app working_hours:DELETE is checked in DELETE_PATHS in apps/server/src/lifecycle/deletes.ts, but only a function can ask lifecycle_held() itself',
    ])
  })

  it('GUARD-02 LH-12 LH-58: a checked path deletes only from a table a leaver’s reduction marks, and logs each row it deletes', () => {
    // Only working_hours: the roster's reduction marks kept tables, which no path deletes from.
    expect([...holds.reduction].filter(table => !holds.kept.has(table))).toEqual(['working_hours'])
    const sweep = (source: string): Fn => ({ key: 'c29_sweep_sign_ins(uuid)', definer: true, trigger: false, source })
    const entry = { 'c29_sweep_sign_ins(uuid)': { checked: true, decision: 'LH-58' } } as const
    const asks = 'if public.lifecycle_held(org, array[person], $$person$$, person) then return; end if;'
    // The review's planted sweep: it asks the hold decision, then deletes sign-in sessions and audit
    // rows (holds-apply tables the guard isn't on) unguarded and unlogged. Before GUARD-02 it passed.
    const planted = `declare org uuid := nullif(pg_catalog.current_setting('app.org_id', true), '')::uuid;
      begin
        ${asks}
        delete from public.sessions s where s.org_id = org and s.user_id = person;
        delete from public.audit_events a where a.org_id = org and a.actor_id = person;
      end`
    expect(problemsOf(deletePathsOf([], [sweep(planted)], [], {}), entry)).toEqual([
      'c29_sweep_sign_ins(uuid) is checked in DELETE_PATHS in apps/server/src/lifecycle/deletes.ts, but its body never calls log_deletion(): no guard requires its log row, so it writes one for each row it deletes (LH-10, LH-58, GUARD-02)',
      "c29_sweep_sign_ins(uuid) is checked in DELETE_PATHS in apps/server/src/lifecycle/deletes.ts, but deletes from public.sessions, public.audit_events, whose retention class marks no leaver's reduction of rows a person also edits: make the path guarded, and the table gets lifecycle_guard() with it (LH-12, LH-58, GUARD-02)",
    ])
    // Logging alone doesn't make an unmarked table checkable; guarding it does.
    const logged = planted.replace(
      'begin',
      "begin perform public.log_deletion('sign_in_records', 'sessions', s, 'retention', null, null, null, null, false);",
    )
    expect(problemsOf(deletePathsOf([], [sweep(logged)], [], {}), entry)).toEqual([
      expect.stringContaining('deletes from public.sessions, public.audit_events, whose retention class marks no'),
    ])
    expect(
      problemsOf(deletePathsOf([], [sweep(logged)], [], {}), { 'c29_sweep_sign_ins(uuid)': { guarded: true } }, [
        ...GUARDED_TABLES,
        'sessions',
        'audit_events',
      ]),
    ).toEqual([])
    // log_deletion named only in a comment or a string isn't a call; one table marked and one not
    // names only the unmarked one.
    const unlogged = `${asks} -- public.log_deletion(x) runs later\n raise notice 'log_deletion(%)', x; delete from public.working_hours; delete from public.devices;`
    expect(problemsOf(deletePathsOf([], [sweep(unlogged)], [], {}), entry)).toEqual([
      expect.stringContaining('but its body never calls log_deletion()'),
      expect.stringContaining('but deletes from public.devices, whose retention class marks no'),
    ])
  })

  it('GUARD-03: a plain helper a definer calls is a delete path of its own, and check-catalogues reads every function of public for check 8', () => {
    // No runtime role may run the helper and it is neither a definer nor a trigger function, so
    // check 1 never reaches it; the definer that calls it deletes nothing in its own body.
    const helper: Fn = {
      key: 'forget_sessions(uuid, uuid)',
      definer: false,
      trigger: false,
      source: 'begin delete from public.sessions s where s.org_id = org and s.user_id = person; end',
      executors: [],
    }
    const caller: Fn = {
      key: 'sweep_person(uuid)',
      definer: true,
      trigger: false,
      source:
        "declare org uuid := nullif(pg_catalog.current_setting('app.org_id', true), '')::uuid; begin perform public.forget_sessions(org, person); end",
      executors: [],
    }
    expect(deletePathsOf([], [helper, caller], [], {}).map(path => [path.key, path.deletes])).toEqual([
      ['forget_sessions(uuid, uuid)', ['sessions']],
    ])
    expect(problemsOf([...found, ...deletePathsOf([], [helper, caller], [], {})])).toEqual([
      "forget_sessions(uuid, uuid) deletes from public.sessions, but DELETE_PATHS in apps/server/src/lifecycle/deletes.ts doesn't decide it: add 'forget_sessions(uuid, uuid)' as guarded, checked or exempt with its decision",
    ])
    // A helper whose deletes check 8 can't read is refused, as check 1 refuses one it reaches.
    expect(
      helperBodyProblems([
        helper,
        { ...helper, key: 'forget_atomic(uuid)', source: '', atomic: true },
        { ...helper, key: 'forget_dynamic(uuid)', source: "execute format('delete from public.%I', t);" },
        { ...helper, key: 'say(uuid)', source: "raise notice 'execute %', x; -- execute later" },
      ]),
    ).toEqual([
      "public.forget_atomic(uuid) is written with BEGIN ATOMIC, whose deletes check 8 can't read, though a function that may be run can call it: write its body as a quoted string (as $$ ... $$) (GUARD-03)",
      "public.forget_dynamic(uuid) runs dynamic SQL (EXECUTE), whose deletes check 8 can't read, though a function that may be run can call it: write them as plain statements (GUARD-03)",
    ])
    expect(
      helperBodyProblems([{ ...helper, key: 'make_parts(integer)', source: 'execute x;' }], {
        'make_parts(integer)': 'x',
      }),
    ).toEqual([])
    // check-catalogues.ts: its function query keeps every function of public, marking which check 1
    // reaches rather than leaving the others out, and check 8's three readings get every one.
    const script = readFileSync(new URL('./check-catalogues.ts', import.meta.url), 'utf8')
    const query = /const FUNCTIONS = `([\s\S]*?)`/.exec(script)?.[1] ?? ''
    const where = query.slice(query.lastIndexOf('\n  where '))
    expect(query).toContain(') as reachable')
    expect(where).toContain("n.nspname = 'public'")
    expect(where).not.toMatch(/prosecdef|has_function_privilege|regtype/)
    expect(script).toContain('const functions = everyFunction.filter(fn => fn.reachable)')
    expect(script).toContain('deletePathsOf(grants, everyFunction, foreignKeys)')
    expect(script).toContain('...bodyDdlProblems(everyFunction),')
    expect(script).toContain('...helperBodyProblems(everyFunction.filter(fn => !fn.reachable)),')
  })

  it('names a DYNAMIC_DDL function whose format strings drop, truncate, detach or delete, and passes one that only creates (R2CODE-01: a TRUNCATE trigger included)', () => {
    const ddl = (source: string) =>
      deletePathsOf([], [{ key: 'make_parts(integer)', definer: true, trigger: false, source }], [], {
        'make_parts(integer)': 'x',
      })
    const entry = { 'ddl make_parts(integer)': { exempt: 'creates', decision: 'T15 item 16' } }
    expect(problemsOf(ddl("execute format('create table public.%I ()', n); -- drop it later"), entry)).toEqual([])
    expect(problemsOf(ddl("execute format('DROP TABLE public.%I', n);"), entry)).toEqual([
      'public.make_parts(integer) is in DYNAMIC_DDL, which only creates, but a string it runs names drop: a deletion goes through the deletion code, never dynamic DDL',
    ])
    expect(problemsOf(ddl('execute $$alter table public.data_access_events detach partition p$$;'), entry)).toEqual([
      expect.stringContaining('names detach'),
    ])
    // R2CODE-01: a TRUNCATE in a trigger's event list empties nothing; one that runs is still named.
    expect(
      problemsOf(
        ddl(
          "execute format('create trigger lifecycle_no_truncate before truncate on public.%I for each statement execute function public.lifecycle_no_truncate()', n);",
        ),
        entry,
      ),
    ).toEqual([])
    expect(problemsOf(ddl("execute format('TRUNCATE public.%I', n);"), entry)).toEqual([
      expect.stringContaining('names truncate'),
    ])
  })

  it('LH-12 LH-33 GUARD-05 TESTS-02 R2CODE-01: names a body that truncates, drops or detaches a table, or turns the guard off or replaces it, as a plain statement or in a DYNAMIC_DDL function’s strings, and a DYNAMIC_DDL body other than the one pinned, and passes the bodies 0001 to 0013 make', () => {
    const fn = (key: string, source: string): Fn => ({ key, definer: true, trigger: false, source })
    // Built, so that scripts/guards/lifecycle.test.ts (LCG-05) doesn't read these planted bodies as
    // this file turning the guard off.
    const role = ['session', 'replication', 'role'].join('_')
    // No DELETE, so deletePathsOf finds no path: only bodyDdlProblems sees these.
    const wipe = fn('wipe_devices()', 'begin truncate public.devices; end')
    expect(deletePathsOf([], [wipe], [], {})).toEqual([])
    expect(
      bodyDdlProblems([...fns, { key: 'lifecycle_no_truncate()', definer: true, trigger: true, source: NO_TRUNCATE }]),
    ).toEqual([])
    const runs = (what: string, key: string) =>
      `public.${key} runs ${what} in its body, which deletes or turns the guard off with no DELETE for check 8 to decide: a deletion goes through the deletion code, never DDL in a function (LH-12, LH-33)`
    expect(
      bodyDdlProblems([
        wipe,
        fn('reset_sign_in()', 'truncate table only public.sessions, public.passkeys;'),
        fn('reset_audit()', 'TRUNCATE "public"."audit_events" *, ONLY public.sessions CASCADE;'),
        fn('drop_month()', 'drop table if exists public.data_access_events_2026_01;'),
        fn(
          'detach_month()',
          'alter table public.data_access_events detach partition public.data_access_events_2026_01 concurrently;',
        ),
        fn('quiet()', 'alter table public.cases disable trigger lifecycle_guard;'),
        fn('unguard()', 'drop trigger if exists lifecycle_guard on public.legal_holds;'),
        fn('always()', 'alter table public.cases enable replica trigger lifecycle_guard;'),
        fn('replica()', `set local ${role} = replica; delete from public.cases;`),
        fn('replica_config()', `perform pg_catalog.set_config( '${role}', 'replica', true);`),
        fn(
          'rewrite()',
          'create or replace function public.lifecycle_held(o uuid) returns boolean as $b$ select false $b$;',
        ),
        // R2CODE-01, LH-11: a guard's trigger replaced, or made to fire only sometimes, is named for
        // what it is, never only for the EXECUTE FUNCTION in it.
        fn(
          'replaced()',
          "create or replace trigger lifecycle_guard before delete on public.cases for each row when (false) execute function public.lifecycle_guard('cases');",
        ),
        fn(
          'conditioned()',
          "create trigger lifecycle_guard before delete on public.sessions for each row when (old.ended_at is not null) execute function public.lifecycle_guard('sessions');",
        ),
        fn(
          'narrowed()',
          'create trigger legal_holds_kept before update of released_at on public.legal_holds for each row execute function "public".legal_holds_kept();',
        ),
      ]),
    ).toEqual([
      runs('TRUNCATE', 'wipe_devices()'),
      runs('TRUNCATE', 'reset_sign_in()'),
      runs('TRUNCATE', 'reset_audit()'),
      runs('DROP TABLE', 'drop_month()'),
      runs('DETACH PARTITION', 'detach_month()'),
      runs('DISABLE TRIGGER', 'quiet()'),
      runs('DROP TRIGGER', 'unguard()'),
      runs('ENABLE ALWAYS or REPLICA TRIGGER', 'always()'),
      runs(`SET ${role}`, 'replica()'),
      runs(`SET ${role}`, 'replica_config()'),
      runs('CREATE OR REPLACE, DROP or ALTER FUNCTION of a guard function or lifecycle_held()', 'rewrite()'),
      runs('CREATE OR REPLACE TRIGGER of a guard trigger', 'replaced()'),
      runs('CREATE TRIGGER of a guard function with a WHEN condition or an UPDATE OF list', 'conditioned()'),
      runs('CREATE TRIGGER of a guard function with a WHEN condition or an UPDATE OF list', 'narrowed()'),
    ])
    // R2CODE-01: a TRUNCATE in a trigger's event list empties nothing; one that runs after it is named.
    expect(
      bodyDdlProblems([
        fn(
          'guard_then_wipe()',
          'create trigger t before insert or truncate on public.p for each statement execute function public.x(); truncate public.cases;',
        ),
      ]),
    ).toEqual([runs('TRUNCATE', 'guard_then_wipe()')])
    // A DYNAMIC_DDL function's own plain statements are held to it too, beside its format strings.
    expect(
      bodyDdlProblems([
        fn('make_parts(integer)', "execute format('create table public.%I ()', n); truncate public.jobs;"),
      ]),
    ).toEqual([runs('TRUNCATE', 'make_parts(integer)')])
    // R2CODE-01 GUARD-05: a DYNAMIC_DDL function's strings, and its body itself. The partitions job's
    // body as the latest migration writes it passes, and so does a plain CREATE TRIGGER of a guard's
    // function on a partition, as C2.9 may add for each one, as a statement or as a string it runs.
    const partitions = 'create_data_access_partitions(integer)'
    expect(bodyDdlProblems([fn(partitions, latestMigrationBody('create_data_access_partitions'))])).toEqual([])
    const pinnedAs = (body: string) => ({ [partitions]: { why: 'x', body } })
    const perPartition =
      'create trigger lifecycle_no_truncate before truncate on public.%I for each statement execute function public.lifecycle_no_truncate()'
    const addsTrigger = `begin execute pg_catalog.format('${perPartition}', name); end`
    expect(bodyDdlProblems([fn(partitions, addsTrigger)], pinnedAs(addsTrigger))).toEqual([])
    expect(
      deletePathProblems(
        { [`ddl ${partitions}`]: { exempt: 'creates partitions', decision: 'T15 item 16' } },
        GUARDED_TABLES,
        deletePathsOf([], [fn(partitions, addsTrigger)], [], pinnedAs(addsTrigger)),
        holdsTables(RETENTION_CLASSES),
        () => true,
      ),
    ).toEqual([])
    expect(bodyDdlProblems([fn('add_guard()', `begin ${perPartition.replace('%I', 'p')}; end`)])).toEqual([])
    const planted = {
      formatDisable: "begin execute format('alter table public.%I disable trigger lifecycle_guard', 'cases'); end",
      formatReplica:
        "begin execute format('alter table public.%I enable replica trigger lifecycle_guard', 'legal_holds'); end",
      formatHeld:
        "begin execute 'create or replace function public.lifecycle_held(o uuid, p uuid[], k text, i uuid) returns boolean language sql as ''select false'''; end",
      plainReplace:
        "begin execute format('create table if not exists public.%I partition of public.data_access_events for values from (%L) to (%L)', n, a, b);\n    create or replace trigger lifecycle_guard before delete on public.cases for each row when (false) execute function public.lifecycle_guard('cases'); end",
      splitVerb: "begin execute format('alter table public.%I %s trigger lifecycle_guard', 'cases', 'disable'); end",
    }
    const unpinned = `public.${partitions} is in DYNAMIC_DDL, but its body isn't the one pinned there, and what a string built at run time or a verb passed as an argument runs, no check can read: read the new body for anything that deletes, or turns the guard off or replaces it, then pin it in DYNAMIC_DDL in apps/server/scripts/catalogues.ts, a reviewed change (LH-33, R2CODE-01)`
    const holds = (what: string) =>
      `public.${partitions} is in DYNAMIC_DDL, but a string it runs holds ${what}, which deletes or turns the guard off with no DELETE for check 8 to decide: dynamic DDL only creates (LH-12, LH-33, R2CODE-01)`
    // Each differs from the body DYNAMIC_DDL pins, so each is refused for that alone.
    for (const [name, body] of Object.entries(planted)) {
      expect(bodyDdlProblems([fn(partitions, body)]), name).toContain(unpinned)
    }
    // Pinned as it is, each is still named for what its strings or statements hold, but for the verb
    // passed to format() as an argument, which only the pin catches.
    const named = (body: string) => bodyDdlProblems([fn(partitions, body)], pinnedAs(body))
    expect(named(planted.formatDisable)).toEqual([holds('DISABLE TRIGGER')])
    expect(named(planted.formatReplica)).toEqual([holds('ENABLE ALWAYS or REPLICA TRIGGER')])
    expect(named(planted.formatHeld)).toEqual([
      holds('CREATE OR REPLACE, DROP or ALTER FUNCTION of a guard function or lifecycle_held()'),
    ])
    expect(named(planted.plainReplace)).toEqual([runs('CREATE OR REPLACE TRIGGER of a guard trigger', partitions)])
    expect(named(planted.splitVerb)).toEqual([])
    // Comments and runs of whitespace aside, the body is compared as written.
    const current = latestMigrationBody('create_data_access_partitions')
    expect(bodyDdlProblems([fn(partitions, `-- the partitions job\n${current.replace(/\n\s*/g, '\n\t  ')}`)])).toEqual(
      [],
    )
    expect(bodyDdlProblems([fn(partitions, current.replace('between 0 and 24', 'between 0 and 25'))])).toEqual([
      unpinned,
    ])
    // Named only in a comment, a string, a quoted message or a longer identifier: nothing runs.
    expect(
      bodyDdlProblems([
        fn(
          'quiet_words()',
          [
            `-- truncate public.cases, drop table public.x, set ${role} = replica`,
            "/* alter table public.cases disable trigger lifecycle_guard */ raise notice 'drop table %', truncate_at;",
            `perform pg_catalog.current_setting('${role}'); select $q$detach partition$q$;`,
          ].join('\n'),
        ),
      ]),
    ).toEqual([])
  })

  it('reads which decisions TECH-SPEC records: an LH id T23 names, or an item of a section', () => {
    const spec = [
      '# TECH-SPEC',
      '## T15: the queue',
      '16. **Partitions.** daily',
      '## T23: retention (C0.10)',
      '1. **Scope (LH-01, LH-29).**',
      '15. **The clean-up (LH-26, LH-48/49).**',
      '## T24: later',
      OUTSIDE_T23,
    ].join('\n')
    const isRecorded = recordedDecisions(spec)
    expect(['LH-01', 'LH-26', 'LH-48', 'LH-49', 'T15 item 16', 'T23 item 15'].filter(isRecorded)).toEqual([
      'LH-01',
      'LH-26',
      'LH-48',
      'LH-49',
      'T15 item 16',
      'T23 item 15',
    ])
    // Outside T23, an item a section doesn't have, a section that doesn't exist, or any other shape.
    expect([OUTSIDE_T23, 'LH-02', 'T15 item 17', 'T99 item 1', 'D18', 'lh-26'].filter(isRecorded)).toEqual([])
  })
})
