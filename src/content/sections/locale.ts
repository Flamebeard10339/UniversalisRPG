import { DslError } from '../../grammar/parser';
import { hasBlock, RawSection, sectionParser } from '../../grammar/structure';
import { section } from './define';

export interface LocaleSection {
  id: string;
  entries: Array<{ key: string; value: string }>;
}

const KEY = /^(?<key>[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)*):[ \t]?(?<value>.*)$/;

export const parseLocaleSection = sectionParser((section: RawSection): LocaleSection => {
  if (!section.id) throw new DslError('# locale requires a language, as in `# locale en`', section.span);
  const entries: Array<{ key: string; value: string }> = [];
  const seen = new Set<string>();
  for (const line of section.body) {
    if (hasBlock(line)) throw new DslError(`# locale ${section.id}: a translation is one line`, line.span);
    const groups = KEY.exec(line.text)?.groups;
    if (!groups) throw new DslError(`# locale ${section.id}: expected \`<key>: <text>\`, got ${JSON.stringify(line.text)}`, line.span);
    if (seen.has(groups.key)) throw new DslError(`# locale ${section.id}: ${groups.key} is translated more than once`, line.span);
    seen.add(groups.key);
    entries.push({ key: groups.key, value: groups.value });
  }
  return { id: section.id, entries };
});

export const locale = section<LocaleSection>()({
  kind: 'locale',
  ids: 'none',
  vocabulary: 'declared',
  grammar: [
    {
      form: '<key>: <text>',
      example: 'engine.shell.stage: Stage',
      note: 'a line the engine says, keyed rather than written where it is used. A `<fragment>` in one reads only what the engine hands that line at the moment it is raised — the `{names}` the English already writes — and never the run: `{player.name}` and `{us.attack}` are the world, so they stand in a `<text>` an author writes and nowhere here',
    },
  ],
  parse: parseLocaleSection,
  print: (declared, { id }) => [`# locale ${id}`, ...declared.entries.map((entry) => `${entry.key}: ${entry.value}`)],
});
