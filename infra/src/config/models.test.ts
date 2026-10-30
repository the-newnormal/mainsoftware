// The two model lists every model deny renders (C11-D06, C11-D75). Model actions are built here
// from the lists themselves, never written out, so the only file naming one stays models.ts (IG-10,
// from C0.11 PR 2).
import { describe, expect, it } from 'vitest'
import { globsOverlap, grantsModelAction, MODEL_ACTIONS, MODEL_SERVICE_PREFIXES, modelDenyActions } from './models.ts'

const [firstPrefix = ''] = MODEL_SERVICE_PREFIXES
const [firstAction = ''] = MODEL_ACTIONS
const actionService = firstAction.slice(0, firstAction.indexOf(':'))

describe('C11-D06: the model lists', () => {
  it('each prefix is a lower-case IAM service prefix, listed once: the 61 the Service Reference check of 30 Oct 2026 left', () => {
    for (const prefix of MODEL_SERVICE_PREFIXES) expect(prefix).toMatch(/^[a-z][a-z0-9-]*$/)
    expect(new Set(MODEL_SERVICE_PREFIXES).size).toBe(MODEL_SERVICE_PREFIXES.length)
    // A prefix only leaves by a reviewed change; one AWS doesn't publish never joins (models.ts).
    expect(MODEL_SERVICE_PREFIXES).toHaveLength(61)
  })

  it('each model action names a service outside the prefix list, once, as service:Action: the 34 of 30 Oct 2026', () => {
    for (const action of MODEL_ACTIONS) {
      expect(action).toMatch(/^[a-z][a-z0-9-]*:[A-Za-z*]+$/)
      const service = action.slice(0, action.indexOf(':'))
      // A service already denied whole needs no action of its own.
      expect(MODEL_SERVICE_PREFIXES as readonly string[]).not.toContain(service)
    }
    expect(new Set(MODEL_ACTIONS).size).toBe(MODEL_ACTIONS.length)
    expect(MODEL_ACTIONS).toHaveLength(34)
  })

  it('a deny renders every prefix as prefix:* and then every model action, in the lists’ order', () => {
    const rendered = modelDenyActions()
    expect(rendered).toHaveLength(MODEL_SERVICE_PREFIXES.length + MODEL_ACTIONS.length)
    expect(rendered[0]).toBe(`${firstPrefix}:*`)
    expect(rendered.slice(MODEL_SERVICE_PREFIXES.length)).toEqual([...MODEL_ACTIONS])
    // An SCP holds at most 5,120 characters, whitespace included (IAC-02). The model statement is
    // hearth-no-models' only one, and stays within half its room, so the lists can grow as AWS adds
    // model features before the policy has to split.
    expect(JSON.stringify({ Effect: 'Deny', Action: rendered, Resource: '*' }).length).toBeLessThan(2_560)
  })
})

describe('C11-D06: whether an Allow could grant a model action (IAC-01)', () => {
  it('matches IAM globs case-insensitively, either side may hold * or ?', () => {
    expect(globsOverlap('s3:get*', 's3:getobject')).toBe(true)
    expect(globsOverlap('s3:getobject', 's3:get*')).toBe(true)
    expect(globsOverlap('s3:*object', 's3:get*')).toBe(true)
    expect(globsOverlap('s3:get?bject', 's3:getobject')).toBe(true)
    expect(globsOverlap('s3:put*', 's3:getobject')).toBe(false)
    expect(globsOverlap('ec2:*', 's3:*')).toBe(false)
  })

  it('finds a model service whole, by wildcard and in any case, and the model actions inside other services', () => {
    expect(grantsModelAction('*')).toBe(true)
    expect(grantsModelAction(`${firstPrefix}:Invoke${'Model'}`)).toBe(true)
    expect(grantsModelAction(`${firstPrefix.toUpperCase()}:*`)).toBe(true)
    expect(grantsModelAction(`${firstPrefix.slice(0, 3)}*:List*`)).toBe(true)
    expect(grantsModelAction(firstAction)).toBe(true)
    expect(grantsModelAction(`${actionService}:*`)).toBe(true)
    expect(grantsModelAction(`${actionService}:Generate*`)).toBe(true)
    for (const action of MODEL_ACTIONS) expect(grantsModelAction(action)).toBe(true)
  })

  it('passes what grants no model action', () => {
    for (const pattern of ['s3:GetObject', 'logs:CreateLogStream', 'ecr:GetAuthorizationToken', 'sts:AssumeRole']) {
      expect(grantsModelAction(pattern)).toBe(false)
    }
    expect(grantsModelAction(`${actionService}:PutMetricData`)).toBe(false)
    expect(grantsModelAction(`${actionService}:Describe*`)).toBe(false)
    expect(grantsModelAction('not-an-action')).toBe(false)
  })
})
