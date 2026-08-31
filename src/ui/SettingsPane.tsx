import { useState } from 'react';
import { DevOnly } from './DevOnly';
import { devLine, RATES, speedLine } from './devMode';
import type { Localizer } from '../runtime/localized';
import type { FiledRun } from '../runtime/runFiling';
import type { SettingRow } from '../runtime/session';
import { packTurnsTo, type PortalPack } from '../content/packs';
import { settingLine, standsAt } from './settingLines';
import type { Words } from './words';

// One row per preference the engine publishes, drawn off the live view rather than off a list of
// this page's own: a setting declared next month arrives here with nothing edited, and picking one
// sends the line a player would have typed.
function Preference({ row, onSend }: { row: SettingRow; onSend: (line: string) => void }): JSX.Element {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-panel px-3 py-2 text-sm text-text">
      <div className="flex items-center gap-2">
        <span className="mr-auto">{row.title}</span>
        {row.choices.map((choice) => (
          <button
            key={choice.written}
            data-drive="send"
            data-setting={row.name}
            data-choice={choice.written}
            data-standing={standsAt(row, choice.written) ? 'yes' : undefined}
            type="button"
            onClick={() => onSend(settingLine(row.name, choice.written))}
            className={`shrink-0 rounded-xl border px-3 text-sm transition-transform duration-75 active:scale-[0.97] ${
              standsAt(row, choice.written) ? 'border-accent bg-accent-strong font-semibold text-accent-text' : 'border-border bg-surface text-text-subtle'
            }`}
          >
            {choice.shown}
          </button>
        ))}
      </div>
      <span className="text-xs text-text-subtle">{row.note}</span>
    </div>
  );
}

function Rates({ speed, words, onSend }: { speed: number; words: Words; onSend: (line: string) => void }): JSX.Element {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-panel px-3 py-2 text-sm text-text">
      <span className="mr-auto">{words('speed')}</span>
      {RATES.map((rate) => (
        <button
          key={rate}
          data-drive="send"
          data-rate={rate}
          data-running={rate === speed ? 'yes' : undefined}
          type="button"
          onClick={() => onSend(speedLine(String(rate)))}
          className={`shrink-0 rounded-xl border px-3 text-sm tabular-nums transition-transform duration-75 active:scale-[0.97] ${
            rate === speed ? 'border-accent bg-accent-strong font-semibold text-accent-text' : 'border-border bg-surface text-text-subtle'
          }`}
        >
          {`${rate}\u00d7`}
        </button>
      ))}
    </div>
  );
}

// The packs the world was opened with, and what turning one on or off leaves behind. A pack row is
// a control over the modules under it rather than a second thing to agree with them, so a pack that
// is half on says so and the next click takes it the rest of the way on.
function Mods({ packs, words, localizer, onTurn }: { packs: readonly PortalPack[]; words: Words; localizer: Localizer; onTurn: (names: readonly string[], on: boolean) => void }): JSX.Element {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-panel px-3 py-2 text-sm text-text">
      <span className="text-xs uppercase tracking-wide text-text-subtle">{words('mods')}</span>
      <span className="text-xs text-text-subtle">{words('mods-hint')}</span>
      {packs.map((pack) => (
        <div key={pack.pack} className="flex flex-col gap-1 pt-1">
          <label className="flex items-center justify-between gap-3">
            <span className={pack.standing === 'none' ? 'text-text-subtle' : undefined}>{localizer.identifier(pack.pack)}</span>
            <input
              data-drive="mods.pack"
              data-pack={pack.pack}
              data-standing={pack.standing}
              type="checkbox"
              checked={pack.standing !== 'none'}
              ref={(box) => {
                if (box) box.indeterminate = pack.standing === 'some';
              }}
              onChange={() =>
                onTurn(
                  pack.modules.map((module) => module.name),
                  packTurnsTo(pack),
                )
              }
              className="accent-accent"
            />
          </label>
          {pack.modules.map((module) => (
            <label key={module.name} className="flex items-center justify-between gap-3 pl-3 text-xs text-text-subtle">
              <span className="min-w-0 truncate">
                {localizer.identifier(module.id)}
                {module.on && !module.loaded ? ` — ${String(words('mods-refused'))}` : ''}
              </span>
              <input
                data-drive="mods.module"
                data-module={module.name}
                data-on={module.on ? 'yes' : undefined}
                data-loaded={module.loaded ? 'yes' : undefined}
                type="checkbox"
                checked={module.on}
                onChange={() => onTurn([module.name], !module.on)}
                className="accent-accent"
              />
            </label>
          ))}
        </div>
      ))}
    </div>
  );
}

const RUN_CONTROL = 'shrink-0 rounded-xl border border-border bg-surface px-3 text-sm text-text-subtle transition-transform duration-75 active:scale-[0.97]';

// One filed run and the three things that can be done to it: watched back, renamed, or dropped.
// Renaming asks here rather than through a screen — the name is one word about a row that is
// already on the page, and the row is where it is read.
function Run({ run, renaming, words, localizer, onRenaming, onReplay, onRename, onDrop }: { run: FiledRun; renaming: string | null; words: Words; localizer: Localizer; onRenaming: (name: string | null) => void; onReplay: () => void; onRename: (to: string) => void; onDrop: () => void }): JSX.Element {
  if (renaming !== null) {
    return (
      <div className="flex items-center gap-2">
        <input
          data-drive="none: the name is answered with the run in one act, which playtest.rename takes whole"
          type="text"
          value={renaming}
          aria-label={words('playtest-renaming', { run: localizer.identifier(run.id) })}
          onChange={(event) => onRenaming(event.target.value)}
          className="mr-auto min-w-0 flex-1 select-text rounded-xl border border-border bg-surface px-3 text-sm text-text outline-none focus:border-accent"
        />
        <button data-drive="playtest.rename" type="button" onClick={() => onRename(renaming)} className={RUN_CONTROL}>
          {words('playtest-rename')}
        </button>
        <button data-drive="none: leaving the name unanswered leaves the run exactly as it was filed" type="button" onClick={() => onRenaming(null)} className={RUN_CONTROL}>
          {words('playtest-discard')}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="mr-auto truncate text-xs">{localizer.identifier(run.id)}</span>
      <button data-drive="replay.watching" data-run={run.id} type="button" onClick={onReplay} className={RUN_CONTROL}>
        {words('playtest-replay')}
      </button>
      <button data-drive="none: the name is answered with the run in one act, which playtest.rename takes whole" data-run={run.id} type="button" onClick={() => onRenaming(run.id)} className={RUN_CONTROL}>
        {words('playtest-rename')}
      </button>
      <button data-drive="playtest.drop" data-run={run.id} type="button" onClick={onDrop} className={RUN_CONTROL}>
        {words('playtest-drop')}
      </button>
    </div>
  );
}

// The runs already filed into the game, and what can be done to one here. They pile up two sections
// at a time and nothing prunes them on a clock — a run the author has not exported yet is theirs to
// keep — so this is where they go.
function Runs({ runs, words, localizer, onReplay, onRename, onDrop }: { runs: readonly FiledRun[]; words: Words; localizer: Localizer; onReplay: (run: string) => void; onRename: (run: string, to: string) => void; onDrop: (run: string) => void }): JSX.Element {
  const [renaming, setRenaming] = useState<{ run: string; to: string } | null>(null);

  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-panel px-3 py-2 text-sm text-text">
      <span className="text-xs uppercase tracking-wide text-text-subtle">{words('playtest-runs')}</span>
      {runs.length === 0 ? <span className="text-xs text-text-subtle">{words('playtest-none')}</span> : null}
      {runs.map((run) => (
        <Run
          key={run.id}
          run={run}
          renaming={renaming?.run === run.id ? renaming.to : null}
          words={words}
          localizer={localizer}
          onRenaming={(name) => setRenaming(name === null ? null : { run: run.id, to: name })}
          onReplay={() => onReplay(run.id)}
          onRename={(to) => {
            setRenaming(null);
            onRename(run.id, to);
          }}
          onDrop={() => onDrop(run.id)}
        />
      ))}
    </div>
  );
}

export function SettingsPane({
  dev,
  speed,
  settings,
  commandLine,
  words,
  localizer,
  onSend,
  onCommandLine,
  playtest,
  onPlaytest,
  runs,
  onReplayRun,
  onRenameRun,
  onDropRun,
  mods,
  onTurnMods,
}: {
  dev: boolean;
  speed: number;
  settings: readonly SettingRow[];
  commandLine: boolean;
  words: Words;
  localizer: Localizer;
  onSend: (line: string) => void;
  onCommandLine: (shown: boolean) => void;
  playtest: boolean;
  onPlaytest: (recording: boolean) => void;
  runs: readonly FiledRun[];
  onReplayRun: (run: string) => void;
  onRenameRun: (run: string, to: string) => void;
  onDropRun: (run: string) => void;
  mods: readonly PortalPack[];
  onTurnMods: (names: readonly string[], on: boolean) => void;
}): JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
      {settings.map((row) => (
        <Preference key={row.name} row={row} onSend={onSend} />
      ))}

      <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-panel px-3 py-2 text-sm text-text">
        <span>{words('dev')}</span>
        <input data-drive="send" type="checkbox" checked={dev} onChange={(event) => onSend(devLine(event.target.checked))} className="accent-accent" />
      </label>

      <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-panel px-3 py-2 text-sm text-text">
        <span>{words('command-line')}</span>
        <input
          data-drive="shell.command-line"
          type="checkbox"
          checked={commandLine}
          onChange={(event) => onCommandLine(event.target.checked)}
          className="accent-accent"
        />
      </label>

      <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-panel px-3 py-2 text-sm text-text">
        <span>{words('playtest')}</span>
        <input
          data-drive="playtest.recording"
          type="checkbox"
          checked={playtest}
          onChange={(event) => onPlaytest(event.target.checked)}
          className="accent-accent"
        />
      </label>

      <Mods packs={mods} words={words} localizer={localizer} onTurn={onTurnMods} />

      <Runs runs={runs} words={words} localizer={localizer} onReplay={onReplayRun} onRename={onRenameRun} onDrop={onDropRun} />

      <DevOnly dev={dev}>
        <Rates speed={speed} words={words} onSend={onSend} />
      </DevOnly>
    </div>
  );
}
