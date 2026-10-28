-- ADM-08, PDPA-09, Rule 8 (C0.10 PR 1, 0013; LH-15, LH-56; TECH-SPEC T23 items 9, 10 and 12; DB-04,
-- DB-08, C010-SPEC-01): legal holds. C1.11 brings the writers (place_legal_hold(),
-- release_legal_hold()) and the read, with LCD-21 to LCD-26; until then nothing writes the table but
-- the owner, as here. The cases:
--   LCD-19 the table's checks: the kind vocabulary; the reason's length, control, escaped
--          bidirectional and ID-number rules, and the release reason's; the release all together;
--          the client key unique per placer;
--   LCD-20 legal_holds_kept() refuses every update but one release, and a second release, for the
--          owner and the superuser. An active hold of any kind holds itself (DB-08): an active hold
--          on channel K refuses its own logged deletion (HF009); once released, a logged delete
--          passes the guard;
--   LCD-41 (C010-SPEC-01) with lifecycle_containers_of() and lifecycle_lock_target() replaced, in
--          a block that undoes it, so a fixture device sits in a fixture channel, an active hold on
--          the channel makes is_held() of the device true, and its release false: the containment
--          seam extends by replacement, and lifecycle_held() never changes.
-- The people, reasons and channel ids are made up.
\ir fixtures/two_orgs.sql

-- A hold's columns in org 1, as jsonb, with a change; inserted as the superuser.
create function pg_temp.add_hold(change jsonb) returns uuid language plpgsql as $$
declare
  h public.legal_holds;
begin
  h := jsonb_populate_record(null::public.legal_holds,
         jsonb_build_object('id', gen_random_uuid(), 'org_id', pg_temp.id('1', '00'), 'client_key', gen_random_uuid(),
                            'target_kind', 'person', 'target_id', pg_temp.id('1', 'a7'),
                            'reason', 'Fixture investigation into rota sheets', 'case_id', null, 'placed_at', now(),
                            'placed_by', pg_temp.id('1', 'a6'), 'released_at', null, 'released_by', null, 'release_reason', null)
         || change);
  insert into public.legal_holds select h.*;
  return h.id;
end
$$;
create function pg_temp.bad_hold(change jsonb, constraint_name text) returns void language plpgsql as $$
begin
  perform pg_temp.expect_error(format('select pg_temp.add_hold(%L)', change), '23514', '%' || constraint_name || '%');
end
$$;

-- LCD-19: the kind vocabulary, ADM-08's targets ('session' is a recorded room session; a sign-in
-- session is no hold target).
select pg_temp.bad_hold('{"target_kind": "signin_session"}', 'legal_holds_target_kind');
select pg_temp.bad_hold('{"target_kind": "message"}', 'legal_holds_target_kind');
select pg_temp.bad_hold('{"target_kind": "Person"}', 'legal_holds_target_kind');
select pg_temp.check(count(*) = 8, 'a hold target kind ADM-08 names was refused (LCD-19)')
from unnest(array['person', 'channel', 'dm', 'group_dm', 'room', 'session', 'folder', 'file']) k
where pg_temp.add_hold(jsonb_build_object('target_kind', k, 'target_id', gen_random_uuid())) is not null;
-- The reason: trimmed, 1 to 1,000 characters, line breaks kept, no other control character, no
-- bidirectional-formatting character (written with U& escapes here, as the migration's class is
-- written with \u escapes: DB-04), no NRIC- or FIN-shaped string. The release reason the same.
select pg_temp.bad_hold('{"reason": ""}', 'legal_holds_reason');
select pg_temp.bad_hold('{"reason": " Leading space"}', 'legal_holds_reason');
select pg_temp.bad_hold('{"reason": "Trailing space "}', 'legal_holds_reason');
select pg_temp.bad_hold(jsonb_build_object('reason', repeat('x', 1001)), 'legal_holds_reason');
select pg_temp.bad_hold(jsonb_build_object('reason', 'A tab' || chr(9) || 'inside'), 'legal_holds_reason');
select pg_temp.bad_hold(jsonb_build_object('reason', 'A return' || chr(13) || chr(10) || 'inside'), 'legal_holds_reason');
select pg_temp.bad_hold(jsonb_build_object('reason', 'Reversed ' || U&'\202E' || 'text'), 'legal_holds_reason');
select pg_temp.bad_hold(jsonb_build_object('reason', 'Isolated ' || U&'\2067' || 'text'), 'legal_holds_reason');
select pg_temp.bad_hold('{"reason": "About S1234567D and others"}', 'legal_holds_reason');
select pg_temp.bad_hold('{"reason": "f7654321k"}', 'legal_holds_reason');
select pg_temp.check(pg_temp.add_hold(jsonb_build_object('reason', repeat('x', 1000))) is not null
                     and pg_temp.add_hold(jsonb_build_object('reason', 'Two lines' || chr(10) || 'of reason')) is not null
                     and pg_temp.add_hold('{"reason": "Case S1234567 has no letter"}') is not null,
                     'a valid reason was refused (LCD-19)');
select pg_temp.bad_hold(jsonb_build_object('released_at', now(), 'released_by', pg_temp.id('1', 'a5'), 'release_reason', ' Closed'),
                        'legal_holds_release_reason');
select pg_temp.bad_hold(jsonb_build_object('released_at', now(), 'released_by', pg_temp.id('1', 'a5'),
                                           'release_reason', 'Closed ' || U&'\202A' || 'now'), 'legal_holds_release_reason');
select pg_temp.bad_hold(jsonb_build_object('released_at', now(), 'released_by', pg_temp.id('1', 'a5'),
                                           'release_reason', 'Closed about G1234567X'), 'legal_holds_release_reason');
select pg_temp.bad_hold(jsonb_build_object('released_at', now(), 'released_by', pg_temp.id('1', 'a5'),
                                           'release_reason', repeat('y', 1001)), 'legal_holds_release_reason');
-- The release: all three together, or none.
select pg_temp.bad_hold(jsonb_build_object('released_at', now()), 'legal_holds_released');
select pg_temp.bad_hold(jsonb_build_object('released_at', now(), 'released_by', pg_temp.id('1', 'a5')), 'legal_holds_released');
select pg_temp.bad_hold('{"release_reason": "Closed"}', 'legal_holds_released');
-- The client key: one hold per placer and key; another placer may use the same key.
select set_config('test.key', gen_random_uuid()::text, true);
select pg_temp.add_hold(jsonb_build_object('client_key', current_setting('test.key')));
select pg_temp.expect_error(format('select pg_temp.add_hold(%L)', jsonb_build_object('client_key', current_setting('test.key'))),
                            '23505', '%legal_holds_client_key%');
select pg_temp.check(pg_temp.add_hold(jsonb_build_object('client_key', current_setting('test.key'), 'placed_by', pg_temp.id('1', 'a5')))
                     is not null, 'another placer couldn''t use the same client key (LCD-19)');
-- The placer and releaser are principals of the hold's own org.
select pg_temp.expect_error(format('select pg_temp.add_hold(%L)', jsonb_build_object('placed_by', pg_temp.id('2', 'a6'))),
                            '23503', '%legal_holds_org_id_placed_by_fkey%');

-- LCD-20: how a hold was placed never changes, and it is released once, all together, for the
-- owner and the superuser.
select set_config('test.hold', pg_temp.add_hold('{}')::text, true);
do $$
declare
  who text;
  change text;
begin
  foreach who in array array['hearth_owner', 'none'] loop
    perform set_config('role', who, true);
    foreach change in array array[
      'reason = ''Another reason''', 'target_id = gen_random_uuid()', 'target_kind = ''channel''', 'case_id = gen_random_uuid()',
      'placed_at = placed_at - interval ''1 day''', format('placed_by = %L', pg_temp.id('1', 'a5')), 'client_key = gen_random_uuid()',
      'org_id = org_id', 'reason = reason',
      format('released_at = now(), released_by = %L, release_reason = ''Closed'', reason = ''Changed''', pg_temp.id('1', 'a5'))] loop
      perform pg_temp.expect_error(format('update public.legal_holds set %s where id = %L', change, current_setting('test.hold')),
                                   '23514', 'A legal hold keeps how it was placed, and is released only once.');
    end loop;
    perform set_config('role', 'none', true);
  end loop;
end
$$;
set local role hearth_owner;
select pg_temp.expect_rows(format('update public.legal_holds set released_at = now(), released_by = %L, release_reason = %L where id = %L',
                                  pg_temp.id('1', 'a5'), 'The matter closed', current_setting('test.hold')), 1);
select pg_temp.expect_error(format('update public.legal_holds set released_at = now(), released_by = %L, release_reason = %L where id = %L',
                                   pg_temp.id('1', 'a6'), 'Closed again', current_setting('test.hold')), '23514',
                            'A legal hold keeps how it was placed, and is released only once.');
select pg_temp.expect_error(format('update public.legal_holds set released_at = null, released_by = null, release_reason = null where id = %L',
                                   current_setting('test.hold')), '23514',
                            'A legal hold keeps how it was placed, and is released only once.');
reset role;
select pg_temp.expect_error(format('update public.legal_holds set release_reason = %L where id = %L', 'Reworded',
                                   current_setting('test.hold')), '23514',
                            'A legal hold keeps how it was placed, and is released only once.');
-- An active hold of any kind holds itself (DB-08): one on channel K (no channel table yet; K is an
-- id), whose target is no person, refuses its own logged deletion, as the owner; released, the
-- guard lets a logged deletion through (its period is C2.9's purge's to check).
select set_config('test.channel_hold', pg_temp.add_hold('{"target_kind": "channel", "target_id": "a0000000-0000-4000-8000-0000000000cc"}')::text,
                  true);
set local role hearth_owner;
select set_config('app.org_id', pg_temp.id('1', '00')::text, true);
select public.log_deletion('legal_holds', 'legal_holds', current_setting('test.channel_hold'), 'retention', null, null, null, null, false);
select pg_temp.expect_error(format('delete from public.legal_holds where id = %L', current_setting('test.channel_hold')), 'HF009',
                            'This record is kept for now, so it can''t be deleted.');
select pg_temp.check(public.is_held('legal_hold', current_setting('test.channel_hold')::uuid), 'an active hold doesn''t hold itself (LCD-20)');
select pg_temp.expect_rows(format('update public.legal_holds set released_at = now(), released_by = %L, release_reason = %L where id = %L',
                                  pg_temp.id('1', 'a5'), 'The channel matter closed', current_setting('test.channel_hold')), 1);
select pg_temp.check(not public.is_held('legal_hold', current_setting('test.channel_hold')::uuid),
                     'a released hold on a channel still holds itself (LCD-20)');
select pg_temp.expect_rows(format('delete from public.legal_holds where id = %L', current_setting('test.channel_hold')), 1);
-- A released hold on a person another active hold covers stays: the person is held (ec on a9).
select set_config('test.a9_released', pg_temp.add_hold(jsonb_build_object(
  'target_id', pg_temp.id('1', 'a9'), 'released_at', now(), 'released_by', pg_temp.id('1', 'a5'), 'release_reason', 'An earlier matter'))::text,
  true);
select public.log_deletion('legal_holds', 'legal_holds', current_setting('test.a9_released'), 'retention', null, null, null, null, false);
select pg_temp.expect_error(format('delete from public.legal_holds where id = %L', current_setting('test.a9_released')), 'HF009');
reset role;
select set_config('app.org_id', '', true);

-- LCD-41 (C010-SPEC-01, LH-56): the containment seam, extended by replacement as C1.1 will. A block
-- replaces lifecycle_containers_of() so a8's device e1 sits in channel K, and lifecycle_lock_target()
-- so it can lock a channel (here: nothing to lock), then undoes both with its own rollback.
do $$
declare
  hold uuid;
begin
  create or replace function public.lifecycle_containers_of(org uuid, kind text, id uuid)
    returns table (container_kind text, container_id uuid)
  language sql stable set search_path = '' as $f$
    select 'channel'::text, 'a0000000-0000-4000-8000-0000000041cc'::uuid
    where kind = 'device' and id = 'f1000000-0000-4000-8000-0000000000e1'
  $f$;
  create or replace function public.lifecycle_lock_target(org uuid, kind text, id uuid, strength text) returns void
  language plpgsql volatile set search_path = '' as $f$
  begin
    if kind <> 'channel' then
      raise exception 'Hearth can''t lock that kind of record yet.' using errcode = 'invalid_parameter_value';
    end if;
  end
  $f$;
  perform set_config('app.org_id', pg_temp.id('1', '00')::text, true);
  perform pg_temp.check(not public.is_held('device', pg_temp.id('1', 'e1')), 'a8''s device is held before any hold (LCD-41)');
  hold := pg_temp.add_hold('{"target_kind": "channel", "target_id": "a0000000-0000-4000-8000-0000000041cc"}');
  perform pg_temp.check(public.is_held('device', pg_temp.id('1', 'e1')),
                        'a hold on the channel a8''s device sits in doesn''t hold it (LCD-41)');
  -- Another device, in no channel, isn't held; nor is a8.
  perform pg_temp.check(not public.is_held('device', pg_temp.id('2', 'e1')) and not public.is_held('person', pg_temp.id('1', 'a8')),
                        'a hold on a channel held what isn''t in it (LCD-41)');
  update public.legal_holds set released_at = now(), released_by = pg_temp.id('1', 'a5'), release_reason = 'Closed' where id = hold;
  perform pg_temp.check(not public.is_held('device', pg_temp.id('1', 'e1')),
                        'a released hold on the channel still holds the device in it (LCD-41)');
  raise exception 'undo' using errcode = 'P0001';
exception when sqlstate 'P0001' then
  if sqlerrm <> 'undo' then raise; end if;
end
$$;
select pg_temp.check(not exists (select 1 from public.lifecycle_containers_of(pg_temp.id('1', '00'), 'device', pg_temp.id('1', 'e1'))),
                     'the replaced lifecycle_containers_of() outlived its block (LCD-41)');
