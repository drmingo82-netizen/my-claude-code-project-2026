import { useState, useEffect, useRef } from 'react';

const SERVER_URL = (import.meta.env.VITE_PRINTER_SERVER_URL as string | undefined) ?? 'http://localhost:3001';
const POLL_INTERVAL_MS = 5_000;
const FETCH_TIMEOUT_MS = 4_000;

export interface PrinterState {
  gcodeState: 'IDLE' | 'RUNNING' | 'PAUSE' | 'FAILED' | 'FINISH' | 'unknown' | '';
  progress: number;
  remainingMinutes: number | null;
  currentFile: string | null;
  layerCurrent: number | null;
  layerTotal: number | null;
  bedTempC: number | null;
  nozzleTempC: number | null;
  wifiSignal: string | null;
  speedLevel: number | null;
}

export interface CompletedJob {
  file: string | null;
  completedAt: string;
  printTimeMinutes: number | null;
  amsSlot: number | null;
  filamentUsedG: number | null;
}

export interface PrinterEntry {
  id: string;
  name: string;
  connection: 'disconnected' | 'connecting' | 'connected';
  printer: PrinterState;
  lastUpdated: string | null;
  lastCompletedJob: CompletedJob | null;
}

export interface UsePrinterStatusResult {
  printers: PrinterEntry[];
  serverOnline: boolean;
  loading: boolean;
}

export function usePrinterStatus(): UsePrinterStatusResult {
  const [printers, setPrinters]         = useState<PrinterEntry[]>([]);
  const [serverOnline, setServerOnline] = useState(false);
  const [loading, setLoading]           = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    async function poll() {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
      try {
        const res = await fetch(`${SERVER_URL}/api/status`, { signal: ac.signal });
        clearTimeout(timer);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: { printers: Record<string, PrinterEntry> } = await res.json();
        setPrinters(Object.values(data.printers));
        setServerOnline(true);
      } catch {
        clearTimeout(timer);
        setServerOnline(false);
      } finally {
        setLoading(false);
      }
    }

    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      clearInterval(id);
      abortRef.current?.abort();
    };
  }, []);

  return { printers, serverOnline, loading };
}

/**
 * Tell the server the completed job for a specific printer has been processed.
 */
export async function acknowledgeJob(printerId: string): Promise<void> {
  try {
    await fetch(`${SERVER_URL}/api/job/acknowledge?printer=${encodeURIComponent(printerId)}`, {
      method: 'POST',
    });
  } catch {
    // server offline — nothing to acknowledge
  }
}
