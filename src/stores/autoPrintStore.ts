import { create } from 'zustand';

const SERVER_URL =
  (import.meta.env.VITE_PRINTER_SERVER_URL as string | undefined) ?? 'http://localhost:3001';

export interface AutoPrintServerState {
  enabled: boolean;
  printers: Record<string, { ready: boolean }>;
}

interface AutoPrintStore extends AutoPrintServerState {
  hydrate: () => Promise<void>;
  setEnabled: (enabled: boolean) => void;
  markReady: (printerId: string) => void;
  // Applied from the WebSocket 'autoprint' broadcast so all devices stay in sync
  applyServerState: (state: AutoPrintServerState) => void;
}

export const useAutoPrintStore = create<AutoPrintStore>()((set) => ({
  enabled: false,
  printers: {},

  hydrate: async () => {
    try {
      const data: AutoPrintServerState = await fetch(`${SERVER_URL}/api/autoprint`).then(r => r.json());
      set({ enabled: !!data.enabled, printers: data.printers ?? {} });
    } catch {
      /* server offline — leave defaults */
    }
  },

  setEnabled: (enabled) => {
    set({ enabled }); // optimistic; WS broadcast confirms
    fetch(`${SERVER_URL}/api/autoprint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    }).catch(console.error);
  },

  markReady: (printerId) => {
    set(s => ({ printers: { ...s.printers, [printerId]: { ready: true } } })); // optimistic
    fetch(`${SERVER_URL}/api/printers/${printerId}/ready`, { method: 'POST' }).catch(console.error);
  },

  applyServerState: (state) =>
    set({ enabled: !!state.enabled, printers: state.printers ?? {} }),
}));
