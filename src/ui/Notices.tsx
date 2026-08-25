import { useSyncExternalStore } from 'react';
import { sayingOf, type Shown } from './notice';
import { useMoment, type TransientChannel } from './transient';

export function Notices({ channel }: { channel: TransientChannel }): JSX.Element {
  const shown = useSyncExternalStore(channel.subscribe, channel.notices, channel.notices);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-2 z-40 flex flex-col items-center gap-1">
      {shown.map((notice) => (
        <Pill key={`${notice.id}-${notice.told}`} notice={notice} />
      ))}
    </div>
  );
}

function Pill({ notice }: { notice: Shown }): JSX.Element {
  const lingering = useMoment('linger', true, notice.key);

  return <span className={`${lingering} rounded-full bg-panel px-3 py-1 text-sm font-semibold text-accent-strong shadow`}>{sayingOf(notice)}</span>;
}
