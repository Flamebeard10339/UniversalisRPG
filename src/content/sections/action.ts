import {
  Action,
  actionBody,
  actionLines,
  actionProblem,
  assembledActionProblem,
} from "../../grammar/action";
import { DslError } from "../../grammar/parser";
import { moduleLocalId } from "../../grammar/section";
import { humanizeEn, lastSegment } from "../../grammar/values";
import { declaredId } from "./entity";
import { actionSlug, localeKey } from "../locale";
import type { Namespace } from "../namespace";
import { visitAction } from "../refs";
import { section } from "./define";

// An action written once and named by everything that performs it. Its `label`
// is its title, which is what an inline action's label already is, so both forms
// hold the same shape and nothing downstream asks which one it came from.
export interface ActionDeclaration extends Action {
  id: string;
}

// What an action is addressed by, everywhere one is named: under its owner in
// the namespace, in a `use:`, in a choice id and in a save. A declaration is
// addressed by the id it was written under, so its `title:` is display and
// moves freely; an inline block has no id but the label it is headed with, so a
// slug of that label is the only address there is.
export function actionAddress(action: Action): string {
  const id = declaredId(action);
  return id === undefined ? actionSlug(action.label) : lastSegment(id);
}

// Where an action's display words are written, which is not where every
// performer of it stands: a `# action` owns the label it was declared with, and
// an entity's overload cannot retitle it because `overlayAction` drops `label`,
// so a `use:` never authors words. One declaration is therefore one key however
// many owners bring it, and the language those words are in is the declaring
// module's rather than the performer's. An inline block has no declaration and
// is owned by the object it was written under.
export interface ActionTextOwner {
  namespace: string | null;
  kind: string;
  id: string;
  field: string;
}

export function actionTextOwner(
  namespace: Namespace,
  kind: string,
  ownerId: string,
  action: Action,
): ActionTextOwner {
  const declared = declaredId(action);
  const owner =
    declared === undefined
      ? { kind, id: ownerId }
      : { kind: "action", id: declared };
  return {
    ...owner,
    namespace: namespace.ownerOf(owner.kind, owner.id) ?? null,
    field: actionAddress(action),
  };
}

export const actionTextKey = (owner: ActionTextOwner): string =>
  localeKey(owner.namespace, owner.kind, owner.id, owner.field);

const TITLE = /^title:[ \t]*/;

export const action = section<ActionDeclaration>()({
  kind: "action",
  ids: "owned",
  map: "actions",
  parse: (raw) => {
    if (!raw.id) throw new DslError("# action requires an id", raw.span);
    const titles = raw.body.filter((line) => TITLE.test(line.text));
    if (titles.length > 1)
      throw new DslError(
        `# action ${raw.id}: title is defined more than once`,
        titles[1].span,
      );
    const label = titles[0]
      ? titles[0].text.replace(TITLE, "")
      : humanizeEn(raw.id);
    const body = raw.body.filter((line) => !TITLE.test(line.text));
    const generated = titles[0] ? {} : { generatedLabel: true as const };
    const declared = {
      id: raw.id,
      ...actionBody.parseBlock(body, label),
      label,
      ...generated,
    } as ActionDeclaration;
    // A declaration is whole where an entity's overload of it is a fragment, so
    // this is where the rules about a whole action are asked.
    const problem = assembledActionProblem(declared);
    if (problem)
      throw new DslError(
        `# action ${raw.id}: ${actionProblem(label, problem)}`,
        raw.span,
      );
    return declared;
  },
  print: (declared, { moduleId }) => {
    const [, ...body] = actionLines(declared);
    // A generated label is `humanizeEn` of the id, which the loader makes again;
    // printing it would make the placeholder authored on the next load.
    const title = declared.generatedLabel ? [] : [`title: ${declared.label}`];
    return [
      `# action ${moduleLocalId(moduleId, declared.id)}`,
      ...title,
      ...body.map((line) => line.replace(/^ {2}/, "")),
    ];
  },
  visit: visitAction,
});
