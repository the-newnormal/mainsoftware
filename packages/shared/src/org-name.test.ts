// The organisation's name (TECH-SPEC T22 items 37 and 64; C0.9 PD-62, PD-118): BSU-01. The
// script's message for each code, which names the field `organisation` and never the word, is
// BSU-02's (scripts/owner-bootstrap/input.test.ts); here the answer is shown to be codes alone. Every
// character a reader can't see is built from its code point, never written raw (SRC-01).
import { describe, expect, it } from 'vitest'
import { AI_COPY, aiCopyIn } from './ai-copy.ts'
import { flatText } from './dpo-contact.ts'
import { ORG_NAME_MAX, ORG_NAME_PROBLEMS, orgNameProblems } from './org-name.ts'

const char = (point: number) => String.fromCodePoint(point)
// Printable ASCII as its fullwidth forms (U+FF01 onwards), which NFKC folds back.
const fullwidth = (text: string) => text.replace(/[!-~]/g, ascii => char((ascii.codePointAt(0) ?? 0) + 0xfee0))
// A name as code points, for a failure message that shows what can't be seen.
const points = (name: string) => [...name].map(one => (one.codePointAt(0) ?? 0).toString(16)).join(' ')

// One fictional name per AI_COPY pattern, in its order.
const AI_NAMES = [
  'Ask Freight Pte',
  'AI Freight',
  'Assistant Holdings',
  'Agents of Change Ltd',
  'Copilot Partners',
  'Coming Soon Pte',
  `Kestrel ${char(0x2728)} Ltd`,
]

// Their NFKC twins, in fullwidth letters, which read as the word.
const TWINS = [`${fullwidth('AI')} Freight`, `${fullwidth('Ask')} Co`]

// A character a reader can't see, or whitespace the notice would print otherwise.
const NOT_PLAIN = [
  `A${char(0x200b)}I`, // zero-width space
  `As${char(0xad)}k`, // soft hyphen
  `Kestrel ${char(0x2068)}Freight${char(0x2069)}`, // first strong isolate, pop directional isolate
  `Kestrel ${char(0x202e)}Freight`, // right-to-left override
  `Kestrel${char(0x200e)} Freight`, // left-to-right mark
  `Kestrel${char(0x200d)}Freight`, // zero-width joiner
  `Kestrel${char(0x2060)}Freight`, // word joiner
  `Kestrel${char(0xfeff)}Freight`, // zero-width no-break space
  'Kestrel\tFreight',
  'Kestrel\nFreight',
  'Kestrel\rFreight',
  `Kestrel${char(0x85)}Freight`, // next line
  `Kestrel${char(0x2028)}Freight`, // line separator
  'Kestrel  Freight',
  `Kestrel${char(0xa0)}Freight`, // no-break space
  `Kestrel${char(0x2009)}Freight`, // thin space
  `Kestrel${char(0x3000)}Freight`, // ideographic space
  `Kestrel ${String.fromCharCode(0xd83c)}Freight`, // half of an astral character
]

describe('BSU-01 T22 item 37 C0.9 PD-62 PD-118: orgNameProblems()', () => {
  it('BSU-01 PD-62: a name AI_COPY matches is refused, one for each pattern', () => {
    expect(AI_NAMES).toHaveLength(AI_COPY.length)
    for (const [index, name] of AI_NAMES.entries()) {
      expect(AI_COPY[index]?.test(name), name).toBe(true)
      expect(orgNameProblems(name), name).toEqual(['ai_copy'])
    }
  })

  it('BSU-01 PD-118: their NFKC twins are refused too, which the generator’s own test would print', () => {
    for (const name of TWINS) {
      expect(aiCopyIn(flatText(name)), points(name)).toBeUndefined()
      expect(orgNameProblems(name), points(name)).toEqual(['ai_copy'])
    }
  })

  it('BSU-01 PD-118: a control or format character, other whitespace or two spaces together is not plain', () => {
    for (const name of NOT_PLAIN) expect(orgNameProblems(name), points(name)).toEqual(['not_plain'])
  })

  it('BSU-01 PD-118: what the notice prints is checked too, so a line break can’t hide a word', () => {
    expect(aiCopyIn('Coming\nSoon')).toBeUndefined()
    expect(orgNameProblems('Coming\nSoon')).toEqual(['not_plain', 'ai_copy'])
  })

  it('BSU-01: a name is read trimmed, as the caller stores it, and counted in code points, as Postgres counts it', () => {
    expect(ORG_NAME_MAX).toBe(200)
    for (const empty of ['', '   ', ' \t\n ', char(0xa0)]) {
      expect(orgNameProblems(empty), points(empty)).toEqual(['empty'])
    }
    expect(orgNameProblems('  Kestrel Test Freight  ')).toEqual([])
    expect(orgNameProblems(`\t${char(0xfeff)}Kestrel Test Freight\n`)).toEqual([])
    const tree = char(0x1f333) // astral: two UTF-16 units, one code point
    expect(tree).toHaveLength(2)
    expect(orgNameProblems(tree.repeat(ORG_NAME_MAX))).toEqual([])
    expect(orgNameProblems(`  ${tree.repeat(ORG_NAME_MAX)}  `)).toEqual([])
    expect(orgNameProblems(tree.repeat(ORG_NAME_MAX + 1))).toEqual(['too_long'])
    expect(orgNameProblems('x'.repeat(ORG_NAME_MAX))).toEqual([])
    expect(orgNameProblems(`  ${'x'.repeat(ORG_NAME_MAX + 1)}  `)).toEqual(['too_long'])
  })

  it('BSU-01 PD-62: near misses pass, and a name that passes prints exactly as stored', () => {
    for (const name of [
      'Basket Co',
      'Taskforce Pte',
      'Askew Holdings', // the pattern needs a word end after "ask"
      'Ai Partners', // AI is case-sensitive
      'Agency Ltd',
      'Kestrel Test Freight Pte. Ltd.',
      'Wren & Co (S) Pte Ltd',
      'Lê Thị Holdings',
      `Le${char(0x302)} Holdings`, // a combining circumflex, a mark, not a format character
      '翠鸟 Trading',
      `${fullwidth('Kestrel')} Freight`,
    ]) {
      expect(orgNameProblems(name), name).toEqual([])
      expect(flatText(name), name).toBe(name)
      expect(aiCopyIn(flatText(name)), name).toBeUndefined()
    }
  })

  it('BSU-01: problems come in ORG_NAME_PROBLEMS order, however many there are', () => {
    expect(ORG_NAME_PROBLEMS).toEqual(['empty', 'too_long', 'not_plain', 'ai_copy'])
    expect(orgNameProblems(`AI\t${'x'.repeat(ORG_NAME_MAX)}`)).toEqual(['too_long', 'not_plain', 'ai_copy'])
    expect(orgNameProblems(`${'x'.repeat(ORG_NAME_MAX)}  AI`)).toEqual(['too_long', 'not_plain', 'ai_copy'])
  })

  it('BSU-01 PD-62: the answer is codes alone, so nothing built from it holds the name or the word', () => {
    for (const name of [...AI_NAMES, ...TWINS, ...NOT_PLAIN]) {
      const answer = orgNameProblems(name)
      expect(answer.length, points(name)).toBeGreaterThan(0)
      for (const code of answer) {
        expect(ORG_NAME_PROBLEMS, points(name)).toContain(code)
        expect(aiCopyIn(code), code).toBeUndefined()
      }
    }
  })
})
