import { Condition, condition } from "../../grammar/condition";
import { DslError, parseWhole } from "../../grammar/parser";
import { moduleLocalId } from "../../grammar/section";
import { hasBlock } from "../../grammar/structure";
import {
  Direction,
  DIRECTIONS,
  Hex,
  hexKey,
  parseHexKey,
  PlaneNode,
} from "../hex";

import { section } from "./define";
import {
  condition as visitCondition,
  put,
  putCarried,
  type Visit,
} from "../refs";
import { isActionOwnerKind } from "./define";
import { ACTION_MEMBER, memberKey } from "../namespace";
import { lastSegment } from "../../grammar/values";

export type Directive =
  | { kind: "run"; test: string }
  | { kind: "talk"; entity: string }
  | { kind: "choose"; text: string }
  | { kind: "use"; obj: string; objId: string; actionId: string }
  // The two-sided spelling, beside the form it does not replace: an action
  // brought by the player and applied to what it names.
  | { kind: "use-on"; action: string; target: string }
  | { kind: "travel"; location: string }
  // Standing somewhere at once, which is what a walk arrives at with the walk
  // taken out of it. Beside `travel:` rather than a flag on it: one crosses the
  // roads and spends the time, the other does neither, and a line a session
  // records has to say which of the two happened.
  | { kind: "goto"; location: string }
  | { kind: "craft"; recipe: string }
  | {
      kind: "begin";
      inner: Extract<
        Directive,
        { kind: "use" | "use-on" | "travel" | "craft" }
      >;
    }
  | { kind: "assert"; condition: Condition }
  | { kind: "expect"; save: string }
  | { kind: "load"; save: string }
  | { kind: "cancel" }
  | { kind: "wait"; seconds: number }
  | { kind: "equip"; item: string }
  | { kind: "unequip"; slot: string }
  // The four ways an item grows, one verb each rather than one verb reading
  // what the consumed item declares: allocation consumes nothing, and the
  // three that do consume take different addresses, so a single verb would
  // have to decide which of its arguments were required after parsing them.
  | { kind: "feed"; target: string; food: string }
  | {
      kind: "slot";
      target: string;
      hex: Hex;
      direction: Direction;
      jewel: string;
    }
  | { kind: "allocate"; target: string; node: PlaneNode }
  | { kind: "apply"; target: string; hex: Hex; effect: string }
  // A growth refused is the outcome under test, so it is written rather than
  // inferred from a state that did not move. Only growth verbs may be wrapped:
  // their refusal is a value the one door returns, where every other verb
  // pushes a sentence into the log and leaves nothing to invert.
  | { kind: "refuse"; inner: GrowthDirective }
  // Raising a screen and answering one of its options, so a route through a
  // modal is a recorded line rather than a driver's private gesture. The name
  // is the engine's, not a section's, which is why nothing below resolves it.
  | { kind: "open-modal"; modal: string }
  | { kind: "submit-modal"; key: string; value: string };

export type GrowthDirective = Extract<
  Directive,
  { kind: "feed" | "slot" | "allocate" | "apply" }
>;

export interface Test {
  id: string;
  directives: Directive[];
}

// Factored out so `begin:` can take the same payload with the verb inline.
const PATH = "[a-z][a-z0-9-]*(?:\\.[a-z][a-z0-9-]*)*";
const SLUG = "[a-z0-9][a-z0-9-]*";
const USE_PAYLOAD = `(?<obj>[a-z][a-z0-9-]*)\\.(?<objId>${PATH})\\.(?<actionId>${SLUG})`;
const USE_ON_PAYLOAD = `(?<action>${PATH})[ \\t]+on[ \\t]+(?<target>${PATH})`;
const TRAVEL_PAYLOAD = `(?<id>${PATH})`;
const CRAFT_PAYLOAD = `(?<id>${PATH})`;

const RUN = new RegExp(`^run:[ \\t]*(?<id>${PATH})$`);
const TALK = new RegExp(`^talk:[ \\t]*(?<id>${PATH})$`);
const CHOOSE = /^choose:[ \t]*(?<text>.*)$/;
const USE_VERB = "use:";
const USE = new RegExp(`^${USE_VERB}[ \\t]*${USE_PAYLOAD}$`);
const USE_ON = new RegExp(`^${USE_VERB}[ \\t]*${USE_ON_PAYLOAD}$`);
const TRAVEL = new RegExp(`^travel:[ \\t]*${TRAVEL_PAYLOAD}$`);
const GOTO = new RegExp(`^goto:[ \\t]*${TRAVEL_PAYLOAD}$`);
const CRAFT = new RegExp(`^craft:[ \\t]*${CRAFT_PAYLOAD}$`);
const BEGIN = /^begin:[ \t]*(?<verb>use|travel|craft)[ \t]+(?<rest>.+)$/;
const BEGIN_USE = new RegExp(`^${USE_PAYLOAD}$`);
const BEGIN_USE_ON = new RegExp(`^${USE_ON_PAYLOAD}$`);
const BEGIN_TRAVEL = new RegExp(`^${TRAVEL_PAYLOAD}$`);
const BEGIN_CRAFT = new RegExp(`^${CRAFT_PAYLOAD}$`);
const ASSERT = /^assert:[ \t]*(?<cond>.+)$/;
const EXPECT = new RegExp(`^expect:[ \\t]*(?<id>${PATH})$`);
const LOAD = new RegExp(`^load:[ \\t]*(?<id>${PATH})$`);
const CANCEL = /^cancel$/;
const WAIT = /^wait:[ \t]*(?<seconds>\d+(?:\.\d+)?)$/;
// What the player carries is named either by an item id or by the id minting
// gave one grown copy, and a minted id is a bare number, so the two spellings
// never overlap and no site has to be told which one it was handed.
const CARRIED = `(?:${PATH}|[0-9]+)`;
const HEX = "-?\\d+,-?\\d+";
const DIRECTION = [...DIRECTIONS].sort((a, b) => b.length - a.length).join("|");

const EQUIP = new RegExp(`^equip:[ \\t]*(?<item>${CARRIED})$`);
const UNEQUIP = new RegExp(`^unequip:[ \\t]*(?<slot>${PATH})$`);

// Factored out so `refuse:` takes the same payloads with the verb inline, the
// way `begin:` already does.
const GROWTH_PAYLOAD = {
  feed: `(?<target>${CARRIED})[ \\t]+with[ \\t]+(?<food>${PATH})`,
  slot: `(?<target>${CARRIED})[ \\t]+at[ \\t]+(?<hex>${HEX})[ \\t]+(?<direction>${DIRECTION})[ \\t]+with[ \\t]+(?<jewel>${PATH})`,
  allocate: `(?<target>${CARRIED})[ \\t]+at[ \\t]+(?<hex>${HEX})[ \\t]+(?:position[ \\t]+(?<position>[0-9]+)|slot[ \\t]+(?<direction>${DIRECTION}))`,
  apply: `(?<target>${CARRIED})[ \\t]+at[ \\t]+(?<hex>${HEX})[ \\t]+with[ \\t]+(?<effect>${PATH})`,
} as const;

type GrowthVerb = GrowthDirective["kind"];
const GROWTH_VERBS = Object.keys(GROWTH_PAYLOAD) as GrowthVerb[];

const GROWTH_LINE = new Map(
  GROWTH_VERBS.map((verb) => [
    verb,
    new RegExp(`^${verb}:[ \\t]*${GROWTH_PAYLOAD[verb]}$`),
  ]),
);
const GROWTH_INLINE = new Map(
  GROWTH_VERBS.map((verb) => [verb, new RegExp(`^${GROWTH_PAYLOAD[verb]}$`)]),
);
const GROWTH_VERB = new RegExp(`^(?<verb>${GROWTH_VERBS.join("|")}):`);
const REFUSE_VERB = /^refuse:/;
const REFUSE = new RegExp(
  `^refuse:[ \\t]*(?<verb>${GROWTH_VERBS.join("|")})[ \\t]+(?<rest>.+)$`,
);

const GROWTH_FORM: Readonly<Record<GrowthVerb, string>> = {
  feed: "<target> with <item>",
  slot: "<target> at <q>,<r> <direction> with <jewel item>",
  allocate:
    "<target> at <q>,<r> position <n>, or <target> at <q>,<r> slot <direction>",
  apply: "<target> at <q>,<r> with <effect item>",
};

export function isGrowthDirective(value: Directive): value is GrowthDirective {
  return (GROWTH_VERBS as string[]).includes(value.kind);
}

export type UseDirective = Extract<Directive, { kind: "use" }>;

// The one shape a `use:` payload takes, whether an author writes it as a
// directive or the runtime offers it as a choice id: the kind, the object under
// it, and the action's address under that. Written and read back here, so the
// two are the same string by construction rather than by two regexes that
// happen to agree.
export const usePayload = (value: UseDirective): string =>
  `${value.obj}.${value.objId}.${value.actionId}`;

export function parseUsePayload(payload: string): UseDirective | null {
  const groups = BEGIN_USE.exec(payload)?.groups;
  return groups
    ? {
        kind: "use",
        obj: groups.obj,
        objId: groups.objId,
        actionId: groups.actionId,
      }
    : null;
}

export const useChoiceId = (value: UseDirective): string =>
  `${USE_VERB}${usePayload(value)}`;

export const parseUseChoiceId = (choiceId: string): UseDirective | null =>
  choiceId.startsWith(USE_VERB)
    ? parseUsePayload(choiceId.slice(USE_VERB.length))
    : null;

type Groups = Record<string, string | undefined>;

function growth(
  verb: GrowthVerb,
  text: string,
  groups: Groups,
): GrowthDirective {
  const target = groups.target as string;
  if (verb === "feed")
    return { kind: "feed", target, food: groups.food as string };

  const hex = parseHexKey(groups.hex as string);
  if (!hex)
    throw new DslError(
      `malformed hex address (expected <q>,<r> with no leading zeroes): ${text}`,
    );
  const direction = groups.direction as Direction;

  if (verb === "slot")
    return {
      kind: "slot",
      target,
      hex,
      direction,
      jewel: groups.jewel as string,
    };
  if (verb === "apply")
    return { kind: "apply", target, hex, effect: groups.effect as string };
  const node: PlaneNode =
    groups.position === undefined
      ? { hex, kind: "slot", direction }
      : { hex, kind: "position", position: Number(groups.position) };
  return { kind: "allocate", target, node };
}

function parseGrowth(
  verb: GrowthVerb,
  pattern: Map<GrowthVerb, RegExp>,
  payload: string,
  text: string,
): GrowthDirective {
  const groups = pattern.get(verb)!.exec(payload)?.groups;
  if (!groups)
    throw new DslError(
      `malformed ${verb}: payload (expected ${GROWTH_FORM[verb]}): ${text}`,
    );
  return growth(verb, text, groups);
}
const OPEN_MODAL = new RegExp(`^open-modal:[ \\t]*(?<name>${PATH})$`);
const SUBMIT_MODAL_VERB = /^submit-modal:/;
// One pair per line, the value running to the end of it, so an answer may hold
// the spaces and punctuation a dialogue line is written with.
const SUBMIT_MODAL =
  /^submit-modal:[ \t]*(?<key>[a-z][a-z0-9-]*)=(?<value>.*)$/;

function parseBegin(text: string, verb: string, rest: string): Directive {
  if (verb === "use") {
    const inner = parseUsePayload(rest);
    if (inner) return { kind: "begin", inner };
    const on = BEGIN_USE_ON.exec(rest)?.groups;
    if (!on)
      throw new DslError(
        `malformed begin: use payload (expected obj.objId.actionId, or <action> on <target>): ${text}`,
      );
    return {
      kind: "begin",
      inner: { kind: "use-on", action: on.action, target: on.target },
    };
  }
  if (verb === "travel") {
    const m = BEGIN_TRAVEL.exec(rest)?.groups;
    if (!m)
      throw new DslError(
        `malformed begin: travel payload (expected a location id): ${text}`,
      );
    return { kind: "begin", inner: { kind: "travel", location: m.id } };
  }
  if (verb === "craft") {
    const m = BEGIN_CRAFT.exec(rest)?.groups;
    if (!m)
      throw new DslError(
        `malformed begin: craft payload (expected a recipe id): ${text}`,
      );
    return { kind: "begin", inner: { kind: "craft", recipe: m.id } };
  }
  throw new DslError(
    `unknown begin: verb (expected use, travel, or craft): ${text}`,
  );
}

// The sole parser for directive lines, shared by the section below and the CLI.
export function parseDirectiveLine(text: string): Directive | null {
  const run = RUN.exec(text)?.groups;
  if (run) return { kind: "run", test: run.id };

  const talk = TALK.exec(text)?.groups;
  if (talk) return { kind: "talk", entity: talk.id };

  const choose = CHOOSE.exec(text)?.groups;
  if (choose) return { kind: "choose", text: choose.text };

  // The two readings are disjoint rather than ranked: an action is addressed by
  // a slug, which holds no space, and the two-sided form is spelled with one.
  const use = USE.exec(text)?.groups;
  if (use)
    return {
      kind: "use",
      obj: use.obj,
      objId: use.objId,
      actionId: use.actionId,
    };
  const useOn = USE_ON.exec(text)?.groups;
  if (useOn)
    return { kind: "use-on", action: useOn.action, target: useOn.target };

  const travel = TRAVEL.exec(text)?.groups;
  if (travel) return { kind: "travel", location: travel.id };

  const goingTo = GOTO.exec(text)?.groups;
  if (goingTo) return { kind: "goto", location: goingTo.id };

  const craft = CRAFT.exec(text)?.groups;
  if (craft) return { kind: "craft", recipe: craft.id };

  const begin = BEGIN.exec(text)?.groups;
  if (begin) return parseBegin(text, begin.verb, begin.rest);

  const assert = ASSERT.exec(text)?.groups;
  if (assert)
    return {
      kind: "assert",
      condition: parseWhole(condition, assert.cond, 0, "an assert condition"),
    };

  const expect = EXPECT.exec(text)?.groups;
  if (expect) return { kind: "expect", save: expect.id };

  const load = LOAD.exec(text)?.groups;
  if (load) return { kind: "load", save: load.id };

  if (CANCEL.test(text)) return { kind: "cancel" };

  const wait = WAIT.exec(text)?.groups;
  if (wait) return { kind: "wait", seconds: Number(wait.seconds) };

  const equip = EQUIP.exec(text)?.groups;
  if (equip) return { kind: "equip", item: equip.item };

  const unequip = UNEQUIP.exec(text)?.groups;
  if (unequip) return { kind: "unequip", slot: unequip.slot };

  const growing = GROWTH_VERB.exec(text)?.groups;
  if (growing)
    return parseGrowth(growing.verb as GrowthVerb, GROWTH_LINE, text, text);

  if (REFUSE_VERB.test(text)) {
    const refuse = REFUSE.exec(text)?.groups;
    if (!refuse)
      throw new DslError(
        `unknown refuse: verb (expected one of ${GROWTH_VERBS.join(", ")}): ${text}`,
      );
    return {
      kind: "refuse",
      inner: parseGrowth(
        refuse.verb as GrowthVerb,
        GROWTH_INLINE,
        refuse.rest,
        text,
      ),
    };
  }

  const opening = OPEN_MODAL.exec(text)?.groups;
  if (opening) return { kind: "open-modal", modal: opening.name };

  if (SUBMIT_MODAL_VERB.test(text)) {
    const submit = SUBMIT_MODAL.exec(text)?.groups;
    if (!submit)
      throw new DslError(
        `malformed submit-modal: payload (expected <key>=<value>): ${text}`,
      );
    return { kind: "submit-modal", key: submit.key, value: submit.value };
  }

  return null;
}

// The verb, then whatever that verb's own line carries after its colon — the
// shape `begin:` and `refuse:` both take their inner directive in.
function inlined(inner: Directive, verb = inner.kind): string {
  return `${verb} ${printDirective(inner).replace(/^[a-z-]+:[ \t]*/, "")}`;
}

export function printDirective(value: Directive): string {
  switch (value.kind) {
    case "run":
      return `run: ${value.test}`;
    case "talk":
      return `talk: ${value.entity}`;
    case "choose":
      return `choose: ${value.text}`;
    case "use":
      return `use: ${usePayload(value)}`;
    case "use-on":
      return `use: ${value.action} on ${value.target}`;
    case "travel":
      return `travel: ${value.location}`;
    case "goto":
      return `goto: ${value.location}`;
    case "craft":
      return `craft: ${value.recipe}`;
    case "begin":
      return `begin: ${inlined(value.inner, value.inner.kind === "use-on" ? "use" : value.inner.kind)}`;
    case "refuse":
      return `refuse: ${inlined(value.inner)}`;
    case "assert":
      return `assert: ${condition.print(value.condition)}`;
    case "expect":
      return `expect: ${value.save}`;
    case "load":
      return `load: ${value.save}`;
    case "cancel":
      return "cancel";
    case "wait":
      return `wait: ${value.seconds}`;
    case "equip":
      return `equip: ${value.item}`;
    case "unequip":
      return `unequip: ${value.slot}`;
    case "feed":
      return `feed: ${value.target} with ${value.food}`;
    case "slot":
      return `slot: ${value.target} at ${hexKey(value.hex)} ${value.direction} with ${value.jewel}`;
    case "allocate":
      return `allocate: ${value.target} at ${hexKey(value.node.hex)} ${value.node.kind === "position" ? `position ${value.node.position}` : `slot ${value.node.direction}`}`;
    case "apply":
      return `apply: ${value.target} at ${hexKey(value.hex)} with ${value.effect}`;
    case "open-modal":
      return `open-modal: ${value.modal}`;
    case "submit-modal":
      return `submit-modal: ${value.key}=${value.value}`;
    default: {
      const unreached: never = value;
      return unreached;
    }
  }
}

export const test = section<Test>()({
  kind: "test",
  ids: "owned",
  map: "tests",
  parse: (raw) => {
    if (!raw.id) throw new DslError("# test requires an id", raw.span);
    const directives: Directive[] = [];

    for (const line of raw.body) {
      if (hasBlock(line))
        throw new DslError(
          `# test directives are single-line: ${line.text}`,
          line.span,
        );

      const directive = parseDirectiveLine(line.text);
      if (!directive)
        throw new DslError(
          `unexpected line in # test: ${JSON.stringify(line.text)}`,
          line.span,
        );
      directives.push(directive);
    }

    return { id: raw.id, directives };
  },
  print: (value, { moduleId }) => [
    `# test ${moduleLocalId(moduleId, value.id)}`,
    ...value.directives.map(printDirective),
  ],
  visit: (value, where, visit) => {
    for (const directive of value.directives ?? [])
      visitDirective(directive, where, visit);
  },
});

// Exported because a directive also arrives typed at the CLI, where the names
// are as short as an author's and want the same resolution.
export function visitDirective(
  value: Directive,
  where: string,
  visit: Visit,
): void {
  switch (value.kind) {
    case "run":
      put(value, "test", "test", `${where} run:`, visit);
      return;
    case "talk":
      put(value, "entity", "entity", `${where} talk:`, visit);
      return;
    case "travel":
      put(value, "location", "location", `${where} travel:`, visit);
      return;
    case "goto":
      put(value, "location", "location", `${where} goto:`, visit);
      return;
    case "craft":
      put(value, "recipe", "recipe", `${where} craft:`, visit);
      return;
    case "expect":
    case "load":
      put(value, "save", "save", `${where} ${value.kind}:`, visit);
      return;
    case "assert":
      visitCondition(value.condition, `${where} assert:`, visit);
      return;
    case "begin":
      visitDirective(value.inner, `${where} begin:`, visit);
      return;
    case "use": {
      // `obj` names the kind, so the object it addresses is resolved as one,
      // and the action after it is that object's member — resolved second,
      // because the key it hangs under is the one the object settled on.
      if (!isActionOwnerKind(value.obj)) return;
      put(value, "objId", value.obj, `${where} use:`, visit);
      value.actionId = lastSegment(
        visit(
          ACTION_MEMBER,
          memberKey(ACTION_MEMBER, value.obj, value.objId, value.actionId),
          `${where} use:`,
        ),
      );
      return;
    }
    case "use-on":
      put(value, "action", "action", `${where} use:`, visit);
      put(value, "target", "entity", `${where} use: on`, visit);
      return;
    case "equip":
      putCarried(value, "item", `${where} equip:`, visit);
      return;
    // A growth verb's target is what is grown; whatever it consumes comes off a
    // stack and is always an item id.
    case "feed":
      putCarried(value, "target", `${where} feed:`, visit);
      put(value, "food", "item", `${where} feed: with`, visit);
      return;
    case "slot":
      putCarried(value, "target", `${where} slot:`, visit);
      put(value, "jewel", "item", `${where} slot: with`, visit);
      return;
    case "apply":
      putCarried(value, "target", `${where} apply:`, visit);
      put(value, "effect", "item", `${where} apply: with`, visit);
      return;
    case "allocate":
      putCarried(value, "target", `${where} allocate:`, visit);
      return;
    case "refuse":
      visitDirective(value.inner, `${where} refuse:`, visit);
      return;
    // `unequip:` names a slot, `open-modal:` a screen the engine defines and
    // `submit-modal:` an option key, none of which is a section's id, so they
    // resolve nothing here; a slot is checked against what items declare by
    // validateTestReferences, and a screen only the layer above can name is
    // refused where it is raised. `choose:` names an offered option by its
    // position, `cancel:` and `wait:` name nothing at all.
    case "unequip":
    case "open-modal":
    case "submit-modal":
    case "choose":
    case "cancel":
    case "wait":
      return;
    default: {
      const unreached: never = value;
      void unreached;
    }
  }
}
