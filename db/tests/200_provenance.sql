-- BRAIN-08, PDPA-07, PDPA-09, PRD-110 (C0.10 PR 2, 0014; LH-39 to LH-43, LH-50; TECH-SPEC T23 item
-- 14): the provenance registry and its cascade, "deleting a source removes its derived rows". The
-- cases:
--   LCD-34 the tables' shapes, each refusal by its constraint's name: the mode and kinds (never a
--          request or a legal hold), a derived item's count and whole ACL row and a cited item's
--          none, the ACL tokens the outbox's checks allow, withdrawn meaning nobody's, staleness, the
--          fingerprint, the count's range, an edge's version, anchor and number, and one record per
--          item and one edge per source (LH-39);
--   LCD-35 the triggers: an item takes its transaction from the database and starts live; an edge
--          comes after its item with the next number, and a derived item's only in its own
--          transaction, never numbered above its count (in one insert, or after the deferred check
--          was fired early), never from a derived item made in it (itself included), a withdrawn
--          item or a derived item with no record, those two refused alike; a derived-mode record
--          for something already used as a source, by a gone edge too, is refused, a cited one not,
--          the check reading the edges through provenance_sources_source (pinned from the
--          catalogue, and the planner's choice on analysed rows); a cited item gains
--          sources later; the deferred completeness check, a definer, passes and refuses on
--          substance at the commit with hearth_app active, never 42501, for fewer edges than the
--          count and for more; an item's state moves only as LH-42 says (stale to withdrawn
--          included), its ACL row only with a new epoch; an edge changes only by its gone_at, set
--          once (LH-40, LH-42);
--   LCD-36 deleting a source removes what was made from it: the cascade deletes a derived item and
--          the one made from it, deepest first, each logged under its parent, marks the source's
--          edges gone and leaves a cited draft live; the draft's own deletion takes its record with
--          it; an item with no record of its own only cascades; the definers' refusals (LH-41);
--   LCD-37 held through provenance, and kept: a derived item with a held source, or one of a kind
--          Hearth can't judge yet, stays withdrawn and nobody's; a redaction leaves the source's
--          edges live, so a held redacted source keeps what was made from it and an unheld one
--          doesn't; through and past an intermediate; another derived-mode kind stays withdrawn
--          and kept; a source a hold kept and a deleted one refused alike as an edge's source; a
--          leftover swept with a cause its withdrawal didn't give refused, held or not; the seam (a
--          hold on a container-like kind, a later kind's own people); the batch, which counts
--          decisions, kept ones too; is_held() of a derived item (LH-50, LH-41);
--   LCD-38 staleness and withdrawal: provenance_mark_stale() marks only live derived-mode items,
--          once, never through a cited item; a deleted or redacted source withdraws its stale
--          dependants as its live ones; a cited draft's own deletion takes what was made from it;
--          withdraw_dependants() for a correction withdraws transitively, leaving the edges live;
--          provenance_forget() of the corrected leftover refuses any cause but correction, then
--          logs it as a correction and what was made from it as its cascade, marking a cited
--          record's edge to it gone (LH-42);
--   LCD-39 the guard on both tables: no log row (HF010), an edge before its item (HF010),
--          TRUNCATE (0A000, HF010), a held derived record (HF009), and a cited or unheld derived
--          record going logged, then its edges, the deferred key passing (LH-11, LH-12);
--   LCD-40 scope, privileges, functions and anchors: the walks stay in the org, on live edges, and
--          end over a cycle, which gets no depth and so no deletion; neither walk passes through a
--          cited item; the cascade's and provenance_forget()'s writes leave another org's rows naming
--          the same ids alone; the four definers refuse with no org (42501); no runtime role
--          touches either table or runs any of the eleven new functions, five of them definers; lifecycle_row_anchors() for both tables; log_deletion()
--          takes the provenance class (LH-30, ACC-11).
-- No producer exists before C1.2, so rows are written here as the superuser or the owner (LH-43):
-- through the triggers, or, for a derived item made "in an earlier transaction", planted with the
-- triggers off for its insert alone (session_replication_role, back to origin before anything is
-- deleted: LCG-05). The definers run as the owner with app.org_id set, as the deletion code will run
-- them. A source's deletion is logged straight into the log as the owner (no class lists a messages
-- table before C1.1). Messages, files, channels, drafts and suggested tasks are made-up ids, since
-- sources and items are polymorphic; everyone is the fixture's.
\ir fixtures/two_orgs.sql

-- pg_temp.pid('1', '31') is f1000000-0000-4000-8000-000000000231: this file's made-up ids. Sources:
-- messages 01 to 17, a file 21, a channel 22, a suggested task 23. A provenance record's own id is
-- pid(o, slot) and its item's the slot two up in the first digit (record 31's item is 51, 41's 61,
-- 71's 91).
create function pg_temp.pid(org text, n text) returns uuid language sql immutable as $$
  select ('f' || org || '000000-0000-4000-8000-0000000002' || n)::uuid
$$;
create function pg_temp.itm(org text, slot text) returns uuid language sql immutable as $$
  select pg_temp.pid(org, (substr(slot, 1, 1)::int + 2)::text || substr(slot, 2, 1))
$$;

-- Makes a provenance record now, through the triggers, as a producer's checked writer will: slot's
-- record and item, of the kind and mode given, from the sources given in order (kinds[i], ids[i]). A
-- derived-mode record carries its count and the org's ACL row; Hearth made it.
create function pg_temp.make(o text, slot text, kind text, mode text, kinds text[], ids uuid[]) returns uuid
language plpgsql as $$
declare
  org uuid := pg_temp.id(o, '00');
  made boolean := mode = 'derived';
begin
  insert into public.provenance_items (id, org_id, item_kind, item_id, mode, source_count, acl_tokens, acl_more, index_class,
                                       acl_epoch, created_by)
  values (pg_temp.pid(o, slot), org, kind, pg_temp.itm(o, slot), mode, case when made then cardinality(ids) end,
          case when made then array['o:' || org] end, case when made then '[]'::jsonb end,
          case when made then 'normal' end, case when made then 1 end, pg_temp.id(o, 'a0'));
  for i in 1 .. coalesce(cardinality(ids), 0) loop
    insert into public.provenance_sources (org_id, item, number, source_kind, source_id)
    values (org, pg_temp.pid(o, slot), i, kinds[i], ids[i]);
  end loop;
  return pg_temp.pid(o, slot);
end
$$;

-- Plants a record made in an earlier transaction (created_tx 1), with the triggers, keys and the
-- deferred completeness check off for these inserts alone, so its rows are made consistent by hand:
-- edges numbered 1 to the count, the item first. Live, or withdrawn as a deleted source leaves it.
-- As the superuser. item, if given, is its item's id instead of the slot's.
create function pg_temp.plant(o text, slot text, kind text, mode text, kinds text[], ids uuid[],
                              withdrawn boolean default false, item uuid default null) returns uuid
language plpgsql as $$
declare
  org uuid := pg_temp.id(o, '00');
  made boolean := mode = 'derived';
begin
  perform set_config('session_replication_role', 'replica', true);
  insert into public.provenance_items (id, org_id, created_tx, item_kind, item_id, mode, state, withdrawn_at, withdrawn_reason,
                                       source_count, acl_tokens, acl_more, index_class, acl_epoch, created_by)
  values (pg_temp.pid(o, slot), org, '1', kind, coalesce(item, pg_temp.itm(o, slot)), mode,
          case when withdrawn then 'withdrawn' else 'live' end, case when withdrawn then now() end,
          case when withdrawn then 'source_deleted' end, case when made then cardinality(ids) end,
          case when made then case when withdrawn then '{}' else array['o:' || org] end end,
          case when made then '[]'::jsonb end, case when made then 'normal' end,
          case when made then case when withdrawn then 2 else 1 end end, pg_temp.id(o, 'a0'));
  for i in 1 .. coalesce(cardinality(ids), 0) loop
    insert into public.provenance_sources (org_id, item, number, source_kind, source_id)
    values (org, pg_temp.pid(o, slot), i, kinds[i], ids[i]);
  end loop;
  perform set_config('session_replication_role', 'origin', true);
  return pg_temp.pid(o, slot);
end
$$;

-- A source's deletion, logged as its own deletion code will log it, with the database's time and
-- transaction; returns its id, a cascade's parent.
create function pg_temp.logged(o text, class text, tbl text, object uuid, cause text) returns bigint language sql as $$
  insert into public.deletion_log (org_id, class_key, object_table, object_id, cause)
  values (pg_temp.id(o, '00'), class, tbl, object::text, cause) returning id
$$;

-- An item's row in org 1, as jsonb, with a change, inserted through the triggers: a8's cited draft
-- (base 'cited'), or a derived item Hearth made from one source, readable by the org (base 'derived').
create function pg_temp.add_item(base text, change jsonb) returns uuid language plpgsql as $$
declare
  p public.provenance_items;
begin
  p := jsonb_populate_record(null::public.provenance_items,
         jsonb_build_object('id', gen_random_uuid(), 'org_id', pg_temp.id('1', '00'), 'created_tx', pg_current_xact_id()::text,
                            'item_kind', 'draft', 'item_id', gen_random_uuid(), 'mode', 'cited', 'state', 'live',
                            'created_at', now(), 'created_by', pg_temp.id('1', 'a8'))
         || case base when 'derived' then jsonb_build_object('item_kind', 'derived', 'mode', 'derived', 'source_count', 1,
                                                             'acl_tokens', jsonb_build_array('o:' || pg_temp.id('1', '00')),
                                                             'acl_more', '[]'::jsonb, 'index_class', 'normal', 'acl_epoch', 1,
                                                             'created_by', pg_temp.id('1', 'a0'))
                  else '{}'::jsonb end
         || change);
  insert into public.provenance_items select p.*;
  return p.id;
end
$$;
create function pg_temp.bad_item(base text, change jsonb, constraint_name text) returns void language plpgsql as $$
begin
  perform pg_temp.expect_error(format('select pg_temp.add_item(%L, %L)', base, change), '23514', '%"' || constraint_name || '"%');
end
$$;
-- The next edge of the fixture's cited draft ef in org 1, with a change.
create function pg_temp.add_edge(change jsonb) returns void language plpgsql as $$
declare
  e public.provenance_sources;
begin
  e := jsonb_populate_record(null::public.provenance_sources,
         jsonb_build_object('org_id', pg_temp.id('1', '00'), 'item', pg_temp.id('1', 'ef'),
                            'number', (select max(x.number) + 1 from public.provenance_sources x where x.item = pg_temp.id('1', 'ef')),
                            'source_kind', 'message', 'source_id', gen_random_uuid())
         || change);
  insert into public.provenance_sources select e.*;
end
$$;
create function pg_temp.bad_edge(change jsonb, constraint_name text) returns void language plpgsql as $$
begin
  perform pg_temp.expect_error(format('select pg_temp.add_edge(%L)', change), '23514', '%"' || constraint_name || '"%');
end
$$;

-- What a refusal shows: its SQLSTATE, its message and the edge trigger's own line of its context
-- (which says where in the trigger it was raised); null if the statement passes.
create function pg_temp.refusal(stmt text) returns text language plpgsql as $$
declare
  ctx text;
begin
  begin
    execute stmt;
  exception when others then
    get stacked diagnostics ctx = pg_exception_context;
    return format('%s %s %s', sqlstate, sqlerrm,
                  (select string_agg(l, ' | ') from regexp_split_to_table(ctx, E'\n') l
                   where l like '%function public.provenance_sources_insert()%'));
  end;
  return null;
end
$$;

-- LCD-34 (LH-39): the shapes.
select pg_temp.bad_item('cited', '{"mode": "copied"}', 'provenance_items_mode');
select pg_temp.bad_item('cited', '{"item_kind": "derived"}', 'provenance_items_derived_kind');
select pg_temp.expect_error(format($$update public.provenance_items set state = 'stale', stale_since = now(),
  stale_reason = 'source_edited' where id = %L$$, pg_temp.id('1', 'ef')), '23514', '%"provenance_items_cited_live"%');
select pg_temp.bad_item('cited', '{"source_count": 1}', 'provenance_items_derived_shape');
select pg_temp.bad_item('cited', '{"acl_tokens": [], "acl_more": [], "index_class": "normal", "acl_epoch": 1}',
                        'provenance_items_derived_shape');
select pg_temp.bad_item('derived', '{"acl_epoch": null}', 'provenance_items_derived_shape');
select pg_temp.bad_item('derived', '{"source_count": null}', 'provenance_items_derived_shape');
select pg_temp.bad_item('derived', '{"acl_tokens": ["p:Alice"]}', 'provenance_items_acl_tokens');
select pg_temp.bad_item('derived', jsonb_build_object('acl_tokens', jsonb_build_array('x:' || pg_temp.id('1', 'a8'))),
                        'provenance_items_acl_tokens');
select pg_temp.bad_item('derived', '{"acl_tokens": [null]}', 'provenance_items_acl_tokens');
select pg_temp.bad_item('derived', jsonb_build_object('acl_more', jsonb_build_array('p:' || pg_temp.id('1', 'a8'))),
                        'provenance_items_acl_more');
select pg_temp.bad_item('derived', '{"acl_more": [["p:alice"]]}', 'provenance_items_acl_more');
select pg_temp.bad_item('derived', '{"acl_more": {}}', 'provenance_items_acl_more');
-- Withdrawn is nobody's: a withdrawal that keeps its tokens is refused, its epoch rising or not.
select pg_temp.expect_error(format($$update public.provenance_items set state = 'withdrawn', withdrawn_at = now(),
  withdrawn_reason = 'source_deleted', acl_epoch = acl_epoch + 1 where id = %L$$, pg_temp.id('1', 'ee')), '23514',
  '%"provenance_items_withdrawn_nobody"%');
select pg_temp.bad_item('cited', '{"item_kind": "case"}', 'provenance_items_kind');
select pg_temp.bad_item('cited', '{"item_kind": "legal_hold"}', 'provenance_items_kind');
select pg_temp.bad_item('cited', '{"item_kind": "Draft"}', 'provenance_items_kind');
select pg_temp.bad_edge('{"source_kind": "case"}', 'provenance_sources_kind');
select pg_temp.bad_edge('{"source_kind": "legal_hold"}', 'provenance_sources_kind');
select pg_temp.bad_edge('{"source_kind": "Draft"}', 'provenance_sources_kind');
select pg_temp.bad_edge('{"anchor": {"note": "Alice"}}', 'provenance_sources_anchor');
select pg_temp.bad_edge('{"source_version": "Alice"}', 'provenance_sources_version');
select pg_temp.bad_edge('{"source_version": "rev 3"}', 'provenance_sources_version');
savepoint lcd_34_edges;
select pg_temp.add_edge('{"anchor": {"start": 12, "end": 40}}');
select pg_temp.add_edge(jsonb_build_object('anchor', jsonb_build_object('block', gen_random_uuid())));
select pg_temp.add_edge('{"source_version": "17"}');
select pg_temp.add_edge(jsonb_build_object('source_version', gen_random_uuid()));
select pg_temp.add_edge('{"source_version": "r.3"}');
select pg_temp.check((select count(*) from public.provenance_sources where item = pg_temp.id('1', 'ef')) = 6,
                     'an edge''s ids-only anchor or version was refused (LCD-34)');
rollback to savepoint lcd_34_edges;
-- 0 and 101: the insert trigger's next-number rule refuses first, so they're planted with the
-- triggers off, which still applies the checks.
set local session_replication_role = replica;
select pg_temp.expect_error(format($$insert into public.provenance_sources (org_id, item, number, source_kind, source_id)
  values (%L, %L, 0, 'message', gen_random_uuid())$$, pg_temp.id('1', '00'), pg_temp.id('1', 'ef')), '23514',
  '%"provenance_sources_number"%');
select pg_temp.expect_error(format($$insert into public.provenance_sources (org_id, item, number, source_kind, source_id)
  values (%L, %L, 101, 'message', gen_random_uuid())$$, pg_temp.id('1', '00'), pg_temp.id('1', 'ef')), '23514',
  '%"provenance_sources_number"%');
set local session_replication_role = origin;
select pg_temp.expect_error(format($$update public.provenance_items set state = 'stale', stale_since = now(),
  stale_reason = 'source_corrected' where id = %L$$, pg_temp.id('1', 'ee')), '23514', '%"provenance_items_stale_reason"%');
select pg_temp.bad_item('cited', '{"fingerprint": "Model.V1"}', 'provenance_items_fingerprint');
select pg_temp.bad_item('derived', '{"source_count": 0}', 'provenance_items_source_count');
select pg_temp.bad_item('derived', '{"source_count": 101}', 'provenance_items_source_count');
select pg_temp.expect_error(format('select pg_temp.add_item(%L, %L)', 'cited', jsonb_build_object('item_id', pg_temp.id('1', 'fb'))),
                            '23505', '%"provenance_items_item"%');
select pg_temp.expect_error(format('select pg_temp.add_edge(%L)', jsonb_build_object('source_id', pg_temp.id('1', 'fc'))),
                            '23505', '%"provenance_sources_once"%');

-- LCD-35 (LH-40, LH-42): the triggers, each refusal by its message.
select pg_temp.expect_error(format('select pg_temp.add_item(%L, %L)', 'cited', '{"created_tx": "1"}'), '23514',
                            'A provenance item takes its transaction from the database.');
select pg_temp.expect_error(format('select pg_temp.add_item(%L, %L)', 'derived',
                                   jsonb_build_object('state', 'stale', 'stale_since', now(), 'stale_reason', 'source_edited')),
                            '23514', 'A provenance item starts live.');
select pg_temp.expect_error(format($$insert into public.provenance_sources (org_id, item, number, source_kind, source_id)
  values (%L, %L, 1, 'message', %L)$$, pg_temp.id('1', '00'), gen_random_uuid(), pg_temp.pid('1', '15')), '23514',
  'A source is recorded with its item, after it.');
savepoint lcd_35_numbers;
select pg_temp.make('1', '47', 'draft', 'cited', '{}', '{}');
insert into public.provenance_sources (org_id, item, number, source_kind, source_id)
  values (pg_temp.id('1', '00'), pg_temp.pid('1', '47'), 1, 'message', pg_temp.pid('1', '15'));
select pg_temp.expect_error(format($$insert into public.provenance_sources (org_id, item, number, source_kind, source_id)
  values (%L, %L, 3, 'message', %L)$$, pg_temp.id('1', '00'), pg_temp.pid('1', '47'), pg_temp.pid('1', '16')), '23514',
  'A source takes the next number of its item.');
rollback to savepoint lcd_35_numbers;
-- P1 (43), a derived item made earlier from a message, gets no late edge.
select pg_temp.plant('1', '43', 'derived', 'derived', array['message'], array[pg_temp.pid('1', '15')]);
select pg_temp.expect_error(format($$insert into public.provenance_sources (org_id, item, number, source_kind, source_id)
  values (%L, %L, 2, 'message', %L)$$, pg_temp.id('1', '00'), pg_temp.pid('1', '43'), pg_temp.pid('1', '16')), '23514',
  'A derived item''s sources are recorded when it is made, never later.');
-- Nothing derived from a derived item made in this transaction, itself included.
savepoint lcd_35_now;
select pg_temp.make('1', '48', 'derived', 'derived', array['message'], array[pg_temp.pid('1', '15')]);
select pg_temp.expect_error(format('select pg_temp.make(%L, %L, %L, %L, %L, %L)', '1', '49', 'derived', 'derived', array['derived'],
                                   array[pg_temp.itm('1', '48')]), '23514',
                            'A derived item can be made only from items that existed before it.');
select pg_temp.expect_error(format('select pg_temp.make(%L, %L, %L, %L, %L, %L)', '1', '4a', 'derived', 'derived', array['derived'],
                                   array[pg_temp.itm('1', '4a')]), '23514',
                            'A derived item can be made only from items that existed before it.');
rollback to savepoint lcd_35_now;
-- A suggested task a cited draft already cites can't get a derived-mode record now; a cited record
-- for it can.
savepoint lcd_35_first;
select pg_temp.make('1', '4b', 'draft', 'cited', array['suggested_task'], array[pg_temp.pid('1', '23')]);
select pg_temp.expect_error(format('select pg_temp.add_item(%L, %L)', 'derived',
                                   jsonb_build_object('item_kind', 'suggested_task', 'item_id', pg_temp.pid('1', '23'))), '23514',
                            'A derived item''s sources are recorded when it is made, before anything is made from it.');
select pg_temp.check(pg_temp.add_item('cited', jsonb_build_object('item_kind', 'suggested_task', 'item_id', pg_temp.pid('1', '23')))
                       is not null,
                     'a cited record for something already cited was refused (LCD-35)');
rollback to savepoint lcd_35_first;
-- A gone edge counts too, and the check reads the edges by source through provenance_sources_source,
-- never by scanning them all. The index is pinned from the catalogue: by org, kind and source, with
-- no WHERE, so gone edges are in it. And given 2,000 edges (of 400 cited records planted with the
-- triggers off for their inserts alone), analysed so the planner's choice doesn't hang on the
-- table's vacuum history or the btrees' heights, sequential scans off and every plan made again, a
-- derived item's insert scans that index. ANALYZE's row count in pg_class outlives the rollback,
-- which is harmless in a scratch database; its statistics don't.
savepoint lcd_35_gone;
select pg_temp.check(pg_get_indexdef('public.provenance_sources_source'::regclass)
                       = 'CREATE INDEX provenance_sources_source ON public.provenance_sources USING btree (org_id, source_kind, source_id)',
                     'provenance_sources_source is not the whole index by org, kind and source, gone edges included (LCD-35)');
select pg_temp.make('1', '4b', 'draft', 'cited', array['suggested_task'], array[pg_temp.pid('1', '23')]);
update public.provenance_sources set gone_at = now() where item = pg_temp.pid('1', '4b');
select pg_temp.expect_error(format('select pg_temp.add_item(%L, %L)', 'derived',
                                   jsonb_build_object('item_kind', 'suggested_task', 'item_id', pg_temp.pid('1', '23'))), '23514',
                            'A derived item''s sources are recorded when it is made, before anything is made from it.');
set local session_replication_role = replica;
with made as (
  insert into public.provenance_items (org_id, created_tx, item_kind, item_id, mode, created_by)
  select pg_temp.id('1', '00'), '1', 'draft', gen_random_uuid(), 'cited', pg_temp.id('1', 'a8') from generate_series(1, 400)
  returning org_id, id)
insert into public.provenance_sources (org_id, item, number, source_kind, source_id)
select m.org_id, m.id, n, 'message', gen_random_uuid() from made m cross join generate_series(1, 5) n;
set local session_replication_role = origin;
analyze public.provenance_sources;
set local enable_seqscan = off;
discard plans;
select set_config('lcd.scans', pg_stat_get_xact_numscans('public.provenance_sources_source'::regclass)::text, true);
set local role hearth_owner;
select pg_temp.add_item('derived', '{}');
reset role;
select pg_temp.check(pg_stat_get_xact_numscans('public.provenance_sources_source'::regclass) > current_setting('lcd.scans')::bigint,
                     'a derived item''s insert didn''t read the edges naming it through provenance_sources_source (LCD-35)');
rollback to savepoint lcd_35_gone;
-- W (44), withdrawn, is no source; nor is a derived item with no record, refused alike (LCD-37 compares
-- a held one with a deleted one).
select pg_temp.plant('1', '44', 'derived', 'derived', array['message'], array[pg_temp.pid('1', '15')], true);
select pg_temp.expect_error(format('select pg_temp.make(%L, %L, %L, %L, %L, %L)', '1', '4c', 'draft', 'cited', array['derived'],
                                   array[pg_temp.itm('1', '44')]), '23514', 'That item is no longer available to be a source.');
select pg_temp.expect_error(format('select pg_temp.make(%L, %L, %L, %L, %L, %L)', '1', '4c', 'draft', 'cited', array['derived'],
                                   array[gen_random_uuid()]), '23514', 'That item is no longer available to be a source.');
-- Passes: a cited item made earlier (45) gains a second source now, its numbering going on; a derived
-- item (46) made now from P1 and a message.
select pg_temp.plant('1', '45', 'draft', 'cited', array['message'], array[pg_temp.pid('1', '15')]);
insert into public.provenance_sources (org_id, item, number, source_kind, source_id)
  values (pg_temp.id('1', '00'), pg_temp.pid('1', '45'), 2, 'message', pg_temp.pid('1', '16'));
select pg_temp.make('1', '46', 'derived', 'derived', array['derived', 'message'], array[pg_temp.itm('1', '43'), pg_temp.pid('1', '16')]);
select pg_temp.check((select count(*) from public.provenance_sources where item in (pg_temp.pid('1', '45'), pg_temp.pid('1', '46'))) = 4,
                     'a cited item''s later source or a derived item made from an earlier one was refused (LCD-35)');
-- The completeness check at the commit, as a producer's transaction meets it: its checked writer runs
-- as the owner, its commit as hearth_app, which holds no grant on either table, so the check is a
-- definer. A derived item with its one source passes, and then gets no second source, though the check
-- has fired; one recorded with two and given one refuses on substance, never 42501.
savepoint lcd_35_commit;
set local role hearth_owner;
select pg_temp.make('1', '4d', 'derived', 'derived', array['message'], array[pg_temp.pid('1', '15')]);
set local role hearth_app;
set constraints provenance_items_complete immediate;
set constraints provenance_items_complete deferred;
set local role hearth_owner;
select pg_temp.expect_error(format($$insert into public.provenance_sources (org_id, item, number, source_kind, source_id)
  values (%L, %L, 2, 'message', %L)$$, pg_temp.id('1', '00'), pg_temp.pid('1', '4d'), pg_temp.pid('1', '16')), '23514',
  'A derived item has only as many sources as it was made with.');
select pg_temp.add_item('derived', jsonb_build_object('id', pg_temp.pid('1', '4e'), 'source_count', 2));
insert into public.provenance_sources (org_id, item, number, source_kind, source_id)
  values (pg_temp.id('1', '00'), pg_temp.pid('1', '4e'), 1, 'message', pg_temp.pid('1', '15'));
set local role hearth_app;
select pg_temp.expect_error('set constraints provenance_items_complete immediate', '23514',
                            'A derived item''s sources are all recorded when it is made.');
reset role;
rollback to savepoint lcd_35_commit;
-- More sources than the count, each in a transaction of its own so no other item's check is pending:
-- one recorded with one and given two in one insert is refused at the second; and, should an edge get
-- past the insert trigger (planted here with the triggers off for the edges alone), the deferred
-- check refuses more as it refuses fewer.
savepoint lcd_35_more;
set local role hearth_owner;
select pg_temp.add_item('derived', jsonb_build_object('id', pg_temp.pid('1', '4f'), 'source_count', 1));
select pg_temp.expect_error(format($$insert into public.provenance_sources (org_id, item, number, source_kind, source_id)
  values (%L, %L, 1, 'message', %L), (%L, %L, 2, 'message', %L)$$, pg_temp.id('1', '00'), pg_temp.pid('1', '4f'),
  pg_temp.pid('1', '15'), pg_temp.id('1', '00'), pg_temp.pid('1', '4f'), pg_temp.pid('1', '16')), '23514',
  'A derived item has only as many sources as it was made with.');
reset role;
rollback to savepoint lcd_35_more;
savepoint lcd_35_extra;
set local role hearth_owner;
select pg_temp.add_item('derived', jsonb_build_object('id', pg_temp.pid('1', '4f'), 'source_count', 1));
reset role;
set local session_replication_role = replica;
insert into public.provenance_sources (org_id, item, number, source_kind, source_id)
  values (pg_temp.id('1', '00'), pg_temp.pid('1', '4f'), 1, 'message', pg_temp.pid('1', '15')),
         (pg_temp.id('1', '00'), pg_temp.pid('1', '4f'), 2, 'message', pg_temp.pid('1', '16'));
set local session_replication_role = origin;
set local role hearth_app;
select pg_temp.expect_error('set constraints provenance_items_complete immediate', '23514',
                            'A derived item''s sources are all recorded when it is made.');
reset role;
rollback to savepoint lcd_35_extra;
select pg_temp.check(p.prosecdef and p.proconfig = array['search_path=""'],
                     'provenance_items_complete() isn''t a definer with search_path = '''' (LCD-35)')
from pg_proc p where p.oid = 'public.provenance_items_complete()'::regprocedure;
-- The state trigger, on W (withdrawn), on the fixture's ee (live) and, in a savepoint, on P1.
select pg_temp.expect_error(format($$update public.provenance_items set fingerprint = 'a2.model:v1' where id = %L$$,
                                   pg_temp.pid('1', '44')), '23514', 'A withdrawn item is final.');
select pg_temp.expect_error(format('update public.provenance_items set item_id = gen_random_uuid() where id = %L', pg_temp.id('1', 'ee')),
                            '23514', 'A provenance item keeps what it is, what it was made from, who made it and when.');
select pg_temp.expect_error(format('update public.provenance_items set source_count = 3 where id = %L', pg_temp.id('1', 'ee')),
                            '23514', 'A provenance item keeps what it is, what it was made from, who made it and when.');
select pg_temp.expect_error(format('update public.provenance_items set created_by = %L where id = %L', pg_temp.id('1', 'a1'),
                                   pg_temp.id('1', 'ee')),
                            '23514', 'A provenance item keeps what it is, what it was made from, who made it and when.');
select pg_temp.expect_error(format($$update public.provenance_items set fingerprint = 'a2.model:v1' where id = %L$$,
                                   pg_temp.id('1', 'ee')),
                            '23514', 'A provenance item''s fingerprint changes only when it is made again from the same sources.');
select pg_temp.expect_error(format($$update public.provenance_items set state = 'withdrawn', withdrawn_at = now(),
  withdrawn_reason = 'source_deleted', acl_tokens = '{}', acl_more = '[]' where id = %L$$, pg_temp.id('1', 'ee')), '23514',
  'A derived item''s access row changes only with a new epoch.');
select pg_temp.expect_error(format($$update public.provenance_items set index_class = 'restricted' where id = %L$$, pg_temp.id('1', 'ee')),
                            '23514', 'A derived item''s access row changes only with a new epoch.');
select pg_temp.expect_error(format('update public.provenance_items set acl_epoch = 0 where id = %L', pg_temp.id('1', 'ee')),
                            '23514', 'A derived item''s access row changes only with a new epoch.');
-- A state outside the three meets the trigger's move rule first, whose message names every move it allows.
select pg_temp.expect_error(format($$update public.provenance_items set state = 'archived' where id = %L$$, pg_temp.id('1', 'ee')),
                            '23514', 'A provenance item moves only from live to stale, from live or stale to withdrawn, and from stale back to live.');
savepoint lcd_35_state;
select pg_temp.expect_rows(format($$update public.provenance_items set state = 'stale', stale_since = now(),
  stale_reason = 'source_edited' where id = %L$$, pg_temp.pid('1', '43')), 1);
select pg_temp.expect_rows(format('update public.provenance_items set acl_epoch = acl_epoch + 1 where id = %L', pg_temp.pid('1', '43')), 1);
savepoint lcd_35_stale_withdrawn;
select pg_temp.expect_rows(format($$update public.provenance_items set state = 'withdrawn', withdrawn_at = now(),
  withdrawn_reason = 'source_deleted', acl_tokens = '{}', acl_more = '[]', acl_epoch = acl_epoch + 1 where id = %L$$,
  pg_temp.pid('1', '43')), 1);
rollback to savepoint lcd_35_stale_withdrawn;
select pg_temp.expect_error(format($$update public.provenance_items set stale_reason = 'source_acl_changed' where id = %L$$,
                                   pg_temp.pid('1', '43')),
                            '23514', 'A provenance item''s staleness changes only as it goes stale or is made again.');
select pg_temp.expect_rows(format($$update public.provenance_items set state = 'live', stale_since = null, stale_reason = null,
  fingerprint = 'a2.model:v1' where id = %L$$, pg_temp.pid('1', '43')), 1);
rollback to savepoint lcd_35_state;
-- An edge changes only by its gone_at, set once.
savepoint lcd_35_edge;
select pg_temp.expect_rows(format('update public.provenance_sources set gone_at = now() where item = %L and number = 1',
                                  pg_temp.id('1', 'ee')), 1);
select pg_temp.expect_error(format('update public.provenance_sources set gone_at = now() where item = %L and number = 1',
                                   pg_temp.id('1', 'ee')),
                            '23514', 'A source is marked gone once, and otherwise never changes.');
select pg_temp.expect_error(format('update public.provenance_sources set number = 3, gone_at = now() where item = %L and number = 2',
                                   pg_temp.id('1', 'ee')),
                            '23514', 'A source is marked gone once, and otherwise never changes.');
rollback to savepoint lcd_35_edge;

-- LCD-36 (LH-41; C0.10's Done: "deleting a source removes its derived rows"). In org 1: D1 (31)
-- derived earlier from message M (01); D2 (32) derived now from D1; C1 (33), a cited draft citing M;
-- D3 (34) derived now from message M2 (02), which has no record of its own.
select pg_temp.plant('1', '31', 'derived', 'derived', array['message'], array[pg_temp.pid('1', '01')]);
select pg_temp.make('1', '32', 'derived', 'derived', array['derived'], array[pg_temp.itm('1', '31')]);
select pg_temp.make('1', '33', 'draft', 'cited', array['message'], array[pg_temp.pid('1', '01')]);
select pg_temp.make('1', '34', 'derived', 'derived', array['message'], array[pg_temp.pid('1', '02')]);
set local role hearth_owner;
select set_config('app.org_id', pg_temp.id('1', '00')::text, true);
select set_config('lcd.p', pg_temp.logged('1', 'messages', 'messages', pg_temp.pid('1', '01'), 'user')::text, true);
select set_config('lcd.other', pg_temp.logged('2', 'messages', 'messages', pg_temp.pid('2', '01'), 'user')::text, true);
select pg_temp.check(public.lifecycle_cascade('message', pg_temp.pid('1', '01'), current_setting('lcd.p')::bigint, 10) = 2,
                     'the cascade from a deleted message didn''t answer its two derived items (LCD-36)');
select pg_temp.check(not exists (select 1 from public.provenance_items where id in (pg_temp.pid('1', '31'), pg_temp.pid('1', '32')))
                     and not exists (select 1 from public.provenance_sources where item in (pg_temp.pid('1', '31'), pg_temp.pid('1', '32')))
                     and not exists (select 1 from public.provenance_sources
                                     where org_id = pg_temp.id('1', '00') and source_kind = 'message'
                                       and source_id = pg_temp.pid('1', '01') and gone_at is null),
                     'a derived item, or an edge of one, or a live edge naming the deleted message, outlived the cascade (LCD-36)');
select pg_temp.check((select state = 'live' from public.provenance_items where id = pg_temp.pid('1', '33'))
                     and (select gone_at is not null from public.provenance_sources where item = pg_temp.pid('1', '33')),
                     'the cited draft isn''t live with its edge to the deleted message marked gone (LCD-36)');
select pg_temp.check(
  (select string_agg(format('%s %s %s %s %s', d.class_key, d.object_table, d.object_id, d.cause,
                            d.parent_id = current_setting('lcd.p')::bigint), ',' order by d.id)
   from public.deletion_log d where d.object_id in (pg_temp.pid('1', '31')::text, pg_temp.pid('1', '32')::text))
  = format('provenance provenance_items %s cascade t,provenance provenance_items %s cascade t', pg_temp.pid('1', '32'),
           pg_temp.pid('1', '31')),
  'the cascade didn''t log D2 then D1, deepest first, each under its parent (LCD-36)');
-- The definers' refusals.
select pg_temp.expect_error(format('select public.lifecycle_cascade(%L, %L, %s, 0)', 'message', pg_temp.pid('1', '01'),
                                   current_setting('lcd.p')), '22023', 'A cascade deletes 1 to 500 items at a time.');
select pg_temp.expect_error(format('select public.lifecycle_cascade(%L, %L, %s, 501)', 'message', pg_temp.pid('1', '01'),
                                   current_setting('lcd.p')), '22023', 'A cascade deletes 1 to 500 items at a time.');
select pg_temp.expect_error(format('select public.lifecycle_cascade(%L, %L, null, 10)', 'message', pg_temp.pid('1', '01')),
                            '22023', 'A cascade follows a deletion logged in this org.');
select pg_temp.expect_error(format('select public.lifecycle_cascade(%L, %L, %s, 10)', 'message', pg_temp.pid('1', '01'),
                                   current_setting('lcd.other')), '22023', 'A cascade follows a deletion logged in this org.');
select pg_temp.expect_error(format('select public.lifecycle_cascade(%L, %L, %s, 10)', 'Message', pg_temp.pid('1', '01'),
                                   current_setting('lcd.p')), '22023', 'That record can''t have anything made from it.');
select pg_temp.expect_error(format('select public.provenance_forget(%L, %L, %L, null)', 'draft', pg_temp.itm('1', '33'), 'cascade'),
                            '22023', 'An item''s provenance goes with its logged deletion, or as a withdrawn leftover.');
select pg_temp.expect_error(format('select public.provenance_forget(%L, %L, %L, %s)', 'draft', pg_temp.itm('1', '33'), 'retention',
                                   current_setting('lcd.p')),
                            '22023', 'An item''s provenance goes with its logged deletion, or as a withdrawn leftover.');
select pg_temp.expect_error(format('select public.provenance_forget(%L, %L, %L, null)', 'draft', pg_temp.itm('1', '33'), 'user'),
                            '22023', 'An item''s provenance goes with its logged deletion, or as a withdrawn leftover.');
select pg_temp.expect_error(format('select public.provenance_forget(%L, %L, %L, %s)', 'draft', pg_temp.itm('1', '33'), 'cascade',
                                   current_setting('lcd.other')), '22023', 'A cascade follows a deletion logged in this org.');
select pg_temp.check(exists (select 1 from public.provenance_items where id = pg_temp.pid('1', '33'))
                     and (select count(*) from public.deletion_log where org_id = pg_temp.id('1', '00') and class_key = 'provenance') = 2,
                     'a refused provenance_forget() deleted or logged something (LCD-36)');
-- The draft's own deletion takes its record, and its edge, with it.
select set_config('lcd.c1', pg_temp.logged('1', 'messages', 'drafts', pg_temp.itm('1', '33'), 'user')::text, true);
select pg_temp.check(public.provenance_forget('draft', pg_temp.itm('1', '33'), 'cascade', current_setting('lcd.c1')::bigint) = 1,
                     'a draft''s own provenance didn''t go with it (LCD-36)');
select pg_temp.check(not exists (select 1 from public.provenance_items where id = pg_temp.pid('1', '33'))
                     and not exists (select 1 from public.provenance_sources where item = pg_temp.pid('1', '33'))
                     and (select count(*) from public.deletion_log
                          where object_id = pg_temp.pid('1', '33')::text and class_key = 'provenance' and cause = 'cascade'
                            and parent_id = current_setting('lcd.c1')::bigint) = 1,
                     'the draft''s record or edge outlived it, or wasn''t logged once under its deletion (LCD-36)');
-- A message has no record of its own (C1.1's), so its deletion only cascades.
select set_config('lcd.p2', pg_temp.logged('1', 'messages', 'messages', pg_temp.pid('1', '02'), 'user')::text, true);
select pg_temp.check(public.provenance_forget('message', pg_temp.pid('1', '02'), 'cascade', current_setting('lcd.p2')::bigint) = 1,
                     'an item with no record didn''t cascade to what was made from it (LCD-36)');
select pg_temp.check(not exists (select 1 from public.provenance_items where id = pg_temp.pid('1', '34')),
                     'an item with no record didn''t cascade to what was made from it (LCD-36)');
select pg_temp.check(public.provenance_forget('draft', gen_random_uuid(), 'retention', null) = 0,
                     'a leftover with no record didn''t answer 0 (LCD-36)');
select pg_temp.expect_error(format('select public.provenance_forget(%L, %L, %L, null)', 'derived', pg_temp.id('1', 'fa'), 'retention'),
                            '22023', 'Only a withdrawn item''s provenance goes on its own.');
reset role;

-- LCD-37 (LH-50, LH-41): held through provenance, and kept. An active legal hold on a8 (held by
-- nothing in the fixture), placed by a6, so a8's device e1 is a held source for the rest of the file.
insert into public.legal_holds (org_id, client_key, target_kind, target_id, reason, placed_by)
  values (pg_temp.id('1', '00'), gen_random_uuid(), 'person', pg_temp.id('1', 'a8'), 'Fixture matter about made-up summaries',
          pg_temp.id('1', 'a6'));
select pg_temp.make('1', '35', 'derived', 'derived', array['message', 'device'], array[pg_temp.pid('1', '04'), pg_temp.id('1', 'e1')]);
select pg_temp.make('1', '36', 'derived', 'derived', array['message', 'file'], array[pg_temp.pid('1', '05'), pg_temp.pid('1', '21')]);
select pg_temp.make('1', '37', 'derived', 'derived', array['message', 'device'], array[pg_temp.pid('1', '06'), pg_temp.id('1', 'e1')]);
select pg_temp.make('1', '38', 'derived', 'derived', array['person'], array[pg_temp.id('1', 'a8')]);
select pg_temp.plant('1', '3a', 'derived', 'derived', array['device'], array[pg_temp.id('1', 'e1')]);
select pg_temp.make('1', '3b', 'derived', 'derived', array['derived', 'message'], array[pg_temp.itm('1', '3a'), pg_temp.pid('1', '08')]);
select pg_temp.plant('1', '3c', 'derived', 'derived', array['message'], array[pg_temp.pid('1', '09')]);
select pg_temp.make('1', '3d', 'derived', 'derived', array['derived', 'device'], array[pg_temp.itm('1', '3c'), pg_temp.id('1', 'e1')]);
select pg_temp.make('1', '3e', 'suggested_task', 'derived', array['message'], array[pg_temp.pid('1', '0d')]);
select pg_temp.make('1', '72', 'derived', 'derived', array['message'], array[pg_temp.pid('1', '0c')]);
select pg_temp.make('1', '73', 'derived', 'derived', array['message'], array[pg_temp.pid('1', '0c')]);
select pg_temp.make('1', '74', 'derived', 'derived', array['message', 'device'], array[pg_temp.pid('1', '10'), pg_temp.id('1', 'e1')]);
select pg_temp.make('1', '75', 'derived', 'derived', array['message'], array[pg_temp.pid('1', '10')]);
set local role hearth_owner;
select set_config('app.org_id', pg_temp.id('1', '00')::text, true);
-- D4 (35), from M4 and the held device: withdrawn, nobody's, its epoch up, and kept; its M4 edge gone,
-- its device edge live.
select set_config('lcd.p4', pg_temp.logged('1', 'messages', 'messages', pg_temp.pid('1', '04'), 'user')::text, true);
select pg_temp.check(public.lifecycle_cascade('message', pg_temp.pid('1', '04'), current_setting('lcd.p4')::bigint, 10) = 0,
                     'the cascade deleted an item with a held source (LCD-37)');
select pg_temp.check((select state = 'withdrawn' and withdrawn_reason = 'source_deleted' and acl_tokens = '{}' and acl_more = '[]'
                             and acl_epoch = 2
                      from public.provenance_items where id = pg_temp.pid('1', '35'))
                     and (select gone_at is not null from public.provenance_sources where item = pg_temp.pid('1', '35') and number = 1)
                     and (select gone_at is null from public.provenance_sources where item = pg_temp.pid('1', '35') and number = 2),
                     'an item kept for its held source isn''t withdrawn and nobody''s with its deleted source''s edge gone (LCD-37)');
-- D5 (36), from M5 and a file (no resolver before C4.1): kept, failing closed.
select set_config('lcd.p5', pg_temp.logged('1', 'messages', 'messages', pg_temp.pid('1', '05'), 'user')::text, true);
select pg_temp.check(public.lifecycle_cascade('message', pg_temp.pid('1', '05'), current_setting('lcd.p5')::bigint, 10) = 0,
                     'an item with a source of a kind Hearth can''t judge yet wasn''t kept withdrawn (LCD-37)');
select pg_temp.check((select state = 'withdrawn' from public.provenance_items where id = pg_temp.pid('1', '36')),
                     'an item with a source of a kind Hearth can''t judge yet wasn''t kept withdrawn (LCD-37)');
-- A redaction leaves the source's edges live: D6 (37), from M6 and the held device, is kept with
-- source_redacted and both edges live, and a leftover sweep of it answers 0 and logs nothing.
select set_config('lcd.p6', pg_temp.logged('1', 'messages', 'messages', pg_temp.pid('1', '06'), 'redaction')::text, true);
select pg_temp.check(public.lifecycle_cascade('message', pg_temp.pid('1', '06'), current_setting('lcd.p6')::bigint, 10) = 0,
                     'a redaction marked its source''s edges gone, or didn''t withdraw what was made from it (LCD-37)');
select pg_temp.check((select state = 'withdrawn' and withdrawn_reason = 'source_redacted'
                          from public.provenance_items where id = pg_temp.pid('1', '37'))
                     and not exists (select 1 from public.provenance_sources where item = pg_temp.pid('1', '37') and gone_at is not null),
                     'a redaction marked its source''s edges gone, or didn''t withdraw what was made from it (LCD-37)');
select pg_temp.expect_error(format('select public.provenance_forget(%L, %L, %L, null)', 'derived', pg_temp.itm('1', '37'), 'retention'),
                            '22023', 'A withdrawn item''s provenance goes with the cause its withdrawal gave it.');
select pg_temp.check(public.provenance_forget('derived', pg_temp.itm('1', '37'), 'redaction', null) = 0,
                     'a held redacted leftover went, or was logged (LCD-37)');
select pg_temp.check(not exists (select 1 from public.deletion_log where object_id = pg_temp.pid('1', '37')::text),
                     'a held redacted leftover went, or was logged (LCD-37)');
-- A redacted source that is itself held keeps what was made from it: D14 (38), from a8 alone.
select set_config('lcd.p14', pg_temp.logged('1', 'roster', 'people', pg_temp.id('1', 'a8'), 'redaction')::text, true);
select pg_temp.check(public.lifecycle_cascade('person', pg_temp.id('1', 'a8'), current_setting('lcd.p14')::bigint, 10) = 0,
                     'a held redacted source didn''t keep what was made from it (LCD-37)');
select pg_temp.check((select state = 'withdrawn' and withdrawn_reason = 'source_redacted'
                          from public.provenance_items where id = pg_temp.pid('1', '38'))
                     and (select gone_at is null from public.provenance_sources where item = pg_temp.pid('1', '38')),
                     'a held redacted source didn''t keep what was made from it (LCD-37)');
-- An unheld one doesn't: D15 (39), from a4 alone, whom nothing holds.
savepoint lcd_37_unheld;
select pg_temp.make('1', '39', 'derived', 'derived', array['person'], array[pg_temp.id('1', 'a4')]);
select set_config('lcd.p15', pg_temp.logged('1', 'roster', 'people', pg_temp.id('1', 'a4'), 'redaction')::text, true);
select pg_temp.check(public.lifecycle_cascade('person', pg_temp.id('1', 'a4'), current_setting('lcd.p15')::bigint, 10) = 1,
                     'what was made from an unheld redacted source wasn''t deleted, logged once under it (LCD-37)');
select pg_temp.check(not exists (select 1 from public.provenance_items where id = pg_temp.pid('1', '39'))
                     and not exists (select 1 from public.provenance_sources where item = pg_temp.pid('1', '39'))
                     and (select count(*) from public.deletion_log
                          where object_id = pg_temp.pid('1', '39')::text and parent_id = current_setting('lcd.p15')::bigint) = 1,
                     'what was made from an unheld redacted source wasn''t deleted, logged once under it (LCD-37)');
rollback to savepoint lcd_37_unheld;
-- Through an intermediate: D8 (3b), from D7 (3a, from the held device) and M8, is kept.
select set_config('lcd.p8', pg_temp.logged('1', 'messages', 'messages', pg_temp.pid('1', '08'), 'user')::text, true);
select pg_temp.check(public.lifecycle_cascade('message', pg_temp.pid('1', '08'), current_setting('lcd.p8')::bigint, 10) = 0,
                     'an item held through its derived source went, or that source was withdrawn (LCD-37)');
select pg_temp.check((select state = 'withdrawn' from public.provenance_items where id = pg_temp.pid('1', '3b'))
                     and (select state = 'live' from public.provenance_items where id = pg_temp.pid('1', '3a')),
                     'an item held through its derived source went, or that source was withdrawn (LCD-37)');
-- An intermediate deleted: D9 (3c, from M9) goes; D10 (3d, from D9 and the held device) is kept, its
-- edge to D9 marked gone.
select set_config('lcd.p9', pg_temp.logged('1', 'messages', 'messages', pg_temp.pid('1', '09'), 'user')::text, true);
select pg_temp.check(public.lifecycle_cascade('message', pg_temp.pid('1', '09'), current_setting('lcd.p9')::bigint, 10) = 1,
                     'the intermediate wasn''t deleted, or what was made from it lost its hold or kept a live edge to it (LCD-37)');
select pg_temp.check(not exists (select 1 from public.provenance_items where id = pg_temp.pid('1', '3c'))
                     and (select state = 'withdrawn' from public.provenance_items where id = pg_temp.pid('1', '3d'))
                     and (select gone_at is not null from public.provenance_sources where item = pg_temp.pid('1', '3d') and number = 1)
                     and (select gone_at is null from public.provenance_sources where item = pg_temp.pid('1', '3d') and number = 2),
                     'the intermediate wasn''t deleted, or what was made from it lost its hold or kept a live edge to it (LCD-37)');
-- Nothing is made from either now, and the refusals are the same, so whether a hold kept an item never
-- shows (T23 item 10): D4, withdrawn and kept for its held source, and D9, deleted.
select pg_temp.check(pg_temp.refusal(format('select pg_temp.make(%L, %L, %L, %L, %L, %L)', '1', '4c', 'draft', 'cited', array['derived'],
                                            array[pg_temp.itm('1', '35')]))
                       = pg_temp.refusal(format('select pg_temp.make(%L, %L, %L, %L, %L, %L)', '1', '4c', 'draft', 'cited',
                                                array['derived'], array[pg_temp.itm('1', '3c')]))
                     and pg_temp.refusal(format('select pg_temp.make(%L, %L, %L, %L, %L, %L)', '1', '4c', 'draft', 'cited',
                                                array['derived'], array[pg_temp.itm('1', '35')]))
                         like '23514 That item is no longer available to be a source. PL/pgSQL function public.provenance_sources_insert() line %',
                     'a source a hold kept and a deleted one aren''t refused alike (LCD-37)');
-- Another derived-mode kind stays: S1 (3e), a suggested task from M13 alone, nothing holding it, is
-- withdrawn, nobody's and kept (its content would live in its own table), and a sweep answers 0.
select set_config('lcd.p13', pg_temp.logged('1', 'messages', 'messages', pg_temp.pid('1', '0d'), 'user')::text, true);
select pg_temp.check(public.lifecycle_cascade('message', pg_temp.pid('1', '0d'), current_setting('lcd.p13')::bigint, 10) = 0,
                     'a suggested task made from a deleted message wasn''t kept withdrawn and nobody''s (LCD-37)');
select pg_temp.check((select state = 'withdrawn' and acl_tokens = '{}' and acl_more = '[]'
                          from public.provenance_items where id = pg_temp.pid('1', '3e')),
                     'a suggested task made from a deleted message wasn''t kept withdrawn and nobody''s (LCD-37)');
select pg_temp.check(public.provenance_forget('suggested_task', pg_temp.itm('1', '3e'), 'retention', null) = 0,
                     'a withdrawn suggested task''s record went on its own, or was logged (LCD-37)');
select pg_temp.check(not exists (select 1 from public.deletion_log where object_id = pg_temp.pid('1', '3e')::text),
                     'a withdrawn suggested task''s record went on its own, or was logged (LCD-37)');
-- The seam, by replacement as later steps will (194's LCD-41 does the containment seam): Hearth
-- learns channel (about nobody) and suggested_task (S2's owner a8), each replacement answering only
-- the kinds this block touches. D11 (3f), from M11 and channel K (22), is kept while a hold on K is
-- active and goes once it is released; S2 (71), a suggested task from a4 alone, is held through its
-- own kind's people, by is_held() and the guard alike. The block's rollback undoes it all.
savepoint lcd_37_seam;
create or replace function public.lifecycle_kinds() returns setof text
language sql immutable set search_path = '' as $f$
  values ('person'), ('device'), ('derived'), ('channel'), ('suggested_task')
$f$;
create or replace function public.lifecycle_persons_of(org uuid, kind text, id uuid) returns uuid[]
language plpgsql stable set search_path = '' as $f$
begin
  if not exists (select 1 from public.lifecycle_kinds() k where k = lifecycle_persons_of.kind) then
    raise exception 'Hearth can''t tell yet whether that kind of record is held.' using errcode = 'invalid_parameter_value';
  end if;
  return case lifecycle_persons_of.kind
    when 'person' then array(select p.id from public.people p where p.org_id = org and p.id = lifecycle_persons_of.id)
    when 'device' then array(select x.user_id from public.devices x where x.org_id = org and x.id = lifecycle_persons_of.id)
    when 'suggested_task' then case when lifecycle_persons_of.id = 'f1000000-0000-4000-8000-000000000291'
                                    then array['f1000000-0000-4000-8000-0000000000a8'::uuid] else '{}'::uuid[] end
    else '{}'::uuid[] end;
end
$f$;
select pg_temp.make('1', '3f', 'derived', 'derived', array['message', 'channel'], array[pg_temp.pid('1', '0b'), pg_temp.pid('1', '22')]);
insert into public.legal_holds (id, org_id, client_key, target_kind, target_id, reason, placed_by)
  values (pg_temp.pid('1', '2a'), pg_temp.id('1', '00'), gen_random_uuid(), 'channel', pg_temp.pid('1', '22'),
          'Fixture matter about a made-up channel', pg_temp.id('1', 'a6'));
select set_config('lcd.p11', pg_temp.logged('1', 'messages', 'messages', pg_temp.pid('1', '0b'), 'user')::text, true);
select pg_temp.check(public.lifecycle_cascade('message', pg_temp.pid('1', '0b'), current_setting('lcd.p11')::bigint, 10) = 0,
                     'an item whose source sits under an active hold went (LCD-37)');
select pg_temp.check(public.provenance_forget('derived', pg_temp.itm('1', '3f'), 'retention', null) = 0,
                     'an item whose source sits under an active hold went (LCD-37)');
update public.legal_holds set released_at = now(), released_by = pg_temp.id('1', 'a5'), release_reason = 'The fixture matter ended'
where id = pg_temp.pid('1', '2a');
select pg_temp.check(public.provenance_forget('derived', pg_temp.itm('1', '3f'), 'retention', null) = 1,
                     'a withdrawn leftover didn''t go once its hold was released (LCD-37)');
select pg_temp.check(not exists (select 1 from public.provenance_items where id = pg_temp.pid('1', '3f')),
                     'a withdrawn leftover didn''t go once its hold was released (LCD-37)');
select pg_temp.make('1', '71', 'suggested_task', 'derived', array['person'], array[pg_temp.id('1', 'a4')]);
select pg_temp.check((select string_agg(format('%s %s %s', a.kind, a.item, a.persons), ';')
                      from public.provenance_items p
                      cross join lateral public.lifecycle_row_anchors(p.org_id, 'provenance_items', to_jsonb(p)) a
                      where p.id = pg_temp.pid('1', '71'))
                     = format('suggested_task %s {%s}', pg_temp.itm('1', '71'), pg_temp.id('1', 'a8'))
                     and public.is_held('suggested_task', pg_temp.itm('1', '71')),
                     'a suggested task isn''t anchored and held through its own kind''s people (LCD-37, LH-55)');
select public.log_deletion('provenance', 'provenance_items', pg_temp.pid('1', '71')::text, 'retention', null, null, null, null, false);
select pg_temp.expect_error(format('delete from public.provenance_items where id = %L', pg_temp.pid('1', '71')), 'HF009',
                            'This record is kept for now, so it can''t be deleted.');
rollback to savepoint lcd_37_seam;
select pg_temp.check(not exists (select 1 from public.lifecycle_kinds() k where k = 'channel'),
                     'the seam''s replacements leaked out of their block (LCD-37)');
-- A batch of 1: D12 (72) goes and D13 (73) stays withdrawn.
select set_config('lcd.p12', pg_temp.logged('1', 'messages', 'messages', pg_temp.pid('1', '0c'), 'user')::text, true);
select pg_temp.check(public.lifecycle_cascade('message', pg_temp.pid('1', '0c'), current_setting('lcd.p12')::bigint, 1) = 1,
                     'a batch of 1 didn''t delete exactly one item and leave the other withdrawn (LCD-37)');
select pg_temp.check(not exists (select 1 from public.provenance_items where id = pg_temp.pid('1', '72'))
                     and (select state = 'withdrawn' from public.provenance_items where id = pg_temp.pid('1', '73')),
                     'a batch of 1 didn''t delete exactly one item and leave the other withdrawn (LCD-37)');
-- The batch counts decisions, kept ones too: D16 (74, from M16 and the held device) is decided first
-- and kept, so a batch of 1 deletes nothing and D17 (75, from M16 alone) stays withdrawn; a batch of
-- 2 deletes D17.
select set_config('lcd.p16', pg_temp.logged('1', 'messages', 'messages', pg_temp.pid('1', '10'), 'user')::text, true);
savepoint lcd_37_batch;
select pg_temp.check(public.lifecycle_cascade('message', pg_temp.pid('1', '10'), current_setting('lcd.p16')::bigint, 1) = 0,
                     'a batch of 1 whose one decision kept an item deleted another (LCD-37)');
select pg_temp.check((select count(*) from public.provenance_items
                          where id in (pg_temp.pid('1', '74'), pg_temp.pid('1', '75')) and state = 'withdrawn') = 2,
                     'a batch of 1 whose one decision kept an item deleted another (LCD-37)');
rollback to savepoint lcd_37_batch;
select pg_temp.check(public.lifecycle_cascade('message', pg_temp.pid('1', '10'), current_setting('lcd.p16')::bigint, 2) = 1,
                     'a batch of 2 didn''t keep D16 and delete D17 (LCD-37)');
select pg_temp.check(not exists (select 1 from public.provenance_items where id = pg_temp.pid('1', '75'))
                     and exists (select 1 from public.provenance_items where id = pg_temp.pid('1', '74')),
                     'a batch of 2 didn''t keep D16 and delete D17 (LCD-37)');
select pg_temp.check(public.is_held('derived', pg_temp.itm('1', '35')) and not public.is_held('derived', gen_random_uuid()),
                     'is_held() doesn''t answer a derived item with a held source held, and one with no record not (LCD-37)');
reset role;

-- LCD-38 (LH-42): staleness and withdrawal. Ds1 (76) derived earlier from Ms (11); Ds2 (77) derived
-- now from Ds1; Cs (78) a cited draft citing Ms; Dx (70) derived now from Cs, which no walk from Ms
-- reaches, since a walk never passes through a cited item (LH-41, LH-50); Dw (79) derived now from Ms
-- and Mo (14), withdrawn by Mo's deletion. A record deleted in C0 must have no live source of a kind
-- Hearth can't judge yet, so the correction's source is a person, a4: Dc1 (7a) derived earlier from
-- a4; Cc2 (7d) a cited draft citing Dc1, made before the withdrawal; Dc2 (7b) derived now from Dc1; Cc
-- (7c) a cited draft citing a4. Stale items are withdrawn as live ones are, by a deletion or a
-- redaction of their source.
select pg_temp.plant('1', '76', 'derived', 'derived', array['message'], array[pg_temp.pid('1', '11')]);
select pg_temp.make('1', '77', 'derived', 'derived', array['derived'], array[pg_temp.itm('1', '76')]);
select pg_temp.make('1', '78', 'draft', 'cited', array['message'], array[pg_temp.pid('1', '11')]);
select pg_temp.make('1', '70', 'derived', 'derived', array['draft'], array[pg_temp.itm('1', '78')]);
select pg_temp.make('1', '79', 'derived', 'derived', array['message', 'message'], array[pg_temp.pid('1', '11'), pg_temp.pid('1', '14')]);
select pg_temp.plant('1', '7a', 'derived', 'derived', array['person'], array[pg_temp.id('1', 'a4')]);
select pg_temp.make('1', '7d', 'draft', 'cited', array['derived'], array[pg_temp.itm('1', '7a')]);
select pg_temp.make('1', '7b', 'derived', 'derived', array['derived'], array[pg_temp.itm('1', '7a')]);
select pg_temp.make('1', '7c', 'draft', 'cited', array['person'], array[pg_temp.id('1', 'a4')]);
set local role hearth_owner;
select set_config('app.org_id', pg_temp.id('1', '00')::text, true);
select pg_temp.check(public.withdraw_dependants('message', pg_temp.pid('1', '14'), 'source_deleted') = 1,
                     'withdrawing what was made from Mo didn''t withdraw Dw alone (LCD-38)');
select pg_temp.check(public.provenance_mark_stale('message', pg_temp.pid('1', '11'), 'source_edited') = 2,
                     'an edit didn''t mark exactly Ds1 and Ds2 stale (LCD-38)');
select pg_temp.check((select count(*) = 2 and bool_and(state = 'stale' and stale_since is not null and stale_reason = 'source_edited')
                      from public.provenance_items where id in (pg_temp.pid('1', '76'), pg_temp.pid('1', '77')))
                     and (select state = 'live' and stale_since is null from public.provenance_items where id = pg_temp.pid('1', '78'))
                     and (select state = 'withdrawn' and stale_since is null
                          from public.provenance_items where id = pg_temp.pid('1', '79')),
                     'staleness wasn''t set on exactly the live derived items, with its time and reason (LCD-38)');
select set_config('lcd.since', (select stale_since::text from public.provenance_items where id = pg_temp.pid('1', '76')), true);
select pg_temp.check(public.provenance_mark_stale('message', pg_temp.pid('1', '11'), 'source_edited') = 0,
                     'a second edit marked a stale item again or moved its time (LCD-38)');
select pg_temp.check((select stale_since::text from public.provenance_items where id = pg_temp.pid('1', '76'))
                       = current_setting('lcd.since'),
                     'a second edit marked a stale item again or moved its time (LCD-38)');
select pg_temp.expect_error(format('select public.provenance_mark_stale(%L, %L, %L)', 'message', pg_temp.pid('1', '11'), 'source_deleted'),
                            '22023', 'That isn''t a reason to mark what was made from a record stale.');
-- Ds1 and Ds2 are stale now. Ms deleted: both are withdrawn, then deleted, Ds2 first, each logged under
-- Ms's deletion (Dw stays, its live edge to Mo a kind Hearth can't judge yet); Cs, and Dx made from it,
-- stay live. Each block undone, so LCD-40 still walks from Ms; each check in a statement of its own,
-- after the call's.
savepoint lcd_38_stale_deleted;
select set_config('lcd.ps', pg_temp.logged('1', 'messages', 'messages', pg_temp.pid('1', '11'), 'user')::text, true);
select pg_temp.check(public.lifecycle_cascade('message', pg_temp.pid('1', '11'), current_setting('lcd.ps')::bigint, 500) = 2,
                     'a deleted source''s stale dependants weren''t withdrawn and deleted (LCD-38)');
select pg_temp.check(not exists (select 1 from public.provenance_items where id in (pg_temp.pid('1', '76'), pg_temp.pid('1', '77')))
                     and (select string_agg(object_id, ',' order by id) from public.deletion_log
                          where parent_id = current_setting('lcd.ps')::bigint and cause = 'cascade')
                         = format('%s,%s', pg_temp.pid('1', '77'), pg_temp.pid('1', '76'))
                     and (select count(*) from public.provenance_items
                          where id in (pg_temp.pid('1', '78'), pg_temp.pid('1', '70')) and state = 'live') = 2,
                     'a deleted source''s stale dependants weren''t withdrawn and deleted, each logged under it, or the cited '
                     'draft or what was made from it went (LCD-38)');
rollback to savepoint lcd_38_stale_deleted;
-- Ms redacted: both withdrawn with source_redacted, nobody's, their epochs up, their staleness kept and
-- their edges live, and kept, since Ms is a kind Hearth can't judge yet; Cs and Dx untouched.
savepoint lcd_38_stale_redacted;
select set_config('lcd.ps', pg_temp.logged('1', 'messages', 'messages', pg_temp.pid('1', '11'), 'redaction')::text, true);
select pg_temp.check(public.lifecycle_cascade('message', pg_temp.pid('1', '11'), current_setting('lcd.ps')::bigint, 500) = 0,
                     'a redacted source''s stale dependants weren''t kept (LCD-38)');
select pg_temp.check((select count(*) = 2 and bool_and(state = 'withdrawn' and withdrawn_reason = 'source_redacted' and acl_tokens = '{}'
                                                       and acl_more = '[]' and acl_epoch = 2 and stale_since is not null
                                                       and stale_reason = 'source_edited')
                      from public.provenance_items where id in (pg_temp.pid('1', '76'), pg_temp.pid('1', '77')))
                     and not exists (select 1 from public.provenance_sources
                                     where item in (pg_temp.pid('1', '76'), pg_temp.pid('1', '77'), pg_temp.pid('1', '78'),
                                                    pg_temp.pid('1', '70')) and gone_at is not null)
                     and (select count(*) from public.provenance_items
                          where id in (pg_temp.pid('1', '78'), pg_temp.pid('1', '70')) and state = 'live') = 2,
                     'a redacted source''s stale dependants aren''t withdrawn and nobody''s with their staleness kept and their '
                     'edges live, or the cited draft or what was made from it changed (LCD-38)');
rollback to savepoint lcd_38_stale_redacted;
-- Cs's own deletion does reach what was made from it: Dx goes as its cascade, logged under Cs's record.
savepoint lcd_38_cited_source;
select set_config('lcd.pc', pg_temp.logged('1', 'messages', 'drafts', pg_temp.itm('1', '78'), 'user')::text, true);
select pg_temp.check(public.provenance_forget('draft', pg_temp.itm('1', '78'), 'cascade', current_setting('lcd.pc')::bigint) = 2,
                     'a cited draft''s deletion didn''t take what was made from it (LCD-38)');
select pg_temp.check(not exists (select 1 from public.provenance_items where id in (pg_temp.pid('1', '78'), pg_temp.pid('1', '70')))
                     and (select cause = 'cascade' and parent_id = (select d.id from public.deletion_log d
                                                                    where d.object_id = pg_temp.pid('1', '78')::text)
                          from public.deletion_log where object_id = pg_temp.pid('1', '70')::text),
                     'a cited draft''s deletion didn''t take what was made from it, logged under its record (LCD-38)');
rollback to savepoint lcd_38_cited_source;
-- A correction of a4: Dc1 and Dc2 withdrawn, nobody's, their epochs up, the edges live; the cited
-- drafts untouched.
select pg_temp.check(public.withdraw_dependants('person', pg_temp.id('1', 'a4'), 'source_corrected') = 2,
                     'a correction didn''t withdraw Dc1 and Dc2 (LCD-38)');
select pg_temp.check((select count(*) = 2 and bool_and(state = 'withdrawn' and withdrawn_reason = 'source_corrected' and acl_tokens = '{}'
                                                       and acl_more = '[]' and acl_epoch = 2)
                      from public.provenance_items where id in (pg_temp.pid('1', '7a'), pg_temp.pid('1', '7b')))
                     and not exists (select 1 from public.provenance_sources
                                     where item in (pg_temp.pid('1', '7a'), pg_temp.pid('1', '7b'), pg_temp.pid('1', '7c'),
                                                    pg_temp.pid('1', '7d')) and gone_at is not null)
                     and (select count(*) from public.provenance_items
                          where id in (pg_temp.pid('1', '7c'), pg_temp.pid('1', '7d')) and state = 'live') = 2,
                     'a correction''s withdrawal isn''t transitive, nobody''s and with its edges live, or touched a cited draft (LCD-38)');
-- The corrected leftover goes only as a correction: retention or redaction is refused (22023), deleting
-- and logging nothing.
select pg_temp.expect_error(format('select public.provenance_forget(%L, %L, %L, null)', 'derived', pg_temp.itm('1', '7a'), 'retention'),
                            '22023', 'A withdrawn item''s provenance goes with the cause its withdrawal gave it.');
select pg_temp.expect_error(format('select public.provenance_forget(%L, %L, %L, null)', 'derived', pg_temp.itm('1', '7a'), 'redaction'),
                            '22023', 'A withdrawn item''s provenance goes with the cause its withdrawal gave it.');
select pg_temp.check((select count(*) from public.provenance_items where id in (pg_temp.pid('1', '7a'), pg_temp.pid('1', '7b'))) = 2
                     and not exists (select 1 from public.deletion_log
                                     where object_id in (pg_temp.pid('1', '7a')::text, pg_temp.pid('1', '7b')::text)),
                     'a leftover swept with a cause its withdrawal didn''t give went, or was logged (LCD-38)');
-- The corrected leftover goes as a correction, with no parent; Dc2 as its cascade; Cc2 stays live with
-- its edge to Dc1 now gone, and no live edge names Dc1.
select pg_temp.check(public.provenance_forget('derived', pg_temp.itm('1', '7a'), 'correction', null) = 2,
                     'the corrected leftover and what was made from it didn''t go (LCD-38)');
select pg_temp.check((select cause = 'correction' and parent_id is null
                      from public.deletion_log where object_id = pg_temp.pid('1', '7a')::text)
                     and (select cause = 'cascade' and parent_id = (select d.id from public.deletion_log d
                                                                    where d.object_id = pg_temp.pid('1', '7a')::text)
                          from public.deletion_log where object_id = pg_temp.pid('1', '7b')::text)
                     and not exists (select 1 from public.provenance_items where id in (pg_temp.pid('1', '7a'), pg_temp.pid('1', '7b')))
                     and (select state = 'live' from public.provenance_items where id = pg_temp.pid('1', '7d'))
                     and (select gone_at is not null from public.provenance_sources where item = pg_temp.pid('1', '7d'))
                     and not exists (select 1 from public.provenance_sources
                                     where org_id = pg_temp.id('1', '00') and source_kind = 'derived'
                                       and source_id = pg_temp.itm('1', '7a') and gone_at is null),
                     'the correction''s log rows, or the cited draft''s edge to the forgotten record, are wrong (LCD-38)');
select pg_temp.expect_error(format('select public.withdraw_dependants(%L, %L, %L)', 'message', pg_temp.pid('1', '11'), 'source_edited'),
                            '22023', 'That isn''t a reason to withdraw what was made from a record.');
reset role;

-- LCD-39 (LH-11, LH-12): the guard on both tables, as the owner and as the superuser, each try undone.
do $$
declare
  who text;
begin
  foreach who in array array['hearth_owner', 'none'] loop
    perform set_config('role', who, true);
    perform pg_temp.expect_error(format('delete from public.provenance_items where id = %L', pg_temp.id('1', 'ee')), 'HF010',
                                 'Rows here are deleted only through Hearth''s deletion code, which logs each one.');
    begin
      perform set_config('app.org_id', pg_temp.id('1', '00')::text, true);
      perform public.log_deletion('provenance', 'provenance_items', pg_temp.id('1', 'ee')::text, 'retention', null, null, null, null,
                                  false);
      perform pg_temp.expect_error(format('delete from public.provenance_sources where item = %L', pg_temp.id('1', 'ee')), 'HF010',
                                   'A source is deleted only with its item, after it.');
      -- The backstop: D4's live source is the held device, so even logged it is refused.
      perform public.log_deletion('provenance', 'provenance_items', pg_temp.pid('1', '35')::text, 'retention', null, null, null, null,
                                  false);
      perform pg_temp.expect_error(format('delete from public.provenance_items where id = %L', pg_temp.pid('1', '35')), 'HF009',
                                   'This record is kept for now, so it can''t be deleted.');
      raise exception 'undo' using errcode = 'P0001';
    exception when sqlstate 'P0001' then
      if sqlerrm <> 'undo' then raise; end if;
    end;
    perform set_config('role', 'none', true);
  end loop;
end
$$;
-- TRUNCATE. The fixture's rows and this file's leave deferred checks pending (the completeness check
-- and the edges' key to their items), and TRUNCATE refuses a table with pending trigger events (55006)
-- before its foreign-key check or any trigger runs; checking them now, as a transaction of its own
-- would have, lets it reach them (190's LCD-10 does the same for case_steps). Left immediate, a later
-- derived item's check would fire at the end of its own insert, before its edges exist, so both go
-- back to deferred straight after. A plain TRUNCATE of provenance_items, which the edges reference,
-- fails on Postgres's own foreign-key check (0A000); with CASCADE, and of the edges, it reaches the
-- guard (HF010).
set constraints provenance_items_complete, provenance_sources_org_id_item_fkey immediate;
set local client_min_messages = warning;
set local role hearth_owner;
select pg_temp.expect_error('truncate public.provenance_items', '0A000');
select pg_temp.expect_error('truncate public.provenance_items cascade', 'HF010',
                            'Rows here are deleted only through Hearth''s deletion code, never TRUNCATE.');
select pg_temp.expect_error('truncate public.provenance_sources', 'HF010',
                            'Rows here are deleted only through Hearth''s deletion code, never TRUNCATE.');
reset role;
select pg_temp.expect_error('truncate public.provenance_items cascade', 'HF010');
select pg_temp.expect_error('truncate public.provenance_sources', 'HF010');
set constraints provenance_items_complete, provenance_sources_org_id_item_fkey deferred;
set local client_min_messages = notice;
select pg_temp.check((select count(*) from public.provenance_items where org_id = pg_temp.id('1', '00')) > 10
                     and (select count(*) from public.provenance_sources where org_id = pg_temp.id('1', '00')) > 10,
                     'a TRUNCATE emptied a provenance table (LCD-39)');
-- A cited record citing the held device goes, logged, then its edge: a cited item is never held
-- through its sources (LH-50). And an unheld derived record (from a4, whom nothing holds) the same.
-- Each passes the deferred checks.
savepoint lcd_39_cited;
set local role hearth_owner;
select set_config('app.org_id', pg_temp.id('1', '00')::text, true);
select pg_temp.make('1', '7e', 'draft', 'cited', array['device'], array[pg_temp.id('1', 'e1')]);
select public.log_deletion('provenance', 'provenance_items', pg_temp.pid('1', '7e')::text, 'user', null, null, null, null, false);
select pg_temp.expect_rows(format('delete from public.provenance_items where id = %L', pg_temp.pid('1', '7e')), 1);
select pg_temp.expect_rows(format('delete from public.provenance_sources where item = %L', pg_temp.pid('1', '7e')), 1);
set constraints all immediate;
reset role;
rollback to savepoint lcd_39_cited;
savepoint lcd_39_unheld;
set local role hearth_owner;
select set_config('app.org_id', pg_temp.id('1', '00')::text, true);
select pg_temp.make('1', '7f', 'derived', 'derived', array['person'], array[pg_temp.id('1', 'a4')]);
select public.log_deletion('provenance', 'provenance_items', pg_temp.pid('1', '7f')::text, 'retention', null, null, null, null, false);
select pg_temp.expect_rows(format('delete from public.provenance_items where id = %L', pg_temp.pid('1', '7f')), 1);
select pg_temp.expect_rows(format('delete from public.provenance_sources where item = %L', pg_temp.pid('1', '7f')), 1);
set constraints all immediate;
reset role;
rollback to savepoint lcd_39_unheld;

-- LCD-40 (LH-30, ACC-11): scope, privileges, functions, anchors. In org 2, a record with org 1's D7
-- item id (31) and one naming org 1's message Ms (32): neither is ever walked from org 1. A planted
-- cycle in org 1 (a producer breaking LH-43): A (40) from B and Mz (12), B (41) from A, and Dz (42)
-- from Mz beside them.
select pg_temp.plant('2', '31', 'derived', 'derived', array['message'], array[pg_temp.pid('2', '17')], false, pg_temp.itm('1', '3a'));
select pg_temp.plant('2', '32', 'derived', 'derived', array['message'], array[pg_temp.pid('1', '11')]);
select pg_temp.plant('1', '40', 'derived', 'derived', array['derived', 'message'], array[pg_temp.itm('1', '41'), pg_temp.pid('1', '12')]);
select pg_temp.plant('1', '41', 'derived', 'derived', array['derived'], array[pg_temp.itm('1', '40')]);
select pg_temp.plant('1', '42', 'derived', 'derived', array['message'], array[pg_temp.pid('1', '12')]);
set local role hearth_owner;
select set_config('app.org_id', pg_temp.id('1', '00')::text, true);
-- lifecycle_sources_of(): live edges only (D8's to M8 is gone), through derived items (D7's device),
-- within the org; nothing for a cited item.
select pg_temp.check((select string_agg(format('%s %s', s.source_kind, s.source_id), ',' order by s.source_kind, s.source_id)
                      from public.lifecycle_sources_of(pg_temp.id('1', '00'), 'derived', pg_temp.itm('1', '3b')) s)
                     = format('derived %s,device %s', pg_temp.itm('1', '3a'), pg_temp.id('1', 'e1'))
                     and not exists (select 1 from public.lifecycle_sources_of(pg_temp.id('1', '00'), 'draft', pg_temp.itm('1', '78'))),
                     'lifecycle_sources_of() isn''t the live closure through derived items within the org (LCD-40)');
-- Nor through a cited item: Dx's closure stops at Cs, never reaching Ms; and LCD-38's withdrawals left
-- Dx live and readable.
select pg_temp.check((select string_agg(format('%s %s', s.source_kind, s.source_id), ',' order by s.source_kind, s.source_id)
                      from public.lifecycle_sources_of(pg_temp.id('1', '00'), 'derived', pg_temp.itm('1', '70')) s)
                     = format('draft %s', pg_temp.itm('1', '78'))
                     and (select state = 'live' and acl_tokens = array['o:' || pg_temp.id('1', '00')] and acl_epoch = 1
                          from public.provenance_items where id = pg_temp.pid('1', '70')),
                     'lifecycle_sources_of() passed through a cited item, or what was made from one was withdrawn (LCD-40)');
-- provenance_dependants(): within the org, depths as built.
select pg_temp.check((select string_agg(format('%s %s', d.provenance_id, coalesce(d.depth::text, '-')), ',' order by d.provenance_id)
                      from public.provenance_dependants(pg_temp.id('1', '00'), 'message', pg_temp.pid('1', '11')) d)
                     = format('%s 1,%s 2,%s 1,%s 1', pg_temp.pid('1', '76'), pg_temp.pid('1', '77'), pg_temp.pid('1', '78'),
                              pg_temp.pid('1', '79')),
                     'provenance_dependants() isn''t what was made from Ms in org 1, with its depths (LCD-40)');
-- The cycle: every item made from Mz has no depth, so the cascade withdraws them all and deletes none,
-- and the closure of A ends.
select pg_temp.check((select string_agg(format('%s %s', d.provenance_id, coalesce(d.depth::text, '-')), ',' order by d.provenance_id)
                      from public.provenance_dependants(pg_temp.id('1', '00'), 'message', pg_temp.pid('1', '12')) d)
                     = format('%s -,%s -,%s -', pg_temp.pid('1', '40'), pg_temp.pid('1', '41'), pg_temp.pid('1', '42')),
                     'a cycle gave something made from Mz a depth (LCD-40)');
select set_config('lcd.pz', pg_temp.logged('1', 'messages', 'messages', pg_temp.pid('1', '12'), 'user')::text, true);
select pg_temp.check(public.lifecycle_cascade('message', pg_temp.pid('1', '12'), current_setting('lcd.pz')::bigint, 10) = 0,
                     'the cascade over a cycle deleted something, or left something live (LCD-40)');
select pg_temp.check((select count(*) from public.provenance_items
                          where id in (pg_temp.pid('1', '40'), pg_temp.pid('1', '41'), pg_temp.pid('1', '42')) and state = 'withdrawn') = 3,
                     'the cascade over a cycle deleted something, or left something live (LCD-40)');
select pg_temp.check((select string_agg(format('%s %s', s.source_kind, s.source_id), ',' order by s.source_id)
                      from public.lifecycle_sources_of(pg_temp.id('1', '00'), 'derived', pg_temp.itm('1', '40')) s)
                     = format('derived %s,derived %s', pg_temp.itm('1', '40'), pg_temp.itm('1', '41')),
                     'lifecycle_sources_of() over a cycle didn''t end with both (LCD-40)');
-- The writes stay in the org too: org 2's rows naming org 1's ids (32's edge to Ms, and 33's to Ds1,
-- Ds2 and the fixture's draft fb) are untouched when org 1 deletes Ms, which deletes Ds2 and Ds1 and
-- marks their edges and Ms's gone, and forgets fb. The definers run as the owner, which RLS doesn't
-- bind, so each one's org filter is all that keeps them out (ACC-11). Undone after.
savepoint lcd_40_orgs;
reset role;
select pg_temp.plant('2', '33', 'draft', 'cited', array['derived', 'derived', 'draft'],
                     array[pg_temp.itm('1', '76'), pg_temp.itm('1', '77'), pg_temp.id('1', 'fb')]);
create function pg_temp.org2_rows() returns text language sql as $$
  select (select string_agg(format('%s %s %s %s %s', p.id, p.state, p.withdrawn_at, p.acl_epoch, p.acl_tokens), ',' order by p.id)
          from public.provenance_items p where p.org_id = pg_temp.id('2', '00'))
         || '|' || (select string_agg(format('%s %s %s %s %s', e.item, e.number, e.source_kind, e.source_id, e.gone_at), ','
                                      order by e.item, e.number)
                    from public.provenance_sources e where e.org_id = pg_temp.id('2', '00'))
$$;
select set_config('lcd.org2', pg_temp.org2_rows(), true);
set local role hearth_owner;
select set_config('lcd.pm', pg_temp.logged('1', 'messages', 'messages', pg_temp.pid('1', '11'), 'user')::text, true);
select pg_temp.check(public.lifecycle_cascade('message', pg_temp.pid('1', '11'), current_setting('lcd.pm')::bigint, 10) = 2,
                     'org 1''s cascade from Ms didn''t delete Ds2 and Ds1 (LCD-40)');
select set_config('lcd.pf', pg_temp.logged('1', 'messages', 'drafts', pg_temp.id('1', 'fb'), 'user')::text, true);
select pg_temp.check(public.provenance_forget('draft', pg_temp.id('1', 'fb'), 'cascade', current_setting('lcd.pf')::bigint) = 1,
                     'org 1''s draft fb didn''t go with its record (LCD-40)');
reset role;
select pg_temp.check(pg_temp.org2_rows() = current_setting('lcd.org2')
                     and not exists (select 1 from public.provenance_sources
                                     where org_id = pg_temp.id('1', '00') and source_kind = 'message'
                                       and source_id = pg_temp.pid('1', '11') and gone_at is null),
                     'an org-1 deletion changed an org-2 row, or didn''t mark its own edges gone (LCD-40)');
rollback to savepoint lcd_40_orgs;
set local role hearth_owner;
-- Each definer with no org set (42501).
select set_config('app.org_id', '', true);
select pg_temp.expect_error($$select public.withdraw_dependants('message', gen_random_uuid(), 'source_deleted')$$, '42501',
                            'No org is set for this transaction');
select pg_temp.expect_error($$select public.provenance_mark_stale('message', gen_random_uuid(), 'source_edited')$$, '42501',
                            'No org is set for this transaction');
select pg_temp.expect_error($$select public.lifecycle_cascade('message', gen_random_uuid(), 1, 10)$$, '42501',
                            'No org is set for this transaction');
select pg_temp.expect_error($$select public.provenance_forget('derived', gen_random_uuid(), 'retention', null)$$, '42501',
                            'No org is set for this transaction');
reset role;
-- No runtime role, nor hearth_worker, touches either table or runs any of 0014's eleven new functions.
do $$
declare
  r text;
  t text;
  p text;
  f text;
begin
  foreach r in array pg_temp.runtime_roles() || array['hearth_worker'] loop
    foreach t in array array['provenance_items', 'provenance_sources'] loop
      foreach p in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
        perform pg_temp.check(not has_table_privilege(r, format('public.%I', t), p)
                              and (p not in ('SELECT', 'INSERT', 'UPDATE', 'REFERENCES')
                                   or not has_any_column_privilege(r, format('public.%I', t), p)),
                              format('%s holds %s on %s (LCD-40)', r, p, t));
      end loop;
    end loop;
    foreach f in array array[
      'public.provenance_dependants(uuid,text,uuid)', 'public.provenance_lock_ahead(uuid,text,uuid)',
      'public.withdraw_dependants(text,uuid,text)', 'public.provenance_mark_stale(text,uuid,text)',
      'public.lifecycle_cascade(text,uuid,bigint,integer)', 'public.provenance_forget(text,uuid,text,bigint)',
      'public.provenance_items_insert()', 'public.provenance_items_state()', 'public.provenance_items_complete()',
      'public.provenance_sources_insert()', 'public.provenance_sources_fixed()'] loop
      perform pg_temp.check(not has_function_privilege(r, f, 'EXECUTE'), format('%s can run %s (LCD-40)', r, f));
    end loop;
  end loop;
end
$$;
-- Every one is the owner's, granted to nobody (PUBLIC included), and exactly five are definers, each
-- with search_path = ''.
select pg_temp.check(count(*) = 11 and bool_and(p.proacl is not null and not exists (
                       select 1 from aclexplode(p.proacl) a where a.grantee <> p.proowner))
                     and bool_and(not p.prosecdef or 'search_path=""' = any (p.proconfig))
                     and bool_and(p.proowner = 'hearth_owner'::regrole)
                     and string_agg(p.proname, ',' order by p.proname) filter (where p.prosecdef)
                         = 'lifecycle_cascade,provenance_forget,provenance_items_complete,provenance_mark_stale,withdraw_dependants',
                     'a function 0014 adds is granted to someone, lacks search_path = '''', isn''t the owner''s, or the definers '
                     'aren''t exactly the five (LCD-40)')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in (
  'provenance_dependants', 'provenance_lock_ahead', 'withdraw_dependants', 'provenance_mark_stale', 'lifecycle_cascade',
  'provenance_forget', 'provenance_items_insert', 'provenance_items_state', 'provenance_items_complete',
  'provenance_sources_insert', 'provenance_sources_fixed');
-- lifecycle_row_anchors() for both tables: an item as its item, with its own kind's people (none for
-- derived, none for a kind with no resolver yet); an edge as its item; a row of only nulls, one row
-- of nulls with nobody.
create function pg_temp.anchors(tbl text, r jsonb) returns text language sql as $$
  select string_agg(format('%s %s %s', coalesce(a.kind, '-'), coalesce(a.item::text, '-'), a.persons), ';')
  from public.lifecycle_row_anchors(pg_temp.id('1', '00'), tbl, r) a
$$;
select pg_temp.check(pg_temp.anchors('provenance_items', (select to_jsonb(p) from public.provenance_items p
                                                          where p.id = pg_temp.id('1', 'ee')))
                       = format('derived %s {}', pg_temp.id('1', 'fa'))
                     and pg_temp.anchors('provenance_items', (select to_jsonb(p) from public.provenance_items p
                                                              where p.id = pg_temp.pid('1', '3e')))
                         = format('suggested_task %s {}', pg_temp.itm('1', '3e'))
                     and pg_temp.anchors('provenance_sources', (select to_jsonb(e) from public.provenance_sources e
                                                                where e.item = pg_temp.id('1', 'ee') and e.number = 1))
                         = format('derived %s {}', pg_temp.id('1', 'fa'))
                     and pg_temp.anchors('provenance_items', to_jsonb(jsonb_populate_record(null::public.provenance_items, '{}')))
                         = '- - {}'
                     and pg_temp.anchors('provenance_sources', to_jsonb(jsonb_populate_record(null::public.provenance_sources, '{}')))
                         = '- - {}',
                     'lifecycle_row_anchors() for a provenance row isn''t its item with its own kind''s people, one row each (LCD-40)');
-- log_deletion() takes the provenance class; lifecycle_persons_of() reads a derived item as about nobody.
do $$
begin
  perform set_config('app.org_id', pg_temp.id('1', '00')::text, true);
  perform pg_temp.check(public.log_deletion('provenance', 'provenance_items', gen_random_uuid()::text, 'retention', null, null, null,
                                            null, false) is not null,
                        'log_deletion() refused the provenance class (LCD-40)');
  raise exception 'undo' using errcode = 'P0001';
exception when sqlstate 'P0001' then
  if sqlerrm <> 'undo' then raise; end if;
end
$$;
select pg_temp.check(public.lifecycle_persons_of(pg_temp.id('1', '00'), 'derived', gen_random_uuid()) = '{}'
                     and public.lifecycle_persons_of(pg_temp.id('1', '00'), 'derived', pg_temp.id('1', 'fa')) = '{}',
                     'a derived item is about someone itself (LCD-40)');
