// What the Owner bootstrap script prints, and how it exits (output.ts; TECH-SPEC T22 items 63 to 71):
// BSU-07, the one printer and the sanitiser, and BSU-10, the exit statuses. Planted values are
// fictional and carry a canary, which no printed line may hold.
import { DatabaseError } from 'pg'
import { describe, expect, it } from 'vitest'
import {
  type CommittingLine,
  connectFailure,
  EXIT,
  interrupted,
  type Line,
  NotStarted,
  outcomeOf,
  type Phase,
  printer,
  type Refusal,
  Refused,
  refused,
  report,
} from './output.ts'

const ORG = '0e8f4c1a-6b2d-4c3e-9f1a-2b3c4d5e6f7a'
const CLEARANCE = '7d1e2f3a-4b5c-4d6e-8f7a-8b9cadbecfda'
const CANARY = 'Wren Canary'
const NUMBER = '+44 7700 900123'

function capture(terminal = false) {
  const out: string[] = []
  const err: string[] = []
  const print = printer({ out: text => out.push(text), err: text => err.push(text), terminal: () => terminal })
  return { print, out, err, all: () => [...out, ...err].join('') }
}

function databaseError(fields: Partial<DatabaseError> & { message?: string }): DatabaseError {
  const error = new DatabaseError(fields.message ?? 'an error', 0, 'error')
  return Object.assign(error, {
    severity: 'ERROR',
    detail: `Failing row contains (${NUMBER}, ${CANARY}).`,
    hint: `Try ${CANARY}`,
    where: `PL/pgSQL function with ${CANARY}`,
    schema: 'public',
    table: 'people',
    column: 'full_name',
    ...fields,
  })
}

const phase = (committing?: CommittingLine): Phase => ({ mode: committing?.mode ?? 'set-up', committing })

// One line of every kind, each as the steps make it.
const EVERY_LINE: Line[] = [
  {
    kind: 'target',
    mode: 'set-up',
    commit: false,
    database: 'owner_bootstrap_case_check',
    env: 'test',
    inputEnv: 'test',
    marker: 'none',
    migrations: 12,
    newest: '0012_request_cases',
    bounds: { transaction: '30s', lock: '2s', idle: '5s' },
  },
  { kind: 'organisation', name: 'Kestrel Test Freight' },
  { kind: 'founder_name', name: 'Wren Example' },
  { kind: 'number', masked: '+44 xxxxxxxx23' },
  { kind: 'reviews', twilio: '2027-03-01', aws: '2027-04-01' },
  {
    kind: 'inputs',
    dpo: ORG,
    reviewOn: '2026-12-26',
    daysAhead: 60,
    zone: 'Asia/Singapore',
    fromEntry: ['provider_retention'],
    reasonLength: 31,
  },
  { kind: 'dpo_sessions', count: 0, lastEnds: null, zone: 'Asia/Singapore' },
  { kind: 'twilio_now', clearance: CLEARANCE, via: 'break_glass', on: '2026-10-27' },
  { kind: 'twilio_now', since: '2026-10-26' },
  { kind: 'twilio_now', never: true },
  { kind: 'log_warning', settings: ['log_statement'] },
  { kind: 'facts_source', clearance: CLEARANCE, version: 1, fromEntry: [] },
  { kind: 'facts_source', clearance: CLEARANCE, version: 0, fromEntry: [] },
  { kind: 'facts_source', clearance: CLEARANCE, version: null, fromEntry: [] },
  { kind: 'changed', keys: ['review_on'] },
  { kind: 'committing', mode: 'set-up', org: ORG },
  { kind: 'committing', mode: 'recover', clearance: CLEARANCE },
  { kind: 'committing', mode: 'correct-number' },
  {
    kind: 'committed',
    mode: 'set-up',
    org: ORG,
    hearth: CLEARANCE,
    founder: ORG,
    twilio: { clearance: CLEARANCE, reviewOn: '2027-03-01' },
    aws: { clearance: CLEARANCE, reviewOn: '2027-04-01' },
  },
  { kind: 'committed', mode: 'recover', clearance: CLEARANCE, reviewOn: '2026-12-26' },
  { kind: 'committed', mode: 'correct-number' },
  { kind: 'send_state', state: 'no_notice', committed: true },
  { kind: 'next' },
  { kind: 'kept_nothing' },
  { kind: 'connect_failed', cause: 'other', code: 'EPROTO' },
  { kind: 'refused', refusal: { kind: 'org_exists', org: ORG } },
  { kind: 'lost', committing: false },
  { kind: 'lost', committing: { kind: 'committing', mode: 'recover', clearance: CLEARANCE } },
  { kind: 'interrupted', committing: true },
  { kind: 'unexpected', committing: false, name: 'TypeError', code: null },
]

describe('BSU-07 (PD-131; R1): one printer of typed lines, and the sanitiser', () => {
  it('prints every kind of line, prefixed, and nothing that is not a Line', () => {
    for (const line of EVERY_LINE) {
      const { print, out, err } = capture()
      print(line)
      const written = [...out, ...err]
      expect(written, line.kind).toHaveLength(1)
      expect(written[0]).toMatch(/^owner-bootstrap: \S/)
      expect(written[0]).not.toContain('failed its own check')
    }
    const bad: unknown[] = [
      { kind: 'shout', text: CANARY },
      { kind: 'number', masked: NUMBER },
      { kind: 'number', masked: '+447700900123' },
      { kind: 'organisation', name: `${CANARY}\n` },
      { kind: 'changed', keys: ['review_on'], before_facts: `{"services": "${CANARY}"}` },
      { kind: 'facts_source', clearance: CLEARANCE, version: 1, fromEntry: [], facts: CANARY },
      { kind: 'target', mode: 'set-up' },
      { kind: 'refused', refusal: { kind: 'postgres', sqlstate: '23514', message: `${CANARY}\nsecond line` } },
      {
        kind: 'refused',
        refusal: { kind: 'input', problems: [{ code: 'shape', path: `a ${CANARY}`, kind: 'invalid' }] },
      },
    ]
    for (const line of bad) {
      const { print, all, err } = capture()
      print(line as Line)
      expect(err).toEqual(['owner-bootstrap: a line failed its own check, so it was not printed\n'])
      expect(all()).not.toContain('Canary')
      expect(all()).not.toContain('7700')
    }
  })

  it("prints the founder's name only when stdout is a terminal, else its length", () => {
    const tty = capture(true)
    tty.print({ kind: 'founder_name', name: 'Wren Example' })
    expect(tty.out).toEqual(["owner-bootstrap: founder's name: Wren Example\n"])
    const pipe = capture(false)
    pipe.print({ kind: 'founder_name', name: 'Wren Example' })
    expect(pipe.out).toEqual(["owner-bootstrap: founder's name: 12 characters (shown only on a terminal)\n"])
    // The terminal is asked only for that line.
    let asked = 0
    const print = printer({ out: () => {}, err: () => {}, terminal: () => ++asked > 0 })
    for (const line of EVERY_LINE.filter(line => line.kind !== 'founder_name')) print(line)
    expect(asked).toBe(0)
  })

  it('prints the number only as maskNumber() shows it', () => {
    const { print, out } = capture()
    print({ kind: 'number', masked: '+44 xxxxxxxx23' })
    expect(out).toEqual(["owner-bootstrap: founder's number: +44 xxxxxxxx23\n"])
  })

  it("prints the DPOs' last session in the org's zone first and UTC after, and never an id", () => {
    const { print, out } = capture()
    print({ kind: 'dpo_sessions', count: 1, lastEnds: new Date('2026-10-27T18:00:00Z'), zone: 'Asia/Singapore' })
    print({ kind: 'dpo_sessions', count: 0, lastEnds: null, zone: 'Asia/Singapore' })
    expect(out).toEqual([
      "owner-bootstrap: DPOs signed in, before the re-clear's own check: 1, the last session ending 2026-10-28 02:00 Asia/Singapore (2026-10-27 18:00 UTC) (the re-clear refuses until then, unless that session is signed out)\n",
      "owner-bootstrap: DPOs signed in, before the re-clear's own check: 0\n",
    ])
  })

  it("repeats the recovery's inputs back, the reason only as its length, and prints the review dates and Twilio now", () => {
    const { print, out } = capture()
    for (const line of EVERY_LINE.filter(line => ['inputs', 'reviews', 'twilio_now'].includes(line.kind))) print(line)
    expect(out).toEqual([
      'owner-bootstrap: review dates: Twilio Verify 2027-03-01, AWS 2027-04-01\n',
      `owner-bootstrap: named DPO ${ORG}; review date 2026-12-26 (60 days ahead in Asia/Singapore); from the DPO's record: provider_retention; reason: 31 characters\n`,
      `owner-bootstrap: Twilio Verify now: cleared, clearance ${CLEARANCE}, by break_glass, 2026-10-27\n`,
      'owner-bootstrap: Twilio Verify now: not cleared since 2026-10-26\n',
      'owner-bootstrap: Twilio Verify now: never cleared\n',
    ])
  })

  it('names where the facts come from, v0 included (PD-84), and refuses a version below 0', () => {
    const { print, out, err } = capture()
    for (const line of EVERY_LINE.filter(line => line.kind === 'facts_source')) print(line)
    print({ kind: 'facts_source', clearance: CLEARANCE, version: -1, fromEntry: [] })
    expect(out).toEqual([
      `owner-bootstrap: facts: the Twilio Verify clearance version 1 states (${CLEARANCE})\n`,
      `owner-bootstrap: facts: the Twilio Verify clearance version 0 states (${CLEARANCE})\n`,
      `owner-bootstrap: facts: the Twilio Verify clearance that ended last (${CLEARANCE}), since no published version names one\n`,
    ])
    expect(err).toEqual(['owner-bootstrap: a line failed its own check, so it was not printed\n'])
  })

  it("prints a DatabaseError's code, constraint and only Hearth's own message, never its detail, hint or where", () => {
    const cases: [DatabaseError, string][] = [
      [
        databaseError({
          code: '23514',
          message: `new row violates check constraint`,
          routine: 'ExecConstraints',
          constraint: 'people_full_name_check',
        }),
        'Postgres refused it (SQLSTATE 23514, constraint people_full_name_check). Nothing was written.',
      ],
      [
        databaseError({
          code: 'HF006',
          message: 'A Data Protection Officer is signed in, so they clear Twilio Verify again in Hearth.',
          routine: 'exec_stmt_raise',
        }),
        'A Data Protection Officer is signed in, so they clear Twilio Verify again in Hearth. (SQLSTATE HF006). Nothing was written.',
      ],
      [
        databaseError({
          code: '42501',
          message: 'The person named as the DPO must be at the organisation and hold the DPO role.',
          routine: 'exec_stmt_raise',
        }),
        'The person named as the DPO must be at the organisation and hold the DPO role. (SQLSTATE 42501). Nothing was written.',
      ],
      [
        databaseError({ code: '42501', message: `permission denied for table ${CANARY}`, routine: 'aclcheck_error' }),
        'Postgres refused it (SQLSTATE 42501). Nothing was written.',
      ],
      [
        databaseError({
          code: '22P02',
          message: `invalid input syntax for type uuid: "${CANARY}"`,
          routine: 'string_to_uuid',
        }),
        'Postgres refused it (SQLSTATE 22P02). Nothing was written.',
      ],
      [
        databaseError({ code: 'P0001', message: `planted ${CANARY}`, routine: 'exec_stmt_raise' }),
        'Postgres refused it (SQLSTATE P0001). Nothing was written.',
      ],
    ]
    for (const [error, text] of cases) {
      const { print, err, all } = capture()
      expect(report(outcomeOf(error, phase()), print)).toBe(EXIT.refused)
      expect(err).toEqual([`owner-bootstrap: ${text}\n`])
      expect(all()).not.toContain('Canary')
      expect(all()).not.toContain('7700')
    }
  })

  it('prints a fixed line for any other error, and the process handlers print neither a canary nor a stack', () => {
    const plain = capture()
    expect(report(outcomeOf(new Error(`${CANARY} ${NUMBER}`), phase()), plain.print)).toBe(EXIT.retry)
    expect(plain.err).toEqual([
      'owner-bootstrap: something unexpected stopped the run (Error) before committing, so nothing was committed.\n',
    ])
    // As uncaughtException and unhandledRejection hand them over: the error, or the rejection's
    // reason, goes through the same sanitiser.
    for (const error of [
      databaseError({ code: '23505', message: `duplicate key ${CANARY}`, constraint: 'phone_numbers_current_number' }),
      databaseError({ code: 'XX000', message: `${CANARY} ${NUMBER}` }),
    ]) {
      const handled = capture()
      expect(report(outcomeOf(error, phase()), handled.print)).toBe(EXIT.refused)
      expect(handled.all()).toMatch(/^owner-bootstrap: Postgres refused it \(SQLSTATE (23505|XX000)/)
      expect(handled.all()).not.toContain('Canary')
      expect(handled.all()).not.toContain('7700')
      expect(handled.all()).not.toMatch(/\n\s+at /)
    }
    const typeError = capture()
    report(outcomeOf(new TypeError(CANARY), phase({ kind: 'committing', mode: 'correct-number' })), typeError.print)
    expect(typeError.all()).toBe(
      'owner-bootstrap: something unexpected stopped the run (TypeError) while committing, so it may or may not have committed. Run the plan to see.\n',
    )
  })
})

describe('BSU-10 (PD-132): the exit statuses, and a failure to connect names its cause', () => {
  it('maps each refusal to its status: 2 for the inputs and the target, 3 for a busy lock or a deadlock, else 1', () => {
    const statuses: [Refusal, number][] = [
      [{ kind: 'arguments', problem: 'mode_missing' }, 2],
      [{ kind: 'environment', problems: [{ code: 'sslmode' }] }, 2],
      [{ kind: 'input', problems: [{ code: 'not_json' }] }, 2],
      [{ kind: 'target', problems: [{ code: 'no_tls' }] }, 2],
      [{ kind: 'org_exists', org: ORG }, 1],
      [{ kind: 'two_orgs' }, 1],
      [{ kind: 'verification', failures: ['flags'] }, 1],
      [{ kind: 'already' }, 1],
      [{ kind: 'postgres', sqlstate: 'HF006', message: 'Twilio Verify is cleared already.' }, 1],
      [{ kind: 'postgres', sqlstate: '55P03' }, 3],
      [{ kind: 'postgres', sqlstate: '40P01' }, 3],
    ]
    for (const [refusal, status] of statuses) {
      expect(refused(refusal).exit, refusal.kind).toBe(status)
      expect(outcomeOf(new Refused(refusal), phase()).exit).toBe(status)
    }
    const busy = capture()
    report(
      outcomeOf(databaseError({ code: '55P03', message: 'canceling statement due to lock timeout' }), phase()),
      busy.print,
    )
    expect(busy.all()).toContain('a lock was busy: run it once more')
  })

  it("names PGSSLNEGOTIATION's refusals, and the log settings as the acting role reads them, in fixed words (IO-02, IO-03)", () => {
    const env = capture()
    env.print({
      kind: 'refused',
      refusal: { kind: 'environment', problems: [{ code: 'sslnegotiation' }, { code: 'sslnegotiation_direct' }] },
    })
    expect(env.err).toHaveLength(1)
    expect(env.all()).toContain('PGSSLNEGOTIATION must be unset, postgres or direct')
    expect(env.all()).toContain('PGSSLNEGOTIATION is direct, which needs TLS')
    expect(refused({ kind: 'environment', problems: [{ code: 'sslnegotiation_direct' }] }).exit).toBe(EXIT.wrong)
    const logs = capture()
    logs.print({
      kind: 'refused',
      refusal: {
        kind: 'target',
        problems: [
          { code: 'log_unsafe', settings: ['auto_explain.log_min_duration'] },
          { code: 'log_unreadable', settings: ['log_statement'] },
        ],
      },
    })
    expect(logs.all()).toContain('(auto_explain.log_min_duration)')
    expect(logs.all()).toContain('acting as hearth_owner')
    expect(logs.all()).toContain('stop and report it')
    // Never advice to grant the login a role: the script refuses a login with a second membership.
    expect(logs.all()).not.toMatch(/grants? pg_read_all_settings/)
  })

  it('points a port forward at PGHOST=127.0.0.1 from both TLS-name lines, so neither sends the person in a loop (DOCS-06)', () => {
    const named = capture()
    named.print({ kind: 'refused', refusal: { kind: 'environment', problems: [{ code: 'tls_name_with_name' }] } })
    expect(named.all()).toContain('for a port forward set PGHOST to 127.0.0.1')
    const altname = capture()
    altname.print(connectFailure(Object.assign(new Error('altname'), { code: 'ERR_TLS_CERT_ALTNAME_INVALID' })))
    expect(altname.all()).toContain('for a port forward, PGHOST=127.0.0.1 with OWNER_BOOTSTRAP_TLS_NAME')
  })

  it('maps every failure before the first statement returns to 2 with its own line, echoing no host, user or message', () => {
    const host = 'db.wren-canary.example'
    const node = (code: string) => Object.assign(new Error(`connect ${code} ${host} as wren_canary`), { code })
    const cases: [unknown, string][] = [
      [node('ENOTFOUND'), "the database host's name wasn't found"],
      [node('EAI_AGAIN'), "the database host's name wasn't found"],
      [node('ECONNREFUSED'), 'nothing answered on that host and port'],
      [node('EHOSTUNREACH'), 'nothing answered on that host and port'],
      [node('ENETUNREACH'), 'nothing answered on that host and port'],
      [node('ETIMEDOUT'), 'timed out connecting'],
      [new Error('timeout expired'), 'timed out connecting'],
      [node('UNABLE_TO_VERIFY_LEAF_SIGNATURE'), "the server's certificate isn't trusted"],
      [node('UNABLE_TO_GET_ISSUER_CERT_LOCALLY'), "the server's certificate isn't trusted"],
      [node('SELF_SIGNED_CERT_IN_CHAIN'), "the server's certificate isn't trusted"],
      [node('DEPTH_ZERO_SELF_SIGNED_CERT'), "the server's certificate isn't trusted"],
      [node('CERT_HAS_EXPIRED'), "the server's certificate isn't trusted"],
      [node('ERR_TLS_CERT_ALTNAME_INVALID'), "the certificate doesn't name the host you connected to"],
      [new Error('The server does not support SSL connections'), "the server doesn't offer TLS"],
      [new Error('There was an error establishing an SSL connection'), "the server doesn't offer TLS"],
      [
        databaseError({ code: '28P01', message: `password authentication failed for user "wren_canary"` }),
        'signing in to Postgres failed',
      ],
      [
        databaseError({ code: '28000', message: `no pg_hba.conf entry for host "${host}"` }),
        'signing in to Postgres failed',
      ],
      [
        databaseError({ code: '3D000', message: `database "wren_canary" does not exist` }),
        "that database doesn't exist",
      ],
      [
        databaseError({ code: '42501', message: `permission denied to set role "hearth_owner"` }),
        'this login may not act as hearth_owner',
      ],
      [
        new NotStarted(
          databaseError({ code: '25006', message: 'cannot set transaction read-write mode during recovery' }),
        ),
        'this is a read-only server',
      ],
      [new NotStarted(databaseError({ code: '0A000', message: 'read-only' })), 'this is a read-only server'],
      [node('EWHATEVER'), 'connecting failed (EWHATEVER)'],
      [new Error(`something about ${host}`), 'connecting failed (no code)'],
    ]
    for (const [error, text] of cases) {
      const { print, err, all } = capture()
      print(connectFailure(error))
      expect(err, text).toHaveLength(1)
      expect(err[0]).toContain(`owner-bootstrap: could not connect: ${text}`)
      expect(all()).not.toMatch(/canary/i)
    }
    // A failed first statement is a failure to connect, exit 2, never a lost connection.
    expect(outcomeOf(new NotStarted(databaseError({ code: '25006' })), phase())).toEqual({
      lines: [{ kind: 'connect_failed', cause: 'read_only', code: null }],
      exit: EXIT.wrong,
    })
  })

  it('maps a lost connection to 3 before "committing" and to 4 after it, with the mode\'s own line', () => {
    const losses = [
      new Error('Connection terminated unexpectedly'),
      new Error('Query read timeout'),
      Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }),
      databaseError({ code: '57P01', message: 'terminating connection due to administrator command' }),
      databaseError({ code: '25P04', message: 'terminating connection due to transaction timeout' }),
    ]
    for (const loss of losses) {
      const before = outcomeOf(loss, phase())
      expect(before).toEqual({ lines: [{ kind: 'lost', committing: false }], exit: EXIT.retry })
      const committing: CommittingLine = { kind: 'committing', mode: 'recover', clearance: CLEARANCE }
      expect(outcomeOf(loss, phase(committing))).toEqual({ lines: [{ kind: 'lost', committing }], exit: EXIT.unknown })
    }
    const texts: [CommittingLine, string][] = [
      [
        { kind: 'committing', mode: 'set-up', org: ORG },
        `while committing organisation ${ORG}, so it may or may not have committed. Run the same command again: it never sets up twice`,
      ],
      [
        { kind: 'committing', mode: 'recover', clearance: CLEARANCE },
        `if its "Twilio Verify now" line names clearance ${CLEARANCE}, this run committed.`,
      ],
      [{ kind: 'committing', mode: 'correct-number' }, 'Run the plan: "already that one" means it committed.'],
    ]
    for (const [committing, text] of texts) {
      const { print, err } = capture()
      expect(report(outcomeOf(new Error('Connection terminated unexpectedly'), phase(committing)), print)).toBe(4)
      expect(err[0]).toContain(text)
    }
    const early = capture()
    report(outcomeOf(new Error('Connection terminated unexpectedly'), phase()), early.print)
    expect(early.err).toEqual([
      'owner-bootstrap: the connection was lost before committing, so nothing was committed. Run the same command again.\n',
    ])
    // COMMIT refused by the server rolls back: nothing was committed, exit 1.
    expect(
      outcomeOf(
        databaseError({ code: '23514', routine: 'ExecConstraints' }),
        phase({ kind: 'committing', mode: 'correct-number' }),
      ).exit,
    ).toBe(EXIT.refused)
  })

  it('maps a stop to 3 before "committing" and 4 after it, with its own line and never the lost-connection advice', () => {
    const before = capture()
    expect(report(interrupted(phase()), before.print)).toBe(3)
    expect(before.err).toEqual(['owner-bootstrap: stopped before committing: nothing was committed.\n'])
    const after = capture()
    expect(report(interrupted(phase({ kind: 'committing', mode: 'set-up', org: ORG })), after.print)).toBe(4)
    expect(after.err).toEqual([
      'owner-bootstrap: stopped while committing: it may or may not have committed. Run the plan to see.\n',
    ])
    expect([...before.err, ...after.err].join('')).not.toContain('connection was lost')
  })
})
