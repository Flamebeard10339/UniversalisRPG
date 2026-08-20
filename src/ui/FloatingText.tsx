import { useSyncExternalStore } from 'react';
import type { TransientChannel } from './transient';

export function FloatingText({ channel }: { channel: TransientChannel }): JSX.Element {
  const notes = useSyncExternalStore(channel.subscribe, channel.notes, channel.notes);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-1/4 z-40 flex flex-col items-center gap-1">
      {notes.map((note) => (
        <span key={note.id} className="rounded-full bg-panel px-3 py-1 text-sm font-semibold text-accent-strong shadow">
          {note.text}
        </span>
      ))}
    </div>
  );
}
