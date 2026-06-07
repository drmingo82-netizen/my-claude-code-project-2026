import { useState } from 'react';
import { useLocationStore } from '../stores/locationStore';
import { useFilamentStore } from '../stores/filamentStore';
import type { StorageLocation, LocationType } from '../types';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import FormField from '../components/ui/FormField';

const LOCATION_TYPES: LocationType[] = ['AMS', 'Shelf', 'Drawer', 'Dryer', 'Box', 'Other'];

const TYPE_ICONS: Record<LocationType, string> = {
  AMS: '🖨️',
  Shelf: '📚',
  Drawer: '🗄️',
  Dryer: '🌡️',
  Box: '📦',
  Other: '📍',
};

// ── Form ──────────────────────────────────────────────────────────────────────

type FormData = Omit<StorageLocation, 'id'>;

const emptyForm = (): FormData => ({
  name: '',
  type: 'Shelf',
  notes: '',
  maxCapacity: undefined,
});

function validate(f: FormData): Partial<Record<keyof FormData, string>> {
  const e: Partial<Record<keyof FormData, string>> = {};
  if (!f.name.trim()) e.name = 'Required';
  if (f.maxCapacity !== undefined && f.maxCapacity < 1) e.maxCapacity = 'Must be ≥ 1';
  return e;
}

interface LocationFormProps {
  initial: FormData;
  onSave: (data: FormData) => void;
  onClose: () => void;
}

function LocationForm({ initial, onSave, onClose }: LocationFormProps) {
  const [form, setForm] = useState<FormData>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});

  const set = <K extends keyof FormData>(key: K, value: FormData[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate(form);
    if (Object.keys(errs).length) { setErrors(errs); return; }
    onSave(form);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <FormField
        label="Location Name"
        value={form.name}
        onChange={(e) => set('name', (e.target as HTMLInputElement).value)}
        placeholder="e.g. AMS Slot 1, Shelf A, Filament Dryer"
        error={errors.name}
      />

      <FormField
        as="select"
        label="Location Type"
        value={form.type}
        onChange={(e) => set('type', (e.target as HTMLSelectElement).value as LocationType)}
        options={LOCATION_TYPES.map((t) => ({ value: t, label: `${TYPE_ICONS[t]} ${t}` }))}
      />

      <FormField
        label="Max Capacity (spools, optional)"
        type="number"
        min={1}
        step={1}
        value={form.maxCapacity ?? ''}
        onChange={(e) => {
          const v = (e.target as HTMLInputElement).value;
          set('maxCapacity', v === '' ? undefined : Math.max(1, Math.round(Number(v))));
        }}
        placeholder="Leave blank for unlimited"
        error={errors.maxCapacity}
      />

      <FormField
        as="textarea"
        label="Notes (optional)"
        value={form.notes ?? ''}
        onChange={(e) => set('notes', (e.target as HTMLTextAreaElement).value)}
        placeholder="Any notes about this location…"
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
          type="submit"
          className="flex-1 py-2.5 rounded-lg bg-[#f97316] text-white text-sm font-medium hover:bg-[#ea6d0f] transition-colors"
        >
          Save Location
        </button>
      </div>
    </form>
  );
}

// ── Capacity bar ──────────────────────────────────────────────────────────────

function CapacityBar({ count, max }: { count: number; max: number }) {
  const pct = Math.min((count / max) * 100, 100);
  const color = pct >= 100 ? 'bg-red-400' : pct >= 80 ? 'bg-amber-400' : 'bg-emerald-400';
  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`${color} h-full rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-500 shrink-0">
        {count}/{max}
      </span>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Locations() {
  const locations = useLocationStore((s) => s.locations);
  const { addLocation, updateLocation, deleteLocation } = useLocationStore();
  const spools = useFilamentStore((s) => s.spools);
  const clearLocationFromSpools = useFilamentStore((s) => s.clearLocationFromSpools);

  const [modal, setModal] = useState<'add' | { loc: StorageLocation } | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  function spoolCount(locationId: string) {
    return spools.filter((s) => s.locationId === locationId).length;
  }

  function handleSave(data: FormData) {
    if (modal === 'add') {
      addLocation(data);
    } else if (modal && typeof modal === 'object') {
      updateLocation((modal as { loc: StorageLocation }).loc.id, data);
    }
    setModal(null);
  }

  function handleDelete(id: string) {
    clearLocationFromSpools(id);
    deleteLocation(id);
    setDeleteId(null);
  }

  // Summary stats
  const totalCapacity = locations.reduce((sum, l) => sum + (l.maxCapacity ?? 0), 0);
  const assignedCount = spools.filter((s) => s.locationId).length;

  return (
    <div className="p-4 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="hidden lg:block text-xl font-bold text-[#1e2a3a]">My Locations</h1>
          <p className="text-xs text-slate-400 lg:mt-0.5">
            {locations.length} location{locations.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => setModal('add')}
          className="bg-[#f97316] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#ea6d0f] transition-colors"
        >
          + Add Location
        </button>
      </div>

      {/* Summary cards */}
      {locations.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="bg-white rounded-xl p-3 border border-slate-100 shadow-sm text-center">
            <p className="text-xs text-slate-400 mb-0.5">Locations</p>
            <p className="text-lg font-bold text-[#1e2a3a]">{locations.length}</p>
          </div>
          <div className="bg-white rounded-xl p-3 border border-slate-100 shadow-sm text-center">
            <p className="text-xs text-slate-400 mb-0.5">Total Capacity</p>
            <p className="text-lg font-bold text-[#1e2a3a]">
              {totalCapacity > 0 ? `${totalCapacity} spools` : '—'}
            </p>
          </div>
          <div className="bg-white rounded-xl p-3 border border-slate-100 shadow-sm text-center">
            <p className="text-xs text-slate-400 mb-0.5">Spools Assigned</p>
            <p className="text-lg font-bold text-[#1e2a3a]">{assignedCount}</p>
          </div>
        </div>
      )}

      {/* Locations table / empty state */}
      {locations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-xl border border-slate-100">
          <div className="text-4xl mb-3">📍</div>
          <p className="text-sm font-medium text-slate-600 mb-1">No storage locations yet</p>
          <p className="text-xs text-slate-400 mb-4">
            Add locations like AMS slots, shelves, or dryers to organize your filament.
          </p>
          <button
            onClick={() => setModal('add')}
            className="bg-[#f97316] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#ea6d0f] transition-colors"
          >
            + Add Location
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {['Name', 'Type', 'Spools', 'Capacity', 'Notes', ''].map((h) => (
                    <th
                      key={h}
                      className="text-left text-xs font-semibold text-slate-500 px-4 py-3 whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {locations.map((loc) => {
                  const count = spoolCount(loc.id);
                  const isFull = loc.maxCapacity !== undefined && count >= loc.maxCapacity;
                  return (
                    <tr
                      key={loc.id}
                      className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
                        {loc.name}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 bg-[#1e2a3a]/8 text-[#1e2a3a] text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap">
                          {TYPE_ICONS[loc.type]} {loc.type}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-sm font-semibold ${isFull ? 'text-red-600' : 'text-slate-700'}`}>
                            {count}
                          </span>
                          {isFull && (
                            <span className="text-[10px] font-medium text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full">
                              Full
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {loc.maxCapacity !== undefined ? (
                          <CapacityBar count={count} max={loc.maxCapacity} />
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs max-w-[200px]">
                        <span className="truncate block">{loc.notes || '—'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setModal({ loc })}
                            className="text-xs text-[#f97316] hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setDeleteId(loc.id)}
                            className="text-xs text-slate-400 hover:text-red-500 transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Edit modal */}
      {modal !== null && (
        <Modal
          title={modal === 'add' ? 'Add Location' : `Edit — ${(modal as { loc: StorageLocation }).loc.name}`}
          onClose={() => setModal(null)}
        >
          <LocationForm
            initial={
              modal === 'add'
                ? emptyForm()
                : {
                    name: (modal as { loc: StorageLocation }).loc.name,
                    type: (modal as { loc: StorageLocation }).loc.type,
                    notes: (modal as { loc: StorageLocation }).loc.notes ?? '',
                    maxCapacity: (modal as { loc: StorageLocation }).loc.maxCapacity,
                  }
            }
            onSave={handleSave}
            onClose={() => setModal(null)}
          />
        </Modal>
      )}

      {/* Delete confirm */}
      {deleteId && (() => {
        const count = spoolCount(deleteId);
        return (
          <ConfirmDialog
            message={
              count > 0
                ? `Delete this location? ${count} spool${count !== 1 ? 's' : ''} will be unassigned.`
                : 'Delete this location? This cannot be undone.'
            }
            onConfirm={() => handleDelete(deleteId)}
            onCancel={() => setDeleteId(null)}
          />
        );
      })()}
    </div>
  );
}
