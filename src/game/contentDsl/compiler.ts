// Lowers a parsed DslModule (parser.ts) into the existing ContentModule JSON
// shape (src/game/types.ts) — the DSL is a front-end only, the compile target
// and everything downstream (loader, validators, engine) is unchanged.
import { toKebabCase } from '../contentIds';
import type {
  ActionResult,
  Condition,
  ContentModule,
  DialogueDefinition,
  DialogueNode,
  DialogueOption,
  EnemyStatKey,
  EntityActionDefinition,
  EntityDefinition,
  GameAction,
  LocationNode,
  ModuleDataSectionObject,
  Reward,
} from '../types';
import { parseDsl } from './parser';
import { collectTextFlags, renderTextForAssignment } from './shared';
import type { DslActionDecl, DslCondition, DslDialogueSection, DslEntityDecl, DslLocationSection, DslTag, DslText } from './types';

class LocaleBuilder {
  entries: Record<string, string> = {};
  set(key: string, value: string): void {
    this.entries[key] = value;
  }
}

const kebab = (text: string): string => toKebabCase(text);
const titleCase = (text: string): string => (text.length === 0 ? text : text[0].toUpperCase() + text.slice(1));
const humanize = (id: string): string => titleCase(id.replace(/-/g, ' '));

const toCondition = (cond: DslCondition): Condition => {
  switch (cond.kind) {
    case 'flag':
      return { kind: 'state-variable', variable: `flag:${cond.flagId}`, comparison: 'equal', value: true };
    case 'item':
      return { kind: 'state-variable', variable: `item:${cond.itemId}`, comparison: 'greater-than', value: 0 };
    case 'not':
      return { kind: 'not', condition: toCondition(cond.cond) };
    case 'all':
      return { kind: 'all', conditions: cond.conds.map(toCondition) };
    case 'any':
      return { kind: 'any', conditions: cond.conds.map(toCondition) };
    default:
      throw new Error(`Unhandled condition kind: ${(cond as DslCondition).kind}`);
  }
};

const flagCondition = (flagId: string, truthy: boolean): Condition => {
  const base: Condition = { kind: 'state-variable', variable: `flag:${flagId}`, comparison: 'equal', value: true };
  return truthy ? base : { kind: 'not', condition: base };
};

// ---------------------------------------------------------------------------
// Tag -> Reward / ActionResult
// ---------------------------------------------------------------------------
const tagToReward = (tag: DslTag): Reward | null => {
  if (tag.keyword === 'give') return { kind: 'item', itemId: tag.itemId, amount: tag.amount };
  if (tag.keyword === 'take') return { kind: 'item', itemId: tag.itemId, amount: -tag.amount };
  if (tag.keyword === 'xp') return { kind: 'skillXp', skillId: tag.skillId, amount: tag.amount };
  return null;
};

const tagToActionResult = (tag: DslTag, locale: LocaleBuilder, chatKeyBase: string, chatCounter: { n: number }): ActionResult | null => {
  if (tag.keyword === 'give') return { kind: 'item', itemId: tag.itemId, amount: tag.amount };
  if (tag.keyword === 'take') return { kind: 'item', itemId: tag.itemId, amount: -tag.amount };
  if (tag.keyword === 'xp') return { kind: 'skill-xp', skillId: tag.skillId, amount: tag.amount };
  if (tag.keyword === 'set') return { kind: 'flag', flagId: tag.flagId, value: true };
  if (tag.keyword === 'unset') return { kind: 'flag', flagId: tag.flagId, value: false };
  if (tag.keyword === 'gotoDialogue') return { kind: 'dialogue', dialogueId: tag.dialogueId };
  if (tag.keyword === 'openModal') return { kind: 'open-modal', modalId: tag.modalId };
  if (tag.keyword === 'say') {
    if (tag.text.some((fragment) => fragment.kind !== 'literal')) {
      throw new Error('Inline conditional text is not supported in `say` yet — use an entity `examine:` line instead.');
    }
    chatCounter.n += 1;
    const key = chatCounter.n === 1 ? chatKeyBase : `${chatKeyBase}-${chatCounter.n}`;
    locale.set(key, tag.text.map((fragment) => fragment.text).join('').trim());
    return { kind: 'chat', messageKey: key };
  }
  return null;
};

// `once` desugars to maxCompletions:1 plus an auto-visibility guard: if the
// action `set`s a flag, guard on that flag (also lets other content — like
// an entity's `examine:` inline conditionals — read the same state); if it
// sets no flag, guard on the action's own completion count instead.
const deriveVisibleWhen = (tags: DslTag[], onSuccessTags: DslTag[], actionId: string): Condition | undefined => {
  const parts: Condition[] = [];
  const hiddenIf = tags.find((tag) => tag.keyword === 'hiddenIf');
  const visibleIf = tags.find((tag) => tag.keyword === 'visibleIf');
  if (hiddenIf && hiddenIf.keyword === 'hiddenIf') parts.push({ kind: 'not', condition: toCondition(hiddenIf.cond) });
  if (visibleIf && visibleIf.keyword === 'visibleIf') parts.push(toCondition(visibleIf.cond));

  const once = tags.some((tag) => tag.keyword === 'once');
  if (once) {
    const setFlags = [...tags, ...onSuccessTags]
      .filter((tag) => tag.keyword === 'set')
      .map((tag) => (tag as Extract<DslTag, { keyword: 'set' }>).flagId);
    if (setFlags.length > 0) {
      const flagCond: Condition = setFlags.length === 1
        ? flagCondition(setFlags[0], true)
        : { kind: 'any', conditions: setFlags.map((flagId) => flagCondition(flagId, true)) };
      parts.push({ kind: 'not', condition: flagCond });
    } else {
      parts.push({
        kind: 'not',
        condition: { kind: 'state-variable', variable: `action-completions:${actionId}`, comparison: 'greater-than', value: 0 },
      });
    }
  }

  if (parts.length === 0) return undefined;
  if (parts.length === 1) return parts[0];
  return { kind: 'all', conditions: parts };
};

// ---------------------------------------------------------------------------
// Entity actions
// ---------------------------------------------------------------------------
const compileEntityAction = (entityId: string, decl: DslActionDecl, locale: LocaleBuilder): EntityActionDefinition => {
  const actionId = kebab(decl.title);
  locale.set(`action.entity.${entityId}.${actionId}.title`, titleCase(decl.title));
  locale.set(`action.entity.${entityId}.${actionId}.description`, `${titleCase(decl.title)}.`);

  const enemyTag = decl.tags.find((tag): tag is Extract<DslTag, { keyword: 'enemy' }> => tag.keyword === 'enemy');
  const requiresTag = decl.tags.find((tag): tag is Extract<DslTag, { keyword: 'requires' }> => tag.keyword === 'requires');
  const requirements = requiresTag ? toCondition(requiresTag.cond) : undefined;
  const visibleWhen = deriveVisibleWhen(decl.tags, decl.onSuccessTags, actionId);
  const maxCompletions = decl.tags.some((tag) => tag.keyword === 'once') ? 1 : undefined;
  const chatCounter = { n: 0 };
  const chatKeyBase = `chat.entity.${entityId}.${actionId}`;

  if (enemyTag) {
    const rewards = decl.tags
      .filter((tag) => tag.keyword === 'give' || tag.keyword === 'xp' || tag.keyword === 'take')
      .map(tagToReward)
      .filter((reward): reward is Reward => reward !== null);
    const results = decl.onSuccessTags
      .map((tag) => tagToActionResult(tag, locale, chatKeyBase, chatCounter))
      .filter((result): result is ActionResult => result !== null);
    return {
      id: actionId,
      durationSeconds: 2,
      interactionTypeId: enemyTag.interactionTypeId,
      enemy: {
        interactionTypeId: enemyTag.interactionTypeId,
        stats: enemyTag.stats as Partial<Record<EnemyStatKey, number>>,
        showHealthBar: true,
        rewards: [],
      },
      rewards,
      results,
      ...(requirements ? { requirements } : {}),
      ...(visibleWhen ? { visibleWhen } : {}),
      ...(maxCompletions ? { maxCompletions } : {}),
    };
  }

  const results = [...decl.tags, ...decl.onSuccessTags]
    .map((tag) => tagToActionResult(tag, locale, chatKeyBase, chatCounter))
    .filter((result): result is ActionResult => result !== null);

  return {
    id: actionId,
    instant: true,
    rewards: [],
    results,
    ...(requirements ? { requirements } : {}),
    ...(visibleWhen ? { visibleWhen } : {}),
    ...(maxCompletions ? { maxCompletions } : {}),
  };
};

// ---------------------------------------------------------------------------
// Inline-conditional `examine:` sugar -> visibleWhen-gated variants sharing
// one title (the pattern documented in CLAUDE.md's "Repeatable state-
// dependent flavor text" section, generated instead of hand-written).
// ---------------------------------------------------------------------------
const allAssignments = (flags: string[]): Record<string, boolean>[] => {
  const total = 2 ** flags.length;
  const assignments: Record<string, boolean>[] = [];
  for (let mask = 0; mask < total; mask++) {
    const assignment: Record<string, boolean> = {};
    flags.forEach((flag, index) => {
      assignment[flag] = Boolean(mask & (1 << index));
    });
    assignments.push(assignment);
  }
  return assignments;
};

const compileExamineVariants = (entityId: string, text: DslText, locale: LocaleBuilder): EntityActionDefinition[] => {
  const flags = collectTextFlags(text);
  const assignments = flags.length === 0 ? [{}] : allAssignments(flags);
  locale.set(`action.entity.${entityId}.examine.title`, 'Examine');
  locale.set(`action.entity.${entityId}.examine.description`, `Examine the ${entityId.replace(/-/g, ' ')}.`);

  return assignments.map((assignment, index) => {
    const actionId = index === 0 ? 'examine' : `examine-${index + 1}`;
    const chatKey = `chat.entity.${entityId}.examine.${index}`;
    locale.set(chatKey, renderTextForAssignment(text, assignment));
    const visibleWhen: Condition | undefined = flags.length === 0
      ? undefined
      : flags.length === 1
        ? flagCondition(flags[0], assignment[flags[0]])
        : { kind: 'all', conditions: flags.map((flag) => flagCondition(flag, assignment[flag])) };
    return {
      id: actionId,
      instant: true,
      rewards: [],
      results: [{ kind: 'chat', messageKey: chatKey }],
      ...(visibleWhen ? { visibleWhen } : {}),
    };
  });
};

// ---------------------------------------------------------------------------
// Location (+ nested entities, + walls)
// ---------------------------------------------------------------------------
const compileLocation = (
  section: DslLocationSection,
  locale: LocaleBuilder,
): { location: LocationNode; entities: EntityDefinition[]; actions: GameAction[] } => {
  locale.set(`location.${section.id}.title`, humanize(section.id));
  locale.set(`location.${section.id}.description`, `${humanize(section.id)}.`);

  const entities: EntityDefinition[] = [];
  const entityIds: string[] = [];
  for (const entityDecl of section.entities as DslEntityDecl[]) {
    entityIds.push(entityDecl.id);
    locale.set(`entity.${entityDecl.id}.title`, humanize(entityDecl.id));
    const actions: EntityActionDefinition[] = [];
    if (entityDecl.examine) actions.push(...compileExamineVariants(entityDecl.id, entityDecl.examine, locale));
    for (const actionDecl of entityDecl.actions) actions.push(compileEntityAction(entityDecl.id, actionDecl, locale));
    entities.push({ id: entityDecl.id, actions });
  }

  const actions: GameAction[] = [];
  const locationActionIds: string[] = [];
  for (const wall of section.walls) {
    const wallId = `wall-${section.id}-to-${wall.toLocationId}`;
    locale.set(`action.${wallId}.title`, 'Leave');
    locale.set(`action.${wallId}.description`, 'Leave.');
    actions.push({
      id: wallId,
      role: 'travel',
      rewards: [],
      results: [{ kind: 'relocate', locationId: wall.toLocationId }],
      visibleWhen: toCondition(wall.cond),
    });
    locationActionIds.push(wallId);
  }

  const location: LocationNode = {
    id: section.id,
    position: { x: section.x, y: section.y, ...(section.z !== undefined ? { z: section.z } : {}) },
    ...(section.starting ? { starting: true } : {}),
    tags: section.tags,
    entities: entityIds,
    actions: locationActionIds,
  };

  return { location, entities, actions };
};

// ---------------------------------------------------------------------------
// Dialogue
// ---------------------------------------------------------------------------
const compileDialogue = (section: DslDialogueSection, locale: LocaleBuilder): DialogueDefinition => {
  const nodes: DialogueNode[] = section.nodes.map((node) => {
    const textKey = `dialogue.${section.id}.${node.id}`;
    locale.set(textKey, node.text);

    const options: DialogueOption[] = node.options.map((option) => {
      const optionId = kebab(option.label);
      const labelKey = `dialogue.${section.id}.option.${optionId}`;
      locale.set(labelKey, option.label);
      const results = option.tags
        .map((tag) => tagToActionResult(tag, locale, `chat.dialogue.${section.id}.${node.id}.${optionId}`, { n: 0 }))
        .filter((result): result is ActionResult => result !== null);
      return {
        id: optionId,
        labelKey,
        gotoNodeId: option.targetNodeId,
        ...(results.length > 0 ? { results } : {}),
      };
    });

    const enterResults = node.enterTags
      .map((tag) => tagToActionResult(tag, locale, `chat.dialogue.${section.id}.${node.id}.enter`, { n: 0 }))
      .filter((result): result is ActionResult => result !== null);

    return {
      id: node.id,
      ...(node.speakerId ? { speakerId: node.speakerId, textKey } : { narratorKey: textKey }),
      ...(options.length > 0 ? { options } : {}),
      ...(node.gotoNodeId ? { gotoNodeId: node.gotoNodeId } : {}),
      ...(enterResults.length > 0 ? { results: enterResults } : {}),
    };
  });

  return { id: section.id, startNodeId: 'start', nodes };
};

// ---------------------------------------------------------------------------
// Top level
// ---------------------------------------------------------------------------
export const compileDsl = (source: string): { module: ContentModule; locale: Record<string, string> } => {
  const dsl = parseDsl(source);
  const locale = new LocaleBuilder();

  const locations: LocationNode[] = [];
  const entities: EntityDefinition[] = [];
  const actions: GameAction[] = [];
  const dialogues: DialogueDefinition[] = [];
  let advanced: Record<string, unknown> = {};

  for (const section of dsl.sections) {
    if (section.kind === 'location') {
      const compiled = compileLocation(section, locale);
      locations.push(compiled.location);
      entities.push(...compiled.entities);
      actions.push(...compiled.actions);
    } else if (section.kind === 'dialogue') {
      dialogues.push(compileDialogue(section, locale));
    } else if (section.kind === 'advanced') {
      advanced = { ...advanced, ...section.json };
    }
  }

  const data: ModuleDataSectionObject = {
    ...(locations.length > 0 ? { locations } : {}),
    ...(entities.length > 0 ? { entities } : {}),
    ...(actions.length > 0 ? { actions } : {}),
    ...(dialogues.length > 0 ? { dialogues } : {}),
    ...advanced,
  };

  const module: ContentModule = {
    id: dsl.info.id,
    version: dsl.info.version,
    universe: dsl.info.universe,
    author: dsl.info.author,
    game_version: dsl.info.gameVersion,
    ...(dsl.info.dependencies.length > 0 ? { dependencies: dsl.info.dependencies } : {}),
    data,
    locale: { en: locale.entries },
  };

  return { module, locale: locale.entries };
};
