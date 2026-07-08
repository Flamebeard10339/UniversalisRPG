// AST types for the content DSL (docs/content-dsl-grammar.md). One file's
// worth of markdown parses into one DslModule; compiler.ts lowers that into
// the existing ContentModule JSON shape — see the grammar doc for the
// authoring-facing syntax these types mirror.

export type DslCondition =
  | { kind: 'flag'; flagId: string }
  | { kind: 'item'; itemId: string }
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
  | { keyword: 'requires'; cond: DslCondition }
  | { keyword: 'hiddenIf'; cond: DslCondition }
  | { keyword: 'visibleIf'; cond: DslCondition }
  | { keyword: 'say'; text: DslText }
  | { keyword: 'gotoDialogue'; dialogueId: string }
  | { keyword: 'openModal'; modalId: string }
  | { keyword: 'enemy'; interactionTypeId: string; stats: Record<string, number> }
  | { keyword: 'chance'; percent: number }
  | { keyword: 'station'; stationId: string }
  | { keyword: 'resource'; resourceId: string; amount: number };

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
  actions: DslActionDecl[];
};

export type DslWallDecl = {
  toLocationId: string;
  cond: DslCondition;
};

export type DslLocationSection = {
  kind: 'location';
  id: string;
  x: number;
  y: number;
  z?: number;
  tags: string[];
  starting: boolean;
  walls: DslWallDecl[];
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

export type DslSection =
  | DslLocationSection
  | DslDialogueSection
  | DslAdvancedSection
  | DslItemSection
  | DslQuestSection
  | DslRecipeSection;

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
