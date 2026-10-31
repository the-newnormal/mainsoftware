// The break-glass reasons, held two ways that must agree (C11-D11, C11-D14): the role's trust admits a
// hearth-reason tag of one of REASON_SHAPES, fixed-length IAM StringLike patterns, and the helper
// (infra/bin/break-glass.sh) refuses any reason but one of its six exact forms before it assumes the
// role. The helper is the only control keeping free text, and so a name, out of the trail, so every
// reason it accepts must fit exactly one shape of its own length, every shape must be reached, and
// the near misses a person might type must fail every form. This file reads the helper as text and
// compiles its REASON_FORM_* lines as JavaScript regular expressions (they use only [], {}, (), |, ^
// and $, which ERE and JavaScript read alike); it never runs the helper, whose pure functions IG-09
// runs (scripts/guards/infra.test.ts). It is on the owner's-read list (C11-D74).
import { readFileSync } from 'node:fs'
import { CASE_REFERENCE_PATTERN, formatCaseReference, parseCaseReference } from '@hearth/shared'
import { describe, expect, it } from 'vitest'
import { REASON_SHAPES } from './break-glass.ts'

const HELPER = readFileSync(new URL('../../bin/break-glass.sh', import.meta.url), 'utf8')

// The helper's forms, by name, from its `REASON_FORM_<NAME>='…'` lines.
function reasonForms(text: string): Map<string, RegExp> {
  const forms = new Map<string, RegExp>()
  for (const [, name, form] of text.matchAll(/^REASON_FORM_([A-Z]+)='([^']*)'$/gm)) {
    if (name !== undefined && form !== undefined) forms.set(name, new RegExp(form))
  }
  return forms
}

// IAM StringLike: `*` any run of characters, `?` exactly one, everything else literal.
const globMatches = (shape: string, value: string): boolean =>
  new RegExp(
    `^${[...shape].map(c => (c === '?' ? '.' : c === '*' ? '.*' : c.replace(/[.+^${}()|[\]\\]/g, '\\$&'))).join('')}$`,
    's',
  ).test(value)

// Case references made from CASE_REFERENCE_PATTERN's own alphabet: each letter it allows first, the
// symbols after it cycling through every one it allows there.
function caseReasons(): string[] {
  const classes = [...CASE_REFERENCE_PATTERN.source.matchAll(/\[([^\]]+)\]/g)].map(([, body]) =>
    (body ?? '').replace(/(.)-(.)/g, (_, from: string, to: string) =>
      Array.from({ length: to.charCodeAt(0) - from.charCodeAt(0) + 1 }, (_, i) =>
        String.fromCharCode(from.charCodeAt(0) + i),
      ).join(''),
    ),
  )
  const [letters = '', symbols = ''] = classes
  expect(letters.length).toBeGreaterThan(10)
  expect(symbols.length).toBeGreaterThan(letters.length)
  return [...letters].map((first, i) => {
    const pick = (k: number) => symbols[(i * 7 + k) % symbols.length] ?? ''
    const reference = parseCaseReference(
      `${first}${pick(1)}${pick(2)}${pick(3)}${letters[(i + 3) % letters.length]}${pick(4)}${pick(5)}${pick(6)}`,
    )
    if (reference === null) throw new Error('a generated reference failed CASE_REFERENCE_PATTERN')
    return `case:${formatCaseReference(reference)}`
  })
}

const GOOD = [
  ...caseReasons(),
  'incident:2026-10-31-01',
  'bootstrap:set-up',
  'bootstrap:correct-number',
  'recover:twilio',
  'drill:2026-10-31',
  'lz:pr-1',
  'lz:pr-42',
  'lz:pr-123',
  'lz:pr-1234',
  'lz:pr-99999',
]

const BAD = [
  'Jane Tan',
  'case:BACD-FGHJ',
  'case:BYCD-FGHJ',
  'case:B0CD-FGHJ',
  'case:B1CD-FGHJ',
  'case:BLCD-FGHJ',
  'case:b2cd-fghj',
  'case:2BCD-FGHJ',
  'case:Jane-Tans',
  'lz:pr-0',
  'lz:pr-123456',
  'incident:2026-1-31-01',
  'drill:2026-13-01',
  'bootstrap:other',
  'recover:aws',
  'lz:pr-42 ',
  'case:B2CD-FGHJ\nx',
  'incident:٢٠٢٦-10-31-01',
  'drill:２０２６-10-31',
  '',
]

describe('IAC-11 C11-D11 C11-D14: the helper’s reasons and the trust’s shapes agree', () => {
  it('the trust’s shapes are exactly these', () => {
    expect([...REASON_SHAPES]).toEqual([
      'case:????-????',
      'incident:????-??-??-??',
      'bootstrap:set-up',
      'bootstrap:correct-number',
      'recover:twilio',
      'drill:????-??-??',
      'lz:pr-?',
      'lz:pr-??',
      'lz:pr-???',
      'lz:pr-????',
      'lz:pr-?????',
    ])
  })

  it('the helper has the six forms, each a whole-string pattern', () => {
    const forms = reasonForms(HELPER)
    expect([...forms.keys()]).toEqual(['CASE', 'INCIDENT', 'BOOTSTRAP', 'RECOVER', 'DRILL', 'LZ'])
    for (const [name, form] of forms) {
      expect(form.source.startsWith('^'), name).toBe(true)
      expect(form.source.endsWith('$'), name).toBe(true)
    }
  })

  it('every good reason matches exactly one form and exactly one shape of its own length, and every shape is reached', () => {
    const forms = [...reasonForms(HELPER).values()]
    const reached = new Set<string>()
    for (const reason of GOOD) {
      expect(forms.filter(form => form.test(reason)).length, reason).toBe(1)
      const shapes = REASON_SHAPES.filter(shape => globMatches(shape, reason))
      expect(shapes, reason).toHaveLength(1)
      expect(shapes[0]?.length, reason).toBe(reason.length)
      for (const shape of shapes) reached.add(shape)
    }
    expect([...reached].sort()).toEqual([...REASON_SHAPES].sort())
  })

  it('every near miss fails every form', () => {
    const forms = [...reasonForms(HELPER).values()]
    for (const reason of BAD) {
      expect(
        forms.filter(form => form.test(reason)),
        JSON.stringify(reason),
      ).toEqual([])
    }
  })

  it('the shapes alone admit a name of the right length, which only the helper’s exact forms refuse', () => {
    expect(REASON_SHAPES.some(shape => globMatches(shape, 'case:Jane-Tans'))).toBe(true)
    expect(reasonForms(HELPER).get('CASE')?.test('case:Jane-Tans')).toBe(false)
    // A planted case form loosened to any text would take it, which the near-miss case above catches.
    const loose = reasonForms(HELPER.replace(/^REASON_FORM_CASE='[^']*'$/m, () => "REASON_FORM_CASE='^case:.*$'"))
    expect(loose.get('CASE')?.test('case:Jane-Tans')).toBe(true)
  })
})
