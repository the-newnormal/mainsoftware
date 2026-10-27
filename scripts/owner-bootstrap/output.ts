// Everything the Owner bootstrap script prints, and its exit statuses (TECH-SPEC T22 items 63 to 71;
// PD-131, PD-132). The only file that writes to stdout or stderr (BSG-03). print() takes only a
// Line, the closed union below, whose every field a zod schema checks before anything prints: ids,
// codes, days, instants, counts, setting and migration names, the masked number, the org's name
// and, on one line, the founder's name. So the founder's name appears only in a set-up plan whose
// stdout is a terminal, the number only as maskNumber() shows it and only in a plan, and never the
// reason, a fact's value, a host, a user, a password or an error's detail.
//
// outcomeOf() is the sanitiser: it turns anything thrown into the lines to print and the exit
// status. A DatabaseError is read only for its code, its constraint and, for the codes whose text
// is Hearth's own (a RAISE in a Hearth function or trigger), its message; never its detail, hint,
// where, schema, table, column or routine text, and never util.inspect of any error.
//
// Exit statuses: 0 done, or the plan passed; 1 refused by Hearth's rules, nothing written; 2 the
// inputs or the target are wrong, or connecting failed, nothing written; 3 once connected, a lock
// was busy, a deadlock, or the connection was lost or the run stopped before "committing", nothing
// written; 4 the connection was lost or the run stopped after "committing", so it may or may not
// have committed, and the line says how to find out.
import {
  CLEARED_VIA,
  type ClearedVia,
  NOTICE_TRANSFER_FACTS,
  type NoticeTransferFact,
  ORG_NAME_PROBLEMS,
  orgNameProblems,
  TRANSFER_PROBLEMS,
} from '@hearth/shared'
import { DatabaseError } from 'pg'
import { z } from 'zod'
import {
  ARGUMENT_PROBLEMS,
  type ArgumentProblem,
  DEPLOY_ENVS,
  type DeployEnv,
  type InputProblem,
  MODES,
  type Mode,
  NAME_PROBLEMS,
  NUMBER_PROBLEMS,
  PRINTED_FACT_FIELDS,
  REASON_PROBLEMS,
  SET_UP_PROVIDERS,
  SHAPE_KINDS,
} from './input.ts'
import {
  AGENT_MARKERS,
  ELSEWHERE,
  type EnvironmentProblem,
  LOG_SETTINGS,
  type LogSetting,
  type TargetProblem,
} from './target.ts'

export const EXIT = { done: 0, refused: 1, wrong: 2, retry: 3, unknown: 4 } as const
export type ExitStatus = (typeof EXIT)[keyof typeof EXIT]

// --- The values a line may carry ----------------------------------------------------------------

const Uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const Count = z.int().min(0).max(1_000_000)
const DatabaseName = z.string().regex(/^[a-z_][a-z0-9_]{0,62}$/)
const MigrationName = z.string().regex(/^[0-9A-Za-z_.-]{1,100}$/)
// A Postgres duration setting as current_setting() shows it: 30s, 2s, 5s, 0.
const Bound = z.string().regex(/^\d{1,9}(?:us|ms|s|min|h|d)?$/)
// An IANA time zone's name.
const Zone = z.string().regex(/^[A-Za-z][A-Za-z0-9_+\-/]{0,63}$/)
// maskNumber()'s form: the country code and the last two digits, such as '+65 xxxxxx67'.
const Masked = z.string().regex(/^\+\d{1,3} x{0,13}\d{2}$/)
// The org's name, held to the same rules it was stored under.
const OrgName = z.string().refine(name => name === name.trim() && orgNameProblems(name).length === 0)
const FounderName = z.string().min(1).max(800)
const SqlState = z.string().regex(/^[0-9A-Z]{5}$/)
const NodeCode = z.string().regex(/^[A-Z][A-Z0-9_]{1,59}$/)
const ConstraintName = z.string().regex(/^[a-z_][a-z0-9_$]{0,62}$/)

// The keys of transfer_register_facts() (0009), the only names the changed line takes.
export const TRANSFER_FACT_KEYS = [
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
  'review_on',
] as const
export type TransferFactKey = (typeof TRANSFER_FACT_KEYS)[number]

export const SEND_STATES = ['cleared', 'unstated', 'no_notice', 'not_cleared'] as const
export type SendState = (typeof SEND_STATES)[number]

// What failed before the first statement returned (exit 2), each with its own fixed line.
export const CONNECT_CAUSES = [
  'host_name',
  'nothing_answered',
  'timed_out',
  'untrusted',
  'wrong_name',
  'no_tls',
  'sign_in',
  'no_database',
  'role',
  'read_only',
  'other',
] as const
export type ConnectCause = (typeof CONNECT_CAUSES)[number]

// What the set-up's or the correction's own check before committing found differ (S15, C12).
export const VERIFICATION_FAILURES = [
  'flags',
  'purposes',
  'providers',
  'hearth',
  'number',
  'notice',
  'contact',
  'send_state',
  'old_number',
] as const
export type VerificationFailure = (typeof VERIFICATION_FAILURES)[number]

// --- Refusals -----------------------------------------------------------------------------------

export type Refusal =
  | { kind: 'arguments'; problem: ArgumentProblem }
  | { kind: 'environment'; problems: EnvironmentProblem[] }
  | { kind: 'input'; problems: InputProblem[] }
  | { kind: 'target'; problems: TargetProblem[] }
  | { kind: 'org_exists'; org: string }
  | { kind: 'no_org' }
  | { kind: 'two_orgs' }
  | { kind: 'no_hearth' }
  | { kind: 'verification'; failures: VerificationFailure[] }
  | { kind: 'no_founder' }
  | { kind: 'roster' }
  | { kind: 'not_founder' }
  | { kind: 'signed_in' }
  | { kind: 'published' }
  | { kind: 'no_number' }
  | { kind: 'already' }
  // Postgres refused a statement: its SQLSTATE, the constraint it names, and its message only when
  // that is Hearth's own text.
  | { kind: 'postgres'; sqlstate: string; constraint?: string; message?: string }

// A refusal the steps throw; the transaction is rolled back before it reaches the printer.
export class Refused extends Error {
  readonly refusal: Refusal
  constructor(refusal: Refusal) {
    super(`refused: ${refusal.kind}`)
    this.refusal = refusal
  }
}

// The first statement (S1, R1, C1) failed, so the run never started: its cause is a connect_failed
// line (a read-only server answers BEGIN … READ WRITE with 25006 or 0A000).
export class NotStarted extends Error {
  readonly failure: unknown
  constructor(failure: unknown) {
    super('the first statement failed')
    this.failure = failure
  }
}

const exitOf = (refusal: Refusal): ExitStatus => {
  switch (refusal.kind) {
    case 'arguments':
    case 'environment':
    case 'input':
    case 'target':
      return EXIT.wrong
    case 'postgres':
      return refusal.sqlstate === '55P03' || refusal.sqlstate === '40P01' ? EXIT.retry : EXIT.refused
    default:
      return EXIT.refused
  }
}

// --- Lines --------------------------------------------------------------------------------------

export type CommittingLine =
  | { kind: 'committing'; mode: 'set-up'; org: string }
  | { kind: 'committing'; mode: 'recover'; clearance: string }
  | { kind: 'committing'; mode: 'correct-number' }

export type Line =
  | {
      kind: 'target'
      mode: Mode
      commit: boolean
      database: string
      env: DeployEnv
      inputEnv: DeployEnv
      marker: DeployEnv | 'none' | 'other'
      migrations: number
      newest: string | null
      bounds: { transaction: string; lock: string; idle: string }
    }
  | { kind: 'organisation'; name: string }
  | { kind: 'founder_name'; name: string }
  | { kind: 'number'; masked: string }
  | { kind: 'reviews'; twilio: string; aws: string }
  | {
      kind: 'inputs'
      dpo: string
      reviewOn: string
      daysAhead: number
      zone: string
      fromEntry: NoticeTransferFact[]
      reasonLength: number
    }
  | { kind: 'dpo_sessions'; count: number; lastEnds: Date | null; zone: string }
  | { kind: 'twilio_now'; clearance: string; via: ClearedVia; on: string }
  | { kind: 'twilio_now'; since: string }
  | { kind: 'twilio_now'; never: true }
  | { kind: 'log_warning'; settings: LogSetting[] }
  | { kind: 'facts_source'; clearance: string; version: number | null; fromEntry: NoticeTransferFact[] }
  | { kind: 'changed'; keys: TransferFactKey[] }
  | CommittingLine
  | {
      kind: 'committed'
      mode: 'set-up'
      org: string
      hearth: string
      founder: string
      twilio: { clearance: string; reviewOn: string }
      aws: { clearance: string; reviewOn: string }
    }
  | { kind: 'committed'; mode: 'recover'; clearance: string; reviewOn: string }
  | { kind: 'committed'; mode: 'correct-number' }
  | { kind: 'send_state'; state: SendState; committed: boolean }
  | { kind: 'next' }
  | { kind: 'kept_nothing' }
  | { kind: 'connect_failed'; cause: ConnectCause; code: string | null }
  | { kind: 'refused'; refusal: Refusal }
  | { kind: 'lost'; committing: false }
  | { kind: 'lost'; committing: CommittingLine }
  | { kind: 'interrupted'; committing: boolean }
  | { kind: 'unexpected'; committing: boolean; name: string; code: string | null }

const TargetProblemSchema: z.ZodType<TargetProblem> = z.union([
  z.strictObject({
    code: z.enum([
      'checkout_unreadable',
      'no_ledger',
      'isolation',
      'login_is_owner',
      'login_inherits',
      'login_superuser',
      'login_bypassrls',
      'login_createrole',
      'login_createdb',
      'login_owns',
      'login_not_member',
      'login_grant',
      'login_other_membership',
      'acting_role',
      'server_is_rds',
      'server_not_rds',
      'no_tls',
      'database_mismatch',
      'no_function',
      'no_orgs',
      'orgs_forced',
    ]),
  }),
  z.strictObject({ code: z.literal('marker'), found: z.enum([...DEPLOY_ENVS, 'none', 'other']) }),
  z.strictObject({ code: z.enum(['migration_unknown', 'migration_missing']), name: MigrationName.nullable() }),
  z.strictObject({ code: z.enum(['log_unsafe', 'log_unreadable']), settings: z.array(z.enum(LOG_SETTINGS)).min(1) }),
])

const EnvironmentProblemSchema: z.ZodType<EnvironmentProblem> = z.union([
  z.strictObject({
    code: z.enum([
      'deploy_env_missing',
      'deploy_env_unknown',
      'host_not_loopback',
      'tls_name_local',
      'host_missing',
      'host_socket',
      'sslmode',
      'tls_name_missing',
      'tls_name_with_name',
      'tls_name_malformed',
    ]),
  }),
  z.strictObject({ code: z.literal('elsewhere'), variable: z.enum(ELSEWHERE) }),
  z.strictObject({ code: z.literal('agent_marker'), variable: z.enum(AGENT_MARKERS) }),
])

// A zod path as input.ts renders it: the schema's own keys and array indexes, joined by dots.
const ShapePath = z
  .string()
  .regex(/^(?:[A-Za-z_][A-Za-z0-9_]{0,39}|\d{1,4})(?:\.(?:[A-Za-z_][A-Za-z0-9_]{0,39}|\d{1,4})){0,5}$|^$/)

const InputProblemSchema: z.ZodType<InputProblem> = z.union([
  z.strictObject({ code: z.enum(['input_missing', 'first_line', 'not_json']) }),
  z.strictObject({ code: z.literal('written_for'), written: z.enum(DEPLOY_ENVS), deployEnv: z.enum(DEPLOY_ENVS) }),
  z.strictObject({
    code: z.literal('shape'),
    path: ShapePath,
    kind: z.enum(SHAPE_KINDS),
    key: z
      .string()
      .regex(/^[A-Za-z_]{1,40}$/)
      .optional(),
  }),
  z.strictObject({ code: z.literal('organisation'), problem: z.enum(ORG_NAME_PROBLEMS) }),
  z.strictObject({ code: z.literal('name'), problem: z.enum(NAME_PROBLEMS) }),
  z.strictObject({
    code: z.literal('number'),
    field: z.enum(['founder.number', 'number']),
    problem: z.enum(NUMBER_PROBLEMS),
  }),
  z.strictObject({ code: z.literal('reason'), problem: z.enum(REASON_PROBLEMS) }),
  z.strictObject({
    code: z.literal('transfer'),
    provider: z.enum(SET_UP_PROVIDERS),
    problems: z.array(z.enum(TRANSFER_PROBLEMS)).min(1),
  }),
  z.strictObject({
    code: z.literal('fact_ai_copy'),
    provider: z.enum(SET_UP_PROVIDERS),
    field: z.enum(PRINTED_FACT_FIELDS as [string, ...string[]]),
  }),
  z.strictObject({
    code: z.literal('from_entry'),
    index: z.int().min(0).max(100),
    problem: z.enum(['not_stated', 'repeated']),
  }),
]) as z.ZodType<InputProblem>

const RefusalSchema: z.ZodType<Refusal> = z.union([
  z.strictObject({ kind: z.literal('arguments'), problem: z.enum(ARGUMENT_PROBLEMS) }),
  z.strictObject({ kind: z.literal('environment'), problems: z.array(EnvironmentProblemSchema).min(1) }),
  z.strictObject({ kind: z.literal('input'), problems: z.array(InputProblemSchema).min(1) }),
  z.strictObject({ kind: z.literal('target'), problems: z.array(TargetProblemSchema).min(1) }),
  z.strictObject({ kind: z.literal('org_exists'), org: Uuid }),
  z.strictObject({
    kind: z.enum([
      'no_org',
      'two_orgs',
      'no_hearth',
      'no_founder',
      'roster',
      'not_founder',
      'signed_in',
      'published',
      'no_number',
      'already',
    ]),
  }),
  z.strictObject({ kind: z.literal('verification'), failures: z.array(z.enum(VERIFICATION_FAILURES)).min(1) }),
  z.strictObject({
    kind: z.literal('postgres'),
    sqlstate: SqlState,
    constraint: ConstraintName.optional(),
    // Hearth's own text, one line.
    message: z
      .string()
      .min(1)
      .max(500)
      .regex(/^[^\p{Cc}]*$/u)
      .optional(),
  }),
])

const CommittingSchema = z.union([
  z.strictObject({ kind: z.literal('committing'), mode: z.literal('set-up'), org: Uuid }),
  z.strictObject({ kind: z.literal('committing'), mode: z.literal('recover'), clearance: Uuid }),
  z.strictObject({ kind: z.literal('committing'), mode: z.literal('correct-number') }),
])

const LineSchema: z.ZodType<Line> = z.union([
  z.strictObject({
    kind: z.literal('target'),
    mode: z.enum(MODES),
    commit: z.boolean(),
    database: DatabaseName,
    env: z.enum(DEPLOY_ENVS),
    inputEnv: z.enum(DEPLOY_ENVS),
    marker: z.enum([...DEPLOY_ENVS, 'none', 'other']),
    migrations: Count,
    newest: MigrationName.nullable(),
    bounds: z.strictObject({ transaction: Bound, lock: Bound, idle: Bound }),
  }),
  z.strictObject({ kind: z.literal('organisation'), name: OrgName }),
  z.strictObject({ kind: z.literal('founder_name'), name: FounderName }),
  z.strictObject({ kind: z.literal('number'), masked: Masked }),
  z.strictObject({ kind: z.literal('reviews'), twilio: Day, aws: Day }),
  z.strictObject({
    kind: z.literal('inputs'),
    dpo: Uuid,
    reviewOn: Day,
    daysAhead: z.int().min(-1_000_000).max(1_000_000),
    zone: Zone,
    fromEntry: z.array(z.enum(NOTICE_TRANSFER_FACTS)),
    reasonLength: Count,
  }),
  z.strictObject({ kind: z.literal('dpo_sessions'), count: Count, lastEnds: z.date().nullable(), zone: Zone }),
  z.strictObject({ kind: z.literal('twilio_now'), clearance: Uuid, via: z.enum(CLEARED_VIA), on: Day }),
  z.strictObject({ kind: z.literal('twilio_now'), since: Day }),
  z.strictObject({ kind: z.literal('twilio_now'), never: z.literal(true) }),
  z.strictObject({ kind: z.literal('log_warning'), settings: z.array(z.enum(LOG_SETTINGS)).min(1) }),
  z.strictObject({
    kind: z.literal('facts_source'),
    clearance: Uuid,
    // publish_notice() numbers the first generated version 0 (v0, PD-84)
    version: z.int().min(0).nullable(),
    fromEntry: z.array(z.enum(NOTICE_TRANSFER_FACTS)),
  }),
  z.strictObject({ kind: z.literal('changed'), keys: z.array(z.enum(TRANSFER_FACT_KEYS)) }),
  CommittingSchema,
  z.strictObject({
    kind: z.literal('committed'),
    mode: z.literal('set-up'),
    org: Uuid,
    hearth: Uuid,
    founder: Uuid,
    twilio: z.strictObject({ clearance: Uuid, reviewOn: Day }),
    aws: z.strictObject({ clearance: Uuid, reviewOn: Day }),
  }),
  z.strictObject({ kind: z.literal('committed'), mode: z.literal('recover'), clearance: Uuid, reviewOn: Day }),
  z.strictObject({ kind: z.literal('committed'), mode: z.literal('correct-number') }),
  z.strictObject({ kind: z.literal('send_state'), state: z.enum(SEND_STATES), committed: z.boolean() }),
  z.strictObject({ kind: z.enum(['next', 'kept_nothing']) }),
  z.strictObject({
    kind: z.literal('connect_failed'),
    cause: z.enum(CONNECT_CAUSES),
    code: z.union([SqlState, NodeCode]).nullable(),
  }),
  z.strictObject({ kind: z.literal('refused'), refusal: RefusalSchema }),
  z.strictObject({ kind: z.literal('lost'), committing: z.union([z.literal(false), CommittingSchema]) }),
  z.strictObject({ kind: z.literal('interrupted'), committing: z.boolean() }),
  z.strictObject({
    kind: z.literal('unexpected'),
    committing: z.boolean(),
    // An error class's name, such as TypeError.
    name: z.string().regex(/^[A-Za-z][A-Za-z0-9]{0,59}$/),
    code: z.union([SqlState, NodeCode]).nullable(),
  }),
]) as z.ZodType<Line>

// --- Rendering ----------------------------------------------------------------------------------

const list = (items: readonly string[]): string => items.join(', ')

const ARGUMENT_TEXT: Record<ArgumentProblem, string> = {
  mode_missing: 'give the mode first: set-up, recover or correct-number',
  mode_unknown: 'the mode must be set-up, recover or correct-number',
  extra_argument: 'give one mode and nothing else besides --database <name> and --commit',
  option_unknown: 'the only options are --database <name> and --commit',
  option_value: '--database takes a database name, and --commit takes no value',
  option_repeated: 'give each option once',
  database_missing: '--database <name> is required: the database the script connects to',
  database_malformed: '--database must be a database name (lower-case letters, digits and underscores)',
}

function environmentText(problem: EnvironmentProblem): string {
  switch (problem.code) {
    case 'deploy_env_missing':
      return 'DEPLOY_ENV is required: local, test, nonprod or prod'
    case 'deploy_env_unknown':
      return 'DEPLOY_ENV must be local, test, nonprod or prod'
    case 'host_not_loopback':
      return 'under DEPLOY_ENV local or test, PGHOST must be this machine (127.0.0.1, localhost or ::1)'
    case 'elsewhere':
      return `${problem.variable} is set: unset it, so the client connects only where PGHOST says`
    case 'tls_name_local':
      return 'OWNER_BOOTSTRAP_TLS_NAME is set: it is only for a port forward under nonprod or prod'
    case 'agent_marker':
      return `${problem.variable} is set: the script never runs against nonprod or prod from a coding agent or CI`
    case 'host_missing':
      return 'PGHOST is required under nonprod and prod: the RDS endpoint, or 127.0.0.1 for a port forward'
    case 'host_socket':
      return 'PGHOST is a socket: under nonprod and prod the script connects over TLS to RDS'
    case 'sslmode':
      return 'PGSSLMODE must be unset or verify-full under nonprod and prod: the script verifies TLS itself'
    case 'tls_name_missing':
      return 'PGHOST is an IP address, so OWNER_BOOTSTRAP_TLS_NAME must name the RDS endpoint the certificate names'
    case 'tls_name_with_name':
      return 'OWNER_BOOTSTRAP_TLS_NAME is set but PGHOST is a name: unset it (the certificate is checked against PGHOST)'
    case 'tls_name_malformed':
      return "OWNER_BOOTSTRAP_TLS_NAME must be the RDS endpoint's name, ending .rds.amazonaws.com"
  }
}

const SHAPE_TEXT: Record<(typeof SHAPE_KINDS)[number], string> = {
  missing_or_wrong_type: 'missing, or not the expected type',
  too_short: 'too short',
  too_long: 'too long',
  bad_format: 'not in the expected format',
  not_allowed: 'missing, or not one of the allowed values',
  unknown_key: 'an unknown key',
  invalid: 'not valid',
}

const ORG_NAME_TEXT: Record<(typeof ORG_NAME_PROBLEMS)[number], string> = {
  empty: 'organisation: empty',
  too_long: 'organisation: more than 200 characters',
  not_plain:
    'organisation: holds a control or invisible character, a space other than a plain one, or two spaces together',
  ai_copy: 'organisation: holds wording the app keeps off its screens before its AI stages (AI_COPY)',
}

const NAME_TEXT: Record<(typeof NAME_PROBLEMS)[number], string> = {
  empty: 'founder.fullName: empty',
  too_long: 'founder.fullName: more than 200 characters',
  not_plain: 'founder.fullName: holds a control or invisible character, or more than one space together',
}

const NUMBER_TEXT: Record<(typeof NUMBER_PROBLEMS)[number], string> = {
  not_a_number: 'not a phone number sign-in reads: give + and the country code',
  fiction_required:
    'under DEPLOY_ENV local or test only the fictional range +44 7700 900000 to +44 7700 900999 is accepted',
  fiction_refused: "under DEPLOY_ENV nonprod or prod a fictional or the seed's number is refused",
}

// The accepted spellings of a stated fact, which are no secret.
const STATED_FACTS =
  'services, data_types (dataTypes), processing_countries (processingCountries), storage_countries (storageCountries), training, provider_retention (providerRetention), onward_recipients (onwardRecipients)'

function inputText(problem: InputProblem): string {
  switch (problem.code) {
    case 'input_missing':
      return "OWNER_BOOTSTRAP_INPUT is not set: load it with the runbook's command"
    case 'first_line':
      return "OWNER_BOOTSTRAP_INPUT: only the first line arrived: load it with the runbook's command, which reads every line"
    case 'not_json':
      return 'OWNER_BOOTSTRAP_INPUT is not valid JSON'
    case 'written_for':
      return `OWNER_BOOTSTRAP_INPUT was written for ${problem.written}, not DEPLOY_ENV ${problem.deployEnv}`
    case 'shape': {
      const where = problem.path === '' ? 'the document' : problem.path
      if (problem.kind === 'unknown_key') {
        return problem.key === undefined ? `${where}: an unknown key` : `${where}: an unknown key, ${problem.key}`
      }
      return `${where}: ${SHAPE_TEXT[problem.kind]}`
    }
    case 'organisation':
      return ORG_NAME_TEXT[problem.problem]
    case 'name':
      return NAME_TEXT[problem.problem]
    case 'number':
      return `${problem.field}: ${NUMBER_TEXT[problem.problem]}`
    case 'reason':
      return problem.problem === 'empty'
        ? 'reason: empty: give one sentence, 1 to 2,000 characters'
        : 'reason: more than 2,000 characters'
    case 'transfer':
      return `${problem.provider}: the facts aren't complete for a clearance today: ${list(problem.problems)}`
    case 'fact_ai_copy':
      return `${problem.provider}.${problem.field}: holds wording the app keeps off its screens before its AI stages (AI_COPY), so the first notice couldn't be published`
    case 'from_entry':
      return problem.problem === 'repeated'
        ? `fromEntry.${problem.index}: that fact is named already`
        : `fromEntry.${problem.index}: not a fact the notice states; the stated facts are ${STATED_FACTS}`
  }
}

const MIGRATE_FIRST = "run the deploy's migrate step first, or check out the deployed commit"

function targetText(problem: TargetProblem): string {
  switch (problem.code) {
    case 'checkout_unreadable':
      return "this checkout's db/migrations/ can't be read or holds no migration: run the script from a full checkout"
    case 'no_ledger':
      return `this database has no applied migrations (no kysely_migration table): ${MIGRATE_FIRST}`
    case 'isolation':
      return "the transaction isn't READ COMMITTED"
    case 'login_is_owner':
      return "connect with the bootstrap's own login, not hearth_owner"
    case 'login_inherits':
      return 'the login inherits its roles: it must be NOINHERIT'
    case 'login_superuser':
      return 'the login is a superuser'
    case 'login_bypassrls':
      return 'the login has BYPASSRLS'
    case 'login_createrole':
      return 'the login has CREATEROLE'
    case 'login_createdb':
      return 'the login has CREATEDB'
    case 'login_owns':
      return 'the login owns a table, view or other relation'
    case 'login_not_member':
      return 'the login is not a member of hearth_owner'
    case 'login_grant':
      return "the login's hearth_owner grant must have SET and neither INHERIT nor ADMIN"
    case 'login_other_membership':
      return 'the login holds a role besides hearth_owner (and rds_iam on RDS)'
    case 'acting_role':
      return 'the session is not acting as hearth_owner'
    case 'server_is_rds':
      return 'this is an RDS server, but DEPLOY_ENV says local or test'
    case 'server_not_rds':
      return "this isn't an RDS server, but DEPLOY_ENV says nonprod or prod"
    case 'no_tls':
      return "the connection isn't over TLS"
    case 'database_mismatch':
      return "the database connected to isn't the one --database names"
    case 'marker':
      return problem.found === 'none'
        ? 'this database has no environment marker (C0.12 sets hearth-env:<env> on it)'
        : problem.found === 'other'
          ? "this database's comment isn't a Hearth environment marker"
          : `this database is marked hearth-env:${problem.found}, which isn't DEPLOY_ENV`
    case 'no_function':
      return `this database lacks the bootstrap's clearance function of the expected signature: ${MIGRATE_FIRST}`
    case 'no_orgs':
      return `this database has no orgs table: ${MIGRATE_FIRST}`
    case 'orgs_forced':
      return 'the orgs table forces row level security, so its owner would not see every organisation'
    case 'migration_unknown':
      return `This database has applied ${problem.name ?? 'a migration with an unusual name'}, which this checkout doesn't have: run the script from the commit the database was migrated by.`
    case 'migration_missing':
      return `This database hasn't applied ${problem.name ?? 'a migration with an unusual name'}: ${MIGRATE_FIRST}.`
    case 'log_unsafe':
      return `this database may log statement parameters or a failed row's values (${list(problem.settings)}): C0.12's parameter group sets them`
    case 'log_unreadable':
      return `this login can't read ${list(problem.settings)}, so the script can't tell whether parameters are logged (C0.12 grants pg_read_all_settings)`
  }
}

const VERIFICATION_TEXT: Record<VerificationFailure, string> = {
  flags: 'the feature flags',
  purposes: 'the processing register',
  providers: 'the transfer register',
  hearth: 'the Hearth principal',
  number: "the founder's number",
  notice: 'a notice version',
  contact: "the DPO's contact",
  send_state: "Twilio Verify's send state",
  old_number: 'the old number',
}

// Each refusal as its lines: the script's own fixed messages, or Postgres's SQLSTATE and, for
// Hearth's own text only, its message.
export function refusalText(refusal: Refusal): string[] {
  switch (refusal.kind) {
    case 'arguments':
      return [ARGUMENT_TEXT[refusal.problem]]
    case 'environment':
      return refusal.problems.map(environmentText)
    case 'input':
      return refusal.problems.map(inputText)
    case 'target':
      return [...refusal.problems.map(targetText), 'nothing was written']
    case 'org_exists':
      return [`This database already has organisation ${refusal.org}. The set-up runs once, so nothing was written.`]
    case 'no_org':
      return ['This database has no organisation, so nothing was written.']
    case 'two_orgs':
      return [
        'This database has more than one organisation: stop, and tell the DPO and the Owners. Nothing was written.',
      ]
    case 'no_hearth':
      return [
        "This organisation doesn't have exactly one Hearth principal: stop, and tell the DPO and the Owners. Nothing was written.",
      ]
    case 'verification':
      return [
        `The run's own check before committing found ${list(refusal.failures.map(f => VERIFICATION_TEXT[f]))} not as expected, so nothing was kept.`,
      ]
    case 'no_founder':
      return ["Nobody is on the roster, so there is no founder's number to correct here."]
    case 'roster':
      return ["Someone other than the founder is on the roster, so the set-up's number can't be corrected here."]
    case 'not_founder':
      return [
        "The one person on the roster isn't the founder (Owner and DPO, granted by Hearth), so their number can't be corrected here.",
      ]
    case 'signed_in':
      return [
        "The founder has signed in, so their number can't be corrected here. C0.16's phone change does it (ACC-06).",
      ]
    case 'published':
      return ["The first version of the notice is published, so the set-up's number can't be corrected here."]
    case 'no_number':
      return ['The founder has no current number: stop, and tell the DPO and the Owners. Nothing was written.']
    case 'already':
      return ["The founder's number is already that one. Nothing to correct."]
    case 'postgres':
      if (refusal.sqlstate === '55P03')
        return ['a lock was busy: run it once more. Nothing was written (SQLSTATE 55P03).']
      if (refusal.sqlstate === '40P01') {
        return ['Postgres found a deadlock: run it once more. Nothing was written (SQLSTATE 40P01).']
      }
      if (refusal.message !== undefined)
        return [`${refusal.message} (SQLSTATE ${refusal.sqlstate}). Nothing was written.`]
      return [
        `Postgres refused it (SQLSTATE ${refusal.sqlstate}${refusal.constraint === undefined ? '' : `, constraint ${refusal.constraint}`}). Nothing was written.`,
      ]
  }
}

const CONNECT_TEXT: Record<ConnectCause, string> = {
  host_name: "the database host's name wasn't found",
  nothing_answered: 'nothing answered on that host and port',
  timed_out: 'timed out connecting',
  untrusted: "the server's certificate isn't trusted: set NODE_EXTRA_CA_CERTS to RDS's bundle",
  wrong_name:
    "the certificate doesn't name the host you connected to: use the RDS endpoint's name, or OWNER_BOOTSTRAP_TLS_NAME for a port forward",
  no_tls: "the server doesn't offer TLS",
  sign_in: 'signing in to Postgres failed: check PGUSER and get a fresh IAM token',
  no_database: "that database doesn't exist",
  role: 'this login may not act as hearth_owner',
  read_only: 'this is a read-only server: connect to the writer endpoint',
  other: 'connecting failed',
}

const SEND_STATE_TEXT: Record<SendState, string> = {
  cleared: 'cleared (everyone gets sign-in codes again)',
  unstated:
    'unstated (codes go to the DPO alone until a new version states the change: docs/runbooks/twilio-fact-changed.md)',
  no_notice: 'no_notice (codes go to the DPO alone until the first version is published)',
  not_cleared: 'not_cleared (no sign-in code is sent)',
}

// yyyy-mm-dd hh:mm in a zone.
function clock(at: Date, zone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .formatToParts(at)
    .reduce<Record<string, string>>((all, part) => Object.assign(all, { [part.type]: part.value }), {})
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`
}

const ahead = (days: number): string =>
  days === 0
    ? 'today'
    : days > 0
      ? `${days} ${days === 1 ? 'day' : 'days'} ahead`
      : `${-days} ${days === -1 ? 'day' : 'days'} ago`

const keysOrNone = (keys: readonly string[]): string => (keys.length === 0 ? 'none' : list(keys))

function lostText(committing: CommittingLine): string {
  switch (committing.mode) {
    case 'set-up':
      return `the connection was lost while committing organisation ${committing.org}, so it may or may not have committed. Run the same command again: it never sets up twice, and it names the organisation if this one committed.`
    case 'recover':
      return `the connection was lost while committing the re-clear (clearance ${committing.clearance}), so it may or may not have committed. Run the plan (the same command without --commit): if its "Twilio Verify now" line names clearance ${committing.clearance}, this run committed.`
    case 'correct-number':
      return 'the connection was lost while committing the correction, so it may or may not have committed. Run the plan: "already that one" means it committed.'
  }
}

// The text of a line, and whether it goes to stderr (refusals and warnings) or stdout. terminal says
// how the founder's name prints: whole only when stdout is a terminal.
function render(line: Line, terminal: boolean): { text: string; error: boolean } {
  const out = (text: string) => ({ text, error: false })
  const err = (text: string) => ({ text, error: true })
  switch (line.kind) {
    case 'target':
      return out(
        `${line.mode} (${line.commit ? 'commit' : 'plan'}) on database ${line.database}, DEPLOY_ENV ${line.env}, input for ${line.inputEnv}, marker ${line.marker === 'none' ? 'none' : line.marker === 'other' ? '(not a Hearth marker)' : `hearth-env:${line.marker}`}, ${line.migrations} migrations applied, the newest ${line.newest ?? 'none'}; bounds: transaction ${line.bounds.transaction}, lock ${line.bounds.lock}, idle ${line.bounds.idle}`,
      )
    case 'organisation':
      return out(`organisation name: ${line.name}`)
    case 'founder_name':
      return out(
        terminal
          ? `founder's name: ${line.name}`
          : `founder's name: ${[...line.name].length} characters (shown only on a terminal)`,
      )
    case 'number':
      return out(`founder's number: ${line.masked}`)
    case 'reviews':
      return out(`review dates: Twilio Verify ${line.twilio}, AWS ${line.aws}`)
    case 'inputs':
      return out(
        `named DPO ${line.dpo}; review date ${line.reviewOn} (${ahead(line.daysAhead)} in ${line.zone}); from the DPO's record: ${keysOrNone(line.fromEntry)}; reason: ${line.reasonLength} characters`,
      )
    case 'dpo_sessions':
      return out(
        line.count === 0 || line.lastEnds === null
          ? `DPOs signed in, before the re-clear's own check: ${line.count}`
          : `DPOs signed in, before the re-clear's own check: ${line.count}, the last session ending ${clock(line.lastEnds, line.zone)} ${line.zone} (${clock(line.lastEnds, 'UTC')} UTC) (the re-clear refuses until then, unless that session is signed out)`,
      )
    case 'twilio_now':
      if ('clearance' in line) {
        return out(`Twilio Verify now: cleared, clearance ${line.clearance}, by ${line.via}, ${line.on}`)
      }
      return out(
        'since' in line ? `Twilio Verify now: not cleared since ${line.since}` : 'Twilio Verify now: never cleared',
      )
    case 'log_warning':
      return err(
        `warning: this database may log statement parameters (${list(line.settings)}). This mode binds no name or number, only ids, a day, fact names and a reason, so it goes on; tell whoever owns the parameter group (C0.12).`,
      )
    case 'facts_source': {
      const source =
        line.version === null
          ? `facts: the Twilio Verify clearance that ended last (${line.clearance}), since no published version names one`
          : `facts: the Twilio Verify clearance version ${line.version} states (${line.clearance})`
      return out(line.fromEntry.length === 0 ? source : `${source}; from the DPO's record: ${list(line.fromEntry)}`)
    }
    case 'changed':
      return out(`facts changed from the entry: ${keysOrNone(line.keys)}`)
    case 'committing':
      return out(
        line.mode === 'set-up'
          ? `committing organisation ${line.org}`
          : line.mode === 'recover'
            ? `committing the re-clear of Twilio Verify, clearance ${line.clearance}`
            : 'committing the correction',
      )
    case 'committed':
      if (line.mode === 'set-up') {
        return out(
          `committed: organisation ${line.org}; Hearth ${line.hearth}; founder (Owner and DPO) ${line.founder}; Twilio Verify cleared ${line.twilio.clearance}, review ${line.twilio.reviewOn}; AWS cleared ${line.aws.clearance}, review ${line.aws.reviewOn}`,
        )
      }
      return out(
        line.mode === 'recover'
          ? `committed: Twilio Verify cleared again by the emergency re-clear, ${line.clearance}, review ${line.reviewOn}`
          : "committed: the founder's number is corrected",
      )
    case 'send_state':
      return out(
        line.committed
          ? `send state for Twilio Verify: ${SEND_STATE_TEXT[line.state]}`
          : `would leave the send state for Twilio Verify at ${SEND_STATE_TEXT[line.state]}`,
      )
    case 'next':
      return out(
        'next: the founder signs in now on their own phone, then follows docs/runbooks/publishing-the-notice.md',
      )
    case 'kept_nothing':
      return out('plan only: every check passed and nothing was kept. Run it again with --commit.')
    case 'connect_failed':
      return err(
        `could not connect: ${CONNECT_TEXT[line.cause]}${line.cause === 'other' ? ` (${line.code ?? 'no code'})` : ''}`,
      )
    case 'refused':
      return err(refusalText(line.refusal).join('\nowner-bootstrap: '))
    case 'lost':
      return err(
        line.committing === false
          ? 'the connection was lost before committing, so nothing was committed. Run the same command again.'
          : lostText(line.committing),
      )
    case 'interrupted':
      return err(
        line.committing
          ? 'stopped while committing: it may or may not have committed. Run the plan to see.'
          : 'stopped before committing: nothing was committed.',
      )
    case 'unexpected':
      return err(
        `something unexpected stopped the run (${line.name}${line.code === null ? '' : `, ${line.code}`}) ${line.committing ? 'while committing, so it may or may not have committed. Run the plan to see.' : 'before committing, so nothing was committed.'}`,
      )
  }
}

// Where lines go: the process's stdout and stderr, or a test's.
export interface Sink {
  out(text: string): void
  err(text: string): void
  // Whether stdout is a terminal; read only for the founder_name line.
  terminal(): boolean
}

// Writes to stdout and stderr, which Linux writes synchronously to a terminal, a pipe or a file,
// so "committing" is out before COMMIT is sent.
export const processSink: Sink = {
  out: text => {
    process.stdout.write(text)
  },
  err: text => {
    process.stderr.write(text)
  },
  terminal: () => process.stdout.isTTY === true,
}

export type Print = (line: Line) => void

// A printer over a sink. A line that fails its schema is a bug in the script: it prints a fixed
// line in its place, never the line.
export function printer(sink: Sink): Print {
  return line => {
    const checked = LineSchema.safeParse(line)
    if (!checked.success) {
      sink.err('owner-bootstrap: a line failed its own check, so it was not printed\n')
      return
    }
    const { text, error } = render(checked.data, checked.data.kind === 'founder_name' && sink.terminal())
    ;(error ? sink.err : sink.out)(`owner-bootstrap: ${text}\n`)
  }
}

// --- From an error to its lines and exit status -------------------------------------------------

// Where a run is: its mode once known, and the committing line once printed, after which a lost
// connection or a stop may or may not have committed.
export interface Phase {
  mode: Mode | undefined
  committing: CommittingLine | undefined
}

export interface Outcome {
  lines: Line[]
  exit: ExitStatus
}

const codeOf = (error: unknown): string | undefined => {
  const code = (error as { code?: unknown } | null)?.code
  return typeof code === 'string' ? code : undefined
}
const messageOf = (error: unknown): string => (error instanceof Error ? error.message : '')

// The codes that mean the connection is gone: the server ended it (pg_terminate_backend, a
// shutdown, a transaction or idle timeout), the network did, or the client gave up.
const LOST_SQLSTATES = new Set(['57P01', '57P02', '57P03', '25P03', '25P04'])
const LOST_NODE_CODES = new Set(['ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH'])
const LOST_MESSAGES = new Set([
  'Connection terminated unexpectedly',
  'Connection terminated',
  'Query read timeout',
  'Client was closed and is not queryable',
  'Client has encountered a connection error and is not queryable',
])

export function isLostConnection(error: unknown): boolean {
  const code = codeOf(error)
  if (code !== undefined && (LOST_SQLSTATES.has(code) || code.startsWith('08') || LOST_NODE_CODES.has(code))) {
    return true
  }
  return LOST_MESSAGES.has(messageOf(error))
}

// The codes whose message is Hearth's own fixed text: its RAISEs in functions and triggers
// (HF005 to HF008 are Hearth's alone; 42501, 22023 and 23514 only from a RAISE, since Postgres's
// own messages for them name tables and can quote input).
const HEARTH_CODES = new Set(['HF005', 'HF006', 'HF007', 'HF008'])
const RAISED_CODES = new Set(['42501', '22023', '23514'])

// A refusal Postgres answered with, as the printer may show it.
export function postgresRefusal(error: DatabaseError): Refusal {
  const sqlstate = error.code !== undefined && /^[0-9A-Z]{5}$/.test(error.code) ? error.code : 'XX000'
  const refusal: Extract<Refusal, { kind: 'postgres' }> = { kind: 'postgres', sqlstate }
  if (error.constraint !== undefined && /^[a-z_][a-z0-9_$]{0,62}$/.test(error.constraint)) {
    refusal.constraint = error.constraint
  }
  const own = HEARTH_CODES.has(sqlstate) || (RAISED_CODES.has(sqlstate) && error.routine === 'exec_stmt_raise')
  const message = error.message.replace(/\s+/g, ' ').trim()
  if (own && message !== '' && message.length <= 500) refusal.message = message
  return refusal
}

const TRUST_CODES = new Set([
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'UNABLE_TO_GET_ISSUER_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'CERT_HAS_EXPIRED',
  'CERT_UNTRUSTED',
])

// Anything that failed before the first statement returned, as its connect_failed line: by Node's
// error code, pg's two fixed TLS messages and its connection timeout, or the SQLSTATE. Never the
// host, the user, the database's name or Postgres's message.
export function connectFailure(error: unknown): { kind: 'connect_failed'; cause: ConnectCause; code: string | null } {
  const failure = error instanceof NotStarted ? error.failure : error
  const code = codeOf(failure)
  const message = messageOf(failure)
  const line = (cause: ConnectCause) => ({ kind: 'connect_failed' as const, cause, code: null })
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return line('host_name')
  if (code === 'ECONNREFUSED' || code === 'EHOSTUNREACH' || code === 'ENETUNREACH') return line('nothing_answered')
  if (code === 'ETIMEDOUT' || message === 'timeout expired') return line('timed_out')
  if (code !== undefined && TRUST_CODES.has(code)) return line('untrusted')
  if (code === 'ERR_TLS_CERT_ALTNAME_INVALID') return line('wrong_name')
  if (
    message === 'The server does not support SSL connections' ||
    message === 'There was an error establishing an SSL connection'
  ) {
    return line('no_tls')
  }
  if (code === '28P01' || code === '28000' || /password must be a string/.test(message)) return line('sign_in')
  if (code === '3D000') return line('no_database')
  if (code === '42501') return line('role')
  if (code === '0A000' || code === '25006') return line('read_only')
  const printable = code !== undefined && (/^[0-9A-Z]{5}$/.test(code) || /^[A-Z][A-Z0-9_]{1,59}$/.test(code))
  return { kind: 'connect_failed', cause: 'other', code: printable ? code : null }
}

// What to print and how to exit for anything a run throws once it has connected, or that reaches
// the process's own handlers.
export function outcomeOf(error: unknown, phase: Phase): Outcome {
  if (error instanceof Refused)
    return { lines: [{ kind: 'refused', refusal: error.refusal }], exit: exitOf(error.refusal) }
  if (error instanceof NotStarted) return { lines: [connectFailure(error)], exit: EXIT.wrong }
  if (isLostConnection(error)) {
    return phase.committing === undefined
      ? { lines: [{ kind: 'lost', committing: false }], exit: EXIT.retry }
      : { lines: [{ kind: 'lost', committing: phase.committing }], exit: EXIT.unknown }
  }
  // A statement Postgres refused, COMMIT included: the server rolled the transaction back, so
  // nothing was committed even after "committing".
  if (error instanceof DatabaseError) {
    const refusal = postgresRefusal(error)
    return { lines: [{ kind: 'refused', refusal }], exit: exitOf(refusal) }
  }
  const name = error instanceof Error && /^[A-Za-z][A-Za-z0-9]{0,59}$/.test(error.name) ? error.name : 'Error'
  const code = codeOf(error)
  const printable = code !== undefined && (/^[0-9A-Z]{5}$/.test(code) || /^[A-Z][A-Z0-9_]{1,59}$/.test(code))
  return {
    lines: [{ kind: 'unexpected', committing: phase.committing !== undefined, name, code: printable ? code : null }],
    exit: phase.committing === undefined ? EXIT.retry : EXIT.unknown,
  }
}

// What the process's own handlers do with an error nothing caught (uncaughtException,
// unhandledRejection): print it through the sanitiser, so Node's own print, which would show a
// DatabaseError's detail and a stack, never runs. Answers the exit status.
export function report(outcome: Outcome, print: Print): ExitStatus {
  for (const line of outcome.lines) print(line)
  return outcome.exit
}

// A stop by SIGINT, SIGTERM or SIGHUP: its own line, never the lost-connection advice.
export function interrupted(phase: Phase): Outcome {
  const committing = phase.committing !== undefined
  return { lines: [{ kind: 'interrupted', committing }], exit: committing ? EXIT.unknown : EXIT.retry }
}

// A refusal before connecting, as its outcome.
export function refused(refusal: Refusal): Outcome {
  return { lines: [{ kind: 'refused', refusal }], exit: exitOf(refusal) }
}
