#!/usr/bin/env bash
# The upgrade check for 0013_lifecycle_holds (C0.10 PR 1, LH-34; CLAUDE.md, Testing and CI): 0013
# applied on top of the rows 0001 to 0012 allow, as a C0.9 deployment could hold them, instead of to
# an empty database.
#
# 0013 inserts, updates and deletes no row, but it changes what rows already there mean in ways the
# schema digest can't see: a request for a copy refused before it, an open request for a copy or a
# correction, and the PDPC review steps already recorded now hold their requester's data and
# themselves (is_held()); a request now leaves only through delete_case(), logged and never while
# held, and the guard refuses every other DELETE of cases, case_steps and legal_holds; and the
# offboarding and revocation roles read every column of the outbox but the actor (OD-27). Its data
# must be built at 0012, where requests exist (UP_TO=0013 builds up to the migration before 0013;
# check-cases-upgrade.sh's data is built at 0011, which has none). This loads the Tembusu seed and an
# org B in Pacific/Kiritimati (UTC+14), far from UTC, written through 0012's own functions where they
# exist (acting as its DPO, or as the requester), as production's data would be:
# - b1, a member whose request for a copy was refused 10 days ago;
# - b2, refused 60 days ago, with a PDPC review open;
# - b3, refused 80 days ago, whose review ended 20 days ago (held no more);
# - someone without an account, refused 5 days ago;
# - b5, who left and asked for a copy by email afterwards, logged against their former person row
#   and refused 3 days ago, with an answered complaint closed 800 days ago;
# - b6, who sent a request for a correction in Hearth (with its case.opened event naming b6 as the
#   actor, as the api appends it), with an answered complaint closed 800 days ago;
# - b7, with an answered complaint closed 800 days ago and nothing else;
# - each member's number, device, sign-in session and acknowledgement, audit rows (the case
#   functions' own), an access-log row, outbox events with actors, and a Compliance Officer the
#   readers list lets read the log;
# (the requests closed 800 days ago are inserted as the owner, since 0012's functions take days
# within the last year), records every row of every table, applies 0013 (and anything after it) with
# production's migrator, and checks that:
# - LCU-01: every row of every table that existed is unchanged;
# - LCU-02: the upgraded schema matches a fresh build (BASE_DB, scripts/schema-digest.sql);
# - LCU-03 (LH-19, LH-20, LH-45): acting as each org, is_held() holds b1's, b2's, the outsider's and
#   b5's refused copies and their people, and b6, whose correction is open; not b3, whose window has
#   ended, nor b7, whose only request is an answered complaint, nor anyone of the seed's org;
# - LCU-04 (LH-11, LH-22), in transactions it rolls back: delete_case() as Hearth answers held for
#   b5's and b6's old complaints, open for b6's correction, not_due for b3's refusal (within 731
#   days), and deleted for b7's complaint, with one log row and one audit row; the superuser's direct
#   delete of a held request is refused without a log row (HF010) and with one (HF009); no table but
#   cases, case_steps and legal_holds carries the guard, each named by its argument (deletion_log
#   carries its own two), and no runtime role holds a DELETE grant but hearth_app's on working_hours;
# - LCU-05 (OD-27, LH-27): both job roles read every column of the outbox but actor_id and
#   actor_kind, which are refused to each; readBatch()'s, startOf()'s and futureRows()' statements,
#   and the sockets job's for the revocation role, run as each over the events already there;
# - LCU-07 (LH-23, LH-03): outbox_events_type is unchanged and validated, and no org gained or lost
#   a register, flag or settings row (the Owner bootstrap's write set is untouched);
# - LCU-08 (LH-03, LH-04): retention_class_defaults() equals the database classes of
#   packages/shared RETENTION_CLASSES (retentionClassDefaults()), as check-catalogues.ts check 7a
#   holds them on a fresh build.
# LCU-06 is C1.11's (0013 doesn't replace read_audit_events()). LCU-09 is the other upgrade checks'
# own: each applies 0013 too, over its own data, and stays green. The data is made up; none of it is
# anyone's.
#
# Usage, after a full scratch build (BASE_DB, default hearth_check):
#   scripts/check-migrations.sh
#   CHECK_DB=hearth_upgrade_check UP_TO=0013 scripts/check-migrations.sh
#   CHECK_DB=hearth_upgrade_check scripts/check-lifecycle-upgrade.sh
# Same connection settings as check-migrations.sh; CHECK_DB is the database built up to 0012. Needs
# Node 24 with the repo's packages installed, for LCU-08.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
export PGHOST=${PGHOST:-127.0.0.1} PGPORT=${PGPORT:-5432} PGUSER=${PGUSER:-postgres} PGPASSWORD=${PGPASSWORD:-postgres}
db=${CHECK_DB:-hearth_check}
base=${BASE_DB:-hearth_check}
for name in "$db" "$base"; do
  [[ $name =~ ^[a-z_][a-z0-9_]{0,54}_check$ ]] ||
    { echo "CHECK_DB and BASE_DB must be lower-case names ending in _check, at most 61 characters, not '$name'" >&2; exit 2; }
done
[ "$db" != "$base" ] || { echo "CHECK_DB must be the database built up to 0012, not BASE_DB ($base)" >&2; exit 2; }
owner=hearth_owner
migrator=${db}_m
sql() { psql --no-psqlrc -w -v ON_ERROR_STOP=1 -q "$@"; }

# It stops just before 0013, and the full build is complete.
before=$(sql -d "$db" -Atc "select count(*) filter (where name < '0013'), count(*) filter (where name >= '0013')
  from public.kysely_migration") ||
  { echo "No migrated database $db: build it with CHECK_DB=$db UP_TO=0013 scripts/check-migrations.sh" >&2; exit 2; }
[ "${before#*|}" = 0 ] && [ "${before%|*}" -gt 0 ] &&
  [ "$(sql -d "$db" -Atc "select count(*) from public.kysely_migration where name = '0012_request_cases'")" = 1 ] ||
  { echo "$db must be built up to (not including) 0013: CHECK_DB=$db UP_TO=0013 scripts/check-migrations.sh" >&2; exit 2; }
[ "$(sql -d "$base" -Atc "select count(*) from public.kysely_migration where name = '0013_lifecycle_holds'")" = 1 ] ||
  { echo "BASE_DB ($base) must be a full build: scripts/check-migrations.sh" >&2; exit 2; }

org_b=a0000000-0000-4000-8000-000000000130
# Org B's Hearth principal ends 130; its DPO 132 and Compliance Officer 134; members 141 to 147.
hearth=b4000000-0000-4000-8000-000000000130 dpo=b4000000-0000-4000-8000-000000000132
co=b4000000-0000-4000-8000-000000000134
b1=b4000000-0000-4000-8000-000000000141 b2=b4000000-0000-4000-8000-000000000142
b3=b4000000-0000-4000-8000-000000000143 b5=b4000000-0000-4000-8000-000000000145
b6=b4000000-0000-4000-8000-000000000146 b7=b4000000-0000-4000-8000-000000000147
v0=e4000000-0000-4000-8000-000000000130
old5=c4000000-0000-4000-8000-000000000105 old6=c4000000-0000-4000-8000-000000000106
old7=c4000000-0000-4000-8000-000000000107
# The members as a list of quoted ids, for an array literal.
members=$(printf "'%s', " "$b1" "$b2" "$b3" "$b5" "$b6" "$b7"); members=${members%, }

# One transaction as hearth_app acting as someone in an org, as withOrg() opens one.
as_app_out() { sql -d "$db" --single-transaction -At -c 'set local role hearth_app' \
  -c "select set_config('app.org_id', '$1', true), set_config('app.user_id', '$2', true)" -c "$3" | tail -n 1; }
# One transaction as the owner (as the deletion code's definers run), in an org, acting as someone,
# rolled back: the last line of output.
as_owner_out() { sql -d "$db" -At -c begin -c 'set local role hearth_owner' \
  -c "select set_config('app.org_id', '$1', true), set_config('app.user_id', '$2', true)" -c "$3" -c rollback | tail -n 1; }
# A statement that must be refused with the given SQLSTATE and a message like the pattern.
refused_like() { # SQLSTATE, the message's pattern (LIKE), what is refused, then the statement
  local what=${3//\'/\'\'}
  printf "do \$\$ begin %s; raise exception 'allowed after 0013: %s'; exception when sqlstate '%s' then
    if sqlerrm not like '%s' then raise; end if; end \$\$" "$4" "$what" "$1" "$2"
}
today="(now() at time zone 'Pacific/Kiritimati')::date"

# The seed's org, written as hearth_owner (who owns the tables).
sql -d "$db" --single-transaction -c 'set local role hearth_owner' -f db/seed/tembusu.sql
# Org B, as hearth_owner: its people, roles, readers list, accounts, numbers, devices and sessions;
# a stand-in notice version each member acknowledged on their device; an access-log row; and the
# three complaints closed 800 days ago, which 0012's functions can't backdate.
sql -d "$db" --single-transaction -c 'set local role hearth_owner' -c "
insert into public.orgs (id, name, time_zone) values ('$org_b', 'Upgrade Check Lifecycle', 'Pacific/Kiritimati');
insert into public.principals (id, org_id, kind, system_key) values ('$hearth', '$org_b', 'system', 'hearth');
insert into public.principals (id, org_id, kind)
select p, '$org_b', 'human' from unnest(array['$dpo', '$co', $members]::uuid[]) p;
insert into public.people (id, org_id, full_name, created_by)
select p, '$org_b', 'Person ' || right(p::text, 3), '$hearth' from unnest(array['$dpo', '$co', $members]::uuid[]) p;
insert into public.role_assignments (org_id, person_id, role, created_by) values
  ('$org_b', '$dpo', 'dpo', '$hearth'), ('$org_b', '$co', 'compliance_officer', '$hearth');
insert into public.audit_log_readers (org_id, role, created_by) values ('$org_b', 'compliance_officer', '$hearth');
insert into public.users (id, org_id) select p, '$org_b' from unnest(array[$members]::uuid[]) p;
insert into public.phone_numbers (org_id, person_id, e164, created_by)
select '$org_b', p, '+6580013' || lpad(n::text, 3, '0'), '$hearth'
from unnest(array[$members]::uuid[]) with ordinality as x (p, n);
insert into public.devices (id, org_id, user_id, label)
select ('d4000000-0000-4000-8000-000000000' || right(p::text, 3))::uuid, '$org_b', p, 'Phone'
from unnest(array[$members]::uuid[]) p;
insert into public.sessions (org_id, user_id, device_id, token_hash, expires_at)
select '$org_b', p, ('d4000000-0000-4000-8000-000000000' || right(p::text, 3))::uuid, sha256(p::text::bytea), now() + interval '7 days'
from unnest(array[$members]::uuid[]) p;
insert into public.notice_versions (id, org_id, version, body, published_by) values ('$v0', '$org_b', 0, 'Stand-in v0 for org B', '$dpo');
insert into public.notice_acknowledgments (org_id, person_id, notice_version_id, method, device_id)
select '$org_b', p, '$v0', 'in_app', ('d4000000-0000-4000-8000-000000000' || right(p::text, 3))::uuid
from unnest(array[$members]::uuid[]) p;
insert into public.data_access_events (org_id, type, subject_id, actor_id, object_type, object_id)
values ('$org_b', 'export', '$b1', '$co', 'file', 'upgrade-check-export');
insert into public.cases (id, org_id, client_key, kind, came_by, received_on, logged_by, requester_person_id, details,
                          closed_on, closed_kind, outcome, closed_at, closed_by)
select x.id, '$org_b', gen_random_uuid(), 'complaint', 'email', $today - 801, '$dpo', x.p, 'An old complaint about the rota.',
       $today - 800, 'complaint', 'answered', now() - interval '800 days', '$dpo'
from (values ('$old5'::uuid, '$b5'::uuid), ('$old6', '$b6'), ('$old7', '$b7')) as x (id, p);"
# The DPO logs and closes the requests for a copy through 0012's functions, as the DPO's pages do.
log_copy() { # person (or empty for someone without an account), days ago received
  local person=${1:+"'$1'"} name="'Sam Example'" channel="'email', 'sam@requester.example'"
  [ -z "$1" ] || { name=null; channel=null,null; }
  [ "$1" != "$b5" ] || channel="'email', 'b5@leaver.example'"
  as_app_out "$org_b" "$dpo" "select id from public.log_case('access', 'email', $today - $2, ${person:-null}, $name, $channel,
    'Wants a copy of the personal data held about them.', gen_random_uuid(), 'req-upgrade', null, null)"
}
step() { # case, revision seen, step, days ago, outcome (or null)
  as_app_out "$org_b" "$dpo" "select revision from public.add_case_step('$1', $2, '$3', $today - $4,
    $( [ "$3" = closed ] && echo "'Refused under the exception for a made-up reason.'" || echo null ), null, null, $5, 'req-upgrade', null, null)" >/dev/null
}
c1=$(log_copy "$b1" 15); step "$c1" 0 closed 10 "'refused'"
c2=$(log_copy "$b2" 65); step "$c2" 0 closed 60 "'refused'"; step "$c2" 1 review_started 50 null
c3=$(log_copy "$b3" 85); step "$c3" 0 closed 80 "'refused'"; step "$c3" 1 review_started 70 null; step "$c3" 2 review_ended 20 null
c4=$(log_copy "" 8); step "$c4" 0 closed 5 "'refused'"
# b5 left (their sessions end with the deactivation), then asked by email.
sql -d "$db" -o /dev/null -c "update public.people set deactivated_at = now(), deactivated_by = '$dpo' where id = '$b5'"
c5=$(log_copy "$b5" 6); step "$c5" 0 closed 3 "'refused'"
# b6 sends a request for a correction in Hearth; the api appends case.opened ({via: form}) beside it,
# naming b6 as the actor. Hearth appends a flag.changed of its own.
as_app_out "$org_b" "$b6" "with sent as (select * from public.submit_case('correction', 'My job title is wrong.', gen_random_uuid(),
    'req-upgrade', null, null))
  insert into public.outbox_events (org_id, type, entity_type, entity_id, actor_id, actor_kind, purpose, ids)
  select '$org_b', 'case.opened', 'case', sent.id, '$b6', 'human', 'request_handling', '{\"via\": \"form\"}' from sent" >/dev/null
c6=$(sql -d "$db" -Atc "select id from public.cases where org_id = '$org_b' and requester_person_id = '$b6' and closed_at is null")
sql -d "$db" --single-transaction -o /dev/null -c "select set_config('app.user_id', '$hearth', true)" -c "
insert into public.outbox_events (org_id, type, entity_type, entity_id, actor_id, actor_kind, purpose, ids)
select '$org_b', 'flag.changed', 'feature_flag', f.id, '$hearth', 'system', 'service_operation',
       jsonb_build_object('key', f.key, 'enabled', f.enabled)
from public.feature_flags f where f.org_id = '$org_b' and f.key = 'core.system';"
for made in "$c1" "$c2" "$c3" "$c4" "$c5" "$c6"; do
  [[ $made =~ ^[0-9a-f-]{36}$ ]] || { echo "A request to upgrade over wasn't written ($made)" >&2; exit 1; }
done
[ "$(sql -d "$db" -Atc "select format('%s %s %s %s', (select count(*) from public.cases where org_id = '$org_b'),
       (select count(*) from public.case_steps where org_id = '$org_b' and step like 'review%'),
       (select count(*) from public.outbox_events where org_id = '$org_b' and actor_id = '$b6'),
       (select count(*) from public.sessions where org_id = '$org_b' and revoked_at is null))")" = '9 3 1 5' ] ||
  { echo "The rows to upgrade over weren't all written" >&2; exit 1; }

# Every row of every table, one digest per table (data_access_events with its partitions).
tables=$(sql -d "$db" -Atc "select string_agg(c.relname, ' ' order by c.relname) from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relispartition and c.relname not like 'kysely\_%'")
digests() {
  local t
  for t in $tables; do
    printf '%s %s\n' "$t" "$(sql -d "$db" -Atc "select md5(coalesce(string_agg(x::text, E'\n' order by x::text), '')) from public.$t x")"
  done
}
kept=$(digests)
type_check="select pg_get_constraintdef(oid) || ' ' || convalidated from pg_constraint where conname = 'outbox_events_type'"
kept_type=$(sql -d "$db" -Atc "$type_check")
per_org="select string_agg(format('%s %s %s %s %s', o.id,
    (select count(*) from public.processing_register r where r.org_id = o.id),
    (select count(*) from public.transfer_register t where t.org_id = o.id),
    (select count(*) from public.feature_flags f where f.org_id = o.id),
    (select count(*) from public.dpo_settings s where s.org_id = o.id)), ',' order by o.id) from public.orgs o"
kept_per_org=$(sql -d "$db" -Atc "$per_org")

# 0013 with production's migrator, as check-migrations.sh runs it: a login that can only act as
# hearth_owner.
migrator_pw=$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')
trap 'sql -d postgres -c "drop role if exists $migrator" >/dev/null 2>&1 || true' EXIT
sql -d postgres -c "set client_min_messages = warning" \
  -c "do \$\$ begin create role $migrator; exception when duplicate_object then null; end \$\$" \
  -c "alter role $migrator login nosuperuser nobypassrls nocreaterole nocreatedb noinherit password '$migrator_pw'" \
  -c "grant $owner to $migrator"
PGUSER=$migrator PGPASSWORD=$migrator_pw PGDATABASE=$db MIGRATION_ROLE=$owner \
  env -u MIGRATION_DATABASE_URL node apps/server/src/db/migrate.ts >&2 ||
  { echo "0013 (or a later migration) failed over the rows 0001 to 0012 allow: see the migrate: lines above." >&2; exit 1; }
[ "$(sql -d "$db" -Atc "select count(*) from public.kysely_migration where name = '0013_lifecycle_holds'")" = 1 ] ||
  { echo "0013_lifecycle_holds was not applied" >&2; exit 1; }

# LCU-01: every row of every table that existed, unchanged.
after=$(digests)
if [ "$after" != "$kept" ]; then
  echo "LCU-01: 0013 changed rows already there:" >&2
  diff <(printf '%s\n' "$kept") <(printf '%s\n' "$after") | sed 's/^/  /' >&2 || true
  exit 1
fi

# LCU-02: the upgraded schema matches a fresh build.
upgraded=$(sql -d "$db" -At -f scripts/schema-digest.sql)
fresh=$(sql -d "$base" -At -f scripts/schema-digest.sql)
if [ "$upgraded" != "$fresh" ]; then
  echo "LCU-02: the upgraded schema ($db) differs from a fresh build ($base):" >&2
  diff <(printf '%s\n' "$fresh") <(printf '%s\n' "$upgraded") | sed 's/^/  /' >&2 || true
  exit 1
fi

# LCU-03: what is held now, acting as each org, by is_held() (as the owner, as the deletion code
# asks it).
held=$(as_owner_out "$org_b" "$hearth" "select concat_ws(' ',
  public.is_held('person', '$b1'), public.is_held('case', '$c1'), public.is_held('person', '$b2'), public.is_held('case', '$c2'),
  public.is_held('case', '$c4'), public.is_held('person', '$b5'), public.is_held('case', '$c5'), public.is_held('device',
  'd4000000-0000-4000-8000-000000000145'), public.is_held('person', '$b6'), public.is_held('case', '$c6'),
  public.is_held('person', '$b3'), public.is_held('case', '$c3'), public.is_held('person', '$b7'), public.is_held('case', '$old7'))")
[ "$held" = 't t t t t t t t t t f f f f' ] ||
  { echo "LCU-03: is_held() over org B's requests reads '$held', not 't t t t t t t t t t f f f f'" >&2; exit 1; }
seed_org=$(sql -d "$db" -Atc "select id from public.orgs where id <> '$org_b' order by id limit 1")
seed_hearth=$(sql -d "$db" -Atc "select id from public.principals where org_id = '$seed_org' and system_key = 'hearth'")
seed_held=$(as_owner_out "$seed_org" "$seed_hearth" "select coalesce(bool_or(public.is_held('person', p.id)), false)
  from public.people p where p.org_id = '$seed_org'")
[ "$seed_held" = f ] || { echo "LCU-03: someone of the seed's org reads as held" >&2; exit 1; }

# LCU-04: delete_case() as Hearth, in a transaction rolled back.
# The counts are read in a statement after the deletions, which then sees them.
answers=$(sql -d "$db" -At -c begin -c 'set local role hearth_owner' \
  -c "select set_config('app.org_id', '$org_b', true), set_config('app.user_id', '$hearth', true)" \
  -c "select concat_ws(' ', public.delete_case('$old5', 'retention', false), public.delete_case('$old6', 'retention', false),
        public.delete_case('$c6', 'retention', false), public.delete_case('$c3', 'retention', false),
        public.delete_case('$old7', 'retention', false))" \
  -c "select concat_ws(' ',
        (select count(*) from public.deletion_log where object_id = '$old7' and object_table = 'cases' and cause = 'retention'),
        (select count(*) from public.audit_events where action = 'case.deleted' and target_id = '$old7'),
        (select count(*) from public.cases where id = '$old7') + (select count(*) from public.case_steps where case_id = '$old7'))" \
  -c rollback | tail -n 2 | paste -sd ' ')
[ "$answers" = 'held held open not_due deleted 1 1 0' ] ||
  { echo "LCU-04: delete_case() over org B's requests answered '$answers', not 'held held open not_due deleted 1 1 0'" >&2; exit 1; }
[ "$(sql -d "$db" -Atc "select count(*) from public.cases where id = '$old7'")" = 1 ] &&
  [ "$(sql -d "$db" -Atc "select count(*) from public.deletion_log")" = 0 ] ||
  { echo "LCU-04: the rolled-back deletion left something behind" >&2; exit 1; }
sql -d "$db" -o /dev/null -c begin -c "$(refused_like HF010 'Rows here are deleted only through%' 'a direct delete of a held request' \
  "delete from public.cases where id = '$old5'")" -c "select set_config('app.org_id', '$org_b', true)" \
  -c "select public.log_deletion('cases', 'cases', '$old5', 'retention', null, null, null, null, false)" \
  -c "$(refused_like HF009 'This record is kept for now%' 'a logged direct delete of a held request' \
  "delete from public.cases where id = '$old5'")" -c rollback ||
  { echo "LCU-04: the guard let the superuser delete a held request" >&2; exit 1; }
[ "$(sql -d "$db" -Atc "select string_agg(format('%s %s %s', c.relname, t.tgname, encode(t.tgargs, 'escape')), ',' order by c.relname, t.tgname)
       from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_proc f on f.oid = t.tgfoid
       where not t.tgisinternal and f.proname in ('lifecycle_guard', 'lifecycle_no_truncate', 'deletion_log_kept')
         and t.tgenabled = 'O'")" = \
  'case_steps lifecycle_guard case_steps\000,case_steps lifecycle_no_truncate ,cases lifecycle_guard cases\000,cases lifecycle_no_truncate ,deletion_log deletion_log_kept ,deletion_log lifecycle_no_truncate ,legal_holds lifecycle_guard legal_holds\000,legal_holds lifecycle_no_truncate ' ] ||
  { echo "LCU-04: the guard isn't on exactly cases, case_steps and legal_holds, each named by its argument and enabled" >&2; exit 1; }
deletes=$(sql -d "$db" -Atc "select coalesce(string_agg(distinct format('%s %s', r.rolname, c.relname), ','), '')
  from pg_class c join pg_namespace n on n.oid = c.relnamespace cross join pg_roles r
  where n.nspname = 'public' and c.relkind in ('r', 'p') and r.rolname like 'hearth\_%' and r.rolname <> 'hearth_owner'
    and not pg_has_role(r.oid, 'hearth_owner', 'USAGE') and not pg_has_role(r.oid, 'hearth_owner', 'SET')
    and has_table_privilege(r.oid, c.oid, 'DELETE')")
[ "$deletes" = 'hearth_app working_hours' ] || { echo "LCU-04: runtime DELETE grants are '$deletes', not hearth_app's on working_hours" >&2; exit 1; }

# LCU-05: the two consumers' roles over the upgraded events.
outbox_columns='acl_epoch,acl_more,acl_tokens,at,container_id,container_type,entity_id,entity_type,id,ids,index_class,org_id,purpose,subject_ids,tombstone,tx_id,type,version'
for role in hearth_job_offboarding hearth_job_revocation; do
  [ "$(sql -d "$db" -Atc "select string_agg(attname, ',' order by attname) from pg_attribute
         where attrelid = 'public.outbox_events'::regclass and attnum > 0 and not attisdropped
           and has_column_privilege('$role', 'public.outbox_events', attname, 'SELECT')")" = "$outbox_columns" ] &&
    [ "$(sql -d "$db" -Atc "select has_table_privilege('$role', 'public.outbox_events', 'SELECT')")" = f ] ||
    { echo "LCU-05: $role doesn't read exactly every column of the outbox but the actor" >&2; exit 1; }
  sockets=''
  [ "$role" != hearth_job_revocation ] || sockets="perform s.id, (select min(e.at) from public.outbox_events e
      where e.org_id = s.org_id and e.type = 'signin.ended' and e.entity_type = 'person' and e.entity_id = s.user_id
        and e.ids -> 'sessions' ? s.id::text) from public.sessions s where s.org_id = '$org_b' and s.revoked_at is not null;"
  sql -d "$db" -o /dev/null -c begin -c "select set_config('app.org_id', '$org_b', true), set_config('app.user_id', '$hearth', true)" \
    -c "set local role $role" -c "do \$\$ declare n bigint; begin
      select count(*) into n from (select id, tx_id, at, type, version, entity_type, entity_id, container_type, container_id,
        acl_tokens, acl_more, index_class, acl_epoch, subject_ids, purpose, tombstone, ids from public.outbox_events
        where org_id = '$org_b' and (tx_id, id) > ('0'::xid8, 0::bigint) and tx_id < pg_snapshot_xmin(pg_current_snapshot())
        order by tx_id, id limit 100) b;
      if n <> 2 then raise exception 'readBatch() read % of org B''s 2 events', n; end if;
      perform 1 from (select) one left join lateral (select e.tx_id, e.id from public.outbox_events e
        where e.org_id = '$org_b' and e.tx_id < pg_snapshot_xmin(pg_current_snapshot()) order by e.tx_id desc, e.id desc limit 1) h on true
        left join public.outbox_floors f on f.org_id = '$org_b';
      perform greatest((select max(tx_id) from public.outbox_events where org_id = '$org_b'),
                       (select max(last_tx) from public.outbox_checkpoints where org_id = '$org_b'),
                       (select last_tx from public.outbox_floors where org_id = '$org_b')) >= pg_snapshot_xmax(pg_current_snapshot());
      $sockets
    end \$\$" -c "$(refused_like 42501 'permission denied%' "$role reading actor_id" 'perform actor_id from public.outbox_events')" \
    -c "$(refused_like 42501 'permission denied%' "$role reading actor_kind" 'perform actor_kind from public.outbox_events')" \
    -c rollback || { echo "LCU-05: $role's statements over the upgraded outbox failed, or it read the actor" >&2; exit 1; }
done

# LCU-07: the outbox's types as they were, validated; every org's registers, flags and settings as
# they were (the rows themselves are LCU-01's).
[ "$(sql -d "$db" -Atc "$type_check")" = "$kept_type" ] && [[ $kept_type == *' true' ]] ||
  { echo "LCU-07: outbox_events_type changed, or isn't validated" >&2; exit 1; }
[ "$(sql -d "$db" -Atc "$per_org")" = "$kept_per_org" ] ||
  { echo "LCU-07: an org gained or lost a register, flag or settings row" >&2; exit 1; }

# LCU-08: the registry's SQL side equals packages/shared's database classes, row by row.
from_code=$(node --input-type=module -e "
  const { retentionClassDefaults } = await import('@hearth/shared')
  const rows = retentionClassDefaults().map(r =>
    [r.key, r.store, r.ai ? 't' : 'f', r.period_kind, r.days ?? '', r.anchor ?? '', r.follows ?? '', r.holds, '{' + r.tables.join(',') + '}'].join('|'))
  console.log(rows.sort().join('\n'))")
from_sql=$(sql -d "$db" -At -F '|' -c "select key, store, ai, period_kind, coalesce(days::text, ''), coalesce(anchor, ''),
  coalesce(follows, ''), holds, tables::text from public.retention_class_defaults() order by 1" | LC_ALL=C sort)
from_code=$(LC_ALL=C sort <<<"$from_code")
if [ "$from_sql" != "$from_code" ]; then
  echo "LCU-08: retention_class_defaults() differs from packages/shared RETENTION_CLASSES' database classes:" >&2
  diff <(printf '%s\n' "$from_code") <(printf '%s\n' "$from_sql") | sed 's/^/  /' >&2 || true
  exit 1
fi

echo "OK: 0013 upgraded $db over the rows 0001 to 0012 allow; every row is unchanged, the requests already there hold as T23 says, delete_case() and the guard decide over them, the consumers read the outbox without its actor, the registry matches code, and the schema matches a fresh build."
