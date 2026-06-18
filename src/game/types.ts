export type LocaleDictionary = Record<string, string>;

export type Position = {
  x: number;
  y: number;
};

export type UniverseManifest = {
  schemaVersion: number;
  id: string;
  titleKey: string;
  descriptionKey?: string;
  version: string;
  author: string;
  locales: string[];
  files: string[];
  compatibility?: {
    minAppVersion?: string;
    maxAppVersion?: string;
  };
};

export type LocationNode = {
  id: string;
  titleKey?: string;
  descriptionKey?: string;
  position: Position;
  starting?: boolean;
  tags?: string[];
};

export type TravelEdgeDefinition = {
  id: string;
  source: string;
  target: string;
  travelTimeSeconds: number;
  requirementIds?: string[];
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
    };

export type Requirement =
  | {
      kind: 'skillLevel';
      skillId: string;
      level: number;
    }
  | {
      kind: 'resource';
      resourceId: string;
      amount: number;
    };

export type GameAction = {
  id: string;
  locationId: string;
  titleKey?: string;
  descriptionKey?: string;
  durationSeconds: number;
  rewards: Reward[];
  requirements?: Requirement[];
  interactionTypeId?: string;
  sourceSkillId?: string;
  targetSkillId?: string;
  health?: number;
  rate?: number;
};

export type SkillDefinition = {
  id: string;
  titleKey?: string;
  descriptionKey?: string;
  maxLevel: number;
  rate?: number;
  imprecision?: number;
};

export type ItemDefinition = {
  id: string;
  titleKey?: string;
  descriptionKey?: string;
};

export type InteractionTypeDefinition = {
  id: string;
  sourceSkillId: string;
  targetSkillId: string;
  targetPlayerHealth: boolean;
};

export type ContentBundle = {
  manifest: UniverseManifest;
  locations: LocationNode[];
  edges: TravelEdgeDefinition[];
  actions: GameAction[];
  skills: SkillDefinition[];
  items: ItemDefinition[];
  interactionTypes: InteractionTypeDefinition[];
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
};

export type ActionProgress = {
  elapsedMs: number;
  runningSince: number | null;
  targetHealth?: number | null;
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
  imprecision?: number;
};

export type SkillTotals = {
  base: number;
  added: number;
  increased: number;
  effectiveTotal: number;
  rate: number;
  imprecision: number;
};

export type ActionResolutionContext = {
  actions: GameAction[];
  skills: SkillDefinition[];
  interactionTypes: InteractionTypeDefinition[];
};

export type UniversePlayState = {
  universeId: string;
  currentLocationId: string;
  discoveredLocationIds: string[];
  activeAction: ActiveAction | null;
  actionProgress: Record<string, ActionProgress>;
  activeTravel: ActiveTravel | null;
  resources: Record<string, number>;
  skillXp: Record<string, number>;
  equipmentSkillBonuses: Record<string, SkillEquipmentBonuses>;
  actionLoopingEnabled: boolean;
  playerHealth: number;
  playerMaxHealth: number;
  chatMessages: ChatMessage[];
  lastTickAt: number;
};

export type ContributionDraft = {
  universeId: string;
  updatedAt: number;
  notes: string;
  locations: LocationNode[];
  edges: TravelEdgeDefinition[];
  actions: GameAction[];
  skills: SkillDefinition[];
  items: ItemDefinition[];
  interactionTypes: InteractionTypeDefinition[];
  locales: Record<string, LocaleDictionary>;
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
