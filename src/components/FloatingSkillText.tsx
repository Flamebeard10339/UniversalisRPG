import { useEffect, useRef, useState } from 'react';
import { skillTitleKey } from '../game/contentIds';
import type { ContentBundle, RunLogEntry, UniversePlayState } from '../game/types';
import type { Translator } from '../game/i18n';
import { resolveManifestUiSettings } from '../game/universeSettings';
import { useNow } from '../hooks/useNow';

type FloatingSkillTextProps = {
  bundle: ContentBundle;
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

const skillAmountsFromEntry = (entry: RunLogEntry): Record<string, number> => {
  const amounts: Record<string, number> = {};
  const add = (skillId: unknown, amount: unknown) => {
    if (typeof skillId !== 'string' || typeof amount !== 'number' || amount <= 0) return;
    amounts[skillId] = (amounts[skillId] ?? 0) + amount;
  };

  if (entry.event === 'skill.xp-event') {
    add(entry.data?.skillId, entry.data?.amount);
    return amounts;
  }

  if (entry.event === 'action.complete') {
    for (const reward of (entry.data?.rewards as Array<Record<string, unknown>> | undefined) ?? []) {
      if (reward.kind === 'skillXp') add(reward.skillId, reward.amount);
    }
    for (const result of (entry.data?.results as Array<Record<string, unknown>> | undefined) ?? []) {
      if (result.kind === 'skill-xp') add(result.skillId, result.amount);
    }
  }

  return amounts;
};

export const FloatingSkillText = ({ bundle, playState, t }: FloatingSkillTextProps) => {
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);
  const now = useNow(floatingTexts.length > 0, 100);
  const seenSequence = useRef<number | null>(null);
  const floatingDurationMs = resolveManifestUiSettings(bundle.manifest).floatingTextDurationSeconds * 1000;

  useEffect(() => {
    if (seenSequence.current === null) {
      seenSequence.current = playState.runLog.reduce((max, entry) => Math.max(max, entry.sequence), 0);
      return;
    }

    const newEntries = playState.runLog.filter((entry) => entry.sequence > (seenSequence.current ?? 0));
    if (newEntries.length === 0) return;
    seenSequence.current = newEntries.reduce((max, entry) => Math.max(max, entry.sequence), seenSequence.current ?? 0);

    const batches = new Map<number, { createdAt: number; amounts: Record<string, number> }>();
    for (const entry of newEntries) {
      const amounts = skillAmountsFromEntry(entry);
      if (Object.keys(amounts).length === 0) continue;
      const batch = batches.get(entry.createdAt) ?? { createdAt: entry.createdAt, amounts: {} };
      for (const [skillId, amount] of Object.entries(amounts)) {
        batch.amounts[skillId] = (batch.amounts[skillId] ?? 0) + amount;
      }
      batches.set(entry.createdAt, batch);
    }

    const nextFloatingTexts = [...batches.values()].map((batch) => ({
      createdAt: batch.createdAt,
      durationMs: floatingDurationMs,
      id: `${batch.createdAt}:${Object.keys(batch.amounts).join(',')}`,
      text: Object.entries(batch.amounts)
        .map(([skillId, amount]) => `${t(skillTitleKey(skillId), skillId)} ${formatFloatNumber(amount)}`)
        .join(', '),
    }));

    if (nextFloatingTexts.length > 0) {
      setFloatingTexts((current) => [...current, ...nextFloatingTexts].filter((text) => now - text.createdAt <= text.durationMs));
    }
  }, [floatingDurationMs, now, playState.runLog, t]);

  useEffect(() => {
    setFloatingTexts((current) => {
      const next = current.filter((text) => now - text.createdAt <= text.durationMs);
      return next.length === current.length ? current : next;
    });
  }, [now]);

  return (
    <div className="pointer-events-none fixed bottom-28 right-8 z-20 flex max-w-[min(22rem,calc(100vw-2rem))] flex-col items-end gap-1">
      {floatingTexts.map((text) => {
        const progress = Math.min(1, Math.max(0, (now - text.createdAt) / text.durationMs));
        return (
          <div
            className="whitespace-normal text-right text-sm font-semibold text-cyan-200 drop-shadow"
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
    </div>
  );
};
