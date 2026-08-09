import { Action, actionBody } from '../grammar/action';
import { DslError } from '../grammar/parser';
import { RawSection } from '../grammar/structure';
import { humanize } from '../grammar/values';

// An action written once and named by everything that performs it. Its `label`
// is its title, which is what an inline action's label already is, so both forms
// hold the same shape and nothing downstream asks which one it came from.
export interface ActionDeclaration extends Action {
  id: string;
}

const TITLE = /^title:[ \t]*/;

export function parseActionSection(section: RawSection): ActionDeclaration {
  if (!section.id) throw new DslError('# action requires an id', section.span);
  const titles = section.body.filter((line) => TITLE.test(line.text));
  if (titles.length > 1) throw new DslError(`# action ${section.id}: title is defined more than once`, titles[1].span);
  if (titles[0]?.children.length) throw new DslError(`# action ${section.id}: title takes no indented block`, titles[0].span);
  const label = titles[0] ? titles[0].text.replace(TITLE, '') : humanize(section.id);
  const body = section.body.filter((line) => !TITLE.test(line.text));
  return { id: section.id, ...actionBody.parseBlock(body, label), label } as ActionDeclaration;
}
