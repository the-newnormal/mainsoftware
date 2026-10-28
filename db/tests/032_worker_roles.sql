-- T18, CLAUDE.md Database: the worker's roles (0007, 0008; 0009 lets hearth_queue read the registers,
-- and 0010 the notice's versions and links, T22 item 9; 0011 and 0012 give them nothing; 0013 narrows
-- the two consumers' outbox read to every column but the actor, OD-27). The worker logs
-- in as hearth_worker, which holds nothing itself and takes one job role per transaction; each job
-- role gets only the grants its jobs need. This pins every privilege each job role can use on every
-- table, column, sequence and function, however it got it, as 030 does hearth_app's, so any new
-- grant must be added here on purpose. It also pins who the roles are: hearth_worker NOINHERIT
-- with no privilege of its own and SET (never INHERIT) on exactly the five job roles (0008 adds
-- hearth_job_revocation); each job role NOLOGIN, owning nothing, a member of nothing, and usable by
-- hearth_worker alone. And who may add to the outbox (T16 item 20), and what worker_org_ids() gives
-- whom.
\ir fixtures/two_orgs.sql

-- Every privilege each job role holds, by any route.
select pg_temp.expect_privileges('hearth_queue', array[
  -- The runner and the scheduler: claim, renew, retry, cancel and end jobs; fire schedules and record
  -- their runs (never a run's next attempt after a review, which comes with review_schedule_run()).
  'jobs: SELECT',
  'jobs.feature_key: INSERT', 'jobs.id: INSERT', 'jobs.idempotency_key: INSERT', 'jobs.kind: INSERT',
  'jobs.max_attempts: INSERT', 'jobs.org_id: INSERT', 'jobs.payload: INSERT', 'jobs.purpose: INSERT',
  'jobs.run_after: INSERT', 'jobs.schedule_run_id: INSERT', 'jobs.subject_id: INSERT',
  'jobs.attempts: UPDATE', 'jobs.claimed_by: UPDATE', 'jobs.finished_at: UPDATE', 'jobs.give_backs: UPDATE',
  'jobs.lease_expires_at: UPDATE', 'jobs.lease_token: UPDATE', 'jobs.reason: UPDATE', 'jobs.run_after: UPDATE',
  'jobs.started_at: UPDATE', 'jobs.state: UPDATE',
  'schedules: SELECT',
  'schedules.cron: INSERT', 'schedules.key: INSERT', 'schedules.kind: INSERT', 'schedules.next_run_at: INSERT',
  'schedules.on_interrupt: INSERT', 'schedules.org_id: INSERT', 'schedules.payload: INSERT',
  'schedules.last_fired_at: UPDATE', 'schedules.next_run_at: UPDATE', 'schedules.retired_at: UPDATE',
  'schedule_runs: SELECT',
  'schedule_runs.finished_at: INSERT', 'schedule_runs.id: INSERT', 'schedule_runs.on_interrupt: INSERT',
  'schedule_runs.org_id: INSERT', 'schedule_runs.reason: INSERT', 'schedule_runs.schedule_id: INSERT',
  'schedule_runs.scheduled_for: INSERT', 'schedule_runs.state: INSERT',
  'schedule_runs.finished_at: UPDATE', 'schedule_runs.reason: UPDATE', 'schedule_runs.started_at: UPDATE',
  'schedule_runs.state: UPDATE',
  -- Flags, and what a cohort is checked against: whether the person is still at the org, and their
  -- current roles (people and roles only until C6.8).
  'feature_flags: SELECT',
  'people.deactivated_at: SELECT', 'people.id: SELECT', 'people.org_id: SELECT',
  'role_assignments.org_id: SELECT', 'role_assignments.person_id: SELECT', 'role_assignments.revoked_at: SELECT',
  'role_assignments.role: SELECT',
  -- The outbox's positions and times, never its envelope; the checkpoints and floors.
  'outbox_events.at: SELECT', 'outbox_events.id: SELECT', 'outbox_events.org_id: SELECT', 'outbox_events.tx_id: SELECT',
  'outbox_checkpoints: SELECT', 'outbox_floors: SELECT',
  -- withOrg's system principal.
  'principals.id: SELECT', 'principals.kind: SELECT', 'principals.org_id: SELECT', 'principals.system_key: SELECT',
  -- The worker's copy of the registers (0009, C0.9 PD-16), read with its flags: each purpose's
  -- versions, status, basis and providers; each provider's review date and revision (C0.9 PD-13,
  -- the change it notices); which clearances are open; live restrictions by id, person, purpose and
  -- time only. Never a register's other facts, nor who recorded, cleared or withdrew anything.
  'processing_register.basis: SELECT', 'processing_register.org_id: SELECT', 'processing_register.providers: SELECT',
  'processing_register.purpose: SELECT', 'processing_register.status: SELECT', 'processing_register.version: SELECT',
  'transfer_register.org_id: SELECT', 'transfer_register.provider: SELECT', 'transfer_register.review_on: SELECT',
  'transfer_register.revision: SELECT',
  'transfer_clearances.id: SELECT', 'transfer_clearances.org_id: SELECT', 'transfer_clearances.provider: SELECT',
  'transfer_clearances.withdrawn_at: SELECT',
  'processing_restrictions.effective_at: SELECT', 'processing_restrictions.id: SELECT',
  'processing_restrictions.lifted_at: SELECT', 'processing_restrictions.org_id: SELECT',
  'processing_restrictions.person_id: SELECT', 'processing_restrictions.purpose: SELECT',
  -- And the notice (0010, T22 item 9): the latest version's id, number and whether it was generated,
  -- and the purposes it lists at which register version ("notified", C0.9 PD-40; a pinned purpose's
  -- staleness, B-04). Whether each open clearance is stated comes from notice_provider_states(),
  -- never a clearance's facts or a version's providers (B-06, C-03); never a version's text, who
  -- published it, or anyone's acknowledgement.
  'notice_versions.generator: SELECT', 'notice_versions.id: SELECT', 'notice_versions.org_id: SELECT',
  'notice_versions.version: SELECT',
  'notice_version_purposes.notice_version_id: SELECT', 'notice_version_purposes.org_id: SELECT',
  'notice_version_purposes.purpose: SELECT', 'notice_version_purposes.register_version: SELECT',
  'function is_ids_only(jsonb): EXECUTE',
  'function notice_provider_states(): EXECUTE',
  'function worker_org_ids(): EXECUTE'
]);

-- C-03, B-06: spelt out, since a column grant would hand the worker the DPO's written confirmations:
-- hearth_queue reads no clearance's facts and nothing of a version's providers, runs neither
-- notice_facts() nor transfer_send_state(), and reads stated through notice_provider_states().
select pg_temp.check(not has_column_privilege('hearth_queue', 'public.transfer_clearances', 'facts', 'SELECT')
                     and not has_any_column_privilege('hearth_queue', 'public.notice_version_providers', 'SELECT')
                     and not has_function_privilege('hearth_queue', 'public.notice_facts(jsonb)', 'EXECUTE')
                     and not has_function_privilege('hearth_queue', 'public.transfer_send_state(text)', 'EXECUTE')
                     and has_function_privilege('hearth_queue', 'public.notice_provider_states()', 'EXECUTE'),
                     'hearth_queue reads clearance facts or a version''s providers, runs notice_facts() or transfer_send_state(), or can''t run notice_provider_states()');

-- C0.9 PR 3a (0011): no job role, nor hearth_worker, holds anything on the DPO's contact or runs
-- 0011's functions, and hearth_queue's column grant on notice_versions doesn't reach the contact a
-- version printed: the worker never reads the contact, nor a recorded acknowledgement's day or
-- note (it reads no acknowledgement at all). The lists above pin it; this names the new objects.
do $$
declare
  r text;
  p text;
begin
  foreach r in array array['hearth_queue', 'hearth_job_offboarding', 'hearth_job_partitions', 'hearth_job_purge',
                           'hearth_job_revocation', 'hearth_worker'] loop
    foreach p in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
      perform pg_temp.check(not has_table_privilege(r, 'public.dpo_settings', p)
                            and (p not in ('SELECT', 'INSERT', 'UPDATE', 'REFERENCES')
                                 or not has_any_column_privilege(r, 'public.dpo_settings', p)),
                            format('%s holds %s on dpo_settings', r, p));
    end loop;
    foreach p in array array['public.set_dpo_contact(integer,text,text,text,text,text,uuid,inet)',
                             'public.record_notice_acknowledgement(uuid,uuid,date,text,text,uuid,inet)',
                             'public.publish_notice(integer,text,text,text[],integer[],uuid[],integer,text,uuid,inet)',
                             'public.dpo_settings_unchanged()'] loop
      perform pg_temp.check(not has_function_privilege(r, p, 'EXECUTE'), format('%s can run %s', r, p));
    end loop;
    perform pg_temp.check(not has_column_privilege(r, 'public.notice_versions', 'dpo_settings_version', 'SELECT')
                          and not has_column_privilege(r, 'public.notice_acknowledgments', 'acknowledged_on', 'SELECT')
                          and not has_column_privilege(r, 'public.notice_acknowledgments', 'recorded_note', 'SELECT'),
                          format('%s reads the contact a version printed, or a recorded acknowledgement''s day or note', r));
  end loop;
end
$$;

-- C0.9 PR 3b (0012; OD-06, OD-14, RQD-01): no job role, nor hearth_worker, holds anything on a
-- request (cases, case_steps) or runs any of 0012's functions: no job reads a case before C0.14,
-- whose alert job gets its own narrow definer. hearth_queue's column grant on
-- processing_restrictions still leaves out case_id (the list above pins it), and it still reads
-- nothing of dpo_settings, whose reply targets 0012 adds (the block above).
do $$
declare
  r text;
  t text;
  p text;
begin
  foreach r in array array['hearth_queue', 'hearth_job_offboarding', 'hearth_job_partitions', 'hearth_job_purge',
                           'hearth_job_revocation', 'hearth_worker'] loop
    foreach t in array array['cases', 'case_steps'] loop
      foreach p in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
        perform pg_temp.check(not has_table_privilege(r, format('public.%I', t), p)
                              and (p not in ('SELECT', 'INSERT', 'UPDATE', 'REFERENCES')
                                   or not has_any_column_privilege(r, format('public.%I', t), p)),
                              format('%s holds %s on %s', r, p, t));
      end loop;
    end loop;
    foreach p in array array[
      'public.submit_case(text,text,uuid,text,uuid,inet)', 'public.read_own_cases(integer)',
      'public.log_case(text,text,date,uuid,text,text,text,text,uuid,text,uuid,inet)',
      'public.add_case_step(uuid,integer,text,date,text,date,text,text,text,uuid,inet)',
      'public.read_cases(boolean,integer)', 'public.read_case(uuid)', 'public.read_case_steps(uuid)',
      'public.read_case_others(uuid,integer)', 'public.case_attention()',
      'public.set_reply_targets(integer,integer,integer,text,uuid,inet)',
      'public.new_case_reference()', 'public.notice_states_targets(text)', 'public.case_add_business_days(date,integer)',
      'public.case_due_on(text,text,date,date,date,integer,integer,integer,integer)', 'public.case_kind_now(uuid,uuid)',
      'public.case_due(uuid,uuid)', 'public.case_replied_in_time(uuid,uuid)', 'public.cases_check_dpo(uuid,uuid)',
      'public.cases_fixed()', 'public.case_steps_unchanged()'] loop
      perform pg_temp.check(not has_function_privilege(r, p, 'EXECUTE'), format('%s can run %s', r, p));
    end loop;
    perform pg_temp.check(not has_column_privilege(r, 'public.processing_restrictions', 'case_id', 'SELECT'),
                          format('%s reads which case a restriction came from', r));
  end loop;
end
$$;

-- C0.9 DB-02, OD-27: who may read an outbox event's actor. A request sent from the form appends
-- case.opened with its requester as the actor (the outbox's own rule, 0007), kept 14 days, which
-- OD-14 keeps from everyone but the DPO. No consumer reads it from PR 3b (readBatch(), PD-111), and
-- OD-27's revoke landed in 0013 (C0.10 LH-27, LH-49, LCD-31): the offboarding and revocation roles
-- read every column of the outbox but actor_id and actor_kind, so nobody may read either; never
-- hearth_queue, hearth_app or hearth_worker itself. The owner, superusers, Postgres's own roles and
-- anyone who can act as the owner aside.
select pg_temp.check(
  coalesce((select array_agg(r.rolname::text order by r.rolname)
            from pg_roles r
            where not r.rolsuper and r.rolname <> 'hearth_owner' and r.rolname not like 'pg\_%'
              and not pg_has_role(r.oid, 'hearth_owner', 'USAGE') and not pg_has_role(r.oid, 'hearth_owner', 'SET')
              and (has_column_privilege(r.oid, 'public.outbox_events', 'actor_id', 'SELECT')
                   or has_column_privilege(r.oid, 'public.outbox_events', 'actor_kind', 'SELECT'))), '{}')
  = '{}',
  'a role may read an outbox event''s actor (OD-27, LCD-31)');

select pg_temp.expect_privileges('hearth_job_offboarding', array[
  -- The offboarding consumer: read the outbox (every column but the actor, OD-27, from 0013), start
  -- and move its own checkpoint, read the floors.
  'outbox_events.acl_epoch: SELECT', 'outbox_events.acl_more: SELECT', 'outbox_events.acl_tokens: SELECT',
  'outbox_events.at: SELECT', 'outbox_events.container_id: SELECT', 'outbox_events.container_type: SELECT',
  'outbox_events.entity_id: SELECT', 'outbox_events.entity_type: SELECT', 'outbox_events.id: SELECT',
  'outbox_events.ids: SELECT', 'outbox_events.index_class: SELECT', 'outbox_events.org_id: SELECT',
  'outbox_events.purpose: SELECT', 'outbox_events.subject_ids: SELECT', 'outbox_events.tombstone: SELECT',
  'outbox_events.tx_id: SELECT', 'outbox_events.type: SELECT', 'outbox_events.version: SELECT',
  'outbox_floors: SELECT', 'outbox_checkpoints: SELECT',
  'outbox_checkpoints.consumer: INSERT', 'outbox_checkpoints.last_id: INSERT', 'outbox_checkpoints.last_tx: INSERT',
  'outbox_checkpoints.org_id: INSERT', 'outbox_checkpoints.role_name: INSERT',
  'outbox_checkpoints.last_id: UPDATE', 'outbox_checkpoints.last_tx: UPDATE', 'outbox_checkpoints.processed: UPDATE',
  'outbox_checkpoints.updated_at: UPDATE',
  -- One job per handler, never choosing who made it, its state or its lease.
  'jobs.feature_key: INSERT', 'jobs.id: INSERT', 'jobs.idempotency_key: INSERT', 'jobs.kind: INSERT',
  'jobs.max_attempts: INSERT', 'jobs.org_id: INSERT', 'jobs.payload: INSERT', 'jobs.purpose: INSERT',
  'jobs.run_after: INSERT', 'jobs.subject_id: INSERT',
  -- The re-read: has the person left, and who deactivated them; which sessions a deactivation ended.
  'people.deactivated_at: SELECT', 'people.deactivated_by: SELECT', 'people.id: SELECT', 'people.org_id: SELECT',
  'sessions.id: SELECT', 'sessions.org_id: SELECT', 'sessions.revoke_reason: SELECT', 'sessions.user_id: SELECT',
  'principals.id: SELECT', 'principals.kind: SELECT', 'principals.org_id: SELECT', 'principals.system_key: SELECT',
  'function feature_fence(text,bigint[]): EXECUTE',
  'function is_ids_only(jsonb): EXECUTE',
  'function job_fence(uuid,uuid,bigint[]): EXECUTE',
  'function job_finish(uuid,uuid,bigint[]): EXECUTE'
]);

-- The revocation consumer and its jobs (0008, T19). Offboarding's read of sessions above stays
-- until a later migration contracts it (T3): a C0.6 worker may still run its sockets job.
select pg_temp.expect_privileges('hearth_job_revocation', array[
  -- The revocation consumer: read the outbox (every column but the actor, OD-27, from 0013), start
  -- and move its own checkpoint, read the floors.
  'outbox_events.acl_epoch: SELECT', 'outbox_events.acl_more: SELECT', 'outbox_events.acl_tokens: SELECT',
  'outbox_events.at: SELECT', 'outbox_events.container_id: SELECT', 'outbox_events.container_type: SELECT',
  'outbox_events.entity_id: SELECT', 'outbox_events.entity_type: SELECT', 'outbox_events.id: SELECT',
  'outbox_events.ids: SELECT', 'outbox_events.index_class: SELECT', 'outbox_events.org_id: SELECT',
  'outbox_events.purpose: SELECT', 'outbox_events.subject_ids: SELECT', 'outbox_events.tombstone: SELECT',
  'outbox_events.tx_id: SELECT', 'outbox_events.type: SELECT', 'outbox_events.version: SELECT',
  'outbox_floors: SELECT', 'outbox_checkpoints: SELECT',
  'outbox_checkpoints.consumer: INSERT', 'outbox_checkpoints.last_id: INSERT', 'outbox_checkpoints.last_tx: INSERT',
  'outbox_checkpoints.org_id: INSERT', 'outbox_checkpoints.role_name: INSERT',
  'outbox_checkpoints.last_id: UPDATE', 'outbox_checkpoints.last_tx: UPDATE', 'outbox_checkpoints.processed: UPDATE',
  'outbox_checkpoints.updated_at: UPDATE',
  -- One job per handler, never choosing who made it, its state or its lease.
  'jobs.feature_key: INSERT', 'jobs.id: INSERT', 'jobs.idempotency_key: INSERT', 'jobs.kind: INSERT',
  'jobs.max_attempts: INSERT', 'jobs.org_id: INSERT', 'jobs.payload: INSERT', 'jobs.purpose: INSERT',
  'jobs.run_after: INSERT', 'jobs.subject_id: INSERT',
  -- The sockets job's re-read: which sessions ended, and when.
  'sessions.id: SELECT', 'sessions.org_id: SELECT', 'sessions.revoked_at: SELECT', 'sessions.user_id: SELECT',
  'principals.id: SELECT', 'principals.kind: SELECT', 'principals.org_id: SELECT', 'principals.system_key: SELECT',
  'function feature_fence(text,bigint[]): EXECUTE',
  'function is_ids_only(jsonb): EXECUTE',
  'function job_fence(uuid,uuid,bigint[]): EXECUTE',
  'function job_finish(uuid,uuid,bigint[]): EXECUTE'
]);

-- LCD-31 (C0.9 OD-27, PD-111; C0.10 LH-27, LH-49): as either consumer's role, acting in an org,
-- the statements each one runs over the outbox still run under the column grants 0013 left them:
-- readBatch()'s select list (here without its horizon, since the fixture's event is this
-- transaction's own), startOf()'s and futureRows()' reads (apps/server/src/outbox/positions.ts)
-- and, for the revocation role, the sockets job's read (apps/server/src/revocation/registry.ts);
-- count(*) and select 1 work under column grants too. Reading the actor, or every column, is refused
-- (42501).
do $$
declare
  r text;
  n bigint;
begin
  foreach r in array array['hearth_job_offboarding', 'hearth_job_revocation'] loop
    perform pg_temp.act_as_job('1', r);
    select count(*) into n from (
      select id, tx_id, at, type, version, entity_type, entity_id, container_type, container_id, acl_tokens,
             acl_more, index_class, acl_epoch, subject_ids, purpose, tombstone, ids
      from public.outbox_events
      where org_id = pg_temp.id('1', '00') and (tx_id, id) > ('0'::xid8, 0::bigint)
      order by tx_id, id limit 100) b;
    perform pg_temp.check(n = 1, format('%s read %s of org 1''s one fixture event (LCD-31)', r, n));
    perform 1 from (select) one
      left join lateral (select e.tx_id, e.id from public.outbox_events e
                         where e.org_id = pg_temp.id('1', '00') and e.tx_id < pg_snapshot_xmin(pg_current_snapshot())
                         order by e.tx_id desc, e.id desc limit 1) h on true
      left join public.outbox_floors f on f.org_id = pg_temp.id('1', '00');
    perform greatest((select max(tx_id) from public.outbox_events where org_id = pg_temp.id('1', '00')),
                     (select max(last_tx) from public.outbox_checkpoints where org_id = pg_temp.id('1', '00')),
                     (select last_tx from public.outbox_floors where org_id = pg_temp.id('1', '00')))
              >= pg_snapshot_xmax(pg_current_snapshot());
    perform count(*) from public.outbox_events;
    if r = 'hearth_job_revocation' then
      perform s.id, (select min(e.at) from public.outbox_events e
                     where e.org_id = s.org_id and e.type = 'signin.ended' and e.entity_type = 'person'
                       and e.entity_id = s.user_id and e.ids -> 'sessions' ? s.id::text)
      from public.sessions s where s.org_id = pg_temp.id('1', '00') and s.revoked_at is null;
    end if;
    perform pg_temp.expect_error('select actor_id from public.outbox_events', '42501');
    perform pg_temp.expect_error('select actor_kind from public.outbox_events', '42501');
    perform pg_temp.expect_error('select * from public.outbox_events', '42501');
    perform set_config('role', 'none', true);
  end loop;
end
$$;

select pg_temp.expect_privileges('hearth_job_partitions', array[
  'principals.id: SELECT', 'principals.kind: SELECT', 'principals.org_id: SELECT', 'principals.system_key: SELECT',
  'function create_data_access_partitions(integer): EXECUTE',
  'function job_fence(uuid,uuid,bigint[]): EXECUTE',
  'function job_finish(uuid,uuid,bigint[]): EXECUTE'
]);

select pg_temp.expect_privileges('hearth_job_purge', array[
  'principals.id: SELECT', 'principals.kind: SELECT', 'principals.org_id: SELECT', 'principals.system_key: SELECT',
  'function job_fence(uuid,uuid,bigint[]): EXECUTE',
  'function job_finish(uuid,uuid,bigint[]): EXECUTE',
  'function purge_jobs(integer): EXECUTE',
  'function purge_outbox(integer): EXECUTE',
  'function purge_schedule_runs(integer): EXECUTE'
]);

-- hearth_worker can use nothing until it takes a job role: no privilege of its own, none inherited.
select pg_temp.expect_privileges('hearth_worker', '{}');

-- None of them can create anything: no schema, no object in one, no temporary table.
select pg_temp.check(not exists (
  select 1 from unnest(array['hearth_worker', 'hearth_queue', 'hearth_job_offboarding', 'hearth_job_partitions',
                             'hearth_job_purge', 'hearth_job_revocation']) r
  where has_database_privilege(r, current_database(), 'CREATE') or has_database_privilege(r, current_database(), 'TEMPORARY')
     or exists (select 1 from pg_namespace n
                where n.nspname not like 'pg\_%' and n.nspname <> 'information_schema' and has_schema_privilege(r, n.oid, 'CREATE'))),
  'a worker role can create a schema, an object in one, or a temporary table');

-- hearth_worker: NOINHERIT, with no power, and a member, by SET and never INHERIT or ADMIN, of
-- exactly the five job roles (and on RDS of rds_iam, if that has no powers and belongs to nothing).
-- Whether it can log in is set outside migrations (scripts/db-local.sh locally, IAM on RDS).
select pg_temp.check(not (rolinherit or rolsuper or rolbypassrls or rolcreaterole or rolcreatedb or rolreplication),
                     'hearth_worker inherits, or has a power it must not have')
from pg_roles where rolname = 'hearth_worker';
select pg_temp.check(
  coalesce((select array_agg(distinct format('%s %s%s%s', g.rolname, case when m.admin_option then 'A' end,
                                             case when m.inherit_option then 'I' end, case when m.set_option then 'S' end))
            from pg_auth_members m join pg_roles g on g.oid = m.roleid
            where m.member = 'hearth_worker'::regrole
              and not (g.rolname = 'rds_iam' and not g.rolsuper and not g.rolbypassrls
                       and not exists (select 1 from pg_auth_members x where x.member = g.oid))), '{}')
  = array['hearth_job_offboarding S', 'hearth_job_partitions S', 'hearth_job_purge S', 'hearth_job_revocation S',
          'hearth_queue S'],
  'hearth_worker holds a role other than the five job roles, or holds one by INHERIT or ADMIN');
-- Nobody may act as hearth_worker; its creator keeps only Postgres's ADMIN-only grant.
select pg_temp.check(
  coalesce((select array_agg(distinct format('%s %s%s%s', x.rolname, case when m.admin_option then 'A' end,
                                             case when m.inherit_option then 'I' end, case when m.set_option then 'S' end))
            from pg_auth_members m join pg_roles x on x.oid = m.member
            where m.roleid = 'hearth_worker'::regrole), '{}')
  <@ array['hearth_owner A'],
  'someone may act as hearth_worker');

-- Each job role: NOLOGIN and powerless, a member of nothing, usable by hearth_worker alone (SET),
-- beside its creator's ADMIN-only grant, and owning nothing.
do $$
declare
  job text;
  r pg_roles%rowtype;
  members text[];
begin
  foreach job in array array['hearth_queue', 'hearth_job_offboarding', 'hearth_job_partitions', 'hearth_job_purge',
                             'hearth_job_revocation'] loop
    select * into r from pg_roles where rolname = job;
    perform pg_temp.check(found, format('%s does not exist', job));
    perform pg_temp.check(not (r.rolcanlogin or r.rolsuper or r.rolbypassrls or r.rolcreaterole or r.rolcreatedb or r.rolreplication),
                          format('%s can log in or has a power it must not have', job));
    perform pg_temp.check(not exists (select 1 from pg_auth_members m where m.member = r.oid),
                          format('%s is a member of another role', job));
    select array_agg(distinct format('%s %s%s%s', x.rolname, case when m.admin_option then 'A' end,
                                     case when m.inherit_option then 'I' end, case when m.set_option then 'S' end)
                     order by format('%s %s%s%s', x.rolname, case when m.admin_option then 'A' end,
                                     case when m.inherit_option then 'I' end, case when m.set_option then 'S' end))
      into members
    from pg_auth_members m join pg_roles x on x.oid = m.member
    where m.roleid = r.oid;
    perform pg_temp.check(members = array['hearth_owner A', 'hearth_worker S'],
                          format('who may act as %s: %s (only hearth_worker, by SET; its creator ADMIN only)', job, members));
    perform pg_temp.check(not exists (select 1 from pg_class c where c.relowner = r.oid)
                          and not exists (select 1 from pg_proc p where p.proowner = r.oid)
                          and not exists (select 1 from pg_namespace n where n.nspowner = r.oid)
                          and not exists (select 1 from pg_type t where t.typowner = r.oid)
                          and (select datdba from pg_database where datname = current_database()) <> r.oid,
                          format('%s owns something', job));
  end loop;
end
$$;

-- Who may add to the outbox (T16 item 20): exactly hearth_app, by any route (a grant, a role it
-- inherits, or one it can SET), and none of them skips row level security. A later step that lets
-- a job append (C2.1's overdue job, A1's transcript jobs) adds its role here in its own migration;
-- the Rule 9 role (C1.11) never may. The owner, superusers and Postgres's own roles aside.
select pg_temp.check(
  coalesce((select array_agg(r.rolname::text order by r.rolname)
            from pg_roles r
            where not r.rolsuper and r.rolname <> 'hearth_owner' and r.rolname not like 'pg\_%'
              and not pg_has_role(r.oid, 'hearth_owner', 'USAGE') and not pg_has_role(r.oid, 'hearth_owner', 'SET')
              and exists (select 1 from pg_roles h
                          where has_any_column_privilege(h.oid, 'public.outbox_events', 'INSERT')
                            and pg_has_role(r.oid, h.oid, 'SET'))), '{}')
  = array['hearth_app'],
  'a role other than hearth_app may add to the outbox');
select pg_temp.check(not exists (
  select 1 from pg_roles r
  where has_any_column_privilege(r.oid, 'public.outbox_events', 'INSERT') and r.rolbypassrls and r.rolname <> 'hearth_owner'
    and not r.rolsuper),
  'a role that may add to the outbox skips row level security');

-- worker_org_ids() (T18): to hearth_queue, the id of every org and nothing else, whatever org the
-- transaction has set; ids only. Nobody else may call it, hearth_worker itself included.
select set_config('test.orgs', (select array_agg(id order by id)::text from public.orgs), true);
select pg_temp.check(current_setting('test.orgs')::uuid[] @> array[pg_temp.id('1', '00'), pg_temp.id('2', '00')],
                     'the fixture orgs are missing');
select pg_temp.check(pg_get_function_result('public.worker_org_ids()'::regprocedure) = 'SETOF uuid',
                     'worker_org_ids returns more than ids');
select set_config('app.org_id', '', true), set_config('app.user_id', '', true);
set local role hearth_queue;
select pg_temp.check((select array_agg(x order by x)::text from public.worker_org_ids() x) = current_setting('test.orgs'),
                     'worker_org_ids did not return every org with no org set');
reset role;
select pg_temp.act_as_job('2', 'hearth_queue');
select pg_temp.check((select array_agg(x order by x)::text from public.worker_org_ids() x) = current_setting('test.orgs'),
                     'worker_org_ids used the org set in the transaction');
reset role;
do $$
declare
  r text;
begin
  foreach r in array array['hearth_app', 'hearth_worker', 'hearth_job_offboarding', 'hearth_job_partitions', 'hearth_job_purge',
                           'hearth_job_revocation'] loop
    perform set_config('role', r, true);
    perform pg_temp.expect_error('select count(*) from public.worker_org_ids()', '42501');
    perform set_config('role', 'none', true);
  end loop;
end
$$;
