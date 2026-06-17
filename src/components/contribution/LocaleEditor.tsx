import { useState } from 'react';
import type { ContributionDraft, LocaleDictionary } from '../../game/types';

type LocaleEditorProps = {
  draft: ContributionDraft;
  locale: string;
  onChange: (locales: Record<string, LocaleDictionary>) => void;
};

export const LocaleEditor = ({ draft, locale, onChange }: LocaleEditorProps) => {
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');

  const addLocale = () => {
    if (!key || !value) {
      return;
    }

    onChange({
      ...draft.locales,
      [locale]: {
        ...(draft.locales[locale] ?? {}),
        [key]: value,
      },
    });
    setKey('');
    setValue('');
  };

  return (
    <section className="grid gap-3 rounded border border-slate-700 p-3">
      <h3 className="text-sm font-semibold text-slate-100">Localization</h3>
      <div className="grid gap-2 md:grid-cols-[1fr_2fr]">
        <input className="rounded bg-slate-950 px-3 py-2 text-sm" onChange={(event) => setKey(event.target.value)} placeholder="content.key" value={key} />
        <input className="rounded bg-slate-950 px-3 py-2 text-sm" onChange={(event) => setValue(event.target.value)} placeholder="Display text" value={value} />
      </div>
      <button className="w-fit rounded bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950" onClick={addLocale} type="button">
        Add string
      </button>
      <pre className="max-h-40 overflow-auto rounded bg-slate-950 p-3 text-xs text-slate-300">{JSON.stringify(draft.locales, null, 2)}</pre>
    </section>
  );
};
