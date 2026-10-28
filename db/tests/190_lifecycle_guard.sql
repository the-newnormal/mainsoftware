-- PDPA-09, ADM-08 (C0.10 PR 1, 0013; LH-11 to LH-13, LH-18, LH-25; TECH-SPEC T23 items 8 and 12;
-- DB-03, C010-SPEC-09): the guard and isHeld()'s front door. The cases:
--   LCD-09 a delete of cases or legal_holds with no log row is refused (HF010), as the owner and as
--          the superuser; one with a log row for that entity in the same transaction, and nothing
--          held, passes; a log row naming another entity, or written in another transaction, doesn't
--          count; a held row is refused even logged (HF009). A partitioned table carrying the guard
--          with legal_holds as its argument refuses a delete from its partition unless the log row
--          names legal_holds, not the partition (C010-SPEC-09);
--   LCD-10 a plain TRUNCATE of cases fails on Postgres's own foreign-key check (0A000); TRUNCATE ...
--          CASCADE reaches the triggers (HF010); plain TRUNCATE of case_steps and legal_holds, which
--          nothing references, fails with HF010 (DB-03);
--   LCD-11 a request's steps before the request are refused (HF010); after it, in the same
--          transaction with its log row, they pass, and the deferred key passes once checked (LH-13);
--   LCD-12 lifecycle_row_anchors() for every holds-apply table returns exactly one row with its kind
--          and people; an unknown table raises 22023;
--   LCD-13 is_held(): no org set (42501); an unknown kind (22023); a read-only transaction (25006);
--          another org's hold on the same id answers false; the answer is a boolean only.
-- The owner deletes through `set role hearth_owner`, the superuser with no role set; app.org_id is set
-- only where log_deletion() needs it, since the guard reads the org from the row.
\ir fixtures/two_orgs.sql

-- Logs a deletion as the deletion code does (the owner, in org o), returning nothing.
create function pg_temp.log(o text, class text, tbl text, object uuid) returns void language plpgsql as $$
begin
  perform set_config('app.org_id', pg_temp.id(o, '00')::text, true);
  perform public.log_deletion(class, tbl, object::text, 'retention', null, null, null, null, false);
  perform set_config('app.org_id', '', true);
end
$$;

-- LCD-09: cases (e8, a8's open complaint, which holds nothing, with its step e9) and legal_holds
-- (ed, released, on aa, whom nothing else holds; ec, active, on a9), as the owner and as the
-- superuser. Each try is undone by its own block's exception or a final raise.
do $$
declare
  who text;
begin
  foreach who in array array['hearth_owner', 'none'] loop
    perform set_config('role', who, true);
    -- No log row.
    perform pg_temp.expect_error(format('delete from public.cases where id = %L', pg_temp.id('1', 'e8')), 'HF010',
                                 'Rows here are deleted only through Hearth''s deletion code, which logs each one.');
    perform pg_temp.expect_error(format('delete from public.legal_holds where id = %L', pg_temp.id('1', 'ed')), 'HF010',
                                 'Rows here are deleted only through Hearth''s deletion code, which logs each one.');
    -- A log row for another entity, and one for this entity from another transaction (a tx_id the
    -- database didn't give this one), don't count.
    begin
      perform pg_temp.log('1', 'cases', 'cases', pg_temp.id('1', 'ea'));
      perform pg_temp.log('1', 'legal_holds', 'legal_holds', pg_temp.id('1', 'ec'));
      insert into public.deletion_log (org_id, tx_id, class_key, object_table, object_id, cause) values
        (pg_temp.id('1', '00'), '3'::xid8, 'cases', 'cases', pg_temp.id('1', 'e8')::text, 'retention'),
        (pg_temp.id('1', '00'), '3'::xid8, 'legal_holds', 'legal_holds', pg_temp.id('1', 'ed')::text, 'retention');
      -- Another org's log row for the same id doesn't count either.
      insert into public.deletion_log (org_id, class_key, object_table, object_id, cause) values
        (pg_temp.id('2', '00'), 'cases', 'cases', pg_temp.id('1', 'e8')::text, 'retention');
      perform pg_temp.expect_error(format('delete from public.cases where id = %L', pg_temp.id('1', 'e8')), 'HF010');
      perform pg_temp.expect_error(format('delete from public.legal_holds where id = %L', pg_temp.id('1', 'ed')), 'HF010');
      raise exception 'undo' using errcode = 'P0001';
    exception when sqlstate 'P0001' then
      if sqlerrm <> 'undo' then raise; end if;
    end;
    -- Logged, and nothing held: it passes, the request with its step after it.
    begin
      perform pg_temp.log('1', 'cases', 'cases', pg_temp.id('1', 'e8'));
      perform pg_temp.expect_rows(format('delete from public.cases where id = %L', pg_temp.id('1', 'e8')), 1);
      perform pg_temp.expect_rows(format('delete from public.case_steps where case_id = %L', pg_temp.id('1', 'e8')), 1);
      perform pg_temp.log('1', 'legal_holds', 'legal_holds', pg_temp.id('1', 'ed'));
      perform pg_temp.expect_rows(format('delete from public.legal_holds where id = %L', pg_temp.id('1', 'ed')), 1);
      raise exception 'undo' using errcode = 'P0001';
    exception when sqlstate 'P0001' then
      if sqlerrm <> 'undo' then raise; end if;
    end;
    -- Logged, but held: ec is an active hold on a9, and holds itself (DB-08); Sam Example's open
    -- request for a copy, ea, holds itself (LH-20).
    begin
      perform pg_temp.log('1', 'legal_holds', 'legal_holds', pg_temp.id('1', 'ec'));
      perform pg_temp.expect_error(format('delete from public.legal_holds where id = %L', pg_temp.id('1', 'ec')), 'HF009',
                                   'This record is kept for now, so it can''t be deleted.');
      perform pg_temp.log('1', 'cases', 'cases', pg_temp.id('1', 'ea'));
      perform pg_temp.expect_error(format('delete from public.cases where id = %L', pg_temp.id('1', 'ea')), 'HF009',
                                   'This record is kept for now, so it can''t be deleted.');
      raise exception 'undo' using errcode = 'P0001';
    exception when sqlstate 'P0001' then
      if sqlerrm <> 'undo' then raise; end if;
    end;
    perform set_config('role', 'none', true);
  end loop;
end
$$;
select pg_temp.check((select count(*) from public.cases where id in (pg_temp.id('1', 'e8'), pg_temp.id('1', 'ea'))) = 2
                     and (select count(*) from public.legal_holds where org_id = pg_temp.id('1', '00')) = 2,
                     'a guarded row went (LCD-09)');
-- C010-SPEC-09: a row trigger on a partitioned table is cloned onto each partition and fires with
-- the partition's name, so the guard reads its table from its argument. A scratch partitioned table
-- with legal_holds' columns and the guard named legal_holds: a delete from its partition needs a log
-- row naming legal_holds, never the partition. (As the superuser; the block undoes it all.)
do $$
begin
  create table public.lcd09_holds (like public.legal_holds) partition by list (org_id);
  create table public.lcd09_holds_one partition of public.lcd09_holds for values in ('f1000000-0000-4000-8000-000000000000');
  create trigger lifecycle_guard before delete on public.lcd09_holds
    for each row execute function public.lifecycle_guard('legal_holds');
  insert into public.lcd09_holds select * from public.legal_holds where id = pg_temp.id('1', 'ed');
  perform pg_temp.check((select count(*) from pg_trigger t where t.tgrelid = 'public.lcd09_holds_one'::regclass
                         and t.tgname = 'lifecycle_guard' and encode(t.tgargs, 'escape') = 'legal_holds\000') = 1,
                        'the partition has no clone of the guard naming legal_holds (LCD-09)');
  perform pg_temp.expect_error(format('delete from public.lcd09_holds where id = %L', pg_temp.id('1', 'ed')), 'HF010');
  insert into public.deletion_log (org_id, class_key, object_table, object_id, cause)
  values (pg_temp.id('1', '00'), 'legal_holds', 'lcd09_holds_one', pg_temp.id('1', 'ed')::text, 'retention');
  perform pg_temp.expect_error(format('delete from public.lcd09_holds where id = %L', pg_temp.id('1', 'ed')), 'HF010');
  perform pg_temp.expect_error(format('delete from public.lcd09_holds_one where id = %L', pg_temp.id('1', 'ed')), 'HF010');
  insert into public.deletion_log (org_id, class_key, object_table, object_id, cause)
  values (pg_temp.id('1', '00'), 'legal_holds', 'legal_holds', pg_temp.id('1', 'ed')::text, 'retention');
  perform pg_temp.expect_rows(format('delete from public.lcd09_holds_one where id = %L', pg_temp.id('1', 'ed')), 1);
  raise exception 'undo' using errcode = 'P0001';
exception when sqlstate 'P0001' then
  if sqlerrm <> 'undo' then raise; end if;
end
$$;
select pg_temp.check(to_regclass('public.lcd09_holds') is null and (select count(*) from public.legal_holds where id = pg_temp.id('1', 'ed')) = 1,
                     'the partition case left something behind (LCD-09)');

-- LCD-10 (DB-03): TRUNCATE. A plain TRUNCATE of cases, which case_steps and processing_restrictions
-- reference, fails on Postgres's own foreign-key check before any trigger (0A000); with CASCADE it
-- reaches the triggers (HF010); case_steps and legal_holds, which nothing references, reach theirs.
-- case_steps' key to cases is deferred (LH-13), so the fixture's steps, written in this transaction,
-- leave checks pending until the commit, and TRUNCATE refuses a table with pending trigger events
-- (55006) before any trigger runs; checking them now, as a transaction of its own would have, lets
-- the TRUNCATE reach the guard.
set constraints case_steps_org_id_case_id_fkey immediate;
set local client_min_messages = warning;
set local role hearth_owner;
select pg_temp.expect_error('truncate public.cases', '0A000');
select pg_temp.expect_error('truncate public.cases cascade', 'HF010',
                            'Rows here are deleted only through Hearth''s deletion code, never TRUNCATE.');
select pg_temp.expect_error('truncate public.case_steps', 'HF010',
                            'Rows here are deleted only through Hearth''s deletion code, never TRUNCATE.');
select pg_temp.expect_error('truncate public.legal_holds', 'HF010',
                            'Rows here are deleted only through Hearth''s deletion code, never TRUNCATE.');
reset role;
select pg_temp.expect_error('truncate public.cases cascade', 'HF010');
select pg_temp.expect_error('truncate public.legal_holds', 'HF010');
select pg_temp.check((select count(*) from public.cases) >= 4 and (select count(*) from public.case_steps) >= 4
                     and (select count(*) from public.legal_holds) >= 4,
                     'a TRUNCATE emptied a guarded table (LCD-10)');
set constraints case_steps_org_id_case_id_fkey deferred;
set local client_min_messages = notice;

-- LCD-11 (LH-13): children after parents. With the request's log row, its step still can't go
-- before it (HF010); once the request is gone, in the same transaction, the step goes, and the
-- deferred key passes when checked.
savepoint lcd_11;
set local role hearth_owner;
select pg_temp.log('2', 'cases', 'cases', pg_temp.id('2', 'e8'));
select pg_temp.expect_error(format('delete from public.case_steps where id = %L', pg_temp.id('2', 'e9')), 'HF010',
                            'A step is deleted only with its request, after it.');
select pg_temp.expect_rows(format('delete from public.cases where id = %L', pg_temp.id('2', 'e8')), 1);
select pg_temp.expect_rows(format('delete from public.case_steps where id = %L', pg_temp.id('2', 'e9')), 1);
reset role;
set constraints case_steps_org_id_case_id_fkey immediate;
set constraints case_steps_org_id_case_id_fkey deferred;
select pg_temp.check(not exists (select 1 from public.case_steps where case_id = pg_temp.id('2', 'e8')),
                     'the step outlived its request (LCD-11)');
rollback to savepoint lcd_11;
-- The key is deferrable, initially deferred: deleting a request before its steps waits for the
-- commit's check, and fails it if a step is left.
select pg_temp.check(condeferrable and condeferred, 'case_steps'' key to cases is not deferrable initially deferred (LCD-11)')
from pg_constraint where conname = 'case_steps_org_id_case_id_fkey';
savepoint lcd_11_left;
select pg_temp.log('2', 'cases', 'cases', pg_temp.id('2', 'e8'));
delete from public.cases where id = pg_temp.id('2', 'e8');
select pg_temp.expect_error('set constraints case_steps_org_id_case_id_fkey immediate', '23503', '%case_steps_org_id_case_id_fkey%');
rollback to savepoint lcd_11_left;
-- LCD-12: lifecycle_row_anchors() for every table of a holds-apply class, from the fixture's rows,
-- each exactly one row with its kind, its item and its people.
create function pg_temp.anchors(tbl text, r jsonb) returns text language sql as $$
  select string_agg(format('%s %s %s', a.kind, coalesce(a.item::text, '-'),
                           (select coalesce(array_agg(x order by x)::text, '{}') from unnest(a.persons) x)), ';')
  from public.lifecycle_row_anchors(pg_temp.id('1', '00'), tbl, r) a
$$;
select pg_temp.check(pg_temp.anchors('phone_numbers', (select to_jsonb(x) from public.phone_numbers x
                                                       where x.org_id = pg_temp.id('1', '00') and x.e164 = '+6519999999'))
                     = format('phone_number %s {%s}', (select id from public.phone_numbers where e164 = '+6519999999'), pg_temp.id('1', 'a8')),
                     'a phone number''s anchors are wrong (LCD-12)');
select pg_temp.check(pg_temp.anchors('devices', (select to_jsonb(x) from public.devices x where x.id = pg_temp.id('1', 'e1')))
                     = format('device %s {%s}', pg_temp.id('1', 'e1'), pg_temp.id('1', 'a8')),
                     'a device''s anchors are wrong (LCD-12)');
select pg_temp.check(pg_temp.anchors('sessions', (select to_jsonb(x) from public.sessions x where x.id = pg_temp.id('1', 'e2')))
                     = format('signin_session %s {%s}', pg_temp.id('1', 'e2'), pg_temp.id('1', 'a8')),
                     'a sign-in session''s anchors are wrong, or it reads as a room session (LCD-12)');
select pg_temp.check(pg_temp.anchors('passkeys', (select to_jsonb(x) from public.passkeys x where x.id = pg_temp.id('1', 'e7')))
                     = format('passkey %s {%s}', pg_temp.id('1', 'e7'), pg_temp.id('1', 'a8')),
                     'a passkey''s anchors are wrong (LCD-12)');
select pg_temp.check(pg_temp.anchors('notice_acknowledgments', (select to_jsonb(x) from public.notice_acknowledgments x
                                                                where x.org_id = pg_temp.id('1', '00')))
                     = format('notice_acknowledgment %s {%s}', (select id from public.notice_acknowledgments
                                                                where org_id = pg_temp.id('1', '00')), pg_temp.id('1', 'a8')),
                     'an acknowledgement''s anchors are wrong (LCD-12)');
select pg_temp.check(pg_temp.anchors('cases', (select to_jsonb(x) from public.cases x where x.id = pg_temp.id('1', 'e8')))
                     = format('case %s {%s}', pg_temp.id('1', 'e8'), pg_temp.id('1', 'a8'))
                     and pg_temp.anchors('cases', (select to_jsonb(x) from public.cases x where x.id = pg_temp.id('1', 'ea')))
                         = format('case %s {}', pg_temp.id('1', 'ea')),
                     'a case''s anchors are wrong (LCD-12)');
select pg_temp.check(pg_temp.anchors('case_steps', (select to_jsonb(x) from public.case_steps x where x.id = pg_temp.id('1', 'e9')))
                     = format('case %s {%s}', pg_temp.id('1', 'e8'), pg_temp.id('1', 'a8')),
                     'a step doesn''t anchor as its request (LCD-12)');
select pg_temp.check(pg_temp.anchors('legal_holds', (select to_jsonb(x) from public.legal_holds x where x.id = pg_temp.id('1', 'ec')))
                     = format('legal_hold %s {%s}', pg_temp.id('1', 'ec'), pg_temp.id('1', 'a9'))
                     and pg_temp.anchors('legal_holds', (select to_jsonb(x) || '{"target_kind": "channel"}' from public.legal_holds x
                                                         where x.id = pg_temp.id('1', 'ec')))
                         = format('legal_hold %s {}', pg_temp.id('1', 'ec')),
                     'a legal hold''s anchors are wrong (LCD-12)');
-- An access-log row: its subject, its actor and the person acted for.
select pg_temp.check(pg_temp.anchors('data_access_events', jsonb_build_object(
                       'id', 'a0000000-0000-4000-8000-0000000000d1', 'subject_id', pg_temp.id('1', 'a8'), 'actor_id', pg_temp.id('1', 'ac'),
                       'on_behalf_of_id', pg_temp.id('1', 'a7')))
                     = format('data_access_event a0000000-0000-4000-8000-0000000000d1 {%s,%s,%s}', pg_temp.id('1', 'a7'),
                              pg_temp.id('1', 'a8'), pg_temp.id('1', 'ac')),
                     'an access-log row''s anchors are wrong (LCD-12)');
-- An audit row (no item: its id is a whole number): its actor, the person acted for, a target
-- person, and the requester of the case it names by target or by case_id.
select pg_temp.check(pg_temp.anchors('audit_events', jsonb_build_object(
                       'id', 7, 'actor_id', pg_temp.id('1', 'a1'), 'on_behalf_of_id', pg_temp.id('1', 'a2'),
                       'target_type', 'person', 'target_id', pg_temp.id('1', 'a3')))
                     = format('audit_event - {%s,%s,%s}', pg_temp.id('1', 'a1'), pg_temp.id('1', 'a2'), pg_temp.id('1', 'a3')),
                     'an audit row''s actor, person acted for or target person is missing (LCD-12)');
select pg_temp.check(pg_temp.anchors('audit_events', jsonb_build_object(
                       'id', 8, 'actor_id', pg_temp.id('1', 'a5'), 'target_type', 'case', 'target_id', pg_temp.id('1', 'e8')))
                     = format('audit_event - {%s,%s}', pg_temp.id('1', 'a5'), pg_temp.id('1', 'a8'))
                     and pg_temp.anchors('audit_events', jsonb_build_object(
                           'id', 9, 'actor_id', pg_temp.id('1', 'a5'), 'action', 'privileged.read', 'target_type', 'message',
                           'target_id', 'm-1', 'case_id', pg_temp.id('1', 'e8')))
                         = format('audit_event - {%s,%s}', pg_temp.id('1', 'a5'), pg_temp.id('1', 'a8')),
                     'an audit row doesn''t anchor the requester of the case it names (LCD-12)');
-- Targets that aren't a uuid, another org's case, and nobody at all: still one row.
select pg_temp.check(pg_temp.anchors('audit_events', jsonb_build_object('id', 10, 'target_type', 'person', 'target_id', 'all'))
                     = 'audit_event - {}'
                     and pg_temp.anchors('audit_events', jsonb_build_object('id', 11, 'target_type', 'case',
                                                                            'target_id', pg_temp.id('2', 'e8')))
                         = 'audit_event - {}'
                     and pg_temp.anchors('audit_events', '{"id": 12}') = 'audit_event - {}',
                     'an audit row with no person to anchor doesn''t give one row with none (LCD-12)');
-- Every table of a holds-apply class answers exactly one row, for a row of nothing but its id.
select pg_temp.check(not exists (
  select 1 from public.retention_class_defaults() c cross join unnest(c.tables) t
  where c.holds = 'apply'
    and (select count(*) from public.lifecycle_row_anchors(pg_temp.id('1', '00'), t, jsonb_build_object('id', gen_random_uuid()))) <> 1),
  'a holds-apply table has no anchors (LCD-12)');
select pg_temp.expect_error($$select * from public.lifecycle_row_anchors('f1000000-0000-4000-8000-000000000000', 'people', '{}')$$,
                            '22023', 'lifecycle_row_anchors() has no anchors for that table.');
select pg_temp.expect_error($$select * from public.lifecycle_row_anchors('f1000000-0000-4000-8000-000000000000', 'deletion_log', '{}')$$,
                            '22023', 'lifecycle_row_anchors() has no anchors for that table.');

-- LCD-13: is_held()'s front door, as the owner (granted to nobody; the deletion code calls it).
set local role hearth_owner;
select set_config('app.org_id', '', true);
select pg_temp.expect_error(format('select public.is_held(%L, %L)', 'person', pg_temp.id('1', 'a9')), '42501',
                            'No org is set for this transaction');
select set_config('app.org_id', pg_temp.id('1', '00')::text, true);
select pg_temp.expect_error(format('select public.is_held(%L, %L)', 'message', gen_random_uuid()), '22023',
                            'Hearth can''t tell yet whether that kind of record is held.');
select pg_temp.expect_error(format('select public.is_held(%L, %L)', 'session', pg_temp.id('1', 'e2')), '22023',
                            'Hearth can''t tell yet whether that kind of record is held.');
select pg_temp.expect_error(format('select public.is_held(%L, %L)', null, pg_temp.id('1', 'e2')), '22023');
-- In a read-only transaction it refuses itself, before anything else (judge 1's graft): no GET can
-- call it. (Going read-only is allowed mid-transaction; the block's own rollback undoes it.)
do $$
begin
  perform set_config('transaction_read_only', 'on', true);
  perform pg_temp.expect_error(format('select public.is_held(%L, %L)', 'person', pg_temp.id('1', 'a9')), '25006',
                               'Whether something is held is asked only in the transaction that deletes it.');
  perform set_config('app.org_id', '', true);
  perform pg_temp.expect_error(format('select public.is_held(%L, %L)', 'person', pg_temp.id('1', 'a9')), '25006');
  raise exception 'undo' using errcode = 'P0001';
exception when sqlstate 'P0001' then
  if sqlerrm <> 'undo' then raise; end if;
end
$$;
select pg_temp.check(current_setting('transaction_read_only') = 'off' and current_setting('app.org_id') = pg_temp.id('1', '00')::text,
                     'the read-only case leaked out of its block (LCD-13)');
-- a9 is held in org 1 (ec); org 2's hold on org 1's a8, by the same id, is no hold of org 1's.
reset role;
insert into public.legal_holds (org_id, client_key, target_kind, target_id, reason, placed_by)
values (pg_temp.id('2', '00'), gen_random_uuid(), 'person', pg_temp.id('1', 'a8'), 'Planted across orgs', pg_temp.id('2', 'a6'));
set local role hearth_owner;
select pg_temp.check(public.is_held('person', pg_temp.id('1', 'a9')) and not public.is_held('person', pg_temp.id('1', 'a8')),
                     'is_held() didn''t answer a9 held and a8 not, in org 1 (LCD-13)');
select set_config('app.org_id', pg_temp.id('2', '00')::text, true);
select pg_temp.check(not public.is_held('person', pg_temp.id('1', 'a9')),
                     'is_held() in org 2 read org 1''s hold on a9 (LCD-13)');
reset role;
select pg_temp.check(pg_get_function_result('public.is_held(text,uuid)'::regprocedure) = 'boolean',
                     'is_held() answers more than a boolean (LCD-13)');
