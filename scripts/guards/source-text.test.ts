// SRC-01 (C0.9 PD-113, review DB-04): no text file the repository holds carries a bidirectional
// embedding, override or isolate character (U+202A to U+202E, U+2066 to U+2069) as raw text. Such
// a character changes the order in which an editor or a diff shows the text around it, so a line
// of source, SQL, docs or fixtures could read one way to a reviewer and run another (Trojan
// Source). Code that refuses these characters in people's text (migration 0012, packages/shared's
// cases.ts and dpo-contact.ts) writes the class as \u escapes, never the characters themselves;
// this guard is what keeps it so, since Biome doesn't flag them and nothing else in CI would.
// A file with a NUL byte in its first 8 KB (an image, the demo's spreadsheets) is binary and
// skipped. A finding names the file, the line and the code point, never the line's text. This file
// writes every such character as an escape too, so it passes its own check.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { repoFiles, root } from './repo-files'

// The characters refused: LRE, RLE, PDF, LRO, RLO, then LRI, RLI, FSI, PDI.
const BIDI_CONTROL = /[\u202A-\u202E\u2066-\u2069]/gu
const BINARY_SNIFF = 8 * 1024

// Whether a file's bytes are binary: a NUL in its first 8 KB, as git decides.
const isBinary = (bytes: Uint8Array) => bytes.subarray(0, BINARY_SNIFF).includes(0)

const codePoint = (char: string) => `U+${(char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`

// Each raw bidirectional control a file holds, as "path:line: U+XXXX", each code point once a line.
function bidiControls(path: string, bytes: Uint8Array): string[] {
  if (isBinary(bytes)) return []
  const found: string[] = []
  for (const [index, line] of new TextDecoder().decode(bytes).split('\n').entries()) {
    const points = new Set([...line.matchAll(BIDI_CONTROL)].map(([char]) => codePoint(char)))
    for (const point of points) found.push(`${path}:${index + 1}: ${point}`)
  }
  return found
}

const bytesOf = (text: string) => new TextEncoder().encode(text)

describe('SRC-01 (C0.9 PD-113, DB-04): no raw bidirectional control character in any text file', () => {
  it('finds each refused character on planted text, and passes escapes and the marks it allows', () => {
    const refused = [0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069]
    for (const point of refused) {
      const char = String.fromCodePoint(point)
      expect(bidiControls('a.sql', bytesOf(`select 1;\n-- x ${char} y\n`)), codePoint(char)).toEqual([
        `a.sql:2: ${codePoint(char)}`,
      ])
    }
    // Each code point once a line, in the order first seen, across lines.
    const rlo = String.fromCodePoint(0x202e)
    const pdi = String.fromCodePoint(0x2069)
    expect(bidiControls('b.ts', bytesOf(`a ${rlo}${pdi}${rlo}\nb\nc ${pdi}`))).toEqual([
      'b.ts:1: U+202E',
      'b.ts:1: U+2069',
      'b.ts:3: U+2069',
    ])
    // The class written as escapes, the marks either side of the range (LRM, RLM, ALM, the word
    // joiner, U+2029 and U+206A), and ordinary Arabic and Chinese text are all allowed.
    const allowed = [
      String.raw`check (details !~ '[\u202A-\u202E\u2066-\u2069]')`,
      String.raw`const BIDI = /[\u202A-\u202E\u2066-\u2069]/u`,
      [0x200e, 0x200f, 0x061c, 0x2060, 0x2029, 0x206a].map(point => String.fromCodePoint(point)).join(' '),
      `Tan Wei Ling, ${String.fromCodePoint(0x645, 0x62d, 0x645, 0x62f)}, ${String.fromCodePoint(0x9648, 0x4f1f, 0x73b2)}`,
    ].join('\n')
    expect(bidiControls('c.ts', bytesOf(allowed))).toEqual([])
  })

  it('skips a file with a NUL byte in its first 8 KB, and reads one whose NUL comes later', () => {
    const rlo = bytesOf(String.fromCodePoint(0x202e))
    const early = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, ...rlo])
    expect(bidiControls('d.png', early)).toEqual([])
    const late = new Uint8Array(BINARY_SNIFF + rlo.length + 1)
    late.fill(0x61)
    late.set(rlo, 0)
    late[BINARY_SNIFF + rlo.length] = 0
    expect(bidiControls('e.txt', late)).toEqual(['e.txt:1: U+202E'])
  })

  it('no file the repository holds has one', () => {
    const files = repoFiles()
    // The guard reads the repository, this file and the migrations included.
    expect(files).toContain('scripts/guards/source-text.test.ts')
    expect(files.some(path => path.startsWith('db/migrations/'))).toBe(true)
    expect(files.flatMap(path => bidiControls(path, readFileSync(join(root, path))))).toEqual([])
  })
})
