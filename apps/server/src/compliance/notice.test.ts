import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import {
  AcknowledgeBody,
  AcknowledgeResponse,
  aiCopyIn,
  ContactAdminResponse,
  generateNotice,
  NOTICE_GENERATOR,
  NOTICE_PEOPLE_MAX,
  NoticeAdminResponse,
  NoticePeopleResponse,
  NoticeResponse,
  noticeDigestText,
  noticeDraftSources,
  PublishBody,
  PublishResponse,
  RecordAcknowledgementBody,
} from '@hearth/shared'
import type { Redis } from 'ioredis'
import { describe, expect, it, vi } from 'vitest'
import type { Api } from '#src/api.ts'
import { Breaker } from '#src/auth/breaker.ts'
import { deriveKeys } from '#src/auth/crypto.ts'
import { ApiError } from '#src/auth/errors.ts'
import { relyingParty } from '#src/auth/passkeys.ts'
import { OTP } from '#src/auth/policy.ts'
import { valkeyKeys } from '#src/auth/valkey-keys.ts'
import {
  acknowledgeNotice,
  contactStated,
  NOTICE_ERRORS,
  noticeDraft,
  noticeFactsFrom,
  noticeStatusOf,
  publishNotice,
  readContactAdmin,
  readLatestPurposes,
  readNotice,
  readNoticeAdmin,
  readNoticePeople,
  recordAcknowledgement,
  targetsStated,
} from '#src/compliance/notice.ts'
import { AfterResponse, parse, type ReqInfo } from '#src/http.ts'
import { staticFlags } from '#src/testing/flags.ts'
import { appended, pgError, type Statement, scriptedPool, standingsOf } from '#src/testing/pool.ts'
import { NOTHING_CLEARED } from '#src/testing/transfers.ts'

const ORG = 'a0000000-0000-4000-8000-000000000001'
const DPO = 'b0000000-0000-4000-8000-000000000005'
const OWNER = 'b0000000-0000-4000-8000-000000000001'
const MEMBER = 'b0000000-0000-4000-8000-000000000008'
const LEFT = 'b0000000-0000-4000-8000-000000000009'
// Someone in another org, or nobody: the World holds neither.
const ELSEWHERE = 'b0000000-0000-4000-8000-0000000000ff'
const DEVICE = 'd0000000-0000-4000-8000-000000000001'
const V0 = 'c0000000-0000-4000-8000-0000000000a0'
const V1 = 'c0000000-0000-4000-8000-0000000000a1'
const NEW = 'c0000000-0000-4000-8000-0000000000a2'
const TWILIO = 'c0000000-0000-4000-8000-0000000000c1'
const OLD_TWILIO = 'c0000000-0000-4000-8000-0000000000c0'
const session = (userId = DPO) => ({
  sessionId: 'e0000000-0000-4000-8000-000000000001',
  orgId: ORG,
  userId,
  deviceId: DEVICE,
})

// A clearance's facts snapshot as 0009 stores it (transfer_register_facts()), fictional.
const snapshot = (change: Record<string, unknown> = {}) => ({
  services: 'Sends sign-in codes',
  data_types: 'Your mobile number',
  processing_countries: ['US'],
  storage_countries: ['US'],
  countries_confirmed: 'Test agreement, annex 1',
  safeguard: 'dpa',
  safeguard_reference: 'Test agreement',
  certificate_verified_on: null,
  dpa_terms_confirmed: true,
  training: 'not_applicable',
  zero_retention: 'not_applicable',
  provider_retention: '30 days',
  retention_confirmed: 'Test agreement, annex 2',
  onward_recipients: 'Mobile carriers',
  review_on: '2027-10-01',
  ...change,
})

// The register as the draft reads it: accounts active and listing Twilio, security_audit planned,
// recording_meetings retired, and an AI row the read leaves out (as though SQL's filter had let it
// through).
const purposeRows = (change: Record<string, unknown> = {}) => [
  {
    purpose: 'accounts',
    version: 2,
    status: 'active',
    basis: 'employment',
    basis_reference: null,
    retention: 'Until you leave, then 90 days',
    providers: ['twilio', 'openai'],
    ...change,
  },
  {
    purpose: 'security_audit',
    version: 1,
    status: 'planned',
    basis: null,
    basis_reference: null,
    retention: null,
    providers: [],
  },
  {
    purpose: 'recording_meetings',
    version: 3,
    status: 'retired',
    basis: 'legitimate_interests',
    basis_reference: 'LIA register, row 2',
    retention: 'None kept: deleted on 1 October 2026',
    providers: [],
  },
  {
    purpose: 'org_brain',
    version: 1,
    status: 'planned',
    basis: null,
    basis_reference: null,
    retention: null,
    providers: [],
  },
]

// The DPO's business contact (C0.9 OD-10), fictional, on a reserved domain.
const CONTACT = { title: 'Data Protection Officer', email: 'dpo@notice.example', phone: null, postal: null }
type SettingsRow = {
  version: number
  title: string
  email: string | null
  phone: string | null
  postal: string | null
  // The reply targets it holds (C0.9 PR 3b, OD-08's figures unless given).
  targets?: { businessDays: number; calendarDays: number }
}
// A settings row as the reads select it: the contact, and the targets as business_days and
// calendar_days (0012's columns).
const settingsRead = ({ targets, ...row }: SettingsRow) => ({
  ...row,
  business_days: targets?.businessDays ?? 10,
  calendar_days: targets?.calendarDays ?? 30,
})
type VersionFixture = {
  id: string
  version: number
  generator: string | null
  body: string
  // The settings version it printed (C0.9 PD-66); none unless given.
  dpo_settings_version?: number | null
}

interface World {
  fresh?: boolean
  // The draft's purposes and clearances.
  purposes?: readonly unknown[]
  clearances?: readonly unknown[]
  // Every version of the DPO's contact, the highest current (version 1, CONTACT, unless given).
  settings?: readonly SettingsRow[]
  // The latest version and its links, and the person's acknowledgements.
  latest?: VersionFixture | undefined
  links?: { purposes: readonly unknown[]; clearances: readonly unknown[] }
  // Whether the acting person acknowledged the latest version, and their earlier generated one.
  acknowledged?: boolean
  since?: (VersionFixture & { generator: string }) | undefined
  // The acknowledgement rows of yours (C0.9 PD-75), when not the one acknowledged gives.
  mine?: readonly unknown[]
  // The people the DPO may record for, and the notice-people read's first row.
  people?: readonly unknown[]
  head?: unknown
  // The function's row, or an error to raise.
  call?: unknown[] | Error
  standing?: 'acknowledged' | 'required' | 'unpublished'
  // The latest version's active purposes with their bases (readLatestPurposes(), C0.9 PD-105).
  latestPurposes?: readonly { purpose: string; basis: string | null }[]
}

const PUBLISHED = new Date('2026-10-21T02:00:00Z')

function org(w: World = {}) {
  const settings = w.settings ?? [{ version: 1, ...CONTACT }]
  const settingsOf = (version: number | null | undefined) => settings.find(row => row.version === version)
  const versionRow = (v: VersionFixture) => ({ ...v, dpo_settings_version: v.dpo_settings_version ?? null })
  return scriptedPool((statement: Statement) => {
    const { text } = statement
    if (text.includes('from people p join devices d')) {
      return [{ fresh: w.fresh ?? true, pin_set: true, issued_under_pin_rule: true }]
    }
    if (text.startsWith('select "id", "deactivated_at" from "people"')) {
      return [
        { id: OWNER, deactivated_at: null },
        { id: DPO, deactivated_at: null },
        { id: MEMBER, deactivated_at: null },
        { id: LEFT, deactivated_at: new Date('2026-10-01T00:00:00Z') },
      ]
    }
    if (text.startsWith('select "person_id", "role"')) {
      return [
        { person_id: OWNER, role: 'owner', team_id: null, revoked_at: null },
        { person_id: DPO, role: 'dpo', team_id: null, revoked_at: null },
      ]
    }
    if (text.startsWith('select x.person, case when v.id is null') && w.standing !== undefined) {
      return standingsOf([DPO, OWNER], w.standing)
    }
    if (text.startsWith('select name, ((now() at time zone time_zone)::date)::text as today')) {
      return [{ name: 'Integration test', today: '2026-10-22' }]
    }
    if (text.startsWith('select distinct on (purpose) purpose, version, status, basis, basis_reference')) {
      return [...(w.purposes ?? purposeRows())]
    }
    if (text.startsWith('select c.id, c.provider, c.facts, t.review_on')) {
      return [...(w.clearances ?? [{ id: TWILIO, provider: 'twilio', facts: snapshot(), review_on: '2027-10-01' }])]
    }
    if (text.startsWith('select s.version, s.contact_title as title')) {
      const current = settings.at(-1)
      return current === undefined
        ? []
        : [{ ...settingsRead(current), recorded_on: '2026-10-20', recorded_by: 'Ashton Tan' }]
    }
    if (text.startsWith('select version, contact_title as title')) {
      const asked = (statement.values.find(Array.isArray) ?? []) as number[]
      return settings.filter(row => asked.includes(row.version)).map(settingsRead)
    }
    if (text.startsWith('select v.id, o.name as org, s.contact_title as title')) {
      // readLatestPurposes(): the latest version when it is generated, with the title it printed.
      if (w.latest === undefined || w.latest.generator === null) return []
      return [
        { id: w.latest.id, org: 'Integration test', title: settingsOf(w.latest.dpo_settings_version)?.title ?? null },
      ]
    }
    if (text.startsWith('select l.purpose, r.basis from notice_version_purposes l'))
      return [...(w.latestPurposes ?? [])]
    if (text.startsWith('select v.id, v.version, v.published_at, p.full_name as published_by, v.generator, v.body')) {
      return w.latest === undefined
        ? []
        : [{ ...versionRow(w.latest), published_at: PUBLISHED, published_by: 'Ashton Tan' }]
    }
    if (
      text.startsWith(
        'select v.id, v.version, v.published_at, null::text as published_by, v.generator, v.body, v.dpo_settings_version, exists',
      )
    ) {
      if (w.latest === undefined) return []
      // The contact it printed, from the same statement's join.
      const printed = settingsOf(w.latest.dpo_settings_version)
      return [
        {
          ...versionRow(w.latest),
          published_at: PUBLISHED,
          published_by: null,
          acknowledged: w.acknowledged ?? false,
          contact_title: printed?.title ?? null,
          contact_email: printed?.email ?? null,
          contact_phone: printed?.phone ?? null,
          contact_postal: printed?.postal ?? null,
          target_business_days: printed === undefined ? null : (printed.targets?.businessDays ?? 10),
          target_calendar_days: printed === undefined ? null : (printed.targets?.calendarDays ?? 30),
        },
      ]
    }
    if (text.includes('where v.org_id = $1 and v.generator is not null and v.version < $2')) {
      return w.since === undefined ? [] : [{ ...versionRow(w.since), published_at: PUBLISHED, published_by: null }]
    }
    if (text.startsWith('select notice_version_id, purpose, register_version')) return [...(w.links?.purposes ?? [])]
    if (text.startsWith('select l.notice_version_id, c.id, c.provider, c.facts'))
      return [...(w.links?.clearances ?? [])]
    if (text.startsWith('select v.version, a.acknowledged_at, a.method')) {
      if (w.mine !== undefined) return [...w.mine]
      return w.acknowledged && w.latest !== undefined
        ? [
            {
              version: w.latest.version,
              acknowledged_at: new Date('2026-10-21T03:00:00Z'),
              method: 'in_app',
              acknowledged_on: null,
              recorded_note: null,
            },
          ]
        : []
    }
    if (text.startsWith('select ((now() at time zone o.time_zone)::date)::text as today, v.id, v.version')) {
      return [w.head ?? { today: '2026-10-22', id: V1, version: 1, published_on: '2026-10-21' }]
    }
    if (text.startsWith('select p.id, p.full_name as name, d.name as department')) return [...(w.people ?? [])]
    if (text.startsWith('select count(*)::int as people')) return [{ people: 2, acknowledged: 1 }]
    if (
      text.startsWith('select v.id, v.version, v.published_at, p.full_name as published_by, v.generator is not null')
    ) {
      return w.latest === undefined
        ? []
        : [
            {
              id: w.latest.id,
              version: w.latest.version,
              published_at: PUBLISHED,
              published_by: 'Ashton Tan',
              generated: w.latest.generator !== null,
            },
          ]
    }
    if (/^select (notice, version|version, changed) from public\./.test(text)) return w.call ?? []
    return []
  })
}

function context(pool: ReturnType<typeof scriptedPool>) {
  const after = vi.fn()
  const api: Api = {
    db: pool.db,
    valkey: { publish: vi.fn() } as unknown as Redis,
    keys: deriveKeys('unit-test-unit-test-unit-test-unit-test'),
    sms: undefined,
    keyPrefix: 'it:unit:',
    flags: staticFlags(),
    afterResponse: new AfterResponse(),
    appOrigin: 'https://hearth.example.com',
    names: valkeyKeys('it:unit:'),
    rp: relyingParty('https://hearth.example.com'),
    otp: { verifyFloorMs: 0, breaker: new Breaker(OTP.breaker) },
    passkeys: false,
    transfers: NOTHING_CLEARED,
  }
  const info: ReqInfo = {
    ip: '198.51.100.7',
    requestId: 'f0000000-0000-4000-8000-000000000001',
    userAgent: undefined,
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as ReqInfo['log'],
    after,
  }
  return { api, info, after }
}

async function refusal(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  )
  if (!(error instanceof ApiError)) throw new Error(`expected an ApiError, got ${String(error)}`)
  return error
}

const callOf = (pool: ReturnType<typeof scriptedPool>, name: string) =>
  pool.statements.find(statement => statement.text.includes(`from public.${name}(`))

// The draft the fixture's registers make, as the generator writes it, and its digest.
const input = () => ({
  org: 'Integration test',
  purposes: [
    {
      key: 'accounts' as const,
      version: 2,
      status: 'active' as const,
      basis: 'employment' as const,
      basisReference: null,
      retention: 'Until you leave, then 90 days',
      providers: ['twilio' as const],
    },
    {
      key: 'security_audit' as const,
      version: 1,
      status: 'planned' as const,
      basis: null,
      basisReference: null,
      retention: null,
      providers: [],
    },
    {
      key: 'recording_meetings' as const,
      version: 3,
      status: 'retired' as const,
      basis: 'legitimate_interests' as const,
      basisReference: 'LIA register, row 2',
      retention: 'None kept: deleted on 1 October 2026',
      providers: [],
    },
  ],
  clearances: [{ id: TWILIO, provider: 'twilio' as const, facts: noticeFactsFrom(snapshot()), reviewOn: '2027-10-01' }],
  contact: { version: 1, ...CONTACT, targets: { businessDays: 10, calendarDays: 30 } },
})
const BODY = generateNotice(input())
const DIGEST = createHash('sha256')
  .update(noticeDigestText(noticeDraftSources(input(), BODY)))
  .digest('hex')

describe('NTS-02 C0.9 PD-36 PD-37 the draft: what the registers make, and its digest', () => {
  it('reads a clearance snapshot as its stated facts, and a fact of the wrong shape as not recorded', () => {
    expect(noticeFactsFrom(snapshot())).toEqual({
      services: 'Sends sign-in codes',
      dataTypes: 'Your mobile number',
      processingCountries: ['US'],
      storageCountries: ['US'],
      training: 'not_applicable',
      providerRetention: '30 days',
      onwardRecipients: 'Mobile carriers',
    })
    expect(noticeFactsFrom(snapshot({ services: 3, training: 'on', storage_countries: 'US' }))).toMatchObject({
      services: null,
      training: null,
      storageCountries: [],
    })
    expect(noticeFactsFrom(null)).toMatchObject({ services: null, processingCountries: [] })
  })

  it('generates the first version from the registers, leaving AI rows out, with the sha-256 of its sources as its digest', async () => {
    const pool = org()
    const draft = await pool.db.transaction().execute(trx => noticeDraft(trx as never, ORG))
    expect(draft.version).toBe(0)
    expect(draft.latest).toBeNull()
    expect(draft.body).toBe(BODY)
    expect(draft.digest).toBe(DIGEST)
    expect(draft.digest).toMatch(/^[0-9a-f]{64}$/)
    // Active and retired purposes, by key; the open clearance; the AI purpose and provider left out.
    expect(draft.sources.purposes).toEqual([
      { key: 'accounts', version: 2 },
      { key: 'recording_meetings', version: 3 },
    ])
    expect(draft.sources.clearances.map(clearance => clearance.id)).toEqual([TWILIO])
    expect(draft.sources.generator).toBe(NOTICE_GENERATOR)
    // The DPO's current settings version, with the contact "Your rights" prints (C0.9 PD-66, PD-74).
    expect(draft.sources.contact).toEqual({ version: 1, facts: CONTACT })
    expect(draft.body).toContain('- Email: dpo@notice.example')
    // With the reply targets it holds (C0.9 PR 3b, PD-94), which this generator prints.
    expect(draft.contact).toEqual({
      version: 1,
      ...CONTACT,
      recordedOn: '2026-10-20',
      recordedBy: 'Ashton Tan',
      targets: { businessDays: 10, calendarDays: 30 },
    })
    expect(draft.sources.targets).toEqual({ businessDays: 10, calendarDays: 30 })
    expect(draft.problems).toEqual([])
    // The contact is no longer a warning (C0.9 PD-68).
    expect(draft.warnings.map(warning => warning.code)).toEqual(['production_access_pending'])
    expect(draft.changes).toBeNull()
    expect(draft.upToDate).toBe(false)
    expect(noticeStatusOf(draft)).toBe('none')
    // Every read is plain: publish_notice() does the locking.
    expect(pool.texts().join(' ')).not.toMatch(/\bfor (share|update|no key update)\b/)
  })

  it('PD-62 B-14 C-05: free text the screens keep off holds the draft back with neither words nor digest, naming the field, never the word', async () => {
    const pool = org({
      clearances: [
        { id: TWILIO, provider: 'twilio', facts: snapshot({ onward_recipients: 'Our agents' }), review_on: null },
      ],
    })
    const draft = await pool.db.transaction().execute(trx => noticeDraft(trx as never, ORG))
    expect(draft.problems).toEqual([{ code: 'free_text_ai_copy', provider: 'twilio', field: 'onward_recipients' }])
    expect(draft.body).toBeNull()
    expect(draft.digest).toBeNull()
    expect(JSON.stringify(draft.problems)).not.toMatch(/agents/i)
  })

  it('PD-62 C-05: the Tembusu seed’s org name, which every notice prints and publishing doesn’t check, matches no AI_COPY pattern', () => {
    // The DPO can't change the org's name, so publishing doesn't hold it to AI_COPY; the bootstrap
    // and C0.16's org settings refuse a matching one, and this holds the seed's (T22 item 24).
    const seed = readFileSync(new URL('../../../../db/seed/tembusu.sql', import.meta.url), 'utf8')
    const names = [...seed.matchAll(/insert into public\.orgs \(id, name\) values \('[0-9a-f-]+', '([^']+)'\)/g)].map(
      match => match[1] ?? '',
    )
    expect(names).toEqual(['Tembusu Logistics'])
    for (const name of names) expect(aiCopyIn(name), name).toBeUndefined()
  })

  it('PD-48: a draft the latest version already says is up to date, a provider cleared again on the same facts included; one from a stand-in is out of date, with what it changes', async () => {
    const links = {
      purposes: [
        { notice_version_id: V0, purpose: 'accounts', register_version: 2 },
        { notice_version_id: V0, purpose: 'recording_meetings', register_version: 3 },
      ],
      clearances: [{ notice_version_id: V0, id: TWILIO, provider: 'twilio', facts: snapshot() }],
    }
    const published = { id: V0, version: 0, generator: NOTICE_GENERATOR, body: BODY, dpo_settings_version: 1 }
    const same = org({ latest: published, links })
    const draft = await same.db.transaction().execute(trx => noticeDraft(trx as never, ORG))
    expect(draft.version).toBe(1)
    expect(draft.problems).toEqual([{ code: 'unchanged' }])
    expect(draft.upToDate).toBe(true)
    expect(noticeStatusOf(draft)).toBe('up_to_date')
    expect(draft.changes).toEqual({
      since: 0,
      purposes: { added: [], changed: [], removed: [] },
      providers: { added: [], changed: [], removed: [] },
      contact: 'same',
      targets: 'same',
      wording: false,
    })
    // The latest version's sources carry the settings version it linked, read with its contact.
    expect(draft.latest?.sources.contact).toEqual({ version: 1, facts: CONTACT })
    // A provider cleared again on the same facts (a new review date alone) is still up to date: its
    // sends go on, and publishing only warns that everyone would acknowledge the same words again.
    const recleared = org({
      latest: published,
      links: {
        ...links,
        clearances: [{ notice_version_id: V0, id: OLD_TWILIO, provider: 'twilio', facts: snapshot() }],
      },
    })
    const sameFacts = await recleared.db.transaction().execute(trx => noticeDraft(trx as never, ORG))
    expect(sameFacts.problems).toEqual([])
    expect(sameFacts.warnings.map(warning => warning.code)).toContain('same_text')
    expect(sameFacts.upToDate).toBe(true)
    expect(noticeStatusOf(sameFacts)).toBe('up_to_date')
    // Other stated facts aren't: the notice no longer says them, and Twilio's sends wait for it.
    const moved = org({
      latest: published,
      links: {
        ...links,
        clearances: [
          {
            notice_version_id: V0,
            id: OLD_TWILIO,
            provider: 'twilio',
            facts: snapshot({ provider_retention: '7 days' }),
          },
        ],
      },
    })
    const otherFacts = await moved.db.transaction().execute(trx => noticeDraft(trx as never, ORG))
    expect(otherFacts.upToDate).toBe(false)
    expect(noticeStatusOf(otherFacts)).toBe('out_of_date')
    const standIn = org({ latest: { id: V0, version: 0, generator: null, body: 'A stand-in' } })
    const fromStandIn = await standIn.db.transaction().execute(trx => noticeDraft(trx as never, ORG))
    expect(fromStandIn.upToDate).toBe(false)
    expect(noticeStatusOf(fromStandIn)).toBe('out_of_date')
    expect(fromStandIn.changes).toMatchObject({
      since: 0,
      purposes: { added: ['accounts', 'recording_meetings'] },
      providers: { added: ['twilio'] },
      // A stand-in printed no contact: this version gives it for the first time (C0.9 PD-67).
      contact: 'added',
      wording: true,
    })
  })
})

describe('NTS-02 C0.9 OD-10 OD-11 PD-66 PD-67 PD-68 the draft and the DPO’s contact', () => {
  it('PD-68: with no contact recorded, holds the draft back with dpo_contact_pending, writing neither words nor digest (UNSHOWN), and links no settings version', async () => {
    const pool = org({ settings: [] })
    const draft = await pool.db.transaction().execute(trx => noticeDraft(trx as never, ORG))
    expect(draft.contact).toBeNull()
    expect(draft.input.contact).toBeNull()
    expect(draft.problems).toEqual([{ code: 'dpo_contact_pending' }])
    expect(draft.body).toBeNull()
    expect(draft.digest).toBeNull()
    expect(draft.sources.contact).toBeNull()
    // Read with no lock, as every draft read is.
    expect(pool.texts().find(text => text.includes('from dpo_settings s'))).not.toMatch(/\bfor (share|update)\b/)
  })

  it('PD-66 PD-67: a new settings version of the same details reads as out of date and warns same_text; other details are changed, with no new wording', async () => {
    const links = {
      purposes: [
        { notice_version_id: V0, purpose: 'accounts', register_version: 2 },
        { notice_version_id: V0, purpose: 'recording_meetings', register_version: 3 },
      ],
      clearances: [{ notice_version_id: V0, id: TWILIO, provider: 'twilio', facts: snapshot() }],
    }
    const latest = { id: V0, version: 0, generator: NOTICE_GENERATOR, body: BODY, dpo_settings_version: 1 }
    // Version 2 records the same details: the same words, another source.
    const again = org({
      latest,
      links,
      settings: [
        { version: 1, ...CONTACT },
        { version: 2, ...CONTACT },
      ],
    })
    const same = await again.db.transaction().execute(trx => noticeDraft(trx as never, ORG))
    expect(same.body).toBe(BODY)
    expect(same.problems).toEqual([])
    expect(same.warnings.map(warning => warning.code)).toContain('same_text')
    expect(same.upToDate).toBe(false)
    expect(same.changes).toMatchObject({ contact: 'same', wording: false })
    // Version 2 gives another mailbox: the contact changed, and only it.
    const other = { ...CONTACT, email: 'privacy@notice.example' }
    const moved = org({
      latest,
      links,
      settings: [
        { version: 1, ...CONTACT },
        { version: 2, ...other },
      ],
    })
    const changed = await moved.db.transaction().execute(trx => noticeDraft(trx as never, ORG))
    expect(changed.body).toContain('- Email: privacy@notice.example')
    expect(changed.upToDate).toBe(false)
    expect(noticeStatusOf(changed)).toBe('out_of_date')
    expect(changed.changes).toEqual({
      since: 0,
      purposes: { added: [], changed: [], removed: [] },
      providers: { added: [], changed: [], removed: [] },
      contact: 'changed',
      targets: 'same',
      wording: false,
    })
    // The link read asks only for the settings version the latest printed.
    const read = moved.statements.find(statement => statement.text.startsWith('select version, contact_title'))
    expect(read?.values).toEqual([ORG, [1]])
  })

  it('PD-65: a contact with wording Hearth keeps off its screens holds the draft back with free_text_ai_copy naming the field, never the word', async () => {
    const pool = org({ settings: [{ version: 1, ...CONTACT, postal: '1 Fictional Road\nAsk at reception' }] })
    const draft = await pool.db.transaction().execute(trx => noticeDraft(trx as never, ORG))
    expect(draft.problems).toEqual([{ code: 'free_text_ai_copy', field: 'contact_postal' }])
    expect(draft.body).toBeNull()
    expect(JSON.stringify(draft.problems)).not.toMatch(/reception|ask/i)
  })

  it('OD-18 PD-86: a purpose on deemed consent by conduct that CONDUCT_WITHDRAWABLE doesn’t list is written and previewed, and held back by purpose_conduct_unstoppable', async () => {
    const pool = org({
      purposes: [
        ...purposeRows(),
        {
          purpose: 'access_logs',
          version: 2,
          status: 'active',
          basis: 'deemed_consent_conduct',
          basis_reference: null,
          retention: '1 year',
          providers: [],
        },
      ],
    })
    const draft = await pool.db.transaction().execute(trx => noticeDraft(trx as never, ORG))
    expect(draft.problems).toEqual([{ code: 'purpose_conduct_unstoppable', purpose: 'access_logs' }])
    expect(draft.body).toContain('These purposes rest on your deemed consent')
    expect(draft.digest).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('NTS-02 C0.9 PR 3b OD-08 PD-93 PD-94 PD-95 the reply targets each version printed', () => {
  const links = {
    purposes: [
      { notice_version_id: V0, purpose: 'accounts', register_version: 2 },
      { notice_version_id: V0, purpose: 'recording_meetings', register_version: 3 },
    ],
    clearances: [{ notice_version_id: V0, id: TWILIO, provider: 'twilio', facts: snapshot() }],
  }

  it('reads a version’s targets only when its generator prints them: a c09.2 version or a stand-in states none, whatever its linked row reads', async () => {
    for (const [generator, targets, change] of [
      [NOTICE_GENERATOR, { businessDays: 10, calendarDays: 30 }, 'same'],
      ['c09.2', null, 'added'],
      ['c09.1', null, 'added'],
      [null, null, 'added'],
    ] as const) {
      const pool = org({
        latest: {
          id: V0,
          version: 0,
          generator,
          body: generator === null ? 'A stand-in' : BODY,
          dpo_settings_version: 1,
        },
        links,
      })
      const draft = await pool.db.transaction().execute(trx => noticeDraft(trx as never, ORG))
      expect(draft.latest?.sources.targets, String(generator)).toEqual(targets)
      // The draft prints the current targets, so a targetless latest reads as targets added.
      expect(draft.sources.targets).toEqual({ businessDays: 10, calendarDays: 30 })
      expect(draft.input.contact?.targets).toEqual({ businessDays: 10, calendarDays: 30 })
      expect(draft.changes?.targets, String(generator)).toBe(change)
    }
  })

  it('NTG-20: a draft whose targets alone changed is out of date, reporting the targets changed, the contact the same and no new wording', async () => {
    const pool = org({
      latest: { id: V0, version: 0, generator: NOTICE_GENERATOR, body: BODY, dpo_settings_version: 1 },
      links,
      settings: [
        { version: 1, ...CONTACT },
        { version: 2, ...CONTACT, targets: { businessDays: 7, calendarDays: 30 } },
      ],
    })
    const draft = await pool.db.transaction().execute(trx => noticeDraft(trx as never, ORG))
    expect(draft.upToDate).toBe(false)
    expect(draft.changes).toMatchObject({ contact: 'same', targets: 'changed', wording: false })
    expect(draft.body).toContain('within 7 business days')
  })

  it('GET /api/notice answers the targets the latest printed, from its own row, and null for a c09.2 version or a stand-in', async () => {
    for (const [generator, targets] of [
      [NOTICE_GENERATOR, { businessDays: 7, calendarDays: 21 }],
      ['c09.2', null],
      [null, null],
    ] as const) {
      const pool = org({
        latest: {
          id: V1,
          version: 1,
          generator,
          body: generator === null ? 'A stand-in' : BODY,
          dpo_settings_version: 1,
        },
        settings: [{ version: 1, ...CONTACT, targets: { businessDays: 7, calendarDays: 21 } }],
        acknowledged: true,
      })
      const c = context(pool)
      const answer = NoticeResponse.parse((await readNotice(c.api, session(OWNER), c.info)).body)
      expect(answer.targets, String(generator)).toEqual(targets)
      // From the very row the answer shows, in the statement that reads the latest version.
      expect(pool.texts().find(text => text.includes(' as acknowledged,'))).toMatch(
        /s\.target_business_days, s\.target_calendar_days from notice_versions v/,
      )
    }
  })

  it('PD-105: readLatestPurposes() reads the latest generated version’s active purposes with their bases and the title it printed; null with no version, a stand-in, or no contact printed', async () => {
    const read = (w: World) => {
      const pool = org(w)
      return pool.db.transaction().execute(trx => readLatestPurposes(trx as never, ORG))
    }
    const latest = { id: V1, version: 1, generator: NOTICE_GENERATOR, body: BODY, dpo_settings_version: 1 }
    expect(
      await read({
        latest,
        latestPurposes: [
          { purpose: 'accounts', basis: 'employment' },
          { purpose: 'backups', basis: 'legitimate_interests' },
          // An AI purpose, or an active row with no basis, never reaches the reply.
          { purpose: 'org_brain', basis: 'legitimate_interests' },
          { purpose: 'security_audit', basis: null },
        ],
      }),
    ).toEqual({
      org: 'Integration test',
      purposes: [
        { key: 'accounts', basis: 'employment' },
        { key: 'backups', basis: 'legitimate_interests' },
      ],
      contactTitle: CONTACT.title,
    })
    expect(await read({})).toBeNull()
    expect(await read({ latest: { ...latest, generator: null, body: 'A stand-in' } })).toBeNull()
    expect(await read({ latest: { ...latest, generator: 'c09.1', dpo_settings_version: null } })).toBeNull()
  })
})

describe('NTS-02 C0.9 PD-46 B-11 GET /api/notice', () => {
  it('answers your standing, the current version, what changed since the generated version you last acknowledged, and your acknowledgements, in a read-only transaction that leaves the session alone', async () => {
    const pool = org({
      latest: { id: V1, version: 1, generator: NOTICE_GENERATOR, body: BODY, dpo_settings_version: 1 },
      since: { id: V0, version: 0, generator: NOTICE_GENERATOR, body: 'Older words', dpo_settings_version: 1 },
      links: {
        purposes: [
          { notice_version_id: V0, purpose: 'accounts', register_version: 1 },
          { notice_version_id: V1, purpose: 'accounts', register_version: 2 },
        ],
        clearances: [
          {
            notice_version_id: V0,
            id: OLD_TWILIO,
            provider: 'twilio',
            facts: snapshot({ provider_retention: '7 days' }),
          },
          { notice_version_id: V1, id: TWILIO, provider: 'twilio', facts: snapshot() },
        ],
      },
    })
    const c = context(pool)
    const answer = NoticeResponse.parse((await readNotice(c.api, session(OWNER), c.info)).body)
    expect(answer).toEqual({
      person: OWNER,
      standing: 'required',
      current: { id: V1, version: 1, publishedAt: '2026-10-21T02:00:00.000Z', body: BODY },
      // The contact the current version printed (C0.9 PD-69).
      contact: CONTACT,
      // The targets it printed, from the same row (C0.9 PD-95).
      targets: { businessDays: 10, calendarDays: 30 },
      changes: {
        since: 0,
        purposes: { added: [], changed: ['accounts'], removed: [] },
        providers: { added: [], changed: ['twilio'], removed: [] },
        contact: 'same',
        targets: 'same',
        wording: false,
      },
      mine: [],
    })
    expect(pool.texts()[0]).toBe('start transaction isolation level read committed read only')
    // The contact comes from the very row the answer shows, in the same statement (PD-69): no read of
    // the current settings, which may be newer than what the version printed.
    const current = pool.texts().find(text => text.includes(' as acknowledged,'))
    expect(current).toMatch(
      /left join dpo_settings s on s\.org_id = v\.org_id and s\.version = v\.dpo_settings_version/,
    )
    expect(pool.texts().some(text => text.startsWith('select s.version, s.contact_title'))).toBe(false)
    // /notice polls it: not use of the session (PD-46).
    expect(c.after).not.toHaveBeenCalled()
    expect(pool.texts().join(' ')).not.toMatch(/\bfor (share|update|no key update)\b/)
  })

  it('reads acknowledged once you have, unpublished before any version, and a stand-in as the latest with no changes', async () => {
    const acknowledged = org({
      latest: { id: V1, version: 1, generator: null, body: 'A stand-in' },
      acknowledged: true,
    })
    const c = context(acknowledged)
    expect(NoticeResponse.parse((await readNotice(c.api, session(OWNER), c.info)).body)).toMatchObject({
      standing: 'acknowledged',
      changes: null,
      mine: [{ version: 1, acknowledgedAt: '2026-10-21T03:00:00.000Z', method: 'in_app' }],
    })
    // A stand-in printed no contact.
    expect(NoticeResponse.parse((await readNotice(c.api, session(OWNER), c.info)).body).contact).toBeNull()
    const none = context(org())
    expect(NoticeResponse.parse((await readNotice(none.api, session(OWNER), none.info)).body)).toEqual({
      person: OWNER,
      standing: 'unpublished',
      current: null,
      contact: null,
      targets: null,
      changes: null,
      mine: [],
    })
  })

  it('C0.9 OD-19 PD-75: an acknowledgement the DPO recorded carries the day and the note, read as text; one in the app neither', async () => {
    const pool = org({
      latest: { id: V1, version: 1, generator: NOTICE_GENERATOR, body: BODY, dpo_settings_version: 1 },
      acknowledged: true,
      mine: [
        {
          version: 1,
          acknowledged_at: new Date('2026-10-22T03:00:00Z'),
          method: 'recorded_by_dpo',
          acknowledged_on: '2026-10-21',
          recorded_note: 'Signed a printed copy at induction',
        },
        {
          version: 0,
          acknowledged_at: new Date('2026-10-20T03:00:00Z'),
          method: 'in_app',
          acknowledged_on: null,
          recorded_note: null,
        },
      ],
    })
    const c = context(pool)
    const answer = NoticeResponse.parse((await readNotice(c.api, session(MEMBER), c.info)).body)
    expect(answer.mine).toEqual([
      {
        version: 1,
        acknowledgedAt: '2026-10-22T03:00:00.000Z',
        method: 'recorded_by_dpo',
        acknowledgedOn: '2026-10-21',
        note: 'Signed a printed copy at induction',
      },
      { version: 0, acknowledgedAt: '2026-10-20T03:00:00.000Z', method: 'in_app', acknowledgedOn: null, note: null },
    ])
    // The day is a date column, read as text (YYYY-MM-DD), never a time.
    expect(pool.texts().find(text => text.startsWith('select v.version, a.acknowledged_at'))).toMatch(
      /a\.acknowledged_on::text as acknowledged_on, a\.recorded_note/,
    )
  })

  it('C0.9 PD-67: what changed since your last acknowledged version names a changed contact, with no new wording', async () => {
    const pool = org({
      latest: { id: V1, version: 1, generator: NOTICE_GENERATOR, body: BODY, dpo_settings_version: 2 },
      since: { id: V0, version: 0, generator: NOTICE_GENERATOR, body: 'Older words', dpo_settings_version: 1 },
      settings: [
        { version: 1, ...CONTACT },
        { version: 2, ...CONTACT, email: null, phone: '+65 8000 0196' },
      ],
    })
    const c = context(pool)
    const answer = NoticeResponse.parse((await readNotice(c.api, session(OWNER), c.info)).body)
    expect(answer.contact).toEqual({ ...CONTACT, email: null, phone: '+65 8000 0196' })
    expect(answer.changes).toMatchObject({ contact: 'changed', wording: false })
  })

  it('answers an ended session as signed out, never 404, and passes whatever the person’s standing (NOTICE_FREE)', async () => {
    const pool = org({ standing: 'required' })
    const c = context(pool)
    expect(await refusal(readNotice(c.api, session(LEFT), c.info))).toMatchObject({ status: 401, code: 'signed_out' })
    // The gate isn't asked: notice.read_own is free in every standing.
    expect(pool.texts().some(text => text.startsWith('select x.person'))).toBe(false)
  })
})

describe('NTS-02 C0.9 PD-42 POST /api/notice/acknowledge', () => {
  const body = parse(AcknowledgeBody, { notice: V1 })

  it('acknowledges the version read on the session’s own device through acknowledge_notice(), appending notice.acknowledged only when something was recorded', async () => {
    for (const changed of [true, false]) {
      const pool = org({ standing: 'required', call: [{ version: 1, changed }] })
      const c = context(pool)
      const answer = await acknowledgeNotice(c.api, body, session(OWNER), c.info)
      expect(AcknowledgeResponse.parse(answer.body)).toEqual({ version: 1, changed })
      const call = callOf(pool, 'acknowledge_notice')
      expect(call?.text).toBe(
        'select version, changed from public.acknowledge_notice($1::uuid, $2, $3::uuid, $4::inet)',
      )
      expect(call?.values).toEqual([V1, c.info.requestId, DEVICE, c.info.ip])
      expect(appended(pool.statements)).toEqual(
        changed
          ? [
              {
                type: 'notice.acknowledged',
                entity: OWNER,
                subjects: [OWNER],
                ids: { notice: V1, version: 1 },
                actor: undefined,
              },
            ]
          : [],
      )
      // A state-changing request re-reads the acting session FOR SHARE.
      expect(
        pool.texts().some(text => text.includes('from people p join devices d') && text.includes('for share')),
      ).toBe(true)
      expect(pool.texts().at(-1)).toBe('commit')
    }
  })

  it('PD-52: answers HF007 409 notice_changed, 22023 404, and a person or device gone 401 signed_out, clearing the cookie', async () => {
    for (const [sqlstate, status, code, clears] of [
      ['HF007', 409, 'notice_changed', false],
      ['22023', 404, 'not_found', false],
      ['42501', 401, 'signed_out', true],
    ] as const) {
      const pool = org({ call: pgError(sqlstate) })
      const c = context(pool)
      const error = await refusal(acknowledgeNotice(c.api, body, session(OWNER), c.info))
      expect(error, sqlstate).toMatchObject({ status, code })
      expect(error.clear.length > 0).toBe(clears)
      expect(appended(pool.statements)).toEqual([])
      expect(pool.texts().at(-1)).toBe('rollback')
    }
  })
})

describe('NTS-02 C0.9 PD-48 PD-49 GET /api/admin/notice', () => {
  it('lets the DPO read the draft, the latest version’s count acknowledged (never names) and the history', async () => {
    const pool = org({ latest: { id: V0, version: 0, generator: null, body: 'A stand-in' } })
    const c = context(pool)
    const answer = NoticeAdminResponse.parse((await readNoticeAdmin(c.api, session(), c.info)).body)
    expect(answer.today).toBe('2026-10-22')
    expect(answer.latest).toEqual({
      id: V0,
      version: 0,
      publishedAt: '2026-10-21T02:00:00.000Z',
      publishedBy: 'Ashton Tan',
      generated: false,
      acknowledged: 1,
      people: 2,
    })
    expect(answer.draft).toMatchObject({ version: 1, body: BODY, digest: DIGEST, problems: [], upToDate: false })
    expect(answer.history).toEqual([
      { id: V0, version: 0, publishedAt: '2026-10-21T02:00:00.000Z', publishedBy: 'Ashton Tan', generated: false },
    ])
    expect(pool.texts()[0]).toBe('start transaction isolation level read committed read only')
    // Only active people are counted, in one statement with their acknowledgements.
    expect(pool.texts().find(text => text.startsWith('select count(*)::int as people'))).toMatch(
      /p\.deactivated_at is null/,
    )
  })

  it('refuses everyone but the DPO, and a DPO whose PIN is more than 5 minutes old, before reading the notice or the registers', async () => {
    for (const [who, fresh, code] of [
      [OWNER, true, 'forbidden'],
      [DPO, false, 'reauth_required'],
    ] as const) {
      const pool = org({ fresh })
      const c = context(pool)
      expect(await refusal(readNoticeAdmin(c.api, session(who), c.info)), who).toMatchObject({ status: 403, code })
      // The gate's standing read aside (compliance/notice-standing.ts).
      const read = pool.texts().filter(text => !text.startsWith('select x.person'))
      expect(read.some(text => /notice_versions|processing_register|transfer_clearances/.test(text))).toBe(false)
    }
  })

  it('PD-43 PD-44: a DPO who hasn’t acknowledged the latest version is sent to it (403 notice_required); before any version, the DPO passes', async () => {
    const required = context(org({ standing: 'required' }))
    expect(await refusal(readNoticeAdmin(required.api, session(), required.info))).toMatchObject({
      status: 403,
      code: 'notice_required',
    })
    const before = context(org({ standing: 'unpublished' }))
    expect(
      NoticeAdminResponse.parse((await readNoticeAdmin(before.api, session(), before.info)).body).latest,
    ).toBeNull()
    // An Owner before v0 is refused by the gate, before can().
    const owner = context(org({ standing: 'unpublished' }))
    expect(await refusal(readNoticeAdmin(owner.api, session(OWNER), owner.info))).toMatchObject({
      code: 'notice_required',
    })
  })
})

describe('NTS-02 C0.9 PD-36 PD-37 PD-52 POST /api/admin/notice/publish', () => {
  const publish = (input: Record<string, unknown> = {}) => parse(PublishBody, { seen: null, digest: DIGEST, ...input })

  it('publishes the previewed draft through publish_notice() with its sources, the DPO’s settings version among them (PD-66), and appends notice.published naming the new version', async () => {
    const pool = org({ call: [{ notice: NEW, version: 0 }] })
    const c = context(pool)
    const answer = await publishNotice(c.api, publish(), session(), c.info)
    expect(PublishResponse.parse(answer.body)).toEqual({ notice: NEW, version: 0 })
    const call = callOf(pool, 'publish_notice')
    expect(call?.text).toBe(
      'select notice, version from public.publish_notice($1::integer, $2, $3, $4::text[], $5::integer[], $6::uuid[], $7::integer, $8, $9::uuid, $10::inet)',
    )
    expect(call?.values).toEqual([
      null,
      BODY,
      NOTICE_GENERATOR,
      ['accounts', 'recording_meetings'],
      [2, 3],
      [TWILIO],
      // The settings version the draft printed.
      1,
      c.info.requestId,
      DEVICE,
      c.info.ip,
    ])
    expect(appended(pool.statements)).toEqual([
      { type: 'notice.published', entity: NEW, subjects: [], ids: { version: 0 }, actor: undefined },
    ])
    // can() first (the acting session FOR SHARE), then the draft's plain reads, then the function.
    const texts = pool.texts()
    const acting = texts.findIndex(text => text.includes('from people p join devices d'))
    expect(texts[acting]).toMatch(/for share of p, d, s/)
    expect(acting).toBeLessThan(texts.findIndex(text => text.startsWith('select c.id, c.provider')))
    expect(texts.at(-1)).toBe('commit')
  })

  it('answers a stale seen or digest 409 notice_changed and a draft with a problem 400 notice_invalid, before the database is asked', async () => {
    for (const [world, body, status, code] of [
      [{}, publish({ seen: 0 }), 409, 'notice_changed'],
      [{}, publish({ digest: 'f'.repeat(64) }), 409, 'notice_changed'],
      [{ latest: { id: V0, version: 0, generator: null, body: 'A stand-in' } }, publish(), 409, 'notice_changed'],
      [{ purposes: purposeRows({ basis: null }) }, publish(), 400, 'notice_invalid'],
      [{ purposes: purposeRows({ retention: 'Kept by our agents' }) }, publish(), 400, 'notice_invalid'],
      [{ clearances: [] }, publish(), 400, 'notice_invalid'],
      // C0.9 PD-68: no contact for the DPO.
      [{ settings: [] }, publish(), 400, 'notice_invalid'],
      // C0.9 PD-86: a purpose on deemed consent by conduct no procedure stops for one person.
      [
        { purposes: purposeRows({ purpose: 'access_logs', basis: 'deemed_consent_conduct', providers: [] }) },
        publish(),
        400,
        'notice_invalid',
      ],
    ] as const) {
      const pool = org({ ...world, call: [{ notice: NEW, version: 0 }] })
      const c = context(pool)
      expect(await refusal(publishNotice(c.api, body, session(), c.info)), JSON.stringify(world)).toMatchObject({
        status,
        code,
      })
      expect(callOf(pool, 'publish_notice')).toBeUndefined()
      expect(appended(pool.statements)).toEqual([])
    }
  })

  it('refuses everyone but a freshly re-authenticated DPO through can(), before reading the draft', async () => {
    for (const [who, fresh, code] of [
      [OWNER, true, 'forbidden'],
      [DPO, false, 'reauth_required'],
    ] as const) {
      const pool = org({ fresh, call: [{ notice: NEW, version: 0 }] })
      const c = context(pool)
      expect(await refusal(publishNotice(c.api, publish(), session(who), c.info))).toMatchObject({ status: 403, code })
      const read = pool.texts().filter(text => !text.startsWith('select x.person'))
      expect(read.some(text => /notice_versions|processing_register|publish_notice/.test(text))).toBe(false)
    }
  })

  it('answers the function’s refusals: HF007 409 notice_changed, HF008 400 notice_invalid, 42501 403, 22023 404, and a conflict as the api’s try_again', async () => {
    for (const [sqlstate, status, code] of [
      ['HF007', 409, 'notice_changed'],
      ['HF008', 400, 'notice_invalid'],
      ['42501', 403, 'forbidden'],
      ['22023', 404, 'not_found'],
    ] as const) {
      const pool = org({ call: pgError(sqlstate) })
      const c = context(pool)
      expect(await refusal(publishNotice(c.api, publish(), session(), c.info)), sqlstate).toMatchObject({
        status,
        code,
      })
      expect(appended(pool.statements)).toEqual([])
      expect(pool.texts().at(-1)).toBe('rollback')
    }
    const conflict = context(org({ call: pgError('40P01') }))
    const error = await publishNotice(conflict.api, publish(), session(), conflict.info).then(
      () => undefined,
      (e: unknown) => e,
    )
    expect(error).not.toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ code: '40P01' })
    // Every code only the notice answers is one of these.
    expect([...NOTICE_ERRORS]).toEqual(['notice_required', 'notice_changed', 'notice_invalid'])
  })
})

describe('NTS-02 C0.9 OD-10 PD-70 GET /api/admin/notice/contact', () => {
  const generated = (dpo_settings_version: number | null, generator: string | null = NOTICE_GENERATOR) => ({
    id: V0,
    version: 0,
    generator,
    body: generator === null ? 'A stand-in' : BODY,
    dpo_settings_version,
  })

  it('answers the current contact, whether the published notice is up to date, and whether the latest version prints it, in a read-only transaction', async () => {
    for (const [world, stated, notice, targetsStated] of [
      // No version yet.
      [{}, 'unpublished', 'none', 'unpublished'],
      // The latest generated version links the current settings version.
      [{ latest: generated(1) }, 'stated', 'out_of_date', 'stated'],
      // A version, but no contact recorded: nothing can be printed (a version links one only once
      // one exists), and no targets are recorded either.
      [{ latest: generated(null, null), settings: [] }, 'not_printed', 'out_of_date', 'not_printed'],
      // A contact recorded after a c09.1 latest, or a stand-in: not printed, never an earlier one.
      [{ latest: generated(null, 'c09.1') }, 'not_printed', 'out_of_date', 'not_printed'],
      [{ latest: generated(null, null) }, 'not_printed', 'out_of_date', 'not_printed'],
      // The latest prints an earlier contact, with the same targets.
      [
        {
          latest: generated(1),
          settings: [
            { version: 1, ...CONTACT },
            { version: 2, ...CONTACT, title: 'Privacy Office' },
          ],
        },
        'not_stated',
        'out_of_date',
        'stated',
      ],
      // C0.9 PD-95: a c09.2 latest prints the contact and no targets, whatever its row reads.
      [{ latest: generated(1, 'c09.2') }, 'stated', 'out_of_date', 'not_printed'],
    ] as const) {
      const pool = org(world)
      const c = context(pool)
      const answer = ContactAdminResponse.parse((await readContactAdmin(c.api, session(), c.info)).body)
      expect(answer.stated, JSON.stringify(world)).toBe(stated)
      expect(answer.notice, JSON.stringify(world)).toBe(notice)
      expect(answer.targetsStated, JSON.stringify(world)).toBe(targetsStated)
      const settings: readonly SettingsRow[] = 'settings' in world ? world.settings : [{ version: 1, ...CONTACT }]
      const current = settings.at(-1)
      expect(answer.contact).toEqual(
        current === undefined ? null : { ...current, recordedOn: '2026-10-20', recordedBy: 'Ashton Tan' },
      )
      // The targets kept with the contact (C0.9 PD-94), beside it, never in its row.
      expect(answer.targets).toEqual(current === undefined ? null : { businessDays: 10, calendarDays: 30 })
      expect(pool.texts()[0]).toBe('start transaction isolation level read committed read only')
      // One read of the current contact, which the draft and the answer share.
      expect(pool.texts().filter(text => text.startsWith('select s.version, s.contact_title'))).toHaveLength(1)
    }
  })

  const TARGETS = { businessDays: 10, calendarDays: 30 }
  const latestOf = (
    generated: boolean,
    contact: typeof CONTACT | null,
    targets: { businessDays: number; calendarDays: number } | null = null,
  ) => ({
    generated,
    sources: {
      generator: generated ? NOTICE_GENERATOR : null,
      body: 'Words',
      purposes: [],
      clearances: [],
      contact: contact === null ? null : { version: 1, facts: contact },
      targets,
    },
  })

  it('C0.9 PD-95: reads stated only from a generated latest that printed the current contact’s facts, whatever settings version holds them', () => {
    expect(contactStated(null, CONTACT)).toBe('unpublished')
    expect(contactStated(null, null)).toBe('unpublished')
    expect(contactStated(latestOf(true, CONTACT), CONTACT)).toBe('stated')
    // A stand-in prints no contact, whatever it links.
    expect(contactStated(latestOf(false, CONTACT), CONTACT)).toBe('not_printed')
    expect(contactStated(latestOf(true, null), CONTACT)).toBe('not_printed')
    expect(contactStated(latestOf(true, CONTACT), { ...CONTACT, title: 'Privacy Office' })).toBe('not_stated')
    expect(contactStated(latestOf(true, null), null)).toBe('not_printed')
  })

  it('C0.9 PD-94 PD-95: targetsStated takes the same four states, from what the latest printed', () => {
    expect(targetsStated(null, TARGETS)).toBe('unpublished')
    expect(targetsStated(null, null)).toBe('unpublished')
    expect(targetsStated(latestOf(true, CONTACT, TARGETS), TARGETS)).toBe('stated')
    // A stand-in, or a version whose generator printed none (its sources' targets are null).
    expect(targetsStated(latestOf(false, null, TARGETS), TARGETS)).toBe('not_printed')
    expect(targetsStated(latestOf(true, CONTACT, null), TARGETS)).toBe('not_printed')
    expect(targetsStated(latestOf(true, CONTACT, TARGETS), null)).toBe('not_printed')
    expect(targetsStated(latestOf(true, CONTACT, TARGETS), { businessDays: 7, calendarDays: 30 })).toBe('not_stated')
  })

  it('C0.9 PD-95 RQI-12: a change to the targets alone keeps the contact stated, while the targets read not stated', async () => {
    const pool = org({
      latest: generated(1),
      settings: [
        { version: 1, ...CONTACT },
        { version: 2, ...CONTACT, targets: { businessDays: 7, calendarDays: 30 } },
      ],
    })
    const c = context(pool)
    const answer = ContactAdminResponse.parse((await readContactAdmin(c.api, session(), c.info)).body)
    expect(answer).toMatchObject({
      stated: 'stated',
      targets: { businessDays: 7, calendarDays: 30 },
      targetsStated: 'not_stated',
    })
    expect(answer.contact?.version).toBe(2)
  })

  it('refuses everyone but the DPO, and a stale PIN, before reading the contact or the registers', async () => {
    for (const [who, fresh, code] of [
      [OWNER, true, 'forbidden'],
      [DPO, false, 'reauth_required'],
    ] as const) {
      const pool = org({ fresh })
      const c = context(pool)
      expect(await refusal(readContactAdmin(c.api, session(who), c.info)), who).toMatchObject({ status: 403, code })
      const read = pool.texts().filter(text => !text.startsWith('select x.person'))
      expect(read.some(text => /dpo_settings|notice_versions|processing_register/.test(text))).toBe(false)
    }
    // PD-44 OD-10: before any version, the DPO reads it (NOTICE_SETUP); an Owner is sent to the notice.
    const before = context(org({ standing: 'unpublished' }))
    expect(ContactAdminResponse.parse((await readContactAdmin(before.api, session(), before.info)).body).stated).toBe(
      'unpublished',
    )
    const owner = context(org({ standing: 'unpublished' }))
    expect(await refusal(readContactAdmin(owner.api, session(OWNER), owner.info))).toMatchObject({
      code: 'notice_required',
    })
  })
})

describe('NTS-02 C0.9 OD-19 PD-76 GET /api/admin/notice/people', () => {
  const person = (n: number, change: Record<string, unknown> = {}) => ({
    id: `b0000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    name: `Person ${n}`,
    department: 'Operations',
    manager: 'Ashton Tan',
    added_on: '2026-10-01',
    ...change,
  })

  it('lists every person still at the organisation but the DPO, by name, department, manager and day added, with today and the latest version, and nothing else', async () => {
    const pool = org({ people: [person(8), person(10, { department: null, manager: null })] })
    const c = context(pool)
    const answer = NoticePeopleResponse.parse((await readNoticePeople(c.api, session(), c.info)).body)
    expect(answer).toEqual({
      today: '2026-10-22',
      latest: { notice: V1, version: 1, publishedOn: '2026-10-21' },
      people: [
        {
          id: MEMBER,
          name: 'Person 8',
          department: 'Operations',
          manager: 'Ashton Tan',
          addedOn: '2026-10-01',
        },
        {
          id: 'b0000000-0000-4000-8000-000000000010',
          name: 'Person 10',
          department: null,
          manager: null,
          addedOn: '2026-10-01',
        },
      ],
      more: false,
    })
    const texts = pool.texts()
    expect(texts[0]).toBe('start transaction isolation level read committed read only')
    const read = pool.statements.find(statement => statement.text.startsWith('select p.id, p.full_name as name'))
    // Only people still here, never the reader, in name order with one more than the most it answers.
    expect(read?.text).toMatch(/where p\.org_id = \$1 and p\.deactivated_at is null and p\.id <> \$2/)
    expect(read?.text).toMatch(/order by p\.full_name collate "C", p\.id limit \$3$/)
    expect(read?.values).toEqual([ORG, DPO, NOTICE_PEOPLE_MAX + 1])
    // Roster facts only: no number, device or acknowledgement is read for them.
    expect(read?.text).not.toMatch(/phone_numbers|devices|notice_acknowledgments|e164/)
    expect(texts.join(' ')).not.toMatch(/\bfor (share|update|no key update)\b/)
  })

  it('says when there were more than it lists, so a cut list is never silent', async () => {
    const many = Array.from({ length: NOTICE_PEOPLE_MAX + 1 }, (_, i) => person(i + 100))
    const c = context(org({ people: many }))
    const answer = NoticePeopleResponse.parse((await readNoticePeople(c.api, session(), c.info)).body)
    expect(answer.people).toHaveLength(NOTICE_PEOPLE_MAX)
    expect(answer.more).toBe(true)
    const exactly = context(org({ people: many.slice(0, NOTICE_PEOPLE_MAX) }))
    expect(NoticePeopleResponse.parse((await readNoticePeople(exactly.api, session(), exactly.info)).body).more).toBe(
      false,
    )
  })

  it('refuses everyone but the DPO and a stale PIN, before v0 too (not a setup use: PD-44), and answers 403 notice_required with no version, as the gate would', async () => {
    for (const [who, fresh, code] of [
      [OWNER, true, 'forbidden'],
      [DPO, false, 'reauth_required'],
    ] as const) {
      const pool = org({ fresh, people: [person(8)] })
      const c = context(pool)
      expect(await refusal(readNoticePeople(c.api, session(who), c.info)), who).toMatchObject({ status: 403, code })
      expect(pool.texts().some(text => text.startsWith('select p.id, p.full_name'))).toBe(false)
    }
    const before = context(org({ standing: 'unpublished', people: [person(8)] }))
    expect(await refusal(readNoticePeople(before.api, session(), before.info))).toMatchObject({
      status: 403,
      code: 'notice_required',
    })
    const none = org({
      people: [person(8)],
      head: { today: '2026-10-22', id: null, version: null, published_on: null },
    })
    const c = context(none)
    expect(await refusal(readNoticePeople(c.api, session(), c.info))).toMatchObject({
      status: 403,
      code: 'notice_required',
    })
    expect(none.texts().some(text => text.startsWith('select p.id, p.full_name'))).toBe(false)
  })
})

describe('NTS-07 C0.9 OD-19 PD-75 PD-76 POST /api/admin/notice/acknowledgements/record', () => {
  const record = (input: Record<string, unknown> = {}) =>
    parse(RecordAcknowledgementBody, {
      person: MEMBER,
      notice: V1,
      acknowledgedOn: '2026-10-21',
      note: 'Signed a printed copy at induction',
      ...input,
    })

  it('records through record_notice_acknowledgement() on the session’s device, appending notice.acknowledged naming the person only when something was recorded, the DPO acting', async () => {
    for (const changed of [true, false]) {
      const pool = org({ call: [{ version: 1, changed }] })
      const c = context(pool)
      const answer = await recordAcknowledgement(c.api, record(), session(), c.info)
      expect(AcknowledgeResponse.parse(answer.body)).toEqual({ version: 1, changed })
      const call = callOf(pool, 'record_notice_acknowledgement')
      expect(call?.text).toBe(
        'select version, changed from public.record_notice_acknowledgement($1::uuid, $2::uuid, $3::date, $4, $5, $6::uuid, $7::inet)',
      )
      expect(call?.values).toEqual([
        MEMBER,
        V1,
        '2026-10-21',
        'Signed a printed copy at induction',
        c.info.requestId,
        DEVICE,
        c.info.ip,
      ])
      expect(appended(pool.statements)).toEqual(
        changed
          ? [
              {
                type: 'notice.acknowledged',
                entity: MEMBER,
                subjects: [MEMBER],
                ids: { notice: V1, version: 1 },
                actor: undefined,
              },
            ]
          : [],
      )
      // can() first, after the acting session is re-read FOR SHARE; the function reads the person.
      const texts = pool.texts()
      const acting = texts.findIndex(text => text.includes('from people p join devices d'))
      expect(texts[acting]).toMatch(/for share of p, d, s/)
      expect(acting).toBeLessThan(texts.findIndex(text => text.includes('record_notice_acknowledgement(')))
      expect(texts.at(-1)).toBe('commit')
    }
  })

  it('refuses through can() yourself, someone who has left, another org’s person or an unknown id, an Owner and a stale PIN, before the function is called', async () => {
    for (const [who, person, fresh, code] of [
      [DPO, DPO, true, 'forbidden'],
      [DPO, LEFT, true, 'forbidden'],
      [DPO, ELSEWHERE, true, 'forbidden'],
      [OWNER, MEMBER, true, 'forbidden'],
      [DPO, MEMBER, false, 'reauth_required'],
    ] as const) {
      const pool = org({ fresh, call: [{ version: 1, changed: true }] })
      const c = context(pool)
      expect(
        await refusal(recordAcknowledgement(c.api, record({ person }), session(who), c.info)),
        `${who} ${person}`,
      ).toMatchObject({ status: 403, code })
      expect(callOf(pool, 'record_notice_acknowledgement')).toBeUndefined()
      expect(appended(pool.statements)).toEqual([])
    }
  })

  it('PD-65: a note with wording Hearth keeps off its screens is 400 notice_invalid before the function, after can()', async () => {
    for (const note of ['Ask at reception for the copy', 'Signed with the agent present', 'AI\nreviewed']) {
      const pool = org({ call: [{ version: 1, changed: true }] })
      const c = context(pool)
      expect(await refusal(recordAcknowledgement(c.api, record({ note }), session(), c.info)), note).toMatchObject({
        status: 400,
        code: 'notice_invalid',
      })
      expect(pool.texts().some(text => text.startsWith('select "person_id", "role"'))).toBe(true)
      expect(callOf(pool, 'record_notice_acknowledgement')).toBeUndefined()
    }
  })

  it('a control character in the note, a NUL above all (which Postgres can’t take as text, 22021), is 400 notice_invalid before the function, after can()', async () => {
    for (const note of ['Signed a printed\u0000copy', '\u0000', 'Signed a\tprinted copy', 'Signed\u007fcopy']) {
      const pool = org({ call: [{ version: 1, changed: true }] })
      const c = context(pool)
      expect(
        await refusal(recordAcknowledgement(c.api, record({ note }), session(), c.info)),
        JSON.stringify(note),
      ).toMatchObject({ status: 400, code: 'notice_invalid' })
      expect(pool.texts().some(text => text.startsWith('select "person_id", "role"'))).toBe(true)
      expect(callOf(pool, 'record_notice_acknowledgement')).toBeUndefined()
    }
    // Whitespace at the ends is the function's to trim, as before.
    const pool = org({ call: [{ version: 1, changed: true }] })
    const c = context(pool)
    await recordAcknowledgement(c.api, record({ note: '\tSigned a printed copy\n' }), session(), c.info)
    expect(callOf(pool, 'record_notice_acknowledgement')?.values[3]).toBe('\tSigned a printed copy\n')
  })

  it('answers the function’s refusals: HF007 409 notice_changed, HF008 400 notice_invalid, 22023 404, 42501 403 in the api’s own words, and a conflict as the api’s try_again', async () => {
    for (const [sqlstate, status, code] of [
      ['HF007', 409, 'notice_changed'],
      ['HF008', 400, 'notice_invalid'],
      ['22023', 404, 'not_found'],
      ['42501', 403, 'forbidden'],
    ] as const) {
      const pool = org({ call: pgError(sqlstate) })
      const c = context(pool)
      const error = await refusal(recordAcknowledgement(c.api, record(), session(), c.info))
      expect(error, sqlstate).toMatchObject({ status, code })
      // Never the session's end: the DPO's session is fine.
      expect(error.clear).toEqual([])
      expect(appended(pool.statements)).toEqual([])
      expect(pool.texts().at(-1)).toBe('rollback')
    }
    const conflict = context(org({ call: pgError('55P03') }))
    const error = await recordAcknowledgement(conflict.api, record(), session(), conflict.info).then(
      () => undefined,
      (e: unknown) => e,
    )
    expect(error).not.toBeInstanceOf(ApiError)
  })

  it('reads the body strictly: ids lower case, a day, and a note of at most 2,000 units (the function bounds it at 500)', () => {
    for (const input of [
      { person: MEMBER.toUpperCase() },
      { notice: 'not-a-version' },
      { acknowledgedOn: '21 October 2026' },
      { acknowledgedOn: '0000-01-01' },
      { note: 'x'.repeat(2001) },
      { device: DEVICE },
    ]) {
      expect(() => record(input), JSON.stringify(input)).toThrow(ApiError)
    }
    expect(record({ note: '  Signed  ' }).note).toBe('  Signed  ')
  })
})
