// Covers the `# interaction <id>` DSL section — sugar for
// InteractionTypeDefinition + its locale entries, replacing hand-written raw
// JSON via `# advanced` for this one object kind. See docs/content-dsl-
// grammar.md and compiler.ts's compileInteraction for the generic-default
// rationale: an interaction like lockpicking where the lock never fights
// back shouldn't force the author to invent "the lock hit you" flavor text.
import { describe, expect, it } from 'vitest';
import { compileDsl } from './compiler';

const infoBlock = [
  '# info',
  'id: test-module',
  'version: 1.0.0',
  'universe: base',
  'author: test',
  'game_version: 1.0',
].join('\n');

describe('content DSL — # interaction section', () => {
  it('compiles all fields into an InteractionTypeDefinition', () => {
    const source = [
      infoBlock,
      '',
      '# interaction lockpicking',
      'source: thieving',
      'target: thieving',
      'targets player health: false',
      'title: Lockpicking',
      'player hit: You make progress on the lock.',
      'player miss: The lock doesn\'t budge.',
      'player kill: The lock gives with a soft click.',
    ].join('\n');

    const { module, locale } = compileDsl(source);
    const interactionTypes = (module.data as { interactionTypes: Array<Record<string, unknown>> }).interactionTypes;
    expect(interactionTypes).toEqual([
      { id: 'lockpicking', sourceStatId: 'thieving', targetStatId: 'thieving', targetPlayerHealth: false },
    ]);
    expect(locale['interaction.lockpicking.title']).toBe('Lockpicking');
    expect(locale['interaction.lockpicking.player.hit']).toBe('You make progress on the lock.');
    expect(locale['interaction.lockpicking.player.miss']).toBe('The lock doesn\'t budge.');
    expect(locale['interaction.lockpicking.player.kill']).toBe('The lock gives with a soft click.');
  });

  it('defaults targetPlayerHealth to true and every omitted message field to a generic default', () => {
    const source = [
      infoBlock,
      '',
      '# interaction fistfight',
      'source: attack',
      'target: defense',
    ].join('\n');

    const { module, locale } = compileDsl(source);
    const interactionTypes = (module.data as { interactionTypes: Array<Record<string, unknown>> }).interactionTypes;
    expect(interactionTypes).toEqual([
      { id: 'fistfight', sourceStatId: 'attack', targetStatId: 'defense', targetPlayerHealth: true },
    ]);
    // Every locale key collectLocalizationKeys requires is present, even
    // though the author wrote no message fields at all.
    expect(locale['interaction.fistfight.title']).toBeTruthy();
    expect(locale['interaction.fistfight.player.hit']).toBeTruthy();
    expect(locale['interaction.fistfight.player.miss']).toBeTruthy();
    expect(locale['interaction.fistfight.player.kill']).toBeTruthy();
    expect(locale['interaction.fistfight.entity.hit']).toBeTruthy();
    expect(locale['interaction.fistfight.entity.miss']).toBeTruthy();
    expect(locale['interaction.fistfight.entity.kill']).toBeTruthy();
  });

  it('merges with any interactionTypes already declared via # advanced rather than one clobbering the other', () => {
    const source = [
      infoBlock,
      '',
      '# advanced',
      '{ "interactionTypes": [{ "id": "old-style", "sourceStatId": "attack", "targetStatId": "defense", "targetPlayerHealth": true }] }',
      '',
      '# interaction lockpicking',
      'source: thieving',
      'target: thieving',
      'targets player health: false',
    ].join('\n');

    const { module } = compileDsl(source);
    const interactionTypes = (module.data as { interactionTypes: Array<{ id: string }> }).interactionTypes;
    expect(interactionTypes.map((interactionType) => interactionType.id).sort()).toEqual(['lockpicking', 'old-style']);
  });

  it('every compiled action gets generic default success/failure locale entries when unauthored', () => {
    const source = [
      infoBlock,
      '',
      '# location start',
      'x: 0, y: 0',
      'starting',
      '',
      '## entity rock',
      'examine: A rock.',
    ].join('\n');

    const { locale } = compileDsl(source);
    expect(locale['action.entity.rock.examine.success']).toBeTruthy();
    expect(locale['action.entity.rock.examine.failure']).toBeTruthy();
  });
});
