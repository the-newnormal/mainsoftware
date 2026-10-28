// The retention-class registry (C0.10, PDPA-09, ADM-07; TECH-SPEC T23 items 2 to 6; LH-03 to
// LH-09): every kind of data Hearth keeps, how long, from what, who may change that and whether
// holds keep it longer. Keys and fixed facts live here, in code, as PURPOSES and FLAGS do (T16 item
// 16, T22 item 18). The classes whose data Postgres holds or whose objects S3 holds are mirrored by
// migration 0013's retention_class_defaults(), which lists exactly retentionClassDefaults()'s rows,
// and apps/server/scripts/check-catalogues.ts (check 7) holds the two equal both ways, every table of
// public in exactly one class, every fixed age equal to the interval in its function's body, and the
// vocabularies below equal the database's. A class has no per-org row: nothing in C0 changes a period
// per org, and C2.9 adds the settings table, its setter (within each class's range) and the rule for
// changing a period (LH-38), replacing retention_period_days() with the same signature (LH-09).
//
// Nothing here deletes anything: C0 has no retention sweep (BUILD-PLAN's C0 "Not in this stage"
// line). The deletion code (C0.10's delete_case(), then C1.2's, C2.9's and C4.1's) asks the
// database's hold decision, never this file; heldUntil() below is the refused-copy window's mirror,
// a test oracle and the DPO's "kept until" (LH-18), never an answer to whether something is held.
//
// The server and infra/ load this file (T2; C0.11 and C0.13 read the logs classes at synth time), and
// the package compiles with lib ES2024 and no DOM or Node types.
import { type CaseKind, type CaseStepKind, type Outcome, shiftDay } from './cases.ts'
import type { PurposeKey } from './purposes.ts'

// Where a class's data lives. Postgres and S3 are the deletion code's to delete, so the SQL mirror
// lists them (RETENTION_DB_STORES); Valkey expires its own keys, and the logs and backups are aged
// out by AWS as infra/ sets them (LH-07).
export type RetentionStore = 'postgres' | 's3' | 'valkey' | 'logs' | 'backups'
export const RETENTION_DB_STORES = ['postgres', 's3'] as const satisfies readonly RetentionStore[]

// What a period counts from, in the org's time zone for a day count.
export type RetentionAnchor =
  | 'at' // the row's own time (a log row)
  | 'created' // made or sent
  | 'ended' // removed, signed out, expired, revoked, a session's end, or a calendar event's
  | 'finished' // a job or run finished, or was decided
  | 'closed_on' // a request to the DPO (or a breach) was closed
  | 'last_edit' // the last edit or update: a Drive item's or its owner's renewal, a conversation's or a memory's
  | 'trashed' // put in the Trash
  | 'released' // a legal hold was released
  | 'consent' // a clip's consent (the transcription test set)

export type RetentionPeriod =
  // A number of days from an anchor, and the allowed range of a later setter, in days, which lives
  // here in code (CLAUDE.md, AI and LLM features: every setting's allowed range).
  | { kind: 'days'; days: number; anchor: RetentionAnchor; range?: readonly [number, number] }
  // Deleted with another class's item (of: that class's key, which LCS-04 holds to one), or with
  // whatever it was made from ('source').
  | { kind: 'follows'; of: string }
  // Kept while something lasts: the org (with the written justification PDPA-09 asks for), the
  // person's other data (acknowledgements), a hold (versions kept only for one).
  | { kind: 'while'; what: 'org' | 'person' | 'held'; justification?: string }
  // Deleted when something happens, and at most so many days after the anchor meanwhile.
  | { kind: 'until'; event: 'deactivation' | 'withdrawal' | 'promotion'; days?: number; anchor?: RetentionAnchor }
  // Expiry fixed in code (Valkey): each key family's longest life in milliseconds, or 'not_stored'
  // for a pub/sub channel, which keeps nothing.
  | { kind: 'ttl'; families: Readonly<Record<string, number | 'not_stored'>> }

export interface RetentionClass {
  store: RetentionStore
  // The tables of public it covers, each in exactly one class (LCS-01, check 7b); empty for a later
  // step's class until that step moves its tables in.
  tables: readonly string[]
  // In words, for the docs and the DPO.
  covers: string
  purposes: readonly PurposeKey[]
  ai: boolean
  // The step whose data it is (BUILD-PLAN), or the steps, comma-separated.
  stage: string
  period: RetentionPeriod
  // decided (D36, FILE-02), proposed (PDPA-09's defaults, for the DPO to confirm: Q13; and LH-53's,
  // confirmed as declarations until their steps), fixed (in SQL or code: changing it is a migration
  // or a reviewed code change), or dpo (as set by the DPO, with a default until then).
  status: 'decided' | 'proposed' | 'fixed' | 'dpo'
  // Who may change the period, and from which step: Owners and Admins within the range (ADM-07), the
  // DPO alone, a migration, a code change, AWS itself, or nobody (LH-38).
  setBy: { who: 'admins' | 'dpo' | 'migration' | 'code' | 'aws' | 'none'; from?: string }
  // D12: never for audio and video, transcripts and AI notes, and for every AI class (LH-06);
  // justified where PDPA-09 lets data be kept with a written justification.
  indefinite: 'never' | 'justified'
  // apply: deleted only through the deletion code, which checks holds (the guard on each table that
  // has a delete path, LH-11, LH-12); exempt: outside holds, with the decision that records why
  // (LH-26, LH-48, LH-57); kept: history, never deleted.
  holds: 'apply' | 'kept' | { exempt: string; decision: string }
  // A leaver's in-place reduction (C2.9: profile fields, PIN hash, working hours) is deletion code
  // that asks lifecycle_held() and skips a held person, whatever `holds` says of other changes (LH-58).
  // Only a table of a class marked so may take a `checked` delete path, which logs each row it
  // deletes; every other holds-apply table's path is `guarded` (check 8, GUARD-02).
  reduction?: 'apply'
  // The step whose code deletes it.
  deletedBy: string
  // The fixed ages the database enforces, as the interval literals in each function's body (check 7c).
  fixedIn?: readonly { fn: string; intervals: readonly string[] }[]
  // S3 objects: versioned always (C0.12), and an Object Lock legal hold where holds need it (REC-23,
  // ADM-08: held recordings).
  objects?: { objectLock: boolean }
}

// The range Owners and Admins choose within for a log or sign-in record (ADM-06: never below a year).
const LOG_RANGE = [365, 2190] as const
// T16 item 6: why the clean-up stands outside holds (LH-26, confirmed under LH-48; section 3.7 of
// the design).
const CLEANUP =
  'T16 item 6: the outbox, jobs and runs hold only ids of facts the base tables and the audit log keep; their age is a maximum as well as a minimum, and a held subject below the outbox floor would stall every consumer'
// LH-48: Valkey expires its own keys, which hold keyed hashes and ids only, are never restored, and
// whose facts the audit rows a hold keeps also record.
const VALKEY = 'expiry is a security control, not a delete path; keyed hashes and ids only, never restored'
// LH-48: the logs, traces and RUM age out at AWS; their facts are in the audit log, which holds cover.
const AWS_LOGS = 'aged out by AWS; their facts are in the audit log, which holds cover'

export const RETENTION_CLASSES = {
  // --- C0's data: every table of public, the migrator's ledger aside ------------------------------
  org_settings: {
    store: 'postgres',
    tables: ['orgs', 'audit_log_readers'],
    covers: 'The organisation itself, its settings, and which roles read its audit log',
    purposes: ['service_operation'],
    ai: false,
    stage: 'C0.3',
    period: { kind: 'while', what: 'org', justification: 'the organisation itself, and which roles read its log' },
    status: 'proposed',
    setBy: { who: 'none' },
    indefinite: 'justified',
    holds: 'kept',
    deletedBy: 'none',
  },
  roster: {
    store: 'postgres',
    tables: [
      'principals',
      'people',
      'users',
      'departments',
      'teams',
      'team_memberships',
      'role_assignments',
      'profiles',
    ],
    covers:
      'The roster, accounts, org structure, roles and profiles; a leaver’s profile is reduced to name and title (PDPA-09), and their PIN hash cleared with their sign-in records',
    purposes: ['accounts'],
    ai: false,
    stage: 'C0.3',
    period: {
      kind: 'while',
      what: 'org',
      justification: 'attribution of kept content; audit rows read the actor’s roles at the time (T12)',
    },
    status: 'proposed',
    setBy: { who: 'none' },
    indefinite: 'justified',
    holds: 'kept',
    reduction: 'apply',
    deletedBy: 'C2.9 (the leaver reduction)',
  },
  working_hours: {
    store: 'postgres',
    tables: ['working_hours'],
    covers: 'A person’s working hours, replaced whole by their own edit; a leaver’s go with the profile’s reduction',
    purposes: ['accounts'],
    ai: false,
    stage: 'C0.3',
    period: { kind: 'until', event: 'deactivation' },
    status: 'proposed',
    setBy: { who: 'none' },
    indefinite: 'never',
    holds: {
      exempt:
        'a person’s own current settings, replaced by their own edit; profile.updated and its audit row record each change',
      decision: 'LH-48',
    },
    reduction: 'apply',
    deletedBy: 'C0.15 (the person’s own edit); C2.9 (the leaver reduction)',
  },
  sign_in_records: {
    store: 'postgres',
    tables: ['phone_numbers', 'devices', 'sessions', 'passkeys'],
    covers:
      'Phone numbers, devices, sign-in sessions and passkeys, 731 days after each ended (a number removed, a device signed out, a session expired or revoked, a passkey removed); a current one is never due',
    purposes: ['accounts'],
    ai: false,
    stage: 'C0.3, C0.5',
    period: { kind: 'days', days: 731, anchor: 'ended', range: LOG_RANGE },
    status: 'proposed',
    setBy: { who: 'admins', from: 'C2.9' },
    indefinite: 'never',
    holds: 'apply',
    deletedBy: 'C2.9',
  },
  acknowledgements: {
    store: 'postgres',
    tables: ['notice_acknowledgments'],
    covers: 'Who acknowledged which version of the privacy notice, and how (PDPA-03)',
    purposes: ['accounts'],
    ai: false,
    stage: 'C0.3',
    period: { kind: 'while', what: 'person', justification: 'kept while the person’s other data is kept (PDPA-09)' },
    status: 'proposed',
    setBy: { who: 'none' },
    indefinite: 'justified',
    holds: 'apply',
    deletedBy: 'C2.9',
  },
  audit_log: {
    store: 'postgres',
    tables: ['audit_events'],
    covers: 'The audit log (ADM-06), 731 days and never below 365',
    purposes: ['security_audit'],
    ai: false,
    stage: 'C0.3',
    period: { kind: 'days', days: 731, anchor: 'at', range: LOG_RANGE },
    status: 'proposed',
    setBy: { who: 'admins', from: 'C2.9' },
    indefinite: 'never',
    holds: 'apply',
    deletedBy: 'C2.9, with C0.16’s hash chain',
  },
  access_log: {
    store: 'postgres',
    tables: ['data_access_events'],
    covers:
      'The data access stream and its month partitions (ADM-06, PDPA-06); a partition is dropped only once it holds no row',
    purposes: ['access_logs'],
    ai: false,
    stage: 'C0.3',
    period: { kind: 'days', days: 731, anchor: 'at', range: LOG_RANGE },
    status: 'proposed',
    setBy: { who: 'admins', from: 'C2.9' },
    indefinite: 'never',
    holds: 'apply',
    deletedBy: 'C2.9',
  },
  outbox: {
    store: 'postgres',
    tables: ['outbox_events'],
    covers: 'The outbox: 14 days, a minimum and a maximum, by position (T16 item 6)',
    purposes: ['service_operation'],
    ai: false,
    stage: 'C0.6',
    period: { kind: 'days', days: 14, anchor: 'at' },
    status: 'fixed',
    setBy: { who: 'migration', from: 'C0.6' },
    indefinite: 'never',
    holds: { exempt: CLEANUP, decision: 'LH-26' },
    deletedBy: 'C0.6, purge_outbox()',
    fixedIn: [{ fn: 'purge_outbox', intervals: ['14 days'] }],
  },
  jobs: {
    store: 'postgres',
    tables: ['jobs'],
    covers: 'The job queue: succeeded and cancelled jobs 14 days after they finished, dead ones 30 days',
    purposes: ['service_operation'],
    ai: false,
    stage: 'C0.6',
    period: { kind: 'days', days: 14, anchor: 'finished' },
    status: 'fixed',
    setBy: { who: 'migration', from: 'C0.6' },
    indefinite: 'never',
    holds: { exempt: CLEANUP, decision: 'LH-26' },
    deletedBy: 'C0.6, purge_jobs()',
    fixedIn: [{ fn: 'purge_jobs', intervals: ['14 days', '30 days'] }],
  },
  schedule_runs: {
    store: 'postgres',
    tables: ['schedule_runs'],
    covers:
      'Scheduled runs, 90 days after a run finished or was decided; never one waiting for review, nor a resumed one whose next attempt doesn’t exist',
    purposes: ['service_operation'],
    ai: false,
    stage: 'C0.6',
    period: { kind: 'days', days: 90, anchor: 'finished' },
    status: 'fixed',
    setBy: { who: 'migration', from: 'C0.6' },
    indefinite: 'never',
    holds: { exempt: CLEANUP, decision: 'LH-26' },
    deletedBy: 'C0.6, purge_schedule_runs()',
    fixedIn: [{ fn: 'purge_schedule_runs', intervals: ['90 days'] }],
  },
  service_config: {
    store: 'postgres',
    tables: ['feature_flags', 'schedules', 'outbox_checkpoints', 'outbox_floors'],
    covers: 'Hearth’s own settings and positions: flags, schedules and the outbox’s checkpoints and floors',
    purposes: ['service_operation'],
    ai: false,
    stage: 'C0.6',
    period: { kind: 'while', what: 'org', justification: 'Hearth’s own settings and positions, with no personal data' },
    status: 'fixed',
    setBy: { who: 'none' },
    indefinite: 'justified',
    holds: 'kept',
    deletedBy: 'none',
  },
  compliance_records: {
    store: 'postgres',
    tables: [
      'processing_register',
      'transfer_register',
      'transfer_clearances',
      'processing_restrictions',
      'notice_versions',
      'notice_version_purposes',
      'notice_version_providers',
      'dpo_settings',
    ],
    covers:
      'The processing and transfer registers, processing restrictions, the privacy notice’s versions and the DPO’s business contact (C2.11 decides a lifted restriction’s)',
    purposes: ['accounts'],
    ai: false,
    stage: 'C0.9',
    period: {
      kind: 'while',
      what: 'org',
      justification:
        'what the organisation stated, cleared and published, and when (PDPA-01, PDPA-02, PDPA-10); the DPO’s business contact',
    },
    status: 'proposed',
    setBy: { who: 'none' },
    indefinite: 'justified',
    holds: 'kept',
    deletedBy: 'none',
  },
  // LH-08, LH-47: one period for every outcome, 2 years after closure by default; from C2.9 the DPO
  // sets it as a structured value beside request_handling's register entry (3.5). A refused copy, or
  // an open copy or correction request, also holds itself (LH-19, LH-20).
  cases: {
    store: 'postgres',
    tables: ['cases', 'case_steps'],
    covers:
      'Requests to the DPO and their steps, with requesters’ names, channels and addresses; an open request is never due',
    purposes: ['request_handling'],
    ai: false,
    stage: 'C0.9',
    period: { kind: 'days', days: 731, anchor: 'closed_on', range: [90, 3650] },
    status: 'dpo',
    setBy: { who: 'dpo', from: 'C2.9' },
    indefinite: 'never',
    holds: 'apply',
    deletedBy: 'C2.9, through delete_case()',
  },
  // LH-36: no purpose until C1.11 adds the legal_holds key with its first writer. LH-53: 2 years
  // after release; an active hold is never due, and holds itself.
  legal_holds: {
    store: 'postgres',
    tables: ['legal_holds'],
    covers: 'Legal holds (ADM-08), with their stated reasons; an active hold is never due',
    purposes: [],
    ai: false,
    stage: 'C0.10',
    period: { kind: 'days', days: 731, anchor: 'released' },
    status: 'proposed',
    setBy: { who: 'migration' },
    indefinite: 'never',
    holds: 'apply',
    deletedBy: 'C2.9',
  },
  // LH-10: ids and codes only, so a restore can replay it (C0.17); 731 days, fixed in SQL.
  deletion_log: {
    store: 'postgres',
    tables: ['deletion_log'],
    covers: 'The record of every deletion: ids and codes, never a name, a reason or the row',
    purposes: ['service_operation'],
    ai: false,
    stage: 'C0.10',
    period: { kind: 'days', days: 731, anchor: 'at' },
    status: 'fixed',
    setBy: { who: 'migration', from: 'C0.10' },
    indefinite: 'never',
    holds: {
      exempt: 'the record of every deletion, holding no person’s id; a hold has nothing to keep in it',
      decision: 'LH-10',
    },
    deletedBy: 'C2.9’s purge',
    fixedIn: [{ fn: 'deletion_log_kept', intervals: ['731 days'] }],
  },
  // LH-39 (PR 2 moves provenance_items and provenance_sources in): withdrawn and deleted with what it
  // was made from, by the cascade or C2.9.
  provenance: {
    store: 'postgres',
    tables: [],
    covers: 'What each derived or cited item was made from (BRAIN-08)',
    purposes: [],
    ai: false,
    stage: 'C0.10',
    period: { kind: 'follows', of: 'source' },
    status: 'fixed',
    setBy: { who: 'none' },
    indefinite: 'never',
    holds: 'apply',
    deletedBy: 'the deletion code, with its item',
  },

  // --- Later content: each step moves its tables in ------------------------------------------------
  profile_photos: {
    store: 's3',
    tables: [],
    covers:
      'Profile photos: the current one while the profile keeps it, a replaced or removed one at once, a leaver’s with the profile’s reduction',
    purposes: ['accounts'],
    ai: false,
    stage: 'C0.15',
    period: { kind: 'follows', of: 'roster' },
    status: 'proposed',
    setBy: { who: 'none' },
    indefinite: 'never',
    holds: 'apply',
    deletedBy: 'C0.15; C2.9',
    objects: { objectLock: false },
  },
  // LH-57: logged with cause upload; exempt from holds, confirmed under LH-48.
  upload_quarantine: {
    store: 's3',
    tables: [],
    covers:
      'A copy in quarantine: deleted, every version, when promoted, re-encoded (EXIF stripped) or refused by the scan, and at most 1 day after upload meanwhile',
    purposes: ['accounts', 'content_delivery'],
    ai: false,
    stage: 'C0.15',
    period: { kind: 'until', event: 'promotion', days: 1, anchor: 'created' },
    status: 'proposed',
    setBy: { who: 'none' },
    indefinite: 'never',
    holds: { exempt: 'a transient copy; the promoted or re-encoded object is what a hold keeps', decision: 'LH-57' },
    deletedBy: 'C0.15',
    objects: { objectLock: false },
  },
  messages: {
    store: 'postgres',
    tables: [],
    covers: 'Messages in channels, DMs and group DMs, 1,095 days after sent (Q13)',
    purposes: ['content_delivery'],
    ai: false,
    stage: 'C1.1',
    period: { kind: 'days', days: 1095, anchor: 'created', range: [30, 3650] },
    status: 'proposed',
    setBy: { who: 'admins', from: 'C2.9' },
    indefinite: 'justified',
    holds: 'apply',
    deletedBy: 'C1.2; C2.9',
  },
  held_versions: {
    store: 'postgres',
    tables: [],
    covers: 'A message’s earlier versions, or a deleted one’s content, kept only while a hold needs them (CHAT-05)',
    purposes: ['content_delivery'],
    ai: false,
    stage: 'C1.2',
    period: { kind: 'while', what: 'held' },
    status: 'fixed',
    setBy: { who: 'none' },
    indefinite: 'never',
    holds: 'apply',
    deletedBy: 'C1.2',
  },
  derived_caches: {
    store: 'postgres',
    tables: [],
    covers:
      'Search index rows, version histories, computed sheet values and thumbnails, deleted with their source (PDPA-09)',
    purposes: [],
    ai: false,
    stage: 'C1.7',
    period: { kind: 'follows', of: 'source' },
    status: 'fixed',
    setBy: { who: 'none' },
    indefinite: 'never',
    holds: 'apply',
    deletedBy: 'the deletion code, with its source',
  },
  voice_message_audio: {
    store: 's3',
    tables: [],
    covers: 'Voice messages’ audio, 360 days after sent (D36)',
    purposes: ['content_delivery'],
    ai: false,
    stage: 'C1.6',
    period: { kind: 'days', days: 360, anchor: 'created', range: [30, 730] },
    status: 'decided',
    setBy: { who: 'admins', from: 'C2.9' },
    indefinite: 'never',
    holds: 'apply',
    deletedBy: 'C2.9',
    objects: { objectLock: false },
  },
  tasks: {
    store: 'postgres',
    tables: [],
    covers: 'Tasks, 1,095 days after created',
    purposes: ['content_delivery'],
    ai: false,
    stage: 'C2.1',
    period: { kind: 'days', days: 1095, anchor: 'created' },
    status: 'proposed',
    setBy: { who: 'admins', from: 'C2.9' },
    indefinite: 'justified',
    holds: 'apply',
    deletedBy: 'C2.9',
  },
  // LH-53: the PRD gives no period for session records.
  session_records: {
    store: 'postgres',
    tables: [],
    covers: 'Recorded sessions’ records, 1,095 days after the session ended',
    purposes: ['recording_meetings', 'recording_drop_in'],
    ai: false,
    stage: 'C2.4',
    period: { kind: 'days', days: 1095, anchor: 'ended' },
    status: 'proposed',
    setBy: { who: 'admins', from: 'C2.9' },
    indefinite: 'justified',
    holds: 'apply',
    deletedBy: 'C2.9',
  },
  session_media: {
    store: 's3',
    tables: [],
    covers:
      'Sessions’ audio and video, 120 days after the session ended (D36), with an Object Lock legal hold while held',
    purposes: ['recording_meetings', 'recording_drop_in'],
    ai: false,
    stage: 'C2.6',
    period: { kind: 'days', days: 120, anchor: 'ended', range: [30, 730] },
    status: 'decided',
    setBy: { who: 'admins', from: 'C2.9' },
    indefinite: 'never',
    holds: 'apply',
    deletedBy: 'C2.9',
    objects: { objectLock: true },
  },
  calendar_events: {
    store: 'postgres',
    tables: [],
    covers: 'Calendar events, 1,095 days after the event',
    purposes: ['content_delivery'],
    ai: false,
    stage: 'C3.1',
    period: { kind: 'days', days: 1095, anchor: 'ended' },
    status: 'proposed',
    setBy: { who: 'admins', from: 'C2.9' },
    indefinite: 'justified',
    holds: 'apply',
    deletedBy: 'C2.9',
  },
  // Postgres rows and their S3 objects alike (objects).
  drive_items: {
    store: 'postgres',
    tables: [],
    covers: 'Drive items and their files in S3, 1,095 days after the last edit, unless the owner renews (SHEET-45)',
    purposes: ['content_delivery'],
    ai: false,
    stage: 'C4.1',
    period: { kind: 'days', days: 1095, anchor: 'last_edit' },
    status: 'proposed',
    setBy: { who: 'admins', from: 'C2.9' },
    indefinite: 'justified',
    holds: 'apply',
    deletedBy: 'C2.9',
    objects: { objectLock: false },
  },
  drive_trash: {
    store: 'postgres',
    tables: [],
    covers: 'Items in the Trash and their files in S3, 30 days after trashed (FILE-02)',
    purposes: ['content_delivery'],
    ai: false,
    stage: 'C4.1',
    period: { kind: 'days', days: 30, anchor: 'trashed' },
    status: 'decided',
    setBy: { who: 'none' },
    indefinite: 'never',
    holds: 'apply',
    deletedBy: 'C4.1',
    objects: { objectLock: false },
  },
  // LH-53: follows the session's record until A1, then its transcript (SLIDE-19).
  slide_copies: {
    store: 'postgres',
    tables: [],
    covers: 'The slides presented in a session, kept with its record (SLIDE-19)',
    purposes: ['session_slides'],
    ai: false,
    stage: 'C5.6',
    period: { kind: 'follows', of: 'session_records' },
    status: 'proposed',
    setBy: { who: 'none' },
    indefinite: 'never',
    holds: 'apply',
    deletedBy: 'the deletion code, with its session record',
  },
  people_insights: {
    store: 'postgres',
    tables: [],
    covers: 'People insights: counts and durations only (ADM-14), 731 days',
    purposes: ['people_insights'],
    ai: false,
    stage: 'C6.10',
    period: { kind: 'days', days: 731, anchor: 'created' },
    status: 'proposed',
    setBy: { who: 'admins', from: 'C6.10' },
    indefinite: 'never',
    holds: 'apply',
    deletedBy: 'C2.9',
  },
  // LH-53: as set by the DPO; 2 years after closure until then.
  breach_register: {
    store: 'postgres',
    tables: [],
    covers: 'The breach register, 731 days after closure until the DPO sets its period',
    purposes: ['request_handling'],
    ai: false,
    stage: 'C1.11',
    period: { kind: 'days', days: 731, anchor: 'closed_on' },
    status: 'dpo',
    setBy: { who: 'dpo', from: 'C2.9' },
    indefinite: 'never',
    holds: 'apply',
    deletedBy: 'C2.9',
  },

  // --- The AI classes (LH-06): finite defaults, never indefinite, holds apply, no setter before A0 --
  transcripts: {
    store: 'postgres',
    tables: [],
    covers: 'Session transcripts, 1,095 days after the session ended (PDPA-09; never indefinite, D12)',
    purposes: ['transcription'],
    ai: true,
    stage: 'A1',
    period: { kind: 'days', days: 1095, anchor: 'ended' },
    status: 'proposed',
    setBy: { who: 'none', from: 'A0' },
    indefinite: 'never',
    holds: 'apply',
    deletedBy: 'C2.9',
  },
  voice_message_transcripts: {
    store: 'postgres',
    tables: [],
    covers: 'Voice messages’ transcripts, 1,095 days after sent (D12)',
    purposes: ['voice_message_transcription'],
    ai: true,
    stage: 'A1',
    period: { kind: 'days', days: 1095, anchor: 'created' },
    status: 'proposed',
    setBy: { who: 'none', from: 'A0' },
    indefinite: 'never',
    holds: 'apply',
    deletedBy: 'C2.9',
  },
  machine_output: {
    store: 'postgres',
    tables: [],
    covers: 'The original machine output of a transcript (PDPA-09), deleted with it',
    purposes: ['transcription'],
    ai: true,
    stage: 'A1',
    period: { kind: 'follows', of: 'transcripts' },
    status: 'fixed',
    setBy: { who: 'none' },
    indefinite: 'never',
    holds: 'apply',
    deletedBy: 'the deletion code, with its transcript',
  },
  ai_notes: {
    store: 'postgres',
    tables: [],
    covers: 'AI meeting notes and AI writing kept as notes, 1,095 days after made (D12)',
    purposes: ['meeting_notes', 'ai_writing'],
    ai: true,
    stage: 'A3',
    period: { kind: 'days', days: 1095, anchor: 'created' },
    status: 'proposed',
    setBy: { who: 'none', from: 'A0' },
    indefinite: 'never',
    holds: 'apply',
    deletedBy: 'C2.9',
  },
  brain_index: {
    store: 'postgres',
    tables: [],
    covers: 'The Org Brain’s index, withdrawn with its source within 5 minutes (Rule 7)',
    purposes: ['org_brain'],
    ai: true,
    stage: 'A2',
    period: { kind: 'follows', of: 'source' },
    status: 'fixed',
    setBy: { who: 'none' },
    indefinite: 'never',
    holds: 'apply',
    deletedBy: 'the deletion code, with its source',
  },
  ai_conversations: {
    store: 'postgres',
    tables: [],
    covers: 'Conversations with the assistant, AI writing and agents, 365 days after the last message (PDPA-15)',
    purposes: ['assistant', 'ai_writing', 'agents'],
    ai: true,
    stage: 'A3, A4',
    period: { kind: 'days', days: 365, anchor: 'last_edit' },
    status: 'proposed',
    setBy: { who: 'none', from: 'A0' },
    indefinite: 'never',
    holds: 'apply',
    deletedBy: 'C2.9',
  },
  agent_memory: {
    store: 'postgres',
    tables: [],
    covers: 'Specialist agents’ memory, 365 days after last updated',
    purposes: ['agents'],
    ai: true,
    stage: 'A5',
    period: { kind: 'days', days: 365, anchor: 'last_edit' },
    status: 'proposed',
    setBy: { who: 'none', from: 'A0' },
    indefinite: 'never',
    holds: 'apply',
    deletedBy: 'C2.9',
  },
  // LH-53: at deactivation (ACC-05), and 365 days after last updated meanwhile.
  personal_memory: {
    store: 'postgres',
    tables: [],
    covers:
      'The personal assistant’s memory of one person, deleted at deactivation, and 365 days after last updated meanwhile',
    purposes: ['assistant'],
    ai: true,
    stage: 'A4',
    period: { kind: 'until', event: 'deactivation', days: 365, anchor: 'last_edit' },
    status: 'proposed',
    setBy: { who: 'none', from: 'A0' },
    indefinite: 'never',
    holds: 'apply',
    deletedBy: 'A4.4 (offboarding); C2.9',
  },
  // LH-53.
  ai_cost_records: {
    store: 'postgres',
    tables: [],
    covers: 'The cost of each paid AI call, with no content (§7.5), 731 days',
    purposes: ['ai_cost_figures'],
    ai: true,
    stage: 'A0',
    period: { kind: 'days', days: 731, anchor: 'created' },
    status: 'proposed',
    setBy: { who: 'none', from: 'A0' },
    indefinite: 'never',
    holds: 'apply',
    deletedBy: 'C2.9',
  },
  // LH-53: §9.5, at once on withdrawal.
  transcription_test_set: {
    store: 'postgres',
    tables: [],
    covers: 'The consented transcription test set (§9.5), 731 days after consent, and at once on withdrawal',
    purposes: ['transcription_test_set'],
    ai: true,
    stage: 'C6.9, A1',
    period: { kind: 'until', event: 'withdrawal', days: 731, anchor: 'consent' },
    status: 'proposed',
    setBy: { who: 'none', from: 'A0' },
    indefinite: 'never',
    holds: 'apply',
    deletedBy: 'C6.9; C2.9',
  },
  // LH-53 (AMB-06's thumbs up and down, stored per person): and with the output it rates.
  ai_feedback: {
    store: 'postgres',
    tables: [],
    covers: 'Feedback on AI output, 365 days after it was given, and deleted with the output it rates (AMB-06)',
    purposes: ['ai_writing', 'assistant', 'agents', 'meeting_notes'],
    ai: true,
    stage: 'A0.4',
    period: { kind: 'days', days: 365, anchor: 'created' },
    status: 'proposed',
    setBy: { who: 'none', from: 'A0' },
    indefinite: 'never',
    holds: 'apply',
    deletedBy: 'C2.9',
  },
  // LH-53: and withdrawn with its sources as a derived item (SRCH-05, BRAIN-05).
  people_inferences: {
    store: 'postgres',
    tables: [],
    covers:
      'People and expertise inferences, 365 days after made, and withdrawn with their sources (SRCH-05, BRAIN-05)',
    purposes: ['people_inference'],
    ai: true,
    stage: 'A3',
    period: { kind: 'days', days: 365, anchor: 'created' },
    status: 'proposed',
    setBy: { who: 'none', from: 'A0' },
    indefinite: 'never',
    holds: 'apply',
    deletedBy: 'C2.9',
  },

  // --- Stores outside Postgres (LH-07): only code and infra/ read these ----------------------------
  // Each family's figure is its policy.ts expression (apps/server/src/auth/policy.ts,
  // apps/server/src/realtime/policy.ts), which LCV-01 pins, and the families are valkeyKeys()'s
  // functions and channels (LCV-02).
  valkey_sign_in: {
    store: 'valkey',
    tables: [],
    covers: 'Sign-in state: attempts, code challenges, passkey challenges and re-authentication stamps and locks',
    purposes: ['accounts'],
    ai: false,
    stage: 'C0.5',
    period: {
      kind: 'ttl',
      families: { attempt: 600_000, otp: 600_000, challenge: 120_000, reauthApproved: 120_000, reauthSending: 15_000 },
    },
    status: 'fixed',
    setBy: { who: 'code' },
    indefinite: 'never',
    holds: { exempt: VALKEY, decision: 'LH-48' },
    deletedBy: 'Valkey’s expiry',
  },
  valkey_limits: {
    store: 'valkey',
    tables: [],
    // limiter.ts expires each window's key after the window itself, so the longest life is the
    // longest window in LIMITS (apps/server/src/auth/policy.ts), a day.
    covers: 'The sliding windows’ counters, each kept for its own window, a day at most',
    purposes: ['accounts'],
    ai: false,
    stage: 'C0.5',
    period: { kind: 'ttl', families: { limit: 86_400_000 } },
    status: 'fixed',
    setBy: { who: 'code' },
    indefinite: 'never',
    holds: { exempt: VALKEY, decision: 'LH-48' },
    deletedBy: 'Valkey’s expiry',
  },
  valkey_realtime: {
    store: 'valkey',
    tables: [],
    covers:
      'Each org’s event stream and its epoch, a day after the last refresh; the stream holds no entry until C0.14',
    purposes: ['service_operation'],
    ai: false,
    stage: 'C0.7',
    period: { kind: 'ttl', families: { stream: 86_400_000, epoch: 86_400_000 } },
    status: 'fixed',
    setBy: { who: 'code' },
    indefinite: 'never',
    holds: { exempt: VALKEY, decision: 'LH-48' },
    deletedBy: 'Valkey’s expiry',
  },
  valkey_channels: {
    store: 'valkey',
    tables: [],
    covers: 'The pub/sub channels that tell processes of ended sessions, lost access and changed flags',
    purposes: ['service_operation'],
    ai: false,
    stage: 'C0.5, C0.6, C0.7',
    period: { kind: 'ttl', families: { revoked: 'not_stored', access: 'not_stored', flags: 'not_stored' } },
    status: 'fixed',
    setBy: { who: 'code' },
    indefinite: 'never',
    holds: { exempt: 'pub/sub: nothing is stored', decision: 'LH-07' },
    deletedBy: 'nothing to delete',
  },
  app_logs: {
    store: 'logs',
    tables: [],
    covers: 'The CloudWatch log groups of every role, migrate included',
    purposes: ['service_operation', 'security_audit'],
    ai: false,
    stage: 'C0.11',
    period: { kind: 'days', days: 90, anchor: 'at' },
    status: 'proposed',
    setBy: { who: 'code', from: 'C0.11' },
    indefinite: 'never',
    holds: { exempt: AWS_LOGS, decision: 'LH-48' },
    deletedBy: 'CloudWatch’s retention',
  },
  traces: {
    store: 'logs',
    tables: [],
    covers: 'X-Ray traces',
    purposes: ['service_operation'],
    ai: false,
    stage: 'C0.11',
    period: { kind: 'days', days: 30, anchor: 'at' },
    status: 'fixed',
    setBy: { who: 'aws' },
    indefinite: 'never',
    holds: { exempt: AWS_LOGS, decision: 'LH-48' },
    deletedBy: 'X-Ray’s retention',
  },
  rum: {
    store: 'logs',
    tables: [],
    covers: 'CloudWatch RUM',
    purposes: ['service_operation'],
    ai: false,
    stage: 'C0.13',
    period: { kind: 'days', days: 30, anchor: 'at' },
    status: 'proposed',
    setBy: { who: 'code', from: 'C0.13' },
    indefinite: 'never',
    holds: { exempt: AWS_LOGS, decision: 'LH-48' },
    deletedBy: 'CloudWatch RUM’s retention',
  },
  cloudtrail: {
    store: 'logs',
    tables: [],
    covers: 'The organisation trail in the log-archive account, with Object Lock',
    purposes: ['security_audit'],
    ai: false,
    stage: 'C0.11',
    period: { kind: 'days', days: 731, anchor: 'at' },
    status: 'proposed',
    setBy: { who: 'code', from: 'C0.11' },
    indefinite: 'never',
    holds: { exempt: AWS_LOGS, decision: 'LH-48' },
    deletedBy: 'the log-archive bucket’s retention',
  },
  backups: {
    store: 'backups',
    tables: [],
    covers: 'RDS point-in-time recovery and AWS Backup',
    purposes: ['backups'],
    ai: false,
    stage: 'C0.17',
    period: { kind: 'days', days: 35, anchor: 'at' },
    status: 'proposed',
    setBy: { who: 'code', from: 'C0.17' },
    indefinite: 'never',
    holds: {
      exempt: 'a backup ages out; the live copy is what a hold keeps, and a restore replays the deletion log',
      decision: 'LH-51',
    },
    deletedBy: 'AWS Backup’s retention',
  },
} as const satisfies Record<string, RetentionClass>

export type RetentionClassKey = keyof typeof RETENTION_CLASSES
export const RETENTION_CLASS_KEYS = Object.keys(RETENTION_CLASSES) as RetentionClassKey[]

export function isRetentionClassKey(key: string): key is RetentionClassKey {
  return Object.hasOwn(RETENTION_CLASSES, key)
}

// The values CloudWatch Logs accepts for a log group's retention, in days (PutRetentionPolicy). The
// logs classes keep to these (LCS-07), so C0.11 and C0.13 can set them as they are.
export const CLOUDWATCH_RETENTION_DAYS = [
  1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1096, 1827, 2192, 2557, 2922, 3288, 3653,
] as const

// --- The SQL mirror (migration 0013's retention_class_defaults(), check 7a) ---------------------

// One row of retention_class_defaults(): a class whose data the database holds, deletes or logs.
//   period_kind  days, follows, while or until (ttl is Valkey's, which the database never sees)
//   days, anchor a days period's, or an until period's when it has a day count; else null
//   follows      a follows period's class key or 'source'; else null
//   holds        apply, exempt or kept
//   objects      whether the class has S3 objects (RETENTION_CLASSES' objects): every s3 class, and
//                Drive's two Postgres classes, whose rows log_deletion() logs with their keys (R2DB-01)
export interface RetentionClassDefaultsRow {
  key: RetentionClassKey
  store: (typeof RETENTION_DB_STORES)[number]
  ai: boolean
  period_kind: 'days' | 'follows' | 'while' | 'until'
  days: number | null
  anchor: RetentionAnchor | null
  follows: string | null
  holds: 'apply' | 'exempt' | 'kept'
  tables: readonly string[]
  objects: boolean
}

// What a class's holds come to in the database's vocabulary.
export function holdsOf(holds: RetentionClass['holds']): 'apply' | 'exempt' | 'kept' {
  return typeof holds === 'string' ? holds : 'exempt'
}

const isDbStore = (store: RetentionStore): store is RetentionClassDefaultsRow['store'] =>
  (RETENTION_DB_STORES as readonly string[]).includes(store)

// The rows retention_class_defaults() lists, in RETENTION_CLASSES' order: every class stored in
// Postgres or S3. check 7a holds the function equal to these on every column, both ways.
export function retentionClassDefaults(): RetentionClassDefaultsRow[] {
  return RETENTION_CLASS_KEYS.flatMap(key => {
    const spec: RetentionClass = RETENTION_CLASSES[key]
    const { period, store } = spec
    if (!isDbStore(store) || period.kind === 'ttl') return []
    const counted = period.kind === 'days' || (period.kind === 'until' && period.days !== undefined)
    return [
      {
        key,
        store,
        ai: spec.ai,
        period_kind: period.kind,
        days: counted ? (period.days ?? null) : null,
        anchor: counted ? (period.anchor ?? null) : null,
        follows: period.kind === 'follows' ? period.of : null,
        holds: holdsOf(spec.holds),
        tables: spec.tables,
        objects: spec.objects !== undefined,
      },
    ]
  })
}

// --- Holds and deletions (TECH-SPEC T23 items 7 and 10 to 12) ----------------------------------

// A refused copy's hold (s22A; regulation 8 of the PDP Regulations 2021): at least 30 days after the
// refusal, plus a margin for a review the PDPC tells the organisation of late (LH-19, LH-46).
// refused_copy_hold() writes the same figures (check 7f).
export const REFUSED_COPY_HOLD = { days: 30, noticeMarginDays: 14 } as const

// The kinds of record the database's hold decision can judge (lifecycle_kinds() lists the same;
// check 7f). Sign-in sessions are signin_session, never session, which C2.4 keeps for recorded room
// sessions (T14 item 17). PR 2 adds 'derived'; each later step adds its kinds (C1.1 message, channel,
// dm and group_dm; C2.4 room and session; C4.1 folder and file). A kind not listed never reads as not
// held: is_held() refuses it, and a source of such a kind keeps what was made from it (LH-18).
export const HOLD_KINDS = [
  'person',
  'phone_number',
  'device',
  'signin_session',
  'passkey',
  'notice_acknowledgment',
  'case',
  'legal_hold',
  'data_access_event',
] as const
export type HoldKind = (typeof HOLD_KINDS)[number]

// ADM-08's hold targets: a person, a channel, a DM, a group DM, a room, a recorded session, a
// folder or a file (legal_holds_target_kind lists the same; check 7f; LH-15). C1.11 adds
// HOLDABLE_NOW, the kinds its writer accepts, with that writer (LH-16).
export const HOLD_TARGET_KINDS = ['person', 'channel', 'dm', 'group_dm', 'room', 'session', 'folder', 'file'] as const
export type HoldTargetKind = (typeof HOLD_TARGET_KINDS)[number]

// Why a deletion happened (deletion_causes() lists the same; check 7f; LH-10): a class's period ran
// out (retention); the DPO acting on a request (request, REC-23); what it was made from went
// (cascade); a redaction (REC-18); a person's own delete (user); the Trash's 30 days (trash);
// offboarding (a leaver's personal memory, A4.4); a correction withdrew what was made from its source
// (correction, PRD-110); a quarantine copy removed after promotion, re-encoding or a failed scan
// (upload, C0.15; LH-57). A replay after a restore is no cause: it re-logs the original cause with
// replayed set, so a second restore can still tell a request's deletion from a retention one.
export const DELETION_CAUSES = [
  'retention',
  'request',
  'cascade',
  'redaction',
  'user',
  'trash',
  'offboarding',
  'correction',
  'upload',
] as const
export type DeletionCause = (typeof DELETION_CAUSES)[number]

// --- The refused-copy window's mirror (LH-18, LH-19, LH-20, LH-45, LH-46) -----------------------

// The raw facts migration 0013's case_hold_until() reads of one request to the DPO, as stored:
//   kind    the kind it came as (cases.kind)
//   steps   its steps in their order (case_steps.number): each step's kind and day, and for a
//           reclassification the kind it became
//   closed  its closure (cases.closed_on, closed_kind and outcome, set together), or null while open
// Days are YYYY-MM-DD, in the org's time zone, as 0012 records them.
export interface CaseHoldFacts {
  kind: CaseKind
  steps: readonly { step: CaseStepKind; onDay: string; kind?: CaseKind | null }[]
  closed: { on: string; kind: CaseKind; outcome: Outcome } | null
}

// A request's kind now, as 0012's case_kind_now() reads it: the kind it was closed as, else its
// latest reclassification's, else the kind it came as.
export function caseKindNow(facts: CaseHoldFacts): CaseKind {
  if (facts.closed !== null) return facts.closed.kind
  return facts.steps.findLast(s => s.step === 'reclassified')?.kind ?? facts.kind
}

// How long a request holds its requester's data and itself, as case_hold_until() computes it from
// the raw facts at every call (CLAUDE.md, Database): null when it holds nothing, 'indefinite' while
// it holds with no end, else the last day it holds (inclusive, YYYY-MM-DD in the org's time zone), so
// it is held while that day is today or later.
//   - An open request for a copy or a correction, by its kind now, holds until it is closed (LH-20,
//     LH-45): its data mustn't go while it is being answered. An open question, complaint,
//     withdrawal or objection holds nothing.
//   - A refused copy (s22A, regulation 8): while a PDPC review is open (more starts than ends), no
//     end; else the later of 30 days after the refusal plus the margin (LH-19, LH-46) and the latest
//     review's end. The refusal's day is day 0. A reconsideration or an appeal belongs to the open
//     episode, and a start after an end is a fresh application, whose end then counts (HOLD-01).
//   - Anything else closed holds nothing: s22A is about access.
// The database decides; this mirror is LCS-06's oracle against LCD-14 over one sample table
// (retention-samples.json), and C2.9's DPO-only "kept until" (LH-55). It is never shown to anyone but
// the DPO.
export function heldUntil(facts: CaseHoldFacts): string | null {
  const { closed } = facts
  if (closed === null) {
    const kind = caseKindNow(facts)
    return kind === 'access' || kind === 'correction' ? 'indefinite' : null
  }
  if (closed.outcome !== 'refused' || closed.kind !== 'access') return null
  let started = 0
  let ended = 0
  let lastEnded: string | null = null
  for (const s of facts.steps) {
    if (s.step === 'review_started') started += 1
    if (s.step === 'review_ended') {
      ended += 1
      if (lastEnded === null || s.onDay > lastEnded) lastEnded = s.onDay
    }
  }
  if (started > ended) return 'indefinite'
  const window = shiftDay(closed.on, REFUSED_COPY_HOLD.days + REFUSED_COPY_HOLD.noticeMarginDays)
  // Postgres's greatest() passes over a null, as here.
  return lastEnded !== null && lastEnded > window ? lastEnded : window
}

// Whether a request holds on a day (YYYY-MM-DD in the org's time zone), as lifecycle_held() reads
// case_hold_until(): its last day held is that day or later, or it holds with no end.
export function heldOn(facts: CaseHoldFacts, today: string): boolean {
  const until = heldUntil(facts)
  return until !== null && (until === 'indefinite' || until >= today)
}
