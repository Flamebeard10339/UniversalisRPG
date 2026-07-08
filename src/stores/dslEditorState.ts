// Per-module DSL source drafts for the new text editor (see
// docs/content-dsl-grammar.md and the DSL mod editor plan). Deliberately
// separate from ContributionDraft: every keystroke persists `source` here so
// nothing is lost across a reload, but `lastValidModule` (the thing that
// actually reaches the live game, via ContributionDraft.modules) only
// updates when a compile attempt succeeds — a broken keystroke never
// reaches the live bundle. This is the fix for the crash-loop bug where any
// edit, valid or not, was immediately written into the live-affecting draft.
import { create } from 'zustand';
import type { ContentModule } from '../game/types';
import { load, remove, save } from '../lib/storage';

export type DslModuleDraft = {
  moduleId: string;
  // The on-disk/shipped content as first loaded this session (or '' for a
  // brand-new module) — the diff base for submission packaging. Never
  // updated by further edits within the session.
  baselineSource: string;
  // The current (possibly invalid) editor buffer.
  source: string;
  // The most recent source that compiled+validated cleanly, and its
  // compiled output — undefined until the first successful compile.
  lastValidSource?: string;
  lastValidModule?: ContentModule;
  updatedAt: number;
};

type DslEditorStateStore = {
  drafts: Record<string, DslModuleDraft>;
  hydrate: (moduleId: string) => Promise<void>;
  getDraft: (moduleId: string) => DslModuleDraft | null;
  discardDraft: (moduleId: string) => void;
  openDraft: (moduleId: string, baselineSource: string) => void;
  setSource: (moduleId: string, source: string) => void;
  markValid: (moduleId: string, source: string, module: ContentModule) => void;
  revertToLastValid: (moduleId: string) => void;
};

const storageKey = (moduleId: string) => `universalis:dsl-draft:${moduleId}`;

export const useDslEditorState = create<DslEditorStateStore>((set, get) => ({
  drafts: {},

  hydrate: async (moduleId) => {
    const saved = await load<DslModuleDraft>(storageKey(moduleId));
    if (!saved) return;
    set((state) => ({ drafts: { ...state.drafts, [moduleId]: saved } }));
  },

  getDraft: (moduleId) => get().drafts[moduleId] ?? null,

  // Drops a persisted draft entirely (in-memory + storage) — used to
  // self-heal a draft that was seeded with garbage before a fetch-validation
  // bug was fixed (see fetchModuleDslSource in DslModuleEditor.tsx), so
  // existing users aren't stuck with a bad cached baseline forever.
  discardDraft: (moduleId) => {
    set((state) => {
      const { [moduleId]: _removed, ...rest } = state.drafts;
      return { drafts: rest };
    });
    void remove(storageKey(moduleId));
  },

  // No-op if a draft already exists this session — `baselineSource` must
  // never move once editing has started, or the submission diff would be
  // computed against the wrong starting point.
  openDraft: (moduleId, baselineSource) => {
    if (get().drafts[moduleId]) return;
    const draft: DslModuleDraft = { moduleId, baselineSource, source: baselineSource, updatedAt: Date.now() };
    set((state) => ({ drafts: { ...state.drafts, [moduleId]: draft } }));
    void save(storageKey(moduleId), draft);
  },

  setSource: (moduleId, source) => {
    set((state) => {
      const existing = state.drafts[moduleId];
      if (!existing) return state;
      const next: DslModuleDraft = { ...existing, source, updatedAt: Date.now() };
      void save(storageKey(moduleId), next);
      return { drafts: { ...state.drafts, [moduleId]: next } };
    });
  },

  markValid: (moduleId, source, module) => {
    set((state) => {
      const existing = state.drafts[moduleId];
      if (!existing) return state;
      const next: DslModuleDraft = { ...existing, lastValidSource: source, lastValidModule: module, updatedAt: Date.now() };
      void save(storageKey(moduleId), next);
      return { drafts: { ...state.drafts, [moduleId]: next } };
    });
  },

  revertToLastValid: (moduleId) => {
    set((state) => {
      const existing = state.drafts[moduleId];
      if (!existing || existing.lastValidSource === undefined) return state;
      const next: DslModuleDraft = { ...existing, source: existing.lastValidSource, updatedAt: Date.now() };
      void save(storageKey(moduleId), next);
      return { drafts: { ...state.drafts, [moduleId]: next } };
    });
  },
}));
