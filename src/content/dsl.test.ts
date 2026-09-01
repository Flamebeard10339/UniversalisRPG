import { deepStrictEqual } from 'node:assert';
import { describe, expect, it } from 'vitest';
import { collectionFailures, formFailures, reachableCodecs, shapeFailures } from '../grammar/codec';
import { kindNamed, offeringAt } from './completion';
import { declaredBy } from './references';
import { actionAddress, actionWords } from './sections/action';
import { actionBody, actionLines, actionLinesWritten } from '../grammar/action';
import { nestedResults, type ActionResult } from '../grammar/actionResult';
import { align, holeNames, holesIn, matches, standingIn, valueIn } from '../grammar/form';
import { DslError, type Overwritten, type Written } from '../grammar/parser';
import { humanizeEn, text } from '../grammar/values';
import { TITLE_FIELD } from './sections/info';
import { indentLines, splitSections } from '../grammar/structure';
import { DEFAULT_CONTEXT, hydrateSection, type AnySchema } from '../grammar/section';
import { BY_NAME, mergeFields, overwrittenField } from './merge';
import { keyedUnderOwnerKind, memberKey, Namespace } from './namespace';
import { TOUCHED } from './sections/define';
import { everyActionTable, formatModuleDiagnostic, mapOf, type Registry } from './registry';
import { loadUniverseWithDiagnostics } from './load';
import { everySaid, GENERATED_FIELD, localeKey } from './locale';
import { contentSectionMaps, isCheckedKind, isDebug, parseModule, registryMapOf, sections, sectionFor, textFieldsOf, type Section } from './sections';
import { givenByQuest } from './sections/dialogue';
import { groupOf } from './sections/group';
import { WEIGHT_SITE } from './refs';
import { tagClause } from '../grammar/tagClause';
import { fixtureSources } from './worldFixture';

const CORPUS = fixtureSources();

const problems = (result: { diagnostics: { sourceName: string }[] }): string[] => result.diagnostics.map((each) => formatModuleDiagnostic(each as never));

const POINTS = /^<[a-z][a-z0-9 -]*>$/;

const GRAMMAR: { kind: string; line: Written; under: string; indent: number }[] = [];

{
  const seen = new Set<string>();
  const walk = (kind: string, lines: readonly Written[], under: string, indent: number): void => {
    const sign = `${kind}::${lines.map((each) => each.form).join('|')}`;
    if (lines.length === 0 || seen.has(sign)) return;
    seen.add(sign);
    for (const line of lines) {
      GRAMMAR.push({ kind, line, under, indent });
      walk(kind, line.block?.() ?? [], [under, ...indentLines([line.example], indent)].join('\n'), indent + 2);
    }
  };
  for (const owner of sections()) walk(owner.kind, owner.grammar, `# ${owner.kind} probe`, 0);
}

const HOLES = GRAMMAR.flatMap((at) =>
  (holesIn(at.line.form, at.line.example) ?? []).map((hole) => ({
    ...at,
    hole,
    opens: at.line.block?.()[0]?.example,
    where: `# ${at.kind}${at.under.includes('\n') ? ` under ${at.under.split('\n').pop()!.trim()}` : ''}: ${at.line.form} <${hole.name}>`,
  })),
);

const written = (at: (typeof HOLES)[number], value: string): string =>
  [at.under, ...indentLines([standingIn(at.line.example, at.hole, value)], at.indent), ...(at.opens === undefined ? [] : indentLines([at.opens], at.indent + 2))].join('\n');

const beside = (at: (typeof HOLES)[number]) => (hole: string) => {
  const other = (holesIn(at.line.form, at.line.example) ?? []).find((each) => each.name === hole);
  return other === undefined ? undefined : valueIn(at.line.example, other);
};

const kindAt = (at: (typeof HOLES)[number]): string | undefined => kindNamed(at.line, at.hole.name, beside(at));

describe('a hole of every line of every kind', () => {
  it('is asked about at all, over every kind there is', () => {
    expect(new Set(GRAMMAR.map((at) => at.kind)).size).toBe(sections().filter((each) => each.grammar.length > 0).length);
    expect(HOLES.filter((at) => kindAt(at) !== undefined).length).toBeGreaterThan(100);
  });

  it('says what it names outright, rather than a kind nothing declares', () => {
    const held = new Set(sections().map((each) => each.kind));
    expect(
      GRAMMAR.flatMap(({ kind, line }) =>
        Object.entries(line.names ?? {}).flatMap(([hole, said]) => {
          if (said === null || (POINTS.test(said) && holeNames(line.form).includes(said.slice(1, -1)))) return [];
          return held.has(said) ? [] : [`# ${kind} ${line.form} says <${hole}> names a # ${said}`];
        }),
      ),
    ).toEqual([]);
  });

  it('names what the engine reads where it stands', () => {
    const PROBE = 'zzprobezz';
    const engine = (at: (typeof HOLES)[number]): string[] => {
      const raw = splitSections(written(at, PROBE))[0];
      const owner = raw === undefined ? undefined : sectionFor(raw.kind);
      if (owner === undefined) return [];
      const found: string[] = [];
      try {
        const authored = owner.parse(raw!) as { id: string };
        owner.visit(authored, '', (kind, id) => {
          if (id === PROBE || id.endsWith(`.${PROBE}`)) found.push(kind);
          return id;
        });
      } catch {
        return [];
      }
      return found;
    };
    expect(
      HOLES.flatMap((at) => {
        const read = [...new Set(engine(at))].filter((kind) => sectionFor(kind) !== undefined);
        const said = kindAt(at);
        return read.length === 1 && read[0] !== said ? [`${at.where} names ${said === undefined ? 'nothing' : `a # ${said}`}, where the engine reads a # ${read[0]}`] : [];
      }),
    ).toEqual([]);
  });
});

describe('what the page offers where the cursor stands in a hole', () => {
  const NAMED = 'a-module.a-name';
  const asking = new Map(HOLES.filter((at) => kindAt(at) !== undefined).map((at) => [`${at.under.split('\n').pop()!}|${at.line.form}|${at.hole.name}`, at]));
  const naming = [...asking.values()];

  it('offers each id that hole may name once, wherever the author has got to in typing it', () => {
    const complaints: string[] = [];
    let asked = 0;
    for (const at of naming) {
      const known = [{ kind: kindAt(at)!, address: NAMED }];
      for (const typed of [0, Math.floor(NAMED.length / 2), NAMED.length]) {
        const draft = written(at, NAMED.slice(0, typed)).slice(0, at.under.length + 1 + at.indent + at.hole.start + typed);
        const offering = offeringAt(draft, draft.length, known);
        const said = offering.offers.filter((each) => each.form.includes(NAMED));
        const here = offering.filling?.form === at.line.form && offering.filling.hole === at.hole.name;
        if (here) asked += 1;
        if (here ? said.length !== 1 : said.length > 1) complaints.push(`${at.where} with ${JSON.stringify(NAMED.slice(0, typed))} typed offers ${said.length === 0 ? 'nothing' : said.map((each) => each.form).join(', ')}`);
      }
    }
    expect(complaints).toEqual([]);
    expect(asked).toBeGreaterThan(naming.length);
  });

  it('breaks a hole filled with an id into no grammar of its own, since the ids are the whole of it', () => {
    expect(
      naming
        .filter((at) => at.line.holds?.()[at.hole.name] === undefined)
        .flatMap((at) => {
          const draft = written(at, '').slice(0, at.under.length + 1 + at.indent + at.hole.start);
          return offeringAt(draft, draft.length, []).filling?.holds === undefined ? [] : [at.where];
        }),
    ).toEqual([]);
  });
});

describe('a field whose values are names', () => {
  const NAMED = sections().flatMap((owner) => owner.names.map((each) => ({ owner, each, where: `# ${owner.kind} ${each.site}` })));
  const PROBE = 'zzprobezz';

  const cutting = (kind: string) => {
    let missing = false;
    const visit = (asked: string, id: string): string => {
      if (asked === kind && (id === PROBE || id.endsWith(`.${PROBE}`))) missing = true;
      return id;
    };
    return {
      visit,
      gone: (asked: string, id: string): boolean => asked === kind && (id === PROBE || id.endsWith(`.${PROBE}`)),
      intact: (walk: () => void): boolean => {
        missing = false;
        walk();
        return !missing;
      },
    };
  };

  const holding = (owner: (typeof NAMED)[number]['owner'], each: (typeof NAMED)[number]['each']): { id: string } => {
    const written = `# ${owner.kind} probe\n${each.site} ${PROBE}`;
    const authored = owner.parse(splitSections(written)[0]!);
    return hydrateSection(authored as never, owner.schema as never, DEFAULT_CONTEXT) as { id: string };
  };

  it('is declared by kinds that hold names at all, so nothing below is vacuous', () => {
    expect(NAMED.length).toBeGreaterThan(10);
    expect(new Set(NAMED.map((each) => each.each.kind)).size).toBeGreaterThan(4);
  });

  it('is read as naming what its field says, and takes the value the author wrote', () => {
    expect(
      NAMED.flatMap(({ owner, each, where }) => {
        const found: string[] = [];
        owner.visit(holding(owner, each) as never, '', (kind, id) => {
          found.push(`${kind} ${id}`);
          return id;
        });
        return found.includes(`${each.kind} ${PROBE}`) ? [] : [`${where} walks ${found.join(', ') || 'nothing'}`];
      }),
    ).toEqual([]);
  });

  it('loses the name when what it names is removed, and says whether its section stands without it', () => {
    expect(
      NAMED.flatMap(({ owner, each, where }) => {
        const held = holding(owner, each);
        const left = owner.prune(held as never, cutting(each.kind), `# ${owner.kind} probe`);
        if (!each.list && !each.standsWithout) return left === null ? [] : [`${where} keeps a section written around a name nothing declares`];
        if (left === null) return [`${where} takes its whole section out over one name it could stand without`];
        const kept = (left as unknown as Record<string, unknown>)[each.field];
        return JSON.stringify(kept ?? null).includes(PROBE) ? [`${where} still holds ${PROBE} after it was removed`] : [];
      }),
    ).toEqual([]);
  });

  it('is left alone when something of another kind is removed', () => {
    const other = (kind: string): string => sections().map((each) => each.kind).find((each) => each !== kind)!;
    expect(
      NAMED.flatMap(({ owner, each, where }) => {
        const held = holding(owner, each);
        return owner.prune(held as never, cutting(other(each.kind)), `# ${owner.kind} probe`) === held ? [] : [`${where} reacts to a # ${other(each.kind)} being removed`];
      }),
    ).toEqual([]);
  });
});

describe('a kind that says what group it belongs to', () => {
  const GROUPED = sections().filter((owner) => owner.names.some((each) => each.kind === 'group'));
  const registry = (): Registry => loadUniverseWithDiagnostics(CORPUS).registry;

  it('is more than one kind, so nothing below is vacuous', () => {
    expect(GROUPED.length).toBeGreaterThan(1);
  });

  it('has exactly one group the world declares standard for it', () => {
    const groups = [...registry().groups.values()];
    expect(GROUPED.flatMap((owner) => {
      const standard = groups.filter((each) => each.standardFor.includes(owner.kind));
      return standard.length === 1 ? [] : [`# ${owner.kind} falls to ${standard.length} standard groups`];
    })).toEqual([]);
  });

  it('finds a coloured group for every section of it the corpus writes, whether or not that section names one', () => {
    const world = registry();
    expect(
      GROUPED.flatMap((owner) =>
        [...mapOf(world, registryMapOf(owner.kind)!)].flatMap(([id, value]) => {
          const found = groupOf(world.groups, owner.kind, (value as { group?: string }).group);
          return found === undefined ? [`# ${owner.kind} ${id} belongs to no group`] : [];
        }),
      ),
    ).toEqual([]);
  });

  it('is the only thing a group may stand standard for, so no standard is written for a kind that names none', () => {
    const kinds = new Set(GROUPED.map((owner) => owner.kind));
    expect(
      [...registry().groups.values()].flatMap((each) => each.standardFor.filter((kind) => !kinds.has(kind)).map((kind) => `# group ${each.id} stands standard for ${kind}, which writes no group:`)),
    ).toEqual([]);
  });
});

describe('what a reference is checked against', () => {
  it('leaves no kind that anything names holding names nothing answers for', () => {
    const registry = loadUniverseWithDiagnostics(CORPUS).registry;
    const referenced = new Set(sections().flatMap((each) => each.names.map((named) => named.kind)));
    for (const [kind, primary] of contentSectionMaps()) {
      for (const [id, value] of mapOf(registry, primary)) sectionFor(kind)!.visit(value as never, `# ${kind} ${id}`, (names, named) => (referenced.add(names), named));
    }

    expect(referenced.size).toBeGreaterThan(0);
    for (const kind of referenced) expect(isCheckedKind(kind), kind).toBe(true);
  });

  it.each(sections().map((each) => each.kind))('%s does not own ids it declines to answer for', (kind) => {
    const owner = sectionFor(kind)!;
    if (owner.ids === 'owned') expect(owner.vocabulary).toBe('declared');
  });
});

describe('what a section is pruned by', () => {
  const registry = loadUniverseWithDiagnostics(CORPUS).registry;

  const sites = new Map<string, { kind: string; owner: Section; value: object; names: string; id: string; where: string }>();
  for (const [kind, primary] of contentSectionMaps()) {
    const owner = sectionFor(kind)!;
    for (const [id, value] of mapOf(registry, primary)) {
      owner.visit(value as never, `# ${kind} ${id}`, (names, named, where) => {
        const at = `${kind} ${names} ${where.replace(/"[^"]*"/g, '<>').replace(`# ${kind} ${id}`, '')}`;
        if (!sites.has(at)) sites.set(at, { kind, owner, value: value as object, names, id: named, where: `# ${kind} ${id}` });
        return named;
      });
    }
  }

  const cutting = (kind: string, id: string) => {
    let missing = false;
    const visit = (asked: string, named: string): string => {
      if (asked === kind && named === id) missing = true;
      return named;
    };
    return {
      visit,
      gone: (asked: string, named: string): boolean => asked === kind && named === id,
      intact: (walk: () => void): boolean => {
        missing = false;
        walk();
        return !missing;
      },
    };
  };

  it('is asked of every site the corpus writes, so nothing below is vacuous', () => {
    expect(sites.size).toBeGreaterThan(20);
    expect(new Set([...sites.values()].map((each) => each.kind)).size).toBeGreaterThan(5);
  });

  it('is everything it is read as naming', () => {
    expect(
      [...sites.values()].flatMap(({ owner, value, names, id, where }) =>
        owner.prune(value as never, cutting(names, id), where) === value ? [`${where} names a # ${names} ${id} and stands unchanged when it is taken away`] : [],
      ),
    ).toEqual([]);
  });
});

describe('a line that only makes sense once another is written', () => {
  const keywordOf = (schema: { fields: Record<string, { keyword?: string }> }, name: string): string => schema.fields[name]?.keyword ?? name;

  const begins = (form: string, keyword: string): boolean => form === keyword || form.startsWith(`${keyword}:`);

  const offeredOn = (draft: string): string[] => offeringAt(draft, draft.length, []).offers.map((each) => each.form);

  for (const owner of sections()) {
    const schema = owner.schema as { fields: Record<string, { keyword?: string }>; needs?: Record<string, string> } | undefined;
    if (schema?.needs === undefined) continue;
    for (const [name, needed] of Object.entries(schema.needs)) {
      const keyword = keywordOf(schema, name);
      const stands = keywordOf(schema, needed);
      const writes = owner.grammar.find((line) => begins(line.form, stands) && line.example.length > stands.length);

      it(`# ${owner.kind} offers ${keyword} only once ${stands} is written`, () => {
        expect(writes, `nothing in the grammar of # ${owner.kind} writes ${stands}`).toBeDefined();
        expect(offeredOn(`# ${owner.kind} probe\n`).filter((form) => begins(form, keyword))).toEqual([]);
        const written = `# ${owner.kind} probe\n${writes!.example}\n`;
        expect(offeredOn(written).filter((form) => begins(form, keyword)).length).toBeGreaterThan(0);
      });

      it(`# ${owner.kind} keeps ${keyword} back where a line it cannot read stands beside it`, () => {
        const draft = `# ${owner.kind} probe\nnothing-here-is-a-field: 3\n`;
        expect(offeredOn(draft).filter((form) => begins(form, keyword))).toEqual([]);
      });

      it(`# ${owner.kind} refuses ${keyword} where ${stands} is not written`, () => {
        const alone = owner.grammar.find((line) => begins(line.form, keyword) && line.example !== `${keyword}:`);
        expect(alone, `nothing in the grammar of # ${owner.kind} writes ${keyword} on a line of its own`).toBeDefined();
        const draft = `# ${owner.kind} probe\n${alone!.example}\n`;
        const written = `${keyword}${schema.fields[name] === undefined ? '' : ':'} needs a ${stands}: line`;
        expect(() => owner.build(owner.parse(splitSections(draft)[0]!), DEFAULT_CONTEXT), draft).toThrow(written);
      });
    }
  }
});

describe('a prose field of any kind', () => {
  const AUTHORED = loadUniverseWithDiagnostics(CORPUS).parsed.flatMap((module) => module.sections);

  const WRITABLE = sections().flatMap((owner) =>
    owner.text.flatMap((field) => {
      const one = AUTHORED.find((each) => each.kind === owner.kind);
      if (one === undefined) return [];
      const set = (said: string): Record<string, unknown> => ({ ...(one.value as object), [field]: said });
      const kept = (sectionFor(owner.kind)!.build(set('Plainly written.'), DEFAULT_CONTEXT) as Record<string, unknown>)[field];
      return kept === 'Plainly written.' ? [{ kind: owner.kind, field, set }] : [];
    }),
  );

  it('is found on most kinds there are, so nothing below is vacuous', () => {
    expect(WRITABLE.length).toBeGreaterThan(12);
  });

  for (const { kind, field, set } of WRITABLE) {
    it(`# ${kind} refuses a ${field}: that names a parameter, since it is said as written and nothing hands it one`, () => {
      expect(() => sectionFor(kind)!.build(set('A {thing} of note.'), DEFAULT_CONTEXT)).toThrow(/names \{thing\}, which nothing supplies/);
    });
  }
});

describe('a DEBUG section the corpus holds', () => {
  const { registry, parsed } = loadUniverseWithDiagnostics(CORPUS);
  const MARKED = parsed.flatMap((module) => module.sections.flatMap((section) => (isDebug(section.value) ? [{ module: module.info.id, kind: section.kind, id: (section.value as { id: string }).id }] : [])));

  it('is written at all, so nothing below is vacuous', () => {
    expect(MARKED.length).toBeGreaterThan(0);
  });

  it.each(MARKED.map((each) => `# ${each.kind} ${each.id}`))('%s says nothing the game can say, in any language', (written) => {
    const each = MARKED.find((one) => `# ${one.kind} ${one.id}` === written)!;
    const beneath = localeKey(registry.namespace.ownerOf(each.kind, each.id) ?? each.module, each.kind, each.id, '');
    expect(everySaid(registry.locales).filter((said) => said.key.startsWith(beneath))).toEqual([]);
  });

  const PROSE = MARKED.flatMap((each) => (textFieldsOf(each.kind) ?? []).map((field) => ({ ...each, field })));

  it('is written under a kind that has prose to refuse, so nothing below is vacuous', () => {
    expect(PROSE.length).toBeGreaterThan(0);
  });

  it.each(PROSE.map((each) => `# ${each.kind} ${each.id} ${each.field}:`))('refuses %s, because a section saying nothing in any language has no business carrying words', (written) => {
    const each = PROSE.find((one) => `# ${one.kind} ${one.id} ${one.field}:` === written)!;
    const module = { name: 'saying.dsl', text: `# info saying
version: 0.0.0
dependencies:
  ${each.module}

# ${each.kind} ${each.id}
${each.field}: Words a player would read.
` };
    expect(problems(loadUniverseWithDiagnostics([...CORPUS, module])).join(' ')).toMatch(new RegExp(`# ${each.kind} ${each.id}: ${each.field}: "Words a player would read." is words a player reads`));
  });

  it('is refused wherever a section a player can reach names it', () => {
    const each = MARKED.find((one) => one.kind === 'item')!;
    const named = `# droptable a-lucky-find
give: 1 ${each.id}
`;
    const module = { name: 'reaching.dsl', text: `# info reaching
version: 0.0.0
dependencies:
  ${each.module}

${named}` };
    expect(problems(loadUniverseWithDiagnostics([...CORPUS, module])).join(' ')).toMatch(new RegExp(`names ${each.id}, which is DEBUG`));
    const marked = { ...module, text: module.text.replace('a-lucky-find', `a-lucky-find
DEBUG`) };
    expect(problems(loadUniverseWithDiagnostics([...CORPUS, marked]))).toEqual([]);
  });
});
describe('what # save refuses an over: line for', () => {
  const read = (body: string): (() => unknown) => () => sectionFor('save')!.parse(splitSections(`# save probe\n${body}`)[0]!);

  it('takes it above the saved game, and refuses it below', () => {
    expect(read('over: in-town\n{"version":1}')).not.toThrow();
    expect(read('{"version":1}\nover: in-town')).toThrow(/stands above the saved game/);
  });

  it('refuses a word that is no save id, rather than reading it as one', () => {
    expect(read('over: In Town\n{"version":1}')).toThrow(/which is no save id/);
  });

  it('refuses a line naming no save at all', () => {
    expect(read('over:\n{"version":1}')).toThrow(/names no save/);
  });

  it('takes them a save to a line, indented, as every other list is written', () => {
    expect(read('over:\n  in-town\n  at-the-forge\n{"version":1}')).not.toThrow();
  });
});

describe('a name a value in the corpus carries', () => {
  const { registry } = loadUniverseWithDiagnostics(CORPUS);

  const CARRIED = contentSectionMaps().flatMap(([kind, primary]) => {
    const members = sectionFor(kind)!.members;
    if (members === undefined) return [];
    return [...mapOf(registry, primary)].flatMap((entry) =>
      members(entry[1] as { id: string }).map((member) => ({ kind: member.kind, key: memberKey(member.kind, kind, entry[0], member.name), where: `# ${kind} ${entry[0]}` })),
    );
  });

  it('is carried by enough of it for what is below to mean something', () => {
    expect(CARRIED.length).toBeGreaterThan(5);
    expect(new Set(CARRIED.map((each) => each.where.split('.')[0])).size).toBeGreaterThan(1);
  });

  it('is a member of the namespace, whichever kind of section landed the value', () => {
    expect(CARRIED.filter((each) => !registry.namespace.has(each.kind, each.key)).map((each) => `${each.where} carries ${each.kind} ${each.key}, which nothing declares`)).toEqual([]);
  });

  it('is read off values their kinds land without hydrating first', () => {
    const bearing = new Set(contentSectionMaps().flatMap(([kind, primary]) => (sectionFor(kind)!.members === undefined ? [] : [primary])));
    expect(bearing.size).toBeGreaterThan(0);
    expect(sections().filter((each) => each.schema !== undefined && Object.keys(each.maps).some((name) => bearing.has(name))).map((each) => each.kind)).toEqual([]);
  });
});

const declaredKeys = (held: Namespace): { kind: string; key: string }[] =>
  held
    .kinds()
    .sort()
    .flatMap((kind) => held.declaredKeys(kind).sort().map((key) => ({ kind, key })));

const names = (entry: { kind: string; key: string }, id: string): boolean => {
  const key = keyedUnderOwnerKind(entry.kind) ? entry.key.slice(entry.key.indexOf('.') + 1) : entry.key;
  return key === id || key.startsWith(`${id}.`);
};

const ACTION_SHAPES: readonly string[] = (() => {
  const seen = new Set<string>();
  const forms = new Set<string>();
  const walk = (lines: readonly Written[]): void => {
    const sign = lines.map((line) => line.form).join('|');
    if (lines.length === 0 || seen.has(sign)) return;
    seen.add(sign);
    for (const line of lines) {
      forms.add(line.form);
      walk(line.block?.() ?? []);
    }
  };
  walk([...actionBody.grammar, ...actionLinesWritten()]);
  return [...forms];
})();

describe('an action the corpus writes', () => {
  const actions = everyActionTable(loadUniverseWithDiagnostics(CORPUS).registry).flatMap(([kind, id, held]) => held.map((action) => ({ where: `# ${kind} ${id}`, action })));

  it('is written by enough of the corpus for what is below to mean something', () => {
    expect(actions.length).toBeGreaterThan(10);
  });

  it('prints back into shapes the page offers, so nothing the engine takes goes unoffered', () => {
    const unoffered = actions.flatMap(({ where, action }) =>
      actionLines(action)
        .map((line) => line.trim().replace(/^\+(?=[a-z][a-z ]*:)/, ''))
        .filter((line) => line !== '' && !ACTION_SHAPES.some((form) => matches(form, line)))
        .map((line) => `${where}: ${line}`),
    );

    expect([...new Set(unoffered)]).toEqual([]);
  });
});

describe('a stat the corpus contests as a one of: row weight', () => {
  const registry = loadUniverseWithDiagnostics(CORPUS).registry;
  const contested = new Set<string>();
  for (const [kind, primary] of contentSectionMaps()) {
    for (const [id, value] of mapOf(registry, primary)) {
      sectionFor(kind)!.visit(value as never, `# ${kind} ${id}`, (names, named, where) => {
        if (names === 'stat' && where.endsWith(WEIGHT_SITE)) contested.add(named);
        return named;
      });
    }
  }

  it('is contested by enough of the corpus, under more than one skill, for what is below to mean something', () => {
    expect(contested.size).toBeGreaterThan(1);
  });

  it('carries no percentage an item writes, since a percentage on a share swings the roll by that factor and says so nowhere', () => {
    const multiplied = [...registry.items.values()].flatMap((item) =>
      item.tags.flatMap((tag) => (tag.kind === 'stat-bonus' && tag.percent && contested.has(tag.statId) ? [`# item ${item.id}: ${tagClause.print(tag)}`] : [])),
    );

    expect(multiplied).toEqual([]);
  });
});

describe('a pool a player only has while carrying what grants it', () => {
  const registry = loadUniverseWithDiagnostics(CORPUS).registry;
  const everyResult = (results: readonly ActionResult[]): ActionResult[] => results.flatMap((result) => [result, ...nestedResults(result).flatMap(everyResult)]);

  const born = new Set([...registry.entities.values()].flatMap((entity) => Object.keys(entity.stats)));
  const worn = (statId: string): boolean => !born.has(statId) && registry.stats.get(statId)?.base.max === 0;

  const EMPTIED = [...registry.events.values()].flatMap((event) => {
    if (event.trigger !== 'on empty' || event.resource === undefined) return [];
    const ceiling = registry.resources.get(event.resource)!.max;
    if (!worn(ceiling)) return [];
    return [...registry.entities.values()]
      .flatMap((entity) => entity.handlers.filter((handler) => handler.event === event.id))
      .flatMap((handler) => everyResult(handler.results).flatMap((result) => (result.kind === 'roll' ? [{ ceiling, table: result.table }] : [])));
  });

  it('is written by the corpus, and pays for its own emptying out of a table, so nothing below is vacuous', () => {
    expect(EMPTIED.length).toBeGreaterThan(0);
  });

  it.each(EMPTIED)('is taken back through $table, which names every item granting $ceiling and nothing else', ({ ceiling, table }) => {
    const granting = [...registry.items.values()].filter((item) => item.tags.some((tag) => tag.kind === 'stat-bonus' && tag.statId === ceiling)).map((item) => item.id);
    expect(granting.length).toBeGreaterThan(1);
    const taken = everyResult(registry.dropTables.get(table)!.results).flatMap((result) => (result.kind === 'take' ? [result.item] : []));
    expect([...new Set(taken)].sort()).toEqual([...new Set(granting)].sort());
  });
});

describe('a name the corpus offers', () => {
  const registry = loadUniverseWithDiagnostics(CORPUS).registry;
  const begun = (name: string): string => humanizeEn(name.slice(0, 1)) + name.slice(1);
  const NAMES = [
    ...[...registry.locales.base].flatMap(([key, entry]) => (key.endsWith(`.${GENERATED_FIELD}`) ? [{ at: key, name: entry.text }] : [])),
    ...everyActionTable(registry).flatMap(([kind, id, held]) => held.map((action) => ({ at: `# ${kind} ${id} ${actionAddress(action)}`, name: actionWords(action).text }))),
  ];

  it('is written by enough of the corpus for what is below to mean something', () => {
    expect(NAMES.length).toBeGreaterThan(50);
    expect(NAMES.some(({ name }) => name.includes(' '))).toBe(true);
  });

  it('begins with the letter humanizeEn would begin it with, so nothing reaches a player as the address it is reached by', () => {
    expect(NAMES.filter(({ name }) => name !== begun(name)).map(({ at, name }) => `${at}: ${JSON.stringify(name)}`)).toEqual([]);
  });
});

describe('an entity the corpus writes examine: on', () => {
  const registry = loadUniverseWithDiagnostics(CORPUS).registry;
  const written = [...registry.entities.values()].filter((entity) => entity.examine !== undefined);

  it('is written by enough of the corpus for what is below to mean something', () => {
    expect(written.length).toBeGreaterThan(3);
  });

  it('offers those words as an action, so no scenery is reviewed that nobody can read', () => {
    const unreachable = written.filter((entity) => !entity.actions.some((action) => action.results.some((result) => result.kind === 'say' && result.text === entity.examine)));
    expect(unreachable.map((entity) => entity.id)).toEqual([]);
  });

  it('marks itself touched under the name a location is marked with too, so reading a thing and standing somewhere are one list', () => {
    const unmarked = written.filter((entity) => !entity.actions.some((action) => action.results.some((result) => result.kind === 'set' && result.variable === `${entity.id}.${TOUCHED}`)));
    expect(unmarked.map((entity) => entity.id)).toEqual([]);
    expect(sectionFor('location')!.flags).toContain(TOUCHED);
  });
});

describe('a flag a kind mints of its own', () => {
  const registry = loadUniverseWithDiagnostics(CORPUS).registry;
  const minted = sections().flatMap((section) => section.flags.map((flag) => ({ kind: section.kind, flag })));

  it('is minted by enough kinds, under few enough names, for what is below to mean something', () => {
    expect(new Set(minted.map((each) => each.kind)).size).toBeGreaterThan(1);
    expect(minted.length).toBeGreaterThan(new Set(minted.map((each) => each.flag)).size);
  });

  it.each(minted)('stands on every # $kind the corpus holds as <id>.$flag, so a when: may name one', ({ kind, flag }) => {
    const known = new Set(declaredBy(registry).flatMap((each) => (each.kind === 'flag' ? [each.address] : [])));
    const ids = [...mapOf(registry, registryMapOf(kind)!).keys()];
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.filter((id) => !known.has(`${id}.${flag}`))).toEqual([]);
  });
});

describe('a line a quest gives an entity', () => {
  const registry = loadUniverseWithDiagnostics(CORPUS).registry;
  const given = [...registry.dialogues.values()].filter(givenByQuest);

  it('is written by enough of the corpus for what is below to mean something', () => {
    expect(given.length).toBeGreaterThan(0);
  });

  it('says what the player picks to open it, so the list a player reads is words and not speech', () => {
    expect(given.flatMap((dialogue) => dialogue.nodes.filter((node) => node.ask === undefined).map((node) => `${dialogue.id} node ${node.name}`))).toEqual([]);
  });
});

describe('renaming a module', () => {
  const namespace = loadUniverseWithDiagnostics(CORPUS).registry.namespace;
  const declared = [...namespace.all].filter((each): each is string => each !== null).sort();

  it.each(declared)('writes %s out of every key that named it and leaves every other key alone', (module) => {
    const to = `${module}-somewhere-else`;
    const before = declaredKeys(namespace);
    const after = declaredKeys(namespace.renamed(module, to));
    expect(before.filter((each) => names(each, module)).length).toBeGreaterThan(0);
    expect(after.filter((each) => names(each, module))).toEqual([]);
    expect(after.filter((each) => !names(each, to))).toEqual(before.filter((each) => !names(each, module)));
    expect(after).toHaveLength(before.length);
  });
});

describe('every section kind', () => {
  it.each(sections().map((each) => each.kind))('%s declares a coherent section', (kind) => {
    const owner = sectionFor(kind)!;
    expect(sections().filter((each) => each.kind === kind)).toHaveLength(1);
    expect(Object.keys(owner.maps).length > 0).toBe(owner.ids !== 'none');
    const fields = Object.entries(owner.schema?.fields ?? {});
    expect(
      fields
        .filter(([, spec]) => spec === TITLE_FIELD)
        .map(([field]) => field)
        .filter((field) => !owner.text.includes(field)),
    ).toEqual([]);
    for (const field of owner.text) {
      const spec = owner.schema?.fields[field];
      if (spec !== undefined) expect(spec.parser).toBe(text);
    }
    for (const positional of [owner.schema?.clauses, owner.schema?.bare]) {
      if (positional !== undefined) expect(Object.keys(owner.schema!.fields)).toContain(positional);
    }
  });

  it.each(sections().map((each) => each.kind))('%s writes out example lines that parse where they sit in its grammar', (kind) => {
    const owner = sectionFor(kind)!;
    const seen = new Set<string>();
    let checked = 0;
    const walk = (lines: readonly Written[], under: readonly string[]): void => {
      const key = lines.map((each) => each.form).join('\n');
      if (lines.length === 0 || seen.has(key)) return;
      seen.add(key);
      expect(formFailures(`# ${kind} under ${under.join(' / ') || 'itself'}`, lines.map((each) => each.form), lines.map((each) => each.example))).toEqual([]);
      for (const line of lines) {
        const held = line.block?.();
        const opened = held === undefined ? [] : indentLines([held[0]!.example], 2 * (under.length + 1));
        const written = [`# ${kind} probe`, ...under.map((each, deep) => indentLines([each], 2 * deep)[0]!), ...indentLines([line.example], 2 * under.length), ...opened].join('\n');
        const refused = ((): string | undefined => {
          try {
            owner.parse(splitSections(written)[0]!);
            return undefined;
          } catch (error) {
            return error instanceof Error ? error.message : String(error);
          }
        })();
        expect(refused === undefined || (line.note !== undefined && refused.includes(line.note)), `${written}\n\n${refused}`).toBe(true);
        expect(align(line.form, line.example)?.complete, `# ${kind}: ${JSON.stringify(line.form)} does not read ${JSON.stringify(line.example)}`).toBe(true);
        checked += 1;
        if (held !== undefined) walk(held, [...under, line.example]);
      }
    };
    walk(owner.grammar, []);
    expect(checked).toBeGreaterThanOrEqual(owner.grammar.length);
  });

  it('is read by parsers that print back what they parsed', () => {
    const codecs = reachableCodecs(sections().flatMap((section) => Object.entries(section.schema?.fields ?? {}).map(([field, spec]) => [`${section.kind}.${field}`, spec.parser] as const)));
    expect(codecs.size).toBeGreaterThan(20);
    expect(collectionFailures(codecs)).toEqual([]);
    expect(shapeFailures(codecs)).toEqual([]);
  });
});

describe('a second body written at an id a first body already holds', () => {
  const AUTHORED = new Map<string, object[]>();
  for (const source of CORPUS) for (const section of parseModule(source.text)) AUTHORED.set(section.kind, [...(AUTHORED.get(section.kind) ?? []), section.value]);

  const MAPPED = sections().filter((each) => Object.keys(each.maps).length > 0 && each.grammar.length > 0);

  const same = (one: unknown, other: unknown): boolean => {
    try {
      deepStrictEqual(one, other);
      return true;
    } catch {
      return false;
    }
  };

  const secondBodies = (owner: Section, id: string): object[] =>
    owner.grammar.flatMap((line) => {
      const opens = line.block?.()[0]?.example;
      const written = [`# ${owner.kind} ${id}`, line.example, ...(opens === undefined ? [] : indentLines([opens], 2))].join('\n');
      try {
        return [owner.parse(splitSections(written)[0]!)];
      } catch {
        return [];
      }
    });

  const branchOf = (schema: AnySchema, name: string): Overwritten => {
    const byName = mergeFields({ [name]: [{ label: 'here', held: 1 }] }, { [name]: [{ label: 'here', added: 2 }, { label: 'other' }] }, schema)[name] as { held?: number; added?: number }[];
    if (Array.isArray(byName) && byName.length === 2 && byName[0]?.held === 1 && byName[0]?.added === 2) return 'by name';
    const listed = mergeFields({ [name]: ['held'] }, { [name]: { ops: [{ op: '+', values: ['added'] }] } }, schema)[name];
    return Array.isArray(listed) && listed.length === 2 ? 'listed' : 'replaced';
  };

  const SCHEMATIC = sections().filter((each) => each.schema !== undefined && Object.keys(each.schema!.fields).length > 0);

  it.each(SCHEMATIC.map((each) => each.kind))('%s says of every line it takes what mergeFields does with that line', (kind) => {
    const schema = sectionFor(kind)!.schema!;
    const names = [...Object.keys(schema.fields), ...(schema.keywords ?? []), ...(schema.entries === undefined ? [] : [schema.entries.into])];
    for (const name of names) expect(overwrittenField(schema, name), `# ${kind} ${name}`).toBe(branchOf(schema, name));
  });

  it('marks the lines it lays over by name, and marks no others', () => {
    const lines = sections().flatMap((owner) => owner.grammar.map((line) => ({ kind: owner.kind, line })));
    expect(lines.filter(({ line }) => line.over === 'by name').length).toBeGreaterThan(3);
    for (const { kind, line } of lines) expect(line.note?.includes(BY_NAME) === true, `# ${kind}: ${line.form}`).toBe(line.over === 'by name');
  });

  it('marks a line by name exactly where the kind lays a second one of it over the first by name', () => {
    const held = (value: object): number => Object.values(value).filter(Array.isArray).flat().length;
    let byName = 0;
    let read = 0;
    for (const owner of sections()) {
      for (const line of owner.grammar) {
        const hole = (holesIn(line.form, line.example) ?? [])[0];
        if (hole === undefined) continue;
        const opens = line.block?.()[0]?.example;
        const body = (example: string): object | undefined => {
          const written = [`# ${owner.kind} probe`, example, ...(opens === undefined ? [] : indentLines([opens], 2))].join('\n');
          try {
            return owner.parse(splitSections(written)[0]!);
          } catch {
            return undefined;
          }
        };
        const first = body(line.example);
        const again = body(line.example);
        const other = body(standingIn(line.example, hole, `${valueIn(line.example, hole)}-elsewhere`));
        if (first === undefined || again === undefined || other === undefined) continue;
        const laid = ((): boolean => {
          try {
            return held(owner.merge(structuredClone(first), again)) === held(first) && held(owner.merge(structuredClone(first), other)) > held(first);
          } catch {
            return false;
          }
        })();
        read += 1;
        if (laid) byName += 1;
        expect(line.over === 'by name', `# ${owner.kind}: ${line.form}`).toBe(laid);
      }
    }
    expect(read).toBeGreaterThan(20);
    expect(byName).toBeGreaterThan(1);
  });

  it('is asked of every kind that lands in a map, which is most of them', () => {
    expect(MAPPED.length).toBeGreaterThan(20);
    expect(MAPPED.length).toBeLessThan(sections().length);
  });

  it.each(MAPPED.filter((each) => each.bodyOver === 'whole').map((each) => each.kind))('%s is written whole, so a second body is the section', (kind) => {
    const owner = sectionFor(kind)!;
    const first = AUTHORED.get(kind)?.[0];
    expect(first, `the corpus writes no # ${kind}`).toBeDefined();
    const seconds = secondBodies(owner, (first as { id: string }).id);
    expect(seconds.length).toBeGreaterThan(0);
    for (const second of seconds) expect(owner.merge(structuredClone(first!), structuredClone(second))).toEqual(second);
  });

  it.each(MAPPED.map((each) => each.kind))('%s says what it means, rather than keeping the first and dropping the second', (kind) => {
    const owner = sectionFor(kind)!;
    const first = AUTHORED.get(kind)?.[0];
    expect(first, `the corpus writes no # ${kind}, so there is no first body to write a second over`).toBeDefined();
    const seconds = secondBodies(owner, (first as { id: string }).id);
    expect(seconds.length, `# ${kind} writes out no example line that parses on its own`).toBeGreaterThan(0);
    const answers = seconds.map((second) => {
      expect(() => owner.merge(undefined, structuredClone(second))).not.toThrow();
      try {
        return same(owner.merge(structuredClone(first!), structuredClone(second)), first) ? 'kept' : 'answered';
      } catch (error) {
        if (error instanceof DslError) return 'answered';
        throw error;
      }
    });
    expect(answers.includes('answered'), `# ${kind} keeps the first body and drops every second one, telling nobody`).toBe(true);
  });
});
