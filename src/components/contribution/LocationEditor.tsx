import { useState } from 'react';
import type { ContributionDraft, LocationNode } from '../../game/types';

type LocationEditorProps = {
  draft: ContributionDraft;
  onChange: (locations: LocationNode[]) => void;
};

export const LocationEditor = ({ draft, onChange }: LocationEditorProps) => {
  const [id, setId] = useState('');
  const [titleKey, setTitleKey] = useState('');
  const [descriptionKey, setDescriptionKey] = useState('');

  const addLocation = () => {
    if (!id || !titleKey || !descriptionKey) {
      return;
    }

    onChange([
      ...draft.locations,
      {
        id,
        titleKey,
        descriptionKey,
        position: { x: 80 + draft.locations.length * 180, y: 320 },
        tags: ['community'],
      },
    ]);
    setId('');
    setTitleKey('');
    setDescriptionKey('');
  };

  return (
    <section className="grid gap-3 rounded border border-slate-700 p-3">
      <h3 className="text-sm font-semibold text-slate-100">Locations</h3>
      <div className="grid gap-2 md:grid-cols-3">
        <input className="rounded bg-slate-950 px-3 py-2 text-sm" onChange={(event) => setId(event.target.value)} placeholder="location-id" value={id} />
        <input className="rounded bg-slate-950 px-3 py-2 text-sm" onChange={(event) => setTitleKey(event.target.value)} placeholder="location.example.title" value={titleKey} />
        <input className="rounded bg-slate-950 px-3 py-2 text-sm" onChange={(event) => setDescriptionKey(event.target.value)} placeholder="location.example.description" value={descriptionKey} />
      </div>
      <button className="w-fit rounded bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950" onClick={addLocation} type="button">
        Add location
      </button>
      <pre className="max-h-40 overflow-auto rounded bg-slate-950 p-3 text-xs text-slate-300">{JSON.stringify(draft.locations, null, 2)}</pre>
    </section>
  );
};
