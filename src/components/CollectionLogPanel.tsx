import { useState } from 'react';
import { collectionCategoryTitleKey, collectionDropKey, collectionKillKey, collectionTrackedItemIds } from '../game/collectionLog';
import { entityTitleKey, itemTitleKey, locationDescriptionKey, locationTitleKey } from '../game/contentIds';
import type { ContentBundle, UniversePlayState } from '../game/types';
import type { Translator } from '../game/i18n';

type CollectionLogPanelProps = {
  bundle: ContentBundle;
  playState: UniversePlayState;
  t: Translator;
};

type CollectionEntry = {
  categoryId: string;
  entityId: string;
  killCount: number;
  killTargetCount: number;
  drops: Array<{ itemId: string; count: number }>;
  found: boolean;
};

const entriesForBundle = (bundle: ContentBundle, playState: UniversePlayState): CollectionEntry[] =>
  (bundle.entities ?? []).flatMap((entity) =>
    (entity.collectionLog ?? []).map((definition) => {
      const killCount = playState.collectionLog[collectionKillKey(entity.id)] ?? playState.actionCompletions[definition.actionId] ?? 0;
      const drops = collectionTrackedItemIds(definition, bundle).map((itemId) => ({
        itemId,
        count: playState.collectionLog[collectionDropKey(entity.id, itemId)] ?? 0,
      }));
      return {
        categoryId: definition.categoryId,
        entityId: entity.id,
        killCount,
        killTargetCount: definition.killTargetCount ?? 1,
        drops,
        found: killCount > 0 || drops.some((drop) => drop.count > 0),
      };
    }),
  );

export const CollectionLogPanel = ({ bundle, playState, t }: CollectionLogPanelProps) => {
  const [expandedEntries, setExpandedEntries] = useState<Record<string, boolean>>({});
  const entries = entriesForBundle(bundle, playState);
  const categoryIds = Array.from(new Set(entries.map((entry) => entry.categoryId)));
  const exploredLocationIds = new Set(playState.discoveredLocationIds);
  const exploredLocations = bundle.locations.filter((location) =>
    exploredLocationIds.has(location.id) || playState.collectionLog[`location:${location.id}:explored`] > 0,
  );

  return (
    <section className="grid gap-4">
      <section className="grid gap-3 rounded border border-slate-800 bg-slate-900 p-4">
        <div>
          <h2 className="text-base font-semibold text-slate-100">{t('collectionLog.locations.title')}</h2>
          <p className="text-sm text-slate-400">
            {t('collectionLog.locations.progress', { completed: exploredLocations.length, total: bundle.locations.length })}
          </p>
        </div>
        {exploredLocations.length === 0 ? (
          <p className="text-sm text-slate-500">{t('collectionLog.noDiscoveredEntries')}</p>
        ) : (
          <div className="grid gap-2">
            {exploredLocations.map((location) => (
              <section className="rounded border border-slate-800 bg-slate-950 p-3" key={location.id}>
                <h3 className="text-sm font-semibold text-slate-100">{t(locationTitleKey(location.id), location.id)}</h3>
                <p className="mt-1 text-sm text-slate-400">{t(locationDescriptionKey(location.id), '')}</p>
              </section>
            ))}
          </div>
        )}
      </section>

      {categoryIds.length === 0 ? (
        <section className="rounded border border-slate-800 bg-slate-900 p-4">
          <p className="text-sm text-slate-500">{t('collectionLog.empty')}</p>
        </section>
      ) : categoryIds.map((categoryId) => {
        const categoryEntries = entries.filter((entry) => entry.categoryId === categoryId);
        const foundEntries = categoryEntries.filter((entry) => entry.found);
        const completed = categoryEntries.reduce((total, entry) => total + Math.min(entry.killCount, entry.killTargetCount), 0);
        const total = categoryEntries.reduce((sum, entry) => sum + entry.killTargetCount, 0);
        const percent = total > 0 ? Math.floor((completed / total) * 100) : 0;

        return (
          <section className="grid gap-3 rounded border border-slate-800 bg-slate-900 p-4" key={categoryId}>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-100">{t(collectionCategoryTitleKey(categoryId), categoryId)}</h2>
                <p className="text-sm text-slate-400">{t('collectionLog.categoryProgress', { completed, total, percent })}</p>
              </div>
            </div>

            {foundEntries.length === 0 ? (
              <p className="text-sm text-slate-500">{t('collectionLog.noDiscoveredEntries')}</p>
            ) : (
              <div className="grid gap-2">
                {foundEntries.map((entry) => {
                  const expanded = Boolean(expandedEntries[entry.entityId]);
                  return (
                    <section className="rounded border border-slate-800 bg-slate-950" key={entry.entityId}>
                      <button
                        aria-expanded={expanded}
                        className="flex w-full min-w-0 items-center gap-3 px-3 py-3 text-left transition hover:bg-slate-900"
                        onClick={() => setExpandedEntries((current) => ({ ...current, [entry.entityId]: !current[entry.entityId] }))}
                        type="button"
                      >
                        <span className="w-4 shrink-0 text-cyan-200">{expanded ? 'v' : '>'}</span>
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-100">{t(entityTitleKey(entry.entityId), entry.entityId)}</span>
                        <span className="text-xs text-slate-400">{t('collectionLog.killsValue', { count: entry.killCount })}</span>
                      </button>

                      {expanded && (
                        <div className="grid gap-3 border-t border-slate-800 p-3 text-sm">
                          <div className="flex justify-between gap-4 text-slate-300">
                            <span>{t('collectionLog.kills')}</span>
                            <span className="font-semibold text-slate-100">{entry.killCount}</span>
                          </div>
                          <section className="grid gap-2">
                            <h3 className="text-xs font-semibold uppercase text-slate-500">{t('collectionLog.drops')}</h3>
                            {entry.drops.length === 0 ? (
                              <p className="text-sm text-slate-500">{t('collectionLog.noTrackedDrops')}</p>
                            ) : entry.drops.map((drop) => (
                              <div className="flex justify-between gap-4 text-slate-300" key={drop.itemId}>
                                <span>{t(itemTitleKey(drop.itemId), drop.itemId)}</span>
                                <span className="font-semibold text-slate-100">{drop.count}</span>
                              </div>
                            ))}
                          </section>
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </section>
  );
};
