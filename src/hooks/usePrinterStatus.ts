import { useState, useEffect, useRef } from 'react';

const SERVER_URL = (import.meta.env.VITE_PRINTER_SERVER_URL as string | undefined) ?? 'http://localhost:3001';
const POLL_INTERVAL_MS = 5_000;
const FETCH_TIMEOUT_MS = 4_000;

export interface PrinterState {
  gcodeState: 'IDLE' | 'RUNNING' | 'PAUSE' | 'FAILED' | 'FINISH' | 'unknown';
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

export interface PrinterStatus {
  connection: 'disconnected' | 'connecting' | 'connected';
  printer: PrinterState;
  lastUpdated: string | null;
  lastCompletedJob: CompletedJob | null;
}

export interface UsePrinterStatusResult {
  status: PrinterStatus | null;
  serverOnline: boolean;
  loading: boolean;
}

export function usePrinterStatus(): UsePrinterStatusResult {
  const [status, setStatus]           = useState<PrinterStatus | null>(null);
  const [serverOnline, setServerOnline] = useState(false);
  const [loading, setLoading]         = useState(true);
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
        const data: PrinterStatus = await res.json();
        setStatus(data);
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

  return { status, serverOnline, loading };
}
