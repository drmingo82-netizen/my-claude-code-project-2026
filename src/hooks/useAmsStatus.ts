import { useState, useEffect, useRef } from 'react';

const SERVER_URL =
  (import.meta.env.VITE_PRINTER_SERVER_URL as string | undefined) ?? 'http://localhost:3001';

const POLL_INTERVAL_MS = 60_000;
const FETCH_TIMEOUT_MS = 5_000;

export interface AmsTray {
  slot: number;
  trayIdName: string | null;
  filamentType: string | null;
  colorHex: string | null;
  remainPct: number | null;
}

export interface AmsUnit {
  id: string;
  trays: AmsTray[];
}

export interface PrinterAmsData {
  printerId: string;
  printerName: string;
  connection: 'connected' | 'connecting' | 'disconnected';
  lastUpdated: string | null;
  ams: Record<string, AmsUnit>;
}

export interface UseAmsStatusResult {
  printers: Record<string, PrinterAmsData>;
  lastRefresh: string | null;
  serverOnline: boolean;
  refresh: () => void;
}

export function useAmsStatus(): UseAmsStatusResult {
  const [printers, setPrinters] = useState<Record<string, PrinterAmsData>>({});
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const [serverOnline, setServerOnline] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  async function fetchStatus() {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);

    try {
      const res = await fetch(`${SERVER_URL}/api/ams/status`, { signal: ac.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { printers: Record<string, PrinterAmsData> } = await res.json();
      setPrinters(data.printers ?? {});
      setLastRefresh(new Date().toISOString());
      setServerOnline(true);
    } catch {
      clearTimeout(timer);
      setServerOnline(false);
    }
  }

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => {
      clearInterval(id);
      abortRef.current?.abort();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { printers, lastRefresh, serverOnline, refresh: fetchStatus };
}

/** Flatten all AMS trays for a given printer into a printerId-indexed slot map. */
export function flattenAmsTrays(printer: PrinterAmsData | undefined): Record<number, AmsTray> {
  if (!printer) return {};
  const result: Record<number, AmsTray> = {};
  for (const unit of Object.values(printer.ams)) {
    for (const tray of unit.trays) {
      result[tray.slot] = tray;
    }
  }
  return result;
}
