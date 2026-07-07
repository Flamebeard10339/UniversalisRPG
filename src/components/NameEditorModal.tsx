import { useState } from 'react';
import type { Translator } from '../game/i18n';

type NameEditorModalProps = {
  initialName: string;
  onClose: () => void;
  onSave: (name: string) => void;
  t: Translator;
};

export const NameEditorModal = ({ initialName, onClose, onSave, t }: NameEditorModalProps) => {
  const [name, setName] = useState(initialName);

  return (
    <div className="fixed inset-0 z-20 grid place-items-center bg-slate-950/80 p-4">
      <section className="w-full max-w-md rounded border border-slate-700 bg-slate-900 p-5 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold text-slate-100">{t('nameEditor.title')}</h2>
          <button className="rounded border border-slate-600 px-3 py-1 text-sm text-slate-100" onClick={onClose} type="button">
            {t('dialog.close')}
          </button>
        </div>
        <input
          className="mt-4 w-full rounded border border-slate-700 bg-slate-950 p-2 text-sm text-slate-100"
          maxLength={24}
          onChange={(event) => setName(event.target.value)}
          placeholder={t('nameEditor.placeholder')}
          type="text"
          value={name}
        />
        <div className="mt-4 flex justify-end gap-2">
          <button className="rounded border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-100" onClick={onClose} type="button">
            {t('dialog.cancel')}
          </button>
          <button
            className="rounded bg-cyan-300 px-3 py-2 text-sm font-semibold text-slate-950"
            onClick={() => onSave(name.trim())}
            type="button"
          >
            {t('nameEditor.save')}
          </button>
        </div>
      </section>
    </div>
  );
};
