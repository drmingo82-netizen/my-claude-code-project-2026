import { useState } from 'react';
import Modal from '../ui/Modal';
import FormField from '../ui/FormField';
import type { FilamentSpool } from '../../types';

interface Props {
  spool: FilamentSpool;
  onSave: (newWeightG: number, note: string) => void;
  onClose: () => void;
}

export default function AdjustWeightModal({ spool, onSave, onClose }: Props) {
  const [newWeight, setNewWeight] = useState(spool.weightRemainingG.toString());
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const parsed = parseFloat(newWeight);
  const delta = isNaN(parsed) ? 0 : spool.weightRemainingG - parsed;

  function handleSave() {
    if (isNaN(parsed) || parsed < 0) {
      setError('Enter a valid weight in grams (0 or more)');
      return;
    }
    if (parsed > spool.weightTotalG) {
      setError(`Cannot exceed total spool weight (${spool.weightTotalG}g)`);
      return;
    }
    onSave(parsed, note.trim());
  }

  return (
    <Modal
      title={`Adjust Weight — ${spool.brand} ${spool.material} ${spool.color}`}
      onClose={onClose}
    >
      <div className="space-y-4">
        <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-600 flex justify-between">
          <span>Current remaining</span>
          <span className="font-semibold">{spool.weightRemainingG}g</span>
        </div>

        <FormField
          label="New remaining weight (g)"
          type="number"
          min={0}
          max={spool.weightTotalG}
          step={0.1}
          value={newWeight}
          onChange={(e) => {
            setNewWeight((e.target as HTMLInputElement).value);
            setError('');
          }}
          error={error}
        />

        {!isNaN(parsed) && parsed !== spool.weightRemainingG && (
          <p className={`text-xs font-medium -mt-1 ${delta > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
            {delta > 0
              ? `−${delta.toFixed(1)}g reduction`
              : `+${Math.abs(delta).toFixed(1)}g correction upward`}
          </p>
        )}

        <FormField
          label="Note (optional)"
          value={note}
          onChange={(e) => setNote((e.target as HTMLInputElement).value)}
          placeholder={`"Weighed on scale", "Purged 20g", etc.`}
        />

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex-1 py-2.5 rounded-lg bg-[#f97316] text-white text-sm font-medium hover:bg-[#ea6d0f] transition-colors"
          >
            Save Adjustment
          </button>
        </div>
      </div>
    </Modal>
  );
}
