import { actionResultLists } from '../../grammar/action';
import { nestedResults, type ActionResult } from '../../grammar/actionResult';
import { Action, actionBody, actionKind, actionLines, actionLinesWritten, isTwoSided } from '../../grammar/action';
import { Cursor, DslError, requireEnd, Span } from '../../grammar/parser';
import { moduleLocalId } from '../../grammar/section';
import type { RawSection } from '../../grammar/structure';
import { humanizeEn, id, lastSegment } from '../../grammar/values';
import { declaredId } from './entity';
import { actionSlug, localeKey } from '../locale';
import type { Namespace } from '../namespace';
import { put, visitAction } from '../refs';
import { section, writtenWhole } from './define';

export interface ActionDeclaration extends Action {
  id: string;
  extends?: string;
  wrote?: ActionResult[][];
}

export function actionAddress(action: Action): string {
  const id = declaredId(action);
  return id === undefined ? actionSlug(action.label) : lastSegment(id);
}

export type AuthoredResults = readonly (readonly [kind: string, id: string, lists: readonly (readonly ActionResult[])[]])[];

export function unperformableAction(authored: AuthoredResults, actions: ReadonlyMap<string, Action>): DslError | null {
  const blame = (actionId: string, says: string): DslError => new DslError(says, undefined, { kind: 'action', id: actionId });
  for (const [kind, id, lists] of authored) {
    const performed: string[] = [];
    const collect = (results: readonly ActionResult[]): void => {
      for (const result of results) {
        if (result.kind === 'perform') performed.push(result.action);
        for (const nested of nestedResults(result)) collect(nested);
      }
    };
    for (const list of lists) collect(list);
    for (const actionId of performed) {
      const action = actions.get(actionId);
      if (!action) continue;
      const by = `# ${kind} ${id}`;
      if (actionKind(action) === 'continuous') {
        return blame(actionId, `# action ${actionId} is performed by ${by} and is continuous, so it would hold the player for good: a performed action ends on its own, with a time: and no continuous`);
      }
      if (isTwoSided(action)) {
        return blame(actionId, `# action ${actionId} is performed by ${by} and is a contest between two sides, and a performed action has nobody across from the player: write it with a time: and results of its own`);
      }
    }
  }
  return null;
}

export function actionWords(action: Action): { text: string; generated: boolean } {
  const generated = action.generatedLabel === true || declaredId(action) === undefined;
  return { text: generated ? humanizeEn(action.label) : action.label, generated };
}

export interface ActionTextOwner {
  namespace: string | null;
  kind: string;
  id: string;
  field: string;
}

export function actionTextSection(kind: string, ownerId: string, action: Action): { kind: string; id: string } {
  const declared = declaredId(action);
  return declared === undefined ? { kind, id: ownerId } : { kind: 'action', id: declared };
}

export function actionTextOwner(namespace: Namespace, kind: string, ownerId: string, action: Action): ActionTextOwner {
  const owner = actionTextSection(kind, ownerId, action);
  return {
    ...owner,
    namespace: namespace.ownerOf(owner.kind, owner.id) ?? null,
    field: actionAddress(action),
  };
}

export const actionTextKey = (owner: ActionTextOwner): string => localeKey(owner.namespace, owner.kind, owner.id, owner.field);

const TITLE = /^title:[ \t]*/;
const EXTENDS = /^extends:[ \t]*/;

function lifted(raw: RawSection, keyword: RegExp, written: string): { value?: string; span?: Span } {
  const found = raw.body.filter((line) => keyword.test(line.text));
  if (found.length > 1) throw new DslError(`# action ${raw.id}: ${written} is defined more than once`, found[1]!.span);
  return found[0] === undefined ? {} : { value: found[0].text.replace(keyword, ''), span: found[0].span };
}

export const action = section<ActionDeclaration>()({
  says: (value) => value.wrote ?? actionResultLists(value),
  kind: 'action',
  ids: 'owned',
  vocabulary: 'declared',
  merge: writtenWhole,
  map: 'actions',
  grammar: [
    { form: 'title: <text>', example: 'title: Chop Wood' },
    {
      form: 'extends: <action>',
      example: 'extends: chop-wood',
      names: { action: 'action' },
      note: "that action's whole body, with every line written here laid over it and `+` adding to what it holds rather than replacing it. `title:` is one of those lines, so an action that writes none is called what it extends — which is how one mechanic split into several still reads as one thing to a player. Where nothing up the chain writes a title: either, an action falls back to the name its own id makes rather than wearing another's",
    },
    ...actionLinesWritten(),
  ],
  parse: (raw) => {
    if (!raw.id) throw new DslError('# action requires an id', raw.span);
    const title = lifted(raw, TITLE, 'title');
    const base = lifted(raw, EXTENDS, 'extends');
    const label = title.value ?? raw.id;
    const body = raw.body.filter((line) => !TITLE.test(line.text) && !EXTENDS.test(line.text));
    return {
      id: raw.id,
      ...actionBody.parseBlock(body, label),
      label,
      ...(title.value === undefined ? { generatedLabel: true as const } : {}),
      ...(base.value === undefined ? {} : { extends: reference(base.value, base.span!) }),
    } as ActionDeclaration;
  },
  print: (declared, { moduleId }) => {
    const [, ...body] = actionLines(declared);
    const title = declared.generatedLabel ? [] : [`title: ${declared.label}`];
    const base = declared.extends === undefined ? [] : [`extends: ${declared.extends}`];
    return [`# action ${moduleLocalId(moduleId, declared.id)}`, ...title, ...base, ...body.map((line) => line.replace(/^ {2}/, ''))];
  },
  visit: (declared, where, visit) => {
    put(declared, 'extends', 'action', `${where} extends:`, visit);
    visitAction(declared, where, visit);
  },
});

function reference(raw: string, span: Span): string {
  const cursor = new Cursor(raw, 0, span.start);
  const named = id.parse(cursor);
  requireEnd(cursor, 'an action id');
  return named;
}
