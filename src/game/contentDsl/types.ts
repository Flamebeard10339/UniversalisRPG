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
  | { keyword: 'enemy'; interactionTypeId: string; stats: Record<string, number> };

export type DslActionDecl = {
  title: string;
  // Short-form actions: every tag lives here, applied in written order.
  // Long-form actions: top-level fields (requires/hidden-if/visible-if/enemy/
  // xp/give/take/once/set) live here; `onSuccessTags` holds the separate
  // `on success:` field, which becomes the adversarial action's `results`.
  tags: DslTag[];
  onSuccessTags: DslTag[];
};

export type DslEntityDecl = {
  id: string;
  examine?: DslText;
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

export type DslSection = DslLocationSection | DslDialogueSection | DslAdvancedSection;

export type DslInfo = {
  id: string;
  version: string;
  universe: string;
  author: string;
  gameVersion: string;
  dependencies: string[];
};

export type DslModule = {
  info: DslInfo;
  sections: DslSection[];
};
