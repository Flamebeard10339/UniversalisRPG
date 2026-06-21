import { actionDescriptionKey, actionTitleKey, itemDescriptionKey, itemTitleKey } from '../game/contentIds';
import { canStartAction, isActionVisible } from '../game/conditions';
import { getActionDurationMs } from '../game/adversarial';
import type { ContentBundle, GameAction, UniversePlayState } from '../game/types';
import type { Translator } from '../game/i18n';
import { useNow } from '../hooks/useNow';

type InventoryPanelProps = {
  bundle: ContentBundle;
  onStartAction: (action: GameAction) => void;
  playState: UniversePlayState;
  t: Translator;
};

export const InventoryPanel = ({ bundle, onStartAction, playState, t }: InventoryPanelProps) => {
  const now = useNow(Boolean(playState.activeAction), 16);
  const context = {
    manifest: bundle.manifest,
    actions: bundle.actions,
    skills: bundle.skills,
    locations: bundle.locations,
    items: bundle.items,
    flags: bundle.flags,
    resourceDefinitions: bundle.resourceDefinitions,
    effects: bundle.effects,
    interactionTypes: bundle.interactionTypes,
    enemies: bundle.enemies,
  };
  const entries = Object.entries(playState.inventory).filter(([, amount]) => amount > 0);

  return (
    <section className="grid gap-2 rounded border border-slate-800 bg-slate-900 p-4">
      <h2 className="text-base font-semibold text-slate-100">{t('inventory.title')}</h2>
      {entries.length === 0 ? (
        <p className="text-sm text-slate-500">{t('inventory.empty')}</p>
      ) : (
        <div className="grid gap-2">
          {entries.map(([itemId, amount]) => {
            const actions = bundle.actions.filter((action) =>
              action.inventoryItemId === itemId
              && isActionVisible(playState, action, context));
            return (
              <section className="grid gap-2 rounded border border-slate-800 bg-slate-950 p-3" key={itemId}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-100">{t(itemTitleKey(itemId), itemId)}</h3>
                    <p className="mt-1 text-xs text-slate-400">{t(itemDescriptionKey(itemId), '')}</p>
                  </div>
                  <span className="text-sm font-semibold text-slate-100">{amount}</span>
                </div>
                {actions.map((action) => {
                  const active = playState.activeAction?.actionId === action.id;
                  const progress = playState.actionProgress[action.id];
                  const elapsedMs = (progress?.elapsedMs ?? 0) + (progress?.runningSince ? Math.max(0, now - progress.runningSince) : 0);
                  const percent = Math.min(100, (elapsedMs / getActionDurationMs(playState, action, context)) * 100);
                  const remaining = action.maxCompletions === undefined
                    ? null
                    : Math.max(0, action.maxCompletions - (playState.actionCompletions[action.id] ?? 0));
                  return (
                    <button
                      className="relative overflow-hidden rounded border border-slate-700 bg-slate-900 p-2 text-left hover:border-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={Boolean(playState.activeTravel) || !canStartAction(playState, action, context)}
                      key={action.id}
                      onClick={() => onStartAction(action)}
                      type="button"
                    >
                      {(active || percent > 0) && (
                        <span className={`absolute inset-y-0 left-0 ${active ? 'bg-cyan-400/25' : 'bg-slate-700/60'}`} style={{ width: `${percent}%` }} />
                      )}
                      <span className="relative block text-sm font-semibold text-slate-100">{t(actionTitleKey(action.id))}</span>
                      <span className="relative mt-1 block text-xs text-slate-400">{t(actionDescriptionKey(action.id))}</span>
                      <span className="relative mt-1 block text-xs text-cyan-200">{action.durationSeconds}s</span>
                      {remaining !== null && (action.maxCompletions ?? 0) > 1 && (
                        <span className="relative mt-1 block text-xs text-slate-300">
                          {t('actionPanel.remaining', { remaining, total: action.maxCompletions ?? 0 })}
                        </span>
                      )}
                    </button>
                  );
                })}
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
};
