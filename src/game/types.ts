export type LocaleDictionary = Record<string, string>;

export type Position = {
  x: number;
  y: number;
};

export type UniverseManifest = {
  schemaVersion: number;
  id: string;
  version: string;
  author: string;
  locales: string[];
  files: string[];
  basePlayer?: BasePlayerDefinition;
  combatBalance?: CombatBalanceDefinition;
  ui?: UniverseUiSettings;
  compatibility?: {
    minAppVersion?: string;
    maxAppVersion?: string;
  };
};

export type BasePlayerDefinition = {
  stats?: Record<string, number>;
  inventory?: Record<string, number>;
};

export type EnemyStatKey =
  | 'attack'
  | 'defense'
  | 'health'
  | 'rate'
  | 'regeneration'
  | 'armorPenetration'
  | 'torpidity'
  | 'critChance'
  | 'critMultiplier';

export type CombatBalanceDefinition = {
  expectedHitsToKill: number;
  combatSpread: number;
};

export type UniverseUiSettings = {
  floatingTextDurationSeconds?: number;
};

export type LocationNode = {
  id: string;
  position: Position;
  starting?: boolean;
  tags?: string[];
};

export type TravelEdgeDefinition = {
  id: string;
  source: string;
  target: string;
  travelTimeSeconds: number;
};

export type Reward =
  | {
      kind: 'skillXp';
      skillId: string;
      amount: number;
    }
  | {
      kind: 'resource';
      resourceId: string;
      amount: number;
    }
  | {
      kind: 'item';
      itemId: string;
      amount: number;
    };

export type NumericComparison = 'equal' | 'greater-than' | 'less-than';

export type Condition =
  | { kind: 'state-variable'; variable: string; comparison: NumericComparison; value: number | boolean }
  | { kind: 'all'; conditions: Condition[] }
  | { kind: 'any'; conditions: Condition[] }
  | { kind: 'not'; condition: Condition };

export type ActionResult =
  | { kind: 'item'; itemId: string; amount: number }
  | { kind: 'resource'; resourceId: string; amount: number }
  | { kind: 'skill-xp'; skillId: string; amount: number }
  | { kind: 'flag'; flagId: string; value: boolean }
  | { kind: 'relocate'; locationId: string }
  | { kind: 'chat'; messageKey: string; delaySeconds?: number };

export type GameAction = {
  id: string;
  locationId: string;
  role?: 'optional' | 'progression' | 'utility';
  durationSeconds: number;
  rewards: Reward[];
  requirements?: Condition; // TODO: check what the UI looks like for a visible action that fails the requirements.
  visibleWhen?: Condition;
  results?: ActionResult[];
  maxCompletions?: number;
  enemyId?: string;
  interactionTypeId?: string;
};

export type SkillDefinition = {
  id: string;
  maxLevel: number;
};

export type StatDefinition = {
  id: string;
  base?: number;
  added?: number;
  increased?: number;
  skillId?: string;
};

export type ItemDefinition = {
  id: string;
  maxQuantity?: number;
};

export type StateFlagDefinition = {
  id: string;
  initialValue?: boolean | number;
};

export type InteractionTypeDefinition = {
  id: string;
  sourceStatId: string;
  targetStatId: string;
  targetPlayerHealth: boolean; // TODO:
};

export type ResourceBoundaryBehavior =
  | {
      kind: 'stop-action';
    }
  | {
      kind: 'refill';
      value: 'min' | 'max' | number;
    }
  | {
      kind: 'relocate';
      locationId: string;
    }
  | {
      kind: 'chat';
      messageKey: string;
    }
  | {
      kind: 'reset-state';
      locationId?: string;
      incrementFlagId?: string;
      preserve?: {
        inventoryIds?: string[];
        resourceIds?: string[];
        flagIds?: string[];
        skillXp?: boolean;
        discoveredLocations?: boolean;
        actionCompletionIds?: string[];
      };
    };

export type ResourceDefinition = {
  id: string;
  sourceStat: string;
  initialValue?: 'empty' | 'full';
  onEmpty?: ResourceBoundaryBehavior[];
  onFull?: ResourceBoundaryBehavior[];
};

export type EffectDefinition = {
  id: string;
  resourceId: string;
  sourceStat: string;
  locationId?: string;
};

export type EnemyDefinition = {
  id: string;
  interactionTypeId: string;
  stats?: Partial<Record<EnemyStatKey, number>>;
  showHealthBar?: boolean;
  rewards: Reward[];
};

export type ContentBundle = {
  manifest: UniverseManifest;
  locations: LocationNode[];
  edges: TravelEdgeDefinition[];
  actions: GameAction[];
  skills: SkillDefinition[];
  stats: StatDefinition[];
  items: ItemDefinition[];
  flags: StateFlagDefinition[];
  resourceDefinitions: ResourceDefinition[];
  effects: EffectDefinition[];
  interactionTypes: InteractionTypeDefinition[];
  enemies: EnemyDefinition[];
  locales: Record<string, LocaleDictionary>;
};

export type ValidationSeverity = 'error' | 'warning';

export type ValidationIssue = {
  severity: ValidationSeverity;
  path: string;
  message: string;
  params?: Record<string, string | number>;
};

export type ActiveAction = {
  actionId: string;
  startedAt: number;
  completesAt: number;
  targetHealth: number | null;
  enemyAttackStartedAt: number | null;
  enemyAttackCompletesAt: number | null;
};

export type ActionProgress = {
  elapsedMs: number;
  runningSince: number | null;
  targetHealth?: number | null;
  enemyAttackStartedAt?: number | null;
  enemyAttackCompletesAt?: number | null;
};

export type ActiveTravel = {
  edgeId: string;
  fromLocationId: string;
  toLocationId: string;
  startedAt: number;
  completesAt: number;
};

export type ChatMessage = {
  id: number;
  author: 'system' | 'player' | 'debug';
  key?: string;
  params?: Record<string, string | number>;
  text?: string;
  count: number;
  createdAt: number;
};

export type IdleRewardSummary = Reward & {
  labelId: string;
};

export type IdleReport =
  | {
      kind: 'none';
    }
  | {
      kind: 'travelCompleted';
      inactiveMs: number;
      fromLocationId: string;
      toLocationId: string;
      completedAt: number;
    }
  | {
      kind: 'actionCompleted';
      inactiveMs: number;
      actionId: string;
      completedAt: number;
      rewards: IdleRewardSummary[];
    }
  | {
      kind: 'actionFailed';
      inactiveMs: number;
      actionId: string;
      completedAt: number;
    }
  | {
      kind: 'inProgress';
      inactiveMs: number;
      timerKind: 'action' | 'travel';
      actionId?: string;
      fromLocationId?: string;
      toLocationId?: string;
      remainingMs: number;
    };

export type IdleResolution = {
  state: UniversePlayState;
  report: IdleReport;
};

export type SkillEquipmentBonuses = {
  base?: number;
  added?: number;
  increased?: number;
  rate?: number;
};

export type SkillTotals = {
  base: number;
  added: number;
  increased: number;
  effectiveTotal: number;
  rate: number;
};

export type ActionResolutionContext = {
  actions: GameAction[];
  skills: SkillDefinition[];
  stats?: StatDefinition[];
  locations?: LocationNode[];
  manifest?: UniverseManifest;
  items?: ItemDefinition[];
  flags?: StateFlagDefinition[];
  resourceDefinitions?: ResourceDefinition[];
  effects?: EffectDefinition[];
  interactionTypes: InteractionTypeDefinition[];
  enemies: EnemyDefinition[];
};

export type ResourcePool = {
  current: number;
  min: number;
  max: number;
};

export type UniversePlayState = {
  universeId: string;
  runId: string;
  currentLocationId: string;
  discoveredLocationIds: string[];
  activeAction: ActiveAction | null;
  actionProgress: Record<string, ActionProgress>;
  activeTravel: ActiveTravel | null;
  resources: Record<string, number>;
  inventory: Record<string, number>;
  flags: Record<string, boolean | number>;
  actionCompletions: Record<string, number>;
  resourcePools: Record<string, ResourcePool>;
  skillXp: Record<string, number>;
  statOverrides: Record<string, number>;
  equipmentSkillBonuses: Record<string, SkillEquipmentBonuses>;
  actionLoopingEnabled: boolean;
  playerHealth: number;
  playerMaxHealth: number;
  chatMessages: ChatMessage[];
  runLog: RunLogEntry[];
  nextRunLogSequence: number;
  lastTickAt: number;
};

export type RunLogEntry = {
  runId: string;
  sequence: number;
  createdAt: number;
  actor: 'gm' | 'player' | 'engine';
  event: string;
  data?: Record<string, unknown>;
};

export type ContributionDraft = {
  universeId: string;
  updatedAt: number;
  notes: string;
  basePlayer?: BasePlayerDefinition;
  combatBalance?: CombatBalanceDefinition;
  ui?: UniverseUiSettings;
  locations: LocationNode[];
  edges: TravelEdgeDefinition[];
  actions: GameAction[];
  skills: SkillDefinition[];
  stats: StatDefinition[];
  items: ItemDefinition[];
  flags: StateFlagDefinition[];
  resourceDefinitions: ResourceDefinition[];
  effects: EffectDefinition[];
  interactionTypes: InteractionTypeDefinition[];
  enemies: EnemyDefinition[];
  locales: Record<string, LocaleDictionary>;
  removed: ContributionRemovedIds;
};

export type ContributionRemovedIds = {
  locations: string[];
  edges: string[];
  actions: string[];
  skills: string[];
  stats: string[];
  items: string[];
  flags: string[];
  resources: string[];
  effects: string[];
  interactionTypes: string[];
  enemies: string[];
};

export type ContributionPackage = {
  appVersion: string;
  targetUniverseId: string;
  validationIssues: ValidationIssue[];
  notes: string;
  t?: (key: string, fallbackOrParams?: string | Record<string, string | number>, params?: Record<string, string | number>) => string;
  changedFiles: {
    path: string;
    json: unknown;
  }[];
};

export type LocalUniverseLibrary = Record<string, ContentBundle>;
