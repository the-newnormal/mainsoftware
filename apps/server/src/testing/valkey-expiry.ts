// Valkey's key families and their longest lives as packages/shared's retention registry names them
// (C0.10 LH-07; TECH-SPEC T23 item 6), and what a suite checks of the keys its run leaves behind: each
// key is one family's, and expires, at most its family's figure from now (LCI-01, the sign-in suite;
// LCI-02, the realtime suite). Valkey's expiry is no delete path a hold can stop, so a key written
// without one, or with a longer one than the registry states, would keep sign-in state the registry
// says is gone; this finds it. lifecycle/retention.test.ts (LCV-01, LCV-02) pins the figures to the
// code that sets them and the families to valkeyKeys().
import { RETENTION_CLASSES, type RetentionClass } from '@hearth/shared'
import type { Redis } from 'ioredis'
import { valkeyKeys } from '#src/auth/valkey-keys.ts'

export type ValkeyLife = number | 'not_stored'

// Every Valkey family the registry's classes name, with its longest life in milliseconds, or
// 'not_stored' for a pub/sub channel. A family named by two classes is a registry fault, and throws.
export function valkeyFamilies(): Record<string, ValkeyLife> {
  const families: Record<string, ValkeyLife> = {}
  const classes: Readonly<Record<string, RetentionClass>> = RETENTION_CLASSES
  for (const [key, spec] of Object.entries(classes)) {
    if (spec.store !== 'valkey' || spec.period.kind !== 'ttl') continue
    for (const [family, life] of Object.entries(spec.period.families)) {
      if (Object.hasOwn(families, family)) throw new Error(`the Valkey family ${family} is named twice (${key})`)
      families[family] = life
    }
  }
  return families
}

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// Stands in for each argument of a key's name function, so the name's fixed parts can be read.
const SLOT = '\u0000'

// What each family's keys look like under a prefix, read from valkeyKeys() itself: a function's
// fixed parts with any text for each argument, and a channel's name exactly.
export function familyPatterns(prefix: string): Map<string, RegExp> {
  const patterns = new Map<string, RegExp>()
  for (const [family, name] of Object.entries(valkeyKeys(prefix))) {
    // Each argument of a name function is a string (a narrower union for challenge's kind), and the
    // slot is never one of its values, so the name is only read, never used.
    const named = name as string | ((...args: string[]) => string)
    const sample = typeof named === 'function' ? named(...Array.from({ length: named.length }, () => SLOT)) : named
    patterns.set(family, new RegExp(`^${sample.split(SLOT).map(escaped).join('.+')}$`, 's'))
  }
  return patterns
}

// The family a key belongs to, or undefined when it matches none, or more than one.
export function familyOf(patterns: ReadonlyMap<string, RegExp>, key: string): string | undefined {
  const matched = [...patterns].filter(([, pattern]) => pattern.test(key)).map(([family]) => family)
  return matched.length === 1 ? matched[0] : undefined
}

// Every key under the prefix, read with SCAN, judged against the registry: one family's, with an
// expiry above 0 and at most its family's figure. Answers what it found wrong (each key named after
// the prefix: keyed hashes, ids and fixed words only, never a value) and the families it saw.
export async function valkeyExpiryProblems(
  valkey: Redis,
  prefix: string,
): Promise<{ problems: string[]; seen: Set<string> }> {
  const families = valkeyFamilies()
  const patterns = familyPatterns(prefix)
  const keys: string[] = []
  let cursor = '0'
  do {
    const [next, found] = await valkey.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 1000)
    cursor = next
    keys.push(...found)
  } while (cursor !== '0')
  const problems: string[] = []
  const seen = new Set<string>()
  for (const key of keys.sort()) {
    const name = key.slice(prefix.length)
    const family = familyOf(patterns, key)
    const life = family === undefined ? undefined : families[family]
    if (family === undefined || life === undefined) {
      problems.push(
        `${name} belongs to no Valkey family the retention registry names (packages/shared RETENTION_CLASSES)`,
      )
      continue
    }
    if (life === 'not_stored') {
      problems.push(`${name} is stored under the ${family} channel's name, which the registry says keeps nothing`)
      continue
    }
    const ttl = await valkey.pttl(key)
    // -2: it expired between the scan and now, which is what expiry is for.
    if (ttl === -2) continue
    seen.add(family)
    if (ttl === -1) problems.push(`${name} (${family}) has no expiry`)
    else if (ttl <= 0 || ttl > life) {
      problems.push(`${name} (${family}) expires in ${ttl} ms; the registry gives its family at most ${life} ms`)
    }
  }
  return { problems, seen }
}
