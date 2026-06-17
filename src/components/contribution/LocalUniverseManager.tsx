import { useMemo, useState } from 'react';
import type { ContentBundle } from '../../game/types';
import { validateContentBundle } from '../../game/validators';
import { useUniverseState } from '../../stores/universeState';

type LocalUniverseManagerProps = {
  bundle: ContentBundle;
};

export const LocalUniverseManager = ({ bundle }: LocalUniverseManagerProps) => {
  const [importText, setImportText] = useState('');
  const [message, setMessage] = useState('');
  const manifests = useUniverseState((state) => state.manifests);
  const importLocalUniverse = useUniverseState((state) => state.importLocalUniverse);
  const removeLocalUniverse = useUniverseState((state) => state.removeLocalUniverse);
  const exportedJson = useMemo(() => JSON.stringify(bundle, null, 2), [bundle]);

  const importBundle = async () => {
    try {
      const parsed = JSON.parse(importText) as ContentBundle;
      const issues = validateContentBundle(parsed);
      const errors = issues.filter((issue) => issue.severity === 'error');

      if (errors.length > 0) {
        setMessage(errors.map((issue) => `${issue.path}: ${issue.message}`).join('\n'));
        return;
      }

      await importLocalUniverse(parsed);
      setImportText('');
      setMessage(`Imported ${parsed.manifest.id}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to import universe JSON.');
    }
  };

  const copyExport = async () => {
    await navigator.clipboard.writeText(exportedJson);
    setMessage(`Copied ${bundle.manifest.id}.`);
  };

  return (
    <section className="grid gap-3 rounded border border-slate-700 p-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-100">Local universes</h3>
        <p className="text-xs text-slate-400">Import, export, or remove JSON universe packages.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {manifests.map((manifest) => (
          <button
            className="rounded border border-slate-600 px-3 py-2 text-xs text-slate-100 disabled:opacity-40"
            disabled={manifest.id === 'base' || manifest.id === 'academy'}
            key={manifest.id}
            onClick={() => void removeLocalUniverse(manifest.id)}
            type="button"
          >
            Remove {manifest.id}
          </button>
        ))}
      </div>

      <textarea
        className="min-h-40 rounded bg-slate-950 p-3 text-xs text-slate-300"
        onChange={(event) => setImportText(event.target.value)}
        placeholder="Paste a full ContentBundle JSON object"
        value={importText}
      />
      <div className="flex flex-wrap gap-2">
        <button className="rounded bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950" onClick={importBundle} type="button">
          Import universe
        </button>
        <button className="rounded border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-100" onClick={copyExport} type="button">
          Copy active universe
        </button>
      </div>
      {message && <pre className="whitespace-pre-wrap rounded bg-slate-950 p-3 text-xs text-slate-300">{message}</pre>}
    </section>
  );
};
