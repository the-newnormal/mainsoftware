// The committed profiles (C11-D28): what C0.11 PR 3's stacks are built from, held to the design's
// table and to T19 item 16 before any stack reads them.
import { describe, expect, it } from 'vitest'
import {
  appHost,
  DOMAINS,
  ENVIRONMENTS,
  isPlaceholderDomain,
  LOG_ARCHIVE,
  NOFILE_LIMIT,
  originHost,
  PROFILES,
  REALTIME_HEAP_MIB,
  REGION,
  ROLES,
  userContentHost,
} from './profiles.ts'

// A CIDR's first and last addresses as numbers.
function range(cidr: string): [number, number] {
  const [address = '', bits = ''] = cidr.split('/')
  const value = address.split('.').reduce((total, octet) => total * 256 + Number(octet), 0)
  const size = 2 ** (32 - Number(bits))
  return [value, value + size - 1]
}

describe('C11-D28: the profiles', () => {
  it('every stack is in ap-southeast-1 (D37, B.6)', () => {
    expect(REGION).toBe('ap-southeast-1')
  })

  it('each environment has a private /16 of its own, disjoint from the others (IAC-20)', () => {
    const ranges = ENVIRONMENTS.map(environment => range(PROFILES[environment].vpcCidr))
    for (const environment of ENVIRONMENTS) expect(PROFILES[environment].vpcCidr).toMatch(/^10\.\d+\.0\.0\/16$/)
    for (const [i, [start, end]] of ranges.entries()) {
      for (const [other, [otherStart, otherEnd]] of ranges.entries()) {
        if (i !== other) expect(end < otherStart || otherEnd < start).toBe(true)
      }
    }
  })

  it('T19 item 16: two realtime tasks live in non-prod and prod, each sized for 25,000 sockets', () => {
    for (const environment of ['nonprod', 'prod'] as const) {
      const profile = PROFILES[environment]
      expect(profile.live).toBe(true)
      expect(profile.taskAzs).toBe(2)
      expect(profile.services.realtime.count).toBeGreaterThanOrEqual(2)
      expect(profile.services.realtime).toMatchObject({ cpu: 512, memoryMiB: 2_048 })
    }
    // The heap cap leaves room inside the task for the kernel's socket memory and the process.
    expect(REALTIME_HEAP_MIB).toBe(1_536)
    expect(REALTIME_HEAP_MIB).toBeLessThan(PROFILES.prod.services.realtime.memoryMiB)
    expect(NOFILE_LIMIT).toBe(65_536)
  })

  it('every service is a Fargate size: CPU and memory a valid pair, at least one task where live', () => {
    // Fargate's memory ranges for 0.25 and 0.5 vCPU (the only CPU sizes C0.11 uses).
    const memory: Record<number, readonly number[]> = { 256: [512, 1_024, 2_048], 512: [1_024, 2_048, 3_072, 4_096] }
    for (const environment of ENVIRONMENTS) {
      for (const role of ROLES) {
        const size = PROFILES[environment].services[role]
        expect(memory[size.cpu], `${environment} ${role}`).toContain(size.memoryMiB)
        expect(size.count, `${environment} ${role}`).toBeGreaterThanOrEqual(1)
      }
    }
  })

  it('C11-D69: non-prod holds synthetic data until C0.12 flips it; prod and restore hold real data', () => {
    expect(PROFILES.nonprod.holdsRealData).toBe(false)
    expect(PROFILES.prod.holdsRealData).toBe(true)
    expect(PROFILES.restore.holdsRealData).toBe(true)
  })

  it('SMK-02: no environment sends an SMS in C0.11, and the restore stage never does', () => {
    for (const environment of ENVIRONMENTS) expect(PROFILES[environment].smsProvider).toBeUndefined()
  })

  it('C11-D53: no database and no /ready gate until C0.12; Runtime Monitoring waits for C0.19', () => {
    for (const environment of ENVIRONMENTS) {
      expect(PROFILES[environment].hasDatabase).toBe(false)
      expect(PROFILES[environment].readyGate).toEqual([])
      expect(PROFILES[environment].runtimeMonitoring).toBe(false)
    }
  })

  it('C11-D45: the restore stage runs as prod, only under restoreActive, with no load balancer', () => {
    expect(PROFILES.restore.deployEnv).toBe('prod')
    expect(PROFILES.restore.live).toBe('restoreActive')
    expect(PROFILES.restore.alb).toBeUndefined()
    expect(appHost('restore')).toBeUndefined()
    expect(originHost('restore')).toBeUndefined()
  })

  it('C11-D41: the load balancers face the internet until C0.12, prod’s with deletion protection (IAC-19)', () => {
    expect(PROFILES.nonprod.alb).toEqual({ ingress: 'internet', deletionProtection: false })
    expect(PROFILES.prod.alb).toEqual({ ingress: 'internet', deletionProtection: true })
  })

  it('C11-D30, C11-D33: endpoints span two AZs in prod; the resource-org statement and the perimeter go on in non-prod first', () => {
    expect(PROFILES.prod.endpointAzs).toBe(2)
    expect(PROFILES.nonprod.endpointAzs).toBe(1)
    expect(PROFILES.nonprod.endpointResourceOrg).toBe(true)
    expect(PROFILES.nonprod.taskRolePerimeter).toBe(true)
  })

  it('C11-D31: every environment names the same AWS-managed S3 prefix list, which is no account id', () => {
    const lists = new Set(ENVIRONMENTS.map(environment => PROFILES[environment].s3PrefixList))
    expect(lists.size).toBe(1)
    for (const list of lists) expect(list).toMatch(/^pl-[0-9a-f]{8}(?:[0-9a-f]{9})?$/)
  })

  it('C11-D18: the log-archive lock starts in GOVERNANCE', () => {
    expect(LOG_ARCHIVE.logLockMode).toBe('GOVERNANCE')
  })
})

describe('C11-D43: the domains and hosts', () => {
  it('knows a placeholder under .invalid from a real domain', () => {
    expect(isPlaceholderDomain('hearth-app.invalid')).toBe(true)
    expect(isPlaceholderDomain('nonprod.hearth-app.INVALID.')).toBe(true)
    expect(isPlaceholderDomain('example.com')).toBe(false)
    expect(isPlaceholderDomain('invalid.example.com')).toBe(false)
  })

  it('the app and user content are on two registrable domains, so never same-site', () => {
    expect(DOMAINS.app).not.toBe(DOMAINS.userContent)
    expect(DOMAINS.userContent.endsWith(`.${DOMAINS.app}`)).toBe(false)
    expect(DOMAINS.app.endsWith(`.${DOMAINS.userContent}`)).toBe(false)
  })

  it('C11-Q08 is open, so both domains are still placeholders, which the landing-zone entry refuses for a real target', () => {
    expect(isPlaceholderDomain(DOMAINS.app)).toBe(true)
    expect(isPlaceholderDomain(DOMAINS.userContent)).toBe(true)
  })

  it('prod answers at the app domain, non-prod under nonprod., and the load balancer at origin.', () => {
    expect(appHost('prod')).toBe(DOMAINS.app)
    expect(appHost('nonprod')).toBe(`nonprod.${DOMAINS.app}`)
    expect(userContentHost('prod')).toBe(DOMAINS.userContent)
    expect(userContentHost('nonprod')).toBe(`nonprod.${DOMAINS.userContent}`)
    expect(userContentHost('restore')).toBeUndefined()
    expect(originHost('prod')).toBe(`origin.${DOMAINS.app}`)
    expect(originHost('nonprod')).toBe(`origin.nonprod.${DOMAINS.app}`)
  })
})
