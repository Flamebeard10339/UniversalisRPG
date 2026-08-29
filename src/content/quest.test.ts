import { describe, expect, it } from 'vitest';
import { amissIn } from './completion';
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

    expect(spokenBy(registry.dialogues, 'miki').map((each) => each.id)).toEqual(['finding-your-feet.offered.miki.0']);
    expect(registry.dialogues.get('finding-your-feet.offered.miki.0')?.owner).toBe('miki');
  });

  it('moves the quest along by setting the stage a goto names, which is the whole of what a goto does here', () => {
    const node = loaded(QUEST).dialogues.get('finding-your-feet.offered.miki.0')!.nodes[0]!;
    const menu = node.steps.find((step) => step.kind === 'menu')!;

    expect(menu.kind === 'menu' && menu.choices.map((choice) => choice.effects)).toEqual([[{ kind: 'set', variable: 'finding-your-feet.name-yourself' }], [{ kind: 'set', variable: 'finding-your-feet.snubbed' }]]);
  });

  // Two lines from one entity at one stage — a word on arriving and a word on coming back — are two dialogues, and two dialogues under one id would be one dialogue.
  it("keeps a stage's second word to an entity apart from its first", () => {
    const twice = ['# quest an-errand', 'stage asking:', '  log: Asked.', '  complete', '  miki says:', '    always', '    A thing I need.', '  miki says:', '    when: mirror-done', '    You have it.'].join('\n');
    const registry = loaded(twice);

    expect(spokenBy(registry.dialogues, 'miki').map((each) => each.id)).toEqual(['an-errand.asking.miki.0', 'an-errand.asking.miki.1']);
  });

  it('declares a flag for every stage, so anything in the world may ask where the quest has got to', () => {
    expect(loaded(QUEST, '# entity gate', 'title: Gate', 'open it:', '  requires: finding-your-feet.sendoff', '  say: It opens.')).toBeTruthy();
  });

  // A stage's `done when:` is a reference like any other, so the walk reaches it and the page can say what it names that nothing declares.
  it('names what its `done when:` reads, so an undeclared flag there is not silently never true', () => {
    const draft = ['# quest a-quest', 'stage one:', '  done when: no-such-flag', '  goto two', '', 'stage two:', '  complete'].join('\n');

    expect(amissIn(draft, [{ kind: 'flag', address: 'mirror-done' }]).flatMap((each) => each.undeclared)).toEqual([{ kind: 'flag', id: 'no-such-flag' }]);
    expect(amissIn(draft.replace('no-such-flag', 'mirror-done'), [{ kind: 'flag', address: 'mirror-done' }]).flatMap((each) => each.undeclared)).toEqual([]);
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

  // A quest is a graph, and the engine walks it one way: it stands on the last stage it has reached
  // in the order they are written. So a goto to a stage written earlier sets a flag and moves nothing,
  // which is how the tutorial's apology route reached its `complete` stage and stood on `apologised`
  // forever. Named where the author is standing, since what is wrong is either the goto or the order.
  it('a goto to a stage written before the one it is written in, which could never move the quest on', () => {
    expect(refusing('stage one:', '  goto two', '', 'stage two:', '  goto one')).toThrow(/stage two goes back to one, which is written before it/);
    expect(refusing('stage one:', '  complete', '', 'stage two:', '  goto one')).toThrow(/Write one after two/);
  });

  // The other half of the same walk: every goto goes forward and none of them arrives anywhere that ends.
  it('a stage no `complete` can be reached from, however many stages lie between', () => {
    expect(refusing('stage one:', '  goto two', '', 'stage two:', '  goto three', '', 'stage three:', '  goto three')).toThrow(/cannot be completed from stage one/);
  });

  // A stage naming itself is how *stay here* is written, so it is no move and no error either — but it
  // cannot be the only way on, since a quest that can only stay where it is never reaches an end.
  it('a stage whose only way on is itself, though a stage with another way on may name itself freely', () => {
    expect(refusing('stage one:', '  goto one')).toThrow(/cannot be completed from stage one/);
    expect(refusing('stage one:', '  miki says:', '    always', '    Well?', '    -> Stay here.', '      goto one', '    -> Move on.', '      goto two', '', 'stage two:', '  complete')).not.toThrow();
  });

  it('saying it never ends and completing anyway, which are two answers to one question', () => {
    expect(refusing('never ends', 'stage one:', '  complete')).toThrow(/says it `never ends` and stage one completes it/);
  });

  it('a quest with no stages at all', () => {
    expect(refusing('title: Nothing Doing')).toThrow(/a quest is its stages, and this one has none/);
  });

  it('a line a stage has no reading for', () => {
    expect(refusing('stage one:', '  complete', '  nonsense: 3')).toThrow(/unexpected line in a quest stage: "nonsense: 3"/);
  });

  // `hint:` was the journal's second voice and is gone; the journal reads out of `log:` alone, so a line still writing one is refused rather than quietly dropped.
  it('a hint: line, which the journal no longer has a reading for', () => {
    expect(refusing('stage one:', '  hint: Talk to Miki.', '  complete')).toThrow(/unexpected line in a quest stage: "hint: Talk to Miki."/);
    expect(refusing('hint: Talk to Miki.', 'stage one:', '  complete')).toThrow(/unexpected line in # quest: "hint: Talk to Miki."/);
  });

  it('a second log: in one stage', () => {
    expect(refusing('stage one:', '  log: First.', '  log: Second.', '  complete')).toThrow(/log: is defined more than once/);
  });

  it("a second log: at the quest's own top level", () => {
    expect(refusing('log: First.', 'log: Second.', 'stage one:', '  complete')).toThrow(/log: is defined more than once/);
  });
});

// The loop a quest is written in is: write it, walk it, see what is wrong, fix that part. That last
// step is what a second body is for, so a body says what it means to change and nothing else.
describe('a second body at a quest', () => {
  const ERRAND = [
    '# quest an-errand',
    'title: An Errand',
    '',
    'stage offered:',
    '  log: Miki asked for a thing.',
    '  goto sent',
    '  miki says:',
    '    always',
    '    Fetch it for me.',
    '  miki says:',
    '    when: mirror-done',
    '    You have it already.',
    '',
    'stage sent:',
    '  log: I went to fetch it.',
    '  complete',
    '',
    'stage snubbed:',
    '  log: I told Miki no.',
    '  complete',
  ].join('\n');

  const again = (...lines: string[]) => loaded(ERRAND, ['# quest an-errand', ...lines].join('\n')).quests.get('an-errand')!;
  const journal = (stage: { log?: object }): string | undefined => (stage.log as { text?: string } | undefined)?.text;

  it('lays what it writes over the stage of that name and leaves the lines it says nothing about standing', () => {
    const quest = again('stage sent:', '  log: I went and fetched it.');

    expect(journal(quest.stages[1]!)).toBe('I went and fetched it.');
    expect(quest.stages[1]!.complete).toBe(true);
    expect(journal(quest.stages[0]!)).toBe('Miki asked for a thing.');
    expect(quest.title).toBe('An Errand');
  });

  it('leaves the stages already written in the order they were written, however it orders them itself', () => {
    const quest = again('stage snubbed:', '  log: I sent Miki away.', '', 'stage offered:', '  log: Miki asked me for something.');

    expect(quest.stages.map((stage) => stage.name)).toEqual(['offered', 'sent', 'snubbed']);
    expect(quest.flags).toEqual(['offered', 'sent', 'snubbed']);
  });

  it('puts a stage the quest has not got after the ones it has', () => {
    const quest = again('stage offered:', '  goto grumbled', '', 'stage grumbled:', '  log: I went, grumbling.', '  complete');

    expect(quest.stages.map((stage) => stage.name)).toEqual(['offered', 'sent', 'snubbed', 'grumbled']);
  });

  it('changes the title on its own, without a stage having to be written out again', () => {
    const quest = again('title: A Longer Errand');

    expect(quest.title).toBe('A Longer Errand');
    expect(quest.stages.map((stage) => stage.name)).toEqual(['offered', 'sent', 'snubbed']);
  });

  // A stage's lines are told apart by the order they are written in and nothing else, so there is no
  // name for a second body to lay one over: giving a stage a word is giving it every word it has there.
  it('writes all of a stage\u2019s speech when it writes any of it', () => {
    const quest = again('stage offered:', '  miki says:', '    always', '    Changed my mind.');

    expect(quest.stages[0]!.speech).toHaveLength(1);
    expect(quest.stages[0]!.speech[0]!.node.steps.flatMap((step) => (step.kind === 'say' ? step.segments.flatMap((segment) => (segment.kind === 'literal' ? [segment.text] : [])) : []))).toEqual(['Changed my mind.']);
  });

  it('takes a stage out where it writes -stage, and takes nothing out for a name no stage answers to', () => {
    expect(again('-stage snubbed').stages.map((stage) => stage.name)).toEqual(['offered', 'sent']);
    expect(again('-stage nowhere').stages.map((stage) => stage.name)).toEqual(['offered', 'sent', 'snubbed']);
  });

  // Silently taking nothing out is safe because the quest is answered for whole once the bodies are in:
  // a stage cannot be taken out from under a goto that still names it.
  it('is held to the quest the stages make once every body is in', () => {
    expect(() => again('-stage sent')).toThrow(/stage offered goes to sent, which is no stage of this quest/);
  });

  it('refuses an indented block under a -stage, which reads as lines for a stage that is going', () => {
    expect(() => again('-stage snubbed', '  log: I told Miki no.')).toThrow(/takes no indented block/);
  });
});
