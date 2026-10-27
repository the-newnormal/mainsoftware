// The organisation's name (TECH-SPEC T22 items 37 and 64; C0.9 PD-62, PD-118): the rules a name
// meets before anything stores it, shared by the Owner bootstrap script (scripts/owner-bootstrap/,
// which refuses before it connects) and, from C0.16, the org settings. The privacy notice and the
// withdrawal reply print the name (notice-text.ts's orgName(), through flatText()), and the DPO
// can't change it, so a name the notice can't print as stored, or one holding wording Hearth keeps
// off its screens (AI_COPY, decision 8), is refused where it is set, never at publish. Migration
// 0001's check (name = btrim(name), 1 to 200 characters) stays the backstop. The problems are
// codes; the caller words each and names the field, never the word or character refused.
//
// The server and the script load this file on Node (T2), and the package compiles with lib ES2024
// and no DOM or Node types.
import { aiCopyIn } from './ai-copy.ts'
import { flatText } from './dpo-contact.ts'

// The most characters a name holds, as Postgres counts them (code points): 0001's orgs check.
export const ORG_NAME_MAX = 200

// Why a name can't be stored, in this order:
//   empty      nothing is left after trimming
//   too_long   more than 200 characters
//   not_plain  a control or format character (a line break, a tab, a bidirectional embedding,
//              override or isolate, a zero-width space or joiner, the soft hyphen), half of an astral
//              character (which UTF-8 can't carry, so the driver would store U+FFFD in its place),
//              any whitespace but the plain space (a no-break or thin space, which flatText() would
//              print as a plain one), or two spaces together: so the name stored is exactly the name
//              the notice prints, and nothing in it is hidden from the person reading it
//   ai_copy    AI_COPY matches the name as typed or as the notice prints it, or its NFKC form, so
//              "AI" or "Ask" in fullwidth letters, which reads as the word, is refused too
export const ORG_NAME_PROBLEMS = ['empty', 'too_long', 'not_plain', 'ai_copy'] as const
export type OrgNameProblem = (typeof ORG_NAME_PROBLEMS)[number]

// Postgres bounds text in code points, where a JavaScript string's length counts UTF-16 units.
const codePoints = (text: string) => [...text].length

// A control (Cc), format (Cf) or lone surrogate (Cs) character, any whitespace but U+0020, or two
// spaces together. Format characters cover the bidirectional controls (cases.ts's BIDI_FORMATTING),
// the zero-width characters and the soft hyphen.
const NOT_PLAIN = /[\p{Cc}\p{Cf}\p{Cs}]|[^\S ]| {2}/u

// What holds a name back, in ORG_NAME_PROBLEMS order. It reads the name trimmed
// (String.prototype.trim(), whose set covers btrim()'s), as the caller stores it: the script and
// C0.16's body store name.trim(), never the text as typed. An empty name has no other problem.
export function orgNameProblems(name: string): OrgNameProblem[] {
  const trimmed = name.trim()
  if (trimmed === '') return ['empty']
  const found = new Set<OrgNameProblem>()
  if (codePoints(trimmed) > ORG_NAME_MAX) found.add('too_long')
  if (NOT_PLAIN.test(trimmed)) found.add('not_plain')
  // The generator tests only the printed text (flatText()), which passes fullwidth letters and so
  // would print them; NFKC folds them, and other compatibility forms, back to the word they show.
  const folded = trimmed.normalize('NFKC')
  const forms = [trimmed, flatText(trimmed), folded, flatText(folded)]
  if (forms.some(text => aiCopyIn(text) !== undefined)) found.add('ai_copy')
  return ORG_NAME_PROBLEMS.filter(problem => found.has(problem))
}
