// Copilot-style inline ghost text: a dimmed suggestion rendered right after
// the cursor, accepted with Tab. There's no first-party CodeMirror package
// for this (the stable @codemirror/autocomplete only ships the dropdown
// style) — it's hand-built on view decorations + a state field, the same
// pattern every "AI ghost text in CodeMirror" implementation uses.
import { acceptCompletion } from '@codemirror/autocomplete';
import { Prec, StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, keymap, WidgetType } from '@codemirror/view';
import type { DslCompletionSources } from './dslCompletions';
import { bestGhostTextMatch, detectCompletionKind } from './dslCompletions';

type GhostSuggestion = { pos: number; text: string } | null;

class GhostTextWidget extends WidgetType {
  constructor(readonly text: string) {
    super();
  }
  eq(other: GhostTextWidget): boolean {
    return other.text === this.text;
  }
  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.textContent = this.text;
    span.style.opacity = '0.45';
    span.style.pointerEvents = 'none';
    return span;
  }
}

export const setGhostText = StateEffect.define<GhostSuggestion>();

export const ghostTextField = StateField.define<GhostSuggestion>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setGhostText)) return effect.value;
    }
    // Any other change (typing, cursor move) invalidates the previous
    // suggestion — the update listener below recomputes and re-sets it.
    if (tr.docChanged || tr.selection) return null;
    return value;
  },
  provide: (field) =>
    EditorView.decorations.from(field, (value) => {
      if (!value) return Decoration.none;
      return Decoration.set([Decoration.widget({ widget: new GhostTextWidget(value.text), side: 1 }).range(value.pos)]);
    }),
});

const acceptGhostText = (view: EditorView): boolean => {
  const value = view.state.field(ghostTextField);
  if (!value) return false;
  view.dispatch({
    changes: { from: value.pos, insert: value.text },
    selection: { anchor: value.pos + value.text.length },
    effects: setGhostText.of(null),
  });
  return true;
};

// Explicit precedence, not ambient ordering: Tab tries ghost text first,
// then an open completion-dropdown selection, then falls through (e.g. to
// indent) if neither applies. Without Prec.highest, whichever of
// basicSetup's own keymaps (indent-on-tab, etc.) happens to be combined
// first could silently win instead, which is exactly the kind of
// library-internal-ordering fragility this is meant to avoid.
export const ghostTextKeymap = Prec.highest(
  keymap.of([{ key: 'Tab', run: (view) => acceptGhostText(view) || acceptCompletion(view) }]),
);

// Recomputes the ghost-text suggestion after every doc/selection change:
// only when the cursor sits at a recognized field (give:/set:/xp:/...) and
// there's a single unambiguous best match longer than what's typed. Takes a
// *getter* for the same reason dslCompletionSource does — see there.
export const ghostTextUpdateListener = (getSources: () => DslCompletionSources) =>
  EditorView.updateListener.of((update) => {
    if (!update.docChanged && !update.selectionSet) return;
    const pos = update.state.selection.main.head;
    const line = update.state.doc.lineAt(pos);
    const textBeforeCursor = line.text.slice(0, pos - line.from);
    const kind = detectCompletionKind(textBeforeCursor);
    if (!kind) return;

    const wordMatch = /[\w.-]*$/.exec(textBeforeCursor);
    const typed = wordMatch ? wordMatch[0] : '';
    const suggestionText = bestGhostTextMatch(typed, getSources()[kind]);
    if (!suggestionText) return;

    const remainder = suggestionText.slice(typed.length);
    update.view.dispatch({ effects: setGhostText.of({ pos, text: remainder }) });
  });
