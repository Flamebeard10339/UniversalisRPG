import { ActionResult } from './actionResult';
import { Condition, Reference } from './condition';
import { Choice, Dialogue, DialogueNode, TextSegment } from './dialogue';
import { Action, Entity, entitySchema } from './entity';
import { Item, itemSchema } from './item';
import { Location, locationSchema } from './location';
import { parseModule } from './module';
import { scopeEntity } from './scope';
import { Authored, hydrateSection } from './section';
import { Skill, skillSchema } from './skill';
import { Stat, statSchema } from './stat';
import { Test } from './test';

export class RuntimeError extends Error {}

export interface GameState {
  flags: Record<string, boolean | number>;
  inventory: Record<string, number>;
  location: string;
  visits: Record<string, number>;
  xp: Record<string, number>;
  log: string[];
}

export function createGameState(location = ''): GameState {
  return { flags: {}, inventory: {}, location, visits: {}, xp: {}, log: [] };
}

export interface Registry {
  entities: Map<string, Entity>;
  locations: Map<string, Location>;
  items: Map<string, Item>;
  stats: Map<string, Stat>;
  skills: Map<string, Skill>;
  dialogues: Map<string, Dialogue>;
  dialoguesByOwner: Map<string, Dialogue>;
  tests: Map<string, Test>;
}

export function loadModule(source: string): Registry {
  const registry: Registry = {
    entities: new Map(),
    locations: new Map(),
    items: new Map(),
    stats: new Map(),
    skills: new Map(),
    dialogues: new Map(),
    dialoguesByOwner: new Map(),
    tests: new Map(),
  };

  for (const section of parseModule(source)) {
    switch (section.kind) {
      case 'entity': {
        const entity = scopeEntity(hydrateSection(section.value as Authored<Entity>, entitySchema));
        registry.entities.set(entity.id, entity);
        break;
      }
      case 'location': {
        const location = hydrateSection(section.value as Authored<Location>, locationSchema);
        registry.locations.set(location.id, location);
        break;
      }
      case 'item': {
        const item = hydrateSection(section.value as Authored<Item>, itemSchema);
        registry.items.set(item.id, item);
        break;
      }
      case 'stat': {
        const stat = hydrateSection(section.value as Authored<Stat>, statSchema);
        registry.stats.set(stat.id, stat);
        break;
      }
      case 'skill': {
        const skill = hydrateSection(section.value as Authored<Skill>, skillSchema);
        registry.skills.set(skill.id, skill);
        break;
      }
      case 'dialogue': {
        const dialogue = section.value as Dialogue;
        registry.dialogues.set(dialogue.id, dialogue);
        if (dialogue.owner) registry.dialoguesByOwner.set(dialogue.owner, dialogue);
        break;
      }
      case 'test': {
        const test = section.value as Test;
        registry.tests.set(test.id, test);
        break;
      }
    }
  }
  return registry;
}

// References are flat dotted keys by convention, not nested lookups (see grammar.md
// "References") — the one exception the engine itself maintains is `<node-name>.visits`.
function resolveReference(reference: Reference, state: GameState): boolean | number | undefined {
  const { path } = reference;
  if (path.length === 2 && path[1] === 'visits') return state.visits[path[0]] ?? 0;
  return state.flags[path.join('.')];
}

function truthy(value: boolean | number | undefined): boolean {
  return value !== undefined && value !== false && value !== 0;
}

export function evaluateCondition(condition: Condition, state: GameState): boolean {
  switch (condition.kind) {
    case 'reference':
      return truthy(resolveReference(condition.reference, state));
    case 'comparison': {
      const left = resolveReference(condition.left, state);
      const value = typeof left === 'number' ? left : Number(left ?? 0);
      switch (condition.operator) {
        case '>':
          return value > condition.right;
        case '<':
          return value < condition.right;
        case '>=':
          return value >= condition.right;
        case '<=':
          return value <= condition.right;
        case '=':
          return value === condition.right;
      }
      break;
    }
    case 'not':
      return !evaluateCondition(condition.condition, state);
    case 'and':
      return condition.conditions.every((c) => evaluateCondition(c, state));
    case 'or':
      return condition.conditions.some((c) => evaluateCondition(c, state));
    case 'has':
      return (state.inventory[condition.item] ?? 0) >= condition.count;
  }
}

export function describeCondition(condition: Condition): string {
  switch (condition.kind) {
    case 'reference':
      return condition.reference.path.join('.');
    case 'comparison':
      return `${condition.left.path.join('.')} ${condition.operator} ${condition.right}`;
    case 'not':
      return `not ${describeCondition(condition.condition)}`;
    case 'and':
      return condition.conditions.map(describeCondition).join(' and ');
    case 'or':
      return condition.conditions.map(describeCondition).join(' or ');
    case 'has':
      return condition.count === 1 ? `has ${condition.item}` : `has ${condition.count} ${condition.item}`;
  }
}

export function applyResult(result: ActionResult, state: GameState): void {
  switch (result.kind) {
    case 'say':
      state.log.push(result.text);
      break;
    case 'set':
      state.flags[result.variable] = true;
      break;
    case 'unset':
      delete state.flags[result.variable];
      break;
    case 'give':
      state.inventory[result.item] = (state.inventory[result.item] ?? 0) + (result.amount ?? 1);
      break;
    case 'take':
      state.inventory[result.item] = (state.inventory[result.item] ?? 0) - (result.amount ?? 1);
      break;
    case 'xp':
      state.xp[result.skill] = (state.xp[result.skill] ?? 0) + result.amount;
      break;
    case 'relocate':
      state.location = result.location;
      break;
    case 'discover':
      state.flags[`${result.location}.discovered`] = true;
      break;
    case 'open-modal':
      state.log.push(`modal:${result.modal}`);
      break;
  }
}

export function renderSegments(segments: TextSegment[], state: GameState): string {
  return segments
    .map((segment) => {
      switch (segment.kind) {
        case 'literal':
          return segment.text;
        case 'interpolate':
          return String(resolveReference(segment.reference, state) ?? '');
        case 'conditional':
          return evaluateCondition(segment.condition, state) ? segment.text : '';
      }
    })
    .join('');
}

export interface DialogueSession {
  dialogue: Dialogue;
  node: DialogueNode;
  resumeIndex: number;
  replay: boolean;
  choices: Choice[] | null;
}

function findNode(dialogue: Dialogue, name: string): DialogueNode {
  const node = dialogue.nodes.find((n) => n.name === name);
  if (!node) throw new RuntimeError(`goto target not found: ${name} in dialogue ${dialogue.id}`);
  return node;
}

// A `menu` step hands control back for a choice; the node then resumes at the
// step after it, so a choice with no goto falls through to the rest of the node.
function runSteps(dialogue: Dialogue, node: DialogueNode, state: GameState, start: number, replay: boolean): DialogueSession {
  for (let i = start; i < node.steps.length; i++) {
    const step = node.steps[i];
    switch (step.kind) {
      case 'say':
        if (replay) state.log.push(renderSegments(step.segments, state));
        break;
      case 'effect':
        if (replay) applyResult(step.result, state);
        break;
      case 'goto':
        return enterNode(dialogue, findNode(dialogue, step.target), state);
      case 'menu':
        return { dialogue, node, resumeIndex: i + 1, replay, choices: step.choices };
    }
  }
  return { dialogue, node, resumeIndex: node.steps.length, replay, choices: null };
}

// On a revisit, only a `sticky` node replays its beats and effects; otherwise
// they fire once and later visits show `again` instead.
function enterNode(dialogue: Dialogue, node: DialogueNode, state: GameState): DialogueSession {
  const visit = (state.visits[node.name] = (state.visits[node.name] ?? 0) + 1);
  const replay = visit === 1 || node.sticky === true;
  if (!replay && node.again) state.log.push(renderSegments(node.again, state));
  return runSteps(dialogue, node, state, 0, replay);
}

export function talk(entityId: string, registry: Registry, state: GameState): DialogueSession {
  const dialogue = registry.dialoguesByOwner.get(entityId);
  if (!dialogue) throw new RuntimeError(`no dialogue owned by entity: ${entityId}`);

  let chosen: DialogueNode | undefined;
  for (const node of dialogue.nodes) {
    if (node.when && evaluateCondition(node.when, state)) chosen = node;
  }
  if (!chosen) throw new RuntimeError(`no reachable node in dialogue: ${dialogue.id}`);
  return enterNode(dialogue, chosen, state);
}

export function choose(text: string, session: DialogueSession, state: GameState): DialogueSession {
  if (!session.choices) throw new RuntimeError('no active menu to choose from');
  const match = session.choices.find((c) => (!c.when || evaluateCondition(c.when, state)) && renderSegments(c.segments, state) === text);
  if (!match) throw new RuntimeError(`no choice matches: ${JSON.stringify(text)}`);

  for (const effect of match.effects) applyResult(effect, state);
  if (match.goto) return enterNode(session.dialogue, findNode(session.dialogue, match.goto), state);
  return runSteps(session.dialogue, session.node, state, session.resumeIndex, session.replay);
}

function findActionOwner(obj: string, objId: string, registry: Registry): unknown {
  switch (obj) {
    case 'entity':
      return registry.entities.get(objId);
    case 'item':
      return registry.items.get(objId);
    case 'location':
      return registry.locations.get(objId);
    default:
      return undefined;
  }
}

export function useAction(obj: string, objId: string, actionId: string, registry: Registry, state: GameState): void {
  const target = findActionOwner(obj, objId, registry) as { actions?: Action[] } | undefined;
  if (!target) throw new RuntimeError(`unknown ${obj}: ${objId}`);

  const action = target.actions?.find((a) => a.label === actionId);
  if (!action) throw new RuntimeError(`unknown action ${JSON.stringify(actionId)} on ${obj}.${objId}`);
  if (action.requires && !evaluateCondition(action.requires, state)) throw new RuntimeError(`action requires unmet: ${obj}.${objId}.${actionId}`);
  if (action.hiddenIf && evaluateCondition(action.hiddenIf, state)) throw new RuntimeError(`action hidden: ${obj}.${objId}.${actionId}`);

  for (const result of action.results) applyResult(result, state);
  for (const result of action.onSuccess ?? []) applyResult(result, state);
}

export interface TestResult {
  passed: boolean;
  failure?: string;
}

export function runTest(testId: string, registry: Registry, state: GameState, stack: readonly string[] = []): TestResult {
  if (stack.includes(testId)) throw new RuntimeError(`cyclic test run: ${[...stack, testId].join(' -> ')}`);
  const test = registry.tests.get(testId);
  if (!test) throw new RuntimeError(`unknown test: ${testId}`);

  let session: DialogueSession | null = null;

  for (const directive of test.directives) {
    switch (directive.kind) {
      case 'run': {
        const result = runTest(directive.test, registry, state, [...stack, testId]);
        if (!result.passed) return result;
        break;
      }
      case 'talk':
        session = talk(directive.entity, registry, state);
        break;
      case 'choose':
        if (!session) throw new RuntimeError('choose with no active dialogue');
        session = choose(directive.text, session, state);
        break;
      case 'use':
        useAction(directive.obj, directive.objId, directive.actionId, registry, state);
        break;
      case 'travel':
        if (!registry.locations.has(directive.location)) throw new RuntimeError(`unknown location: ${directive.location}`);
        state.location = directive.location;
        break;
      case 'expect':
        if (!evaluateCondition(directive.condition, state)) return { passed: false, failure: describeCondition(directive.condition) };
        break;
    }
  }
  return { passed: true };
}
