// OPEN REVIEW FINDINGS — 2026-08-20. Nothing below is fixed.
//
//  12. The registry-completeness check globs `./*.oop.ts`. The `.oop` suffix is
//      transitional; the moment a kind is added as `entity.ts`, the glob cannot
//      see it, `index.ts` silently omits it, and every walk here covers nothing
//      of it. The derivation is sound and its subject set is chosen by a
//      filename convention nothing enforces.
//
//   3. Nothing here covers `referenceSites`, which is why it went unnoticed
//      that it reaches no id inside a tag clause, a hook or an action.

import { expect, it } from 'vitest';
import { SECTIONS } from './index';
import { AnySection, editStatement, Section } from './section.oop';

// The registry is written out because the node-side tools cannot glob. That it
// is complete is not written out: a kind is a file that exports a section, and
// a file this directory holds that no line of the registry names is a kind
// every walk below would silently cover nothing of.
const DECLARED = import.meta.glob(['./*.oop.ts'], { eager: true }) as Record<string, Record<string, unknown>>;

it('registers every section kind this directory declares', () => {
  const found = Object.values(DECLARED)
    .flatMap((module) => Object.values(module))
    .filter((exported): exported is AnySection => exported instanceof Section)
    .map((section) => section.kind);
  expect([...found].sort()).toEqual([...SECTIONS.map((section) => section.kind)].sort());
});

// The examples are the reference page's source, so they have to be source: text
// that reads back as itself. A drift between what a kind parses and what it
// prints shows up here as the two spellings side by side, which is the one
// report that says where. Nothing below names a kind, a field or an example.
it('prints every section example back exactly as it was written', () => {
  // A kind with no examples documents nothing and is held to nothing, so it
  // fails here rather than passing every assertion vacuously.
  expect(SECTIONS.filter((section) => section.examples.length === 0).map((section) => section.kind)).toEqual([]);

  const drift = SECTIONS.flatMap((section) =>
    section.examples
      .map((source) => {
        const read = section.read(source);
        return { kind: section.kind, source, printed: section.print(read.value, { authored: read.authored }) };
      })
      .filter((each) => each.printed !== each.source),
  );
  expect(drift).toEqual([]);
});

// Every collection every example holds, taken apart one member at a time. `-`
// has to leave the rest alone and `+` has to put the member back, and the two
// together have to land on the same collection they started from — appended
// rather than in place, because operators apply in source order and nothing
// reorders them. The subjects come from `editable`, so a kind that watches a
// new list is covered here the moment one of its examples fills it.
it('takes a member out of every list a section watches, and puts it back', () => {
  // A collection, flattened to one comparable string per member.
  const held = (section: AnySection, value: { id: string }, keyword: string): string[] =>
    section
      .editable(value)
      .find((each) => each.keyword === keyword)!
      .members.map((member) => member.join('\n'));

  const drift = SECTIONS.flatMap((section) =>
    section.examples.flatMap((source) => {
      const read = section.read(source);
      const heading = `# ${section.kind} ${read.value.id}`;
      return section.editable(read.value).flatMap(({ keyword, members }) => {
        const before = members.map((member) => member.join('\n'));
        return members
          // A member written twice is one a `-` removes both copies of, so it
          // cannot say whether the rest were left alone.
          .filter((_, at) => before.indexOf(before[at]!) === at && before.lastIndexOf(before[at]!) === at)
          .map((member) => {
            const one = member.join('\n');
            const without = section.patch(read, `${heading}\n${editStatement('-', keyword, member)}`);
            const back = section.patch(without, `${heading}\n${editStatement('+', keyword, member)}`);
            return {
              kind: section.kind,
              keyword,
              member: one,
              afterRemove: held(section, without.value, keyword),
              afterRestore: held(section, back.value, keyword),
              expectedRemove: before.filter((each) => each !== one),
              expectedRestore: [...before.filter((each) => each !== one), one],
            };
          });
      });
    }),
  ).filter((each) => each.afterRemove.join('|') !== each.expectedRemove.join('|') || each.afterRestore.join('|') !== each.expectedRestore.join('|'));

  expect(drift).toEqual([]);
});
