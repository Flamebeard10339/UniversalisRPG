import { skillExamineKey, skillTitleKey } from '../game/contentIds';
import { skillLevelProgressFromXp } from '../game/skills';
import type { ContentBundle, UniversePlayState } from '../game/types';
import type { Translator } from '../game/i18n';

type SkillDetailModalProps = {
  bundle: ContentBundle;
  onClose: () => void;
  playState: UniversePlayState;
  skillId: string;
  t: Translator;
};

export const SkillDetailModal = ({ bundle, onClose, playState, skillId, t }: SkillDetailModalProps) => {
  const skill = bundle.skills.find((candidate) => candidate.id === skillId);
  const maxLevel = skill?.maxLevel ?? Number.POSITIVE_INFINITY;
  const xp = playState.skillXp[skillId] ?? 0;
  const progress = skillLevelProgressFromXp(xp, bundle.manifest.experienceCurve);
  const level = Math.min(maxLevel, progress.level);
  const isMaxLevel = progress.level >= maxLevel;
  const percent = isMaxLevel ? 100 : progress.percent;
  const xpToNextLevel = Math.max(0, progress.nextLevelCost - progress.current);
  const examineText = t(skillExamineKey(skillId), '');

  return (
    <div className="fixed inset-0 z-20 grid place-items-center bg-slate-950/80 p-4" onClick={onClose}>
      <section
        className="w-full max-w-md rounded border border-slate-700 bg-slate-900 p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold text-slate-100">
            {t('skillBars.detail.title', { level: String(level), skill: t(skillTitleKey(skillId), skillId) })}
          </h2>
          <button className="rounded border border-slate-600 px-3 py-1 text-sm text-slate-100" onClick={onClose} type="button">
            {t('dialog.close')}
          </button>
        </div>

        {examineText && <p className="mt-2 text-sm text-slate-400">{examineText}</p>}

        <div className="mt-4 h-2 overflow-hidden rounded bg-slate-800">
          <div className="h-full bg-emerald-300" style={{ width: `${percent}%` }} />
        </div>

        <div className="mt-3 grid gap-1 text-sm text-slate-300">
          <span>{t('skillBars.detail.totalXp', { xp: String(xp) })}</span>
          {isMaxLevel ? (
            <span>{t('skillBars.detail.maxLevel')}</span>
          ) : (
            <>
              <span>{t('skillBars.detail.xpToNextLevel', { xp: String(xpToNextLevel) })}</span>
              <span>{t('skillBars.detail.xpForNextLevel', { xp: String(progress.nextLevelCost) })}</span>
            </>
          )}
        </div>
      </section>
    </div>
  );
};
