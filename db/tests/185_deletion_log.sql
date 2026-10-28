-- PDPA-09 ("every deletion is logged"), ADM-06, ACC-11 (C0.10 PR 1, 0013; LH-10, LH-57; TECH-SPEC
-- T23 item 7; DB-06, DB-13, C010-SPEC-02, C010-SPEC-03): the deletion log. The cases:
--   LCD-06 every check refuses with its constraint's name; an object id may be a uuid or a whole
--          number; an S3 key is <org>/<uuid> or quarantine/<org>/<uuid> of the row's own org, never
--          another org's, a filename or a bare uuid; replayed defaults to false;
--   LCD-07 deletion_log_kept() refuses an update but an S3 deletion's stamp, once, and a delete of a
--          row younger than 731 days, as the owner and the superuser; an older row may go; TRUNCATE
--          is refused (HF010);
--   LCD-08 log_deletion(): no org set (42501); the class and the table together, an unknown class
--          and a cause outside deletion_causes() refused (22023); correction and upload accepted;
--          the row lands in app.org_id's org only; a replay keeps its cause and case with replayed
--          true; it returns the row's id.
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
                     and pg_temp.add_log(jsonb_build_object('s3_class', 'profile_photos',
                                                            's3_key', pg_temp.id('1', '00') || '/' || gen_random_uuid())) > 0
                     and pg_temp.add_log(jsonb_build_object('s3_class', 'upload_quarantine', 'cause', 'upload',
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
-- may not, as the owner and the superuser.
insert into public.deletion_log (org_id, at, class_key, object_table, object_id, cause) values
  (pg_temp.id('1', '00'), now() - interval '732 days', 'sign_in_records', 'devices', 'a0000000-0000-4000-8000-000000001732', 'retention'),
  (pg_temp.id('1', '00'), now() - interval '730 days', 'sign_in_records', 'devices', 'a0000000-0000-4000-8000-000000001730', 'retention');
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
-- correction and upload are causes (C010-SPEC-04, LH-57): an upload's quarantine copy is logged by
-- its S3 class and key.
select pg_temp.check(public.log_deletion('sign_in_records', 'devices', 'a0000000-0000-4000-8000-000000000c01', 'correction', null,
                                         null, null, null, false) > 0
                     and public.log_deletion('upload_quarantine', 'uploads', 'a0000000-0000-4000-8000-000000000c02', 'upload',
                                             null, null, 'upload_quarantine',
                                             'quarantine/' || pg_temp.id('1', '00') || '/a0000000-0000-4000-8000-000000000c02', false) > 0,
                     'log_deletion() refused correction or upload (LCD-08)');
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
