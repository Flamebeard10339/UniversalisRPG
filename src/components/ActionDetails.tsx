import { useEffect, useRef, useState } from 'react';
import {
  actionTitleKey,
  interactionPlayerHitKey,
  interactionPlayerKillKey,
  skillTitleKey,
} from '../game/contentIds';
import { getEnemy, getInteractionType } from '../game/adversarial';
import type { ConcreteReward, ContentBundle, Reward, UniversePlayState } from '../game/types';
import type { Translator } from '../game/i18n';
import { resolveManifestUiSettings } from '../game/universeSettings';
import { aggregateRewards } from '../game/rewards';
import { useNow } from '../hooks/useNow';
import { ResourceStatus } from './ResourceStatus';

type ActionDetailsProps = {
  bundle: ContentBundle;
  onStopAction: () => void;
  playState: UniversePlayState;
  t: Translator;
};

type FloatingText = {
  createdAt: number;
  durationMs: number;
  id: string;
  text: string;
};

const formatFloatNumber = (value: number) =>
  Number.isInteger(value) ? String(value) : Math.abs(value) < 10 ? value.toFixed(2) : value.toFixed(1);

const skillXpText = (rewards: Reward[], t: Translator) => aggregateRewards(rewards.filter((reward): reward is ConcreteReward =>
  reward.kind !== 'dropTable' && typeof reward.amount === 'number',
))
  .filter((reward): reward is Extract<ConcreteReward, { kind: 'skillXp' }> => reward.kind === 'skillXp' && reward.amount > 0)
  .map((reward) => `${t(skillTitleKey(reward.skillId), reward.skillId)} ${formatFloatNumber(reward.amount)}`)
  .join(', ');

const messageSignature = (id: number, index: number, count: number, createdAt: number) =>
  `${id}:${index}:${count}:${createdAt}`;

export const ActionDetails = ({ bundle, onStopAction, playState, t }: ActionDetailsProps) => {
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);
  const now = useNow(Boolean(playState.activeAction) || floatingTexts.length > 0, 100);
  const seenMessageIds = useRef<Set<string> | null>(null);
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
  const interactionType = activeAction ? getInteractionType(activeAction, actionContext) : null;
  const floatingDurationMs = resolveManifestUiSettings(bundle.manifest).floatingTextDurationSeconds * 1000;

  useEffect(() => {
    if (seenMessageIds.current === null) {
      seenMessageIds.current = new Set(playState.chatMessages.map((message, index) => messageSignature(message.id, index, message.count, message.createdAt)));
      return;
    }

    if (!interactionType) {
      return;
    }

    const playerHitKey = interactionPlayerHitKey(interactionType.id);
    const playerKillKey = interactionPlayerKillKey(interactionType.id);
    const nextFloatingTexts: FloatingText[] = [];

    playState.chatMessages.forEach((message, index) => {
      const messageId = messageSignature(message.id, index, message.count, message.createdAt);
      if (seenMessageIds.current?.has(messageId)) {
        return;
      }
      seenMessageIds.current?.add(messageId);

      if (activeAction && enemy && (message.key === playerHitKey || message.key === playerKillKey)) {
        const rewards = message.key === playerKillKey ? [...activeAction.rewards, ...enemy.rewards] : activeAction.rewards;
        const text = skillXpText(rewards, t);
        if (text) {
          nextFloatingTexts.push({
            createdAt: message.createdAt,
            durationMs: floatingDurationMs,
            id: `${messageId}:xp`,
            text,
          });
        }
      }
    });

    if (nextFloatingTexts.length > 0) {
      setFloatingTexts((current) => [...current, ...nextFloatingTexts].filter((text) => now - text.createdAt <= text.durationMs));
    }
  }, [activeAction, enemy, floatingDurationMs, interactionType, now, playState.chatMessages, t]);

  useEffect(() => {
    setFloatingTexts((current) => {
      const next = current.filter((text) => now - text.createdAt <= text.durationMs);
      return next.length === current.length ? current : next;
    });
  }, [now]);

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
                <h2 className="text-base font-semibold text-slate-100">{t(actionTitleKey(activeAction.id))}</h2>
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

      {floatingTexts.map((text) => {
        const progress = Math.min(1, Math.max(0, (now - text.createdAt) / text.durationMs));
        return (
          <div
            className="pointer-events-none fixed bottom-28 right-8 z-20 max-w-[min(22rem,calc(100vw-2rem))] whitespace-normal text-right text-sm font-semibold text-cyan-200 drop-shadow"
            key={text.id}
            style={{
              opacity: 1 - progress,
              transform: `translateY(${-progress * 24}px)`,
            }}
          >
            {text.text}
          </div>
        );
      })}
    </section>
  );
};
