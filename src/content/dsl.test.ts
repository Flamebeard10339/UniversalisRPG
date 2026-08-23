import { describe, expect, it } from 'vitest';
import { collectionFailures, formFailures, reachableCodecs, shapeFailures } from '../grammar/codec';
import { amissIn, kindNamed, offeringAt, refusalOf } from './completion';
import { declaredBy } from './references';
import { actionBody, actionLines, actionLinesWritten } from '../grammar/action';
import { align, holeNames, holesIn, matches, standingIn, valueIn } from '../grammar/form';
import type { Written } from '../grammar/parser';
import { text } from '../grammar/values';
import { TITLE_FIELD } from './sections/info';
import { indentLines, splitSections } from '../grammar/structure';
import { DEFAULT_CONTEXT, hydrateSection } from '../grammar/section';
import { memberKey, Namespace } from './namespace';
import { everyActionTable, formatModuleDiagnostic, mapOf } from './registry';
import { loadUniverseWithDiagnostics } from './load';
import { contentSectionMaps, sections, sectionFor, type Section } from './sections';
import { canSerialize, roundTripUniverse } from './serialize';
import { shippedSources } from './shipped';
import type { Directive } from './sections/test';

const CORPUS = shippedSources();

const problems = (result: { diagnostics: { sourceName: string }[] }): string[] => result.diagnostics.map((each) => formatModuleDiagnostic(each as never));

// A line may say one hole names whatever another one holds, written as that other hole.
const POINTS = /^<[a-z][a-z0-9 -]*>$/;

// Every line of every kind, under the lines and at the indentation an author writes it at. A block reached twice holds the same lines, so it is walked once.
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

// Every placeholder of every one of those lines, with the line written out around it.
const HOLES = GRAMMAR.flatMap((at) =>
  (holesIn(at.line.form, at.line.example) ?? []).map((hole) => ({
    ...at,
    hole,
    // A line that opens a block and is handed over without one is refused for holding nothing, so the block's own first line goes under it.
    opens: at.line.block?.()[0]?.example,
    where: `# ${at.kind}${at.under.includes('\n') ? ` under ${at.under.split('\n').pop()!.trim()}` : ''}: ${at.line.form} <${hole.name}>`,
  })),
);

// The line with one value stood in the hole, sitting where an author writes it, which is the only form the engine can be asked about.
const written = (at: (typeof HOLES)[number], value: string): string =>
  [at.under, ...indentLines([standingIn(at.line.example, at.hole, value)], at.indent), ...(at.opens === undefined ? [] : indentLines([at.opens], at.indent + 2))].join('\n');

// What one hole of a line puts in another, which is how a line that says one hole names whatever another one holds is read.
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

  // The kind file is the one authority on what a line names. This asks the engine the question the panel used to ask it — an id stood in the hole, the section handed over, and whichever reference kind comes back — and holds the line's own word to it.
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
        // A kind the section list does not declare has no ids to offer and nothing the panel could say about it.
        const read = [...new Set(engine(at))].filter((kind) => sectionFor(kind) !== undefined);
        const said = kindAt(at);
        return read.length === 1 && read[0] !== said ? [`${at.where} names ${said === undefined ? 'nothing' : `a # ${said}`}, where the engine reads a # ${read[0]}`] : [];
      }),
    ).toEqual([]);
  });
});

describe('what the page offers where the cursor stands in a hole', () => {
  const NAMED = 'a-module.a-name';
  // One line written under one other line is the same question wherever it is reached from, and the results grammar is reached from every kind there is.
  const asking = new Map(HOLES.filter((at) => kindAt(at) !== undefined).map((at) => [`${at.under.split('\n').pop()!}|${at.line.form}|${at.hole.name}`, at]));
  const naming = [...asking.values()];

  // A sweep of the whole language rather than one claim about one line: its cost grows with every kind and every block a kind reaches, so it is given room rather than held to the default a single claim gets.
  it('offers each id that hole may name once, wherever the author has got to in typing it', { timeout: 30_000 }, () => {
    const complaints: string[] = [];
    let asked = 0;
    for (const at of naming) {
      const known = [{ kind: kindAt(at)!, address: NAMED }];
      for (const typed of [0, Math.floor(NAMED.length / 2), NAMED.length]) {
        const draft = written(at, NAMED.slice(0, typed)).slice(0, at.under.length + 1 + at.indent + at.hole.start + typed);
        const offering = offeringAt(draft, draft.length, known);
        const said = offering.offers.filter((each) => each.form.includes(NAMED));
        // Half a line may still be several shapes, and the page names the one it settled on; the claim is about the hole it says the cursor is in.
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

  // The engine, asked to take one name out from under a section: what it names is gone, and nothing else is.
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

  // A section of that kind holding the probe in that field and nothing else of its own, filled out with whatever its fields default to.
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

describe('what a section is pruned by', () => {
  const registry = loadUniverseWithDiagnostics(CORPUS).registry;

  // Every reference the shipped corpus makes, one for each site each kind writes: the site is what a section's own prune has to answer for, and the corpus writes them all.
  const sites = new Map<string, { kind: string; owner: Section; value: object; names: string; id: string; where: string }>();
  for (const [kind, primary] of contentSectionMaps()) {
    const owner = sectionFor(kind)!;
    for (const [id, value] of mapOf(registry, primary)) {
      owner.visit(value as never, `# ${kind} ${id}`, (names, named, where) => {
        // A site is the same site whatever id it names there, so the ids and labels written into it are rubbed out.
        const at = `${kind} ${names} ${where.replace(/"[^"]*"/g, '<>').replace(`# ${kind} ${id}`, '')}`;
        if (!sites.has(at)) sites.set(at, { kind, owner, value: value as object, names, id: named, where: `# ${kind} ${id}` });
        return named;
      });
    }
  }

  // The engine taking one thing out from under the world: that name of that kind is gone, and nothing else is.
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

  // A section says what it names twice — once walking, once pruning — and the second is not derived from the first. This holds them to each other: whatever a section is read as naming, taking that away has to change the section.
  it('is everything it is read as naming', () => {
    expect(
      [...sites.values()].flatMap(({ owner, value, names, id, where }) =>
        owner.prune(value as never, cutting(names, id), where) === value ? [`${where} names a # ${names} ${id} and stands unchanged when it is taken away`] : [],
      ),
    ).toEqual([]);
  });
});

describe('a line that only makes sense once another is written', () => {
  // The keyword an author types for a field, which is what the grammar writes and so what an offer begins with.
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

  // The subjects are every field any kind calls prose, taken from the kinds themselves and filled from what the corpus actually wrote, so a kind or a prose field declared next month is held to this with no edit. A field an author cannot write a value into — a title a kind only ever generates — says so by not keeping the value it is handed.
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

describe('the shipped corpus', () => {
  it('loads with no diagnostics', () => {
    expect(problems(loadUniverseWithDiagnostics(CORPUS))).toEqual([]);
  });

  it('has nothing the editing page would call amiss, by either question it asks, and names no id the engine cannot place', () => {
    const loaded = loadUniverseWithDiagnostics(CORPUS);
    expect(problems(loaded)).toEqual([]);
    const known = declaredBy(loaded.registry);
    for (const source of CORPUS) {
      for (const section of splitSections(source.text)) {
        if (sectionFor(section.kind) === undefined) continue;
        const written = source.text.slice(section.span.start, section.span.end).replace(/\s+$/, '');
        const where = `${source.name} # ${section.kind} ${section.id ?? ''}`;
        const said = refusalOf(written);
        const amiss = amissIn(written, known);
        expect(said, where).toBeNull();
        expect(amiss.some((each) => each.refused !== null), where).toBe(said !== null);
        expect(amiss.flatMap((each) => each.undeclared.map((one) => `line ${each.line}: ${one.id} as a # ${one.kind}`)), where).toEqual([]);
      }
    }
  });

  it('prints back to a universe that loads to the same registry', () => {
    const loaded = loadUniverseWithDiagnostics(CORPUS);
    expect(problems(loaded)).toEqual([]);
    const trip = roundTripUniverse(loaded.registry, loaded.parsed.filter(canSerialize), (sources) => loadUniverseWithDiagnostics(sources));
    expect(problems(trip)).toEqual([]);
    expect(trip.differences).toEqual([]);
  });

  it('reaches every location the corpus declares from its starting location, since a road answers from both ends', () => {
    const { registry } = loadUniverseWithDiagnostics(CORPUS);
    const start = [...registry.locations.values()].find((location) => location.starting)!;
    const seen = new Set([start.id]);
    const frontier = [start.id];
    while (frontier.length > 0) {
      const here = frontier.pop()!;
      for (const edge of registry.roads.get(here) ?? []) {
        if (seen.has(edge.target)) continue;
        seen.add(edge.target);
        frontier.push(edge.target);
      }
    }
    expect([...registry.locations.keys()].filter((id) => !seen.has(id))).toEqual([]);
  });

  // The subjects are every # shop the corpus holds, so a store written next month is held to both of these with no edit here.
  it('is reached at every counter it holds through the entity keeping it, since a shop nobody keeps stands nowhere', () => {
    const { registry } = loadUniverseWithDiagnostics(CORPUS);
    const kept = new Set([...registry.entities.values()].flatMap((entity) => (entity.shop === undefined ? [] : [entity.shop])));
    expect(registry.shops.size).toBeGreaterThan(0);
    expect([...registry.shops.keys()].filter((id) => !kept.has(id))).toEqual([]);
  });

  it('counts every counter in a coin that declares no value of its own, which is what a shop would otherwise sell itself', () => {
    const { registry } = loadUniverseWithDiagnostics(CORPUS);
    expect([...registry.shops.values()].filter((shop) => registry.items.get(shop.coin)?.value !== undefined).map((shop) => shop.id)).toEqual([]);
  });

  // A directive that reaches a state someone else's route already reached, rather than walking one of its own: it has nothing to claim beyond what it re-runs or re-checks.
  const REACHES: readonly Directive['kind'][] = ['load', 'run', 'expect', 'expect-only'];
  // Where a test's claim is written in words. `refuse:` is one: it names the growth that must not take, which is as readable as an assertion and is how the growth routes state theirs.
  const SPELLS_IT_OUT: readonly Directive['kind'][] = ['assert', 'refuse', 'journal'];

  it('says in words what each test it holds walked a route to prove, rather than only in a save body', () => {
    const { registry } = loadUniverseWithDiagnostics(CORPUS);
    const walked = [...registry.tests.values()].filter((each) => each.directives.some((directive) => !REACHES.includes(directive.kind)));
    expect(walked.length).toBeGreaterThan(0);

    const unspoken = walked
      .filter((each) => !each.directives.some((directive) => SPELLS_IT_OUT.includes(directive.kind)))
      // `expect:` compares the whole sheet, and is therefore the one form that can say a key the state no longer holds is gone — an absence no condition can name. It is the corpus's deliberate exception, and every use of it carries its argument in a comment.
      .filter((each) => !each.directives.some((directive) => directive.kind === 'expect'))
      .map((each) => {
        const sheets = each.directives.flatMap((directive) => (directive.kind === 'expect-only' ? [directive.save] : []));
        const only = sheets.length > 0 ? `save ${sheets.join(' and ')}` : 'nowhere at all';
        return `# test ${each.id} states no claim: what it proves lives in ${only}. Write the claim as assert: lines — npm run oracle -- test lists what a condition may read — or, where nothing a condition can read names it, close on expect: and say why in a comment.`;
      });
    expect(unspoken).toEqual([]);
  });

  it.each(CORPUS.map((source) => source.name))('%s refuses an indented block nobody reads', (name) => {
    const { text } = CORPUS.find((each) => each.name === name)!;
    for (const section of splitSections(text)) {
      const owner = sectionFor(section.kind);
      if (owner === undefined) continue;
      const written = text.slice(section.span.start, section.span.end).replace(/\s+$/, '');
      const intruded = [written, 'nonsense-nobody-declares:', ...indentLines(['nonsense-nobody-reads'])].join('\n');
      expect(() => owner.parse(splitSections(intruded)[0]!), `# ${section.kind} ${section.id ?? ''}`).toThrow();
    }
  });
});

describe('a name a value in the corpus carries', () => {
  const { registry } = loadUniverseWithDiagnostics(CORPUS);

  // Every name every landed value carries, taken from the kinds that say they carry names and from the map each of those owns — so a kind that lands dialogues next month is held to this with no edit, whether it wrote them itself or was handed them.
  const CARRIED = contentSectionMaps().flatMap(([kind, primary]) => {
    const members = sectionFor(kind)!.members;
    if (members === undefined) return [];
    return [...mapOf(registry, primary)].flatMap((entry) =>
      members(entry[1] as { id: string }).map((member) => ({ kind: member.kind, key: memberKey(member.kind, kind, entry[0], member.name), where: `# ${kind} ${entry[0]}` })),
    );
  });

  it('is carried by enough of it for what is below to mean something', () => {
    expect(CARRIED.length).toBeGreaterThan(20);
    expect(new Set(CARRIED.map((each) => each.where.split('.')[0])).size).toBeGreaterThan(1);
  });

  it('is a member of the namespace, whichever kind of section landed the value', () => {
    expect(CARRIED.filter((each) => !registry.namespace.has(each.kind, each.key)).map((each) => `${each.where} carries ${each.kind} ${each.key}, which nothing declares`)).toEqual([]);
  });

  // The namespace is settled before anything is built, so a kind landing into one of these maps has to land the same values from what an author wrote. A kind whose fields are a schema does not: its values arrive hydrated.
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

const names = (key: string, id: string): boolean => key.split('.').includes(id);

// Every shape the page offers anywhere under an action, however deep the blocks go. A block reached twice holds the same lines, so it is walked once.
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
    expect(actions.length).toBeGreaterThan(30);
  });

  // What the page offers and what the engine takes are one claim, and they came apart where a field restated its own parser's shapes beside it: `damage:` offered the `vs` shape alone while `contest()` read the unsided one too, so the corpus's one writing of it was a line the page would not have written.
  it('prints back into shapes the page offers, so nothing the engine takes goes unoffered', () => {
    const unoffered = actions.flatMap(({ where, action }) =>
      actionLines(action)
        // A `+` in front of a keyword says how a block overlaying another merges with it, which is not a shape anyone writes a value into. A `+` in front of a number is part of the clause.
        .map((line) => line.trim().replace(/^\+(?=[a-z][a-z ]*:)/, ''))
        .filter((line) => line !== '' && !ACTION_SHAPES.some((form) => matches(form, line)))
        .map((line) => `${where}: ${line}`),
    );

    expect([...new Set(unoffered)]).toEqual([]);
  });
});

// A prose field reaches a player only where something offers it, and the reach cannot be read off
// the corpus by asking a renderer: every driver draws the choices it is handed and none of them
// names examine. So the claim is made where the offer is minted, over every entity that writes one.
describe('an entity the corpus writes examine: on', () => {
  const registry = loadUniverseWithDiagnostics(CORPUS).registry;
  const written = [...registry.entities.values()].filter((entity) => entity.examine !== undefined);

  it('is written by enough of the corpus for what is below to mean something', () => {
    expect(written.length).toBeGreaterThan(20);
  });

  it('offers those words as an action, so no scenery is reviewed that nobody can read', () => {
    const unreachable = written.filter((entity) => !entity.actions.some((action) => action.results.some((result) => result.kind === 'say' && result.text === entity.examine)));
    expect(unreachable.map((entity) => entity.id)).toEqual([]);
  });
});

describe('renaming a module', () => {
  const namespace = loadUniverseWithDiagnostics(CORPUS).registry.namespace;
  const declared = [...namespace.all].filter((each): each is string => each !== null).sort();

  it.each(declared)('writes %s out of every key that named it and leaves every other key alone', (module) => {
    const to = `${module}-somewhere-else`;
    const before = declaredKeys(namespace);
    const after = declaredKeys(namespace.renamed(module, to));
    expect(before.filter((each) => names(each.key, module)).length).toBeGreaterThan(0);
    expect(after.filter((each) => names(each.key, module))).toEqual([]);
    expect(after.filter((each) => !names(each.key, to))).toEqual(before.filter((each) => !names(each.key, module)));
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
        // A line the engine will not take standing alone says why in the engine's own words, carried as its own note, so what the page says beside a line and what the engine says about it cannot come apart.
        const refused = ((): string | undefined => {
          try {
            owner.parse(splitSections(written)[0]!);
            return undefined;
          } catch (error) {
            return error instanceof Error ? error.message : String(error);
          }
        })();
        expect(refused === undefined || (line.note !== undefined && refused.includes(line.note)), `${written}\n\n${refused}`).toBe(true);
        // The shape shown and the line shown are the same claim written twice, and a reader who cannot read one off the other has been told nothing.
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
