import { create } from 'zustand';
import { load, save } from '../lib/storage';

export type DebugLogEntry = {
  id: number;
  timestamp: number;
  action: string;
  details?: Record<string, unknown>;
};

type DebugStateStore = {
  enabled: boolean;
  entries: DebugLogEntry[];
  hydrate: () => Promise<void>;
  setEnabled: (enabled: boolean) => void;
  logAction: (action: string, details?: Record<string, unknown>) => void;
  clear: () => void;
};

const DEBUG_ENABLED_KEY = 'universalis:debug:enabled';
const MAX_LOG_ENTRIES = 200;

export const useDebugState = create<DebugStateStore>((set, get) => ({
  enabled: false,
  entries: [],

  hydrate: async () => {
    const enabled = await load<boolean>(DEBUG_ENABLED_KEY);
    set({ enabled: Boolean(enabled) });
  },

  setEnabled: (enabled) => {
    set({ enabled });
    void save(DEBUG_ENABLED_KEY, enabled);
    if (enabled) {
      get().logAction('debug.enabled');
    }
  },

  logAction: (action, details) => {
    if (!get().enabled) {
      return;
    }

    set((state) => ({
      entries: [
        {
          id: Date.now() + Math.random(),
          timestamp: Date.now(),
          action,
          details,
        },
        ...state.entries,
      ].slice(0, MAX_LOG_ENTRIES),
    }));
  },

  clear: () => set({ entries: [] }),
}));
