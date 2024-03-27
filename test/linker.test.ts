import { expect, it } from 'vitest'
import { link } from '../src/linker'
import { Parent } from '../src/types/JSONSchema'
import { input } from './e2e/basics'

it('linker should link to each node\'s parent schema', () => {
  const schema = link(input) as any
  expect(schema[Parent]).toBe(null)
  expect(schema.properties[Parent]).toBe(schema)
  expect(schema.properties.firstName[Parent]).toBe(schema.properties)
  expect(schema.properties.lastName[Parent]).toBe(schema.properties)
  expect(schema.properties.age[Parent]).toBe(schema.properties)
  expect(schema.properties.height[Parent]).toBe(schema.properties)
  expect(schema.properties.favoriteFoods[Parent]).toBe(schema.properties)
  expect(schema.properties.likesDogs[Parent]).toBe(schema.properties)
  expect(schema.required[Parent]).toBe(schema)
})
