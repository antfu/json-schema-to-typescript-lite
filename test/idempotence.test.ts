import { expect, it } from 'vitest'
import type { JSONSchema4 } from 'json-schema'
import cloneDeep from 'lodash-es/cloneDeep'
import { compile } from '../src'

export function run() {
  const SCHEMA: JSONSchema4 = {
    type: 'object',
    properties: {
      firstName: {
        type: 'string',
      },
    },
    required: ['firstName'],
  }

  it('compile() should not mutate its input', async () => {
    const before = cloneDeep(SCHEMA)
    await compile(SCHEMA, 'A')
    expect(before).toEqual(SCHEMA)
  })

  it('compile() should be idempotent', async () => {
    const a = await compile(SCHEMA, 'A')
    const b = await compile(SCHEMA, 'A')
    expect(a).toEqual(b)
  })
}

await run()
