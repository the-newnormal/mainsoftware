// The Owner bootstrap script's inputs (input.ts; TECH-SPEC T22 items 63 to 71): BSU-02 to BSU-05.
// Every value is fictional: names such as Wren Example, numbers only from Ofcom's drama range, and,
// where a test needs a number the fiction rule must accept in production, one under the unassigned
// country code +999, built at run time so no number shape outside the drama range appears here
// (BSG-01). The seed's numbers are read from the seed itself.
import { readFileSync } from 'node:fs'
import { normalisePhone, TRANSFER_PROBLEMS, type TransferProblem } from '@hearth/shared'
import { describe, expect, it } from 'vitest'
import {
  DEPLOY_ENVS,
  dayIn,
  fictionProblem,
  type InputProblem,
  MODES,
  nameProblem,
  parseArguments,
  parseCorrectNumber,
  parseDocument,
  parseRecover,
  parseSetUp,
  readDocument,
  SEED_NUMBERS,
} from './input.ts'
import { refusalText } from './output.ts'

const TODAY = '2026-10-27'
// A number the fiction rule accepts under nonprod and prod: no country has +999, so it is no live
// number anywhere.
const UNASSIGNED = '+999'.concat('0000', '0001')
const FICTION = '+44 7700 900123'

const FACTS = {
  services: 'Fictional test service',
  dataTypes: 'A fictional mobile number',
  processingCountries: ['us'],
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

function setUpDoc(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    environment: 'test',
    organisation: 'Kestrel Test Freight',
    founder: { fullName: 'Wren Example', number: FICTION },
    reason: 'Check set-up',
    twilio: FACTS,
    aws: FACTS,
    ...overrides,
  }
}

const RECOVER = {
  environment: 'test',
  dpo: '0e8f4c1a-6b2d-4c3e-9f1a-2b3c4d5e6f7a',
  reviewOn: '2026-12-01',
  reason: 'Check re-clear',
}

// The problems a document gets, or [] when it parses.
function problemsOf(result: { ok: true } | { ok: false; problems: InputProblem[] }): InputProblem[] {
  return result.ok ? [] : result.problems
}
// The printed text of a refusal of these problems, as the script prints it.
const printed = (problems: InputProblem[]): string => refusalText({ kind: 'input', problems }).join('\n')

describe('BSU-02 (PD-116, PD-119; T22 item 37): the set-up document and the command line', () => {
  it('parses a complete document, trimming the names and the reason and normalising the number and countries', () => {
    const result = parseSetUp(
      setUpDoc({
        organisation: '  Kestrel Test Freight ',
        founder: { fullName: ' Wren Example ', number: '+44 7700 900123' },
        reason: ' Check set-up ',
        twilio: { ...FACTS, processingCountries: ['us', 'US', 'sg'], services: '  Fictional test service ' },
      }),
      'test',
      TODAY,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.organisation).toBe('Kestrel Test Freight')
    expect(result.value.founder).toEqual({ fullName: 'Wren Example', e164: normalisePhone('+44 7700 900123') })
    expect(result.value.reason).toBe('Check set-up')
    expect(result.value.twilio.processingCountries).toEqual(['SG', 'US'])
    expect(result.value.twilio.services).toBe('Fictional test service')
  })

  it('refuses unknown keys, a pin key and a recovery document, naming a key only when it is word-shaped', () => {
    const colour = problemsOf(parseSetUp(setUpDoc({ colour: 'blue' }), 'test', TODAY))
    expect(colour).toEqual([{ code: 'shape', path: '', kind: 'unknown_key', key: 'colour' }])
    const pin = problemsOf(parseSetUp(setUpDoc({ pin: '1234' }), 'test', TODAY))
    expect(pin).toEqual([{ code: 'shape', path: '', kind: 'unknown_key', key: 'pin' }])
    const founderPin = problemsOf(
      parseSetUp(setUpDoc({ founder: { fullName: 'Wren Example', number: FICTION, pin: '1234' } }), 'test', TODAY),
    )
    expect(founderPin).toEqual([{ code: 'shape', path: 'founder', kind: 'unknown_key', key: 'pin' }])
    // A pasted value used as a key is never named.
    const pasted = problemsOf(parseSetUp(setUpDoc({ [FICTION]: 'x' }), 'test', TODAY))
    expect(pasted).toEqual([{ code: 'shape', path: '', kind: 'unknown_key' }])
    expect(printed(pasted)).not.toContain('7700')
    const recovery = problemsOf(parseSetUp(RECOVER, 'test', TODAY))
    expect(recovery.length).toBeGreaterThan(0)
    expect(recovery).toContainEqual({ code: 'shape', path: '', kind: 'unknown_key', key: 'dpo' })
  })

  it("holds the founder's name to 0002's check and plain text, never to AI_COPY (PD-102)", () => {
    expect(nameProblem('Ask')).toBeUndefined()
    expect(nameProblem('  Wren Example  ')).toBeUndefined()
    expect(nameProblem('')).toBe('empty')
    expect(nameProblem('   ')).toBe('empty')
    expect(nameProblem('Wren  Example')).toBe('not_plain')
    expect(nameProblem('Wren\u200bExample')).toBe('not_plain')
    expect(nameProblem('Wren\tExample')).toBe('not_plain')
    expect(nameProblem('Wren\u202eExample')).toBe('not_plain')
    expect(nameProblem('\u{1d49c}'.repeat(200))).toBeUndefined()
    expect(nameProblem('\u{1d49c}'.repeat(201))).toBe('too_long')
    expect(problemsOf(parseSetUp(setUpDoc({ founder: { fullName: 'Ask', number: FICTION } }), 'test', TODAY))).toEqual(
      [],
    )
  })

  it("reads the number as sign-in's parser does, on a table of forms", () => {
    const forms = [
      '+44 7700 900123',
      '0044 7700 900123',
      '+44\u00a07700\u00a0900123',
      '+44-7700-900-123',
      '(+44) 7700 900123',
    ]
    for (const number of forms) {
      const result = parseSetUp(setUpDoc({ founder: { fullName: 'Wren Example', number } }), 'test', TODAY)
      expect(result.ok, number).toBe(true)
      if (result.ok) expect(result.value.founder.e164).toBe(normalisePhone(number))
    }
    // Sixteen digits, built from in-range parts; a leading 0 with no country code.
    for (const number of ['+44 7700 900123'.concat('4567'), '07700 900123', 'not a number']) {
      const problems = problemsOf(
        parseSetUp(setUpDoc({ founder: { fullName: 'Wren Example', number } }), 'test', TODAY),
      )
      expect(problems).toEqual([{ code: 'number', field: 'founder.number', problem: 'not_a_number' }])
    }
  })

  it('names each TRANSFER_PROBLEMS code a provider can have, with its provider', () => {
    const patches: Partial<Record<TransferProblem, Record<string, unknown>>> = {
      services: { services: null },
      data_types: { dataTypes: '   ' },
      processing_countries: { processingCountries: [] },
      storage_countries: { storageCountries: [] },
      countries_confirmed: { countriesConfirmed: null },
      safeguard: { safeguard: null },
      safeguard_reference: { safeguardReference: null },
      certificate_unverified: { safeguard: 'certification', certificateVerifiedOn: null },
      certificate_future: { certificateVerifiedOn: '2026-12-01' },
      dpa_terms: { dpaTermsConfirmed: false },
      training: { training: null },
      zero_retention: { zeroRetention: 'pending' },
      provider_retention: { providerRetention: null },
      retention_confirmed: { retentionConfirmed: null },
      onward_recipients: { onwardRecipients: null },
      review_on: { reviewOn: null },
      review_due: { reviewOn: TODAY },
    }
    // Every code but the two no set-up provider can have.
    expect(Object.keys(patches).sort()).toEqual(
      TRANSFER_PROBLEMS.filter(code => code !== 'unknown_provider' && code !== 'ai_provider').sort(),
    )
    for (const [code, patch] of Object.entries(patches)) {
      const problems = problemsOf(parseSetUp(setUpDoc({ aws: { ...FACTS, ...patch } }), 'test', TODAY))
      expect(problems, code).toEqual([{ code: 'transfer', provider: 'aws', problems: [code] }])
      expect(printed(problems)).toContain(`aws: `)
      expect(printed(problems)).toContain(code)
    }
  })

  it('refuses a stated text field AI_COPY matches, and allows one the notice never prints (PD-62)', () => {
    const problems = problemsOf(
      parseSetUp(
        setUpDoc({ twilio: { ...FACTS, providerRetention: 'Ask us', services: 'AI service' } }),
        'test',
        TODAY,
      ),
    )
    expect(problems).toEqual([
      { code: 'fact_ai_copy', provider: 'twilio', field: 'services' },
      { code: 'fact_ai_copy', provider: 'twilio', field: 'providerRetention' },
    ])
    expect(printed(problems)).not.toContain('Ask us')
    const unprinted = parseSetUp(
      setUpDoc({ twilio: { ...FACTS, countriesConfirmed: 'Ask the agent', safeguardReference: 'AI addendum' } }),
      'test',
      TODAY,
    )
    expect(unprinted.ok).toBe(true)
  })

  it('refuses an org name orgNameProblems() refuses, naming the field and never the word (PD-118)', () => {
    const problems = problemsOf(parseSetUp(setUpDoc({ organisation: '\uff21\uff49 Freight' }), 'test', TODAY))
    expect(problems).toEqual([])
    const ai = problemsOf(parseSetUp(setUpDoc({ organisation: '\uff21\uff29 Freight' }), 'test', TODAY))
    expect(ai).toEqual([{ code: 'organisation', problem: 'ai_copy' }])
    expect(printed(ai)).toContain('organisation:')
    expect(printed(ai)).not.toContain('Freight')
    expect(problemsOf(parseSetUp(setUpDoc({ organisation: 'Kestrel  Freight' }), 'test', TODAY))).toEqual([
      { code: 'organisation', problem: 'not_plain' },
    ])
    expect(problemsOf(parseSetUp(setUpDoc({ organisation: '   ' }), 'test', TODAY))).toEqual([
      { code: 'organisation', problem: 'empty' },
    ])
  })

  it('holds the reason to 1 to 2,000 characters, trimmed as the function trims it', () => {
    for (const reason of ['', '   ', 'x'.repeat(2001)]) {
      const problems = problemsOf(parseSetUp(setUpDoc({ reason }), 'test', TODAY))
      expect(problems, String(reason.length)).toEqual([
        { code: 'reason', problem: reason.trim() === '' ? 'empty' : 'too_long' },
      ])
    }
    expect(parseSetUp(setUpDoc({ reason: `  ${'x'.repeat(2000)}  ` }), 'test', TODAY).ok).toBe(true)
  })

  it('prints no planted value in any refusal', () => {
    const canary = 'Wren Canary Example'
    const problems = problemsOf(
      parseSetUp(
        setUpDoc({
          organisation: `${canary}\u200b`,
          founder: { fullName: `${canary}  x`, number: FICTION.replace('900', '901') },
          reason: `${canary}`.repeat(200),
          twilio: { ...FACTS, services: `Ask ${canary}` },
        }),
        'test',
        TODAY,
      ),
    )
    expect(problems.length).toBeGreaterThan(3)
    const text = printed(problems)
    expect(text).not.toContain('Canary')
    expect(text).not.toContain('901123')
  })

  it('parses the command line: a mode, --database and --commit, and nothing else', () => {
    expect(parseArguments(['set-up', '--database', 'hearth_check'])).toEqual({
      ok: true,
      value: { mode: 'set-up', database: 'hearth_check', commit: false },
    })
    expect(parseArguments(['recover', '--database=hearth_check', '--commit'])).toEqual({
      ok: true,
      value: { mode: 'recover', database: 'hearth_check', commit: true },
    })
    for (const mode of MODES) expect(parseArguments([mode, '--database', 'x']).ok).toBe(true)
    const refusals: [string[], string][] = [
      [[], 'mode_missing'],
      [['--database', 'x'], 'mode_missing'],
      [['setup', '--database', 'x'], 'mode_unknown'],
      [['set-up', 'again', '--database', 'x'], 'extra_argument'],
      [['set-up', '--database', 'x', '--force'], 'option_unknown'],
      [['set-up', '--database', 'x', '--number', FICTION], 'option_unknown'],
      [['set-up', '--database'], 'option_value'],
      [['set-up', '--database', 'x', '--commit=yes'], 'option_value'],
      [['set-up', '--database', 'x', '--database', 'y'], 'option_repeated'],
      [['set-up'], 'database_missing'],
      [['set-up', '--database', 'Hearth'], 'database_malformed'],
      [['set-up', '--database', 'x; drop'], 'database_malformed'],
      [['set-up', '--database', ''], 'database_malformed'],
    ]
    for (const [args, problem] of refusals) expect(parseArguments(args), args.join(' ')).toEqual({ ok: false, problem })
    expect(refusalText({ kind: 'arguments', problem: 'option_unknown' }).join('')).not.toContain('7700')
  })
})

describe('BSU-03 (PD-120, PD-121): the fiction rule, and the document written for DEPLOY_ENV', () => {
  it('accepts only the drama range under local and test, and refuses it and the seed under nonprod and prod', () => {
    const fiction = normalisePhone(FICTION) ?? ''
    const unassigned = normalisePhone(UNASSIGNED) ?? ''
    expect(unassigned).not.toBe('')
    for (const env of ['local', 'test'] as const) {
      expect(fictionProblem(fiction, env)).toBeUndefined()
      expect(fictionProblem(unassigned, env)).toBe('fiction_required')
      for (const seed of SEED_NUMBERS) expect(fictionProblem(seed, env)).toBe('fiction_required')
    }
    for (const env of ['nonprod', 'prod'] as const) {
      expect(fictionProblem(unassigned, env)).toBeUndefined()
      expect(fictionProblem(fiction, env)).toBe('fiction_refused')
      for (const seed of SEED_NUMBERS) expect(fictionProblem(seed, env)).toBe('fiction_refused')
    }
    // The range's edges, built at run time: 900000 and 900999 are in it, 899999 and 901000 not.
    const at = (last: string) => normalisePhone('+44'.concat(' 7700 ', last)) ?? ''
    expect(fictionProblem(at(String(900_000)), 'test')).toBeUndefined()
    expect(fictionProblem(at(String(900_999)), 'test')).toBeUndefined()
    expect(fictionProblem(at(String(899_999)), 'test')).toBe('fiction_required')
    expect(fictionProblem(at(String(901_000)), 'test')).toBe('fiction_required')
  })

  it("holds SEED_NUMBERS equal to the seed's twelve numbers", () => {
    const seed = readFileSync(new URL('../../db/seed/tembusu.sql', import.meta.url), 'utf8')
    const prefix = /'(\+\d+)' \|\| n,/.exec(seed)?.[1]
    const suffixes = /unnest\(array\[([^\]]+)\]\) as n/.exec(seed)?.[1]?.match(/\d+/g) ?? []
    expect(prefix).toBeDefined()
    expect(suffixes).toHaveLength(12)
    expect([...SEED_NUMBERS].sort()).toEqual(suffixes.map(suffix => `${prefix}${suffix}`).sort())
  })

  it('refuses a fictional number in production and a real-looking one in test, in both number fields', () => {
    const prod = problemsOf(
      parseSetUp(
        setUpDoc({ environment: 'prod', founder: { fullName: 'Wren Example', number: FICTION } }),
        'prod',
        TODAY,
      ),
    )
    expect(prod).toEqual([{ code: 'number', field: 'founder.number', problem: 'fiction_refused' }])
    const test = problemsOf(parseCorrectNumber({ environment: 'test', number: UNASSIGNED, reason: 'Typo' }, 'test'))
    expect(test).toEqual([{ code: 'number', field: 'number', problem: 'fiction_required' }])
    const seed = [...SEED_NUMBERS][0] ?? ''
    expect(problemsOf(parseCorrectNumber({ environment: 'prod', number: seed, reason: 'Typo' }, 'prod'))).toEqual([
      { code: 'number', field: 'number', problem: 'fiction_refused' },
    ])
    expect(parseCorrectNumber({ environment: 'prod', number: UNASSIGNED, reason: 'Typo' }, 'prod').ok).toBe(true)
  })

  it("refuses each mode's document whose environment is missing, unknown or other than DEPLOY_ENV, naming both", () => {
    const documents: Record<(typeof MODES)[number], Record<string, unknown>> = {
      'set-up': setUpDoc(),
      recover: RECOVER,
      'correct-number': { environment: 'test', number: FICTION, reason: 'Typo' },
    }
    for (const mode of MODES) {
      const doc = documents[mode]
      expect(parseDocument(mode, JSON.stringify(doc), 'test', TODAY).ok, mode).toBe(true)
      const { environment: _environment, ...without } = doc
      // zod reads a missing enum as a value outside it.
      expect(problemsOf(parseDocument(mode, JSON.stringify(without), 'test', TODAY))).toContainEqual({
        code: 'shape',
        path: 'environment',
        kind: 'not_allowed',
      })
      expect(
        problemsOf(parseDocument(mode, JSON.stringify({ ...doc, environment: 'staging' }), 'test', TODAY)),
      ).toContainEqual({ code: 'shape', path: 'environment', kind: 'not_allowed' })
      for (const env of DEPLOY_ENVS.filter(env => env !== 'test')) {
        const other = problemsOf(parseDocument(mode, JSON.stringify({ ...doc, environment: env }), 'test', TODAY))
        expect(other).toEqual([{ code: 'written_for', written: env, deployEnv: 'test' }])
        expect(printed(other)).toBe(`OWNER_BOOTSTRAP_INPUT was written for ${env}, not DEPLOY_ENV test`)
      }
    }
  })

  it('reads today in the org zone', () => {
    expect(dayIn('Asia/Singapore', new Date('2026-10-27T16:30:00Z'))).toBe('2026-10-28')
    expect(dayIn('Asia/Singapore', new Date('2026-10-27T15:30:00Z'))).toBe('2026-10-27')
  })
})

describe('BSU-04 (T22 item 44, PD-127, PD-129): the recovery and correction documents', () => {
  it("lower-cases the DPO's id and maps fromEntry's two spellings to the stated facts, each once", () => {
    const result = parseRecover({
      ...RECOVER,
      dpo: RECOVER.dpo.toUpperCase(),
      fromEntry: ['dataTypes', 'provider_retention', 'onwardRecipients', 'processing_countries'],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.dpo).toBe(RECOVER.dpo)
    expect(result.value.fromEntry).toEqual([
      'data_types',
      'provider_retention',
      'onward_recipients',
      'processing_countries',
    ])
    const none = parseRecover(RECOVER)
    expect(none.ok && none.value.fromEntry).toEqual([])
  })

  it('refuses a fact the notice does not state, an unknown name, and a fact named twice in either spelling', () => {
    for (const name of ['countries_confirmed', 'countriesConfirmed', 'safeguard', 'review_on', 'reviewOn', 'colour']) {
      const problems = problemsOf(parseRecover({ ...RECOVER, fromEntry: ['services', name] }))
      expect(problems, name).toEqual([{ code: 'from_entry', index: 1, problem: 'not_stated' }])
      const text = printed(problems)
      expect(text).toContain('data_types (dataTypes)')
      expect(text).toContain('onward_recipients (onwardRecipients)')
      expect(text).not.toContain(name === 'safeguard' ? 'safeguard_' : name)
    }
    expect(problemsOf(parseRecover({ ...RECOVER, fromEntry: ['services', 'services'] }))).toEqual([
      { code: 'from_entry', index: 1, problem: 'repeated' },
    ])
    expect(problemsOf(parseRecover({ ...RECOVER, fromEntry: ['dataTypes', 'data_types'] }))).toEqual([
      { code: 'from_entry', index: 1, problem: 'repeated' },
    ])
  })

  it('refuses a malformed id or day, a fact value, and a document of another mode', () => {
    expect(problemsOf(parseRecover({ ...RECOVER, dpo: 'not-a-uuid' }))).toEqual([
      { code: 'shape', path: 'dpo', kind: 'bad_format' },
    ])
    expect(problemsOf(parseRecover({ ...RECOVER, reviewOn: '2026-13-01' }))).toEqual([
      { code: 'shape', path: 'reviewOn', kind: 'bad_format' },
    ])
    expect(problemsOf(parseRecover({ ...RECOVER, fromEntry: [{ services: 'Typed' }] }))).toEqual([
      { code: 'shape', path: 'fromEntry.0', kind: 'missing_or_wrong_type' },
    ])
    expect(problemsOf(parseRecover({ ...RECOVER, services: 'Typed' }))).toEqual([
      { code: 'shape', path: '', kind: 'unknown_key', key: 'services' },
    ])
    expect(problemsOf(parseRecover({ ...RECOVER, reason: ' ' }))).toEqual([{ code: 'reason', problem: 'empty' }])
    expect(problemsOf(parseRecover(setUpDoc())).length).toBeGreaterThan(0)
  })

  it('parses the correction document and refuses another mode’s', () => {
    const result = parseCorrectNumber(
      { environment: 'test', number: '+44 7700 900124', reason: 'Typo in the set-up' },
      'test',
    )
    expect(result).toEqual({
      ok: true,
      value: {
        mode: 'correct-number',
        environment: 'test',
        e164: normalisePhone('+44 7700 900124'),
        reason: 'Typo in the set-up',
      },
    })
    expect(problemsOf(parseCorrectNumber(RECOVER, 'test'))).toContainEqual({
      code: 'shape',
      path: '',
      kind: 'unknown_key',
      key: 'dpo',
    })
  })
})

describe('BSU-05 (PD-119, R1): parsing errors print no input', () => {
  it('prints only "not valid JSON" for text JSON.parse refuses, whose own message would quote it', () => {
    const canary = 'Wren Canary {"founder"'
    let v8 = ''
    try {
      JSON.parse(canary)
    } catch (error) {
      v8 = (error as Error).message
    }
    expect(v8).toContain('Wren')
    const problems = problemsOf(readDocument(canary, 'test'))
    expect(problems).toEqual([{ code: 'not_json' }])
    expect(printed(problems)).toBe('OWNER_BOOTSTRAP_INPUT is not valid JSON')
  })

  it("prints a zod issue's path and kind, never zod's message", () => {
    const canary = 'canary-key +44 7700 900123'
    const problems = problemsOf(
      parseSetUp(
        setUpDoc({
          organisation: { canary: 'Wren Canary' },
          founder: { fullName: 7, number: ['Wren Canary'] },
          [canary]: 1,
        }),
        'test',
        TODAY,
      ),
    )
    const text = printed(problems)
    expect(text).toContain('organisation: missing, or not the expected type')
    expect(text).toContain('founder.fullName: missing, or not the expected type')
    expect(text).toContain('the document: an unknown key')
    expect(text).not.toContain('Canary')
    expect(text).not.toContain('canary')
    expect(text).not.toContain('7700')
    expect(text).not.toMatch(/Invalid|Unrecognized|expected string/)
  })

  it('reads a lone { or [ as a truncated paste, never as "not valid JSON"', () => {
    for (const text of ['{', '[', '  {  ', '\n[\n']) {
      const problems = problemsOf(readDocument(text, 'test'))
      expect(problems, JSON.stringify(text)).toEqual([{ code: 'first_line' }])
      expect(printed(problems)).toContain("only the first line arrived: load it with the runbook's command")
    }
    for (const text of [undefined, '', '  \n']) {
      expect(problemsOf(readDocument(text, 'test'))).toEqual([{ code: 'input_missing' }])
    }
  })

  it('parses every environment the same way', () => {
    for (const env of DEPLOY_ENVS) {
      expect(readDocument(JSON.stringify({ environment: env }), env).ok).toBe(true)
    }
  })
})
