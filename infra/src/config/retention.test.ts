// Infra reads every period from the retention registry (C11-D22, TECH-SPEC T24 item 9).
import { CLOUDWATCH_RETENTION_DAYS, RETENTION_CLASS_KEYS, RETENTION_CLASSES } from '@hearth/shared'
import * as logs from 'aws-cdk-lib/aws-logs'
import { describe, expect, it } from 'vitest'
import { cloudWatchRetention, LOCKED_LOG_CLASSES, logsClassDays, objectLockDays } from './retention.ts'

const logsClasses = RETENTION_CLASS_KEYS.filter(key => RETENTION_CLASSES[key].store === 'logs')

describe('C11-D22: retention from the registry', () => {
  it('every logs class with a period in days maps to a retention CloudWatch accepts and CDK names', () => {
    expect(logsClasses.length).toBeGreaterThan(0)
    for (const key of logsClasses) {
      const days = logsClassDays(key)
      expect(CLOUDWATCH_RETENTION_DAYS as readonly number[]).toContain(days)
      expect(Number(cloudWatchRetention(key))).toBe(days)
    }
  })

  it('reads the classes C0.11 sets as they are: app_logs 90 days, cloudtrail 731', () => {
    expect(cloudWatchRetention('app_logs')).toBe(logs.RetentionDays.THREE_MONTHS)
    expect(cloudWatchRetention('cloudtrail')).toBe(logs.RetentionDays.TWO_YEARS)
  })

  it('C11-D18, C11-D19: the locked log-archive classes are logs classes whose lock is their period', () => {
    for (const key of LOCKED_LOG_CLASSES) {
      expect(RETENTION_CLASSES[key].store).toBe('logs')
      expect(objectLockDays(key)).toBe(logsClassDays(key))
    }
    expect(objectLockDays('cloudtrail')).toBe(731)
  })

  it('refuses a class that isn’t in the logs, naming it', () => {
    const postgres = RETENTION_CLASS_KEYS.find(key => RETENTION_CLASSES[key].store === 'postgres')
    expect(postgres).toBeDefined()
    if (postgres !== undefined)
      expect(() => logsClassDays(postgres)).toThrow(new RegExp(`${postgres} is stored in postgres`))
  })
})
