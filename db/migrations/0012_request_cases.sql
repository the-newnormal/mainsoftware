-- C0.9 PR 3b (C0.9 OD-05): requests to the DPO, the queue, reply targets and the request-handling
-- purpose (PDPA-01, PDPA-02, PDPA-04, PDPA-05, PDPA-07, PDPA-09, PDPA-13, ACC-11; BUILD-PLAN C0.9;
-- C0.9 OD-06 to OD-09, OD-13 to OD-17, OD-22, OD-23; TECH-SPEC T22 items 50 to 62; PD-87 to PD-113).
--
-- What it adds: cases and case_steps, with their triggers (cases_fixed(), case_steps_unchanged());
-- the internal helpers new_case_reference(), notice_states_targets(), case_add_business_days(),
-- case_due_on(), case_kind_now(), case_due(), case_replied_in_time() and cases_check_dpo(), which no
-- role may run; the case functions (submit_case(), log_case(), add_case_step(), read_own_cases(),
-- read_cases(), read_case(), read_case_steps(), read_case_others(), case_attention());
-- set_reply_targets(); the reply-target columns on dpo_settings; processing_restrictions.case_id's
-- foreign key; and the outbox types case.opened and case.changed.
--
-- What it replaces: processing_register_defaults(), with request_handling added (and the orgs
-- already here given its version 1); set_dpo_contact(), which now copies the reply targets into the
-- next version; and read_audit_events(), which returns a request's rows only to a reader who holds
-- dpo (OD-23). All three keep their signatures, owners and grants (create or replace keeps them).
--
-- What it leaves alone: publish_notice() (it already locks, compares and links the settings
-- version, so a targets change makes the notice out of date: T22 item 49), acknowledge_notice(),
-- record_notice_acknowledgement(), the notice tables, the transfer register and its functions, the
-- gate, orgs_add_registers() (it reads the defaults function), the job roles' grants, orgs and the
-- seed. audit_events.case_id and data_access_events.case_id stay plain ids for C1.11's Rule 9 reads
-- (PD-88, PD-100). No existing row is updated or deleted.
--
-- Request details aren't Rule 9 material (OD-06). 0004's and 0005's comments say the case table
-- "comes with the Rule 9 module and has no hearth_app grants". This is that table, and no role holds
-- a grant on it: hearth_app reaches it only through the checked functions below, the DPO's (OD-14)
-- and the requester's own (OD-15). Content read under a case from C1.11 stays in C1.11's own store
-- and is never written here; a case note holds the DPO's own working notes. Merged migrations can't
-- change, so TECH-SPEC T22 item 52 and CLAUDE.md restate it.
--
-- The lock order (CLAUDE.md, Database): people → users → passkeys → phone_numbers → devices →
-- sessions, then role_assignments → cases → processing_register → processing_restrictions →
-- transfer_register → transfer_clearances → dpo_settings → orgs (publishing only) → notice_versions
-- → notice_acknowledgments → feature_flags → jobs → schedule_runs. case_steps rows are only
-- inserted, never locked. A submit reads the requester's person row FOR SHARE and takes no other
-- row lock. A log reads the DPO's rows, then the requester's person row (an admin action on someone
-- else), FOR SHARE. A step reads the DPO's rows FOR SHARE, then takes the case FOR NO KEY UPDATE.
-- The DPO's reads take the DPO's rows FOR SHARE; the requester's tracking and the count take no
-- lock. A targets change reads the DPO's rows FOR SHARE, then takes the latest dpo_settings row FOR
-- NO KEY UPDATE, as a contact change does. read_audit_events() reads the reader's rows FOR SHARE,
-- then their dpo role row FOR SHARE.
--
-- The locks 0012 takes: ROW EXCLUSIVE on processing_register for the backfill, and SHARE ROW
-- EXCLUSIVE on orgs, people, principals, processing_restrictions and the new tables for their
-- foreign keys, none of which conflicts with a row lock a request takes. The two tables live
-- requests touch, dpo_settings and outbox_events, are locked last, together, under 0011's no-wait
-- retry, so 0012 never waits while it holds one (PD-106); the dpo_settings ALTER, the foreign key to
-- it and the outbox's widened check follow that lock. The ACCESS EXCLUSIVE locks are held only until
-- the commit.
--
-- Free text: the requester's words, an outside requester's details and the DPO's notes are people's
-- own text, shown to the DPO alone as data (Rule 8), so neither SQL nor the routes hold them to
-- AI_COPY (PD-102). SQL refuses control characters (but the line break where lines are allowed) and
-- bidirectional-formatting characters in all of them, and an NRIC- or FIN-shaped string in
-- everything the DPO types (OD-16). The bidirectional class is written with \u escapes, which
-- Postgres's regular expressions read, never as the raw characters, which could reorder how a
-- reader sees this file (DB-04, PD-113). Every message a function raises is fixed text, never an
-- input (RQD-14).

-- C0.9 OD-17, PD-87: handling people's questions, complaints and requests about their personal
-- data, which Hearth does from the day the form and the queue exist. Active from the start and
-- unpinned, like security_audit and backups: the purpose gate passes it only once a published
-- notice lists it, and publishing refuses while it lacks a basis or a retention, which the DPO
-- records (Hearth never asserts a basis, PD-06; OD-17 expects another exception or requirement in
-- law). The signature is 0009's, so create or replace keeps its revoke. check-catalogues.ts (check
-- 6) holds it to PURPOSES and ACTIVE_FROM_START both ways. The rest is 0009's list, unchanged.
create or replace function public.processing_register_defaults()
  returns table (purpose text, ai boolean, pinned boolean, needs_switch boolean, status text)
language sql immutable set search_path = '' as $$
  values
    -- Pinned: core.system's purposes.
    ('accounts', false, true, false, 'active'),
    ('service_operation', false, true, false, 'active'),
    -- Active from the start, with no basis recorded yet: Hearth writes the audit log from C0.3, and
    -- every database is backed up. The DPO records their basis before the first notice (PR 2).
    ('security_audit', false, false, false, 'active'),
    ('backups', false, false, false, 'active'),
    -- Active from the start too, from C0.9 PR 3b: the form and the DPO's queue (OD-17).
    ('request_handling', false, false, false, 'active'),
    -- Planned until the DPO records them and a published notice lists them.
    ('content_delivery', false, false, false, 'planned'),
    ('access_logs', false, false, false, 'planned'),
    ('presence_receipts', false, false, false, 'planned'),
    ('session_slides', false, false, false, 'planned'),
    ('session_sharing', false, false, false, 'planned'),
    ('people_insights', false, false, false, 'planned'),
    ('sensitive_data_detection', false, false, false, 'planned'),
    -- PDPA-04's list: recording, transcription, notes, voice-message transcription, Org Brain or AI
    -- use, whose withdrawal needs a per-person switch.
    ('recording_meetings', false, false, true, 'planned'),
    ('recording_drop_in', false, false, true, 'planned'),
    ('transcription', true, false, true, 'planned'),
    ('voice_message_transcription', true, false, true, 'planned'),
    ('meeting_notes', true, false, true, 'planned'),
    ('org_brain', true, false, true, 'planned'),
    ('ai_writing', true, false, true, 'planned'),
    ('people_inference', true, false, true, 'planned'),
    ('assistant', true, false, true, 'planned'),
    ('agents', true, false, true, 'planned'),
    ('ai_cost_figures', true, false, true, 'planned'),
    -- Withdrawn by deleting the person's clips, so it needs no switch.
    ('transcription_test_set', true, false, false, 'planned')
$$;
-- The orgs already here get its version 1, naming nobody and recording nothing (T22 items 4 and
-- 18); a new org gets it from orgs_add_registers(), which reads this function. No existing row
-- changes. The insert takes ROW EXCLUSIVE on processing_register, which conflicts with no lock a
-- request takes, and no server running before the deploy can write request_handling (isPurposeKey()
-- refuses an unknown key), so nothing races it.
insert into public.processing_register (org_id, purpose, ai, pinned, needs_switch, version, status)
select o.id, d.purpose, d.ai, d.pinned, d.needs_switch, 1, d.status
from public.orgs o cross join public.processing_register_defaults() d
where d.purpose = 'request_handling';

-- C0.9 PD-104: a new case's reference, which people outside the database quote (the requester, the
-- DPO's replies outside Hearth, the break-glass log). Eight symbols with no vowel, no Y and no 0, 1
-- or L, the first and fifth always a letter, so none spells a word or a name or holds more than
-- three digits in a row (never a phone number, a code or an account id). Drawn from
-- gen_random_uuid()'s strong random bytes, never random(), which a session's setseed() makes
-- repeatable. It says nothing about the case, its order or how many there are. Upper case on
-- purpose: is_ids_only() refuses it, so it can never ride in an outbox row's ids or a job's payload.
-- Run by no role but its owner: only the cases table's default calls it.
create function public.new_case_reference() returns text
language sql volatile set search_path = '' as $$
  select pg_catalog.string_agg(
    pg_catalog.substr(
      case when s.n in (1, 5) then 'BCDFGHJKMNPQRSTVWXZ' else '23456789BCDFGHJKMNPQRSTVWXZ' end,
      pg_catalog.get_byte(b.bytes, s.pos) % (case when s.n in (1, 5) then 19 else 27 end) + 1,
      1),
    '' order by s.n)
  from (select pg_catalog.uuid_send(pg_catalog.gen_random_uuid()) as bytes) b,
       -- A version 4 uuid's bytes 6 and 8 carry its version and variant; the others are random.
       pg_catalog.unnest(array[0, 1, 2, 3, 4, 5, 9, 10]) with ordinality as s (pos, n)
$$;
revoke execute on function public.new_case_reference() from public;

-- C0.9 PD-93: whether a notice version's generator states the DPO's reply targets. c09.1 and c09.2
-- (and a stand-in, with none) were written before them; every later generator does. Merged
-- generators never change (NTG-09), so a fixed list holds: packages/shared TARGETLESS_GENERATORS is
-- the same, and RQD-09 and NTS-10 pin both. The one SQL place that names them.
create function public.notice_states_targets(generator text) returns boolean
language sql immutable set search_path = '' as $$
  select generator is not null and generator not in ('c09.1', 'c09.2')
$$;
revoke execute on function public.notice_states_targets(text) from public;

-- The days-th weekday after start (C0.9 OD-09, PD-92): the day of receipt never counts, and day 1
-- is the next weekday, so a request received on a Saturday or a Sunday counts from the Monday.
-- Weekdays only, with public holidays counted as business days, so a due day errs early, never
-- later than the promise. The series' bound, days * 2 + 7, always holds more than days weekdays.
create function public.case_add_business_days(start date, days integer) returns date
language sql immutable strict set search_path = '' as $$
  select d::date
  from pg_catalog.generate_series((start + 1)::timestamp, (start + days * 2 + 7)::timestamp, interval '1 day') d
  where extract(isodow from d) < 6
  order by d
  offset days - 1
  limit 1
$$;
revoke execute on function public.case_add_business_days(date, integer) from public;

-- A request's due day (C0.9 OD-08, PD-92), from raw values only (CLAUDE.md, Database):
--   the target, per unit, is the shorter of the one stated when the request was received (null:
--   none was stated, such as before v0 or under c09.2) and the current one, so changing a target can
--   bring an open request's day forward but never push it past what the requester was told; with
--   no settings at all, OD-08's 10 and 30, the columns' defaults;
--   the day is received_on plus the target, in calendar days for a copy or a correction and in
--   business days for the rest, under the kind it came as and under its current kind, whichever is
--   earlier, so a reclassification never moves a promise later (PD-90); and the current kind's day
--   is never before the next business day after the latest reclassification, so a request
--   reclassified to a kind with a shorter target is never due before it was reclassified (PPL-08);
--   a more-time date (s21's written notice) replaces it while the current kind is a copy or a
--   correction.
-- Pure, so RQD-09 pins it on a table of samples.
create function public.case_due_on(
  received_kind text,
  current_kind text,
  received_on date,
  reclassified_on date,
  extended_to date,
  stated_business integer,
  stated_calendar integer,
  current_business integer,
  current_calendar integer
) returns date
language sql immutable set search_path = '' as $$
  select case
    when extended_to is not null and current_kind in ('access', 'correction') then extended_to
    else least(
      case when received_kind in ('access', 'correction') then received_on + t.calendar
           else public.case_add_business_days(received_on, t.business) end,
      -- greatest() skips a null, and case_add_business_days() is strict: with no reclassification,
      -- the current kind's day alone.
      greatest(
        case when current_kind in ('access', 'correction') then received_on + t.calendar
             else public.case_add_business_days(received_on, t.business) end,
        public.case_add_business_days(reclassified_on, 1)))
  end
  from (select least(coalesce(stated_business, current_business, 10), coalesce(current_business, 10)) as business,
               least(coalesce(stated_calendar, current_calendar, 30), coalesce(current_calendar, 30)) as calendar) t
$$;
revoke execute on function public.case_due_on(text, text, date, date, date, integer, integer, integer, integer) from public;

-- The case functions that act for the DPO (log_case, add_case_step and the DPO's four reads) act for
-- the person the server set as app.user_id (CLAUDE.md, Database; packages/access decided first:
-- case.read, case.log, case.step), who must still be at the org and hold the DPO role (OD-14). This
-- re-checks both in tables, in the lock order (people, then role_assignments), FOR SHARE, so a
-- deactivation or revocation in progress makes the call wait and then refuse, and one that starts
-- later waits for it. Its own message (PD-110), since registers_check_dpo()'s speaks of the
-- registers. It is no grant's: only those functions call it.
create function public.cases_check_dpo(org uuid, actor uuid) returns void
language plpgsql set search_path = '' as $$
begin
  if org is null or actor is null then
    raise exception 'No org or user is set for this transaction' using errcode = 'insufficient_privilege';
  end if;
  perform 1 from public.people p where p.org_id = org and p.id = actor and p.deactivated_at is null for share;
  if not found then
    raise exception 'Only the Data Protection Officer can see or work on requests.' using errcode = 'insufficient_privilege';
  end if;
  perform 1 from public.role_assignments r
  where r.org_id = org and r.person_id = actor and r.revoked_at is null and r.role = 'dpo'
  for share;
  if not found then
    raise exception 'Only the Data Protection Officer can see or work on requests.' using errcode = 'insufficient_privilege';
  end if;
end
$$;
revoke execute on function public.cases_check_dpo(uuid, uuid) from public;

-- PDPA-04, PDPA-05, PDPA-07, PDPA-13 (C0.9 OD-06, PD-88): a question, a complaint or a request
-- about someone's personal data, sent in Hearth or logged by the DPO, and the case that
-- processing_restrictions.case_id refers to and C1.11's Rule 9 reads cite (audit_events.case_id and
-- data_access_events.case_id stay plain ids, which outlive a case). Request details aren't Rule 9
-- material (OD-06): no role holds a grant on this table, and hearth_app reaches it only through the
-- checked functions below, the DPO's (OD-14) and the requester's own (OD-15).
--   what was received, never changed (cases_fixed()):
--     reference      what people quote (PD-104): the database's, unique in the org; audit rows,
--                    events, logs, paths and foreign keys use id, never this
--     client_key     one per form or dialog opening, unique per writer, so a resend after a lost
--                    answer returns the first case (PD-96)
--     kind           the kind it came as; a step may reclassify it (case_kind_now())
--     came_by        the form in Hearth, or how it reached the DPO
--     received_on    the day it reached the organisation, in the org's zone: the clock runs from it
--     logged_at/by   when and by whom it was recorded: the requester (the form) or the DPO
--     requester_*    a person of the organisation, current or former, with one channel to reach
--                    them if given (required once they have left, PPL-01), or someone without an
--                    account kept as a name and one channel (OD-16; the identity check is a step)
--     details        the requester's own words (the form), or the DPO's summary (logged)
--     stated_settings_version  the DPO settings version whose targets the notice in force at
--                    receipt stated (PD-93: store the context); null when it stated none
--   its closure, once (the day, the kind it was closed as, the outcome, a note, who and when).
-- No subject column: a case never names anyone but its requester, so tracking can't show a case to
-- someone it is only about (OD-15), and no index of who was complained about exists. Due days are
-- never stored (case_due()). Never deleted here: retention is the request-handling purpose's, which
-- the DPO records, applied by C0.10's and C2.9's deletion code (PDPA-09).
create table public.cases (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id),
  reference text not null default public.new_case_reference(),
  client_key uuid not null,
  kind text not null,
  came_by text not null,
  received_on date not null,
  logged_at timestamptz not null default now(),
  logged_by uuid not null,
  requester_person_id uuid,
  requester_name text,
  requester_channel text,
  requester_contact text,
  details text,
  stated_settings_version integer,
  closed_on date,
  closed_kind text,
  outcome text,
  closed_note text,
  closed_at timestamptz,
  closed_by uuid,
  unique (org_id, id),
  -- Named, so the writers' re-reads say which key: an OUT column called reference would make a
  -- plain (org_id, reference) ambiguous (0011's lesson).
  constraint cases_org_reference unique (org_id, reference),
  constraint cases_client_key unique (org_id, logged_by, client_key),
  constraint cases_reference check (reference ~
    '^[BCDFGHJKMNPQRSTVWXZ][2-9BCDFGHJKMNPQRSTVWXZ]{3}[BCDFGHJKMNPQRSTVWXZ][2-9BCDFGHJKMNPQRSTVWXZ]{3}$'),
  -- OD-07's six kinds. C1.11 adds its incidents and investigations by replacing this check.
  constraint cases_kind check (kind in ('question', 'complaint', 'access', 'correction', 'withdrawal', 'objection')),
  constraint cases_came_by check (came_by in ('hearth', 'email', 'letter', 'phone', 'in_person', 'other')),
  -- Sent in Hearth: by the requester, from their own session. Logged: by someone else, the DPO.
  constraint cases_sent_by_requester check (
    (came_by = 'hearth') = (requester_person_id is not null and logged_by = requester_person_id)),
  -- A person of the organisation, who may also have one channel to reach them (log_case()
  -- requires it once they have left: a leaver's request names the channel they wrote from, which
  -- the organisation may no longer hold, PDPA-13, PPL-01); or someone without an account, as a name
  -- with exactly one channel (OD-16). A channel always comes with its address.
  constraint cases_requester check (
    (requester_person_id is null) = (requester_name is not null)
    and (requester_channel is null) = (requester_contact is null)
    and (requester_person_id is not null or requester_channel is not null)),
  -- Sent in Hearth: no reply address is collected (PD-96), so a copy never goes to an address typed
  -- into a borrowed phone.
  constraint cases_form_channel check (came_by <> 'hearth' or requester_channel is null),
  -- One line, 1 to 200 characters, trimmed, no control or bidirectional-formatting character
  -- (Rule 8: the DPO reads it in the order it was written).
  constraint cases_requester_name check (
    requester_name = btrim(requester_name) and length(requester_name) between 1 and 200
    and requester_name !~ '[[:cntrl:]]' and requester_name !~ '[\u202a-\u202e\u2066-\u2069]'),
  constraint cases_requester_channel check (requester_channel in ('email', 'phone', 'post')),
  -- The DPO contact's own shapes (0011's dpo_settings checks), so the DPO's page can print it
  -- exactly and nothing in it reads specially.
  constraint cases_requester_contact check (
    (requester_channel = 'email' and length(requester_contact) <= 254 and requester_contact ~
      '^[A-Za-z0-9._+-]{1,64}@[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.[A-Za-z]{2,63}$')
    or (requester_channel = 'phone' and requester_contact ~ '^\+[1-9]([ -]?[0-9]){6,14}$')
    or (requester_channel = 'post' and requester_contact = btrim(requester_contact)
        and length(requester_contact) between 1 and 500
        and translate(requester_contact, E'\n', '') !~ '[[:cntrl:]]'
        and requester_contact !~ '\n[[:space:]]*\n' and requester_contact ~ '[[:alnum:]]'
        and requester_contact !~ '[\u202a-\u202e\u2066-\u2069]')),
  -- What they want: up to 4,000 characters on as many lines as it needs, no control character but
  -- the line break and no bidirectional-formatting character. Only a copy of their data sent in
  -- Hearth may come with nothing written (the demo's rule); a logged request always has the DPO's
  -- summary.
  constraint cases_details check (
    case when details is null then kind = 'access' and came_by = 'hearth'
    else details = btrim(details) and length(details) between 1 and 4000
         and translate(details, E'\n', '') !~ '[[:cntrl:]]' and details !~ '[\u202a-\u202e\u2066-\u2069]' end),
  -- No NRIC- or FIN-shaped string in anything the DPO types (OD-16: Hearth keeps no ID number; the
  -- PDPC's NRIC guidelines). A requester's own words are theirs: the form hints, and never refuses.
  constraint cases_no_id_numbers check (
    concat_ws(' ', requester_name, requester_contact, case when came_by <> 'hearth' then details end, closed_note)
      !~* '(^|[^a-z0-9])[stfgm][0-9]{7}[a-z]([^a-z0-9]|$)'),
  -- Closed once, all together (cases_fixed() refuses any other change, and a second closure).
  constraint cases_closed check (num_nulls(closed_on, closed_kind, outcome, closed_at, closed_by) in (0, 5)),
  constraint cases_closed_on check (closed_on >= received_on),
  constraint cases_closed_kind check (closed_kind in ('question', 'complaint', 'access', 'correction', 'withdrawal', 'objection')),
  constraint cases_outcome check (
    outcome in ('answered', 'refused', 'withdrawn', 'duplicate', 'not_a_request', 'logged_in_error')),
  -- A refusal says why (access-request.md step 7) and is only for a request that can be refused, by
  -- the kind it was closed as: a copy, a correction or an objection. A question, a complaint or a
  -- withdrawal can't be.
  constraint cases_refused check (
    outcome is distinct from 'refused'
    or (closed_kind in ('access', 'correction', 'objection') and closed_note is not null)),
  -- Logged in error is for a case the DPO logged (a mistaken requester); a person's own request is
  -- withdrawn by them, or not a request.
  constraint cases_logged_in_error check (outcome is distinct from 'logged_in_error' or came_by <> 'hearth'),
  constraint cases_closed_note check (
    closed_note is null or (closed_at is not null and closed_note = btrim(closed_note)
      and length(closed_note) between 1 and 2000 and translate(closed_note, E'\n', '') !~ '[[:cntrl:]]'
      and closed_note !~ '[\u202a-\u202e\u2066-\u2069]')),
  foreign key (org_id, requester_person_id) references public.people (org_id, id),
  foreign key (org_id, logged_by) references public.principals (org_id, id),
  foreign key (org_id, closed_by) references public.principals (org_id, id)
  -- cases_stated_settings, to dpo_settings (org_id, version), is added last, after the lock on
  -- dpo_settings.
);
-- The queue's open cases and the indicator, so neither reads closed history; the queue's recent
-- closed cases; and a requester's own, for tracking and the form's cap. Each leads with org_id
-- (ACC-11). No index on the due day: it depends on the settings row and today (CLAUDE.md,
-- Database), so the bounded open set is sorted.
create index cases_open on public.cases (org_id, received_on, id) where closed_at is null;
create index cases_closed on public.cases (org_id, closed_at desc, id) where closed_at is not null;
create index cases_requester on public.cases (org_id, requester_person_id, received_on desc)
  where requester_person_id is not null;

-- C0.9 PD-91: what the DPO did on a request, each with the day it happened (in the org's zone)
-- and who recorded it when: told them it was received; checked who they are (the note says how,
-- never an ID number: OD-16); replied (the reply the request waits for, whose day the requester
-- sees in tracking and which ends the clock when on time, PD-112; a holding message is a note);
-- more time (a copy or a correction only, with the new date, its day the day the requester was told
-- in writing, on or before the due day: s21's written notice, PPL-04); reclassified (its kind now:
-- PD-90); a note; and, after a refused copy, the requester's PDPC review starting and ending, so the
-- hold that keeps their data (s22A, PDPA-09) can be read. Numbered from 1 per case, only appended,
-- never changed. Notes are the DPO's own working notes, which the DPO alone reads; never content
-- read under Rule 9 (OD-06).
create table public.case_steps (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id),
  case_id uuid not null,
  number integer not null check (number between 1 and 100),
  step text not null,
  on_day date not null,
  note text,
  extended_to date,
  kind text,
  recorded_at timestamptz not null default now(),
  recorded_by uuid not null,
  unique (org_id, id),
  -- The backstop behind add_case_step()'s lock on the case: two steps never share a number. Its
  -- index serves the case sheet's read in order.
  constraint case_steps_order unique (org_id, case_id, number),
  constraint case_steps_step check (step in (
    'acknowledged', 'identity_checked', 'replied', 'extended', 'reclassified', 'note', 'review_started', 'review_ended')),
  constraint case_steps_note check (
    note is null or (note = btrim(note) and length(note) between 1 and 2000
      and translate(note, E'\n', '') !~ '[[:cntrl:]]' and note !~ '[\u202a-\u202e\u2066-\u2069]'
      and note !~* '(^|[^a-z0-9])[stfgm][0-9]{7}[a-z]([^a-z0-9]|$)')),
  constraint case_steps_needs_note check (step not in ('identity_checked', 'note') or note is not null),
  -- How identity was checked: one line of at most 500 characters.
  constraint case_steps_identity check (step <> 'identity_checked' or (length(note) <= 500 and note !~ '\n')),
  constraint case_steps_extended check (
    (step = 'extended') = (extended_to is not null) and (extended_to is null or extended_to > on_day)),
  constraint case_steps_kind check (
    (step = 'reclassified') = (kind is not null)
    and (kind is null or kind in ('question', 'complaint', 'access', 'correction', 'withdrawal', 'objection'))),
  foreign key (org_id, case_id) references public.cases (org_id, id),
  foreign key (org_id, recorded_by) references public.principals (org_id, id)
);

-- Row level security: each table only within the org the server set (CLAUDE.md, Database). No role
-- holds a grant on either, so the policy is a second line that would bind any future grantee; the
-- functions below run as the tables' owner, which RLS doesn't bind, so each filters by the org the
-- server set itself (RQD-13).
do $$
declare
  t text;
begin
  foreach t in array array['cases', 'case_steps'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy org_isolation on public.%I
      using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
      with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid)$p$, t);
  end loop;
end
$$;

-- C0.9 PD-88: what was received, by whom and when is history (CLAUDE.md, Database), whoever writes
-- (the owner and a superuser too): a received day moved later would look on time. The only change
-- is the closure, once, all together; a later column is fixed by default, since the comparison
-- leaves out the closure's columns alone. No role holds DELETE, and case_steps' and
-- processing_restrictions' foreign keys refuse one: C0.10's and C2.9's deletion code, which checks
-- holds and logs each deletion, is the only future path (PDPA-09). The message can be shown as it
-- is.
create function public.cases_fixed() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.closed_at is not null
     or (pg_catalog.to_jsonb(new) - array['closed_on', 'closed_kind', 'outcome', 'closed_note', 'closed_at', 'closed_by'])
        is distinct from
        (pg_catalog.to_jsonb(old) - array['closed_on', 'closed_kind', 'outcome', 'closed_note', 'closed_at', 'closed_by']) then
    raise exception 'A request keeps what was received, and is closed only once. Add a step instead.'
      using errcode = 'check_violation';
  end if;
  return new;
end
$$;
revoke execute on function public.cases_fixed() from public;
create trigger cases_fixed before update on public.cases for each row execute function public.cases_fixed();

-- C0.9 PD-91: a step is history, whoever writes (the owner and a superuser too), as a recorded
-- contact version is (dpo_settings_unchanged()). The message can be shown as it is.
create function public.case_steps_unchanged() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'A step on a request never changes. Add another step instead.' using errcode = 'check_violation';
end
$$;
revoke execute on function public.case_steps_unchanged() from public;
create trigger case_steps_unchanged before update on public.case_steps
  for each row execute function public.case_steps_unchanged();

-- A case's kind now (C0.9 PD-90): the kind it was closed as, else its latest reclassification's,
-- else the kind it came as. Run by no role but its owner: only the case functions call it.
create function public.case_kind_now(org uuid, the_case uuid) returns text
language sql stable set search_path = '' as $$
  select coalesce(c.closed_kind,
    (select s.kind from public.case_steps s
     where s.org_id = c.org_id and s.case_id = c.id and s.step = 'reclassified'
     order by s.number desc limit 1),
    c.kind)
  from public.cases c where c.org_id = org and c.id = the_case
$$;
revoke execute on function public.case_kind_now(uuid, uuid) from public;

-- One request's due day, read from its row, its kind now, its latest reclassification's day, its
-- latest more-time step, the settings version stated when it was received
-- (cases.stated_settings_version: a join, never a search for the version in force, PD-93) and the
-- current settings version. plpgsql, so its body is parsed at first call, after this migration has
-- added the target columns. Every answer that shows a due day, orders by one or counts one goes
-- through this, so the queue, the tracking and the indicator never disagree. Run by no role but its
-- owner.
create function public.case_due(org uuid, the_case uuid) returns date
language plpgsql stable set search_path = '' as $$
begin
  return (
    select public.case_due_on(c.kind, public.case_kind_now(org, the_case), c.received_on,
      (select s.on_day from public.case_steps s
       where s.org_id = c.org_id and s.case_id = c.id and s.step = 'reclassified'
       order by s.number desc limit 1),
      (select s.extended_to from public.case_steps s
       where s.org_id = c.org_id and s.case_id = c.id and s.step = 'extended'
       order by s.number desc limit 1),
      st.target_business_days, st.target_calendar_days, cur.target_business_days, cur.target_calendar_days)
    from public.cases c
    left join public.dpo_settings st on st.org_id = c.org_id and st.version = c.stated_settings_version
    left join lateral (
      select d.target_business_days, d.target_calendar_days from public.dpo_settings d
      where d.org_id = c.org_id order by d.version desc limit 1) cur on true
    where c.org_id = org and c.id = the_case);
end
$$;
revoke execute on function public.case_due(uuid, uuid) from public;

-- Whether the reply a request waits for was recorded on time (C0.9 PD-112): its latest replied or
-- more-time step, by number, is a replied step dated on or before its due day. A reply on time
-- ends the clock: the request never reads as late or overdue after it, and the count leaves it
-- out; more time recorded after it starts the clock again, to the new date. A request replied to
-- only after its due day stays overdue until the DPO closes it. Created after case_due(), which
-- its SQL body names. Run by no role but its owner.
create function public.case_replied_in_time(org uuid, the_case uuid) returns boolean
language sql stable set search_path = '' as $$
  select coalesce((
    select s.step = 'replied' and s.on_day <= public.case_due(org, the_case)
    from public.case_steps s
    where s.org_id = org and s.case_id = the_case and s.step in ('replied', 'extended')
    order by s.number desc limit 1), false)
$$;
revoke execute on function public.case_replied_in_time(uuid, uuid) from public;

-- Sends a question, complaint or request to the DPO (PDPA-04, PDPA-13; C0.9 OD-07, PD-96), for the
-- org the server set, as the person set as app.user_id (packages/access decided first:
-- case.send_own, which the notice gate holds back until they have acknowledged the current version,
-- OD-13). The requester is always the session's person: nobody sends one in someone else's name. In
-- order:
--   1. the requester, still at the organisation, FOR SHARE, so a deactivation in progress makes this
--      wait and then refuse (42501), and one that starts later waits for it;
--   2. a send already recorded from the same sheet (the same client_key) records nothing and returns
--      that case (changed false), so a resend after a lost answer never makes two (PD-96);
--   3. the kind, and what they want, trimmed of JavaScript's whitespace with CRLF read as LF (empty
--      reads as none, which only a copy of their data may be): at most 4,000 characters of plain
--      text, with no bidirectional-formatting character (HF006). Their words are theirs, never held
--      to AI_COPY or the NRIC rule (PD-102);
--   4. at most 10 of their requests open (HF006), read plainly: a bound on how many one person can
--      keep open, not an exact limit, so two sent at the same moment may both pass (PD-96, OD-25);
--   5. the day received, today in the org's zone, and the settings version the latest published
--      version linked, when its generator states targets (PD-93: none before v0, under c09.1 or
--      c09.2, or under a stand-in); the notice and orgs are read plainly, so the submit takes no
--      lock in the notice's part of the lock order;
--   6. the case, with a reference (on the rare clash a fresh draw, at most 10 tries, then 40001,
--      writing nothing); and one audit row (ADM-06) naming the case by its target and nothing else:
--      no kind and no words, and no case_id, which 0004 keeps for a privileged read's logged case
--      (PD-100).
-- Every column is qualified, so the OUT columns (id, reference, received_on) never shadow one, and
-- on conflict names no constraint, so it covers both unique keys: under READ COMMITTED the re-read
-- after a skipped insert is a new statement and sees what the other send committed (RQR-02).
-- The api appends case.opened ({via: 'form'}) when it records. Returns the case, its reference, the
-- day received, the day the reply is due and whether this call recorded it. The messages can be
-- shown as they are.
create function public.submit_case(
  kind text,
  details text,
  client_key uuid,
  request_id text,
  device_id uuid,
  ip inet
) returns table (id uuid, reference text, received_on date, due_on date, changed boolean)
language plpgsql volatile security definer set search_path = '' as $$
declare
  org uuid := nullif(pg_catalog.current_setting('app.org_id', true), '')::uuid;
  actor uuid := nullif(pg_catalog.current_setting('app.user_id', true), '')::uuid;
  -- Whitespace at either end, as JavaScript's trim() reads it: 0009's literal, byte for byte, with
  -- \u escapes so a reader sees every code point.
  edges constant text := '^[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+'
                         '|[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+$';
  -- Bidirectional embedding, override and isolate characters, as \u escapes (PD-113).
  bidi constant text := '[\u202a-\u202e\u2066-\u2069]';
  what text := nullif(pg_catalog.regexp_replace(
    pg_catalog.replace(submit_case.details, E'\r\n', E'\n'), edges, '', 'g'), '');
  prior public.cases%rowtype;
  today date;
  stated integer;
  new_id uuid;
  new_ref text;
begin
  if org is null or actor is null then
    raise exception 'No org or user is set for this transaction' using errcode = 'insufficient_privilege';
  end if;
  perform 1 from public.people p where p.org_id = org and p.id = actor and p.deactivated_at is null for share;
  if not found then
    raise exception 'Only someone still at the organisation can send a request.' using errcode = 'insufficient_privilege';
  end if;
  if submit_case.client_key is null then
    raise exception 'Send it from the form again.' using errcode = 'HF006';
  end if;
  select * into prior from public.cases c
  where c.org_id = org and c.logged_by = actor and c.client_key = submit_case.client_key;
  if found then
    return query select prior.id, prior.reference, prior.received_on, public.case_due(org, prior.id), false;
    return;
  end if;
  if submit_case.kind is null
     or submit_case.kind not in ('question', 'complaint', 'access', 'correction', 'withdrawal', 'objection') then
    raise exception 'Choose what the request is about.' using errcode = 'HF006';
  elsif what is null and submit_case.kind <> 'access' then
    raise exception 'Write what it''s about.' using errcode = 'HF006';
  elsif what is not null and (pg_catalog.length(what) > 4000 or pg_catalog.replace(what, E'\n', '') ~ '[[:cntrl:]]'
                              or what ~ bidi) then
    raise exception 'Keep it to 4,000 characters of plain text.' using errcode = 'HF006';
  end if;
  if (select pg_catalog.count(*) from public.cases c
      where c.org_id = org and c.requester_person_id = actor and c.closed_at is null) >= 10 then
    raise exception 'You have 10 open requests. You can send another once one is closed, or contact the Data Protection Officer directly.'
      using errcode = 'HF006';
  end if;
  select (pg_catalog.now() at time zone o.time_zone)::date into today from public.orgs o where o.id = org;
  select case when public.notice_states_targets(v.generator) then v.dpo_settings_version end into stated
  from public.notice_versions v where v.org_id = org order by v.version desc limit 1;
  for attempt in 1 .. 10 loop
    insert into public.cases (org_id, client_key, kind, came_by, received_on, logged_by, requester_person_id,
                              details, stated_settings_version)
    values (org, submit_case.client_key, submit_case.kind, 'hearth', today, actor, actor, what, stated)
    on conflict do nothing
    returning cases.id, cases.reference into new_id, new_ref;
    exit when new_id is not null;
    -- Nothing inserted: a send from the same sheet committed meanwhile (this insert waited on its
    -- client_key entry, then skipped), which this returns; or the reference drawn clashed, so the
    -- loop draws again.
    select * into prior from public.cases c
    where c.org_id = org and c.logged_by = actor and c.client_key = submit_case.client_key;
    if found then
      return query select prior.id, prior.reference, prior.received_on, public.case_due(org, prior.id), false;
      return;
    end if;
  end loop;
  if new_id is null then
    raise exception 'Hearth couldn''t give the request a reference. Try again.' using errcode = 'serialization_failure';
  end if;
  insert into public.audit_events (org_id, actor_id, action, target_type, target_id, request_id, device_id, ip)
  values (org, actor, 'case.submitted', 'case', new_id::text, request_id, submit_case.device_id, ip);
  return query select new_id, new_ref, today, public.case_due(org, new_id), true;
end
$$;
revoke execute on function public.submit_case(text, text, uuid, text, uuid, inet) from public;

-- Logs a request that came by email, letter, phone, in person or another way (PDPA-04, PDPA-13;
-- C0.9 OD-16, PD-89), for the org the server set, as the DPO set as app.user_id (packages/access
-- decided first: case.log, which refuses the DPO naming themselves and a person not of the org). In
-- order:
--   1. the DPO, re-checked (cases_check_dpo(): the person, then their dpo role, FOR SHARE);
--   2. a log already recorded from the same dialog (client_key) returns that case (changed false);
--   3. the requester: a person (never the DPO themselves, 42501: they send their own from Settings;
--      not the org's, 22023), current or former (PDPA-05 works for deactivated accounts), read FOR
--      SHARE after the DPO's rows (an admin action on someone else), because someone who has left
--      must come with one channel to reach them (HF006, PPL-01): a deactivation in progress makes
--      this wait and then see it (CLAUDE.md, Database), and anyone else may come with one; or
--      someone without an account, with a name and one channel (HF006). Every channel's address is
--      in the DPO contact's shapes (HF006);
--   4. the kind; how it came (never 'hearth'); the day received, from 365 days before today to today
--      in the org's zone (HF006); what they want, the DPO's summary, required, trimmed and limited as
--      submit_case() does. Nothing the DPO types may hold an NRIC- or FIN-shaped string or a
--      bidirectional-formatting character (HF006, naming the field, never the value). How identity
--      was checked isn't taken here: it is a step, with its own day (PPL-14);
--   5. the settings version stated at receipt: the one the latest version published before the
--      start of the day received (in the org's zone) linked, when its generator states targets; none
--      for a request received before v0 (PD-93). A version published later that day can't have been
--      the promise if it came after the request;
--   6. the case, with the same insert and retry as submit_case(), and one audit row naming the case
--      by its target and nothing else.
-- The refusals come in packages/shared logProblems()' order, which RQI-09 holds to the same samples
-- on both sides. The api appends case.opened ({via: 'intake'}) when it records. Returns the case,
-- its reference, the day the reply is due and whether this call recorded it. The messages can be
-- shown as they are.
create function public.log_case(
  kind text,
  came_by text,
  received_on date,
  person uuid,          -- a person of the org, current or former; null for someone without an account
  name text,            -- someone without an account: their name
  channel text,         -- 'email', 'phone' or 'post'; with contact, how to reach them
  contact text,
  details text,         -- the DPO's summary of what they want
  client_key uuid,
  request_id text,
  device_id uuid,
  ip inet
) returns table (id uuid, reference text, due_on date, changed boolean)
language plpgsql volatile security definer set search_path = '' as $$
declare
  org uuid := nullif(pg_catalog.current_setting('app.org_id', true), '')::uuid;
  actor uuid := nullif(pg_catalog.current_setting('app.user_id', true), '')::uuid;
  -- Whitespace at either end, as JavaScript's trim() reads it: 0009's literal, byte for byte, with
  -- \u escapes so a reader sees every code point.
  edges constant text := '^[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+'
                         '|[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+$';
  bidi constant text := '[\u202a-\u202e\u2066-\u2069]';
  id_number constant text := '(^|[^a-z0-9])[stfgm][0-9]{7}[a-z]([^a-z0-9]|$)';
  email_shape constant text :=
    '^[A-Za-z0-9._+-]{1,64}@[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.[A-Za-z]{2,63}$';
  phone_shape constant text := '^\+[1-9]([ -]?[0-9]){6,14}$';
  to_name text := nullif(pg_catalog.regexp_replace(
    pg_catalog.replace(log_case.name, E'\r\n', E'\n'), edges, '', 'g'), '');
  to_contact text := nullif(pg_catalog.regexp_replace(
    pg_catalog.replace(log_case.contact, E'\r\n', E'\n'), edges, '', 'g'), '');
  to_details text := nullif(pg_catalog.regexp_replace(
    pg_catalog.replace(log_case.details, E'\r\n', E'\n'), edges, '', 'g'), '');
  left_at timestamptz;
  tz text;
  today date;
  stated integer;
  prior public.cases%rowtype;
  new_id uuid;
  new_ref text;
begin
  perform public.cases_check_dpo(org, actor);
  if log_case.client_key is null then
    raise exception 'Send it from the form again.' using errcode = 'HF006';
  end if;
  select * into prior from public.cases c
  where c.org_id = org and c.logged_by = actor and c.client_key = log_case.client_key;
  if found then
    return query select prior.id, prior.reference, public.case_due(org, prior.id), false;
    return;
  end if;

  if log_case.person is not null then
    if log_case.person = actor then
      raise exception 'Send a request of your own from Settings › Privacy.' using errcode = 'insufficient_privilege';
    end if;
    select p.deactivated_at into left_at from public.people p
    where p.org_id = org and p.id = log_case.person
    for share;
    if not found then
      raise exception 'There is no such person at the organisation.' using errcode = 'invalid_parameter_value';
    end if;
    if to_name is not null then
      raise exception 'Name a person at the organisation, or someone without an account, not both.' using errcode = 'HF006';
    end if;
    if left_at is not null and log_case.channel is null and to_contact is null then
      raise exception 'Give how to reach them: they have left the organisation.' using errcode = 'HF006';
    end if;
  else
    if to_name is null then
      raise exception 'Give the name of the person who sent it.' using errcode = 'HF006';
    elsif pg_catalog.length(to_name) > 200 then
      raise exception 'Keep the name to at most 200 characters.' using errcode = 'HF006';
    elsif to_name ~ '\n' then
      raise exception 'Keep the name to one line.' using errcode = 'HF006';
    elsif to_name ~ '[[:cntrl:]]' or to_name ~ bidi then
      raise exception 'Write the name as plain text.' using errcode = 'HF006';
    elsif to_name ~* id_number then
      raise exception 'Leave the ID number out of the name.' using errcode = 'HF006';
    end if;
    if log_case.channel is null then
      raise exception 'Give one way to reach them: an email address, a phone number or a postal address.'
        using errcode = 'HF006';
    end if;
  end if;

  -- For either requester, a channel given: one of email, phone and post, with its address in that
  -- channel's shape, never an ID-number shape.
  if log_case.channel is not null or to_contact is not null then
    if log_case.channel is null or log_case.channel not in ('email', 'phone', 'post') then
      raise exception 'Give one way to reach them: an email address, a phone number or a postal address.'
        using errcode = 'HF006';
    elsif log_case.channel = 'email' and (to_contact is null or pg_catalog.length(to_contact) > 254 or to_contact !~ email_shape) then
      raise exception 'Enter an email address such as name@example.org.' using errcode = 'HF006';
    elsif log_case.channel = 'phone' and (to_contact is null or to_contact !~ phone_shape) then
      raise exception 'Enter the phone number with + and the country code, such as +65.' using errcode = 'HF006';
    elsif log_case.channel = 'post' and (to_contact is null or pg_catalog.length(to_contact) > 500
          or pg_catalog.translate(to_contact, E'\n', '') ~ '[[:cntrl:]]' or to_contact ~ '\n[[:space:]]*\n'
          or to_contact ~ bidi) then
      raise exception 'Keep the postal address to 500 characters of plain text.' using errcode = 'HF006';
    elsif log_case.channel = 'post' and to_contact !~ '[[:alnum:]]' then
      raise exception 'Write the postal address itself: it needs a letter or a digit, not only punctuation.'
        using errcode = 'HF006';
    elsif to_contact ~* id_number then
      raise exception 'Leave the ID number out of how to reach them.' using errcode = 'HF006';
    end if;
  end if;

  select o.time_zone, (pg_catalog.now() at time zone o.time_zone)::date into tz, today from public.orgs o where o.id = org;
  if log_case.kind is null
     or log_case.kind not in ('question', 'complaint', 'access', 'correction', 'withdrawal', 'objection') then
    raise exception 'Choose what the request is about.' using errcode = 'HF006';
  elsif log_case.came_by is null or log_case.came_by not in ('email', 'letter', 'phone', 'in_person', 'other') then
    raise exception 'Choose how it came: by email, by letter, by phone, in person or another way.' using errcode = 'HF006';
  elsif log_case.received_on is null or log_case.received_on < today - 365 or log_case.received_on > today then
    raise exception 'Give the day it was received, from a year ago to today.' using errcode = 'HF006';
  elsif to_details is null then
    raise exception 'Write what they want.' using errcode = 'HF006';
  elsif pg_catalog.length(to_details) > 4000 or pg_catalog.replace(to_details, E'\n', '') ~ '[[:cntrl:]]'
        or to_details ~ bidi then
    raise exception 'Keep it to 4,000 characters of plain text.' using errcode = 'HF006';
  elsif to_details ~* id_number then
    raise exception 'Leave the ID number out of what they want.' using errcode = 'HF006';
  end if;

  select case when public.notice_states_targets(v.generator) then v.dpo_settings_version end into stated
  from public.notice_versions v
  where v.org_id = org and v.published_at < (log_case.received_on::timestamp at time zone tz)
  order by v.version desc limit 1;

  for attempt in 1 .. 10 loop
    insert into public.cases (org_id, client_key, kind, came_by, received_on, logged_by, requester_person_id,
                              requester_name, requester_channel, requester_contact, details, stated_settings_version)
    values (org, log_case.client_key, log_case.kind, log_case.came_by, log_case.received_on, actor, log_case.person,
            to_name, log_case.channel, to_contact, to_details, stated)
    on conflict do nothing
    returning cases.id, cases.reference into new_id, new_ref;
    exit when new_id is not null;
    -- As in submit_case(): a log from the same dialog committed meanwhile, or a clashing reference.
    select * into prior from public.cases c
    where c.org_id = org and c.logged_by = actor and c.client_key = log_case.client_key;
    if found then
      return query select prior.id, prior.reference, public.case_due(org, prior.id), false;
      return;
    end if;
  end loop;
  if new_id is null then
    raise exception 'Hearth couldn''t give the request a reference. Try again.' using errcode = 'serialization_failure';
  end if;
  insert into public.audit_events (org_id, actor_id, action, target_type, target_id, request_id, device_id, ip)
  values (org, actor, 'case.logged', 'case', new_id::text, request_id, log_case.device_id, ip);
  return query select new_id, new_ref, public.case_due(org, new_id), true;
end
$$;
revoke execute on function public.log_case(text, text, date, uuid, text, text, text, text, uuid, text, uuid, inet)
  from public;

-- Records a step on a request, or closes it (PDPA-04, PDPA-05, PDPA-07, PDPA-09, PDPA-13; C0.9
-- PD-90, PD-91), for the org the server set, as the DPO set as app.user_id (packages/access decided
-- first: case.step), from the revision the page showed (seen: its number of steps, plus one once it
-- is closed). In order:
--   1. the DPO, re-checked (cases_check_dpo(), FOR SHARE);
--   2. the case FOR NO KEY UPDATE (not the org's, or no such case, 22023: the api's 404, so another
--      org's case reads as a missing one), so of two changes from one revision the second waits,
--      then finds the newer one and is refused (HF005);
--   3. at most 100 steps on a case (HF006), so the case sheet is bounded by construction; the
--      closure adds no step, so a case at its cap can still be closed (DB-03);
--   4. the day it happened, from the day received to today in the org's zone; the note, trimmed
--      (CRLF read as LF), at most 2,000 characters of plain text with no bidirectional-formatting
--      character or ID-number shape; a more-time date only on 'extended', a kind only on
--      'reclassified' and an outcome only on 'closed' (HF006);
--   5. by step, against the case's kind now (case_kind_now()):
--      closed: an open case; an outcome; 'refused' only for a copy, a correction or an objection,
--        with a note saying why; 'logged_in_error' only for a case the DPO logged; and a copy or a
--        correction closed as 'answered' only once a step records how the requester's identity was
--        checked (PD-91: nothing is released or changed on a session alone); then the closure,
--        written once, with the kind it was closed as;
--      acknowledged, identity_checked, replied, reclassified, extended: an open case;
--        identity_checked needs its note, one line; reclassified needs a kind other than the kind
--        now; extended only for a copy or a correction, to a day after the current due day and at
--        most 90 days after the day received, its day the day the requester was told in writing,
--        on or before the current due day (s21: told within the time; a later notice is a note, so
--        a late case never turns on time, PPL-04);
--      note: open or closed, with its note;
--      review_started: a case closed as refused with closed_kind 'access', with no review open;
--        review_ended: one open;
--   6. one audit row naming the case by its target and the step's code (and the outcome when
--      closing), never a note or a kind.
-- The step name 'closed' is an input to this function only: case_steps_step doesn't admit it,
-- because the closure lives on the case row, where cases_fixed() lets it be written once. The api
-- appends case.changed ({revision}). Returns the case's new revision. The messages can be shown as
-- they are.
create function public.add_case_step(
  the_case uuid,
  seen integer,
  step text,
  on_day date,
  note text,
  extended_to date,
  kind text,
  outcome text,
  request_id text,
  device_id uuid,
  ip inet
) returns table (revision integer)
language plpgsql volatile security definer set search_path = '' as $$
declare
  org uuid := nullif(pg_catalog.current_setting('app.org_id', true), '')::uuid;
  actor uuid := nullif(pg_catalog.current_setting('app.user_id', true), '')::uuid;
  -- Whitespace at either end, as JavaScript's trim() reads it: 0009's literal, byte for byte, with
  -- \u escapes so a reader sees every code point.
  edges constant text := '^[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+'
                         '|[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+$';
  bidi constant text := '[\u202a-\u202e\u2066-\u2069]';
  id_number constant text := '(^|[^a-z0-9])[stfgm][0-9]{7}[a-z]([^a-z0-9]|$)';
  how text := nullif(pg_catalog.regexp_replace(
    pg_catalog.replace(add_case_step.note, E'\r\n', E'\n'), edges, '', 'g'), '');
  c public.cases%rowtype;
  steps integer;
  kind_now text;
  today date;
  due date;
  reviews integer;
begin
  perform public.cases_check_dpo(org, actor);
  select * into c from public.cases x where x.org_id = org and x.id = add_case_step.the_case for no key update;
  if not found then
    raise exception 'There is no such request.' using errcode = 'invalid_parameter_value';
  end if;
  select pg_catalog.count(*) into steps from public.case_steps s where s.org_id = org and s.case_id = c.id;
  if add_case_step.seen is distinct from steps + (c.closed_at is not null)::integer then
    raise exception 'This request changed since you opened it. Reload it and try again.' using errcode = 'HF005';
  end if;
  if add_case_step.step is null or add_case_step.step not in (
       'acknowledged', 'identity_checked', 'replied', 'extended', 'reclassified', 'note', 'review_started',
       'review_ended', 'closed') then
    raise exception 'Choose what happened.' using errcode = 'HF006';
  end if;
  -- Only an input that inserts a step: the closure is written on the case row (DB-03).
  if add_case_step.step <> 'closed' and steps >= 100 then
    raise exception 'A request holds at most 100 steps. Close it, and log a new one if more is needed.'
      using errcode = 'HF006';
  end if;
  select (pg_catalog.now() at time zone o.time_zone)::date into today from public.orgs o where o.id = org;
  if add_case_step.on_day is null or add_case_step.on_day < c.received_on or add_case_step.on_day > today then
    raise exception 'Give the day it happened, from the day the request was received to today.' using errcode = 'HF006';
  end if;
  if how is not null and (pg_catalog.length(how) > 2000 or pg_catalog.replace(how, E'\n', '') ~ '[[:cntrl:]]'
                          or how ~ bidi) then
    raise exception 'Keep the note to 2,000 characters of plain text.' using errcode = 'HF006';
  elsif how ~* id_number then
    raise exception 'Leave the ID number out of the note.' using errcode = 'HF006';
  end if;
  if add_case_step.extended_to is not null and add_case_step.step <> 'extended' then
    raise exception 'Only more time takes a new date.' using errcode = 'HF006';
  elsif add_case_step.kind is not null and add_case_step.step <> 'reclassified' then
    raise exception 'Only a change of kind takes a kind.' using errcode = 'HF006';
  elsif add_case_step.outcome is not null and add_case_step.step <> 'closed' then
    raise exception 'Only closing a request takes an outcome.' using errcode = 'HF006';
  end if;

  kind_now := public.case_kind_now(org, c.id);
  if c.closed_at is not null and add_case_step.step not in ('note', 'review_started', 'review_ended') then
    raise exception 'This request is closed. Add a note, or record a PDPC review of a refused copy.' using errcode = 'HF006';
  end if;
  select pg_catalog.count(*) filter (where s.step = 'review_started') - pg_catalog.count(*) filter (where s.step = 'review_ended')
  into reviews
  from public.case_steps s where s.org_id = org and s.case_id = c.id;

  if add_case_step.step = 'note' then
    if how is null then
      raise exception 'Write the note.' using errcode = 'HF006';
    end if;
  elsif add_case_step.step = 'identity_checked' then
    if how is null then
      raise exception 'Say how you checked who they are.' using errcode = 'HF006';
    elsif pg_catalog.length(how) > 500 or how ~ '\n' then
      raise exception 'Say how you checked who they are on one line of at most 500 characters.' using errcode = 'HF006';
    end if;
  elsif add_case_step.step = 'reclassified' then
    if add_case_step.kind is null
       or add_case_step.kind not in ('question', 'complaint', 'access', 'correction', 'withdrawal', 'objection') then
      raise exception 'Choose what the request is about now.' using errcode = 'HF006';
    elsif add_case_step.kind = kind_now then
      raise exception 'Choose a kind other than the one it has now.' using errcode = 'HF006';
    end if;
  elsif add_case_step.step = 'extended' then
    -- The current due day: the new date comes after it, and the requester was told on or before it.
    due := public.case_due(org, c.id);
    if kind_now not in ('access', 'correction') then
      raise exception 'Only a request for a copy of data or a correction can have more time.' using errcode = 'HF006';
    elsif add_case_step.extended_to is null or add_case_step.extended_to <= due
          or add_case_step.extended_to > c.received_on + 90 then
      raise exception 'Pick a date after the current due day, at most 90 days after it was received.' using errcode = 'HF006';
    elsif add_case_step.on_day > due then
      raise exception 'Record more time only on or before the current due day. If you told them later, add a note.'
        using errcode = 'HF006';
    end if;
  elsif add_case_step.step = 'review_started' then
    if c.outcome is distinct from 'refused' or c.closed_kind is distinct from 'access' then
      raise exception 'Record a PDPC review only on a refused request for a copy of data.' using errcode = 'HF006';
    elsif reviews > 0 then
      raise exception 'A PDPC review of this request is open already.' using errcode = 'HF006';
    end if;
  elsif add_case_step.step = 'review_ended' then
    if reviews <= 0 then
      raise exception 'There is no open PDPC review of this request.' using errcode = 'HF006';
    end if;
  elsif add_case_step.step = 'closed' then
    if add_case_step.outcome is null
       or add_case_step.outcome not in ('answered', 'refused', 'withdrawn', 'duplicate', 'not_a_request', 'logged_in_error') then
      raise exception 'Choose how the request ended.' using errcode = 'HF006';
    elsif add_case_step.outcome = 'refused' and (kind_now not in ('access', 'correction', 'objection') or how is null) then
      raise exception 'Only a copy, a correction or an objection can be refused, and a refusal says why.' using errcode = 'HF006';
    elsif add_case_step.outcome = 'logged_in_error' and c.came_by = 'hearth' then
      raise exception 'Only a request you logged can be closed as logged in error.' using errcode = 'HF006';
    elsif add_case_step.outcome = 'answered' and kind_now in ('access', 'correction')
          and not exists (select 1 from public.case_steps s
                          where s.org_id = org and s.case_id = c.id and s.step = 'identity_checked') then
      raise exception 'Record how you checked who they are before you close it as answered.' using errcode = 'HF006';
    end if;
  end if;

  if add_case_step.step = 'closed' then
    update public.cases x
    set closed_on = add_case_step.on_day, closed_kind = kind_now, outcome = add_case_step.outcome,
        closed_note = how, closed_at = pg_catalog.now(), closed_by = actor
    where x.org_id = org and x.id = c.id;
  else
    insert into public.case_steps (org_id, case_id, number, step, on_day, note, extended_to, kind, recorded_by)
    values (org, c.id, steps + 1, add_case_step.step, add_case_step.on_day, how, add_case_step.extended_to,
            add_case_step.kind, actor);
  end if;
  insert into public.audit_events (org_id, actor_id, action, target_type, target_id, request_id, device_id, ip, details)
  values (org, actor, case when add_case_step.step = 'closed' then 'case.closed' else 'case.step_added' end,
          'case', c.id::text, request_id, add_case_step.device_id, ip,
          case when add_case_step.step = 'closed' then pg_catalog.jsonb_build_object('outcome', add_case_step.outcome)
               else pg_catalog.jsonb_build_object('step', add_case_step.step) end);
  -- The new revision: one more step, or the closure.
  return query select steps + (add_case_step.step <> 'closed')::integer
                      + (c.closed_at is not null or add_case_step.step = 'closed')::integer;
end
$$;
revoke execute on function public.add_case_step(uuid, integer, text, date, text, date, text, text, text, uuid, inet)
  from public;

-- The requester's tracking (PDPA-13; C0.9 OD-15, PD-97; packages/access decided first:
-- case.list_own): the cases where the person set as app.user_id is the requester, sent in Hearth or
-- logged for them by the DPO, open first (soonest due), then closed (newest received), with how
-- many are open before the limit (max_rows, 1 to 51: the route asks for one more than it shows; out
-- of bounds is 2201W, a programming error the routes never send). For each: the kind now, the
-- reference, how it came, the day received, the state (received: sent in Hearth with no step yet;
-- in_progress; more_time: more time recorded; closed), the due day while open, the latest reply's
-- day and whether it was on time (PD-112), and the day closed. Never a case closed as logged in
-- error, never the words, the DPO's notes, the steps or the outcome, and there is no subject to
-- show. It refuses nothing but a missing org or user, so it takes no lock and runs in a read-only
-- transaction.
create function public.read_own_cases(max_rows integer)
  returns table (id uuid, reference text, kind text, came_by text, received_on date, state text, due_on date,
                 replied_on date, replied_in_time boolean, closed_on date, open_total integer)
language plpgsql stable security definer set search_path = '' as $$
declare
  org uuid := nullif(pg_catalog.current_setting('app.org_id', true), '')::uuid;
  actor uuid := nullif(pg_catalog.current_setting('app.user_id', true), '')::uuid;
begin
  if org is null or actor is null then
    raise exception 'No org or user is set for this transaction' using errcode = 'insufficient_privilege';
  end if;
  if max_rows is null or max_rows not between 1 and 51 then
    raise exception 'Read between 1 and 51 requests at a time.' using errcode = 'invalid_row_count_in_limit_clause';
  end if;
  return query
    select c.id, c.reference, public.case_kind_now(org, c.id), c.came_by, c.received_on,
           case when c.closed_at is not null then 'closed'
                when exists (select 1 from public.case_steps s
                             where s.org_id = org and s.case_id = c.id and s.step = 'extended') then 'more_time'
                when c.came_by = 'hearth'
                     and not exists (select 1 from public.case_steps s where s.org_id = org and s.case_id = c.id) then 'received'
                else 'in_progress' end,
           d.due,
           (select s.on_day from public.case_steps s
            where s.org_id = org and s.case_id = c.id and s.step = 'replied'
            order by s.number desc limit 1),
           public.case_replied_in_time(org, c.id),
           c.closed_on,
           (pg_catalog.count(*) filter (where c.closed_at is null) over ())::integer
    from public.cases c
    cross join lateral (select case when c.closed_at is null then public.case_due(org, c.id) end as due) d
    where c.org_id = org and c.requester_person_id = actor and c.outcome is distinct from 'logged_in_error'
    order by c.closed_at is not null, d.due, c.received_on desc, c.id
    limit max_rows;
end
$$;
revoke execute on function public.read_own_cases(integer) from public;

-- The DPO's queue (PDPA-04, PDPA-13; C0.9 OD-14, PD-98; packages/access decided first: case.read):
-- the open cases (closed false), soonest due, then received, then id, with how many are open before
-- the limit; or the most recently closed (closed true), with no total, since it grows with
-- retention. max_rows is 1 to 201 open and 1 to 101 closed (the route asks for one more than it
-- shows); out of bounds is 2201W. For each: the kind now, the reference, how it came, the day
-- received, the due day while open, the latest reply's day and whether it was on time (PD-112), the
-- revision, the state (new: sent in Hearth with no step yet; in_progress; more_time; closed),
-- the requester's roster name and department and whether they have left, or the outside
-- requester's name, and the closure's day and outcome. Never an address or the words. The DPO is
-- re-checked FOR SHARE, so this is volatile and runs in a read-write transaction.
create function public.read_cases(closed boolean, max_rows integer)
  returns table (id uuid, reference text, kind text, came_by text, received_on date, due_on date, replied_on date,
                 replied_in_time boolean, revision integer, state text, requester_name text,
                 requester_department text, requester_outside boolean, requester_left boolean, closed_on date,
                 outcome text, open_total integer)
language plpgsql volatile security definer set search_path = '' as $$
declare
  org uuid := nullif(pg_catalog.current_setting('app.org_id', true), '')::uuid;
  actor uuid := nullif(pg_catalog.current_setting('app.user_id', true), '')::uuid;
begin
  perform public.cases_check_dpo(org, actor);
  if read_cases.closed is null or max_rows is null or max_rows < 1
     or max_rows > (case when read_cases.closed then 101 else 201 end) then
    raise exception 'Read between 1 and 201 open requests, or 1 and 101 closed ones, at a time.'
      using errcode = 'invalid_row_count_in_limit_clause';
  end if;
  return query
    select c.id, c.reference, public.case_kind_now(org, c.id), c.came_by, c.received_on,
           d.due,
           (select s.on_day from public.case_steps s
            where s.org_id = org and s.case_id = c.id and s.step = 'replied'
            order by s.number desc limit 1),
           public.case_replied_in_time(org, c.id),
           d.steps + (c.closed_at is not null)::integer,
           case when c.closed_at is not null then 'closed'
                when exists (select 1 from public.case_steps s
                             where s.org_id = org and s.case_id = c.id and s.step = 'extended') then 'more_time'
                when c.came_by = 'hearth' and d.steps = 0 then 'new'
                else 'in_progress' end,
           coalesce(p.full_name, c.requester_name),
           dep.name,
           c.requester_person_id is null,
           p.deactivated_at is not null,
           c.closed_on,
           c.outcome,
           case when not read_cases.closed then (pg_catalog.count(*) over ())::integer end
    from public.cases c
    cross join lateral (
      select case when c.closed_at is null then public.case_due(org, c.id) end as due,
             (select pg_catalog.count(*) from public.case_steps s where s.org_id = org and s.case_id = c.id)::integer as steps) d
    left join public.people p on p.org_id = c.org_id and p.id = c.requester_person_id
    left join public.departments dep on dep.org_id = p.org_id and dep.id = p.department_id
    where c.org_id = org and (c.closed_at is not null) = read_cases.closed
    order by case when not read_cases.closed then d.due end, case when not read_cases.closed then c.received_on end,
             c.closed_at desc, c.id
    limit max_rows;
end
$$;
revoke execute on function public.read_cases(boolean, integer) from public;

-- One case for the DPO's sheet (PDPA-04, PDPA-13; C0.9 OD-14, PD-98; case.read): everything on the
-- row, with the requester's person id, name, department, manager and the day they left (in the
-- org's zone) for a person, or the outside requester's name; the channel and address, for someone
-- without an account or a person who gave one; the kind now and the kind it came as; today in the
-- org's zone; the due day while open; the latest reply's day and whether it was on time (PD-112);
-- the revision and the state (new, in_progress, more_time or closed, as the queue's); whether an
-- identity step exists and a PDPC review is open; and who logged and closed it, by name. Not the
-- org's, or none, is 22023 (the api's 404).
create function public.read_case(the_case uuid)
  returns table (id uuid, reference text, kind text, received_kind text, came_by text, received_on date,
                 logged_on date, logged_by_name text, requester_person_id uuid, requester_name text,
                 requester_outside boolean, requester_department text, requester_manager text,
                 requester_left_on date, requester_channel text, requester_contact text, details text, today date,
                 due_on date, replied_on date, replied_in_time boolean, revision integer, state text,
                 identity_checked boolean, review_open boolean, closed_on date, closed_kind text, outcome text,
                 closed_note text, closed_by_name text)
language plpgsql volatile security definer set search_path = '' as $$
declare
  org uuid := nullif(pg_catalog.current_setting('app.org_id', true), '')::uuid;
  actor uuid := nullif(pg_catalog.current_setting('app.user_id', true), '')::uuid;
begin
  perform public.cases_check_dpo(org, actor);
  perform 1 from public.cases c where c.org_id = org and c.id = read_case.the_case;
  if not found then
    raise exception 'There is no such request.' using errcode = 'invalid_parameter_value';
  end if;
  return query
    select c.id, c.reference, public.case_kind_now(org, c.id), c.kind, c.came_by, c.received_on,
           (c.logged_at at time zone o.time_zone)::date, lp.full_name,
           c.requester_person_id, coalesce(p.full_name, c.requester_name), c.requester_person_id is null,
           dep.name, m.full_name, (p.deactivated_at at time zone o.time_zone)::date,
           c.requester_channel, c.requester_contact, c.details,
           (pg_catalog.now() at time zone o.time_zone)::date,
           case when c.closed_at is null then public.case_due(org, c.id) end,
           (select s.on_day from public.case_steps s
            where s.org_id = org and s.case_id = c.id and s.step = 'replied'
            order by s.number desc limit 1),
           public.case_replied_in_time(org, c.id),
           (select pg_catalog.count(*) from public.case_steps s where s.org_id = org and s.case_id = c.id)::integer
             + (c.closed_at is not null)::integer,
           case when c.closed_at is not null then 'closed'
                when exists (select 1 from public.case_steps s
                             where s.org_id = org and s.case_id = c.id and s.step = 'extended') then 'more_time'
                when c.came_by = 'hearth'
                     and not exists (select 1 from public.case_steps s where s.org_id = org and s.case_id = c.id) then 'new'
                else 'in_progress' end,
           exists (select 1 from public.case_steps s
                   where s.org_id = org and s.case_id = c.id and s.step = 'identity_checked'),
           (select pg_catalog.count(*) filter (where s.step = 'review_started')
                   > pg_catalog.count(*) filter (where s.step = 'review_ended')
            from public.case_steps s where s.org_id = org and s.case_id = c.id),
           c.closed_on, c.closed_kind, c.outcome, c.closed_note, cp.full_name
    from public.cases c
    join public.orgs o on o.id = c.org_id
    left join public.people p on p.org_id = c.org_id and p.id = c.requester_person_id
    left join public.departments dep on dep.org_id = p.org_id and dep.id = p.department_id
    left join public.people m on m.org_id = p.org_id and m.id = p.manager_id
    left join public.people lp on lp.org_id = c.org_id and lp.id = c.logged_by
    left join public.people cp on cp.org_id = c.org_id and cp.id = c.closed_by
    where c.org_id = org and c.id = read_case.the_case;
end
$$;
revoke execute on function public.read_case(uuid) from public;

-- One case's steps for the DPO's sheet (C0.9 PD-91; case.read), by number: at most 100 by
-- construction. Each with the day recorded in the org's zone and who recorded it, by name. Not the
-- org's, or none, is 22023.
create function public.read_case_steps(the_case uuid)
  returns table (number integer, step text, on_day date, note text, extended_to date, kind text, recorded_on date,
                 recorded_by_name text)
language plpgsql volatile security definer set search_path = '' as $$
declare
  org uuid := nullif(pg_catalog.current_setting('app.org_id', true), '')::uuid;
  actor uuid := nullif(pg_catalog.current_setting('app.user_id', true), '')::uuid;
begin
  perform public.cases_check_dpo(org, actor);
  perform 1 from public.cases c where c.org_id = org and c.id = read_case_steps.the_case;
  if not found then
    raise exception 'There is no such request.' using errcode = 'invalid_parameter_value';
  end if;
  return query
    select s.number, s.step, s.on_day, s.note, s.extended_to, s.kind, (s.recorded_at at time zone o.time_zone)::date,
           r.full_name
    from public.case_steps s
    join public.orgs o on o.id = s.org_id
    left join public.people r on r.org_id = s.org_id and r.id = s.recorded_by
    where s.org_id = org and s.case_id = read_case_steps.the_case
    order by s.number;
end
$$;
revoke execute on function public.read_case_steps(uuid) from public;

-- The case sheet's "Their other requests" (C0.9 PPL-07; case.read): for a person requester, every
-- other case whose requester is the same person, in any state (closed as logged in error
-- included), open first by due day, then closed, newest received; none for someone without an
-- account. It takes a case, never a person id, so no route carries one. State: new, in_progress or
-- more_time while open, as the queue's, or closed. max_rows is 1 to 51, else 2201W. Not the org's,
-- or none, is 22023.
create function public.read_case_others(the_case uuid, max_rows integer)
  returns table (id uuid, reference text, kind text, came_by text, received_on date, state text, due_on date,
                 replied_in_time boolean, closed_on date, outcome text)
language plpgsql volatile security definer set search_path = '' as $$
declare
  org uuid := nullif(pg_catalog.current_setting('app.org_id', true), '')::uuid;
  actor uuid := nullif(pg_catalog.current_setting('app.user_id', true), '')::uuid;
  requester uuid;
begin
  perform public.cases_check_dpo(org, actor);
  select c.requester_person_id into requester from public.cases c where c.org_id = org and c.id = read_case_others.the_case;
  if not found then
    raise exception 'There is no such request.' using errcode = 'invalid_parameter_value';
  end if;
  if max_rows is null or max_rows not between 1 and 51 then
    raise exception 'Read between 1 and 51 requests at a time.' using errcode = 'invalid_row_count_in_limit_clause';
  end if;
  return query
    select c.id, c.reference, public.case_kind_now(org, c.id), c.came_by, c.received_on,
           case when c.closed_at is not null then 'closed'
                when exists (select 1 from public.case_steps s
                             where s.org_id = org and s.case_id = c.id and s.step = 'extended') then 'more_time'
                when c.came_by = 'hearth'
                     and not exists (select 1 from public.case_steps s where s.org_id = org and s.case_id = c.id) then 'new'
                else 'in_progress' end,
           d.due,
           public.case_replied_in_time(org, c.id),
           c.closed_on,
           c.outcome
    from public.cases c
    cross join lateral (select case when c.closed_at is null then public.case_due(org, c.id) end as due) d
    where c.org_id = org and c.requester_person_id = requester and c.id <> read_case_others.the_case
    order by c.closed_at is not null, d.due, c.received_on desc, c.id
    limit max_rows;
end
$$;
revoke execute on function public.read_case_others(uuid, integer) from public;

-- How many open requests need the DPO's attention (C0.9 OD-22, PD-99): new (sent in Hearth with no
-- step recorded yet; one the DPO logged has been seen), or due within 2 business days, overdue
-- included, by case_due(), unless replied to on time (case_replied_in_time(), PD-112), for the
-- person set as app.user_id when they are still at the organisation and hold dpo; null for anyone
-- else, never an error, so GET /api/session answers the same shape for everyone. A number only: no
-- names, kinds or words. Plain reads with no lock, because it runs in GET /api/session's read-only
-- transaction (a FOR SHARE read there fails, 25006): a named exception to CLAUDE.md's FOR SHARE
-- rule, recorded there (DB-05). A DPO who loses the role at that instant may see one last count,
-- never a name or a word, as capabilities.registers may still show the menu item (accepted, PD-99).
-- "Within 2 business days" means a case due on a Monday counts on the Thursday before, so a weekend
-- never hides one. It costs O(open cases), which the form's cap bounds.
create function public.case_attention() returns integer
language plpgsql stable security definer set search_path = '' as $$
declare
  org uuid := nullif(pg_catalog.current_setting('app.org_id', true), '')::uuid;
  actor uuid := nullif(pg_catalog.current_setting('app.user_id', true), '')::uuid;
  today date;
begin
  if org is null or actor is null or not exists (
       select 1 from public.people p
       join public.role_assignments r on r.org_id = p.org_id and r.person_id = p.id
       where p.org_id = org and p.id = actor and p.deactivated_at is null and r.revoked_at is null and r.role = 'dpo') then
    return null;
  end if;
  select (pg_catalog.now() at time zone o.time_zone)::date into today from public.orgs o where o.id = org;
  return (select pg_catalog.count(*)::integer from public.cases c
          where c.org_id = org and c.closed_at is null
            and ((c.came_by = 'hearth'
                  and not exists (select 1 from public.case_steps s where s.org_id = org and s.case_id = c.id))
                 or (public.case_due(org, c.id) <= public.case_add_business_days(today, 2)
                     and not public.case_replied_in_time(org, c.id))));
end
$$;
revoke execute on function public.case_attention() from public;

-- Records the DPO's reply targets (PDPA-04, PDPA-13; C0.9 OD-08, PD-94), for the org the server set,
-- as the DPO set as app.user_id (packages/access decided first: notice.targets.set, a setup use
-- before v0, as the contact is), from the settings version the page showed. They live with the
-- contact in dpo_settings, whose versions never change: this writes the next version, copying the
-- contact, as set_dpo_contact() copies the targets, so every version is whole. In order:
--   1. the DPO, re-checked (registers_check_dpo(), FOR SHARE, as set_dpo_contact(): it changes the
--      DPO's settings rather than a request);
--   2. the latest version FOR NO KEY UPDATE; none recorded is refused (HF006): the targets are kept
--      with the contact, which publishing needs anyway; a seen that isn't it, or a newer one, HF005;
--   3. the range fixed in code: 5 to 10 business days and 14 to 30 days, so the DPO may promise
--      sooner than OD-08's figures, never later, and never so short that one DPO can't keep it
--      (HF006; OD-26);
--   4. the same targets again write nothing and return changed false;
--   5. the next version, and one audit row with each target's old and new value (numbers, which
--      name nobody).
-- No outbox event: nothing acts on it until the next published version (PD-72's reason). The
-- messages can be shown as they are.
create function public.set_reply_targets(
  seen integer,
  business_days integer,
  calendar_days integer,
  request_id text,
  device_id uuid,
  ip inet
) returns table (version integer, changed boolean)
language plpgsql volatile security definer set search_path = '' as $$
declare
  org uuid := nullif(pg_catalog.current_setting('app.org_id', true), '')::uuid;
  actor uuid := nullif(pg_catalog.current_setting('app.user_id', true), '')::uuid;
  cur public.dpo_settings%rowtype;
  new_id uuid := pg_catalog.gen_random_uuid();
  inserted uuid;
begin
  perform public.registers_check_dpo(org, actor);
  select * into cur from public.dpo_settings s
  where s.org_id = org
  order by s.version desc
  limit 1
  for no key update;
  if cur.id is null then
    raise exception 'Record your contact details first: the reply targets are kept with them.' using errcode = 'HF006';
  end if;
  -- The locking read returns the version it waited for, so one added meanwhile shows only here.
  if seen is distinct from cur.version
     or exists (select 1 from public.dpo_settings s where s.org_id = org and s.version > cur.version) then
    raise exception 'Your reply targets changed since you opened them. Reload them and try again.' using errcode = 'HF005';
  end if;
  if business_days is null or business_days not between 5 and 10 then
    raise exception 'Give from 5 to 10 business days for questions, complaints, withdrawals and objections.'
      using errcode = 'HF006';
  elsif calendar_days is null or calendar_days not between 14 and 30 then
    raise exception 'Give from 14 to 30 days for copies of data and corrections.' using errcode = 'HF006';
  end if;
  if cur.target_business_days = business_days and cur.target_calendar_days = calendar_days then
    return query select cur.version, false;
    return;
  end if;
  insert into public.dpo_settings (id, org_id, version, contact_title, contact_email, contact_phone, contact_postal,
                                   recorded_by, target_business_days, target_calendar_days)
  values (new_id, org, cur.version + 1, cur.contact_title, cur.contact_email, cur.contact_phone, cur.contact_postal,
          actor, business_days, calendar_days)
  on conflict on constraint dpo_settings_org_version do nothing
  returning id into inserted;
  if inserted is null then
    raise exception 'Your reply targets changed since you opened them. Reload them and try again.' using errcode = 'HF005';
  end if;
  insert into public.audit_events (org_id, actor_id, action, target_type, target_id, request_id, device_id, ip, details)
  values (org, actor, 'notice.targets_set', 'dpo_settings', new_id::text, request_id, set_reply_targets.device_id, ip,
          pg_catalog.jsonb_build_object('version', cur.version + 1, 'was_version', cur.version,
            'business_days', pg_catalog.jsonb_build_array(cur.target_business_days, business_days),
            'calendar_days', pg_catalog.jsonb_build_array(cur.target_calendar_days, calendar_days)));
  return query select cur.version + 1, true;
end
$$;
revoke execute on function public.set_reply_targets(integer, integer, integer, text, uuid, inet) from public;

-- Records the DPO's business contact (PDPA-13, PDPA-02; C0.9 OD-10, PD-63) for the org the server
-- set, as the person set as app.user_id (packages/access decided first: notice.contact.set), from
-- the version the page showed (seen; null when none is recorded), and copies the reply targets
-- (C0.9 PD-94). In order:
--   1. the DPO, re-checked (registers_check_dpo(): the person, then their dpo role, FOR SHARE; its
--      42501 is the api's 403, so its wording about the registers never reaches a screen);
--   2. the latest version FOR NO KEY UPDATE, so of two changes from one version the second waits,
--      then finds the newer one and is refused (HF005, register_changed). With none recorded there
--      is nothing to lock: of two first records the second waits on the unique (org_id, version)
--      index and is refused the same way, never with 23505, and records version 1 if the first
--      rolled back;
--   3. text trimmed of JavaScript's whitespace at both ends (as the api trims it), empty read as
--      none; the rules (HF006, register_invalid), in contactProblems()'s order. Wording Hearth keeps
--      off its screens (AI_COPY) is the route's to refuse, since that list is code (PD-65);
--   4. the same contact again writes nothing and returns changed false, whatever the targets are:
--      it compares the contact's four fields alone;
--   5. the next version, with the latest version's reply targets copied (a first record takes
--      OD-08's figures, the columns' defaults), and one audit row (ADM-06) naming the fields that
--      changed, never their values: the versions are the history.
-- 0012 replaces 0011's function with the same signature, so its grant and the route's call stand.
-- No outbox event (PD-72): nothing acts on a contact change, which reaches people only through the
-- next published version. The messages can be shown as they are.
create or replace function public.set_dpo_contact(
  seen integer,
  title text,
  email text,
  phone text,
  postal text,
  request_id text,
  device_id uuid,
  ip inet
) returns table (version integer, changed boolean)
language plpgsql volatile security definer set search_path = '' as $$
declare
  org uuid := nullif(pg_catalog.current_setting('app.org_id', true), '')::uuid;
  actor uuid := nullif(pg_catalog.current_setting('app.user_id', true), '')::uuid;
  -- Whitespace at either end, as JavaScript's trim() reads it: 0009's literal, byte for byte, with
  -- \u escapes so a reader sees every code point.
  edges constant text := '^[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+'
                         '|[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+$';
  email_shape constant text :=
    '^[A-Za-z0-9._+-]{1,64}@[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.[A-Za-z]{2,63}$';
  phone_shape constant text := '^\+[1-9]([ -]?[0-9]){6,14}$';
  to_title text := nullif(pg_catalog.regexp_replace(set_dpo_contact.title, edges, '', 'g'), '');
  to_email text := nullif(pg_catalog.regexp_replace(set_dpo_contact.email, edges, '', 'g'), '');
  to_phone text := nullif(pg_catalog.regexp_replace(set_dpo_contact.phone, edges, '', 'g'), '');
  to_postal text := nullif(pg_catalog.regexp_replace(set_dpo_contact.postal, edges, '', 'g'), '');
  cur public.dpo_settings%rowtype;
  new_id uuid := pg_catalog.gen_random_uuid();
  inserted uuid;
  fields text[];
begin
  perform public.registers_check_dpo(org, actor);
  select * into cur from public.dpo_settings s
  where s.org_id = org
  order by s.version desc
  limit 1
  for no key update;
  -- The locking read returns the version it waited for, so one added meanwhile shows only here.
  if seen is distinct from cur.version or exists (
       select 1 from public.dpo_settings s
       where s.org_id = org and (cur.version is null or s.version > cur.version)) then
    raise exception 'Your contact details changed since you opened them. Reload them and try again.' using errcode = 'HF005';
  end if;
  if to_title is null then
    raise exception 'Give the role title people write to, such as Data Protection Officer.' using errcode = 'HF006';
  elsif pg_catalog.length(to_title) > 120 or to_title ~ '[[:cntrl:]]' then
    raise exception 'Keep the role title to one line of at most 120 characters.' using errcode = 'HF006';
  elsif to_email is null and to_phone is null and to_postal is null then
    raise exception 'Give at least one way to reach you outside Hearth: an email address, a phone number or a postal address.'
      using errcode = 'HF006';
  elsif to_email is not null and (pg_catalog.length(to_email) > 254 or to_email !~ email_shape) then
    raise exception 'Enter an email address such as name@example.org.' using errcode = 'HF006';
  elsif to_phone is not null and to_phone !~ phone_shape then
    raise exception 'Enter the phone number with + and the country code, such as +65.' using errcode = 'HF006';
  elsif to_postal is not null and (pg_catalog.length(to_postal) > 500
        or pg_catalog.translate(to_postal, E'\n', '') ~ '[[:cntrl:]]' or to_postal ~ '\n[[:space:]]*\n') then
    raise exception 'Keep the postal address to 500 characters of plain text.' using errcode = 'HF006';
  elsif to_postal is not null and to_postal !~ '[[:alnum:]]' then
    raise exception 'Write the postal address itself: it needs a letter or a digit, not only punctuation.'
      using errcode = 'HF006';
  end if;
  fields := pg_catalog.array_remove(array[
    case when cur.contact_title is distinct from to_title then 'title' end,
    case when cur.contact_email is distinct from to_email then 'email' end,
    case when cur.contact_phone is distinct from to_phone then 'phone' end,
    case when cur.contact_postal is distinct from to_postal then 'postal' end], null);
  if cur.id is not null and pg_catalog.cardinality(fields) = 0 then
    return query select cur.version, false;
    return;
  end if;
  insert into public.dpo_settings (id, org_id, version, contact_title, contact_email, contact_phone, contact_postal,
                                   recorded_by, target_business_days, target_calendar_days)
  values (new_id, org, coalesce(cur.version, 0) + 1, to_title, to_email, to_phone, to_postal, actor,
          -- The reply targets, copied (C0.9 PD-94), so a contact change never resets them; a first
          -- record takes OD-08's figures, the columns' defaults, which DCD-13 holds equal.
          coalesce(cur.target_business_days, 10), coalesce(cur.target_calendar_days, 30))
  on conflict on constraint dpo_settings_org_version do nothing
  returning id into inserted;
  if inserted is null then
    raise exception 'Your contact details changed since you opened them. Reload them and try again.' using errcode = 'HF005';
  end if;
  insert into public.audit_events (org_id, actor_id, action, target_type, target_id, request_id, device_id, ip, details)
  values (org, actor, 'notice.contact_set', 'dpo_settings', new_id::text, request_id, set_dpo_contact.device_id, ip,
          pg_catalog.jsonb_build_object('version', coalesce(cur.version, 0) + 1, 'was_version', cur.version,
                                        'changed', fields));
  return query select coalesce(cur.version, 0) + 1, true;
end
$$;

-- Reads the org's audit log, newest first, for the person the server set as app.user_id, who
-- must be at the org (not deactivated) and hold a role on the org's audit_log_readers list. It
-- reads the org and the person from the settings the server's transaction helper set from the
-- session (CLAUDE.md, Database), never from its arguments, and every read is itself logged. Page
-- with before_id: pass the smallest id of the previous page.
-- From C0.9 PR 3b (OD-14, OD-23, PD-100): a request's rows (target_type 'case') go only to a reader
-- who also holds dpo, whatever roles the org lets read the log (D45). A request's row names who
-- wrote to the DPO, and when, which OD-14 keeps to the DPO alone, counts included. Its own case_id
-- is empty: that column stays the logged case of a privileged read (Rule 9, C1.11), whose rows are
-- every chosen reader's, so this filter is by target, never by case_id. Nobody can read the log
-- before C0.16 chooses readers, so this changes nothing anyone sees today; C0.16's viewer and export
-- go through this function or apply its filter. 0012 replaces 0004's function with the same
-- signature, so its grant stands.
create or replace function public.read_audit_events(
  from_at timestamptz,
  to_at timestamptz,
  before_id bigint default null,
  max_rows integer default 100
) returns setof public.audit_events
language plpgsql security definer set search_path = '' as $$
declare
  org uuid := nullif(current_setting('app.org_id', true), '')::uuid;
  reader uuid := nullif(current_setting('app.user_id', true), '')::uuid;
  sees_cases boolean;
begin
  if org is null or reader is null then
    raise exception 'No org or user is set for this transaction' using errcode = 'insufficient_privilege';
  end if;
  -- The reader's role, the person and the list entry are read FOR SHARE (CLAUDE.md, Database): a
  -- revocation, deactivation or removal in progress makes this wait and then see it, and one that
  -- starts later waits for this read's transaction, so no rows go out once access has ended.
  perform 1
  from public.role_assignments r
  join public.people p on p.org_id = r.org_id and p.id = r.person_id
  join public.audit_log_readers a on a.org_id = r.org_id and a.role = r.role and a.removed_at is null
  where r.org_id = org and r.person_id = reader and r.revoked_at is null and p.deactivated_at is null
  for share;
  if not found then
    raise exception 'None of your roles can read the audit log. The roles that can are chosen in the admin console.'
      using errcode = 'insufficient_privilege';
  end if;
  -- Whether the reader holds dpo, read FOR SHARE like their other rows, so a revocation in progress
  -- makes this wait and then see it (RQR-08).
  perform 1 from public.role_assignments r
  where r.org_id = org and r.person_id = reader and r.revoked_at is null and r.role = 'dpo'
  for share;
  sees_cases := found;
  if from_at is null or to_at is null or from_at >= to_at then
    raise exception 'The period to read must start before it ends.' using errcode = 'invalid_parameter_value';
  end if;
  if max_rows is null or max_rows not between 1 and 1000 then
    raise exception 'Read between 1 and 1000 entries at a time.' using errcode = 'invalid_parameter_value';
  end if;

  insert into public.audit_events (org_id, actor_id, action, details)
  values (org, reader, 'audit.read', pg_catalog.jsonb_build_object(
    'from', from_at, 'to', to_at, 'before_id', before_id, 'max_rows', max_rows));

  return query
    select a.* from public.audit_events a
    where a.org_id = org and a.at >= from_at and a.at < to_at and (before_id is null or a.id < before_id)
      and (sees_cases or a.target_type is distinct from 'case')
    order by a.id desc
    limit max_rows;
end
$$;

-- C0.9 OD-06, T22 item 20: the case a restriction came from is one of the org's cases: a composite
-- key, like every other on the table, so a restriction can cite only its own org's case. No writer
-- exists until C2.11 and no row cites a case, so this is validated in place; it takes SHARE ROW
-- EXCLUSIVE on processing_restrictions (no runtime role writes it; the worker's reads take ACCESS
-- SHARE, which doesn't conflict) and on cases, which is new. C2.11's writer will also check that
-- the case is a withdrawal or objection whose requester is the restriction's person, reading it FOR
-- KEY SHARE before the insert, which keeps cases before processing_register in the lock order
-- (DB-06). hearth_queue's column grant still leaves out case_id.
alter table public.processing_restrictions
  add constraint processing_restrictions_case foreign key (org_id, case_id) references public.cases (org_id, id);

-- What each role may do (CLAUDE.md, Database: only the grants each needs; never ALL, TRUNCATE,
-- TRIGGER or REFERENCES). Every new function has had execute revoked from PUBLIC beside it. The
-- internal helpers and triggers are granted to nobody: new_case_reference, notice_states_targets,
-- case_add_business_days, case_due_on, case_kind_now, case_due, case_replied_in_time,
-- cases_check_dpo, cases_fixed and case_steps_unchanged. processing_register_defaults(),
-- set_dpo_contact() and read_audit_events() keep what they had. No table grant on cases or
-- case_steps, to hearth_app or to anyone (OD-06, OD-14), and nothing goes to a job role or
-- hearth_worker: no job reads a case before C0.14, whose alert job gets its own narrow definer.
-- hearth_app (the api): the requester's two, the DPO's case functions, the count and the targets'
-- writer.
grant execute on function
    public.submit_case(text, text, uuid, text, uuid, inet),
    public.read_own_cases(integer),
    public.log_case(text, text, date, uuid, text, text, text, text, uuid, text, uuid, inet),
    public.add_case_step(uuid, integer, text, date, text, date, text, text, text, uuid, inet),
    public.read_cases(boolean, integer),
    public.read_case(uuid),
    public.read_case_steps(uuid),
    public.read_case_others(uuid, integer),
    public.case_attention(),
    public.set_reply_targets(integer, integer, integer, text, uuid, inet)
  to hearth_app;

-- The two tables live requests touch, locked without ever waiting while one is held (PD-106). Every
-- GET /api/notice, draft, publish and submit reads dpo_settings; a publish holds its latest row FOR
-- SHARE while it appends to the outbox, and every committed write appends to the outbox. Waiting
-- for one while holding the other could close a cycle, so each attempt asks for both with NOWAIT in
-- a block of its own: a busy table fails the attempt, whose rollback lets go of what it took, and
-- the next attempt follows 0.1 s later. Postgres takes a list's locks in the order given, and holds
-- them until the commit. After 100 attempts (about 10 s, the migrator's lock_timeout) it fails with
-- 55P03, and the migrate step is run again (0011's loop).
do $$
begin
  for attempt in 1..100 loop
    begin
      lock table public.dpo_settings, public.outbox_events in access exclusive mode nowait;
      return;
    exception when lock_not_available then
      perform pg_catalog.pg_sleep(0.1);
    end;
  end loop;
  raise exception 'dpo_settings and outbox_events stayed in use for 10 s. Run the migrate step again.'
    using errcode = 'lock_not_available';
end
$$;

-- C0.9 OD-08, PD-94: the DPO's reply targets, in the settings version the notice prints: business
-- days for withdrawals, objections, questions and complaints (5 to 10, default 10: PDPA-04's target
-- and the PDPC's reasonable notice for a withdrawal), and calendar days for copies and corrections
-- (14 to 30, default 30: s21's and PDPA-07's 30 days). The ranges are packages/shared's
-- REPLY_TARGETS (CLAUDE.md, AI and LLM features: every setting's allowed range lives in code), which
-- RQD-11 and DCS-07 hold equal to these checks; OD-26 confirmed them. A constant default adds the
-- columns without rewriting a row and fires no trigger: every version recorded before 0012 reads
-- OD-08's figures, which the runbooks' working targets already were (T22 item 46). A version a
-- generator before c09.3 printed never stated them, which notice_states_targets() and the notice's
-- code decide by the generator, never by these values (PD-93, PD-95).
alter table public.dpo_settings
  add column target_business_days integer not null default 10,
  add column target_calendar_days integer not null default 30,
  add constraint dpo_settings_target_business_days check (target_business_days between 5 and 10),
  add constraint dpo_settings_target_calendar_days check (target_calendar_days between 14 and 30);
-- The settings version whose targets were stated when a request was received (store the context).
-- No case exists yet, so it is validated in place.
alter table public.cases
  add constraint cases_stated_settings
    foreign key (org_id, stated_settings_version) references public.dpo_settings (org_id, version);

-- The two case events join the outbox's types (packages/shared EVENTS lists the same, and CI
-- compares the two lists: check-catalogues.ts check 2). The new list holds every type 0009's did, so
-- every row already there passes, and the check is validated in place, in this statement, under the
-- lock taken above. It is this migration's last statement, so the lock is held only until the
-- commit.
alter table public.outbox_events
  drop constraint outbox_events_type,
  add constraint outbox_events_type check (type in (
    -- Emitted from C0.6.
    'signin.started', 'signin.ended', 'account.pin_set', 'account.pin_reset', 'account.passkey_added',
    'account.passkey_removed', 'person.deactivated', 'acl.changed', 'flag.changed',
    -- Emitted from C0.9: a change to the processing or the transfer register.
    'register.purpose_changed', 'register.transfer_changed',
    -- Emitted from C0.9 PR 3b: a request reached the DPO's queue, from the form or the DPO's
    -- intake, or the DPO recorded a step on one (PD-101). Ids only.
    'case.opened', 'case.changed',
    -- Reserved: named now, emitted by the step after each.
    'person.added', 'person.updated', 'person.phone_changed', 'department.changed', 'team.changed',
    'team.membership_changed', 'role.changed',                                     -- C0.16
    'profile.updated',                                                             -- C0.15
    'notice.published', 'notice.acknowledged',                                     -- C0.9
    'message.created', 'message.updated', 'message.deleted',                       -- C1.1
    'voice_message.created',                                                       -- C1.6
    'task.created', 'task.updated', 'task.deleted', 'task.overdue',                -- C2.1
    'session.started', 'session.ended',                                            -- C2.4 (room sessions)
    'track_segment.written',                                                       -- C2.6
    'redaction.applied',                                                           -- C2.11
    'suggested_task.created'                                                       -- C3.5
  ));
