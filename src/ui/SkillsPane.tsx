import type { Answer } from '../runtime/localized';
import type { PlayView } from '../runtime/session';
import { tidy } from './format';
import { GRID, NAME } from './sheetLayout';
import { filled, skillPanels, type SkillPanel } from './skillPanels';
import { useTestSurface } from './useTestSurface';
import { useMoment } from './transient';
import type { Crossings } from './levelling';

const RING_RADIUS = 17;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

function Ring({ panel, greeted }: { panel: SkillPanel; greeted: boolean }): JSX.Element {
  const flash = useMoment('arrival', greeted, panel.id);

  return (
    <span className={`relative flex h-16 w-16 items-center justify-center rounded-full ${flash}`}>
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 40 40" aria-hidden>
        <circle cx={20} cy={20} r={RING_RADIUS} className="fill-none stroke-panel" strokeWidth={4} />
        <circle
          cx={20}
          cy={20}
          r={RING_RADIUS}
          className="fill-none stroke-accent"
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={RING_LENGTH}
          strokeDashoffset={RING_LENGTH * (1 - filled(panel))}
        />
      </svg>
      <span className="text-lg font-semibold tabular-nums">{tidy(panel.level)}</span>
    </span>
  );
}

export function SkillsPane({ view, crossed, onOpen }: { view: PlayView; crossed: Crossings; onOpen: (skill: string) => void }): JSX.Element {
  const panels = skillPanels(view.xp);
  const opened = view.focus?.kind === 'skill' ? (view.focus.skill as Answer) : null;

  useTestSurface('skills', { panels, opened, greeted: [...crossed.greeted], controls: { open: onOpen } });

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="unbarred min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <div className={`mx-auto max-w-2xl ${GRID}`}>
          {panels.map((panel) => (
            <button
              key={panel.id}
              data-drive="skills.open"
              data-skill={panel.id}
              type="button"
              onClick={() => onOpen(panel.id)}
              className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-surface-raised px-3 py-3 transition-transform duration-75 active:scale-[0.98] active:border-accent"
            >
              <span className={`w-full text-center text-sm font-semibold ${NAME}`}>{panel.title}</span>
              <Ring key={`${panel.id}-${crossed.greeted.has(panel.id) ? crossed.generation : 0}`} panel={panel} greeted={crossed.greeted.has(panel.id)} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
