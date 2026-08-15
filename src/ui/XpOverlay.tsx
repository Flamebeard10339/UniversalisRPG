import { signed } from './format';
import { useMoment } from './transient';
import { risesOf, type Note } from './xpNotes';

// What the world just gave the player, said once and then gone. It sits under
// the banner at the top right and fades when nothing has added to it for a
// while; the queue decides what each line says, when, and which place it stands
// in, and this only draws it.
//
// Every line is placed rather than stacked, because a stack closes its gaps: a
// line leaving would pull every line under it upward, and what a player reads
// as a jerk is the rest of the column moving, not the line that went.
//
// Its own overlay rather than the shell's transient channel, because a note on
// that channel is a line of text in the middle of the screen with a lifetime of
// its own — this is a different place, a different wait, and a different shape.

// How tall a line is drawn and how far apart two places stand. The height is
// set rather than left to the text, because the pitch is measured from it: two
// figures that had to agree would be two figures that could drift, and the gap
// between two lines is the whole of what separates them.
const LINE_HEIGHT = 28;
const LINE_GAP = 1;
const SLOT_PITCH = LINE_HEIGHT + LINE_GAP;

export function XpOverlay({ notes }: { notes: readonly Note[] }): JSX.Element {
  return (
    <div className="pointer-events-none absolute right-3 top-2 z-40">
      {notes.map((note) => (
        // Keyed on when it was last told something as well as on which line it
        // is, so a line that has just grown says so from the top rather than
        // going on fading while its number climbs.
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
