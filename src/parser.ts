import type { JSONSchema4Type, JSONSchema4TypeName } from 'json-schema'
import type { Options } from './'
import type {
  AST,
  TInterface,
  TInterfaceParam,
  TIntersection,
  TNamedInterface,
  TTuple,
} from './types/AST'
import type {
  JSONSchemaWithDefinitions,
  JSONSchema as LinkedJSONSchema,
  SchemaSchema,
  SchemaType,
} from './types/JSONSchema'
import findKey from 'lodash-es/findKey'
import includes from 'lodash-es/includes'
import isPlainObject from 'lodash-es/isPlainObject'
import map from 'lodash-es/map'
import memoize from 'lodash-es/memoize'
import omit from 'lodash-es/omit'
import {
  T_ANY,
  T_ANY_ADDITIONAL_PROPERTIES,
  T_UNKNOWN,
  T_UNKNOWN_ADDITIONAL_PROPERTIES,
} from './types/AST'
import {
  getRootSchema,
  isBoolean,
  isPrimitive,
} from './types/JSONSchema'
import { typesOfSchema } from './typesOfSchema'
import { generateName, maybeStripDefault, maybeStripNameHints } from './utils'

export type Processed = Map<LinkedJSONSchema, Map<SchemaType, AST>>

export type UsedNames = Set<string>

export function parse(
  schema: LinkedJSONSchema | JSONSchema4Type,
  options: Options,
  keyName?: string,
  processed: Processed = new Map(),
  usedNames = new Set<string>(),
): AST {
  if (isPrimitive(schema)) {
    if (isBoolean(schema))
      return parseBooleanSchema(schema, keyName, options)

    return parseLiteral(schema, keyName)
  }

  const types = typesOfSchema(schema)
  if (types.length === 1) {
    const ast = parseAsTypeWithCache(schema, types[0], options, keyName, processed, usedNames)
    // log('blue', 'parser', 'Types:', types, 'Input:', schema, 'Output:', ast)
    return ast
  }

  // Be careful to first process the intersection before processing its params,
  // so that it gets first pick for standalone name.
  const ast = parseAsTypeWithCache(
    {
      $id: schema.$id,
      allOf: [],
      description: schema.description,
      title: schema.title,
    },
    'ALL_OF',
    options,
    keyName,
    processed,
    usedNames,
  ) as TIntersection

  ast.params = types.map(type =>
    // We hoist description (for comment) and id/title (for standaloneName)
    // to the parent intersection type, so we remove it from the children.
    parseAsTypeWithCache(maybeStripNameHints(schema), type, options, keyName, processed, usedNames),
  )

  // log('blue', 'parser', 'Types:', types, 'Input:', schema, 'Output:', ast)
  return ast
}

function parseAsTypeWithCache(
  schema: LinkedJSONSchema,
  type: SchemaType,
  options: Options,
  keyName?: string,
  processed: Processed = new Map(),
  usedNames = new Set<string>(),
): AST {
  // If we've seen this node before, return it.
  let cachedTypeMap = processed.get(schema)
  if (!cachedTypeMap) {
    cachedTypeMap = new Map()
    processed.set(schema, cachedTypeMap)
  }
  const cachedAST = cachedTypeMap.get(type)
  if (cachedAST)
    return cachedAST

  // Cache processed ASTs before they are actually computed, then update
  // them in place using set(). This is to avoid cycles.
  // TODO: Investigate alternative approaches (lazy-computing nodes, etc.)
  const ast = {} as AST
  cachedTypeMap.set(type, ast)

  // Update the AST in place. This updates the `processed` cache, as well
  // as any nodes that directly reference the node.
  return Object.assign(ast, parseNonLiteral(schema, type, options, keyName, processed, usedNames))
}

function parseBooleanSchema(schema: boolean, keyName: string | undefined, options: Options): AST {
  if (schema) {
    return {
      keyName,
      type: options.unknownAny ? 'UNKNOWN' : 'ANY',
    }
  }

  return {
    keyName,
    type: 'NEVER',
  }
}

function parseLiteral(schema: JSONSchema4Type, keyName: string | undefined): AST {
  return {
    keyName,
    params: schema,
    type: 'LITERAL',
  }
}

const getDefinitionsMemoized = memoize(getDefinitions)

function parseNonLiteral(
  schema: LinkedJSONSchema,
  type: SchemaType,
  options: Options,
  keyName: string | undefined,
  processed: Processed,
  usedNames: UsedNames,
): AST {
  const definitions = getDefinitionsMemoized(getRootSchema(schema as any)) // TODO
  const keyNameFromDefinition = findKey(definitions, _ => _ === schema)

  switch (type) {
    case 'ALL_OF':
      return {
        comment: schema.description,
        deprecated: schema.deprecated,
        keyName,
        standaloneName: standaloneName(schema, keyNameFromDefinition, usedNames, options),
        params: schema.allOf!.map(_ => parse(_, options, undefined, processed, usedNames)),
        type: 'INTERSECTION',
      }
    case 'ANY':
      return {
        ...(options.unknownAny ? T_UNKNOWN : T_ANY),
        comment: schema.description,
        deprecated: schema.deprecated,
        keyName,
        standaloneName: standaloneName(schema, keyNameFromDefinition, usedNames, options),
      }
    case 'ANY_OF':
      return {
        comment: schema.description,
        deprecated: schema.deprecated,
        keyName,
        standaloneName: standaloneName(schema, keyNameFromDefinition, usedNames, options),
        params: schema.anyOf!.map(_ => parse(_, options, undefined, processed, usedNames)),
        type: 'UNION',
      }
    case 'BOOLEAN':
      return {
        comment: schema.description,
        deprecated: schema.deprecated,
        keyName,
        standaloneName: standaloneName(schema, keyNameFromDefinition, usedNames, options),
        type: 'BOOLEAN',
      }
    case 'CUSTOM_TYPE':
      return {
        comment: schema.description,
        deprecated: schema.deprecated,
        keyName,
        params: schema.tsType!,
        standaloneName: standaloneName(schema, keyNameFromDefinition, usedNames, options),
        type: 'CUSTOM_TYPE',
      }
    case 'NAMED_ENUM':
      return {
        comment: schema.description,
        deprecated: schema.deprecated,
        keyName,
        standaloneName: standaloneName(schema, keyNameFromDefinition ?? keyName, usedNames, options)!,
        params: schema.enum!.map((_, n) => ({
          ast: parseLiteral(_, undefined),
          keyName: schema.tsEnumNames![n],
        })),
        type: 'ENUM',
      }
    case 'NAMED_SCHEMA':
      return newInterface(schema as SchemaSchema, options, processed, usedNames, keyName)
    case 'NEVER':
      return {
        comment: schema.description,
        deprecated: schema.deprecated,
        keyName,
        standaloneName: standaloneName(schema, keyNameFromDefinition, usedNames, options),
        type: 'NEVER',
      }
    case 'NULL':
      return {
        comment: schema.description,
        deprecated: schema.deprecated,
        keyName,
        standaloneName: standaloneName(schema, keyNameFromDefinition, usedNames, options),
        type: 'NULL',
      }
    case 'NUMBER':
      return {
        comment: schema.description,
        deprecated: schema.deprecated,
        keyName,
        standaloneName: standaloneName(schema, keyNameFromDefinition, usedNames, options),
        type: 'NUMBER',
      }
    case 'OBJECT':
      return {
        comment: schema.description,
        keyName,
        standaloneName: standaloneName(schema, keyNameFromDefinition, usedNames, options),
        type: 'OBJECT',
        deprecated: schema.deprecated,
      }
    case 'ONE_OF':
      return {
        comment: schema.description,
        deprecated: schema.deprecated,
        keyName,
        standaloneName: standaloneName(schema, keyNameFromDefinition, usedNames, options),
        params: schema.oneOf!.map(_ => parse(_, options, undefined, processed, usedNames)),
        type: 'UNION',
      }
    case 'REFERENCE':
      throw new Error(`Refs should have been resolved by the resolver! ${JSON.stringify(schema, null, 2)}`)
    case 'STRING':
      return {
        comment: schema.description,
        deprecated: schema.deprecated,
        keyName,
        standaloneName: standaloneName(schema, keyNameFromDefinition, usedNames, options),
        type: 'STRING',
      }
    case 'TYPED_ARRAY':
      if (Array.isArray(schema.items)) {
        // normalised to not be undefined
        const minItems = schema.minItems!
        const maxItems = schema.maxItems!
        const arrayType: TTuple = {
          comment: schema.description,
          deprecated: schema.deprecated,
          keyName,
          maxItems,
          minItems,
          standaloneName: standaloneName(schema, keyNameFromDefinition, usedNames, options),
          params: schema.items.map(_ => parse(_, options, undefined, processed, usedNames)),
          type: 'TUPLE',
        }
        if (schema.additionalItems === true)
          arrayType.spreadParam = options.unknownAny ? T_UNKNOWN : T_ANY
        else if (schema.additionalItems)
          arrayType.spreadParam = parse(schema.additionalItems, options, undefined, processed, usedNames)

        return arrayType
      }
      else {
        return {
          comment: schema.description,
          deprecated: schema.deprecated,
          keyName,
          standaloneName: standaloneName(schema, keyNameFromDefinition, usedNames, options),
          params: parse(schema.items!, options, `{keyNameFromDefinition}Items`, processed, usedNames),
          type: 'ARRAY',
        }
      }
    case 'UNION':
      return {
        comment: schema.description,
        deprecated: schema.deprecated,
        keyName,
        standaloneName: standaloneName(schema, keyNameFromDefinition, usedNames, options),
        params: (schema.type as JSONSchema4TypeName[]).map((type) => {
          const member: LinkedJSONSchema = { ...omit(schema, '$id', 'description', 'title'), type }
          return parse(maybeStripDefault(member as any), options, undefined, processed, usedNames)
        }),
        type: 'UNION',
      }
    case 'UNNAMED_ENUM':
      return {
        comment: schema.description,
        deprecated: schema.deprecated,
        keyName,
        standaloneName: standaloneName(schema, keyNameFromDefinition, usedNames, options),
        params: schema.enum!.map(_ => parseLiteral(_, undefined)),
        type: 'UNION',
      }
    case 'UNNAMED_SCHEMA':
      return newInterface(schema as SchemaSchema, options, processed, usedNames, keyName, keyNameFromDefinition)
    case 'UNTYPED_ARRAY': {
      // normalised to not be undefined
      const minItems = schema.minItems!
      const maxItems = typeof schema.maxItems === 'number' ? schema.maxItems : -1
      const params = options.unknownAny ? T_UNKNOWN : T_ANY
      if (minItems > 0 || maxItems >= 0) {
        return {
          comment: schema.description,
          deprecated: schema.deprecated,
          keyName,
          maxItems: schema.maxItems,
          minItems,
          // create a tuple of length N
          params: Array.from({ length: Math.max(maxItems, minItems) || 0 }).fill(params) as AST[],
          // if there is no maximum, then add a spread item to collect the rest
          spreadParam: maxItems >= 0 ? undefined : params,
          standaloneName: standaloneName(schema, keyNameFromDefinition, usedNames, options),
          type: 'TUPLE',
        }
      }

      return {
        comment: schema.description,
        deprecated: schema.deprecated,
        keyName,
        params,
        standaloneName: standaloneName(schema, keyNameFromDefinition, usedNames, options),
        type: 'ARRAY',
      }
    }
  }
}

/**
 * Compute a schema name using a series of fallbacks
 */
function standaloneName(
  schema: LinkedJSONSchema,
  keyNameFromDefinition: string | undefined,
  usedNames: UsedNames,
  options: Options,
): string | undefined {
  if (options.customName)
    return options.customName(schema, keyNameFromDefinition)

  const name = schema.title || schema.$id || keyNameFromDefinition
  if (name)
    return generateName(name, usedNames)
}

function newInterface(
  schema: SchemaSchema,
  options: Options,
  processed: Processed,
  usedNames: UsedNames,
  keyName?: string,
  keyNameFromDefinition?: string,
): TInterface {
  const name = standaloneName(schema, keyNameFromDefinition, usedNames, options)!
  return {
    comment: schema.description,
    deprecated: schema.deprecated,
    keyName,
    params: parseSchema(schema, options, processed, usedNames, name),
    standaloneName: name,
    superTypes: parseSuperTypes(schema, options, processed, usedNames),
    type: 'INTERFACE',
  }
}

function parseSuperTypes(
  schema: SchemaSchema,
  options: Options,
  processed: Processed,
  usedNames: UsedNames,
): TNamedInterface[] {
  // Type assertion needed because of dereferencing step
  // TODO: Type it upstream
  const superTypes = schema.extends as SchemaSchema[] | undefined
  if (!superTypes)
    return []

  return superTypes.map(_ => parse(_, options, undefined, processed, usedNames) as TNamedInterface)
}

/**
 * Helper to parse schema properties into params on the parent schema's type
 */
function parseSchema(
  schema: SchemaSchema,
  options: Options,
  processed: Processed,
  usedNames: UsedNames,
  _parentSchemaName: string,
): TInterfaceParam[] {
  let asts: TInterfaceParam[] = map(schema.properties, (value, key: string) => ({
    ast: parse(value, options, key, processed, usedNames),
    isPatternProperty: false,
    isRequired: includes(schema.required || [], key),
    isUnreachableDefinition: false,
    keyName: key,
  }))

  let singlePatternProperty = false
  if (schema.patternProperties) {
    // partially support patternProperties. in the case that
    // additionalProperties is not set, and there is only a single
    // value definition, we can validate against that.
    singlePatternProperty = !schema.additionalProperties && Object.keys(schema.patternProperties).length === 1

    asts = asts.concat(
      map(schema.patternProperties, (value, key: string) => {
        const ast = parse(value, options, key, processed, usedNames)
        return {
          ast,
          isPatternProperty: !singlePatternProperty,
          isRequired: singlePatternProperty || includes(schema.required || [], key),
          isUnreachableDefinition: false,
          keyName: singlePatternProperty ? '[k: string]' : key,
        }
      }),
    )
  }

  if (options.unreachableDefinitions) {
    asts = asts.concat(
      map(schema.$defs, (value, key: string) => {
        const ast = parse(value, options, key, processed, usedNames)
        return {
          ast,
          isPatternProperty: false,
          isRequired: includes(schema.required || [], key),
          isUnreachableDefinition: true,
          keyName: key,
        }
      }),
    )
  }

  // handle additionalProperties
  switch (schema.additionalProperties) {
    case undefined:
    case true:
      if (singlePatternProperty)
        return asts

      return asts.concat({
        ast: options.unknownAny ? T_UNKNOWN_ADDITIONAL_PROPERTIES : T_ANY_ADDITIONAL_PROPERTIES,
        isPatternProperty: false,
        isRequired: true,
        isUnreachableDefinition: false,
        keyName: '[k: string]',
      })

    case false:
      return asts

    // pass "true" as the last param because in TS, properties
    // defined via index signatures are already optional
    default:
      return asts.concat({
        ast: parse(schema.additionalProperties, options, '[k: string]', processed, usedNames),
        isPatternProperty: false,
        isRequired: true,
        isUnreachableDefinition: false,
        keyName: '[k: string]',
      })
  }
}

interface Definitions { [k: string]: LinkedJSONSchema }

function getDefinitions(
  schema: LinkedJSONSchema,
  isSchema = true,
  processed = new Set<LinkedJSONSchema>(),
): Definitions {
  if (processed.has(schema))
    return {}

  processed.add(schema)
  if (Array.isArray(schema)) {
    return schema.reduce(
      (prev, cur) => ({
        ...prev,
        ...getDefinitions(cur, false, processed),
      }),
      {},
    )
  }
  if (isPlainObject(schema)) {
    return {
      ...(isSchema && hasDefinitions(schema) ? schema.$defs : {}),
      ...Object.keys(schema).reduce<Definitions>(
        (prev, cur) => ({
          ...prev,
          ...getDefinitions(schema[cur], false, processed),
        }),
        {},
      ),
    }
  }
  return {}
}

/**
 * TODO: Reduce rate of false positives
 */
function hasDefinitions(schema: LinkedJSONSchema): schema is JSONSchemaWithDefinitions {
  return '$defs' in schema
}
