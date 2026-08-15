import { signed } from './format';
import { useMoment } from './transient';
import type { XpNote } from './xpNotes';

// Experience arriving, said once and then gone. It sits under the banner at the
// top right, drifts down a little and fades; the queue decides what each line
// says and when, and this only draws it.
//
// Its own overlay rather than the shell's transient channel, because a note on
// that channel is a line of text in the middle of the screen with a lifetime of
// its own — this is a different place, a different wait, and a different shape.

export function XpOverlay({ notes }: { notes: readonly XpNote[] }): JSX.Element {
  return (
    <div className="pointer-events-none absolute right-3 top-2 z-40 flex flex-col items-end gap-1">
      {notes.map((note) => (
        <Note key={note.id} note={note} />
      ))}
    </div>
  );
}

function Note({ note }: { note: XpNote }): JSX.Element {
  const drifting = useMoment('drift', true, String(note.id));

  return (
    <span className={`${drifting} rounded-full bg-panel px-3 py-1 text-sm font-semibold text-accent-strong shadow`}>
      {note.rises.map((rise, at) => (
        <span key={rise.amount}>
          {at === 0 ? '' : ', '}
          <span className="tabular-nums">{signed(rise.amount)}</span>
          {rise.titles.map((title, index) => (
            <span key={title}>{index === 0 ? ' ' : ', '}{title}</span>
          ))}
        </span>
      ))}
    </span>
  );
}
