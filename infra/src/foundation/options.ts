// The landing zone's variant choices, each defaulting to its committed value (C11-D18, C11-D07,
// C11-D43, C11-D69): the entry passes none, so a real synth builds exactly what the configuration and
// profiles.ts commit, and the assertion tests pass one at a time to synthesise a variant (COMPLIANCE
// locks, the RCP at Root, non-prod holding real data, a filled `nonprod.` delegation) without
// editing a committed value. Every stack takes the resolved form, so no stack reads a default of its
// own. It imports src/config/ alone. This file decides what a real synth builds, so it is on the
// owner's-read list (C11-D74).
import { LOG_ARCHIVE, NONPROD_NAME_SERVERS, PROFILES } from '../config/profiles.ts'

// Where the RCP is attached (C11-D07): the non-prod account first, and Root by a reviewed PR after a
// week of clean non-prod deploys, from C0.11 PR 4.
export const RCP_TARGET: 'nonprod' | 'root' = 'nonprod'

export interface NameServers {
  app: readonly string[]
  userContent: readonly string[]
}

export interface LandingZoneOptions {
  logLockMode?: 'GOVERNANCE' | 'COMPLIANCE'
  holdsRealData?: Partial<Record<'nonprod' | 'prod', boolean>>
  rcpTarget?: 'nonprod' | 'root'
  nonprodNameServers?: NameServers
}

// Every option decided, as the stacks read them.
export interface ResolvedLandingZoneOptions {
  logLockMode: 'GOVERNANCE' | 'COMPLIANCE'
  holdsRealData: Readonly<Record<'nonprod' | 'prod', boolean>>
  rcpTarget: 'nonprod' | 'root'
  nonprodNameServers: NameServers
}

// Each option as given, or its committed value: the log-archive buckets' lock mode, each workload
// account's holdsRealData (each key on its own, so a variant naming one keeps the other's), the RCP's
// target and non-prod's name servers.
export function resolveLandingZoneOptions(options: LandingZoneOptions = {}): ResolvedLandingZoneOptions {
  return {
    logLockMode: options.logLockMode ?? LOG_ARCHIVE.logLockMode,
    holdsRealData: {
      nonprod: options.holdsRealData?.nonprod ?? PROFILES.nonprod.holdsRealData,
      prod: options.holdsRealData?.prod ?? PROFILES.prod.holdsRealData,
    },
    rcpTarget: options.rcpTarget ?? RCP_TARGET,
    nonprodNameServers: options.nonprodNameServers ?? NONPROD_NAME_SERVERS,
  }
}
