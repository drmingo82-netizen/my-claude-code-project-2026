import { useState, useEffect } from 'react';
import { useDryingStore } from '../../stores/dryingStore';
import type { FilamentSpool } from '../../types';

// ── Drying reference data ─────────────────────────────────────────────────────

interface DryingPreset {
  minTemp: number;
  maxTemp?: number;
  minHours: number;
  maxHours?: number;
  notes?: string;
}

const PRESETS: Record<string, DryingPreset> = {
  PLA:   { minTemp: 45, maxTemp: 50, minHours: 4, maxHours: 6 },
  PETG:  { minTemp: 65, maxTemp: 70, minHours: 4, maxHours: 6 },
  ABS:   { minTemp: 80,              minHours: 4, maxHours: 6 },
  ASA:   { minTemp: 80,              minHours: 4, maxHours: 6 },
  TPU:   { minTemp: 50, maxTemp: 60, minHours: 4, maxHours: 6 },
  Nylon: { minTemp: 90,              minHours: 12, notes: '12+ hours for best results' },
  PA:    { minTemp: 90,              minHours: 12, notes: '12+ hours for best results' },
  PVA:   { minTemp: 45,              minHours: 4, maxHours: 6 },
};

function getPreset(material: string): DryingPreset | null {
  const m = material.trim();
  if (m.startsWith('PLA')) return PRESETS.PLA;
  if (m.startsWith('PA') || m === 'Nylon') return PRESETS.Nylon;
  return PRESETS[m] ?? null;
}

function tempLabel(p: DryingPreset): string {
  return p.maxTemp ? `${p.minTemp}–${p.maxTemp}°C` : `${p.minTemp}°C`;
}

function durationLabel(p: DryingPreset): string {
  return p.maxHours ? `${p.minHours}–${p.maxHours} hours` : `${p.minHours}+ hours`;
}

// ── Countdown helpers ─────────────────────────────────────────────────────────

function msRemaining(startedAt: string, durationMinutes: number): number {
  const end = new Date(startedAt).getTime() + durationMinutes * 60000;
  return Math.max(0, end - Date.now());
}

function formatCountdown(ms: number): string {
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

// ── Notification helpers ──────────────────────────────────────────────────────

async function requestNotifPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

function sendNotif(spoolLabel: string) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  new Notification('Drying Complete! 🧵', {
    body: `${spoolLabel} has finished drying.`,
    tag: `drying-${spoolLabel}`,
    icon: '/favicon.svg',
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  spool: FilamentSpool;
}

export default function DryingTab({ spool }: Props) {
  const preset = getPreset(spool.material);
  const { activeTimers, sessions, dryers, startTimer, cancelTimer, logSession } = useDryingStore();

  const activeTimer = activeTimers.find((t) => t.spoolId === spool.id);
  const spoolLabel = `${spool.brand} ${spool.material} ${spool.color}`;

  // Timer form state
  const [tempC, setTempC] = useState(preset?.minTemp ?? 60);
  const [hours, setHours] = useState(preset?.minHours ?? 4);
  const [dryerId, setDryerId] = useState('');
  const [notifGranted, setNotifGranted] = useState(
    'Notification' in window && Notification.permission === 'granted',
  );

  // Live countdown state
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!activeTimer) return;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [activeTimer]);

  // Auto-complete when timer hits 0
  const remaining = activeTimer ? msRemaining(activeTimer.startedAt, activeTimer.durationMinutes) : null;
  useEffect(() => {
    if (activeTimer && remaining === 0) {
      sendNotif(activeTimer.spoolLabel);
      logSession(spool.id);
    }
  }, [remaining, activeTimer, spool.id, logSession]);

  // Session history for this spool
  const history = sessions.filter((s) => s.spoolId === spool.id).slice(0, 5);

  async function handleStart() {
    const granted = await requestNotifPermission();
    setNotifGranted(granted);
    startTimer({
      spoolId: spool.id,
      spoolLabel,
      startedAt: new Date().toISOString(),
      durationMinutes: hours * 60,
      tempC,
      dryerId: dryerId || undefined,
    });
  }

  function handleCancel() {
    cancelTimer(spool.id);
  }

  const pct = activeTimer
    ? Math.min(
        100,
        ((activeTimer.durationMinutes * 60000 - (remaining ?? 0)) /
          (activeTimer.durationMinutes * 60000)) *
          100,
      )
    : 0;

  return (
    <div className="space-y-4">
      {/* Reference card */}
      {preset ? (
        <div className="rounded-xl bg-blue-50 border border-blue-100 p-4">
          <p className="text-xs font-semibold text-blue-700 mb-2 uppercase tracking-wide">
            {spool.material} — Recommended Settings
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="text-center bg-white rounded-lg py-3 border border-blue-100">
              <p className="text-2xl font-bold text-[#1e2a3a]">{tempLabel(preset)}</p>
              <p className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-wide">Temperature</p>
            </div>
            <div className="text-center bg-white rounded-lg py-3 border border-blue-100">
              <p className="text-2xl font-bold text-[#1e2a3a]">{durationLabel(preset)}</p>
              <p className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-wide">Duration</p>
            </div>
          </div>
          {preset.notes && (
            <p className="text-xs text-blue-600 mt-2 text-center italic">{preset.notes}</p>
          )}
        </div>
      ) : (
        <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 text-center">
          <p className="text-sm text-slate-500">
            No specific drying data for <span className="font-semibold">{spool.material}</span>.
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Resin and similar materials don't typically require drying.
          </p>
        </div>
      )}

      {/* Active timer */}
      {activeTimer ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <p className="text-sm font-semibold text-slate-700">Drying in progress</p>
            </div>
            <span className="text-xs text-slate-400">{activeTimer.tempC}°C</span>
          </div>

          {/* Countdown */}
          <p className="text-3xl font-bold text-[#1e2a3a] tabular-nums text-center">
            {remaining !== null && remaining > 0 ? formatCountdown(remaining) : '✓ Done!'}
          </p>

          {/* Progress bar */}
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-400 rounded-full transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Started {formatDate(activeTimer.startedAt)}</span>
            <span>{activeTimer.durationMinutes / 60}h total</span>
          </div>

          {!notifGranted && (
            <p className="text-[10px] text-amber-500 text-center">
              Enable browser notifications to get an alert when done.
            </p>
          )}

          <button
            onClick={handleCancel}
            className="w-full py-2 rounded-lg border border-slate-200 text-sm text-slate-500 hover:border-red-200 hover:text-red-500 transition-colors"
          >
            Cancel Timer
          </button>
        </div>
      ) : (
        /* Start drying form */
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
            Start Drying Session
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Temperature (°C)</label>
              <input
                type="number"
                min={20}
                max={200}
                step={5}
                value={tempC}
                onChange={(e) => setTempC(Number(e.target.value))}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#f97316]"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Duration (hours)</label>
              <input
                type="number"
                min={0.5}
                max={48}
                step={0.5}
                value={hours}
                onChange={(e) => setHours(Number(e.target.value))}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#f97316]"
              />
            </div>
          </div>

          {dryers.length > 0 && (
            <div>
              <label className="block text-xs text-slate-500 mb-1">Dryer (optional)</label>
              <select
                value={dryerId}
                onChange={(e) => setDryerId(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#f97316]"
              >
                <option value="">— None selected —</option>
                {dryers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}{d.brand ? ` (${d.brand})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={handleStart}
            className="w-full py-2.5 rounded-lg bg-[#f97316] text-white text-sm font-medium hover:bg-[#ea6d0f] transition-colors"
          >
            Start Drying Timer
          </button>
        </div>
      )}

      {/* Session history */}
      {history.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            Recent Sessions
          </p>
          <div className="space-y-1.5">
            {history.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between text-xs bg-slate-50 rounded-lg px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                  <span className="text-slate-600">{formatDate(s.startedAt)}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-400 shrink-0">
                  <span>{s.tempC}°C</span>
                  <span>·</span>
                  <span>{s.durationMinutes / 60}h</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
