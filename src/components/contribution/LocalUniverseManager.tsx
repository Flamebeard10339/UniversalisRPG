import { useMemo, useState } from 'react';
import type { Translator } from '../../game/i18n';
import type { ContentBundle } from '../../game/types';
import { applyModulesToBundle } from '../../game/contentModules';
import { migrateMonolithicBundleToCoreModule } from '../../game/moduleMigration';
import { validateContentBundle } from '../../game/validators';
import { useUniverseState } from '../../stores/universeState';

type LocalUniverseManagerProps = {
  bundle: ContentBundle;
  t: Translator;
};

export const LocalUniverseManager = ({ bundle, t }: LocalUniverseManagerProps) => {
  const [importText, setImportText] = useState('');
  const [message, setMessage] = useState('');
  const manifests = useUniverseState((state) => state.manifests);
  const importLocalUniverse = useUniverseState((state) => state.importLocalUniverse);
  const removeLocalUniverse = useUniverseState((state) => state.removeLocalUniverse);
  const exportedJson = useMemo(() => JSON.stringify(bundle, null, 2), [bundle]);

  const importBundle = async () => {
    try {
      const parsed = JSON.parse(importText) as ContentBundle;
      const migrated = migrateMonolithicBundleToCoreModule(parsed);
      const moduleResolution = applyModulesToBundle(migrated, migrated.modules ?? []);
      const issues = [...moduleResolution.issues, ...validateContentBundle(moduleResolution.bundle)];
      const errors = issues.filter((issue) => issue.severity === 'error');

      if (errors.length > 0) {
        setMessage(errors.map((issue) => `${issue.path}: ${t(issue.message, issue.params)}`).join('\n'));
        return;
      }

      await importLocalUniverse(migrated);
      setImportText('');
      setMessage(t('contribution.localUniverses.imported'));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('error.importUniverseJsonFailed'));
    }
  };

  const copyExport = async () => {
    await navigator.clipboard.writeText(exportedJson);
    setMessage(t('contribution.localUniverses.exportCopied'));
  };

  return (
    <section className="grid gap-3 rounded border border-slate-700 p-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-100">{t('contribution.localUniverses.title')}</h3>
        <p className="text-xs text-slate-400">{t('contribution.localUniverses.description')}</p>
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
            {t('contribution.localUniverses.remove')} {manifest.id}
          </button>
        ))}
      </div>

      <textarea
        className="min-h-40 rounded bg-slate-950 p-3 text-xs text-slate-300"
        onChange={(event) => setImportText(event.target.value)}
        placeholder={t('contribution.localUniverses.importPlaceholder')}
        value={importText}
      />
      <div className="flex flex-wrap gap-2">
        <button className="rounded bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950" onClick={importBundle} type="button">
          {t('contribution.localUniverses.import')}
        </button>
        <button className="rounded border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-100" onClick={copyExport} type="button">
          {t('contribution.localUniverses.copyCurrent')}
        </button>
      </div>
      {message && <pre className="whitespace-pre-wrap rounded bg-slate-950 p-3 text-xs text-slate-300">{message}</pre>}
    </section>
  );
};
