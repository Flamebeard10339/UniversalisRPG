import type { Localizer } from '../runtime/localized';
import type { AwayRun } from '../runtime/session';
import { formatClock } from './format';
import { VOICE_CLASS } from './lineStyle';
import { Modal, ModalCard } from './Modal';
import { useTestSurface } from './useTestSurface';
import type { Words } from './words';

const SAID = `whitespace-pre-wrap break-words text-sm leading-snug ${VOICE_CLASS.said}`;

export function WelcomeBack({ away, words, localizer, onCarryOn }: { away: AwayRun; words: Words; localizer: Localizer; onCarryOn: () => void }): JSX.Element {
  useTestSurface('away', { away, controls: { carryOn: onCarryOn } });

  return (
    <Modal manner={{}} subject="welcome-back">
      <ModalCard subject="welcome-back" title={words('away-back')}>
        <p className="mb-2 text-xs text-text-subtle">{words('away-for', { away: localizer.identifier(formatClock(away.awayMs / 1000)) })}</p>
        <div className="unbarred flex max-h-[50vh] flex-col gap-1 overflow-y-auto">
          {away.lines.length === 0 ? (
            <p className={SAID}>{words('away-nothing')}</p>
          ) : (
            away.lines.map((line, at) => (
              <p key={at} className={SAID}>
                {line}
              </p>
            ))
          )}
        </div>
        <button
          data-drive="away.carry-on"
          type="button"
          onClick={onCarryOn}
          className="mt-3 min-h-[44px] w-full rounded-xl bg-accent px-3 text-sm text-accent-text transition-transform duration-75 active:scale-[0.97]"
        >
          {words('away-carry-on')}
        </button>
      </ModalCard>
    </Modal>
  );
}
