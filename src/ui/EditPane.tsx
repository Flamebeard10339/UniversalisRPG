import { useEffect, useRef } from 'react';
import { fillingWords } from '../content/completion';
import { searching } from './authoringSurface';
import { draftIn, kindsIn, offeringIn, openedIn, rowsIn, sectionKey, type EditHeld } from './editControls';
import { splitFrom } from './gesture';
import { gathered, shownIn } from './offerGroups';
import { Splitter } from './Splitter';
import { useTestSurface } from './useTestSurface';
import type { Words } from './words';

const OPEN_TO_ALL = '';

export function EditPane({ held, words }: { held: EditHeld; words: Words }): JSX.Element {
  const surface = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const restored = useRef(false);
  const grabbed = useRef(0);
  const taken = useRef(false);
  const { sections, standing, places, editing, controls } = held;
  const rows = rowsIn(held);
  const open = openedIn(sections, editing);
  const search = searching(editing.query);
  const offering = offeringIn(held);

  useTestSurface('edit', held);

  useEffect(() => {
    if (list.current) list.current.scrollTop = editing.scroll;
  }, []);

  useEffect(() => {
    if (restored.current || !field.current) return;
    restored.current = true;
    field.current.setSelectionRange(editing.cursor, editing.cursor);
  }, [open]);

  useEffect(() => {
    if (!taken.current || !field.current) return;
    taken.current = false;
    field.current.focus();
    field.current.setSelectionRange(editing.cursor, editing.cursor);
  }, [editing.draft]);

  return (
    <div ref={surface} className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-surface-raised px-3 py-2">
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
          data-drive="edit.add"
          type="button"
          onClick={controls.add}
          className="ml-auto rounded-xl border border-border bg-panel px-3 text-xs text-text-subtle transition-transform duration-75 active:scale-[0.97]"
        >
          {words('new')}
        </button>
        <button
          data-drive="edit.copy"
          type="button"
          onClick={controls.copy}
          className="rounded-xl border border-border bg-panel px-3 text-xs text-text-subtle transition-transform duration-75 active:scale-[0.97]"
        >
          {words('copy')}
        </button>
        <input
          data-drive="edit.search"
          aria-label={words('search')}
          placeholder={words('search-hint')}
          value={editing.query}
          onChange={(event) => controls.search(event.target.value)}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          className={`w-full select-text rounded-xl border bg-panel px-3 font-mono text-xs text-text outline-none ${
            search.broken ? 'border-danger' : 'border-border focus:border-accent'
          }`}
        />
      </div>

      <div
        ref={list}
        className="unbarred min-h-0 overflow-y-auto px-3 py-2"
        style={{ flexGrow: open || editing.draft !== null ? editing.split : 1, flexBasis: 0 }}
        onScroll={(event) => controls.scroll(event.currentTarget.scrollTop)}
      >
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

      {open || editing.draft !== null ? (
        <>
          <Splitter
            onGrab={() => void (grabbed.current = editing.split)}
            onDrag={(dy) => controls.split(splitFrom(grabbed.current, dy, surface.current?.clientHeight ?? 0))}
          />
          <div className="flex min-h-0 flex-row gap-2 border-t border-border bg-surface-raised p-3" style={{ flexGrow: 1 - editing.split, flexBasis: 0 }}>
            <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
              <textarea
                ref={field}
                data-drive="edit.text"
                aria-label={words('section')}
                value={draftIn(sections, editing)}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                onChange={(event) => {
                  taken.current = true;
                  controls.text(event.target.value, event.target.selectionStart);
                }}
                onSelect={(event) => controls.cursor(event.currentTarget.selectionStart)}
                className="min-h-0 flex-1 resize-none select-text rounded-xl border border-border bg-panel px-3 pb-14 pt-2 font-mono text-xs text-text outline-none focus:border-accent"
              />
              <div className="absolute bottom-2 left-2 flex gap-2">
                <button
                  data-drive="edit.step-out"
                  type="button"
                  aria-label={words('step-out')}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    taken.current = true;
                    controls.stepOut();
                  }}
                  className="rounded-xl border border-border bg-surface px-3 text-xs text-text-subtle transition-transform duration-75 active:scale-[0.97]"
                >
                  {words('step-out')}
                </button>
                <button
                  data-drive="edit.step-in"
                  type="button"
                  aria-label={words('step-in')}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    taken.current = true;
                    controls.stepIn();
                  }}
                  className="rounded-xl border border-border bg-surface px-3 text-xs text-text-subtle transition-transform duration-75 active:scale-[0.97]"
                >
                  {words('step-in')}
                </button>
              </div>
              <div className="absolute bottom-2 right-2 flex gap-2">
                <button
                  data-drive="edit.unstage"
                  type="button"
                  disabled={open === null || !open.staged}
                  onClick={controls.unstage}
                  className="rounded-xl border border-border bg-surface px-3 text-xs text-text-subtle transition-transform duration-75 active:scale-[0.97] disabled:opacity-50"
                >
                  {words('unstage')}
                </button>
                <button
                  data-drive="edit.stage"
                  type="button"
                  onClick={controls.stage}
                  className="rounded-xl bg-accent px-3 text-xs font-medium text-accent-text transition-transform duration-75 active:scale-[0.97]"
                >
                  {words('stage')}
                </button>
              </div>
            </div>
            {offering.where.length > 0 ? (
              <div data-drive="edit.offers" aria-label={words('grammar')} className="packed w-2/5 max-w-[16rem] shrink-0 overflow-y-auto rounded-xl border border-border bg-panel py-1 font-mono text-[11px] leading-tight">
                <div className="border-b border-border px-2 pb-1 text-text-subtle">
                  <div className="break-words">{offering.where.join(' › ')}</div>
                  <div className="break-words text-accent">{offering.reads ?? offering.filling?.form ?? words('unread')}</div>
                  {offering.filling === null ? null : <div className="break-words text-text">{fillingWords(offering.filling)}</div>}
                  {offering.filling?.holds === undefined || offering.filling.holds.words.length === 0 ? null : (
                    <>
                      <div className="px-0 text-text">{'<operators>'}</div>
                      <div className="break-words pl-3 text-text-subtle">{offering.filling.holds.words.join(', ')}</div>
                    </>
                  )}

                  {offering.refused === null ? null : <div className="break-words text-danger">{offering.refused}</div>}
                  {offering.undeclared.length === 0 ? null : <div className="break-words text-warning">{`${offering.undeclared.map((each) => `${each.id} as a # ${each.kind}${each.meant === undefined ? '' : `, one letter from ${each.meant}`}`).join(', ')} ${words('undeclared')}`}</div>}
                </div>
                {gathered(offering.offers).map((family, at) => (
                  <div key={family.name ?? `${at}`} className="pt-1">
                    {family.name === null ? null : <div className="px-2 text-text">{family.name}</div>}
                    {family.groups.map((group, index) => (
                      <div key={group.head ?? `${index}`}>
                        {group.head === null || group.opens === null ? (
                          group.head === null ? null : <div className="px-2 pl-3 text-text-subtle">{group.head}</div>
                        ) : (
                          <button
                            data-drive="edit.take"
                            type="button"
                            data-offer={group.opens.form}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                              taken.current = true;
                              controls.take(group.opens!.form);
                            }}
                            className="block w-full whitespace-pre-wrap break-words px-2 pl-3 text-left font-mono text-[11px] leading-tight text-text-subtle"
                          >
                            {group.head}
                          </button>
                        )}
                        {group.offers.map((offer) => (
                          <button
                            key={offer.form}
                            data-drive="edit.take"
                            type="button"
                            data-offer={offer.form}
                            data-kind={offer.kind}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                              taken.current = true;
                              controls.take(offer.form);
                            }}
                            className={`block w-full whitespace-pre-wrap break-words px-2 text-left font-mono text-[11px] leading-tight ${group.head === null ? 'pl-3' : 'pl-5'} ${
                              offer.kind === undefined ? 'text-text-subtle' : 'text-accent'
                            }`}
                          >
                            {shownIn(group, offer)}
                            {offer.note === undefined ? null : <span className="block text-text-subtle opacity-70">{offer.note}</span>}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
