import type { PrinterEntry } from '../hooks/usePrinterStatus';

function formatRemaining(mins: number | null): string {
  if (mins === null || mins <= 0) return '';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatFileName(raw: string | null): string {
  if (!raw) return '';
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

function Dot({ color }: { color: string }) {
  return <span className={`inline-block w-2 h-2 rounded-full ${color} shrink-0`} />;
}

function ProgressBar({ pct, color = 'bg-[#f97316]' }: { pct: number; color?: string }) {
  return (
    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
      <div
        className={`h-full ${color} rounded-full transition-all duration-1000`}
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
  );
}

function StatusBadge({ printer, serverOnline }: { printer: PrinterEntry | null; serverOnline: boolean }) {
  if (!serverOnline)
    return <><Dot color="bg-slate-300" /><span className="text-white/40">Bridge offline</span></>;
  if (!printer || printer.connection === 'connecting')
    return <><Dot color="bg-amber-400 animate-pulse" /><span className="text-amber-400">Connecting…</span></>;
  if (printer.connection === 'disconnected')
    return <><Dot color="bg-white/30" /><span className="text-white/40">Disconnected</span></>;

  const gs = printer.printer.gcodeState;
  if (gs === 'RUNNING')
    return <><Dot color="bg-[#f97316] animate-pulse" /><span className="text-[#f97316] font-semibold">Printing {printer.printer.progress}%</span></>;
  if (gs === 'PAUSE')
    return <><Dot color="bg-amber-400" /><span className="text-amber-400">Paused</span></>;
  if (gs === 'FINISH')
    return <><Dot color="bg-emerald-400" /><span className="text-emerald-400">Complete</span></>;
  if (gs === 'FAILED')
    return <><Dot color="bg-red-400" /><span className="text-red-400">Error</span></>;
  return <><Dot color="bg-emerald-400" /><span className="text-emerald-400">Ready</span></>;
}

interface Props {
  printer: PrinterEntry;
  serverOnline: boolean;
}

export default function PrinterWidget({ printer, serverOnline }: Props) {
  const gs        = printer.printer.gcodeState;
  const connected = serverOnline && printer.connection === 'connected';
  const p         = printer.printer;

  return (
    <div className="bg-[#1e2a3a] rounded-xl p-4 shadow-sm text-white">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-base">🖨️</span>
          <span className="text-sm font-semibold">{printer.name}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <StatusBadge printer={printer} serverOnline={serverOnline} />
        </div>
      </div>

      {/* Body */}
      {!serverOnline && (
        <p className="text-xs text-white/40">
          Local bridge not running — start it with{' '}
          <code className="bg-white/10 px-1 py-0.5 rounded text-white/70 text-[10px]">pm2 start ecosystem.config.cjs</code>.
        </p>
      )}
      {serverOnline && printer.connection === 'connecting' && (
        <p className="text-xs text-white/40">Reaching printer at configured IP…</p>
      )}
      {serverOnline && printer.connection === 'disconnected' && (
        <p className="text-xs text-white/40">Printer not responding. Check WiFi and access code.</p>
      )}
      {connected && gs === 'IDLE' && (
        <p className="text-xs text-white/40">Ready to print.</p>
      )}
      {connected && gs === 'unknown' && (
        <p className="text-xs text-white/40">Waiting for printer data…</p>
      )}

      {connected && gs === 'RUNNING' && (
        <div className="space-y-2.5">
          {p.currentFile && (
            <p className="text-xs text-white/60 truncate">{formatFileName(p.currentFile)}</p>
          )}
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-white/50">
                {p.layerCurrent !== null && p.layerTotal !== null
                  ? `Layer ${p.layerCurrent} / ${p.layerTotal}`
                  : 'Printing…'}
              </span>
              <span className="font-semibold text-[#f97316]">{p.progress}%</span>
            </div>
            <ProgressBar pct={p.progress} />
            {formatRemaining(p.remainingMinutes) && (
              <p className="text-[10px] text-white/40 text-right">{formatRemaining(p.remainingMinutes)} remaining</p>
            )}
          </div>
          {(p.bedTempC !== null || p.nozzleTempC !== null) && (
            <div className="flex gap-4 text-[10px] text-white/40 pt-0.5">
              {p.bedTempC    !== null && <span>Bed {p.bedTempC.toFixed(0)}°C</span>}
              {p.nozzleTempC !== null && <span>Nozzle {p.nozzleTempC.toFixed(0)}°C</span>}
              {p.wifiSignal && <span className="ml-auto">{p.wifiSignal}</span>}
            </div>
          )}
        </div>
      )}

      {connected && gs === 'PAUSE' && (
        <div className="space-y-2.5">
          {p.currentFile && <p className="text-xs text-white/60 truncate">{formatFileName(p.currentFile)}</p>}
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-amber-400 font-medium">Paused</span>
              <span className="font-semibold text-white/60">{p.progress}%</span>
            </div>
            <ProgressBar pct={p.progress} color="bg-amber-400" />
          </div>
          {p.layerCurrent !== null && p.layerTotal !== null && (
            <p className="text-[10px] text-white/40">Layer {p.layerCurrent} / {p.layerTotal}</p>
          )}
        </div>
      )}

      {connected && gs === 'FINISH' && (
        <div className="flex items-start gap-3">
          <div className="text-2xl leading-none">✓</div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-emerald-400">Print complete</p>
            {printer.lastCompletedJob?.file && (
              <p className="text-xs text-white/50 truncate mt-0.5">
                {formatFileName(printer.lastCompletedJob.file)}
              </p>
            )}
            {printer.lastCompletedJob?.completedAt && (
              <p className="text-[10px] text-white/40 mt-0.5">
                Finished {timeAgo(printer.lastCompletedJob.completedAt)}
              </p>
            )}
            {printer.lastCompletedJob?.filamentUsedG != null && (
              <p className="text-[10px] text-white/40">
                {printer.lastCompletedJob.filamentUsedG}g filament used
              </p>
            )}
          </div>
        </div>
      )}

      {connected && gs === 'FAILED' && (
        <div className="flex items-start gap-3">
          <div className="text-2xl leading-none">⚠️</div>
          <div>
            <p className="text-xs font-semibold text-red-400">Print failed</p>
            {p.currentFile && <p className="text-xs text-white/50 mt-0.5">{formatFileName(p.currentFile)}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
