-- PDPA-09 ("every deletion is logged"), ADM-06, ACC-11 (C0.10 PR 1, 0013; LH-10, LH-57; TECH-SPEC
-- T23 item 7; DB-06, DB-13, C010-SPEC-02, C010-SPEC-03): the deletion log. The cases:
--   LCD-06 every check refuses with its constraint's name; an object id is a lower-case uuid, or a
--          whole number for audit_events alone, never a number, name or reference for another table
--          (PRIVACY-01); an S3 key is <org>/<uuid> or quarantine/<org>/<uuid> of the row's own org,
--          never another org's, a filename or a bare uuid; replayed defaults to false;
--   LCD-07 deletion_log_kept() refuses a new row whose at or tx_id isn't the database's (now() and
--          this transaction's), as the owner and the superuser, so no writer can backdate a row to
--          purge it with what it logged, or log for another transaction (GUARD-01); it refuses an
--          update but an S3 deletion's stamp, once, and a delete of a row younger than 731 days; an
--          older row may go; TRUNCATE is refused (HF010);
--   LCD-08 log_deletion(): no org set (42501); the class and the table together, an unknown class
--          and a cause outside deletion_causes() refused (22023); an S3 class or key with a class
--          kept in Postgres with no S3 objects refused (22023), and a number, a name or a filename
--          where an id or a key goes refused by the table's checks (23514; PRIVACY-01); a Drive
--          class's row with its file's key accepted as one row once its table is in the class
--          (R2DB-01); correction and upload accepted; the row lands in app.org_id's org only; a
--          replay keeps its cause and case with replayed true; it returns the row's id.
-- A row 731 days old, or one from another transaction, can only be planted with the log's trigger
-- off: as the superuser with session_replication_role = replica for that insert alone, deleting
-- nothing guarded meanwhile (LCG-05).
-- The log has no grant to anyone (180's LCD-04, 040's LCD-32), so its rows are written here as the
-- superuser or the owner, as the deletion code's definers write them (as the owner).
\ir fixtures/two_orgs.sql

-- A log row's columns for org 1, as jsonb, with a change; the columns not named take a valid value.
create function pg_temp.log_row(change jsonb) returns jsonb language sql stable as $$
  select jsonb_build_object('org_id', pg_temp.id('1', '00'), 'class_key', 'sign_in_records', 'object_table', 'devices',
                            'object_id', gen_random_uuid()::text, 'cause', 'retention', 'replayed', false,
                            'case_id', null, 'parent_id', null, 's3_class', null, 's3_key', null, 's3_done_at', null)
         || change
$$;
-- Inserts it (as the superuser), with the database's own id, tx_id and at.
create function pg_temp.add_log(change jsonb) returns bigint language plpgsql as $$
declare
  r public.deletion_log;
  logged bigint;
begin
  r := jsonb_populate_record(null::public.deletion_log, pg_temp.log_row(change));
  insert into public.deletion_log (org_id, class_key, object_table, object_id, cause, replayed, case_id, parent_id, s3_class,
                                   s3_key, s3_done_at)
  values (r.org_id, r.class_key, r.object_table, r.object_id, r.cause, r.replayed, r.case_id, r.parent_id, r.s3_class,
          r.s3_key, r.s3_done_at)
  returning id into logged;
  return logged;
end
$$;
-- A row the check named must refuse.
create function pg_temp.bad_log(change jsonb, constraint_name text) returns void language plpgsql as $$
begin
  perform pg_temp.expect_error(format('select pg_temp.add_log(%L)', change), '23514', '%' || constraint_name || '%');
end
$$;

-- LCD-06: the checks, each by its own name.
select pg_temp.bad_log('{"class_key": "Sign_in_records"}', 'deletion_log_class');
select pg_temp.bad_log('{"class_key": "sign-in"}', 'deletion_log_class');
select pg_temp.bad_log('{"object_table": "public.devices"}', 'deletion_log_table');
select pg_temp.bad_log('{"object_table": "Devices"}', 'deletion_log_table');
select pg_temp.bad_log('{"object_id": "0"}', 'deletion_log_object');
select pg_temp.bad_log('{"object_id": "-1"}', 'deletion_log_object');
select pg_temp.bad_log('{"object_id": "12345678901234567890"}', 'deletion_log_object');
select pg_temp.bad_log('{"object_id": "K7QMX3TD"}', 'deletion_log_object');
select pg_temp.bad_log(jsonb_build_object('object_id', upper(gen_random_uuid()::text)), 'deletion_log_object');
select pg_temp.bad_log('{"object_id": "Mel Member"}', 'deletion_log_object');
-- A whole number is an id only for audit_events (PRIVACY-01): a drama-range phone number, or any
-- number, logged as a device's or a request's id is refused, and so is one with the right table but
-- a sign in front.
select pg_temp.bad_log('{"object_id": "447700900123"}', 'deletion_log_object');
select pg_temp.bad_log('{"object_table": "cases", "class_key": "cases", "object_id": "1"}', 'deletion_log_object');
select pg_temp.bad_log('{"object_table": "audit_events", "class_key": "audit_log", "object_id": "+447700900123"}',
                       'deletion_log_object');
select pg_temp.bad_log('{"cause": "Retention"}', 'deletion_log_cause');
select pg_temp.bad_log('{"cause": "request"}', 'deletion_log_request');
select pg_temp.bad_log(jsonb_build_object('case_id', pg_temp.id('1', 'e8')), 'deletion_log_request');
select pg_temp.bad_log('{"cause": "cascade"}', 'deletion_log_cascade');
select pg_temp.bad_log('{"parent_id": 1}', 'deletion_log_cascade');
select pg_temp.bad_log('{"s3_class": "profile_photos"}', 'deletion_log_s3');
select pg_temp.bad_log(jsonb_build_object('s3_key', pg_temp.id('1', '00') || '/' || gen_random_uuid()), 'deletion_log_s3');
select pg_temp.bad_log('{"s3_done_at": "2026-10-01T00:00:00Z"}', 'deletion_log_s3');
select pg_temp.bad_log(jsonb_build_object('s3_class', 'Profile photos', 's3_key', pg_temp.id('1', '00') || '/' || gen_random_uuid()),
                       'deletion_log_s3_class');
-- The key: the row's own org, promoted or in quarantine, never another org's, a filename or a bare
-- uuid (DB-13, C010-SPEC-03).
select pg_temp.bad_log(jsonb_build_object('s3_class', 'profile_photos', 's3_key', pg_temp.id('2', '00') || '/' || gen_random_uuid()),
                       'deletion_log_s3_key');
select pg_temp.bad_log(jsonb_build_object('s3_class', 'upload_quarantine',
                                          's3_key', 'quarantine/' || pg_temp.id('2', '00') || '/' || gen_random_uuid()),
                       'deletion_log_s3_key');
select pg_temp.bad_log(jsonb_build_object('s3_class', 'profile_photos', 's3_key', pg_temp.id('1', '00') || '/photo of Mel.jpg'),
                       'deletion_log_s3_key');
select pg_temp.bad_log(jsonb_build_object('s3_class', 'profile_photos', 's3_key', gen_random_uuid()::text), 'deletion_log_s3_key');
select pg_temp.bad_log(jsonb_build_object('s3_class', 'profile_photos',
                                          's3_key', 'staging/' || pg_temp.id('1', '00') || '/' || gen_random_uuid()),
                       'deletion_log_s3_key');
-- What passes: a uuid and a whole number as the id, a request with its case, a cascade with its
-- parent, both key shapes, and a stamp with its key; replayed is false unless set.
select pg_temp.check(pg_temp.add_log('{"object_table": "audit_events", "object_id": "9223372036854775807", "class_key": "audit_log"}') > 0
                     and pg_temp.add_log(jsonb_build_object('cause', 'request', 'case_id', pg_temp.id('1', 'e8'))) > 0
                     and pg_temp.add_log(jsonb_build_object('cause', 'cascade', 'parent_id', 1)) > 0
                     and pg_temp.add_log(jsonb_build_object('class_key', 'profile_photos', 'object_table', 'profiles',
                                                            's3_class', 'profile_photos',
                                                            's3_key', pg_temp.id('1', '00') || '/' || gen_random_uuid())) > 0
                     and pg_temp.add_log(jsonb_build_object('class_key', 'upload_quarantine', 'object_table', 'uploads',
                                                            's3_class', 'upload_quarantine', 'cause', 'upload',
                                                            's3_key', 'quarantine/' || pg_temp.id('1', '00') || '/' || gen_random_uuid(),
                                                            's3_done_at', now())) > 0,
                     'a valid log row was refused (LCD-06)');
insert into public.deletion_log (org_id, class_key, object_table, object_id, cause)
values (pg_temp.id('1', '00'), 'sign_in_records', 'sessions', 'a0000000-0000-4000-8000-000000000185', 'retention');
select pg_temp.check(replayed = false and tx_id = pg_current_xact_id() and at = now(),
                     'a log row''s replayed, tx_id or at defaults are wrong (LCD-06)')
from public.deletion_log where object_id = 'a0000000-0000-4000-8000-000000000185';
-- One row per entity per transaction (the guard's lookup).
select pg_temp.expect_error($$insert into public.deletion_log (org_id, class_key, object_table, object_id, cause)
  values ('f1000000-0000-4000-8000-000000000000', 'sign_in_records', 'sessions', 'a0000000-0000-4000-8000-000000000185', 'user')$$,
  '23505', '%deletion_log_entity%');

-- LCD-07 (GUARD-01): a new row's at and tx_id are the database's, for every writer. A backdated row
-- could log a guarded row's deletion and then go itself (deletion_log_kept allows a delete of a row
-- 731 days old), and one naming another transaction could stand for a deletion it isn't making.
-- Giving the database's own values passes.
do $$
declare
  who text;
  bad text[];
begin
  foreach who in array array['hearth_owner', 'none'] loop
    perform set_config('role', who, true);
    foreach bad slice 1 in array array[
      ['at', 'now() - interval ''800 days'''], ['at', 'now() - interval ''1 second'''], ['at', 'now() + interval ''1 day'''],
      ['at', 'clock_timestamp()'], ['tx_id', '''3''::xid8'], ['tx_id', '(pg_current_xact_id()::text::bigint + 1)::text::xid8']] loop
      perform pg_temp.expect_error(format($i$insert into public.deletion_log (org_id, %I, class_key, object_table, object_id, cause)
        values (%L, %s, 'legal_holds', 'legal_holds', gen_random_uuid()::text, 'retention')$i$, bad[1], pg_temp.id('1', '00'), bad[2]),
        '23514', 'A deletion log row takes its time and transaction from the database.');
    end loop;
    perform pg_temp.expect_rows(format($i$insert into public.deletion_log (org_id, at, tx_id, class_key, object_table, object_id, cause)
      values (%L, now(), pg_current_xact_id(), 'legal_holds', 'legal_holds', gen_random_uuid()::text, 'retention')$i$,
      pg_temp.id('1', '00')), 1);
    perform set_config('role', 'none', true);
  end loop;
end
$$;

-- LCD-07: append-only for every writer, but an S3 deletion's stamp, once.
select set_config('test.s3_row', pg_temp.add_log(jsonb_build_object('s3_class', 'profile_photos',
  's3_key', pg_temp.id('1', '00') || '/' || gen_random_uuid()))::text, true);
select set_config('test.plain_row', pg_temp.add_log('{}')::text, true);
do $$
declare
  who text;
  change text;
begin
  foreach who in array array['hearth_owner', 'none'] loop
    perform set_config('role', who, true);
    foreach change in array array['cause = ''user''', 'object_id = ''1''', 'class_key = ''audit_log''', 'replayed = true',
                                  'at = at - interval ''1 day''', 's3_key = s3_key', 's3_done_at = now(), cause = ''user''',
                                  'org_id = ''f2000000-0000-4000-8000-000000000000'''] loop
      perform pg_temp.expect_error(format('update public.deletion_log set %s where id = %s', change, current_setting('test.s3_row')),
                                   '23514', 'The deletion log only grows; a row''s S3 deletion is stamped once.');
    end loop;
    -- A row with no S3 key takes no stamp.
    perform pg_temp.expect_error(format('update public.deletion_log set s3_done_at = now() where id = %s',
                                        current_setting('test.plain_row')),
                                 '23514', 'The deletion log only grows; a row''s S3 deletion is stamped once.');
    perform pg_temp.expect_error(format('delete from public.deletion_log where id = %s', current_setting('test.plain_row')),
                                 '23514', 'The deletion log keeps each row for 731 days.');
    perform pg_temp.expect_error('truncate public.deletion_log', 'HF010',
                                 'Rows here are deleted only through Hearth''s deletion code, never TRUNCATE.');
    perform set_config('role', 'none', true);
  end loop;
end
$$;
-- The stamp, once, as the owner; a second is refused.
set local role hearth_owner;
select pg_temp.expect_rows(format('update public.deletion_log set s3_done_at = now() where id = %s', current_setting('test.s3_row')), 1);
select pg_temp.expect_error(format('update public.deletion_log set s3_done_at = now() where id = %s', current_setting('test.s3_row')),
                            '23514', 'The deletion log only grows; a row''s S3 deletion is stamped once.');
reset role;
-- A row 731 days old or more may go (C2.9's purge, which fixes the age in its body); a younger one
-- may not, as the owner and the superuser. Both are planted with the log's trigger off for the
-- insert alone (GUARD-01: no writer may backdate a row).
set local session_replication_role = replica;
insert into public.deletion_log (org_id, at, class_key, object_table, object_id, cause) values
  (pg_temp.id('1', '00'), now() - interval '732 days', 'sign_in_records', 'devices', 'a0000000-0000-4000-8000-000000001732', 'retention'),
  (pg_temp.id('1', '00'), now() - interval '730 days', 'sign_in_records', 'devices', 'a0000000-0000-4000-8000-000000001730', 'retention');
set local session_replication_role = origin;
set local role hearth_owner;
select pg_temp.expect_rows($$delete from public.deletion_log where object_id = 'a0000000-0000-4000-8000-000000001732'$$, 1);
select pg_temp.expect_error($$delete from public.deletion_log where object_id = 'a0000000-0000-4000-8000-000000001730'$$, '23514',
                            'The deletion log keeps each row for 731 days.');
reset role;
select pg_temp.expect_error($$delete from public.deletion_log where object_id = 'a0000000-0000-4000-8000-000000001730'$$, '23514',
                            'The deletion log keeps each row for 731 days.');

-- LCD-08: log_deletion(), as the owner (granted to nobody; the deletion code runs it as the owner).
set local role hearth_owner;
select set_config('app.org_id', '', true);
select pg_temp.expect_error($$select public.log_deletion('sign_in_records', 'devices', gen_random_uuid()::text, 'retention', null,
  null, null, null, false)$$, '42501', 'No org is set for this transaction');
select set_config('app.org_id', pg_temp.id('1', '00')::text, true);
-- The class and the table together; an unknown class; a cause outside the list, replay among them;
-- no replayed flag; an S3 class with no key; a table the class doesn't cover.
select pg_temp.expect_error($$select public.log_deletion('cases', 'devices', gen_random_uuid()::text, 'retention', null, null, null,
  null, false)$$, '22023', 'That deletion can''t be logged.');
select pg_temp.expect_error($$select public.log_deletion('no_such_class', 'devices', gen_random_uuid()::text, 'retention', null, null,
  null, null, false)$$, '22023', 'That deletion can''t be logged.');
select pg_temp.expect_error($$select public.log_deletion('sign_in_records', 'devices', gen_random_uuid()::text, 'replay', null, null,
  null, null, false)$$, '22023', 'That deletion can''t be logged.');
select pg_temp.expect_error($$select public.log_deletion('sign_in_records', 'devices', gen_random_uuid()::text, 'purge', null, null,
  null, null, false)$$, '22023', 'That deletion can''t be logged.');
select pg_temp.expect_error($$select public.log_deletion('sign_in_records', 'devices', gen_random_uuid()::text, 'retention', null,
  null, null, null, null)$$, '22023', 'That deletion can''t be logged.');
select pg_temp.expect_error($$select public.log_deletion('profile_photos', 'profiles', gen_random_uuid()::text, 'user', null, null,
  null, null, false)$$, '22023', 'That deletion can''t be logged.');
select pg_temp.expect_error($$select public.log_deletion('sign_in_records', 'people', gen_random_uuid()::text, 'retention', null,
  null, null, null, false)$$, '22023', 'That deletion can''t be logged.');
-- PRIVACY-01: nothing but an id, a code or a key rides in the log. An S3 class or key with a class
-- kept in Postgres is refused (22023), and a drama-range number, an invented name or a request's
-- reference as an id, or a filename or another org's prefix as a key, by the table's checks (23514).
select pg_temp.expect_error($$select public.log_deletion('sign_in_records', 'devices', gen_random_uuid()::text, 'retention', null,
  null, 'profile_photos', current_setting('app.org_id') || '/' || gen_random_uuid(), false)$$, '22023', 'That deletion can''t be logged.');
select pg_temp.expect_error($$select public.log_deletion('sign_in_records', 'devices', gen_random_uuid()::text, 'retention', null,
  null, 'profile_photos', null, false)$$, '22023', 'That deletion can''t be logged.');
select pg_temp.expect_error($$select public.log_deletion('cases', 'cases', gen_random_uuid()::text, 'retention', null, null, null,
  current_setting('app.org_id') || '/' || gen_random_uuid(), false)$$, '22023', 'That deletion can''t be logged.');
select pg_temp.expect_error($$select public.log_deletion('sign_in_records', 'devices', '447700900123', 'retention', null, null, null,
  null, false)$$, '23514', '%deletion_log_object%');
select pg_temp.expect_error($$select public.log_deletion('sign_in_records', 'phone_numbers', '+447700900123', 'retention', null, null,
  null, null, false)$$, '23514', '%deletion_log_object%');
select pg_temp.expect_error($$select public.log_deletion('sign_in_records', 'devices', 'Mel Example', 'retention', null, null, null,
  null, false)$$, '23514', '%deletion_log_object%');
select pg_temp.expect_error($$select public.log_deletion('cases', 'cases', 'K7QMX3TD', 'retention', null, null, null, null, false)$$,
  '23514', '%deletion_log_object%');
select pg_temp.expect_error($$select public.log_deletion('profile_photos', 'profiles', gen_random_uuid()::text, 'user', null, null,
  'profile_photos', current_setting('app.org_id') || '/Mel Example.jpg', false)$$, '23514', '%deletion_log_s3_key%');
select pg_temp.expect_error($$select public.log_deletion('upload_quarantine', 'uploads', gen_random_uuid()::text, 'upload', null,
  null, 'upload_quarantine', 'quarantine/f2000000-0000-4000-8000-000000000000/' || gen_random_uuid(), false)$$, '23514',
  '%deletion_log_s3_key%');
-- correction and upload are causes (C010-SPEC-04, LH-57): an upload's quarantine copy is logged by
-- its S3 class and key.
select pg_temp.check(public.log_deletion('sign_in_records', 'devices', 'a0000000-0000-4000-8000-000000000c01', 'correction', null,
                                         null, null, null, false) > 0
                     and public.log_deletion('upload_quarantine', 'uploads', 'a0000000-0000-4000-8000-000000000c02', 'upload',
                                             null, null, 'upload_quarantine',
                                             'quarantine/' || pg_temp.id('1', '00') || '/a0000000-0000-4000-8000-000000000c02', false) > 0,
                     'log_deletion() refused correction or upload (LCD-08)');
-- An audit row's id is a whole number, which the log takes for audit_events alone (PRIVACY-01).
select pg_temp.check(public.log_deletion('audit_log', 'audit_events', '9007', 'retention', null, null, null, null, false) > 0,
                     'log_deletion() refused an audit row''s whole-number id (LCD-08)');
-- It logs into app.org_id's org alone, returns the row's id, and a replay keeps its cause and case.
select set_config('test.logged', public.log_deletion('cases', 'cases', 'a0000000-0000-4000-8000-000000000c03', 'request',
                                                     pg_temp.id('1', 'e8'), null, null, null, true)::text, true);
reset role;
select pg_temp.check(count(*) = 1 and bool_and(org_id = pg_temp.id('1', '00') and cause = 'request' and case_id = pg_temp.id('1', 'e8')
                                               and replayed and class_key = 'cases' and object_table = 'cases'
                                               and tx_id = pg_current_xact_id()),
                     'log_deletion() didn''t log the replay into org 1 with its cause and case, or returned another id (LCD-08)')
from public.deletion_log where id = current_setting('test.logged')::bigint;
select pg_temp.check(count(*) = 0, 'log_deletion() wrote into org 2 (LCD-08)')
from public.deletion_log where org_id = pg_temp.id('2', '00') and object_id like 'a0000000-0000-4000-8000-000000000c0_';
-- The table's checks still hold behind it: a request needs its case (23514).
set local role hearth_owner;
select pg_temp.expect_error($$select public.log_deletion('cases', 'cases', gen_random_uuid()::text, 'request', null, null, null,
  null, false)$$, '23514', '%deletion_log_request%');
reset role;
-- R2DB-01 (PRIVACY-01): drive_items and drive_trash are Postgres classes with S3 objects (objects):
-- a Drive item's row and its file in S3 are one entity, logged as one row carrying the file's class
-- and key, so FILE-02's purge never needs a second row for the same entity (deletion_log_entity).
-- Before C4.1 moves files into drive_trash, a files row is refused there (no table yet); with files
-- planted in the class (the function replaced in a block that undoes itself, as C4.1's migration
-- will replace it), the row alone and the row with its key are both accepted, as one row each, while
-- a key with sign_in_records or cases is still refused and the key's checks still hold.
set local role hearth_owner;
select pg_temp.expect_error($$select public.log_deletion('drive_trash', 'files', gen_random_uuid()::text, 'trash', null, null, 'drive',
  current_setting('app.org_id') || '/' || gen_random_uuid(), false)$$, '22023', 'That deletion can''t be logged.');
reset role;
do $$
declare
  d text;
  logged bigint;
begin
  d := pg_get_functiondef('public.retention_class_defaults()'::regprocedure);
  d := replace(d, $q$('drive_trash', 'postgres', false, 'days', 30, 'trashed', null, 'apply', array[]::text[], true)$q$,
                  $q$('drive_trash', 'postgres', false, 'days', 30, 'trashed', null, 'apply', array['files'], true)$q$);
  execute d;
  perform pg_temp.check((select c.store = 'postgres' and c.objects and c.tables = array['files'] from public.retention_class_defaults() c
                         where c.key = 'drive_trash'),
                        'the fixture didn''t plant files in drive_trash (LCD-08, R2DB-01)');
  perform set_config('role', 'hearth_owner', true);
  perform pg_temp.check(public.log_deletion('drive_trash', 'files', 'a0000000-0000-4000-8000-000000000c11', 'trash', null, null, null,
                                            null, false) > 0,
                        'log_deletion() refused a Drive row on its own (LCD-08, R2DB-01)');
  logged := public.log_deletion('drive_trash', 'files', 'a0000000-0000-4000-8000-000000000c12', 'trash', null, null, 'drive',
                                current_setting('app.org_id') || '/a0000000-0000-4000-8000-000000000c12', false);
  perform pg_temp.check((select count(*) = 1 and bool_and(l.class_key = 'drive_trash' and l.object_table = 'files' and l.s3_class = 'drive'
                                                          and l.s3_key = current_setting('app.org_id') || '/a0000000-0000-4000-8000-000000000c12'
                                                          and l.s3_done_at is null)
                         from public.deletion_log l
                         where l.org_id = pg_temp.id('1', '00') and l.object_id = 'a0000000-0000-4000-8000-000000000c12'),
                        'a Drive row and its file aren''t one log row carrying the key (LCD-08, R2DB-01)');
  perform pg_temp.check(logged > 0, 'log_deletion() returned no id for a Drive row with its key (LCD-08, R2DB-01)');
  perform pg_temp.expect_error($q$select public.log_deletion('sign_in_records', 'devices', gen_random_uuid()::text, 'retention', null,
    null, 'profile_photos', current_setting('app.org_id') || '/' || gen_random_uuid(), false)$q$, '22023',
                               'That deletion can''t be logged.');
  perform pg_temp.expect_error($q$select public.log_deletion('cases', 'cases', gen_random_uuid()::text, 'retention', null, null, 'drive',
    current_setting('app.org_id') || '/' || gen_random_uuid(), false)$q$, '22023', 'That deletion can''t be logged.');
  perform pg_temp.expect_error($q$select public.log_deletion('drive_trash', 'files', gen_random_uuid()::text, 'trash', null, null, 'drive',
    'f2000000-0000-4000-8000-000000000000/' || gen_random_uuid(), false)$q$, '23514', '%deletion_log_s3_key%');
  raise exception 'undo' using errcode = 'P0001';
exception when sqlstate 'P0001' then
  if sqlerrm <> 'undo' then raise; end if;
end
$$;
select pg_temp.check(current_user = session_user
                     and not exists (select 1 from public.retention_class_defaults() c where c.key = 'drive_trash' and cardinality(c.tables) > 0)
                     and not exists (select 1 from public.deletion_log where object_id like 'a0000000-0000-4000-8000-000000000c1_'),
                     'the Drive case left something behind (LCD-08, R2DB-01)');
