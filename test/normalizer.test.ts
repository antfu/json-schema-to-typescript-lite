import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import type { JSONSchema, Options } from '../src'
import { DEFAULT_OPTIONS } from '../src'
import { link } from '../src/linker'
import { normalize } from '../src/normalizer'

interface JSONTestCase {
  name: string
  in: JSONSchema
  out: JSONSchema
  options?: Options
}

const normalizerDir = fileURLToPath(new URL('normalizer', import.meta.url))

const modules = await Promise.all(
  readdirSync(normalizerDir)
    .filter(_ => /^.*\.json$/.test(_))
    .map(_ => join(normalizerDir, _))
    .map(async _ => [_, await import(_).then(r => r.default)] as [string, JSONTestCase]),
)

modules
  .forEach(([filename, json]: [string, JSONTestCase]) => {
    it(json.name, () => {
      const normalized = normalize(link(json.in), new WeakMap(), filename, json.options ?? DEFAULT_OPTIONS)
      expect(json.out).toEqual(normalized)
    })
  })
