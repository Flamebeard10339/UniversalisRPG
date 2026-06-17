import { useState } from 'react';
import type { ContributionDraft, GameAction } from '../../game/types';

type ActionEditorProps = {
  draft: ContributionDraft;
  onChange: (actions: GameAction[]) => void;
};

export const ActionEditor = ({ draft, onChange }: ActionEditorProps) => {
  const [id, setId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [titleKey, setTitleKey] = useState('');
  const [descriptionKey, setDescriptionKey] = useState('');

  const addAction = () => {
    if (!id || !locationId || !titleKey || !descriptionKey) {
      return;
    }

    onChange([
      ...draft.actions,
      {
        id,
        locationId,
        titleKey,
        descriptionKey,
        durationSeconds: 10,
        rewards: [{ kind: 'skillXp', skillId: 'lore', amount: 1 }],
      },
    ]);
    setId('');
    setLocationId('');
    setTitleKey('');
    setDescriptionKey('');
  };

  return (
    <section className="grid gap-3 rounded border border-slate-700 p-3">
      <h3 className="text-sm font-semibold text-slate-100">Actions</h3>
      <div className="grid gap-2 md:grid-cols-4">
        <input className="rounded bg-slate-950 px-3 py-2 text-sm" onChange={(event) => setId(event.target.value)} placeholder="action-id" value={id} />
        <input className="rounded bg-slate-950 px-3 py-2 text-sm" onChange={(event) => setLocationId(event.target.value)} placeholder="location-id" value={locationId} />
        <input className="rounded bg-slate-950 px-3 py-2 text-sm" onChange={(event) => setTitleKey(event.target.value)} placeholder="action.example.title" value={titleKey} />
        <input className="rounded bg-slate-950 px-3 py-2 text-sm" onChange={(event) => setDescriptionKey(event.target.value)} placeholder="action.example.description" value={descriptionKey} />
      </div>
      <button className="w-fit rounded bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950" onClick={addAction} type="button">
        Add action
      </button>
      <pre className="max-h-40 overflow-auto rounded bg-slate-950 p-3 text-xs text-slate-300">{JSON.stringify(draft.actions, null, 2)}</pre>
    </section>
  );
};
