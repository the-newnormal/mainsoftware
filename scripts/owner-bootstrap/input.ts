// The Owner bootstrap script's inputs (scripts/owner-bootstrap.ts; TECH-SPEC T22 items 63 to 71,
// PD-115 to PD-120): its command line, and the three modes' JSON documents, with every check that
// needs no server. Pure: it reads nothing and prints nothing. A problem names an argument or a
// field and what is wrong with it, never the value given, so nothing a person typed reaches a
// terminal, a log or an error (R1, PD-119). The founder's name and number, the org's name, the
// reason and the providers' facts are all checked here, before any SQL runs, so no constraint's
// DETAIL ("Failing row contains …") can ever carry one.
import { parseArgs } from 'node:util'
import {
  aiCopyIn,
  flatText,
  NOTICE_FACT_FIELDS,
  NOTICE_FREE_TEXT_FIELDS,
  NOTICE_TRANSFER_FACTS,
  type NoticeTransferFact,
  normalisePhone,
  type OrgNameProblem,
  orgNameProblems,
  type TransferFacts,
  TransferFactsBody,
  type TransferProblem,
  transferProblems,
} from '@hearth/shared'
import { z } from 'zod'

// --- The command line (PD-115) ------------------------------------------------------------------

export const MODES = ['set-up', 'recover', 'correct-number'] as const
export type Mode = (typeof MODES)[number]
const isMode = (value: string): value is Mode => (MODES as readonly string[]).includes(value)

// A database name as the client is given it, the same shape as a role name (migrations.ts).
export const DATABASE_NAME = /^[a-z_][a-z0-9_]{0,62}$/

export interface Arguments {
  mode: Mode
  database: string
  commit: boolean
}

// What is wrong with the command line:
//   mode_missing        no mode given
//   mode_unknown        a mode other than set-up, recover or correct-number
//   extra_argument      a second positional argument
//   option_unknown      an option other than --database and --commit
//   option_value        --database without a name, or --commit with a value
//   option_repeated     an option given twice
//   database_missing    no --database
//   database_malformed  --database that isn't a database name
export const ARGUMENT_PROBLEMS = [
  'mode_missing',
  'mode_unknown',
  'extra_argument',
  'option_unknown',
  'option_value',
  'option_repeated',
  'database_missing',
  'database_malformed',
] as const
export type ArgumentProblem = (typeof ARGUMENT_PROBLEMS)[number]

// The mode, --database <name> and --commit, and nothing else. parseArgs's own errors quote what was
// typed, so only their kind is kept.
export function parseArguments(
  args: readonly string[],
): { ok: true; value: Arguments } | { ok: false; problem: ArgumentProblem } {
  let parsed: ReturnType<typeof parseCommandLine>
  try {
    parsed = parseCommandLine(args)
  } catch (error) {
    const code = (error as { code?: unknown }).code
    return { ok: false, problem: code === 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE' ? 'option_value' : 'option_unknown' }
  }
  const named = parsed.tokens.filter(token => token.kind === 'option').map(token => token.name)
  if (new Set(named).size !== named.length) return { ok: false, problem: 'option_repeated' }
  const [mode, ...extra] = parsed.positionals
  if (mode === undefined) return { ok: false, problem: 'mode_missing' }
  if (extra.length > 0) return { ok: false, problem: 'extra_argument' }
  if (!isMode(mode)) return { ok: false, problem: 'mode_unknown' }
  const { database, commit } = parsed.values
  if (database === undefined) return { ok: false, problem: 'database_missing' }
  if (!DATABASE_NAME.test(database)) return { ok: false, problem: 'database_malformed' }
  return { ok: true, value: { mode, database, commit: commit === true } }
}

function parseCommandLine(args: readonly string[]) {
  return parseArgs({
    args: [...args],
    options: { commit: { type: 'boolean' }, database: { type: 'string' } },
    strict: true,
    allowPositionals: true,
    tokens: true,
  })
}

// --- The environments (PD-121) ------------------------------------------------------------------

// Where the script runs, as the server reads DEPLOY_ENV (T14 item 18). Every document names one
// too, which must be DEPLOY_ENV, so a document written for one environment never runs against
// another.
export const DEPLOY_ENVS = ['local', 'test', 'nonprod', 'prod'] as const
export type DeployEnv = (typeof DEPLOY_ENVS)[number]
export const isDeployEnv = (value: unknown): value is DeployEnv =>
  typeof value === 'string' && (DEPLOY_ENVS as readonly string[]).includes(value)
// The two that hold people's data. Everything else is this machine.
export const isRemote = (env: DeployEnv): boolean => env === 'nonprod' || env === 'prod'

// The zone every new org starts in (0001's default), so the day the facts are checked against
// before connecting. The clearance trigger checks them again in the org's own zone (PD-117).
export const ORG_ZONE = 'Asia/Singapore'

// The day (YYYY-MM-DD) an instant falls on in a time zone.
export function dayIn(zone: string, at: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(at)
    .reduce<Record<string, string>>((all, part) => Object.assign(all, { [part.type]: part.value }), {})
  return `${parts.year}-${parts.month}-${parts.day}`
}

// --- The fiction rule (PD-120) ------------------------------------------------------------------

// Ofcom's range reserved for drama, +44 7700 900000 to +44 7700 900999, in E.164. The prefix is
// written in parts, so that no partial number appears in the source (BSG-01).
const FICTION_PREFIX = `+44${7700}${900}`
const isFiction = (e164: string): boolean =>
  e164.startsWith(FICTION_PREFIX) && /^\d{3}$/.test(e164.slice(FICTION_PREFIX.length))

// The seed's twelve numbers (db/seed/tembusu.sql), refused under nonprod and prod; built from the
// first, for the same reason.
export const SEED_NUMBERS: ReadonlySet<string> = new Set(Array.from({ length: 12 }, (_, i) => `+65${8000_0001 + i}`))

// Under local and test only the drama range is accepted, so a real number never reaches this
// machine's database or its logs; under nonprod and prod that range and the seed's numbers are
// refused, so a test value never becomes the founder.
export type FictionProblem = 'fiction_required' | 'fiction_refused'
export function fictionProblem(e164: string, env: DeployEnv): FictionProblem | undefined {
  if (!isRemote(env)) return isFiction(e164) ? undefined : 'fiction_required'
  return isFiction(e164) || SEED_NUMBERS.has(e164) ? 'fiction_refused' : undefined
}

// --- What a document can get wrong (2.3) --------------------------------------------------------

// A zod issue's kind, from a closed map of its codes, so zod's own message (which can quote the
// input) is never used.
export const SHAPE_KINDS = [
  'missing_or_wrong_type',
  'too_short',
  'too_long',
  'bad_format',
  'not_allowed',
  'unknown_key',
  'invalid',
] as const
export type ShapeKind = (typeof SHAPE_KINDS)[number]

// The founder's name: nothing after trimming, more than 200 characters (0002's people check), or a
// control, format or lone surrogate character, or a run of whitespace inside.
export const NAME_PROBLEMS = ['empty', 'too_long', 'not_plain'] as const
export type NameProblem = (typeof NAME_PROBLEMS)[number]

// A number sign-in's parser can't read, or one the fiction rule refuses.
export const NUMBER_PROBLEMS = ['not_a_number', 'fiction_required', 'fiction_refused'] as const
export type NumberProblem = (typeof NUMBER_PROBLEMS)[number]

// The reason, trimmed: nothing left, or more than 2,000 characters (0011's function, 0004's
// audit_events check).
export const REASON_PROBLEMS = ['empty', 'too_long'] as const
export type ReasonProblem = (typeof REASON_PROBLEMS)[number]

export const SET_UP_PROVIDERS = ['twilio', 'aws'] as const
export type SetUpProvider = (typeof SET_UP_PROVIDERS)[number]

// The stated text fields the notice prints (NOTICE_FREE_TEXT_FIELDS among NOTICE_TRANSFER_FACTS),
// by their field names in the document, which publishing holds to AI_COPY (free_text_ai_copy).
export const PRINTED_FACT_FIELDS = NOTICE_TRANSFER_FACTS.filter(fact =>
  (NOTICE_FREE_TEXT_FIELDS as readonly string[]).includes(fact),
).map(fact => NOTICE_FACT_FIELDS[fact])
export type PrintedFactField = (typeof PRINTED_FACT_FIELDS)[number]

export type InputProblem =
  | { code: 'input_missing' }
  // Only a first line arrived: a trimmed text of { or [ alone.
  | { code: 'first_line' }
  | { code: 'not_json' }
  | { code: 'written_for'; written: DeployEnv; deployEnv: DeployEnv }
  // A zod issue: the path (the schema's own keys and array indexes) and its kind; an unknown key's
  // name only when it is word-shaped.
  | { code: 'shape'; path: string; kind: ShapeKind; key?: string }
  | { code: 'organisation'; problem: OrgNameProblem }
  | { code: 'name'; problem: NameProblem }
  | { code: 'number'; field: 'founder.number' | 'number'; problem: NumberProblem }
  | { code: 'reason'; problem: ReasonProblem }
  | { code: 'transfer'; provider: SetUpProvider; problems: TransferProblem[] }
  | { code: 'fact_ai_copy'; provider: SetUpProvider; field: PrintedFactField }
  | { code: 'from_entry'; index: number; problem: 'not_stated' | 'repeated' }

// --- The documents (2.2) ------------------------------------------------------------------------

const Environment = z.enum(DEPLOY_ENVS)

const SetUpShape = z.strictObject({
  environment: Environment,
  organisation: z.string(),
  founder: z.strictObject({ fullName: z.string(), number: z.string() }),
  reason: z.string(),
  // The api's own reading of a provider's facts (registers.ts), so the script and the DPO's page
  // read them alike: text trimmed and blank as null, countries upper-cased, sorted and once each.
  twilio: TransferFactsBody,
  aws: TransferFactsBody,
})

// A person id in either case; it is lower-cased before use.
const ANY_CASE_UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
// A day, YYYY-MM-DD, from year 1 (Postgres's date has no year 0).
const Day = z.iso.date().refine(day => day >= '0001-01-01')

const RecoverShape = z.strictObject({
  environment: Environment,
  dpo: z.string().regex(ANY_CASE_UUID),
  reviewOn: Day,
  reason: z.string(),
  fromEntry: z.array(z.string()).max(NOTICE_TRANSFER_FACTS.length).optional(),
})

const CorrectNumberShape = z.strictObject({
  environment: Environment,
  number: z.string(),
  reason: z.string(),
})

export interface SetUpDocument {
  mode: 'set-up'
  environment: DeployEnv
  // Trimmed, and every check passed: the name stored is the name the notice prints.
  organisation: string
  founder: { fullName: string; e164: string }
  reason: string
  twilio: TransferFacts
  aws: TransferFacts
}

export interface RecoverDocument {
  mode: 'recover'
  environment: DeployEnv
  // Lower case.
  dpo: string
  reviewOn: string
  reason: string
  // The stated facts the DPO decided changed, as NOTICE_TRANSFER_FACTS keys, each once.
  fromEntry: NoticeTransferFact[]
}

export interface CorrectNumberDocument {
  mode: 'correct-number'
  environment: DeployEnv
  e164: string
  reason: string
}

export type Document = SetUpDocument | RecoverDocument | CorrectNumberDocument
export type Parsed<T> = { ok: true; value: T } | { ok: false; problems: InputProblem[] }

const codePoints = (text: string): number => [...text].length

// An unknown key is named only when it is shaped like a word, so a pasted value used as a key is
// never printed.
const WORD_KEY = /^[A-Za-z_]{1,40}$/

const KINDS: Record<string, ShapeKind> = {
  invalid_type: 'missing_or_wrong_type',
  too_small: 'too_short',
  too_big: 'too_long',
  invalid_format: 'bad_format',
  invalid_value: 'not_allowed',
  unrecognized_keys: 'unknown_key',
}

// Each issue as its path and kind, never zod's message.
function shapeProblems(error: z.ZodError): InputProblem[] {
  const problems: InputProblem[] = []
  for (const issue of error.issues) {
    const path = issue.path.map(String).join('.')
    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys) {
        problems.push(
          WORD_KEY.test(key)
            ? { code: 'shape', path, kind: 'unknown_key', key }
            : { code: 'shape', path, kind: 'unknown_key' },
        )
      }
    } else {
      problems.push({ code: 'shape', path, kind: KINDS[issue.code] ?? 'invalid' })
    }
  }
  return problems
}

// The text of OWNER_BOOTSTRAP_INPUT as JSON. V8's SyntaxError quotes the text, so only "not valid
// JSON" is kept. A document whose environment is another known one is refused for that alone, the
// likeliest mistake: a secret loaded for the wrong environment.
export function readDocument(text: string | undefined, deployEnv: DeployEnv): Parsed<unknown> {
  if (text === undefined || text.trim() === '') return { ok: false, problems: [{ code: 'input_missing' }] }
  const trimmed = text.trim()
  if (trimmed === '{' || trimmed === '[') return { ok: false, problems: [{ code: 'first_line' }] }
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return { ok: false, problems: [{ code: 'not_json' }] }
  }
  const written =
    typeof json === 'object' && json !== null ? (json as { environment?: unknown }).environment : undefined
  if (isDeployEnv(written) && written !== deployEnv) {
    return { ok: false, problems: [{ code: 'written_for', written, deployEnv }] }
  }
  return { ok: true, value: json }
}

// The founder's name, trimmed (JavaScript's trim(), whose set covers btrim()'s): 1 to 200
// characters as Postgres counts them, no control, format or lone surrogate character, and no run
// of whitespace inside. A name that fails is refused, never altered, and is never held to AI_COPY
// (PD-102: a person may be called Ask).
export function nameProblem(name: string): NameProblem | undefined {
  const trimmed = name.trim()
  if (trimmed === '') return 'empty'
  if (codePoints(trimmed) > 200) return 'too_long'
  if (/[\p{Cc}\p{Cf}\p{Cs}]|\s{2}/u.test(trimmed)) return 'not_plain'
  return undefined
}

// The reason, trimmed as 0011's clearance function trims it.
export function reasonProblem(reason: string): ReasonProblem | undefined {
  const trimmed = reason.trim()
  if (trimmed === '') return 'empty'
  return codePoints(trimmed) > 2000 ? 'too_long' : undefined
}

// A number as sign-in's parser reads it (normalisePhone()), so the stored E.164 is exactly what
// person_by_phone() will be asked for, then held to the fiction rule.
function readNumber(
  text: string,
  field: 'founder.number' | 'number',
  env: DeployEnv,
): { e164: string } | { problem: InputProblem } {
  const e164 = normalisePhone(text)
  if (e164 === undefined) return { problem: { code: 'number', field, problem: 'not_a_number' } }
  const fiction = fictionProblem(e164, env)
  return fiction === undefined ? { e164 } : { problem: { code: 'number', field, problem: fiction } }
}

// The set-up document: the org's name (orgNameProblems(), which C0.16 reuses), the founder's name
// and number, the reason, and each provider's facts, complete on today's date in the org's zone
// (transferProblems()) and with no stated text the notice prints that AI_COPY matches, so v0's
// publish is never refused for text the set-up wrote.
export function parseSetUp(json: unknown, env: DeployEnv, today: string): Parsed<SetUpDocument> {
  const shaped = SetUpShape.safeParse(json)
  if (!shaped.success) return { ok: false, problems: shapeProblems(shaped.error) }
  const doc = shaped.data
  const problems: InputProblem[] = []
  for (const problem of orgNameProblems(doc.organisation)) problems.push({ code: 'organisation', problem })
  const name = nameProblem(doc.founder.fullName)
  if (name !== undefined) problems.push({ code: 'name', problem: name })
  const number = readNumber(doc.founder.number, 'founder.number', env)
  if ('problem' in number) problems.push(number.problem)
  const reason = reasonProblem(doc.reason)
  if (reason !== undefined) problems.push({ code: 'reason', problem: reason })
  for (const provider of SET_UP_PROVIDERS) {
    const facts = doc[provider]
    const missing = transferProblems({ provider, ...facts }, today)
    if (missing.length > 0) problems.push({ code: 'transfer', provider, problems: missing })
    for (const field of PRINTED_FACT_FIELDS) {
      const text = facts[field]
      if (typeof text === 'string' && aiCopyIn(flatText(text)) !== undefined) {
        problems.push({ code: 'fact_ai_copy', provider, field })
      }
    }
  }
  if (problems.length > 0 || 'problem' in number) return { ok: false, problems }
  return {
    ok: true,
    value: {
      mode: 'set-up',
      environment: doc.environment,
      organisation: doc.organisation.trim(),
      founder: { fullName: doc.founder.fullName.trim(), e164: number.e164 },
      reason: doc.reason.trim(),
      twilio: doc.twilio,
      aws: doc.aws,
    },
  }
}

// A fact named in fromEntry, in either spelling: a NOTICE_TRANSFER_FACTS key, or its field name in
// the set-up document and on the DPO's page (NOTICE_FACT_FIELDS).
export function statedFact(name: string): NoticeTransferFact | undefined {
  return NOTICE_TRANSFER_FACTS.find(fact => fact === name || NOTICE_FACT_FIELDS[fact] === name)
}

// The recovery document: the named DPO's id, a review date (the function decides how far ahead),
// the reason, and the stated facts whose values come from the DPO's record. Item 44 provides only
// for a stated fact the DPO decided changed, so any other is refused; a fact named twice, in one
// spelling or both, is refused too. Nobody types a fact's value.
export function parseRecover(json: unknown): Parsed<RecoverDocument> {
  const shaped = RecoverShape.safeParse(json)
  if (!shaped.success) return { ok: false, problems: shapeProblems(shaped.error) }
  const doc = shaped.data
  const problems: InputProblem[] = []
  const reason = reasonProblem(doc.reason)
  if (reason !== undefined) problems.push({ code: 'reason', problem: reason })
  const fromEntry: NoticeTransferFact[] = []
  for (const [index, name] of (doc.fromEntry ?? []).entries()) {
    const fact = statedFact(name)
    if (fact === undefined) problems.push({ code: 'from_entry', index, problem: 'not_stated' })
    else if (fromEntry.includes(fact)) problems.push({ code: 'from_entry', index, problem: 'repeated' })
    else fromEntry.push(fact)
  }
  if (problems.length > 0) return { ok: false, problems }
  return {
    ok: true,
    value: {
      mode: 'recover',
      environment: doc.environment,
      dpo: doc.dpo.toLowerCase(),
      reviewOn: doc.reviewOn,
      reason: doc.reason.trim(),
      fromEntry,
    },
  }
}

// The correction document: the founder's right number, through the same parser and fiction rule as
// the set-up's, and the reason.
export function parseCorrectNumber(json: unknown, env: DeployEnv): Parsed<CorrectNumberDocument> {
  const shaped = CorrectNumberShape.safeParse(json)
  if (!shaped.success) return { ok: false, problems: shapeProblems(shaped.error) }
  const doc = shaped.data
  const problems: InputProblem[] = []
  const number = readNumber(doc.number, 'number', env)
  if ('problem' in number) problems.push(number.problem)
  const reason = reasonProblem(doc.reason)
  if (reason !== undefined) problems.push({ code: 'reason', problem: reason })
  if (problems.length > 0 || 'problem' in number) return { ok: false, problems }
  return {
    ok: true,
    value: { mode: 'correct-number', environment: doc.environment, e164: number.e164, reason: doc.reason.trim() },
  }
}

// OWNER_BOOTSTRAP_INPUT as the mode's document. A strict schema per mode, so an unknown key (a PIN
// included: no document has one) and a document meant for another mode are refused.
export function parseDocument(mode: Mode, text: string | undefined, env: DeployEnv, today: string): Parsed<Document> {
  const json = readDocument(text, env)
  if (!json.ok) return json
  switch (mode) {
    case 'set-up':
      return parseSetUp(json.value, env, today)
    case 'recover':
      return parseRecover(json.value)
    case 'correct-number':
      return parseCorrectNumber(json.value, env)
  }
}
