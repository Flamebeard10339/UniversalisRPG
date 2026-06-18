import { actionTitleKey } from '../game/contentIds';
import { getEnemy, getInteractionType } from '../game/adversarial';
import type { ContentBundle, UniversePlayState } from '../game/types';
import type { Translator } from '../game/i18n';
import { ChatPanel } from './ChatPanel';

type ActionDetailsProps = {
  bundle: ContentBundle;
  onStopAction: () => void;
  playState: UniversePlayState;
  t: Translator;
};

const HealthBar = ({ color, current, max }: { color: string; current: number; max: number }) => (
  <div className="h-3 overflow-hidden rounded bg-slate-950">
    <div className={`h-full ${color}`} style={{ width: `${Math.min(100, Math.max(0, (current / Math.max(1, max)) * 100))}%` }} />
  </div>
);

export const ActionDetails = ({ bundle, onStopAction, playState, t }: ActionDetailsProps) => {
  const activeAction = bundle.actions.find((action) => action.id === playState.activeAction?.actionId);
  const actionContext = {
    actions: bundle.actions,
    skills: bundle.skills,
    interactionTypes: bundle.interactionTypes,
    enemies: bundle.enemies,
  };
  const enemy = activeAction ? getEnemy(activeAction, actionContext) : null;
  const interactionType = activeAction ? getInteractionType(activeAction, actionContext) : null;
  const targetHealth = playState.activeAction?.targetHealth ?? enemy?.health ?? null;
  const showEnemyHealth = Boolean(activeAction && enemy && (enemy.showHealthBar ?? true) && targetHealth !== null);
  const showPlayerHealth = Boolean(activeAction && interactionType?.targetPlayerHealth);

  return (
    <section className="grid min-h-0 gap-4">
      <section className="grid gap-3 rounded border border-slate-800 bg-slate-900 p-4">
        {!activeAction && (
          <p className="text-sm text-slate-400">{t('actionDetails.empty')}</p>
        )}

        {activeAction && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-100">{t(activeAction.titleKey ?? actionTitleKey(activeAction.id))}</h2>
                {enemy && <p className="text-sm text-slate-400">{enemy.id}</p>}
              </div>
              <button className="rounded border border-rose-500 px-3 py-2 text-sm font-semibold text-rose-100" onClick={onStopAction} type="button">
                {t('actionDetails.stop')}
              </button>
            </div>

            {enemy && showEnemyHealth && (
              <div className="grid gap-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-300">{enemy.id}</span>
                  <span className="text-rose-100">{Math.ceil(targetHealth ?? enemy.health)}/{enemy.health}</span>
                </div>
                <HealthBar color="bg-rose-500" current={targetHealth ?? enemy.health} max={enemy.health} />
              </div>
            )}

            {(showEnemyHealth || showPlayerHealth) && <div className="border-t border-slate-800" />}

            {showPlayerHealth && (
              <div className="grid gap-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-300">{t('actionDetails.player')}</span>
                  <span className="text-rose-100">{Math.ceil(playState.playerHealth)}/{playState.playerMaxHealth}</span>
                </div>
                <HealthBar color="bg-red-500" current={playState.playerHealth} max={playState.playerMaxHealth} />
              </div>
            )}
          </>
        )}
      </section>

      <ChatPanel messages={playState.chatMessages} t={t} />
    </section>
  );
};
