import type { ParserOptions } from '@apidevtools/json-schema-ref-parser'
import { $RefParser } from '@apidevtools/json-schema-ref-parser'
import type { JSONSchema4 } from 'json-schema'

export type DereferencedPaths = WeakMap<JSONSchema4, string>

export async function dereference(
  schema: JSONSchema4,
  { cwd, $refOptions }: { cwd: string, $refOptions: ParserOptions },
): Promise<{ dereferencedPaths: DereferencedPaths, dereferencedSchema: JSONSchema4 }> {
  // log('green', 'dereferencer', 'Dereferencing input schema:', cwd, schema)
  const parser = new $RefParser()
  const dereferencedPaths: DereferencedPaths = new WeakMap()
  const dereferencedSchema = (await parser.dereference(cwd, schema as any, {
    ...$refOptions,
    dereference: {
      ...$refOptions.dereference,
      onDereference($ref: any, schema: any) {
        dereferencedPaths.set(schema, $ref)
      },
    },
  })) as any // TODO: fix types
  return { dereferencedPaths, dereferencedSchema }
}
