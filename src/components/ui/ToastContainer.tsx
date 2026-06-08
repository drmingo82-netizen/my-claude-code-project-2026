import { useNotificationStore } from '../../stores/notificationStore';

export default function ToastContainer() {
  const toasts = useNotificationStore((s) => s.toasts);
  const dismiss = useNotificationStore((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[70] flex flex-col gap-2 items-center pointer-events-none w-full max-w-sm px-4 lg:bottom-6">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="bg-[#1e2a3a] text-white text-sm font-medium px-4 py-3 rounded-xl shadow-xl flex items-center gap-3 pointer-events-auto w-full"
        >
          <span className="flex-1">{t.message}</span>
          <button
            onClick={() => dismiss(t.id)}
            className="text-white/40 hover:text-white transition-colors text-lg leading-none shrink-0"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
