import { describe, expect, it } from 'vitest'

import { err, ok } from './result'

describe('result', () => {
  it('ok wraps a value', () => {
    expect(ok(1)).toEqual({ ok: true, value: 1 })
  })
  it('err wraps an error', () => {
    expect(err('boom')).toEqual({ ok: false, error: 'boom' })
  })
})
