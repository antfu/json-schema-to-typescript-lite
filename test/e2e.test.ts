/* eslint-disable ts/no-require-imports */

import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FileInfo } from '@apidevtools/json-schema-ref-parser'
import { expect, it } from 'vitest'
import find from 'lodash-es/find'
import merge from 'lodash-es/merge'
import type { JSONSchema, Options } from '../src'
import { compile } from '../src'
import { stripExtension } from '../src/utils'
import { getWithCache } from './http'

const dir = fileURLToPath(new URL('e2e', import.meta.url))

interface TestCase {
  input: JSONSchema
  error?: true
  exclude?: boolean
  only?: boolean
  options?: Options
}

export function hasOnly() {
  return readdirSync(dir)
    .filter(_ => /^.*\.js$/.test(_))
    .map(_ => require(join(dir, _)))
    .some(_ => _.only)
}

export async function run() {
  // [filename, absolute dirname, contents][]
  const modules = await Promise.all(
    readdirSync(dir)
      .filter(_ => !_.includes('.ignore.'))
      .map(async _ => [_, await import(join(dir, _))] as [string, TestCase]),
  )

  // exporting `const only=true` will only run that test
  // exporting `const exclude=true` will not run that test
  const only = find(modules, _ => Boolean(_[1].only))
  if (only)
    runOne(only[1], only[0])
  else
    modules.filter(_ => !_[1].exclude).forEach(_ => runOne(_[1], _[0]))
}

const httpWithCacheResolver = {
  order: 1,
  canRead: /^https?:/i,
  async read({ url }: FileInfo) {
    return await getWithCache(url)
  },
}

function runOne(exports: TestCase, name: string) {
  // log('blue', 'Running test', name)

  const options = merge(exports.options, { $refOptions: { resolve: { http: httpWithCacheResolver } } })

  it(name, async () => {
    if (exports.error) {
      try {
        await compile(exports.input, stripExtension(name), options)
      }
      catch (e) {
        expect(e instanceof Error).toBe(true)
      }
    }
    else {
      expect(
        await compile(exports.input, stripExtension(name), options),
      ).toMatchSnapshot()
    }
  })
}

await run()
