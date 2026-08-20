import { signed } from './format';
import { useMoment } from './transient';
import { risesOf, type Note } from './xpNotes';

const LINE_HEIGHT = 28;
const LINE_GAP = 1;
const SLOT_PITCH = LINE_HEIGHT + LINE_GAP;

export function XpOverlay({ notes }: { notes: readonly Note[] }): JSX.Element {
  return (
    <div className="pointer-events-none absolute right-3 top-2 z-40">
      {notes.map((note) => (
        <Line key={`${note.id}-${note.began}`} note={note} />
      ))}
    </div>
  );
}

function Line({ note }: { note: Note }): JSX.Element {
  const lingering = useMoment('linger', true, String(note.id));

  return (
    <span
      data-note={note.kind}
      data-slot={note.slot}
      style={{ top: note.slot * SLOT_PITCH, height: LINE_HEIGHT }}
      className={`${lingering} absolute right-0 flex items-center whitespace-nowrap rounded-full bg-panel px-3 text-sm font-semibold text-accent-strong shadow`}
    >
      {note.kind === 'item' ? (
        <>
          <span className="tabular-nums">{signed(note.count)}</span> {note.name}
        </>
      ) : (
        risesOf(note.gains).map((rise, at) => (
          <span key={rise.amount}>
            {at === 0 ? '' : ', '}
            <span className="tabular-nums">{signed(rise.amount)}</span>
            {rise.titles.map((title, index) => (
              <span key={title}>
                {index === 0 ? ' ' : ', '}
                {title}
              </span>
            ))}
          </span>
        ))
      )}
    </span>
  );
}
