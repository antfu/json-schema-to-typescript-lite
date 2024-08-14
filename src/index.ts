import process from 'node:process'
import type { JSONSchema4 } from 'json-schema'
import type { ParserOptions as $RefOptions } from '@apidevtools/json-schema-ref-parser'
import cloneDeep from 'lodash-es/cloneDeep'
import endsWith from 'lodash-es/endsWith'
import merge from 'lodash-es/merge'
import { generate } from './generator'
import { normalize } from './normalizer'
import { optimize } from './optimizer'
import { parse } from './parser'
import { dereference } from './resolver'
import { validate } from './validator'
import { link } from './linker'
import { validateOptions } from './optionValidator'
import type { JSONSchema as LinkedJSONSchema } from './types/JSONSchema'

export {
  normalizeIdentifier,
  isSafeIdentifier,
  toSafeIdentifier,
} from './utils'

export type {
  EnumJSONSchema,
  JSONSchema,
  NamedEnumJSONSchema,
  CustomTypeJSONSchema,
} from './types/JSONSchema'

export interface Options {
  /**
   * [$RefParser](https://github.com/BigstickCarpet/json-schema-ref-parser) Options, used when resolving `$ref`s
   */
  $refOptions: $RefOptions
  /**
   * Default value for additionalProperties, when it is not explicitly set.
   */
  additionalProperties: boolean
  /**
   * Root directory for resolving [`$ref`](https://tools.ietf.org/id/draft-pbryan-zyp-json-ref-03.html)s.
   */
  cwd: string
  /**
   * Declare external schemas referenced via `$ref`?
   */
  declareExternallyReferenced: boolean
  /**
   * Prepend enums with [`const`](https://www.typescriptlang.org/docs/handbook/enums.html#computed-and-constant-members)?
   */
  enableConstEnums: boolean
  /**
   * Ignore maxItems and minItems for `array` types, preventing tuples being generated.
   */
  ignoreMinAndMaxItems: boolean
  /**
   * Maximum number of unioned tuples to emit when representing bounded-size array types,
   * before falling back to emitting unbounded arrays. Increase this to improve precision
   * of emitted types, decrease it to improve performance, or set it to `-1` to ignore
   * `minItems` and `maxItems`.
   */
  maxItems: number
  /**
   * Append all index signatures with `| undefined` so that they are strictly typed.
   *
   * This is required to be compatible with `strictNullChecks`.
   */
  strictIndexSignatures: boolean
  /**
   * Generate code for `definitions` that aren't referenced by the schema?
   */
  unreachableDefinitions: boolean
  /**
   * Generate unknown type instead of any
   */
  unknownAny: boolean
  /**
   * Custom function to provide a type name for a given schema
   */
  customName?: (schema: LinkedJSONSchema, keyNameFromDefinition: string | undefined) => string
}

export const DEFAULT_OPTIONS: Options = {
  $refOptions: {},
  additionalProperties: true, // TODO: default to empty schema (as per spec) instead
  cwd: process.cwd(),
  declareExternallyReferenced: true,
  enableConstEnums: true,
  ignoreMinAndMaxItems: false,
  maxItems: 20,
  strictIndexSignatures: false,
  unreachableDefinitions: false,
  unknownAny: true,
}

export async function compile(schema: JSONSchema4, name: string, options: Partial<Options> = {}): Promise<string> {
  validateOptions(options)

  const _options = merge({}, DEFAULT_OPTIONS, options)

  // normalize options
  if (!endsWith(_options.cwd, '/'))
    _options.cwd += '/'

  // Initial clone to avoid mutating the input
  const _schema = cloneDeep(schema)

  const { dereferencedPaths, dereferencedSchema } = await dereference(_schema, _options)

  const linked = link(dereferencedSchema)

  const errors = validate(linked, name)
  if (errors.length) {
    errors.forEach(_ => console.error(_))
    throw new ValidationError()
  }

  const normalized = normalize(linked, dereferencedPaths, name, _options)
  const parsed = parse(normalized, _options)
  const optimized = optimize(parsed, _options)
  const generated = generate(optimized, _options)

  return generated
}

export class ValidationError extends Error {}
