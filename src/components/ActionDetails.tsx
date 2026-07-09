import { getEnemy } from '../game/adversarial';
import type { ContentBundle, UniversePlayState } from '../game/types';
import type { Translator } from '../game/i18n';
import { ResourceStatus } from './ResourceStatus';
import { getActionTitleText } from '../game/actionLocalization';

type ActionDetailsProps = {
  bundle: ContentBundle;
  onStopAction: () => void;
  playState: UniversePlayState;
  t: Translator;
};

export const ActionDetails = ({ bundle, onStopAction, playState, t }: ActionDetailsProps) => {
  const activeAction = bundle.actions.find((action) => action.id === playState.activeAction?.actionId);
  const actionContext = {
    manifest: bundle.manifest,
    actions: bundle.actions,
    skills: bundle.skills,
    stats: bundle.stats,
    locations: bundle.locations,
    entities: bundle.entities,
    items: bundle.items,
    flags: bundle.flags,
    resourceDefinitions: bundle.resourceDefinitions,
    effects: bundle.effects,
    interactionTypes: bundle.interactionTypes,
    enemies: bundle.enemies,
    dropTables: bundle.dropTables,
  };
  const enemy = activeAction ? getEnemy(activeAction, actionContext) : null;

  return (
    <section className="grid min-h-0 gap-4">
      <section className="relative grid gap-3 overflow-hidden rounded border border-slate-800 bg-slate-900 p-4">
        {!activeAction && (
          <p className="text-sm text-slate-400">{t('actionDetails.empty')}</p>
        )}

        {activeAction && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-100">{getActionTitleText(activeAction, bundle, t, playState, actionContext)}</h2>
                {enemy && <p className="text-sm text-slate-400">{enemy.id}</p>}
              </div>
              <button className="rounded border border-rose-500 px-3 py-2 text-sm font-semibold text-rose-100" onClick={onStopAction} type="button">
                {t('actionDetails.stop')}
              </button>
            </div>

            {enemy && (enemy.showHealthBar ?? true) && (
              <ResourceStatus bundle={bundle} owner="enemy" playState={playState} showTitle={false} t={t} />
            )}
          </>
        )}
      </section>

      <section className="rounded border border-slate-800 bg-slate-900 p-4">
        <ResourceStatus bundle={bundle} playState={playState} t={t} />
      </section>
    </section>
  );
};
