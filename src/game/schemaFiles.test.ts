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

  it('supports typed module data rows in module schema', () => {
    const moduleSchema = readSchema('module.schema.json') as {
      $defs: {
        dataEntry: { oneOf: Array<{ $ref: string }> };
        typedDataSection: { items: unknown };
        typedDataUpdatesSection: { items: { oneOf: unknown[] } };
        removeEntry: { properties: { type: { const: string }; target: { enum: string[] } }; allOf: unknown[] };
        actionEntry: {
          additionalProperties: boolean;
          required: string[];
          properties: {
            type: { enum: string[] };
            instant: unknown;
            durationSeconds: unknown;
            rewards: { items: { $ref: string } };
          };
        };
        entityEntry: {
          additionalProperties: boolean;
          required: string[];
          properties: { type: { enum: string[] }; actionIds: unknown };
        };
        itemEntry: {
          additionalProperties: boolean;
          required: string[];
          properties: { type: { enum: string[] }; maxQuantity: unknown };
        };
        resourceEntry: {
          additionalProperties: boolean;
          required: string[];
          properties: { type: { enum: string[] }; onEmpty: { items: { $ref: string } } };
        };
      };
    };
    const actionsSchema = readSchema('actions.schema.json') as { items: { properties: Record<string, unknown> } };
    const itemsSchema = readSchema('items.schema.json') as { items: { properties: Record<string, unknown> } };

    expect(moduleSchema.$defs.typedDataSection.items).toEqual({ $ref: '#/$defs/dataEntry' });
    expect(moduleSchema.$defs.dataEntry.oneOf).toEqual(expect.arrayContaining([
      { $ref: '#/$defs/actionEntry' },
      { $ref: '#/$defs/entityEntry' },
      { $ref: '#/$defs/itemEntry' },
      { $ref: '#/$defs/resourceEntry' },
    ]));
    expect(moduleSchema.$defs.typedDataUpdatesSection.items.oneOf).toEqual([
      { $ref: '#/$defs/dataEntry' },
      { $ref: '#/$defs/removeEntry' },
    ]);
    expect(moduleSchema.$defs.removeEntry.properties.type.const).toBe('remove');
    expect(moduleSchema.$defs.removeEntry.properties.target.enum).toEqual(expect.arrayContaining(['entities', 'items', 'dialogueOptions', 'locales']));
    expect(moduleSchema.$defs.removeEntry.allOf).toHaveLength(1);
    expect(moduleSchema.$defs.actionEntry).toMatchObject({
      additionalProperties: false,
      required: expect.arrayContaining(['id', 'type', 'rewards']),
      properties: {
        type: { enum: ['action', 'actions'] },
        instant: { type: 'boolean' },
        rewards: { items: { $ref: 'https://universalis-rpg.local/schema/actions.schema.json#/$defs/reward' } },
      },
    });
    expect(moduleSchema.$defs.actionEntry.required).not.toContain('locationId');
    expect(moduleSchema.$defs.entityEntry).toMatchObject({
      additionalProperties: false,
      required: expect.arrayContaining(['id', 'type']),
      properties: { type: { enum: ['entity', 'entities'] }, actions: { items: { $ref: 'https://universalis-rpg.local/schema/entities.schema.json#/$defs/action' } } },
    });
    expect(moduleSchema.$defs.entityEntry.required).not.toContain('actionIds');
    expect(moduleSchema.$defs.actionEntry.properties.instant).toEqual(actionsSchema.items.properties.instant);
    expect(moduleSchema.$defs.actionEntry.properties.durationSeconds).toEqual(actionsSchema.items.properties.durationSeconds);
    expect(moduleSchema.$defs.itemEntry).toMatchObject({
      additionalProperties: false,
      required: expect.arrayContaining(['id', 'type']),
      properties: { type: { enum: ['item', 'items'] } },
    });
    expect(moduleSchema.$defs.itemEntry.properties.maxQuantity).toEqual(itemsSchema.items.properties.maxQuantity);
    expect(moduleSchema.$defs.resourceEntry).toMatchObject({
      additionalProperties: false,
      required: expect.arrayContaining(['id', 'type', 'sourceStat']),
      properties: {
        type: { enum: ['resource', 'resources', 'resourceDefinition', 'resourceDefinitions'] },
        onEmpty: { items: { $ref: 'https://universalis-rpg.local/schema/resources.schema.json#/$defs/behavior' } },
      },
    });
  });
});
