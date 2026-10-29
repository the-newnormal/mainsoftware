// Every way a runtime transaction can write a table in schema public (the only schema
// scripts/check-migrations.sh allows; Postgres's own catalogue functions aside), and what covers
// it (TECH-SPEC T16 item 7): an outbox event the transaction must append, or an exemption with its
// reason. CLAUDE.md asks every content write to append its event with an ACL snapshot, and D41's
// seams every write to be covered, so nothing here is left undecided:
//   - content writes always append their event (no exemption is allowed for a content table,
//     packages/shared CONTENT_TABLES or one whose events carry a snapshot, by its grant or through
//     a function, nor for an insert into the provenance registry, a producer's (T23 item 14):
//     check-catalogues.ts refuses one);
//   - other writes append their catalogue event where a consumer may act on them (sign-ins,
//     credentials, deactivation, flags, the registers), including the grants a later step will use
//     first, which name that step's reserved events (C0.9, C0.15, C0.16);
//   - bookkeeping (last-seen stamps), security counters, the logs themselves and the queue's and
//     outbox's own machinery are exempt, each saying why.
//
// Two checks hold the code to it. apps/server/scripts/check-catalogues.ts (CI's migrations job)
// requires an entry here for every write grant any runtime role holds, every function such a role
// may execute and every SECURITY DEFINER and trigger function in the schema, and no entry for
// anything else, and each function's `writes` to name every table its body writes. The integration suites' sweep (testing/writes.ts) records every committed write
// and requires each to be exempt or to have, in its own transaction, an event of a listed type
// naming the row's MATCH column as its entity or among its subjects.
//
// Keys:
//   '<role> <table>:INSERT' and '<role> <table>:DELETE' for a role that may insert or delete rows
//     (by a table grant or a column grant: an insert is one row whichever columns it sets);
//   '<role> <table>.<column>:UPDATE' for each column a role may update;
//   '<function>(<argument types>)' for each function, with `writes` listing the '<table>:<op>' and
//     '<table>.<column>:UPDATE' it makes that its entry covers (an empty list when it writes
//     nothing), so the sweep can match a write made inside it, which it records as the role of the
//     transaction calling it. A write a caller's own grant covers (set_feature_flag()'s audit row)
//     is that grant's.
import type { EmittedEventType, EventType } from '@hearth/shared'

export type Coverage = ({ events: readonly EventType[] } | { exempt: string }) & { writes?: readonly string[] }

// Reasons shared by several entries.
const AUDIT_LOG = 'the audit log is itself the record of the change, written in its transaction (ADM-06)'
const ACCESS_LOG = 'the data access log is itself the record of the read it logs (PDPA-05)'
const OUTBOX = 'the outbox itself'
const QUEUE = "the queue's and scheduler's own machinery: jobs, schedules and their runs"
const CHECKPOINT = "the outbox's own machinery: a consumer's position, moved with its effects"
const LAST_SEEN = 'bookkeeping, at most once a minute, which no one makes and nothing acts on (T14 item 6)'
const CHECK = 'a check or a lock: it refuses or waits, and writes nothing'
// The DPO's settings (C0.9 PR 3a's contact, and from PR 3b the reply targets): both writers of
// dpo_settings.
const DPO_SETTINGS =
  "the DPO's settings, their contact and reply targets: its versions are its history, and nothing acts on a change until the next published version, which notice.published covers"
// Requests to the DPO (C0.9 PR 3b, OD-06, OD-14, OD-15): the reads write nothing.
const CASE_READ = 'a read of requests to the DPO, for the DPO or the requester (OD-14, OD-15), which writes nothing'
const STAMP = 'stamps the row being written with the database clock; that write is covered by its own entry'
// C0.10 (TECH-SPEC T23 items 7 and 13; LH-10, LH-23): the deletion log, and a request's deletion.
const DELETION_LOG = 'the deletion log is itself the record of each deletion, written in its transaction (PDPA-09)'
const CASE_DELETED =
  "a request is never indexed, derived from or retrieved (RQS-11, T22 item 62), so no consumer holds a copy to delete, and C0.14's alert re-reads the case and passes over one that is gone (T16 item 9); its deletion_log row and audit row are the record"
// C0.10 PR 2 (TECH-SPEC T23 item 14; LH-41, LH-42): the provenance registry's writers.
const PROVENANCE =
  "marks derived items withdrawn or stale, and deletes what nothing holds, in the transaction of their source's deletion, redaction, correction or edit, or, for staleness, in the handler or job that follows a rewrite of a source's stored ACL; no consumer of a derived kind exists, and the first producer of a derived-mode item adds provenance_items to CONTENT_TABLES and gives these writes their events (T23 item 14)"
// What a withdrawal writes: the item's state and reason, and its ACL row made nobody's under a new
// epoch.
const PROVENANCE_WITHDRAW = [
  'provenance_items.state:UPDATE',
  'provenance_items.withdrawn_at:UPDATE',
  'provenance_items.withdrawn_reason:UPDATE',
  'provenance_items.acl_tokens:UPDATE',
  'provenance_items.acl_more:UPDATE',
  'provenance_items.acl_epoch:UPDATE',
] as const
// What the cascade and provenance_forget() write: the withdrawal they call, the edges marked gone,
// each deleted item logged, and the items and their edges deleted.
const PROVENANCE_DELETE = [
  ...PROVENANCE_WITHDRAW,
  'provenance_sources.gone_at:UPDATE',
  'provenance_items:DELETE',
  'provenance_sources:DELETE',
  'deletion_log:INSERT',
] as const

const deactivation: Coverage = { events: ['person.deactivated'] }
// The registers (C0.9, TECH-SPEC T22 item 13): their functions are their only writers.
const transferChanged = 'register.transfer_changed' as const
// What ending an open clearance writes, by the DPO's decision or because new facts were recorded.
const CLEARANCE_ENDED = [
  'transfer_clearances.withdrawn_at:UPDATE',
  'transfer_clearances.withdrawn_by:UPDATE',
  'transfer_clearances.withdraw_reason:UPDATE',
] as const
const signinEnded: Coverage = { events: ['signin.ended'] }
const signinStarted: Coverage = { events: ['signin.started'] }
const pinSetOrReset: Coverage = { events: ['account.pin_set', 'account.pin_reset'] }
const personUpdated: Coverage = { events: ['person.updated', 'acl.changed'] }
const department: Coverage = { events: ['department.changed'] }
const team: Coverage = { events: ['team.changed', 'acl.changed'] }
const membership: Coverage = { events: ['team.membership_changed', 'acl.changed'] }
const phone: Coverage = { events: ['person.phone_changed'] }
const profile: Coverage = { events: ['profile.updated'] }
const queue: Coverage = { exempt: QUEUE }
const checkpoint: Coverage = { exempt: CHECKPOINT }

export const WRITES: Readonly<Record<string, Coverage>> = {
  // --- hearth_app, the api and realtime roles -------------------------------------------------

  // The logs (W1; read_audit_events' row below).
  'hearth_app audit_events:INSERT': { exempt: AUDIT_LOG },
  'hearth_app data_access_events:INSERT': { exempt: ACCESS_LOG },
  'hearth_app outbox_events:INSERT': { exempt: OUTBOX },

  // The roster (C0.16 writes these first; hearth_app may already). A person and their principal
  // are made in one transaction, which appends person.added.
  'hearth_app principals:INSERT': { events: ['person.added'] },
  'hearth_app people:INSERT': { events: ['person.added'] },
  'hearth_app people.full_name:UPDATE': personUpdated,
  // A department or a reporting line can bound what someone may read or manage (T13).
  'hearth_app people.department_id:UPDATE': personUpdated,
  'hearth_app people.manager_id:UPDATE': personUpdated,
  // W15: a deactivation (its cascade, people_end_sessions, is covered below).
  'hearth_app people.deactivated_at:UPDATE': deactivation,
  'hearth_app people.deactivated_by:UPDATE': deactivation,
  'hearth_app phone_numbers:INSERT': phone,
  'hearth_app phone_numbers.removed_at:UPDATE': phone,
  'hearth_app phone_numbers.removed_by:UPDATE': phone,
  'hearth_app departments:INSERT': department,
  'hearth_app departments.name:UPDATE': department,
  'hearth_app departments.archived_at:UPDATE': department,
  'hearth_app departments.archived_by:UPDATE': department,
  // An archived team ends its Team Admin's powers (T13), so it changes people's keys too.
  'hearth_app teams:INSERT': team,
  'hearth_app teams.name:UPDATE': team,
  'hearth_app teams.archived_at:UPDATE': team,
  'hearth_app teams.archived_by:UPDATE': team,
  'hearth_app team_memberships:INSERT': membership,
  'hearth_app team_memberships.removed_at:UPDATE': membership,
  'hearth_app team_memberships.removed_by:UPDATE': membership,

  // Profiles and working hours (C0.15 writes these first).
  'hearth_app profiles:INSERT': profile,
  'hearth_app profiles.display_name:UPDATE': profile,
  'hearth_app profiles.title:UPDATE': profile,
  'hearth_app profiles.time_zone:UPDATE': profile,
  'hearth_app profiles.custom_status:UPDATE': profile,
  'hearth_app profiles.custom_status_until:UPDATE': profile,
  'hearth_app profiles.updated_at:UPDATE': profile,
  'hearth_app working_hours:INSERT': profile,
  // Working hours are replaced whole: the old rows deleted, the new inserted, one profile.updated.
  'hearth_app working_hours:DELETE': profile,

  // The privacy notice: hearth_app writes neither table itself from 0010; publish_notice(),
  // acknowledge_notice() and, from 0011, record_notice_acknowledgement() below are their only
  // writers (C0.9 PD-42, OD-19). Nor the DPO's settings: set_dpo_contact() and, from 0012,
  // set_reply_targets() are their only writers. Nor requests to the DPO: no role holds a grant on
  // cases or case_steps, and the case functions below are their only writers (C0.9 OD-06).

  // Accounts and PINs. W3 and W4: setting a PIN at a PIN-role holder's first sign-in, or a code-only
  // sign-in making the account beside its signin.started (D46); W16: an admin's reset.
  'hearth_app users:INSERT': { events: ['account.pin_set', 'signin.started'] },
  'hearth_app users.pin_hash:UPDATE': pinSetOrReset,
  'hearth_app users.pin_key_id:UPDATE': pinSetOrReset,
  'hearth_app users.pin_set_at:UPDATE': pinSetOrReset,
  'hearth_app users.pin_reset_at:UPDATE': { events: ['account.pin_reset'] },
  'hearth_app users.pin_reset_by:UPDATE': { events: ['account.pin_reset'] },
  // W5, W6, and the reset to 0 that setting or resetting a PIN makes.
  'hearth_app users.pin_failures:UPDATE': {
    exempt:
      'a security counter; a PIN lock is audited (auth.pin_locked), and the set or reset it belongs to has its event',
  },

  // Passkeys. W12, W13; W2 is a passkey's use.
  'hearth_app passkeys:INSERT': { events: ['account.passkey_added'] },
  'hearth_app passkeys.removed_at:UPDATE': { events: ['account.passkey_removed'] },
  'hearth_app passkeys.removed_by:UPDATE': { events: ['account.passkey_removed'] },
  'hearth_app passkeys.counter:UPDATE': {
    exempt: "a credential's use: the sign-in or re-authentication it serves has its own event or audit row",
  },
  'hearth_app passkeys.last_used_at:UPDATE': {
    exempt: "a credential's use: the sign-in or re-authentication it serves has its own event or audit row",
  },

  // Devices and sessions. W10, W11: a sign-in; W14, W17 and the cascades: ending them.
  'hearth_app devices:INSERT': signinStarted,
  'hearth_app sessions:INSERT': signinStarted,
  'hearth_app devices.signed_out_at:UPDATE': signinEnded,
  'hearth_app devices.signed_out_by:UPDATE': signinEnded,
  'hearth_app sessions.revoked_at:UPDATE': signinEnded,
  'hearth_app sessions.revoked_by:UPDATE': signinEnded,
  'hearth_app sessions.revoke_reason:UPDATE': signinEnded,
  // W7, W8.
  'hearth_app devices.last_seen_at:UPDATE': { exempt: LAST_SEEN },
  'hearth_app sessions.last_seen_at:UPDATE': { exempt: LAST_SEEN },
  // W9.
  'hearth_app sessions.reauthenticated_at:UPDATE': {
    exempt: 'a stamp on the session, audited as auth.reauth; nothing acts on it but the next admin check',
  },
  // A device's name is set from the browser when it signs in; nothing renames one yet, and a name
  // changes no access and nothing downstream reads it. The step that adds renaming may give it an
  // event of its own.
  'hearth_app devices.label:UPDATE': {
    exempt: "a device's display name, which changes no access and which nothing downstream reads",
  },

  // --- The worker's job roles (T18) ----------------------------------------------------------

  'hearth_queue jobs:INSERT': queue,
  'hearth_queue jobs.state:UPDATE': queue,
  'hearth_queue jobs.attempts:UPDATE': queue,
  'hearth_queue jobs.give_backs:UPDATE': queue,
  'hearth_queue jobs.run_after:UPDATE': queue,
  'hearth_queue jobs.lease_token:UPDATE': queue,
  'hearth_queue jobs.lease_expires_at:UPDATE': queue,
  'hearth_queue jobs.claimed_by:UPDATE': queue,
  'hearth_queue jobs.reason:UPDATE': queue,
  'hearth_queue jobs.started_at:UPDATE': queue,
  'hearth_queue jobs.finished_at:UPDATE': queue,
  'hearth_queue schedules:INSERT': queue,
  'hearth_queue schedules.next_run_at:UPDATE': queue,
  'hearth_queue schedules.last_fired_at:UPDATE': queue,
  'hearth_queue schedules.retired_at:UPDATE': queue,
  'hearth_queue schedule_runs:INSERT': queue,
  'hearth_queue schedule_runs.state:UPDATE': queue,
  'hearth_queue schedule_runs.reason:UPDATE': queue,
  'hearth_queue schedule_runs.started_at:UPDATE': queue,
  'hearth_queue schedule_runs.finished_at:UPDATE': queue,
  'hearth_job_offboarding jobs:INSERT': queue,
  'hearth_job_offboarding outbox_checkpoints:INSERT': checkpoint,
  'hearth_job_offboarding outbox_checkpoints.last_tx:UPDATE': checkpoint,
  'hearth_job_offboarding outbox_checkpoints.last_id:UPDATE': checkpoint,
  'hearth_job_offboarding outbox_checkpoints.processed:UPDATE': checkpoint,
  'hearth_job_offboarding outbox_checkpoints.updated_at:UPDATE': checkpoint,
  'hearth_job_revocation jobs:INSERT': queue,
  'hearth_job_revocation outbox_checkpoints:INSERT': checkpoint,
  'hearth_job_revocation outbox_checkpoints.last_tx:UPDATE': checkpoint,
  'hearth_job_revocation outbox_checkpoints.last_id:UPDATE': checkpoint,
  'hearth_job_revocation outbox_checkpoints.processed:UPDATE': checkpoint,
  'hearth_job_revocation outbox_checkpoints.updated_at:UPDATE': checkpoint,

  // --- Functions -----------------------------------------------------------------------------

  // Changing a flag: the only way one changes (T17). Its audit row (flag.set) is covered by the
  // audit grant of hearth_app, the only role that may call it.
  'set_feature_flag(text, boolean, text, uuid[], text[], text, uuid, inet)': {
    events: ['flag.changed'],
    writes: [
      'feature_flags.enabled:UPDATE',
      'feature_flags.audience:UPDATE',
      'feature_flags.cohort_people:UPDATE',
      'feature_flags.cohort_roles:UPDATE',
      'feature_flags.revision:UPDATE',
      'feature_flags.updated_at:UPDATE',
      'feature_flags.updated_by:UPDATE',
    ],
  },
  // The registers (C0.9 PD-21, PD-22; TECH-SPEC T22 item 13): the DPO's routes call these after
  // can() allows the change and append the event in the same transaction, naming the new version's
  // row or the transfer entry. Their audit rows are covered by hearth_app's audit grant, as for
  // set_feature_flag(). The first-Owner bootstrap's function (bootstrap_transfer_clearance()), and
  // its break-glass re-clear (C0.9 OD-20), is no runtime role's and appends its own event (PD-23),
  // and the bootstrap script's own inserts, the owner's, append none (TECH-SPEC T22 item 66).
  'set_register_purpose(text, integer, text, text, text, integer, text, text[], text, uuid, inet)': {
    events: ['register.purpose_changed'],
    writes: ['processing_register:INSERT'],
  },
  'record_transfer_entry(text, bigint, text, text, text[], text[], text, text, text, date, boolean, text, text, text, text, text, date, boolean, text, uuid, inet)':
    {
      events: [transferChanged],
      writes: [
        ...CLEARANCE_ENDED,
        'transfer_register.services:UPDATE',
        'transfer_register.data_types:UPDATE',
        'transfer_register.processing_countries:UPDATE',
        'transfer_register.storage_countries:UPDATE',
        'transfer_register.countries_confirmed:UPDATE',
        'transfer_register.safeguard:UPDATE',
        'transfer_register.safeguard_reference:UPDATE',
        'transfer_register.certificate_verified_on:UPDATE',
        'transfer_register.dpa_terms_confirmed:UPDATE',
        'transfer_register.training:UPDATE',
        'transfer_register.zero_retention:UPDATE',
        'transfer_register.provider_retention:UPDATE',
        'transfer_register.retention_confirmed:UPDATE',
        'transfer_register.onward_recipients:UPDATE',
        'transfer_register.review_on:UPDATE',
        'transfer_register.revision:UPDATE',
        'transfer_register.updated_at:UPDATE',
        'transfer_register.updated_by:UPDATE',
        // "Save and keep cleared": the new facts' clearance (PD-05).
        'transfer_clearances:INSERT',
      ],
    },
  'clear_transfer_entry(text, bigint, text, uuid, inet)': {
    events: [transferChanged],
    writes: ['transfer_clearances:INSERT'],
  },
  'withdraw_transfer_clearance(text, text, uuid, inet)': { events: [transferChanged], writes: [...CLEARANCE_ENDED] },
  // An outbound client's question in the transaction that decides a send (PD-15): it reads the open
  // clearance FOR SHARE and writes nothing. From 0010 it wraps transfer_send_state(), which answers
  // why a code may or may not go too (PD-59, B-03, C-02).
  'transfer_cleared(text)': { exempt: CHECK, writes: [] },
  'transfer_send_state(text)': { exempt: CHECK, writes: [] },
  // The privacy notice (C0.9 PD-37, PD-42, PD-50; TECH-SPEC T22 items 33 and 45): the notice
  // tables' three writers. The api calls each after can() allows it (notice.publish,
  // notice.acknowledge_own, notice.acknowledgement.record) and appends the event in the same
  // transaction: notice.published naming the new version's row, whose id its links carry, and
  // notice.acknowledged naming the person, only when something was recorded. Their audit rows are
  // covered by hearth_app's audit grant, as for set_feature_flag(). 0011 replaced 0010's
  // publish_notice() with one that names the contact its draft printed (the same events and writes).
  'publish_notice(integer, text, text, text[], integer[], uuid[], integer, text, uuid, inet)': {
    events: ['notice.published'],
    writes: ['notice_versions:INSERT', 'notice_version_purposes:INSERT', 'notice_version_providers:INSERT'],
  },
  'acknowledge_notice(uuid, text, uuid, inet)': {
    events: ['notice.acknowledged'],
    writes: ['notice_acknowledgments:INSERT'],
  },
  // An acknowledgement the DPO records (C0.9 OD-19): the event an acknowledgement in the app appends.
  'record_notice_acknowledgement(uuid, uuid, date, text, text, uuid, inet)': {
    events: ['notice.acknowledged'],
    writes: ['notice_acknowledgments:INSERT'],
  },
  // The DPO's settings (C0.9 OD-08, OD-10, PD-63, PD-72, PD-94): the contact's writer, which from
  // 0012 copies the reply targets, and the targets' writer, which copies the contact. Its versions
  // are its history and each writer's audit row the record of who changed it; nothing acts on a
  // change until the next published version, which notice.published covers.
  'set_dpo_contact(integer, text, text, text, text, text, uuid, inet)': {
    exempt: DPO_SETTINGS,
    writes: ['dpo_settings:INSERT'],
  },
  'set_reply_targets(integer, integer, integer, text, uuid, inet)': {
    exempt: DPO_SETTINGS,
    writes: ['dpo_settings:INSERT'],
  },
  // Requests to the DPO (C0.9 PR 3b; OD-06, OD-14, PD-101; TECH-SPEC T22 item 59): the case
  // functions are the only writers of cases and case_steps, and the api appends each writer's event
  // in the same transaction, naming the case's row: case.opened for a request sent in Hearth or
  // logged by the DPO, case.changed for a step or the closure. Their audit rows are covered by
  // hearth_app's audit grant, as for set_feature_flag(). The reads and the indicator's count write
  // nothing.
  'submit_case(text, text, uuid, text, uuid, inet)': { events: ['case.opened'], writes: ['cases:INSERT'] },
  'log_case(text, text, date, uuid, text, text, text, text, uuid, text, uuid, inet)': {
    events: ['case.opened'],
    writes: ['cases:INSERT'],
  },
  'add_case_step(uuid, integer, text, date, text, date, text, text, text, uuid, inet)': {
    events: ['case.changed'],
    writes: [
      'case_steps:INSERT',
      'cases.closed_on:UPDATE',
      'cases.closed_kind:UPDATE',
      'cases.outcome:UPDATE',
      'cases.closed_note:UPDATE',
      'cases.closed_at:UPDATE',
      'cases.closed_by:UPDATE',
    ],
  },
  'read_own_cases(integer)': { exempt: CASE_READ, writes: [] },
  'read_cases(boolean, integer)': { exempt: CASE_READ, writes: [] },
  'read_case(uuid)': { exempt: CASE_READ, writes: [] },
  'read_case_steps(uuid)': { exempt: CASE_READ, writes: [] },
  'read_case_others(uuid, integer)': { exempt: CASE_READ, writes: [] },
  'case_attention()': { exempt: 'a read: how many open requests need the DPO, and nothing written', writes: [] },
  // Whether the latest version states each open clearance, for the registers' copy (B-06): a read.
  'notice_provider_states()': {
    exempt: 'a read: whether the latest notice states each open clearance, and nothing written',
    writes: [],
  },
  // A published version never changes, and a stand-in never follows a generated one (PD-33); nor
  // does a recorded contact version (PD-63); nor what a request received, nor a step on it (PD-88,
  // PD-91).
  'notice_unchanged()': { exempt: CHECK, writes: [] },
  'dpo_settings_unchanged()': { exempt: CHECK, writes: [] },
  'cases_fixed()': { exempt: CHECK, writes: [] },
  'case_steps_unchanged()': { exempt: CHECK, writes: [] },
  'notice_versions_generated()': { exempt: CHECK, writes: [] },
  'orgs_add_registers()': {
    exempt: 'gives a new org its register entries; it runs only when the owner makes an org, never at run time',
    writes: ['processing_register:INSERT', 'transfer_register:INSERT'],
  },
  'transfer_clearances_check()': {
    exempt:
      "checks a clearance's facts and stamps the row being written with the revision and facts it rests on; that write is covered by its own entry",
    writes: [],
  },
  'transfer_register_check()': { exempt: CHECK, writes: [] },
  'processing_restrictions_check()': { exempt: CHECK, writes: [] },
  // D2: a deactivation ends the person's sessions and signs out their devices, as part of the one
  // business event (T16 item 8).
  'people_end_sessions()': {
    events: ['signin.ended'],
    writes: [
      'sessions.revoked_at:UPDATE',
      'sessions.revoked_by:UPDATE',
      'sessions.revoke_reason:UPDATE',
      'devices.signed_out_at:UPDATE',
      'devices.signed_out_by:UPDATE',
    ],
  },
  // D1: signing a device out ends its sessions.
  'devices_end_sessions()': {
    events: ['signin.ended'],
    writes: ['sessions.revoked_at:UPDATE', 'sessions.revoked_by:UPDATE', 'sessions.revoke_reason:UPDATE'],
  },
  // D3: the failure count's own time, set with it.
  'users_check_pin_failures()': {
    exempt: 'stamps the time of the last PIN failure with its count, a security counter',
    writes: ['users.pin_last_failed_at:UPDATE'],
  },
  // D4.
  'sessions_stamp_times()': { exempt: STAMP, writes: [] },
  // D5: reading the audit log logs itself.
  'read_audit_events(timestamp with time zone, timestamp with time zone, bigint, integer)': {
    exempt: 'a read of the audit log, which logs itself in it (audit.read)',
    writes: ['audit_events:INSERT'],
  },
  // D6: creates partitions, writes no row.
  'create_data_access_partitions(integer)': {
    exempt: "DDL only: it creates data_access_events' month partitions and writes no row",
    writes: [],
  },
  'orgs_add_feature_flags()': {
    exempt: 'gives a new org its flags; it runs only when the owner makes an org, never at run time',
    writes: ['feature_flags:INSERT'],
  },
  'job_finish(uuid, uuid, bigint[])': {
    exempt: QUEUE,
    writes: [
      'jobs.state:UPDATE',
      'jobs.finished_at:UPDATE',
      'jobs.lease_token:UPDATE',
      'jobs.lease_expires_at:UPDATE',
      'jobs.reason:UPDATE',
      'schedule_runs.state:UPDATE',
      'schedule_runs.finished_at:UPDATE',
    ],
  },
  // The clean-up: the only way rows leave the outbox and the queue, each batch audited (T15 item 17).
  'purge_outbox(integer)': {
    exempt: 'the clean-up, which deletes by position after 14 days and writes one audit row per batch',
    writes: [
      'outbox_events:DELETE',
      'outbox_floors:INSERT',
      'outbox_floors.last_tx:UPDATE',
      'outbox_floors.last_id:UPDATE',
      'outbox_floors.purged_at:UPDATE',
      'audit_events:INSERT',
    ],
  },
  'purge_jobs(integer)': {
    exempt: 'the clean-up of finished jobs, which writes one audit row per batch',
    writes: ['jobs:DELETE', 'audit_events:INSERT'],
  },
  'purge_schedule_runs(integer)': {
    exempt: 'the clean-up of finished schedule runs, which writes one audit row per batch',
    writes: ['schedule_runs:DELETE', 'audit_events:INSERT'],
  },
  // C0.10 (0013; TECH-SPEC T23; LH-10 to LH-13, LH-22, LH-23, LH-30): the deletion code and its
  // guard. Each is granted to nobody until the step that calls it (C1.2, C2.9), so check-catalogues
  // reads them as SECURITY DEFINER or trigger functions. log_deletion() writes the log in the
  // deleting transaction; delete_case() deletes a request and its steps, logs it (through
  // log_deletion()) and audits it as Hearth, with no outbox event (LH-23); is_held() and the
  // triggers decide and write nothing. The plain helpers (lifecycle_held() and the rest) are neither
  // definers nor runnable by any runtime role, so they have no entry.
  'log_deletion(text, text, text, text, uuid, bigint, text, text, boolean)': {
    exempt: DELETION_LOG,
    writes: ['deletion_log:INSERT'],
  },
  'delete_case(uuid, text, boolean)': {
    exempt: CASE_DELETED,
    writes: ['deletion_log:INSERT', 'cases:DELETE', 'case_steps:DELETE', 'audit_events:INSERT'],
  },
  'is_held(text, uuid)': { exempt: 'reads only, and answers a boolean', writes: [] },
  'lifecycle_guard()': { exempt: CHECK, writes: [] },
  'lifecycle_no_truncate()': { exempt: CHECK, writes: [] },
  'deletion_log_kept()': { exempt: CHECK, writes: [] },
  'legal_holds_kept()': { exempt: CHECK, writes: [] },
  // C0.10 PR 2 (0014; TECH-SPEC T23 item 14; LH-39 to LH-43): the provenance registry's definers,
  // each granted to nobody until the step that calls each (C1.1, C1.2, C2.9, C2.11, C3.5, C4.1, C4.3,
  // C4.4, A2.3), so check-catalogues reads them as SECURITY DEFINER functions. withdraw_dependants() and
  // provenance_mark_stale() mark items; lifecycle_cascade() and provenance_forget() withdraw, log
  // (through log_deletion()) and delete, each listing the withdrawal it calls. The tables' triggers
  // only refuse: four plain functions, and the deferred provenance_items_complete(), a definer as
  // lifecycle_guard() is. The plain helpers provenance_dependants() and provenance_lock_ahead() are
  // neither definers nor runnable by any runtime role, so they have no entry.
  'withdraw_dependants(text, uuid, text)': { exempt: PROVENANCE, writes: PROVENANCE_WITHDRAW },
  'provenance_mark_stale(text, uuid, text)': {
    exempt: PROVENANCE,
    writes: [
      'provenance_items.state:UPDATE',
      'provenance_items.stale_since:UPDATE',
      'provenance_items.stale_reason:UPDATE',
    ],
  },
  'lifecycle_cascade(text, uuid, bigint, integer)': { exempt: PROVENANCE, writes: PROVENANCE_DELETE },
  'provenance_forget(text, uuid, text, bigint)': { exempt: PROVENANCE, writes: PROVENANCE_DELETE },
  'provenance_items_insert()': { exempt: CHECK, writes: [] },
  'provenance_items_state()': { exempt: CHECK, writes: [] },
  'provenance_items_complete()': { exempt: CHECK, writes: [] },
  'provenance_sources_insert()': { exempt: CHECK, writes: [] },
  'provenance_sources_fixed()': { exempt: CHECK, writes: [] },
  // Lookups, fences and checks.
  'session_by_token(bytea, interval)': { exempt: 'a sign-in lookup before the org is known', writes: [] },
  'person_by_phone(text)': { exempt: 'a sign-in lookup before the org is known', writes: [] },
  'worker_org_ids()': { exempt: "the worker's list of org ids", writes: [] },
  'feature_fence(text, bigint[])': { exempt: CHECK, writes: [] },
  'job_fence(uuid, uuid, bigint[])': { exempt: CHECK, writes: [] },
  'is_ids_only(jsonb)': { exempt: CHECK, writes: [] },
  'is_iana_time_zone(text)': { exempt: CHECK, writes: [] },
  'check_user_active()': { exempt: CHECK, writes: [] },
  'keep_history()': { exempt: CHECK, writes: [] },
  'notice_versions_check()': { exempt: CHECK, writes: [] },
  'outbox_checkpoints_own_row()': { exempt: CHECK, writes: [] },
  'outbox_events_check_actor()': { exempt: CHECK, writes: [] },
  'people_check_department()': { exempt: CHECK, writes: [] },
  'people_check_manager()': { exempt: CHECK, writes: [] },
  'role_assignments_check()': { exempt: CHECK, writes: [] },
  'sessions_check_start()': { exempt: CHECK, writes: [] },
  'team_memberships_check()': { exempt: CHECK, writes: [] },
}

// For each table an event covers a write to, the column whose value the covering event must name,
// as its entity or among its subjects: the person, or the row itself.
export const MATCH: Readonly<Record<string, string>> = {
  people: 'id',
  principals: 'id',
  users: 'id',
  phone_numbers: 'person_id',
  devices: 'user_id',
  sessions: 'user_id',
  passkeys: 'user_id',
  profiles: 'person_id',
  working_hours: 'person_id',
  team_memberships: 'person_id',
  teams: 'id',
  departments: 'id',
  notice_versions: 'id',
  // A version's links name it (notice.published's entity, PD-34).
  notice_version_purposes: 'notice_version_id',
  notice_version_providers: 'notice_version_id',
  notice_acknowledgments: 'person_id',
  feature_flags: 'id',
  // A purpose's change names the new version's row; a provider's, its transfer entry (PD-22).
  processing_register: 'id',
  transfer_register: 'id',
  transfer_clearances: 'entry_id',
  // A request's events name its case (C0.9 PD-101): its row, and each step's case.
  cases: 'id',
  case_steps: 'case_id',
}

// The integration suite that must append each emitted type at least once (testing/writes.ts): each
// suite has its own database and module state, so a union across files can't be taken, and each
// checks its own share instead. The passkey events belong to the dormant passkey suite, the only one
// that switches passkeys on (D46). The register events belong to the registers suite (C0.9 PD-22),
// the notice's to the notice suite (C0.9 PD-50), and the requests' to the cases suite (C0.9 PD-101).
export const EMITTED_BY: Readonly<
  Record<EmittedEventType, 'sign-in' | 'passkeys' | 'flags' | 'outbox' | 'jobs' | 'registers' | 'notice' | 'cases'>
> = {
  'signin.started': 'sign-in',
  'signin.ended': 'sign-in',
  'account.pin_set': 'sign-in',
  'account.pin_reset': 'sign-in',
  'account.passkey_added': 'passkeys',
  'account.passkey_removed': 'passkeys',
  'person.deactivated': 'sign-in',
  'acl.changed': 'sign-in',
  'flag.changed': 'flags',
  'register.purpose_changed': 'registers',
  'register.transfer_changed': 'registers',
  'notice.published': 'notice',
  'notice.acknowledged': 'notice',
  'case.opened': 'cases',
  'case.changed': 'cases',
}

export type WriteOp = 'INSERT' | 'UPDATE' | 'DELETE'

// The key a write grant has: a row operation by table, an update by column.
export function grantKey(role: string, table: string, op: WriteOp, column?: string): string {
  return op === 'UPDATE' ? `${role} ${table}.${column ?? '?'}:UPDATE` : `${role} ${table}:${op}`
}

// What a function's `writes` names for the same write.
export function writeKey(table: string, op: WriteOp, column?: string): string {
  return op === 'UPDATE' ? `${table}.${column ?? '?'}:UPDATE` : `${table}:${op}`
}

// The entries that can cover one write a role made: its grant's, or failing that every function
// that says it makes that write (a definer function, or a trigger, writing on the role's behalf).
// The sweep can't tell which of them made it, so an exemption excuses it only when every one is
// exempt. Empty when nothing here explains the write.
export function coverageOf(
  role: string,
  table: string,
  op: WriteOp,
  column?: string,
): Array<{ key: string; coverage: Coverage }> {
  const key = grantKey(role, table, op, column)
  const granted = WRITES[key]
  if (granted !== undefined) return [{ key, coverage: granted }]
  const write = writeKey(table, op, column)
  return Object.entries(WRITES)
    .filter(([, coverage]) => coverage.writes?.includes(write))
    .map(([name, coverage]) => ({ key: name, coverage }))
}
