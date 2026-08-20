import { Action, actionBody, actionLines, actionProblem, assembledActionProblem } from '../../grammar/action';
import { DslError } from '../../grammar/parser';
import { moduleLocalId } from '../../grammar/section';
import { humanizeEn, lastSegment } from '../../grammar/values';
import { declaredId } from './entity';
import { actionSlug, localeKey } from '../locale';
import type { Namespace } from '../namespace';
import { visitAction } from '../refs';
import { section } from './define';

export interface ActionDeclaration extends Action {
  id: string;
}

export function actionAddress(action: Action): string {
  const id = declaredId(action);
  return id === undefined ? actionSlug(action.label) : lastSegment(id);
}

export interface ActionTextOwner {
  namespace: string | null;
  kind: string;
  id: string;
  field: string;
}

export function actionTextOwner(namespace: Namespace, kind: string, ownerId: string, action: Action): ActionTextOwner {
  const declared = declaredId(action);
  const owner = declared === undefined ? { kind, id: ownerId } : { kind: 'action', id: declared };
  return {
    ...owner,
    namespace: namespace.ownerOf(owner.kind, owner.id) ?? null,
    field: actionAddress(action),
  };
}

export const actionTextKey = (owner: ActionTextOwner): string => localeKey(owner.namespace, owner.kind, owner.id, owner.field);

const TITLE = /^title:[ \t]*/;

export const action = section<ActionDeclaration>()({
  kind: 'action',
  ids: 'owned',
  map: 'actions',
  parse: (raw) => {
    if (!raw.id) throw new DslError('# action requires an id', raw.span);
    const titles = raw.body.filter((line) => TITLE.test(line.text));
    if (titles.length > 1) throw new DslError(`# action ${raw.id}: title is defined more than once`, titles[1].span);
    const label = titles[0] ? titles[0].text.replace(TITLE, '') : humanizeEn(raw.id);
    const body = raw.body.filter((line) => !TITLE.test(line.text));
    const generated = titles[0] ? {} : { generatedLabel: true as const };
    const declared = {
      id: raw.id,
      ...actionBody.parseBlock(body, label),
      label,
      ...generated,
    } as ActionDeclaration;
    const problem = assembledActionProblem(declared);
    if (problem) throw new DslError(`# action ${raw.id}: ${actionProblem(label, problem)}`, raw.span);
    return declared;
  },
  print: (declared, { moduleId }) => {
    const [, ...body] = actionLines(declared);
    const title = declared.generatedLabel ? [] : [`title: ${declared.label}`];
    return [`# action ${moduleLocalId(moduleId, declared.id)}`, ...title, ...body.map((line) => line.replace(/^ {2}/, ''))];
  },
  visit: visitAction,
});
