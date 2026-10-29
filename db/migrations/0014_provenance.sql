-- C0.10 PR 2 (TECH-SPEC T23 items 14 and 18): the provenance registry and its cascade (BRAIN-08,
-- Rules 3 and 7, PDPA-07, PDPA-09, PRD-110; BUILD-PLAN C0.10, INF-PROV; LH-39 to LH-43, LH-50).
--
-- What it adds: the tables provenance_items and provenance_sources; their triggers, each of which only
-- refuses: the plain provenance_items_insert(), provenance_items_state(), provenance_sources_insert()
-- and provenance_sources_fixed(), and the deferred provenance_items_complete(), a definer because
-- Postgres 17 fires a deferred trigger at the commit as whichever role is active then; the guard
-- on both, 0013's lifecycle_guard('<table>') and lifecycle_no_truncate(), unchanged; the plain helpers
-- provenance_dependants() and provenance_lock_ahead(), which no role may run; and the definers
-- withdraw_dependants(), provenance_mark_stale(), lifecycle_cascade() and provenance_forget(), which
-- no role may run either until the step that calls each (C1.1, C1.2, C2.9, C2.11, C3.5, C4.1, C4.3,
-- C4.4, A2.3), and each of which reads the org from app.org_id, never from an argument (DB-06).
--
-- What it replaces, each with its signature, as 0013 foresaw (T23 item 12: every later kind plugs in
-- by replacement): retention_class_defaults() (the two tables move into the provenance class),
-- lifecycle_kinds() (gaining derived), lifecycle_persons_of() (a derived item is about nobody itself),
-- lifecycle_row_anchors() (the two tables; an item with its own kind's people, when Hearth knows the
-- kind) and lifecycle_sources_of() (the closure over live edges through derived-mode items).
-- lifecycle_held(), is_held(), log_deletion() and the guard's functions don't change (LCG-03).
--
-- What it leaves alone: every existing table and row; every grant (no role gains anything); the
-- outbox's types (no event: no producer or consumer of a derived kind exists, T23 item 14); the
-- notice, registers and flags.
--
-- No producer exists before C1.2 (drafts, cited), C3.5 (suggested tasks), C4.3 and C4.4 (cited) and
-- A2.3 (derived items), so nothing writes these tables at run time in C0; the DB tests and CI's checks
-- write made-up rows as the owner or the superuser (LH-43). The cascade and provenance_forget()'s
-- leftover path delete only items of kind derived, which have no content of their own before A2.3; a
-- derived-mode item of any other kind (C3.5's suggested tasks) stays withdrawn and kept until the step
-- that stores its content replaces both, with the same signatures, to delete it with its record, and
-- replaces provenance_sources_insert() too, so an edge naming that kind refuses a kept item and a
-- deleted one alike (T23 item 14's producers' contract). A deleted source's edges are marked gone; a
-- source redacted or corrected in place keeps them live.
--
-- The lock order (CLAUDE.md, Database), with this step's two slots: ... → cases → legal_holds →
-- provenance_items → provenance_sources → processing_register → ... (LH-21). The cascade, a withdrawal
-- and provenance_forget() lock ahead (provenance_lock_ahead()) with the hold decision's own steps for
-- everything they touch: the anchor people FOR NO KEY UPDATE in id order, the items' containers FOR
-- SHARE, the people's open and refused requests FOR SHARE, then the items FOR UPDATE in id order, so
-- lifecycle_held()'s locks are re-locks; edges change only after their items. A derive that commits
-- during the lock-ahead is found by its next round, whose people come after provenance_items (DB-11),
-- a deadlock there answering 409 try_again. A producer (from C1.2) takes the provenance records it
-- touches one at a time in id order, as the lock-ahead does, and a correction, redaction or hide takes
-- its source's row FOR UPDATE before it withdraws, so a producer's FOR KEY SHARE read of it waits
-- (T23 item 14).
--
-- The locks 0014 takes: SHARE ROW EXCLUSIVE on orgs and principals for the new tables' foreign keys
-- (nothing writes either at run time in C0, the bootstrap's set-up aside), as 0013's did. Replacing a
-- function takes no table lock, and no runtime role can run any function it replaces. Nothing is
-- locked on a table a request writes, so it needs no lock window.
--
-- Every message a function raises is fixed text, never an input (C0.9 RQD-14's rule).

-- C0.10 LH-39 (TECH-SPEC T23 item 14; BRAIN-08): one row per item made from or citing others. Ids,
-- codes and the stored ACL row only, never content: a derived item's text, vector or fields live in
-- its kind's own table (A2, A3), keyed by item_id.
--   derived: made from its sources. Withdrawn when any source is deleted, redacted or corrected
--     (Rule 7, PRD-110), held while any source is held (LH-50), and, for item kind derived, read only
--     by people who can read every source (Rule 3; packages/access readers.ts); another derived-mode
--     kind keeps its own access rule (a suggested task its owner's, Rule 5).
--   cited: drew on its sources but is its own content (accepted AI text, a draft, a slide copy kept
--     with a session, a task made from a message). Never withdrawn, held or narrowed by them; the
--     record stays for "sources" (AMB-06, DOC-09), and may gain sources later (LH-40).
-- No role holds a grant: producers write through their own checked definers (LH-43).
create table public.provenance_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id),
  -- The transaction that made it, the database's (provenance_items_insert() refuses any other): a
  -- derived item's edges are written only in this transaction (LH-40).
  created_tx xid8 not null default pg_catalog.pg_current_xact_id(),
  -- The item that has provenance, as packages/access names kinds: a derived item ('derived'), or a
  -- draft, a suggested task, a slide copy, a document version (later steps). A request is never an
  -- item (RQS-11), nor a legal hold (holds are confidential, T23 item 10).
  item_kind text not null constraint provenance_items_kind check (
    item_kind ~ '^[a-z][a-z0-9_]{0,62}$' and item_kind not in ('case', 'legal_hold')),
  item_id uuid not null,
  mode text not null constraint provenance_items_mode check (mode in ('derived', 'cited')),
  state text not null default 'live' constraint provenance_items_state check (state in ('live', 'stale', 'withdrawn')),
  stale_since timestamptz,
  stale_reason text constraint provenance_items_stale_reason check (stale_reason in ('source_edited', 'source_acl_changed')),
  withdrawn_at timestamptz,
  -- A correction withdraws too (PRD-110: "deletions, redactions and corrections withdraw or
  -- regenerate within 5 minutes"; PDPA-07).
  withdrawn_reason text constraint provenance_items_withdrawn_reason check (
    withdrawn_reason in ('source_deleted', 'source_redacted', 'source_corrected')),
  -- The prompt, model and pipeline version an AI result came from (B.5, PDPA-08): an A-stage seam no
  -- C-stage writer sets.
  fingerprint text constraint provenance_items_fingerprint check (fingerprint ~ '^[a-z0-9][a-z0-9._:-]{0,127}$'),
  -- A derived item's number of sources, fixed when it is made: every one is recorded in its creating
  -- transaction (provenance_items_complete()), so a reader that loaded fewer edges than this reads the
  -- item as nobody's rather than as the wider intersection of fewer sources (derivedFacts()).
  source_count smallint constraint provenance_items_source_count check (source_count between 1 and 100),
  -- aclOf's row for a derived item at write time (packages/access lists.ts), in the outbox's shape and
  -- token shapes (0007) and the shape sqlReadableBy() reads (packages/access sql.ts), so a C1.7 or A2
  -- pre-filter can select derived items, then re-check each with filterReadable and indexClassOf,
  -- never trusting the stored row alone. Null for a cited item, whose readers are its holder's.
  acl_tokens text[],
  acl_more jsonb,
  index_class text constraint provenance_items_index_class check (
    index_class in ('normal', 'dm', 'agent_dm', 'personal', 'playback_only', 'restricted')),
  acl_epoch bigint constraint provenance_items_acl_epoch check (acl_epoch >= 0),
  created_at timestamptz not null default now(),
  created_by uuid not null,
  -- For C4.3's and C4.4's composite keys.
  unique (org_id, id),
  constraint provenance_items_item unique (org_id, item_kind, item_id),
  constraint provenance_items_derived_kind check (item_kind <> 'derived' or mode = 'derived'),
  constraint provenance_items_cited_live check (mode = 'derived' or state = 'live'),
  -- A derived item carries its count and a whole ACL row; a cited item neither.
  constraint provenance_items_derived_shape check (
    case mode when 'derived' then source_count is not null and acl_tokens is not null and acl_more is not null
                                  and index_class is not null and acl_epoch is not null
              else pg_catalog.num_nulls(source_count, acl_tokens, acl_more, index_class, acl_epoch) = 5 end),
  -- Its tokens are the ones @hearth/access makes, nothing else (0007's outbox_events_acl_tokens and
  -- outbox_events_acl_more, word for word).
  constraint provenance_items_acl_tokens check (
    pg_catalog.array_position(acl_tokens, null) is null
    and not pg_catalog.jsonb_path_exists(pg_catalog.to_jsonb(acl_tokens), 'strict $[*] ? (!(
          @.type() == "string" && @ like_regex "^(o|t|ta|m|e|p):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"))')),
  constraint provenance_items_acl_more check (
    acl_more is null
    or (pg_catalog.jsonb_typeof(acl_more) = 'array'
        and not pg_catalog.jsonb_path_exists(acl_more, 'strict $[*] ? (@.type() != "array")', '{}', true)
        and not pg_catalog.jsonb_path_exists(acl_more, 'strict $[*] ? (@.type() == "array")[*] ? (!(
              @.type() == "string" && @ like_regex "^(o|t|ta|m|e|p):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"))', '{}', true))),
  -- Stale since a time, with its reason, exactly while stale (a withdrawn item keeps what it had).
  constraint provenance_items_stale check (
    (stale_since is null) = (stale_reason is null)
    and (state <> 'live' or stale_since is null) and (state <> 'stale' or stale_since is not null)),
  constraint provenance_items_withdrawn check (
    (withdrawn_at is null) = (withdrawn_reason is null) and (state = 'withdrawn') = (withdrawn_at is not null)),
  -- Withdrawn means nobody's: the stored row a SQL pre-filter reads selects no one (an empty first
  -- clause meets no key; sql.ts), so no pre-filter shows it before the cascade or C2.9 deletes it.
  constraint provenance_items_withdrawn_nobody check (
    withdrawn_at is null or (acl_tokens = '{}' and acl_more = '[]'::jsonb)),
  foreign key (org_id, created_by) references public.principals (org_id, id)
);

-- C0.10 LH-39 (TECH-SPEC T23 item 14): an item's sources, polymorphic (a kind and an id), so no key
-- reaches them: their tables mostly don't exist yet, and the deletion code finds what was made from a
-- source by provenance_sources_source, always within the org. A derived source names the derived
-- item's item_kind and item_id, so the walks join it to its own provenance_items row. An edge is one
-- entity with its item: it goes only with it, after it, logged as its item (lifecycle_guard(); T23
-- item 7). No role holds a grant.
create table public.provenance_sources (
  org_id uuid not null references public.orgs (id),
  item uuid not null,
  -- 1 to 100, each the next of its item's (provenance_sources_insert()), as the outbox's id lists
  -- (T16 item 15); a digest of more is made in pieces.
  number smallint not null constraint provenance_sources_number check (number between 1 and 100),
  -- A request is never a source (RQS-11), nor a legal hold (T23 item 10).
  source_kind text not null constraint provenance_sources_kind check (
    source_kind ~ '^[a-z][a-z0-9_]{0,62}$' and source_kind not in ('case', 'legal_hold')),
  source_id uuid not null,
  -- The version of the source it was made from, so "changed since" is computable (PRD-44, PRD-110):
  -- a snapshot's uuid, a revision's whole number or a dotted code, never a name.
  source_version text constraint provenance_sources_version check (
    source_version ~ '^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9]{1,18}|[a-z][a-z0-9_]*(\.[a-z0-9_]+)*)$'
    and pg_catalog.length(source_version) < 64),
  -- Where in the source (a block id, a range, a span), ids and numbers only (is_ids_only(): a number
  -- is a whole number up to 1,000,000, so a span is in seconds or segment numbers, never milliseconds).
  anchor jsonb constraint provenance_sources_anchor check (anchor is null or public.is_ids_only(anchor)),
  -- When the source was deleted, set once by the cascade or provenance_forget(): a gone edge no longer
  -- counts for holds, staleness or the walks, and the access core reads its item as nobody's. A source
  -- redacted or corrected in place stays, and so does its edge, so a hold on it still keeps what was
  -- made from it (LH-50).
  gone_at timestamptz,
  primary key (org_id, item, number),
  constraint provenance_sources_once unique (org_id, item, source_kind, source_id),
  -- Deferred, so the deletion code deletes an item first, whose guard decides with its edges present,
  -- then its edges, as a request's steps follow it (LH-13).
  foreign key (org_id, item) references public.provenance_items (org_id, id) deferrable initially deferred
);
-- By source, gone edges included: the walks from a source to what was made from it read its live
-- edges through it (gone_at a filter), and provenance_items_insert() its every edge, gone ones too,
-- so a partial index (where gone_at is null) couldn't serve that check, which would scan every edge.
create index provenance_sources_source on public.provenance_sources (org_id, source_kind, source_id);

-- Row level security: each table only within the org the server set (CLAUDE.md, Database). No role
-- holds a grant on either, so the policy is a second line binding any future grantee; the functions
-- below run as the owner, which RLS doesn't bind, so each filters by the org it read itself.
do $$
declare
  t text;
begin
  foreach t in array array['provenance_items', 'provenance_sources'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy org_isolation on public.%I
      using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
      with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid)$p$, t);
  end loop;
end
$$;

-- C0.10 LH-40 (T23 item 14): an item takes its transaction from the database and starts live, for
-- every writer, so no writer can choose an earlier transaction to add edges to a derived item later
-- (as deletion_log_kept() does for the log's tx_id, GUARD-01); and a derived item can't be made for
-- something already used as a source, a gone edge included (provenance_sources_source serves the
-- check). With the edge trigger below, that keeps derived provenance acyclic one transaction at a
-- time; two producers writing at once rely on the producers' contract (LH-43), each reading its
-- sources live before it writes, and the walks' UNION and the access core's cycle rule are the
-- backstops for a cycle a producer breaking it left (T23 item 20's residuals). A cited item may get
-- its record after it was cited. The messages can be shown as they are.
create function public.provenance_items_insert() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.created_tx is distinct from pg_catalog.pg_current_xact_id() then
    raise exception 'A provenance item takes its transaction from the database.' using errcode = 'check_violation';
  end if;
  if new.state is distinct from 'live' or new.stale_since is not null or new.withdrawn_at is not null then
    raise exception 'A provenance item starts live.' using errcode = 'check_violation';
  end if;
  if new.mode = 'derived' and exists (
       select 1 from public.provenance_sources e
       where e.org_id = new.org_id and e.source_kind = new.item_kind and e.source_id = new.item_id) then
    raise exception 'A derived item''s sources are recorded when it is made, before anything is made from it.'
      using errcode = 'check_violation';
  end if;
  return new;
end
$$;
revoke execute on function public.provenance_items_insert() from public;
create trigger provenance_items_insert before insert on public.provenance_items
  for each row execute function public.provenance_items_insert();

-- C0.10 LH-39, LH-42 (T23 item 14): for every writer, an item keeps what it is, what it was made from
-- (its count), who made it and when; its state moves only live to stale, stale to stale, live or
-- stale to withdrawn, and stale back to live (a regeneration from the same sources, A2's, which alone
-- may set a new fingerprint); withdrawn is final; the ACL row changes only with acl_epoch rising (the
-- re-ACL job, or a withdrawal, which makes it nobody's: provenance_items_withdrawn_nobody), and the
-- epoch never falls; staleness is set going stale and cleared coming back.
create function public.provenance_items_state() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.state = 'withdrawn' then
    raise exception 'A withdrawn item is final.' using errcode = 'check_violation';
  end if;
  if (new.id, new.org_id, new.created_tx, new.item_kind, new.item_id, new.mode, new.source_count, new.created_at,
      new.created_by)
     is distinct from
     (old.id, old.org_id, old.created_tx, old.item_kind, old.item_id, old.mode, old.source_count, old.created_at,
      old.created_by) then
    raise exception 'A provenance item keeps what it is, what it was made from, who made it and when.'
      using errcode = 'check_violation';
  end if;
  if (old.state, new.state) not in (('live', 'live'), ('live', 'stale'), ('stale', 'stale'), ('stale', 'live'),
                                    ('live', 'withdrawn'), ('stale', 'withdrawn')) then
    raise exception 'A provenance item moves only from live to stale, from live or stale to withdrawn, and from stale back to live.'
      using errcode = 'check_violation';
  end if;
  if new.acl_epoch < old.acl_epoch
     or (((new.acl_tokens, new.acl_more, new.index_class) is distinct from (old.acl_tokens, old.acl_more, old.index_class)
          or new.state = 'withdrawn')
         and not coalesce(new.acl_epoch > old.acl_epoch, false)) then
    raise exception 'A derived item''s access row changes only with a new epoch.' using errcode = 'check_violation';
  end if;
  if new.fingerprint is distinct from old.fingerprint and not (old.state = 'stale' and new.state = 'live') then
    raise exception 'A provenance item''s fingerprint changes only when it is made again from the same sources.'
      using errcode = 'check_violation';
  end if;
  if (new.stale_since, new.stale_reason) is distinct from (old.stale_since, old.stale_reason)
     and (old.state, new.state) not in (('live', 'stale'), ('stale', 'live')) then
    raise exception 'A provenance item''s staleness changes only as it goes stale or is made again.'
      using errcode = 'check_violation';
  end if;
  return new;
end
$$;
revoke execute on function public.provenance_items_state() from public;
create trigger provenance_items_state before update on public.provenance_items
  for each row execute function public.provenance_items_state();

-- C0.10 LH-40, LH-43 (T23 item 14): checked at the commit of the transaction that made a derived item
-- (deferred), every one of its source_count sources is recorded, numbered 1 to source_count (the
-- insert trigger keeps them in order and refuses one numbered above the count, so a writer that fires
-- this check early with SET CONSTRAINTS can't add one after it). A derived item's edges are written
-- only in that transaction and go only with it, so its count then holds for as long as it exists. An
-- item deleted in the same transaction is passed over. A definer, unlike the tables' other triggers:
-- Postgres 17 fires a deferred trigger at the commit as whichever role is active then (hearth_app, or
-- a job role), not the owner whose checked writer made the item, and no runtime role holds a grant on
-- either table. It reads the org from the item it checks, as lifecycle_guard() reads the deleted
-- row's (db/tests/190's DB-06 names both), takes no acting user and writes nothing. The message can be
-- shown as it is.
create function public.provenance_items_complete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.mode = 'derived'
     and exists (select 1 from public.provenance_items p where p.org_id = new.org_id and p.id = new.id)
     and (select pg_catalog.count(*) from public.provenance_sources e where e.org_id = new.org_id and e.item = new.id)
         is distinct from new.source_count::bigint then
    raise exception 'A derived item''s sources are all recorded when it is made.' using errcode = 'check_violation';
  end if;
  return null;
end
$$;
revoke execute on function public.provenance_items_complete() from public;
create constraint trigger provenance_items_complete after insert on public.provenance_items
  deferrable initially deferred for each row execute function public.provenance_items_complete();

-- C0.10 LH-40 (T23 item 14), for every writer: an edge comes after its item, takes its item's next
-- number, and, for a derived item, is numbered no higher than its source_count (so the count holds
-- however the deferred check is set), is written only in the item's own transaction and never names
-- a derived item made in this transaction (the item itself included), so every derived edge a
-- transaction writes points to a record that existed before its item: no one writer can close a
-- derived cycle. Two writers at once rely on the producers' contract (LH-43), with the walks' UNION
-- and the access core's cycle rule as backstops (T23 item 20's residuals). Any edge's source, if it
-- has a record of its own, is read FOR SHARE (a withdrawal holds it FOR UPDATE, so this waits for one
-- in progress and then sees it; CLAUDE.md: a refusal because a row has ended reads it FOR SHARE).
-- A withdrawn source and a source of kind derived with no record are refused alike, by one statement
-- with one message and SQLSTATE, since a hold may keep a withdrawn item that would otherwise be gone,
-- and a kept item must look like a deleted one (T23 items 10 and 14, LH-55). Kind derived is the only
-- kind whose withdrawn records are deleted here; the step that first deletes another derived-mode
-- kind's records replaces this function, with the same signature, to refuse that kind's deleted and
-- hidden items in the same statement (T23 item 14's producers' contract). A cited item may gain sources
-- in a later transaction (a second AI insert into one draft). The messages can be shown as they are.
create function public.provenance_sources_insert() returns trigger
language plpgsql volatile set search_path = '' as $$
declare
  it record;
  source_state text;
begin
  select p.mode, p.created_tx, p.source_count into it
  from public.provenance_items p where p.org_id = new.org_id and p.id = new.item;
  if not found then
    raise exception 'A source is recorded with its item, after it.' using errcode = 'check_violation';
  end if;
  if new.number is distinct from (select coalesce(pg_catalog.max(e.number), 0) + 1
                                  from public.provenance_sources e where e.org_id = new.org_id and e.item = new.item) then
    raise exception 'A source takes the next number of its item.' using errcode = 'check_violation';
  end if;
  if it.mode = 'derived' then
    if it.created_tx is distinct from pg_catalog.pg_current_xact_id() then
      raise exception 'A derived item''s sources are recorded when it is made, never later.' using errcode = 'check_violation';
    end if;
    if new.number > it.source_count then
      raise exception 'A derived item has only as many sources as it was made with.' using errcode = 'check_violation';
    end if;
    if exists (select 1 from public.provenance_items s
               where s.org_id = new.org_id and s.item_kind = new.source_kind and s.item_id = new.source_id
                 and s.mode = 'derived' and s.created_tx = pg_catalog.pg_current_xact_id()) then
      raise exception 'A derived item can be made only from items that existed before it.' using errcode = 'check_violation';
    end if;
  end if;
  select s.state into source_state from public.provenance_items s
  where s.org_id = new.org_id and s.item_kind = new.source_kind and s.item_id = new.source_id
  for share;
  if source_state = 'withdrawn' or (source_state is null and new.source_kind = 'derived') then
    raise exception 'That item is no longer available to be a source.' using errcode = 'check_violation';
  end if;
  return new;
end
$$;
revoke execute on function public.provenance_sources_insert() from public;
create trigger provenance_sources_insert before insert on public.provenance_sources
  for each row execute function public.provenance_sources_insert();

-- C0.10 LH-39: an edge never changes, but its gone_at, set once, from null, by the cascade.
create function public.provenance_sources_fixed() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.gone_at is not null or new.gone_at is null
     or (pg_catalog.to_jsonb(new) - 'gone_at') is distinct from (pg_catalog.to_jsonb(old) - 'gone_at') then
    raise exception 'A source is marked gone once, and otherwise never changes.' using errcode = 'check_violation';
  end if;
  return new;
end
$$;
revoke execute on function public.provenance_sources_fixed() from public;
create trigger provenance_sources_fixed before update on public.provenance_sources
  for each row execute function public.provenance_sources_fixed();

-- The guard (LH-12; T23 item 8), each trigger naming its own table, the default way (enabled O). 0013's
-- lifecycle_guard() already decides a source only by its item's log row, once its item has gone, and
-- anchors an item through lifecycle_row_anchors() (replaced below). The tables are new and empty, so
-- creating the triggers takes no lock anyone waits on.
create trigger lifecycle_guard before delete on public.provenance_items
  for each row execute function public.lifecycle_guard('provenance_items');
create trigger lifecycle_no_truncate before truncate on public.provenance_items
  for each statement execute function public.lifecycle_no_truncate();
create trigger lifecycle_guard before delete on public.provenance_sources
  for each row execute function public.lifecycle_guard('provenance_sources');
create trigger lifecycle_no_truncate before truncate on public.provenance_sources
  for each statement execute function public.lifecycle_no_truncate();

-- C0.10 LH-03, LH-04, LH-39 (TECH-SPEC T23 items 2 and 14): 0013's registry, with provenance_items
-- and provenance_sources in the provenance class (so log_deletion() logs their rows under it, and
-- check 7b finds every table in one class). Same signature; the comment above 0013's version holds.
create or replace function public.retention_class_defaults()
  returns table (key text, store text, ai boolean, period_kind text, days integer, anchor text, follows text,
                 holds text, tables text[], objects boolean)
language sql immutable set search_path = '' as $$
  values
    -- C0's own data: every table of public, the migrator's ledger aside.
    ('org_settings', 'postgres', false, 'while', null, null, null, 'kept', array['orgs', 'audit_log_readers'], false),
    ('roster', 'postgres', false, 'while', null, null, null, 'kept',
     array['principals', 'people', 'users', 'departments', 'teams', 'team_memberships', 'role_assignments', 'profiles'], false),
    -- Replaced whole by the person's own edit (exempt, LH-48); a leaver's go with C2.9's profile
    -- reduction, deletion code that asks lifecycle_held() and skips a held person (LH-58).
    ('working_hours', 'postgres', false, 'until', null, null, null, 'exempt', array['working_hours'], false),
    ('sign_in_records', 'postgres', false, 'days', 731, 'ended', null, 'apply',
     array['phone_numbers', 'devices', 'sessions', 'passkeys'], false),
    ('acknowledgements', 'postgres', false, 'while', null, null, null, 'apply', array['notice_acknowledgments'], false),
    ('audit_log', 'postgres', false, 'days', 731, 'at', null, 'apply', array['audit_events'], false),
    ('access_log', 'postgres', false, 'days', 731, 'at', null, 'apply', array['data_access_events'], false),
    -- The clean-up's (0007; T15 item 17): ages fixed in purge_outbox(), purge_jobs() and
    -- purge_schedule_runs(), exempt from holds (T16 item 6, LH-26).
    ('outbox', 'postgres', false, 'days', 14, 'at', null, 'exempt', array['outbox_events'], false),
    ('jobs', 'postgres', false, 'days', 14, 'finished', null, 'exempt', array['jobs'], false),
    ('schedule_runs', 'postgres', false, 'days', 90, 'finished', null, 'exempt', array['schedule_runs'], false),
    ('service_config', 'postgres', false, 'while', null, null, null, 'kept',
     array['feature_flags', 'schedules', 'outbox_checkpoints', 'outbox_floors'], false),
    ('compliance_records', 'postgres', false, 'while', null, null, null, 'kept',
     array['processing_register', 'transfer_register', 'transfer_clearances', 'processing_restrictions', 'notice_versions',
           'notice_version_purposes', 'notice_version_providers', 'dpo_settings'], false),
    -- The DPO's requests: 731 days after the closure, the DPO's to change from C2.9 (LH-08, LH-47).
    ('cases', 'postgres', false, 'days', 731, 'closed_on', null, 'apply', array['cases', 'case_steps'], false),
    ('legal_holds', 'postgres', false, 'days', 731, 'released', null, 'apply', array['legal_holds'], false),
    -- The deletion log's own age is fixed in deletion_log_kept() (check 7c).
    ('deletion_log', 'postgres', false, 'days', 731, 'at', null, 'exempt', array['deletion_log'], false),
    -- What each item was made from (0014): deleted with its item, or by the cascade or C2.9 once
    -- withdrawn (LH-39, LH-41).
    ('provenance', 'postgres', false, 'follows', null, null, 'source', 'apply', array['provenance_items', 'provenance_sources'], false),
    -- Later content: each step moves its tables in.
    ('profile_photos', 's3', false, 'follows', null, null, 'roster', 'apply', array[]::text[], true),
    ('upload_quarantine', 's3', false, 'until', 1, 'created', null, 'exempt', array[]::text[], true),
    ('messages', 'postgres', false, 'days', 1095, 'created', null, 'apply', array[]::text[], false),
    ('held_versions', 'postgres', false, 'while', null, null, null, 'apply', array[]::text[], false),
    ('derived_caches', 'postgres', false, 'follows', null, null, 'source', 'apply', array[]::text[], false),
    ('voice_message_audio', 's3', false, 'days', 360, 'created', null, 'apply', array[]::text[], true),
    ('tasks', 'postgres', false, 'days', 1095, 'created', null, 'apply', array[]::text[], false),
    ('session_records', 'postgres', false, 'days', 1095, 'ended', null, 'apply', array[]::text[], false),
    ('session_media', 's3', false, 'days', 120, 'ended', null, 'apply', array[]::text[], true),
    ('calendar_events', 'postgres', false, 'days', 1095, 'ended', null, 'apply', array[]::text[], false),
    ('drive_items', 'postgres', false, 'days', 1095, 'last_edit', null, 'apply', array[]::text[], true),
    ('drive_trash', 'postgres', false, 'days', 30, 'trashed', null, 'apply', array[]::text[], true),
    ('slide_copies', 'postgres', false, 'follows', null, null, 'session_records', 'apply', array[]::text[], false),
    ('people_insights', 'postgres', false, 'days', 731, 'created', null, 'apply', array[]::text[], false),
    ('breach_register', 'postgres', false, 'days', 731, 'closed_on', null, 'apply', array[]::text[], false),
    -- The AI classes (LH-06, D41): declared with finite defaults and nothing more; none has a table,
    -- a per-org value or a setter before A0.
    ('transcripts', 'postgres', true, 'days', 1095, 'ended', null, 'apply', array[]::text[], false),
    ('voice_message_transcripts', 'postgres', true, 'days', 1095, 'created', null, 'apply', array[]::text[], false),
    ('machine_output', 'postgres', true, 'follows', null, null, 'transcripts', 'apply', array[]::text[], false),
    ('ai_notes', 'postgres', true, 'days', 1095, 'created', null, 'apply', array[]::text[], false),
    ('brain_index', 'postgres', true, 'follows', null, null, 'source', 'apply', array[]::text[], false),
    ('ai_conversations', 'postgres', true, 'days', 365, 'last_edit', null, 'apply', array[]::text[], false),
    ('agent_memory', 'postgres', true, 'days', 365, 'last_edit', null, 'apply', array[]::text[], false),
    ('personal_memory', 'postgres', true, 'until', 365, 'last_edit', null, 'apply', array[]::text[], false),
    ('ai_cost_records', 'postgres', true, 'days', 731, 'created', null, 'apply', array[]::text[], false),
    ('transcription_test_set', 'postgres', true, 'until', 731, 'consent', null, 'apply', array[]::text[], false),
    ('ai_feedback', 'postgres', true, 'days', 365, 'created', null, 'apply', array[]::text[], false),
    ('people_inferences', 'postgres', true, 'days', 365, 'created', null, 'apply', array[]::text[], false)
$$;
revoke execute on function public.retention_class_defaults() from public;

-- C0.10 LH-18, LH-50 (T23 item 12): 0013's kinds, and derived (0014), whose people come from its
-- sources through lifecycle_sources_of(). packages/shared HOLD_KINDS lists the same (check 7f). Each
-- later step adds its kinds by replacing this with the same signature.
create or replace function public.lifecycle_kinds() returns setof text
language sql immutable set search_path = '' as $$
  values ('person'), ('phone_number'), ('device'), ('signin_session'), ('passkey'), ('notice_acknowledgment'),
         ('case'), ('legal_hold'), ('data_access_event'), ('derived')
$$;
revoke execute on function public.lifecycle_kinds() from public;

-- C0.10 LH-18, LH-55 (T23 item 12): 0013's resolver, and a derived item (0014), which is about nobody
-- itself: lifecycle_held() takes its people from its sources (lifecycle_sources_of()). Same signature.
create or replace function public.lifecycle_persons_of(org uuid, kind text, id uuid) returns uuid[]
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
    when 'derived' then
      found_people := '{}'::uuid[];
  end case;
  return coalesce(found_people, '{}'::uuid[]);
end
$$;
revoke execute on function public.lifecycle_persons_of(uuid, text, uuid) from public;

-- C0.10 LH-12, LH-55 (T23 item 8): 0013's anchors, and from 0014 the provenance tables: a provenance
-- item anchors as its item (item_kind, item_id) with its own kind's people when Hearth knows the kind
-- (lifecycle_persons_of(): none for derived, whose people lifecycle_held() takes from its live
-- sources; a later step's suggested task its owner), and none for a kind Hearth can't judge yet,
-- which the cascade and provenance_forget()'s leftover path keep before they delete, and whose own
-- delete path asked is_held(), which refuses a kind nobody taught (LH-18); a provenance source
-- anchors as its item, as a request's step anchors as its request (the guard decides a source only
-- by its item's log row, once its item has gone, so it needs no people). Exactly one row, for any
-- row. Same signature; 0013's comment above its version holds for the rest.
create or replace function public.lifecycle_row_anchors(org uuid, tbl text, r jsonb)
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
                          case when pg_catalog.lower(r -> 'details' ->> 'decided_by') ~ uuid_shape
                               then (r -> 'details' ->> 'decided_by')::uuid end,
                          target_case, named_case]
                          -- A flag's cohort change: the people added and removed (0007; R2DB-02).
                          || array(select e.v::uuid
                                   from (values ('people_added'), ('people_removed')) k (name)
                                   cross join lateral pg_catalog.jsonb_array_elements_text(
                                     case when pg_catalog.jsonb_typeof(r -> 'details' -> k.name) = 'array'
                                          then r -> 'details' -> k.name else '[]'::jsonb end) e (v)
                                   where pg_catalog.lower(e.v) ~ uuid_shape), null);
  elsif tbl = 'provenance_items' then
    -- An item anchors as itself, with its own kind's people when Hearth knows the kind; the CASE keeps
    -- a row of nulls, or of a kind nobody taught, to one row with none.
    return query select (r ->> 'item_kind')::text, (r ->> 'item_id')::uuid,
                        case when r ->> 'item_id' is not null
                                  and exists (select 1 from public.lifecycle_kinds() k where k = r ->> 'item_kind')
                             then public.lifecycle_persons_of(org, r ->> 'item_kind', (r ->> 'item_id')::uuid)
                             else '{}'::uuid[] end;
  elsif tbl = 'provenance_sources' then
    -- A source belongs only to its item and goes with it, so it anchors as that item.
    return query select (select p.item_kind from public.provenance_items p
                         where p.org_id = org and p.id = (r ->> 'item')::uuid),
                        (select p.item_id from public.provenance_items p
                         where p.org_id = org and p.id = (r ->> 'item')::uuid),
                        '{}'::uuid[];
  else
    raise exception 'lifecycle_row_anchors() has no anchors for that table.' using errcode = 'invalid_parameter_value';
  end if;
end
$$;
revoke execute on function public.lifecycle_row_anchors(uuid, text, jsonb) from public;

-- C0.10 LH-18, LH-50 (T23 items 12 and 14): the sources an item was made from, transitively, through
-- derived-mode items and live edges only: for a derived-mode item, every source of its live edges,
-- and, for each source that is itself a derived-mode item, its own live edges' sources, and so on
-- (intermediate derived items included, as sources of kind derived, which name nobody). Nothing for
-- a cited item, which is never held through its sources (LH-50), and nothing for an item with no
-- record. The walk's UNION ends it whatever the graph, a cycle a broken producer left included, so
-- it needs no depth limit: lifecycle_held() holds an item while any source in this closure is held,
-- and keeps one with a source of a kind Hearth can't judge yet. It locks a person source as an anchor
-- but no other source itself, so from C1.1 each kind step's lifecycle_containers_of() returns, for a
-- derived-mode item, its closure's live sources of that step's hold-target kinds and the containers
-- of every live source in it, which the hold decision and the lock-ahead lock FOR SHARE (T23 item
-- 12). Within the org only.
create or replace function public.lifecycle_sources_of(org uuid, kind text, id uuid)
  returns table (source_kind text, source_id uuid)
language sql stable set search_path = '' as $$
  with recursive closure (sk, sid) as (
    select e.source_kind, e.source_id
    from public.provenance_items p
    join public.provenance_sources e on e.org_id = p.org_id and e.item = p.id and e.gone_at is null
    where p.org_id = lifecycle_sources_of.org and p.item_kind = lifecycle_sources_of.kind
      and p.item_id = lifecycle_sources_of.id and p.mode = 'derived'
    union
    select e.source_kind, e.source_id
    from closure c
    join public.provenance_items p on p.org_id = lifecycle_sources_of.org and p.item_kind = c.sk and p.item_id = c.sid
                                  and p.mode = 'derived'
    join public.provenance_sources e on e.org_id = p.org_id and e.item = p.id and e.gone_at is null
  )
  select c.sk, c.sid from closure c
$$;
revoke execute on function public.lifecycle_sources_of(uuid, text, uuid) from public;

-- C0.10 LH-41, LH-42 (T23 item 14): everything made from a source over live edges: derived-mode
-- items transitively, and cited items one step from the source or from a derived-mode item (a walk
-- never passes through a cited item). Each with its record's id, kind, item id, mode and state, and
-- its depth: the longest chain from the source. The set itself is complete whatever the graph (UNION
-- over ids), so a withdrawal never leaves anything out; only the cascade's deletion order needs the
-- depth. Depths are counted to 32 links: if any chain reaches 32 (a chain that deep, or a cycle a
-- producer breaking LH-43 left, which repeats without end), no item gets a depth, since a cycle can
-- give a node a depth under 32 by its parity alone, and the cascade then deletes nothing, leaving all
-- of it withdrawn for C2.9. Withdrawn items are walked too: a withdrawal never releases what was made
-- from them. Within the org only. Run by no role but its owner.
create function public.provenance_dependants(org uuid, source_kind text, source_id uuid)
  returns table (provenance_id uuid, dependant_kind text, dependant_id uuid, dependant_mode text, dependant_state text,
                 depth integer)
language sql stable set search_path = '' as $$
  with recursive
    reached (id) as (
      select e.item from public.provenance_sources e
      where e.org_id = provenance_dependants.org and e.source_kind = provenance_dependants.source_kind
        and e.source_id = provenance_dependants.source_id and e.gone_at is null
      union
      select e.item from reached w
      join public.provenance_items p on p.org_id = provenance_dependants.org and p.id = w.id and p.mode = 'derived'
      join public.provenance_sources e on e.org_id = p.org_id and e.source_kind = p.item_kind and e.source_id = p.item_id
                                      and e.gone_at is null
    ),
    levels (id, lvl) as (
      select e.item, 1 from public.provenance_sources e
      where e.org_id = provenance_dependants.org and e.source_kind = provenance_dependants.source_kind
        and e.source_id = provenance_dependants.source_id and e.gone_at is null
      union
      select e.item, l.lvl + 1 from levels l
      join public.provenance_items p on p.org_id = provenance_dependants.org and p.id = l.id and p.mode = 'derived'
      join public.provenance_sources e on e.org_id = p.org_id and e.source_kind = p.item_kind and e.source_id = p.item_id
                                      and e.gone_at is null
      where l.lvl < 32
    )
  select p.id, p.item_kind, p.item_id, p.mode, p.state, case when not k.capped then m.lvl end
  from reached r
  join public.provenance_items p on p.org_id = provenance_dependants.org and p.id = r.id
  left join (select l.id, pg_catalog.max(l.lvl) as lvl from levels l group by l.id) m on m.id = r.id
  cross join (select exists (select 1 from levels l where l.lvl >= 32) as capped) k
$$;
revoke execute on function public.provenance_dependants(uuid, text, uuid) from public;

-- C0.10 LH-21, LH-41 (T23 items 14 and 18; DB-11): the lock-ahead the cascade, a withdrawal and
-- provenance_forget() take before they change anything, in the lock order, with the hold decision's
-- own steps for everything they touch: the source's own record, if it has one, and everything made
-- from it (provenance_dependants()). Per round: their anchor people, the people every live source of
-- each is about and, for a derived-mode item and the source's own record, the people its own kind is
-- about, by the resolvers lifecycle_held() reads, as the cascade and the guard pass them
-- (lifecycle_sources_of(), lifecycle_persons_of(); a kind Hearth can't judge has none, and keeps its
-- item anyway), FOR NO KEY UPDATE in id order; their containers FOR SHARE (lifecycle_containers_of(),
-- none until C1.1); those people's open and refused requests FOR SHARE; then the items FOR UPDATE in
-- id order, so a producer, which reads a derived source's record FOR KEY SHARE (LH-43), waits, and so
-- does an edge's insert (FOR SHARE); a producer takes every record it touches one at a time in id
-- order, the order this takes them in, so within a round the two never wait on each other in a cycle
-- (T23 item 14). Each round walks again in a new statement, which under READ COMMITTED sees what
-- committed while the last round waited, until nothing new appears: a derive that committed in
-- between is locked, and so withdrawn, too. Its people are then locked after provenance_items, out
-- of order (DB-11), where a deadlock answers 40P01 and 409 try_again; after eight rounds it gives up
-- the same way (40001). lifecycle_held()'s locks are then re-locks. Run by no role but its owner:
-- only the definers below call it.
create function public.provenance_lock_ahead(org uuid, source_kind text, source_id uuid) returns void
language plpgsql volatile set search_path = '' as $$
declare
  locked uuid[] := '{}'::uuid[];
  found_ids uuid[];
  fresh uuid[];
  anchors uuid[];
  rounds integer := 0;
  ct record;
begin
  loop
    found_ids := array(
      select d.provenance_id
      from public.provenance_dependants(org, provenance_lock_ahead.source_kind, provenance_lock_ahead.source_id) d
      union
      select p.id from public.provenance_items p
      where p.org_id = org and p.item_kind = provenance_lock_ahead.source_kind and p.item_id = provenance_lock_ahead.source_id);
    fresh := array(select x from pg_catalog.unnest(found_ids) x where not (x = any (locked)) order by x);
    exit when pg_catalog.cardinality(fresh) = 0;
    rounds := rounds + 1;
    if rounds > 8 then
      raise exception 'What was made from this record kept changing, so nothing was done. Try again.'
        using errcode = 'serialization_failure';
    end if;
    anchors := array(
      select distinct a.person
      from public.provenance_items p
      cross join lateral (
        select s.source_kind, s.source_id from public.lifecycle_sources_of(org, p.item_kind, p.item_id) s
        union all
        select p.item_kind, p.item_id
        where p.mode = 'derived'
           or (p.item_kind = provenance_lock_ahead.source_kind and p.item_id = provenance_lock_ahead.source_id)
      ) x (anchor_kind, anchor_id)
      cross join lateral pg_catalog.unnest(
        case when exists (select 1 from public.lifecycle_kinds() k where k = x.anchor_kind)
             then public.lifecycle_persons_of(org, x.anchor_kind, x.anchor_id)
             else '{}'::uuid[] end) as a (person)
      where p.org_id = org and p.id = any (fresh));
    perform 1 from public.people pp where pp.org_id = org and pp.id = any (anchors) order by pp.id for no key update;
    for ct in select distinct c.container_kind, c.container_id
              from public.provenance_items p
              cross join lateral public.lifecycle_containers_of(org, p.item_kind, p.item_id) c
              where p.org_id = org and p.id = any (fresh)
              order by 1, 2 loop
      perform public.lifecycle_lock_target(org, ct.container_kind, ct.container_id, 'share');
    end loop;
    perform 1 from public.cases c
    where c.org_id = org and c.requester_person_id = any (anchors)
      and (c.closed_at is null or (c.outcome = 'refused' and c.closed_kind = 'access'))
    order by c.id for share;
    perform 1 from public.provenance_items p where p.org_id = org and p.id = any (fresh) order by p.id for update;
    locked := locked || fresh;
  end loop;
end
$$;
revoke execute on function public.provenance_lock_ahead(uuid, text, uuid) from public;

-- C0.10 LH-42 (T23 item 14; PRD-110, PDPA-07): withdraws everything derived from a source,
-- transitively, in the caller's transaction: each live or stale derived-mode dependant becomes
-- withdrawn with the reason (source_deleted, source_redacted or source_corrected), its ACL row
-- nobody's and its acl_epoch rising, so no reader and no SQL pre-filter selects it from that commit.
-- Cited items are untouched. A correction (C2.11, C6.1, C1.2's edits that correct) calls it with
-- source_corrected, having taken the source's row FOR UPDATE first, so a producer's FOR KEY SHARE read
-- of the source waits (T23 item 14): the source stays, so its edges stay live, and the withdrawn
-- items' later deletion is logged with cause correction (provenance_forget()). It locks ahead first
-- (provenance_lock_ahead()), so nothing derived meanwhile is left out. It holds no hold decision: a
-- held item is withdrawn too, and kept. The org is app.org_id's (DB-06); it takes no acting user and
-- writes no audit row: the deletion, redaction or correction that calls it checked its own caller and
-- audits the action (T23 item 7). Returns how many it withdrew. Granted to nobody.
create function public.withdraw_dependants(source_kind text, source_id uuid, reason text) returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare
  org uuid;
  withdrawn integer;
begin
  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'What was made from a record is withdrawn, marked or deleted only under READ COMMITTED.'
      using errcode = 'invalid_transaction_state';
  end if;
  org := nullif(pg_catalog.current_setting('app.org_id', true), '')::uuid;
  if org is null then
    raise exception 'No org is set for this transaction' using errcode = 'insufficient_privilege';
  end if;
  if withdraw_dependants.source_kind is null or withdraw_dependants.source_kind !~ '^[a-z][a-z0-9_]{0,62}$'
     or withdraw_dependants.source_id is null then
    raise exception 'That record can''t have anything made from it.' using errcode = 'invalid_parameter_value';
  end if;
  if withdraw_dependants.reason is null
     or withdraw_dependants.reason not in ('source_deleted', 'source_redacted', 'source_corrected') then
    raise exception 'That isn''t a reason to withdraw what was made from a record.' using errcode = 'invalid_parameter_value';
  end if;
  perform public.provenance_lock_ahead(org, withdraw_dependants.source_kind, withdraw_dependants.source_id);
  update public.provenance_items p
  set state = 'withdrawn', withdrawn_at = pg_catalog.now(), withdrawn_reason = withdraw_dependants.reason,
      acl_tokens = '{}', acl_more = '[]'::jsonb, acl_epoch = p.acl_epoch + 1
  where p.org_id = org and p.mode = 'derived' and p.state in ('live', 'stale')
    and p.id in (select d.provenance_id
                 from public.provenance_dependants(org, withdraw_dependants.source_kind, withdraw_dependants.source_id) d);
  get diagnostics withdrawn = row_count;
  return withdrawn;
end
$$;
revoke execute on function public.withdraw_dependants(text, uuid, text) from public;

-- C0.10 LH-42 (T23 item 14; PRD-44, PRD-110): marks every live derived-mode item made from a source,
-- transitively, stale, with the time and the reason (source_edited, or source_acl_changed when a
-- source's own stored ACL is rewritten, T16 item 14). A stale item is still readable: staleness is
-- freshness, not access, so it takes no people's locks, only the items FOR NO KEY UPDATE in id order.
-- Stale, withdrawn and cited items are untouched. No caller in C0: C1.2's edits, C4.x's document
-- edits, and C1.1's and C4.1's acl.changed handlers and C4.1's re-ACL job, which act for no person
-- after a rewrite its own writer checked and audited, call it, and A2 regenerates lazily. The org is
-- app.org_id's (DB-06); no acting user, no audit row of its own. Returns how many it marked. Granted
-- to nobody.
create function public.provenance_mark_stale(source_kind text, source_id uuid, reason text) returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare
  org uuid;
  ids uuid[];
  marked integer;
begin
  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'What was made from a record is withdrawn, marked or deleted only under READ COMMITTED.'
      using errcode = 'invalid_transaction_state';
  end if;
  org := nullif(pg_catalog.current_setting('app.org_id', true), '')::uuid;
  if org is null then
    raise exception 'No org is set for this transaction' using errcode = 'insufficient_privilege';
  end if;
  if provenance_mark_stale.source_kind is null or provenance_mark_stale.source_kind !~ '^[a-z][a-z0-9_]{0,62}$'
     or provenance_mark_stale.source_id is null then
    raise exception 'That record can''t have anything made from it.' using errcode = 'invalid_parameter_value';
  end if;
  if provenance_mark_stale.reason is null or provenance_mark_stale.reason not in ('source_edited', 'source_acl_changed') then
    raise exception 'That isn''t a reason to mark what was made from a record stale.' using errcode = 'invalid_parameter_value';
  end if;
  ids := array(
    select d.provenance_id
    from public.provenance_dependants(org, provenance_mark_stale.source_kind, provenance_mark_stale.source_id) d
    where d.dependant_mode = 'derived' and d.dependant_state = 'live'
    order by d.provenance_id);
  perform 1 from public.provenance_items p where p.org_id = org and p.id = any (ids) order by p.id for no key update;
  update public.provenance_items p
  set state = 'stale', stale_since = pg_catalog.now(), stale_reason = provenance_mark_stale.reason
  where p.org_id = org and p.id = any (ids) and p.state = 'live';
  get diagnostics marked = row_count;
  return marked;
end
$$;
revoke execute on function public.provenance_mark_stale(text, uuid, text) from public;

-- C0.10 LH-41, LH-50 (T23 item 14; PDPA-09, Rule 7): what a deletion function calls after it deletes
-- or redacts a source, with that deletion's log row as parent (22023 unless the org's log holds it).
-- In the caller's transaction it withdraws everything made from the source (withdraw_dependants(),
-- the reason from the parent's cause: redaction gives source_redacted, correction source_corrected,
-- any other source_deleted). A deleted source is gone, so its edges are marked gone; after a
-- redaction or a correction the source stays in place, and so do its edges, so a hold on it, on its
-- people or (from C1.1) on its container still keeps what was made from it (LH-50). Then, deepest
-- first (provenance_dependants()' depth), it decides the withdrawn items of kind derived, up to batch
-- (1 to 500) hold decisions, a kept item counting as a deleted one does: lifecycle_held() reads the
-- item's own kind's people (none for derived) and its remaining live sources after the lock-ahead, so
-- its locks are re-locks; a held item, one whose depth is unknown, and anything past the batch stay
-- withdrawn and kept (C2.9 sweeps them). A derived-mode item of any other kind (C3.5's suggested
-- tasks) keeps content in its own table, so it is never deleted here: it stays withdrawn and kept until
-- the step that stores that content replaces this function, with the same signature, to delete the
-- content first, in its own class with the same parent, and provenance_forget() and
-- provenance_sources_insert() with it (T23 item 14). Each deletion is logged with
-- parent (log_deletion(), class provenance), then its record goes (its guard decides again, a
-- backstop), then the edges naming it are marked gone, then its own edges go (their guard needs it
-- gone and logged). Deepest first, a digest is decided while the summary it was made from exists, and
-- no deletion meets a dependant left behind. The source's own record, if it has one, is never deleted
-- here: provenance_forget() deletes it. No event: no consumer of a derived kind exists; the first
-- producer of a derived-mode item gives these writes their events (T23 item 14). The org is
-- app.org_id's (DB-06); no acting user, no audit row of its own: the deletion that calls it audits
-- the action. Returns how many it deleted. Granted to nobody.
create function public.lifecycle_cascade(source_kind text, source_id uuid, parent bigint, batch integer) returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare
  org uuid;
  parent_cause text;
  own uuid;
  candidates uuid[];
  cand uuid;
  it record;
  decided integer := 0;
  deleted integer := 0;
begin
  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'What was made from a record is withdrawn, marked or deleted only under READ COMMITTED.'
      using errcode = 'invalid_transaction_state';
  end if;
  org := nullif(pg_catalog.current_setting('app.org_id', true), '')::uuid;
  if org is null then
    raise exception 'No org is set for this transaction' using errcode = 'insufficient_privilege';
  end if;
  if lifecycle_cascade.source_kind is null or lifecycle_cascade.source_kind !~ '^[a-z][a-z0-9_]{0,62}$'
     or lifecycle_cascade.source_id is null then
    raise exception 'That record can''t have anything made from it.' using errcode = 'invalid_parameter_value';
  end if;
  if lifecycle_cascade.batch is null or lifecycle_cascade.batch < 1 or lifecycle_cascade.batch > 500 then
    raise exception 'A cascade deletes 1 to 500 items at a time.' using errcode = 'invalid_parameter_value';
  end if;
  select d.cause into parent_cause from public.deletion_log d where d.org_id = org and d.id = lifecycle_cascade.parent;
  if parent_cause is null then
    raise exception 'A cascade follows a deletion logged in this org.' using errcode = 'invalid_parameter_value';
  end if;
  perform public.withdraw_dependants(lifecycle_cascade.source_kind, lifecycle_cascade.source_id,
                                     case parent_cause when 'redaction' then 'source_redacted'
                                                       when 'correction' then 'source_corrected'
                                                       else 'source_deleted' end);
  select p.id into own from public.provenance_items p
  where p.org_id = org and p.item_kind = lifecycle_cascade.source_kind and p.item_id = lifecycle_cascade.source_id;
  candidates := array(
    select d.provenance_id
    from public.provenance_dependants(org, lifecycle_cascade.source_kind, lifecycle_cascade.source_id) d
    where d.dependant_mode = 'derived' and d.depth is not null and d.provenance_id is distinct from own
    order by d.depth desc, d.provenance_id);
  -- A redacted or corrected source stays in place, so its edges stay live and still count for holds.
  if parent_cause not in ('redaction', 'correction') then
    update public.provenance_sources e set gone_at = pg_catalog.now()
    where e.org_id = org and e.source_kind = lifecycle_cascade.source_kind and e.source_id = lifecycle_cascade.source_id
      and e.gone_at is null;
  end if;
  foreach cand in array candidates loop
    -- The batch bounds hold decisions, and so deletions: a kept item counts too.
    exit when decided >= lifecycle_cascade.batch;
    select p.id, p.item_kind, p.item_id, p.state into it from public.provenance_items p where p.org_id = org and p.id = cand;
    continue when not found;
    continue when it.state <> 'withdrawn';
    -- Only kind derived goes whole with its record; any other kind keeps content of its own.
    continue when it.item_kind <> 'derived';
    decided := decided + 1;
    continue when public.lifecycle_held(org, public.lifecycle_persons_of(org, it.item_kind, it.item_id),
                                        it.item_kind, it.item_id);
    perform public.log_deletion('provenance', 'provenance_items', it.id::text, 'cascade', null, lifecycle_cascade.parent,
                                null, null, false);
    delete from public.provenance_items p where p.org_id = org and p.id = it.id;
    update public.provenance_sources e set gone_at = pg_catalog.now()
    where e.org_id = org and e.source_kind = it.item_kind and e.source_id = it.item_id and e.gone_at is null;
    delete from public.provenance_sources e where e.org_id = org and e.item = it.id;
    deleted := deleted + 1;
  end loop;
  return deleted;
end
$$;
revoke execute on function public.lifecycle_cascade(text, uuid, bigint, integer) from public;

-- C0.10 LH-41 (T23 item 14): an item's own provenance record goes with the item. Every item's delete
-- path calls it for the item it deletes, derived or cited (a draft sent or discarded, a dismissed
-- suggested task, an AI note at the end of its period, accepted AI text a person deletes), with cause
-- cascade and its own deletion's log row as parent (22023 unless the org's log holds it, as the
-- cascade checks). It locks ahead (the item and everything made from it), logs the record (class
-- provenance), cascades to what was made from it with that log row as parent (lifecycle_cascade(),
-- batch 500), marks every edge still naming the record gone (the cascade leaves them live when the
-- record's own cause is redaction or correction), then deletes the record, whose guard decides its
-- hold through its own kind's people and its still-live edges (HF009 if held: the caller's own
-- is_held() should have answered first), then its edges. An item with no record of its own (C1.1's
-- messages) only cascades. A withdrawn leftover of kind derived goes on its own with the cause its
-- withdrawn reason gives, and no parent (C2.9's sweep, after a correction or a redaction, after a
-- hold ends, or past the cascade's batch): correction for source_corrected, redaction for
-- source_redacted, retention for source_deleted, any other cause refused (22023) before its kind or
-- hold is read, so the log states why it went; it answers 0 while it is held and logs nothing, so a
-- sweep counts it kept; 0 too for a leftover of another derived-mode kind, which keeps content of its
-- own until the step that stores that content replaces this function, with the same signature (with
-- lifecycle_cascade() and provenance_sources_insert(): T23 item 14), and for a record already gone. Causes: cascade with a parent; correction, redaction or retention
-- without (22023 otherwise). The org is app.org_id's (DB-06); no acting user, no audit row of its
-- own. Returns how many records it deleted. Granted to nobody.
create function public.provenance_forget(item_kind text, item_id uuid, cause text, parent bigint) returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare
  org uuid;
  rec record;
  logged bigint;
  deleted integer;
begin
  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'What was made from a record is withdrawn, marked or deleted only under READ COMMITTED.'
      using errcode = 'invalid_transaction_state';
  end if;
  org := nullif(pg_catalog.current_setting('app.org_id', true), '')::uuid;
  if org is null then
    raise exception 'No org is set for this transaction' using errcode = 'insufficient_privilege';
  end if;
  if provenance_forget.item_kind is null or provenance_forget.item_kind !~ '^[a-z][a-z0-9_]{0,62}$'
     or provenance_forget.item_id is null then
    raise exception 'That record can''t have anything made from it.' using errcode = 'invalid_parameter_value';
  end if;
  if provenance_forget.cause is null or provenance_forget.cause not in ('cascade', 'correction', 'redaction', 'retention')
     or (provenance_forget.cause = 'cascade') <> (provenance_forget.parent is not null) then
    raise exception 'An item''s provenance goes with its logged deletion, or as a withdrawn leftover.'
      using errcode = 'invalid_parameter_value';
  end if;
  if provenance_forget.cause = 'cascade'
     and not exists (select 1 from public.deletion_log d where d.org_id = org and d.id = provenance_forget.parent) then
    raise exception 'A cascade follows a deletion logged in this org.' using errcode = 'invalid_parameter_value';
  end if;
  perform 1 from public.provenance_items p
  where p.org_id = org and p.item_kind = provenance_forget.item_kind and p.item_id = provenance_forget.item_id;
  if not found then
    if provenance_forget.cause <> 'cascade' then
      return 0;
    end if;
    return public.lifecycle_cascade(provenance_forget.item_kind, provenance_forget.item_id, provenance_forget.parent, 500);
  end if;
  perform public.provenance_lock_ahead(org, provenance_forget.item_kind, provenance_forget.item_id);
  select p.id, p.mode, p.state, p.withdrawn_reason into rec from public.provenance_items p
  where p.org_id = org and p.item_kind = provenance_forget.item_kind and p.item_id = provenance_forget.item_id;
  if not found then
    return 0;
  end if;
  if provenance_forget.cause <> 'cascade' then
    if rec.mode <> 'derived' or rec.state <> 'withdrawn' then
      raise exception 'Only a withdrawn item''s provenance goes on its own.' using errcode = 'invalid_parameter_value';
    end if;
    if provenance_forget.cause is distinct from (case rec.withdrawn_reason when 'source_corrected' then 'correction'
                                                                           when 'source_redacted' then 'redaction'
                                                                           when 'source_deleted' then 'retention' end) then
      raise exception 'A withdrawn item''s provenance goes with the cause its withdrawal gave it.'
        using errcode = 'invalid_parameter_value';
    end if;
    -- As in the cascade, only kind derived goes whole with its record.
    if provenance_forget.item_kind <> 'derived' then
      return 0;
    end if;
    if public.lifecycle_held(org, public.lifecycle_persons_of(org, provenance_forget.item_kind, provenance_forget.item_id),
                             provenance_forget.item_kind, provenance_forget.item_id) then
      return 0;
    end if;
  end if;
  logged := public.log_deletion('provenance', 'provenance_items', rec.id::text, provenance_forget.cause, null,
                                provenance_forget.parent, null, null, false);
  deleted := public.lifecycle_cascade(provenance_forget.item_kind, provenance_forget.item_id, logged, 500);
  update public.provenance_sources e set gone_at = pg_catalog.now()
  where e.org_id = org and e.source_kind = provenance_forget.item_kind and e.source_id = provenance_forget.item_id
    and e.gone_at is null;
  delete from public.provenance_items p where p.org_id = org and p.id = rec.id;
  delete from public.provenance_sources e where e.org_id = org and e.item = rec.id;
  return deleted + 1;
end
$$;
revoke execute on function public.provenance_forget(text, uuid, text, bigint) from public;

-- What each role may do (CLAUDE.md, Database; LH-30). No role gains anything: no grant on
-- provenance_items or provenance_sources to anyone, and every new function, each with execute revoked
-- from PUBLIC beside it, is granted to nobody: provenance_dependants, provenance_lock_ahead,
-- withdraw_dependants, provenance_mark_stale, lifecycle_cascade, provenance_forget, and the trigger
-- functions provenance_items_insert, provenance_items_state, provenance_items_complete,
-- provenance_sources_insert and provenance_sources_fixed. Each producer's migration grants its own
-- checked writer to its role (LH-43): C1.2, C3.5, C4.3, C4.4, A2.3. C1.1's, C1.2's, C2.9's and
-- C2.11's deletion and correction definers call the four definers as the owner.
