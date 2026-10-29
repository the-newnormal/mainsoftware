-- PDPA-05, PDPA-07, PDPA-09 (C0.10 PR 1, 0013; LH-18 to LH-20, LH-45, LH-46, LH-56; TECH-SPEC T23
-- items 11 and 12; T22 item 54; HOLD-01): access-request holds, computed from a case's raw facts at
-- every call, and the hold helpers. The two orgs are moved to Pacific/Kiritimati (UTC+14) and
-- Pacific/Pago_Pago (UTC-11), so at any hour one org's today differs from UTC's and a computation in
-- the wrong zone fails; every day below is relative to the org's own today. The cases:
--   LCD-14 case_hold_until() over the sample table packages/shared heldUntil() also runs
--          (packages/shared/src/retention-samples.json holds the same JSON as the block between the
--          samples markers below, which apps/server LCV-08 holds equal): a refused copy on days 0,
--          30, 44 and 45 after its closure; an open review; a review (with any reconsideration and
--          appeal) ended before day 44 and after it; a fresh application after an ended review,
--          open and ended; an answered copy, a refused correction, a refused objection, a duplicate;
--          an open copy, correction, question, complaint, withdrawal and objection; a question
--          reclassified to a copy, and a copy reclassified to a question;
--   LCD-15 is_held('person', ...) holds a person with an open copy request and one with an open
--          correction request, and not one with only an open question, complaint, withdrawal or
--          objection; the closure as answered releases it; a refused copy holds through its last day
--          and not the day after, in the org's zone;
--   LCD-16 a deactivated requester is held;
--   LCD-17 a refused copy for someone without an account holds its own case and no person;
--   LCD-18 lifecycle_persons_of() and lifecycle_containers_of() (no rows) for each kind;
--          lifecycle_lock_target() locks a person and a case and raises 22023 for any other kind or
--          strength; is_held() of each kind of a held person's record answers true, and of another
--          person's false.
-- Cases are written as the superuser in the shapes 0012's functions write; is_held() runs as the
-- owner, as the deletion code runs it (granted to nobody).
\ir fixtures/two_orgs.sql

update public.orgs set time_zone = 'Pacific/Kiritimati' where id = pg_temp.id('1', '00');
update public.orgs set time_zone = 'Pacific/Pago_Pago' where id = pg_temp.id('2', '00');
create function pg_temp.today(o text) returns date language sql stable as $$
  select (now() at time zone x.time_zone)::date from public.orgs x where x.id = pg_temp.id(o, '00')
$$;

-- A case in org o from a sample's facts, as packages/shared/src/retention-samples.json writes them:
-- the kind it came as; the day it was received (`received` days from today, or by default the day
-- before its earliest day); its steps ({step, day, kind}, numbered in order, each on the day `day`
-- days from today); and its closure ({day, kind, outcome}), if any. It is logged by the DPO (a5) by
-- email, for the person with the given suffix, or, with none, for someone without an account. A step
-- that needs a note gets a made-up one.
create function pg_temp.sample_case(o text, sample jsonb, requester text default null) returns uuid language plpgsql as $$
declare
  today date := pg_temp.today(o);
  received integer := coalesce((sample ->> 'received')::integer,
                               least(0, coalesce((sample -> 'closed' ->> 'day')::integer, 0),
                                     coalesce((select min((s ->> 'day')::integer) from jsonb_array_elements(sample -> 'steps') s), 0)) - 1);
  made uuid := gen_random_uuid();
  s jsonb;
  n integer := 0;
begin
  insert into public.cases (id, org_id, client_key, kind, came_by, received_on, logged_by, requester_person_id, requester_name,
                            requester_channel, requester_contact, details)
  values (made, pg_temp.id(o, '00'), gen_random_uuid(), sample ->> 'kind', 'email', today + received, pg_temp.id(o, 'a5'),
          case when requester is not null then pg_temp.id(o, requester) end,
          case when requester is null then 'Sample Requester' end,
          case when requester is null then 'email' end,
          case when requester is null then 'sample@requester.example' end,
          'A sample request.');
  for s in select x from jsonb_array_elements(sample -> 'steps') x loop
    n := n + 1;
    insert into public.case_steps (org_id, case_id, number, step, on_day, note, kind, recorded_by)
    values (pg_temp.id(o, '00'), made, n, s ->> 'step', today + (s ->> 'day')::integer,
            case when s ->> 'step' in ('identity_checked', 'note') then 'A sample note' end, s ->> 'kind', pg_temp.id(o, 'a5'));
  end loop;
  if jsonb_typeof(sample -> 'closed') = 'object' then
    update public.cases
    set closed_on = today + (sample -> 'closed' ->> 'day')::integer, closed_kind = sample -> 'closed' ->> 'kind',
        outcome = sample -> 'closed' ->> 'outcome',
        closed_note = case when sample -> 'closed' ->> 'outcome' = 'refused' then 'A sample refusal.' end,
        closed_at = now(), closed_by = pg_temp.id(o, 'a5')
    where id = made;
  end if;
  return made;
end
$$;
-- How long a case holds, as the samples write it: days from today, 'indefinite', or null.
create function pg_temp.held_until(o text, the_case uuid) returns jsonb language sql stable as $$
  select case when h is null then 'null'::jsonb
              when h = 'infinity'::date then '"indefinite"'::jsonb
              else to_jsonb(h - pg_temp.today(o)) end
  from (select public.case_hold_until(pg_temp.id(o, '00'), the_case) as h) x
$$;
-- is_held(), as the owner acting in org o.
create function pg_temp.held(o text, kind text, item uuid) returns boolean language plpgsql as $$
declare
  answer boolean;
begin
  perform set_config('app.org_id', pg_temp.id(o, '00')::text, true);
  perform set_config('role', 'hearth_owner', true);
  answer := public.is_held(kind, item);
  perform set_config('role', 'none', true);
  perform set_config('app.org_id', '', true);
  return answer;
end
$$;

-- LCD-14: the samples, exactly as packages/shared/src/retention-samples.json holds them (LCV-08 holds
-- the JSON between the $samples$ quotes below equal to that file). For each: until is the last day
-- held, in days from the org's today, "indefinite" while held with no end, or null when the case
-- holds nothing; held is whether it holds today. A refusal's day is day 0, so "at least 30 days
-- after the refusal" plus the 14 days' margin (LH-46) holds through day 44.
-- samples: begin
select set_config('test.samples', $samples$[
  {
    "sample": "refused_copy_day_0",
    "kind": "access",
    "received": -20,
    "steps": [{ "step": "acknowledged", "day": -19 }, { "step": "identity_checked", "day": -12 }],
    "closed": { "day": 0, "kind": "access", "outcome": "refused" },
    "until": 44,
    "held": true
  },
  {
    "sample": "refused_copy_day_30",
    "kind": "access",
    "received": -50,
    "steps": [{ "step": "acknowledged", "day": -49 }],
    "closed": { "day": -30, "kind": "access", "outcome": "refused" },
    "until": 14,
    "held": true
  },
  {
    "sample": "refused_copy_day_44",
    "kind": "access",
    "received": -60,
    "steps": [],
    "closed": { "day": -44, "kind": "access", "outcome": "refused" },
    "until": 0,
    "held": true
  },
  {
    "sample": "refused_copy_day_45",
    "kind": "access",
    "received": -60,
    "steps": [],
    "closed": { "day": -45, "kind": "access", "outcome": "refused" },
    "until": -1,
    "held": false
  },
  {
    "sample": "review_open",
    "kind": "access",
    "received": -120,
    "steps": [{ "step": "review_started", "day": -90 }],
    "closed": { "day": -100, "kind": "access", "outcome": "refused" },
    "until": "indefinite",
    "held": true
  },
  {
    "sample": "review_ended_before_day_44",
    "kind": "access",
    "received": -40,
    "steps": [{ "step": "review_started", "day": -25 }, { "step": "review_ended", "day": -20 }],
    "closed": { "day": -30, "kind": "access", "outcome": "refused" },
    "until": 14,
    "held": true
  },
  {
    "sample": "review_ended_after_day_44_today",
    "kind": "access",
    "received": -130,
    "steps": [{ "step": "review_started", "day": -90 }, { "step": "review_ended", "day": 0 }],
    "closed": { "day": -100, "kind": "access", "outcome": "refused" },
    "until": 0,
    "held": true
  },
  {
    "sample": "review_ended_after_day_44_yesterday",
    "kind": "access",
    "received": -130,
    "steps": [
      { "step": "review_started", "day": -90 },
      { "step": "note", "day": -60 },
      { "step": "review_ended", "day": -1 }
    ],
    "closed": { "day": -100, "kind": "access", "outcome": "refused" },
    "until": -1,
    "held": false
  },
  {
    "sample": "fresh_application_open",
    "kind": "access",
    "received": -220,
    "steps": [
      { "step": "review_started", "day": -190 },
      { "step": "review_ended", "day": -150 },
      { "step": "review_started", "day": -20 }
    ],
    "closed": { "day": -200, "kind": "access", "outcome": "refused" },
    "until": "indefinite",
    "held": true
  },
  {
    "sample": "fresh_application_ended",
    "kind": "access",
    "received": -220,
    "steps": [
      { "step": "review_started", "day": -190 },
      { "step": "review_ended", "day": -150 },
      { "step": "review_started", "day": -20 },
      { "step": "review_ended", "day": -3 }
    ],
    "closed": { "day": -200, "kind": "access", "outcome": "refused" },
    "until": -3,
    "held": false
  },
  {
    "sample": "answered_copy",
    "kind": "access",
    "received": -10,
    "steps": [{ "step": "identity_checked", "day": -8 }, { "step": "replied", "day": -5 }],
    "closed": { "day": -5, "kind": "access", "outcome": "answered" },
    "until": null,
    "held": false
  },
  {
    "sample": "refused_correction",
    "kind": "correction",
    "received": -10,
    "steps": [],
    "closed": { "day": -5, "kind": "correction", "outcome": "refused" },
    "until": null,
    "held": false
  },
  {
    "sample": "refused_objection",
    "kind": "objection",
    "received": -10,
    "steps": [],
    "closed": { "day": -5, "kind": "objection", "outcome": "refused" },
    "until": null,
    "held": false
  },
  {
    "sample": "duplicate_copy",
    "kind": "access",
    "received": -10,
    "steps": [],
    "closed": { "day": -5, "kind": "access", "outcome": "duplicate" },
    "until": null,
    "held": false
  },
  {
    "sample": "open_copy",
    "kind": "access",
    "received": -3,
    "steps": [],
    "closed": null,
    "until": "indefinite",
    "held": true
  },
  {
    "sample": "open_correction",
    "kind": "correction",
    "received": -3,
    "steps": [{ "step": "acknowledged", "day": -2 }],
    "closed": null,
    "until": "indefinite",
    "held": true
  },
  {
    "sample": "open_question",
    "kind": "question",
    "received": -3,
    "steps": [],
    "closed": null,
    "until": null,
    "held": false
  },
  {
    "sample": "open_complaint",
    "kind": "complaint",
    "received": -3,
    "steps": [],
    "closed": null,
    "until": null,
    "held": false
  },
  {
    "sample": "open_withdrawal",
    "kind": "withdrawal",
    "received": -3,
    "steps": [],
    "closed": null,
    "until": null,
    "held": false
  },
  {
    "sample": "open_objection",
    "kind": "objection",
    "received": -3,
    "steps": [],
    "closed": null,
    "until": null,
    "held": false
  },
  {
    "sample": "question_reclassified_to_copy",
    "kind": "question",
    "received": -10,
    "steps": [{ "step": "reclassified", "day": -8, "kind": "access" }],
    "closed": null,
    "until": "indefinite",
    "held": true
  },
  {
    "sample": "copy_reclassified_to_question",
    "kind": "access",
    "received": -10,
    "steps": [{ "step": "reclassified", "day": -8, "kind": "question" }],
    "closed": null,
    "until": null,
    "held": false
  },
  {
    "sample": "copy_reclassified_and_back",
    "kind": "access",
    "received": -10,
    "steps": [
      { "step": "reclassified", "day": -8, "kind": "question" },
      { "step": "reclassified", "day": -4, "kind": "access" }
    ],
    "closed": null,
    "until": "indefinite",
    "held": true
  },
  {
    "sample": "question_reclassified_to_copy_refused",
    "kind": "question",
    "received": -40,
    "steps": [{ "step": "reclassified", "day": -35, "kind": "access" }],
    "closed": { "day": -10, "kind": "access", "outcome": "refused" },
    "until": 34,
    "held": true
  }
]$samples$, true);
-- samples: end
do $$
declare
  o text;
  sample jsonb;
  made uuid;
  got jsonb;
begin
  perform pg_temp.check(pg_temp.today('1') <> pg_temp.today('2'), 'the two orgs read the same today (LCD-14)');
  foreach o in array array['1', '2'] loop
    for sample in select x from jsonb_array_elements(current_setting('test.samples')::jsonb) x loop
      made := pg_temp.sample_case(o, sample);
      got := pg_temp.held_until(o, made);
      perform pg_temp.check(got = sample -> 'until',
                            format('org %s, %s: case_hold_until() reads %s, not %s (LCD-14)', o, sample ->> 'sample', got,
                                   sample -> 'until'));
      -- The case holds itself exactly while it holds: today or later (LH-19).
      perform pg_temp.check(pg_temp.held(o, 'case', made) = (sample ->> 'held')::boolean,
                            format('org %s, %s: is_held() of the case isn''t %s (LCD-14)', o, sample ->> 'sample', sample ->> 'held'));
    end loop;
  end loop;
  perform pg_temp.check(jsonb_array_length(current_setting('test.samples')::jsonb) >= 21, 'the sample table lost rows (LCD-14)');
end
$$;
-- Every sample case is someone without an account, so none held a person.
select pg_temp.check(not pg_temp.held('1', 'person', pg_temp.id('1', 'a7')) and not pg_temp.held('2', 'person', pg_temp.id('2', 'a7')),
                     'a case for someone without an account held a person (LCD-14)');

-- LCD-15 (LH-20, LH-45): an open copy or correction holds its requester; an open question,
-- complaint, withdrawal or objection doesn't; closing the copy as answered releases them; a refused
-- copy holds through day 44 and not day 45, by each org's own today.
savepoint lcd_15;
do $$
declare
  o text;
  copy uuid;
begin
  foreach o in array array['1', '2'] loop
    copy := pg_temp.sample_case(o, '{"kind": "access", "steps": [], "closed": null}', 'a2');
    perform pg_temp.sample_case(o, '{"kind": "correction", "steps": [], "closed": null}', 'a3');
    perform pg_temp.sample_case(o, '{"kind": "question", "steps": [], "closed": null}', 'a4');
    perform pg_temp.sample_case(o, '{"kind": "complaint", "steps": [], "closed": null}', 'a4');
    perform pg_temp.sample_case(o, '{"kind": "withdrawal", "steps": [], "closed": null}', 'a4');
    perform pg_temp.sample_case(o, '{"kind": "objection", "steps": [], "closed": null}', 'a4');
    perform pg_temp.sample_case(o, '{"kind": "access", "steps": [], "closed": {"day": -44, "kind": "access", "outcome": "refused"}}', 'a1');
    perform pg_temp.sample_case(o, '{"kind": "access", "steps": [], "closed": {"day": -45, "kind": "access", "outcome": "refused"}}', 'a7');
    perform pg_temp.check(pg_temp.held(o, 'person', pg_temp.id(o, 'a2')), format('org %s: an open copy doesn''t hold its requester (LCD-15)', o));
    perform pg_temp.check(pg_temp.held(o, 'person', pg_temp.id(o, 'a3')),
                          format('org %s: an open correction doesn''t hold its requester (LCD-15)', o));
    perform pg_temp.check(not pg_temp.held(o, 'person', pg_temp.id(o, 'a4')),
                          format('org %s: an open question, complaint, withdrawal or objection holds its requester (LCD-15)', o));
    perform pg_temp.check(pg_temp.held(o, 'person', pg_temp.id(o, 'a1')),
                          format('org %s: a refused copy on its day 44 doesn''t hold its requester (LCD-15)', o));
    perform pg_temp.check(not pg_temp.held(o, 'person', pg_temp.id(o, 'a7')),
                          format('org %s: a refused copy on its day 45 still holds its requester (LCD-15)', o));
    -- The fixture's open complaint (e8) holds nothing of a8's.
    perform pg_temp.check(not pg_temp.held(o, 'person', pg_temp.id(o, 'a8')), format('org %s: an open complaint held a8 (LCD-15)', o));
    -- Closed as answered: released.
    update public.cases set closed_on = pg_temp.today(o), closed_kind = 'access', outcome = 'answered', closed_at = now(),
                            closed_by = pg_temp.id(o, 'a5')
    where id = copy;
    perform pg_temp.check(not pg_temp.held(o, 'person', pg_temp.id(o, 'a2')),
                          format('org %s: a copy closed as answered still holds its requester (LCD-15)', o));
  end loop;
end
$$;
rollback to savepoint lcd_15;

-- LCD-16: a deactivated requester's refused copy holds them (a former employee's included,
-- BUILD-PLAN C0.10).
savepoint lcd_16;
select pg_temp.check(not pg_temp.held('1', 'person', pg_temp.id('1', 'a3')), 'a3 is held before any request (LCD-16)');
update public.people set deactivated_at = now(), deactivated_by = pg_temp.id('1', 'a1') where id = pg_temp.id('1', 'a3');
select pg_temp.sample_case('1', '{"kind": "access", "steps": [], "closed": {"day": -3, "kind": "access", "outcome": "refused"}}', 'a3');
select pg_temp.check(pg_temp.held('1', 'person', pg_temp.id('1', 'a3')), 'a deactivated requester''s refused copy doesn''t hold them (LCD-16)');
rollback to savepoint lcd_16;

-- LCD-17: someone without an account. Their refused copy holds its own case through its window and
-- no person; past it, nothing.
savepoint lcd_17;
select set_config('test.outsider', pg_temp.sample_case('2', '{"kind": "access", "steps": [],
  "closed": {"day": -3, "kind": "access", "outcome": "refused"}}')::text, true);
select set_config('test.outsider_old', pg_temp.sample_case('2', '{"kind": "access", "steps": [],
  "closed": {"day": -45, "kind": "access", "outcome": "refused"}}')::text, true);
select pg_temp.check(pg_temp.held('2', 'case', current_setting('test.outsider')::uuid)
                     and not pg_temp.held('2', 'case', current_setting('test.outsider_old')::uuid),
                     'an outsider''s refused copy doesn''t hold its own case in its window, or holds it past (LCD-17)');
select pg_temp.check(public.lifecycle_persons_of(pg_temp.id('2', '00'), 'case', current_setting('test.outsider')::uuid) = '{}',
                     'an outsider''s case names a person (LCD-17)');
rollback to savepoint lcd_17;

-- LCD-18: the helpers for each kind. The people of each kind's record, from the fixture: a8's
-- number, device, sign-in session, passkey, acknowledgement, complaint and access-log row; a9's
-- hold; a person themselves.
do $$
declare
  org uuid := pg_temp.id('1', '00');
  a8 uuid := pg_temp.id('1', 'a8');
  k text;
  item uuid;
  rec record;
begin
  for rec in
    select 'person' as kind, a8 as item, array[a8] as people
    union all select 'phone_number', (select id from public.phone_numbers where org_id = org and person_id = a8 and removed_at is null), array[a8]
    union all select 'device', pg_temp.id('1', 'e1'), array[a8]
    union all select 'signin_session', pg_temp.id('1', 'e2'), array[a8]
    union all select 'passkey', pg_temp.id('1', 'e7'), array[a8]
    union all select 'notice_acknowledgment', (select id from public.notice_acknowledgments where org_id = org and person_id = a8), array[a8]
    union all select 'case', pg_temp.id('1', 'e8'), array[a8]
    union all select 'legal_hold', pg_temp.id('1', 'ec'), array[pg_temp.id('1', 'a9')]
    union all select 'data_access_event', (select id from public.data_access_events where org_id = org), array[a8]
  loop
    perform pg_temp.check(public.lifecycle_persons_of(org, rec.kind, rec.item) = rec.people,
                          format('lifecycle_persons_of() of a %s is %s, not %s (LCD-18)', rec.kind,
                                 public.lifecycle_persons_of(org, rec.kind, rec.item), rec.people));
    -- Another org's record of the same id has nobody.
    perform pg_temp.check(public.lifecycle_persons_of(pg_temp.id('2', '00'), rec.kind, rec.item) = '{}',
                          format('lifecycle_persons_of() read org 1''s %s in org 2 (LCD-18)', rec.kind));
  end loop;
  -- Every kind, an unknown id: nobody and no container, without raising.
  for k in select x from public.lifecycle_kinds() x loop
    item := gen_random_uuid();
    perform pg_temp.check(public.lifecycle_persons_of(org, k, item) = '{}', format('a missing %s has people (LCD-18)', k));
    perform pg_temp.check(not exists (select 1 from public.lifecycle_containers_of(org, k, item)),
                          format('a %s sits in a container already (LCD-18)', k));
    perform pg_temp.check(not exists (select 1 from public.lifecycle_sources_of(org, k, item)),
                          format('a %s has sources already (LCD-18)', k));
  end loop;
  perform pg_temp.check((select count(*) from public.lifecycle_kinds()) = 10, 'lifecycle_kinds() isn''t the ten kinds (LCD-18)');
end
$$;
select pg_temp.expect_error(format('select public.lifecycle_persons_of(%L, %L, %L)', pg_temp.id('1', '00'), 'session', pg_temp.id('1', 'e2')),
                            '22023', 'Hearth can''t tell yet whether that kind of record is held.');
select pg_temp.expect_error(format('select public.lifecycle_persons_of(%L, %L, %L)', pg_temp.id('1', '00'), 'message', gen_random_uuid()),
                            '22023', 'Hearth can''t tell yet whether that kind of record is held.');
-- lifecycle_lock_target(): a person and a case, at each strength; nothing else, and no other strength.
select public.lifecycle_lock_target(pg_temp.id('1', '00'), k, i, s)
from (values ('person', pg_temp.id('1', 'a8')), ('case', pg_temp.id('1', 'e8')), ('person', gen_random_uuid())) x (k, i)
cross join unnest(array['share', 'no key update', 'key share']) s;
select pg_temp.expect_error(format('select public.lifecycle_lock_target(%L, %L, %L, %L)', pg_temp.id('1', '00'), k, gen_random_uuid(), 'share'),
                            '22023', 'Hearth can''t lock that kind of record yet.')
from unnest(array['channel', 'dm', 'group_dm', 'room', 'session', 'folder', 'file', 'device', 'legal_hold']) k;
select pg_temp.expect_error(format('select public.lifecycle_lock_target(%L, %L, %L, %L)', pg_temp.id('1', '00'), 'person',
                                   pg_temp.id('1', 'a8'), s), '22023', 'Hearth doesn''t take that kind of lock.')
from unnest(array['update', 'FOR SHARE', '']) s;
-- is_held() for each kind of a held person's record: a8 under a legal hold (inserted as the owner
-- after taking a8's row as C1.11's writer will), against a7's number, which nothing holds.
savepoint lcd_18;
set local role hearth_owner;
select public.lifecycle_lock_target(pg_temp.id('1', '00'), 'person', pg_temp.id('1', 'a8'), 'no key update');
insert into public.legal_holds (id, org_id, client_key, target_kind, target_id, reason, placed_by)
values ('a0000000-0000-4000-8000-0000000018a8', pg_temp.id('1', '00'), gen_random_uuid(), 'person', pg_temp.id('1', 'a8'),
        'Fixture investigation of a8', pg_temp.id('1', 'a6'));
reset role;
do $$
declare
  org uuid := pg_temp.id('1', '00');
  a8 uuid := pg_temp.id('1', 'a8');
  rec record;
begin
  for rec in
    select 'person' as kind, a8 as item
    union all select 'phone_number', (select id from public.phone_numbers where org_id = org and person_id = a8 and removed_at is null)
    union all select 'phone_number', (select id from public.phone_numbers where org_id = org and person_id = a8 and removed_at is not null)
    union all select 'device', pg_temp.id('1', 'e1')
    union all select 'signin_session', pg_temp.id('1', 'e2')
    union all select 'passkey', pg_temp.id('1', 'e7')
    union all select 'notice_acknowledgment', (select id from public.notice_acknowledgments where org_id = org and person_id = a8)
    union all select 'case', pg_temp.id('1', 'e8')
    union all select 'legal_hold', 'a0000000-0000-4000-8000-0000000018a8'::uuid
    union all select 'data_access_event', (select id from public.data_access_events where org_id = org)
  loop
    perform pg_temp.check(pg_temp.held('1', rec.kind, rec.item), format('a8''s %s isn''t held under a8''s hold (LCD-18)', rec.kind));
  end loop;
  perform pg_temp.check(not pg_temp.held('1', 'phone_number', (select id from public.phone_numbers
                                                                where org_id = org and person_id = pg_temp.id('1', 'a7'))),
                        'a7''s number is held under a8''s hold (LCD-18)');
  perform pg_temp.check(not pg_temp.held('2', 'device', pg_temp.id('2', 'e1')), 'org 2''s a8 is held under org 1''s hold (LCD-18)');
end
$$;
rollback to savepoint lcd_18;
