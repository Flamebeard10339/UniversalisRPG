import { useId, useState } from 'react';
import type { Translator } from '../../game/i18n';

export type StructuredValue = null | boolean | number | string | StructuredValue[] | { [key: string]: StructuredValue | undefined };
export type StructuredSchemaRef = StructuredSchema | (() => StructuredSchema);
export type StructuredField = {
  defaultValue?: StructuredValue;
  label?: string;
  optional?: boolean;
  schema: StructuredSchemaRef;
};
export type StructuredSchema =
  | { kind: 'string'; suggestions?: string[] }
  | { kind: 'color' }
  | { kind: 'number'; min?: number; max?: number; step?: number }
  | { kind: 'boolean' }
  | { kind: 'enum'; options: string[] }
  | { kind: 'scalar'; types?: Array<'boolean' | 'number' | 'string'> }
  | { kind: 'object'; fields: Record<string, StructuredField>; allowAdditional?: boolean }
  | { kind: 'array'; item: StructuredSchemaRef; createItem: () => StructuredValue; listMode?: 'free' | 'table' | 'tags'; columns?: string[] }
  | { kind: 'union'; discriminator: string; variants: Record<string, { label?: string; schema: StructuredSchemaRef; createValue: () => StructuredValue }> }
  | { kind: 'inferred' };

type EditorProps = {
  hiddenKeys?: string[];
  label?: string;
  onChange: (value: StructuredValue | undefined) => void;
  optional?: boolean;
  schema?: StructuredSchemaRef;
  t: Translator;
  value: StructuredValue | undefined;
};

const resolveSchema = (schema: StructuredSchemaRef): StructuredSchema => typeof schema === 'function' ? schema() : schema;
const inputClass = 'min-w-0 rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100';
const removeButtonClass = 'rounded border border-rose-500 px-2 py-1.5 text-sm font-semibold text-rose-200';
const labelText = (label: string, t: Translator) => label.includes('.') ? t(label) : label;
const buttonClass = 'rounded border border-slate-600 px-2 py-1 text-xs text-slate-200';

const inferredSchema = (value: StructuredValue | undefined): StructuredSchema => {
  if (typeof value === 'boolean') return { kind: 'boolean' };
  if (typeof value === 'number') return { kind: 'number' };
  if (typeof value === 'string') return { kind: 'string' };
  if (Array.isArray(value)) return { kind: 'array', item: { kind: 'inferred' }, createItem: () => '' };
  if (value && typeof value === 'object') {
    return {
      kind: 'object',
      allowAdditional: true,
      fields: Object.fromEntries(Object.keys(value).map((key) => [key, { schema: { kind: 'inferred' } }])),
    };
  }
  return { kind: 'string' };
};

const compatibleSchema = (schema: StructuredSchema, value: StructuredValue | undefined): StructuredSchema => {
  if (schema.kind === 'inferred') return inferredSchema(value);
  if (value === undefined || value === null) return schema;
  if (Array.isArray(value) && schema.kind !== 'array') return inferredSchema(value);
  if (typeof value === 'object' && !Array.isArray(value) && schema.kind !== 'object' && schema.kind !== 'union') return inferredSchema(value);
  return schema;
};

const defaultFor = (field: StructuredField) => field.defaultValue ?? (() => {
  const schema = resolveSchema(field.schema);
  if (schema.kind === 'boolean') return false;
  if (schema.kind === 'number') return 0;
  if (schema.kind === 'array') return [];
  if (schema.kind === 'object') return {};
  if (schema.kind === 'enum') return schema.options[0] ?? '';
  if (schema.kind === 'union') return Object.values(schema.variants)[0]?.createValue() ?? {};
  if (schema.kind === 'scalar') return false;
  return '';
})();

const PrimitiveEditor = ({
  accessibleLabel,
  schema,
  value,
  onChange,
}: {
  accessibleLabel?: string;
  schema: Exclude<StructuredSchema, { kind: 'object' | 'array' | 'union' | 'inferred' | 'scalar' }>;
  value: StructuredValue | undefined;
  onChange: (value: StructuredValue) => void;
}) => {
  const suggestionId = useId();
  if (schema.kind === 'boolean') {
    return <input aria-label={accessibleLabel} checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} type="checkbox" />;
  }
  if (schema.kind === 'enum') {
    return (
      <select aria-label={accessibleLabel} className={inputClass} onChange={(event) => onChange(event.target.value)} value={String(value ?? schema.options[0] ?? '')}>
        {schema.options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    );
  }
  if (schema.kind === 'number') {
    return <input aria-label={accessibleLabel} className={inputClass} max={schema.max} min={schema.min} onChange={(event) => { const next = Number(event.target.value); if (Number.isFinite(next)) onChange(next); }} step={schema.step} type="number" value={typeof value === 'number' ? value : 0} />;
  }
  if (schema.kind === 'color') {
    return <input aria-label={accessibleLabel} className="h-9 w-12 rounded border border-slate-700 bg-slate-900 p-1" onChange={(event) => onChange(event.target.value)} type="color" value={typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000'} />;
  }
  return (
    <>
      {schema.suggestions?.length ? <datalist id={suggestionId}>{schema.suggestions.map((suggestion) => <option key={suggestion} value={suggestion} />)}</datalist> : null}
      <input aria-label={accessibleLabel} className={inputClass} list={schema.suggestions?.length ? suggestionId : undefined} onChange={(event) => onChange(event.target.value)} value={typeof value === 'string' ? value : ''} />
    </>
  );
};

const EditorNode = ({ hiddenKeys = [], label, onChange, optional, schema: schemaRef = { kind: 'inferred' }, t, value }: EditorProps) => {
  const schema = compatibleSchema(resolveSchema(schemaRef), value);
  const [newField, setNewField] = useState('');

  if (value === undefined && optional) {
    return <button className="justify-self-start rounded border border-dashed border-slate-600 px-2 py-1 text-xs text-slate-300" onClick={() => onChange(defaultFor({ schema }))} type="button">+ {label ? labelText(label, t) : t('structured.addValue')}</button>;
  }

  if (schema.kind === 'union') {
    const record = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const selected = String(record[schema.discriminator] ?? Object.keys(schema.variants)[0] ?? '');
    const variant = schema.variants[selected] ?? Object.values(schema.variants)[0];
    return (
      <section className="grid gap-2 rounded border border-slate-800 bg-slate-950/60 p-2">
        <div className="flex min-w-[10rem] items-center gap-2">
          <span className="text-xs text-slate-400">{label ? labelText(label, t) : schema.discriminator}</span>
          <select className={inputClass} onChange={(event) => onChange(schema.variants[event.target.value].createValue())} value={selected}>
            {Object.entries(schema.variants).map(([key, item]) => <option key={key} value={key}>{item.label ? labelText(item.label, t) : key}</option>)}
          </select>
          {optional && <button className="text-xs text-rose-300" onClick={() => onChange(undefined)} type="button">{t('structured.remove')}</button>}
        </div>
        {variant && <EditorNode hiddenKeys={[schema.discriminator]} onChange={onChange} schema={variant.schema} t={t} value={value} />}
      </section>
    );
  }

  if (schema.kind === 'scalar') {
    const scalarType = typeof value === 'number' ? 'number' : typeof value === 'string' ? 'string' : 'boolean';
    const allowedTypes = schema.types ?? ['boolean', 'number', 'string'];
    const primitiveSchema: StructuredSchema = scalarType === 'number' ? { kind: 'number' } : scalarType === 'string' ? { kind: 'string' } : { kind: 'boolean' };
    return (
      <div className="grid min-w-0 gap-1">
        <span className="text-xs text-slate-400">{label ? labelText(label, t) : t('structured.value')}</span>
        <div className="flex min-w-0 items-center gap-2">
          <select className={inputClass} onChange={(event) => onChange(event.target.value === 'number' ? 0 : event.target.value === 'string' ? '' : false)} value={scalarType}>
            {allowedTypes.includes('boolean') && <option value="boolean">{t('structured.boolean')}</option>}
            {allowedTypes.includes('number') && <option value="number">{t('structured.number')}</option>}
            {allowedTypes.includes('string') && <option value="string">{t('structured.string')}</option>}
          </select>
          <PrimitiveEditor accessibleLabel={label ? labelText(label, t) : undefined} onChange={onChange} schema={primitiveSchema as Extract<StructuredSchema, { kind: 'string' | 'number' | 'boolean' | 'enum' }>} value={value} />
          {optional && <button className="text-xs text-rose-300" onClick={() => onChange(undefined)} type="button">{t('structured.remove')}</button>}
        </div>
      </div>
    );
  }

  if (schema.kind === 'array') {
    const items = Array.isArray(value) ? value : [];
    const listMode = schema.listMode ?? 'free';

    if (listMode === 'tags') {
      return (
        <section className="grid gap-2 border-l border-slate-700 pl-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label ? labelText(label, t) : t('structured.items')}</span>
            <div className="flex gap-2">
              <button className={buttonClass} onClick={() => onChange([...items, schema.createItem()])} type="button">+ {t('structured.addRow')}</button>
              {optional && <button className="rounded px-2 py-1 text-xs text-rose-300" onClick={() => onChange(undefined)} type="button">{t('structured.remove')}</button>}
            </div>
          </div>
          <div className="flex min-w-0 flex-wrap gap-2">
            {items.map((item, index) => (
              <div className="flex min-w-[10rem] items-center gap-2 rounded bg-slate-950 p-2" key={index}>
                <EditorNode onChange={(next) => onChange(items.map((candidate, candidateIndex) => candidateIndex === index ? next ?? null : candidate))} schema={schema.item} t={t} value={item} />
                <button aria-label={t('structured.removeRow', { index: index + 1 })} className={removeButtonClass} onClick={() => onChange(items.filter((_, candidateIndex) => candidateIndex !== index))} type="button">{t('structured.remove')}</button>
              </div>
            ))}
          </div>
        </section>
      );
    }

    if (listMode === 'table') {
      const itemSchema = resolveSchema(schema.item);
      const columns = schema.columns ?? (itemSchema.kind === 'object' ? Object.keys(itemSchema.fields) : []);
      return (
        <section className="grid gap-2 border-l border-slate-700 pl-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label ? labelText(label, t) : t('structured.items')}</span>
            <div className="flex gap-2">
              <button className={buttonClass} onClick={() => onChange([...items, schema.createItem()])} type="button">+ {t('structured.addRow')}</button>
              {optional && <button className="rounded px-2 py-1 text-xs text-rose-300" onClick={() => onChange(undefined)} type="button">{t('structured.remove')}</button>}
            </div>
          </div>
          {items.length === 0 ? null : (
            <div className="overflow-x-auto overscroll-x-contain">
              <table className="w-full min-w-[32rem] text-sm">
                <thead className="text-xs uppercase text-slate-500">
                  <tr>
                    {columns.map((column) => {
                      const field = itemSchema.kind === 'object' ? itemSchema.fields[column] : undefined;
                      return <th className="px-2 py-1 text-left" key={column}>{labelText(field?.label ?? column, t)}</th>;
                    })}
                    <th className="w-24 px-2 py-1 text-left">{t('structured.remove')}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => {
                    const record = item && typeof item === 'object' && !Array.isArray(item) ? item : {};
                    return (
                      <tr className="border-t border-slate-800 align-top" key={index}>
                        {columns.map((column) => {
                          const field = itemSchema.kind === 'object' ? itemSchema.fields[column] : undefined;
                          return (
                            <td className="px-2 py-2" key={column}>
                              <EditorNode
                                onChange={(next) => onChange(items.map((candidate, candidateIndex) => {
                                  if (candidateIndex !== index) return candidate;
                                  const updated = { ...record };
                                  if (next === undefined) delete updated[column];
                                  else updated[column] = next;
                                  return updated;
                                }))}
                                optional={field?.optional}
                                schema={field?.schema ?? { kind: 'inferred' }}
                                t={t}
                                value={record[column]}
                              />
                            </td>
                          );
                        })}
                        <td className="px-2 py-2"><button aria-label={t('structured.removeRow', { index: index + 1 })} className={removeButtonClass} onClick={() => onChange(items.filter((_, candidateIndex) => candidateIndex !== index))} type="button">{t('structured.remove')}</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      );
    }

    return (
      <section className="grid gap-2 border-l border-slate-700 pl-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label ? labelText(label, t) : t('structured.items')}</span>
          <div className="flex gap-2">
            <button className={buttonClass} onClick={() => onChange([...items, schema.createItem()])} type="button">+ {t('structured.addRow')}</button>
            {optional && <button className="rounded px-2 py-1 text-xs text-rose-300" onClick={() => onChange(undefined)} type="button">{t('structured.remove')}</button>}
          </div>
        </div>
        {items.map((item, index) => (
          <div className="grid grid-cols-[1fr_auto] items-start gap-2 rounded border border-slate-800 bg-slate-900/50 p-2" key={index}>
            <div className="min-w-0 flex-1">
              <EditorNode label={`${t('structured.row')} ${index + 1}`} onChange={(next) => onChange(items.map((candidate, candidateIndex) => candidateIndex === index ? next ?? null : candidate))} schema={schema.item} t={t} value={item} />
            </div>
            <button aria-label={t('structured.removeRow', { index: index + 1 })} className={removeButtonClass} onClick={() => onChange(items.filter((_, candidateIndex) => candidateIndex !== index))} type="button">{t('structured.remove')}</button>
          </div>
        ))}
      </section>
    );
  }

  if (schema.kind === 'object') {
    const record = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const allowedRecord = schema.allowAdditional ? record : Object.fromEntries(Object.entries(record).filter(([key]) => key in schema.fields));
    const fieldNames = Array.from(new Set([...Object.keys(schema.fields), ...(schema.allowAdditional ? Object.keys(record) : [])])).filter((key) => !hiddenKeys.includes(key));
    const updateKey = (key: string, next: StructuredValue | undefined) => {
      const updated = { ...allowedRecord };
      if (next === undefined) delete updated[key];
      else updated[key] = next;
      onChange(updated);
    };
    const renderField = (key: string) => {
      const field = schema.fields[key] ?? { schema: { kind: 'inferred' } as StructuredSchema, optional: true };
      const fieldLabel = field.label ?? key;
      const fieldValue = record[key];

      if (field.optional && fieldValue === undefined) {
        return (
          <div className="grid min-w-0 gap-1 rounded bg-slate-950/60 p-2" key={key}>
            <button className="justify-self-start rounded border border-dashed border-slate-600 px-2 py-1 text-xs text-slate-300" onClick={() => updateKey(key, defaultFor(field))} type="button">+ {labelText(fieldLabel, t)}</button>
          </div>
        );
      }

      return (
        <div className="grid min-w-0 gap-2 rounded bg-slate-950/60 p-2" key={key}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-400">{labelText(fieldLabel, t)}</span>
            {field.optional && <button className="text-xs text-rose-300" onClick={() => updateKey(key, undefined)} type="button">{t('structured.remove')}</button>}
          </div>
          <EditorNode
            onChange={(next) => updateKey(key, next)}
            optional={false}
            schema={field.schema}
            t={t}
            value={fieldValue}
          />
        </div>
      );
    };
    return (
      <section className="grid min-w-0 gap-2">
        {label && (
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{labelText(label, t)}</span>
            {optional && <button className="text-xs text-rose-300" onClick={() => onChange(undefined)} type="button">{t('structured.remove')}</button>}
          </div>
        )}
        {fieldNames.length === 0 && <span className="text-xs text-slate-500">{t('structured.empty')}</span>}
        {fieldNames.map((key) => renderField(key))}
        {schema.allowAdditional && (
          <div className="flex min-w-[14rem] flex-1 gap-2">
            <input className={inputClass} onChange={(event) => setNewField(event.target.value)} placeholder={t('structured.fieldName')} value={newField} />
            <button className="rounded border border-slate-600 px-2 py-1 text-xs" disabled={!newField.trim() || newField in record} onClick={() => { onChange({ ...record, [newField.trim()]: '' }); setNewField(''); }} type="button">{t('structured.addField')}</button>
          </div>
        )}
      </section>
    );
  }

  return (
    <div className="grid min-w-0 flex-1 gap-1">
      {label && <span className="text-xs text-slate-400">{labelText(label, t)}</span>}
      <div className="flex min-w-0 items-center gap-2">
        <PrimitiveEditor accessibleLabel={label ? labelText(label, t) : undefined} onChange={onChange} schema={schema as Extract<StructuredSchema, { kind: 'string' | 'color' | 'number' | 'boolean' | 'enum' }>} value={value} />
        {optional && <button className="text-xs text-rose-300" onClick={() => onChange(undefined)} type="button">{t('structured.remove')}</button>}
      </div>
    </div>
  );
};

export const StructuredDataEditor = (props: EditorProps) => <EditorNode {...props} />;
