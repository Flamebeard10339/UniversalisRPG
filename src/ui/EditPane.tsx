import { useEffect, useRef } from 'react';
import { Console } from './Console';
import { DevOnly } from './DevOnly';
import { draftIn, kindsIn, openedIn, rowsIn, sectionKey, type EditHeld } from './editControls';
import { useTestSurface } from './useTestSurface';
import type { Words } from './words';

const OPEN_TO_ALL = '';

export function EditPane({ held, dev, onSend, words }: { held: EditHeld; dev: boolean; onSend: (line: string) => void; words: Words }): JSX.Element {
  const list = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const restored = useRef(false);
  const { sections, standing, places, editing, controls } = held;
  const rows = rowsIn(held);
  const open = openedIn(sections, editing);

  useTestSurface('edit', held);

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
      <DevOnly dev={dev}>
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
        {editing.surface === 'local' ? (
          <select
            data-drive="edit.stand"
            aria-label={words('local')}
            value={standing.location}
            onChange={(event) => controls.stand(event.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-border bg-panel px-2 text-xs text-text"
          >
            {places.map((place) => (
              <option key={place.id} value={place.id}>
                {place.title}
              </option>
            ))}
          </select>
        ) : null}
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
                sectionKey(section) === editing.open
                  ? 'border-accent bg-accent-strong text-accent-text'
                  : section.staged
                    ? 'border-warning bg-panel text-warning'
                    : 'border-border bg-panel'
              }`}
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
      </DevOnly>

      <Console onSend={onSend} words={words} />
    </div>
  );
}
