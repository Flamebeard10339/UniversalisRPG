// AST types for the content DSL (docs/content-dsl-grammar.md). One file's
// worth of markdown parses into one DslModule; compiler.ts lowers that into
// the existing ContentModule JSON shape — see the grammar doc for the
// authoring-facing syntax these types mirror.

export type DslCondition =
  | { kind: 'flag'; flagId: string }
  | { kind: 'item'; itemId: string }
  | { kind: 'item-tag'; tag: string }
  | { kind: 'equipped-item-tag'; tag: string }
  | { kind: 'not'; cond: DslCondition }
  | { kind: 'all'; conds: DslCondition[] }
  | { kind: 'any'; conds: DslCondition[] };

export type DslTextFragment =
  | { kind: 'literal'; text: string }
  | { kind: 'conditional'; cond: DslCondition; text: string };

export type DslText = DslTextFragment[];

export type DslTag =
  | { keyword: 'give'; itemId: string; amount: number }
  | { keyword: 'take'; itemId: string; amount: number }
  | { keyword: 'xp'; skillId: string; amount: number }
  | { keyword: 'set'; flagId: string }
  | { keyword: 'unset'; flagId: string }
  | { keyword: 'once' }
  | { keyword: 'max'; count: number }
  | { keyword: 'requires'; cond: DslCondition }
  | { keyword: 'hiddenIf'; cond: DslCondition }
  | { keyword: 'visibleIf'; cond: DslCondition }
  | { keyword: 'say'; text: DslText }
  | { keyword: 'gotoDialogue'; dialogueId: string }
  | { keyword: 'openModal'; modalId: string }
  | { keyword: 'enemy'; interactionTypeId: string; stats: Record<string, number> }
  | { keyword: 'chance'; percent: number }
  | { keyword: 'station'; stationId: string }
  | { keyword: 'resource'; resourceId: string; amount: number }
  | { keyword: 'relocate'; locationId: string }
  | { keyword: 'setSpawn'; locationId: string }
  | { keyword: 'discover'; locationId: string }
  | { keyword: 'takes'; seconds: number }
  | { keyword: 'droptable'; entries: DslDropEntry[] };

// One line inside a `droptable:` (or nested `dependent droptable (N):`) block.
// `id` is left unresolved by the parser — it's either an item id or the id of
// a `# droptable <id>` section, and only the compiler (which has seen every
// section) can tell which; `nested` is set instead of `id`/`amount` for a
// `dependent droptable (N):` line, recursively.
export type DslDropEntry = {
  weight: number;
  id?: string;
  amount?: number | { min: number; max: number };
  nested?: DslDropEntry[];
};

export type DslActionDecl = {
  title: string;
  // Top-level fields (requires/hidden-if/visible-if/enemy/chance/station/xp/
  // give/take/once/set/say) live here, applied in written order.
  // `onSuccessTags`/`onFailTags` hold the separate `on success:`/`on fail:`
  // fields — `on success:` becomes an adversarial action's `results`;
  // `on fail:` becomes a `chance:` action's `failureResults`.
  tags: DslTag[];
  onSuccessTags: DslTag[];
  onFailTags: DslTag[];
};

export type DslEntityDecl = {
  id: string;
  title?: string;
  actions: DslActionDecl[];
};

// A one-directional edge to another location, declared in this location's
// `adjacent:` block. `cond` is optional — a bare `<locationId>` line is an
// unconditional (always-visible) edge; `<locationId> while <condition>` gates
// it, e.g. a locked door that only opens once a flag is set.
export type DslAdjacentDecl = {
  toLocationId: string;
  cond?: DslCondition;
};

export type DslLocationSection = {
  kind: 'location';
  id: string;
  x: number;
  y: number;
  z?: number;
  tags: string[];
  starting: boolean;
  title?: string;
  examine?: string;
  exhausted?: string;
  adjacent: DslAdjacentDecl[];
  entities: DslEntityDecl[];
};

export type DslDialogueOption = {
  label: string;
  targetNodeId: string;
  tags: DslTag[];
};

export type DslDialogueNode = {
  id: string;
  speakerId?: string;
  text: string;
  options: DslDialogueOption[];
  gotoNodeId?: string;
  enterTags: DslTag[];
};

export type DslDialogueSection = {
  kind: 'dialogue';
  id: string;
  nodes: DslDialogueNode[];
};

export type DslAdvancedSection = {
  kind: 'advanced';
  json: Record<string, unknown>;
};

export type DslItemSection = {
  kind: 'item';
  id: string;
  title?: string;
  maxQuantity?: number;
  tagsString?: string;
  offensiveTagsString?: string;
  defensiveTagsString?: string;
  actions: DslActionDecl[];
};

export type DslQuestStage = {
  id: string;
  cond: DslCondition;
  description: string;
};

export type DslQuestSection = {
  kind: 'quest';
  id: string;
  title: string;
  stages: DslQuestStage[];
};

export type DslRecipeIngredient = {
  itemId: string;
  amount: number;
};

export type DslRecipeSection = {
  kind: 'recipe';
  id: string;
  stationId: string;
  inputs: DslRecipeIngredient[];
  outputs: DslRecipeIngredient[];
  skillId?: string;
  xpAmount?: number;
  onSuccessTags: DslTag[];
};

export type DslStatSection = {
  kind: 'stat';
  id: string;
  base: number;
  title?: string;
  examine?: string;
};

export type DslSkillSection = {
  kind: 'skill';
  id: string;
  statId?: string;
  maxLevel?: number;
  title?: string;
  examine?: string;
};

export type DslFlagsSection = {
  kind: 'flags';
  flags: { id: string; initialValue: boolean | number }[];
};

export type DslDropTableSection = {
  kind: 'droptable';
  id: string;
  entries: DslDropEntry[];
};

export type DslInteractionSection = {
  kind: 'interaction';
  id: string;
  sourceStatId: string;
  targetStatId: string;
  targetPlayerHealth: boolean;
  title?: string;
  playerHit?: string;
  playerMiss?: string;
  playerKill?: string;
  entityHit?: string;
  entityMiss?: string;
  entityKill?: string;
};

// Edits an entity/item that lives in *another* module — a community
// contribution to a module the author doesn't own, without merging into
// its file directly. Compiles to whole-object data-updates.patches entries
// (see compilePatchSection in compiler.ts), which the engine already
// applies purely at runtime (see applyObjectPatches in contentModules.ts) —
// this is DSL sugar for a pattern the JSON-only `# advanced` escape hatch
// already supported, not a new engine capability. A patched entity/item
// *replaces* the target wholesale (same semantics `data-updates.data`'s own
// entity/item merging already has for array-valued fields like `actions` —
// see mergePatchValue in contentModules.ts) — redeclare every action you
// want kept, not just the one you're changing.
//
// `remove <type>: <id>[, <id>...]` (entities/items/flags) — the same
// scoping rule as everywhere else flags appear applies to removeFlags'
// ids: a bare id resolves against *this* module's own pack (almost never
// what you want when removing something owned by targetModuleId — use the
// fully-qualified `<theirPack>.<flag>` form). Reuses the existing
// data-updates.remove mechanism (ModuleDataUpdatesObject); no new engine
// capability here either.
//
// A nested `flags:` block (same one-id-per-line grammar as the top-level
// `# flags` section) declares flags *through the patch mechanism*
// (data-updates.patches, `op: 'replace'`) rather than this module's own
// plain `data.flags` — required, not stylistic: two independent modules
// declaring the same id in their own `data.flags` is a hard
// moduleConflictDisabled collision (validateModuleDataCollisions) even
// when one of them is also removing the other's declaration in the same
// breath, since data collisions are checked before any data-updates ever
// run. Going through `.patches` (with `op: 'replace'`, not `'add'`) sails
// past that check entirely — verified empirically against the real
// applyModulesToBundle pipeline, not just reasoned about. This is exactly
// the "take over ownership of a flag from another module" case `remove
// flags:` exists for in the first place.
// A single `## upsert location <id>` op inside a `# patch`. Only the fields
// the author actually wrote are present — the compiler emits one JSON-Patch
// `replace` op per present structural field (position/tags/entities) and
// routes text fields (title/examine/exhausted) to this module's own locale
// (overriding the target's by load order, exactly as a `## replace entity`'s
// renamed title already does). Adjacency is deliberately NOT patchable here:
// a location's `adjacent:` compiles to whole travel-action objects + locale +
// an action-id list, not a single field, so it has no clean field-level patch
// shape — edit it in the target module directly, or add a free-standing
// travel entity in your own module.
export type DslLocationPatchFields = {
  x?: number;
  y?: number;
  z?: number;
  starting?: boolean;
  title?: string;
  examine?: string;
  exhausted?: string;
  tags?: string[];
  // The full, resulting entity-id list for the location — a whole-list
  // `replace`, not a delta, because a `# patch` module can't see the target's
  // current list to compute one. Used when a patch adds/removes an entity
  // from a core location (a dangling id in `entities` is a hard
  // `unknownEntity` validation error, so membership must stay in sync with
  // `## upsert entity`/`## remove entity` in the same patch).
  entities?: string[];
};

export type DslLocationPatch = { id: string; fields: DslLocationPatchFields };

// Edits content owned by *another* module (`targetModuleId`) without touching
// its file — see the grammar doc's `# patch` section. Body is a sequence of
// granular `## <op> <kind> <id>` ops:
//   ## upsert location <id>   field-level merge (only the written fields)
//   ## upsert|replace entity <id>   whole-object entity (redeclare all actions)
//   ## upsert|replace item <id>     whole-object item
//   ## upsert flag <id>[: value]    declare/take-over a flag via .patches
//   ## remove location|entity|item|flag <id>   drop it (data-updates.remove)
// plus a nested `flags:` block (same grammar as `# flags`). Entity/item
// upsert and replace compile identically (whole-object `replace` at path ''):
// the engine appends the object if the target doesn't have it and replaces it
// wholesale if it does, so "upsert" (may be new) vs "replace" (must exist) is
// an authoring-intent distinction, not a compile-time one.
export type DslPatchSection = {
  kind: 'patch';
  targetModuleId: string;
  locationPatches: DslLocationPatch[];
  entities: DslEntityDecl[];
  items: DslItemSection[];
  flags: { id: string; initialValue: boolean | number }[];
  removeLocations: string[];
  removeEntities: string[];
  removeItems: string[];
  removeFlags: string[];
};

export type DslSection =
  | DslLocationSection
  | DslDialogueSection
  | DslAdvancedSection
  | DslItemSection
  | DslQuestSection
  | DslRecipeSection
  | DslInteractionSection
  | DslStatSection
  | DslSkillSection
  | DslFlagsSection
  | DslDropTableSection
  | DslPatchSection;

export type DslInfo = {
  id: string;
  version: string;
  universe: string;
  author: string;
  gameVersion: string;
  dependencies: string[];
  // Bare (undotted) flag identifiers auto-namespace to this pack, so sibling
  // modules that declare the same pack can share short flag names without
  // qualification (a dotted flag id is always used exactly as written,
  // regardless of pack — that's the escape hatch for cross-pack references).
  // Defaults to `id` when omitted, so a standalone module is still safe by
  // default.
  pack?: string;
};

export type DslModule = {
  info: DslInfo;
  sections: DslSection[];
};
