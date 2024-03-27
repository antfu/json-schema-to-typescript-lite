import { expect, it } from 'vitest'
import { link } from '../src/linker'
import type { LinkedJSONSchema } from '../src/types/JSONSchema'
import { generateName, isSchemaLike, pathTransform } from '../src/utils'

it('pathTransform', () => {
  expect(pathTransform('types', 'schemas', 'schemas/foo/a.json')).toBe('types/foo')
  expect(pathTransform('./schemas/types', './schemas', 'schemas/foo/bar/a.json')).toBe('schemas/types/foo/bar')
  expect(pathTransform('types', './src/../types/../schemas', 'schemas/foo/a.json')).toBe('types/foo')
})
it('generateName', () => {
  const usedNames = new Set<string>()
  expect(generateName('a', usedNames)).toBe('A')
  expect(generateName('abc', usedNames)).toBe('Abc')
  expect(generateName('ABcd', usedNames)).toBe('ABcd')
  expect(generateName('$Abc_123', usedNames)).toBe('$Abc_123')
  expect(generateName('Abc-de-f', usedNames)).toBe('AbcDeF')

  // Index should increment:
  expect(generateName('a', usedNames)).toBe('A1')
  expect(generateName('a', usedNames)).toBe('A2')
  expect(generateName('a', usedNames)).toBe('A3')
})
it('isSchemaLike', () => {
  const schema = link({
    title: 'Example Schema',
    type: 'object',
    properties: {
      firstName: {
        type: 'string',
      },
      lastName: {
        id: 'lastName',
        type: 'string',
      },
    },
    required: ['firstName', 'lastName'],
  })
  expect(isSchemaLike(schema)).toBe(true)
  expect(isSchemaLike([] as any as LinkedJSONSchema)).toBe(false)
  expect(isSchemaLike(schema.properties as LinkedJSONSchema)).toBe(false)
  expect(isSchemaLike(schema.required as any as LinkedJSONSchema)).toBe(false)
  expect(isSchemaLike(schema.title as any as LinkedJSONSchema)).toBe(false)
  expect(isSchemaLike(schema.properties!.firstName)).toBe(true)
  expect(isSchemaLike(schema.properties!.lastName)).toBe(true)
})
