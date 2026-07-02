import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSchema = (fileName: string) =>
  JSON.parse(readFileSync(join(process.cwd(), 'src', 'game', 'schema', fileName), 'utf8')) as Record<string, unknown>;

describe('json schema files', () => {
  it('keeps locale dictionaries aligned with runtime locale validation', () => {
    const localeSchema = readSchema('locale.schema.json');

    expect(localeSchema.additionalProperties).toEqual({ type: 'string', minLength: 1 });
    expect(localeSchema.propertyNames).toEqual({ minLength: 1 });
  });

  it('keeps numeric module game versions aligned with runtime version validation', () => {
    const moduleSchema = readSchema('module.schema.json') as {
      $defs: { gameVersion: { oneOf: Array<Record<string, unknown>> } };
    };
    const numericGameVersion = moduleSchema.$defs.gameVersion.oneOf.find((variant) => variant.type === 'number');

    expect(numericGameVersion).toMatchObject({
      maximum: 65535,
      minimum: 0,
      multipleOf: 1,
      type: 'number',
    });
  });

  it('supports dialogue option removal maps in module data-updates schema', () => {
    const moduleSchema = readSchema('module.schema.json') as {
      $defs: {
        dataUpdates: { properties: { remove: { properties: Record<string, unknown> } } };
        dialogueOptionRemovals: Record<string, unknown>;
      };
    };

    expect(moduleSchema.$defs.dataUpdates.properties.remove.properties.dialogueOptions).toEqual({
      $ref: '#/$defs/dialogueOptionRemovals',
    });
    expect(moduleSchema.$defs.dialogueOptionRemovals).toEqual({
      type: 'object',
      additionalProperties: { $ref: '#/$defs/idList' },
    });
  });
});
