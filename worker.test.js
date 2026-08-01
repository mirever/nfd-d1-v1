import test from 'node:test'
import assert from 'node:assert/strict'

import { parseFraudIds, classifyAdminCommand, isAuthorized } from './worker.js'

test('parseFraudIds trims lines and drops empties', () => {
  assert.deepEqual(parseFraudIds(' 123 \n456\r\n\r\n789\n'), ['123', '456', '789'])
  assert.deepEqual(parseFraudIds(''), [])
})

test('classifyAdminCommand recognizes admin commands', () => {
  assert.equal(classifyAdminCommand('/syncFraudDb'), 'syncFraudDb')
  assert.equal(classifyAdminCommand('/block'), 'block')
  assert.equal(classifyAdminCommand('/unblock'), 'unblock')
  assert.equal(classifyAdminCommand('/checkblock'), 'checkblock')
  assert.equal(classifyAdminCommand('hello'), null)
  assert.equal(classifyAdminCommand('/block extra'), null)
  assert.equal(classifyAdminCommand('/block@MyBot'), null)
  assert.equal(classifyAdminCommand(undefined), null)
})

test('isAuthorized checks the secret against env', () => {
  const env = { ENV_BOT_SECRET: 'top-secret' }
  assert.equal(isAuthorized(new URL('https://example.com/init?secret=top-secret'), env), true)
  assert.equal(isAuthorized(new URL('https://example.com/init?secret=wrong'), env), false)
  assert.equal(isAuthorized(new URL('https://example.com/init'), env), false)
})
