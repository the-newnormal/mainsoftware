// Every period infra sets comes from the retention registry (packages/shared RETENTION_CLASSES,
// TECH-SPEC T23 items 2 to 6, T24 item 9), never retyped: each log group's retention (IAC-07), and
// the log-archive buckets' Object Lock days and their one expiry (IAC-06, C11-D18, C11-D19). The
// logs classes have no SQL mirror (RETENTION_DB_STORES is Postgres and S3), so a new logs class
// changes only the registry and LCS-07's pinned list, never a migration (C11-D22).
import {
  CLOUDWATCH_RETENTION_DAYS,
  RETENTION_CLASSES,
  type RetentionClass,
  type RetentionClassKey,
} from '@hearth/shared'
import * as logs from 'aws-cdk-lib/aws-logs'

// The classes whose data lives in AWS's logs (store 'logs'), which infra ages out.
export type LogsClassKey = {
  [K in RetentionClassKey]: (typeof RETENTION_CLASSES)[K]['store'] extends 'logs' ? K : never
}[RetentionClassKey]

// The classes held in the log-archive account's buckets under Object Lock, expired by the bucket's
// own retention once each version's lock has passed (C11-D19, LCG-02's one LIFECYCLE_ALLOWED entry
// from C0.11 PR 2).
export const LOCKED_LOG_CLASSES = ['cloudtrail', 'break_glass_log'] as const satisfies readonly LogsClassKey[]

// A logs class's period in days, from the registry. It refuses a class that isn't stored in the
// logs, or whose period isn't a number of days, since infra can't set anything else.
export function logsClassDays(key: RetentionClassKey): number {
  const spec: RetentionClass = RETENTION_CLASSES[key]
  if (spec.store !== 'logs') throw new Error(`retention class ${key} is stored in ${spec.store}, not in the logs`)
  if (spec.period.kind !== 'days') throw new Error(`retention class ${key} has no period in days`)
  return spec.period.days
}

// A log group's retention for its class, as CDK's RetentionDays. CloudWatch accepts only certain
// values (CLOUDWATCH_RETENTION_DAYS, which LCS-07 holds every logs class to), and CDK's enum must
// name the value too, or the log group would be made with a retention nobody chose.
export function cloudWatchRetention(key: RetentionClassKey): logs.RetentionDays {
  const days = logsClassDays(key)
  if (!(CLOUDWATCH_RETENTION_DAYS as readonly number[]).includes(days)) {
    throw new Error(`retention class ${key}'s ${days} days isn't a value CloudWatch Logs accepts`)
  }
  const value = Object.values(logs.RetentionDays).find(v => v === days)
  if (value === undefined) throw new Error(`aws-cdk-lib's RetentionDays has no ${days}`)
  return value as logs.RetentionDays
}

// The Object Lock default retention, and the expiry after it, for a locked log-archive bucket's
// class: its period in days (731 for both today).
export function objectLockDays(key: (typeof LOCKED_LOG_CLASSES)[number]): number {
  return logsClassDays(key)
}
