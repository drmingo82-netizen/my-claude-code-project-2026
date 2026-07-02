import { useEffect, type ReactNode } from 'react';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export default function Modal({ title, onClose, children }: ModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      {/* Full-height on phones (iOS Safari chrome makes vh unreliable — dvh + internal scroll instead);
          desktop keeps the compact 90dvh cap. */}
      <div className="relative bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-xl flex flex-col max-h-[100dvh] md:max-h-[90dvh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <h2 className="text-base font-semibold text-[#1e2a3a]">{title}</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-xl leading-none p-1 -mr-1"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        {/* Scroll body. min-h-0 lets this flex child actually shrink/scroll (esp. with the iOS
            keyboard up); overscroll-contain stops scroll chaining to the page behind the modal. */}
        <div className="overflow-y-auto overscroll-contain p-5 flex-1 min-h-0">{children}</div>
      </div>
    </div>
  );
}

/**
 * Sticky action footer for modal forms. Render it as the LAST child of the modal body (inside the
 * form / children) so it is a descendant of the scrolling element — that's what lets `sticky
 * bottom-0` pin it above the fold no matter how long the form is.
 *
 * - `-mx-5 -mb-5` cancels the body's p-5 so the bar is full-bleed and flush to the bottom edge.
 * - opaque `bg-white` + `z-10` keep scrolling form content from painting over/through it.
 * - safe-area padding is ADDITIVE (base 1rem + inset) so buttons keep their padding everywhere and
 *   also clear the iPhone home indicator.
 */
export function ModalFooter({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-5 -mb-5 border-t border-slate-100 bg-white px-5 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
      {children}
    </div>
  );
}
