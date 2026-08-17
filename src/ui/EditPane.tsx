import { useEffect, useRef } from 'react';
import { Console } from './Console';
import { draftIn, kindsIn, openedIn, rowsIn, sectionKey, type EditHeld } from './editControls';
import { useTestSurface } from './testSurface';
import type { Words } from './words';

// Two of the three filters over the one list — the third is the map, drawn
// where the locations already say they are. Nothing here reaches the registry:
// every control turns what is on screen into a line the shared table parses and
// hands it to the container's dispatch, which is the whole of what a control on
// this page can do.

// What the Global filter is set to when it is narrowing to nothing.
const OPEN_TO_ALL = '';

export function EditPane({ held, onSend, words }: { held: EditHeld; onSend: (line: string) => void; words: Words }): JSX.Element {
  const list = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const restored = useRef(false);
  const { sections, editing, controls } = held;
  const rows = rowsIn(held);
  const open = openedIn(sections, editing);

  useTestSurface('edit', held);

  // Where the list was left and where the cursor was, put back once the thing
  // they are positions in is drawn. Once each: after that the scroller and the
  // caret are the author's, and putting them back again would take the page
  // away from whoever is using it.
  useEffect(() => {
    if (list.current) list.current.scrollTop = editing.scroll;
  }, []);

  useEffect(() => {
    if (restored.current || !field.current) return;
    restored.current = true;
    field.current.setSelectionRange(editing.cursor, editing.cursor);
  }, [open]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-surface-raised px-3 py-2">
        {(['local', 'global'] as const).map((surface) => (
          <button
            key={surface}
            data-drive="edit.surface"
            type="button"
            data-surface={surface}
            data-showing={surface === editing.surface ? 'yes' : undefined}
            onClick={() => controls.surface(surface)}
            className={`rounded-xl border px-3 text-xs ${surface === editing.surface ? 'border-accent bg-accent-strong font-semibold text-accent-text' : 'border-border bg-panel text-text-subtle'}`}
          >
            {words(surface)}
          </button>
        ))}
        {editing.surface === 'global' ? (
          <select
            data-drive="edit.kind"
            aria-label={words('every-kind')}
            value={editing.kind ?? OPEN_TO_ALL}
            onChange={(event) => controls.kind(event.target.value === OPEN_TO_ALL ? null : event.target.value)}
            className="rounded-xl border border-border bg-panel px-2 text-xs text-text"
          >
            <option value={OPEN_TO_ALL}>{words('every-kind')}</option>
            {kindsIn(held).map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
        ) : null}
        {/* The whole module rather than the section open, so it is reachable
            with nothing open: this hands over what the store holds. */}
        <button
          data-drive="edit.copy"
          type="button"
          onClick={controls.copy}
          className="ml-auto rounded-xl border border-border bg-panel px-3 text-xs text-text-subtle transition-transform duration-75 active:scale-[0.97]"
        >
          {words('copy')}
        </button>
      </div>

      <div ref={list} className="unbarred min-h-0 flex-1 overflow-y-auto px-3 py-2" onScroll={(event) => controls.scroll(event.currentTarget.scrollTop)}>
        <div className="flex flex-col gap-1">
          {rows.map((section) => (
            <button
              key={sectionKey(section)}
              data-drive="edit.open"
              type="button"
              data-section={sectionKey(section)}
              data-opened={sectionKey(section) === editing.open ? 'yes' : undefined}
              onClick={() => controls.open(sectionKey(section) === editing.open ? null : sectionKey(section))}
              className={`rounded-xl border px-3 py-2 text-left font-mono text-xs ${
                sectionKey(section) === editing.open ? 'border-accent bg-accent-strong text-accent-text' : 'border-border bg-panel'
              } ${section.staged ? 'italic' : ''}`}
            >
              {`# ${section.kind} ${section.address}`}
            </button>
          ))}
        </div>
      </div>

      {open ? (
        <div className="flex shrink-0 flex-col gap-2 border-t border-border bg-surface-raised p-3">
          <textarea
            ref={field}
            data-drive="edit.text"
            aria-label={words('section')}
            value={draftIn(sections, editing)}
            rows={8}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            onChange={(event) => controls.text(event.target.value)}
            onSelect={(event) => controls.cursor(event.currentTarget.selectionStart)}
            className="select-text rounded-xl border border-border bg-panel px-3 py-2 font-mono text-xs text-text outline-none focus:border-accent"
          />
          <div className="flex flex-wrap gap-2">
            <button
              data-drive="edit.stage"
              type="button"
              onClick={controls.stage}
              className="grow rounded-xl bg-accent px-3 text-sm font-medium text-accent-text transition-transform duration-75 active:scale-[0.97]"
            >
              {words('stage')}
            </button>
            <button
              data-drive="edit.unstage"
              type="button"
              disabled={!open.staged}
              onClick={controls.unstage}
              className="grow rounded-xl border border-border bg-panel px-3 text-sm text-text-subtle transition-transform duration-75 active:scale-[0.97] disabled:opacity-50"
            >
              {words('unstage')}
            </button>
          </div>
        </div>
      ) : null}

      <Console onSend={onSend} words={words} />
    </div>
  );
}
