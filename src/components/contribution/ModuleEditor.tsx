import { useEffect, useMemo, useState } from 'react';
import type { ContentBundle, ContentModule, ContentModulePack, ContributionDraft, LocaleDictionary, ModuleDataRemoveEntry, ModuleDataSectionObject, ValidationIssue } from '../../game/types';
import type { Translator } from '../../game/i18n';
import { StructuredDataEditor, type StructuredSchema, type StructuredValue } from '../structuredData/StructuredData';
import { moduleDataSectionSchema, modulePackSchema } from '../structuredData/contentSchemas';
import { bundleWithModuleData, collectModuleLocalizationKeys } from '../../game/contentModules';
import { moduleFilePath } from '../../game/contributionFiles';
import { createPrefilledIssueUrl, formatContributionIssueBody } from '../../lib/githubIssues';
import { toKebabInput } from '../../game/contentIds';
import { defaultModuleLocalePatch, mergeLocalePatch, workingLocale } from './contributionLocalization';

type ModuleEditorProps = {
  bundle: ContentBundle;
  draft: ContributionDraft;
  issues: ValidationIssue[];
  onMoveModule: (module: ContentModule, originalId: string, targetUniverseId: string) => void;
  onPatch: (patch: Partial<Omit<ContributionDraft, 'universeId'>>) => void;
  t: Translator;
  universeIds: string[];
};

type EditorTab = 'details' | 'data' | 'data-updates' | 'locale' | 'raw' | 'submit';
type DataKey = keyof ModuleDataSectionObject;
type RemoveTarget = Exclude<keyof NonNullable<Extract<ContentModule['data-updates'], Record<string, unknown>>['remove']>, symbol | number>;

const dataKeys: DataKey[] = [
  'locations',
  'entities',
  'actions',
  'skills',
  'stats',
  'items',
  'flags',
  'resources',
  'effects',
  'interactionTypes',
  'enemies',
  'dropTables',
  'collectionLogs',
  'dialogues',
  'quests',
  'recipes',
  'statModifiers',
  'displayProfiles',
];

const dataKeyTypes: Record<DataKey, string> = {
  locations: 'location',
  entities: 'entity',
  actions: 'action',
  skills: 'skill',
  stats: 'stat',
  items: 'item',
  flags: 'flag',
  resources: 'resource',
  resourceDefinitions: 'resourceDefinition',
  effects: 'effect',
  interactionTypes: 'interactionType',
  enemies: 'enemy',
  dropTables: 'dropTable',
  collectionLogs: 'collectionLog',
  dialogues: 'dialogue',
  quests: 'quest',
  recipes: 'recipe',
  statModifiers: 'statModifier',
  displayProfiles: 'displayProfile',
};

const dataTypeKeys = new Map<string, DataKey>([
  ...Object.entries(dataKeyTypes).map(([key, type]) => [type, key as DataKey] as const),
  ...dataKeys.map((key) => [key, key] as const),
]);

const removeTargets: RemoveTarget[] = [
  'locations',
  'entities',
  'actions',
  'skills',
  'stats',
  'items',
  'flags',
  'resources',
  'effects',
  'interactionTypes',
  'enemies',
  'dropTables',
  'dialogues',
  'dialogueOptions',
  'quests',
  'recipes',
  'statModifiers',
  'displayProfiles',
  'locales',
];

const tableDataKeys = new Set<DataKey>(['skills', 'stats', 'items', 'flags', 'interactionTypes']);

const uniqueById = <T extends { id: string }>(items: T[]) => [...new Map(items.map((item) => [item.id, item])).values()];
const uniquePacksById = (packs: ContentModulePack[]) => uniqueById(packs);
const toModuleId = (value: string) => value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9.-]+/g, '-').replace(/^-+/, '') || 'new-module';
const dependencyListString = (module: ContentModule) => (module.dependencies ?? []).join(', ');
const dependenciesFromListString = (value: string) => value.split(',').map((item) => item.trim()).filter(Boolean);
const serializeModule = (module: ContentModule) => btoa(unescape(encodeURIComponent(JSON.stringify(module))));
const deserializeModule = (value: string) => {
  const trimmed = value.trim();
  const parsed = JSON.parse(trimmed.startsWith('{') ? trimmed : decodeURIComponent(escape(atob(trimmed))));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid module');
  return parsed as ContentModule;
};

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

const mergeById = <T extends { id: string }>(base: T[], ...groups: Array<T[] | undefined>): T[] =>
  [...new Map([...base, ...groups.flatMap((group) => group ?? [])].map((item) => [item.id, item])).values()];

const moduleDataObject = (section: ContentModule['data'] | ContentModule['data-updates']): ModuleDataSectionObject =>
  section && !Array.isArray(section)
    ? section
    : Object.fromEntries(dataKeys.map((key) => [
        key,
        (Array.isArray(section) ? section : [])
          .filter((entry) => dataTypeKeys.get(entry.type) === key)
          .map(({ type: _type, ...entry }) => entry),
      ]).filter(([, value]) => Array.isArray(value) && value.length > 0)) as ModuleDataSectionObject;

const sectionToTypedRows = (section: ModuleDataSectionObject) =>
  dataKeys.flatMap((key) =>
    ((section[key] as StructuredValue[] | undefined) ?? [])
      .filter((value): value is Exclude<StructuredValue, null | boolean | number | string | StructuredValue[]> => Boolean(value) && typeof value === 'object' && !Array.isArray(value))
      .map((value) => ({ type: dataKeyTypes[key], ...value })),
  );

const isRemoveEntry = (entry: unknown): entry is ModuleDataRemoveEntry =>
  Boolean(entry) &&
  typeof entry === 'object' &&
  !Array.isArray(entry) &&
  (entry as { type?: unknown }).type === 'remove' &&
  typeof (entry as { target?: unknown }).target === 'string' &&
  typeof (entry as { id?: unknown }).id === 'string';

const removalRowsFromUpdates = (updates: ContentModule['data-updates']): ModuleDataRemoveEntry[] => {
  if (!updates) return [];
  if (Array.isArray(updates)) return updates.filter(isRemoveEntry);
  return Object.entries(updates.remove ?? {}).flatMap(([target, value]) => {
    if (target === 'dialogueOptions' && value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.entries(value as Record<string, string[]>).flatMap(([path, ids]) =>
        (Array.isArray(ids) ? ids : []).filter((id): id is string => typeof id === 'string').map((id) => ({ type: 'remove', target, path, id })),
      );
    }
    return (Array.isArray(value) ? value : []).filter((id): id is string => typeof id === 'string').map((id) => ({ type: 'remove', target, id }));
  });
};

const bundleForModuleEditing = (bundle: ContentBundle, module: ContentModule, modules: ContentModule[]): ContentBundle => {
  const data = moduleDataObject(module.data);
  const updates = moduleDataObject(module['data-updates']);
  const resourceDefinitions = [
    ...(data.resources ?? []),
    ...(data.resourceDefinitions ?? []),
    ...(updates.resources ?? []),
    ...(updates.resourceDefinitions ?? []),
  ];
  return {
    ...bundle,
    manifest: {
      ...bundle.manifest,
      displayProfiles: mergeById(bundle.manifest.displayProfiles ?? [], data.displayProfiles, updates.displayProfiles),
    },
    locations: mergeById(bundle.locations, data.locations, updates.locations),
    actions: mergeById(bundle.actions, data.actions, updates.actions),
    skills: mergeById(bundle.skills, data.skills, updates.skills),
    stats: mergeById(bundle.stats, data.stats, updates.stats),
    items: mergeById(bundle.items, data.items, updates.items),
    flags: mergeById(bundle.flags, data.flags, updates.flags),
    resourceDefinitions: mergeById(bundle.resourceDefinitions, resourceDefinitions),
    effects: mergeById(bundle.effects, data.effects, updates.effects),
    interactionTypes: mergeById(bundle.interactionTypes, data.interactionTypes, updates.interactionTypes),
    enemies: mergeById(bundle.enemies, data.enemies, updates.enemies),
    dropTables: mergeById(bundle.dropTables ?? [], data.dropTables, updates.dropTables),
    dialogues: mergeById(bundle.dialogues ?? [], data.dialogues, updates.dialogues),
    quests: mergeById(bundle.quests ?? [], data.quests, updates.quests),
    modules: uniqueById([module, ...modules]),
  };
};

const sectionFields = (bundle: ContentBundle) =>
  (moduleDataSectionSchema(bundle) as Extract<StructuredSchema, { kind: 'object' }>).fields;

const fieldSchema = (bundle: ContentBundle, key: DataKey): Extract<StructuredSchema, { kind: 'array' }> => {
  const schema = sectionFields(bundle)[key]?.schema;
  const resolved = typeof schema === 'function' ? schema() : schema;
  return resolved?.kind === 'array' ? resolved : { kind: 'array', item: { kind: 'inferred' }, createItem: () => ({ id: '' }) };
};

const createDataItem = (bundle: ContentBundle, key: DataKey) => fieldSchema(bundle, key).createItem();

const itemSchema = (bundle: ContentBundle, key: DataKey) => fieldSchema(bundle, key).item;

const updateArray = (section: ModuleDataSectionObject | undefined, key: DataKey, values: StructuredValue[]): ModuleDataSectionObject => ({
  ...(section ?? {}),
  [key]: values,
});

const moduleDetailProblems = (module: ContentModule) => [
  ...(!/^(?:[0-9]|[1-9][0-9]{1,4})\.(?:[0-9]|[1-9][0-9]{1,4})\.(?:[0-9]|[1-9][0-9]{1,4})$/.test(module.version) ? ['version'] : []),
  ...(!/^(?:[0-9]|[1-9][0-9]{1,4})\.(?:[0-9]|[1-9][0-9]{1,4})$/.test(String(module.game_version)) ? ['game_version'] : []),
  ...(!module.id || toModuleId(module.id) !== module.id ? ['id'] : []),
];

const ModuleLocalizationEditor = ({
  bundle,
  module,
  onSave,
  readOnly,
  t,
}: {
  bundle: ContentBundle;
  module: ContentModule;
  onSave: (module: ContentModule) => void;
  readOnly: boolean;
  t: Translator;
}) => {
  const locales = uniqueLocales(bundle, module);
  const [lang1, setLang1] = useState(locales.includes('en') ? 'en' : locales[0] ?? 'en');
  const [lang2, setLang2] = useState(locales.find((locale) => locale !== lang1) ?? '');
  const [missingOnly, setMissingOnly] = useState(true);
  const [search, setSearch] = useState('');
  const [focusedLocaleKey, setFocusedLocaleKey] = useState<string | null>(null);
  const keys = useMemo(() => collectModuleLocalizationKeys(module, bundle), [bundle, module]);
  const mergedLocales = useMemo(() => moduleBaseLocales(bundle, module, lang1, lang2), [bundle, module, lang1, lang2]);
  const visibleKeys = keys.filter((key) => {
    const matchesSearch = search.trim().length === 0 || key.toLowerCase().includes(search.trim().toLowerCase());
    const missing = !mergedLocales[lang1]?.[key] || (lang2 ? !mergedLocales[lang2]?.[key] : false);
    return matchesSearch && (!missingOnly || missing || focusedLocaleKey === key);
  });

  const updateValue = (locale: string, key: string, value: string) => {
    if (readOnly) return;
    onSave({
      ...module,
      locale: {
        ...(module.locale ?? {}),
        [locale]: {
          ...(module.locale?.[locale] ?? {}),
          [key]: value,
        },
      },
    });
  };

  const populateMissing = () => {
    if (readOnly) return;
    onSave({
      ...module,
      locale: {
        ...(module.locale ?? {}),
        [lang1]: {
          ...(module.locale?.[lang1] ?? {}),
          ...Object.fromEntries(keys.filter((key) => !mergedLocales[lang1]?.[key]).map((key) => [key, key])),
        },
      },
    });
  };

  return (
    <section className="grid gap-3 rounded border border-slate-700 p-3">
      <div className="flex flex-wrap items-end gap-2">
        <h5 className="mr-auto text-sm font-semibold text-slate-100">{t('contribution.localization.title')}</h5>
        {!readOnly && <button className="rounded border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-100" onClick={populateMissing} type="button">{t('contribution.modules.populateLocale')}</button>}
      </div>
      <div className="grid gap-2 md:grid-cols-[1fr_auto_auto_auto]">
        <input className="rounded bg-slate-950 px-3 py-2 text-sm" onChange={(event) => setSearch(event.target.value)} placeholder={t('contribution.localization.search')} value={search} />
        <select className="rounded bg-slate-950 px-3 py-2 text-sm" onChange={(event) => setLang1(event.target.value)} value={lang1}>{Array.from(new Set(['en', ...locales, lang1])).map((locale) => <option key={locale} value={locale}>{locale}</option>)}</select>
        <input className="rounded bg-slate-950 px-3 py-2 text-sm" list={`module-locales-${module.id}`} onChange={(event) => setLang2(event.target.value)} placeholder={t('contribution.localization.lang2')} value={lang2} />
        <label className="flex items-center gap-2 rounded bg-slate-950 px-3 py-2 text-sm"><input checked={missingOnly} onChange={(event) => setMissingOnly(event.target.checked)} type="checkbox" />{t('contribution.localization.missingOnly')}</label>
      </div>
      <datalist id={`module-locales-${module.id}`}>{locales.map((locale) => <option key={locale} value={locale} />)}</datalist>
      <div className="overflow-auto rounded border border-slate-800">
        <table className="min-w-full border-collapse text-sm">
          <thead className="bg-slate-950 text-left text-xs uppercase text-slate-400"><tr><th className="w-64 border-b border-slate-800 px-3 py-2">{t('contribution.localization.id')}</th><th className="border-b border-slate-800 px-3 py-2">{lang1}</th>{lang2 && <th className="border-b border-slate-800 px-3 py-2">{lang2}</th>}</tr></thead>
          <tbody>
            {visibleKeys.map((key) => (
              <tr className="border-b border-slate-800 last:border-0" key={key}>
                <td className="align-top px-3 py-2 font-mono text-xs text-slate-400">{key}</td>
                <td className="px-3 py-2"><textarea className="min-h-16 w-full rounded bg-slate-950 p-2 text-sm text-slate-100" onBlur={() => setFocusedLocaleKey(null)} onChange={(event) => updateValue(lang1, key, event.target.value)} onFocus={() => setFocusedLocaleKey(key)} readOnly={readOnly} value={mergedLocales[lang1]?.[key] ?? ''} /></td>
                {lang2 && <td className="px-3 py-2"><textarea className="min-h-16 w-full rounded bg-slate-950 p-2 text-sm text-slate-100" onBlur={() => setFocusedLocaleKey(null)} onChange={(event) => updateValue(lang2, key, event.target.value)} onFocus={() => setFocusedLocaleKey(key)} readOnly={readOnly} value={mergedLocales[lang2]?.[key] ?? ''} /></td>}
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
          <button className={`mt-1 block w-full rounded px-2 py-1 text-left text-sm ${selectedModuleId === moduleId ? 'bg-cyan-300 text-slate-950' : issueModuleIds.has(moduleId) || !moduleIds.has(moduleId) ? 'bg-rose-950/30 text-rose-100' : 'text-slate-300'}`} key={moduleId} onClick={() => onSelect(moduleId)} type="button">{moduleId}</button>
        ))}
        {pack.packs && pack.packs.length > 0 && <div className="mt-2 border-l border-slate-700 pl-2"><ModulePackTree packs={pack.packs} selectedModuleId={selectedModuleId} issueModuleIds={issueModuleIds} issuePackIds={issuePackIds} moduleIds={moduleIds} onSelect={onSelect} t={t} /></div>}
      </li>
    ))}
  </ul>
);

const DataRows = ({
  bundle,
  module,
  readOnly,
  sectionName,
  onSave,
  t,
}: {
  bundle: ContentBundle;
  module: ContentModule;
  readOnly: boolean;
  sectionName: 'data' | 'data-updates';
  onSave: (module: ContentModule) => void;
  t: Translator;
}) => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [groupFilters, setGroupFilters] = useState<Record<string, string>>({});
  const [pendingRows, setPendingRows] = useState(0);
  const [pendingRemovals, setPendingRemovals] = useState(0);
  const rawSection = sectionName === 'data' ? module.data : module['data-updates'];
  const section = moduleDataObject(rawSection);
  const removalRows = sectionName === 'data-updates' ? removalRowsFromUpdates(module['data-updates']) : [];
  const editorBundle = bundleForModuleEditing(bundle, module, bundle.modules ?? []);
  const saveModuleSection = (nextSection: ModuleDataSectionObject, nextRemovals = removalRows, nextLocale?: LocaleDictionary) => onSave({
    ...module,
    ...(nextLocale ? { locale: mergeLocalePatch(module.locale ?? {}, workingLocale(bundle), nextLocale) } : {}),
    [sectionName]: sectionName === 'data-updates'
      ? [...sectionToTypedRows(nextSection), ...nextRemovals]
      : sectionToTypedRows(nextSection),
  });
  const rows = dataKeys.flatMap((key) => {
    const values = section[key];
    return Array.isArray(values) ? values.map((value, index) => ({ key, index, value: value as StructuredValue })) : [];
  });

  const saveRow = (key: DataKey, index: number, value: StructuredValue | undefined) => {
    const values = [...((section[key] as StructuredValue[] | undefined) ?? [])];
    if (value === undefined) values.splice(index, 1);
    else values[index] = value;
    saveModuleSection(updateArray(section, key, values));
  };
  const moveRow = (fromKey: DataKey, index: number, toKey: DataKey) => {
    if (fromKey === toKey) return;
    const fromValues = [...((section[fromKey] as StructuredValue[] | undefined) ?? [])];
    const [value] = fromValues.splice(index, 1);
    const nextValue = value ?? createDataItem(editorBundle, toKey);
    const localePatch = value === undefined && nextValue && typeof nextValue === 'object' && !Array.isArray(nextValue) && typeof nextValue.id === 'string'
      ? defaultModuleLocalePatch(toKey, nextValue.id)
      : {};
    const toValues = [...((section[toKey] as StructuredValue[] | undefined) ?? []), nextValue];
    saveModuleSection({ ...section, [fromKey]: fromValues, [toKey]: toValues }, removalRows, localePatch);
  };
  const saveRemoval = (index: number, patch: Partial<ModuleDataRemoveEntry> | undefined) => {
    const nextRemovals = [...removalRows];
    if (patch === undefined) nextRemovals.splice(index, 1);
    else nextRemovals[index] = { ...nextRemovals[index], ...patch };
    saveModuleSection(section, nextRemovals);
  };
  const addRemoval = (target: RemoveTarget) => {
    saveModuleSection(section, [...removalRows, { type: 'remove', target, id: '', ...(target === 'dialogueOptions' ? { path: '' } : {}) }]);
    setPendingRemovals((count) => Math.max(0, count - 1));
  };
  const targetLabel = (target: string) => target === 'dialogueOptions'
    ? t('contribution.module.removeDialogueOptions')
    : target === 'locales'
      ? t('contribution.module.removeLocales')
      : t(`contribution.data.${target}`, target);
  const toggleGroup = (key: string) => setCollapsedGroups((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });
  const addDataRow = (key: DataKey) => {
    const nextValue = createDataItem(editorBundle, key);
    const localePatch = nextValue && typeof nextValue === 'object' && !Array.isArray(nextValue) && typeof nextValue.id === 'string'
      ? defaultModuleLocalePatch(key, nextValue.id)
      : {};
    saveModuleSection(updateArray(section, key, [...((section[key] as StructuredValue[] | undefined) ?? []), nextValue]), removalRows, localePatch);
  };
  const addRowToGroup = (key: DataKey) => {
    addDataRow(key);
  };
  const filteredRowsForKey = (key: DataKey) => {
    const filter = (groupFilters[key] ?? '').trim().toLowerCase();
    const values = section[key];
    if (!Array.isArray(values)) return [];
    return values
      .map((value, index) => ({ key, index, value: value as StructuredValue }))
      .filter((row) => {
        if (!filter) return true;
        const record = row.value && typeof row.value === 'object' && !Array.isArray(row.value) ? row.value : {};
        return String(record.id ?? '').toLowerCase().includes(filter);
      });
  };

  return (
    <section className="grid gap-2 rounded border border-slate-700 p-3">
      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          <button className="rounded bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950" onClick={() => setPendingRows((count) => count + 1)} type="button">{t('contribution.modules.addRow')}</button>
          {sectionName === 'data-updates' && <button className="rounded border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-100" onClick={() => setPendingRemovals((count) => count + 1)} type="button">{t('contribution.modules.addRemoval')}</button>}
        </div>
      )}
      {rows.length === 0 && removalRows.length === 0 && pendingRows === 0 && pendingRemovals === 0 ? <p className="rounded bg-slate-950 p-3 text-sm text-slate-500">{t('contribution.modules.noRows')}</p> : null}
      {Array.from({ length: pendingRows }).map((_, index) => (
        <div className="grid gap-2 rounded border border-slate-800 bg-slate-950 p-2 md:grid-cols-[1fr_12rem_auto]" key={`pending-${index}`}>
          <span className="text-sm text-slate-500">{t('structured.empty')}</span>
          <select className="rounded bg-slate-900 px-2 py-1.5 text-sm" onChange={(event) => { const key = event.target.value as DataKey; if (!key) return; addDataRow(key); setPendingRows((count) => Math.max(0, count - 1)); }} value="">
            <option value="">{t('contribution.modules.selectType')}</option>
            {dataKeys.map((key) => <option key={key} value={key}>{t(`contribution.data.${key}`)}</option>)}
          </select>
          <button className="rounded border border-rose-500 px-2 py-1.5 text-sm font-semibold text-rose-200" onClick={() => setPendingRows((count) => Math.max(0, count - 1))} type="button">{t('structured.remove')}</button>
        </div>
      ))}
      {Array.from({ length: pendingRemovals }).map((_, index) => (
        <div className="grid gap-2 rounded border border-slate-800 bg-slate-950 p-2 md:grid-cols-[1fr_12rem_auto]" key={`pending-removal-${index}`}>
          <span className="text-sm text-slate-500">{t('contribution.modules.removeRow')}</span>
          <select className="rounded bg-slate-900 px-2 py-1.5 text-sm" onChange={(event) => addRemoval(event.target.value as RemoveTarget)} value="">
            <option value="">{t('contribution.modules.selectType')}</option>
            {removeTargets.map((target) => <option key={target} value={target}>{targetLabel(target)}</option>)}
          </select>
          <button className="rounded border border-rose-500 px-2 py-1.5 text-sm font-semibold text-rose-200" onClick={() => setPendingRemovals((count) => Math.max(0, count - 1))} type="button">{t('structured.remove')}</button>
        </div>
      ))}
      {removalRows.map((row, index) => (
        <div className="grid gap-2 rounded border border-slate-800 bg-slate-950 p-2 md:grid-cols-[10rem_1fr_1fr_auto]" key={`remove-${index}-${row.target}-${row.path ?? ''}-${row.id}`}>
          <select className="rounded bg-slate-900 px-2 py-1.5 text-sm text-slate-100" disabled={readOnly} onChange={(event) => saveRemoval(index, { target: event.target.value, path: event.target.value === 'dialogueOptions' ? row.path ?? '' : undefined })} value={row.target}>
            {removeTargets.map((target) => <option key={target} value={target}>{targetLabel(target)}</option>)}
          </select>
          {row.target === 'dialogueOptions'
            ? <input className="rounded bg-slate-900 px-2 py-1.5 text-sm text-slate-100" onChange={(event) => saveRemoval(index, { path: event.target.value })} placeholder={t('contribution.modules.removePath')} readOnly={readOnly} value={row.path ?? ''} />
            : <span className="self-center text-sm text-slate-500">{t('contribution.modules.removeContent')}</span>}
          <input className="rounded bg-slate-900 px-2 py-1.5 text-sm text-slate-100" onChange={(event) => saveRemoval(index, { id: event.target.value })} placeholder={t('contribution.modules.removeId')} readOnly={readOnly} value={row.id} />
          {!readOnly && <button className="rounded border border-rose-500 px-2 py-1.5 text-sm font-semibold text-rose-200" onClick={() => saveRemoval(index, undefined)} type="button">{t('structured.remove')}</button>}
        </div>
      ))}
      {dataKeys.filter((key) => ((section[key] as StructuredValue[] | undefined) ?? []).length > 0).map((key) => {
        const groupRows = filteredRowsForKey(key);
        const groupKey = `${sectionName}-${key}`;
        const collapsed = collapsedGroups.has(groupKey);
        const schema = fieldSchema(editorBundle, key);
        const item = typeof schema.item === 'function' ? schema.item() : schema.item;
        const columns = schema.columns ?? (item.kind === 'object' ? Object.keys(item.fields).filter((field) => field !== 'type') : ['id']);
        return (
          <section className="grid gap-2 rounded border border-slate-800 bg-slate-950 p-2" key={key}>
            <div className="flex flex-wrap items-center gap-2">
              <button className="mr-auto text-left text-sm font-semibold text-slate-100" onClick={() => toggleGroup(groupKey)} type="button">
                {t(`contribution.data.${key}`)} <span className="text-xs font-normal text-slate-500">({((section[key] as StructuredValue[] | undefined) ?? []).length})</span>
              </button>
              <input className="w-48 rounded bg-slate-900 px-2 py-1.5 text-sm text-slate-100" onChange={(event) => setGroupFilters((filters) => ({ ...filters, [key]: event.target.value }))} placeholder={t('contribution.modules.filterById')} value={groupFilters[key] ?? ''} />
              {!readOnly && <button className="rounded bg-cyan-400 px-2 py-1.5 text-sm font-semibold text-slate-950" onClick={() => addRowToGroup(key)} type="button">{t('structured.addRow')}</button>}
            </div>
            {!collapsed && tableDataKeys.has(key) && item.kind === 'object' ? (
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">
                  <thead className="text-left text-xs uppercase text-slate-500"><tr>{columns.map((column) => <th className="px-2 py-1" key={column}>{t(item.fields[column]?.label ?? column)}</th>)}{!readOnly && <th className="px-2 py-1">{t('structured.remove')}</th>}</tr></thead>
                  <tbody>{groupRows.map((row) => {
                    const record = row.value && typeof row.value === 'object' && !Array.isArray(row.value) ? row.value : {};
                    return (
                      <tr className="border-t border-slate-800 align-top" key={`${key}-${row.index}`}>
                        {columns.map((column) => <td className="px-2 py-2" key={column}><StructuredDataEditor onChange={(value) => saveRow(key, row.index, { ...record, [column]: value } as StructuredValue)} schema={item.fields[column]?.schema ?? { kind: 'inferred' }} t={t} value={record[column]} /></td>)}
                        {!readOnly && <td className="px-2 py-2"><button className="rounded border border-rose-500 px-2 py-1.5 text-sm font-semibold text-rose-200" onClick={() => saveRow(key, row.index, undefined)} type="button">{t('structured.remove')}</button></td>}
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
            ) : null}
            {!collapsed && !tableDataKeys.has(key) ? groupRows.map((row) => {
              const rowKey = `${row.key}-${row.index}`;
              const record = row.value && typeof row.value === 'object' && !Array.isArray(row.value) ? row.value : {};
              const isExpanded = expanded.has(rowKey);
              return (
                <div className="grid gap-2 rounded border border-slate-800 bg-slate-900/50 p-2" key={rowKey}>
                  <button className="grid items-center gap-2 text-left md:grid-cols-[1fr_12rem_auto]" onClick={() => setExpanded((current) => { const next = new Set(current); if (next.has(rowKey)) next.delete(rowKey); else next.add(rowKey); return next; })} type="button">
                    <span className="min-w-0 truncate text-sm font-semibold text-slate-100">{String(record.id ?? '') || t('structured.empty')}</span>
                    <span className="text-sm text-slate-400">{t(`contribution.data.${row.key}`)}</span>
                    {!readOnly && <span className="rounded border border-rose-500 px-2 py-1.5 text-center text-sm font-semibold text-rose-200" onClick={(event) => { event.stopPropagation(); saveRow(row.key, row.index, undefined); }}>{t('structured.remove')}</span>}
                  </button>
                  {isExpanded && (
                    <div className="grid gap-3 border-t border-slate-800 pt-2">
                      {!readOnly && (
                        <label className="grid max-w-xs gap-1 text-xs text-slate-400">
                          <span>{t('contribution.modules.selectType')}</span>
                          <select className="rounded bg-slate-900 px-2 py-1.5 text-sm text-slate-100" onChange={(event) => moveRow(row.key, row.index, event.target.value as DataKey)} value={row.key}>
                            {dataKeys.map((candidateKey) => <option key={candidateKey} value={candidateKey}>{t(`contribution.data.${candidateKey}`)}</option>)}
                          </select>
                        </label>
                      )}
                      {readOnly ? (
                        <textarea className="min-h-56 rounded bg-slate-900 p-3 font-mono text-xs text-slate-300" readOnly value={JSON.stringify(row.value, null, 2)} />
                      ) : (
                        <StructuredDataEditor onChange={(value) => saveRow(row.key, row.index, value)} schema={itemSchema(editorBundle, row.key)} t={t} value={row.value} />
                      )}
                    </div>
                  )}
                </div>
              );
            }) : null}
          </section>
        );
      })}
    </section>
  );
};

export const ModuleEditor = ({ bundle, draft, issues, onMoveModule, onPatch, t, universeIds }: ModuleEditorProps) => {
  const [filter, setFilter] = useState('');
  const [sortMode, setSortMode] = useState<'id' | 'author'>('id');
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const [editorTab, setEditorTab] = useState<EditorTab>('details');
  const [showModpacks, setShowModpacks] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState(false);
  const [dependencyText, setDependencyText] = useState('');
  const packagedModuleIds = new Set((bundle.modules ?? []).map((module) => module.id));
  const removedModules = new Set(draft.removed?.modules ?? []);
  const draftLocalModules = (draft.modules ?? []).filter((module) => !packagedModuleIds.has(module.id) && !removedModules.has(module.id));
  const localIds = new Set(draftLocalModules.map((module) => module.id));
  const issueModuleIds = new Set(issues.map(moduleIdFromIssue).filter((id): id is string => Boolean(id)));
  const issuePackIds = new Set(issues.map(packIdFromIssue).filter((id): id is string => Boolean(id)));
  const allModules = useMemo(() => {
    const baseModules = bundle.modules ?? [];
    return uniqueById([...draftLocalModules, ...baseModules]).sort((a, b) => String(a[sortMode]).localeCompare(String(b[sortMode])) || a.id.localeCompare(b.id));
  }, [bundle.modules, draftLocalModules, sortMode]);
  const modules = useMemo(() => allModules.filter((module) => !filter.trim() || JSON.stringify(module).toLowerCase().includes(filter.trim().toLowerCase())), [allModules, filter]);
  const selectedModule = allModules.find((module) => module.id === selectedModuleId) ?? modules[0] ?? null;
  const moduleContextBundle = useMemo(
    () => bundleWithModuleData(bundle, allModules.filter((module) => module.id !== selectedModule?.id)),
    [allModules, bundle, selectedModule?.id],
  );
  const modulePacks = uniquePacksById([...(draft.modulePacks ?? []), ...(bundle.modulePacks ?? [])]);
  const localModules = modules.filter((module) => localIds.has(module.id));
  const coreModules = modules.filter((module) => !localIds.has(module.id));
  const moduleIds = new Set(allModules.map((module) => module.id));
  const isLocal = selectedModule ? localIds.has(selectedModule.id) : false;
  const selectedModuleIssues = selectedModule ? issues.filter((issue) => moduleIdFromIssue(issue) === selectedModule.id) : [];
  const submitIssues = [
    ...selectedModuleIssues,
    ...(!draft.notes.trim() ? [{ severity: 'error' as const, path: 'contribution.notes', message: 'validation.contributorNotesRequired' }] : []),
  ];
  const rawJson = selectedModule ? JSON.stringify(selectedModule, null, 2) : '';
  const serialization = selectedModule ? serializeModule(selectedModule) : '';

  useEffect(() => {
    setDependencyText(selectedModule ? dependencyListString(selectedModule) : '');
  }, [selectedModule?.id]);

  const saveModule = (module: ContentModule, originalId = module.id) => {
    const normalized = { ...module, id: toModuleId(module.id), universe: module.universe || bundle.manifest.id };
    if (isLocal && normalized.universe !== bundle.manifest.id) {
      onMoveModule(normalized, originalId, normalized.universe);
      setSelectedModuleId(null);
      return;
    }
    onPatch({
      modules: upsertModule(draftLocalModules, normalized, originalId),
      removed: { ...draft.removed, modules: (draft.removed?.modules ?? []).filter((id) => id !== normalized.id) },
    });
    setSelectedModuleId(normalized.id);
  };
  const removeModule = (module: ContentModule) => {
    if (!localIds.has(module.id)) return;
    onPatch({
      modules: draftLocalModules.filter((candidate) => candidate.id !== module.id),
      removed: { ...draft.removed, modules: draft.removed.modules },
    });
    setSelectedModuleId(null);
  };
  const addModule = () => {
    const module = createModule(bundle, allModules.map((item) => item.id));
    saveModule(module);
    setEditorTab('details');
  };
  const updateSelected = (patch: Partial<ContentModule>) => {
    if (!selectedModule || !isLocal) return;
    saveModule({ ...selectedModule, ...patch }, selectedModule.id);
  };
  const saveDependencyText = () => {
    if (!selectedModule || !isLocal) return;
    updateSelected({ dependencies: dependenciesFromListString(dependencyText) });
  };
  const submitPackage = selectedModule ? {
    appVersion: '0.1.0',
    targetUniverseId: draft.universeId,
    targetModuleId: selectedModule.id,
    notes: draft.notes,
    validationIssues: submitIssues,
    t,
    changedFiles: [{ path: moduleFilePath(selectedModule), json: selectedModule }],
  } : null;

  return (
    <section className="grid gap-3 rounded border border-slate-700 p-3">
      <div className="grid gap-3 lg:grid-cols-[18rem_1fr]">
        <aside className="grid content-start gap-3 rounded border border-slate-800 bg-slate-900 p-3">
          <div className="flex items-center gap-2">
            <h3 className="mr-auto text-sm font-semibold text-slate-100">{bundle.manifest.id}</h3>
            <button className="rounded bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950" data-testid="module-add" onClick={addModule} type="button">{t('contribution.modules.add')}</button>
          </div>
          <button className={`rounded px-3 py-2 text-left text-sm font-semibold ${showModpacks ? 'bg-cyan-300 text-slate-950' : issuePackIds.size ? 'bg-rose-950/30 text-rose-100' : 'bg-slate-950 text-slate-300'}`} onClick={() => setShowModpacks(true)} type="button">{t('contribution.modules.modpacks')}</button>
          <input className="rounded bg-slate-950 px-3 py-2 text-sm text-slate-100" onChange={(event) => setFilter(event.target.value)} placeholder={t('contribution.modules.filter')} value={filter} />
          <select className="rounded bg-slate-950 px-3 py-2 text-sm text-slate-100" onChange={(event) => setSortMode(event.target.value as typeof sortMode)} value={sortMode}><option value="id">{t('contribution.modules.sortId')}</option><option value="author">{t('contribution.modules.sortAuthor')}</option></select>
          {modulePacks.length > 0 && <ModulePackTree packs={modulePacks} selectedModuleId={selectedModule?.id ?? null} issueModuleIds={issueModuleIds} issuePackIds={issuePackIds} moduleIds={moduleIds} onSelect={(id) => { setSelectedModuleId(id); setShowModpacks(false); }} t={t} />}
          <div className="border-t border-slate-700 pt-2">
            <h4 className="mb-2 text-xs font-semibold uppercase text-slate-500">{t('contribution.modules.localMods')}</h4>
            <div className="grid gap-1">{localModules.map((module) => <button className={`grid grid-cols-[1fr_auto] items-center gap-2 rounded px-3 py-2 text-left text-sm ${selectedModule?.id === module.id && !showModpacks ? 'bg-cyan-300 text-slate-950' : issueModuleIds.has(module.id) ? 'bg-rose-950/30 text-rose-100' : 'bg-slate-950 text-slate-300'}`} data-testid={`module-list-item-${module.id}`} key={module.id} onClick={() => { setSelectedModuleId(module.id); setShowModpacks(false); }} type="button"><span><span className="block font-semibold">{module.id}</span><span className="block text-xs opacity-80">{module.version} / {module.author}</span></span><span className="rounded bg-rose-500 px-2 py-1 text-xs font-semibold text-white" onClick={(event) => { event.stopPropagation(); removeModule(module); }}>{t('structured.remove')}</span></button>)}</div>
          </div>
          <div className="border-t border-slate-700 pt-2">
            <h4 className="mb-2 text-xs font-semibold uppercase text-slate-500">{t('contribution.modules.coreMods')}</h4>
            <div className="grid gap-1">{coreModules.map((module) => <button className={`rounded px-3 py-2 text-left text-sm ${selectedModule?.id === module.id && !showModpacks ? 'bg-cyan-300 text-slate-950' : issueModuleIds.has(module.id) ? 'bg-rose-950/30 text-rose-100' : 'bg-slate-950 text-slate-300'}`} key={module.id} onClick={() => { setSelectedModuleId(module.id); setShowModpacks(false); }} type="button"><span className="block font-semibold">{module.id}</span><span className="block text-xs opacity-80">{module.version} / {module.author}</span></button>)}</div>
          </div>
        </aside>

        {showModpacks ? (
          <section className="grid min-w-0 content-start gap-3 self-start">
            <h4 className="text-sm font-semibold text-slate-100">{t('contribution.modules.modpacks')}</h4>
            <StructuredDataEditor onChange={(value) => onPatch({ modulePacks: (Array.isArray(value) ? value : []) as unknown as ContentModulePack[] })} schema={{ kind: 'array', listMode: 'free', item: modulePackSchema({ ...bundle, modules: allModules }), createItem: () => ({ id: 'new-pack', modules: allModules[0] ? [allModules[0].id] : [] }) }} t={t} value={modulePacks as unknown as StructuredValue} />
          </section>
        ) : selectedModule ? (
          <section className="grid min-w-0 content-start gap-3 self-start">
            <div className="flex items-start justify-between gap-2">
              <div><h4 className="text-sm font-semibold text-slate-100">{selectedModule.id}</h4>{!isLocal && <p className="text-xs text-slate-400">{t('contribution.modules.coreReadonly')}</p>}</div>
            </div>
            <div className="sticky top-0 z-10 flex flex-wrap content-start items-start gap-2 border-b border-slate-700 bg-slate-900/95 backdrop-blur">
              {(['details', 'data', 'data-updates', 'locale', 'raw', 'submit'] as const).map((tab) => <button className={`px-3 py-2 text-sm font-semibold ${editorTab === tab ? 'border-b-2 border-cyan-300 text-cyan-100' : 'text-slate-400'}`} key={tab} onClick={() => setEditorTab(tab)} type="button">{t(tab === 'details' ? 'contribution.modules.detailsTab' : tab === 'data' ? 'contribution.modules.dataTab' : tab === 'data-updates' ? 'contribution.modules.dataUpdatesTab' : tab === 'locale' ? 'contribution.modules.localeTab' : tab === 'raw' ? 'contribution.modules.rawTab' : 'contribution.modules.submitTab')}</button>)}
            </div>
            {editorTab === 'details' && (
              <section className={`grid gap-3 rounded border p-3 ${moduleDetailProblems(selectedModule).length || selectedModuleIssues.length ? 'border-rose-800 bg-rose-950/10' : 'border-slate-700'}`}>
                {selectedModuleIssues.length > 0 && <ul className="grid gap-1 text-sm">{selectedModuleIssues.map((issue) => <li className={issue.severity === 'error' ? 'text-rose-200' : 'text-amber-200'} key={`${issue.path}-${issue.message}`}><span className="font-semibold">{issue.severity}</span>: {issue.path} - {t(issue.message, issue.params)}</li>)}</ul>}
                <div className="grid gap-2 md:grid-cols-[9rem_1fr]">
                  <label className="contents"><span className="self-center text-sm text-slate-400">{t('contribution.column.id')}</span><input className="rounded bg-slate-950 px-3 py-2 text-sm text-slate-100" data-testid="module-field-id" onChange={(event) => updateSelected({ id: toModuleId(event.target.value) })} readOnly={!isLocal} value={selectedModule.id} /></label>
                  <label className="contents"><span className="self-center text-sm text-slate-400">{t('contribution.module.version')}</span><input className="rounded bg-slate-950 px-3 py-2 text-sm text-slate-100" data-testid="module-field-version" onChange={(event) => updateSelected({ version: event.target.value })} readOnly={!isLocal} value={selectedModule.version} /></label>
                  <label className="contents"><span className="self-center text-sm text-slate-400">{t('contribution.module.universe')}</span><select className="rounded bg-slate-950 px-3 py-2 text-sm text-slate-100" data-testid="module-field-universe" disabled={!isLocal} onChange={(event) => updateSelected({ universe: event.target.value })} value={selectedModule.universe}>
                    {Array.from(new Set([selectedModule.universe, bundle.manifest.id, ...universeIds])).filter(Boolean).map((universeId) => <option key={universeId} value={universeId}>{universeId}</option>)}
                  </select></label>
                  <label className="contents"><span className="self-center text-sm text-slate-400">{t('contribution.module.author')}</span><input className="rounded bg-slate-950 px-3 py-2 text-sm text-slate-100" data-testid="module-field-author" onChange={(event) => updateSelected({ author: event.target.value })} readOnly={!isLocal} value={selectedModule.author} /></label>
                  <label className="contents"><span className="self-center text-sm text-slate-400">{t('contribution.module.gameVersion')}</span><input className="rounded bg-slate-950 px-3 py-2 text-sm text-slate-100" data-testid="module-field-gameVersion" onChange={(event) => updateSelected({ game_version: event.target.value })} readOnly={!isLocal} value={String(selectedModule.game_version)} /></label>
                  <label className="contents"><span className="self-start pt-2 text-sm text-slate-400">{t('contribution.module.dependencies')}</span><textarea className="min-h-24 rounded bg-slate-950 px-3 py-2 text-sm text-slate-100" data-testid="module-field-dependencies" onBlur={saveDependencyText} onChange={(event) => setDependencyText(event.target.value)} placeholder={t('contribution.modules.dependenciesPlaceholder')} readOnly={!isLocal} value={dependencyText} /></label>
                </div>
                <datalist id="module-dependency-ids">{allModules.filter((module) => module.id !== selectedModule.id).map((module) => <option key={module.id} value={module.id} />)}</datalist>
                {isLocal && <div className="grid gap-2 border-t border-slate-800 pt-3"><p className="text-xs text-amber-200">{t('contribution.modules.importWarning')}</p><textarea className="min-h-24 rounded bg-slate-950 p-3 text-xs text-slate-200" data-testid="module-import-textarea" onChange={(event) => { setImportText(event.target.value); setImportError(false); }} placeholder={t('contribution.modules.importPlaceholder')} value={importText} />{importError && <p className="text-xs text-rose-300" data-testid="module-import-error">{t('contribution.modules.importFailed')}</p>}<button className="justify-self-start rounded border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-100" data-testid="module-import-button" disabled={!importText.trim()} onClick={() => { try { saveModule({ ...deserializeModule(importText), id: selectedModule.id, universe: bundle.manifest.id }, selectedModule.id); setImportText(''); } catch { setImportError(true); } }} type="button">{t('contribution.modules.import')}</button></div>}
              </section>
            )}
            {editorTab === 'data' && <DataRows bundle={bundle} module={selectedModule} onSave={(module) => saveModule(module, selectedModule.id)} readOnly={!isLocal} sectionName="data" t={t} />}
            {editorTab === 'data-updates' && <DataRows bundle={bundle} module={selectedModule} onSave={(module) => saveModule(module, selectedModule.id)} readOnly={!isLocal} sectionName="data-updates" t={t} />}
            {editorTab === 'locale' && <ModuleLocalizationEditor bundle={moduleContextBundle} module={selectedModule} onSave={(module) => saveModule(module, selectedModule.id)} readOnly={!isLocal} t={t} />}
            {editorTab === 'raw' && <section className="grid gap-3 rounded border border-slate-700 p-3"><button className="justify-self-start rounded border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-100" onClick={() => void navigator.clipboard.writeText(serialization)} type="button">{t('contribution.modules.copySerialization')}</button><textarea className="min-h-24 rounded bg-slate-950 p-3 font-mono text-xs text-slate-300" readOnly value={serialization} /><button className="justify-self-start rounded border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-100" onClick={() => void navigator.clipboard.writeText(rawJson)} type="button">{t('contribution.modules.copyJson')}</button><textarea className="min-h-72 rounded bg-slate-950 p-3 font-mono text-xs text-slate-300" readOnly value={rawJson} /></section>}
            {editorTab === 'submit' && submitPackage && <section className="grid gap-3 rounded border border-slate-700 p-3"><h5 className="text-sm font-semibold text-slate-100">{t('contribution.github.title')}</h5>{submitIssues.length === 0 ? <p className="text-sm text-emerald-300">{t('contribution.validation.empty')}</p> : <ul className="grid gap-1 text-sm">{submitIssues.map((issue) => <li className={issue.severity === 'error' ? 'text-rose-300' : 'text-amber-300'} key={`${issue.path}-${issue.message}`}>{issue.severity}: {issue.path} - {t(issue.message, issue.params)}</li>)}</ul>}<textarea className="min-h-24 rounded bg-slate-950 p-3 text-sm text-slate-200" onChange={(event) => onPatch({ notes: event.target.value })} placeholder={t('contribution.notesPlaceholder')} value={draft.notes} /><div className="flex flex-wrap gap-2"><a className="rounded bg-emerald-400 px-3 py-2 text-sm font-semibold text-slate-950" href={createPrefilledIssueUrl(submitPackage)} rel="noreferrer" target="_blank">{t('contribution.github.open')}</a><button className="rounded border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-100" onClick={() => void navigator.clipboard.writeText(formatContributionIssueBody(submitPackage))} type="button">{t('contribution.github.copy')}</button></div><textarea className="min-h-56 rounded bg-slate-950 p-3 text-xs text-slate-300" readOnly value={formatContributionIssueBody(submitPackage)} /></section>}
          </section>
        ) : (
          <p className="rounded bg-slate-950 p-3 text-sm text-slate-500">{t('contribution.modules.empty')}</p>
        )}
      </div>
    </section>
  );
};
