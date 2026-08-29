import { ActionResult } from '../../grammar/actionResult';
import { Condition, condition } from '../../grammar/condition';
import { DslError, parseWhole, Written } from '../../grammar/parser';
import { moduleLocalId } from '../../grammar/section';
import { indentLines, RawLine, requireNoBlock, takeBlock } from '../../grammar/structure';
import { lastSegment, text } from '../../grammar/values';
import { overlay } from '../merge';
import { condition as visitCondition, put, results, type Visit } from '../refs';
import { Dialogue, DialogueNode, nodeBody, nodeGrammar, parseNode, visitDialogue } from './dialogue';
import { section } from './define';

// What one NPC is given to say while a stage is the one the player is on.
export interface QuestSpeech {
  owner: string;
  node: DialogueNode;
}

export interface QuestStage {
  name: string;
  // A stage a later body takes back out, which is spent at merge and is never one of the stages a quest has.
  removed?: true;
  // Held as spoken lines rather than as plain strings: a journal entry is said to a player, so it is addressed and translated like every other line the game says.
  log?: ActionResult;
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
  stages: QuestStage[];
  // A flag per stage, which is how the rest of the world names where a quest has got to. Derived from the stages, so nothing declares it twice.
  flags: string[];
}

const TITLE = /^title:[ \t]?(?<said>.*)$/;
const STAGE = /^stage[ \t]+(?<name>[a-z][a-z0-9-]*):$/;
const UNSTAGE = /^-[ \t]*stage[ \t]+(?<name>[a-z][a-z0-9-]*)$/;
const LOG = /^log:[ \t]?(?<said>.*)$/;
const DONE = /^done when:[ \t]*(?<cond>.+)$/;
const GOTO = /^goto[ \t]+(?<name>[a-z][a-z0-9-]*)$/;
const SAYS = /^(?<owner>[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*)[ \t]+says:$/;

const spoken = (said: string): ActionResult => ({ kind: 'say', text: said });

// Every line the journal can read off a quest or off one of its stages, in the order it is written, which is the order they are keyed and reviewed in.
const spokenHere = (held: { log?: ActionResult }): ActionResult[] => (held.log === undefined ? [] : [held.log]);

// `log:` is one line, wherever it is written; a second would only ever silently replace the first, so it is refused rather than letting an author lose one without being told.
function takeLog(line: RawLine, held: { log?: ActionResult }): boolean {
  const log = LOG.exec(line.text)?.groups;
  if (!log) return false;
  if (held.log !== undefined) throw new DslError('log: is defined more than once', line.span);
  held.log = spoken(log.said!);
  return true;
}

function parseStage(name: string, source: RawLine): QuestStage {
  const stage: QuestStage = { name, speech: [] };
  for (const line of takeBlock(source)) {
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

const stageLines = (stage: QuestStage): string[] => [
  `stage ${stage.name}:`,
  ...(stage.log === undefined ? [] : [`  log: ${said(stage.log)}`]),
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

// Whether anything about this quest has happened yet. A quest nobody has touched is not a journal entry; its first stage stands from the outset, so standing anywhere else is enough, and so is any stage having been reached outright — which is how a quest driven by nothing but its own `done when:` lines comes to be in the journal at all.
export const begun = (quest: Quest, at: QuestStage | undefined, set: (flag: string) => boolean): boolean => (at !== undefined && at !== quest.stages[0]) || quest.stages.some((stage) => set(flagOf(quest, stage.name)));

// A goto inside a quest names a stage, so the line that takes it sets that stage's flag. Nothing else in the language moves a quest along, and nothing else needs to.
const reaching = (quest: Quest, stage: string): ActionResult => ({ kind: 'set', variable: flagOf(quest, stage) });

// A line an entity is given here with no `when:` of its own is what they say at this stage while none of their other lines here applies. Written into the condition rather than settled when it is asked, so nothing downstream has to know a stage wrote two lines for one mouth. `ask:` does not exempt a line from it: naming a line says what to call it in the list, not which moment is its turn.
const otherwise = (stage: QuestStage, speech: QuestSpeech): Condition[] =>
  speech.node.when !== undefined
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
    fromQuest: quest.id,
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

// The journal is the player's own notebook and is written in their voice, which is the whole of what tells it from a walkthrough. Said on both `log:` lines, since that is the line an author reaches for a direction on.
const JOURNAL_VOICE = 'the player writing, not the game instructing: what happened and what they made of it, in their own words. Never a route, a room or a step to take — working out what is next is the play, and a quest is allowed to be hard';

// A stage is a name the rest of the world can ask about, and the flag it mints is the one `flagOf` mints, written out of it rather than beside it.
const STAGE_NOTE = `naming a stage declares the flag \`${flagOf({ id: '<quest>' }, '<stage>')}\`, which anything anywhere may read as a condition; which stage a quest stands on is worked out from the world each time it is asked and never stored. Writing a stage the quest already has lays these lines over that one and leaves every line it says nothing about standing; a stage it has not is added after the stages it has, so the order they run in never shifts under a later body`;

// Said where a stage writes more than one line for one mouth.
const SAYS_NOTE = `lines that entity speaks while the quest stands here, written as a dialogue node is; where a stage gives one entity more than one, the line with no \`when:\` of its own is what they say while none of the others applies. Writing one of these over a stage that already speaks writes all of that stage's lines, so a body giving a stage a word gives it every word it has there`;

// A `done when:` is not a flag check with room for a comparison — it is the whole condition grammar, which the page writes out once under its own name rather than here.
const DONE_WHEN_NOTE = 'the quest leaves this stage on its own once this holds, and it takes any condition, not only a flag';

function questProblem(quest: Quest): string | undefined {
  if (quest.stages.length === 0) return 'a quest is its stages, and this one has none';
  return quest.stages.map((stage) => stageProblem(quest, stage)).find((problem) => problem !== undefined);
}

// A quest's stages are the names the rest of the world reads it by, so they are read off the stages a quest has rather than written down beside them.
const withFlags = (quest: Quest): Quest => ({ ...quest, flags: quest.stages.filter((stage) => stage.removed === undefined).map((stage) => stage.name) });

// A second body at a quest's id is laid over the one already there stage by stage, in the order it writes them: a stage nothing has written yet is added after the stages there, a stage already written keeps every line the second body is silent about, and a `-stage` takes one out. So the stages a quest already had never change order, and a title or a log written alone leaves every stage standing.
function merged(into: Quest | undefined, from: Quest): Quest {
  const held = into ?? { id: from.id, stages: [], flags: [] };
  let stages = [...held.stages];
  for (const stage of from.stages) {
    if (stage.removed) {
      stages = stages.filter((each) => each.name !== stage.name);
      continue;
    }
    const at = stages.findIndex((each) => each.name === stage.name);
    if (at === -1) stages.push(stage);
    else stages[at] = overlay(stages[at] as unknown as Record<string, unknown>, stage as unknown as Record<string, unknown>) as unknown as QuestStage;
  }
  return withFlags({ ...held, ...(from.title === undefined ? {} : { title: from.title }), ...(from.log === undefined ? {} : { log: from.log }), stages });
}

export const quest = section<Quest>()({
  kind: 'quest',
  ids: 'owned',
  vocabulary: 'declared',
  text: ['title'],
  maps: {
    quests: (value) => [[value.id, value]],
    dialogues: (value) => questDialogues(value).map((each) => [each.id, each] as const),
  },
  says: (value) => [spokenHere(value), ...value.stages.map(spokenHere)],
  grammar: [
    { form: 'title: <text>', example: 'title: Finding Your Feet' },
    { form: '-stage <name>', example: '-stage snubbed', note: 'takes a stage out of a quest already written, and is spent where it is read rather than becoming a stage of anything: a name no stage of the quest answers to takes nothing out' },
    { form: 'log: <text>', example: 'log: They say a guide keeps this house, and takes newcomers in hand.', family: 'before it begins', note: `what the journal reads before the quest has begun — ${JOURNAL_VOICE}` },
    {
      form: 'stage <name>:',
      example: 'stage offered:',
      note: STAGE_NOTE,
      block: (): Written[] => [
        { form: 'log: <text>', example: 'log: A guide called Miki offered to show me the ropes.', family: 'what the journal says', note: `the player's own note of what happened while the quest stood here, kept to a line or two — ${JOURNAL_VOICE}` },
        { form: 'done when: <condition>', example: 'done when: rats-killed >= 3', family: 'where it goes', holds: () => ({ condition }), note: DONE_WHEN_NOTE },
        { form: 'goto <stage>', example: 'goto sendoff', family: 'where it goes' },
        { form: 'complete', example: 'complete', family: 'where it goes', note: 'the quest is done when it reaches here' },
        { form: '<entity> says:', example: 'miki says:', family: 'what is said here', names: { entity: 'entity' }, note: SAYS_NOTE, block: () => nodeGrammar({ hole: 'stage', like: 'sendoff' }) },
      ],
    },
  ],
  validate: questProblem,
  merge: (into, from) => merged(into as Quest | undefined, from as Quest),
  parse: (raw) => {
    if (!raw.id) throw new DslError('# quest requires an id', raw.span);
    const parsed: Quest = { id: raw.id, stages: [], flags: [] };
    for (const line of raw.body) {
      if (takeLog(line, parsed)) continue;
      const title = TITLE.exec(line.text)?.groups;
      const stage = STAGE.exec(line.text)?.groups;
      const unstage = UNSTAGE.exec(line.text)?.groups;
      if (title) parsed.title = parseWhole(text, title.said!, line.span.start, 'a quest title');
      else if (stage) {
        // Across bodies a stage written again is laid over the one already there. Written twice in one body it would only overlay itself, silently, so the second is refused where it stands.
        if (parsed.stages.some((each) => each.removed === undefined && each.name === stage.name)) throw new DslError(`stage ${stage.name} is written twice`, line.span);
        parsed.stages.push(parseStage(stage.name!, line));
      }
      else if (unstage) {
        requireNoBlock(line);
        parsed.stages.push({ name: unstage.name!, removed: true, speech: [] });
      }
      else throw new DslError(`unexpected line in # quest: ${JSON.stringify(line.text)}`, line.span);
    }
    return withFlags(parsed);
  },
  print: (value, { moduleId }) => [
    `# quest ${moduleLocalId(moduleId, value.id)}`,
    ...(value.title === undefined ? [] : [`title: ${value.title}`]),
    ...(value.log === undefined ? [] : [`log: ${said(value.log)}`]),
    ...value.stages.flatMap((stage) => ['', ...stageLines(stage)]),
  ],
  visit: (value, where, visit: Visit) => {
    results(spokenHere(value), where, visit);
    for (const stage of value.stages) {
      const at = `${where} stage ${stage.name}`;
      visitCondition(stage.doneWhen, `${at} done when:`, visit);
      results(spokenHere(stage), at, visit);
      for (const speech of stage.speech) {
        put(speech as unknown as Record<string, unknown>, 'owner', 'entity', `${at} says`, visit);
        visitDialogue({ id: value.id, nodes: [speech.node] }, at, visit);
      }
    }
  },
});
