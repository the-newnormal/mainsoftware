// What the Owner bootstrap script sends, in what order (steps.ts; TECH-SPEC T22 items 63 to 71):
// BSU-08, the statements of each mode over a fake connection that records them and answers from a
// script; BSU-11, the recovery's statements as text; and BSU-12, the migration lock's id pinned to the
// installed Kysely. The real statements against Postgres are the check's (BSS-01 to BSS-16).
import { readFileSync } from 'node:fs'
import { FLAGS, normalisePhone, PROVIDERS, PURPOSE_KEYS, type TransferFacts } from '@hearth/shared'
import { describe, expect, it } from 'vitest'
import type { CorrectNumberDocument, DeployEnv, RecoverDocument, SetUpDocument } from './input.ts'
import { type CommittingLine, type Line, NotStarted, Refused } from './output.ts'
import {
  clearanceValues,
  correctNumber,
  KYSELY_MIGRATION_LOCK,
  type Queryable,
  recover,
  type SetUpIds,
  SQL,
  type StepContext,
  setUp,
} from './steps.ts'
import { LOG_SETTINGS } from './target.ts'

type Name = keyof typeof SQL
type Answer = readonly unknown[] | ((values: readonly unknown[]) => readonly unknown[]) | Error

const CHECKOUT = ['0001_tenancy', '0011_dpo_contact', '0012_request_cases']
const IDS: SetUpIds = {
  org: '0e8f4c1a-6b2d-4c3e-9f1a-2b3c4d5e6f7a',
  hearth: '1a2b3c4d-5e6f-4a7b-8c9d-aebfcadbecfd',
  founder: '2b3c4d5e-6f7a-4b8c-9daf-bacbdcedfeaf',
  number: '3c4d5e6f-7a8b-4c9d-aebf-cbdcedfeafba',
}
const TWILIO_CLEARANCE = '4d5e6f7a-8b9c-4dae-bfca-dcedfeafbacb'
const AWS_CLEARANCE = '5e6f7a8b-9cad-4ebf-cadb-edfeafbacbdc'
const NEW_CLEARANCE = '6f7a8b9c-adbe-4fca-dbec-feafbacbdced'
const OLD_CLEARANCE = '7a8b9cad-becf-4adb-ecfd-afbacbdcedfe'
const OLD_NUMBER = '8b9cadbe-cfda-4bec-fdae-bacbdcedfeaf'

const FACTS: TransferFacts = {
  services: 'Fictional test service',
  dataTypes: 'A fictional mobile number',
  processingCountries: ['US'],
  storageCountries: ['US'],
  countriesConfirmed: 'Test agreement, annex 1',
  safeguard: 'dpa',
  safeguardReference: 'Test agreement',
  certificateVerifiedOn: null,
  dpaTermsConfirmed: true,
  training: 'not_applicable',
  zeroRetention: 'not_applicable',
  providerRetention: '30 days',
  retentionConfirmed: 'Test agreement, annex 2',
  onwardRecipients: 'None',
  reviewOn: '2027-03-01',
}
const E164 = normalisePhone('+44 7700 900123') ?? ''
const SET_UP: SetUpDocument = {
  mode: 'set-up',
  environment: 'test',
  organisation: 'Kestrel Test Freight',
  founder: { fullName: 'Wren Example', e164: E164 },
  reason: 'Check set-up by the DPO',
  twilio: FACTS,
  aws: { ...FACTS, reviewOn: '2027-04-01' },
}
const RECOVER: RecoverDocument = {
  mode: 'recover',
  environment: 'test',
  dpo: IDS.founder,
  reviewOn: '2026-12-26',
  reason: 'Check re-clear by the DPO',
  fromEntry: ['provider_retention'],
}
const NEW_E164 = normalisePhone('+44 7700 900124') ?? ''
const CORRECT: CorrectNumberDocument = {
  mode: 'correct-number',
  environment: 'test',
  e164: NEW_E164,
  reason: 'Typo in the set-up',
}

const serverFacts = (overrides: Record<string, unknown> = {}) => ({
  lock_bound: '2s',
  marker_set: '',
  isolation: 'read committed',
  acting: 'hearth_owner',
  login: 'owner_bootstrap_check_ab',
  login_inherits: false,
  login_superuser: false,
  login_bypassrls: false,
  login_createrole: false,
  login_createdb: false,
  login_owns: false,
  memberships: [{ role: 'hearth_owner', set: true, inherit: false, admin: false }],
  database: 'owner_bootstrap_case_check',
  marker: null,
  rds: false,
  tls: false,
  migrations: CHECKOUT,
  has_function: true,
  has_orgs: true,
  orgs_forced: false,
  transaction_timeout: '30s',
  lock_timeout: '2s',
  idle_timeout: '5s',
  logs: {},
  ...overrides,
})

const ANSWERS: Partial<Record<Name, Answer>> = {
  prologue: [serverFacts()],
  existing: [{ org: null, migrations: CHECKOUT }],
  clear: values => [{ id: values[0] === 'twilio' ? TWILIO_CLEARANCE : AWS_CLEARANCE }],
  verifySetUp: () => [
    {
      flags: Object.keys(FLAGS).length,
      purposes: PURPOSE_KEYS.length,
      providers: PROVIDERS.length,
      hearth: 1,
      holders: [IDS.founder],
      notices: 0,
      contacts: 0,
      state: 'no_notice',
    },
  ],
  orgs: [{ id: IDS.org, time_zone: 'Asia/Singapore' }],
  hearth: [{ id: IDS.hearth }],
  twilioNow: [
    {
      signed_in: 0,
      last_ends: null,
      open_id: null,
      open_via: null,
      open_on: null,
      withdrawn_since: '2026-10-26',
      days_ahead: 60,
    },
  ],
  reclear: [
    {
      clearance: NEW_CLEARANCE,
      source_clearance: OLD_CLEARANCE,
      source_version: 1,
      before_facts: '{"services": "Fictional test service"}',
    },
  ],
  afterReclear: [
    { id: NEW_CLEARANCE, cleared_via: 'break_glass', review_on: '2026-12-26', changed: [], state: 'cleared' },
  ],
  orgsAndLedger: [{ orgs: [IDS.org], migrations: CHECKOUT }],
  roster: [{ id: IDS.founder }],
  founder: [{ founder_roles: 2, signed_in: false, published: false, number_id: OLD_NUMBER, same: false }],
  verifyCorrection: () => [{ holders: [IDS.founder], old_current: 0 }],
}

const NAMES = new Map<string, Name>(Object.entries(SQL).map(([name, text]) => [text, name as Name]))

// A connection that records each statement and answers from the script, and a context that records
// each line, in one log, so the order of statements and lines can be read.
function run(options: { commit?: boolean; env?: DeployEnv; answers?: Partial<Record<Name, Answer>> } = {}) {
  const answers = { ...ANSWERS, ...options.answers }
  const statements: { name: Name; text: string; values: readonly unknown[] }[] = []
  const events: string[] = []
  const lines: Line[] = []
  let committing: CommittingLine | undefined
  const db: Queryable = {
    async query(text, values = []) {
      const name = NAMES.get(text)
      if (name === undefined) throw new Error('a statement that is not in SQL')
      statements.push({ name, text, values })
      events.push(`query:${name}`)
      const answer = answers[name] ?? []
      if (answer instanceof Error) throw answer
      return { rows: typeof answer === 'function' ? answer(values) : answer }
    },
  }
  const ctx: StepContext = {
    db,
    commit: options.commit ?? false,
    env: options.env ?? 'test',
    database: 'owner_bootstrap_case_check',
    checkout: CHECKOUT,
    say: line => {
      lines.push(line)
      events.push(`say:${line.kind}`)
    },
    committing: line => {
      lines.push(line)
      events.push('say:committing')
      committing = line
    },
  }
  return {
    ctx,
    statements,
    events,
    lines,
    names: () => statements.map(statement => statement.name),
    committing: () => committing,
  }
}

const refusalOf = async (promise: Promise<unknown>) => {
  const error = await promise.then(
    () => undefined,
    (thrown: unknown) => thrown,
  )
  expect(error).toBeInstanceOf(Refused)
  return (error as Refused).refusal
}

const SET_UP_ORDER: Name[] = [
  'begin',
  'prologue',
  'locks',
  'existing',
  'insertOrg',
  'insertHearth',
  'actAsHearth',
  'insertHuman',
  'insertPerson',
  'insertNumber',
  'insertRoles',
  'auditSetUp',
  'clear',
  'clear',
  'verifySetUp',
]

describe('BSU-08 (PD-115, PD-124 to PD-129; R2, R4): the statements of each mode, in order', () => {
  it('sends the set-up as S1 to S16 exactly, committing once, and prints its committed lines after', async () => {
    const r = run({ commit: true })
    await setUp(r.ctx, SET_UP, IDS)
    expect(r.names()).toEqual([...SET_UP_ORDER, 'commit'])
    expect(r.committing()).toEqual({ kind: 'committing', mode: 'set-up', org: IDS.org })
    expect(r.events.slice(-5)).toEqual([
      'say:committing',
      'query:commit',
      'say:committed',
      'say:send_state',
      'say:next',
    ])
    expect(r.lines.find(line => line.kind === 'committed')).toEqual({
      kind: 'committed',
      mode: 'set-up',
      org: IDS.org,
      hearth: IDS.hearth,
      founder: IDS.founder,
      twilio: { clearance: TWILIO_CLEARANCE, reviewOn: '2027-03-01' },
      aws: { clearance: AWS_CLEARANCE, reviewOn: '2027-04-01' },
    })
    // A commit run never shows the founder's name, the number, the org's name or the review dates.
    expect(r.lines.map(line => line.kind)).not.toContain('founder_name')
    expect(r.lines.map(line => line.kind)).not.toContain('number')
    expect(r.lines.map(line => line.kind)).not.toContain('organisation')
  })

  it('runs the whole set-up as a plan and rolls it back, printing what the founder checks', async () => {
    const r = run()
    await setUp(r.ctx, SET_UP, IDS)
    expect(r.names()).toEqual([...SET_UP_ORDER, 'rollback'])
    expect(r.committing()).toBeUndefined()
    expect(r.lines.map(line => line.kind)).toEqual([
      'target',
      'organisation',
      'founder_name',
      'number',
      'reviews',
      'send_state',
      'kept_nothing',
    ])
    expect(r.lines).toContainEqual({ kind: 'number', masked: '+44 xxxxxxxx23' })
    expect(r.lines).toContainEqual({ kind: 'send_state', state: 'no_notice', committed: false })
  })

  it("sets the marker to '' at S2, with the lock bound, and never names twilio_reclear in a set-up or correction", async () => {
    for (const mode of ['set-up', 'correct-number'] as const) {
      const r = run({ commit: true })
      if (mode === 'set-up') await setUp(r.ctx, SET_UP, IDS)
      else await correctNumber(r.ctx, CORRECT, IDS.number)
      const prologue = r.statements[1]
      expect(prologue?.name).toBe('prologue')
      expect(prologue?.values[0]).toBe('')
      for (const statement of r.statements) {
        expect(statement.text).not.toContain('twilio_reclear')
        expect(JSON.stringify(statement.values)).not.toContain('twilio_reclear')
      }
    }
    expect(SQL.prologue).toMatch(
      /^select pg_catalog\.set_config\('lock_timeout', '2s', true\) as lock_bound,\s+pg_catalog\.set_config\('hearth\.break_glass', \$1, true\)/,
    )
  })

  it("takes both advisory locks alone in S3, the bootstrap's first, before the org check and any write", async () => {
    expect(SQL.locks).toMatch(
      /^select pg_catalog\.pg_advisory_xact_lock\(pg_catalog\.hashtextextended\('hearth\.owner_bootstrap', 0\)\),\s+pg_catalog\.pg_advisory_xact_lock\(\$1::bigint\)$/,
    )
    const r = run({ commit: true })
    await setUp(r.ctx, SET_UP, IDS)
    const locks = r.statements.find(statement => statement.name === 'locks')
    expect(locks?.values).toEqual([KYSELY_MIGRATION_LOCK.toString()])
    const names = r.names()
    expect(names.indexOf('locks')).toBeLessThan(names.indexOf('existing'))
    expect(names.indexOf('existing')).toBeLessThan(names.indexOf('insertOrg'))
    // S4 reads the ledger again, now that no migration can run, and Hearth acts straight after it exists.
    expect(SQL.existing).toContain('public.kysely_migration')
    expect(names[names.indexOf('insertHearth') + 1]).toBe('actAsHearth')
  })

  it('refuses at S4 an org that exists, or a migration that committed meanwhile, sending only rollback after it', async () => {
    const exists = run({ commit: true, answers: { existing: [{ org: IDS.hearth, migrations: CHECKOUT }] } })
    expect(await refusalOf(setUp(exists.ctx, SET_UP, IDS))).toEqual({ kind: 'org_exists', org: IDS.hearth })
    expect(exists.names()).toEqual(['begin', 'prologue', 'locks', 'existing', 'rollback'])
    const late = run({ commit: true, answers: { existing: [{ org: null, migrations: [...CHECKOUT, '9999_late'] }] } })
    expect(await refusalOf(setUp(late.ctx, SET_UP, IDS))).toEqual({
      kind: 'target',
      problems: [{ code: 'migration_unknown', name: '9999_late' }],
    })
    expect(late.names()).toEqual(['begin', 'prologue', 'locks', 'existing', 'rollback'])
  })

  it('refuses at S2 a target problem or a database with no ledger, after printing the target line', async () => {
    const rds = run({ answers: { prologue: [serverFacts({ rds: true })] } })
    expect(await refusalOf(setUp(rds.ctx, SET_UP, IDS))).toEqual({
      kind: 'target',
      problems: [{ code: 'server_is_rds' }],
    })
    expect(rds.names()).toEqual(['begin', 'prologue', 'rollback'])
    expect(rds.lines.map(line => line.kind)).toEqual(['target'])
    const noLedger = Object.assign(new Error('relation "public.kysely_migration" does not exist'), { code: '42P01' })
    const empty = run({ answers: { prologue: noLedger } })
    expect(await refusalOf(setUp(empty.ctx, SET_UP, IDS))).toEqual({
      kind: 'target',
      problems: [{ code: 'no_ledger' }],
    })
  })

  it('reads the log settings only under nonprod and prod', async () => {
    const local = run()
    await setUp(local.ctx, SET_UP, IDS)
    expect(local.statements[1]?.values[1]).toEqual([])
    const prod = run({ env: 'prod', answers: { prologue: [serverFacts({ rds: true })] } })
    await refusalOf(setUp(prod.ctx, { ...SET_UP, environment: 'prod' }, IDS))
    expect(prod.statements[1]?.values[1]).toEqual([...LOG_SETTINGS])
  })

  it('treats a failed BEGIN as a run that never started', async () => {
    const r = run({ answers: { begin: Object.assign(new Error('read-only'), { code: '25006' }) } })
    await expect(setUp(r.ctx, SET_UP, IDS)).rejects.toBeInstanceOf(NotStarted)
  })

  it('refuses when S15 finds what the triggers made differ, naming what, and rolls back', async () => {
    const r = run({
      commit: true,
      answers: {
        verifySetUp: [
          {
            flags: 1,
            purposes: PURPOSE_KEYS.length,
            providers: PROVIDERS.length,
            hearth: 1,
            holders: [IDS.founder, IDS.hearth],
            notices: 0,
            contacts: 1,
            state: 'not_cleared',
          },
        ],
      },
    })
    expect(await refusalOf(setUp(r.ctx, SET_UP, IDS))).toEqual({
      kind: 'verification',
      failures: ['flags', 'number', 'contact', 'send_state'],
    })
    expect(r.names().at(-1)).toBe('rollback')
    expect(r.names()).not.toContain('commit')
  })

  it("sends every founder value as a parameter, never in a statement's text", async () => {
    const r = run({ commit: true })
    await setUp(r.ctx, SET_UP, IDS)
    const values = JSON.stringify(r.statements.map(statement => statement.values))
    for (const value of [SET_UP.organisation, SET_UP.founder.fullName, E164, SET_UP.reason]) {
      expect(values).toContain(value)
      for (const statement of r.statements) expect(statement.text).not.toContain(value)
    }
    const person = r.statements.find(statement => statement.name === 'insertPerson')
    expect(person?.values).toEqual([IDS.founder, IDS.org, 'Wren Example', IDS.hearth])
    const audit = r.statements.find(statement => statement.name === 'auditSetUp')
    expect(JSON.parse(String(audit?.values[4]))).toEqual({
      by: 'bootstrap',
      roles: ['owner', 'dpo'],
      hearth: IDS.hearth,
      number: IDS.number,
    })
    expect(String(audit?.values[4])).not.toContain(E164)
  })

  it('sets the marker and the lock bound first in the recovery, and prints its inputs, the DPOs and Twilio now before R7', async () => {
    const r = run({ commit: true })
    await recover(r.ctx, RECOVER)
    expect(r.names()).toEqual([
      'begin',
      'prologue',
      'orgs',
      'hearth',
      'actAsHearth',
      'twilioNow',
      'reclear',
      'afterReclear',
      'commit',
    ])
    expect(r.statements[1]?.values[0]).toBe('twilio_reclear')
    const reclear = r.events.indexOf('query:reclear')
    for (const event of ['query:twilioNow', 'say:inputs', 'say:dpo_sessions', 'say:twilio_now']) {
      expect(r.events.indexOf(event), event).toBeGreaterThan(-1)
      expect(r.events.indexOf(event), event).toBeLessThan(reclear)
    }
    expect(r.committing()).toEqual({ kind: 'committing', mode: 'recover', clearance: NEW_CLEARANCE })
    expect(r.lines).toContainEqual({
      kind: 'inputs',
      dpo: IDS.founder,
      reviewOn: '2026-12-26',
      daysAhead: 60,
      zone: 'Asia/Singapore',
      fromEntry: ['provider_retention'],
      reasonLength: [...RECOVER.reason].length,
    })
    expect(r.lines).toContainEqual({ kind: 'twilio_now', since: '2026-10-26' })
    expect(r.lines).toContainEqual({
      kind: 'facts_source',
      clearance: OLD_CLEARANCE,
      version: 1,
      fromEntry: ['provider_retention'],
    })
    expect(r.lines.slice(-2)).toEqual([
      { kind: 'committed', mode: 'recover', clearance: NEW_CLEARANCE, reviewOn: '2026-12-26' },
      { kind: 'send_state', state: 'cleared', committed: true },
    ])
    const sent = r.statements.find(statement => statement.name === 'reclear')
    expect(sent?.values).toEqual([IDS.org, IDS.founder, '2026-12-26', ['provider_retention'], RECOVER.reason])
    // R7's opaque text goes to R8 as it came, and to no line.
    const after = r.statements.find(statement => statement.name === 'afterReclear')
    expect(after?.values).toEqual([IDS.org, NEW_CLEARANCE, '{"services": "Fictional test service"}'])
    expect(JSON.stringify(r.lines)).not.toContain('Fictional test service')
  })

  it("prints Twilio Verify's open clearance, and the plan rolls back after the function's own refusal", async () => {
    const open = [
      {
        signed_in: 1,
        last_ends: new Date('2026-10-27T18:00:00Z'),
        open_id: OLD_CLEARANCE,
        open_via: 'break_glass',
        open_on: '2026-10-27',
        withdrawn_since: null,
        days_ahead: 30,
      },
    ]
    const refusal = Object.assign(new Error('Twilio Verify is cleared already.'), { code: 'HF006' })
    const r = run({ answers: { twilioNow: open, reclear: refusal } })
    await expect(recover(r.ctx, RECOVER)).rejects.toBe(refusal)
    expect(r.lines).toContainEqual({
      kind: 'twilio_now',
      clearance: OLD_CLEARANCE,
      via: 'break_glass',
      on: '2026-10-27',
    })
    expect(r.lines).toContainEqual({
      kind: 'dpo_sessions',
      count: 1,
      lastEnds: new Date('2026-10-27T18:00:00Z'),
      zone: 'Asia/Singapore',
    })
    expect(r.names().at(-1)).toBe('rollback')
  })

  it('refuses a recovery with no org, two orgs or no Hearth principal', async () => {
    const none = run({ answers: { orgs: [] } })
    expect(await refusalOf(recover(none.ctx, RECOVER))).toEqual({ kind: 'no_org' })
    const two = run({
      answers: {
        orgs: [
          { id: IDS.org, time_zone: 'Asia/Singapore' },
          { id: IDS.hearth, time_zone: 'Asia/Singapore' },
        ],
      },
    })
    expect(await refusalOf(recover(two.ctx, RECOVER))).toEqual({ kind: 'two_orgs' })
    const hearthless = run({ answers: { hearth: [] } })
    expect(await refusalOf(recover(hearthless.ctx, RECOVER))).toEqual({ kind: 'no_hearth' })
  })

  it('sends the correction in its order, under the same locks, and refuses outside its window', async () => {
    const r = run({ commit: true })
    await correctNumber(r.ctx, CORRECT, IDS.number)
    expect(r.names()).toEqual([
      'begin',
      'prologue',
      'locks',
      'orgsAndLedger',
      'hearth',
      'actAsHearth',
      'roster',
      'founder',
      'removeNumber',
      'insertNumber',
      'auditCorrection',
      'verifyCorrection',
      'commit',
    ])
    const audit = r.statements.find(statement => statement.name === 'auditCorrection')
    expect(JSON.parse(String(audit?.values[4]))).toEqual({ by: 'bootstrap', from: OLD_NUMBER, to: IDS.number })
    expect(r.lines.at(-1)).toEqual({ kind: 'committed', mode: 'correct-number' })
    const founder = ANSWERS.founder as readonly Record<string, unknown>[]
    const refusals: [Partial<Record<Name, Answer>>, string][] = [
      [{ founder: [{ ...founder[0], signed_in: true }] }, 'signed_in'],
      [{ founder: [{ ...founder[0], published: true }] }, 'published'],
      [{ founder: [{ ...founder[0], same: true }] }, 'already'],
      [{ founder: [{ ...founder[0], founder_roles: 1 }] }, 'not_founder'],
      [{ roster: [{ id: IDS.founder }, { id: IDS.hearth }] }, 'roster'],
      [{ roster: [] }, 'no_founder'],
    ]
    for (const [answers, kind] of refusals) {
      const refused = run({ commit: true, answers })
      expect((await refusalOf(correctNumber(refused.ctx, CORRECT, IDS.number))).kind).toBe(kind)
      expect(refused.names()).not.toContain('removeNumber')
      expect(refused.names().at(-1)).toBe('rollback')
    }
    const plan = run()
    await correctNumber(plan.ctx, CORRECT, IDS.number)
    expect(plan.lines.map(line => line.kind)).toEqual(['target', 'number', 'kept_nothing'])
    expect(plan.lines).toContainEqual({ kind: 'number', masked: '+44 xxxxxxxx24' })
  })

  it("holds no row lock but C7's, and the recovery and correction add nobody", async () => {
    const locking = Object.entries(SQL).filter(([, text]) => /for (share|update|no key update)/i.test(text))
    expect(locking.map(([name]) => name)).toEqual(['roster'])
    for (const go of [
      async () => {
        const r = run({ commit: true })
        await recover(r.ctx, RECOVER)
        return r
      },
      async () => {
        const r = run({ commit: true })
        await correctNumber(r.ctx, CORRECT, IDS.number)
        return r
      },
    ]) {
      const r = await go()
      for (const statement of r.statements) {
        expect(statement.text).not.toMatch(/insert into public\.(orgs|principals|people|role_assignments)\b/)
      }
    }
  })
})

// The top-level arguments of a function call in a statement, split at its commas.
function callArguments(text: string, fn: string): string[] {
  const start = text.indexOf(`${fn}(`)
  expect(start).toBeGreaterThan(-1)
  const args: string[] = []
  let depth = 0
  let current = ''
  for (const char of text.slice(start + fn.length + 1)) {
    if (char === '(') depth += 1
    if (char === ')') {
      if (depth === 0) break
      depth -= 1
    }
    if (char === ',' && depth === 0) {
      args.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  args.push(current.trim())
  return args
}

// The 18 argument types S2 checks with to_regprocedure.
const SIGNATURE = (/to_regprocedure\('public\.bootstrap_transfer_clearance\(([^)]*)\)'\)/.exec(SQL.prologue)?.[1] ?? '')
  .split(',')
  .map(type => type.trim())

describe('BSU-11 (PD-127, PD-128; T22 item 44): the recovery statements as text', () => {
  it('names no audit_events, and parses no snapshot in TypeScript', async () => {
    const r = run({ commit: true })
    await recover(r.ctx, RECOVER)
    for (const statement of r.statements) expect(statement.text).not.toContain('audit_events')
    const source = readFileSync(new URL('./steps.ts', import.meta.url), 'utf8')
    expect(source).not.toContain('JSON.parse')
  })

  it("returns the entry's facts before the call from a CTE that reads the entry, and R8 takes them as $3::jsonb", () => {
    expect(SQL.reclear).toMatch(
      /before as \(\s+select public\.transfer_register_facts\(t\)::text as facts\s+from public\.transfer_register t/,
    )
    expect(SQL.reclear).toContain('(select b.facts from before b) as before_facts')
    expect(SQL.afterReclear).toContain('pg_catalog.jsonb_each($3::jsonb)')
  })

  it('calls the function with its 18 arguments in its order, the review date always $3', () => {
    expect(SIGNATURE).toHaveLength(18)
    const args = callArguments(SQL.reclear, 'public.bootstrap_transfer_clearance')
    expect(args).toHaveLength(18)
    expect(args[0]).toBe("'twilio'")
    expect(args[1]).toBe('$2::uuid')
    expect(args[16]).toBe('$3::date')
    expect(args[17]).toBe('$5')
    expect(SQL.reclear).not.toContain("f ->> 'review_on'")
    // Each fact read from the snapshot under its own key, in the function's order.
    const keys = args.slice(2, 16).map(arg => /'([a-z_]+)'/.exec(arg)?.[1])
    expect(keys).toEqual([
      'services',
      'data_types',
      'processing_countries',
      'storage_countries',
      'countries_confirmed',
      'safeguard',
      'safeguard_reference',
      'certificate_verified_on',
      'dpa_terms_confirmed',
      'training',
      'zero_retention',
      'provider_retention',
      'retention_confirmed',
      'onward_recipients',
    ])
    // A cast, where one is written, is the signature's type.
    for (const [index, arg] of args.entries()) {
      const cast = /::([a-z[\]]+)\)?$/.exec(arg)?.[1]
      if (cast !== undefined && !arg.startsWith('array(')) expect(cast, arg).toBe(SIGNATURE[index])
    }
  })

  it("takes the DPO's record only through notice_facts() and only for the named keys, the linked snapshot first", () => {
    expect(SQL.reclear).toContain('select public.notice_facts(public.transfer_register_facts(t)) as facts')
    expect(SQL.reclear).toContain('where e.key = any ($4::text[])')
    expect(SQL.reclear.match(/notice_facts\(/g)).toHaveLength(1)
    expect(SQL.reclear).toMatch(/linked as \(\s+select c\.id, c\.facts, 1 as rank/)
    expect(SQL.reclear).toMatch(/ended as \(\s+select c\.id, c\.facts, 2 as rank/)
    expect(SQL.reclear).toContain('order by s.rank limit 1')
  })

  it("maps the set-up's parsed facts to the function's arguments, every field once, in its order", () => {
    const facts = Object.fromEntries(Object.keys(FACTS).map(key => [key, `<${key}>`])) as unknown as TransferFacts
    const values = clearanceValues(
      'aws',
      IDS.founder,
      { ...facts, processingCountries: ['P'], storageCountries: ['S'] },
      'why',
    )
    expect(values).toEqual([
      'aws',
      IDS.founder,
      '<services>',
      '<dataTypes>',
      ['P'],
      ['S'],
      '<countriesConfirmed>',
      '<safeguard>',
      '<safeguardReference>',
      '<certificateVerifiedOn>',
      '<dpaTermsConfirmed>',
      '<training>',
      '<zeroRetention>',
      '<providerRetention>',
      '<retentionConfirmed>',
      '<onwardRecipients>',
      '<reviewOn>',
      'why',
    ])
    const args = callArguments(SQL.clear, 'public.bootstrap_transfer_clearance')
    expect(args).toHaveLength(18)
    for (const [index, arg] of args.entries()) {
      expect(arg).toMatch(new RegExp(`^\\$${index + 1}(::|$)`))
      const cast = /::([a-z[\]]+)$/.exec(arg)?.[1]
      if (cast !== undefined) expect(cast, arg).toBe(SIGNATURE[index])
    }
  })
})

describe("BSU-12 (PD-124): S3's migration lock is the one the installed Kysely takes", () => {
  it("finds the id and Kysely's session-level advisory lock in its Postgres adapter", () => {
    const adapter = readFileSync(
      new URL('../../node_modules/kysely/dist/dialect/postgres/postgres-adapter.js', import.meta.url),
      'utf8',
    )
    expect(adapter).toContain(`BigInt('${KYSELY_MIGRATION_LOCK}')`)
    expect(adapter).toContain('pg_advisory_lock(')
  })
})
