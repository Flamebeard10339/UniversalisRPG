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

// A bare (undotted) flag id auto-namespaces to the module's pack, so sibling
// modules declaring the same `pack:` share short flag names for free; a
// dotted id is already fully qualified (a deliberate cross-pack reference)
// and is used exactly as written.
const resolveFlagId = (rawFlagId: string, pack: string): string => (rawFlagId.includes('.') ? rawFlagId : `${pack}.${rawFlagId}`);

const flagCondition = (resolvedFlagId: string, truthy: boolean): Condition => {
  const base: Condition = { kind: 'state-variable', variable: `flag:${resolvedFlagId}`, comparison: 'equal', value: true };
  return truthy ? base : { kind: 'not', condition: base };
};

const toCondition = (cond: DslCondition, pack: string): Condition => {
  switch (cond.kind) {
    case 'flag':
      return flagCondition(resolveFlagId(cond.flagId, pack), true);
    case 'item':
      return { kind: 'state-variable', variable: `item:${cond.itemId}`, comparison: 'greater-than', value: 0 };
    case 'not':
      return { kind: 'not', condition: toCondition(cond.cond, pack) };
    case 'all':
      return { kind: 'all', conditions: cond.conds.map((c) => toCondition(c, pack)) };
    case 'any':
      return { kind: 'any', conditions: cond.conds.map((c) => toCondition(c, pack)) };
    default:
      throw new Error(`Unhandled condition kind: ${(cond as DslCondition).kind}`);
  }
};

const combineConditions = (a: Condition | undefined, b: Condition | undefined): Condition | undefined => {
  if (!a) return b;
  if (!b) return a;
  return { kind: 'all', conditions: [a, b] };
};

// ---------------------------------------------------------------------------
// Tag -> Reward / ActionResult. `assignment` is the flag-truth-assignment a
// `say` tag's conditional text is being rendered under for this variant (see
// "inline-conditional variant expansion" below) — irrelevant for every other
// tag kind, and irrelevant for a `say` whose text has no conditionals.
// ---------------------------------------------------------------------------
const tagToReward = (tag: DslTag): Reward | null => {
  if (tag.keyword === 'give') return { kind: 'item', itemId: tag.itemId, amount: tag.amount };
  if (tag.keyword === 'take') return { kind: 'item', itemId: tag.itemId, amount: -tag.amount };
  if (tag.keyword === 'xp') return { kind: 'skillXp', skillId: tag.skillId, amount: tag.amount };
  return null;
};

const tagToActionResult = (
  tag: DslTag,
  locale: LocaleBuilder,
  chatKeyBase: string,
  chatCounter: { n: number },
  pack: string,
  assignment: Record<string, boolean>,
): ActionResult | null => {
  if (tag.keyword === 'give') return { kind: 'item', itemId: tag.itemId, amount: tag.amount };
  if (tag.keyword === 'take') return { kind: 'item', itemId: tag.itemId, amount: -tag.amount };
  if (tag.keyword === 'xp') return { kind: 'skill-xp', skillId: tag.skillId, amount: tag.amount };
  if (tag.keyword === 'set') return { kind: 'flag', flagId: resolveFlagId(tag.flagId, pack), value: true };
  if (tag.keyword === 'unset') return { kind: 'flag', flagId: resolveFlagId(tag.flagId, pack), value: false };
  if (tag.keyword === 'gotoDialogue') return { kind: 'dialogue', dialogueId: tag.dialogueId };
  if (tag.keyword === 'openModal') return { kind: 'open-modal', modalId: tag.modalId };
  if (tag.keyword === 'say') {
    chatCounter.n += 1;
    const key = chatCounter.n === 1 ? chatKeyBase : `${chatKeyBase}-${chatCounter.n}`;
    locale.set(key, renderTextForAssignment(tag.text, assignment));
    return { kind: 'chat', messageKey: key };
  }
  return null;
};

// `once` desugars to maxCompletions:1 plus an auto-visibility guard: if the
// action `set`s a flag, guard on that flag (also lets other content — like
// another action's `say:` inline conditionals — read the same state); if it
// sets no flag, guard on the action's own completion count instead.
const deriveVisibleWhen = (tags: DslTag[], onSuccessTags: DslTag[], actionId: string, pack: string): Condition | undefined => {
  const parts: Condition[] = [];
  const hiddenIf = tags.find((tag) => tag.keyword === 'hiddenIf');
  const visibleIf = tags.find((tag) => tag.keyword === 'visibleIf');
  if (hiddenIf && hiddenIf.keyword === 'hiddenIf') parts.push({ kind: 'not', condition: toCondition(hiddenIf.cond, pack) });
  if (visibleIf && visibleIf.keyword === 'visibleIf') parts.push(toCondition(visibleIf.cond, pack));

  const once = tags.some((tag) => tag.keyword === 'once');
  if (once) {
    const setFlags = [...tags, ...onSuccessTags]
      .filter((tag) => tag.keyword === 'set')
      .map((tag) => resolveFlagId((tag as Extract<DslTag, { keyword: 'set' }>).flagId, pack));
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
// Entity actions, with inline-conditional-text variant expansion.
//
// `examine: text` is pure sugar for an action whose only tag is `say: text`
// (see parser.ts) — so a `say` tag's inline conditionals are handled once,
// generically, for *any* action, not as an examine-specific special case.
// If none of an action's `say` tags reference conditional text, it compiles
// to exactly one EntityActionDefinition, same as before v0.1's examine sugar
// existed. If they do, it expands into 2^n variants (n = distinct flags
// referenced across all its `say` tags) sharing one title key — the
// visibleWhen-gated-variants pattern CLAUDE.md documents for state-dependent
// flavor text, generated instead of hand-written.
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

const compileEntityAction = (entityId: string, decl: DslActionDecl, locale: LocaleBuilder, pack: string): EntityActionDefinition[] => {
  const baseActionId = kebab(decl.title);
  locale.set(`action.entity.${entityId}.${baseActionId}.title`, titleCase(decl.title));
  locale.set(`action.entity.${entityId}.${baseActionId}.description`, `${titleCase(decl.title)}.`);

  const enemyTag = decl.tags.find((tag): tag is Extract<DslTag, { keyword: 'enemy' }> => tag.keyword === 'enemy');
  const requiresTag = decl.tags.find((tag): tag is Extract<DslTag, { keyword: 'requires' }> => tag.keyword === 'requires');
  const requirements = requiresTag ? toCondition(requiresTag.cond, pack) : undefined;
  const baseVisibleWhen = deriveVisibleWhen(decl.tags, decl.onSuccessTags, baseActionId, pack);
  const maxCompletions = decl.tags.some((tag) => tag.keyword === 'once') ? 1 : undefined;

  const sayTags = [...decl.tags, ...decl.onSuccessTags].filter((tag): tag is Extract<DslTag, { keyword: 'say' }> => tag.keyword === 'say');
  const flags = Array.from(new Set(sayTags.flatMap((tag) => collectTextFlags(tag.text))));
  const assignments = flags.length === 0 ? [{}] : allAssignments(flags);

  return assignments.map((assignment, index) => {
    const actionId = flags.length === 0 ? baseActionId : index === 0 ? baseActionId : `${baseActionId}-${index + 1}`;
    const chatKeyBase = flags.length === 0
      ? `chat.entity.${entityId}.${baseActionId}`
      : `chat.entity.${entityId}.${baseActionId}.${index}`;
    const chatCounter = { n: 0 };
    const variantCondition = flags.length === 0
      ? undefined
      : flags.length === 1
        ? flagCondition(resolveFlagId(flags[0], pack), assignment[flags[0]])
        : { kind: 'all', conditions: flags.map((flag) => flagCondition(resolveFlagId(flag, pack), assignment[flag])) } as Condition;
    const visibleWhen = combineConditions(baseVisibleWhen, variantCondition);

    if (enemyTag) {
      const rewards = decl.tags
        .filter((tag) => tag.keyword === 'give' || tag.keyword === 'xp' || tag.keyword === 'take')
        .map(tagToReward)
        .filter((reward): reward is Reward => reward !== null);
      const results = decl.onSuccessTags
        .map((tag) => tagToActionResult(tag, locale, chatKeyBase, chatCounter, pack, assignment))
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
      .map((tag) => tagToActionResult(tag, locale, chatKeyBase, chatCounter, pack, assignment))
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
  });
};

// ---------------------------------------------------------------------------
// Location (+ nested entities, + walls)
// ---------------------------------------------------------------------------
const compileLocation = (
  section: DslLocationSection,
  locale: LocaleBuilder,
  pack: string,
): { location: LocationNode; entities: EntityDefinition[]; actions: GameAction[] } => {
  locale.set(`location.${section.id}.title`, humanize(section.id));
  locale.set(`location.${section.id}.description`, `${humanize(section.id)}.`);

  const entities: EntityDefinition[] = [];
  const entityIds: string[] = [];
  for (const entityDecl of section.entities as DslEntityDecl[]) {
    entityIds.push(entityDecl.id);
    locale.set(`entity.${entityDecl.id}.title`, humanize(entityDecl.id));
    const actions: EntityActionDefinition[] = entityDecl.actions.flatMap((actionDecl) => compileEntityAction(entityDecl.id, actionDecl, locale, pack));
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
      visibleWhen: toCondition(wall.cond, pack),
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
const compileDialogue = (section: DslDialogueSection, locale: LocaleBuilder, pack: string): DialogueDefinition => {
  const emptyAssignment: Record<string, boolean> = {};
  const nodes: DialogueNode[] = section.nodes.map((node) => {
    const textKey = `dialogue.${section.id}.${node.id}`;
    locale.set(textKey, node.text);

    const options: DialogueOption[] = node.options.map((option) => {
      const optionId = kebab(option.label);
      const labelKey = `dialogue.${section.id}.option.${optionId}`;
      locale.set(labelKey, option.label);
      const results = option.tags
        .map((tag) => tagToActionResult(tag, locale, `chat.dialogue.${section.id}.${node.id}.${optionId}`, { n: 0 }, pack, emptyAssignment))
        .filter((result): result is ActionResult => result !== null);
      return {
        id: optionId,
        labelKey,
        gotoNodeId: option.targetNodeId,
        ...(results.length > 0 ? { results } : {}),
      };
    });

    const enterResults = node.enterTags
      .map((tag) => tagToActionResult(tag, locale, `chat.dialogue.${section.id}.${node.id}.enter`, { n: 0 }, pack, emptyAssignment))
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
  const pack = dsl.info.pack ?? dsl.info.id;
  const locale = new LocaleBuilder();

  const locations: LocationNode[] = [];
  const entities: EntityDefinition[] = [];
  const actions: GameAction[] = [];
  const dialogues: DialogueDefinition[] = [];
  let advanced: Record<string, unknown> = {};

  for (const section of dsl.sections) {
    if (section.kind === 'location') {
      const compiled = compileLocation(section, locale, pack);
      locations.push(compiled.location);
      entities.push(...compiled.entities);
      actions.push(...compiled.actions);
    } else if (section.kind === 'dialogue') {
      dialogues.push(compileDialogue(section, locale, pack));
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
