import { usePrinterStatus } from '../hooks/usePrinterStatus';
import type { PrinterStatus } from '../hooks/usePrinterStatus';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRemaining(mins: number | null): string {
  if (mins === null || mins <= 0) return '';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatFileName(raw: string | null): string {
  if (!raw) return '';
  // Strip directory prefix and keep the filename
  return raw.split('/').pop() ?? raw;
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m ago`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Dot({ color }: { color: string }) {
  return <span className={`inline-block w-2 h-2 rounded-full ${color} shrink-0`} />;
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
      <div
        className="h-full bg-[#f97316] rounded-full transition-all duration-1000"
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
  );
}

// ── State-specific body panels ────────────────────────────────────────────────

function PrintingBody({ status }: { status: PrinterStatus }) {
  const { printer } = status;
  const remaining = formatRemaining(printer.remainingMinutes);
  const file = formatFileName(printer.currentFile);

  return (
    <div className="space-y-2.5">
      {file && (
        <p className="text-xs text-slate-500 truncate" title={printer.currentFile ?? ''}>
          {file}
        </p>
      )}
      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-slate-500">
            {printer.layerCurrent !== null && printer.layerTotal !== null
              ? `Layer ${printer.layerCurrent} / ${printer.layerTotal}`
              : 'Printing…'}
          </span>
          <span className="font-semibold text-[#f97316]">{printer.progress}%</span>
        </div>
        <ProgressBar pct={printer.progress} />
        {remaining && (
          <p className="text-[10px] text-slate-400 text-right">{remaining} remaining</p>
        )}
      </div>
      {(printer.bedTempC !== null || printer.nozzleTempC !== null) && (
        <div className="flex gap-4 text-[10px] text-slate-400 pt-0.5">
          {printer.bedTempC !== null && <span>Bed {printer.bedTempC.toFixed(0)}°C</span>}
          {printer.nozzleTempC !== null && <span>Nozzle {printer.nozzleTempC.toFixed(0)}°C</span>}
          {printer.wifiSignal && <span className="ml-auto">{printer.wifiSignal}</span>}
        </div>
      )}
    </div>
  );
}

function PausedBody({ status }: { status: PrinterStatus }) {
  const { printer } = status;
  const file = formatFileName(printer.currentFile);

  return (
    <div className="space-y-2.5">
      {file && <p className="text-xs text-slate-500 truncate">{file}</p>}
      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-amber-600 font-medium">Paused</span>
          <span className="font-semibold text-slate-600">{printer.progress}%</span>
        </div>
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-amber-400 rounded-full"
            style={{ width: `${printer.progress}%` }}
          />
        </div>
      </div>
      {printer.layerCurrent !== null && printer.layerTotal !== null && (
        <p className="text-[10px] text-slate-400">
          Layer {printer.layerCurrent} / {printer.layerTotal}
        </p>
      )}
    </div>
  );
}

function FinishBody({ status }: { status: PrinterStatus }) {
  const job = status.lastCompletedJob;
  const file = formatFileName(job?.file ?? status.printer.currentFile);

  return (
    <div className="flex items-start gap-3">
      <div className="text-2xl leading-none">✓</div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-emerald-600">Print complete</p>
        {file && <p className="text-xs text-slate-500 truncate mt-0.5">{file}</p>}
        {job?.completedAt && (
          <p className="text-[10px] text-slate-400 mt-0.5">Finished {timeAgo(job.completedAt)}</p>
        )}
        {job?.filamentUsedG !== null && job?.filamentUsedG !== undefined && (
          <p className="text-[10px] text-slate-400">{job.filamentUsedG}g filament used</p>
        )}
      </div>
    </div>
  );
}

function FailedBody({ status }: { status: PrinterStatus }) {
  const file = formatFileName(status.printer.currentFile);
  return (
    <div className="flex items-start gap-3">
      <div className="text-2xl leading-none">⚠️</div>
      <div>
        <p className="text-xs font-semibold text-red-600">Print failed</p>
        {file && <p className="text-xs text-slate-500 mt-0.5">{file}</p>}
      </div>
    </div>
  );
}

// ── Status badge in header ────────────────────────────────────────────────────

function StatusBadge({ status, serverOnline }: { status: PrinterStatus | null; serverOnline: boolean }) {
  if (!serverOnline)
    return <><Dot color="bg-slate-300" /><span className="text-slate-400">Bridge offline</span></>;

  if (!status || status.connection === 'connecting')
    return <><Dot color="bg-amber-400 animate-pulse" /><span className="text-amber-600">Connecting…</span></>;

  if (status.connection === 'disconnected')
    return <><Dot color="bg-slate-300" /><span className="text-slate-400">Disconnected</span></>;

  const gs = status.printer.gcodeState;
  if (gs === 'RUNNING')
    return <><Dot color="bg-[#f97316] animate-pulse" /><span className="text-[#f97316] font-semibold">Printing {status.printer.progress}%</span></>;
  if (gs === 'PAUSE')
    return <><Dot color="bg-amber-400" /><span className="text-amber-600">Paused</span></>;
  if (gs === 'FINISH')
    return <><Dot color="bg-emerald-500" /><span className="text-emerald-600">Complete</span></>;
  if (gs === 'FAILED')
    return <><Dot color="bg-red-500" /><span className="text-red-600">Error</span></>;
  // IDLE or unknown
  return <><Dot color="bg-emerald-500" /><span className="text-emerald-600">Ready</span></>;
}

// ── Main widget ───────────────────────────────────────────────────────────────

export default function PrinterWidget() {
  const { status, serverOnline, loading } = usePrinterStatus();

  if (loading) return null; // Don't flash an empty card on first load

  const gs = status?.printer.gcodeState;
  const showBody = serverOnline && status && status.connection === 'connected';

  return (
    <div className="bg-[#1e2a3a] rounded-xl p-4 shadow-sm mb-4 text-white">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-base">🖨️</span>
          <span className="text-sm font-semibold">Bambu Lab P1S</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <StatusBadge status={status} serverOnline={serverOnline} />
        </div>
      </div>

      {/* Body */}
      {!serverOnline && (
        <p className="text-xs text-white/40">
          Local bridge not running — start it with{' '}
          <code className="bg-white/10 px-1 py-0.5 rounded text-white/70 text-[10px]">npm start</code>
          {' '}in Tactile-Creations-Server.
        </p>
      )}
      {serverOnline && status?.connection === 'connecting' && (
        <p className="text-xs text-white/40">Reaching printer at configured IP…</p>
      )}
      {serverOnline && status?.connection === 'disconnected' && (
        <p className="text-xs text-white/40">Printer not responding. Check WiFi and access code.</p>
      )}
      {showBody && gs === 'IDLE' && (
        <p className="text-xs text-white/40">Ready to print.</p>
      )}
      {showBody && gs === 'unknown' && (
        <p className="text-xs text-white/40">Waiting for printer data…</p>
      )}
      {showBody && gs === 'RUNNING' && (
        <div className="[&_p]:text-white/70 [&_.text-slate-500]:text-white/50 [&_.text-slate-400]:text-white/40 [&_.bg-slate-100]:bg-white/10">
          <PrintingBody status={status!} />
        </div>
      )}
      {showBody && gs === 'PAUSE' && (
        <div className="[&_p]:text-white/70 [&_.text-slate-400]:text-white/40 [&_.bg-slate-100]:bg-white/10">
          <PausedBody status={status!} />
        </div>
      )}
      {showBody && gs === 'FINISH' && (
        <div className="[&_p]:text-white/70 [&_.text-slate-500]:text-white/50 [&_.text-slate-400]:text-white/40">
          <FinishBody status={status!} />
        </div>
      )}
      {showBody && gs === 'FAILED' && (
        <FailedBody status={status!} />
      )}
    </div>
  );
}
