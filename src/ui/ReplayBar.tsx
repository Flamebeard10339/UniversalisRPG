import type { Directive } from '../content/sections/test';
import type { Localizer } from '../runtime/localized';
import { advances, REPLAY_SPEEDS, replayLines, type StepKind } from './replay';
import type { Words } from './words';

const CONTROL = 'shrink-0 rounded-lg border border-border bg-surface px-2 py-1 text-xs text-text transition-transform duration-75 active:scale-[0.97] disabled:opacity-40';

// A step the game took reads as the game; what the player said about it reads as an aside; a page
// move and a refusal are the run talking about itself. Four readings, one per StepKind, so a kind
// added to the union arrives here as a missing key rather than as an unstyled line.
const TONE: Readonly<Record<StepKind, string>> = {
  played: 'text-text',
  said: 'text-accent italic',
  moved: 'text-text-subtle',
  refused: 'text-danger',
};

export interface ReplayBarProps {
  test: string;
  steps: readonly Directive[];
  at: number;
  playing: boolean;
  delay: number;
  failure: string | null;
  words: Words;
  localizer: Localizer;
  onGoTo: (at: number) => void;
  onPlaying: (on: boolean) => void;
  onDelay: (seconds: number) => void;
  onClose: () => void;
}

// Drawn only while a run is being watched. The step standing is the one the cursor has just walked,
// so `at` is a count of steps taken and `at - 1` is the line that did it.
export function ReplayBar({ test, steps, at, playing, delay, failure, words, localizer, onGoTo, onPlaying, onDelay, onClose }: ReplayBarProps): JSX.Element {
  const named = localizer.identifier(test);
  const lines = replayLines(steps);
  const standing = lines[at - 1] ?? null;
  const more = advances({ at, steps, failure });

  return (
    <div className="flex shrink-0 flex-col gap-1 border-b border-border bg-panel px-3 py-1">
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-xs text-text-subtle">{words('replay-of', { test: named })}</span>
        <span className="mr-auto truncate text-xs text-text-subtle">{words('replay-step', { at, count: steps.length })}</span>
        <button data-drive="replay.at" type="button" disabled={at === 0} onClick={() => onGoTo(at - 1)} className={CONTROL}>
          {words('replay-back')}
        </button>
        <button data-drive="replay.playing" type="button" disabled={!more} onClick={() => onPlaying(!playing)} className={CONTROL}>
          {words(playing ? 'replay-pause' : 'replay-play')}
        </button>
        <button data-drive="none: one step forward is replay.at, which the slider and this button both ask for" type="button" disabled={!more} onClick={() => onGoTo(at + 1)} className={CONTROL}>
          {words('replay-on')}
        </button>
        <select
          data-drive="replay.every"
          value={delay}
          onChange={(event) => onDelay(Number(event.target.value))}
          className="shrink-0 rounded-lg border border-border bg-surface px-2 py-1 text-xs text-text"
          aria-label={String(words('replay-every', { seconds: delay }))}
        >
          {REPLAY_SPEEDS.map((seconds) => (
            <option key={seconds} value={seconds}>
              {words('replay-every', { seconds })}
            </option>
          ))}
        </select>
        <button data-drive="replay.watching" type="button" onClick={onClose} className={CONTROL}>
          {words('replay-close')}
        </button>
      </div>

      <input
        data-drive="none: the slider and the step buttons ask for the same thing, which replay.at is"
        type="range"
        min={0}
        max={steps.length}
        value={at}
        onChange={(event) => onGoTo(Number(event.target.value))}
        className="w-full accent-accent"
        aria-label={String(words('replay-step', { at, count: steps.length }))}
      />

      <p className={`truncate text-xs ${standing === null ? 'text-text-subtle' : TONE[standing.kind]}`}>{standing === null ? words('replay-of', { test: named }) : standing.text}</p>

      {failure === null ? null : <p className="truncate text-xs text-danger">{words('replay-parted', { because: localizer.identifier(failure) })}</p>}
      {failure === null && !more ? <p className="truncate text-xs text-text-subtle">{words('replay-done')}</p> : null}
    </div>
  );
}
