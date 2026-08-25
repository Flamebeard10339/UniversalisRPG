import { useSyncExternalStore } from 'react';
import { saidLines, type Shown } from './notice';
import { useMoment, type TransientChannel } from './transient';

export function Notices({ channel }: { channel: TransientChannel }): JSX.Element {
  const shown = useSyncExternalStore(channel.subscribe, channel.notices, channel.notices);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-2 z-40 flex flex-col items-center gap-1">
      {saidLines(shown).map((line) => (
        <Pill key={`${line.at.id}-${line.at.told}`} notice={line.at} text={line.text} />
      ))}
    </div>
  );
}

function Pill({ notice, text }: { notice: Shown; text: string }): JSX.Element {
  const lingering = useMoment('linger', true, notice.key);

  return <span className={`${lingering} rounded-full bg-panel px-3 py-1 text-sm font-semibold text-accent-strong shadow`}>{text}</span>;
}
