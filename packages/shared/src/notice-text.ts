// The privacy notice's words (PDPA-02; C0.9 PD-33, PD-35, PD-36, PD-53, PD-58, PD-60, PD-62, from
// PR 3a PD-67, PD-68, PD-73, PD-74 and PD-86, and from PR 3b PD-95 and PD-105; TECH-SPEC T22 items
// 22 to 25): generateNotice() writes a version's body from the registers and the DPO's business
// contact and reply targets, and noticeProblems() and noticeWarnings() say what holds publishing
// back and what it warns of; withdrawalReply() writes the reply the DPO may copy for a withdrawal
// (PDPA-04), from the published version's purposes, beside the bases' words here. It is
// pure and deterministic, so the same registers always give the same words and the DPO's preview is
// what gets published: the publish route regenerates the draft and compares digests. Only the
// server runs it; the web imports it in tests. NOTICE_GENERATOR names this code's output: any change
// to the words, however small, takes a new id, which notice-text.test.ts pins (NTG-09), so each
// version records which words wrote it, and the DPO's tab shows the notice out of date.
//
// The copy is British, short and active (CLAUDE.md, Conventions), never "ask", "I agree" or an AI
// word (decision 8, AI_COPY), and its verb is "acknowledge": acknowledging records that people
// were told, and it isn't consent (D28, PRD §8.18). The DPO confirms OD-04's paragraph, the
// production-access paragraph, the "doesn't do" clauses and every basis's wording (C0.9 PD-53),
// and from c09.2 the wording of deemed consent by conduct and of "If you withdraw consent" (PD-73)
// and of "Your rights", which prints the DPO's contact (PD-74), and from c09.3 the words of "Your
// rights" that name the form and state the reply targets, of the withdraw branch's way to withdraw
// (PD-95), and of the withdrawal reply (PD-105).
//
// The server loads this file on Node (T2), and the package compiles with lib ES2024 and no DOM or
// Node types.
import { aiCopyIn } from './ai-copy.ts'
import { formatCaseReference, parseCaseReference } from './cases.ts'
import { type DpoContact, flatText, postalOneLine, type ReplyTargets, targetsProblems } from './dpo-contact.ts'
import {
  NOTICE_FREE_TEXT_FIELDS,
  NOTICE_LINE,
  NOTICE_PROBLEMS,
  NOTICE_WARNINGS,
  type NoticeFacts,
  type NoticeFreeTextField,
  type NoticeProblem,
  type NoticeSources,
  type NoticeWarning,
  sameNoticeFacts,
} from './notice.ts'
import {
  type AI_PROVIDERS,
  isAiProvider,
  isAiPurpose,
  PROVIDERS,
  type ProviderKey,
  PURPOSE_KEYS,
  PURPOSES,
  type PurposeKey,
} from './purposes.ts'
import {
  BASIS_NEEDS,
  type Basis,
  CONDUCT_WITHDRAWABLE,
  isNoticeHeldBasis,
  type NOTICE_HELD_BASES,
  type PurposeStatus,
} from './registers.ts'

// The id of the words below. A new id with any change to the output (NTG-09). c09.2 (C0.9 PR 3a)
// prints the DPO's contact under "Your rights" and states deemed consent by conduct. c09.3 (C0.9 PR
// 3b) names the form in Settings › Privacy and states the DPO's reply targets.
export const NOTICE_GENERATOR = 'c09.3'

// --- What the generator reads (TECH-SPEC T22 item 23) ------------------------------------------

// A purpose's current register entry (its highest version).
export interface NoticePurpose {
  key: PurposeKey
  version: number
  status: PurposeStatus
  basis: Basis | null
  basisReference: string | null
  retention: string | null
  providers: readonly ProviderKey[]
}

// A provider's open clearance: its id, and the facts snapshot it rests on. The review date is
// read for the review-due warning; the notice doesn't print it.
export interface NoticeClearance {
  id: string
  provider: ProviderKey
  facts: NoticeFacts
  reviewOn: string | null
}

// Everything a draft is written from, read in one transaction: the org's name, the current entry
// of every purpose outside the AI layer (planned ones are left out of the notice), every open
// clearance of a provider outside it, and the DPO's current settings version with its business
// contact (C0.9 OD-10, OD-11; null until the DPO records one) and, from C0.9 PR 3b, the reply
// targets kept with it (OD-08, PD-94), which every settings version holds from 0012.
export interface NoticeInput {
  org: string
  purposes: readonly NoticePurpose[]
  clearances: readonly NoticeClearance[]
  contact: (DpoContact & { version: number; targets: ReplyTargets }) | null
}

// --- Fixed words ------------------------------------------------------------------------------

export const NOTICE_SECTIONS = {
  about: 'About this notice',
  purposes: 'Why your data is processed',
  retired: 'No longer in use',
  withdraw: 'If you withdraw consent',
  doesNot: "What Hearth doesn't do",
  providers: 'Who else receives your data',
  firstCode: 'Your first sign-in code',
  production: 'Access to production systems',
  rights: 'Your rights',
} as const

// How the notice names each provider outside the AI layer (PDPA-10's entries).
type NonAiProviderKey = Exclude<ProviderKey, (typeof AI_PROVIDERS)[number]>
export const NOTICE_PROVIDER_NAMES = {
  aws: 'Amazon Web Services',
  aws_sms: 'Amazon Web Services End User Messaging',
  twilio: 'Twilio Verify',
  livekit: 'LiveKit Cloud',
  apple_push: 'Apple Push Notification service',
  google_fcm: 'Firebase Cloud Messaging (Google)',
  mozilla_push: 'Mozilla Push Service',
  microsoft_wns: 'Windows Push Notification Services (Microsoft)',
} as const satisfies Record<NonAiProviderKey, string>

// What Hearth doesn't do (decision 5; C0.9 PD-35, PD-58): each clause with the purposes that would
// make it false. A clause is left out once any of its purposes is active, and the section once no
// clause is left, so no clause ever contradicts a purpose the same notice lists. Until A0 every
// purpose of the last two is AI, never active, so both always print (decision 5). The clauses avoid
// the word "AI" (decision 8): the last says what those features would do without naming them.
// Every purpose is in exactly one clause or in DOES_NOT_EXEMPT, with its reason (NTG-10), so a new
// purpose forces a decision.
export const DOES_NOT = [
  { clause: 'record calls, meetings or drop-in rooms', purposes: ['recording_meetings', 'recording_drop_in'] },
  {
    clause: 'transcribe anything',
    purposes: ['transcription', 'voice_message_transcription', 'transcription_test_set'],
  },
  {
    clause: 'summarise what you write or draft text from it',
    purposes: ['meeting_notes', 'org_brain', 'ai_writing', 'people_inference', 'assistant', 'agents'],
  },
] as const satisfies readonly { clause: string; purposes: readonly PurposeKey[] }[]

const LISTED_WHEN_ACTIVE = 'listed as a purpose when active; the notice makes no claim that Hearth doesn’t do it'
export const DOES_NOT_EXEMPT = {
  accounts: LISTED_WHEN_ACTIVE,
  content_delivery: LISTED_WHEN_ACTIVE,
  service_operation: LISTED_WHEN_ACTIVE,
  security_audit: LISTED_WHEN_ACTIVE,
  access_logs: LISTED_WHEN_ACTIVE,
  backups: LISTED_WHEN_ACTIVE,
  request_handling: LISTED_WHEN_ACTIVE,
  presence_receipts: LISTED_WHEN_ACTIVE,
  session_slides: LISTED_WHEN_ACTIVE,
  session_sharing: LISTED_WHEN_ACTIVE,
  people_insights: LISTED_WHEN_ACTIVE,
  sensitive_data_detection: 'listed as a purpose once active (PDPA-17)',
  ai_cost_figures: 'cost control: it reads no content',
} as const satisfies Partial<Record<PurposeKey, string>>

// --- Lines --------------------------------------------------------------------------------------

// One line of the body, written as a template whose values are free text, each flattened to one
// line (flatText(), dpo-contact.ts). It always starts with the generator's own words, never with a
// value, so nothing the DPO types can begin a line and pass for a heading or an item (C0.9 PD-33).
function line(fixed: TemplateStringsArray, ...free: readonly string[]): string {
  const start = fixed[0] ?? ''
  if (!/^\S/u.test(start)) throw new Error('A notice line starts with the generator’s own words')
  return free.reduce((text, value, index) => `${text}${flatText(value)}${fixed[index + 1] ?? ''}`, start)
}

// A sentence that ends with free text, closed with a full stop unless the text closes itself.
const sentence = (text: string) => (/[.!?…]["'”’)\]]*$/u.test(text) ? text : `${text}.`)

// "a", "a and b", "a, b and c" (British: no comma before "and").
function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`
}

// Country names in British English, falling back to the code for one the table doesn't name. A
// fixed table, never the runtime's ICU, so the words depend only on what the generator reads and a
// Node upgrade renames no country (NTG-09): it holds every code ICU 78.3 (CLDR 48) named in en-GB
// when c09.1 was written, as it named them, so moving to it changed no output. A change to it is a
// change to the output, which takes a new NOTICE_GENERATOR.
export const NOTICE_COUNTRY_NAMES: Readonly<Record<string, string>> = {
  AC: 'Ascension Island',
  AD: 'Andorra',
  AE: 'United Arab Emirates',
  AF: 'Afghanistan',
  AG: 'Antigua & Barbuda',
  AI: 'Anguilla',
  AL: 'Albania',
  AM: 'Armenia',
  AN: 'Curaçao',
  AO: 'Angola',
  AQ: 'Antarctica',
  AR: 'Argentina',
  AS: 'American Samoa',
  AT: 'Austria',
  AU: 'Australia',
  AW: 'Aruba',
  AX: 'Åland Islands',
  AZ: 'Azerbaijan',
  BA: 'Bosnia & Herzegovina',
  BB: 'Barbados',
  BD: 'Bangladesh',
  BE: 'Belgium',
  BF: 'Burkina Faso',
  BG: 'Bulgaria',
  BH: 'Bahrain',
  BI: 'Burundi',
  BJ: 'Benin',
  BL: 'St Barthélemy',
  BM: 'Bermuda',
  BN: 'Brunei',
  BO: 'Bolivia',
  BQ: 'Caribbean Netherlands',
  BR: 'Brazil',
  BS: 'Bahamas',
  BT: 'Bhutan',
  BU: 'Myanmar (Burma)',
  BV: 'Bouvet Island',
  BW: 'Botswana',
  BY: 'Belarus',
  BZ: 'Belize',
  CA: 'Canada',
  CC: 'Cocos (Keeling) Islands',
  CD: 'Congo - Kinshasa',
  CF: 'Central African Republic',
  CG: 'Congo - Brazzaville',
  CH: 'Switzerland',
  CI: 'Côte d’Ivoire',
  CK: 'Cook Islands',
  CL: 'Chile',
  CM: 'Cameroon',
  CN: 'China',
  CO: 'Colombia',
  CP: 'Clipperton Island',
  CQ: 'Sark',
  CR: 'Costa Rica',
  CS: 'Serbia',
  CU: 'Cuba',
  CV: 'Cape Verde',
  CW: 'Curaçao',
  CX: 'Christmas Island',
  CY: 'Cyprus',
  CZ: 'Czechia',
  DD: 'Germany',
  DE: 'Germany',
  DG: 'Diego Garcia',
  DJ: 'Djibouti',
  DK: 'Denmark',
  DM: 'Dominica',
  DO: 'Dominican Republic',
  DY: 'Benin',
  DZ: 'Algeria',
  EA: 'Ceuta & Melilla',
  EC: 'Ecuador',
  EE: 'Estonia',
  EG: 'Egypt',
  EH: 'Western Sahara',
  ER: 'Eritrea',
  ES: 'Spain',
  ET: 'Ethiopia',
  EU: 'European Union',
  EZ: 'Eurozone',
  FI: 'Finland',
  FJ: 'Fiji',
  FK: 'Falkland Islands',
  FM: 'Micronesia',
  FO: 'Faroe Islands',
  FR: 'France',
  FX: 'France',
  GA: 'Gabon',
  GB: 'United Kingdom',
  GD: 'Grenada',
  GE: 'Georgia',
  GF: 'French Guiana',
  GG: 'Guernsey',
  GH: 'Ghana',
  GI: 'Gibraltar',
  GL: 'Greenland',
  GM: 'Gambia',
  GN: 'Guinea',
  GP: 'Guadeloupe',
  GQ: 'Equatorial Guinea',
  GR: 'Greece',
  GS: 'South Georgia & South Sandwich Islands',
  GT: 'Guatemala',
  GU: 'Guam',
  GW: 'Guinea-Bissau',
  GY: 'Guyana',
  HK: 'Hong Kong SAR China',
  HM: 'Heard & McDonald Islands',
  HN: 'Honduras',
  HR: 'Croatia',
  HT: 'Haiti',
  HU: 'Hungary',
  HV: 'Burkina Faso',
  IC: 'Canary Islands',
  ID: 'Indonesia',
  IE: 'Ireland',
  IL: 'Israel',
  IM: 'Isle of Man',
  IN: 'India',
  IO: 'British Indian Ocean Territory',
  IQ: 'Iraq',
  IR: 'Iran',
  IS: 'Iceland',
  IT: 'Italy',
  JE: 'Jersey',
  JM: 'Jamaica',
  JO: 'Jordan',
  JP: 'Japan',
  KE: 'Kenya',
  KG: 'Kyrgyzstan',
  KH: 'Cambodia',
  KI: 'Kiribati',
  KM: 'Comoros',
  KN: 'St Kitts & Nevis',
  KP: 'North Korea',
  KR: 'South Korea',
  KW: 'Kuwait',
  KY: 'Cayman Islands',
  KZ: 'Kazakhstan',
  LA: 'Laos',
  LB: 'Lebanon',
  LC: 'St Lucia',
  LI: 'Liechtenstein',
  LK: 'Sri Lanka',
  LR: 'Liberia',
  LS: 'Lesotho',
  LT: 'Lithuania',
  LU: 'Luxembourg',
  LV: 'Latvia',
  LY: 'Libya',
  MA: 'Morocco',
  MC: 'Monaco',
  MD: 'Moldova',
  ME: 'Montenegro',
  MF: 'St Martin',
  MG: 'Madagascar',
  MH: 'Marshall Islands',
  MK: 'North Macedonia',
  ML: 'Mali',
  MM: 'Myanmar (Burma)',
  MN: 'Mongolia',
  MO: 'Macao SAR China',
  MP: 'Northern Mariana Islands',
  MQ: 'Martinique',
  MR: 'Mauritania',
  MS: 'Montserrat',
  MT: 'Malta',
  MU: 'Mauritius',
  MV: 'Maldives',
  MW: 'Malawi',
  MX: 'Mexico',
  MY: 'Malaysia',
  MZ: 'Mozambique',
  NA: 'Namibia',
  NC: 'New Caledonia',
  NE: 'Niger',
  NF: 'Norfolk Island',
  NG: 'Nigeria',
  NH: 'Vanuatu',
  NI: 'Nicaragua',
  NL: 'Netherlands',
  NO: 'Norway',
  NP: 'Nepal',
  NR: 'Nauru',
  NU: 'Niue',
  NZ: 'New Zealand',
  OM: 'Oman',
  PA: 'Panama',
  PE: 'Peru',
  PF: 'French Polynesia',
  PG: 'Papua New Guinea',
  PH: 'Philippines',
  PK: 'Pakistan',
  PL: 'Poland',
  PM: 'St Pierre & Miquelon',
  PN: 'Pitcairn Islands',
  PR: 'Puerto Rico',
  PS: 'Palestinian Territories',
  PT: 'Portugal',
  PW: 'Palau',
  PY: 'Paraguay',
  QA: 'Qatar',
  QO: 'Outlying Oceania',
  RE: 'Réunion',
  RH: 'Zimbabwe',
  RO: 'Romania',
  RS: 'Serbia',
  RU: 'Russia',
  RW: 'Rwanda',
  SA: 'Saudi Arabia',
  SB: 'Solomon Islands',
  SC: 'Seychelles',
  SD: 'Sudan',
  SE: 'Sweden',
  SG: 'Singapore',
  SH: 'St Helena',
  SI: 'Slovenia',
  SJ: 'Svalbard & Jan Mayen',
  SK: 'Slovakia',
  SL: 'Sierra Leone',
  SM: 'San Marino',
  SN: 'Senegal',
  SO: 'Somalia',
  SR: 'Suriname',
  SS: 'South Sudan',
  ST: 'São Tomé & Príncipe',
  SU: 'Russia',
  SV: 'El Salvador',
  SX: 'Sint Maarten',
  SY: 'Syria',
  SZ: 'Eswatini',
  TA: 'Tristan da Cunha',
  TC: 'Turks & Caicos Islands',
  TD: 'Chad',
  TF: 'French Southern Territories',
  TG: 'Togo',
  TH: 'Thailand',
  TJ: 'Tajikistan',
  TK: 'Tokelau',
  TL: 'Timor-Leste',
  TM: 'Turkmenistan',
  TN: 'Tunisia',
  TO: 'Tonga',
  TP: 'Timor-Leste',
  TR: 'Türkiye',
  TT: 'Trinidad & Tobago',
  TV: 'Tuvalu',
  TW: 'Taiwan',
  TZ: 'Tanzania',
  UA: 'Ukraine',
  UG: 'Uganda',
  UK: 'United Kingdom',
  UM: 'US Outlying Islands',
  UN: 'United Nations',
  US: 'United States',
  UY: 'Uruguay',
  UZ: 'Uzbekistan',
  VA: 'Vatican City',
  VC: 'St Vincent & the Grenadines',
  VD: 'Vietnam',
  VE: 'Venezuela',
  VG: 'British Virgin Islands',
  VI: 'US Virgin Islands',
  VN: 'Vietnam',
  VU: 'Vanuatu',
  WF: 'Wallis & Futuna',
  WS: 'Samoa',
  XA: 'Pseudo-Accents',
  XB: 'Pseudo-Bidi',
  XK: 'Kosovo',
  YD: 'Yemen',
  YE: 'Yemen',
  YT: 'Mayotte',
  YU: 'Serbia',
  ZA: 'South Africa',
  ZM: 'Zambia',
  ZR: 'Congo - Kinshasa',
  ZW: 'Zimbabwe',
  ZZ: 'Unknown Region',
}
function countryName(code: string): string {
  return (Object.hasOwn(NOTICE_COUNTRY_NAMES, code) ? NOTICE_COUNTRY_NAMES[code] : undefined) ?? code
}
const countries = (codes: readonly string[]) => joinList(codes.map(code => countryName(flatText(code))))

// Text counts as recorded once it holds more than whitespace, as the registers count it.
const recorded = (text: string | null): text is string => text !== null && text.trim() !== ''

type Block = readonly string[]
const section = (title: string): Block => [`${NOTICE_LINE.section}${title}`]
const entry = (title: string): Block => [`${NOTICE_LINE.entry}${title}`]
const paragraph = (text: string): Block => [text]
const list = (items: readonly string[]): Block => items.map(item => `${NOTICE_LINE.item}${item}`)

// --- The input, checked -------------------------------------------------------------------------

// The org's name as the notice and the withdrawal reply print it, on one line. The DPO can't change
// it, so a name holding wording Hearth keeps off its screens (AI_COPY, decision 8) isn't refused at
// publish, which would stop the org from ever publishing (C0.9 PD-62). The bootstrap and C0.16's org
// settings refuse such a name; until they exist the words say "your organisation" instead.
function orgName(org: string): string {
  const named = flatText(org)
  if (named === '') throw new Error('A notice names its organisation')
  return aiCopyIn(named) === undefined ? named : 'your organisation'
}

interface Read {
  org: string
  active: readonly NoticePurpose[]
  retired: readonly NoticePurpose[]
  clearances: readonly NoticeClearance[]
  contact: DpoContact
  targets: ReplyTargets
}

const byPurpose = (a: NoticePurpose, b: NoticePurpose) => PURPOSE_KEYS.indexOf(a.key) - PURPOSE_KEYS.indexOf(b.key)
const byProvider = (a: ProviderKey, b: ProviderKey) => PROVIDERS.indexOf(a) - PROVIDERS.indexOf(b)

// What generateNotice() can't write is a bug in its caller, never something to publish: an AI
// purpose or provider (D41; the server reads neither), the same purpose or provider twice, an entry
// that noticeProblems() holds back (no basis or no retention, or a basis no version can state yet),
// or no contact for the DPO (dpo_contact_pending), so the server asks for problems first. A contact
// always comes with its reply targets from 0012, in their range, which the notice states as whole
// numbers of days, so a contact without them is a bug in the caller too.
function read(input: NoticeInput): Read {
  const contact = input.contact
  if (
    contact === null ||
    !recorded(contact.title) ||
    ![contact.email, contact.phone, contact.postal].some(channel => recorded(channel))
  ) {
    throw new Error('A notice gives the Data Protection Officer’s contact')
  }
  const targets: ReplyTargets | null | undefined = contact.targets
  if (targets === undefined || targets === null || targetsProblems(targets).length > 0) {
    throw new Error('A notice states the Data Protection Officer’s reply targets, in their range')
  }
  const org = orgName(input.org)
  const purposes = new Set<PurposeKey>()
  for (const purpose of input.purposes) {
    if (isAiPurpose(purpose.key)) throw new Error(`${purpose.key} is an AI purpose, never in the notice before A0`)
    if (purposes.has(purpose.key)) throw new Error(`${purpose.key} is in the input twice`)
    purposes.add(purpose.key)
    for (const provider of purpose.providers) {
      if (isAiProvider(provider)) throw new Error(`${purpose.key} lists ${provider}, an AI provider`)
    }
    if (purpose.status === 'planned') continue
    if (purpose.status === 'active' && (purpose.basis === null || isNoticeHeldBasis(purpose.basis))) {
      throw new Error(`${purpose.key} has no basis the notice can state`)
    }
    if (!recorded(purpose.retention)) throw new Error(`${purpose.key} has no retention`)
  }
  const providers = new Set<ProviderKey>()
  for (const clearance of input.clearances) {
    if (isAiProvider(clearance.provider)) throw new Error(`${clearance.provider} is an AI provider, never cleared`)
    if (providers.has(clearance.provider)) throw new Error(`${clearance.provider} is cleared twice in the input`)
    providers.add(clearance.provider)
  }
  const current = (status: PurposeStatus) => input.purposes.filter(p => p.status === status).sort(byPurpose)
  const clearances = [...input.clearances].sort((a, b) => byProvider(a.provider, b.provider))
  return { org, active: current('active'), retired: current('retired'), clearances, contact, targets }
}

// --- The body (TECH-SPEC T22 items 22 and 23) ---------------------------------------------------

// How the notice states each basis it may (C0.9 PD-38, OD-18): deemed consent by conduct from c09.2
// (PD-73), pointing to how to withdraw it; consent and deemed consent by notification not yet.
// Legitimate interests says so and how to learn more (PDPA-02). No line puts the org's name in the
// possessive, which reads badly for a name ending in s.
function basisItem(purpose: NoticePurpose, org: string): string {
  const reference = recorded(purpose.basisReference) ? purpose.basisReference : null
  switch (purpose.basis) {
    case 'employment':
      return "Legal basis: the PDPA's exception for managing the employment relationship, which needs no consent."
    case 'legitimate_interests':
      return reference === null
        ? line`Legal basis: the legitimate interests of ${org}, weighed against yours in a documented assessment. Contact the Data Protection Officer to learn more.`
        : line`Legal basis: the legitimate interests of ${org}, weighed against yours in a documented assessment (${reference}). Contact the Data Protection Officer to learn more.`
    case 'business_improvement':
      return line`Legal basis: business improvement, so ${org} uses only data it already holds and collects or discloses none for it.`
    case 'other_exception':
      return reference === null
        ? 'Legal basis: an exception or requirement in law.'
        : line`Legal basis: an exception or requirement in law (${reference}).`
    case 'deemed_consent_conduct':
      return `Legal basis: your deemed consent. You give this data yourself, for this purpose, and it is reasonable that you would. You can withdraw it, as “${NOTICE_SECTIONS.withdraw}” below says.`
    default:
      // read() refuses the rest first.
      throw new Error(`${purpose.key}: no basis the notice can state`)
  }
}

// How the withdrawal reply names the basis each purpose continues on (C0.9 PD-105), beside
// basisItem()'s words, which NTG-22 holds it to: every basis the notice states but deemed consent by
// conduct, whose purposes the reply lists among those that stop instead. Consent and deemed consent
// by notification aren't stated by any version yet (NOTICE_HELD_BASES), so a published version never
// lists an active purpose on either.
type ContinuingBasis = Exclude<Basis, 'deemed_consent_conduct' | (typeof NOTICE_HELD_BASES)[number]>
export const REPLY_BASIS_PHRASES = {
  employment: () => "the PDPA's exception for managing the employment relationship",
  legitimate_interests: (org: string) => line`the legitimate interests of ${org}`,
  business_improvement: () => 'business improvement',
  other_exception: () => 'an exception or requirement in law',
} as const satisfies Record<ContinuingBasis, (org: string) => string>

function sharedItem(purpose: NoticePurpose): string {
  const names = [...purpose.providers]
    .sort(byProvider)
    .filter((provider, index, sorted) => sorted.indexOf(provider) === index)
    .map(provider => NOTICE_PROVIDER_NAMES[provider as NonAiProviderKey])
  return names.length === 0 ? 'No provider receives it.' : `Shared with: ${joinList(names)}.`
}

function trainingItem(facts: NoticeFacts, org: string): string[] {
  switch (facts.training) {
    case 'off':
      return [line`Model training: turned off for ${org}, so it trains no models on this data.`]
    case 'not_applicable':
      return ['Model training: it trains no models on the data it receives.']
    default:
      // A clearance always records it (transferProblems()); nothing is claimed without it.
      return []
  }
}

function providerItems(clearance: NoticeClearance, org: string): string[] {
  const facts = clearance.facts
  const items: string[] = []
  if (recorded(facts.services)) items.push(sentence(line`What it does: ${facts.services}`))
  if (recorded(facts.dataTypes)) items.push(sentence(line`What it receives: ${facts.dataTypes}`))
  const processing = countries(facts.processingCountries)
  const storage = countries(facts.storageCountries)
  if (processing === storage) {
    if (processing !== '') items.push(line`Where it processes and stores the data: ${processing}.`)
  } else {
    if (processing !== '') items.push(line`Where it processes the data: ${processing}.`)
    if (storage !== '') items.push(line`Where it stores the data: ${storage}.`)
  }
  if (recorded(facts.providerRetention)) {
    items.push(sentence(line`How long it keeps the data: ${facts.providerRetention}`))
  }
  if (recorded(facts.onwardRecipients)) {
    items.push(sentence(line`Who it passes the data to: ${facts.onwardRecipients}`))
  }
  return [...items, ...trainingItem(facts, org)]
}

// "If you withdraw consent" (C0.9 OD-18, PD-73): which purposes stop for you, and how to withdraw.
// Both branches speak only of the purposes under "Why your data is processed", the ones Hearth
// still processes data for: a retired purpose continues for nobody and may keep a consent-type
// basis (publishing's consent rule reads active purposes only), so it is never listed or said to
// continue. Every other active purpose rests on a basis that isn't consent-type, since no version
// states consent or deemed consent by notification yet, and the pinned purposes are always among
// them (0009). Until the DPO's procedure says how one person's withdrawal of a purpose is carried
// out, the publish route holds that purpose back (purpose_conduct_unstoppable, PD-86), so the
// second branch is written and previewed, and published only once it can be kept.
function withdrawBlocks(active: readonly NoticePurpose[]): Block[] {
  const conduct = active.filter(purpose => purpose.basis === 'deemed_consent_conduct')
  if (conduct.length === 0) {
    return [
      section(NOTICE_SECTIONS.withdraw),
      paragraph(
        `None of the purposes under “${NOTICE_SECTIONS.purposes}” rests on your consent, so they all continue if you withdraw it.`,
      ),
    ]
  }
  return [
    section(NOTICE_SECTIONS.withdraw),
    paragraph('These purposes rest on your deemed consent, so they stop for you if you withdraw it:'),
    list(conduct.map(purpose => PURPOSES[purpose.key].register)),
    paragraph(
      `The other purposes under “${NOTICE_SECTIONS.purposes}” don't rest on consent, so they continue if you withdraw it.`,
    ),
    paragraph(
      `To withdraw, use the form in Settings › Privacy in Hearth, or contact the Data Protection Officer, as “${NOTICE_SECTIONS.rights}” below says. They carry it out by hand: they tell you first what withdrawing changes for you, and confirm once it has taken effect.`,
    ),
  ]
}

// "Your rights" (PDPA-02, PDPA-13; C0.9 OD-10, OD-13, PD-74, PD-95): what you may ask for; the form
// in Settings › Privacy, named in words only (the body is plain text, which every screen renders as
// text: WS-07), and the DPO's business contact, so someone with no account, or who has left, can
// still reach them; and the DPO's reply targets (OD-08, OD-09). Each channel recorded is an item of
// its own, with no full stop, so an address reads exactly; the postal address is printed on one
// line, its lines joined with commas. The targets are whole numbers from the database, from 5 and
// from 14, so both always read as plural; "counting Monday to Friday" is exact under OD-09, which
// counts public holidays as business days, and "calendar days" is said outright, so nobody reads
// the second figure as business days. The targets paragraph says "aims", since a target isn't a
// guarantee, and its second sentence is the written notice of more time (regulation 5 of the PDP
// Regulations 2021, for a request under s21 or s22). Nothing says the DPO is
// alerted (OD-22). Objection is named among the requests the targets cover, never as a right in
// the first sentence: the PDPA grants no general right to object.
function rightsBlocks(org: string, contact: DpoContact, targets: ReplyTargets): Block[] {
  const channels = [line`Role: ${contact.title}`]
  if (recorded(contact.email)) channels.push(line`Email: ${contact.email}`)
  if (recorded(contact.phone)) channels.push(line`Phone: ${contact.phone}`)
  if (recorded(contact.postal)) channels.push(line`Post: ${postalOneLine(contact.postal)}`)
  const business = String(targets.businessDays)
  const calendar = String(targets.calendarDays)
  return [
    section(NOTICE_SECTIONS.rights),
    paragraph(
      line`You can request a copy of the personal data ${org} holds about you, have it corrected, or withdraw consent where a purpose rests on it.`,
    ),
    paragraph(
      line`To do any of these, or to raise a question or a complaint about how your personal data is handled, use the form in Settings › Privacy in Hearth, where you can follow what happens to it, or contact the Data Protection Officer of ${org}. You don't need a Hearth account to contact them, so it still works after you leave.`,
    ),
    list(channels),
    paragraph(
      line`The Data Protection Officer aims to reply to a question, a complaint, a withdrawal or an objection within ${business} business days, counting Monday to Friday from the day after it reaches them, and to a request for a copy of your data or to have it corrected within ${calendar} calendar days, weekends and public holidays included. If they need longer for a copy or a correction, they tell you in writing within that time when they will reply.`,
    ),
    paragraph(
      line`If something has gone wrong, ${org} wants to hear about it and to put it right. If you're unhappy with how it's handled, or would rather not raise it with ${org}, you can contact the Personal Data Protection Commission (PDPC), Singapore's data protection regulator.`,
    ),
  ]
}

// The body of a new version, from the registers as they are (C0.9 PD-35): every active purpose,
// with its basis, retention and providers; every retired one, with how long what it collected is
// kept (PD-60); whether consent can be withdrawn (PD-73); what Hearth doesn't do (PD-58); every
// cleared provider with the facts it states, and OD-04's paragraph when Twilio is one; production
// access (PRD-101); and your rights, with the form, the DPO's contact (PD-74) and their reply
// targets (PD-95). Throws on what noticeProblems() holds back (read() above).
export function generateNotice(input: NoticeInput): string {
  const { org, active, retired, clearances, contact, targets } = read(input)
  const blocks: Block[] = []

  blocks.push(
    section(NOTICE_SECTIONS.about),
    paragraph(
      line`This notice tells you what personal data Hearth processes for ${org}, why, how long it is kept and who else receives it.`,
    ),
    paragraph(
      'Acknowledging it records that you were told. It is not consent to any purpose: each one rests on the legal basis given for it below.',
    ),
    paragraph('You acknowledge each new version of this notice before you carry on using Hearth.'),
  )

  blocks.push(section(NOTICE_SECTIONS.purposes))
  if (active.length === 0) blocks.push(paragraph(line`Hearth processes no personal data for ${org} yet.`))
  for (const purpose of active) {
    blocks.push(
      entry(PURPOSES[purpose.key].register),
      list([basisItem(purpose, org), sentence(line`Kept for: ${purpose.retention ?? ''}`), sharedItem(purpose)]),
    )
  }

  if (retired.length > 0) {
    blocks.push(
      section(NOTICE_SECTIONS.retired),
      paragraph(
        'Hearth no longer processes personal data for these purposes. What was already collected is kept only as long as each one says.',
      ),
    )
    for (const purpose of retired) {
      blocks.push(
        entry(PURPOSES[purpose.key].register),
        list([sentence(line`Data already collected is kept for: ${purpose.retention ?? ''}`)]),
      )
    }
  }

  blocks.push(...withdrawBlocks(active))

  const running = new Set<PurposeKey>(active.map(purpose => purpose.key))
  const clauses = DOES_NOT.filter(row => !row.purposes.some(key => running.has(key)))
  if (clauses.length > 0) {
    blocks.push(
      section(NOTICE_SECTIONS.doesNot),
      list(clauses.map(row => `Hearth doesn't ${row.clause}.`)),
      paragraph('None of these happens unless a new version of this notice says so and you have acknowledged it.'),
    )
  }

  if (clearances.length > 0) {
    blocks.push(
      section(NOTICE_SECTIONS.providers),
      paragraph(line`Each provider below receives personal data from Hearth for ${org}, as its entry says.`),
    )
    for (const clearance of clearances) {
      blocks.push(
        entry(NOTICE_PROVIDER_NAMES[clearance.provider as NonAiProviderKey]),
        list(providerItems(clearance, org)),
      )
    }
  }

  // OD-04: the first code went to Twilio before anyone could read this, so the notice says so, and
  // where Twilio processes it. A country list stands after a colon, as in the providers' entries, so
  // no name needs an article ("the United States").
  const twilio = clearances.find(clearance => clearance.provider === 'twilio')
  if (twilio !== undefined) {
    const where = countries(twilio.facts.processingCountries)
    blocks.push(
      section(NOTICE_SECTIONS.firstCode),
      paragraph(
        line`To send your first sign-in code, your mobile number went to Twilio Verify before you could read this notice. Your invitation and the employee data protection policy of ${org} told you it would.`,
      ),
    )
    if (where !== '') blocks.push(paragraph(line`Where Twilio Verify processes it: ${where}.`))
  }

  blocks.push(
    section(NOTICE_SECTIONS.production),
    paragraph(
      line`The person who runs Hearth's servers for ${org} can reach its production systems only through a separate emergency role. Each use is logged, and a second person reviews every use each quarter.`,
    ),
    ...rightsBlocks(org, contact, targets),
  )

  return blocks.map(block => block.join('\n')).join('\n\n')
}

// --- Sources and the digest (C0.9 PD-34, PD-36) -------------------------------------------------

// Code-unit order, as collate "C" sorts the keys and ids publish_notice() compares.
const codeUnits = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

// The draft's sources, as publish_notice() takes them and the version links them: every active or
// retired purpose at its current version, sorted by key (PD-60), every open clearance, sorted by
// id, and the DPO's current settings version with its contact (PD-66) and the reply targets it
// holds, which this generator prints (PD-95; null with no contact).
export function noticeDraftSources(input: NoticeInput, body: string | null): NoticeSources {
  const contact = input.contact
  return {
    generator: NOTICE_GENERATOR,
    body,
    purposes: input.purposes
      .filter(purpose => purpose.status !== 'planned')
      .map(purpose => ({ key: purpose.key, version: purpose.version }))
      .sort((a, b) => codeUnits(a.key, b.key)),
    clearances: input.clearances
      .map(clearance => ({ id: clearance.id, provider: clearance.provider, facts: clearance.facts }))
      .sort((a, b) => codeUnits(a.id, b.id)),
    contact:
      contact === null
        ? null
        : {
            version: contact.version,
            facts: { title: contact.title, email: contact.email, phone: contact.phone, postal: contact.postal },
          },
    targets:
      contact === null
        ? null
        : { businessDays: contact.targets.businessDays, calendarDays: contact.targets.calendarDays },
  }
}

// What the draft's digest hashes (sha-256, on the server): JSON with sorted keys of its words, its
// generator and its sources, the DPO's settings version among them (PD-66), so a preview and a
// publish agree only when every one of them does.
export function noticeDigestText(sources: NoticeSources): string {
  const purposes: Record<string, number> = {}
  for (const purpose of [...sources.purposes].sort((a, b) => codeUnits(a.key, b.key))) {
    purposes[purpose.key] = purpose.version
  }
  return JSON.stringify({
    body: sources.body,
    clearances: sources.clearances.map(clearance => clearance.id).sort(codeUnits),
    contact: sources.contact?.version ?? null,
    generator: sources.generator,
    purposes,
  })
}

// The same words from the same generator, listing the same purposes at the same versions and
// printing the same settings version of the DPO's contact (PD-67): a new settings version counts as
// a purpose's new register version does, so it reads out of date until it is published, and warns
// same_text when the words match.
function sameWords(draft: NoticeSources, latest: NoticeSources): boolean {
  const pairs = (sources: NoticeSources) =>
    sources.purposes
      .map(purpose => `${purpose.key}:${purpose.version}`)
      .sort(codeUnits)
      .join(',')
  return (
    draft.body !== null &&
    draft.body === latest.body &&
    draft.generator === latest.generator &&
    pairs(draft) === pairs(latest) &&
    (draft.contact?.version ?? null) === (latest.contact?.version ?? null)
  )
}

// Whether a draft is the latest version again: the same words and purposes, and the same clearances.
function sameVersion(draft: NoticeSources, latest: NoticeSources): boolean {
  const ids = (sources: NoticeSources) =>
    sources.clearances
      .map(clearance => clearance.id)
      .sort(codeUnits)
      .join(',')
  return sameWords(draft, latest) && ids(draft) === ids(latest)
}

// Whether the latest version still says what the draft would (C0.9 PD-48): the same words and
// purposes, and each provider stating the same facts, whichever clearance they rest on. A provider
// cleared again on the same facts (a new review date alone) leaves the notice up to date: its sends
// go on (PD-59), and publishing would only have everyone acknowledge the same words again
// (same_text). A stand-in never says what a draft would.
export function noticeSaysTheSame(draft: NoticeSources, latest: NoticeSources): boolean {
  if (!sameWords(draft, latest)) return false
  const stated = new Map(latest.clearances.map(clearance => [clearance.provider, clearance.facts]))
  return (
    draft.clearances.length === stated.size &&
    draft.clearances.every(clearance => {
      const was = stated.get(clearance.provider)
      return was !== undefined && sameNoticeFacts(was, clearance.facts)
    })
  )
}

// --- Problems and warnings (C0.9 PD-37, PD-38, PD-62, PD-68, PD-86) ----------------------------

// The problems that stop the draft being written at all. With no contact for the DPO there is no
// preview either (PD-68): "Your rights" can't be written without it.
const UNWRITABLE: readonly NoticeProblem['code'][] = [
  'purpose_basis_missing',
  'purpose_retention_missing',
  'purpose_consent_basis',
  'dpo_contact_pending',
]

// The active purposes on deemed consent by conduct that no published notice may state yet (C0.9
// OD-18, PD-86), in the registry's order: each one CONDUCT_WITHDRAWABLE doesn't list, since the
// DPO's written procedure doesn't yet say how one person's withdrawal of it is carried out, and the
// notice would tell people it stops for them. withdrawable is a parameter so a test can plant a
// list; noticeProblems(), and so the publish route, always uses the real one.
export function conductUnstoppable(
  purposes: readonly Pick<NoticePurpose, 'key' | 'status' | 'basis'>[],
  withdrawable: readonly PurposeKey[] = CONDUCT_WITHDRAWABLE,
): PurposeKey[] {
  const held = new Set(
    purposes
      .filter(p => p.status === 'active' && p.basis === 'deemed_consent_conduct' && !withdrawable.includes(p.key))
      .map(p => p.key),
  )
  return PURPOSE_KEYS.filter(key => held.has(key))
}

function sortedBy<T extends { code: string; purpose?: PurposeKey; provider?: ProviderKey; field?: string }>(
  codes: readonly string[],
  found: readonly T[],
): T[] {
  const rank = (item: T) => [
    codes.indexOf(item.code),
    item.purpose === undefined ? -1 : PURPOSE_KEYS.indexOf(item.purpose),
    item.provider === undefined ? -1 : PROVIDERS.indexOf(item.provider),
    item.field === undefined ? -1 : (NOTICE_FREE_TEXT_FIELDS as readonly string[]).indexOf(item.field),
  ]
  return [...found].sort((a, b) => {
    const x = rank(a)
    const y = rank(b)
    for (let i = 0; i < x.length; i++) {
      const d = (x[i] ?? 0) - (y[i] ?? 0)
      if (d !== 0) return d
    }
    return 0
  })
}

// What holds a draft back, in NOTICE_PROBLEMS order, then the registries' (notice.ts says what
// each means). The rules hold for active purposes; a retired one's retention is checked too, which
// 0009 already requires, so the generator never meets one without it. Free text is checked as the
// notice prints it, and only where it prints it, the DPO's contact included (PD-65), since AI_COPY
// is code and may grow after the contact was saved. Whether the draft is the latest version again
// is known only once it can be written.
export function noticeProblems(input: NoticeInput, latest: NoticeSources | null): NoticeProblem[] {
  const found: NoticeProblem[] = []
  const cleared = new Set(input.clearances.map(clearance => clearance.provider))
  const freeText = (
    field: NoticeFreeTextField,
    text: string | null,
    about: Pick<NoticeProblem, 'purpose' | 'provider'>,
  ) => {
    if (text !== null && aiCopyIn(flatText(text)) !== undefined) {
      found.push({ code: 'free_text_ai_copy', ...about, field })
    }
  }
  const contact = input.contact
  if (contact === null) found.push({ code: 'dpo_contact_pending' })
  else {
    freeText('contact_title', contact.title, {})
    freeText('contact_email', contact.email, {})
    freeText('contact_postal', contact.postal === null ? null : postalOneLine(contact.postal), {})
  }
  for (const purpose of input.purposes) {
    if (purpose.status === 'planned') continue
    const about = { purpose: purpose.key }
    if (!recorded(purpose.retention)) found.push({ code: 'purpose_retention_missing', ...about })
    freeText('retention', purpose.retention, about)
    if (purpose.status !== 'active') continue
    if (purpose.basis === null) found.push({ code: 'purpose_basis_missing', ...about })
    else if (isNoticeHeldBasis(purpose.basis)) found.push({ code: 'purpose_consent_basis', ...about })
    else if (BASIS_NEEDS[purpose.basis].reference) freeText('basis_reference', purpose.basisReference, about)
    for (const provider of new Set(purpose.providers)) {
      if (!cleared.has(provider)) found.push({ code: 'provider_not_cleared', ...about, provider })
    }
  }
  for (const key of conductUnstoppable(input.purposes)) {
    found.push({ code: 'purpose_conduct_unstoppable', purpose: key })
  }
  for (const clearance of input.clearances) {
    const about = { provider: clearance.provider }
    freeText('services', clearance.facts.services, about)
    freeText('data_types', clearance.facts.dataTypes, about)
    freeText('provider_retention', clearance.facts.providerRetention, about)
    freeText('onward_recipients', clearance.facts.onwardRecipients, about)
  }
  if (latest !== null && !found.some(problem => UNWRITABLE.includes(problem.code))) {
    const draft = noticeDraftSources(input, generateNotice(input))
    if (sameVersion(draft, latest)) found.push({ code: 'unchanged' })
  }
  return sortedBy(NOTICE_PROBLEMS, found)
}

// What publishing the draft warns of, in NOTICE_WARNINGS order, then the providers' (notice.ts says
// what each means). today is the org's, in its time zone, YYYY-MM-DD.
export function noticeWarnings(input: NoticeInput, latest: NoticeSources | null, today: string): NoticeWarning[] {
  const found: NoticeWarning[] = []
  const listed = new Set(
    input.purposes.filter(purpose => purpose.status === 'active').flatMap(purpose => purpose.providers),
  )
  for (const clearance of input.clearances) {
    const about = { provider: clearance.provider }
    if (!listed.has(clearance.provider)) found.push({ code: 'provider_unlisted', ...about })
    if (clearance.reviewOn !== null && clearance.reviewOn <= today)
      found.push({ code: 'provider_review_due', ...about })
    const stated = latest?.clearances.some(
      was => was.provider === clearance.provider && sameNoticeFacts(was.facts, clearance.facts),
    )
    if (latest !== null && latest.generator !== null && !stated) found.push({ code: 'sends_waiting', ...about })
  }
  const writable = noticeProblems(input, null).every(problem => !UNWRITABLE.includes(problem.code))
  if (latest !== null && writable) {
    const draft = noticeDraftSources(input, generateNotice(input))
    if (draft.body === latest.body && !sameVersion(draft, latest)) found.push({ code: 'same_text' })
  }
  // The standing warning: what the notice says of production access isn't in place yet (C0.9
  // PD-57), so the DPO is told each time. The DPO's contact, which PR 2 warned of here, is a problem
  // from PR 3a (dpo_contact_pending, PD-68).
  found.push({ code: 'production_access_pending' })
  return sortedBy(NOTICE_WARNINGS, found)
}

// --- The withdrawal reply (PDPA-04; C0.9 PD-105) ------------------------------------------------

// What the withdrawal reply is written from: the org's name, the request's reference as stored (or
// as people quote it), the active purposes the latest published version lists, with the basis each
// rests on in that version (what the requester was told), and the DPO's role title that version
// printed. The server reads them (readLatestPurposes()), only for a withdrawal by its kind now and
// only once a version is published.
export interface WithdrawalReplyInput {
  org: string
  reference: string
  purposes: readonly { key: PurposeKey; basis: Basis }[]
  contactTitle: string
}

// The reply the DPO may copy for a withdrawal of consent (PDPA-04; C0.9 PD-105), which the case
// sheet shows with Copy: fixed words, filled by code from the published notice's purposes and bases,
// never model-written (D41). Pure and deterministic, plain text with no date, in the DPO's voice,
// since the DPO copies it, edits it outside Hearth and sends it themselves. It says what stops for
// the requester (each purpose on deemed consent by conduct) and on what basis everything else
// continues, which is what PDPA-04 asks the reply to explain; that a purpose on legitimate interests
// can be objected to; and that the PDPC hears complaints. In C0 CONDUCT_WITHDRAWABLE is empty, so
// no published version states a purpose on deemed consent by conduct and the reply always takes the
// first branch. Throws on what no published version holds (an AI purpose, a purpose twice, a basis
// no version states yet) and on a reference that isn't one: a bug in its caller. It is Hearth's
// copy, so NTG-22 holds every branch to AI_COPY and British spelling.
export function withdrawalReply(input: WithdrawalReplyInput): string {
  const org = orgName(input.org)
  const reference = parseCaseReference(input.reference)
  if (reference === null) throw new Error('A withdrawal reply quotes the request’s reference')
  const title = flatText(input.contactTitle)
  if (title === '') throw new Error('A withdrawal reply is signed with the Data Protection Officer’s role title')
  const seen = new Set<PurposeKey>()
  for (const purpose of input.purposes) {
    if (isAiPurpose(purpose.key)) throw new Error(`${purpose.key} is an AI purpose, never in a notice before A0`)
    if (seen.has(purpose.key)) throw new Error(`${purpose.key} is in the input twice`)
    if (isNoticeHeldBasis(purpose.basis)) throw new Error(`${purpose.key}: no published version states its basis`)
    seen.add(purpose.key)
  }
  const ordered = [...input.purposes].sort((a, b) => PURPOSE_KEYS.indexOf(a.key) - PURPOSE_KEYS.indexOf(b.key))
  const stopping = ordered.filter(purpose => purpose.basis === 'deemed_consent_conduct')
  const continuing = ordered.flatMap(purpose =>
    purpose.basis === 'deemed_consent_conduct'
      ? []
      : [
          `${NOTICE_LINE.item}${PURPOSES[purpose.key].register}: ${REPLY_BASIS_PHRASES[purpose.basis as ContinuingBasis](org)}`,
        ],
  )
  const paragraphs: string[] = [
    `Your reference: ${formatCaseReference(reference)}`,
    'Thank you for writing to withdraw your consent.',
  ]
  if (stopping.length === 0) {
    const none = line`None of the purposes ${org} processes your personal data for rests on your consent, so withdrawing it doesn't stop any of them.`
    paragraphs.push(
      continuing.length === 0
        ? none
        : [`${none} Each continues on the legal basis the privacy notice gives:`, ...continuing].join('\n'),
    )
  } else {
    paragraphs.push(
      [
        'These purposes rest on your deemed consent, so they stop for you once your withdrawal takes effect:',
        ...stopping.map(purpose => `${NOTICE_LINE.item}${PURPOSES[purpose.key].register}`),
      ].join('\n'),
    )
    const confirm = "I'll confirm in writing once that has happened."
    paragraphs.push(
      continuing.length === 0
        ? confirm
        : [`${confirm} The others continue on the legal basis the privacy notice gives:`, ...continuing].join('\n'),
    )
  }
  paragraphs.push(
    line`If a purpose rests on the legitimate interests of ${org}, you can object to it, and I'll weigh your objection and reply with my decision.`,
    "If you're not satisfied with this reply, you can contact the Personal Data Protection Commission (PDPC), Singapore's data protection regulator.",
    title,
  )
  return paragraphs.join('\n\n')
}
