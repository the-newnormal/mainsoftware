// The shapes of values that identify someone, or an account, which public files in this repository
// must never hold (CLAUDE.md, Security and privacy; the repository is public). Two guards share one
// list: RB-03 (runbooks.test.ts) holds every runbook to it, and BSG-01 (owner-bootstrap.test.ts)
// holds the Owner bootstrap script, its tests, its check, its harness, its integration suite and
// its runbook to it, comments included (TECH-SPEC T22 items 46 and 70). These are shapes: a
// person's name or a postal address has none, so review keeps those out. gitleaks' default rules
// find neither names nor numbers, so these guards and review are the only checks.

// One shape. A finding names the kind only, never the value it matched.
export interface IdentifyingShape {
  kind: string
  pattern: RegExp
}

export const PHONE_NUMBER = 'a phone number'
export const ACCOUNT_ID = 'a 12-digit run (an AWS account id)'

export const IDENTIFYING: readonly IdentifyingShape[] = [
  // + and a run of six or more digits, spaces, hyphens, dots or brackets, whose first figure is a
  // digit: any international number, however it is grouped.
  { kind: PHONE_NUMBER, pattern: /\+(?=[ ().-]*\d)[\d ().-]{6,}/ },
  // A Singapore number written locally: eight digits starting 3, 6, 8 or 9, split after the fourth or not.
  { kind: PHONE_NUMBER, pattern: /(?<!\d)[3689]\d{3}[ -]?\d{4}(?!\d)/ },
  { kind: 'an email address', pattern: /[\w.%+-]+@[\w-]+(?:\.[\w-]+)+/ },
  { kind: ACCOUNT_ID, pattern: /\d{12}/ },
  // As the AWS Console shows an account id.
  { kind: ACCOUNT_ID, pattern: /(?<!\d)\d{4}-\d{4}-\d{4}(?!\d)/ },
  { kind: 'an ARN', pattern: /\barn:aws[\w-]*:/i },
  { kind: 'a Twilio SID', pattern: /\b(?:AC|VA|SK|PN|MG|US)[0-9a-fA-F]{32}\b/ },
]

// One match on a line: its kind, where it starts and ends, and the text it matched, which a guard
// reads only to decide an allowance and never prints.
export interface IdentifyingMatch {
  kind: string
  start: number
  end: number
  text: string
}

// Every match of every shape a line holds, in the list's order and then left to right.
export function identifyingMatches(line: string): IdentifyingMatch[] {
  const found: IdentifyingMatch[] = []
  for (const { kind, pattern } of IDENTIFYING) {
    const global = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`)
    for (const match of line.matchAll(global)) {
      const start = match.index ?? 0
      found.push({ kind, start, end: start + match[0].length, text: match[0] })
    }
  }
  return found
}
