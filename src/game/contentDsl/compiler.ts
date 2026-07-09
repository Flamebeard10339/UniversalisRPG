// Lowers a parsed DslModule (parser.ts) into the existing ContentModule JSON
// shape (src/game/types.ts) — the DSL is a front-end only, the compile target
// and everything downstream (loader, validators, engine) is unchanged.
import {
  interactionEntityHitKey,
  interactionEntityKillKey,
  interactionEntityMissKey,
  interactionPlayerHitKey,
  interactionPlayerKillKey,
  interactionPlayerMissKey,
  interactionTitleKey,
  locationExamineKey,
  skillExamineKey,
  skillTitleKey,
  statExamineKey,
  statTitleKey,
  toKebabCase,
} from '../contentIds';
import type {
  ActionResult,
  Condition,
  ConditionalText,
  ConditionalTextFragment,
  ContentModule,
  DialogueDefinition,
  DialogueNode,
  DialogueOption,
  DropTableDefinition,
  DropTableEntry,
  EnemyStatKey,
  EntityActionDefinition,
  EntityDefinition,
  GameAction,
  InteractionTypeDefinition,
  ItemActionDefinition,
  ItemDefinition,
  LocationNode,
  ModuleDataSectionObject,
  QuestDefinition,
  QuestStage,
  RecipeDefinition,
  Reward,
  SkillDefinition,
  StatDefinition,
  StateFlagDefinition,
} from '../types';
import { parseDsl } from './parser';
import { collectTextFlags, renderTextForAssignment } from './shared';
import type {
  DslActionDecl,
  DslCondition,
  DslDialogueSection,
  DslDropEntry,
  DslDropTableSection,
  DslEntityDecl,
  DslFlagsSection,
  DslInteractionSection,
  DslItemSection,
  DslLocationSection,
  DslQuestSection,
  DslRecipeSection,
  DslSkillSection,
  DslStatSection,
  DslTag,
  DslText,
} from './types';

class LocaleBuilder {
  entries: Record<string, string> = {};
  set(key: string, value: string): void {
    this.entries[key] = value;
  }
}

const kebab = (text: string): string => toKebabCase(text);
const titleCase = (text: string): string => (text.length === 0 ? text : text[0].toUpperCase() + text.slice(1));
const humanize = (id: string): string => titleCase(id.replace(/-/g, ' '));

// Every action requires locale entries for its outcome keys (validators.ts's
// collectLocalizationKeys checks all of `.title`/`.description`/`.success`/
// `.failure`, plus `.kill` for adversarial ones — unconditionally, for every
// action). The DSL grammar has no authoring surface for these yet (there's
// no `success:`/`failure:` tag), so leaving them unset would either nag the
// author with a validation warning for every single action, or — worse —
// silently fall back to displaying the raw locale key to the player. A
// generic default satisfies the validator and is a strict improvement over
// that raw-key fallback; an author who cares about specific text still gets
// there via `on success: say: ...` / `chance:` + `on fail: say: ...`
// (already-first-class DSL tags), which produce their own separate chat
// messages independent of this generic one.
const setDefaultOutcomeLocale = (
  locale: LocaleBuilder,
  actionKeyBase: string,
  outcomes: { success: string; failure: string; kill?: string },
): void => {
  locale.set(`${actionKeyBase}.success`, outcomes.success);
  locale.set(`${actionKeyBase}.failure`, outcomes.failure);
  if (outcomes.kill !== undefined) locale.set(`${actionKeyBase}.kill`, outcomes.kill);
};

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
    case 'item-tag':
      return { kind: 'item-tag', tag: cond.tag };
    case 'equipped-item-tag':
      return { kind: 'equipped-item-tag', tag: cond.tag };
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

const toConditionalText = (text: DslText, pack: string): ConditionalText =>
  text.map((fragment: DslText[number]) => {
    if (fragment.kind === 'literal') return { kind: 'literal', text: fragment.text };
    return { kind: 'conditional', condition: toCondition((fragment as Extract<DslText[number], { kind: 'conditional' }>).cond, pack), text: fragment.text };
  });

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
// A droptable entry's bare `id` is either an item id or the id of a
// `# droptable <id>` section — only resolvable now that every section has
// been seen (see `dropTableIds` in compileDsl). `nested` (from a
// `dependent droptable (N):` line) always wins first since it has no `id` of
// its own to disambiguate.
const entryToDropTableEntry = (entry: DslDropEntry, dropTableIds: Set<string>): DropTableEntry => {
  if (entry.nested) return { weight: entry.weight, drops: entry.nested.map((child) => entryToDropTableEntry(child, dropTableIds)) };
  if (entry.id && dropTableIds.has(entry.id)) return { weight: entry.weight, dropTableId: entry.id };
  return { weight: entry.weight, reward: { kind: 'item', itemId: entry.id!, amount: entry.amount ?? 1 } };
};

const tagToReward = (tag: DslTag, dropTableIds: Set<string>): Reward | null => {
  if (tag.keyword === 'give') return { kind: 'item', itemId: tag.itemId, amount: tag.amount };
  if (tag.keyword === 'take') return { kind: 'item', itemId: tag.itemId, amount: -tag.amount };
  if (tag.keyword === 'xp') return { kind: 'skillXp', skillId: tag.skillId, amount: tag.amount };
  if (tag.keyword === 'resource') return { kind: 'resource', resourceId: tag.resourceId, amount: tag.amount };
  if (tag.keyword === 'droptable') {
    return { kind: 'dropTable', mode: 'independent', drops: tag.entries.map((entry) => entryToDropTableEntry(entry, dropTableIds)) };
  }
  return null;
};

const hasConditionals = (text: DslText): boolean =>
  text.some((fragment) => fragment.kind === 'conditional');

const tagToActionResult = (
  tag: DslTag,
  locale: LocaleBuilder,
  chatKeyBase: string,
  chatCounter: { n: number },
  pack: string,
): ActionResult | null => {
  if (tag.keyword === 'give') return { kind: 'item', itemId: tag.itemId, amount: tag.amount };
  if (tag.keyword === 'take') return { kind: 'item', itemId: tag.itemId, amount: -tag.amount };
  if (tag.keyword === 'xp') return { kind: 'skill-xp', skillId: tag.skillId, amount: tag.amount };
  if (tag.keyword === 'set') return { kind: 'flag', flagId: resolveFlagId(tag.flagId, pack), value: true };
  if (tag.keyword === 'unset') return { kind: 'flag', flagId: resolveFlagId(tag.flagId, pack), value: false };
  if (tag.keyword === 'resource') return { kind: 'resource', resourceId: tag.resourceId, amount: tag.amount };
  if (tag.keyword === 'gotoDialogue') return { kind: 'dialogue', dialogueId: tag.dialogueId };
  if (tag.keyword === 'openModal') return { kind: 'open-modal', modalId: tag.modalId };
  if (tag.keyword === 'relocate') return { kind: 'relocate', locationId: tag.locationId };
  if (tag.keyword === 'setSpawn') return { kind: 'set-spawn', locationId: tag.locationId };
  if (tag.keyword === 'discover') return { kind: 'discover-location', locationId: tag.locationId };
  if (tag.keyword === 'say') {
    if (hasConditionals(tag.text)) {
      return { kind: 'conditional-chat', fragments: toConditionalText(tag.text, pack) };
    }
    chatCounter.n += 1;
    const key = chatCounter.n === 1 ? chatKeyBase : `${chatKeyBase}-${chatCounter.n}`;
    const plainText = tag.text
      .filter((fragment) => fragment.kind === 'literal')
      .map((fragment) => fragment.text)
      .join('')
      .trim();
    locale.set(key, plainText);
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

// `scope` only changes the locale-key prefix (`action.entity.x`/`action.item.x`)
// — entities and items otherwise compile through the identical pipeline.
// Items never go through the `enemy:` branch (see compileItemAction).
// Inline conditionals in `say:` tags are now evaluated at runtime via
// conditional-chat ActionResult instead of being expanded into 2^n variants.
const compileActionVariants = (
  scope: 'entity' | 'item',
  ownerId: string,
  decl: DslActionDecl,
  locale: LocaleBuilder,
  pack: string,
  dropTableIds: Set<string>,
): Record<string, unknown>[] => {
  const baseActionId = kebab(decl.title);
  locale.set(`action.${scope}.${ownerId}.${baseActionId}.title`, titleCase(decl.title));
  locale.set(`action.${scope}.${ownerId}.${baseActionId}.description`, `${titleCase(decl.title)}.`);

  const stationTag = decl.tags.find((tag): tag is Extract<DslTag, { keyword: 'station' }> => tag.keyword === 'station');
  if (stationTag) {
    // Station actions have no fixed rewards/results/duration of their own —
    // the UI populates their options from whichever `recipes` entries the
    // player currently holds ingredients for. Every other tag is irrelevant.
    setDefaultOutcomeLocale(locale, `action.${scope}.${ownerId}.${baseActionId}`, { success: 'Done.', failure: 'Nothing happens.' });
    return [{ id: baseActionId, stationId: stationTag.stationId, rewards: [] }];
  }

  const enemyTag = decl.tags.find((tag): tag is Extract<DslTag, { keyword: 'enemy' }> => tag.keyword === 'enemy');
  const requiresTag = decl.tags.find((tag): tag is Extract<DslTag, { keyword: 'requires' }> => tag.keyword === 'requires');
  const requirements = requiresTag ? toCondition(requiresTag.cond, pack) : undefined;
  const visibleWhen = deriveVisibleWhen(decl.tags, decl.onSuccessTags, baseActionId, pack);
  const maxTag = decl.tags.find((tag): tag is Extract<DslTag, { keyword: 'max' }> => tag.keyword === 'max');
  const maxCompletions = decl.tags.some((tag) => tag.keyword === 'once') ? 1 : maxTag?.count;
  const chanceTag = decl.tags.find((tag): tag is Extract<DslTag, { keyword: 'chance' }> => tag.keyword === 'chance');

  const chatKeyBase = `chat.${scope}.${ownerId}.${baseActionId}`;
  const chatCounter = { n: 0 };
  const actionKeyBase = `action.${scope}.${ownerId}.${baseActionId}`;

  if (enemyTag) {
    const rewards = decl.tags
      .filter((tag) => tag.keyword === 'give' || tag.keyword === 'xp' || tag.keyword === 'take' || tag.keyword === 'droptable')
      .map((tag) => tagToReward(tag, dropTableIds))
      .filter((reward): reward is Reward => reward !== null);
    const results = decl.onSuccessTags
      .map((tag) => tagToActionResult(tag, locale, chatKeyBase, chatCounter, pack))
      .filter((result): result is ActionResult => result !== null);
    setDefaultOutcomeLocale(locale, actionKeyBase, {
      success: 'You hit the {entity}.',
      failure: 'You miss the {entity}.',
      kill: 'The {entity} drops.',
    });
    return [{
      id: baseActionId,
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
    }];
  }

  const results = [...decl.tags, ...decl.onSuccessTags]
    .map((tag) => tagToActionResult(tag, locale, chatKeyBase, chatCounter, pack))
    .filter((result): result is ActionResult => result !== null);
  const failureResults = decl.onFailTags
    .map((tag) => tagToActionResult(tag, locale, `${chatKeyBase}-fail`, { n: 0 }, pack))
    .filter((result): result is ActionResult => result !== null)

  setDefaultOutcomeLocale(locale, actionKeyBase, { success: 'Done.', failure: 'Nothing happens.' });

  return [{
    id: baseActionId,
    instant: true,
    rewards: [],
    results,
    ...(requirements ? { requirements } : {}),
    ...(visibleWhen ? { visibleWhen } : {}),
    ...(maxCompletions ? { maxCompletions } : {}),
    ...(chanceTag ? { chance: chanceTag.percent } : {}),
    ...(failureResults.length > 0 ? { failureResults } : {}),
  }];
};

const compileEntityAction = (entityId: string, decl: DslActionDecl, locale: LocaleBuilder, pack: string, dropTableIds: Set<string>): EntityActionDefinition[] =>
  compileActionVariants('entity', entityId, decl, locale, pack, dropTableIds) as EntityActionDefinition[];

const compileItemAction = (itemId: string, decl: DslActionDecl, locale: LocaleBuilder, pack: string, dropTableIds: Set<string>): ItemActionDefinition[] => {
  const variants = compileActionVariants('item', itemId, decl, locale, pack, dropTableIds);
  for (const variant of variants) {
    if ('enemy' in variant) throw new Error(`Item action "${itemId}.${decl.title}" cannot be adversarial (enemy:) — items are always instant.`);
  }
  return variants as ItemActionDefinition[];
};

// ---------------------------------------------------------------------------
// Location (+ nested entities, + walls)
// ---------------------------------------------------------------------------
const compileLocation = (
  section: DslLocationSection,
  locale: LocaleBuilder,
  pack: string,
  dropTableIds: Set<string>,
): { location: LocationNode; entities: EntityDefinition[]; actions: GameAction[] } => {
  locale.set(`location.${section.id}.title`, section.title ?? humanize(section.id));
  locale.set(locationExamineKey(section.id), section.examine ?? `${humanize(section.id)}.`);
  locale.set(`location.${section.id}.exhausted`, section.exhausted ?? 'It is quiet now.');

  const entities: EntityDefinition[] = [];
  const entityIds: string[] = [];
  for (const entityDecl of section.entities as DslEntityDecl[]) {
    entityIds.push(entityDecl.id);
    locale.set(`entity.${entityDecl.id}.title`, entityDecl.title ?? humanize(entityDecl.id));
    const actions: EntityActionDefinition[] = entityDecl.actions.flatMap((actionDecl) => compileEntityAction(entityDecl.id, actionDecl, locale, pack, dropTableIds));
    entities.push({ id: entityDecl.id, actions });
  }

  const actions: GameAction[] = [];
  const locationActionIds: string[] = [];
  for (const edge of section.adjacent) {
    const edgeId = `adjacent-${section.id}-to-${edge.toLocationId}`;
    locale.set(`action.${edgeId}.title`, 'Leave');
    locale.set(`action.${edgeId}.description`, 'Leave.');
    setDefaultOutcomeLocale(locale, `action.${edgeId}`, { success: 'Done.', failure: 'Nothing happens.' });

    actions.push({
      id: edgeId,
      role: 'travel',
      rewards: [],
      results: [{ kind: 'relocate', locationId: edge.toLocationId }],
      ...(edge.cond ? { visibleWhen: toCondition(edge.cond, pack) } : {}),
    });
    locationActionIds.push(edgeId);
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
  const nodes: DialogueNode[] = section.nodes.map((node) => {
    const textKey = `dialogue.${section.id}.${node.id}`;
    locale.set(textKey, node.text);

    const options: DialogueOption[] = node.options.map((option) => {
      const optionId = kebab(option.label);
      const labelKey = `dialogue.${section.id}.option.${optionId}`;
      locale.set(labelKey, option.label);
      const results = option.tags
        .map((tag) => tagToActionResult(tag, locale, `chat.dialogue.${section.id}.${node.id}.${optionId}`, { n: 0 }, pack))
        .filter((result): result is ActionResult => result !== null);
      return {
        id: optionId,
        labelKey,
        gotoNodeId: option.targetNodeId,
        ...(results.length > 0 ? { results } : {}),
      };
    });

    const enterResults = node.enterTags
      .map((tag) => tagToActionResult(tag, locale, `chat.dialogue.${section.id}.${node.id}.enter`, { n: 0 }, pack))
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
// Items, quests, recipes
// ---------------------------------------------------------------------------
const compileItemSection = (section: DslItemSection, locale: LocaleBuilder, pack: string, dropTableIds: Set<string>): ItemDefinition => {
  locale.set(`item.${section.id}.title`, section.title ?? humanize(section.id));
  const actions = section.actions.flatMap((actionDecl) => compileItemAction(section.id, actionDecl, locale, pack, dropTableIds));
  return {
    id: section.id,
    ...(section.maxQuantity !== undefined ? { maxQuantity: section.maxQuantity } : {}),
    ...(section.tagsString ? { tags: section.tagsString } : {}),
    ...(section.offensiveTagsString ? { offensiveTags: section.offensiveTagsString } : {}),
    ...(section.defensiveTagsString ? { defensiveTags: section.defensiveTagsString } : {}),
    ...(actions.length > 0 ? { actions } : {}),
  };
};

const compileQuest = (section: DslQuestSection, locale: LocaleBuilder, pack: string): QuestDefinition => {
  const titleKey = `quest.${section.id}.title`;
  locale.set(titleKey, section.title);
  const stages: QuestStage[] = section.stages.map((stage) => {
    const descriptionKey = `quest.${section.id}.stage.${stage.id}`;
    locale.set(descriptionKey, stage.description);
    return { id: stage.id, descriptionKey, condition: toCondition(stage.cond, pack) };
  });
  return { id: section.id, titleKey, stages };
};

const compileRecipe = (section: DslRecipeSection, locale: LocaleBuilder, pack: string): RecipeDefinition => {
  const extraResults = section.onSuccessTags
    .map((tag) => tagToActionResult(tag, locale, `chat.recipe.${section.id}`, { n: 0 }, pack))
    .filter((result): result is ActionResult => result !== null);
  return {
    id: section.id,
    stationId: section.stationId,
    inputs: section.inputs,
    outputs: section.outputs,
    ...(section.skillId ? { skillId: section.skillId } : {}),
    ...(section.xpAmount !== undefined ? { xpAmount: section.xpAmount } : {}),
    ...(extraResults.length > 0 ? { extraResults } : {}),
  };
};

// ---------------------------------------------------------------------------
// Stats/skills/flags: flat sugar for what used to require a raw `# advanced`
// block. A skill's `statId` defaults to its own id (matching the common case
// of a same-named stat backing it) and `maxLevel` defaults to 100 (every
// skill in this codebase already uses that).
// ---------------------------------------------------------------------------
const compileStat = (section: DslStatSection, locale: LocaleBuilder): StatDefinition => {
  locale.set(statTitleKey(section.id), section.title ?? humanize(section.id));
  locale.set(statExamineKey(section.id), section.examine ?? `${humanize(section.id)}.`);
  return { id: section.id, base: section.base };
};

const compileSkill = (section: DslSkillSection, locale: LocaleBuilder): SkillDefinition => {
  locale.set(skillTitleKey(section.id), section.title ?? humanize(section.id));
  locale.set(skillExamineKey(section.id), section.examine ?? `${humanize(section.id)}.`);
  return { id: section.id, maxLevel: section.maxLevel ?? 100, statId: section.statId ?? section.id };
};

const compileFlags = (section: DslFlagsSection): StateFlagDefinition[] => section.flags;

// A named, reusable droptable (`# droptable <id>`) is always `independent`
// mode — the same mode a `droptable:` tag's own attached (unnamed) table
// uses — so referencing one elsewhere (`<id> (<weight>)`) and inlining a
// `droptable:` block read the same way: each entry has its own independent
// 1-in-weight chance to fire.
const compileDropTable = (section: DslDropTableSection, dropTableIds: Set<string>): DropTableDefinition => ({
  id: section.id,
  mode: 'independent',
  drops: section.entries.map((entry) => entryToDropTableEntry(entry, dropTableIds)),
});

// ---------------------------------------------------------------------------
// Interactions: sugar for InteractionTypeDefinition — see docs on
// parseInteractionSection for why every message field is optional and
// backfilled with a generic default rather than required.
// ---------------------------------------------------------------------------
const compileInteraction = (section: DslInteractionSection, locale: LocaleBuilder): InteractionTypeDefinition => {
  locale.set(interactionTitleKey(section.id), section.title ?? humanize(section.id));
  locale.set(interactionPlayerHitKey(section.id), section.playerHit ?? 'You hit the {entity}.');
  locale.set(interactionPlayerMissKey(section.id), section.playerMiss ?? 'You miss the {entity}.');
  locale.set(interactionPlayerKillKey(section.id), section.playerKill ?? 'The {entity} drops.');
  locale.set(interactionEntityHitKey(section.id), section.entityHit ?? 'The {entity} hits you.');
  locale.set(interactionEntityMissKey(section.id), section.entityMiss ?? 'The {entity} misses.');
  locale.set(interactionEntityKillKey(section.id), section.entityKill ?? 'The {entity} defeats you.');
  return {
    id: section.id,
    sourceStatId: section.sourceStatId,
    targetStatId: section.targetStatId,
    targetPlayerHealth: section.targetPlayerHealth,
  };
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
  const items: ItemDefinition[] = [];
  const quests: QuestDefinition[] = [];
  const recipes: RecipeDefinition[] = [];
  const interactionTypes: InteractionTypeDefinition[] = [];
  const stats: StatDefinition[] = [];
  const skills: SkillDefinition[] = [];
  const flags: StateFlagDefinition[] = [];
  const dropTables: DropTableDefinition[] = [];
  let advanced: Record<string, unknown> = {};

  // A droptable entry's bare id (item vs. named-droptable reference) can only
  // be disambiguated once every `# droptable <id>` section has been seen —
  // collect those ids up front, before compiling anything that might
  // reference one.
  const dropTableIds = new Set(
    dsl.sections.filter((section): section is DslDropTableSection => section.kind === 'droptable').map((section) => section.id),
  );

  for (const section of dsl.sections) {
    if (section.kind === 'location') {
      const compiled = compileLocation(section, locale, pack, dropTableIds);
      locations.push(compiled.location);
      entities.push(...compiled.entities);
      actions.push(...compiled.actions);
    } else if (section.kind === 'dialogue') {
      dialogues.push(compileDialogue(section, locale, pack));
    } else if (section.kind === 'advanced') {
      advanced = { ...advanced, ...section.json };
    } else if (section.kind === 'item') {
      items.push(compileItemSection(section, locale, pack, dropTableIds));
    } else if (section.kind === 'quest') {
      quests.push(compileQuest(section, locale, pack));
    } else if (section.kind === 'recipe') {
      recipes.push(compileRecipe(section, locale, pack));
    } else if (section.kind === 'interaction') {
      interactionTypes.push(compileInteraction(section, locale));
    } else if (section.kind === 'stat') {
      stats.push(compileStat(section, locale));
    } else if (section.kind === 'skill') {
      skills.push(compileSkill(section, locale));
    } else if (section.kind === 'flags') {
      flags.push(...compileFlags(section));
    } else if (section.kind === 'droptable') {
      dropTables.push(compileDropTable(section, dropTableIds));
    }
  }

  // `# advanced`'s own `interactionTypes` (if any) are merged in alongside
  // any `# interaction` sections, rather than one clobbering the other —
  // `# advanced` remains a valid escape hatch for interactionTypes fields
  // this sugar doesn't cover (e.g. `experience`).
  const advancedInteractionTypes = Array.isArray(advanced.interactionTypes)
    ? advanced.interactionTypes as InteractionTypeDefinition[]
    : [];
  // `# advanced`'s own optional `locale` (a flat key -> text record, same
  // shape as `locale.entries`) is the escape hatch for text that has no other
  // DSL-generated locale key — e.g. titles/descriptions for stats/skills/
  // resources/effects, which (unlike items/dialogue/quests) are pure
  // `# advanced` passthrough with no compiler-side locale generation of their
  // own. Applied with `??=` (never overwrites) so it can only fill gaps, not
  // clobber a key any other section already generated — `# advanced` locale
  // is for content this DSL has no sugar for, not a general override
  // mechanism.
  const advancedLocale = advanced.locale && typeof advanced.locale === 'object' && !Array.isArray(advanced.locale)
    ? advanced.locale as Record<string, string>
    : {};
  for (const [key, value] of Object.entries(advancedLocale)) locale.entries[key] ??= value;
  // `# advanced`'s own optional `data-updates` key is the escape hatch for
  // module patches/removals (ModuleDataUpdates) — a second kind of content a
  // module can carry alongside its own `data`, with no DSL sugar of its own
  // (cross-module JSON-patch edits and `data-updates.remove` id lists are
  // both engine plumbing, same rationale as the rest of `# advanced`).
  const advancedDataUpdates = advanced['data-updates'];
  const { interactionTypes: _advancedInteractionTypes, locale: _advancedLocale, 'data-updates': _advancedDataUpdates, ...advancedRest } = advanced;

  const data: ModuleDataSectionObject = {
    ...(locations.length > 0 ? { locations } : {}),
    ...(entities.length > 0 ? { entities } : {}),
    ...(actions.length > 0 ? { actions } : {}),
    ...(dialogues.length > 0 ? { dialogues } : {}),
    ...(items.length > 0 ? { items } : {}),
    ...(quests.length > 0 ? { quests } : {}),
    ...(recipes.length > 0 ? { recipes } : {}),
    ...(interactionTypes.length > 0 || advancedInteractionTypes.length > 0
      ? { interactionTypes: [...interactionTypes, ...advancedInteractionTypes] }
      : {}),
    ...(stats.length > 0 ? { stats } : {}),
    ...(skills.length > 0 ? { skills } : {}),
    ...(flags.length > 0 ? { flags } : {}),
    ...(dropTables.length > 0 ? { dropTables } : {}),
    ...advancedRest,
  };

  const module: ContentModule = {
    id: dsl.info.id,
    version: dsl.info.version,
    universe: dsl.info.universe,
    author: dsl.info.author,
    game_version: dsl.info.gameVersion,
    ...(dsl.info.dependencies.length > 0 ? { dependencies: dsl.info.dependencies } : {}),
    data,
    ...(advancedDataUpdates !== undefined ? { 'data-updates': advancedDataUpdates as ContentModule['data-updates'] } : {}),
    locale: { en: locale.entries },
  };

  return { module, locale: locale.entries };
};
