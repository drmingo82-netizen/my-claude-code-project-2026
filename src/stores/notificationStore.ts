import { create } from 'zustand';

interface Toast {
  id: string;
  message: string;
}

interface NotificationStore {
  toasts: Toast[];
  addToast: (message: string, durationMs?: number) => void;
  dismissToast: (id: string) => void;
}

export const useNotificationStore = create<NotificationStore>()((set) => ({
  toasts: [],

  addToast: (message, durationMs = 5000) => {
    const id = crypto.randomUUID();
    set((s) => ({ toasts: [...s.toasts, { id, message }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, durationMs);
  },

  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
