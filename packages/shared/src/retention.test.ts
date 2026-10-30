// C0.10's retention-class registry and the refused-copy window's mirror (PDPA-09, ADM-07, ADM-08;
// TECH-SPEC T23 items 2 to 7 and 10 to 12; LH-03 to LH-10, LH-18 to LH-20, LH-45 to LH-47): LCS-01 to LCS-08.
// That the registry, its SQL mirror and the vocabularies equal migrations 0013's and 0014's is checked
// against the database by apps/server/scripts/check-catalogues.ts (check 7); that db/tests/192's sample block
// equals retention-samples.json is LCV-08's (apps/server/src/lifecycle/retention.test.ts), so LCS-06
// here and LCD-14 there run one table through heldUntil() and case_hold_until().
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { CASE_KINDS, CASE_STEPS, OUTCOMES, REFUSABLE_KINDS, shiftDay } from './cases.ts'
import { isPurposeKey, PURPOSE_KEYS, PURPOSES, type PurposeKey } from './purposes.ts'
import {
  type CaseHoldFacts,
  CLOUDWATCH_RETENTION_DAYS,
  caseKindNow,
  DELETION_CAUSES,
  HOLD_KINDS,
  HOLD_TARGET_KINDS,
  heldOn,
  heldUntil,
  holdsOf,
  isRetentionClassKey,
  REFUSED_COPY_HOLD,
  RETENTION_CLASS_KEYS,
  RETENTION_CLASSES,
  RETENTION_DB_STORES,
  type RetentionClass,
  retentionClassDefaults,
} from './retention.ts'
import samplesFile from './retention-samples.json' with { type: 'json' }

const CLASSES = RETENTION_CLASSES as Readonly<Record<string, RetentionClass>>
const entries = Object.entries(CLASSES)
const SNAKE = /^[a-z][a-z0-9_]{0,62}$/

// Where a follows period leads: the class at the end of its chain, 'source', or a problem (a key
// that names no class, or a loop).
function followsEnd(classes: Readonly<Record<string, RetentionClass>>, key: string): string {
  const seen = new Set<string>()
  let at = key
  for (;;) {
    if (seen.has(at)) return `a loop through ${at}`
    seen.add(at)
    const spec = classes[at]
    if (spec === undefined) return `${at} names no class`
    if (spec.period.kind !== 'follows') return at
    if (spec.period.of === 'source') return 'source'
    at = spec.period.of
  }
}

// AI-01 (LCS-03b): the AI purposes no AI class covers, so a new AI purpose has a class to keep its
// data in before A0 can process for it.
function uncoveredAiPurposes(classes: Readonly<Record<string, RetentionClass>>): PurposeKey[] {
  const covered = new Set(
    Object.values(classes)
      .filter(spec => spec.ai)
      .flatMap(spec => spec.purposes),
  )
  return PURPOSE_KEYS.filter(key => PURPOSES[key].ai && !covered.has(key))
}

// Whether a class's period can run out: a day count, an event with a day count, or a chain that
// ends at such a class or at its source (check 7e's reading for the AI classes).
function finite(classes: Readonly<Record<string, RetentionClass>>, key: string): boolean {
  const end = followsEnd(classes, key)
  if (end === 'source') return true
  const period = classes[end]?.period
  return period?.kind === 'days' || (period?.kind === 'until' && period.days !== undefined)
}

describe('LH-03 LH-04 LH-05: the retention classes', () => {
  it('LCS-01: keys and table names are snake case, no table is in two classes, and only Postgres classes name tables', () => {
    const owner = new Map<string, string>()
    for (const [key, spec] of entries) {
      expect(key, key).toMatch(SNAKE)
      expect(isRetentionClassKey(key), key).toBe(true)
      for (const table of spec.tables) {
        expect(table, key).toMatch(SNAKE)
        expect(owner.get(table), `${table} is in ${owner.get(table)} and ${key}`).toBeUndefined()
        owner.set(table, key)
      }
      if (spec.tables.length > 0) expect(spec.store, key).toBe('postgres')
    }
    expect(RETENTION_CLASS_KEYS).toEqual(Object.keys(RETENTION_CLASSES))
    expect(isRetentionClassKey('constructor')).toBe(false)
    // PR 1's own two tables are classed with it (LH-10, LH-15).
    expect(owner.get('deletion_log')).toBe('deletion_log')
    expect(owner.get('legal_holds')).toBe('legal_holds')
    // And PR 2's (0014) with provenance (LH-39).
    expect(owner.get('provenance_items')).toBe('provenance')
    expect(owner.get('provenance_sources')).toBe('provenance')
  })

  it('LCS-02 LH-36: every class names known purposes, once each, and only legal_holds and the follows classes name none', () => {
    for (const [key, spec] of entries) {
      for (const purpose of spec.purposes) expect(isPurposeKey(purpose), `${key}: ${purpose}`).toBe(true)
      expect(new Set(spec.purposes).size, key).toBe(spec.purposes.length)
    }
    const none = entries.filter(([, spec]) => spec.purposes.length === 0).map(([key]) => key)
    for (const key of none) {
      expect(key === 'legal_holds' || CLASSES[key]?.period.kind === 'follows', key).toBe(true)
    }
    expect(none).toEqual(['legal_holds', 'provenance', 'derived_caches'])
  })

  it('LCS-03 LH-06 D41: an AI class names AI purposes only, and every other class none', () => {
    for (const [key, spec] of entries) {
      for (const purpose of spec.purposes) expect(PURPOSES[purpose].ai, `${key}: ${purpose}`).toBe(spec.ai)
    }
  })

  it('LCS-03b AI-01 LH-06: every AI purpose is in at least one AI class', () => {
    expect(uncoveredAiPurposes(CLASSES)).toEqual([])
    // The rule itself: without the transcripts and machine output classes, transcription has none.
    const { transcripts: _t, machine_output: _m, ...fewer } = CLASSES
    expect(uncoveredAiPurposes(fewer)).toEqual(['transcription'])
  })

  it('LCS-04: every period can be read, every follows chain ends without a loop, and every range holds its default', () => {
    for (const [key, spec] of entries) {
      const { period } = spec
      switch (period.kind) {
        case 'days':
          expect(Number.isInteger(period.days) && period.days >= 1 && period.days <= 3653, key).toBe(true)
          if (period.range !== undefined) {
            const [min, max] = period.range
            expect(Number.isInteger(min) && Number.isInteger(max) && min >= 1 && min <= max, key).toBe(true)
            expect(min <= period.days && period.days <= max, key).toBe(true)
          }
          break
        case 'until':
          // A day count and its anchor come together.
          expect(period.days === undefined, key).toBe(period.anchor === undefined)
          if (period.days !== undefined) expect(Number.isInteger(period.days) && period.days >= 1, key).toBe(true)
          break
        case 'follows': {
          const end = followsEnd(CLASSES, key)
          expect(end === 'source' || isRetentionClassKey(end), `${key}: ${end}`).toBe(true)
          break
        }
        case 'ttl':
          expect(spec.store, key).toBe('valkey')
          for (const [family, ms] of Object.entries(period.families)) {
            expect(ms === 'not_stored' || (Number.isInteger(ms) && ms > 0), `${key}: ${family}`).toBe(true)
          }
          break
        case 'while':
          break
      }
      // Only a class someone may set has a range to set it within (ADM-07, LH-38).
      if (period.kind === 'days' && period.range !== undefined) {
        expect(['admins', 'dpo'], key).toContain(spec.setBy.who)
      }
    }
    // The rule itself: a loop and a key that names nothing are caught.
    const base = CLASSES.cases as RetentionClass
    const looped: Record<string, RetentionClass> = {
      a: { ...base, period: { kind: 'follows', of: 'b' } },
      b: { ...base, period: { kind: 'follows', of: 'a' } },
      c: { ...base, period: { kind: 'follows', of: 'nothing' } },
    }
    expect(followsEnd(looped, 'a')).toBe('a loop through a')
    expect(followsEnd(looped, 'c')).toBe('nothing names no class')
    expect(followsEnd(CLASSES, 'machine_output')).toBe('transcripts')
    expect(followsEnd(CLASSES, 'slide_copies')).toBe('session_records')
  })

  it('LCS-05 D12 PDPA-09: audio, video, transcripts and AI notes are never indefinite, and data kept while the org exists says why', () => {
    for (const key of [
      'voice_message_audio',
      'session_media',
      'transcripts',
      'voice_message_transcripts',
      'machine_output',
      'ai_notes',
    ] as const) {
      expect(RETENTION_CLASSES[key].indefinite, key).toBe('never')
    }
    for (const [key, spec] of entries) {
      if (spec.period.kind === 'while' && spec.period.what === 'org') {
        expect(spec.period.justification?.trim().length ?? 0, key).toBeGreaterThan(0)
        expect(spec.indefinite, key).toBe('justified')
      }
      // History that is never deleted is kept while the org exists, and says why.
      if (spec.holds === 'kept') expect(spec.period, key).toMatchObject({ kind: 'while', what: 'org' })
    }
  })

  it('LH-06 check 7e: every AI class is finite, never indefinite, kept in Postgres, held like any other and has no setter before A0', () => {
    const ai = entries.filter(([, spec]) => spec.ai)
    expect(ai.map(([key]) => key)).toEqual([
      'transcripts',
      'voice_message_transcripts',
      'machine_output',
      'ai_notes',
      'brain_index',
      'ai_conversations',
      'agent_memory',
      'personal_memory',
      'ai_cost_records',
      'transcription_test_set',
      'ai_feedback',
      'people_inferences',
    ])
    for (const [key, spec] of ai) {
      expect(finite(CLASSES, key), key).toBe(true)
      expect(spec.indefinite, key).toBe('never')
      expect(spec.store, key).toBe('postgres')
      expect(spec.holds, key).toBe('apply')
      expect(spec.setBy.who, key).toBe('none')
      expect(spec.tables, key).toEqual([])
    }
  })

  it('LH-26 LH-48 LH-57: an exemption from holds says why and names the decision that records it', () => {
    for (const [key, spec] of entries) {
      if (typeof spec.holds === 'string') continue
      expect(spec.holds.exempt.trim().length, key).toBeGreaterThan(20)
      expect(spec.holds.decision, key).toMatch(/^(?:LH-\d{2}|T\d{1,2} item \d+)$/)
    }
    // The clean-up's three (LH-26) and C0.15's quarantine copies (LH-57) are exempt; the cases, the
    // legal holds and the sign-in records are not.
    for (const key of ['outbox', 'jobs', 'schedule_runs'] as const) {
      expect(RETENTION_CLASSES[key].holds).toMatchObject({ decision: 'LH-26' })
    }
    expect(RETENTION_CLASSES.upload_quarantine.holds).toMatchObject({ decision: 'LH-57' })
    for (const key of ['cases', 'legal_holds', 'sign_in_records', 'audit_log', 'access_log'] as const) {
      expect(RETENTION_CLASSES[key].holds, key).toBe('apply')
    }
    // The leaver reduction is deletion code that skips a held person (LH-58).
    expect(RETENTION_CLASSES.roster.reduction).toBe('apply')
    expect(RETENTION_CLASSES.working_hours.reduction).toBe('apply')
  })

  it('T15 item 17 check 7c: the fixed ages are the clean-up’s and the deletion log’s, each a whole number of days, the first the class’s own', () => {
    const fixed = entries.flatMap(([key, spec]) => (spec.fixedIn ?? []).map(f => ({ key, ...f })))
    expect(fixed.map(f => f.fn)).toEqual(['purge_outbox', 'purge_jobs', 'purge_schedule_runs', 'deletion_log_kept'])
    for (const { key, intervals } of fixed) {
      const spec = CLASSES[key] as RetentionClass
      expect(spec.status, key).toBe('fixed')
      expect(spec.setBy.who, key).toBe('migration')
      for (const interval of intervals) expect(interval, key).toMatch(/^[1-9]\d* days$/)
      expect(spec.period.kind === 'days' && intervals[0] === `${spec.period.days} days`, key).toBe(true)
    }
  })

  it('LH-07 C0.12: S3 data says whether it takes an Object Lock legal hold, and only held recordings do', () => {
    for (const [key, spec] of entries) {
      if (spec.store === 's3') expect(spec.objects, key).toBeDefined()
      if (spec.objects !== undefined) expect(RETENTION_DB_STORES, key).toContain(spec.store)
    }
    const locked = entries.filter(([, spec]) => spec.objects?.objectLock).map(([key]) => key)
    expect(locked).toEqual(['session_media'])
  })

  it('ADM-07 LH-38: a class someone may set says from which step, and the DPO alone sets the cases and the breach register', () => {
    for (const [key, spec] of entries) {
      if (spec.setBy.who === 'admins' || spec.setBy.who === 'dpo')
        expect(spec.setBy.from, key).toMatch(/^C\d\.\d{1,2}$/)
      expect(spec.status === 'dpo', key).toBe(spec.setBy.who === 'dpo')
      expect(spec.stage, key).toMatch(/^(?:C\d\.\d{1,2}|A\d(?:\.\d)?)(?:, (?:C\d\.\d{1,2}|A\d(?:\.\d)?))*$/)
    }
    expect(
      entries.filter(([, spec]) => spec.setBy.who === 'dpo').map(([key]) => key),
      'LH-08',
    ).toEqual(['cases', 'breach_register'])
  })

  it('LH-08 LH-47 PDPA-09: requests to the DPO are kept 731 days after closure by default, set by the DPO within 90 days to 10 years', () => {
    expect(RETENTION_CLASSES.cases).toMatchObject({
      store: 'postgres',
      tables: ['cases', 'case_steps'],
      purposes: ['request_handling'],
      period: { kind: 'days', days: 731, anchor: 'closed_on', range: [90, 3650] },
      status: 'dpo',
      setBy: { who: 'dpo', from: 'C2.9' },
      indefinite: 'never',
      holds: 'apply',
    })
    // LH-53: released legal holds and the deletion log, 2 years.
    expect(RETENTION_CLASSES.legal_holds.period).toEqual({ kind: 'days', days: 731, anchor: 'released' })
    expect(RETENTION_CLASSES.deletion_log.period).toEqual({ kind: 'days', days: 731, anchor: 'at' })
  })

  it('LH-07: each Valkey family is in one class only, named as valkeyKeys() names it (LCV-01 and LCV-02 pin them to the server’s code)', () => {
    const families = entries.flatMap(([, spec]) =>
      spec.period.kind === 'ttl' ? Object.keys(spec.period.families) : [],
    )
    expect(new Set(families).size).toBe(families.length)
    for (const family of families) expect(family).toMatch(/^[a-z][A-Za-z]*$/)
    expect(families.sort()).toEqual(
      [
        'access',
        'attempt',
        'challenge',
        'epoch',
        'flags',
        'limit',
        'otp',
        'reauthApproved',
        'reauthSending',
        'revoked',
        'stream',
      ].sort(),
    )
  })

  it('LCS-07 LH-07 C11-D22: the logs classes’ days are values CloudWatch accepts', () => {
    expect([...CLOUDWATCH_RETENTION_DAYS]).toEqual([...CLOUDWATCH_RETENTION_DAYS].sort((a, b) => a - b))
    expect(new Set(CLOUDWATCH_RETENTION_DAYS).size).toBe(CLOUDWATCH_RETENTION_DAYS.length)
    const logs = entries.filter(([, spec]) => spec.store === 'logs')
    // C0.11 added the break-glass log and the network logs (C11-D22, TECH-SPEC T24 item 9).
    expect(logs.map(([key]) => key)).toEqual([
      'app_logs',
      'traces',
      'rum',
      'cloudtrail',
      'break_glass_log',
      'network_logs',
    ])
    for (const [key, spec] of logs) {
      expect(spec.period.kind, key).toBe('days')
      if (spec.period.kind === 'days') {
        expect(CLOUDWATCH_RETENTION_DAYS as readonly number[], key).toContain(spec.period.days)
      }
    }
    // The rule itself: three years is 1,096 days to CloudWatch, never 1,095.
    expect(CLOUDWATCH_RETENTION_DAYS as readonly number[]).not.toContain(1095)
  })

  it('C11-D22 C11-Q10: the break-glass log and the network logs are kept as the DPO confirmed, outside holds, with no SQL mirror', () => {
    // C11-D13: the break-glass log's Object Lock and expiry read these 731 days, the same as the
    // CloudTrail events its entries explain.
    expect(RETENTION_CLASSES.break_glass_log).toMatchObject({
      store: 'logs',
      tables: [],
      purposes: ['security_audit'],
      ai: false,
      stage: 'C0.11',
      period: { kind: 'days', days: 731, anchor: 'at' },
      setBy: { who: 'code', from: 'C0.11' },
      indefinite: 'never',
      holds: { decision: 'T24 item 9' },
      deletedBy: 'the log-archive bucket’s retention',
    })
    expect(RETENTION_CLASSES.break_glass_log.period).toEqual(RETENTION_CLASSES.cloudtrail.period)
    // C11-D32: every VPC's flow logs, 90 days in CloudWatch.
    expect(RETENTION_CLASSES.network_logs).toMatchObject({
      store: 'logs',
      tables: [],
      purposes: ['security_audit'],
      ai: false,
      stage: 'C0.11',
      period: { kind: 'days', days: 90, anchor: 'at' },
      setBy: { who: 'code', from: 'C0.11' },
      indefinite: 'never',
      holds: { decision: 'T24 item 9' },
      deletedBy: 'CloudWatch’s retention',
    })
    // The trail's class names the CloudWatch copy the alarms and the quarterly review read (C11-D17).
    expect(RETENTION_CLASSES.cloudtrail.covers).toMatch(/CloudWatch Logs copy in the management account/)
    // …and what deletes each half: the bucket's retention, and the copy's log-group retention.
    expect(RETENTION_CLASSES.cloudtrail.deletedBy).toBe(
      'the log-archive bucket’s retention, and CloudWatch’s for its copy',
    )
    // Neither joins retention_class_defaults(), so neither needs a migration.
    const mirrored = retentionClassDefaults().map(row => row.key)
    expect(mirrored).not.toContain('break_glass_log')
    expect(mirrored).not.toContain('network_logs')
  })
})

describe('LH-03 check 7a: retention_class_defaults()’s rows', () => {
  const rows = retentionClassDefaults()

  it('lists every class stored in Postgres or S3, once, in the registry’s order, and none in Valkey, the logs or the backups', () => {
    expect(rows.map(r => r.key)).toEqual(
      RETENTION_CLASS_KEYS.filter(key =>
        (RETENTION_DB_STORES as readonly string[]).includes(RETENTION_CLASSES[key].store),
      ),
    )
    for (const key of ['valkey_sign_in', 'app_logs', 'backups'] as const) {
      expect(
        rows.some(r => r.key === key),
        key,
      ).toBe(false)
    }
  })

  it('carries each period in the database’s columns: a day count with its anchor, or the class it follows', () => {
    for (const row of rows) {
      const spec = CLASSES[row.key] as RetentionClass
      expect(row.store, row.key).toBe(spec.store)
      expect(row.ai, row.key).toBe(spec.ai)
      expect(row.period_kind, row.key).toBe(spec.period.kind)
      expect(row.days === null, row.key).toBe(row.anchor === null)
      expect(row.days !== null, row.key).toBe(
        spec.period.kind === 'days' || (spec.period.kind === 'until' && spec.period.days !== undefined),
      )
      expect(row.follows !== null, row.key).toBe(spec.period.kind === 'follows')
      expect(row.holds, row.key).toBe(holdsOf(spec.holds))
      expect(row.tables, row.key).toEqual(spec.tables)
      expect(row.objects, row.key).toBe(spec.objects !== undefined)
    }
    expect(rows.find(r => r.key === 'cases')).toEqual({
      key: 'cases',
      store: 'postgres',
      ai: false,
      period_kind: 'days',
      days: 731,
      anchor: 'closed_on',
      follows: null,
      holds: 'apply',
      tables: ['cases', 'case_steps'],
      objects: false,
    })
    expect(rows.find(r => r.key === 'upload_quarantine')).toMatchObject({
      store: 's3',
      period_kind: 'until',
      days: 1,
      anchor: 'created',
      holds: 'exempt',
    })
    // LH-39: 0014's two tables, in this order.
    expect(rows.find(r => r.key === 'provenance')).toMatchObject({
      period_kind: 'follows',
      days: null,
      anchor: null,
      follows: 'source',
      holds: 'apply',
      tables: ['provenance_items', 'provenance_sources'],
      objects: false,
    })
    expect(rows.find(r => r.key === 'working_hours')).toMatchObject({
      period_kind: 'until',
      days: null,
      holds: 'exempt',
    })
    expect(rows.find(r => r.key === 'roster')).toMatchObject({ period_kind: 'while', holds: 'kept' })
  })

  it('R2DB-01: gives objects to exactly the classes with S3 objects, every s3 class and Drive’s two Postgres classes, whose rows log_deletion() logs with their keys', () => {
    expect(rows.filter(r => r.objects).map(r => r.key)).toEqual([
      'profile_photos',
      'upload_quarantine',
      'voice_message_audio',
      'session_media',
      'drive_items',
      'drive_trash',
    ])
    for (const row of rows.filter(r => r.store === 's3')) expect(row.objects, row.key).toBe(true)
  })
})

// The shared sample table (LCS-06, LCD-14, LCV-08). Days are offsets from the org's today (0, in its
// time zone; negative is past), so db/tests/192 can set closed_on and the step days relative to
// whatever today is in each org's zone. Each sample is a request as stored: the kind it came as, the
// day received, its steps in order (a reclassification with the kind it became) and its closure or
// null; until is the last day held as an offset, 'indefinite' or null, and held whether it holds
// today. The schema also keeps every sample one 0012's writers could have made, so 192 can insert it.
const Offset = z.int().min(-3650).max(0)
const Sample = z
  .strictObject({
    sample: z.string().regex(SNAKE),
    kind: z.enum(CASE_KINDS),
    received: Offset,
    steps: z.array(
      z
        .strictObject({ step: z.enum(CASE_STEPS), day: Offset, kind: z.enum(CASE_KINDS).optional() })
        .refine(s => (s.kind !== undefined) === (s.step === 'reclassified'), 'a kind on a reclassification only'),
    ),
    closed: z.strictObject({ day: Offset, kind: z.enum(CASE_KINDS), outcome: z.enum(OUTCOMES) }).nullable(),
    until: z.union([z.int(), z.literal('indefinite')]).nullable(),
    held: z.boolean(),
  })
  .refine(s => s.steps.every(step => step.day >= s.received), 'no step before the request was received')
  .refine(s => s.closed === null || s.closed.day >= s.received, 'closed on or after the day received')
  .refine(
    s =>
      s.steps.every(step =>
        step.step === 'review_started' || step.step === 'review_ended'
          ? s.closed?.outcome === 'refused' && s.closed.kind === 'access' && step.day >= s.closed.day
          : step.step === 'note' || s.closed === null || step.day <= s.closed.day,
      ),
    'a review only after a refused copy, and other steps only while open',
  )
  .refine(
    s => s.held === (s.until !== null && (s.until === 'indefinite' || s.until >= 0)),
    'held exactly when its last day held is today or later',
  )
type Sample = z.infer<typeof Sample>
const SAMPLES: Sample[] = z.array(Sample).parse(samplesFile)

// A sample's raw facts on a given today.
function factsOn(sample: Sample, today: string): CaseHoldFacts {
  const day = (offset: number) => shiftDay(today, offset)
  return {
    kind: sample.kind,
    steps: sample.steps.map(s => ({ step: s.step, onDay: day(s.day), kind: s.kind ?? null })),
    closed: sample.closed && { on: day(sample.closed.day), kind: sample.closed.kind, outcome: sample.closed.outcome },
  }
}

describe('LCS-06 LH-18 LH-19 LH-20 LH-45 LH-46: heldUntil(), the mirror of case_hold_until()', () => {
  it('REFUSED_COPY_HOLD is 30 days after the refusal and a 14-day margin for a review notified late (s22A, regulation 8)', () => {
    expect(REFUSED_COPY_HOLD).toEqual({ days: 30, noticeMarginDays: 14 })
  })

  it('the shared sample table is well formed and covers every case LCD-14 names', () => {
    expect(new Set(SAMPLES.map(s => s.sample)).size).toBe(SAMPLES.length)
    const named = (name: string) => SAMPLES.find(s => s.sample === name)
    // A refused copy on days 0, 30, 44 and 45 after closed_on: held through day 44, not day 45.
    expect([0, 30, 44, 45].map(day => named(`refused_copy_day_${day}`)?.held)).toEqual([true, true, true, false])
    // Every kind open, and every kind that can be refused, refused.
    for (const kind of CASE_KINDS) {
      expect(
        SAMPLES.some(s => s.closed === null && s.kind === kind && s.steps.length <= 1),
        kind,
      ).toBe(true)
    }
    for (const kind of REFUSABLE_KINDS) {
      expect(
        SAMPLES.some(s => s.closed?.kind === kind && s.closed.outcome === 'refused'),
        kind,
      ).toBe(true)
    }
    for (const name of [
      'review_open',
      'review_ended_before_day_44',
      'review_ended_after_day_44_today',
      'review_ended_after_day_44_yesterday',
      'fresh_application_open',
      'fresh_application_ended',
      'answered_copy',
      'duplicate_copy',
      'question_reclassified_to_copy',
      'copy_reclassified_to_question',
    ]) {
      expect(named(name), name).toBeDefined()
    }
  })

  // Days chosen to cross a month, a year and a leap day, so the calendar arithmetic is Postgres's.
  for (const today of ['2026-11-02', '2026-12-31', '2027-01-01', '2028-02-29', '2028-03-01']) {
    it(`answers every sample as the table says, on ${today}`, () => {
      for (const sample of SAMPLES) {
        const facts = factsOn(sample, today)
        const until =
          sample.until === null || sample.until === 'indefinite' ? sample.until : shiftDay(today, sample.until)
        expect(heldUntil(facts), sample.sample).toBe(until)
        expect(heldOn(facts, today), sample.sample).toBe(sample.held)
      }
    })
  }

  it('S1 S2: Marcus’s copy refused on Mon 2 Nov 2026 holds through Wed 16 Dec; a PDPC review keeps it with no end until the review ends', () => {
    const refused: CaseHoldFacts = {
      kind: 'access',
      steps: [],
      closed: { on: '2026-11-02', kind: 'access', outcome: 'refused' },
    }
    expect(heldUntil(refused)).toBe('2026-12-16')
    expect(heldOn(refused, '2026-12-16')).toBe(true)
    expect(heldOn(refused, '2026-12-17')).toBe(false)
    const started = { ...refused, steps: [{ step: 'review_started' as const, onDay: '2026-11-24' }] }
    expect(heldUntil(started)).toBe('indefinite')
    expect(heldOn(started, '2030-01-01')).toBe(true)
    const endedLate = { ...refused, steps: [...started.steps, { step: 'review_ended' as const, onDay: '2027-03-01' }] }
    expect(heldUntil(endedLate)).toBe('2027-03-01')
    expect(heldOn(endedLate, '2027-03-02')).toBe(false)
    // Had it ended on Thu 3 Dec, the refusal's own window would still run through 16 Dec.
    const endedEarly = { ...refused, steps: [...started.steps, { step: 'review_ended' as const, onDay: '2026-12-03' }] }
    expect(heldUntil(endedEarly)).toBe('2026-12-16')
  })

  it('S6 LH-45: an open correction holds until it is closed, and an answered one or an open withdrawal holds nothing', () => {
    const correction: CaseHoldFacts = { kind: 'correction', steps: [], closed: null }
    expect(heldUntil(correction)).toBe('indefinite')
    expect(heldUntil({ ...correction, closed: { on: '2026-11-10', kind: 'correction', outcome: 'answered' } })).toBe(
      null,
    )
    // A withdrawal asks Hearth to stop, so holding for it would work against it.
    expect(heldUntil({ kind: 'withdrawal', steps: [], closed: null })).toBe(null)
  })

  it('caseKindNow() reads the kind as 0012’s case_kind_now() does: the closure’s, else the latest reclassification’s, else the kind it came as', () => {
    const reclassified: CaseHoldFacts = {
      kind: 'question',
      steps: [
        { step: 'reclassified', onDay: '2026-11-01', kind: 'access' },
        { step: 'note', onDay: '2026-11-02' },
        { step: 'reclassified', onDay: '2026-11-03', kind: 'complaint' },
      ],
      closed: null,
    }
    expect(caseKindNow(reclassified)).toBe('complaint')
    expect(caseKindNow({ ...reclassified, steps: [] })).toBe('question')
    expect(caseKindNow({ ...reclassified, closed: { on: '2026-11-04', kind: 'objection', outcome: 'answered' } })).toBe(
      'objection',
    )
  })
})

describe('LCS-08 LH-10 LH-15 LH-18: the vocabularies check 7f holds to the database', () => {
  it('HOLD_KINDS are the kinds the hold decision judges in C0.10, sign-in sessions as signin_session (T14 item 17)', () => {
    expect([...HOLD_KINDS]).toEqual([
      'person',
      'phone_number',
      'device',
      'signin_session',
      'passkey',
      'notice_acknowledgment',
      'case',
      'legal_hold',
      'data_access_event',
      // 0014: a derived item, held through its sources (LH-50).
      'derived',
    ])
    for (const kind of HOLD_KINDS) expect(kind).toMatch(SNAKE)
    expect(HOLD_KINDS as readonly string[]).not.toContain('session')
  })

  it('HOLD_TARGET_KINDS are ADM-08’s targets, and a recorded session is session', () => {
    expect([...HOLD_TARGET_KINDS]).toEqual(['person', 'channel', 'dm', 'group_dm', 'room', 'session', 'folder', 'file'])
    expect(new Set(HOLD_TARGET_KINDS).size).toBe(HOLD_TARGET_KINDS.length)
  })

  it('DELETION_CAUSES are the nine causes, and a replay is no cause (C0.17 re-logs the original cause with replayed set)', () => {
    expect([...DELETION_CAUSES]).toEqual([
      'retention',
      'request',
      'cascade',
      'redaction',
      'user',
      'trash',
      'offboarding',
      'correction',
      'upload',
    ])
    for (const cause of DELETION_CAUSES) expect(cause).toMatch(SNAKE)
    expect(new Set(DELETION_CAUSES).size).toBe(DELETION_CAUSES.length)
    expect(DELETION_CAUSES as readonly string[]).not.toContain('replay')
  })
})
