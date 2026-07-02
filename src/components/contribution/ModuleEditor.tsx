import { useMemo, useState } from 'react';
import type { ContentBundle, ContentModule, ContentModulePack, ContributionDraft, LocaleDictionary, ValidationIssue } from '../../game/types';
import type { Translator } from '../../game/i18n';
import { StructuredDataEditor, type StructuredValue } from '../structuredData/StructuredData';
import { contentModuleSchema, modulePackSchema } from '../structuredData/contentSchemas';
import { collectModuleLocalizationKeys } from '../../game/contentModules';
import { moduleFilePath, moduleIndexJson } from '../../game/contributionFiles';

type ModuleEditorProps = {
  bundle: ContentBundle;
  draft: ContributionDraft;
  issues: ValidationIssue[];
  onPatch: (patch: Partial<Omit<ContributionDraft, 'universeId'>>) => void;
  t: Translator;
};

const uniqueById = (modules: ContentModule[]) => [...new Map(modules.map((module) => [module.id, module])).values()];
const uniquePacksById = (packs: ContentModulePack[]) => [...new Map(packs.map((pack) => [pack.id, pack])).values()];
const toModuleId = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9.-]+/g, '-').replace(/^-+|-+$/g, '') || 'new-module';

const upsertModule = (modules: ContentModule[], module: ContentModule, originalId = module.id) => [
  module,
  ...modules.filter((candidate) => candidate.id !== originalId && candidate.id !== module.id),
];

const createModule = (bundle: ContentBundle, existingIds: string[]): ContentModule => {
  let index = 1;
  let id = 'new-module';
  while (existingIds.includes(id)) {
    index += 1;
    id = `new-module-${index}`;
  }
  return {
    id,
    version: '1.0.0',
    universe: bundle.manifest.id,
    author: bundle.manifest.author,
    game_version: '1.0',
    dependencies: [],
    data: {},
    locale: {},
  };
};

const packModuleIds = (pack: ContentModulePack): string[] => [
  ...(pack.modules ?? []),
  ...(pack.packs ?? []).flatMap(packModuleIds),
];

const moduleIdFromIssue = (issue: Pick<ValidationIssue, 'path'>) => issue.path.match(/^modules\.([^.]+)/)?.[1] ?? null;
const packIdFromIssue = (issue: Pick<ValidationIssue, 'path'>) => issue.path.match(/^modulePacks\.([^.]+)/)?.[1] ?? null;

const uniqueLocales = (bundle: ContentBundle, module: ContentModule) =>
  Array.from(new Set([...bundle.manifest.locales, ...Object.keys(bundle.locales), ...Object.keys(module.locale ?? {})]));

const moduleBaseLocales = (bundle: ContentBundle, module: ContentModule, lang1: string, lang2: string) =>
  Object.fromEntries(
    Array.from(new Set([...Object.keys(bundle.locales), ...Object.keys(module.locale ?? {}), lang1, lang2].filter(Boolean))).map((locale) => [
      locale,
      {
        ...(bundle.locales[locale] ?? {}),
        ...(module.locale?.[locale] ?? {}),
      },
    ]),
  ) as Record<string, LocaleDictionary>;

const ModuleLocalizationEditor = ({
  bundle,
  module,
  onSave,
  t,
}: {
  bundle: ContentBundle;
  module: ContentModule;
  onSave: (module: ContentModule) => void;
  t: Translator;
}) => {
  const locales = uniqueLocales(bundle, module);
  const [lang1, setLang1] = useState(locales.includes('en') ? 'en' : locales[0] ?? 'en');
  const [lang2, setLang2] = useState(locales.find((locale) => locale !== lang1) ?? '');
  const [missingOnly, setMissingOnly] = useState(true);
  const [search, setSearch] = useState('');
  const keys = useMemo(() => collectModuleLocalizationKeys(module), [module]);
  const mergedLocales = useMemo(() => moduleBaseLocales(bundle, module, lang1, lang2), [bundle, module, lang1, lang2]);
  const visibleKeys = keys.filter((key) => {
    const matchesSearch = search.trim().length === 0 || key.toLowerCase().includes(search.trim().toLowerCase());
    const missing = !mergedLocales[lang1]?.[key] || (lang2 ? !mergedLocales[lang2]?.[key] : false);
    return matchesSearch && (!missingOnly || missing);
  });

  const updateLocales = (localesPatch: Record<string, LocaleDictionary>) => {
    onSave({
      ...module,
      locale: {
        ...(module.locale ?? {}),
        ...localesPatch,
      },
    });
  };

  const updateValue = (locale: string, key: string, value: string) => {
    updateLocales({
      [locale]: {
        ...(module.locale?.[locale] ?? {}),
        [key]: value,
      },
    });
  };

  const populateMissing = () => {
    updateLocales({
      [lang1]: {
        ...(module.locale?.[lang1] ?? {}),
        ...Object.fromEntries(keys.filter((key) => !mergedLocales[lang1]?.[key]).map((key) => [key, key])),
      },
    });
  };

  return (
    <section className="grid gap-3 rounded border border-slate-700 p-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="mr-auto">
          <h5 className="text-sm font-semibold text-slate-100">{t('contribution.localization.title')}</h5>
          <p className="text-xs text-slate-400">{t('contribution.modules.localizationDescription')}</p>
        </div>
        <button className="rounded border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-100" onClick={populateMissing} type="button">
          {t('contribution.modules.populateLocale')}
        </button>
      </div>

      <div className="grid gap-2 md:grid-cols-[1fr_auto_auto_auto]">
        <input className="rounded bg-slate-950 px-3 py-2 text-sm" onChange={(event) => setSearch(event.target.value)} placeholder={t('contribution.localization.search')} value={search} />
        <select className="rounded bg-slate-950 px-3 py-2 text-sm" onChange={(event) => setLang1(event.target.value)} value={lang1}>
          {Array.from(new Set(['en', ...locales, lang1])).map((locale) => <option key={locale} value={locale}>{locale}</option>)}
        </select>
        <input className="rounded bg-slate-950 px-3 py-2 text-sm" list={`module-locales-${module.id}`} onChange={(event) => setLang2(event.target.value)} placeholder={t('contribution.localization.lang2')} value={lang2} />
        <label className="flex items-center gap-2 rounded bg-slate-950 px-3 py-2 text-sm">
          <input checked={missingOnly} onChange={(event) => setMissingOnly(event.target.checked)} type="checkbox" />
          {t('contribution.localization.missingOnly')}
        </label>
      </div>

      <datalist id={`module-locales-${module.id}`}>
        {locales.map((locale) => <option key={locale} value={locale} />)}
      </datalist>

      <div className="overflow-auto rounded border border-slate-800">
        <table className="min-w-full border-collapse text-sm">
          <thead className="bg-slate-950 text-left text-xs uppercase text-slate-400">
            <tr>
              <th className="w-64 border-b border-slate-800 px-3 py-2">{t('contribution.localization.id')}</th>
              <th className="border-b border-slate-800 px-3 py-2">{lang1}</th>
              {lang2 && <th className="border-b border-slate-800 px-3 py-2">{lang2}</th>}
            </tr>
          </thead>
          <tbody>
            {visibleKeys.map((key) => (
              <tr className="border-b border-slate-800 last:border-0" key={key}>
                <td className="align-top px-3 py-2 font-mono text-xs text-slate-400">{key}</td>
                <td className="px-3 py-2">
                  <textarea className="min-h-16 w-full rounded bg-slate-950 p-2 text-sm text-slate-100" onChange={(event) => updateValue(lang1, key, event.target.value)} value={mergedLocales[lang1]?.[key] ?? ''} />
                </td>
                {lang2 && (
                  <td className="px-3 py-2">
                    <textarea className="min-h-16 w-full rounded bg-slate-950 p-2 text-sm text-slate-100" onChange={(event) => updateValue(lang2, key, event.target.value)} value={mergedLocales[lang2]?.[key] ?? ''} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

const ModulePackTree = ({
  packs,
  selectedModuleId,
  issueModuleIds,
  issuePackIds,
  moduleIds,
  onSelect,
  t,
}: {
  packs: ContentModulePack[];
  selectedModuleId: string | null;
  issueModuleIds: Set<string>;
  issuePackIds: Set<string>;
  moduleIds: Set<string>;
  onSelect: (id: string) => void;
  t: Translator;
}) => (
  <ul className="grid gap-1">
    {packs.map((pack) => (
      <li className="rounded bg-slate-950 p-2" key={pack.id}>
        <span className={`block text-xs font-semibold uppercase ${issuePackIds.has(pack.id) ? 'text-rose-300' : 'text-slate-500'}`}>{pack.titleKey ? t(pack.titleKey, pack.id) : pack.id}</span>
        {(pack.modules ?? []).map((moduleId) => (
          <button
            className={`mt-1 block w-full rounded px-2 py-1 text-left text-sm ${selectedModuleId === moduleId ? 'bg-cyan-300 text-slate-950' : issueModuleIds.has(moduleId) || !moduleIds.has(moduleId) ? 'bg-rose-950/30 text-rose-100' : 'text-slate-300'}`}
            key={moduleId}
            onClick={() => onSelect(moduleId)}
            type="button"
          >
            {moduleId}
          </button>
        ))}
        {pack.packs && pack.packs.length > 0 && (
          <div className="mt-2 border-l border-slate-700 pl-2">
            <ModulePackTree packs={pack.packs} selectedModuleId={selectedModuleId} issueModuleIds={issueModuleIds} issuePackIds={issuePackIds} moduleIds={moduleIds} onSelect={onSelect} t={t} />
          </div>
        )}
      </li>
    ))}
  </ul>
);

export const ModuleEditor = ({ bundle, draft, issues, onPatch, t }: ModuleEditorProps) => {
  const [filter, setFilter] = useState('');
  const [sortMode, setSortMode] = useState<'id' | 'author'>('id');
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const [editorTab, setEditorTab] = useState<'data' | 'locale' | 'json'>('data');
  const [packEditorOpen, setPackEditorOpen] = useState(false);
  const removedModules = new Set(draft.removed?.modules ?? []);
  const issueModuleIds = new Set(
    issues
      .map(moduleIdFromIssue)
      .filter((id): id is string => Boolean(id)),
  );
  const issuePackIds = new Set(
    issues
      .map(packIdFromIssue)
      .filter((id): id is string => Boolean(id)),
  );
  const modules = useMemo(() => {
    const baseModules = (bundle.modules ?? []).filter((module) => !removedModules.has(module.id));
    const merged = uniqueById([...(draft.modules ?? []), ...baseModules]);
    return merged
      .filter((module) => !filter.trim() || JSON.stringify(module).toLowerCase().includes(filter.trim().toLowerCase()))
      .sort((a, b) => String(a[sortMode]).localeCompare(String(b[sortMode])) || a.id.localeCompare(b.id));
  }, [bundle.modules, draft.modules, filter, removedModules, sortMode]);
  const selectedModule = modules.find((module) => module.id === selectedModuleId) ?? modules[0] ?? null;
  const selectedModuleIssues = selectedModule
    ? issues.filter((issue) => moduleIdFromIssue(issue) === selectedModule.id)
    : [];

  const saveModule = (module: ContentModule, originalId = module.id) => {
    const normalized = { ...module, id: toModuleId(module.id), universe: bundle.manifest.id };
    onPatch({
      modules: upsertModule(draft.modules ?? [], normalized, originalId),
      removed: {
        ...draft.removed,
        modules: (draft.removed?.modules ?? []).filter((id) => id !== normalized.id),
      },
    });
    setSelectedModuleId(normalized.id);
  };

  const removeModule = (module: ContentModule) => {
    onPatch({
      modules: (draft.modules ?? []).filter((candidate) => candidate.id !== module.id),
      removed: {
        ...draft.removed,
        modules: Array.from(new Set([...(draft.removed?.modules ?? []), module.id])),
      },
    });
    setSelectedModuleId(null);
  };

  const updateModuleIndex = (value: StructuredValue | undefined) => {
    const filenames = new Set((Array.isArray(value) ? value : []).filter((item): item is string => typeof item === 'string'));
    const ids = new Set([...filenames].map((filename) => filename.replace(/\.json$/i, '')));
    onPatch({
      modules: (draft.modules ?? []).filter((module) => ids.has(module.id)),
      removed: {
        ...draft.removed,
        modules: Array.from(new Set([
          ...(draft.removed?.modules ?? []),
          ...(bundle.modules ?? []).filter((module) => !ids.has(module.id)).map((module) => module.id),
        ])),
      },
    });
  };

  const addModule = () => saveModule(createModule(bundle, modules.map((module) => module.id)));
  const modulePacks = uniquePacksById([...(draft.modulePacks ?? []), ...(bundle.modulePacks ?? [])]);
  const moduleIds = new Set(modules.map((module) => module.id));
  const packIssues = issues.filter((issue) => packIdFromIssue(issue));
  const packedModuleIds = new Set(modulePacks.flatMap(packModuleIds));
  const unpackedModules = modules.filter((module) => !packedModuleIds.has(module.id));
  const indexJson = moduleIndexJson(bundle, draft);

  return (
    <section className="grid gap-3 rounded border border-slate-700 p-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="mr-auto">
          <h3 className="text-sm font-semibold text-slate-100">{t('contribution.modules.title')}</h3>
          {/* <p className="text-xs text-slate-500">{t('contribution.modules.description')}</p> */}
        </div>
        <input className="rounded bg-slate-950 px-3 py-2 text-sm text-slate-100" onChange={(event) => setFilter(event.target.value)} placeholder={t('contribution.modules.filter')} value={filter} />
        <select className="rounded bg-slate-950 px-3 py-2 text-sm text-slate-100" onChange={(event) => setSortMode(event.target.value as typeof sortMode)} value={sortMode}>
          <option value="id">{t('contribution.modules.sortId')}</option>
          <option value="author">{t('contribution.modules.sortAuthor')}</option>
        </select>
        <button className="rounded bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950" onClick={addModule} type="button">{t('contribution.modules.add')}</button>
      </div>

      <details className="rounded border border-slate-800 bg-slate-950 p-3" onToggle={(event) => setPackEditorOpen(event.currentTarget.open)} open={packEditorOpen}>
        <summary className="cursor-pointer text-sm font-semibold text-slate-100">{t('contribution.modules.packsEditor')}</summary>
        <div className="mt-3 grid gap-3">
          <p className="text-xs text-slate-400">{t('contribution.modules.packsDescription')}</p>
          {packIssues.length > 0 && (
            <ul className="grid gap-1 rounded border border-rose-900 bg-rose-950/20 p-3 text-sm">
              {packIssues.map((issue) => (
                <li className={issue.severity === 'error' ? 'text-rose-200' : 'text-amber-200'} key={`${issue.path}-${issue.message}`}>
                  <span className="font-semibold">{issue.severity}</span>: {issue.path} - {t(issue.message, issue.params)}
                </li>
              ))}
            </ul>
          )}
          <StructuredDataEditor
            onChange={(value) => onPatch({ modulePacks: (Array.isArray(value) ? value : []) as unknown as ContentModulePack[] })}
            schema={{ kind: 'array', listMode: 'free', item: modulePackSchema({ ...bundle, modules }), createItem: () => ({ id: 'new-pack', modules: modules[0] ? [modules[0].id] : [] }) }}
            t={t}
            value={modulePacks as unknown as StructuredValue}
          />
          <div className="flex flex-wrap gap-2">
            <button
              className="rounded border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-100"
              onClick={() => void navigator.clipboard.writeText(JSON.stringify(modulePacks, null, 2))}
              type="button"
            >
              {t('contribution.data.copyJson')}
            </button>
          </div>
        </div>
      </details>

      <details className="rounded border border-slate-800 bg-slate-950 p-3">
        <summary className="cursor-pointer text-sm font-semibold text-slate-100">{t('contribution.modules.indexJson')}</summary>
        <div className="mt-3 grid gap-2">
          <button
            className="justify-self-start rounded border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-100"
            onClick={() => void navigator.clipboard.writeText(JSON.stringify(indexJson, null, 2))}
            type="button"
          >
            {t('contribution.data.copyJson')}
          </button>
          <StructuredDataEditor
            onChange={updateModuleIndex}
            schema={{ kind: 'array', listMode: 'tags', item: { kind: 'string' }, createItem: () => modules[0] ? `${modules[0].id}.json` : 'new-module.json' }}
            t={t}
            value={indexJson as unknown as StructuredValue}
          />
        </div>
      </details>

      <div className="grid gap-3 lg:grid-cols-[18rem_1fr]">
        <aside className="grid content-start gap-2">
          {modulePacks.length > 0 && (
            <ModulePackTree packs={modulePacks} selectedModuleId={selectedModule?.id ?? null} issueModuleIds={issueModuleIds} issuePackIds={issuePackIds} moduleIds={moduleIds} onSelect={setSelectedModuleId} t={t} />
          )}
          {unpackedModules.map((module) => (
            <button
              className={`rounded px-3 py-2 text-left text-sm ${selectedModule?.id === module.id ? 'bg-cyan-300 text-slate-950' : issueModuleIds.has(module.id) ? 'bg-rose-950/30 text-rose-100' : 'bg-slate-950 text-slate-300'}`}
              key={module.id}
              onClick={() => setSelectedModuleId(module.id)}
              type="button"
            >
              <span className="block font-semibold">{module.id}</span>
              <span className="block text-xs opacity-80">{module.version} / {module.author}</span>
            </button>
          ))}
        </aside>

        {selectedModule ? (
          <section className="grid min-w-0 gap-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-slate-100">{selectedModule.id}</h4>
              <button className="rounded border border-rose-500 px-3 py-1.5 text-sm font-semibold text-rose-200" onClick={() => removeModule(selectedModule)} type="button">
                {t('contribution.modules.remove')}
              </button>
            </div>
            {selectedModuleIssues.length > 0 && (
              <ul className="grid gap-1 rounded border border-rose-900 bg-rose-950/20 p-3 text-sm">
                {selectedModuleIssues.map((issue) => (
                  <li className={issue.severity === 'error' ? 'text-rose-200' : 'text-amber-200'} key={`${issue.path}-${issue.message}`}>
                    <span className="font-semibold">{issue.severity}</span>: {issue.path} - {t(issue.message, issue.params)}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-2 border-b border-slate-700">
              {(['data', 'locale', 'json'] as const).map((tab) => (
                <button
                  className={`px-3 py-2 text-sm font-semibold ${editorTab === tab ? 'border-b-2 border-cyan-300 text-cyan-100' : 'text-slate-400'}`}
                  key={tab}
                  onClick={() => setEditorTab(tab)}
                  type="button"
                >
                  {t(tab === 'data' ? 'contribution.modules.dataTab' : tab === 'locale' ? 'contribution.modules.localeTab' : 'contribution.tab.json')}
                </button>
              ))}
            </div>
            {editorTab === 'data' ? (
              <StructuredDataEditor
                onChange={(value) => {
                  if (value && typeof value === 'object' && !Array.isArray(value)) saveModule(value as unknown as ContentModule, selectedModule.id);
                }}
                schema={contentModuleSchema(bundle)}
                t={t}
                value={selectedModule as unknown as StructuredValue}
              />
            ) : editorTab === 'locale' ? (
              <ModuleLocalizationEditor bundle={bundle} module={selectedModule} onSave={(module) => saveModule(module, selectedModule.id)} t={t} />
            ) : (
              <section className="grid gap-2 rounded border border-slate-700 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h5 className="text-sm font-semibold text-slate-100">{moduleFilePath(selectedModule)}</h5>
                  <button
                    className="rounded border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-100"
                    onClick={() => void navigator.clipboard.writeText(JSON.stringify(selectedModule, null, 2))}
                    type="button"
                  >
                    {t('contribution.data.copyJson')}
                  </button>
                </div>
                <StructuredDataEditor
                  onChange={(value) => {
                    if (value && typeof value === 'object' && !Array.isArray(value)) saveModule(value as unknown as ContentModule, selectedModule.id);
                  }}
                  schema={contentModuleSchema(bundle)}
                  t={t}
                  value={selectedModule as unknown as StructuredValue}
                />
              </section>
            )}
          </section>
        ) : (
          <p className="rounded bg-slate-950 p-3 text-sm text-slate-500">{t('contribution.modules.empty')}</p>
        )}
      </div>
    </section>
  );
};
