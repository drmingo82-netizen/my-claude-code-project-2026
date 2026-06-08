import { useCallback, useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

export type ScannerState = 'idle' | 'starting' | 'scanning' | 'stopping' | 'error';
export type PermissionState = 'unknown' | 'granted' | 'denied' | 'no-camera';

interface UseQRScannerOptions {
  onResult: (result: string) => void;
  elementId?: string;
}

interface UseQRScannerReturn {
  start: () => void;
  stop: () => Promise<void>;
  state: ScannerState;
  permission: PermissionState;
  error: string | null;
}

export function useQRScanner({
  onResult,
  elementId = 'qr-reader',
}: UseQRScannerOptions): UseQRScannerReturn {
  const [state, setState] = useState<ScannerState>('idle');
  const [permission, setPermission] = useState<PermissionState>('unknown');
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const mountedRef = useRef(true);
  const onResultRef = useRef(onResult);
  useEffect(() => { onResultRef.current = onResult; }, [onResult]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const stop = useCallback(async () => {
    if (!scannerRef.current) return;
    setState('stopping');
    try {
      if (scannerRef.current.isScanning) {
        await scannerRef.current.stop();
      }
      scannerRef.current.clear();
    } catch {
      // stop errors are expected when scanner never fully started
    }
    scannerRef.current = null;
    if (mountedRef.current) setState('idle');
  }, []);

  const start = useCallback(() => {
    setState('starting');
    setError(null);

    const el = document.getElementById(elementId);
    if (!el) {
      setState('error');
      setError('Scanner element not found');
      return;
    }

    const scanner = new Html5Qrcode(elementId, { verbose: false });
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          if (mountedRef.current) onResultRef.current(decodedText);
        },
        () => {
          // Per-frame "no QR found" errors — intentionally ignored
        },
      )
      .then(() => {
        if (mountedRef.current) {
          setPermission('granted');
          setState('scanning');
        }
      })
      .catch((err: unknown) => {
        if (!mountedRef.current) return;
        const msg = err instanceof Error ? err.message : String(err);
        const lower = msg.toLowerCase();
        if (
          lower.includes('permission') ||
          lower.includes('notallowed') ||
          lower.includes('denied')
        ) {
          setPermission('denied');
          setError('camera-denied');
        } else if (
          lower.includes('notfound') ||
          lower.includes('no camera') ||
          lower.includes('devicenotfound')
        ) {
          setPermission('no-camera');
          setError('no-camera');
        } else {
          setError(msg);
        }
        setState('error');
        scannerRef.current = null;
      });
  }, [elementId]);

  useEffect(() => {
    return () => { stop(); };
  }, [stop]);

  return { start, stop, state, permission, error };
}
