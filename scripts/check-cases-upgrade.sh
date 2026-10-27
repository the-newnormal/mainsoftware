#!/usr/bin/env bash
# The upgrade check for 0012_request_cases (C0.9 PR 3b, PD-107; CLAUDE.md, Testing and CI): 0012
# applied on top of the rows 0001 to 0011 allow, as a C0.9 PR 3a deployment could hold them, instead
# of to an empty database.
#
# 0012 updates and deletes no row, but it changes what rows already there read: every dpo_settings
# version reads the two new reply-target columns' defaults; every org gains request_handling's
# version 1 in its processing register; read_audit_events() withholds a request's rows from a
# reader who doesn't hold dpo; and outbox_events_type accepts two more types. Its data is built at
# 0011, where dpo_settings exists (UP_TO=0012 builds up to the migration before 0012), so it can't
# ride check-notice-upgrade.sh, whose data is built at 0010. This loads the Tembusu seed and two
# more orgs, written through 0011's own functions where they exist (acting as each org's DPO), as
# production's data would be:
# - org B: a DPO; a contact recorded twice through set_dpo_contact() (versions 1 and 2, with their
#   audit rows); a generated c09.2 version linking version 2 (inserted as the owner, as 0011's
#   publish_notice() leaves one) and a member's acknowledgement of it in the app; presence_receipts
#   on consent, with that member's restriction of it naming no case (as the superuser: it has no
#   writer); a Compliance Officer whom the audit log readers list (D45) lets read the log; and two
#   outbox events of an existing type;
# - org C: a DPO, no contact, and a stand-in version;
# records every dpo_settings, register, audit, notice, restriction and outbox row, applies 0012 with
# production's migrator, and checks that:
# - RQU-01 (OD-17, PD-87): every org has request_handling's version 1, active, unpinned, recording
#   nothing, and every other register row is unchanged;
# - RQU-02 (OD-08, PD-94): every dpo_settings row reads 10 and 30 and is otherwise unchanged,
#   column by column; dpo_settings_unchanged() still refuses an update; both new checks are
#   validated;
# - RQU-03: the upgraded schema matches a fresh build (BASE_DB, scripts/schema-digest.sql);
# - RQU-04 (PD-94): acting as org B's DPO, set_dpo_contact() over the upgraded rows writes version 3
#   with 10 and 30 copied, and set_reply_targets() writes version 4 with the contact copied; in org C
#   it is refused (no contact, HF006);
# - RQU-05 (T22 item 20): the restriction's new foreign key is validated over the restriction
#   already there, which is unchanged;
# - RQU-06 (OD-23, PD-100): the Compliance Officer's read_audit_events() returns exactly the rows it
#   returned before 0012 (none is a request's), plus its own audit.read rows;
# - RQU-07 (PD-93, PD-95): org B's c09.2 version still links settings version 2, and every notice
#   row is unchanged; notice_states_targets('c09.2') is false; and a member of org B sends a request
#   through submit_case() (acting as them, with the device the data holds), which stores no stated
#   settings version and is due ten weekdays on;
# - RQU-08 (PD-101): outbox_events_type is validated over every event already there, and the outbox
#   rows are unchanged.
# The data is made up; none of it is anyone's.
#
# Usage, after a full scratch build (BASE_DB, default hearth_check):
#   scripts/check-migrations.sh
#   CHECK_DB=hearth_upgrade_check UP_TO=0012 scripts/check-migrations.sh
#   CHECK_DB=hearth_upgrade_check scripts/check-cases-upgrade.sh
# Same connection settings as check-migrations.sh; CHECK_DB is the database built up to 0011.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
export PGHOST=${PGHOST:-127.0.0.1} PGPORT=${PGPORT:-5432} PGUSER=${PGUSER:-postgres} PGPASSWORD=${PGPASSWORD:-postgres}
db=${CHECK_DB:-hearth_check}
base=${BASE_DB:-hearth_check}
for name in "$db" "$base"; do
  [[ $name =~ ^[a-z_][a-z0-9_]{0,54}_check$ ]] ||
    { echo "CHECK_DB and BASE_DB must be lower-case names ending in _check, at most 61 characters, not '$name'" >&2; exit 2; }
done
[ "$db" != "$base" ] || { echo "CHECK_DB must be the database built up to 0011, not BASE_DB ($base)" >&2; exit 2; }
owner=hearth_owner
migrator=${db}_m
sql() { psql --no-psqlrc -w -v ON_ERROR_STOP=1 -q "$@"; }

# It stops just before 0012, and the full build is complete.
before=$(sql -d "$db" -Atc "select count(*) filter (where name < '0012'), count(*) filter (where name >= '0012')
  from public.kysely_migration") ||
  { echo "No migrated database $db: build it with CHECK_DB=$db UP_TO=0012 scripts/check-migrations.sh" >&2; exit 2; }
[ "${before#*|}" = 0 ] && [ "${before%|*}" -gt 0 ] &&
  [ "$(sql -d "$db" -Atc "select count(*) from public.kysely_migration where name = '0011_dpo_contact'")" = 1 ] ||
  { echo "$db must be built up to (not including) 0012: CHECK_DB=$db UP_TO=0012 scripts/check-migrations.sh" >&2; exit 2; }
[ "$(sql -d "$base" -Atc "select count(*) from public.kysely_migration where name = '0012_request_cases'")" = 1 ] ||
  { echo "BASE_DB ($base) must be a full build: scripts/check-migrations.sh" >&2; exit 2; }

org_b=a0000000-0000-4000-8000-000000000012 org_c=a0000000-0000-4000-8000-000000000013
# Each org's Hearth principal ends 000; its DPO 002; org B's member 001 and Compliance Officer 004.
hearth_b=b2000000-0000-4000-8000-000000000120 b1=b2000000-0000-4000-8000-000000000121
b2=b2000000-0000-4000-8000-000000000122 b4=b2000000-0000-4000-8000-000000000124
hearth_c=b3000000-0000-4000-8000-000000000130 c2=b3000000-0000-4000-8000-000000000132
b_v0=e2000000-0000-4000-8000-000000000120 b_dev1=e2000000-0000-4000-8000-0000000001d1
c_v0=e3000000-0000-4000-8000-000000000130

# One transaction as hearth_app acting as someone in an org, as withOrg() opens one.
as_app() { sql -d "$db" --single-transaction -At -c 'set local role hearth_app' \
  -c "select set_config('app.org_id', '$1', true), set_config('app.user_id', '$2', true)" -o /dev/null -c "$3"; }
as_app_out() { sql -d "$db" --single-transaction -At -c 'set local role hearth_app' \
  -c "select set_config('app.org_id', '$1', true), set_config('app.user_id', '$2', true)" -c "$3" | tail -n 1; }
# A statement that must be refused with the given SQLSTATE and a message like the pattern.
refused_like() { # SQLSTATE, the message's pattern (LIKE), what is refused, then the statement
  local what=${3//\'/\'\'}
  printf "do \$\$ begin %s; raise exception 'allowed after 0012: %s'; exception when sqlstate '%s' then
    if sqlerrm not like '%s' then raise; end if; end \$\$" "$4" "$what" "$1" "$2"
}

# The seed's org, written as hearth_owner (who owns the tables).
sql -d "$db" --single-transaction -c 'set local role hearth_owner' -f db/seed/tembusu.sql
# Orgs B and C, as hearth_owner: their people, B's account and device, its Compliance Officer on the
# readers list, presence_receipts on consent, and C's stand-in.
sql -d "$db" --single-transaction -c 'set local role hearth_owner' -c "
insert into public.orgs (id, name) values ('$org_b', 'Upgrade Check B'), ('$org_c', 'Upgrade Check C');
insert into public.principals (id, org_id, kind, system_key) values
  ('$hearth_b', '$org_b', 'system', 'hearth'), ('$hearth_c', '$org_c', 'system', 'hearth');
insert into public.principals (id, org_id, kind) values
  ('$b1', '$org_b', 'human'), ('$b2', '$org_b', 'human'), ('$b4', '$org_b', 'human'), ('$c2', '$org_c', 'human');
insert into public.people (id, org_id, full_name, created_by) values
  ('$b1', '$org_b', 'Bea One', '$hearth_b'), ('$b2', '$org_b', 'Bo Two', '$hearth_b'), ('$b4', '$org_b', 'Bex Four', '$hearth_b'),
  ('$c2', '$org_c', 'Cy Two', '$hearth_c');
insert into public.role_assignments (org_id, person_id, role, created_by) values
  ('$org_b', '$b2', 'dpo', '$hearth_b'), ('$org_b', '$b4', 'compliance_officer', '$hearth_b'), ('$org_c', '$c2', 'dpo', '$hearth_c');
insert into public.audit_log_readers (org_id, role, created_by) values ('$org_b', 'compliance_officer', '$hearth_b');
insert into public.users (id, org_id) values ('$b1', '$org_b');
insert into public.devices (id, org_id, user_id, label) values ('$b_dev1', '$org_b', '$b1', 'Phone B1');
insert into public.processing_register (org_id, purpose, ai, pinned, needs_switch, version, status, basis, retention, recorded_by)
select r.org_id, r.purpose, r.ai, r.pinned, r.needs_switch, 2, 'active', 'consent', 'Until withdrawn', '$b2'
from public.processing_register r where r.org_id = '$org_b' and r.purpose = 'presence_receipts' and r.version = 1;
insert into public.notice_versions (id, org_id, version, body, published_by) values ('$c_v0', '$org_c', 0, 'Stand-in v0 for org C', '$c2');"
# Org B's contact, twice, through 0011's set_dpo_contact() acting as its DPO.
for email in dpo@upgrade.example privacy@upgrade.example; do
  seen=$( [ "$email" = dpo@upgrade.example ] && echo null || echo 1 )
  [ "$(as_app_out "$org_b" "$b2" "select format('%s %s', version, changed) from public.set_dpo_contact($seen, 'Data Protection Officer',
         '$email', null, null, 'req-upgrade', null, null)")" = "$( [ "$seen" = null ] && echo '1 t' || echo '2 t' )" ] ||
    { echo "Org B's DPO couldn't record its contact through 0011's function" >&2; exit 1; }
done
# Its c09.2 version linking settings version 2, as 0011's publish_notice() leaves one, and b1's
# acknowledgement of it in the app; b1's restriction of presence_receipts, naming no case; two
# outbox events, Hearth acting.
sql -d "$db" --single-transaction -o /dev/null -c 'set local role hearth_owner' -c "
insert into public.notice_versions (id, org_id, version, body, published_by, generator, dpo_settings_version)
values ('$b_v0', '$org_b', 0, 'Privacy notice for org B', '$b2', 'c09.2', 2);
insert into public.notice_acknowledgments (org_id, person_id, notice_version_id, method, device_id)
values ('$org_b', '$b1', '$b_v0', 'in_app', '$b_dev1');" -c 'reset role' -c "
insert into public.processing_restrictions (org_id, person_id, purpose, effective_at, created_by)
values ('$org_b', '$b1', 'presence_receipts', now() - interval '1 day', '$b2');
select set_config('app.user_id', '$hearth_b', true);
insert into public.outbox_events (org_id, type, entity_type, entity_id, actor_id, actor_kind, purpose, ids)
select '$org_b', 'flag.changed', 'feature_flag', f.id, '$hearth_b', 'system', 'service_operation',
       jsonb_build_object('key', f.key, 'enabled', f.enabled)
from public.feature_flags f cross join generate_series(1, 2) where f.org_id = '$org_b' and f.key = 'core.system';"

# Every row 0012 must leave as it was, one line each, by the columns 0011 has.
settings="select string_agg(format('%s %s %s %s %s %s %s %s %s', id, org_id, version, contact_title, contact_email, contact_phone,
  contact_postal, recorded_at, recorded_by), E'\n' order by org_id, version) from public.dpo_settings"
registers="select string_agg(format('%s %s %s %s %s %s %s %s %s %s %s', id, org_id, purpose, ai, pinned, needs_switch, version, status,
  basis, retention, recorded_by), E'\n' order by org_id, purpose, version) from public.processing_register where purpose <> 'request_handling'"
audit="select string_agg(format('%s %s %s %s %s %s', id, org_id, actor_id, action, target_type, details), E'\n' order by id)
  from public.audit_events"
notice="select string_agg(format('%s %s %s %s %s %s', id, org_id, version, md5(body), generator, dpo_settings_version), E'\n'
  order by org_id, version) from public.notice_versions"
acks="select string_agg(format('%s %s %s %s %s', id, person_id, notice_version_id, method, device_id), E'\n' order by id)
  from public.notice_acknowledgments"
restrictions="select string_agg(format('%s %s %s %s %s %s', id, org_id, person_id, purpose, case_id, lifted_at), E'\n' order by id)
  from public.processing_restrictions"
outbox="select string_agg(format('%s %s %s %s %s %s', id, org_id, type, entity_id, actor_id, ids), E'\n' order by id)
  from public.outbox_events"
kept_settings=$(sql -d "$db" -Atc "$settings")
kept_registers=$(sql -d "$db" -Atc "$registers")
kept_audit=$(sql -d "$db" -Atc "$audit")
kept_notice=$(sql -d "$db" -Atc "$notice; $acks")
kept_restrictions=$(sql -d "$db" -Atc "$restrictions")
kept_outbox=$(sql -d "$db" -Atc "$outbox")
[ "$(sql -d "$db" -Atc "select count(*) from public.dpo_settings")" = 2 ] &&
  [ "$(sql -d "$db" -Atc "select count(*) from public.processing_restrictions where org_id = '$org_b' and case_id is null")" = 1 ] &&
  [ "$(sql -d "$db" -Atc "select count(*) from public.outbox_events where org_id = '$org_b'")" = 2 ] &&
  [ "$(sql -d "$db" -Atc "select count(*) from public.processing_register where purpose = 'request_handling'")" = 0 ] ||
  { echo "The rows to upgrade over weren't all written" >&2; exit 1; }
# RQU-06's first read, before 0012: the Compliance Officer's rows (writing its own audit.read row).
read_log="select coalesce(string_agg(a.id::text, ',' order by a.id), '') from public.read_audit_events(now() - interval '1 day',
  now() + interval '1 day', null, 1000) a"
read_before=$(as_app_out "$org_b" "$b4" "$read_log")
[ -n "$read_before" ] || { echo "RQU-06: the Compliance Officer read no audit row before 0012" >&2; exit 1; }

# 0012 with production's migrator, as check-migrations.sh runs it: a login that can only act as
# hearth_owner.
migrator_pw=$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')
trap 'sql -d postgres -c "drop role if exists $migrator" >/dev/null 2>&1 || true' EXIT
sql -d postgres -c "set client_min_messages = warning" \
  -c "do \$\$ begin create role $migrator; exception when duplicate_object then null; end \$\$" \
  -c "alter role $migrator login nosuperuser nobypassrls nocreaterole nocreatedb noinherit password '$migrator_pw'" \
  -c "grant $owner to $migrator"
PGUSER=$migrator PGPASSWORD=$migrator_pw PGDATABASE=$db MIGRATION_ROLE=$owner \
  env -u MIGRATION_DATABASE_URL node apps/server/src/db/migrate.ts >&2 ||
  { echo "0012 (or a later migration) failed over the rows 0001 to 0011 allow: see the migrate: lines above." >&2; exit 1; }
[ "$(sql -d "$db" -Atc "select count(*) from public.kysely_migration where name = '0012_request_cases'")" = 1 ] ||
  { echo "0012_request_cases was not applied" >&2; exit 1; }

# RQU-06 first, before anything after 0012 writes an audit row: the Compliance Officer reads the
# same rows as before (its first read's own audit.read row among them, which each read writes before
# it reads), plus the second read's audit.read row, and no request's row.
read_after=$(as_app_out "$org_b" "$b4" "$read_log")
added=$(sql -d "$db" -Atc "select coalesce(string_agg(format('%s %s', a.action, a.actor_id = '$b4'), ',' order by a.id), '')
  from public.audit_events a where a.id = any (string_to_array('$read_after', ',')::bigint[])
    and a.id <> all (string_to_array('$read_before', ',')::bigint[])")
[ "$added" = 'audit.read t' ] ||
  { echo "RQU-06: after 0012 the Compliance Officer's read added '$added', not its own audit.read row" >&2; exit 1; }
[ "$(sql -d "$db" -Atc "select count(*) from public.audit_events a
       where a.id = any (string_to_array('$read_after', ',')::bigint[]) and a.target_type = 'case'")" = 0 ] ||
  { echo "RQU-06: the Compliance Officer read a request's audit row" >&2; exit 1; }
missing=$(sql -d "$db" -Atc "select count(*) from unnest(string_to_array('$read_before', ',')::bigint[]) x
  where x <> all (string_to_array('$read_after', ',')::bigint[])")
[ "$missing" = 0 ] || { echo "RQU-06: after 0012 the Compliance Officer no longer reads $missing row(s) it read before" >&2; exit 1; }

# RQU-01: request_handling's version 1 in every org, recording nothing; every other register row as
# it was.
[ "$(sql -d "$db" -Atc "select format('%s %s', (select count(*) from public.orgs), count(*) filter (where version = 1 and status = 'active'
       and not pinned and not ai and not needs_switch and basis is null and retention is null and providers = '{}' and recorded_by is null))
     from public.processing_register where purpose = 'request_handling'")" = "$(sql -d "$db" -Atc "select format('%s %s', count(*), count(*)) from public.orgs")" ] ||
  { echo "RQU-01: not every org has request_handling's version 1, recording nothing" >&2; exit 1; }
[ "$(sql -d "$db" -Atc "$registers")" = "$kept_registers" ] || { echo "RQU-01: 0012 changed a register row already there" >&2; exit 1; }

# RQU-02: every contact version as it was, now reading OD-08's 10 and 30; still never changing;
# both new checks validated.
[ "$(sql -d "$db" -Atc "$settings")" = "$kept_settings" ] || { echo "RQU-02: 0012 changed a contact version already there" >&2; exit 1; }
[ "$(sql -d "$db" -Atc "select count(*) filter (where target_business_days = 10 and target_calendar_days = 30) || ' ' || count(*)
       from public.dpo_settings")" = '2 2' ] || { echo "RQU-02: a contact version doesn't read 10 and 30" >&2; exit 1; }
sql -d "$db" -o /dev/null -c "$(refused_like 23514 'Recorded contact details never change.%' 'an update of a contact version' \
  "update public.dpo_settings set target_business_days = 7 where org_id = '$org_b'")" ||
  { echo "RQU-02: dpo_settings_unchanged() let a contact version change" >&2; exit 1; }
[ "$(sql -d "$db" -Atc "select string_agg(conname || ' ' || convalidated, ',' order by conname) from pg_constraint
       where conname in ('dpo_settings_target_business_days', 'dpo_settings_target_calendar_days', 'cases_stated_settings',
                         'processing_restrictions_case', 'outbox_events_type')")" = \
  'cases_stated_settings true,dpo_settings_target_business_days true,dpo_settings_target_calendar_days true,outbox_events_type true,processing_restrictions_case true' ] ||
  { echo "RQU-02, RQU-05, RQU-08: a check or foreign key 0012 adds is missing or left NOT VALID" >&2; exit 1; }

# RQU-03: the upgraded schema matches a fresh build.
upgraded=$(sql -d "$db" -At -f scripts/schema-digest.sql)
fresh=$(sql -d "$base" -At -f scripts/schema-digest.sql)
if [ "$upgraded" != "$fresh" ]; then
  echo "RQU-03: the upgraded schema ($db) differs from a fresh build ($base):" >&2
  diff <(printf '%s\n' "$fresh") <(printf '%s\n' "$upgraded") | sed 's/^/  /' >&2 || true
  exit 1
fi

# RQU-05: the restriction already there, unchanged (its foreign key is validated, above).
[ "$(sql -d "$db" -Atc "$restrictions")" = "$kept_restrictions" ] || { echo "RQU-05: 0012 changed a restriction already there" >&2; exit 1; }

# RQU-07: every notice row as it was, the c09.2 version still linking settings version 2, which a
# generator before c09.3 never stated; and b1's request under it states none and falls due ten
# weekdays on.
[ "$(sql -d "$db" -Atc "$notice; $acks")" = "$kept_notice" ] || { echo "RQU-07: 0012 changed a notice row already there" >&2; exit 1; }
[ "$(sql -d "$db" -Atc "select format('%s %s', (select dpo_settings_version from public.notice_versions where id = '$b_v0'),
       public.notice_states_targets('c09.2'))")" = '2 f' ] ||
  { echo "RQU-07: org B's c09.2 version no longer links settings version 2, or c09.2 reads as stating targets" >&2; exit 1; }
sent=$(as_app_out "$org_b" "$b1" "select format('%s %s %s', id, received_on, due_on) from public.submit_case('question',
  'How long are the rota sheets kept?', gen_random_uuid(), 'req-upgrade', '$b_dev1', null)")
read -r sent_id sent_on sent_due <<<"$sent"
[ "$(sql -d "$db" -Atc "select format('%s %s', c.stated_settings_version is null,
       c.received_on = '$sent_on'::date and public.case_add_business_days(c.received_on, 10) = '$sent_due'::date)
     from public.cases c where c.id = '$sent_id'")" = 't t' ] ||
  { echo "RQU-07: b1's request under c09.2 stated a settings version, or isn't due ten weekdays on ($sent)" >&2; exit 1; }

# RQU-08: the outbox rows as they were (the type check is validated, above).
[ "$(sql -d "$db" -Atc "$outbox")" = "$kept_outbox" ] || { echo "RQU-08: 0012 changed an outbox row already there" >&2; exit 1; }

# RQU-04 last, since it writes: org B's DPO records version 3 of the contact, copying 10 and 30,
# then version 4 of the targets, copying the contact; org C's DPO, with no contact, is refused.
[ "$(as_app_out "$org_b" "$b2" "select format('%s %s', version, changed) from public.set_dpo_contact(2, 'Data Protection Officer',
       'dpo-office@upgrade.example', null, null, 'req-upgrade', null, null)")" = '3 t' ] &&
  [ "$(as_app_out "$org_b" "$b2" "select format('%s %s', version, changed) from public.set_reply_targets(3, 7, 21, 'req-upgrade',
       null, null)")" = '4 t' ] ||
  { echo "RQU-04: org B's DPO couldn't record the contact, then the targets, over the upgraded rows" >&2; exit 1; }
[ "$(sql -d "$db" -Atc "select string_agg(format('%s %s %s %s', version, contact_email, target_business_days, target_calendar_days),
       ',' order by version) from public.dpo_settings where org_id = '$org_b' and version >= 3")" = \
  '3 dpo-office@upgrade.example 10 30,4 dpo-office@upgrade.example 7 21' ] ||
  { echo "RQU-04: the new versions didn't copy the targets and then the contact" >&2; exit 1; }
as_app "$org_c" "$c2" "$(refused_like HF006 'Record your contact details first%' 'targets with no contact' \
  "perform public.set_reply_targets(null, 7, 21, 'req-upgrade', null, null)")" ||
  { echo "RQU-04: org C's targets were recorded with no contact" >&2; exit 1; }

echo "OK: 0012 upgraded $db over the rows 0001 to 0011 allow; the registers, the contact versions and their targets, the audit log's readers, the notice, the restriction and the outbox check out, and the schema matches a fresh build."
