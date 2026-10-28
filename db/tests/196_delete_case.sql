-- PDPA-09, REC-23, ADM-06, ADM-08 (C0.10 PR 1, 0013; LH-09, LH-22, LH-23, LH-25; TECH-SPEC T23 item
-- 13; T22 items 52 and 62; T15 item 17; DB-09). C0.10 Done: held items refuse deletion.
-- delete_case(), the deletion code's only path for a request, which C2.9's sweep will call as
-- Hearth. The cases:
--   LCD-27 every persona a1 to ac is refused (42501) and only Hearth (a0) proceeds; a cause other than
--          retention, or a null replay, is refused (22023); an unknown case answers gone; an open one
--          open; one closed 731 days ago (in its org's zone) not_due and one closed 732 days ago past
--          it; with retention_period_days() replaced to answer null, as C2.9's replacement could,
--          a refusal (22023) that deletes nothing, never a due test read as passed (HOLDS-02); held
--          for a refused copy in its window, a legal hold on the requester, the requester's other
--          refused copy, the requester's open correction and an active legal hold citing the case,
--          and not for a released one citing it; cited for a case a restriction names;
--   LCD-28 an answered complaint and an outsider's answered copy, both past the period, answer
--          deleted: one log row, the case and its steps gone, one case.deleted audit row with
--          {class, cause, replayed, steps}, which read_audit_events() returns to a DPO reader alone;
--          the deferred key passes;
--   LCD-29 a second call answers gone and writes nothing; a replay follows the same rules, not_due
--          and held included, and its log row keeps the cause with replayed true;
--   LCD-30 the guard as the backstop: the owner deleting a held case directly, with a log row, is
--          refused (HF009), and without one (HF010).
-- delete_case() is granted to nobody until C2.9's job role, so it runs here as the owner with each
-- persona as app.user_id (DB-09). The orgs are moved to Pacific/Kiritimati (UTC+14) and
-- Pacific/Pago_Pago (UTC-11), so the period's edge is read in each org's own zone. The requests are
-- made up.
\ir fixtures/two_orgs.sql

update public.orgs set time_zone = 'Pacific/Kiritimati' where id = pg_temp.id('1', '00');
update public.orgs set time_zone = 'Pacific/Pago_Pago' where id = pg_temp.id('2', '00');
create function pg_temp.today(o text) returns date language sql stable as $$
  select (now() at time zone x.time_zone)::date from public.orgs x where x.id = pg_temp.id(o, '00')
$$;

-- A request in org o, logged by the DPO (a5) by email for the person with the given suffix (or,
-- with none, someone without an account), of the given kind, received the day before its closure
-- (closed `closed` days from today with the outcome given, or open with none), with an identity
-- step and then the steps given ({step, on, kind}).
create function pg_temp.request(o text, requester text, kind text, closed integer, outcome text,
                                steps jsonb default '[]') returns uuid language plpgsql as $$
declare
  today date := pg_temp.today(o);
  received date := today + least(coalesce(closed, 0), coalesce((select min((s ->> 'on')::integer)
                                                                   from jsonb_array_elements(steps) s), 0)) - 1;
  made uuid := gen_random_uuid();
  s jsonb;
  n integer := 1;
begin
  insert into public.cases (id, org_id, client_key, kind, came_by, received_on, logged_by, requester_person_id, requester_name,
                            requester_channel, requester_contact, details)
  values (made, pg_temp.id(o, '00'), gen_random_uuid(), kind, 'email', received, pg_temp.id(o, 'a5'),
          case when requester is not null then pg_temp.id(o, requester) end,
          case when requester is null then 'Sam Example' end, case when requester is null then 'email' end,
          case when requester is null then 'sam@requester.example' end, 'A request made up for the test.');
  insert into public.case_steps (org_id, case_id, number, step, on_day, note, recorded_by)
  values (pg_temp.id(o, '00'), made, 1, 'identity_checked', received, 'Matched against HR records', pg_temp.id(o, 'a5'));
  for s in select x from jsonb_array_elements(steps) x loop
    n := n + 1;
    insert into public.case_steps (org_id, case_id, number, step, on_day, kind, recorded_by)
    values (pg_temp.id(o, '00'), made, n, s ->> 'step', today + (s ->> 'on')::integer, s ->> 'kind', pg_temp.id(o, 'a5'));
  end loop;
  if closed is not null then
    update public.cases
    set closed_on = today + request.closed, closed_kind = request.kind, outcome = request.outcome,
        closed_note = case when request.outcome = 'refused' then 'Refused under the exception for a made-up reason.' end,
        closed_at = now(), closed_by = pg_temp.id(o, 'a5')
    where id = made;
  end if;
  return made;
end
$$;
-- delete_case(), as the owner, in org o, acting as the persona given (Hearth by default).
create function pg_temp.delete_case(o text, the_case uuid, cause text default 'retention', replay boolean default false,
                                    actor text default 'a0') returns text language plpgsql as $$
declare
  answer text;
begin
  perform set_config('app.org_id', pg_temp.id(o, '00')::text, true);
  perform set_config('app.user_id', pg_temp.id(o, actor)::text, true);
  perform set_config('role', 'hearth_owner', true);
  answer := public.delete_case(the_case, cause, replay);
  perform set_config('role', 'none', true);
  perform set_config('app.org_id', '', true);
  perform set_config('app.user_id', '', true);
  return answer;
end
$$;
-- How many log and audit rows the deletion code has written, as "log audit".
create function pg_temp.written() returns text language sql stable as $$
  select format('%s %s', (select count(*) from public.deletion_log where object_table = 'cases'),
                (select count(*) from public.audit_events where action = 'case.deleted'))
$$;

-- LCD-27: only Hearth deletes a request (DB-09). Every persona is refused, the departed DPO (a9),
-- the former Admin (aa), the agent (ab) and the assistant (ac) included, and so is a transaction
-- with no org or user set.
select set_config('test.due', pg_temp.request('1', 'a2', 'complaint', -800, 'answered')::text, true);
do $$
declare
  s text;
begin
  foreach s in array array['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9', 'aa', 'ab', 'ac'] loop
    perform pg_temp.expect_error(format('select pg_temp.delete_case(%L, %L, %L, false, %L)', '1', current_setting('test.due'), 'retention', s),
                                 '42501', 'Only Hearth itself deletes a request; this transaction acts as someone else');
    perform set_config('role', 'none', true);
  end loop;
  -- Org 2's Hearth isn't org 1's.
  perform set_config('app.org_id', pg_temp.id('1', '00')::text, true);
  perform set_config('app.user_id', pg_temp.id('2', 'a0')::text, true);
  perform pg_temp.expect_error(format('select public.delete_case(%L, %L, false)', current_setting('test.due'), 'retention'), '42501');
  perform set_config('app.org_id', '', true);
  perform pg_temp.expect_error(format('select public.delete_case(%L, %L, false)', current_setting('test.due'), 'retention'), '42501',
                               'No org or user is set for this transaction');
  perform set_config('app.user_id', '', true);
end
$$;
select pg_temp.check(pg_temp.written() = '0 0' and exists (select 1 from public.cases where id = current_setting('test.due')::uuid),
                     'a refused persona deleted or logged something (LCD-27)');
-- Its cause is retention, and replay is said either way.
select pg_temp.expect_error(format('select pg_temp.delete_case(%L, %L, %L)', '1', current_setting('test.due'), c), '22023',
                            'A request is deleted only when its retention ends.')
from unnest(array['request', 'user', 'cascade', 'replay']) c;
select pg_temp.expect_error(format('select pg_temp.delete_case(%L, %L, null)', '1', current_setting('test.due')), '22023');
select pg_temp.expect_error(format('select pg_temp.delete_case(%L, %L, %L, null)', '1', current_setting('test.due'), 'retention'), '22023');
-- gone, open, and the period's edge in each org's zone: kept through closed_on plus 731 days.
select pg_temp.check(pg_temp.delete_case('1', gen_random_uuid()) = 'gone'
                     and pg_temp.delete_case('2', current_setting('test.due')::uuid) = 'gone',
                     'an unknown case, or another org''s, isn''t gone (LCD-27)');
select pg_temp.check(pg_temp.delete_case(o, pg_temp.request(o, 'a7', 'question', null, null)) = 'open'
                     and pg_temp.delete_case(o, pg_temp.request(o, null, 'complaint', -731, 'answered')) = 'not_due'
                     and pg_temp.delete_case(o, pg_temp.request(o, null, 'complaint', -1, 'answered')) = 'not_due'
                     and pg_temp.delete_case(o, pg_temp.request(o, null, 'complaint', -732, 'answered')) = 'deleted',
                     format('org %s: open, day 731 and day 732 don''t answer open, not_due and deleted (LCD-27)', o))
from unnest(array['1', '2']) o;
-- HOLDS-02: the due test fails closed. retention_period_days() replaced, as C2.9 will replace it to
-- read the DPO's setting, with one that answers null: a request closed yesterday, which the default
-- keeps, and one closed 800 days ago are each refused (22023), never read as due, and nothing is
-- deleted or logged.
savepoint lcd_27_null_period;
select set_config('test.recent', pg_temp.request('1', null, 'complaint', -1, 'answered')::text, true);
select set_config('test.old', pg_temp.request('1', null, 'complaint', -800, 'answered')::text, true);
create or replace function public.retention_period_days(org uuid, class text) returns integer
language sql stable set search_path = '' as $f$ select null::integer $f$;
select set_config('test.written', pg_temp.written(), true);
select pg_temp.expect_error(format('select pg_temp.delete_case(%L, %L)', '1', current_setting(t)), '22023',
                            'A request''s retention period can''t be read, so nothing is deleted.')
from unnest(array['test.recent', 'test.old']) t;
select pg_temp.check(pg_temp.written() = current_setting('test.written')
                     and (select count(*) from public.cases
                          where id in (current_setting('test.recent')::uuid, current_setting('test.old')::uuid)) = 2,
                     'a request whose period reads as null was deleted or logged (LCD-27, HOLDS-02)');
rollback to savepoint lcd_27_null_period;
select pg_temp.check(public.retention_period_days(pg_temp.id('1', '00'), 'cases') = 731,
                     'the replaced retention_period_days() outlived its savepoint (LCD-27, HOLDS-02)');
-- held: a refused copy in its window (a review open, or one ended today, past the period);
savepoint lcd_27_held;
select pg_temp.check(pg_temp.delete_case('1', pg_temp.request('1', null, 'access', -800, 'refused',
                                                              '[{"step": "review_started", "on": -790}]')) = 'held'
                     and pg_temp.delete_case('1', pg_temp.request('1', null, 'access', -800, 'refused',
                                                                  '[{"step": "review_started", "on": -790}, {"step": "review_ended", "on": 0}]')) = 'held'
                     and pg_temp.delete_case('1', pg_temp.request('1', null, 'access', -800, 'refused',
                                                                  '[{"step": "review_started", "on": -790}, {"step": "review_ended", "on": -1}]')) = 'deleted',
                     'a refused copy past the period isn''t held through its review''s end, and only then (LCD-27)');
-- a legal hold on the requester (placed as C1.11's writer will: the person's row first);
insert into public.legal_holds (org_id, client_key, target_kind, target_id, reason, placed_by)
values (pg_temp.id('1', '00'), gen_random_uuid(), 'person', pg_temp.id('1', 'a2'), 'Investigation into a2''s records', pg_temp.id('1', 'a6'));
select pg_temp.check(pg_temp.delete_case('1', current_setting('test.due')::uuid) = 'held', 'a legal hold on the requester doesn''t hold (LCD-27)');
-- the requester's other refused copy, in its window;
select set_config('test.a3_due', pg_temp.request('1', 'a3', 'complaint', -800, 'answered')::text, true);
select pg_temp.request('1', 'a3', 'access', -10, 'refused');
select pg_temp.check(pg_temp.delete_case('1', current_setting('test.a3_due')::uuid) = 'held',
                     'the requester''s other refused copy doesn''t hold (LCD-27)');
-- the requester's open correction request (LH-45);
select set_config('test.a4_due', pg_temp.request('1', 'a4', 'complaint', -800, 'answered')::text, true);
select pg_temp.request('1', 'a4', 'correction', null, null);
select pg_temp.check(pg_temp.delete_case('1', current_setting('test.a4_due')::uuid) = 'held',
                     'the requester''s open correction doesn''t hold (LCD-27)');
-- an active legal hold citing the case, on someone else; and not a released one.
select set_config('test.cited_hold', pg_temp.request('1', 'a7', 'complaint', -800, 'answered')::text, true);
select set_config('test.cited_released', pg_temp.request('1', 'a1', 'complaint', -800, 'answered')::text, true);
insert into public.legal_holds (org_id, client_key, target_kind, target_id, reason, case_id, placed_by) values
  (pg_temp.id('1', '00'), gen_random_uuid(), 'person', pg_temp.id('1', 'a8'), 'Cites a7''s request',
   current_setting('test.cited_hold')::uuid, pg_temp.id('1', 'a6'));
insert into public.legal_holds (org_id, client_key, target_kind, target_id, reason, case_id, placed_by, released_at, released_by,
                                release_reason) values
  (pg_temp.id('1', '00'), gen_random_uuid(), 'person', pg_temp.id('1', 'a4'), 'Cited a1''s request once',
   current_setting('test.cited_released')::uuid, pg_temp.id('1', 'a6'), now(), pg_temp.id('1', 'a5'), 'That matter closed');
select pg_temp.check(pg_temp.delete_case('1', current_setting('test.cited_hold')::uuid) = 'held',
                     'an active legal hold citing the case doesn''t hold it (LCD-27)');
select pg_temp.check(pg_temp.delete_case('1', current_setting('test.cited_released')::uuid) = 'deleted',
                     'a released legal hold citing the case still holds it (LCD-27)');
rollback to savepoint lcd_27_held;
-- cited: a processing restriction names it, lifted or not (as the superuser: no writer before C2.11).
savepoint lcd_27_cited;
select set_config('test.withdrawal', pg_temp.request('2', 'a7', 'withdrawal', -800, 'answered')::text, true);
insert into public.processing_restrictions (org_id, person_id, purpose, effective_at, created_by, case_id, lifted_at, lifted_by)
values (pg_temp.id('2', '00'), pg_temp.id('2', 'a7'), 'presence_receipts', now() - interval '800 days', pg_temp.id('2', 'a5'),
        current_setting('test.withdrawal')::uuid, now() - interval '700 days', pg_temp.id('2', 'a5'));
select pg_temp.check(pg_temp.delete_case('2', current_setting('test.withdrawal')::uuid) = 'cited',
                     'a case a restriction names, lifted, isn''t cited (LCD-27)');
rollback to savepoint lcd_27_cited;

-- LCD-28: deleted. An answered complaint of a2's and an outsider's answered copy, both past the
-- period, each with its steps.
savepoint lcd_28;
insert into public.audit_log_readers (org_id, role, created_by) values
  (pg_temp.id('1', '00'), 'dpo', pg_temp.id('1', 'a1')), (pg_temp.id('1', '00'), 'leadership', pg_temp.id('1', 'a1'));
select set_config('test.outsider', pg_temp.request('1', null, 'access', -900, 'answered',
                                                   '[{"step": "replied", "on": -901}]')::text, true);
select set_config('test.log_before', (select coalesce(max(id), 0)::text from public.deletion_log), true);
select pg_temp.check(pg_temp.delete_case('1', current_setting('test.due')::uuid) = 'deleted'
                     and pg_temp.delete_case('1', current_setting('test.outsider')::uuid) = 'deleted',
                     'an answered complaint and an outsider''s answered copy past the period weren''t deleted (LCD-28)');
select pg_temp.check(not exists (select 1 from public.cases where id in (current_setting('test.due')::uuid, current_setting('test.outsider')::uuid))
                     and not exists (select 1 from public.case_steps
                                     where case_id in (current_setting('test.due')::uuid, current_setting('test.outsider')::uuid)),
                     'a deleted request or a step of it is still there (LCD-28)');
select pg_temp.check(count(*) = 2 and bool_and(org_id = pg_temp.id('1', '00') and class_key = 'cases' and object_table = 'cases'
                                               and cause = 'retention' and not replayed and case_id is null and parent_id is null
                                               and s3_key is null and tx_id = pg_current_xact_id())
                     and array_agg(object_id order by object_id) = (select array_agg(x order by x) from unnest(array[
                       current_setting('test.due'), current_setting('test.outsider')]) x),
                     'the deletions weren''t logged once each, as retention, by id (LCD-28)')
from public.deletion_log where id > current_setting('test.log_before')::bigint;
select pg_temp.check(count(*) = 2 and bool_and(actor_id = pg_temp.id('1', 'a0') and target_type = 'case' and on_behalf_of_id is null
                                               and case_id is null and request_id is null)
                     and array_agg(details order by target_id) = (select array_agg(d order by t) from (values
                       (current_setting('test.due'), '{"class": "cases", "cause": "retention", "replayed": false, "steps": 1}'::jsonb),
                       (current_setting('test.outsider'), '{"class": "cases", "cause": "retention", "replayed": false, "steps": 2}'::jsonb)) v (t, d)),
                     'the case.deleted audit rows aren''t Hearth''s, with {class, cause, replayed, steps} (LCD-28)')
from public.audit_events where action = 'case.deleted' and target_id in (current_setting('test.due'), current_setting('test.outsider'));
-- read_audit_events() returns them to a reader who holds dpo, and not to one on the readers list
-- who doesn't (OD-23, 0012).
select pg_temp.act_as('1', 'a5');
select pg_temp.check(count(*) = 2, 'the DPO''s audit read lacks the case.deleted rows (LCD-28)')
from public.read_audit_events(now() - interval '1 day', now() + interval '1 day')
where action = 'case.deleted' and target_id in (current_setting('test.due'), current_setting('test.outsider'));
reset role;
select pg_temp.act_as('1', 'a4');
select pg_temp.check(count(*) = 0, 'a Leadership reader without dpo read a case.deleted row (LCD-28)')
from public.read_audit_events(now() - interval '1 day', now() + interval '1 day') where action = 'case.deleted';
reset role;
-- The deferred key is checked now, with every step gone after its request.
set constraints case_steps_org_id_case_id_fkey immediate;
set constraints case_steps_org_id_case_id_fkey deferred;

-- LCD-29: a second call answers gone and writes nothing.
select set_config('test.written', pg_temp.written(), true);
select pg_temp.check(pg_temp.delete_case('1', current_setting('test.due')::uuid) = 'gone'
                     and pg_temp.delete_case('1', current_setting('test.due')::uuid, 'retention', true) = 'gone'
                     and pg_temp.written() = current_setting('test.written'),
                     'a second call, or its replay, wrote something (LCD-29)');
rollback to savepoint lcd_28;
-- A replay follows the same rules: not_due, held and deleted, its log row keeping the cause with
-- replayed true.
savepoint lcd_29;
select set_config('test.log_before', (select coalesce(max(id), 0)::text from public.deletion_log), true);
select pg_temp.check(pg_temp.delete_case('2', pg_temp.request('2', null, 'complaint', -100, 'answered'), 'retention', true) = 'not_due'
                     and pg_temp.delete_case('2', pg_temp.request('2', null, 'access', null, null), 'retention', true) = 'open',
                     'a replay deleted a case not yet due, or an open one (LCD-29)');
-- a9 is held (ec), so a replay of a9's due case answers held.
select pg_temp.check(pg_temp.delete_case('2', pg_temp.request('2', 'a9', 'complaint', -800, 'answered'), 'retention', true) = 'held',
                     'a replay deleted a held case (LCD-29)');
select set_config('test.replayed', pg_temp.request('2', 'a1', 'complaint', -800, 'answered')::text, true);
select pg_temp.check(pg_temp.delete_case('2', current_setting('test.replayed')::uuid, 'retention', true) = 'deleted',
                     'a replay of a due case didn''t delete it (LCD-29)');
select pg_temp.check(count(*) = 1 and bool_and(object_id = current_setting('test.replayed') and cause = 'retention' and replayed),
                     'the replay''s log row doesn''t keep the cause with replayed true, or another case was logged (LCD-29)')
from public.deletion_log where id > current_setting('test.log_before')::bigint;
select pg_temp.check(details = '{"class": "cases", "cause": "retention", "replayed": true, "steps": 1}',
                     'the replay''s audit row doesn''t say replayed (LCD-29)')
from public.audit_events where action = 'case.deleted' and target_id = current_setting('test.replayed');
rollback to savepoint lcd_29;

-- LCD-30: the guard as the backstop. The owner deleting a held case straight from SQL is refused
-- without a log row (HF010) and with one (HF009): Sam Example's open copy (ea) holds itself, and
-- a case of a9's is held by ec.
select set_config('test.written', pg_temp.written(), true);
savepoint lcd_30;
select set_config('test.a9_case', pg_temp.request('1', 'a9', 'complaint', -800, 'answered')::text, true);
set local role hearth_owner;
select pg_temp.expect_error(format('delete from public.cases where id = %L', current_setting('test.a9_case')), 'HF010',
                            'Rows here are deleted only through Hearth''s deletion code, which logs each one.');
select set_config('app.org_id', pg_temp.id('1', '00')::text, true);
select public.log_deletion('cases', 'cases', current_setting('test.a9_case'), 'retention', null, null, null, null, false);
select public.log_deletion('cases', 'cases', pg_temp.id('1', 'ea')::text, 'retention', null, null, null, null, false);
select pg_temp.expect_error(format('delete from public.cases where id = %L', current_setting('test.a9_case')), 'HF009',
                            'This record is kept for now, so it can''t be deleted.');
select pg_temp.expect_error(format('delete from public.cases where id = %L', pg_temp.id('1', 'ea')), 'HF009',
                            'This record is kept for now, so it can''t be deleted.');
reset role;
rollback to savepoint lcd_30;
select pg_temp.check(pg_temp.written() = current_setting('test.written')
                     and (select count(*) from public.cases where id in (pg_temp.id('1', 'ea'), pg_temp.id('1', 'e8'))) = 2,
                     'a backstop case left a deletion behind (LCD-30)');
