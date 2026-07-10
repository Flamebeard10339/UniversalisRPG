import { skillTitleKey } from '../game/contentIds';
import { skillLevelProgressFromXp } from '../game/skills';
import type { ContentBundle, UniversePlayState } from '../game/types';
import type { Translator } from '../game/i18n';

type SkillBarsProps = {
  bundle: ContentBundle;
  onOpenSkill: (skillId: string) => void;
  playState: UniversePlayState;
  t: Translator;
};

export const SkillBars = ({ bundle, onOpenSkill, playState, t }: SkillBarsProps) => (
  <section className="grid gap-3">
    <h2 className="text-base font-semibold text-slate-100">{t('skillBars.title')}</h2>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
      {bundle.skills.map((skill) => {
        const xp = playState.skillXp[skill.id] ?? 0;
        const progress = skillLevelProgressFromXp(xp, bundle.manifest.experienceCurve);
        const level = Math.min(skill.maxLevel, progress.level);
        const percent = level >= skill.maxLevel ? 100 : progress.percent;

        return (
          <button
            className="grid gap-1 rounded border border-slate-800 bg-slate-950 p-3 text-center transition hover:border-cyan-500"
            data-skill-id={skill.id}
            key={skill.id}
            onClick={() => onOpenSkill(skill.id)}
            type="button"
          >
            <span className="text-xs font-medium text-slate-400">{t(skillTitleKey(skill.id))}</span>
            <span className="text-xl font-semibold text-cyan-100">{level}</span>
            <div className="h-1 overflow-hidden rounded bg-slate-800">
              <div className="h-full bg-emerald-300" style={{ width: `${percent}%` }} />
            </div>
          </button>
        );
      })}
    </div>
  </section>
);
