// IAC-14 (C11-D70): each landing-zone stack's inventory, the count of each resource type it holds,
// against the committed file snapshot beside this file (__snapshots__/inventory.test.ts.snap), so a
// change that adds, removes or replaces a resource type shows in the diff a reviewer reads. It holds
// types and counts only, never an id, a name or a property, so IG-01 passes it. In CI Vitest writes
// no new snapshot and fails on a missing one; a person updates it with
// `CI= npx vitest run infra/src/inventory.test.ts -u` (the flag after the path, since Vitest's -u
// would take a path after it as its value) and reads the change. It pins no rule, so it stays off the
// owner's-read list (TECH-SPEC T24 item 31). PR 3 adds the workload stacks.
import { beforeAll, describe, expect, it } from 'vitest'
import { type LandingZoneSynth, synthLandingZone } from './testing/landing-zone.ts'
import { resourcesOf } from './testing/synth.ts'

let lz: LandingZoneSynth

beforeAll(() => {
  lz = synthLandingZone()
}, 60_000)

// A template's resource types, each with how many it holds, in type order.
function inventory(template: Record<string, unknown>): Array<[string, number]> {
  const counts = new Map<string, number>()
  for (const resource of Object.values(resourcesOf(template))) {
    counts.set(resource.Type, (counts.get(resource.Type) ?? 0) + 1)
  }
  return [...counts.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
}

describe('IAC-14 C11-D70: the landing zone’s inventory', () => {
  it('IAC-14: each stack holds the resource types and counts the snapshot records', () => {
    const stacks = Object.fromEntries(
      lz.synthesised.stacks.map(stack => [stack.stackName, inventory(stack.template)] as const),
    )
    expect(Object.keys(stacks)).toEqual([
      'Hearth-Foundation',
      'Hearth-LogArchive',
      'Hearth-nonprod-Baseline',
      'Hearth-prod-Baseline',
    ])
    expect(stacks).toMatchSnapshot()
  })
})
