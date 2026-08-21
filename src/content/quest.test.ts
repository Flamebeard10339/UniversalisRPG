import { describe, expect, it } from 'vitest';
import { loadInEnglish } from './engineLocale';
import { loadModule } from './load';
import { parseModule, printSectionOf } from './sections';
import { spokenBy } from './sections/dialogue';

const WORLD = ['# location shore', 'x: 0, y: 0', 'starting', '', '# flag mirror-done', '', '# entity miki', 'title: Miki'].join('\n');

const QUEST = [
  '# quest finding-your-feet',
  'title: Finding Your Feet',
  '',
  'stage offered:',
  '  log: Miki offered to show you the ropes.',
  '  hint: Talk to Miki.',
  '  miki says:',
  '    Welcome to the island.',
  '    -> Sounds good.',
  '      goto name-yourself',
  '    -> I would rather not.',
  '      goto snubbed',
  '',
  'stage name-yourself:',
  '  log: Miki wants you to name yourself.',
  '  done when: mirror-done',
  '  goto sendoff',
  '',
  'stage sendoff:',
  '  log: You saw Miki off.',
  '  complete',
  '',
  'stage snubbed:',
  '  log: You turned Miki down.',
  '  complete',
].join('\n');

const loaded = (...parts: string[]) => loadInEnglish([WORLD, ...parts].join('\n\n'));

const refusing = (...stage: string[]) => () => loadModule([WORLD, '', '# quest a-quest', ...stage].join('\n'));

describe('a quest', () => {
  it('gives its lines to the entity each stage names, without that entity or its own dialogue being edited', () => {
    const registry = loaded(QUEST);

    expect(spokenBy(registry.dialogues, 'miki').map((each) => each.id)).toEqual(['finding-your-feet.offered.miki']);
    expect(registry.dialogues.get('finding-your-feet.offered.miki')?.owner).toBe('miki');
  });

  it('moves the quest along by setting the stage a goto names, which is the whole of what a goto does here', () => {
    const node = loaded(QUEST).dialogues.get('finding-your-feet.offered.miki')!.nodes[0]!;
    const menu = node.steps.find((step) => step.kind === 'menu')!;

    expect(menu.kind === 'menu' && menu.choices.map((choice) => choice.effects)).toEqual([[{ kind: 'set', variable: 'finding-your-feet.name-yourself' }], [{ kind: 'set', variable: 'finding-your-feet.snubbed' }]]);
  });

  it('declares a flag for every stage, so anything in the world may ask where the quest has got to', () => {
    expect(loaded(QUEST, '# entity gate', 'title: Gate', 'open it:', '  requires: finding-your-feet.sendoff', '  say: It opens.')).toBeTruthy();
  });

  it('prints back to the same quest, so nothing it holds is lost on the way out', () => {
    const printed = printSectionOf(parseModule(QUEST)[0]!, { moduleId: 'a-module', id: 'finding-your-feet', authored: () => true });

    expect(printed).toBe(QUEST);
  });
});

describe('what a quest is refused for', () => {
  it('a goto naming no stage of its own', () => {
    expect(refusing('stage one:', '  goto nowhere')).toThrow(/stage one goes to nowhere, which is no stage of this quest/);
  });

  it('a stage nothing leaves, since a quest that cannot move is not a quest', () => {
    expect(refusing('stage one:', '  log: Something happened.')).toThrow(/nothing leaves stage one/);
  });

  it('saying when a stage is done without saying where that leaves it', () => {
    expect(refusing('stage one:', '  done when: mirror-done')).toThrow(/stage one says when it is done and not where that leaves the quest/);
  });

  it('a stage that both completes the quest and goes somewhere', () => {
    expect(refusing('stage one:', '  complete', '  goto two', '', 'stage two:', '  complete')).toThrow(/completes the quest and also goes somewhere/);
  });

  it('two stages written under one name', () => {
    expect(refusing('stage one:', '  complete', '', 'stage one:', '  complete')).toThrow(/stage one is written twice/);
  });

  it('a quest with no stages at all', () => {
    expect(refusing('title: Nothing Doing')).toThrow(/a quest is its stages, and this one has none/);
  });

  it('a line a stage has no reading for', () => {
    expect(refusing('stage one:', '  complete', '  nonsense: 3')).toThrow(/unexpected line in a quest stage: "nonsense: 3"/);
  });
});
