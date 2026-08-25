import { actionResultLists } from '../../grammar/action';
import { Action, actionBody, actionLines, actionLinesWritten, actionProblem, assembledActionProblem } from '../../grammar/action';
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

// The section an action's words are filed under. An action carrying an id of its own is a `# action` however it came to be written, so its label is that section's to hold rather than each thing that offers it; one without belongs to whatever nests it.
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

export const action = section<ActionDeclaration>()({
  says: (value) => actionResultLists(value),
  kind: 'action',
  ids: 'owned',
  vocabulary: 'declared',
  map: 'actions',
  grammar: [{ form: 'title: <text>', example: 'title: Chop Wood' }, ...actionLinesWritten()],
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
