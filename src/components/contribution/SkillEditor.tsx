import { useState } from 'react';
import type { ContributionDraft, SkillDefinition } from '../../game/types';

type SkillEditorProps = {
  draft: ContributionDraft;
  onChange: (skills: SkillDefinition[]) => void;
};

export const SkillEditor = ({ draft, onChange }: SkillEditorProps) => {
  const [id, setId] = useState('');
  const [titleKey, setTitleKey] = useState('');
  const [descriptionKey, setDescriptionKey] = useState('');

  const addSkill = () => {
    if (!id || !titleKey || !descriptionKey) {
      return;
    }

    onChange([
      ...draft.skills,
      {
        id,
        titleKey,
        descriptionKey,
        maxLevel: 100,
      },
    ]);
    setId('');
    setTitleKey('');
    setDescriptionKey('');
  };

  return (
    <section className="grid gap-3 rounded border border-slate-700 p-3">
      <h3 className="text-sm font-semibold text-slate-100">Skills</h3>
      <div className="grid gap-2 md:grid-cols-3">
        <input className="rounded bg-slate-950 px-3 py-2 text-sm" onChange={(event) => setId(event.target.value)} placeholder="skill-id" value={id} />
        <input className="rounded bg-slate-950 px-3 py-2 text-sm" onChange={(event) => setTitleKey(event.target.value)} placeholder="skill.example.title" value={titleKey} />
        <input className="rounded bg-slate-950 px-3 py-2 text-sm" onChange={(event) => setDescriptionKey(event.target.value)} placeholder="skill.example.description" value={descriptionKey} />
      </div>
      <button className="w-fit rounded bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950" onClick={addSkill} type="button">
        Add skill
      </button>
      <pre className="max-h-40 overflow-auto rounded bg-slate-950 p-3 text-xs text-slate-300">{JSON.stringify(draft.skills, null, 2)}</pre>
    </section>
  );
};
