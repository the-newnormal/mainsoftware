// Every way the database lets a row be deleted, and what each does about holds (C0.10 LH-12, LH-14,
// LH-26, LH-48, LH-58; TECH-SPEC T23 item 9; ADM-08, PDPA-09). Rows a hold keeps go only through
// the deletion code, which asks lifecycle_held() and logs each deletion, so nothing here is left
// undecided:
//   - guarded: the path deletes only from tables that carry lifecycle_guard(), the BEFORE DELETE row
//     trigger that refuses any role's delete not logged in its transaction, or of a held row (HF010,
//     HF009), with lifecycle_no_truncate() beside it, and says what it is to the provenance registry
//     (T23 item 14, LH-41): its rows can be a source, so it calls provenance_forget(); they never
//     are, with the decision or id that records why; or it is the registry's own deletion code;
//   - checked: a definer that asks lifecycle_held() or is_held() itself, skips a held row and logs
//     each row it deletes with log_deletion(), for a table a leaver's reduction marks (`reduction:
//     'apply'`, rows a person also edits, where a trigger would reveal a hold to them: today
//     working_hours alone; LH-58, GUARD-02);
//   - exempt: outside holds, with the decision (an LH id TECH-SPEC T23 records, or a TECH-SPEC item)
//     that records why.
//
// apps/server/scripts/check-catalogues.ts (check 8, CI's migrations job) finds every delete path the
// database allows, as check 1 finds writes, and requires an entry here for each and no entry for
// anything else:
//   '<role> <table>:DELETE'      a runtime role's DELETE grant; it deletes from its table;
//   '<function>(<arg types>)'    any function of public whose body deletes, a plain helper no
//                                runtime role may run included, since a definer can call it
//                                (GUARD-03); it deletes from every table its DELETEs name;
//   'fk <table>.<constraint>'    a foreign key ON DELETE CASCADE (it deletes from its child table),
//                                SET NULL or SET DEFAULT (an UPDATE of its child that deletes
//                                nothing: the delete that fires it is its parent's own path, decided
//                                under that path's entry; DB-10);
//   'ddl <function>(<arg types>)' a DYNAMIC_DDL function (apps/server/scripts/catalogues.ts), whose
//                                format strings may name no drop, truncate, detach or delete, and
//                                whose body is the one pinned there (R2CODE-01).
// It fails on a guarded path that deletes from a table not in GUARDED_TABLES (so a step's first
// delete path brings the guard), or that says nothing of the provenance registry, whose rows can be
// a source but whose body never calls provenance_forget(), whose rows are never one but that cites
// no decision TECH-SPEC records or id T23 cites, or that is the registry's own but deletes from any
// other table (so every item's delete path forgets it, T23 item 14); a checked path whose body never
// asks lifecycle_held() or is_held() or never calls log_deletion(), or that deletes from a table a
// leaver's reduction doesn't mark or from a guarded or kept one (so any other holds-apply table's
// first path is guarded: GUARD-02); an exempt path that deletes from a table of a class whose holds
// apply; any path to a table of a kept class (packages/shared RETENTION_CLASSES); and a function of
// public whose body it can't read (BEGIN ATOMIC, or EXECUTE outside DYNAMIC_DDL). Adding an entry is
// a reviewed change.

// What a guarded path is to the provenance registry (T23 item 14, LH-41), so every item's delete
// path calls provenance_forget(), which cascades to what was made from or cites each row it deletes
// and then deletes the row's own record, in the deletion's transaction (Rule 7, PDPA-09):
// forgets: its rows can be a source or an item, and its body calls provenance_forget() (check 8
// reads it, comments and strings aside); notASource: its rows never are, with the decision or
// requirement id that records why; registry: the registry's own deletion code, lifecycle_cascade()
// and provenance_forget(), deleting from provenance_items and provenance_sources alone.
export type Provenance = { forgets: true } | { notASource: string; decision: string } | { registry: true }

// guarded: the table carries lifecycle_guard(), and the path says what it is to the provenance
// registry; checked: a definer that asks lifecycle_held() or is_held() itself, skips a held row and
// calls log_deletion(), for a table a leaver's reduction marks, whose rows a person also edits,
// where a trigger would reveal a hold (LH-58, GUARD-02; check 8 reads its body for both calls);
// exempt: outside holds, with the decision that records why.
export type DeletePath =
  | { guarded: true; provenance: Provenance }
  | { checked: true; decision: string }
  | { exempt: string; decision: string }

// The tables carrying lifecycle_guard('<table>') and lifecycle_no_truncate() (check 7d), each in a
// class whose holds apply; deletion_log carries lifecycle_no_truncate() beside deletion_log_kept(),
// and legal_holds legal_holds_kept() beside its guard. A step adds a table with its first delete path
// (check 8): C2.9 the sign-in records, acknowledgements and logs; C1.2, C4.1 and later their own.
// PR 2 (0014) added the provenance tables, with the cascade's and provenance_forget()'s paths.
export const GUARDED_TABLES = ['cases', 'case_steps', 'legal_holds', 'provenance_items', 'provenance_sources'] as const

// Reasons shared by several entries.
// T16 item 6 (LH-26, confirmed under LH-48): the outbox, the queue and the scheduler's runs hold only
// ids of facts the base tables and the audit log keep, their ages are a maximum as well as a minimum,
// and one held subject kept below the outbox's floor would stall every consumer.
const CLEANUP =
  "C0.6's clean-up (T16 item 6): ids of facts the base tables and the audit log keep, whose age is a maximum as well as a minimum; one audit row per batch"
// The links inside the clean-up: purge_schedule_runs() deleting a run sets the jobs and the later
// runs that named it to null, so the purge's own entry decides them.
const CLEANUP_LINK = "fired only by purge_schedule_runs(): an UPDATE of the run's links that deletes nothing"
// LH-48: a person's own working hours, replaced whole by their own edit (C0.15), which
// profile.updated and its audit row record; refusing a held person's edit would tell them of the
// hold. A leaver's are deleted by C2.9's reduction, a checked path (LH-58), never this one.
const OWN_SETTINGS =
  "a person's own current settings, replaced by their own edit; profile.updated and its audit row record each change"
// LH-48: a device's deletion (C2.9's guarded path, for an unheld person only) drops the link and
// keeps the record, which outlives the device.
const OUTLIVES_DEVICE = 'an UPDATE of the child that deletes nothing: the record outlives its device'

export const DELETE_PATHS: Readonly<Record<string, DeletePath>> = {
  // C0.6's clean-up (0007), each run as Hearth by hearth_job_purge.
  'purge_outbox(integer)': { exempt: CLEANUP, decision: 'LH-26' },
  'purge_jobs(integer)': { exempt: CLEANUP, decision: 'LH-26' },
  'purge_schedule_runs(integer)': { exempt: CLEANUP, decision: 'LH-26' },
  // SET NULL keys: an UPDATE of the child that deletes nothing (check 8, DB-10).
  'fk jobs.jobs_org_id_schedule_run_id_fkey': { exempt: CLEANUP_LINK, decision: 'LH-26' },
  'fk schedule_runs.schedule_runs_org_id_resumed_from_fkey': { exempt: CLEANUP_LINK, decision: 'LH-26' },
  'fk notice_acknowledgments.notice_acknowledgments_org_id_person_id_device_id_fkey': {
    exempt: OUTLIVES_DEVICE,
    decision: 'LH-48',
  },
  'fk passkeys.passkeys_org_id_user_id_created_device_id_fkey': { exempt: OUTLIVES_DEVICE, decision: 'LH-48' },
  // Working hours are replaced whole by the person's own edit (C0.15 writes it first).
  'hearth_app working_hours:DELETE': { exempt: OWN_SETTINGS, decision: 'LH-48' },
  // The partitions job (0005): creates next months' partitions and deletes nothing.
  'ddl create_data_access_partitions(integer)': {
    exempt: "creates data_access_events' partitions; deletes nothing",
    decision: 'T15 item 16',
  },
  // The deletion code's path for requests (LH-22): lifecycle_held() before, the guard on both. A
  // request is never an item or a source, which both provenance tables' kind checks refuse too.
  'delete_case(uuid, text, boolean)': {
    guarded: true,
    provenance: { notASource: 'a request is never indexed, derived from or cited', decision: 'RQS-11' },
  },
  // The provenance registry's deletion code (0014, LH-41): lifecycle_held() per item before, the guard
  // on both tables. Each body deletes items and their edges itself (the cascade never calls
  // provenance_forget()), so each is a path of its own.
  'lifecycle_cascade(text, uuid, bigint, integer)': { guarded: true, provenance: { registry: true } },
  'provenance_forget(text, uuid, text, bigint)': { guarded: true, provenance: { registry: true } },
}
