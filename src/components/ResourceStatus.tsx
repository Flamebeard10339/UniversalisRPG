import { useEffect, useRef, useState } from 'react';
import { effectTitleKey, interactionEntityHitKey, interactionEntityKillKey, resourceTitleKey } from '../game/contentIds';
import type { ContentBundle, ResourceDefinition, ResourcePool, UniversePlayState } from '../game/types';
import type { Translator } from '../game/i18n';
import { getEffectRatePerMinute, isEffectApplicable, projectResourcePool } from '../game/resources';
import { resolveManifestUiSettings } from '../game/universeSettings';
import { useNow } from '../hooks/useNow';

type ResourceStatusProps = {
  bundle: ContentBundle;
  playState: UniversePlayState;
  showEffects?: boolean;
  t: Translator;
};

const formatNumber = (value: number) =>
  Number.isInteger(value) ? String(value) : value.toFixed(1);

const formatFloatNumber = (value: number) =>
  Number.isInteger(value) ? String(value) : Math.abs(value) < 10 ? value.toFixed(2) : value.toFixed(1);

type ResourceFloatingText = {
  createdAt: number;
  durationMs: number;
  id: string;
  resourceId: string;
  text: string;
};

type ResourceRowProps = {
  bundle: ContentBundle;
  floatingTexts: ResourceFloatingText[];
  playState: UniversePlayState;
  pool: ResourcePool;
  resource: ResourceDefinition;
  showEffects: boolean;
  t: Translator;
  now: number;
};

const ResourceRow = ({ bundle, floatingTexts, playState, pool, resource, showEffects, t, now }: ResourceRowProps) => {
  const percent = Math.min(100, Math.max(0, ((pool.current - pool.min) / Math.max(1, pool.max - pool.min)) * 100));
  const [afterPercent, setAfterPercent] = useState(percent);
  const previousPercent = useRef(percent);
  const catchupTimeout = useRef<number | null>(null);
  const effects = (bundle.effects ?? []).filter((effect) => effect.resourceId === resource.id);

  useEffect(() => {
    const previous = previousPercent.current;
    if (Math.abs(previous - percent) < 0.05) {
      return undefined;
    }

    previousPercent.current = percent;
    setAfterPercent(previous);
    if (catchupTimeout.current !== null) {
      window.clearTimeout(catchupTimeout.current);
    }
    catchupTimeout.current = window.setTimeout(() => setAfterPercent(percent), 500);

    return () => {
      if (catchupTimeout.current !== null) {
        window.clearTimeout(catchupTimeout.current);
        catchupTimeout.current = null;
      }
    };
  }, [percent]);

  return (
    <section className="relative grid gap-2 overflow-hidden rounded border border-slate-800 bg-slate-950 p-3">
      {floatingTexts.map((text) => {
        const progress = Math.min(1, Math.max(0, (now - text.createdAt) / text.durationMs));
        return (
          <div
            className="pointer-events-none absolute right-4 top-7 z-10 whitespace-nowrap text-sm font-semibold text-rose-200 drop-shadow"
            key={text.id}
            style={{
              opacity: 1 - progress,
              transform: `translateY(${-progress * 20}px)`,
            }}
          >
            {text.text}
          </div>
        );
      })}
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold text-slate-100">{t(resourceTitleKey(resource.id), resource.id)}</span>
        <span className="text-xs text-slate-300">
          {t('resources.value', {
            current: formatNumber(pool.current),
            min: formatNumber(pool.min),
            max: formatNumber(pool.max),
          })}
        </span>
      </div>
      <div className="relative h-2 overflow-hidden rounded bg-slate-800">
        <div className="absolute inset-y-0 left-0 bg-slate-500/70 transition-[width] duration-300" style={{ width: `${afterPercent}%` }} />
        <div className="absolute inset-y-0 left-0 bg-rose-400" style={{ width: `${percent}%` }} />
      </div>

      {showEffects && (
        <div className="grid gap-1 border-t border-slate-800 pt-2 text-xs">
          {effects.length === 0 ? (
            <p className="text-slate-500">{t('resources.effects.empty')}</p>
          ) : (
            effects.map((effect) => {
              const rate = getEffectRatePerMinute(bundle.stats, playState, effect, bundle.manifest.basePlayer);
              const active = Boolean(playState.activeAction) && isEffectApplicable(bundle, playState, effect);

              return (
                <div className="flex flex-wrap items-center justify-between gap-2 text-slate-300" key={effect.id}>
                  <span>{t(effectTitleKey(effect.id), effect.id)}</span>
                  <span className={active ? 'text-emerald-200' : 'text-slate-500'}>
                    {t(active ? 'resources.effects.activeRate' : 'resources.effects.inactiveRate', {
                      rate: formatNumber(rate),
                    })}
                    {` ${t('resources.effects.fromStat', { stat: effect.sourceStat })}`}
                  </span>
                </div>
              );
            })
          )}
        </div>
      )}
    </section>
  );
};

const messageSignature = (id: number, index: number, count: number, createdAt: number) =>
  `${id}:${index}:${count}:${createdAt}`;

export const ResourceStatus = ({ bundle, playState, showEffects = false, t }: ResourceStatusProps) => {
  const resources = (bundle.resourceDefinitions ?? []).filter((resource) => !resource.hidden);
  const [floatingTexts, setFloatingTexts] = useState<ResourceFloatingText[]>([]);
  const now = useNow(Boolean(playState.activeAction) || floatingTexts.length > 0, 100);
  const seenMessageIds = useRef<Set<string> | null>(null);
  const floatingDurationMs = resolveManifestUiSettings(bundle.manifest).floatingTextDurationSeconds * 1000;

  useEffect(() => {
    if (seenMessageIds.current === null) {
      seenMessageIds.current = new Set(playState.chatMessages.map((message, index) => messageSignature(message.id, index, message.count, message.createdAt)));
      return;
    }

    const entityDamageKeys = new Set(bundle.interactionTypes.flatMap((interactionType) => [
      interactionEntityHitKey(interactionType.id),
      interactionEntityKillKey(interactionType.id),
    ]));
    const nextFloatingTexts: ResourceFloatingText[] = [];

    playState.chatMessages.forEach((message, index) => {
      const messageId = messageSignature(message.id, index, message.count, message.createdAt);
      if (seenMessageIds.current?.has(messageId)) {
        return;
      }
      seenMessageIds.current?.add(messageId);

      const damage = Number(message.params?.damage ?? 0);
      if (entityDamageKeys.has(message.key ?? '') && Number.isFinite(damage) && damage > 0) {
        nextFloatingTexts.push({
          createdAt: message.createdAt,
          durationMs: floatingDurationMs,
          id: `${messageId}:health-damage`,
          resourceId: 'health',
          text: `-${formatFloatNumber(damage)}`,
        });
      }
    });

    if (nextFloatingTexts.length > 0) {
      setFloatingTexts((current) => [...current, ...nextFloatingTexts].filter((text) => now - text.createdAt <= text.durationMs));
    }
  }, [bundle.interactionTypes, floatingDurationMs, now, playState.chatMessages]);

  useEffect(() => {
    setFloatingTexts((current) => {
      const next = current.filter((text) => now - text.createdAt <= text.durationMs);
      return next.length === current.length ? current : next;
    });
  }, [now]);

  return (
    <section className="grid gap-3">
      <h2 className="text-base font-semibold text-slate-100">{t('resources.title')}</h2>

      {resources.length === 0 ? (
        <p className="text-sm text-slate-500">{t('resources.empty')}</p>
      ) : (
        <div className="grid gap-3">
          {resources.map((resource) => {
            const pool = projectResourcePool(bundle, playState, resource, now);

            return (
              <ResourceRow
                bundle={bundle}
                floatingTexts={floatingTexts.filter((text) => text.resourceId === resource.id)}
                key={resource.id}
                now={now}
                playState={playState}
                pool={pool}
                resource={resource}
                showEffects={showEffects}
                t={t}
              />
            );
          })}
        </div>
      )}
    </section>
  );
};
