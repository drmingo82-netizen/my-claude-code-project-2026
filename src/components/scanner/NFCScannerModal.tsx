import { useNavigate } from 'react-router-dom';

interface NFCScannerModalProps {
  onClose: () => void;
}

export function NFCScannerModal({ onClose }: NFCScannerModalProps) {
  const navigate = useNavigate();

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white w-full rounded-t-2xl p-5 pb-safe-or-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-violet-100 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
              </svg>
            </span>
            <p className="text-base font-semibold text-[#1e2a3a]">NFC on iPhone</p>
          </div>
          <button onClick={onClose} className="text-slate-400 text-xl p-1">×</button>
        </div>

        <div className="bg-violet-50 rounded-xl p-4 space-y-2">
          <p className="text-sm font-medium text-violet-900">How iPhone NFC works</p>
          <p className="text-xs text-violet-700 leading-relaxed">
            iPhone reads NFC tags automatically — just hold your phone near the tag and iOS opens the link in Safari.
            No app needed to <span className="font-semibold">read</span> tags.
          </p>
          <p className="text-xs text-violet-700 leading-relaxed">
            To <span className="font-semibold">write</span> a tag, use the free NFC Tools app.
            Go to your spool in the Filament Inventory and tap <span className="font-semibold">Write NFC Tag</span>.
          </p>
        </div>

        <button
          onClick={() => { onClose(); navigate('/filament?writeNFC=true'); }}
          className="w-full py-4 rounded-2xl bg-violet-600 text-white font-semibold text-sm active:scale-[0.98]"
        >
          Write a Tag
        </button>
        <button
          onClick={onClose}
          className="w-full py-3 rounded-2xl border border-slate-200 text-slate-600 font-medium text-sm"
        >
          Close
        </button>
      </div>
    </div>
  );
}
