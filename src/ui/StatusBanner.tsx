import type { PlayView } from '../runtime/session';
import { HeldStrip } from './HeldStrip';
import { Meter } from './Meter';
import { STIRRING } from './transient';

export function StatusBanner({ view, stirring }: { view: PlayView; stirring: boolean }): JSX.Element {
  return (
    <div data-stirring={stirring ? 'yes' : undefined} className={`flex min-h-[48px] flex-col justify-center gap-1.5 border-y border-border bg-surface px-4 py-2 ${stirring ? STIRRING : ''}`}>
      {view.resources.map((resource) => (
        <Meter key={resource.id} title={resource.title} current={resource.current} max={resource.max} readout={resource.display === 'full'} />
      ))}
      <HeldStrip held={view.held} />
    </div>
  );
}
