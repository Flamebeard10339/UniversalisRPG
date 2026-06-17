import type { ContentBundle, GameAction, UniversePlayState } from '../game/types';
import { actionDescriptionKey, actionTitleKey } from '../game/contentIds';
import { useNow } from '../hooks/useNow';

type ActionPanelProps = {
  bundle: ContentBundle;
  playState: UniversePlayState;
  onStartAction: (action: GameAction) => void;
  t: (key: string, fallback?: string) => string;
};

export const ActionPanel = ({ bundle, playState, onStartAction, t }: ActionPanelProps) => {
  const actions = bundle.actions.filter((action) => action.locationId === playState.currentLocationId);
  const activeAction = actions.find((action) => action.id === playState.activeAction?.actionId);
  const isTravelling = Boolean(playState.activeTravel);
  const now = useNow(Boolean(playState.activeAction));
  const progress = playState.activeAction
    ? Math.min(100, Math.max(0, ((now - playState.activeAction.startedAt) / (playState.activeAction.completesAt - playState.activeAction.startedAt)) * 100))
    : 0;

  return (
    <section className="grid gap-3">
      <div>
        <h2 className="text-base font-semibold text-slate-100">Actions</h2>
        <p className="text-sm text-slate-400">
          {isTravelling
            ? 'Travelling. Actions will be available when you arrive.'
            : activeAction
              ? `Working on ${t(activeAction.titleKey ?? actionTitleKey(activeAction.id))}.`
              : 'Choose what to work on here.'}
        </p>
      </div>

      {playState.activeAction && (
        <div className="h-2 overflow-hidden rounded bg-slate-800">
          <div className="h-full bg-cyan-300 transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}

      <div className="grid gap-2">
        {actions.map((action) => (
          <button
            className="rounded border border-slate-700 bg-slate-900 p-3 text-left transition hover:border-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={Boolean(playState.activeAction) || isTravelling}
            key={action.id}
            onClick={() => onStartAction(action)}
            type="button"
          >
            <span className="block text-sm font-semibold text-slate-100">{t(action.titleKey ?? actionTitleKey(action.id))}</span>
            <span className="mt-1 block text-xs text-slate-400">{t(action.descriptionKey ?? actionDescriptionKey(action.id))}</span>
            <span className="mt-2 block text-xs text-cyan-200">{action.durationSeconds}s</span>
          </button>
        ))}
      </div>
    </section>
  );
};
