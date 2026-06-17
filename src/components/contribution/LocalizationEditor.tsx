import { useMemo, useState } from 'react';
import type { ContentBundle, ContributionDraft, LocaleDictionary } from '../../game/types';
import { collectLocalizationKeys } from '../../game/validators';

type LocalizationEditorProps = {
  bundle: ContentBundle;
  draft: ContributionDraft;
  onChange: (locales: Record<string, LocaleDictionary>) => void;
};

const uniqueLocales = (bundle: ContentBundle, draft: ContributionDraft) =>
  Array.from(new Set([...bundle.manifest.locales, ...Object.keys(bundle.locales), ...Object.keys(draft.locales)]));

export const LocalizationEditor = ({ bundle, draft, onChange }: LocalizationEditorProps) => {
  const locales = uniqueLocales(bundle, draft);
  const [lang1, setLang1] = useState(locales.includes('en') ? 'en' : locales[0] ?? 'en');
  const [lang2, setLang2] = useState(locales.find((locale) => locale !== lang1) ?? '');
  const [missingOnly, setMissingOnly] = useState(true);
  const [search, setSearch] = useState('');

  const keys = useMemo(() => collectLocalizationKeys(bundle), [bundle]);
  const mergedLocales = useMemo(
    () =>
      Object.fromEntries(
        Array.from(new Set([...Object.keys(bundle.locales), ...Object.keys(draft.locales), lang1, lang2].filter(Boolean))).map(
          (locale) => [
            locale,
            {
              ...(bundle.locales[locale] ?? {}),
              ...(draft.locales[locale] ?? {}),
            },
          ],
        ),
      ) as Record<string, LocaleDictionary>,
    [bundle.locales, draft.locales, lang1, lang2],
  );

  const visibleKeys = keys.filter((key) => {
    const matchesSearch = search.trim().length === 0 || key.toLowerCase().includes(search.trim().toLowerCase());
    const missing =
      !mergedLocales[lang1]?.[key] ||
      (lang2 ? !mergedLocales[lang2]?.[key] : false);

    return matchesSearch && (!missingOnly || missing);
  });

  const updateValue = (locale: string, key: string, value: string) => {
    onChange({
      ...draft.locales,
      [locale]: {
        ...(draft.locales[locale] ?? {}),
        [key]: value,
      },
    });
  };

  return (
    <section className="grid gap-3 rounded border border-slate-700 p-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-100">Localization</h3>
        <p className="text-xs text-slate-400">Fill display text for keys used by locations, actions, skills, and universes.</p>
      </div>

      <div className="grid gap-2 md:grid-cols-[1fr_auto_auto_auto]">
        <input
          className="rounded bg-slate-950 px-3 py-2 text-sm"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search localization keys"
          value={search}
        />
        <select className="rounded bg-slate-950 px-3 py-2 text-sm" onChange={(event) => setLang1(event.target.value)} value={lang1}>
          {Array.from(new Set(['en', ...locales, lang1])).map((locale) => (
            <option key={locale} value={locale}>
              {locale}
            </option>
          ))}
        </select>
        <input
          className="rounded bg-slate-950 px-3 py-2 text-sm"
          list="locales"
          onChange={(event) => setLang2(event.target.value)}
          placeholder="lang2"
          value={lang2}
        />
        <label className="flex items-center gap-2 rounded bg-slate-950 px-3 py-2 text-sm">
          <input checked={missingOnly} onChange={(event) => setMissingOnly(event.target.checked)} type="checkbox" />
          Missing only
        </label>
      </div>

      <datalist id="locales">
        {locales.map((locale) => (
          <option key={locale} value={locale} />
        ))}
      </datalist>

      <div className="overflow-auto rounded border border-slate-800">
        <table className="min-w-full border-collapse text-sm">
          <thead className="bg-slate-950 text-left text-xs uppercase text-slate-400">
            <tr>
              <th className="w-64 border-b border-slate-800 px-3 py-2">id</th>
              <th className="border-b border-slate-800 px-3 py-2">{lang1}</th>
              {lang2 && <th className="border-b border-slate-800 px-3 py-2">{lang2}</th>}
            </tr>
          </thead>
          <tbody>
            {visibleKeys.map((key) => (
              <tr className="border-b border-slate-800 last:border-0" key={key}>
                <td className="align-top px-3 py-2 font-mono text-xs text-slate-400">{key}</td>
                <td className="px-3 py-2">
                  <textarea
                    className="min-h-16 w-full rounded bg-slate-950 p-2 text-sm text-slate-100"
                    onChange={(event) => updateValue(lang1, key, event.target.value)}
                    value={mergedLocales[lang1]?.[key] ?? ''}
                  />
                </td>
                {lang2 && (
                  <td className="px-3 py-2">
                    <textarea
                      className="min-h-16 w-full rounded bg-slate-950 p-2 text-sm text-slate-100"
                      onChange={(event) => updateValue(lang2, key, event.target.value)}
                      value={mergedLocales[lang2]?.[key] ?? ''}
                    />
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
