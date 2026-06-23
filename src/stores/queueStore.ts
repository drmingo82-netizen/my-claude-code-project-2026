import { create } from 'zustand';
import type { PrintQueueItem } from '../types';

const SERVER_URL =
  (import.meta.env.VITE_PRINTER_SERVER_URL as string | undefined) ?? 'http://localhost:3001';

const api = {
  get: () => fetch(`${SERVER_URL}/api/queue`).then(r => r.json()),
  add: (item: Omit<PrintQueueItem, 'id' | 'createdAt'>) =>
    fetch(`${SERVER_URL}/api/queue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    }),
  update: (id: string, attrs: Partial<PrintQueueItem>) =>
    fetch(`${SERVER_URL}/api/queue/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(attrs),
    }),
  remove: (id: string) => fetch(`${SERVER_URL}/api/queue/${id}`, { method: 'DELETE' }),
  reorder: (ids: string[]) =>
    fetch(`${SERVER_URL}/api/queue/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    }),
  dispatch: (id: string) =>
    fetch(`${SERVER_URL}/api/queue/${id}/dispatch`, { method: 'POST' }).then(r => r.json()),
};

function byPriorityThenDate(a: PrintQueueItem, b: PrintQueueItem) {
  if (a.priority !== b.priority) return a.priority - b.priority;
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}

interface QueueStore {
  items: PrintQueueItem[];
  serverReachable: boolean;
  isHydrated: boolean;
  hydrate: () => Promise<void>;
  addItem: (item: Omit<PrintQueueItem, 'id' | 'createdAt'>) => void;
  updateItem: (id: string, attrs: Partial<PrintQueueItem>) => void;
  deleteItem: (id: string) => void;
  moveUp: (id: string) => void;
  moveDown: (id: string) => void;
  dispatch: (id: string) => Promise<{ ok: boolean; error?: string }>;
}

export const useQueueStore = create<QueueStore>()((set, get) => ({
  items: [],
  serverReachable: true,
  isHydrated: false,

  hydrate: async () => {
    try {
      const data = await api.get();
      const items: PrintQueueItem[] = Array.isArray(data.items) ? data.items : [];
      set({ items, serverReachable: true, isHydrated: true });
    } catch {
      set({ serverReachable: false, isHydrated: true });
    }
  },

  addItem: (item) => {
    const tempId = crypto.randomUUID();
    const optimistic: PrintQueueItem = {
      ...item,
      id: tempId,
      createdAt: new Date().toISOString(),
    };
    set(s => ({ items: [...s.items, optimistic].sort(byPriorityThenDate) }));
    // The server assigns its own id; swap our temp id for it so dispatch can find the item
    api.add(item)
      .then(r => r.json())
      .then((saved: PrintQueueItem) => {
        if (saved?.id) {
          set(s => ({ items: s.items.map(i => (i.id === tempId ? saved : i)).sort(byPriorityThenDate) }));
        }
      })
      .catch(console.error);
  },

  updateItem: (id, attrs) => {
    set(s => ({ items: s.items.map(i => i.id === id ? { ...i, ...attrs } : i) }));
    api.update(id, attrs).catch(console.error);
  },

  deleteItem: (id) => {
    set(s => ({ items: s.items.filter(i => i.id !== id) }));
    api.remove(id).catch(console.error);
  },

  moveUp: (id) => {
    const { items } = get();
    const idx = items.findIndex(i => i.id === id);
    if (idx <= 0) return;
    const next = [...items];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    const reordered = next.map((item, i) => ({ ...item, priority: i + 1 }));
    set({ items: reordered });
    api.reorder(reordered.map(i => i.id)).catch(console.error);
  },

  moveDown: (id) => {
    const { items } = get();
    const idx = items.findIndex(i => i.id === id);
    if (idx === -1 || idx >= items.length - 1) return;
    const next = [...items];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    const reordered = next.map((item, i) => ({ ...item, priority: i + 1 }));
    set({ items: reordered });
    api.reorder(reordered.map(i => i.id)).catch(console.error);
  },

  dispatch: async (id) => {
    try {
      const result = await api.dispatch(id);
      if (result.ok && result.item) {
        set(s => ({
          items: s.items.map(i => i.id === id ? result.item : i),
        }));
      }
      return result;
    } catch {
      return { ok: false, error: 'Network error' };
    }
  },
}));

// WebSocket — subscribe once on module load; updates items live on queue events
const wsUrl = SERVER_URL.replace(/^http/, 'ws') + '/ws';

function connectWS() {
  const ws = new WebSocket(wsUrl);

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'queue' && Array.isArray(msg.items)) {
        useQueueStore.setState({ items: msg.items.sort(byPriorityThenDate), serverReachable: true });
      }
    } catch { /* ignore malformed messages */ }
  };

  ws.onclose = () => {
    // Reconnect after a delay — bridge might have restarted
    setTimeout(connectWS, 5000);
  };
}

connectWS();
