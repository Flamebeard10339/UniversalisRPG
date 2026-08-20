// OPEN REVIEW FINDINGS — 2026-08-20. Nothing below is fixed. Delete a line when
// it is, and delete this block when it is empty. Every one was reproduced.
//
// Two causes, twelve symptoms.
//
// A. The error paths lose the author's words instead of refusing them. The old
//    engine prevents this with `sectionParser`'s `requireBlocksRead` and with
//    `requireEnd`; neither was carried over, and `structure.ts:31` already
//    names this as the failure five readers walked into.
//      1. An indented block nobody consumed is dropped in silence.
//         `food, +3 regeneration` over an indented `drain: 3 health from them`
//         parses to two tags and no complaint. `swing: say: hi` over an
//         indented `say: dropped` keeps only the inline result. `loadModule`
//         refuses both. The inline-vs-block fork is written three times —
//         `Written.read`, the action branch of `readLine`, and `BareField.read`
//         — and only the first checks.
//      2. No `requireEnd` after a value. `max-level: 40 garbage` reads 40 and
//         drops the rest; `slot: mainhand offhand` reads `mainhand`. This
//         contradicts rule 1 above: if a statement is a line, what is left on
//         the line is an error, not a place to stop.
//      5. `identifies` walks an array through its object path, so a shorter
//         array matches any array it prefixes. A `+` naming a member that
//         prefixes an existing one is silently not added; a `-` naming one
//         removes the whole block. The `-` half is the documented intent; the
//         `+` half is not. Fix is to demand equal length for arrays, not to
//         drop partial matching, which is right for optional scalars.
//     14. `-swing: say: hi` discards the body the author wrote. `+label:` on an
//         unknown label creates an action; the old engine refuses it.
//     15. `+tags: food` then a bare `food, gold` is refused as defined twice,
//         but the reverse order is accepted and edits. The old engine refuses
//         both, by name.
//
// B. The base assumes shapes it should be told. Each is a `SectionSchema`
//    property in the old design and a hardcoded name here.
//      3. `Field.site` reaches at most one top-level id per field, so `tags`,
//         `onHit`, `whenHit` and `actions` contribute no reference sites at
//         all — `referenceSites` returns [] for a section carrying four real
//         ids. This is a gap in the type, not a bug in the body: a tag clause's
//         stat and a hook's item ids live in the value grammar, so `Parser`
//         has to declare its own sites for this to work.
//      6. `actions`, `actionBody` and `actionLines` are hardcoded in four
//         places, so `# entity` — whose open table is `blocks` and whose labels
//         are actions or event handlers — cannot be expressed without editing
//         this file. `offersActions` is a second declaration of the same fact
//         with nothing checking the two agree.
//      9. `titled()`, `described()`, `tags()` and `hooks()` push their watch
//         unconditionally while their return type contributes `never` for a
//         kind lacking the property. So the kind gains a keyword it does not
//         have, an object is built with a field its type denies, and
//         `textFields` reports it to the localizer. This is the one hole in
//         `Watcher`'s exhaustiveness.
//
// And four on their own:
//      7. `keywordsAt` builds `elsewhere` from `source.slice(offset)`, which
//         includes the rest of the caret's own line, so the field being retyped
//         is never offered.
//      8. `keywordsAt` restates `KEY` with `/^[ \t]*[+-]/` and a `.replace`,
//         and the two disagree: `+ ta` is completed to `tags` and `+ tags:`
//         is then refused by the reader. Use `KEY`.
//     11. `printedLines` returns [] for an empty array before it consults
//         `authored`, which is the shape-guess `PrintOptions` argues against
//         two screens above. Latent: no list field has a non-empty fallback.
//     13. `ResultField.collection` names `hookResultList` rather than its own
//         `parser`, so a ResultField built on another list parser would read
//         and print through different grammars.
//
// Also: `withinOneEdit` is line-for-line identical to `grammar/section.ts:140`,
// minus its `SHORTEST_TYPO` guard, and no codec walk reaches this directory —
// `codec.test.ts` and `roundTrip.test.ts` glob `./*.ts`, not `./**/*.ts`.

import { Action, actionBody, actionLines } from '../../grammar/action';
import { ActionResult, hookResultList, resultLines, spansLines } from '../../grammar/actionResult';
import { Cursor, DslError, Parser, Span } from '../../grammar/parser';
import { hasBlock, indentLines, RawLine, RawSection, splitSections, takeBlock } from '../../grammar/structure';
import { TagClause, tagClause } from '../../grammar/tagClause';
import { humanizeEn, text } from '../../grammar/values';
import { list, ListParser } from '../../grammar/list';

// The section a kind extends. A kind says which fields it watches and what
// cannot be watched beside what; everything else — reading, printing, patching,
// the reference sites, the locale keys, and the complaints — is this file, once.
//
// The whole line grammar, and there is no third rule:
//
//   1. A statement is a line. Not a comma-separated run of them, which cost a
//      cursor loop with lookahead at every comma and is written four times in
//      all shipped content, every one of them a coordinate that wants to be one
//      field. A comma therefore separates list elements and nothing else.
//   2. A statement's value is written after the colon or as the block indented
//      under it, never both. Blocks are what the language already is.

// What a field's id was found to name, and where. The vocabulary of kinds is
// not this file's: a section knows that a field holds a reference and what it
// calls it, and whoever resolves references knows what the names mean.
export interface ReferenceSite {
  names: string;
  id: string;
  where: string;
}

export interface PrintOptions {
  // Which fields the author wrote, as `read` and `patch` report them. Not
  // optional: an object alone cannot say whether the title it holds was written
  // or minted, and guessing by comparing against the fallback drops
  // `title: Gold` on `# item gold` — a whole entry, silently.
  authored: ReadonlySet<string>;
  localId?: (id: string) => string;
}

// A section and the record of which of its fields the author wrote. The second
// half cannot be recovered from the first, which is why every door that builds
// one hands back both.
export interface Read<T> {
  value: T;
  authored: ReadonlySet<string>;
}

// What is wrong with a source, and whether it is wrong because the author has
// not finished typing it. An editor wants those apart: a half-written line is
// not a mistake to report, it is a caret waiting for the next character.
export interface Diagnostic {
  message: string;
  span?: Span;
  partial: boolean;
}

// One collection a `+` can add to and a `-` can take from, and what it holds:
// each member as the lines an author would write to name it.
export interface Editable {
  keyword: string;
  members: readonly (readonly string[])[];
}

// A `+` or `-` statement naming one member, in whichever of the two forms the
// member takes. Here rather than at each caller, because the fork is the
// language's and not the caller's.
export const editStatement = (op: '+' | '-', keyword: string, member: readonly string[]): string =>
  member.length === 1 ? `${op}${keyword}: ${member[0]}` : [`${op}${keyword}:`, ...indentLines(member)].join('\n');

export interface FieldOptions {
  // What an id written here names, in the vocabulary of whoever resolves
  // references. Declared by the kind, carried by this file, read by neither.
  names?: string;
  // Words a player reads, and so words a `# locale` may replace.
  words?: true;
}

const cursorOver = (line: RawLine, rest: string): Cursor => new Cursor(rest, 0, line.span.end - rest.length);

// ---------------------------------------------------------------- fields

export abstract class Field<V> {
  constructor(
    readonly keyword: string,
    readonly parser: Parser<V>,
    private readonly options: FieldOptions = {},
  ) {}

  get names(): string | undefined {
    return this.options.names;
  }

  get words(): boolean {
    return this.options.words === true;
  }

  // Whether a line reaches this field by writing its keyword. A bare field is
  // reached by position instead, which is why it is the one that answers false.
  get labelled(): boolean {
    return true;
  }

  // The grammar this field reads, when what it reads is a collection. A field
  // that answers says two things at once: `+` and `-` have members to act on,
  // and the value may be written as a block. Declared by the field rather than
  // sniffed off the parser, so nothing downstream casts on a guess.
  get collection(): ListParser<unknown> | undefined {
    return undefined;
  }

  get editable(): boolean {
    return this.collection !== undefined;
  }

  abstract read(line: RawLine, rest: string, where: string): V;

  protected abstract lines(value: V): string[];

  // What this field contributes to a printed section: its own spelling when the
  // author wrote it, and nothing when the loader filled it in. The rule lives
  // here so no subclass restates it.
  printedLines(key: string, value: V | undefined, options: PrintOptions): string[] {
    if (value === undefined || (Array.isArray(value) && value.length === 0)) return [];
    return options.authored.has(key) ? this.lines(value) : [];
  }

  // One member of this field's collection, written the way an author writes
  // it — one line for most, and a block for a member that nests. The same fork
  // `lines` takes for the whole field, asked of one member so that a `+` or a
  // `-` can name it.
  memberLines(member: unknown): string[] {
    const collection = this.collection;
    return collection === undefined ? [] : [collection.element.print(member)];
  }

  // The id this field's value holds, for a field that holds one. A value that
  // carries its id one level down overrides this and nothing else.
  protected idIn(value: V): string | undefined {
    return typeof value === 'string' ? value : undefined;
  }

  // Where the id this field holds points, or nothing when it holds none.
  site(value: V | undefined): ReferenceSite[] {
    const names = this.names;
    if (names === undefined || value === undefined) return [];
    const id = this.idIn(value);
    return id === undefined ? [] : [{ names, id, where: `${this.keyword}:` }];
  }
}

// The second rule, as code: a value is what follows the colon, or the block
// indented under it. Every labelled field reads that way, so it is here and not
// in three subclasses — and only a field that reads a collection has a block
// form at all, which is the same question `collection` already answers.
abstract class Written<V> extends Field<V> {
  read(line: RawLine, rest: string, where: string): V {
    if (rest !== '' && hasBlock(line)) throw new DslError(`${where}: ${this.keyword}: is written inline and as a block; give it one`, line.span);
    if (rest !== '') return this.parser.parse(cursorOver(line, rest));
    const collection = this.collection;
    if (!hasBlock(line) || collection === undefined) throw new DslError(`${where}: ${this.keyword}: takes a value`, line.span);
    return collection.parseBlock(takeBlock(line)) as V;
  }
}

// A phrase after the colon.
export class LineField<V> extends Written<V> {
  protected lines(value: V): string[] {
    return [`${this.keyword}: ${this.parser.print(value)}`];
  }
}

// The clause list a line carries with no label at all.
export class BareField<V> extends Field<V> {
  override get labelled(): boolean {
    return false;
  }

  read(line: RawLine, rest: string, _where: string): V {
    return this.parser.parse(cursorOver(line, rest));
  }

  protected lines(value: V): string[] {
    return [this.parser.print(value)];
  }
}

// Whether the amounts a field carries may be written as a range. A `constant`
// field refuses one as it reads the line, where the offending clause can still
// be named; a `range` field takes either. What a kind gains by settling a range
// is the kind's business, and it says which it takes when it watches the field.
export type Amounts = 'range' | 'constant';

// Held where the field can hand it back as the list parser it is, rather than
// casting its own erased `parser` into one.
const TAG_LIST: ListParser<TagClause> = list(tagClause);

class TagsField extends BareField<TagClause[]> {
  constructor(private readonly amounts: Amounts) {
    super('tags', TAG_LIST);
  }

  override get collection(): ListParser<unknown> {
    return TAG_LIST as ListParser<unknown>;
  }

  override read(line: RawLine, rest: string, where: string): TagClause[] {
    const clauses = super.read(line, rest, where);
    if (this.amounts === 'range') return clauses;
    for (const tag of clauses) {
      if (tag.kind === 'stat-bonus' && !tag.percent && tag.amount.min !== tag.amount.max) {
        const sign = tag.amount.min < 0 ? '-' : '+';
        throw new DslError(`${where}: ${sign}${Math.abs(tag.amount.min)}-${Math.abs(tag.amount.max)} ${tag.statId} is a range, and ${this.keyword}: here takes one value`, line.span);
      }
    }
    return clauses;
  }
}

// Results, written after the colon when they fit a line and as a block when
// they do not. The same fork the printer takes, so what comes back is what a
// reader would have written by hand.
class ResultField extends LineField<ActionResult[]> {
  override get collection(): ListParser<unknown> {
    return hookResultList as ListParser<unknown>;
  }

  override memberLines(member: unknown): string[] {
    return resultLines(member as ActionResult);
  }

  protected override lines(value: ActionResult[]): string[] {
    if (!spansLines(value)) return super.lines(value);
    return [`${this.keyword}:`, ...indentLines(value.flatMap(resultLines))];
  }
}

// A field holding a value whose id sits one level down, reached by a reader the
// caller supplies — `cluster-effect:`'s stat, and whatever joins it later.
export class NestedIdField<V> extends LineField<V> {
  constructor(
    keyword: string,
    parser: Parser<V>,
    options: FieldOptions,
    private readonly reach: (value: V) => string,
  ) {
    super(keyword, parser, options);
  }

  protected override idIn(value: V): string {
    return this.reach(value);
  }
}

// ---------------------------------------------------------------- watching

// The properties a kind can watch. `id` is the heading and `actions` is the
// open half of the table, so neither is a field.
type Watchable<T> = Exclude<keyof T, 'id' | 'actions'> & string;

interface Relations<T> {
  // Fields this one cannot be written beside. Declared once, on either of the
  // pair; the check reads it both ways.
  excludes?: readonly Watchable<T>[];
  // Fields this one is meaningless without.
  requires?: readonly Watchable<T>[];
}

// How a watched field comes to hold something. A property the kind declares
// optional may simply be absent, so it needs neither answer. A property the
// kind declares it always has must be settled one of two ways, and saying
// neither does not compile: `fallback` is what the loader fills in when the
// author wrote nothing, and `required: true` is a field only the author can
// settle, so a section that leaves it out does not parse.
type Settle<T, K extends keyof T> = undefined extends T[K]
  ? { fallback?: (id: string) => NonNullable<T[K]>; required?: never }
  : { fallback: (id: string) => NonNullable<T[K]>; required?: never } | { fallback?: never; required: true };

export type WatchOptions<T, K extends keyof T> = Relations<T> & Settle<T, K>;

// A field with nothing to settle and nothing it excludes needs no options at
// all, and a field that must be settled cannot omit them. One signature says
// both, so an empty object is not a tax every optional field pays.
type WatchArgs<T, K extends keyof T> = undefined extends T[K] ? [options?: WatchOptions<T, K>] : [options: WatchOptions<T, K>];

// What a watch carries once its type has done its work.
interface Watch {
  key: string;
  field: Field<unknown>;
  excludes: readonly string[];
  requires: readonly string[];
  fallback?: (id: string) => unknown;
  required: boolean;
}

const watchOf = (key: string, field: Field<unknown>, extra: Partial<Watch> = {}): Watch => ({ key, field, excludes: [], requires: [], required: false, ...extra });

// The declaration, as a chain. `Have` accumulates what has been watched, and
// it sits in a contravariant position so that a chain missing a field is not
// assignable to the return type `Section` demands — which is what makes a
// property added to the kind's interface and never watched a compile error
// rather than a field that silently stops existing.
export class Watcher<T extends { id: string }, Have extends string> {
  private declare readonly covered: (have: Have) => void;

  constructor(private readonly into: Watch[]) {}

  // Every step below is this one: record the watches, and hand back the same
  // chain saying it now covers more. The cast is the whole reason it is one
  // method — `Have` is a phantom, and this is the only place it moves.
  private adds<K extends string>(...watches: Watch[]): Watcher<T, Have | K> {
    this.into.push(...watches);
    return this as unknown as Watcher<T, Have | K>;
  }

  watch<K extends Watchable<T>>(key: K, field: Field<NonNullable<T[K]>>, ...rest: WatchArgs<T, K>): Watcher<T, Have | K> {
    const options = rest[0] as (Relations<T> & { fallback?: (id: string) => unknown; required?: boolean }) | undefined;
    return this.adds<K>(
      watchOf(key, field as unknown as Field<unknown>, {
        excludes: (options?.excludes ?? []) as readonly string[],
        requires: (options?.requires ?? []) as readonly string[],
        fallback: options?.fallback,
        required: options?.required === true,
      }),
    );
  }

  // The two fields most kinds carry, asked for by name rather than spelled out:
  // a kind says it has one, and what the keyword is, what reads it and what the
  // engine mints when nobody wrote one stay here. Two steps rather than one
  // because they do not travel together — `# stat` is titled and describes
  // nothing — and a kind that takes neither simply asks for neither.
  titled(): Watcher<T, Have | (Extract<keyof T, 'title'> & string)> {
    return this.adds(watchOf('title', new LineField<string>('title', text, { words: true }) as unknown as Field<unknown>, { fallback: humanizeEn }));
  }

  described(): Watcher<T, Have | (Extract<keyof T, 'examine'> & string)> {
    return this.adds(watchOf('examine', new LineField<string>('examine', text, { words: true }) as unknown as Field<unknown>));
  }

  // The bare clause list, and whether its amounts may be written as ranges.
  tags(amounts: Amounts = 'range'): Watcher<T, Have | (Extract<keyof T, 'tags'> & string)> {
    return this.adds(watchOf('tags', new TagsField(amounts) as unknown as Field<unknown>, { fallback: () => [] }));
  }

  // The two moments a holder answers, read off whoever carries the thing. A
  // kind watches them when its objects are carried; what being carried means
  // for that kind is the kind's business.
  hooks(): Watcher<T, Have | (Extract<keyof T, 'onHit' | 'whenHit'> & string)> {
    return this.adds(
      watchOf('onHit', new ResultField('on hit', hookResultList) as unknown as Field<unknown>, { fallback: () => [] }),
      watchOf('whenHit', new ResultField('when hit', hookResultList) as unknown as Field<unknown>, { fallback: () => [] }),
    );
  }
}

// ---------------------------------------------------------------- editing

// A `-` names as much of a member as it takes to identify it, so removing an
// entry written with extra fields does not mean repeating them.
function identifies(pattern: unknown, candidate: unknown): boolean {
  if (typeof pattern !== 'object' || pattern === null || typeof candidate !== 'object' || candidate === null) return pattern === candidate;
  return Object.entries(pattern).every(([key, value]) => identifies(value, (candidate as Record<string, unknown>)[key]));
}

// Operators apply in source order, so `+a` then `-a` leaves it absent and the
// reverse leaves it present. No reordering, no set algebra.
function edited(held: unknown, op: '+' | '-', operands: unknown[]): unknown[] {
  let values = Array.isArray(held) ? [...held] : [];
  for (const operand of operands) {
    if (op === '-') values = values.filter((value) => !identifies(operand, value));
    else if (!values.some((value) => identifies(operand, value))) values.push(operand);
  }
  return values;
}

// One insertion, deletion or substitution apart. What makes `on hi:` a typo
// for `on hit:` rather than a verb an item offers.
function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  let i = 0;
  let edits = 0;
  for (let j = 0; j < longer.length; j++) {
    if (shorter[i] === longer[j]) i++;
    else if (++edits > 1) return false;
    else if (shorter.length === longer.length) i++;
  }
  return edits + (shorter.length - i) <= 1;
}

// ---------------------------------------------------------------- the section

// What a walk over every kind can ask of one, which is the public half of
// `Section` with the kind's own type forgotten. `Section<T>` itself is no use
// to such a walk: its declaration is protected and takes the kind's own
// `Watcher`, so no two kinds share a supertype through it.
//
// Forgetting the type costs one thing, deliberately: the value parameters
// below are `{ id: string }`, and TypeScript compares method parameters
// bivariantly, so `item.print(aPassive)` type-checks through this interface
// where `item.print` itself refuses it. Reach a kind through its own export
// when the kind is known, and through this only to do to every kind alike
// what does not depend on which it is.
export interface AnySection {
  readonly kind: string;
  readonly examples: readonly string[];
  readonly keywords: readonly string[];
  readonly textFields: readonly string[];
  parse(source: string): { id: string };
  read(source: string): Read<{ id: string }>;
  patch(base: Read<{ id: string }>, source: string): Read<{ id: string }>;
  print(value: { id: string }, options: PrintOptions): string;
  referenceSites(value: { id: string }): ReferenceSite[];
  editable(value: { id: string }): Editable[];
  diagnose(source: string): Diagnostic[];
  keywordsAt(source: string, offset: number): readonly string[];
}

// The label a statement leads with, and whether it edits rather than replaces.
// The one spelling of it: everything that asks what a statement starts with
// asks this, so no second reading of the same grammar can drift from it.
const KEY = /^(?<op>[+-])?(?<key>[a-z][a-z0-9 -]*?):[ \t]*/;

export abstract class Section<T extends { id: string }> {
  abstract readonly kind: string;

  // Authored spellings of a whole section of this kind, the way `Parser` holds
  // the spellings of one value. They are what a reference page prints, so they
  // are written to be read rather than to be exhaustive — and because they are
  // real source, a check parses each one and prints it back, which is what
  // stops the page from documenting a grammar the kind stopped accepting. A
  // kind that offers none is caught by the walk over every kind rather than by
  // a tuple every kind pays for.
  abstract readonly examples: readonly string[];

  // Whether a label the field table does not claim opens an action the object
  // offers. Closed table, open verbs — or no verbs at all.
  protected readonly offersActions: boolean = false;

  // The kind's own fields, in print order, watched onto the chain it is handed.
  // Every property of the kind but `id` and `actions` has to be reached, which
  // is what the return type says and what a missing one fails to satisfy.
  protected abstract declareFields(section: Watcher<T, never>): Watcher<T, Watchable<T>>;

  private built?: Watch[];

  // Built on first ask rather than in a constructor, so a subclass's own
  // property initialisers have run by the time its declaration is read.
  private get watched(): Watch[] {
    if (this.built === undefined) {
      const into: Watch[] = [];
      this.built = into;
      this.declareFields(new Watcher<T, never>(into));
    }
    return this.built;
  }

  // The keywords a statement may be labelled with, which is what an editor
  // offers. A bare field is not among them: it is reached by position.
  get keywords(): readonly string[] {
    return this.watched.filter((watch) => watch.field.labelled).map((watch) => watch.field.keyword);
  }

  // The fields a `# locale` may replace, derived from which hold words.
  get textFields(): readonly string[] {
    return this.watched.filter((watch) => watch.field.words).map((watch) => watch.key);
  }

  private watchFor(key: string): Watch | undefined {
    return this.watched.find((watch) => watch.key === key);
  }

  private label(key: string): string {
    return `${this.watchFor(key)?.field.keyword ?? key}:`;
  }

  private held(value: { id: string }, key: string): unknown {
    return (value as unknown as Record<string, unknown>)[key];
  }

  // ------------------------------------------------------------ text in

  parse(source: string): T {
    return this.read(source).value;
  }

  read(source: string): Read<T> {
    return this.build(this.only(source));
  }

  // A patch section applied to something already read: fields it writes
  // replace, `+` and `-` edit what is there, and fields it leaves out are
  // untouched. Whether a section creates or edits is not declared — it follows
  // from whether it was handed a base. What comes back is another `Read`, so
  // what the author wrote is still known after any number of patches, and so a
  // rule about two fields that exclude each other can be asked of all of it.
  patch(base: Read<T>, source: string): Read<T> {
    return this.build(this.only(source), base);
  }

  private only(source: string): RawSection {
    const sections = splitSections(source);
    if (sections.length !== 1) throw new DslError(`expected one # ${this.kind} section, got ${sections.length}`);
    return sections[0]!;
  }

  private build(section: RawSection, base?: Read<T>): Read<T> {
    if (section.kind !== this.kind) throw new DslError(`expected # ${this.kind}, got # ${section.kind}`, section.span);
    if (!section.id) throw new DslError(`# ${this.kind} requires an id`, section.span);

    const written: Record<string, unknown> = {};
    const actions: Action[] = base === undefined ? [] : [...((this.held(base.value, 'actions') as Action[] | undefined) ?? [])];
    for (const line of section.body) this.readLine(line, section.id, written, actions, base);

    // Everything an author has written about this object, this section and
    // every section before it — which is what a rule about two fields that
    // exclude each other has to be asked of, or a patch adding one to an object
    // that already carries the other walks straight past it.
    const authored: ReadonlySet<string> = new Set([...(base?.authored ?? []), ...Object.keys(written)]);
    this.refuseImpossible(authored, section);

    const built: Record<string, unknown> = { id: section.id };
    if (this.offersActions) built.actions = actions;
    for (const watch of this.watched) {
      const value = written[watch.key] ?? (base === undefined ? undefined : this.held(base.value, watch.key)) ?? watch.fallback?.(section.id);
      if (value === undefined) {
        if (watch.required) throw new DslError(`# ${this.kind} ${section.id}: ${watch.field.keyword}: is required`, section.span);
        continue;
      }
      built[watch.key] = value;
    }
    return { value: built as unknown as T, authored };
  }

  // The one complaint about a whole section: two fields that exclude each other
  // both written, or one written without what it needs. Asked of what has been
  // authored rather than of what was built, so a field the loader filled in for
  // itself never triggers either.
  private refuseImpossible(authored: ReadonlySet<string>, section: RawSection): void {
    const where = `# ${this.kind} ${section.id}`;
    for (const watch of this.watched) {
      if (!authored.has(watch.key)) continue;
      for (const other of watch.excludes) {
        if (authored.has(other)) throw new DslError(`${where}: ${this.label(watch.key)} and ${this.label(other)} cannot both be set`, section.span);
      }
      for (const other of watch.requires) {
        if (!authored.has(other)) throw new DslError(`${where}: ${this.label(watch.key)} means nothing without ${this.label(other)}`, section.span);
      }
    }
  }

  // Why this label cannot open an action: it is one a watched field answers to,
  // or near enough to one that the author meant that field. Derived from the
  // watched keywords, so a field added to a kind closes its own near misses.
  private labelProblem(label: string): string | undefined {
    for (const { field } of this.watched) {
      if (field.keyword === label) return `${label}: is a field of a # ${this.kind}, not an action it offers`;
      if (field.keyword.startsWith(`${label} `)) return `${label}: is the start of ${field.keyword}:, a field of a # ${this.kind} — finish it, or name the action something else`;
      if (withinOneEdit(field.keyword, label)) return `${label}: is one letter from ${field.keyword}:, a field of a # ${this.kind} — an action of that name would swallow the field`;
    }
    return undefined;
  }

  private readLine(line: RawLine, sectionId: string, written: Record<string, unknown>, actions: Action[], base?: Read<T>): void {
    const heading = KEY.exec(line.text);
    const key = heading?.groups?.key;
    const op = heading?.groups?.op as '+' | '-' | undefined;
    const rest = heading === null ? line.text : line.text.slice(heading[0].length);
    const where = `# ${this.kind} ${sectionId}`;
    const named = key === undefined ? undefined : this.watched.find((watch) => watch.field.keyword === key);

    if (key !== undefined && named === undefined) {
      if (!this.offersActions) throw new DslError(`${where}: unknown field ${key}`, line.span);
      const problem = this.labelProblem(key);
      if (problem !== undefined) throw new DslError(`${where}: ${problem}`, line.span);
      // A `-swing:` takes the verb away; anything else is a verb the object
      // offers, which is what makes the field table closed and the labels open.
      const at = actions.findIndex((action) => action.label === key);
      if (op === '-') {
        if (at !== -1) actions.splice(at, 1);
        return;
      }
      const body = rest === '' ? actionBody.parseBlock(takeBlock(line), key) : actionBody.parse(cursorOver(line, rest), key);
      const verb = { label: key, ...body } as Action;
      if (at === -1) actions.push(verb);
      else actions[at] = verb;
      return;
    }

    const watch = named ?? this.watched.find((each) => !each.field.labelled);
    if (watch === undefined) throw new DslError(`${where}: unexpected content ${JSON.stringify(line.text)}`, line.span);
    // A bare field is reached by position. Its keyword is not a label an author
    // may write — except after a `+` or `-`, which needs a name to address.
    if (named !== undefined && !watch.field.labelled && op === undefined) {
      throw new DslError(`${where}: ${watch.field.keyword} is written bare, without a '${watch.field.keyword}:' label`, line.span);
    }
    if (op !== undefined && !watch.field.editable) throw new DslError(`${where}: ${watch.field.keyword}: is not a list, so it cannot take ${op}`, line.span);

    const read = watch.field.read(line, named === undefined ? line.text : rest, where);
    if (op === undefined) {
      if (written[watch.key] !== undefined) throw new DslError(`${where}: ${watch.field.keyword}: is defined more than once`, line.span);
      written[watch.key] = read;
      return;
    }
    const held = written[watch.key] ?? (base === undefined ? undefined : this.held(base.value, watch.key));
    written[watch.key] = edited(held, op, read as unknown[]);
  }

  // ------------------------------------------------------------ text out

  print(value: T, options: PrintOptions): string {
    const lines = [`# ${this.kind} ${options.localId?.(value.id) ?? value.id}`];
    for (const watch of this.watched) lines.push(...watch.field.printedLines(watch.key, this.held(value, watch.key), options));
    for (const action of (this.held(value, 'actions') as Action[] | undefined) ?? []) lines.push(...actionLines(action));
    return lines.join('\n');
  }

  // ------------------------------------------------------------ questions

  // Where the ids inside a section point, asked of the fields rather than of a
  // list kept beside them. The resolver asks for these; it never asks what
  // fields a kind has.
  referenceSites(value: T): ReferenceSite[] {
    return this.watched.flatMap((watch) => watch.field.site(this.held(value, watch.key)));
  }

  // The collections a `+` can add to and a `-` can take from, and what each
  // holds right now — every member as the lines an author would write to name
  // it. Derived from which fields read a collection, so nothing here names a
  // field or a kind.
  editable(value: T): Editable[] {
    return this.watched
      .filter((watch) => watch.field.editable)
      .map((watch) => ({
        keyword: watch.field.keyword,
        members: ((this.held(value, watch.key) as unknown[] | undefined) ?? []).map((member) => watch.field.memberLines(member)),
      }));
  }

  // What is wrong with a source, said rather than thrown, and marked with
  // whether it is wrong only because it is unfinished. Nothing here reads the
  // language for itself: the split and the read are what run, and this reports
  // what they say.
  diagnose(source: string): Diagnostic[] {
    // Unfinished rather than wrong: the last thing typed is a label with
    // nothing after it, so the next keystroke may settle it. Asked with the one
    // statement pattern there is, so it cannot drift from what a read accepts.
    const trimmed = source.trimEnd();
    const last = trimmed.slice(trimmed.lastIndexOf('\n') + 1).trim();
    const unfinished = trimmed === '' || KEY.exec(last)?.[0].length === last.length;
    try {
      this.read(source);
      return [];
    } catch (raw) {
      if (!(raw instanceof DslError)) throw raw;
      return [{ message: raw.message, span: raw.span, partial: unfinished }];
    }
  }

  // Every keyword that could legally start the statement the caret sits in.
  keywordsAt(source: string, offset: number): readonly string[] {
    const start = source.lastIndexOf('\n', Math.max(0, offset - 1)) + 1;
    const before = source.slice(start, offset);
    // Past a colon the caret is in a value, and a value's spellings belong to
    // its own parser rather than to the section.
    if (before.includes(':')) return [];
    // After a `+` or `-` the statement edits rather than replaces, so what is
    // legal there is every field that holds a collection — a bare one included,
    // since naming it is the only way to address it — and a field already
    // written is still editable, which is the whole point of a patch.
    const editing = /^[ \t]*[+-]/.test(before);
    const typed = before.trim().replace(/^[+-][ \t]*/, '');
    if (editing) return this.watched.filter((watch) => watch.field.editable && watch.field.keyword.startsWith(typed)).map((watch) => watch.field.keyword);
    // A field written elsewhere in the section is not offered again: writing
    // one twice is the one thing the reader refuses outright.
    const elsewhere = new Set<string>();
    for (const line of [...source.slice(0, start).split('\n'), ...source.slice(offset).split('\n')]) {
      const key = KEY.exec(line.trim())?.groups?.key;
      if (key !== undefined) elsewhere.add(key);
    }
    return this.keywords.filter((keyword) => !elsewhere.has(keyword) && keyword.startsWith(typed));
  }
}
