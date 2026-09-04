import type { PlayAction } from '../runtime/session';
import { fillPercent } from './format';
import { Modal, ModalCard } from './Modal';

export function ForcedSheet({ action }: { action: PlayAction }): JSX.Element {
  return (
    <Modal manner={{ place: 'bottom', behind: 'dim', over: 'app' }} asksNothing subject={String(action.label)}>
      <ModalCard subject={String(action.label)} title={action.label}>
        <div data-drive="forced" className="h-2 overflow-hidden rounded-full bg-panel">
          <div className="h-full bg-accent" style={{ width: `${fillPercent(action.progress, 1)}%` }} />
        </div>
      </ModalCard>
    </Modal>
  );
}
