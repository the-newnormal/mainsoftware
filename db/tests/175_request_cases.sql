-- PDPA-04, PDPA-05, PDPA-07, PDPA-09, PDPA-13, ACC-10, ACC-11, ADM-06, Rule 8 (C0.9 PR 3b, 0012;
-- OD-06 to OD-09, OD-13 to OD-17, OD-22, OD-25; PD-87 to PD-104, PD-110, PD-112; TECH-SPEC T22
-- items 50 to 62): requests to the DPO. The cases:
--   RQD-01 no runtime role holds a privilege on cases or case_steps, both have the one org policy,
--          hearth_app runs exactly the ten case functions, and no role a helper or a trigger
--          function (OD-06, OD-14);
--   RQD-02 the tables' checks and triggers, whoever writes (PD-88, PD-90, PD-102, DB-04);
--   RQD-03 submit_case() for every persona, its rules, the stated settings version and its audit row
--          (OD-07, OD-13, OD-15, PD-93, PD-96, PD-100);
--   RQD-04 a resend from the same sheet records nothing, a key is the writer's own, and it returns
--          only a case sent the same way (PD-96, OD-14, OD-15);
--   RQD-05 at most 10 open requests per requester (PD-96, OD-25);
--   RQD-06 log_case(): the DPO alone, its rules, leavers with a channel, and the settings version in
--          force at the start of the day received (OD-16, PD-89, PD-93, PPL-01, PPL-14);
--   RQD-07 add_case_step(): the DPO alone, the revision, each step's rules and the closure, by kind,
--          and one audit row each (PD-90, PD-91, PD-100, PPL-04, PPL-14, DB-03);
--   RQD-08 the reads: the DPO's queue, a case and its steps, the requester's tracking as every
--          persona, and the requester's other requests, each in its order (OD-14, OD-15, PD-97,
--          PD-98, PD-103, PD-112, PPL-07, DB-07);
--   RQD-09 business days and due days on a table of samples (OD-08, OD-09, PD-92, PD-93, PPL-08);
--   RQD-10 case_attention(), the indicator's count, at both edges of its window, for every persona
--          (OD-22, PD-99, PD-112);
--   RQD-11 the reply targets' checks and defaults (OD-08, PD-94; 165's DCD-11 too);
--   RQD-12 processing_restrictions.case_id's foreign key (T22 item 20);
--   RQD-13 across orgs (ACC-11);
--   RQD-14 no refusal's message holds any part of its input (R2);
--   RQD-16 the reference (PD-104);
--   RQD-17 the request-handling purpose (OD-17, PD-87);
--   RQD-18 cases_check_dpo()'s own message, and registers_check_dpo()'s kept (PD-110).
-- RQD-15, the audit log's request rows, is in 050. Every case runs as the role it tests:
-- hearth_app through act_as(), a job role through act_as_job(), and the owner or the superuser only
-- where it says so. Every refusal checks that nothing was written (cases, steps, audit and outbox
-- rows). The people, words and addresses are made up, on .example, and numbers in +65 8000.
\ir fixtures/two_orgs.sql

-- Today in an org's zone, read as the superuser.
create function pg_temp.today(o text) returns date language sql stable as $$
  select (now() at time zone x.time_zone)::date from public.orgs x where x.id = pg_temp.id(o, '00')
$$;
-- submit_case() as the api's route calls it (the device a plain id), with a fresh client key unless
-- one is given.
create function pg_temp.send(kind text, details text, key uuid default gen_random_uuid())
returns table (id uuid, reference text, received_on date, due_on date, changed boolean) language sql as $$
  select * from public.submit_case(kind, details, key, 'req-case', 'd0000000-0000-4000-8000-0000000000d3', '192.0.2.60')
$$;
-- log_case() as the api's route calls it.
create function pg_temp.log(kind text, came_by text, received_on date, person uuid, name text, channel text, contact text,
                            details text, key uuid default gen_random_uuid())
returns table (id uuid, reference text, due_on date, changed boolean) language sql as $$
  select * from public.log_case(kind, came_by, received_on, person, name, channel, contact, details, key, 'req-case',
                                'd0000000-0000-4000-8000-0000000000d3', '192.0.2.60')
$$;
-- add_case_step() as the api's route calls it; the new revision.
create function pg_temp.step(the_case uuid, seen integer, step text, on_day date, note text default null,
                             extended_to date default null, kind text default null, outcome text default null)
returns integer language sql as $$
  select r.revision from public.add_case_step(the_case, seen, step, on_day, note, extended_to, kind, outcome, 'req-case',
                                              'd0000000-0000-4000-8000-0000000000d3', '192.0.2.60') r
$$;
-- What a refusal must leave as it was, read as the superuser.
create function pg_temp.written() returns text language sql stable as $$
  select format('cases %s, steps %s, audit %s, outbox %s', (select count(*) from public.cases),
                (select count(*) from public.case_steps), (select count(*) from public.audit_events),
                (select count(*) from public.outbox_events))
$$;
-- A refusal by a persona: acting as them, the statement fails with the SQLSTATE and the whole
-- message, and nothing is written.
create function pg_temp.refused(o text, who text, stmt text, state text, message text) returns void language plpgsql as $$
declare
  before text := pg_temp.written();
begin
  perform pg_temp.act_as(o, who);
  perform pg_temp.expect_error(stmt, state, message);
  perform set_config('role', 'none', true);
  perform pg_temp.check(pg_temp.written() = before, format('a refusal (%s, %s) wrote something: %s', who, stmt, pg_temp.written()));
end
$$;
-- A case row as jsonb, a request the DPO logged for someone without an account in org 1, with the
-- changes given; and a step on ea, the same way. For the tables' own checks, as the superuser.
create function pg_temp.case_json(changes jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object(
    'id', gen_random_uuid(), 'org_id', pg_temp.id('1', '00'), 'reference', public.new_case_reference(),
    'client_key', gen_random_uuid(), 'kind', 'question', 'came_by', 'email', 'received_on', pg_temp.today('1'),
    'logged_at', now(), 'logged_by', pg_temp.id('1', 'a5'), 'requester_name', 'Sam Example', 'requester_channel', 'email',
    'requester_contact', 'sam@requester.example', 'details', 'Asks how long rota sheets are kept.') || changes
$$;
create function pg_temp.step_json(changes jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object(
    'id', gen_random_uuid(), 'org_id', pg_temp.id('1', '00'), 'case_id', pg_temp.id('1', 'ea'), 'number', 2,
    'step', 'note', 'on_day', pg_temp.today('1'), 'note', 'Called them back.', 'recorded_at', now(),
    'recorded_by', pg_temp.id('1', 'a5')) || changes
$$;
-- Each must fail on exactly the named check (its name in quotes, so cases_requester isn't
-- cases_requester_name).
create function pg_temp.bad_case(changes jsonb, rule text) returns void language sql as $$
  select pg_temp.expect_error(format('insert into public.cases select * from jsonb_populate_record(null::public.cases, %L)',
                                     pg_temp.case_json(changes)), '23514', '%"' || rule || '"%')
$$;
create function pg_temp.bad_step(changes jsonb, rule text) returns void language sql as $$
  select pg_temp.expect_error(format('insert into public.case_steps select * from jsonb_populate_record(null::public.case_steps, %L)',
                                     pg_temp.step_json(changes)), '23514', '%"' || rule || '"%')
$$;
-- A small org with requests of its own (as the superuser): Hearth, an Owner (a1), the DPO (a5), a
-- person with no role (a7) and a Member (a8), and the DPO's contact (e6, settings version 1, OD-08's
-- targets). The orgs trigger gives it its registers.
create function pg_temp.request_org(o text) returns void language plpgsql as $$
declare
  org uuid := pg_temp.id(o, '00');
begin
  insert into public.orgs (id, name) values (org, 'Request org ' || o);
  insert into public.principals (id, org_id, kind, system_key) values (pg_temp.id(o, 'a0'), org, 'system', 'hearth');
  insert into public.principals (id, org_id, kind) select pg_temp.id(o, s), org, 'human' from unnest(array['a1', 'a5', 'a7', 'a8']) s;
  insert into public.people (id, org_id, full_name, created_by)
  select pg_temp.id(o, s), org, 'Person ' || s || ' ' || o, pg_temp.id(o, 'a0') from unnest(array['a1', 'a5', 'a7', 'a8']) s;
  insert into public.role_assignments (org_id, person_id, role, created_by) values
    (org, pg_temp.id(o, 'a1'), 'owner', pg_temp.id(o, 'a0')),
    (org, pg_temp.id(o, 'a5'), 'dpo', pg_temp.id(o, 'a1'));
  insert into public.dpo_settings (id, org_id, version, contact_title, contact_email, recorded_by)
  values (pg_temp.id(o, 'e6'), org, 1, 'Data Protection Officer', 'dpo-' || o || '@fixture.example', pg_temp.id(o, 'a5'));
end
$$;
-- The reference's shape (cases_reference, PD-104).
create function pg_temp.is_reference(r text) returns boolean language sql immutable as $$
  select r ~ '^[BCDFGHJKMNPQRSTVWXZ][2-9BCDFGHJKMNPQRSTVWXZ]{3}[BCDFGHJKMNPQRSTVWXZ][2-9BCDFGHJKMNPQRSTVWXZ]{3}$'
$$;

-- RQD-17 (OD-17; PD-87): request_handling is every org's version 1, active, unpinned, needing no
-- switch, with no basis, retention or provider, named by nobody: in both fixture orgs, and in an org
-- made now (the orgs trigger reads the replaced defaults function). Only request_handling was added:
-- the defaults hold 24 purposes, five active from the start.
select pg_temp.request_org('3');
select pg_temp.check(count(*) = 3 and bool_and(r.version = 1 and r.status = 'active' and not r.pinned and not r.ai
                                               and not r.needs_switch and r.basis is null and r.retention is null
                                               and r.providers = '{}' and r.recorded_by is null),
                     format('request_handling''s rows are %s (RQD-17)', array_agg(r)))
from public.processing_register r
where r.purpose = 'request_handling' and r.org_id in (pg_temp.id('1', '00'), pg_temp.id('2', '00'), pg_temp.id('3', '00'));
select pg_temp.check(count(*) = 24 and array_agg(d.purpose order by d.purpose) filter (where d.status = 'active')
                     = '{accounts,backups,request_handling,security_audit,service_operation}',
                     'the defaults do not add request_handling alone, active (RQD-17)')
from public.processing_register_defaults() d;

-- RQD-01 (OD-06, OD-14; CLAUDE.md, Database): no runtime role holds any privilege on cases or
-- case_steps. hearth_app's SELECT, INSERT, UPDATE and DELETE are each 42501, with no org set and in
-- both orgs, and so is every job role's and hearth_worker's. Both tables have row level security on
-- with the one org policy (015 pins its text). hearth_app runs exactly the ten functions 0012 grants
-- it of 0012's; no role runs a helper or a trigger function; no job role runs any of them.
do $$
declare
  t text;
  stmt text;
  o text;
  r text;
begin
  foreach t in array array['cases', 'case_steps'] loop
    foreach stmt in array array[
      format('select count(*) from public.%I', t),
      format('insert into public.%I (org_id) values (%L)', t, pg_temp.id('1', '00')),
      format('update public.%I set org_id = org_id', t),
      format('delete from public.%I', t)] loop
      perform set_config('app.org_id', '', true);
      perform set_config('app.user_id', '', true);
      perform set_config('role', 'hearth_app', true);
      perform pg_temp.expect_error(stmt, '42501', 'permission denied%');
      perform set_config('role', 'none', true);
      foreach o in array array['1', '2'] loop
        perform pg_temp.act_as(o, 'a5');
        perform pg_temp.expect_error(stmt, '42501', 'permission denied%');
        perform set_config('role', 'none', true);
      end loop;
      foreach r in array array['hearth_queue', 'hearth_job_offboarding', 'hearth_job_partitions', 'hearth_job_purge',
                               'hearth_job_revocation', 'hearth_worker'] loop
        perform pg_temp.act_as_job('1', r);
        perform pg_temp.expect_error(stmt, '42501', 'permission denied%');
        perform set_config('role', 'none', true);
      end loop;
    end loop;
    perform pg_temp.check((select c.relrowsecurity from pg_class c where c.oid = format('public.%I', t)::regclass)
                          and (select array_agg(p.policyname::text) from pg_policies p where p.schemaname = 'public' and p.tablename = t)
                              = array['org_isolation'],
                          format('%s lacks row level security or has another policy', t));
    foreach r in array pg_temp.runtime_roles() || array['hearth_worker'] loop
      perform pg_temp.check(not exists (
        select 1 from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p
        where has_table_privilege(r, format('public.%I', t), p)
           or (p in ('SELECT', 'INSERT', 'UPDATE', 'REFERENCES') and has_any_column_privilege(r, format('public.%I', t), p))),
        format('%s holds a privilege on %s (RQD-01)', r, t));
    end loop;
  end loop;
end
$$;
do $$
declare
  granted constant text[] := array[
    'public.submit_case(text,text,uuid,text,uuid,inet)', 'public.read_own_cases(integer)',
    'public.log_case(text,text,date,uuid,text,text,text,text,uuid,text,uuid,inet)',
    'public.add_case_step(uuid,integer,text,date,text,date,text,text,text,uuid,inet)',
    'public.read_cases(boolean,integer)', 'public.read_case(uuid)', 'public.read_case_steps(uuid)',
    'public.read_case_others(uuid,integer)', 'public.case_attention()',
    'public.set_reply_targets(integer,integer,integer,text,uuid,inet)'];
  helpers constant text[] := array[
    'public.new_case_reference()', 'public.notice_states_targets(text)', 'public.case_add_business_days(date,integer)',
    'public.case_due_on(text,text,date,date,date,integer,integer,integer,integer)', 'public.case_kind_now(uuid,uuid)',
    'public.case_due(uuid,uuid)', 'public.case_replied_in_time(uuid,uuid)', 'public.cases_check_dpo(uuid,uuid)',
    'public.cases_fixed()', 'public.case_steps_unchanged()'];
  r text;
  f text;
begin
  foreach r in array pg_temp.runtime_roles() || array['hearth_worker'] loop
    foreach f in array granted loop
      perform pg_temp.check(has_function_privilege(r, f, 'EXECUTE') = (r = 'hearth_app'),
                            format('%s %s run %s (RQD-01)', r, case when r = 'hearth_app' then 'can''t' else 'can' end, f));
    end loop;
    foreach f in array helpers loop
      perform pg_temp.check(not has_function_privilege(r, f, 'EXECUTE'), format('%s can run the helper %s (RQD-01)', r, f));
    end loop;
  end loop;
  -- The ten and the helpers are every function 0012 adds: none other in public names a case.
  perform pg_temp.check(not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and (p.proname ~ 'case' or p.proname = 'set_reply_targets')
      and format('public.%s', p.oid::regprocedure) <> all (granted || helpers)),
    'a function naming a case is neither granted nor a known helper (RQD-01)');
end
$$;

-- RQD-18 (PD-110): the case functions' own message for anyone but the DPO, and the registers'
-- message unchanged for the registers' writers (and set_reply_targets(), 165's DCD-12).
select pg_temp.refused('1', 'a8', $$select * from public.read_cases(false, 201)$$, '42501',
                       'Only the Data Protection Officer can see or work on requests.');
select pg_temp.refused('1', 'a8', $$select * from public.set_register_purpose('backups', 1, 'active', 'employment', null, null,
                         'A year', '{}', null, null, null)$$, '42501', 'Only the Data Protection Officer can change the registers.');

-- RQD-09 (OD-08, OD-09; PD-92, PD-93, PPL-08): business days and due days on samples. The week of
-- Monday 2 November 2026; 25 December 2026 is a Friday and a public holiday, which counts.
select pg_temp.check(public.case_add_business_days(s.start, s.days) = s.expected,
                     format('%s + %s business days is %s, not %s (RQD-09)', s.start, s.days,
                            public.case_add_business_days(s.start, s.days), s.expected))
from (values
  ('2026-11-02'::date, 1, '2026-11-03'::date), ('2026-11-02', 2, '2026-11-04'), ('2026-11-02', 5, '2026-11-09'),
  ('2026-11-02', 10, '2026-11-16'), ('2026-11-03', 1, '2026-11-04'), ('2026-11-03', 5, '2026-11-10'),
  ('2026-11-03', 10, '2026-11-17'), ('2026-11-04', 5, '2026-11-11'), ('2026-11-05', 1, '2026-11-06'),
  -- A case due on a Monday counts as nearly due on the Thursday before (case_attention()).
  ('2026-11-05', 2, '2026-11-09'),
  -- Friday + 10 is the Friday two weeks on; a Saturday or a Sunday counts from the Monday.
  ('2026-11-06', 1, '2026-11-09'), ('2026-11-06', 10, '2026-11-20'), ('2026-11-07', 1, '2026-11-09'),
  ('2026-11-07', 2, '2026-11-10'), ('2026-11-07', 10, '2026-11-20'), ('2026-11-08', 1, '2026-11-09'),
  ('2026-11-08', 5, '2026-11-13'),
  -- A public holiday is a business day: Thursday 24 December + 1 is Christmas Day.
  ('2026-12-24', 1, '2026-12-25'), ('2026-12-24', 2, '2026-12-28')
) as s (start, days, expected);
select pg_temp.check(public.case_due_on(s.received_kind, s.current_kind, s.received_on, s.reclassified_on, s.extended_to,
                                        s.sb, s.sc, s.cb, s.cc) = s.expected,
                     format('%s gives %s, not %s (RQD-09)', s.why,
                            public.case_due_on(s.received_kind, s.current_kind, s.received_on, s.reclassified_on, s.extended_to,
                                               s.sb, s.sc, s.cb, s.cc), s.expected))
from (values
  ('no settings: 10 business days', 'question', 'question', '2026-11-02'::date, null::date, null::date,
   null::integer, null::integer, null::integer, null::integer, '2026-11-16'::date),
  ('no settings: 30 days', 'access', 'access', '2026-11-02', null, null, null, null, null, null, '2026-12-02'),
  ('received on a Saturday', 'question', 'question', '2026-11-07', null, null, null, null, null, null, '2026-11-20'),
  ('stated 7, current 10', 'complaint', 'complaint', '2026-11-02', null, null, 7, 21, 10, 30, '2026-11-11'),
  ('stated 10, current 7', 'complaint', 'complaint', '2026-11-02', null, null, 10, 30, 7, 21, '2026-11-11'),
  ('stated none, current 7', 'withdrawal', 'withdrawal', '2026-11-02', null, null, null, null, 7, 21, '2026-11-11'),
  ('14 calendar days stated', 'correction', 'correction', '2026-11-02', null, null, 10, 14, 10, 30, '2026-11-16'),
  ('30 calendar days', 'access', 'access', '2026-11-02', null, null, 10, 30, 10, 30, '2026-12-02'),
  -- In calendar days too, a shorter current target applies to a copy whatever was stated, and to one
  -- received when none was.
  ('stated 30, current 14', 'access', 'access', '2026-11-02', null, null, 10, 30, 10, 14, '2026-11-16'),
  ('stated 21, current 14', 'access', 'access', '2026-11-02', null, null, 10, 21, 10, 14, '2026-11-16'),
  ('stated none, current 14', 'correction', 'correction', '2026-11-02', null, null, null, null, 10, 14, '2026-11-16'),
  ('a question reclassified as a copy keeps the question''s day', 'question', 'access', '2026-11-02', '2026-11-04', null,
   null, null, null, null, '2026-11-16'),
  ('a copy reclassified as a question on its third day takes the question''s day', 'access', 'question', '2026-11-02',
   '2026-11-04', null, null, null, null, null, '2026-11-16'),
  ('a copy reclassified as a question three weeks on is due the next business day', 'access', 'question', '2026-11-02',
   '2026-11-23', null, null, null, null, null, '2026-11-24'),
  ('never later than the copy''s own day', 'access', 'question', '2026-11-02', '2026-12-02', null, null, null, null, null,
   '2026-12-02'),
  ('more time replaces it for a copy', 'access', 'access', '2026-11-02', null, '2026-12-20', null, null, null, null,
   '2026-12-20'),
  ('more time is ignored once it is a question', 'access', 'question', '2026-11-02', '2026-11-04', '2026-12-20', null, null,
   null, null, '2026-11-16')
) as s (why, received_kind, current_kind, received_on, reclassified_on, extended_to, sb, sc, cb, cc, expected);
select pg_temp.check(not public.notice_states_targets(null) and not public.notice_states_targets('c09.1')
                     and not public.notice_states_targets('c09.2') and public.notice_states_targets('c09.3'),
                     'notice_states_targets() is wrong for null, c09.1, c09.2 or c09.3 (RQD-09)');
-- case_due() over the fixture's cases joins the stated settings version (none: e3 is a stand-in)
-- and the current one (e6, OD-08's figures), and agrees with case_due_on() on the same raw values.
select pg_temp.check(public.case_due(c.org_id, c.id)
                     = public.case_due_on(c.kind, c.kind, c.received_on, null, null, null, null, 10, 30)
                     and c.stated_settings_version is null,
                     format('case_due() disagrees with case_due_on() for %s (RQD-09)', c.id))
from public.cases c where c.id in (pg_temp.id('1', 'e8'), pg_temp.id('1', 'ea'), pg_temp.id('2', 'e8'), pg_temp.id('2', 'ea'));
select pg_temp.check(public.case_due(pg_temp.id('1', '00'), pg_temp.id('1', 'e8')) = public.case_add_business_days(pg_temp.today('1'), 10)
                     and public.case_due(pg_temp.id('1', '00'), pg_temp.id('1', 'ea')) = pg_temp.today('1') - 3 + 30,
                     'the fixture''s cases are not due on the days OD-08 gives (RQD-09)');

-- RQD-11 (OD-08, OD-26; PD-94): the targets' checks refuse 4, 11, 13 and 31 on a superuser's insert
-- (23514 naming the constraint), and a version read 10 and 30 by default (as 165's DCD-11).
select pg_temp.expect_error(format($f$insert into public.dpo_settings (org_id, version, contact_title, contact_email, recorded_by, %I)
                                      values (%L, 9, 'Data Protection Officer', 'dpo@fixture.example', %L, %s)$f$,
                                   x.col, pg_temp.id('1', '00'), pg_temp.id('1', 'a5'), x.n), '23514', '%dpo_settings_' || x.col || '%')
from (values ('target_business_days', 4), ('target_business_days', 11), ('target_calendar_days', 13),
             ('target_calendar_days', 31)) as x (col, n);
select pg_temp.check(bool_and(target_business_days = 10 and target_calendar_days = 30), 'a fixture contact does not read 10 and 30')
from public.dpo_settings where id in (pg_temp.id('1', 'e6'), pg_temp.id('2', 'e6'));

-- RQD-12 (OD-06, T22 item 20): a restriction cites only one of its own org's cases (23503 for
-- another org's case or an unknown one), takes one of its own (in a savepoint, a7's withdrawal of
-- presence_receipts, which rests on consent in org 1), and still takes none. As the superuser: no
-- writer exists until C2.11.
select pg_temp.expect_error(format($f$insert into public.processing_restrictions (org_id, person_id, purpose, effective_at, created_by,
                                      case_id) values (%L, %L, 'presence_receipts', now(), %L, %L)$f$,
                                   pg_temp.id('1', '00'), pg_temp.id('1', 'a7'), pg_temp.id('1', 'a5'), x), '23503',
                            '%processing_restrictions_case%')
from unnest(array[pg_temp.id('2', 'e8'), gen_random_uuid()]) x;
savepoint rqd_12;
insert into public.processing_restrictions (org_id, person_id, purpose, effective_at, created_by, case_id)
values (pg_temp.id('1', '00'), pg_temp.id('1', 'a7'), 'presence_receipts', now(), pg_temp.id('1', 'a5'), pg_temp.id('1', 'e8'));
rollback to savepoint rqd_12;
savepoint rqd_12;
insert into public.processing_restrictions (org_id, person_id, purpose, effective_at, created_by)
values (pg_temp.id('1', '00'), pg_temp.id('1', 'a7'), 'presence_receipts', now(), pg_temp.id('1', 'a5'));
rollback to savepoint rqd_12;

-- RQD-02 (PD-88, PD-90, PD-102; DB-04): each check refuses its bad shape, as the superuser. The
-- requester: a person and a name together; a channel without its address, and an address without
-- its channel, for someone without an account and for a person; a form request with a channel.
select pg_temp.bad_case(jsonb_build_object('requester_person_id', pg_temp.id('1', 'a8')), 'cases_requester');
select pg_temp.bad_case('{"requester_contact": null}', 'cases_requester');
select pg_temp.bad_case('{"requester_channel": null}', 'cases_requester');
select pg_temp.bad_case(jsonb_build_object('requester_person_id', pg_temp.id('1', 'a8'), 'requester_name', null,
                                           'requester_contact', null), 'cases_requester');
select pg_temp.bad_case(jsonb_build_object('requester_person_id', pg_temp.id('1', 'a8'), 'requester_name', null,
                                           'requester_channel', null), 'cases_requester');
select pg_temp.bad_case(jsonb_build_object('came_by', 'hearth', 'requester_person_id', pg_temp.id('1', 'a8'),
                                           'logged_by', pg_temp.id('1', 'a8'), 'requester_name', null), 'cases_form_channel');
-- Sent in Hearth by someone else's hand, or logged as if by the requester.
select pg_temp.bad_case(jsonb_build_object('came_by', 'hearth', 'requester_person_id', pg_temp.id('1', 'a8'),
                                           'requester_name', null, 'requester_channel', null, 'requester_contact', null),
                        'cases_sent_by_requester');
-- A person requester with a channel and its address in shape is accepted (PPL-01), as is a form
-- request's own words holding an ID-number shape (a requester's words are theirs, PD-102).
savepoint rqd_02;
insert into public.cases select * from jsonb_populate_record(null::public.cases, pg_temp.case_json(jsonb_build_object(
  'requester_person_id', pg_temp.id('1', 'a8'), 'requester_name', null, 'requester_channel', 'phone',
  'requester_contact', '+65 8000 0101')));
insert into public.cases select * from jsonb_populate_record(null::public.cases, pg_temp.case_json(jsonb_build_object(
  'came_by', 'hearth', 'requester_person_id', pg_temp.id('1', 'a8'), 'logged_by', pg_temp.id('1', 'a8'),
  'requester_name', null, 'requester_channel', null, 'requester_contact', null,
  'details', 'My card says S1234567D, which the crew can see.')));
rollback to savepoint rqd_02;
-- An address in the wrong shape (0011's samples, by channel).
select pg_temp.bad_case(jsonb_build_object('requester_channel', x.channel, 'requester_contact', x.contact), 'cases_requester_contact')
from (values ('email', 'not-an-email'), ('email', 'sam @requester.example'), ('email', repeat('a', 64) || '@' || repeat('b', 186) || '.example'),
             ('phone', '80000101'), ('phone', '+65 8000 0101 '), ('phone', '+65--80000101'),
             ('post', ' 1 Example Road'), ('post', E'1 Example Road\n\nSingapore 000000'), ('post', ',,,'),
             ('post', repeat('Road ', 101)), ('post', E'1 Example Road\tSingapore')) as x (channel, contact);
-- A name on two lines; a bidirectional-formatting character (U+202E, built with U&'' so neither
-- this file nor the migration holds the raw character) in a name, a postal address, the details, a
-- closing note and a step note.
select pg_temp.bad_case(jsonb_build_object('requester_name', E'Sam\nExample'), 'cases_requester_name');
select pg_temp.bad_case(jsonb_build_object('requester_name', 'Sam ' || U&'\202E' || 'Example'), 'cases_requester_name');
select pg_temp.bad_case(jsonb_build_object('requester_channel', 'post', 'requester_contact', '1 Example Road' || U&'\202E'),
                        'cases_requester_contact');
select pg_temp.bad_case(jsonb_build_object('details', 'Wants a copy ' || U&'\202E' || 'of their data.'), 'cases_details');
select pg_temp.bad_case(jsonb_build_object('closed_on', pg_temp.today('1'), 'closed_kind', 'question', 'outcome', 'answered',
                                           'closed_at', now(), 'closed_by', pg_temp.id('1', 'a5'),
                                           'closed_note', 'Replied ' || U&'\202E' || 'by email.'), 'cases_closed_note');
select pg_temp.bad_step(jsonb_build_object('note', 'Called ' || U&'\202E' || 'them back.'), 'case_steps_note');
-- An NRIC- or FIN-shaped string in anything the DPO types: an outside requester's name, an address,
-- a logged request's details, a closing note and a step note (OD-16).
select pg_temp.bad_case(jsonb_build_object('requester_name', 'S1234567D'), 'cases_no_id_numbers');
select pg_temp.bad_case(jsonb_build_object('requester_contact', 's1234567d@requester.example'), 'cases_no_id_numbers');
select pg_temp.bad_case(jsonb_build_object('details', 'Their FIN is G7654321K.'), 'cases_no_id_numbers');
select pg_temp.bad_case(jsonb_build_object('closed_on', pg_temp.today('1'), 'closed_kind', 'question', 'outcome', 'answered',
                                           'closed_at', now(), 'closed_by', pg_temp.id('1', 'a5'),
                                           'closed_note', 'Matched T1234567J.'), 'cases_no_id_numbers');
select pg_temp.bad_step(jsonb_build_object('note', 'Card m1234567x seen.'), 'case_steps_note');
-- No words: for a question, and for a copy the DPO logged (only a copy sent in Hearth may be blank).
select pg_temp.bad_case('{"details": null}', 'cases_details');
select pg_temp.bad_case('{"details": null, "kind": "access"}', 'cases_details');
select pg_temp.bad_case('{"details": " Padded"}', 'cases_details');
-- The closure: a refusal without why, and one of a question, a complaint or a withdrawal; logged in
-- error on a request sent in Hearth; four of its five columns; closed before it was received.
select pg_temp.bad_case(jsonb_build_object('kind', 'access', 'closed_on', pg_temp.today('1'), 'closed_kind', 'access',
                                           'outcome', 'refused', 'closed_at', now(), 'closed_by', pg_temp.id('1', 'a5')),
                        'cases_refused');
select pg_temp.bad_case(jsonb_build_object('kind', k, 'closed_on', pg_temp.today('1'), 'closed_kind', k, 'outcome', 'refused',
                                           'closed_at', now(), 'closed_by', pg_temp.id('1', 'a5'), 'closed_note', 'Not ours to give.'),
                        'cases_refused')
from unnest(array['question', 'complaint', 'withdrawal']) k;
select pg_temp.bad_case(jsonb_build_object('came_by', 'hearth', 'requester_person_id', pg_temp.id('1', 'a8'),
                                           'logged_by', pg_temp.id('1', 'a8'), 'requester_name', null, 'requester_channel', null,
                                           'requester_contact', null, 'closed_on', pg_temp.today('1'), 'closed_kind', 'question',
                                           'outcome', 'logged_in_error', 'closed_at', now(), 'closed_by', pg_temp.id('1', 'a5')),
                        'cases_logged_in_error');
select pg_temp.bad_case(jsonb_build_object('closed_on', pg_temp.today('1'), 'closed_kind', 'question', 'outcome', 'answered',
                                           'closed_at', now()), 'cases_closed');
select pg_temp.bad_case(jsonb_build_object('closed_on', pg_temp.today('1') - 1, 'closed_kind', 'question', 'outcome', 'answered',
                                           'closed_at', now(), 'closed_by', pg_temp.id('1', 'a5')), 'cases_closed_on');
select pg_temp.bad_case('{"kind": "praise"}', 'cases_kind');
select pg_temp.bad_case('{"came_by": "fax"}', 'cases_came_by');
select pg_temp.bad_case('{"reference": "k7qmx3td"}', 'cases_reference');
-- The steps: more time without its date, or with one before its day; a reclassification without a
-- kind; an identity check without a note, or on two lines; a step that isn't one; and a number
-- twice (the unique backstop, 23505).
select pg_temp.bad_step('{"step": "extended", "note": null}', 'case_steps_extended');
select pg_temp.bad_step(jsonb_build_object('step', 'extended', 'note', null, 'extended_to', pg_temp.today('1') - 1), 'case_steps_extended');
select pg_temp.bad_step('{"step": "reclassified", "note": null}', 'case_steps_kind');
select pg_temp.bad_step('{"step": "identity_checked", "note": null}', 'case_steps_needs_note');
select pg_temp.bad_step(jsonb_build_object('step', 'identity_checked', 'note', E'By video call\nand a letter'), 'case_steps_identity');
select pg_temp.bad_step('{"step": "closed"}', 'case_steps_step');
select pg_temp.expect_error(format('insert into public.case_steps select * from jsonb_populate_record(null::public.case_steps, %L)',
                                   pg_temp.step_json(jsonb_build_object('case_id', pg_temp.id('1', 'e8'), 'number', 1))),
                            '23505', '%case_steps_order%');
-- cases_fixed(): what was received never changes and the closure is written once, as the owner and
-- as the superuser; case_steps_unchanged(): a step never changes.
do $$
declare
  change text;
  who text;
begin
  foreach who in array array['hearth_owner', 'none'] loop
    foreach change in array array[
      'reference = ''BCDFBCDF''', 'client_key = gen_random_uuid()', 'kind = ''question''', 'came_by = ''letter''',
      'received_on = received_on - 1', 'logged_at = logged_at - interval ''1 hour''',
      format('logged_by = %L', pg_temp.id('1', 'a1')), 'requester_name = ''Sam Other''',
      'requester_channel = ''phone'', requester_contact = ''+65 8000 0102''', 'details = ''Other words.''',
      'stated_settings_version = 1'] loop
      perform set_config('role', who, true);
      perform pg_temp.expect_error(format('update public.cases set %s where id = %L', change, pg_temp.id('1', 'ea')), '23514',
                                   'A request keeps what was received, and is closed only once. Add a step instead.');
      perform set_config('role', 'none', true);
    end loop;
    perform set_config('role', who, true);
    perform pg_temp.expect_error(format('update public.cases set requester_person_id = %L where id = %L', pg_temp.id('1', 'a7'),
                                        pg_temp.id('1', 'e8')), '23514', 'A request keeps what was received%');
    perform pg_temp.expect_error(format('update public.case_steps set note = ''Other words.'' where id = %L', pg_temp.id('1', 'eb')),
                                 '23514', 'A step on a request never changes. Add another step instead.');
    perform pg_temp.expect_error(format('update public.case_steps set number = 7 where id = %L', pg_temp.id('1', 'e9')),
                                 '23514', 'A step on a request never changes. Add another step instead.');
    perform set_config('role', 'none', true);
  end loop;
end
$$;
savepoint rqd_02;
update public.cases set closed_on = pg_temp.today('1'), closed_kind = 'access', outcome = 'answered', closed_at = now(),
                        closed_by = pg_temp.id('1', 'a5')
where id = pg_temp.id('1', 'ea');
select pg_temp.expect_error(format('update public.cases set closed_note = ''Sent the copy.'' where id = %L', pg_temp.id('1', 'ea')),
                            '23514', 'A request keeps what was received, and is closed only once.%');
select pg_temp.expect_error(format('update public.cases set closed_on = null, closed_kind = null, outcome = null, closed_at = null,
                                      closed_by = null where id = %L', pg_temp.id('1', 'ea')),
                            '23514', 'A request keeps what was received, and is closed only once.%');
rollback to savepoint rqd_02;

-- RQD-03 (OD-07, OD-13, OD-15; PD-93, PD-96, PD-100; every ACC-10 persona through app.user_id):
-- submit_case() records for each person still at the organisation, a1 to a8 (the DPO among them)
-- and aa (a revoked role, still here): sent in Hearth, themselves as requester and logger, today in
-- the org's zone, a reference in the pattern, due ten business days on (no targets stated under the
-- fixture's stand-in, OD-08's figures current), and one audit row naming the case by its target and
-- nothing else. Refused (42501): a9 (left), the agent ab, the assistant ac, Hearth a0, and no org or
-- user set.
do $$
declare
  who text;
  got record;
  d date := pg_temp.today('1');
begin
  foreach who in array array['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'aa'] loop
    perform pg_temp.act_as('1', who);
    select * into got from pg_temp.send('question', 'How long are the rota sheets kept? ' || who);
    perform set_config('role', 'none', true);
    perform pg_temp.check(got.changed and got.received_on = d and pg_temp.is_reference(got.reference)
                          and got.due_on = public.case_add_business_days(d, 10),
                          format('%s''s request answered %s (RQD-03)', who, got));
    perform pg_temp.check(exists (
      select 1 from public.cases c
      where c.id = got.id and c.org_id = pg_temp.id('1', '00') and c.reference = got.reference and c.came_by = 'hearth'
        and c.kind = 'question' and c.received_on = d and c.requester_person_id = pg_temp.id('1', who)
        and c.logged_by = pg_temp.id('1', who) and c.requester_name is null and c.requester_channel is null
        and c.details = 'How long are the rota sheets kept? ' || who and c.stated_settings_version is null
        and c.closed_at is null), format('%s''s request was not stored as sent (RQD-03)', who));
    perform pg_temp.check((select count(*) = 1 and bool_and(
                             a.org_id = pg_temp.id('1', '00') and a.actor_id = pg_temp.id('1', who) and a.action = 'case.submitted'
                             and a.target_type = 'case' and a.details = '{}' and a.case_id is null and a.reason is null
                             and a.request_id = 'req-case' and a.device_id = 'd0000000-0000-4000-8000-0000000000d3'
                             and a.ip = '192.0.2.60')
                           from public.audit_events a where a.target_id = got.id::text),
                          format('%s''s request has not exactly its one audit row (RQD-03, PD-100)', who));
  end loop;
end
$$;
select pg_temp.refused('1', who, $$select * from pg_temp.send('question', 'Planted.')$$, '42501',
                       'Only someone still at the organisation can send a request.')
from unnest(array['a9', 'ab', 'ac', 'a0']) who;
do $$
declare
  before text := pg_temp.written();
begin
  perform set_config('app.org_id', pg_temp.id('1', '00')::text, true);
  perform set_config('app.user_id', '', true);
  perform set_config('role', 'hearth_app', true);
  perform pg_temp.expect_error($f$select * from pg_temp.send('question', 'Planted.')$f$, '42501', 'No org or user is set for this transaction');
  perform set_config('app.org_id', '', true);
  perform set_config('app.user_id', pg_temp.id('1', 'a8')::text, true);
  perform pg_temp.expect_error($f$select * from pg_temp.send('question', 'Planted.')$f$, '42501', 'No org or user is set for this transaction');
  perform set_config('role', 'none', true);
  perform pg_temp.check(pg_temp.written() = before, 'a request with no org or user wrote something');
end
$$;
-- Its rules, in order, each HF006 with its message, writing nothing: a kind that isn't one; no
-- words for anything but a copy; 4,001 code points; a control character; U+2066 (built with chr());
-- no client key.
select pg_temp.refused('1', 'a8', x.stmt, 'HF006', x.message)
from (values
  ($$select * from pg_temp.send('praise', 'Thank you.')$$, 'Choose what the request is about.'),
  ($$select * from pg_temp.send(null, 'Thank you.')$$, 'Choose what the request is about.'),
  ($$select * from pg_temp.send('question', E' \t\r\n ')$$, 'Write what it''s about.'),
  ($$select * from pg_temp.send('complaint', null)$$, 'Write what it''s about.'),
  ($$select * from pg_temp.send('question', repeat('é', 4001))$$, 'Keep it to 4,000 characters of plain text.'),
  ($$select * from pg_temp.send('question', 'A bell ' || chr(7))$$, 'Keep it to 4,000 characters of plain text.'),
  ($$select * from pg_temp.send('question', 'An isolate ' || chr(8294) || 'here')$$, 'Keep it to 4,000 characters of plain text.'),
  ($$select * from public.submit_case('question', 'No key.', null, 'req-case', null, null)$$, 'Send it from the form again.')
) as x (stmt, message);
-- What records: 4,000 code points; a copy with nothing written; JavaScript's whitespace trimmed at
-- both ends and CRLF read as LF; a requester's own words holding an ID-number shape, or "asked"
-- (never held to AI_COPY or the NRIC rule, PD-102).
do $$
declare
  got record;
  words text;
begin
  perform pg_temp.act_as('1', 'a6');
  select * into got from pg_temp.send('question', repeat('é', 4000));
  perform set_config('role', 'none', true);
  perform pg_temp.check(got.changed and (select length(details) from public.cases where id = got.id) = 4000,
                        '4,000 code points did not record (RQD-03)');
  perform pg_temp.act_as('1', 'a6');
  select * into got from pg_temp.send('access', U&'\00A0 \3000');
  perform set_config('role', 'none', true);
  perform pg_temp.check(got.changed and (select details is null from public.cases where id = got.id),
                        'a copy with nothing written did not record with no words (RQD-03)');
  perform pg_temp.act_as('1', 'a6');
  select * into got from pg_temp.send('correction', U&'\FEFF\2003 My surname is spelt wrong.' || E'\r\n'
                                                       || 'It is Example. ' || E'\t' || U&'\2029');
  perform set_config('role', 'none', true);
  select details into words from public.cases where id = got.id;
  perform pg_temp.check(words = E'My surname is spelt wrong.\nIt is Example.', format('the words were stored as %L (RQD-03)', words));
  perform pg_temp.act_as('1', 'a6');
  select * into got from pg_temp.send('complaint', 'They asked for my NRIC, S1234567D, at the door.');
  perform set_config('role', 'none', true);
  perform pg_temp.check(got.changed and (select details from public.cases where id = got.id)
                                         = 'They asked for my NRIC, S1234567D, at the door.',
                        'a requester''s own words with "asked" and an ID-number shape did not record as written (RQD-03)');
end
$$;
-- The settings version stated at receipt (PD-93): the latest published version's link, when its
-- generator states targets. In org 2, under a c09.2 version linking settings version 1 (inserted as
-- the owner, as 0011's publish_notice() leaves one), none; under a c09.3 version linking it, 1. In
-- org 1, under the fixture's stand-in, none (above).
insert into public.notice_versions (org_id, version, body, published_by, generator, dpo_settings_version)
values (pg_temp.id('2', '00'), 1, 'Privacy notice', pg_temp.id('2', 'a5'), 'c09.2', 1);
select pg_temp.act_as('2', 'a8');
select set_config('test.c092', id::text, true) from pg_temp.send('question', 'Asked under c09.2.');
reset role;
insert into public.notice_versions (org_id, version, body, published_by, generator, dpo_settings_version)
values (pg_temp.id('2', '00'), 2, 'Privacy notice', pg_temp.id('2', 'a5'), 'c09.3', 1);
select pg_temp.act_as('2', 'a8');
select set_config('test.c093', id::text, true) from pg_temp.send('question', 'Asked under c09.3.');
reset role;
select pg_temp.check(
  (select stated_settings_version is null from public.cases where id = current_setting('test.c092')::uuid)
  and (select stated_settings_version = 1 from public.cases where id = current_setting('test.c093')::uuid),
  'the stated settings version is not none under c09.2 and 1 under c09.3 (RQD-03, PD-93)');
-- RQD-09 (OD-26; PD-92, PD-93): case_due() on a copy whose receipt stated targets, in org 2, in a
-- savepoint. The DPO sets 7 business days and 21 days (settings version 2), a c09.3 version linking
-- it is published (as the owner leaves one), and a8 asks for a copy: it states version 2 and is due
-- 21 days on, its stated calendar target and never its business one. The DPO then sets 10 and 14
-- (version 3): it is due 14 days on, the shorter current target. Then 10 and 30 (version 4): it is
-- due 21 days on again, never later than it was told.
savepoint rqd_09;
select pg_temp.act_as('2', 'a5');
select pg_temp.check(t.version = 2 and t.changed, format('the DPO''s targets answered %s (RQD-09)', t))
from public.set_reply_targets(1, 7, 21, 'req-case', 'd0000000-0000-4000-8000-0000000000d3', '192.0.2.60') t;
reset role;
insert into public.notice_versions (org_id, version, body, published_by, generator, dpo_settings_version)
values (pg_temp.id('2', '00'), 3, 'Privacy notice', pg_temp.id('2', 'a5'), 'c09.3', 2);
select pg_temp.act_as('2', 'a8');
select set_config('test.stated_copy', s.id::text, true) from pg_temp.send('access', null) s;
reset role;
select pg_temp.check(c.stated_settings_version = 2 and public.case_due(c.org_id, c.id) = c.received_on + 21,
                     format('a copy sent under targets of 7 and 21 states %s and is due %s, not version 2 and %s (RQD-09)',
                            c.stated_settings_version, public.case_due(c.org_id, c.id), c.received_on + 21))
from public.cases c where c.id = current_setting('test.stated_copy')::uuid;
select pg_temp.act_as('2', 'a5');
select pg_temp.check(t.version = 3 and t.changed, format('the DPO''s targets answered %s (RQD-09)', t))
from public.set_reply_targets(2, 10, 14, 'req-case', 'd0000000-0000-4000-8000-0000000000d3', '192.0.2.60') t;
reset role;
select pg_temp.check(public.case_due(c.org_id, c.id) = c.received_on + 14,
                     format('a copy stated 21 days is due %s under a current 14, not %s (RQD-09, PD-92)',
                            public.case_due(c.org_id, c.id), c.received_on + 14))
from public.cases c where c.id = current_setting('test.stated_copy')::uuid;
select pg_temp.act_as('2', 'a5');
select pg_temp.check(t.version = 4 and t.changed, format('the DPO''s targets answered %s (RQD-09)', t))
from public.set_reply_targets(3, 10, 30, 'req-case', 'd0000000-0000-4000-8000-0000000000d3', '192.0.2.60') t;
reset role;
select pg_temp.check(public.case_due(c.org_id, c.id) = c.received_on + 21,
                     format('a copy stated 21 days is due %s under a current 30, not %s (RQD-09, PD-92)',
                            public.case_due(c.org_id, c.id), c.received_on + 21))
from public.cases c where c.id = current_setting('test.stated_copy')::uuid;
rollback to savepoint rqd_09;

-- RQD-04 (PD-96): a resend from the same sheet (the same client key) returns the same case and
-- reference with changed false and writes nothing; another member's identical key records their own
-- case (a key is unique per writer); and the DPO's log with a key equal to a member's records too.
do $$
declare
  k uuid := gen_random_uuid();
  first record;
  again record;
  logged record;
  before text;
  d date := pg_temp.today('1');
begin
  perform pg_temp.act_as('1', 'a7');
  select * into first from pg_temp.send('complaint', 'The noticeboard lists my leave days.', k);
  perform set_config('role', 'none', true);
  before := pg_temp.written();
  perform pg_temp.act_as('1', 'a7');
  select * into again from pg_temp.send('question', 'Other words, the same sheet.', k);
  perform set_config('role', 'none', true);
  perform pg_temp.check(again.id = first.id and again.reference = first.reference and not again.changed
                        and again.received_on = first.received_on and again.due_on = first.due_on,
                        format('a resend answered %s, not the first case %s (RQD-04)', again, first));
  perform pg_temp.check(pg_temp.written() = before, 'a resend wrote something (RQD-04)');
  perform pg_temp.check((select kind = 'complaint' and details = 'The noticeboard lists my leave days.' from public.cases where id = first.id),
                        'a resend changed the first case (RQD-04)');
  perform pg_temp.act_as('1', 'a6');
  select * into again from pg_temp.send('question', 'The same key, another person.', k);
  perform set_config('role', 'none', true);
  perform pg_temp.check(again.changed and again.id <> first.id, 'another member''s identical key did not record their own case (RQD-04)');
  perform pg_temp.act_as('1', 'a5');
  select * into logged from pg_temp.log('question', 'email', d, pg_temp.id('1', 'a8'), null, null, null, 'Wrote in about rotas.', k);
  perform set_config('role', 'none', true);
  perform pg_temp.check(logged.changed and logged.id not in (first.id, again.id),
                        'the DPO''s log with a member''s key did not record (RQD-04)');
end
$$;
-- A key returns only a case sent the same way (PD-96, OD-14, OD-15), in a savepoint. The DPO (a5)
-- logs a complaint for a8 under one key and sends a request of their own under another. log_case()
-- given the key of their own send is refused (HF006), never answering it as a log; and once a5 has
-- lost the dpo role, the form given their old dialog's key is refused the same way, returning no
-- case about a8. Each writes nothing.
savepoint rqd_04;
select pg_temp.act_as('1', 'a5');
select pg_temp.check(l.changed, 'the DPO''s log did not record (RQD-04)')
from pg_temp.log('complaint', 'email', pg_temp.today('1'), pg_temp.id('1', 'a8'), null, null, null, 'Wrote about the noticeboard.',
                 'f0000000-0000-4000-8000-0000000000a1') l;
select pg_temp.check(s.changed, 'the DPO''s own request did not record (RQD-04)')
from pg_temp.send('question', 'How long is my own rota kept?', 'f0000000-0000-4000-8000-0000000000a2') s;
reset role;
select pg_temp.refused('1', 'a5', format($f$select * from pg_temp.log('question', 'email', %L, %L, null, null, null, 'Asks.',
                                            'f0000000-0000-4000-8000-0000000000a2')$f$, pg_temp.today('1'), pg_temp.id('1', 'a8')),
                       'HF006', 'Send it from the form again.');
update public.role_assignments set revoked_at = now(), revoked_by = pg_temp.id('1', 'a1')
where org_id = pg_temp.id('1', '00') and person_id = pg_temp.id('1', 'a5') and role = 'dpo' and revoked_at is null;
select pg_temp.refused('1', 'a5', $$select * from pg_temp.send('question', 'Anything.', 'f0000000-0000-4000-8000-0000000000a1')$$,
                       'HF006', 'Send it from the form again.');
select pg_temp.refused('1', 'a5', $$select * from pg_temp.send('access', null, 'f0000000-0000-4000-8000-0000000000a1')$$,
                       'HF006', 'Send it from the form again.');
rollback to savepoint rqd_04;

-- RQD-05 (PD-96, OD-25): at most 10 open requests per requester. In org 5, a7 sends 8; a case the
-- DPO logged for a7 and closed doesn't count, and one the DPO logged for a7 that is open does (the
-- 9th); a8's and another org's don't count; the 10th records and the 11th is refused (HF006),
-- writing nothing; once the DPO closes one, the next records.
select pg_temp.request_org('5');
do $$
declare
  d date := pg_temp.today('5');
  i integer;
  got record;
  closed uuid;
  before text;
begin
  for i in 1 .. 8 loop
    perform pg_temp.act_as('5', 'a7');
    perform pg_temp.send('question', format('Question %s about the rota.', i));
    perform set_config('role', 'none', true);
  end loop;
  for i in 1 .. 3 loop
    perform pg_temp.act_as('5', 'a8');
    perform pg_temp.send('question', format('A8''s question %s.', i));
    perform set_config('role', 'none', true);
  end loop;
  perform pg_temp.act_as('5', 'a5');
  select id into closed from pg_temp.log('question', 'phone', d, pg_temp.id('5', 'a7'), null, null, null, 'Rang about the rota.');
  perform pg_temp.check(pg_temp.step(closed, 0, 'closed', d, null, null, null, 'duplicate') = 1, 'the DPO could not close a duplicate');
  perform pg_temp.log('complaint', 'letter', d, pg_temp.id('5', 'a7'), null, null, null, 'Wrote about the noticeboard.');
  perform set_config('role', 'none', true);
  perform pg_temp.act_as('5', 'a7');
  select * into got from pg_temp.send('question', 'The tenth.');
  perform set_config('role', 'none', true);
  perform pg_temp.check(got.changed, 'the 10th open request was refused (RQD-05)');
  perform pg_temp.refused('5', 'a7', $f$select * from pg_temp.send('question', 'The eleventh.')$f$, 'HF006',
    'You have 10 open requests. You can send another once one is closed, or contact the Data Protection Officer directly.');
  perform pg_temp.act_as('5', 'a5');
  perform pg_temp.step(got.id, 0, 'closed', d, null, null, null, 'withdrawn');
  perform set_config('role', 'none', true);
  perform pg_temp.act_as('5', 'a7');
  select * into got from pg_temp.send('question', 'The eleventh, once one closed.');
  perform set_config('role', 'none', true);
  perform pg_temp.check(got.changed, 'a request after one was closed was refused (RQD-05)');
end
$$;

-- RQD-06 (OD-16; PD-89, PD-93, PPL-01, PPL-14): log_case() records only for a5, the DPO still at the
-- org. Refused (42501, cases_check_dpo()'s message): the Owner, an Admin, AI Admin, Leadership, the
-- Compliance Officer, a Team Admin, a Member, a former Admin, a DPO who has left (a9), the agent, the
-- assistant and Hearth, writing nothing.
select pg_temp.refused('1', who, format($f$select * from pg_temp.log('question', 'email', %L, null, 'Sam Example', 'email',
                                           'sam@requester.example', 'Asks about rotas.')$f$, pg_temp.today('1')),
                       '42501', 'Only the Data Protection Officer can see or work on requests.')
from unnest(array['a1', 'a2', 'a3', 'a4', 'a6', 'a7', 'a8', 'aa', 'a9', 'ab', 'ac', 'a0']) who;
-- The DPO naming themselves (42501), and a person of another org (22023).
select pg_temp.refused('1', 'a5', format($f$select * from pg_temp.log('question', 'email', %L, %L, null, null, null, 'Asks.')$f$,
                                         pg_temp.today('1'), pg_temp.id('1', 'a5')),
                       '42501', 'Send a request of your own from Settings › Privacy.');
select pg_temp.refused('1', 'a5', format($f$select * from pg_temp.log('question', 'email', %L, %L, null, null, null, 'Asks.')$f$,
                                         pg_temp.today('1'), pg_temp.id('2', 'a8')),
                       '22023', 'There is no such person at the organisation.');
-- Each rule, HF006 with its message, in logProblems()' order, writing nothing (the DPO, org 1).
select pg_temp.refused('1', 'a5', format('select * from pg_temp.log(%s)', x.args), 'HF006', x.message)
from (select format('%L, %L, %L, %s, %s, %s, %s, %s', coalesce(r.kind, 'question'), coalesce(r.came_by, 'email'),
                    coalesce(r.received_on, pg_temp.today('1')), coalesce(r.person, 'null'), coalesce(r.name, 'null'),
                    coalesce(r.channel, 'null'), coalesce(r.contact, 'null'), coalesce(r.details, quote_literal('Asks about rotas.')))
             as args, r.message
      from (values
        -- A person and a name together.
        (null, null, null::date, quote_literal(pg_temp.id('1', 'a8')), quote_literal('Sam Example'), null, null, null,
         'Name a person at the organisation, or someone without an account, not both.'),
        -- Someone who has left needs one way to reach them (PPL-01).
        (null, null, null, quote_literal(pg_temp.id('1', 'a9')), null, null, null, null,
         'Give how to reach them: they have left the organisation.'),
        -- Someone without an account: their name, on one line of plain text, with no ID number.
        (null, null, null, null, null, quote_literal('email'), quote_literal('sam@requester.example'), null,
         'Give the name of the person who sent it.'),
        (null, null, null, null, quote_literal(' '), quote_literal('email'), quote_literal('sam@requester.example'), null,
         'Give the name of the person who sent it.'),
        (null, null, null, null, quote_literal(repeat('S', 201)), quote_literal('email'), quote_literal('sam@requester.example'), null,
         'Keep the name to at most 200 characters.'),
        (null, null, null, null, quote_literal(E'Sam\nExample'), quote_literal('email'), quote_literal('sam@requester.example'), null,
         'Keep the name to one line.'),
        (null, null, null, null, quote_literal('Sam' || chr(7)), quote_literal('email'), quote_literal('sam@requester.example'), null,
         'Write the name as plain text.'),
        (null, null, null, null, quote_literal('Sam ' || U&'\202E' || 'Example'), quote_literal('email'),
         quote_literal('sam@requester.example'), null, 'Write the name as plain text.'),
        (null, null, null, null, quote_literal('Sam F1234567N'), quote_literal('email'), quote_literal('sam@requester.example'), null,
         'Leave the ID number out of the name.'),
        -- And one channel, with its address in that channel's shape.
        (null, null, null, null, quote_literal('Sam Example'), null, null, null,
         'Give one way to reach them: an email address, a phone number or a postal address.'),
        (null, null, null, null, quote_literal('Sam Example'), quote_literal('fax'), quote_literal('+65 8000 0101'), null,
         'Give one way to reach them: an email address, a phone number or a postal address.'),
        (null, null, null, null, quote_literal('Sam Example'), quote_literal('email'), quote_literal('not-an-email'), null,
         'Enter an email address such as name@example.org.'),
        (null, null, null, null, quote_literal('Sam Example'), quote_literal('email'), null, null,
         'Enter an email address such as name@example.org.'),
        (null, null, null, null, quote_literal('Sam Example'), quote_literal('phone'), quote_literal('80000101'), null,
         'Enter the phone number with + and the country code, such as +65.'),
        (null, null, null, null, quote_literal('Sam Example'), quote_literal('post'), quote_literal(E'1 Example Road\n\nSingapore'), null,
         'Keep the postal address to 500 characters of plain text.'),
        (null, null, null, null, quote_literal('Sam Example'), quote_literal('post'), quote_literal('1 Example Road' || U&'\202E'), null,
         'Keep the postal address to 500 characters of plain text.'),
        (null, null, null, null, quote_literal('Sam Example'), quote_literal('post'), quote_literal(',,,'), null,
         'Write the postal address itself: it needs a letter or a digit, not only punctuation.'),
        (null, null, null, null, quote_literal('Sam Example'), quote_literal('email'), quote_literal('s1234567d@requester.example'), null,
         'Leave the ID number out of how to reach them.'),
        -- A person's channel too: in shape, and with no ID number.
        (null, null, null, quote_literal(pg_temp.id('1', 'a8')), null, quote_literal('email'), quote_literal('mel@'), null,
         'Enter an email address such as name@example.org.'),
        (null, null, null, quote_literal(pg_temp.id('1', 'a8')), null, null, quote_literal('mel@home.example'), null,
         'Give one way to reach them: an email address, a phone number or a postal address.'),
        (null, null, null, quote_literal(pg_temp.id('1', 'a8')), null, quote_literal('post'), quote_literal('Block S1234567D'), null,
         'Leave the ID number out of how to reach them.'),
        -- The kind, how it came (never the form), the day received, and what they want.
        ('praise', null, null, quote_literal(pg_temp.id('1', 'a8')), null, null, null, null, 'Choose what the request is about.'),
        (null, 'hearth', null, quote_literal(pg_temp.id('1', 'a8')), null, null, null, null,
         'Choose how it came: by email, by letter, by phone, in person or another way.'),
        (null, null, pg_temp.today('1') - 366, quote_literal(pg_temp.id('1', 'a8')), null, null, null, null,
         'Give the day it was received, from a year ago to today.'),
        (null, null, pg_temp.today('1') + 1, quote_literal(pg_temp.id('1', 'a8')), null, null, null, null,
         'Give the day it was received, from a year ago to today.'),
        (null, null, null, quote_literal(pg_temp.id('1', 'a8')), null, null, null, quote_literal(E' \n '), 'Write what they want.'),
        (null, null, null, quote_literal(pg_temp.id('1', 'a8')), null, null, null, quote_literal(repeat('w', 4001)),
         'Keep it to 4,000 characters of plain text.'),
        (null, null, null, quote_literal(pg_temp.id('1', 'a8')), null, null, null, quote_literal('Wants ' || U&'\2067' || 'a copy.'),
         'Keep it to 4,000 characters of plain text.'),
        (null, null, null, quote_literal(pg_temp.id('1', 'a8')), null, null, null, quote_literal('Their NRIC is S1234567D.'),
         'Leave the ID number out of what they want.')
      ) as r (kind, came_by, received_on, person, name, channel, contact, details, message)) x;
select pg_temp.refused('1', 'a5', format($f$select * from public.log_case('question', 'email', %L, %L, null, null, null, 'Asks.',
                                            null, null, null, null)$f$, pg_temp.today('1'), pg_temp.id('1', 'a8')),
                       'HF006', 'Send it from the form again.');
-- What records: the leaver a9 with the email they wrote from, kept on the case (PPL-01); a current
-- member with a phone number and without any channel; someone without an account with a postal
-- address on two lines; a day received a year ago. No step is written (identity is a step recorded
-- on the sheet, PPL-14), and each has one audit row, case.logged, naming it by its target alone.
do $$
declare
  d date := pg_temp.today('1');
  steps_before bigint := (select count(*) from public.case_steps);
  a record;
  b record;
  c record;
  e record;
  f record;
begin
  perform pg_temp.act_as('1', 'a5');
  select * into a from pg_temp.log('access', 'email', d - 2, pg_temp.id('1', 'a9'), null, 'email', 'former.dpo@home.example',
                                   'Wants a copy of their records after leaving.');
  select * into b from pg_temp.log('correction', 'phone', d, pg_temp.id('1', 'a7'), null, 'phone', '+65 8000 0107',
                                   'Their surname is spelt wrong on the roster.');
  select * into c from pg_temp.log('objection', 'in_person', d, pg_temp.id('1', 'a6'), null, null, null,
                                   'Objects to the rota sheet showing home addresses.');
  select * into e from pg_temp.log('withdrawal', 'letter', d - 365, null, 'Alex Example', 'post', E'1 Example Road\nSingapore 000000',
                                   'Withdraws consent to presence receipts.');
  select * into f from pg_temp.log('question', 'other', d, null, '  Jo Example ', 'phone', ' +65 8000 0109 ', E'  Asks how long\r\nrotas are kept. ');
  perform set_config('role', 'none', true);
  perform pg_temp.check(a.changed and b.changed and c.changed and e.changed and f.changed
                        and pg_temp.is_reference(a.reference) and a.due_on = d - 2 + 30 and e.due_on = public.case_add_business_days(d - 365, 10),
                        'a log did not record as expected (RQD-06)');
  perform pg_temp.check(exists (select 1 from public.cases x where x.id = a.id and x.requester_person_id = pg_temp.id('1', 'a9')
                                  and x.requester_channel = 'email' and x.requester_contact = 'former.dpo@home.example'
                                  and x.came_by = 'email' and x.received_on = d - 2 and x.logged_by = pg_temp.id('1', 'a5')),
                        'the leaver''s case does not keep the channel they wrote from (RQD-06, PPL-01)');
  perform pg_temp.check(exists (select 1 from public.cases x where x.id = c.id and x.requester_channel is null and x.requester_contact is null),
                        'a current member logged with no channel holds one');
  perform pg_temp.check(exists (select 1 from public.cases x where x.id = f.id and x.requester_name = 'Jo Example'
                                  and x.requester_contact = '+65 8000 0109' and x.details = E'Asks how long\nrotas are kept.'),
                        'an outside requester''s text was not trimmed as submit_case() trims it');
  perform pg_temp.check((select count(*) from public.case_steps) = steps_before, 'a log wrote a step (RQD-06, PPL-14)');
  perform pg_temp.check((select count(*) = 5 and bool_and(x.action = 'case.logged' and x.actor_id = pg_temp.id('1', 'a5')
                                                          and x.details = '{}' and x.case_id is null and x.request_id = 'req-case')
                         from public.audit_events x where x.target_type = 'case' and x.target_id in (a.id::text, b.id::text, c.id::text,
                                                                                                      e.id::text, f.id::text)),
                        'the logs have not exactly one case.logged audit row each (RQD-06, PD-100)');
end
$$;
-- The settings version stated at receipt (PD-93): the link of the latest version published before
-- the start of the day received, in the org's zone, when its generator states targets. Org 3 has a
-- stand-in published 30 days ago, then c09.2 20 days ago, c09.3 10 days ago linking settings 1 and
-- c09.3 5 days ago linking settings 2, each at 09:00 in the org's zone (inserted as the owner).
insert into public.dpo_settings (org_id, version, contact_title, contact_email, recorded_by, target_business_days)
values (pg_temp.id('3', '00'), 2, 'Data Protection Officer', 'dpo-3@fixture.example', pg_temp.id('3', 'a5'), 7);
insert into public.notice_versions (org_id, version, body, published_by, generator, dpo_settings_version, published_at)
select pg_temp.id('3', '00'), v.version, 'Privacy notice', pg_temp.id('3', 'a5'), v.generator, v.settings,
       ((pg_temp.today('3') - v.days_ago)::timestamp + interval '9 hours') at time zone 'Asia/Singapore'
from (values (0, null, null::integer, 30), (1, 'c09.2', 1, 20), (2, 'c09.3', 1, 10), (3, 'c09.3', 2, 5)) as v (version, generator, settings, days_ago);
do $$
declare
  d date := pg_temp.today('3');
  sample record;
  logged uuid;
  stated integer;
begin
  for sample in
    select * from (values (40, null::integer, 'before any version'), (25, null, 'under the stand-in'), (15, null, 'under c09.2'),
                          (10, null, 'on the day c09.3 was published at 09:00, under c09.2'), (9, 1, 'under the first c09.3'),
                          (5, 1, 'on the day the second c09.3 was published'), (4, 2, 'under the second c09.3'),
                          (0, 2, 'today')) as s (days_ago, expected, why)
  loop
    perform pg_temp.act_as('3', 'a5');
    select l.id into logged from pg_temp.log('question', 'email', d - sample.days_ago, pg_temp.id('3', 'a8'), null, null, null,
                                             'Asks about rotas.') l;
    perform set_config('role', 'none', true);
    select c.stated_settings_version into stated from public.cases c where c.id = logged;
    perform pg_temp.check(stated is not distinct from sample.expected,
                          format('a request received %s states settings version %s, not %s (RQD-06, PD-93)', sample.why, stated,
                                 sample.expected));
  end loop;
end
$$;
-- And a request sent in Hearth today in org 3 states the latest version's link, 2, so it is due 7
-- business days on (the shorter of the stated 7 and the current 7).
select pg_temp.act_as('3', 'a7');
select set_config('test.org3', format('%s %s', id, due_on), true) from pg_temp.send('complaint', 'The crew can see my address.');
reset role;
select pg_temp.check((select stated_settings_version = 2 from public.cases where id = split_part(current_setting('test.org3'), ' ', 1)::uuid)
                     and split_part(current_setting('test.org3'), ' ', 2)::date = public.case_add_business_days(pg_temp.today('3'), 7),
                     format('org 3''s request today does not state version 2 and fall due in 7 business days: %s (RQD-03, PD-93)',
                            current_setting('test.org3')));

-- RQD-07 (PD-90, PD-91, PPL-04, PPL-14, DB-03; every persona): add_case_step(). In org 1 the DPO logs
-- the cases it works on: q, a question for a7 received 2 days ago; a, a copy for someone without an
-- account received 30 days ago (due today); late, a copy received 31 days ago (due yesterday); rq,
-- a question to be reclassified as a copy; full, a question that will hold 100 steps; corr, a
-- correction for a7 received 2 days ago; and obj, an objection for a6 received yesterday.
do $$
declare
  d date := pg_temp.today('1');
  k text;
begin
  perform pg_temp.act_as('1', 'a5');
  for k in select unnest(array['q', 'a', 'late', 'rq', 'full', 'corr', 'obj']) loop
    perform set_config('test.case_' || k, (
      select l.id::text from pg_temp.log(
        case when k in ('a', 'late') then 'access' when k = 'corr' then 'correction' when k = 'obj' then 'objection'
             else 'question' end, 'email',
        case k when 'q' then d - 2 when 'corr' then d - 2 when 'a' then d - 30 when 'late' then d - 31 else d - 1 end,
        case when k in ('q', 'rq', 'full', 'corr') then pg_temp.id('1', 'a7') when k = 'obj' then pg_temp.id('1', 'a6') end,
        case when k in ('a', 'late') then 'Sam Example' end,
        case when k in ('a', 'late') then 'email' end,
        case when k in ('a', 'late') then 'sam@requester.example' end,
        'Wants to know what the rota holds.') l), true);
  end loop;
  perform set_config('role', 'none', true);
end
$$;
-- Only the DPO still at the org records a step (42501, cases_check_dpo()'s message), writing nothing.
select pg_temp.refused('1', who, format($f$select pg_temp.step(%L, 0, 'acknowledged', %L)$f$, current_setting('test.case_q'),
                                        pg_temp.today('1')),
                       '42501', 'Only the Data Protection Officer can see or work on requests.')
from unnest(array['a1', 'a2', 'a3', 'a4', 'a6', 'a7', 'a8', 'aa', 'a9', 'ab', 'ac', 'a0']) who;
-- Another org's case and an unknown id read as missing (22023), and org 2's case is untouched; a
-- stale revision is refused (HF005).
select pg_temp.refused('1', 'a5', format($f$select pg_temp.step(%L, 1, 'note', %L, 'Planted.')$f$, x, pg_temp.today('1')),
                       '22023', 'There is no such request.')
from unnest(array[pg_temp.id('2', 'e8'), gen_random_uuid()]) x;
select pg_temp.check(count(*) = 1, 'org 2''s case gained a step') from public.case_steps where case_id = pg_temp.id('2', 'e8');
select pg_temp.refused('1', 'a5', format($f$select pg_temp.step(%L, 1, 'acknowledged', %L)$f$, current_setting('test.case_q'),
                                         pg_temp.today('1')),
                       'HF005', 'This request changed since you opened it. Reload it and try again.');
-- The rules before the step's own (HF006): a step that isn't one; the day, from the day received to
-- today; the note, at most 2,000 characters of plain text with no ID number; a field another step
-- takes.
select pg_temp.refused('1', 'a5', format('select pg_temp.step(%L, 0, %s)', current_setting('test.case_q'), x.args), 'HF006', x.message)
from (values
  (format('%L, %L', 'praised', pg_temp.today('1')), 'Choose what happened.'),
  (format('%L, null', 'note'), 'Give the day it happened, from the day the request was received to today.'),
  (format('%L, %L, %L', 'note', pg_temp.today('1') - 3, 'Before it came.'), 'Give the day it happened, from the day the request was received to today.'),
  (format('%L, %L, %L', 'note', pg_temp.today('1') + 1, 'Tomorrow.'), 'Give the day it happened, from the day the request was received to today.'),
  (format('%L, %L, %L', 'note', pg_temp.today('1'), repeat('n', 2001)), 'Keep the note to 2,000 characters of plain text.'),
  (format('%L, %L, %L', 'note', pg_temp.today('1'), 'A bell ' || chr(7)), 'Keep the note to 2,000 characters of plain text.'),
  (format('%L, %L, %L', 'note', pg_temp.today('1'), 'Turned ' || U&'\202D' || 'around'), 'Keep the note to 2,000 characters of plain text.'),
  (format('%L, %L, %L', 'note', pg_temp.today('1'), 'Saw S1234567D.'), 'Leave the ID number out of the note.'),
  (format('%L, %L, %L, %L', 'note', pg_temp.today('1'), 'A date.', pg_temp.today('1') + 30), 'Only more time takes a new date.'),
  (format('%L, %L, %L, null, %L', 'note', pg_temp.today('1'), 'A kind.', 'access'), 'Only a change of kind takes a kind.'),
  (format('%L, %L, %L, null, null, %L', 'note', pg_temp.today('1'), 'An outcome.', 'answered'), 'Only closing a request takes an outcome.'),
  -- Each step's own.
  (format('%L, %L', 'note', pg_temp.today('1')), 'Write the note.'),
  (format('%L, %L', 'identity_checked', pg_temp.today('1')), 'Say how you checked who they are.'),
  (format('%L, %L, %L', 'identity_checked', pg_temp.today('1'), E'By video call\nand a letter'),
   'Say how you checked who they are on one line of at most 500 characters.'),
  (format('%L, %L, %L', 'identity_checked', pg_temp.today('1'), repeat('i', 501)),
   'Say how you checked who they are on one line of at most 500 characters.'),
  (format('%L, %L, null, null, %L', 'reclassified', pg_temp.today('1'), 'question'), 'Choose a kind other than the one it has now.'),
  (format('%L, %L, null, null, %L', 'reclassified', pg_temp.today('1'), 'praise'), 'Choose what the request is about now.'),
  (format('%L, %L', 'reclassified', pg_temp.today('1')), 'Choose what the request is about now.'),
  (format('%L, %L, null, %L', 'extended', pg_temp.today('1'), pg_temp.today('1') + 30),
   'Only a request for a copy of data or a correction can have more time.'),
  (format('%L, %L', 'review_started', pg_temp.today('1')), 'Record a PDPC review only on a refused request for a copy of data.'),
  (format('%L, %L', 'review_ended', pg_temp.today('1')), 'There is no open PDPC review of this request.'),
  (format('%L, %L', 'closed', pg_temp.today('1')), 'Choose how the request ended.'),
  (format('%L, %L, null, null, null, %L', 'closed', pg_temp.today('1'), 'finished'), 'Choose how the request ended.'),
  (format('%L, %L, %L, null, null, %L', 'closed', pg_temp.today('1'), 'Not ours.', 'refused'),
   'Only a copy, a correction or an objection can be refused, and a refusal says why.')
) as x (args, message);
-- The revision: each step adds one, the closure one, a note after it one more. A question or a
-- complaint closes as answered with no identity step.
do $$
declare
  q uuid := current_setting('test.case_q')::uuid;
  d date := pg_temp.today('1');
begin
  perform pg_temp.act_as('1', 'a5');
  perform pg_temp.check(pg_temp.step(q, 0, 'acknowledged', d - 2) = 1, 'the first step is not revision 1 (RQD-07)');
  perform pg_temp.check(pg_temp.step(q, 1, 'replied', d, 'Replied by email.') = 2, 'the second step is not revision 2');
  perform pg_temp.check(pg_temp.step(q, 2, 'closed', d, null, null, null, 'answered') = 3, 'the closure is not revision 3');
  perform pg_temp.check(pg_temp.step(q, 3, 'note', d, 'They wrote to say thanks.') = 4, 'a note after the closure is not revision 4');
  perform set_config('role', 'none', true);
  perform pg_temp.check(exists (select 1 from public.cases c where c.id = q and c.closed_on = d and c.closed_kind = 'question'
                                  and c.outcome = 'answered' and c.closed_note is null and c.closed_by = pg_temp.id('1', 'a5')
                                  and c.closed_at = now()),
                        'the closure was not written once, with the kind it was closed as (RQD-07)');
  perform pg_temp.check(array_agg(format('%s:%s', s.number, s.step) order by s.number) = '{1:acknowledged,2:replied,3:note}',
                        format('the steps are %s', array_agg(format('%s:%s', s.number, s.step) order by s.number)))
  from public.case_steps s where s.case_id = q;
  -- One audit row per step and one for the closure, in order after the log's, each by the DPO with
  -- the request, the device and the address, naming the case by its target and the step's or the
  -- outcome's code alone (PD-100, ADM-06).
  perform pg_temp.check(array_agg(format('%s %s', a.action, a.details) order by a.id)
                          = array['case.logged {}', 'case.step_added {"step": "acknowledged"}',
                                  'case.step_added {"step": "replied"}', 'case.closed {"outcome": "answered"}',
                                  'case.step_added {"step": "note"}']
                        -- Compared with is not distinct from, so a null in any row fails it (bool_and skips nulls).
                        and bool_and(a.org_id = pg_temp.id('1', '00') and a.actor_id is not distinct from pg_temp.id('1', 'a5')
                                     and a.target_type = 'case' and a.case_id is null and a.reason is null
                                     and a.request_id is not distinct from 'req-case'
                                     and a.device_id is not distinct from 'd0000000-0000-4000-8000-0000000000d3'::uuid
                                     and a.ip is not distinct from '192.0.2.60'::inet),
                        format('q''s audit rows are %s (RQD-07, PD-100)', array_agg(format('%s %s', a.action, a.details) order by a.id)))
  from public.audit_events a where a.target_id = q::text;
end
$$;
-- A closed case takes only a note or a PDPC review of a refused copy.
select pg_temp.refused('1', 'a5', format('select pg_temp.step(%L, 4, %s)', current_setting('test.case_q'), x.args), 'HF006', x.message)
from (values
  (format('%L, %L', 'acknowledged', pg_temp.today('1')), 'This request is closed. Add a note, or record a PDPC review of a refused copy.'),
  (format('%L, %L, null, null, null, %L', 'closed', pg_temp.today('1'), 'answered'),
   'This request is closed. Add a note, or record a PDPC review of a refused copy.'),
  (format('%L, %L', 'review_started', pg_temp.today('1')), 'Record a PDPC review only on a refused request for a copy of data.')
) as x (args, message);
-- A copy (case a, due today): closing as answered needs an identity step first (PD-91); one dated
-- before the day received or after today is refused, one dated on the day received records
-- (PPL-14); more time needs a date after the current due day and at most 90 days after receipt (the
-- 91st day refused, the 90th recorded), and records when told on the due day (PPL-04); then
-- refused, with why, and its PDPC review.
select pg_temp.refused('1', 'a5', format('select pg_temp.step(%L, %s)', current_setting('test.case_a'), x.args), 'HF006', x.message)
from (values
  (format('0, %L, %L, null, null, null, %L', 'closed', pg_temp.today('1'), 'answered'),
   'Record how you checked who they are before you close it as answered.'),
  (format('0, %L, %L, %L', 'identity_checked', pg_temp.today('1') - 31, 'By video call.'),
   'Give the day it happened, from the day the request was received to today.'),
  (format('0, %L, %L, %L', 'identity_checked', pg_temp.today('1') + 1, 'By video call.'),
   'Give the day it happened, from the day the request was received to today.'),
  (format('0, %L, %L, null, %L', 'extended', pg_temp.today('1'), pg_temp.today('1')),
   'Pick a date after the current due day, at most 90 days after it was received.'),
  (format('0, %L, %L, null, %L', 'extended', pg_temp.today('1'), pg_temp.today('1') - 30 + 91),
   'Pick a date after the current due day, at most 90 days after it was received.'),
  (format('0, %L, %L', 'extended', pg_temp.today('1')), 'Pick a date after the current due day, at most 90 days after it was received.')
) as x (args, message);
do $$
declare
  a uuid := current_setting('test.case_a')::uuid;
  d date := pg_temp.today('1');
begin
  perform pg_temp.act_as('1', 'a5');
  perform pg_temp.check(pg_temp.step(a, 0, 'identity_checked', d - 30, 'Matched against HR records by video call') = 1,
                        'an identity step on the day received did not record (RQD-07, PPL-14)');
  perform pg_temp.check(pg_temp.step(a, 1, 'extended', d, null, d - 30 + 90) = 2,
                        'more time to 90 days after receipt, told on the due day, did not record (PPL-04)');
  perform set_config('role', 'none', true);
  perform pg_temp.check(public.case_due(pg_temp.id('1', '00'), a) = d - 30 + 90, 'more time did not move the due day (RQD-07)');
end
$$;
select pg_temp.refused('1', 'a5', format('select pg_temp.step(%L, 2, %s)', current_setting('test.case_a'), x.args), 'HF006', x.message)
from (values
  (format('%L, %L, null, null, null, %L', 'closed', pg_temp.today('1'), 'refused'),
   'Only a copy, a correction or an objection can be refused, and a refusal says why.')
) as x (args, message);
do $$
declare
  a uuid := current_setting('test.case_a')::uuid;
  d date := pg_temp.today('1');
begin
  perform pg_temp.act_as('1', 'a5');
  perform pg_temp.check(pg_temp.step(a, 2, 'closed', d, 'The copy would reveal another person''s data.', null, null, 'refused') = 3,
                        'a refused copy with why did not close (RQD-07)');
  perform pg_temp.check(pg_temp.step(a, 3, 'review_started', d) = 4, 'a PDPC review of a refused copy did not record');
  perform pg_temp.expect_error(format('select pg_temp.step(%L, 4, %L, %L)', a, 'review_started', d), 'HF006',
                               'A PDPC review of this request is open already.');
  perform pg_temp.check(pg_temp.step(a, 4, 'review_ended', d) = 5, 'the end of a PDPC review did not record');
  perform pg_temp.expect_error(format('select pg_temp.step(%L, 5, %L, %L)', a, 'review_ended', d), 'HF006',
                               'There is no open PDPC review of this request.');
  perform set_config('role', 'none', true);
  perform pg_temp.check(exists (select 1 from public.cases c where c.id = a and c.outcome = 'refused' and c.closed_kind = 'access'
                                  and c.closed_note = 'The copy would reveal another person''s data.'),
                        'the refusal was not stored with its kind and why (RQD-07, PDPA-09)');
end
$$;
-- A correction (case corr) is held as a copy is: closing it as answered needs an identity step
-- first (PD-91: nothing is changed on a session alone), and it may have more time. An objection
-- (case obj) may be refused with why, but a PDPC review is only for a refused copy (s22A), so a
-- refused objection takes none.
select pg_temp.refused('1', 'a5', format($f$select pg_temp.step(%L, 0, 'closed', %L, null, null, null, 'answered')$f$,
                                         current_setting('test.case_corr'), pg_temp.today('1')),
                       'HF006', 'Record how you checked who they are before you close it as answered.');
do $$
declare
  corr uuid := current_setting('test.case_corr')::uuid;
  obj uuid := current_setting('test.case_obj')::uuid;
  d date := pg_temp.today('1');
begin
  perform pg_temp.act_as('1', 'a5');
  perform pg_temp.check(pg_temp.step(corr, 0, 'extended', d, null, d - 2 + 60) = 1, 'more time on a correction did not record (RQD-07)');
  perform pg_temp.check(pg_temp.step(corr, 1, 'identity_checked', d, 'Matched against HR records by video call') = 2,
                        'an identity step on a correction did not record (RQD-07)');
  perform pg_temp.check(pg_temp.step(corr, 2, 'closed', d, null, null, null, 'answered') = 3,
                        'a correction with an identity step did not close as answered (RQD-07, PD-91)');
  perform pg_temp.check(pg_temp.step(obj, 0, 'closed', d, 'The rota must show who is on site.', null, null, 'refused') = 1,
                        'an objection refused with why did not close (RQD-07)');
  perform set_config('role', 'none', true);
  perform pg_temp.check((select closed_kind = 'correction' and outcome = 'answered' from public.cases where id = corr)
                        and (select closed_kind = 'objection' and outcome = 'refused' from public.cases where id = obj),
                        'the correction or the objection was not closed with its kind and outcome (RQD-07)');
end
$$;
select pg_temp.refused('1', 'a5', format($f$select pg_temp.step(%L, 1, 'review_started', %L)$f$, current_setting('test.case_obj'),
                                         pg_temp.today('1')),
                       'HF006', 'Record a PDPC review only on a refused request for a copy of data.');
-- More time recorded after the due day is refused (PPL-04): case late was due yesterday. The DPO
-- records a late notice as a note instead, so the case stays late.
select pg_temp.refused('1', 'a5', format($f$select pg_temp.step(%L, 0, 'extended', %L, null, %L)$f$, current_setting('test.case_late'),
                                         pg_temp.today('1'), pg_temp.today('1') + 10),
                       'HF006', 'Record more time only on or before the current due day. If you told them later, add a note.');
-- A question reclassified as a copy: its kind now follows, it may then be refused, and its
-- closed_kind reads access. A request sent in Hearth can't be closed as logged in error, and one
-- the DPO logged can.
do $$
declare
  rq uuid := current_setting('test.case_rq')::uuid;
  d date := pg_temp.today('1');
begin
  perform pg_temp.act_as('1', 'a5');
  perform pg_temp.check(pg_temp.step(rq, 0, 'reclassified', d, null, null, 'access') = 1, 'a reclassification did not record');
  perform set_config('role', 'none', true);
  perform pg_temp.check(public.case_kind_now(pg_temp.id('1', '00'), rq) = 'access', 'the kind now did not follow the reclassification');
  perform pg_temp.act_as('1', 'a5');
  perform pg_temp.check(pg_temp.step(rq, 1, 'closed', d, 'Held under an exception.', null, null, 'refused') = 2,
                        'a question reclassified as a copy could not be refused (RQD-07)');
  perform set_config('role', 'none', true);
  perform pg_temp.check((select closed_kind = 'access' and kind = 'question' from public.cases where id = rq),
                        'the closure did not record the kind it was closed as, or the kind it came as changed');
end
$$;
select pg_temp.refused('1', 'a5', format($f$select pg_temp.step(%L, 1, 'closed', %L, null, null, null, 'logged_in_error')$f$,
                                         pg_temp.id('1', 'e8'), pg_temp.today('1')),
                       'HF006', 'Only a request you logged can be closed as logged in error.');
-- At most 100 steps (DB-03): with 100 recorded (as the superuser), a 101st is refused, and the case
-- still closes.
insert into public.case_steps (org_id, case_id, number, step, on_day, note, recorded_by)
select pg_temp.id('1', '00'), current_setting('test.case_full')::uuid, n, 'note', pg_temp.today('1'), 'Note ' || n, pg_temp.id('1', 'a5')
from generate_series(1, 100) n;
select pg_temp.refused('1', 'a5', format($f$select pg_temp.step(%L, 100, 'note', %L, 'One more.')$f$, current_setting('test.case_full'),
                                         pg_temp.today('1')),
                       'HF006', 'A request holds at most 100 steps. Close it, and log a new one if more is needed.');
select pg_temp.act_as('1', 'a5');
select pg_temp.check(pg_temp.step(current_setting('test.case_full')::uuid, 100, 'closed', pg_temp.today('1'), null, null, null,
                                  'not_a_request') = 101,
                     'a case holding 100 steps could not close (RQD-07, DB-03)');
reset role;
-- Every case's audit rows hold only the step's or the outcome's code: never a kind or a note.
select pg_temp.check(bool_and(a.case_id is null and a.target_type = 'case'
                              and (a.details = '{}'
                                   or (a.action = 'case.step_added' and a.details ?& array['step'] and a.details - 'step' = '{}'
                                       and a.details ->> 'step' in ('acknowledged', 'identity_checked', 'replied', 'extended',
                                                                     'reclassified', 'note', 'review_started', 'review_ended'))
                                   or (a.action = 'case.closed' and a.details - 'outcome' = '{}'
                                       and a.details ->> 'outcome' in ('answered', 'refused', 'withdrawn', 'duplicate',
                                                                        'not_a_request', 'logged_in_error')))),
                     format('a case''s audit row holds more than a code: %s', array_agg(a.details)))
from public.audit_events a where a.action like 'case.%';

-- RQD-08 (OD-14, OD-15; PD-97, PD-98, PD-103, PD-112, PPL-07, DB-07): the reads. First more cases in
-- org 1, as the DPO logs them: one for each of a1, a2, a3, a4 and aa; a8's closed as logged in
-- error; a7's whose words name a8 (a8 never sees it); three copies for a2 whose replies test
-- replied_in_time: on its due day (true), after it (false), and on time but followed by more time
-- (false again); and a2's question received today and closed, newer than every open one of theirs,
-- so their tracking's order shows open before closed.
do $$
declare
  d date := pg_temp.today('1');
  who text;
  c uuid;
begin
  perform pg_temp.act_as('1', 'a5');
  foreach who in array array['a1', 'a2', 'a3', 'a4', 'aa'] loop
    perform pg_temp.log('question', 'phone', d - 1, pg_temp.id('1', who), null, null, null, 'Rang about the rota.');
  end loop;
  select l.id into c from pg_temp.log('complaint', 'email', d, pg_temp.id('1', 'a8'), null, null, null, 'Logged for the wrong person.') l;
  perform pg_temp.step(c, 0, 'closed', d, 'Logged against the wrong member.', null, null, 'logged_in_error');
  perform pg_temp.log('complaint', 'letter', d, pg_temp.id('1', 'a7'), null, null, null, 'About Mel Member 1 sharing the rota.');
  select l.id into c from pg_temp.log('access', 'email', d - 30, pg_temp.id('1', 'a2'), null, null, null, 'On time.') l;
  perform set_config('test.on_time', c::text, true);
  perform pg_temp.step(c, 0, 'replied', d, 'Sent the copy.');
  select l.id into c from pg_temp.log('access', 'email', d - 31, pg_temp.id('1', 'a2'), null, null, null, 'Late.') l;
  perform set_config('test.late_reply', c::text, true);
  perform pg_temp.step(c, 0, 'replied', d, 'Sent the copy, a day late.');
  select l.id into c from pg_temp.log('access', 'email', d - 30, pg_temp.id('1', 'a2'), null, null, null, 'More after a reply.') l;
  perform set_config('test.more_after', c::text, true);
  perform pg_temp.step(c, 0, 'replied', d, 'Sent part of it.');
  perform pg_temp.step(c, 1, 'extended', d, null, d + 10);
  select l.id into c from pg_temp.log('question', 'phone', d, pg_temp.id('1', 'a2'), null, null, null, 'Rang again, and was answered.') l;
  perform pg_temp.step(c, 0, 'closed', d, null, null, null, 'answered');
  perform set_config('role', 'none', true);
end
$$;
-- The DPO's reads answer a5 alone (42501, cases_check_dpo()'s message, for everyone else), and
-- another org's case reads as missing (22023).
select pg_temp.refused('1', who, x.stmt, '42501', 'Only the Data Protection Officer can see or work on requests.')
from unnest(array['a1', 'a2', 'a3', 'a4', 'a6', 'a7', 'a8', 'aa', 'a9', 'ab', 'ac', 'a0']) who,
     (values ($$select * from public.read_cases(false, 201)$$), ($$select * from public.read_cases(true, 101)$$),
             (format('select * from public.read_case(%L)', pg_temp.id('1', 'e8'))),
             (format('select * from public.read_case_steps(%L)', pg_temp.id('1', 'e8'))),
             (format('select * from public.read_case_others(%L, 51)', pg_temp.id('1', 'e8')))) as x (stmt);
select pg_temp.refused('1', 'a5', x.stmt, '22023', 'There is no such request.')
from (values (format('select * from public.read_case(%L)', pg_temp.id('2', 'e8'))),
             (format('select * from public.read_case_steps(%L)', pg_temp.id('2', 'e8'))),
             (format('select * from public.read_case_others(%L, 51)', pg_temp.id('2', 'e8'))),
             (format('select * from public.read_case(%L)', gen_random_uuid()))) as x (stmt);
-- A bound outside the route's constants is 2201W, never 22023 (a programming error, never "this
-- request isn't there").
select pg_temp.refused('1', 'a5', x.stmt, '2201W', x.message)
from (values
  ($$select * from public.read_cases(false, 0)$$, 'Read between 1 and 201 open requests, or 1 and 101 closed ones, at a time.'),
  ($$select * from public.read_cases(false, 202)$$, 'Read between 1 and 201 open requests, or 1 and 101 closed ones, at a time.'),
  ($$select * from public.read_cases(true, 102)$$, 'Read between 1 and 201 open requests, or 1 and 101 closed ones, at a time.'),
  ($$select * from public.read_cases(null, 10)$$, 'Read between 1 and 201 open requests, or 1 and 101 closed ones, at a time.'),
  (format('select * from public.read_case_others(%L, 0)', pg_temp.id('1', 'e8')), 'Read between 1 and 51 requests at a time.'),
  (format('select * from public.read_case_others(%L, 52)', pg_temp.id('1', 'e8')), 'Read between 1 and 51 requests at a time.')
) as x (stmt, message);
select pg_temp.refused('1', 'a8', x.stmt, '2201W', 'Read between 1 and 51 requests at a time.')
from (values ($$select * from public.read_own_cases(0)$$), ($$select * from public.read_own_cases(52)$$)) as x (stmt);
-- The queue: every open case of the org, soonest due, then received, then id, with the full count
-- under a limit of 1; new only for a request sent in Hearth with no step; the requester's roster
-- name and whether they have left, or the outside requester's name; and the most recently closed
-- first, with no total and no state.
do $$
declare
  org uuid := pg_temp.id('1', '00');
  got uuid[];
  expected uuid[];
  rows_read record;
  total integer;
begin
  perform pg_temp.act_as('1', 'a5');
  select array_agg(r.id order by r.n) into got from public.read_cases(false, 201) with ordinality as r (id, reference, kind, came_by,
    received_on, due_on, replied_on, replied_in_time, revision, state, requester_name, requester_department, requester_outside,
    requester_left, closed_on, outcome, open_total, n);
  select open_total into total from public.read_cases(false, 1);
  perform set_config('role', 'none', true);
  select array_agg(c.id order by public.case_due(org, c.id), c.received_on, c.id) into expected
  from public.cases c where c.org_id = org and c.closed_at is null;
  perform pg_temp.check(got = expected, format('the open queue is %s, not %s (RQD-08)', got, expected));
  perform pg_temp.check(total = cardinality(expected), format('open_total under a limit of 1 is %s, not %s', total, cardinality(expected)));
  perform pg_temp.act_as('1', 'a5');
  for rows_read in select * from public.read_cases(false, 201) loop
    perform set_config('role', 'none', true);
    perform pg_temp.check(
      (rows_read.state = 'new') = (rows_read.came_by = 'hearth' and not exists (select 1 from public.case_steps s where s.case_id = rows_read.id))
      and rows_read.state in ('new', 'in_progress', 'more_time')
      and rows_read.due_on = public.case_due(org, rows_read.id) and rows_read.kind = public.case_kind_now(org, rows_read.id)
      and rows_read.revision = (select count(*) from public.case_steps s where s.case_id = rows_read.id)
      and rows_read.requester_name = (select coalesce(p.full_name, c.requester_name) from public.cases c
                                      left join public.people p on p.id = c.requester_person_id where c.id = rows_read.id)
      and rows_read.requester_outside = (rows_read.id = pg_temp.id('1', 'ea') or rows_read.requester_name in ('Sam Example', 'Alex Example', 'Jo Example'))
      and rows_read.requester_left = (rows_read.requester_name = 'Person a9 1')
      and rows_read.closed_on is null and rows_read.outcome is null and rows_read.open_total = cardinality(expected),
      format('a queue row is wrong: %s (RQD-08)', rows_read));
    perform pg_temp.act_as('1', 'a5');
  end loop;
  select array_agg(r.id order by r.n) into got from public.read_cases(true, 101) with ordinality as r (id, reference, kind, came_by,
    received_on, due_on, replied_on, replied_in_time, revision, state, requester_name, requester_department, requester_outside,
    requester_left, closed_on, outcome, open_total, n);
  perform pg_temp.check((select bool_and(r.open_total is null and r.state = 'closed' and r.due_on is null and r.outcome is not null
                                         and r.closed_on is not null)
                         from public.read_cases(true, 101) r), 'a closed row has a total or a due day, or isn''t closed (RQD-08)');
  perform set_config('role', 'none', true);
  select array_agg(c.id order by c.closed_at desc, c.id) into expected from public.cases c where c.org_id = org and c.closed_at is not null;
  perform pg_temp.check(got = expected, format('the closed list is %s, not %s (RQD-08)', got, expected));
end
$$;
-- One case and its steps: ea (someone without an account, by email) and case a (a refused copy with
-- a review that ended), and a9's (a leaver's) day of leaving.
select pg_temp.act_as('1', 'a5');
select pg_temp.check(c.kind = 'access' and c.received_kind = 'access' and c.came_by = 'email' and c.received_on = pg_temp.today('1') - 3
                     and c.requester_person_id is null and c.requester_name = 'Sam Example' and c.requester_outside
                     and c.requester_channel = 'email' and c.requester_contact = 'sam@requester.example'
                     and c.details = 'Wants a copy of the personal data held about them.' and c.today = pg_temp.today('1')
                     and c.due_on = pg_temp.today('1') - 3 + 30 and c.replied_on is null and not c.replied_in_time and c.revision = 1
                     and c.state = 'in_progress' and c.identity_checked and not c.review_open and c.closed_on is null and c.closed_by_name is null,
                     format('read_case(ea) answered %s (RQD-08)', c))
from public.read_case(pg_temp.id('1', 'ea')) c;
select pg_temp.check(c.outcome = 'refused' and c.closed_kind = 'access' and c.revision = 5 and c.state = 'closed'
                     and c.identity_checked and not c.review_open
                     and c.due_on is null and c.closed_by_name = 'Person a5 1' and c.logged_by_name = 'Person a5 1',
                     format('read_case(a) answered %s (RQD-08)', c))
from public.read_case(current_setting('test.case_a')::uuid) c;
select pg_temp.check(array_agg(format('%s:%s:%s', s.number, s.step, s.recorded_by_name) order by s.number)
                     = '{1:identity_checked:Person a5 1,2:extended:Person a5 1,3:review_started:Person a5 1,4:review_ended:Person a5 1}'
                     and bool_and(s.recorded_on = pg_temp.today('1')),
                     format('read_case_steps(a) answered %s (RQD-08)', array_agg(s)))
from public.read_case_steps(current_setting('test.case_a')::uuid) s;
reset role;
select pg_temp.act_as('1', 'a5');
select set_config('test.left_on', coalesce(c.requester_left_on::text, ''), true) from public.read_cases(false, 201) r,
       public.read_case(r.id) c where r.requester_left limit 1;
reset role;
select pg_temp.check(current_setting('test.left_on') = (select (deactivated_at at time zone 'Asia/Singapore')::date::text
                                                         from public.people where id = pg_temp.id('1', 'a9')),
                     'a leaver''s day of leaving is not shown in the org''s zone (RQD-08)');
-- Their other requests: for a8's e8, every other case of a8's in any state (closed as logged in
-- error included) and nobody else's, open first by due day, then closed, newest received; none for
-- someone without an account.
select pg_temp.act_as('1', 'a5');
select set_config('test.others', coalesce((select array_agg(o.id order by o.n)::text
                                           from public.read_case_others(pg_temp.id('1', 'e8'), 51) with ordinality
                                                as o (id, reference, kind, came_by, received_on, state, due_on, replied_in_time,
                                                      closed_on, outcome, n)), '{}'), true);
select pg_temp.check(not exists (select 1 from public.read_case_others(pg_temp.id('1', 'ea'), 51)),
                     'someone without an account has other requests (RQD-08, PPL-07)');
reset role;
select pg_temp.check(current_setting('test.others') = (select array_agg(c.id order by c.closed_at is not null,
                                                                       case when c.closed_at is null then public.case_due(c.org_id, c.id) end,
                                                                       c.received_on desc, c.id)::text
                                                        from public.cases c
                                                        where c.org_id = pg_temp.id('1', '00') and c.requester_person_id = pg_temp.id('1', 'a8')
                                                          and c.id <> pg_temp.id('1', 'e8'))
                     and (select c.outcome = 'logged_in_error' from public.cases c
                          where c.id = (current_setting('test.others')::uuid[])[cardinality(current_setting('test.others')::uuid[])])
                     and cardinality(current_setting('test.others')::uuid[]) > 1,
                     format('a8''s other requests are %s, not open first and then closed (RQD-08, PPL-07)', current_setting('test.others')));
-- The requester's tracking, as each person of org 1, in a read-only transaction (a savepoint): each
-- sees exactly the cases where they are the requester, a case the DPO logged for them included, one
-- closed as logged in error and one whose words name them but whose requester is someone else never;
-- the Owner, the Admin, the Compliance Officer and the DPO see only their own (DB-07, OD-15); the
-- agent, the assistant and Hearth see none; no org or user set is 42501. Each list is in its order:
-- open first, soonest due, then closed, newest received (PD-97), which a2's shows, with open cases
-- due on different days and a closed one received after them.
savepoint rqd_08;
set local transaction_read_only = on;
do $$
declare
  who text;
  got text;
  expected text;
  ordered boolean;
begin
  foreach who in array array['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'aa', 'ab', 'ac', 'a0'] loop
    perform pg_temp.act_as('1', who);
    select coalesce(array_agg(r.id order by r.n)::text, '{}') into got
    from public.read_own_cases(51) with ordinality as r (id, reference, kind, came_by, received_on, state, due_on, replied_on,
                                                         replied_in_time, closed_on, open_total, n);
    select coalesce(bool_and(x.ok), true) into ordered
    from (select case when r.state = 'closed' then true
                      when lag(r.state) over w = 'closed' then false
                      else r.due_on >= coalesce(lag(r.due_on) over w, r.due_on) end as ok
          from public.read_own_cases(51) with ordinality as r (id, reference, kind, came_by, received_on, state, due_on, replied_on,
                                                               replied_in_time, closed_on, open_total, n)
          window w as (order by r.n)) x;
    perform set_config('role', 'none', true);
    select coalesce(array_agg(c.id order by c.closed_at is not null, case when c.closed_at is null then public.case_due(c.org_id, c.id) end,
                                            c.received_on desc, c.id)::text, '{}') into expected
    from public.cases c
    where c.org_id = pg_temp.id('1', '00') and c.requester_person_id = pg_temp.id('1', who) and c.outcome is distinct from 'logged_in_error';
    perform pg_temp.check(got = expected, format('%s''s tracking is %s, not %s (RQD-08, OD-15, PD-97)', who, got, expected));
    perform pg_temp.check(ordered, format('%s''s tracking does not list open requests first, soonest due (RQD-08, PD-97)', who));
    perform pg_temp.check(who not in ('ab', 'ac', 'a0') or got = '{}', format('%s sees requests', who));
  end loop;
  -- a2's list can tell the order apart: open cases due on at least two days, and a closed one
  -- received after one of them.
  perform pg_temp.check((select count(distinct public.case_due(c.org_id, c.id)) filter (where c.closed_at is null) >= 2
                                and bool_or(c.closed_at is not null and c.outcome <> 'logged_in_error'
                                            and c.received_on > (select min(o.received_on) from public.cases o
                                                                 where o.org_id = c.org_id and o.requester_person_id = c.requester_person_id
                                                                   and o.closed_at is null))
                         from public.cases c where c.org_id = pg_temp.id('1', '00') and c.requester_person_id = pg_temp.id('1', 'a2')),
                        'a2''s requests can''t show the tracking''s order (RQD-08)');
  perform set_config('app.org_id', pg_temp.id('1', '00')::text, true);
  perform set_config('app.user_id', '', true);
  perform set_config('role', 'hearth_app', true);
  perform pg_temp.expect_error('select * from public.read_own_cases(51)', '42501', 'No org or user is set for this transaction');
  perform set_config('role', 'none', true);
end
$$;
-- What each row says: the state (received with no step; in progress; more time; closed), the due day
-- only while open, the latest reply's day and whether it was on time (PD-112), the open count from
-- the window before the limit.
select pg_temp.act_as('1', 'a8');
select pg_temp.check(r.state = 'in_progress' and r.due_on is not null and r.replied_on is null and not r.replied_in_time
                     and r.closed_on is null and r.kind = 'complaint' and r.came_by = 'hearth' and r.reference = 'K7QMX3TD',
                     format('a8''s e8 reads %s (RQD-08)', r))
from public.read_own_cases(51) r where r.id = pg_temp.id('1', 'e8');
reset role;
select pg_temp.act_as('1', 'a6');
select set_config('test.a6', format('%s %s', count(*) filter (where r.state = 'received'), max(r.open_total)), true)
from public.read_own_cases(51) r;
select pg_temp.check(count(*) = 1 and max(r.open_total) = split_part(current_setting('test.a6'), ' ', 2)::integer,
                     'a limit of 1 did not answer one row with the full open count (RQD-08)')
from public.read_own_cases(1) r;
reset role;
select pg_temp.check(split_part(current_setting('test.a6'), ' ', 1)::integer > 0, 'none of a6''s requests reads received');
select pg_temp.act_as('1', 'a2');
select pg_temp.check(count(*) = 3 and bool_and(case r.id
                       when current_setting('test.on_time')::uuid then r.replied_on = t.d and r.replied_in_time and r.state = 'in_progress'
                                                                       and r.due_on = t.d
                       when current_setting('test.late_reply')::uuid then r.replied_on = t.d and not r.replied_in_time
                                                                          and r.due_on = t.d - 1
                       else r.replied_on = t.d and not r.replied_in_time and r.state = 'more_time' and r.due_on = t.d + 10 end),
                     format('a2''s replies read %s (RQD-08, PD-112)', array_agg(r)))
from public.read_own_cases(51) r cross join (select pg_temp.today('1') as d) t
where r.id in (current_setting('test.on_time')::uuid, current_setting('test.late_reply')::uuid, current_setting('test.more_after')::uuid);
reset role;
rollback to savepoint rqd_08;

-- RQD-10 (OD-22; PD-99, PD-112): case_attention() counts the open cases that are new (sent in Hearth
-- with no step) or due within 2 business days, overdue included, leaving out one replied to on
-- time; for the DPO alone, null for anyone else and with no user set; in a read-only transaction.
-- In org 4: A, a8's request with no step (counts); B, a copy received today (due in 30 days, no);
-- C, a copy received 31 days ago (overdue, counts); D, one received 30 days ago (due today,
-- counts); F, overdue but replied to before its due day (no); G, overdue and replied to after it
-- (counts until closed); H, overdue and closed (no); I, a8's request with a step (no); J, a case
-- the DPO logged with no step, due in 30 days (no: one the DPO logged has been seen); and the
-- window's edges, worked out from today so they hold on any day of the week: K, a copy due on the
-- window's last day, 2 business days on (counts: on a Thursday, the Monday after), and L, one due
-- the day after it (no).
select pg_temp.request_org('4');
do $$
declare
  d date := pg_temp.today('4');
  -- The window's last day, worked out as the superuser (hearth_app runs no helper).
  edge date := public.case_add_business_days(pg_temp.today('4'), 2);
  c uuid;
begin
  perform pg_temp.act_as('4', 'a8');
  perform pg_temp.send('question', 'A: no step yet.');
  select s.id into c from pg_temp.send('question', 'I: acknowledged.') s;
  perform set_config('role', 'none', true);
  perform pg_temp.act_as('4', 'a5');
  perform pg_temp.step(c, 0, 'acknowledged', d);
  perform pg_temp.log('access', 'email', d, pg_temp.id('4', 'a7'), null, null, null, 'B: due in 30 days.');
  perform pg_temp.log('access', 'email', d - 31, pg_temp.id('4', 'a7'), null, null, null, 'C: overdue.');
  perform pg_temp.log('access', 'email', d - 30, pg_temp.id('4', 'a7'), null, null, null, 'D: due today.');
  select l.id into c from pg_temp.log('access', 'email', d - 40, pg_temp.id('4', 'a7'), null, null, null, 'F: replied on time.') l;
  perform pg_temp.step(c, 0, 'replied', d - 12, 'Sent the copy.');
  select l.id into c from pg_temp.log('access', 'email', d - 40, pg_temp.id('4', 'a7'), null, null, null, 'G: replied late.') l;
  perform pg_temp.step(c, 0, 'replied', d - 5, 'Sent the copy late.');
  select l.id into c from pg_temp.log('access', 'email', d - 40, pg_temp.id('4', 'a7'), null, null, null, 'H: closed.') l;
  perform pg_temp.step(c, 0, 'identity_checked', d - 40, 'Matched against HR records');
  perform pg_temp.step(c, 1, 'closed', d - 1, null, null, null, 'answered');
  perform pg_temp.log('question', 'email', d, pg_temp.id('4', 'a7'), null, null, null, 'J: logged, no step.');
  perform pg_temp.log('access', 'email', edge - 30, pg_temp.id('4', 'a7'), null, null, null, 'K: due on the window''s last day.');
  perform pg_temp.log('access', 'email', edge - 29, pg_temp.id('4', 'a7'), null, null, null, 'L: due the day after the window.');
  perform set_config('role', 'none', true);
  perform pg_temp.check((select array_agg(public.case_due(c.org_id, c.id) order by c.details)
                         from public.cases c where c.org_id = pg_temp.id('4', '00') and c.details like any (array['K:%', 'L:%']))
                        = array[edge, edge + 1] and edge > d,
                        'K and L are not due on the window''s last day and the day after it (RQD-10)');
end
$$;
savepoint rqd_10;
set local transaction_read_only = on;
do $$
declare
  got integer;
  who text;
begin
  perform pg_temp.act_as('4', 'a5');
  got := public.case_attention();
  perform set_config('role', 'none', true);
  perform pg_temp.check(got = 5, format('the DPO''s count is %s, not 5 (A, C, D, G and K) (RQD-10)', got));
  -- Org 4's Owner, its person with no role, its Member and Hearth; then every persona of org 1 but
  -- its DPO, who gets a count there too.
  foreach who in array array['a1', 'a7', 'a8', 'a0'] loop
    perform pg_temp.act_as('4', who);
    got := public.case_attention();
    perform set_config('role', 'none', true);
    perform pg_temp.check(got is null, format('%s got a count (RQD-10)', who));
  end loop;
  foreach who in array array['a1', 'a2', 'a3', 'a4', 'a6', 'a7', 'a8', 'a9', 'aa', 'ab', 'ac', 'a0'] loop
    perform pg_temp.act_as('1', who);
    got := public.case_attention();
    perform set_config('role', 'none', true);
    perform pg_temp.check(got is null, format('org 1''s %s got a count (RQD-10)', who));
  end loop;
  perform pg_temp.act_as('1', 'a5');
  got := public.case_attention();
  perform set_config('role', 'none', true);
  perform pg_temp.check(got is not null, 'org 1''s DPO got no count (RQD-10)');
  perform set_config('app.org_id', pg_temp.id('4', '00')::text, true);
  perform set_config('app.user_id', '', true);
  perform set_config('role', 'hearth_app', true);
  got := public.case_attention();
  perform set_config('role', 'none', true);
  perform pg_temp.check(got is null, 'a count with no user set (RQD-10)');
end
$$;
rollback to savepoint rqd_10;

-- RQD-13 (ACC-11): acting in org 2, each writer and read given org 1's case or person ids changes
-- and reads nothing of org 1 (22023, 42501 or no rows); org 1's DPO named in an org 2 transaction is
-- nobody there.
select pg_temp.refused('2', 'a5', x.stmt, x.state, x.message)
from (values
  (format($f$select * from pg_temp.log('question', 'email', %L, %L, null, null, null, 'Asks.')$f$, pg_temp.today('2'), pg_temp.id('1', 'a8')),
   '22023', 'There is no such person at the organisation.'),
  (format($f$select pg_temp.step(%L, 1, 'note', %L, 'Planted.')$f$, pg_temp.id('1', 'e8'), pg_temp.today('2')), '22023', 'There is no such request.'),
  (format($f$select pg_temp.step(%L, 0, 'closed', %L, null, null, null, 'duplicate')$f$, pg_temp.id('1', 'ea'), pg_temp.today('2')),
   '22023', 'There is no such request.'),
  (format('select * from public.read_case(%L)', pg_temp.id('1', 'e8')), '22023', 'There is no such request.'),
  (format('select * from public.read_case_steps(%L)', pg_temp.id('1', 'e8')), '22023', 'There is no such request.'),
  (format('select * from public.read_case_others(%L, 51)', pg_temp.id('1', 'e8')), '22023', 'There is no such request.')
) as x (stmt, state, message);
do $$
declare
  ids uuid[];
  before text := pg_temp.written();
  got integer;
  expected integer;
begin
  perform pg_temp.act_as('2', 'a5');
  select array_agg(r.id) into ids from public.read_cases(false, 201) r;
  select array_agg(r.id) || ids into ids from public.read_cases(true, 101) r;
  got := public.case_attention();
  perform set_config('role', 'none', true);
  perform pg_temp.check(not exists (select 1 from public.cases c where c.id = any (ids) and c.org_id <> pg_temp.id('2', '00'))
                        and pg_temp.id('2', 'e8') = any (ids),
                        'org 2''s DPO read another org''s requests, or not org 2''s (RQD-13)');
  select count(*) into expected from public.cases c
  where c.org_id = pg_temp.id('2', '00') and c.closed_at is null
    and ((c.came_by = 'hearth' and not exists (select 1 from public.case_steps s where s.case_id = c.id))
         or (public.case_due(c.org_id, c.id) <= public.case_add_business_days(pg_temp.today('2'), 2)
             and not public.case_replied_in_time(c.org_id, c.id)));
  perform pg_temp.check(got = expected, format('org 2''s count is %s, not its own %s (RQD-13)', got, expected));
  perform pg_temp.act_as('2', 'a8');
  select array_agg(r.id) into ids from public.read_own_cases(51) r;
  perform set_config('role', 'none', true);
  perform pg_temp.check(not exists (select 1 from public.cases c where c.id = any (ids) and c.org_id <> pg_temp.id('2', '00')),
                        'org 2''s member tracked another org''s requests (RQD-13)');
  -- Org 1's people named in an org 2 transaction are nobody there.
  perform set_config('app.org_id', pg_temp.id('2', '00')::text, true);
  perform set_config('app.user_id', pg_temp.id('1', 'a5')::text, true);
  perform set_config('role', 'hearth_app', true);
  perform pg_temp.expect_error('select * from public.read_cases(false, 201)', '42501',
                               'Only the Data Protection Officer can see or work on requests.');
  perform pg_temp.expect_error(format($f$select * from pg_temp.log('question', 'email', %L, null, 'Sam Example', 'email',
                                        'sam@requester.example', 'Asks.')$f$, pg_temp.today('1')), '42501',
                               'Only the Data Protection Officer can see or work on requests.');
  got := public.case_attention();
  perform pg_temp.check(got is null, 'org 1''s DPO got a count in org 2 (RQD-13)');
  perform set_config('app.user_id', pg_temp.id('1', 'a8')::text, true);
  perform pg_temp.expect_error($f$select * from pg_temp.send('question', 'Planted.')$f$, '42501',
                               'Only someone still at the organisation can send a request.');
  perform pg_temp.check(not exists (select 1 from public.read_own_cases(51)), 'org 1''s member tracked requests in org 2 (RQD-13)');
  perform set_config('role', 'none', true);
  perform pg_temp.check(pg_temp.written() = before, 'a cross-org call wrote something (RQD-13)');
end
$$;

-- RQD-14 (R2, Rule 8): no refusal's message holds any part of its input. A marker planted in every
-- text argument of each refusal is in no raised message (each refusal above is also asserted by its
-- whole fixed message).
create function pg_temp.no_echo(o text, who text, stmt text) returns void language plpgsql as $$
begin
  perform pg_temp.act_as(o, who);
  begin
    execute stmt;
  exception when others then
    perform set_config('role', 'none', true);
    perform pg_temp.check(position('zqxmarker' in lower(sqlerrm)) = 0, format('a refusal echoed its input: %s (RQD-14)', sqlerrm));
    return;
  end;
  raise exception 'expected a refusal from: %', stmt;
end
$$;
select pg_temp.no_echo('1', x.who, format(x.stmt, 'ZqxMarker', pg_temp.today('1'), pg_temp.id('1', 'a8'), current_setting('test.case_q')))
from (values
  ('a8', $f$select * from pg_temp.send(%1$L, 'Words.')$f$),
  ('a8', $f$select * from pg_temp.send('question', repeat(%1$L, 500))$f$),
  ('a8', $f$select * from pg_temp.send('question', %1$L || chr(7))$f$),
  ('a5', $f$select * from pg_temp.log(%1$L, 'email', %2$L, %3$L, null, null, null, 'Asks.')$f$),
  ('a5', $f$select * from pg_temp.log('question', %1$L, %2$L, %3$L, null, null, null, 'Asks.')$f$),
  ('a5', $f$select * from pg_temp.log('question', 'email', %2$L, null, %1$L || chr(7), 'email', 'sam@requester.example', 'Asks.')$f$),
  ('a5', $f$select * from pg_temp.log('question', 'email', %2$L, null, repeat(%1$L, 30), 'email', 'sam@requester.example', 'Asks.')$f$),
  ('a5', $f$select * from pg_temp.log('question', 'email', %2$L, null, 'S1234567D ' || %1$L, 'email', 'sam@requester.example', 'Asks.')$f$),
  ('a5', $f$select * from pg_temp.log('question', 'email', %2$L, null, 'Sam Example', %1$L, 'sam@requester.example', 'Asks.')$f$),
  ('a5', $f$select * from pg_temp.log('question', 'email', %2$L, null, 'Sam Example', 'email', %1$L, 'Asks.')$f$),
  ('a5', $f$select * from pg_temp.log('question', 'email', %2$L, null, 'Sam Example', 'phone', %1$L, 'Asks.')$f$),
  ('a5', $f$select * from pg_temp.log('question', 'email', %2$L, null, 'Sam Example', 'post', %1$L || chr(8238), 'Asks.')$f$),
  ('a5', $f$select * from pg_temp.log('question', 'email', %2$L, null, 'Sam Example', 'email', 's1234567d@x.example', %1$L)$f$),
  ('a5', $f$select * from pg_temp.log('question', 'email', %2$L, %3$L, %1$L, null, null, 'Asks.')$f$),
  ('a5', $f$select * from pg_temp.log('question', 'email', %2$L, %3$L, null, null, null, repeat(%1$L, 500))$f$),
  ('a5', $f$select * from pg_temp.log('question', 'email', %2$L, %3$L, null, null, null, 'S1234567D ' || %1$L)$f$),
  ('a5', $f$select pg_temp.step(%4$L, 4, %1$L, %2$L)$f$),
  ('a5', $f$select pg_temp.step(%4$L, 4, 'note', %2$L, repeat(%1$L, 250))$f$),
  ('a5', $f$select pg_temp.step(%4$L, 4, 'note', %2$L, 'S1234567D ' || %1$L)$f$),
  ('a5', $f$select pg_temp.step(%4$L, 4, 'reclassified', %2$L, null, null, %1$L)$f$),
  ('a5', $f$select pg_temp.step(%4$L, 4, 'closed', %2$L, null, null, null, %1$L)$f$),
  ('a5', $f$select pg_temp.step(%4$L, 4, 'identity_checked', %2$L, repeat(%1$L, 60))$f$)
) as x (who, stmt);

-- RQD-16 (PD-104): the reference. 2,000 draws all match the check, with no vowel, Y, 0, 1 or L and
-- at most three digits in a row; the check refuses a lower-case (RQD-02), hyphenated, vowelled or
-- nine-symbol value; one reference twice in one org is refused (23505), while two orgs may hold the
-- same.
select pg_temp.check(count(*) filter (where not pg_temp.is_reference(r) or r ~ '[AEIOUYL01]' or r ~ '[0-9]{4}') = 0
                     and count(distinct r) > 1990,
                     format('%s of 2,000 references are out of shape, %s distinct (RQD-16)',
                            count(*) filter (where not pg_temp.is_reference(r) or r ~ '[AEIOUYL01]' or r ~ '[0-9]{4}'), count(distinct r)))
from (select public.new_case_reference() as r from generate_series(1, 2000)) x;
select pg_temp.bad_case(jsonb_build_object('reference', x), 'cases_reference')
from unnest(array['K7QM-X3TD', 'A7QMX3TD', 'K7QMX3TDB', '27QMX3TD', 'K7QM3XTD']) x;
select pg_temp.expect_error(format('insert into public.cases select * from jsonb_populate_record(null::public.cases, %L)',
                                   pg_temp.case_json('{"reference": "K7QMX3TD"}')), '23505', '%cases_org_reference%');
savepoint rqd_16;
insert into public.cases select * from jsonb_populate_record(null::public.cases, pg_temp.case_json(jsonb_build_object(
  'org_id', pg_temp.id('2', '00'), 'logged_by', pg_temp.id('2', 'a5'), 'reference', 'K7QMX3TD')));
rollback to savepoint rqd_16;
-- A clash draws again: with new_case_reference() replaced (inside a savepoint) to return org 1's
-- K7QMX3TD on its first two calls, a request records with the third draw; replaced to return it
-- always, a request and a log are 40001 after ten tries, writing nothing.
savepoint rqd_16;
create or replace function public.new_case_reference() returns text language plpgsql volatile set search_path = '' as $f$
declare
  n integer := coalesce(nullif(pg_catalog.current_setting('test.draws', true), ''), '0')::integer + 1;
begin
  perform pg_catalog.set_config('test.draws', n::text, true);
  return case when n <= 2 then 'K7QMX3TD' else 'BCDFBCDF' end;
end
$f$;
select pg_temp.act_as('1', 'a8');
select pg_temp.check(s.changed and s.reference = 'BCDFBCDF', format('a clashing reference did not draw again: %s (RQD-16)', s))
from pg_temp.send('question', 'Drawn again.') s;
reset role;
select pg_temp.check(current_setting('test.draws') = '3', format('%s draws, not 3 (RQD-16)', current_setting('test.draws')));
create or replace function public.new_case_reference() returns text language sql volatile set search_path = '' as $f$
  select 'K7QMX3TD'
$f$;
select pg_temp.refused('1', 'a8', $$select * from pg_temp.send('question', 'Never drawn.')$$, '40001',
                       'Hearth couldn''t give the request a reference. Try again.');
select pg_temp.refused('1', 'a5', format($f$select * from pg_temp.log('question', 'email', %L, %L, null, null, null, 'Never drawn.')$f$,
                                         pg_temp.today('1'), pg_temp.id('1', 'a8')),
                       '40001', 'Hearth couldn''t give the request a reference. Try again.');
rollback to savepoint rqd_16;
select pg_temp.check(pg_temp.is_reference(public.new_case_reference()) and public.new_case_reference() <> 'K7QMX3TD',
                     'new_case_reference() was not restored');
