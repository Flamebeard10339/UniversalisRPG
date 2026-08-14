import { Action, actionBody, actionProblem, assembledActionProblem } from '../grammar/action';
import { actionSlug } from './locale';
import { declaredId } from './entity';
import { DslError } from '../grammar/parser';
import { humanizeEn, lastSegment } from '../grammar/values';
import { RawSection } from '../grammar/structure';

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

const TITLE = /^title:[ \t]*/;

export function parseActionSection(section: RawSection): ActionDeclaration {
  if (!section.id) throw new DslError('# action requires an id', section.span);
  const titles = section.body.filter((line) => TITLE.test(line.text));
  if (titles.length > 1) throw new DslError(`# action ${section.id}: title is defined more than once`, titles[1].span);
  if (titles[0]?.children.length) throw new DslError(`# action ${section.id}: title takes no indented block`, titles[0].span);
  const label = titles[0] ? titles[0].text.replace(TITLE, '') : humanizeEn(section.id);
  const body = section.body.filter((line) => !TITLE.test(line.text));
  const generated = titles[0] ? {} : { generatedLabel: true as const };
  const declared = { id: section.id, ...actionBody.parseBlock(body, label), label, ...generated } as ActionDeclaration;
  // A declaration is whole where an entity's overload of it is a fragment, so
  // this is where the rules about a whole action are asked.
  const problem = assembledActionProblem(declared);
  if (problem) throw new DslError(`# action ${section.id}: ${actionProblem(label, problem)}`, section.span);
  return declared;
}
