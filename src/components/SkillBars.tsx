import type { ContentBundle, UniversePlayState } from '../game/types';
import { skillTitleKey } from '../game/contentIds';
import type { Translator } from '../game/i18n';
import { skillLevelFromXp } from '../game/skills';

type SkillBarsProps = {
  bundle: ContentBundle;
  playState: UniversePlayState;
  t: Translator;
};

export const SkillBars = ({ bundle, playState, t }: SkillBarsProps) => (
  <section className="grid gap-3">
    <h2 className="text-base font-semibold text-slate-100">{t('skillBars.title')}</h2>
    <div className="grid gap-3">
      {bundle.skills.map((skill) => {
        const xp = playState.skillXp[skill.id] ?? 0;
        const level = Math.min(skill.maxLevel, skillLevelFromXp(xp));
        const progress = Math.min(100, xp % 100);

        return (
          <div className="grid gap-1" key={skill.id}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium text-slate-100">{t(skill.titleKey ?? skillTitleKey(skill.id))}</span>
              <span className="text-xs text-slate-400">Lv {level}</span>
            </div>
            <div className="h-2 overflow-hidden rounded bg-slate-800">
              <div className="h-full bg-emerald-300" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-xs text-slate-500">{xp} xp</p>
          </div>
        );
      })}
    </div>
  </section>
);
