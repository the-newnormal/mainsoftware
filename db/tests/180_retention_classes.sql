-- PDPA-09, ADM-07, ACC-11 (C0.10 PR 1, 0013; LH-03 to LH-14, LH-19, LH-30; TECH-SPEC T23 items 2,
-- 5, 7, 8 and 11): the retention-class registry's SQL side, the guard's place, and who may touch
-- C0.10's tables and functions. The cases:
--   LCD-01 retention_class_defaults() has unique keys, valid kinds, positive days, every follows
--          naming a row or source, every AI row finite and never kept, and objects set for exactly
--          the s3 classes and Drive's two (LH-03, LH-06, R2DB-01);
--   LCD-02 every table of public (partitions and the migrator's ledger aside) is in exactly one
--          row's tables, and every name there is such a table (LH-04);
--   LCD-03 exactly cases, case_steps and legal_holds carry both guard triggers, enabled the default
--          way, each guard's argument its own table's name; deletion_log carries
--          lifecycle_no_truncate and deletion_log_kept, the latter before every insert as well as
--          every update and delete (GUARD-01); no other table carries either; none of the four guard
--          functions' triggers has a WHEN condition or an UPDATE OF list (LH-11, LH-12, GUARD-04,
--          TESTS-03);
--   LCD-04 no runtime role, nor hearth_worker, holds any privilege on deletion_log or legal_holds,
--          or may run any function 0013 adds (LH-30);
--   LCD-05 retention_period_days() answers each days class's default and raises 22023 for an unknown
--          key and a class with no day count; refused_copy_hold() is (30, 14); deletion_causes()
--          lists the nine causes and not replay (LH-09, LH-10, LH-19, C010-SPEC-02).
-- packages/shared RETENTION_CLASSES, REFUSED_COPY_HOLD and DELETION_CAUSES are held equal to these
-- functions by apps/server/scripts/check-catalogues.ts (check 7); this pins the SQL side alone.
-- No function here is granted, so the definers run as the superuser where a case calls one.
\ir fixtures/two_orgs.sql

-- LCD-01: the rows' shapes.
select pg_temp.check(count(*) = count(distinct key), 'retention_class_defaults() repeats a key (LCD-01)')
from public.retention_class_defaults();
select pg_temp.check(not exists (
  select 1 from public.retention_class_defaults() c
  where c.key !~ '^[a-z][a-z0-9_]{0,62}$'
     or c.store is null or c.store not in ('postgres', 's3')
     or c.ai is null
     or c.period_kind is null or c.period_kind not in ('days', 'follows', 'while', 'until')
     or c.holds is null or c.holds not in ('apply', 'exempt', 'kept')
     or c.tables is null
     -- Every s3 class's data is objects (R2DB-01).
     or c.objects is null or (c.store = 's3' and not c.objects)
     -- A day count is a positive whole number, with its anchor, for days; until may carry one.
     or (c.period_kind = 'days' and (c.days is null or c.days < 1 or c.anchor is null))
     or (c.period_kind = 'until' and (c.days is null) <> (c.anchor is null))
     or (c.period_kind in ('follows', 'while') and (c.days is not null or c.anchor is not null))
     or (c.days is not null and c.days < 1)
     -- follows names another row's key or 'source', and only for follows.
     or ((c.period_kind = 'follows') <> (c.follows is not null))
     or (c.follows is not null and c.follows <> 'source'
         and not exists (select 1 from public.retention_class_defaults() o where o.key = c.follows and o.key <> c.key))
     or (c.anchor is not null and c.anchor not in ('at', 'created', 'ended', 'finished', 'closed_on', 'last_edit', 'trashed',
                                                   'released', 'consent'))),
  'a row of retention_class_defaults() has a bad shape (LCD-01)');
-- Every AI class is finite: a day count, or a follows chain that ends at a class with one or at
-- source (D12, D41, LH-06); none is kept, and none covers a table yet.
with recursive chain (start, key, depth) as (
  select c.key, c.key, 0 from public.retention_class_defaults() c where c.ai
  union all
  select ch.start, c.follows, ch.depth + 1
  from chain ch join public.retention_class_defaults() c on c.key = ch.key
  where c.period_kind = 'follows' and c.follows <> 'source' and ch.depth < 20
), ends as (
  select ch.start, bool_or(c.days is not null or c.follows = 'source') as finite
  from chain ch join public.retention_class_defaults() c on c.key = ch.key
  group by ch.start
)
select pg_temp.check(count(*) filter (where not finite) = 0 and count(*) >= 12,
                     format('an AI class has no finite period, or fewer than 12 AI classes (%s) (LCD-01)', count(*)))
from ends;
select pg_temp.check(not exists (select 1 from public.retention_class_defaults() c
                                 where c.ai and (c.holds = 'kept' or cardinality(c.tables) > 0)),
                     'an AI class is kept, or covers a table already (LCD-01)');
-- The classes 0013 declares as fixed (the clean-up's and the log's own) are exempt, with the ages
-- their functions fix (check 7c reads the functions' bodies for the same).
select pg_temp.check(
  (select string_agg(format('%s %s %s %s', c.key, c.days, c.anchor, c.holds), ',' order by c.key)
   from public.retention_class_defaults() c where c.key in ('outbox', 'jobs', 'schedule_runs', 'deletion_log', 'cases', 'legal_holds'))
  = 'cases 731 closed_on apply,deletion_log 731 at exempt,jobs 14 finished exempt,legal_holds 731 released apply,outbox 14 at exempt,schedule_runs 90 finished exempt',
  'the fixed and C0.10 classes are not as 0013 declares them (LCD-01)');

-- The classes with S3 objects, which alone may log an S3 class and key (log_deletion(), 185's
-- LCD-08): the four s3 classes and Drive's two Postgres classes, whose rows and their files in S3
-- go together (R2DB-01; check 7a holds objects to RETENTION_CLASSES' objects).
select pg_temp.check(
  (select string_agg(format('%s %s', c.key, c.store), ',' order by c.key) from public.retention_class_defaults() c where c.objects)
  = 'drive_items postgres,drive_trash postgres,profile_photos s3,session_media s3,upload_quarantine s3,voice_message_audio s3',
  'the classes with S3 objects are not as 0013 declares them (LCD-01, R2DB-01)');

-- LCD-02: every table of public in exactly one class, and every name a table.
select pg_temp.check(not exists (
  select 1 from pg_class t join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public' and t.relkind in ('r', 'p') and not t.relispartition
    and t.relname not in ('kysely_migration', 'kysely_migration_lock')
    and (select count(*) from public.retention_class_defaults() c where t.relname = any (c.tables)) <> 1),
  format('a table of public is in no class, or in two: %s (LCD-02)', (
    select string_agg(t.relname, ', ') from pg_class t join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and t.relkind in ('r', 'p') and not t.relispartition
      and t.relname not in ('kysely_migration', 'kysely_migration_lock')
      and (select count(*) from public.retention_class_defaults() c where t.relname = any (c.tables)) <> 1)));
select pg_temp.check(not exists (
  select 1 from public.retention_class_defaults() c cross join unnest(c.tables) as x (name)
  where not exists (select 1 from pg_class t join pg_namespace n on n.oid = t.relnamespace
                    where n.nspname = 'public' and t.relname = x.name and t.relkind in ('r', 'p') and not t.relispartition)),
  'a class names a table public doesn''t have (LCD-02)');
select pg_temp.check((select count(*) from public.retention_class_defaults() c cross join unnest(c.tables)) = 37,
                     'the classes don''t cover exactly the 35 tables 0001 to 0012 create and 0013''s two (LCD-02)');

-- LCD-03: the guard on exactly the right tables. tgtype's bits: 1 row, 2 before, 4 insert, 8
-- delete, 16 update, 32 truncate. A trigger's argument is stored with a trailing NUL. A
-- partition's clone is named for its parent (none is guarded yet).
select pg_temp.check(
  coalesce((select string_agg(format('%s %s %s %s', coalesce(p.relname, c.relname), t.tgname, t.tgtype, t.tgenabled),
                              ',' order by coalesce(p.relname, c.relname), t.tgname)
            from pg_trigger t join pg_class c on c.oid = t.tgrelid
            left join pg_inherits i on i.inhrelid = c.oid left join pg_class p on p.oid = i.inhparent
            join pg_proc f on f.oid = t.tgfoid
            where not t.tgisinternal
              and f.proname in ('lifecycle_guard', 'lifecycle_no_truncate', 'deletion_log_kept')), '')
  = 'case_steps lifecycle_guard 11 O,case_steps lifecycle_no_truncate 34 O,cases lifecycle_guard 11 O,'
    'cases lifecycle_no_truncate 34 O,deletion_log deletion_log_kept 31 O,deletion_log lifecycle_no_truncate 34 O,'
    'legal_holds lifecycle_guard 11 O,legal_holds lifecycle_no_truncate 34 O',
  'the guard triggers are not exactly on cases, case_steps and legal_holds (and the log''s on deletion_log), enabled O (LCD-03)');
select pg_temp.check(not exists (
  select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_proc f on f.oid = t.tgfoid
  where f.proname = 'lifecycle_guard' and (t.tgnargs <> 1 or encode(t.tgargs, 'escape') <> c.relname || '\000')),
  'a guard''s argument isn''t its own table''s name (LCD-03)');
select pg_temp.check(not exists (
  select 1 from pg_trigger t join pg_proc f on f.oid = t.tgfoid
  where f.proname in ('lifecycle_no_truncate', 'deletion_log_kept', 'legal_holds_kept') and t.tgnargs <> 0),
  'a guard trigger without arguments was given one (LCD-03)');
select pg_temp.check(
  (select string_agg(format('%s %s %s', c.relname, t.tgtype, t.tgenabled), ',')
   from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_proc f on f.oid = t.tgfoid
   where f.proname = 'legal_holds_kept') = 'legal_holds 19 O',
  'legal_holds_kept is not the BEFORE UPDATE row trigger on legal_holds (LCD-03)');
select pg_temp.check(
  (select count(*) from pg_trigger t join pg_proc f on f.oid = t.tgfoid
   where f.proname in ('lifecycle_guard', 'lifecycle_no_truncate', 'deletion_log_kept', 'legal_holds_kept')) = 9
  and not exists (
    select 1 from pg_trigger t join pg_proc f on f.oid = t.tgfoid
    where f.proname in ('lifecycle_guard', 'lifecycle_no_truncate', 'deletion_log_kept', 'legal_holds_kept')
      and (t.tgqual is not null or cardinality(t.tgattr::int2[]) <> 0)),
  'a guard trigger fires only under a WHEN condition or for an UPDATE OF list (LCD-03, GUARD-04, TESTS-03)');

-- LCD-04: no runtime role, nor hearth_worker, touches C0.10's tables or runs its functions.
do $$
declare
  r text;
  t text;
  p text;
  f text;
begin
  foreach r in array pg_temp.runtime_roles() || array['hearth_worker'] loop
    foreach t in array array['deletion_log', 'legal_holds'] loop
      foreach p in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
        perform pg_temp.check(not has_table_privilege(r, format('public.%I', t), p)
                              and (p not in ('SELECT', 'INSERT', 'UPDATE', 'REFERENCES')
                                   or not has_any_column_privilege(r, format('public.%I', t), p)),
                              format('%s holds %s on %s (LCD-04)', r, p, t));
      end loop;
    end loop;
    foreach f in array array[
      'public.retention_class_defaults()', 'public.retention_period_days(uuid,text)', 'public.refused_copy_hold()',
      'public.deletion_causes()', 'public.log_deletion(text,text,text,text,uuid,bigint,text,text,boolean)',
      'public.lifecycle_today(uuid)', 'public.case_hold_until(uuid,uuid)', 'public.lifecycle_kinds()',
      'public.lifecycle_persons_of(uuid,text,uuid)', 'public.lifecycle_containers_of(uuid,text,uuid)',
      'public.lifecycle_lock_target(uuid,text,uuid,text)', 'public.lifecycle_row_anchors(uuid,text,jsonb)',
      'public.lifecycle_sources_of(uuid,text,uuid)', 'public.lifecycle_held(uuid,uuid[],text,uuid)',
      'public.is_held(text,uuid)', 'public.delete_case(uuid,text,boolean)', 'public.deletion_log_kept()',
      'public.legal_holds_kept()', 'public.lifecycle_guard()', 'public.lifecycle_no_truncate()'] loop
      perform pg_temp.check(not has_function_privilege(r, f, 'EXECUTE'), format('%s can run %s (LCD-04)', r, f));
    end loop;
  end loop;
end
$$;
-- Every function above is the owner's, granted to nobody (PUBLIC included), and the definers among
-- them set search_path = '' (check-migrations.sh refuses either too; this names 0013's).
select pg_temp.check(count(*) = 20 and bool_and(p.proacl is not null and not exists (
                       select 1 from aclexplode(p.proacl) a where a.grantee <> p.proowner))
                     and bool_and(not p.prosecdef or 'search_path=""' = any (p.proconfig))
                     and bool_and(p.proowner = 'hearth_owner'::regrole)
                     and count(*) filter (where p.prosecdef) = 4,
                     'a function 0013 adds is granted to someone, lacks search_path = '''', or isn''t the owner''s (LCD-04)')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in (
  'retention_class_defaults', 'retention_period_days', 'refused_copy_hold', 'deletion_causes', 'log_deletion',
  'lifecycle_today', 'case_hold_until', 'lifecycle_kinds', 'lifecycle_persons_of', 'lifecycle_containers_of',
  'lifecycle_lock_target', 'lifecycle_row_anchors', 'lifecycle_sources_of', 'lifecycle_held', 'is_held', 'delete_case',
  'deletion_log_kept', 'legal_holds_kept', 'lifecycle_guard', 'lifecycle_no_truncate');
-- The four definers: is_held, log_deletion, delete_case and the guard.
select pg_temp.check(string_agg(p.proname, ',' order by p.proname) = 'delete_case,is_held,lifecycle_guard,log_deletion',
                     'the SECURITY DEFINER functions 0013 adds are not exactly the four (LCD-04)')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef and p.proname in (
  'retention_class_defaults', 'retention_period_days', 'refused_copy_hold', 'deletion_causes', 'log_deletion',
  'lifecycle_today', 'case_hold_until', 'lifecycle_kinds', 'lifecycle_persons_of', 'lifecycle_containers_of',
  'lifecycle_lock_target', 'lifecycle_row_anchors', 'lifecycle_sources_of', 'lifecycle_held', 'is_held', 'delete_case',
  'deletion_log_kept', 'legal_holds_kept', 'lifecycle_guard', 'lifecycle_no_truncate');

-- LCD-05: the period, the refused-copy figures and the causes.
select pg_temp.check(not exists (
  select 1 from public.retention_class_defaults() c
  where c.period_kind = 'days' and public.retention_period_days(pg_temp.id('1', '00'), c.key) is distinct from c.days),
  'retention_period_days() differs from a class''s default (LCD-05)');
select pg_temp.check(public.retention_period_days(pg_temp.id('2', '00'), 'cases') = 731
                     and public.retention_period_days(pg_temp.id('1', '00'), 'sign_in_records') = 731,
                     'the cases or sign-in records period isn''t 731 days (LCD-05)');
select pg_temp.expect_error($$select public.retention_period_days('f1000000-0000-4000-8000-000000000000', 'no_such_class')$$,
                            '22023', 'That retention class has no period in days.');
select pg_temp.expect_error($$select public.retention_period_days('f1000000-0000-4000-8000-000000000000', 'provenance')$$,
                            '22023', 'That retention class has no period in days.');
select pg_temp.expect_error($$select public.retention_period_days('f1000000-0000-4000-8000-000000000000', 'roster')$$,
                            '22023', 'That retention class has no period in days.');
select pg_temp.expect_error($$select public.retention_period_days('f1000000-0000-4000-8000-000000000000', 'personal_memory')$$,
                            '22023', 'That retention class has no period in days.');
select pg_temp.check(count(*) = 1 and min(days) = 30 and min(notice_margin_days) = 14,
                     'refused_copy_hold() isn''t (30, 14) (LCD-05)')
from public.refused_copy_hold();
select pg_temp.check(array_agg(c order by c) = '{cascade,correction,offboarding,redaction,request,retention,trash,upload,user}',
                     format('deletion_causes() is %s, not the nine causes (LCD-05)', array_agg(c order by c)))
from public.deletion_causes() c;
select pg_temp.check(not exists (select 1 from public.deletion_causes() c where c = 'replay'),
                     'replay is a cause; it is a flag (C010-SPEC-02, LCD-05)');
