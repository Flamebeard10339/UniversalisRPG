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
  modules?: string[];
  basePlayer?: BasePlayerDefinition;
  combatBalance?: CombatBalanceDefinition;
  experienceCurve?: ExperienceCurveDefinition;
  experience?: ExperienceTrigger[];
  displayProfiles?: DisplayProfileDefinition[];
  ui?: UniverseUiSettings;
  compatibility?: {
    minAppVersion?: string;
    maxAppVersion?: string;
  };
};

export type DisplayColorPalette = {
  background?: string;
  surface?: string;
  surfaceRaised?: string;
  panel?: string;
  border?: string;
  text?: string;
  textMuted?: string;
  textSubtle?: string;
  accent?: string;
  accentStrong?: string;
  accentText?: string;
  danger?: string;
  dangerSurface?: string;
  dangerText?: string;
  success?: string;
  warning?: string;
};

export type DisplayProfileDefinition = {
  id: string;
  titleKey?: string;
  colors?: DisplayColorPalette;
  light?: DisplayColorPalette;
  dark?: DisplayColorPalette;
};

export type BasePlayerDefinition = {
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
  'damage-scaler': number;
};

export type ExperienceCurveDefinition = {
  'starting-experience'?: number;
  'level-factor'?: number;
  exponential?: number;
};

export type UniverseUiSettings = {
  floatingTextDurationSeconds?: number;
  loopActionsByDefault?: boolean;
  travelPathMaxSeconds?: number;
  travelPathMaxNodes?: number;
};

export type LocationNode = {
  id: string;
  position: Position;
  starting?: boolean;
  tags?: string[];
  entities?: string[];
};

export type RewardAmount = number | { min: number; max: number };

export type Reward =
  | {
      kind: 'skillXp';
      skillId: string;
      amount: RewardAmount;
    }
  | {
      kind: 'resource';
      resourceId: string;
      amount: RewardAmount;
    }
  | {
      kind: 'item';
      itemId: string;
      amount: RewardAmount;
    }
  | {
      kind: 'dropTable';
      dropTableId: string;
    };

export type ConcreteReward = Exclude<Reward, { kind: 'dropTable' }> & { amount: number };

export type DropTableEntry = {
  weight: number;
  reward: Reward;
};

export type DropTableDefinition = {
  id: string;
  mode: 'independent' | 'dependent';
  drops: DropTableEntry[];
};

export type ExperienceEventKind =
  | 'action-complete'
  | 'damage-dealt'
  | 'damage-taken'
  | 'health-regenerated'
  | 'incoming-attack-missed';

export type ExperienceTrigger = {
  event: ExperienceEventKind;
  skillId: string;
  amount?: number;
  amountPerUnit?: number;
  effectId?: string;
  enemyId?: string;
  interactionTypeId?: string;
  resourceId?: string;
  sourceStat?: string;
};

export type NumericComparison = 'equal' | 'greater-than' | 'less-than';

export type Condition =
  | { kind: 'state-variable'; variable: string; comparison: NumericComparison; value: number | boolean | string }
  | { kind: 'item-tag'; tag: string }
  | { kind: 'equipped-item-tag'; tag: string }
  | { kind: 'all'; conditions: Condition[] }
  | { kind: 'any'; conditions: Condition[] }
  | { kind: 'not'; condition: Condition };

export type ActionResult =
  | { kind: 'item'; itemId: string; amount: number }
  | { kind: 'resource'; resourceId: string; amount: number }
  | { kind: 'skill-xp'; skillId: string; amount: number }
  | { kind: 'state-variable'; variable: string; value: boolean | number | string }
  | { kind: 'state-variable-delta'; variable: string; amount: number }
  | { kind: 'flag'; flagId: string; value: boolean }
  | { kind: 'relocate'; locationId: string }
  | { kind: 'dialogue'; dialogueId: string }
  | { kind: 'chat'; messageKey: string; delaySeconds?: number };

export type GameAction = {
  id: string;
  locationId?: string;
  role?: 'optional' | 'progression' | 'utility' | 'travel';
  durationSeconds: number;
  rewards: Reward[];
  experience?: ExperienceTrigger[];
  requirements?: Condition; // TODO: check what the UI looks like for a visible action that fails the requirements.
  visibleWhen?: Condition;
  results?: ActionResult[];
  maxCompletions?: number;
  enemyId?: string;
  interactionTypeId?: string;
};

export type EntityDefinition = {
  id: string;
  actionIds: string[];
  collectionLog?: EntityCollectionLogDefinition[];
};

export type EntityCollectionLogDefinition = {
  categoryId: string;
  actionId: string;
  killTargetCount?: number;
  dropTableIds?: string[];
  itemIds?: string[];
};

export type SkillDefinition = {
  id: string;
  maxLevel: number;
  statId?: string;
  addedPerLevel?: number;
  increasedPerLevel?: number;
};

export type StatDefinition = {
  id: string;
  base?: number;
};

export type ItemDefinition = {
  id: string;
  maxQuantity?: number;
  tags?: string;
};

export type StateFlagDefinition = {
  id: string;
  initialValue?: boolean | number | string;
};

export type InteractionTypeDefinition = {
  id: string;
  sourceStatId: string;
  targetStatId: string;
  targetPlayerHealth: boolean; // TODO:
  experience?: ExperienceTrigger[];
};

export type ResourceBoundaryBehavior =
  | {
      kind: 'stop-action';
    }
  | {
      kind: 'complete-action';
    }
  | {
      kind: 'enemy-attack';
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
      incrementVariable?: string;
      incrementFlagId?: string;
      preserve?: {
        inventory?: boolean;
        inventoryIds?: string[];
        resourceIds?: string[];
        variableIds?: string[];
        flagIds?: string[];
        skillXp?: boolean;
        collectionLog?: boolean;
        discoveredLocations?: boolean;
        actionCompletionIds?: string[];
      };
    };

export type ResourceDefinition = {
  id: string;
  owner?: 'player' | 'enemy';
  sourceStat: string;
  sourceEnemyStat?: EnemyStatKey;
  max?: number;
  initialValue?: 'empty' | 'full';
  display?: 'full' | 'minimal' | 'hidden';
  hidden?: boolean;
  onEmpty?: ResourceBoundaryBehavior[];
  onFull?: ResourceBoundaryBehavior[];
};

export type EffectDefinition = {
  id: string;
  resourceId: string;
  sourceStat: string;
  sourceEnemyStat?: EnemyStatKey;
  locationId?: string;
  rateUnit?: 'per-minute' | 'per-second';
  activeWhen?: Condition;
  resetResourceWhenInactive?: boolean;
};

export type EnemyDefinition = {
  id: string;
  interactionTypeId: string;
  stats?: Partial<Record<EnemyStatKey, number>>;
  showHealthBar?: boolean;
  rewards: Reward[];
};

export type DialogueOption = {
  id: string;
  labelKey: string;
  conditions?: Condition;
  results?: ActionResult[];
  gotoNodeId?: string;
};

export type DialogueBranch = {
  conditions: Condition;
  gotoNodeId: string;
};

export type DialogueNode = {
  id: string;
  speakerId?: string;
  textKey?: string;
  narratorKey?: string;
  results?: ActionResult[];
  branches?: DialogueBranch[];
  gotoNodeId?: string;
  options?: DialogueOption[];
};

export type DialogueDefinition = {
  id: string;
  startNodeId: string;
  nodes: DialogueNode[];
};

export type ContentBundle = {
  manifest: UniverseManifest;
  locations: LocationNode[];
  entities?: EntityDefinition[];
  actions: GameAction[];
  skills: SkillDefinition[];
  stats: StatDefinition[];
  items: ItemDefinition[];
  flags: StateFlagDefinition[];
  resourceDefinitions: ResourceDefinition[];
  effects: EffectDefinition[];
  interactionTypes: InteractionTypeDefinition[];
  enemies: EnemyDefinition[];
  dropTables?: DropTableDefinition[];
  dialogues?: DialogueDefinition[];
  locales: Record<string, LocaleDictionary>;
  modules?: ContentModule[];
  modulePacks?: ContentModulePack[];
  moduleIssues?: ValidationIssue[];
};

export type ModuleDataSectionObject = {
  locations?: LocationNode[];
  entities?: EntityDefinition[];
  actions?: GameAction[];
  skills?: SkillDefinition[];
  stats?: StatDefinition[];
  items?: ItemDefinition[];
  flags?: StateFlagDefinition[];
  resources?: ResourceDefinition[];
  resourceDefinitions?: ResourceDefinition[];
  effects?: EffectDefinition[];
  interactionTypes?: InteractionTypeDefinition[];
  enemies?: EnemyDefinition[];
  dropTables?: DropTableDefinition[];
  dialogues?: DialogueDefinition[];
  displayProfiles?: DisplayProfileDefinition[];
};

export type ModuleDataRemoveEntry = {
  type: 'remove';
  target: string;
  id: string;
  path?: string;
};

export type ModuleDataEntry = ({ id?: string; type: string } & Record<string, unknown>) | ModuleDataRemoveEntry;

export type ModuleDataSection = ModuleDataSectionObject | ModuleDataEntry[];

export type ModuleDataUpdatesObject = ModuleDataSectionObject & {
  remove?: {
    locations?: string[];
    entities?: string[];
    actions?: string[];
    skills?: string[];
    stats?: string[];
    items?: string[];
    flags?: string[];
    resources?: string[];
    effects?: string[];
    interactionTypes?: string[];
    enemies?: string[];
    dropTables?: string[];
    dialogues?: string[];
    dialogueOptions?: Record<string, string[]>;
    displayProfiles?: string[];
    locales?: string[];
  };
  locale?: Record<string, LocaleDictionary>;
};

export type ModuleDataUpdates = ModuleDataUpdatesObject | ModuleDataEntry[];

export type ContentModule = {
  id: string;
  version: string;
  universe: string;
  author: string;
  game_version: string | number;
  dependencies?: string[];
  data?: ModuleDataSection;
  'data-updates'?: ModuleDataUpdates;
  locale?: Record<string, LocaleDictionary>;
};

export type ContentModulePack = {
  id: string;
  titleKey?: string;
  modules?: string[];
  packs?: ContentModulePack[];
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
};

export type ActionProgress = {
  elapsedMs: number;
  runningSince: number | null;
  targetHealth?: number | null;
};

export type ActiveTravel = {
  actionId: string;
  fromLocationId: string;
  toLocationId: string;
  finalLocationId: string;
  startedAt: number;
  completesAt: number;
  pathStartedAt: number;
  pathCompletesAt: number;
  pathLocationIds: string[];
  pathActionIds: string[];
  pathSegmentDurationsSeconds: number[];
  pathIndex: number;
};

export type ActiveDialogue = {
  dialogueId: string;
  nodeId: string;
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

export type IdleRewardSummary = ConcreteReward & {
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

export type EquipmentSlot =
  | 'head'
  | 'body'
  | 'legs'
  | 'boots'
  | 'gloves'
  | 'ring'
  | 'necklace'
  | 'mainhand'
  | 'offhand';

export type SkillTotals = {
  base: number;
  added: number;
  increased: number;
  effectiveTotal: number;
  rate: number;
};

export type StatTotals = {
  base: number;
  added: number;
  increased: number;
  effectiveTotal: number;
};

export type ActionResolutionContext = {
  actions: GameAction[];
  skills: SkillDefinition[];
  stats?: StatDefinition[];
  locations?: LocationNode[];
  entities?: EntityDefinition[];
  manifest?: UniverseManifest;
  items?: ItemDefinition[];
  flags?: StateFlagDefinition[];
  resourceDefinitions?: ResourceDefinition[];
  effects?: EffectDefinition[];
  interactionTypes: InteractionTypeDefinition[];
  enemies: EnemyDefinition[];
  dropTables?: DropTableDefinition[];
  dialogues?: DialogueDefinition[];
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
  activeDialogue: ActiveDialogue | null;
  resources: Record<string, number>;
  inventory: Record<string, number>;
  flags: Record<string, boolean | number | string>;
  actionCompletions: Record<string, number>;
  collectionLog: Record<string, number>;
  resourcePools: Record<string, ResourcePool>;
  skillXp: Record<string, number>;
  statOverrides: Record<string, number>;
  equipmentSkillBonuses: Record<string, SkillEquipmentBonuses>;
  equipment: Partial<Record<EquipmentSlot, string>>;
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
  experienceCurve?: ExperienceCurveDefinition;
  experience?: ExperienceTrigger[];
  displayProfiles?: DisplayProfileDefinition[];
  ui?: UniverseUiSettings;
  modules: ContentModule[];
  modulePacks: ContentModulePack[];
  locations: LocationNode[];
  entities?: EntityDefinition[];
  actions: GameAction[];
  skills: SkillDefinition[];
  stats: StatDefinition[];
  items: ItemDefinition[];
  flags: StateFlagDefinition[];
  resourceDefinitions: ResourceDefinition[];
  effects: EffectDefinition[];
  interactionTypes: InteractionTypeDefinition[];
  enemies: EnemyDefinition[];
  dropTables: DropTableDefinition[];
  dialogues: DialogueDefinition[];
  locales: Record<string, LocaleDictionary>;
  removed: ContributionRemovedIds;
};

export type ContributionRemovedIds = {
  locations: string[];
  entities?: string[];
  actions: string[];
  skills: string[];
  stats: string[];
  items: string[];
  flags: string[];
  resources: string[];
  effects: string[];
  interactionTypes: string[];
  enemies: string[];
  dropTables: string[];
  dialogues: string[];
  modules: string[];
};

export type ContributionPackage = {
  appVersion: string;
  targetModuleId?: string;
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
