// Lightweight syntax highlighting for the content DSL (docs/content-dsl-grammar.md).
// A full Lezer grammar is overkill for a line/indent-oriented format with no
// nesting beyond one level — StreamLanguage's per-line token stream covers
// everything asked for (object headers, keys) with a handful of regexes.
import { HighlightStyle, StreamLanguage, StringStream, syntaxHighlighting } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';

export type DslTokenState = {
  // `# advanced` is followed by a raw JSON block; suppress key/header
  // detection until the next `#`/`##` line so JSON's own `"quoted": keys`
  // (which the bare-word key regex below doesn't match anyway) don't get a
  // half-applied style.
  inAdvancedBlock: boolean;
};

const sectionHeaderPattern = /^#\s+\S.*$/;
const objectHeaderPattern = /^##\s+\S.*$/;
// A line-leading run of letters/digits/spaces/hyphens up to a colon is a tag
// keyword or action title — both are the same `keyword: value` shape per the
// grammar ("A keyword that takes a value is always written keyword: value").
// Tolerates leading indentation itself (rather than relying on a separate
// eatSpace call first) so an indented continuation tag like `  requires:`
// still matches at its line's first token() call, while it's still sol().
const keyPattern = /^[ \t]*[A-Za-z][A-Za-z0-9 -]*:/;
const bracketRefPattern = /^\[\[[^\]]*\]\]/;
const speakerPattern = /^\([^)]*\)/;
// `\b` only makes sense after "goto" (ends in a word char) — "->" ends in a
// non-word char, so a following space would never satisfy \b there.
const arrowPattern = /^(?:->|goto\b)/;
const inlineConditionalPattern = /^\{[^{}]*\}/;

export const dslStartState = (): DslTokenState => ({ inAdvancedBlock: false });

export const dslToken = (stream: StringStream, state: DslTokenState): string | null => {
  if (stream.sol()) {
    if (sectionHeaderPattern.test(stream.string) && !objectHeaderPattern.test(stream.string)) {
      state.inAdvancedBlock = /^#\s+advanced\b/.test(stream.string);
      stream.skipToEnd();
      return 'heading';
    }
    if (objectHeaderPattern.test(stream.string)) {
      state.inAdvancedBlock = false;
      stream.skipToEnd();
      return 'heading2';
    }
    if (!state.inAdvancedBlock && stream.match(keyPattern)) return 'propertyName';
  }

  if (state.inAdvancedBlock) {
    stream.skipToEnd();
    return null;
  }

  if (stream.eatSpace()) return null;
  if (stream.match(bracketRefPattern)) return 'link';
  if (stream.match(speakerPattern)) return 'variableName';
  if (stream.match(arrowPattern)) return 'keyword';
  if (stream.match(inlineConditionalPattern)) return 'string';

  stream.next();
  return null;
};

export const dslLanguage = StreamLanguage.define<DslTokenState>({
  startState: dslStartState,
  token: dslToken,
});

export const dslHighlightStyle = HighlightStyle.define([
  { tag: t.heading, color: '#67e8f9', fontWeight: 'bold' },
  { tag: t.heading2, color: '#5eead4', fontWeight: 'bold' },
  { tag: t.propertyName, color: '#fbbf24' },
  { tag: t.link, color: '#c4b5fd' },
  { tag: t.variableName, color: '#93c5fd' },
  { tag: t.keyword, color: '#f472b6' },
  { tag: t.string, color: '#86efac' },
]);

export const dslSyntaxHighlighting = syntaxHighlighting(dslHighlightStyle);

// `@uiw/react-codemirror`'s theme="dark" pulls in @codemirror/theme-one-dark,
// which registers its own (non-fallback) syntaxHighlighting — CodeMirror
// unions the CSS classes from every non-fallback highlighter onto a span, so
// oneDark's colors were winning the cascade over dslHighlightStyle's. Using
// theme="none" plus this minimal dark chrome extension instead means
// dslSyntaxHighlighting is the only highlighter registered, so there's
// nothing left to race against.
export const dslEditorTheme = EditorView.theme({
  '&': { backgroundColor: '#0f172a', color: '#e2e8f0' },
  '.cm-content': { caretColor: '#38bdf8' },
  '.cm-gutters': { backgroundColor: '#0f172a', color: '#64748b', borderRight: '1px solid #1e293b' },
  '.cm-activeLine': { backgroundColor: 'rgba(148, 163, 184, 0.08)' },
  '.cm-activeLineGutter': { backgroundColor: 'rgba(148, 163, 184, 0.08)' },
  '.cm-selectionBackground, .cm-content ::selection': { backgroundColor: 'rgba(56, 189, 248, 0.25) !important' },
}, { dark: true });
