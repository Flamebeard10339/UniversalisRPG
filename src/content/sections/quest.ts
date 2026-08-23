import { ActionResult } from '../../grammar/actionResult';
import { Condition, condition } from '../../grammar/condition';
import { DslError, parseWhole, Written } from '../../grammar/parser';
import { moduleLocalId } from '../../grammar/section';
import { indentLines, RawLine, takeBlock } from '../../grammar/structure';
import { lastSegment, text } from '../../grammar/values';
import { condition as visitCondition, put, results, type Visit } from '../refs';
import { Dialogue, DialogueNode, nodeBody, nodeGrammar, parseNode, visitDialogue } from './dialogue';
import { section } from './define';

// What one NPC is given to say while a stage is the one the player is on.
export interface QuestSpeech {
  owner: string;
  node: DialogueNode;
}

// What the player is turning over, and when that is what they are turning over. A stage is left by a line an entity says as often as by a `done when:`, so one stage spans more than one beat — do the thing, then go back and tell them — and no single string is right in both.
export interface QuestHint {
  when?: Condition;
  said: ActionResult;
}

export interface QuestStage {
  name: string;
  // Held as spoken lines rather than as plain strings: a journal entry is said to a player, so it is addressed and translated like every other line the game says.
  log?: ActionResult;
  hints: QuestHint[];
  doneWhen?: Condition;
  goto?: string;
  complete?: boolean;
  speech: QuestSpeech[];
}

export interface Quest {
  id: string;
  title?: string;
  // What the journal reads before the quest has begun. A stage's own log says what has happened; these say what has not.
  log?: ActionResult;
  hints: QuestHint[];
  stages: QuestStage[];
  // A flag per stage, which is how the rest of the world names where a quest has got to. Derived from the stages, so nothing declares it twice.
  flags: string[];
}

const TITLE = /^title:[ \t]?(?<said>.*)$/;
const STAGE = /^stage[ \t]+(?<name>[a-z][a-z0-9-]*):$/;
const LOG = /^log:[ \t]?(?<said>.*)$/;
const HINT = /^hint:[ \t]?(?<said>.*)$/;
// The condition sits before the colon because everything after a colon in this language is the value, and a hint's value is the words. No condition holds a colon, so the first one splits the line.
const HINT_WHEN = /^hint when[ \t]+(?<cond>[^:]+):[ \t]?(?<said>.*)$/;
const DONE = /^done when:[ \t]*(?<cond>.+)$/;
const GOTO = /^goto[ \t]+(?<name>[a-z][a-z0-9-]*)$/;
const SAYS = /^(?<owner>[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*)[ \t]+says:$/;

const spoken = (said: string): ActionResult => ({ kind: 'say', text: said });

// Every line the journal can read off a quest or off one of its stages, in the order it is written, which is the order they are keyed and reviewed in.
const spokenHere = (held: { log?: ActionResult; hints: readonly QuestHint[] }): ActionResult[] => [...(held.log === undefined ? [] : [held.log]), ...held.hints.map((hint) => hint.said)];

// A hint line, wherever it is written: the quest's own and a stage's are the same line and answer the same question, one about a quest nobody has begun and one about where it stands. A second unconditional one would leave nothing saying which is the default, so it is refused rather than silently winning over the first.
function takeHint(line: RawLine, into: QuestHint[]): boolean {
  const plain = HINT.exec(line.text)?.groups;
  if (plain) {
    if (into.some((hint) => hint.when === undefined)) throw new DslError('hint: with no condition is defined more than once', line.span);
    into.push({ said: spoken(plain.said!) });
    return true;
  }
  const gated = HINT_WHEN.exec(line.text)?.groups;
  if (!gated) return false;
  into.push({ when: parseWhole(condition, gated.cond!.trim(), line.span.start, 'a hint when'), said: spoken(gated.said!) });
  return true;
}

// `log:` is one line, wherever it is written; a second would only ever silently replace the first, so it is refused for the same reason a second unconditional hint is.
function takeLog(line: RawLine, held: { log?: ActionResult }): boolean {
  const log = LOG.exec(line.text)?.groups;
  if (!log) return false;
  if (held.log !== undefined) throw new DslError('log: is defined more than once', line.span);
  held.log = spoken(log.said!);
  return true;
}

function parseStage(name: string, source: RawLine): QuestStage {
  const stage: QuestStage = { name, hints: [], speech: [] };
  for (const line of takeBlock(source)) {
    if (takeHint(line, stage.hints)) continue;
    if (takeLog(line, stage)) continue;
    const done = DONE.exec(line.text)?.groups;
    const goto = GOTO.exec(line.text)?.groups;
    const says = SAYS.exec(line.text)?.groups;
    if (done) stage.doneWhen = parseWhole(condition, done.cond!, line.span.start, 'a done when');
    else if (goto) stage.goto = goto.name;
    else if (line.text === 'complete') stage.complete = true;
    else if (says) stage.speech.push({ owner: says.owner!, node: parseNode('said', line) });
    else throw new DslError(`unexpected line in a quest stage: ${JSON.stringify(line.text)}`, line.span);
  }
  return stage;
}

const said = (result: ActionResult): string => (result.kind === 'say' ? result.text : '');

const hintLines = (hints: readonly QuestHint[]): string[] => hints.map((hint) => (hint.when === undefined ? `hint: ${said(hint.said)}` : `hint when ${condition.print(hint.when)}: ${said(hint.said)}`));

const stageLines = (stage: QuestStage): string[] => [
  `stage ${stage.name}:`,
  ...(stage.log === undefined ? [] : [`  log: ${stage.log.kind === 'say' ? stage.log.text : ''}`]),
  ...indentLines(hintLines(stage.hints), 2),
  ...(stage.doneWhen === undefined ? [] : [`  done when: ${condition.print(stage.doneWhen)}`]),
  ...(stage.goto === undefined ? [] : [`  goto ${stage.goto}`]),
  ...(stage.complete ? ['  complete'] : []),
  ...stage.speech.flatMap((each) => [`  ${each.owner} says:`, ...indentLines(nodeBody(each.node), 2)]),
];

const flagOf = (quest: { id: string }, stage: string): string => `${quest.id}.${stage}`;

const names = (id: string): Condition => ({ kind: 'reference', reference: { path: id.split('.') } });
const not = (held: Condition): Condition => ({ kind: 'not', condition: held });
const all = (held: Condition[]): Condition | undefined => (held.length === 0 ? undefined : held.length === 1 ? held[0] : { kind: 'and', conditions: held });

const any = (held: Condition[]): Condition | undefined => (held.length === 0 ? undefined : held.length === 1 ? held[0] : { kind: 'or', conditions: held });

// When a stage has been reached: its flag is set, or a stage that leads to it on its own is reached and its `done when:` holds. The first stage is reached from the outset, which is what makes a quest readable before anything of it has happened, and is written here as no condition at all.
function reachedWhen(quest: Quest, at: number, held: Map<number, Condition | undefined>): Condition | undefined {
  if (at === 0) return undefined;
  if (held.has(at)) return held.get(at);
  held.set(at, names(flagOf(quest, quest.stages[at]!.name)));
  const stage = quest.stages[at]!;
  const byItself = quest.stages.flatMap((each, from) => {
    if (each.goto !== stage.name || each.doneWhen === undefined) return [];
    const before = reachedWhen(quest, from, held);
    return [all([...(before === undefined ? [] : [before]), each.doneWhen])!];
  });
  const answer = any([names(flagOf(quest, stage.name)), ...byItself]);
  held.set(at, answer);
  return answer;
}

// When a stage is the one the player is standing on: it has been reached, it is not done, and nothing further along has been reached either.
function whileOn(quest: Quest, at: number): Condition | undefined {
  const held = new Map<number, Condition | undefined>();
  const here = reachedWhen(quest, at, held);
  const stage = quest.stages[at]!;
  const past = quest.stages.slice(at + 1).flatMap((_, after) => {
    const reached = reachedWhen(quest, at + 1 + after, held);
    return reached === undefined ? [] : [not(reached)];
  });
  return all([...(here === undefined ? [] : [here]), ...(stage.doneWhen === undefined ? [] : [not(stage.doneWhen)]), ...past]);
}

// Where a quest stands, out of every stage it declares. Exactly one holds where the quest has begun and is not finished; the rule is the same one the lines are gated by, asked here rather than compiled into a dialogue.
export function stageNow(quest: Quest, holds: (asked: Condition) => boolean): QuestStage | undefined {
  return quest.stages.find((_, at) => {
    const when = whileOn(quest, at);
    return when === undefined || holds(when);
  });
}

// Every stage the quest has actually been through, in the order it declares them. A quest that branches has not been through the branch it did not take, so this asks each stage whether it was reached rather than counting up to the one standing.
export function stagesReached(quest: Quest, holds: (asked: Condition) => boolean): QuestStage[] {
  const held = new Map<number, Condition | undefined>();
  return quest.stages.filter((_, at) => {
    const when = reachedWhen(quest, at, held);
    return when === undefined || holds(when);
  });
}

// What there is left to do, out of every hint written where the game is standing: the last one whose condition holds, so a plain `hint:` is the default and each `hint when` under it is an exception to it. Asked the same way `stageNow` is asked, because it is the same question about a smaller thing.
export const hintNow = (hints: readonly QuestHint[], holds: (asked: Condition) => boolean): ActionResult | undefined =>
  hints.reduce<ActionResult | undefined>((held, hint) => (hint.when === undefined || holds(hint.when) ? hint.said : held), undefined);

// Whether anything about this quest has happened yet. A quest nobody has touched is not a journal entry; its first stage stands from the outset, so standing anywhere else is enough, and so is any stage having been reached outright — which is how a quest driven by nothing but its own `done when:` lines comes to be in the journal at all.
export const begun = (quest: Quest, at: QuestStage | undefined, set: (flag: string) => boolean): boolean => (at !== undefined && at !== quest.stages[0]) || quest.stages.some((stage) => set(flagOf(quest, stage.name)));

// A goto inside a quest names a stage, so the line that takes it sets that stage's flag. Nothing else in the language moves a quest along, and nothing else needs to.
const reaching = (quest: Quest, stage: string): ActionResult => ({ kind: 'set', variable: flagOf(quest, stage) });

// A line an entity is given here with no `when:` and no `ask:` of its own is what they say at this stage while none of their other lines here applies — the same rule a plain `hint:` follows against the `hint when` lines beside it. Written into the condition rather than settled when it is asked, so nothing downstream has to know a stage wrote two lines for one mouth.
const otherwise = (stage: QuestStage, speech: QuestSpeech): Condition[] =>
  speech.node.when !== undefined || speech.node.ask !== undefined
    ? []
    : stage.speech.filter((each) => each !== speech && each.owner === speech.owner && each.node.when !== undefined).map((each) => not(each.node.when!));

function saidAt(quest: Quest, at: number, speech: QuestSpeech, said: number, reached: Condition | undefined): Dialogue {
  const node = speech.node;
  const stage = quest.stages[at]!;
  const gone = (target: string | undefined): ActionResult[] => (target === undefined ? [] : [reaching(quest, target)]);
  // The first stage stands before anything has happened, so nothing has set its flag; speaking its lines is what starts the quest, and that is where the journal gets its first entry.
  const opening = at === 0 ? [{ kind: 'effect' as const, result: reaching(quest, stage.name) }] : [];
  return {
    // The place in the stage as well as who says it: one stage may give one entity more than one thing to say — a line for arriving and a line for coming back with the bread — and two dialogues under one id would be one dialogue.
    id: `${quest.id}.${stage.name}.${lastSegment(speech.owner)}.${said}`,
    owner: speech.owner,
    nodes: [
      {
        ...node,
        when: all([...(reached === undefined ? [] : [reached]), ...(node.when === undefined ? [] : [node.when]), ...otherwise(stage, speech)]),
        steps: [...opening, ...node.steps].map((step) =>
          step.kind === 'goto'
            ? { kind: 'effect' as const, result: reaching(quest, step.target) }
            : step.kind === 'menu'
              ? { ...step, choices: step.choices.map((choice) => ({ ...choice, goto: undefined, effects: [...choice.effects, ...gone(choice.goto)] })) }
              : step,
        ),
      },
    ],
  };
}

// Every dialogue a quest gives away. A stage's lines belong to the entity the stage names, so the entity says them without anything editing the entity or the dialogue it already had.
export const questDialogues = (quest: Quest): Dialogue[] => quest.stages.flatMap((stage, at) => stage.speech.map((speech, said) => saidAt(quest, at, speech, said, whileOn(quest, at))));

const stageProblem = (quest: Quest, stage: QuestStage): string | undefined => {
  const named = new Set(quest.stages.map((each) => each.name));
  const leaves = [stage.goto, ...stage.speech.flatMap((each) => each.node.steps.flatMap((step) => (step.kind === 'goto' ? [step.target] : step.kind === 'menu' ? step.choices.map((choice) => choice.goto) : [])))].filter(
    (each): each is string => each !== undefined,
  );
  for (const target of leaves) if (!named.has(target)) return `stage ${stage.name} goes to ${target}, which is no stage of this quest`;
  if (stage.doneWhen !== undefined && stage.goto === undefined) return `stage ${stage.name} says when it is done and not where that leaves the quest, so write a goto beside it`;
  if (stage.complete) return leaves.length === 0 ? undefined : `stage ${stage.name} completes the quest and also goes somewhere, and it cannot do both`;
  return leaves.length === 0 ? `nothing leaves stage ${stage.name}: give it a goto, a line that goes somewhere, or \`complete\`` : undefined;
};

// One line, said in both places a hint can be written, because it is the same rule in both.
const HINT_WHEN_NOTE = 'the last hint whose condition holds is the one shown, so a plain `hint:` written above is the default and each of these is an exception to it';

// The journal is the player's own notebook and is written in their voice, which is the whole of what tells a hint from a walkthrough. Said on both `hint:` lines, since that is the line an author reaches for a direction on.
const JOURNAL_VOICE = 'the player thinking, not the game instructing: what they are wondering or have not managed yet, in their own words. Never a route, a room or a step to take — working out what is next is the play, and a quest is allowed to be hard';

// A stage is a name the rest of the world can ask about, and the flag it mints is the one `flagOf` mints, written out of it rather than beside it.
const STAGE_NOTE = `naming a stage declares the flag \`${flagOf({ id: '<quest>' }, '<stage>')}\`, which anything anywhere may read as a condition; which stage a quest stands on is worked out from the world each time it is asked and never stored`;

// The same rule the hints follow, said where a stage writes more than one line for one mouth.
const SAYS_NOTE = `lines that entity speaks while the quest stands here, written as a dialogue node is; where a stage gives one entity more than one, the line with no \`when:\` of its own is what they say while none of the others applies`;

// A `done when:` is not a flag check with room for a comparison — it is the whole condition grammar, said out of that grammar's own forms so a form added to it is said here too.
const DONE_WHEN_NOTE = `the quest leaves this stage on its own once this holds, and it takes any condition, not only a flag: ${condition.forms.join(', ')}`;

function questProblem(quest: Quest): string | undefined {
  if (quest.stages.length === 0) return 'a quest is its stages, and this one has none';
  const seen = new Set<string>();
  for (const stage of quest.stages) {
    if (seen.has(stage.name)) return `stage ${stage.name} is written twice`;
    seen.add(stage.name);
  }
  return quest.stages.map((stage) => stageProblem(quest, stage)).find((problem) => problem !== undefined);
}

export const quest = section<Quest>()({
  kind: 'quest',
  ids: 'owned',
  text: ['title'],
  maps: {
    quests: (value) => [[value.id, value]],
    dialogues: (value) => questDialogues(value).map((each) => [each.id, each] as const),
  },
  says: (value) => [spokenHere(value), ...value.stages.map(spokenHere)],
  grammar: [
    { form: 'title: <text>', example: 'title: Finding Your Feet' },
    { form: 'log: <text>', example: 'log: They say a guide keeps this house, and takes newcomers in hand.', family: 'before it begins', note: 'what the journal reads before the quest has begun' },
    { form: 'hint: <text>', example: 'hint: I should find out who keeps this house.', family: 'before it begins', note: JOURNAL_VOICE },
    { form: 'hint when <condition>: <text>', example: 'hint when has core.lockpick: The front door is locked, and this thing opens locks.', family: 'before it begins', holds: () => ({ condition }), note: HINT_WHEN_NOTE },
    {
      form: 'stage <name>:',
      example: 'stage offered:',
      note: STAGE_NOTE,
      block: (): Written[] => [
        { form: 'log: <text>', example: 'log: A guide called Miki offered to show me the ropes.', family: 'what the journal says', note: "the player's own note of what happened while the quest stood here, kept to a line or two" },
        { form: 'hint: <text>', example: 'hint: I have not given him an answer.', family: 'what the journal says', note: JOURNAL_VOICE },
        { form: 'hint when <condition>: <text>', example: 'hint when has core.bread: The loaf came out warm. Miki said he would wait.', family: 'what the journal says', holds: () => ({ condition }), note: HINT_WHEN_NOTE },
        { form: 'done when: <condition>', example: 'done when: rats-killed >= 3', family: 'where it goes', holds: () => ({ condition }), note: DONE_WHEN_NOTE },
        { form: 'goto <stage>', example: 'goto sendoff', family: 'where it goes' },
        { form: 'complete', example: 'complete', family: 'where it goes', note: 'the quest is done when it reaches here' },
        { form: '<entity> says:', example: 'miki says:', family: 'what is said here', names: { entity: 'entity' }, note: SAYS_NOTE, block: () => nodeGrammar({ hole: 'stage', like: 'sendoff' }) },
      ],
    },
  ],
  validate: questProblem,
  parse: (raw) => {
    if (!raw.id) throw new DslError('# quest requires an id', raw.span);
    const parsed: Quest = { id: raw.id, hints: [], stages: [], flags: [] };
    for (const line of raw.body) {
      if (takeHint(line, parsed.hints)) continue;
      if (takeLog(line, parsed)) continue;
      const title = TITLE.exec(line.text)?.groups;
      const stage = STAGE.exec(line.text)?.groups;
      if (title) parsed.title = parseWhole(text, title.said!, line.span.start, 'a quest title');
      else if (stage) parsed.stages.push(parseStage(stage.name!, line));
      else throw new DslError(`unexpected line in # quest: ${JSON.stringify(line.text)}`, line.span);
    }
    parsed.flags = parsed.stages.map((each) => each.name);
    return parsed;
  },
  print: (value, { moduleId }) => [
    `# quest ${moduleLocalId(moduleId, value.id)}`,
    ...(value.title === undefined ? [] : [`title: ${value.title}`]),
    ...(value.log === undefined ? [] : [`log: ${value.log.kind === 'say' ? value.log.text : ''}`]),
    ...hintLines(value.hints),
    ...value.stages.flatMap((stage) => ['', ...stageLines(stage)]),
  ],
  visit: (value, where, visit: Visit) => {
    for (const hint of value.hints) visitCondition(hint.when, `${where} hint when`, visit);
    results(spokenHere(value), where, visit);
    for (const stage of value.stages) {
      const at = `${where} stage ${stage.name}`;
      visitCondition(stage.doneWhen, `${at} done when:`, visit);
      for (const hint of stage.hints) visitCondition(hint.when, `${at} hint when`, visit);
      results(spokenHere(stage), at, visit);
      for (const speech of stage.speech) {
        put(speech as unknown as Record<string, unknown>, 'owner', 'entity', `${at} says`, visit);
        visitDialogue({ id: value.id, nodes: [speech.node] }, at, visit);
      }
    }
  },
});
