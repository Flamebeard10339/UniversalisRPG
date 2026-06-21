import { createServer } from 'vite';
import fs from 'node:fs/promises';
import path from 'node:path';

const [command, runDirectoryArgument, inputFileArgument] = process.argv.slice(2);
if (!command || !runDirectoryArgument) {
  throw new Error('Usage: agent-run-controller.mjs <init|init-from-universe|set-plan|begin|apply-gm|choose|snapshot|export> <run-directory> [input-file|universe-id]');
}

const runDirectory = path.resolve(runDirectoryArgument);
const sessionPath = path.join(runDirectory, 'session.json');
const transcriptPath = path.join(runDirectory, 'transcript.jsonl');
const gmSnapshotPath = path.join(runDirectory, 'gm-snapshot.json');
const playerSnapshotPath = path.join(runDirectory, 'player-snapshot.json');
const planningSnapshotPath = path.join(runDirectory, 'planning-snapshot.json');
const planningPath = path.join(runDirectory, 'planning.md');
const projectRoot = process.cwd();
const vite = await createServer({
  configFile: false,
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true },
  appType: 'custom',
});

const timers = await vite.ssrLoadModule('/src/game/timers.ts');
const conditions = await vite.ssrLoadModule('/src/game/conditions.ts');
const validators = await vite.ssrLoadModule('/src/game/validators.ts');
const contentIds = await vite.ssrLoadModule('/src/game/contentIds.ts');
const agentSession = await vite.ssrLoadModule('/src/game/agentSession.ts');

const readJson = async (filePath) => JSON.parse(await fs.readFile(filePath, 'utf8'));
const writeJson = async (filePath, value) => {
  const temporaryPath = `${filePath}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.rename(temporaryPath, filePath);
};
const appendTranscript = async (session, actor, event, data) => {
  const entry = {
    runId: session.runId,
    turnId: `turn-${String(session.turnNumber).padStart(4, '0')}`,
    sequence: session.transcriptSequence,
    actor,
    event,
    virtualNow: session.virtualNow,
    data,
  };
  session.transcriptSequence += 1;
  await fs.appendFile(transcriptPath, `${JSON.stringify(entry)}\n`, 'utf8');
};

const canonicalFiles = (locales = ['en']) => [
  'locations.json',
  'edges.json',
  'actions.json',
  'skills.json',
  'items.json',
  'flags.json',
  'resources.json',
  'effects.json',
  'interaction-types.json',
  'enemies.json',
  ...locales.map((locale) => `locales/${locale}.json`),
];

const normalizeManifest = (bundle, id = bundle.manifest?.id) => {
  if (!bundle.manifest) return bundle;
  const locales = bundle.manifest.locales?.length ? bundle.manifest.locales : Object.keys(bundle.locales);
  return {
    ...bundle,
    manifest: {
      ...bundle.manifest,
      id,
      locales,
      files: canonicalFiles(locales),
    },
  };
};

const buildPlanningSnapshot = (session) => ({
  protocolVersion: 1,
  type: 'planning-snapshot',
  runId: session.runId,
  phase: session.phase,
  scenarioPath: 'agent-adventure/scenarios/derelict-extant-part-1.md',
  authoringReferencePath: 'agent-adventure/authoring-reference.json',
  outputPath: path.relative(projectRoot, planningPath).replaceAll('\\', '/'),
  requiredSections: [
    'Premise and player experience',
    'Milestones and exit conditions',
    'Action and narration design',
    'World and choice graph',
    'Resource budget',
    'First death arithmetic',
    'Death reset and persistence',
    'Part endpoint',
    'Risks and fallback routes',
  ],
  instructions: 'Write a concise Markdown plan. Show numeric resource arithmetic proving the first death can occur. Revise freely before the supervisor runs begin.',
  existingContent: buildContentIndex(session),
  humanFeedback: session.humanFeedback ?? null,
});

const contextFromBundle = (bundle) => ({
  manifest: bundle.manifest,
  actions: bundle.actions,
  skills: bundle.skills,
  locations: bundle.locations,
  items: bundle.items,
  flags: bundle.flags,
  resourceDefinitions: bundle.resourceDefinitions,
  effects: bundle.effects,
  interactionTypes: bundle.interactionTypes,
  enemies: bundle.enemies,
});

const localeText = (bundle, key, fallback = key) => bundle.locales.en?.[key] ?? fallback;
const visibleActions = (session) => session.bundle.actions
  .filter((action) => action.locationId === session.state.currentLocationId)
  .filter((action) => conditions.isActionVisible(session.state, action, contextFromBundle(session.bundle)));

const buildPlayerSnapshot = (session) => {
  const location = session.bundle.locations.find((candidate) => candidate.id === session.state.currentLocationId);
  const context = contextFromBundle(session.bundle);
  return {
    protocolVersion: 1,
    type: 'player-snapshot',
    turnId: `turn-${String(session.turnNumber).padStart(4, '0')}`,
    virtualNow: session.virtualNow,
    location: {
      id: location.id,
      title: localeText(session.bundle, location.titleKey ?? contentIds.locationTitleKey(location.id), location.id),
      description: localeText(session.bundle, location.descriptionKey ?? contentIds.locationDescriptionKey(location.id), ''),
    },
    narration: session.latestOutcome?.narration ?? [],
    resources: session.bundle.resourceDefinitions.map((resource) => {
      const pool = session.state.resourcePools[resource.id];
      const applicableEffects = session.bundle.effects.filter((effect) => effect.resourceId === resource.id && (effect.source === 'player' || effect.locationId === session.state.currentLocationId));
      return {
        id: resource.id,
        label: localeText(session.bundle, contentIds.resourceTitleKey(resource.id), resource.id),
        current: pool?.current ?? resource.initialValue ?? resource.baseMaxValue,
        min: pool?.min ?? resource.minValue,
        max: pool?.max ?? resource.baseMaxValue,
        ratePerMinute: session.state.activeAction
          ? applicableEffects.reduce((total, effect) => total + effect.ratePerMinute, 0)
          : 0,
      };
    }),
    inventory: Object.entries(session.state.inventory)
      .filter(([, quantity]) => quantity > 0)
      .map(([id, quantity]) => ({ id, label: localeText(session.bundle, contentIds.itemTitleKey(id), id), quantity })),
    actions: visibleActions(session).map((action) => ({
      id: action.id,
      title: localeText(session.bundle, action.titleKey ?? contentIds.actionTitleKey(action.id), action.id),
      description: localeText(session.bundle, action.descriptionKey ?? contentIds.actionDescriptionKey(action.id), ''),
      durationSeconds: action.durationSeconds,
      remainingCompletions: action.maxCompletions === undefined ? null : Math.max(0, action.maxCompletions - (session.state.actionCompletions[action.id] ?? 0)),
      enabled: conditions.canStartAction(session.state, action, context),
    })),
  };
};

const localizationWindow = (session, ids) => Object.fromEntries(
  Object.entries(session.bundle.locales.en ?? {}).filter(([key]) => ids.some((id) => key.includes(`.${id}.`) || key.endsWith(`.${id}`))),
);

const buildContentWindow = (session) => {
  if (!session.bundle || !session.state) return null;
  const locationId = session.state.currentLocationId;
  const actions = session.bundle.actions.filter((action) => action.locationId === locationId);
  const ids = [locationId, ...actions.map((action) => action.id)];
  return {
    location: session.bundle.locations.find((location) => location.id === locationId),
    actions,
    localizations: localizationWindow(session, ids),
  };
};

const buildContentIndex = (session) => session.bundle ? {
  revision: `r${session.contentRevision ?? 0}`,
  manifest: normalizeManifest(session.bundle).manifest,
  locations: session.bundle.locations.map(({ id, position, starting }) => ({ id, position, starting })),
  actions: session.bundle.actions.map(({ id, locationId }) => ({ id, locationId })),
  skills: session.bundle.skills.map(({ id }) => id),
  items: session.bundle.items.map(({ id }) => id),
  flags: session.bundle.flags,
  resources: session.bundle.resourceDefinitions,
  effects: session.bundle.effects,
  interactionTypes: session.bundle.interactionTypes.map(({ id }) => id),
  enemies: session.bundle.enemies.map(({ id }) => id),
} : null;

const buildGmSnapshot = (session) => ({
  protocolVersion: 1,
  type: 'gm-snapshot',
  turnId: `turn-${String(session.turnNumber).padStart(4, '0')}`,
  runId: session.runId,
  virtualNow: session.virtualNow,
  bootstrapRequired: !session.bundle,
  milestoneId: session.milestoneId,
  world: session.state ? {
    locationId: session.state.currentLocationId,
    inventory: session.state.inventory,
    resources: session.state.resourcePools,
    flags: session.state.flags,
    actionCompletions: session.state.actionCompletions,
    deathCount: session.state.deathCount,
  } : null,
  availableActionIds: session.state ? visibleActions(session).filter((action) => conditions.canStartAction(session.state, action, contextFromBundle(session.bundle))).map((action) => action.id) : [],
  latestOutcome: session.latestOutcome,
  playerFeedback: session.lastPlayerFeedback,
  validationIssues: session.validationIssues,
  capabilities: {
    instantVirtualTime: true,
    finiteInventory: true,
    finiteActions: true,
    recursiveConditions: true,
    actionRelocation: true,
    deathPersistence: true,
  },
  approvedPlan: session.plan ?? null,
  contentWindow: buildContentWindow(session),
  contentIndex: buildContentIndex(session),
  canonicalDraftPath: path.relative(projectRoot, sessionPath).replaceAll('\\', '/'),
  authoringReferencePath: 'agent-adventure/authoring-reference.json',
});

const writeSnapshots = async (session, includePlayer = false) => {
  await writeJson(gmSnapshotPath, buildGmSnapshot(session));
  if (includePlayer && session.bundle && session.state) {
    await writeJson(playerSnapshotPath, buildPlayerSnapshot(session));
  }
};

const contentProperty = {
  locations: 'locations',
  edges: 'edges',
  actions: 'actions',
  skills: 'skills',
  items: 'items',
  flags: 'flags',
  resources: 'resourceDefinitions',
  effects: 'effects',
  'interaction-types': 'interactionTypes',
  enemies: 'enemies',
};

const applyOperations = (originalBundle, operations) => {
  let bundle = originalBundle ? structuredClone(originalBundle) : {
    manifest: null,
    locations: [], edges: [], actions: [], skills: [], items: [], flags: [],
    resourceDefinitions: [], effects: [], interactionTypes: [], enemies: [], locales: {},
  };
  for (const operation of operations) {
    if (operation.op === 'set-manifest') {
      bundle.manifest = structuredClone(operation.value);
    } else if (operation.op === 'set-death-reset') {
      if (!bundle.manifest) throw new Error('set-death-reset requires a manifest');
      bundle.manifest.deathReset = structuredClone(operation.value);
    } else if (operation.op === 'localize') {
      bundle.locales[operation.locale] = { ...(bundle.locales[operation.locale] ?? {}), ...operation.values };
    } else {
      const property = contentProperty[operation.contentType];
      if (!property) throw new Error(`Unsupported content type: ${operation.contentType}`);
      if (operation.op === 'upsert') {
        const index = bundle[property].findIndex((value) => value.id === operation.value.id);
        if (index >= 0) bundle[property][index] = structuredClone(operation.value);
        else bundle[property].push(structuredClone(operation.value));
      } else if (operation.op === 'remove') {
        bundle[property] = bundle[property].filter((value) => value.id !== operation.id);
      } else {
        throw new Error(`Unsupported operation: ${operation.op}`);
      }
    }
  }
  return normalizeManifest(bundle);
};

const designWarnings = (bundle) => {
  const warnings = [];
  if (bundle.manifest.deathReset) {
    const deathResources = bundle.resourceDefinitions.filter((resource) => resource.onEmpty?.some((behavior) => behavior.kind === 'death-reset'));
    if (deathResources.length === 0) {
      warnings.push({ severity: 'warning', path: 'resources.json', message: 'agent.validation.deathResetHasNoResourceBoundary' });
    }
    for (const resource of deathResources) {
      const hasNegativeEffect = bundle.effects.some((effect) => effect.resourceId === resource.id && effect.ratePerMinute < 0);
      const hasNegativeResult = bundle.actions.some((action) => action.results?.some((result) => result.kind === 'resource' && result.resourceId === resource.id && result.amount < 0));
      if (!hasNegativeEffect && !hasNegativeResult) {
        warnings.push({ severity: 'warning', path: `resources.${resource.id}`, message: 'agent.validation.deathResourceHasNoDrain' });
      }
    }
  }
  return warnings;
};

const validatePlan = (text) => {
  const required = ['## Milestones', '## Action and Narration Design', '## Resource Budget', '## First Death Arithmetic', '## Death Reset', '## Part Endpoint'];
  const missing = required.filter((heading) => !text.toLowerCase().includes(heading.toLowerCase()));
  if (missing.length > 0) throw new Error(`Plan is missing required headings: ${missing.join(', ')}`);
  if (!/\d+(?:\s*[-+]\s*\d+)+\s*=\s*\d+/.test(text)) throw new Error('Plan must include explicit numeric resource arithmetic, for example 100 - 30 = 70');
};

const exportBundle = async (bundle, universeId) => {
  const normalized = normalizeManifest(structuredClone(bundle), universeId);
  const destination = path.join(projectRoot, 'public', 'content', 'universes', universeId);
  await fs.mkdir(path.join(destination, 'locales'), { recursive: true });
  const files = {
    'universe.json': normalized.manifest,
    'locations.json': normalized.locations,
    'edges.json': normalized.edges,
    'actions.json': normalized.actions,
    'skills.json': normalized.skills,
    'items.json': normalized.items,
    'flags.json': normalized.flags,
    'resources.json': normalized.resourceDefinitions,
    'effects.json': normalized.effects,
    'interaction-types.json': normalized.interactionTypes,
    'enemies.json': normalized.enemies,
  };
  for (const [name, value] of Object.entries(files)) await writeJson(path.join(destination, name), value);
  for (const locale of normalized.manifest.locales) await writeJson(path.join(destination, 'locales', `${locale}.json`), normalized.locales[locale] ?? {});
  const feedbackPath = path.join(destination, 'PLAYTEST.md');
  try {
    await fs.access(feedbackPath);
  } catch {
    await fs.writeFile(feedbackPath, '# Playtest Feedback\n\n## What Worked\n\n## Bugs or Confusion\n\n## Desired Edits\n', 'utf8');
  }
  const indexPath = path.join(projectRoot, 'public', 'content', 'universes', 'index.json');
  const index = await readJson(indexPath);
  if (!index.includes(universeId)) {
    index.push(universeId);
    await writeJson(indexPath, index);
  }
  return { destination, bundle: normalized, feedbackPath };
};

const loadExportedUniverse = async (universeId) => {
  const directory = path.join(projectRoot, 'public', 'content', 'universes', universeId);
  const manifest = await readJson(path.join(directory, 'universe.json'));
  const optional = async (name) => {
    try {
      return await readJson(path.join(directory, name));
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  };
  const locales = {};
  for (const locale of manifest.locales ?? ['en']) locales[locale] = await readJson(path.join(directory, 'locales', `${locale}.json`));
  return normalizeManifest({
    manifest,
    locations: await optional('locations.json'),
    edges: await optional('edges.json'),
    actions: await optional('actions.json'),
    skills: await optional('skills.json'),
    items: await optional('items.json'),
    flags: await optional('flags.json'),
    resourceDefinitions: await optional('resources.json'),
    effects: await optional('effects.json'),
    interactionTypes: await optional('interaction-types.json'),
    enemies: await optional('enemies.json'),
    locales,
  });
};

const validateGmMessage = (message, turnId) => {
  if (message.protocolVersion !== 1 || message.type !== 'gm-update' || message.turnId !== turnId) throw new Error('Invalid or stale GM envelope');
  if (!['continue', 'part-complete', 'blocked'].includes(message.runStatus)) throw new Error('Invalid GM runStatus');
  if (!Array.isArray(message.operations) || !Array.isArray(message.capabilityRequests)) throw new Error('Invalid GM arrays');
};
const validatePlayerMessage = (message, turnId) => {
  if (message.protocolVersion !== 1 || message.type !== 'player-choice' || message.turnId !== turnId) throw new Error('Invalid or stale player envelope');
  if (!message.feedback || !Array.isArray(message.feedback.expectedActions) || message.feedback.expectedActions.length > 3) throw new Error('Invalid player feedback');
};

const diffState = (before, after) => ({
  location: before.currentLocationId === after.currentLocationId ? undefined : { from: before.currentLocationId, to: after.currentLocationId },
  inventory: Object.fromEntries(new Set([...Object.keys(before.inventory), ...Object.keys(after.inventory)]).values().map((id) => [id, { before: before.inventory[id] ?? 0, after: after.inventory[id] ?? 0 }]).filter(([, value]) => value.before !== value.after)),
  resources: Object.fromEntries(new Set([...Object.keys(before.resourcePools), ...Object.keys(after.resourcePools)]).values().map((id) => [id, { before: before.resourcePools[id]?.current, after: after.resourcePools[id]?.current }]).filter(([, value]) => value.before !== value.after)),
  flags: Object.fromEntries(new Set([...Object.keys(before.flags), ...Object.keys(after.flags)]).values().map((id) => [id, { before: before.flags[id] ?? false, after: after.flags[id] ?? false }]).filter(([, value]) => value.before !== value.after)),
  deathCount: before.deathCount === after.deathCount ? undefined : { before: before.deathCount, after: after.deathCount },
});

try {
  if (command === 'init' || command === 'init-from-universe') {
    await fs.mkdir(runDirectory, { recursive: true });
    const seed = command === 'init' ? Number(inputFileArgument ?? 1731) >>> 0 : 1731;
    const sourceUniverseId = command === 'init-from-universe' ? inputFileArgument : null;
    if (command === 'init-from-universe' && !sourceUniverseId) throw new Error('init-from-universe requires a universe id');
    const initialBundle = sourceUniverseId ? await loadExportedUniverse(sourceUniverseId) : null;
    let humanFeedback = null;
    if (sourceUniverseId) {
      try {
        humanFeedback = await fs.readFile(path.join(projectRoot, 'public', 'content', 'universes', sourceUniverseId, 'PLAYTEST.md'), 'utf8');
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    const session = {
      protocolVersion: 1,
      runId: `derelict-extant-part-1-${new Date().toISOString().replace(/[:.]/g, '-')}`,
      turnNumber: 1,
      virtualNow: 0,
      rngState: seed,
      randomSeed: seed,
      transcriptSequence: 1,
      milestoneId: 'bootstrap',
      status: 'running',
      bundle: initialBundle,
      state: null,
      latestOutcome: null,
      lastPlayerFeedback: null,
      validationIssues: [],
      phase: 'planning',
      plan: null,
      sourceUniverseId,
      contentRevision: initialBundle ? 1 : 0,
      humanFeedback,
    };
    await fs.writeFile(transcriptPath, '', 'utf8');
    await appendTranscript(session, 'controller', 'run.start', { seed, simulationMode: 'instant-virtual-time' });
    await writeJson(sessionPath, session);
    await writeJson(planningSnapshotPath, buildPlanningSnapshot(session));
    process.stdout.write(`${JSON.stringify(buildPlanningSnapshot(session), null, 2)}\n`);
  } else if (command === 'set-plan') {
    const session = await readJson(sessionPath);
    const plan = await fs.readFile(path.resolve(inputFileArgument), 'utf8');
    validatePlan(plan);
    session.plan = plan;
    session.phase = 'plan-review';
    session.status = 'plan-review';
    await fs.writeFile(planningPath, plan, 'utf8');
    await appendTranscript(session, 'gm', 'plan.submitted', { path: path.relative(projectRoot, planningPath) });
    await writeJson(sessionPath, session);
    process.stdout.write(`${JSON.stringify({ accepted: true, phase: session.phase, planningPath }, null, 2)}\n`);
  } else if (command === 'begin') {
    const session = await readJson(sessionPath);
    const plan = await fs.readFile(planningPath, 'utf8');
    validatePlan(plan);
    session.plan = plan;
    session.phase = 'play';
    session.status = 'running';
    await appendTranscript(session, 'controller', 'plan.approved', { path: path.relative(projectRoot, planningPath) });
    await writeJson(sessionPath, session);
    await writeSnapshots(session);
    process.stdout.write(`${JSON.stringify(buildGmSnapshot(session), null, 2)}\n`);
  } else if (command === 'apply-gm') {
    const session = await readJson(sessionPath);
    if (session.phase && session.phase !== 'play') throw new Error('Approve the planning phase with begin before applying GM turns');
    const message = await readJson(path.resolve(inputFileArgument));
    const turnId = `turn-${String(session.turnNumber).padStart(4, '0')}`;
    validateGmMessage(message, turnId);
    await appendTranscript(session, 'gm', 'gm.update.received', message);
    const candidate = applyOperations(session.bundle, message.operations);
    const issues = candidate.manifest ? [...validators.validateContentBundle(candidate), ...designWarnings(candidate)] : [{ severity: 'error', path: 'universe.json', message: 'validation.universeManifestMissing' }];
    const errors = issues.filter((issue) => issue.severity === 'error');
    if (errors.length > 0) {
      session.validationIssues = issues;
      await appendTranscript(session, 'controller', 'gm.update.rejected', { issues });
      await writeJson(sessionPath, session);
      await writeSnapshots(session);
      process.stdout.write(`${JSON.stringify({ accepted: false, issues }, null, 2)}\n`);
      process.exitCode = 2;
    } else {
      session.bundle = candidate;
      session.contentRevision = (session.contentRevision ?? 0) + 1;
      session.validationIssues = issues;
      session.milestoneId = message.milestoneId;
      session.status = message.runStatus;
      if (!session.state) {
        const startingLocation = candidate.locations.find((location) => location.starting)?.id;
        session.state = timers.createInitialPlayState(session.runId, startingLocation);
        session.state.runId = session.runId;
        session.state.lastTickAt = session.virtualNow;
      }
      session.state = timers.resolveIdleTimers(session.state, contextFromBundle(candidate), {}, session.virtualNow).state;
      await appendTranscript(session, 'controller', 'gm.update.accepted', { milestoneId: message.milestoneId, runStatus: message.runStatus, warningCount: issues.length });
      await writeJson(sessionPath, session);
      await writeSnapshots(session, message.runStatus === 'continue');
      process.stdout.write(`${JSON.stringify({ accepted: true, status: message.runStatus, playerSnapshot: message.runStatus === 'continue' ? buildPlayerSnapshot(session) : null, warnings: issues }, null, 2)}\n`);
    }
  } else if (command === 'choose') {
    const session = await readJson(sessionPath);
    const message = await readJson(path.resolve(inputFileArgument));
    const turnId = `turn-${String(session.turnNumber).padStart(4, '0')}`;
    validatePlayerMessage(message, turnId);
    const snapshot = buildPlayerSnapshot(session);
    const offered = snapshot.actions.find((action) => action.id === message.actionId && action.enabled);
    if (!offered) throw new Error(`Action is not currently enabled: ${message.actionId}`);
    const action = session.bundle.actions.find((candidate) => candidate.id === message.actionId);
    session.state = agentSession.recordAgentSessionMessage(session.state, message, session.virtualNow);
    session.lastPlayerFeedback = message.feedback;
    await appendTranscript(session, 'player', 'player.choice', message);
    const before = structuredClone(session.state);
    const chatStart = session.state.chatMessages.length;
    const context = contextFromBundle(session.bundle);
    session.state.actionLoopingEnabled = false;
    session.state = timers.startAction(session.state, action, context, session.virtualNow);
    let boundaries = 0;
    const random = () => {
      session.rngState = (Math.imul(1664525, session.rngState) + 1013904223) >>> 0;
      const value = session.rngState / 0x100000000;
      return value;
    };
    while (session.state.activeAction) {
      if (boundaries >= 10000) throw new Error('Internal boundary limit exceeded');
      const active = session.state.activeAction;
      const nextBoundary = Math.min(active.completesAt, active.enemyAttackCompletesAt ?? Number.POSITIVE_INFINITY);
      if (!Number.isFinite(nextBoundary) || nextBoundary < session.virtualNow) throw new Error('Invalid virtual boundary');
      await appendTranscript(session, 'controller', 'virtual-time.advance', { from: session.virtualNow, to: nextBoundary, actionId: action.id });
      session.virtualNow = nextBoundary;
      session.state = timers.resolveIdleTimers(session.state, context, { random }, session.virtualNow).state;
      boundaries += 1;
    }
    const newMessages = session.state.chatMessages.slice(chatStart);
    const narration = newMessages.filter((entry) => entry.author === 'system').map((entry) => entry.text ?? localeText(session.bundle, entry.key, entry.key));
    session.latestOutcome = {
      actionId: action.id,
      outcome: session.state.deathCount > before.deathCount ? 'death' : 'completed',
      durationMs: session.virtualNow - before.lastTickAt,
      narration,
      stateDelta: diffState(before, session.state),
      internalBoundaries: boundaries,
    };
    await appendTranscript(session, 'engine', 'action.resolved', session.latestOutcome);
    session.turnNumber += 1;
    await writeJson(sessionPath, session);
    await writeSnapshots(session);
    process.stdout.write(`${JSON.stringify({ accepted: true, outcome: session.latestOutcome, gmSnapshot: buildGmSnapshot(session) }, null, 2)}\n`);
  } else if (command === 'snapshot') {
    const session = await readJson(sessionPath);
    await writeSnapshots(session, Boolean(session.bundle && session.state));
    process.stdout.write(`${JSON.stringify({ gmSnapshot: buildGmSnapshot(session), playerSnapshot: session.bundle && session.state ? buildPlayerSnapshot(session) : null }, null, 2)}\n`);
  } else if (command === 'export') {
    const session = await readJson(sessionPath);
    if (!session.bundle) throw new Error('No accepted universe draft is available to export');
    const universeId = inputFileArgument ?? session.bundle.manifest.id;
    const issues = validators.validateContentBundle(normalizeManifest(session.bundle, universeId));
    const errors = issues.filter((issue) => issue.severity === 'error');
    if (errors.length > 0) throw new Error(`Cannot export invalid universe: ${JSON.stringify(errors)}`);
    const result = await exportBundle(session.bundle, universeId);
    await appendTranscript(session, 'controller', 'draft.exported', { universeId, destination: result.destination });
    await writeJson(sessionPath, session);
    process.stdout.write(`${JSON.stringify({ exported: true, universeId, destination: result.destination, feedbackPath: result.feedbackPath, warnings: [...issues, ...designWarnings(result.bundle)] }, null, 2)}\n`);
  } else {
    throw new Error(`Unknown command: ${command}`);
  }
} finally {
  await vite.close();
}
