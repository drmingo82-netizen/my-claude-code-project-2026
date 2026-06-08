import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { UsageHistoryRecord } from '../types';

interface UsageHistoryStore {
  records: UsageHistoryRecord[];
  addRecord: (record: UsageHistoryRecord) => void;
  clearHistory: () => void;
}

export const useUsageHistoryStore = create<UsageHistoryStore>()(
  persist(
    (set) => ({
      records: [],
      addRecord: (record) =>
        set((s) => ({ records: [record, ...s.records] })),
      clearHistory: () => set({ records: [] }),
    }),
    {
      name: 'tactile-usage-history',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
