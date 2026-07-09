import type { ContentBundle, UniversePlayState } from '../game/types';
import { skillExamineKey, skillTitleKey } from '../game/contentIds';
import type { Translator } from '../game/i18n';
import { skillLevelProgressFromXp } from '../game/skills';
import { ExamineButton } from './ExamineButton';

type SkillBarsProps = {
  bundle: ContentBundle;
  onExamine: (text: string) => void;
  playState: UniversePlayState;
  t: Translator;
};

export const SkillBars = ({ bundle, onExamine, playState, t }: SkillBarsProps) => (
  <section className="grid gap-3">
    <h2 className="text-base font-semibold text-slate-100">{t('skillBars.title')}</h2>
    <div className="grid gap-3">
      {bundle.skills.map((skill) => {
        const xp = playState.skillXp[skill.id] ?? 0;
        const progress = skillLevelProgressFromXp(xp, bundle.manifest.experienceCurve);
        const level = Math.min(skill.maxLevel, progress.level);

        return (
          <div className="grid gap-1" key={skill.id}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium text-slate-100">{t(skillTitleKey(skill.id))}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Lv {level}</span>
                <ExamineButton onExamine={onExamine} t={t} textKey={skillExamineKey(skill.id)} />
              </div>
            </div>
            <div className="h-2 overflow-hidden rounded bg-slate-800">
              <div className="h-full bg-emerald-300" style={{ width: `${progress.percent}%` }} />
            </div>
            <p className="text-xs text-slate-500">{xp} xp</p>
          </div>
        );
      })}
    </div>
  </section>
);
