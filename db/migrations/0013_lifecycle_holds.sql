-- C0.10 PR 1 (TECH-SPEC T23): the retention-class registry, the deletion log, legal and
-- access-request holds, isHeld() and the deletion code's path for cases (PDPA-09, ADM-06, ADM-07,
-- ADM-08, REC-23, ACC-11; BUILD-PLAN C0.10; C0.9 OD-27; TECH-SPEC T15 item 17, T16 items 6 and 18,
-- T22 items 52, 54, 59 and 62; LH-01 to LH-38 and LH-56 to LH-59).
--
-- What it adds: the tables deletion_log and legal_holds, with their triggers; the defaults functions
-- retention_class_defaults(), retention_period_days(), refused_copy_hold() and deletion_causes();
-- the helpers lifecycle_today(), case_hold_until(), lifecycle_kinds(), lifecycle_persons_of(),
-- lifecycle_containers_of(), lifecycle_lock_target(), lifecycle_row_anchors(),
-- lifecycle_sources_of() and lifecycle_held(), which no role may run; the definers is_held(),
-- log_deletion() and delete_case(), which no role may run either until the step that calls each,
-- and each of which reads the org from app.org_id, never from an argument (DB-06); the guard
-- triggers lifecycle_guard('<table>') and lifecycle_no_truncate() on cases, case_steps and
-- legal_holds, and lifecycle_no_truncate() on deletion_log; and the index
-- processing_restrictions_by_case.
--
-- What it alters: case_steps' foreign key to cases, now deferrable initially deferred, so a
-- request's steps can go after it in one transaction (LH-13); and the offboarding and revocation
-- roles' outbox grant, now every column but the actor (OD-27, LH-27).
--
-- What it leaves alone: every existing function, read_audit_events() included (C1.11 adds its hold
-- filter with the hold writers, LH-16); the clean-up functions, whose exemption the registry records
-- (T16 item 6, LH-26), so they write no log row; orgs and its triggers (no per-org rows, LH-03), so
-- the Owner bootstrap's write set is unchanged; outbox_events_type: no new type, so no lock on the
-- outbox (LH-23); every register and notice function, the notice generator, the seed, and the job
-- roles but for OD-27's narrowing; every runtime grant: no role gains anything. No row is inserted,
-- updated or deleted.
--
-- Retention classes are code (packages/shared/src/retention.ts). retention_class_defaults()
-- mirrors the ones whose data the database holds or logs, and CI holds the two equal both ways
-- (apps/server/scripts/check-catalogues.ts, check 7).
--
-- The guard, in one paragraph: no row of a guarded table leaves by any role's DELETE unless its
-- deletion is logged in the same transaction and nothing holds it, the owner's and a superuser's
-- DELETE included. TRUNCATE is refused. A table gets the guard with its first delete path (check 8,
-- LH-12). What it can't stop is DDL: a superuser setting session_replication_role = replica, or
-- anyone with the owner's credential disabling, dropping or replacing the trigger or its function,
-- can delete afterwards. That is a direct production change CLAUDE.md forbids, which check 7d,
-- LCG-03 and C0.11's logging of production access cover (T23, DB-07).
--
-- Merged comments that name C0.10 for sweeps (0003's sessions and devices, 0005's partitions): the
-- sweeps are C2.9's (BUILD-PLAN: "no retention sweeps (registry, holds and deletion log only)"), and
-- TECH-SPEC T23 item 2 restates who does what, since a merged migration never changes.
--
-- The lock order (CLAUDE.md, Database), with this step's two slots: people → users → passkeys →
-- phone_numbers → devices → sessions, then role_assignments → containers (each step's, from C1.1:
-- conversations, then rooms, then folders) → cases → legal_holds → processing_register → ... (LH-21).
-- deletion_log rows are only inserted, so the log needs no slot. A deletion of a person's data takes
-- the person's row FOR NO KEY UPDATE first; every hold decision (lifecycle_held()) takes its anchor
-- people FOR NO KEY UPDATE, never FOR SHARE, so a request sent or logged for them (submit_case() and
-- log_case() read the requester FOR SHARE) can't commit unseen behind it (DB-01); then the item's
-- containers FOR SHARE; then the people's open and refused requests FOR SHARE, and a case itself,
-- which a closure, reclassification or review step holds FOR NO KEY UPDATE; and reads holds only in
-- later statements. delete_case() takes the requester's row, then the request FOR UPDATE, against
-- which a hold citing it, read FOR KEY SHARE by C1.11's writer, takes turns (DB-02). The guard
-- re-takes the anchors, a no-op inside the deletion code and out of order only in an ad hoc delete
-- by the owner, where a deadlock answers 40P01.
--
-- The locks 0013 takes: SHARE ROW EXCLUSIVE on orgs and principals for the new tables' foreign keys
-- (nothing writes either at run time in C0, the bootstrap's set-up aside); SHARE on
-- processing_restrictions for its index (no runtime role writes it before C2.11); no lock on
-- outbox_events for OD-27's revoke and grant (a grant names its table without locking it). The two
-- tables live requests touch, cases and case_steps, are locked last, together, under 0012's no-wait
-- retry (LH-31): cases SHARE ROW EXCLUSIVE (CREATE TRIGGER's mode, which lets the DPO's reads and
-- FOR SHARE reads through and stops writes) and case_steps ACCESS EXCLUSIVE (ALTER CONSTRAINT's),
-- held only until the commit. Nothing is locked on sessions, devices, passkeys, phone_numbers,
-- notice_acknowledgments, audit_events, data_access_events, outbox_events or people (LCR-10).
--
-- Free text: a hold's reason and release reason are what the DPO or a Compliance Officer will type
-- through C1.11's writers. Hearth shows them only to those two roles, as data (Rule 8), so neither
-- SQL nor a route holds them to AI_COPY (PD-102's precedent). The table's checks refuse control and
-- bidirectional-formatting characters, the class written as \u escapes exactly as 0012 writes it
-- (PD-113, DB-04), and an NRIC- or FIN-shaped string. Every message a function raises is fixed text,
-- never an input (C0.9 RQD-14's rule).

-- C0.10 LH-03, LH-04 (TECH-SPEC T23 item 2): every retention class whose data Postgres holds or
-- whose objects S3 holds, with the facts the deletion code reads, mirroring packages/shared
-- RETENTION_CLASSES (check-catalogues.ts, check 7, both ways). period_kind is days (a whole number
-- of days from the anchor), follows (deleted with another class's item, or with whatever it was
-- made from: 'source'), while (kept while something lasts: the org, the person, a hold) or until
-- (deleted when something happens, and at most days after the anchor meanwhile, where set); holds is
-- apply (deleted only through the deletion code, which checks holds), exempt (outside holds, with
-- the decision code records) or kept (history, never deleted); tables lists the tables of public the
-- class covers, each in exactly one class (check 7b), empty for a later step's class. Ranges,
-- setters and statuses are code's (CLAUDE.md, AI and LLM features: every setting's range lives in
-- code). A step that adds a class or moves a table into one replaces this function with the same
-- signature; it holds no org's rows, so no trigger on orgs and no backfill. A class key is never
-- removed (deletion_log rows name it for as long as they are kept). Valkey's, the logs', the
-- backups' and pub/sub's classes are code's and infra/'s alone (LH-07), so they aren't here.
create function public.retention_class_defaults()
  returns table (key text, store text, ai boolean, period_kind text, days integer, anchor text, follows text,
                 holds text, tables text[])
language sql immutable set search_path = '' as $$
  values
    -- C0's own data: every table of public, the migrator's ledger aside.
    ('org_settings', 'postgres', false, 'while', null, null, null, 'kept', array['orgs', 'audit_log_readers']),
    ('roster', 'postgres', false, 'while', null, null, null, 'kept',
     array['principals', 'people', 'users', 'departments', 'teams', 'team_memberships', 'role_assignments', 'profiles']),
    -- Replaced whole by the person's own edit (exempt, LH-48); a leaver's go with C2.9's profile
    -- reduction, deletion code that asks lifecycle_held() and skips a held person (LH-58).
    ('working_hours', 'postgres', false, 'until', null, null, null, 'exempt', array['working_hours']),
    ('sign_in_records', 'postgres', false, 'days', 731, 'ended', null, 'apply',
     array['phone_numbers', 'devices', 'sessions', 'passkeys']),
    ('acknowledgements', 'postgres', false, 'while', null, null, null, 'apply', array['notice_acknowledgments']),
    ('audit_log', 'postgres', false, 'days', 731, 'at', null, 'apply', array['audit_events']),
    ('access_log', 'postgres', false, 'days', 731, 'at', null, 'apply', array['data_access_events']),
    -- The clean-up's (0007; T15 item 17): ages fixed in purge_outbox(), purge_jobs() and
    -- purge_schedule_runs(), exempt from holds (T16 item 6, LH-26).
    ('outbox', 'postgres', false, 'days', 14, 'at', null, 'exempt', array['outbox_events']),
    ('jobs', 'postgres', false, 'days', 14, 'finished', null, 'exempt', array['jobs']),
    ('schedule_runs', 'postgres', false, 'days', 90, 'finished', null, 'exempt', array['schedule_runs']),
    ('service_config', 'postgres', false, 'while', null, null, null, 'kept',
     array['feature_flags', 'schedules', 'outbox_checkpoints', 'outbox_floors']),
    ('compliance_records', 'postgres', false, 'while', null, null, null, 'kept',
     array['processing_register', 'transfer_register', 'transfer_clearances', 'processing_restrictions', 'notice_versions',
           'notice_version_purposes', 'notice_version_providers', 'dpo_settings']),
    -- The DPO's requests: 731 days after the closure, the DPO's to change from C2.9 (LH-08, LH-47).
    ('cases', 'postgres', false, 'days', 731, 'closed_on', null, 'apply', array['cases', 'case_steps']),
    ('legal_holds', 'postgres', false, 'days', 731, 'released', null, 'apply', array['legal_holds']),
    -- The deletion log's own age is fixed in deletion_log_kept() (check 7c).
    ('deletion_log', 'postgres', false, 'days', 731, 'at', null, 'exempt', array['deletion_log']),
    ('provenance', 'postgres', false, 'follows', null, null, 'source', 'apply', array[]::text[]),
    -- Later content: each step moves its tables in.
    ('profile_photos', 's3', false, 'follows', null, null, 'roster', 'apply', array[]::text[]),
    ('upload_quarantine', 's3', false, 'until', 1, 'created', null, 'exempt', array[]::text[]),
    ('messages', 'postgres', false, 'days', 1095, 'created', null, 'apply', array[]::text[]),
    ('held_versions', 'postgres', false, 'while', null, null, null, 'apply', array[]::text[]),
    ('derived_caches', 'postgres', false, 'follows', null, null, 'source', 'apply', array[]::text[]),
    ('voice_message_audio', 's3', false, 'days', 360, 'created', null, 'apply', array[]::text[]),
    ('tasks', 'postgres', false, 'days', 1095, 'created', null, 'apply', array[]::text[]),
    ('session_records', 'postgres', false, 'days', 1095, 'ended', null, 'apply', array[]::text[]),
    ('session_media', 's3', false, 'days', 120, 'ended', null, 'apply', array[]::text[]),
    ('calendar_events', 'postgres', false, 'days', 1095, 'ended', null, 'apply', array[]::text[]),
    ('drive_items', 'postgres', false, 'days', 1095, 'last_edit', null, 'apply', array[]::text[]),
    ('drive_trash', 'postgres', false, 'days', 30, 'trashed', null, 'apply', array[]::text[]),
    ('slide_copies', 'postgres', false, 'follows', null, null, 'session_records', 'apply', array[]::text[]),
    ('people_insights', 'postgres', false, 'days', 731, 'created', null, 'apply', array[]::text[]),
    ('breach_register', 'postgres', false, 'days', 731, 'closed_on', null, 'apply', array[]::text[]),
    -- The AI classes (LH-06, D41): declared with finite defaults and nothing more; none has a table,
    -- a per-org value or a setter before A0.
    ('transcripts', 'postgres', true, 'days', 1095, 'ended', null, 'apply', array[]::text[]),
    ('voice_message_transcripts', 'postgres', true, 'days', 1095, 'created', null, 'apply', array[]::text[]),
    ('machine_output', 'postgres', true, 'follows', null, null, 'transcripts', 'apply', array[]::text[]),
    ('ai_notes', 'postgres', true, 'days', 1095, 'created', null, 'apply', array[]::text[]),
    ('brain_index', 'postgres', true, 'follows', null, null, 'source', 'apply', array[]::text[]),
    ('ai_conversations', 'postgres', true, 'days', 365, 'last_edit', null, 'apply', array[]::text[]),
    ('agent_memory', 'postgres', true, 'days', 365, 'last_edit', null, 'apply', array[]::text[]),
    ('personal_memory', 'postgres', true, 'until', 365, 'last_edit', null, 'apply', array[]::text[]),
    ('ai_cost_records', 'postgres', true, 'days', 731, 'created', null, 'apply', array[]::text[]),
    ('transcription_test_set', 'postgres', true, 'until', 731, 'consent', null, 'apply', array[]::text[]),
    ('ai_feedback', 'postgres', true, 'days', 365, 'created', null, 'apply', array[]::text[]),
    ('people_inferences', 'postgres', true, 'days', 365, 'created', null, 'apply', array[]::text[])
$$;
revoke execute on function public.retention_class_defaults() from public;

-- C0.10 LH-09 (T23 item 5): the period an org's data of a class keeps now, in whole days from the
-- class's anchor, for the deletion code to compare with the stored anchor at use (CLAUDE.md,
-- Database: never a stored "delete after"). Until C2.9's settings exist it is the default; C2.9
-- replaces this function (same signature) to read its settings table first, so every caller moves
-- with it, which is why it takes the org already. A class with no day count (follows, while, until)
-- or an unknown key raises. Run by no role but its owner until C2.9 grants its sweep role.
create function public.retention_period_days(org uuid, class text) returns integer
language plpgsql stable set search_path = '' as $$
declare
  d integer;
begin
  select c.days into d from public.retention_class_defaults() c
  where c.key = retention_period_days.class and c.period_kind = 'days';
  if d is null then
    raise exception 'That retention class has no period in days.' using errcode = 'invalid_parameter_value';
  end if;
  return d;
end
$$;
revoke execute on function public.retention_period_days(uuid, text) from public;

-- C0.10 LH-19 (T23 item 11): a refused copy's hold (s22A; regulation 8 of the PDP Regulations
-- 2021): at least 30 days after the refusal, plus the margin for a review the PDPC tells the
-- organisation of late (LH-46). packages/shared REFUSED_COPY_HOLD equals these (check 7f).
create function public.refused_copy_hold() returns table (days integer, notice_margin_days integer)
language sql immutable set search_path = '' as $$ values (30, 14) $$;
revoke execute on function public.refused_copy_hold() from public;

-- C0.10 LH-10 (T23 item 7): why a deletion happened. A class's period ran out (retention); the DPO
-- acting on a request (request, REC-23); what it was made from went (cascade); a redaction
-- (REC-18); a person's own delete (user); the Trash's 30 days (trash); offboarding (a leaver's
-- personal memory, A4.4); a correction withdrew what was made from its source (correction, PRD-110);
-- a quarantine copy removed after promotion, re-encoding or a failed scan (upload, C0.15, LH-57). A
-- replay after a restore is not a cause: it re-logs the original cause with replayed set
-- (C010-SPEC-02). packages/shared DELETION_CAUSES lists the same (check 7f). A step adding a cause
-- replaces this with the same signature; the table's check holds only the shape, so no table change.
create function public.deletion_causes() returns setof text
language sql immutable set search_path = '' as $$
  values ('retention'), ('request'), ('cascade'), ('redaction'), ('user'), ('trash'), ('offboarding'),
         ('correction'), ('upload')
$$;
revoke execute on function public.deletion_causes() from public;

-- C0.10 LH-10, LH-57 (TECH-SPEC T23 item 7; PDPA-09: "every deletion is logged"): one row per
-- deleted entity, written in the deleting transaction by log_deletion(), so the row and the delete
-- commit together or not at all (lifecycle_guard() requires it). An entity is one row of its table
-- together with the rows that belong only to it and go with it: a request's steps, a provenance
-- item's sources. Ids and codes only: no actor, subject, name, filename, reason, reference or row
-- content (R11). Who caused a deletion is in its audit row: one per deletion action, or one per
-- sweep batch from C2.9. A case reference is upper case, which deletion_log_object refuses, so it
-- can't ride in object_id (PD-104). Ordered by (tx_id, id), so C0.17's shipper can copy it off the
-- database as it is written, below the horizon as the outbox's consumers read (T16 items 2 and 18).
-- No role holds a grant, and no reader exists in C0.10 (C2.9 counts, C0.17 replays, C6.1 shows the
-- DPO). No event: the log is itself the record.
create table public.deletion_log (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.orgs (id),
  -- The deleting transaction's top-level id (the column default, which no writer sets), so the
  -- guard can see that a row's deletion was logged in the transaction deleting it, and C0.17's
  -- shipper can read below the horizon as outbox consumers do (T16 item 2).
  tx_id xid8 not null default pg_catalog.pg_current_xact_id(),
  at timestamptz not null default now(),
  class_key text not null constraint deletion_log_class check (class_key ~ '^[a-z][a-z0-9_]{0,62}$'),
  -- The entity deleted: its table of public and its id, a uuid or a whole number (audit_events'
  -- ids are bigint, 0004), so C2.9 logs an audit row without changing this table.
  object_table text not null constraint deletion_log_table check (object_table ~ '^[a-z][a-z0-9_]{0,62}$'),
  object_id text not null constraint deletion_log_object check (object_id ~
    '^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[1-9][0-9]{0,18})$'),
  -- Why, from deletion_causes(), which log_deletion() checks: a shape here, so a new cause is a
  -- function replacement, never a table change (C010-SPEC-02).
  cause text not null constraint deletion_log_cause check (cause ~ '^[a-z][a-z0-9_]{0,62}$'),
  -- A replay after a restore (C0.17) re-logs the original cause and case with this set.
  replayed boolean not null default false,
  -- For 'request': the case it was done under, a plain id that outlives the case (T22 item 52).
  case_id uuid,
  -- For 'cascade': the log row of the deletion it followed from, a plain id.
  parent_id bigint,
  -- For an object in S3 (from C0.15): its data class and key, and when the server confirmed that
  -- every version and delete marker of that key is gone (CLAUDE.md, Database, S3). Set once.
  s3_class text constraint deletion_log_s3_class check (s3_class ~ '^[a-z][a-z0-9_]{0,62}$'),
  s3_key text,
  s3_done_at timestamptz,
  unique (org_id, id),
  -- One row per entity per transaction: the guard's lookup, and no double count.
  constraint deletion_log_entity unique (org_id, tx_id, object_table, object_id),
  constraint deletion_log_request check ((cause = 'request') = (case_id is not null)),
  constraint deletion_log_cascade check ((cause = 'cascade') = (parent_id is not null)),
  constraint deletion_log_s3 check ((s3_class is null) = (s3_key is null) and (s3_done_at is null or s3_key is not null)),
  -- A key is <org_id>/<random id>, or quarantine/<org_id>/<random id> before the malware scan
  -- promotes it (CLAUDE.md, Database, S3), made by the server; never a filename, and never another
  -- org's (DB-13, C010-SPEC-03).
  constraint deletion_log_s3_key check (s3_key ~ ('^(quarantine/)?' || org_id::text
    || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))
);
create index deletion_log_at on public.deletion_log (org_id, at);
create index deletion_log_cursor on public.deletion_log (org_id, tx_id, id);
create index deletion_log_unstamped on public.deletion_log (org_id, id) where s3_key is not null and s3_done_at is null;

-- C0.10 LH-10: the deletion log only grows, for every writer (the owner and a superuser too). Its
-- one change is an S3 deletion's stamp, set once on a row with a key (CLAUDE.md, Database: "the
-- server removes only those files and stamps the log row"). A row goes only once it is 731 days
-- old, the deletion_log class's fixed age: at least the 35-day backup window plus a restore, and as
-- long as the audit log by default (check 7c compares the interval below with the class). C2.9 adds
-- the purge of older rows, one audit row per batch, and check 8 records its exemption. The messages
-- can be shown as they are.
create function public.deletion_log_kept() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if old.s3_key is null or old.s3_done_at is not null or new.s3_done_at is null
       or (pg_catalog.to_jsonb(new) - 's3_done_at') is distinct from (pg_catalog.to_jsonb(old) - 's3_done_at') then
      raise exception 'The deletion log only grows; a row''s S3 deletion is stamped once.' using errcode = 'check_violation';
    end if;
    return new;
  end if;
  if old.at > pg_catalog.now() - interval '731 days' then
    raise exception 'The deletion log keeps each row for 731 days.' using errcode = 'check_violation';
  end if;
  return old;
end
$$;
revoke execute on function public.deletion_log_kept() from public;
create trigger deletion_log_kept before update or delete on public.deletion_log
  for each row execute function public.deletion_log_kept();

-- C0.10 LH-15 (TECH-SPEC T23 items 9 and 10; ADM-08): legal holds. A person, current or former
-- ("a former employee's included", BUILD-PLAN C0.10), and from each step that brings its table a
-- channel, a DM, a group DM, a room, a recorded session or a Drive item, is kept out of every
-- deletion while an active hold covers it. History: how a hold was placed never changes, and it is
-- released once (legal_holds_kept()). No target name or snapshot is stored: the person's row is the
-- target, and their name is the roster's. Several holds may cover one target (two matters), so
-- there is no uniqueness on the target. No role holds a grant: in C0.10 nothing writes it but the
-- tests, as the owner; from C1.11 every read and write goes through the definers T23 item 20
-- designs (place_legal_hold(), release_legal_hold(), read_legal_holds()), and no event ever carries
-- a hold (packages/shared FORBIDDEN_NAMESPACES, LH-17).
create table public.legal_holds (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id),
  -- One per placing sheet, unique per placer, so a resend after a lost answer makes no second hold
  -- (0012's pattern).
  client_key uuid not null,
  -- ADM-08's targets, named as packages/access names their kinds ('session' is C2.4's recorded
  -- room session, T14 item 17); packages/shared HOLD_TARGET_KINDS lists the same (check 7f). Only a
  -- person can be held when C1.11's writer arrives; each step that brings a kind's table lets the
  -- writer accept it and adds it to lifecycle_lock_target() and lifecycle_containers_of().
  target_kind text not null constraint legal_holds_target_kind check (target_kind in (
    'person', 'channel', 'dm', 'group_dm', 'room', 'session', 'folder', 'file')),
  target_id uuid not null,
  reason text not null,
  -- The case it was placed under (from C1.11, an investigation; or a request), a plain id: a hold's
  -- history outlives the case, and a foreign key would make a released hold keep its case (23503).
  -- While the hold is active, it holds that case (lifecycle_held()); C1.11's writer reads the case
  -- FOR KEY SHARE before it inserts, so a placement and the case's deletion take turns (DB-02).
  case_id uuid,
  placed_at timestamptz not null default now(),
  placed_by uuid not null,
  released_at timestamptz,
  released_by uuid,
  release_reason text,
  unique (org_id, id),
  constraint legal_holds_client_key unique (org_id, placed_by, client_key),
  constraint legal_holds_released check (num_nulls(released_at, released_by, release_reason) in (0, 3)),
  -- 0012's note rules: trimmed, 1 to 1,000 characters, line breaks kept, no other control
  -- character, no bidirectional-formatting character (as \u escapes, DB-04), no NRIC- or FIN-shaped
  -- string.
  constraint legal_holds_reason check (reason = btrim(reason) and length(reason) between 1 and 1000
    and translate(reason, E'\n', '') !~ '[[:cntrl:]]' and reason !~ '[\u202a-\u202e\u2066-\u2069]'
    and reason !~* '(^|[^a-z0-9])[stfgm][0-9]{7}[a-z]([^a-z0-9]|$)'),
  constraint legal_holds_release_reason check (release_reason is null or (
    release_reason = btrim(release_reason) and length(release_reason) between 1 and 1000
    and translate(release_reason, E'\n', '') !~ '[[:cntrl:]]'
    and release_reason !~ '[\u202a-\u202e\u2066-\u2069]'
    and release_reason !~* '(^|[^a-z0-9])[stfgm][0-9]{7}[a-z]([^a-z0-9]|$)')),
  foreign key (org_id, placed_by) references public.principals (org_id, id),
  foreign key (org_id, released_by) references public.principals (org_id, id)
);
-- What a hold decision reads: the org's active holds on a target, and on a case; and the console's
-- recent list (C1.11).
create index legal_holds_active on public.legal_holds (org_id, target_kind, target_id) where released_at is null;
create index legal_holds_active_case on public.legal_holds (org_id, case_id) where released_at is null and case_id is not null;
create index legal_holds_recent on public.legal_holds (org_id, placed_at desc, id);

-- Row level security: each table only within the org the server set (CLAUDE.md, Database). No role
-- holds a grant on either, so the policy is a second line that would bind any future grantee; the
-- functions below run as the tables' owner, which RLS doesn't bind, so each filters by the org it
-- was given or the server set itself.
do $$
declare
  t text;
begin
  foreach t in array array['deletion_log', 'legal_holds'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy org_isolation on public.%I
      using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
      with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid)$p$, t);
  end loop;
end
$$;

-- C0.10 LH-15: how a hold was placed is history, whoever writes (the owner and a superuser too), as
-- a request's receipt is (cases_fixed()). The only change is the release, once, all three columns
-- together (legal_holds_released holds them together). The message can be shown as it is.
create function public.legal_holds_kept() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.released_at is not null or new.released_at is null
     or (pg_catalog.to_jsonb(new) - array['released_at', 'released_by', 'release_reason'])
        is distinct from
        (pg_catalog.to_jsonb(old) - array['released_at', 'released_by', 'release_reason']) then
    raise exception 'A legal hold keeps how it was placed, and is released only once.' using errcode = 'check_violation';
  end if;
  return new;
end
$$;
revoke execute on function public.legal_holds_kept() from public;
create trigger legal_holds_kept before update on public.legal_holds
  for each row execute function public.legal_holds_kept();

-- The day a case records its days in, in the org's zone (0012). Run by no role but its owner.
create function public.lifecycle_today(org uuid) returns date
language sql stable set search_path = '' as $$
  select (pg_catalog.now() at time zone o.time_zone)::date from public.orgs o where o.id = org
$$;
revoke execute on function public.lifecycle_today(uuid) from public;

-- C0.10 LH-19, LH-20, LH-45 (TECH-SPEC T23 item 11; T22 item 54; PDPA-09): how long a case holds its
-- requester's data and itself: null when it holds nothing, infinity while it holds with no end, else
-- the last day it holds (inclusive, in the org's zone). Computed from raw values at every call, never
-- stored (CLAUDE.md, Database), and those values never change (cases_fixed(),
-- case_steps_unchanged()), so the hold can't be rewritten:
--   an open request for a copy or a correction, by its kind now, holds until it is closed: its data
--     mustn't go while it is being answered (LH-20, LH-45);
--   a refused copy (s22A, regulation 8 of the PDP Regulations 2021) holds with no end while a PDPC
--     review is open, else through the later of 30 days after the refusal plus the notice margin
--     (refused_copy_hold(), LH-46) and the day the last review ended. The refusal's day is day 0,
--     so "at least 30 days after the refusal" holds through closed_on + 30, and the margin through
--     closed_on + 44. A reconsideration or an appeal belongs to the open episode: the DPO records
--     "The PDPC review ended" only once the review, any reconsideration and any appeal have all
--     ended (HOLD-01); add_case_step() allows a new start after an end for a fresh application, and
--     the latest end then counts;
--   a refused correction or objection holds nothing once closed (s22A is about access), nor does an
--     open question, complaint, withdrawal or objection (a withdrawal asks Hearth to stop, so
--     holding for it would work against it).
-- packages/shared heldUntil() mirrors this (LCS-06 and db/tests/192 run one sample table through
-- both). Run by no role but its owner: only lifecycle_held() calls it.
create function public.case_hold_until(org uuid, the_case uuid) returns date
language sql stable set search_path = '' as $$
  select case
    when c.closed_at is null then
      case when public.case_kind_now(org, c.id) in ('access', 'correction') then 'infinity'::date end
    when c.outcome = 'refused' and c.closed_kind = 'access' then
      case when r.started > r.ended then 'infinity'::date
           else greatest(c.closed_on + h.days + h.notice_margin_days, r.last_ended) end
  end
  from public.cases c
  cross join public.refused_copy_hold() h
  cross join lateral (
    select pg_catalog.count(*) filter (where s.step = 'review_started') as started,
           pg_catalog.count(*) filter (where s.step = 'review_ended') as ended,
           pg_catalog.max(s.on_day) filter (where s.step = 'review_ended') as last_ended
    from public.case_steps s where s.org_id = org and s.case_id = c.id) r
  where c.org_id = org and c.id = the_case
$$;
revoke execute on function public.case_hold_until(uuid, uuid) from public;

-- C0.10 LH-18 (T23 item 12): the kinds is_held() and lifecycle_held() can judge. A row of sessions
-- is a signin_session, never a session, which is C2.4's recorded room session (T14 item 17).
-- packages/shared HOLD_KINDS lists the same (check 7f). PR 2 adds derived; each later step adds its
-- kinds (C1.1 message, channel, dm, group_dm; C2.4 room, session; C4.1 folder, file) by replacing
-- this with the same signature. Run by no role but its owner.
create function public.lifecycle_kinds() returns setof text
language sql immutable set search_path = '' as $$
  values ('person'), ('phone_number'), ('device'), ('signin_session'), ('passkey'), ('notice_acknowledgment'),
         ('case'), ('legal_hold'), ('data_access_event')
$$;
revoke execute on function public.lifecycle_kinds() from public;

-- C0.10 LH-18, LH-55: the people an item is about, for its holds, read from its row: a person
-- themselves; a number's person; a device's, sign-in session's or passkey's account (users are
-- keyed by their person, 0002); an acknowledgement's person; a case's requester, if linked; an
-- access-log row's subject, actor and the person acted for (lifecycle_held() keeps only people of
-- the org, so a principal that isn't a person drops out); a legal hold's target, when it is a person.
-- An item not in the org has none. A kind nobody taught it raises, failing closed: a caller can't
-- read "not held" for a kind nobody taught it (LH-18). Each later step replaces it with the same
-- signature, adding its kinds' authors, creators and owners by their stored creation context, so a
-- move or an ownership transfer never releases a hold (LH-55). Run by no role but its owner.
create function public.lifecycle_persons_of(org uuid, kind text, id uuid) returns uuid[]
language plpgsql stable set search_path = '' as $$
declare
  found_people uuid[];
begin
  if not exists (select 1 from public.lifecycle_kinds() k where k = lifecycle_persons_of.kind) then
    raise exception 'Hearth can''t tell yet whether that kind of record is held.' using errcode = 'invalid_parameter_value';
  end if;
  case lifecycle_persons_of.kind
    when 'person' then
      select array[p.id] into found_people from public.people p where p.org_id = org and p.id = lifecycle_persons_of.id;
    when 'phone_number' then
      select array[x.person_id] into found_people from public.phone_numbers x
      where x.org_id = org and x.id = lifecycle_persons_of.id;
    when 'device' then
      select array[x.user_id] into found_people from public.devices x where x.org_id = org and x.id = lifecycle_persons_of.id;
    when 'signin_session' then
      select array[x.user_id] into found_people from public.sessions x where x.org_id = org and x.id = lifecycle_persons_of.id;
    when 'passkey' then
      select array[x.user_id] into found_people from public.passkeys x where x.org_id = org and x.id = lifecycle_persons_of.id;
    when 'notice_acknowledgment' then
      select array[x.person_id] into found_people from public.notice_acknowledgments x
      where x.org_id = org and x.id = lifecycle_persons_of.id;
    when 'case' then
      select pg_catalog.array_remove(array[x.requester_person_id], null) into found_people from public.cases x
      where x.org_id = org and x.id = lifecycle_persons_of.id;
    when 'legal_hold' then
      select case when x.target_kind = 'person' then array[x.target_id] else '{}'::uuid[] end into found_people
      from public.legal_holds x where x.org_id = org and x.id = lifecycle_persons_of.id;
    when 'data_access_event' then
      select array(select distinct p from pg_catalog.unnest(array[x.subject_id, x.actor_id, x.on_behalf_of_id]) p
                   where p is not null order by p) into found_people
      from public.data_access_events x where x.org_id = org and x.id = lifecycle_persons_of.id;
  end case;
  return coalesce(found_people, '{}'::uuid[]);
end
$$;
revoke execute on function public.lifecycle_persons_of(uuid, text, uuid) from public;

-- C0.10 LH-56 (C010-SPEC-01): what an item sits inside, for holds placed on a container: every
-- level, nearest first. Nothing yet: C1.1 makes a message return its conversation (a channel, DM or
-- group DM), C2.4 a recorded session its room, C4.1 a file or folder its folder chain, each by
-- replacing this with the same signature and reading the item's stored creation context, so a move
-- never releases a hold; lifecycle_held() never changes. The output columns are named apart from
-- the parameters. Run by no role but its owner.
create function public.lifecycle_containers_of(org uuid, kind text, id uuid)
  returns table (container_kind text, container_id uuid)
language sql stable set search_path = '' as $$
  select null::text, null::uuid where false
$$;
revoke execute on function public.lifecycle_containers_of(uuid, text, uuid) from public;

-- C0.10 LH-56 (C010-SPEC-01): locks the row a hold can name, so holds and deletions about it take
-- turns: share for a hold decision's containers, no key update for C1.11's writer taking its target,
-- key share for its cited case (DB-02). Each strength is a fixed branch, never dynamic SQL. It knows
-- a person (the people row) and a case (the cases row); any other kind raises, failing closed, until
-- the step that brings its table adds it. A row that doesn't exist locks nothing. Run by no role but
-- its owner.
create function public.lifecycle_lock_target(org uuid, kind text, id uuid, strength text) returns void
language plpgsql volatile set search_path = '' as $$
begin
  if strength is null or strength not in ('share', 'no key update', 'key share') then
    raise exception 'Hearth doesn''t take that kind of lock.' using errcode = 'invalid_parameter_value';
  end if;
  if lifecycle_lock_target.kind = 'person' then
    if strength = 'share' then
      perform 1 from public.people p where p.org_id = org and p.id = lifecycle_lock_target.id for share;
    elsif strength = 'no key update' then
      perform 1 from public.people p where p.org_id = org and p.id = lifecycle_lock_target.id for no key update;
    else
      perform 1 from public.people p where p.org_id = org and p.id = lifecycle_lock_target.id for key share;
    end if;
  elsif lifecycle_lock_target.kind = 'case' then
    if strength = 'share' then
      perform 1 from public.cases c where c.org_id = org and c.id = lifecycle_lock_target.id for share;
    elsif strength = 'no key update' then
      perform 1 from public.cases c where c.org_id = org and c.id = lifecycle_lock_target.id for no key update;
    else
      perform 1 from public.cases c where c.org_id = org and c.id = lifecycle_lock_target.id for key share;
    end if;
  else
    raise exception 'Hearth can''t lock that kind of record yet.' using errcode = 'invalid_parameter_value';
  end if;
end
$$;
revoke execute on function public.lifecycle_lock_target(uuid, text, uuid, text) from public;

-- C0.10 LH-12 (T23 item 8): what the guard reads for a row being deleted (to_jsonb(old)): its hold
-- kind, its item's id and its people, for every table of a holds-apply class whether or not it is
-- guarded yet, so the guard needs no new code when C2.9 attaches it (check 7g calls this for each).
-- Exactly one row. A request's step anchors as its request (the guard itself decides a step only by
-- its request's log row, after the request has gone). An audit row's item is null (its id is a whole
-- number); its people are its actor, the person acted for, a target person, and the requester of
-- the case it names by target or by case_id (0004). Containers come from lifecycle_containers_of()
-- inside lifecycle_held(), never from here. Any other table raises. PR 2 adds provenance_items and
-- provenance_sources. Run by no role but its owner.
create function public.lifecycle_row_anchors(org uuid, tbl text, r jsonb)
  returns table (kind text, item uuid, persons uuid[])
language plpgsql stable set search_path = '' as $$
declare
  uuid_shape constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  target_case uuid;
  named_case uuid;
begin
  if tbl = 'phone_numbers' then
    return query select 'phone_number'::text, (r ->> 'id')::uuid,
                        pg_catalog.array_remove(array[(r ->> 'person_id')::uuid], null);
  elsif tbl = 'devices' then
    return query select 'device'::text, (r ->> 'id')::uuid, pg_catalog.array_remove(array[(r ->> 'user_id')::uuid], null);
  elsif tbl = 'sessions' then
    return query select 'signin_session'::text, (r ->> 'id')::uuid,
                        pg_catalog.array_remove(array[(r ->> 'user_id')::uuid], null);
  elsif tbl = 'passkeys' then
    return query select 'passkey'::text, (r ->> 'id')::uuid, pg_catalog.array_remove(array[(r ->> 'user_id')::uuid], null);
  elsif tbl = 'notice_acknowledgments' then
    return query select 'notice_acknowledgment'::text, (r ->> 'id')::uuid,
                        pg_catalog.array_remove(array[(r ->> 'person_id')::uuid], null);
  elsif tbl = 'cases' then
    return query select 'case'::text, (r ->> 'id')::uuid,
                        pg_catalog.array_remove(array[(r ->> 'requester_person_id')::uuid], null);
  elsif tbl = 'case_steps' then
    -- A step belongs only to its request and goes with it, so it anchors as that request.
    return query select 'case'::text, (r ->> 'case_id')::uuid,
                        pg_catalog.array_remove(array[(select c.requester_person_id from public.cases c
                                                      where c.org_id = org and c.id = (r ->> 'case_id')::uuid)], null);
  elsif tbl = 'legal_holds' then
    return query select 'legal_hold'::text, (r ->> 'id')::uuid,
                        case when r ->> 'target_kind' = 'person'
                             then pg_catalog.array_remove(array[(r ->> 'target_id')::uuid], null)
                             else '{}'::uuid[] end;
  elsif tbl = 'data_access_events' then
    return query select 'data_access_event'::text, (r ->> 'id')::uuid,
                        pg_catalog.array_remove(array[(r ->> 'subject_id')::uuid, (r ->> 'actor_id')::uuid,
                                                      (r ->> 'on_behalf_of_id')::uuid], null);
  elsif tbl = 'audit_events' then
    if r ->> 'target_type' = 'case' and pg_catalog.lower(r ->> 'target_id') ~ uuid_shape then
      select c.requester_person_id into target_case from public.cases c
      where c.org_id = org and c.id = (r ->> 'target_id')::uuid;
    end if;
    if r ->> 'case_id' is not null then
      select c.requester_person_id into named_case from public.cases c
      where c.org_id = org and c.id = (r ->> 'case_id')::uuid;
    end if;
    return query select 'audit_event'::text, null::uuid,
                        pg_catalog.array_remove(array[
                          (r ->> 'actor_id')::uuid, (r ->> 'on_behalf_of_id')::uuid,
                          case when r ->> 'target_type' = 'person' and pg_catalog.lower(r ->> 'target_id') ~ uuid_shape
                               then (r ->> 'target_id')::uuid end,
                          target_case, named_case], null);
  else
    raise exception 'lifecycle_row_anchors() has no anchors for that table.' using errcode = 'invalid_parameter_value';
  end if;
end
$$;
revoke execute on function public.lifecycle_row_anchors(uuid, text, jsonb) from public;

-- C0.10 LH-18, LH-50: the sources an item was made from, transitively, through derived-mode items
-- and live edges only. None yet: PR 2 replaces this with the closure over provenance_sources, so
-- lifecycle_held() never changes. Run by no role but its owner.
create function public.lifecycle_sources_of(org uuid, kind text, id uuid)
  returns table (source_kind text, source_id uuid)
language sql stable set search_path = '' as $$
  select null::text, null::uuid where false
$$;
revoke execute on function public.lifecycle_sources_of(uuid, text, uuid) from public;

-- C0.10 LH-18 to LH-21, LH-56 (TECH-SPEC T23 item 12): the one place a hold is decided. True when an
-- active legal hold covers an anchor person; or covers the item itself, any container it sits in, or
-- any source in its closure (by kind and id); or, for a legal hold, it is that hold, active (DB-08);
-- or, for a case, an active legal hold cites it; or a case of an anchor person holds them
-- (case_hold_until() today or later: an access-request hold); or, for a case, its own
-- case_hold_until() does. A source of a kind Hearth can't judge yet keeps the item (fail closed).
-- Locks first, in the lock order: the anchor people FOR NO KEY UPDATE, by id (only people of the
-- org count), so this takes turns with a request being sent or logged for them (submit_case() and
-- log_case() read the requester FOR SHARE; DB-01), with a hold being placed on them and with their
-- deactivation; then the item's containers FOR SHARE, in (kind, id) order, against a hold being
-- placed on one (LH-56); then their requests that hold or may come to, FOR SHARE, by id, and a case
-- itself, which a closure, reclassification or review step holds FOR NO KEY UPDATE. The reads come
-- in statements after the locks: in READ COMMITTED each statement of a VOLATILE function takes a new
-- snapshot, so each sees what committed while the locks waited. A release in progress reads as
-- still active (its update hasn't committed), so a deletion that meets one refuses, which fails safe
-- and needs no lock (R2). Only the deletion code's definers and the guard call it, as the owner; a
-- later migration replaces it only with review (LCG-03).
create function public.lifecycle_held(org uuid, persons uuid[], kind text, item uuid) returns boolean
language plpgsql volatile set search_path = '' as $$
declare
  anchors uuid[] := coalesce(persons, '{}'::uuid[]);
  today date := public.lifecycle_today(org);
  s record;
  ct record;
begin
  -- 1. The item's sources (PR 2; none in PR 1). Each source's people join the anchors.
  for s in select x.source_kind, x.source_id
           from public.lifecycle_sources_of(org, lifecycle_held.kind, lifecycle_held.item) x loop
    if not exists (select 1 from public.lifecycle_kinds() k where k = s.source_kind) then
      return true;
    end if;
    anchors := anchors || public.lifecycle_persons_of(org, s.source_kind, s.source_id);
  end loop;
  -- 2. Locks, in the lock order.
  anchors := array(select p.id from public.people p where p.org_id = org and p.id = any (anchors) order by p.id);
  perform 1 from public.people p where p.org_id = org and p.id = any (anchors) order by p.id for no key update;
  for ct in select x.container_kind, x.container_id
            from public.lifecycle_containers_of(org, lifecycle_held.kind, lifecycle_held.item) x
            order by x.container_kind, x.container_id loop
    perform public.lifecycle_lock_target(org, ct.container_kind, ct.container_id, 'share');
  end loop;
  perform 1 from public.cases c
  where c.org_id = org and c.requester_person_id = any (anchors)
    and (c.closed_at is null or (c.outcome = 'refused' and c.closed_kind = 'access'))
  order by c.id for share;
  if lifecycle_held.kind = 'case' then
    perform 1 from public.cases c where c.org_id = org and c.id = lifecycle_held.item for share;
  end if;
  -- 3. The reads, in statements after the locks.
  return exists (
      select 1 from public.legal_holds h
      where h.org_id = org and h.released_at is null
        and ((h.target_kind = 'person' and h.target_id = any (anchors))
             or (h.target_kind = lifecycle_held.kind and h.target_id = lifecycle_held.item)
             or (lifecycle_held.kind = 'case' and h.case_id = lifecycle_held.item)
             -- An active hold of any kind holds itself (DB-08).
             or (lifecycle_held.kind = 'legal_hold' and h.id = lifecycle_held.item)
             or exists (select 1 from public.lifecycle_containers_of(org, lifecycle_held.kind, lifecycle_held.item) x
                        where h.target_kind = x.container_kind and h.target_id = x.container_id)
             or exists (select 1 from public.lifecycle_sources_of(org, lifecycle_held.kind, lifecycle_held.item) x
                        where h.target_kind = x.source_kind and h.target_id = x.source_id)))
    or exists (select 1 from public.cases c
               where c.org_id = org and c.requester_person_id = any (anchors)
                 and public.case_hold_until(org, c.id) >= today)
    or (lifecycle_held.kind = 'case' and coalesce(public.case_hold_until(org, lifecycle_held.item) >= today, false));
end
$$;
revoke execute on function public.lifecycle_held(uuid, uuid[], text, uuid) from public;

-- C0.10 LH-18 (TECH-SPEC T23 item 12): the isHeld() of BUILD-PLAN and CLAUDE.md. Whether an item of
-- the org the server set (app.org_id; 42501 when none) is held, for the deletion code's definers to
-- ask inside their own transactions, after locking the item's people and before locking the item
-- (C1.2, C4.1). It refuses in a read-only transaction (25006), by its own first check, so no GET can
-- call it and the refusal never depends on whether a lock statement happens to run; and a kind
-- nobody taught it (22023). It answers one boolean: never which hold, why, until when, or a case
-- id. Granted to nobody, it is never an oracle a route could ask whether someone is held (R3); C1.2
-- grants it with its first runtime caller if that needs it directly, and C2.9 adds set-based forms
-- for its batches.
create function public.is_held(kind text, id uuid) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare
  org uuid;
begin
  if pg_catalog.current_setting('transaction_read_only') = 'on' then
    raise exception 'Whether something is held is asked only in the transaction that deletes it.'
      using errcode = 'read_only_sql_transaction';
  end if;
  org := nullif(pg_catalog.current_setting('app.org_id', true), '')::uuid;
  if org is null then
    raise exception 'No org is set for this transaction' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.lifecycle_kinds() k where k = is_held.kind) then
    raise exception 'Hearth can''t tell yet whether that kind of record is held.' using errcode = 'invalid_parameter_value';
  end if;
  return public.lifecycle_held(org, public.lifecycle_persons_of(org, is_held.kind, is_held.id), is_held.kind, is_held.id);
end
$$;
revoke execute on function public.is_held(text, uuid) from public;

-- C0.10 LH-10 (TECH-SPEC T23 item 7): logs one deletion, in the deleting transaction, for the org the
-- server set (app.org_id; 42501 when none), never one an argument names, so no future grantee can
-- log for another org (DB-06). The class must be one of retention_class_defaults() whose tables hold
-- the entity's table, or, for an object in S3, one whose store is s3; the cause one of
-- deletion_causes() (22023 otherwise): the writer validates them, never a check calling a function
-- later migrations replace. The table's checks hold the rest (a request's case, a cascade's parent,
-- the S3 trio and key). It takes no actor and checks none: only deletion functions that checked
-- their own call it. Returns the row's id (a cascade's children name it as their parent). Granted to
-- nobody; the deletion code runs it as the owner.
create function public.log_deletion(
  class_key text,
  object_table text,
  object_id text,
  cause text,
  the_case uuid,
  parent bigint,
  s3_class text,
  s3_key text,
  replayed boolean
) returns bigint
language plpgsql volatile security definer set search_path = '' as $$
declare
  org uuid := nullif(pg_catalog.current_setting('app.org_id', true), '')::uuid;
  logged bigint;
begin
  if org is null then
    raise exception 'No org is set for this transaction' using errcode = 'insufficient_privilege';
  end if;
  if log_deletion.replayed is null
     or not exists (select 1 from public.retention_class_defaults() c
                    where c.key = log_deletion.class_key
                      and (log_deletion.object_table = any (c.tables) or (c.store = 's3' and log_deletion.s3_key is not null)))
     or not exists (select 1 from public.deletion_causes() x where x = log_deletion.cause) then
    raise exception 'That deletion can''t be logged.' using errcode = 'invalid_parameter_value';
  end if;
  insert into public.deletion_log (org_id, class_key, object_table, object_id, cause, replayed, case_id, parent_id,
                                   s3_class, s3_key)
  values (org, log_deletion.class_key, log_deletion.object_table, log_deletion.object_id, log_deletion.cause,
          log_deletion.replayed, log_deletion.the_case, log_deletion.parent, log_deletion.s3_class, log_deletion.s3_key)
  returning deletion_log.id into logged;
  return logged;
end
$$;
revoke execute on function public.log_deletion(text, text, text, text, uuid, bigint, text, text, boolean) from public;

-- C0.10 LH-11, LH-12, LH-13, LH-25 (TECH-SPEC T23 item 8): the guard. A BEFORE DELETE row trigger,
-- for every role, the owner's and a superuser's DELETE included: a row goes only if its deletion is
-- logged in this transaction (a deletion_log row for its entity with this transaction's id; HF010
-- otherwise) and nothing holds it (lifecycle_held(); HF009 otherwise). It names its table by its
-- argument, never tg_table_name: a row trigger on a partitioned table is cloned onto each partition
-- and fires with the partition's name, while the clone keeps the argument (C010-SPEC-09), so C2.9's
-- first sweep of data_access_events' partitions needs no new guard code; check 7d holds each argument
-- to its table's name (its parent's, for a partition). It reads the org from the row, so a delete
-- with no app.org_id (the owner by hand) is still checked. SECURITY DEFINER, so it reads
-- deletion_log, cases and legal_holds whichever role deletes (a role with a future DELETE grant can
-- read none of them). It takes no acting user and skips can(): it decides only whether a delete
-- already under way may proceed, and writes nothing. A child goes only after its parent (LH-13): a
-- request's step only once the request is gone, and logged as the request's entity, so deleting
-- steps first can't end a hold before the request's own guard decided (PR 2's provenance sources
-- the same; PL/pgSQL resolves that branch's table only when it runs). The messages are fixed and
-- name no hold, and neither code reaches a person: no route maps either, and the deletion code
-- answers 'held' before it tries (LH-37). Enabled the default way (O), never ENABLE ALWAYS, so C0.11's
-- logical replication applies deletions the publisher already checked (LH-11).
create function public.lifecycle_guard() returns trigger
language plpgsql volatile security definer set search_path = '' as $$
declare
  r jsonb := pg_catalog.to_jsonb(old);
  org uuid := old.org_id;
  tbl text := tg_argv[0];
  logged_table text := tg_argv[0];
  logged_id text := r ->> 'id';
  a record;
begin
  if tbl = 'case_steps' then
    if exists (select 1 from public.cases c where c.org_id = org and c.id = (r ->> 'case_id')::uuid) then
      raise exception 'A step is deleted only with its request, after it.' using errcode = 'HF010';
    end if;
    logged_table := 'cases';
    logged_id := r ->> 'case_id';
  elsif tbl = 'provenance_sources' then
    if exists (select 1 from public.provenance_items p where p.org_id = org and p.id = (r ->> 'item')::uuid) then
      raise exception 'A source is deleted only with its item, after it.' using errcode = 'HF010';
    end if;
    logged_table := 'provenance_items';
    logged_id := r ->> 'item';
  end if;
  if not exists (select 1 from public.deletion_log d
                 where d.org_id = org and d.tx_id = pg_catalog.pg_current_xact_id()
                   and d.object_table = logged_table and d.object_id = logged_id) then
    raise exception 'Rows here are deleted only through Hearth''s deletion code, which logs each one.'
      using errcode = 'HF010';
  end if;
  if tbl in ('case_steps', 'provenance_sources') then
    return old;
  end if;
  select * into a from public.lifecycle_row_anchors(org, tbl, r);
  if public.lifecycle_held(org, a.persons, a.kind, a.item) then
    raise exception 'This record is kept for now, so it can''t be deleted.' using errcode = 'HF009';
  end if;
  return old;
end
$$;
revoke execute on function public.lifecycle_guard() from public;

-- C0.10 LH-11, LH-25: a row trigger doesn't fire on TRUNCATE, and only the owner holds TRUNCATE, so
-- without this the owner's credential could empty a guarded table or the log the guard depends on.
-- A plain TRUNCATE of a table another table references (cases) fails earlier, on Postgres's own
-- foreign-key check (0A000); TRUNCATE ... CASCADE reaches this (DB-03). The message can be shown as
-- it is.
create function public.lifecycle_no_truncate() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Rows here are deleted only through Hearth''s deletion code, never TRUNCATE.' using errcode = 'HF010';
end
$$;
revoke execute on function public.lifecycle_no_truncate() from public;
create trigger lifecycle_guard before delete on public.legal_holds
  for each row execute function public.lifecycle_guard('legal_holds');
create trigger lifecycle_no_truncate before truncate on public.legal_holds
  for each statement execute function public.lifecycle_no_truncate();
create trigger lifecycle_no_truncate before truncate on public.deletion_log
  for each statement execute function public.lifecycle_no_truncate();

-- C0.10 LH-22, LH-23 (TECH-SPEC T23 item 13; T22 items 52 and 62; T15 item 17): the only way a
-- request leaves, for Hearth's own retention (C2.9's sweep) and C0.17's replay of such a deletion.
-- Granted to nobody until C2.9 grants its job role. It acts as the org's Hearth principal only (as
-- the clean-up does, 0007), so its audit row names nobody, and it skips can(): it acts for no
-- person. The org is the one the server set (app.org_id), never an argument (DB-06). Locks: the
-- requester's person row FOR NO KEY UPDATE (so two deletions for one requester, a hold being placed
-- on them and a request being sent or logged for them take turns: submit_case() and log_case() read
-- it FOR SHARE), then the request FOR UPDATE (people → cases), against which a hold citing it, read
-- FOR KEY SHARE by its writer, takes turns (DB-02). It answers instead of refusing, so a sweep counts
-- each answer and never fails a batch on one: 'gone' (none, idempotent for a replay), 'open',
-- 'not_due' (closed_on plus the class's period not yet passed, in the org's zone, computed here
-- whatever a sweep selected: T15 item 17's "no worker bug can delete early"; a replay obeys it too,
-- since a request's only cause is retention), 'held', 'cited' (a processing restriction names it,
-- lifted or not; C2.11 decides whether a lifted one lets go) or 'deleted'. Only a retention deletion
-- exists for requests; a later cause is added here by replacement, with the same signature. The
-- request goes first, its guard deciding with every step present, then its steps, whose guard needs
-- the request gone and logged; the deferred key is checked at the commit (LH-13). One log row for
-- the request (its steps belong only to it) and one audit row, case.deleted, which read_audit_events()
-- returns only to a reader who holds dpo (OD-23). No outbox event (LH-23): requests are never indexed,
-- derived from or retrieved (T22 item 62), and C0.14's alert re-reads the case and passes over one
-- that is gone (T16 item 9). Nothing is derived from a case, so no cascade.
create function public.delete_case(the_case uuid, cause text, replay boolean) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  org uuid := nullif(pg_catalog.current_setting('app.org_id', true), '')::uuid;
  actor uuid := nullif(pg_catalog.current_setting('app.user_id', true), '')::uuid;
  requester uuid;
  c public.cases;
  steps integer;
begin
  if org is null or actor is null then
    raise exception 'No org or user is set for this transaction' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.principals p
                 where p.org_id = org and p.id = actor and p.kind = 'system' and p.system_key = 'hearth') then
    raise exception 'Only Hearth itself deletes a request; this transaction acts as someone else'
      using errcode = 'insufficient_privilege';
  end if;
  if delete_case.cause is distinct from 'retention' or delete_case.replay is null then
    raise exception 'A request is deleted only when its retention ends.' using errcode = 'invalid_parameter_value';
  end if;
  select x.requester_person_id into requester from public.cases x where x.org_id = org and x.id = delete_case.the_case;
  if not found then
    return 'gone';
  end if;
  if requester is not null then
    perform 1 from public.people p where p.org_id = org and p.id = requester for no key update;
  end if;
  select * into c from public.cases x where x.org_id = org and x.id = delete_case.the_case for update;
  if not found then
    return 'gone';
  elsif c.closed_at is null then
    return 'open';
  elsif public.lifecycle_today(org) <= c.closed_on + public.retention_period_days(org, 'cases') then
    return 'not_due';
  elsif public.lifecycle_held(org, pg_catalog.array_remove(array[requester], null), 'case', c.id) then
    return 'held';
  elsif exists (select 1 from public.processing_restrictions r where r.org_id = org and r.case_id = c.id) then
    return 'cited';
  end if;
  perform public.log_deletion('cases', 'cases', c.id::text, delete_case.cause, null, null, null, null, delete_case.replay);
  delete from public.cases x where x.org_id = org and x.id = c.id;
  delete from public.case_steps s where s.org_id = org and s.case_id = c.id;
  get diagnostics steps = row_count;
  insert into public.audit_events (org_id, actor_id, action, target_type, target_id, details)
  values (org, actor, 'case.deleted', 'case', c.id::text,
          pg_catalog.jsonb_build_object('class', 'cases', 'cause', delete_case.cause,
                                        'replayed', delete_case.replay, 'steps', steps));
  return 'deleted';
end
$$;
revoke execute on function public.delete_case(uuid, text, boolean) from public;

-- C0.9 OD-27 (accepted), PD-111; C0.10 LH-27, LH-49: no consumer reads an outbox event's actor
-- (readBatch() selects every column but actor_id and actor_kind since PR 3b), so neither consumer's
-- role may. Postgres doesn't narrow a table-wide grant by revoking a column (a column REVOKE leaves
-- the table's SELECT in place), so the table's SELECT goes and every other column is granted. A
-- column added to the outbox later is unreadable by both until a migration grants it, which fails
-- closed. actor_kind goes too: no consumer reads it, and for case.opened from the form it says a
-- person acted. OD-27 put this in "the first migration after PR 3b's worker is deployed"; nothing is
-- deployed anywhere, and C0a's first deploy ships PR 3b's worker and this migration together, so no
-- worker older than 3b ever runs against it (LH-49). A grant takes no lock on its table, so a
-- consumer round in progress reads on, and its next statement is checked against the new grants,
-- all of whose columns it selects.
revoke select on public.outbox_events from hearth_job_offboarding, hearth_job_revocation;
grant select (id, org_id, tx_id, at, type, version, entity_type, entity_id, container_type, container_id,
              acl_tokens, acl_more, index_class, acl_epoch, subject_ids, purpose, tombstone, ids)
  on public.outbox_events to hearth_job_offboarding, hearth_job_revocation;

-- C0.10 LH-24: the foreign key from a restriction to its request (processing_restrictions_case,
-- 0012) is checked on every request's deletion; this index makes that check, and delete_case()'s
-- own read, a lookup (T22 item 62: "with an index on processing_restrictions (org_id, case_id) if it
-- needs one"). Named apart from the constraint, so the two never read as one thing. The table has no
-- rows and no writer, so the build is free and its SHARE lock momentary.
create index processing_restrictions_by_case on public.processing_restrictions (org_id, case_id)
  where case_id is not null;

-- What each role may do (CLAUDE.md, Database; LH-30). No role gains anything: no grant on
-- deletion_log or legal_holds to anyone, and every new function, each with execute revoked from
-- PUBLIC beside it, is granted to nobody: retention_class_defaults, retention_period_days,
-- refused_copy_hold, deletion_causes, log_deletion, lifecycle_today, case_hold_until,
-- lifecycle_kinds, lifecycle_persons_of, lifecycle_containers_of, lifecycle_lock_target,
-- lifecycle_row_anchors, lifecycle_sources_of, lifecycle_held, is_held, delete_case, and the trigger
-- functions deletion_log_kept, legal_holds_kept, lifecycle_guard and lifecycle_no_truncate. C1.11
-- grants hearth_app its hold definers with its routes; C2.9's sweep role gets
-- retention_class_defaults(), retention_period_days(), delete_case() and its own set-based hold
-- functions; C1.2 and C4.1 call is_held() from their own definers. OD-27 narrows two job roles
-- (above).

-- The lock window (LH-31), last: the two tables live requests touch, locked without ever waiting
-- while one is held. Every request's submit and log inserts into cases, and every step inserts into
-- case_steps, so each attempt asks for both with NOWAIT in a block of its own: a busy table fails
-- the attempt, whose rollback lets go of what it took, and the next attempt follows 0.1 s later.
-- cases is taken SHARE ROW EXCLUSIVE (CREATE TRIGGER's mode, enough for the referential triggers'
-- rewrite, which only cases' deletes and key updates fire), which lets the DPO's reads and FOR SHARE
-- reads through; case_steps ACCESS EXCLUSIVE, which ALTER CONSTRAINT takes. Both are held until the
-- commit. After 100 attempts (about 10 s, the migrator's lock_timeout) it fails with 55P03, and the
-- migrate step is run again (0012's loop). A request that arrives meanwhile waits at most its own
-- 2 s lock_timeout and answers 409 try_again.
do $$
begin
  for attempt in 1..100 loop
    begin
      lock table public.cases in share row exclusive mode nowait;
      lock table public.case_steps in access exclusive mode nowait;
      return;
    exception when lock_not_available then
      perform pg_catalog.pg_sleep(0.1);
    end;
  end loop;
  raise exception 'cases and case_steps stayed in use for 10 s. Run the migrate step again.'
    using errcode = 'lock_not_available';
end
$$;

-- The guard on the requests (LH-12), each naming its own table.
create trigger lifecycle_guard before delete on public.cases
  for each row execute function public.lifecycle_guard('cases');
create trigger lifecycle_no_truncate before truncate on public.cases
  for each statement execute function public.lifecycle_no_truncate();
create trigger lifecycle_guard before delete on public.case_steps
  for each row execute function public.lifecycle_guard('case_steps');
create trigger lifecycle_no_truncate before truncate on public.case_steps
  for each statement execute function public.lifecycle_no_truncate();

-- Children after parents (LH-13): case_steps' key to cases (0012) has no action, so as written it
-- refuses a request deleted before its steps. The guard needs the request first, so the key is
-- checked at the commit: delete_case() deletes the request, whose guard decides with every step
-- present, then the steps, whose guard requires the request gone and logged. Every insert path
-- locks its request first (add_case_step()), so a deferred check changes no answer for inserts. A
-- writable CTE that deletes both in one statement is order-independent too: either the request went
-- first and its guard saw every step, or a step's guard finds the request still there and refuses.
-- This migration's last statement, under the lock taken above.
alter table public.case_steps alter constraint case_steps_org_id_case_id_fkey deferrable initially deferred;
