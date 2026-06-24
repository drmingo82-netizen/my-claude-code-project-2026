import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import AppLayout from './components/layout/AppLayout';
import Dashboard from './pages/Dashboard';
import Filament from './pages/Filament';
import Products from './pages/Products';
import SKUCatalog from './pages/SKUCatalog';
import Calculator from './pages/Calculator';
import Sales from './pages/Sales';
import Orders from './pages/Orders';
import BulkLabels from './pages/BulkLabels';
import Locations from './pages/Locations';
import Colors from './pages/Colors';
import Hardware from './pages/Hardware';
import Settings from './pages/Settings';
import ScanLanding from './pages/ScanLanding';
import FilamentDebug from './pages/FilamentDebug';
import PrintQueue from './pages/PrintQueue';
import { useDryingStore } from './stores/dryingStore';
import { useFilamentStore } from './stores/filamentStore';
import { useQueueStore } from './stores/queueStore';
import { useAutoPrintStore } from './stores/autoPrintStore';
import { useJobTracker } from './hooks/useJobTracker';
import ToastContainer from './components/ui/ToastContainer';

// Runs globally so timers fire notifications even when user navigates away from Drying tab
function TimerWatcher() {
  useEffect(() => {
    function check() {
      const { activeTimers, logSession } = useDryingStore.getState();
      for (const timer of activeTimers) {
        const end = new Date(timer.startedAt).getTime() + timer.durationMinutes * 60000;
        if (Date.now() >= end) {
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('Drying Complete! 🧵', {
              body: `${timer.spoolLabel} has finished drying.`,
              tag: `drying-${timer.spoolId}`,
              icon: '/favicon.svg',
            });
          }
          logSession(timer.spoolId);
        }
      }
    }
    check(); // catch timers that fired while app was closed
    const id = setInterval(check, 10_000);
    return () => clearInterval(id);
  }, []);
  return null;
}

// Fetches filament inventory from the bridge server on app load so all devices share the same data
function FilamentSync() {
  const hydrate = useFilamentStore(s => s.hydrate);
  useEffect(() => { hydrate(); }, [hydrate]);
  return null;
}

// Fetches print queue from the bridge server on app load
function QueueSync() {
  const hydrate = useQueueStore(s => s.hydrate);
  useEffect(() => { hydrate(); }, [hydrate]);
  return null;
}

// Fetches AutoPrint state (global toggle + per-printer ready gates) on app load
function AutoPrintSync() {
  const hydrate = useAutoPrintStore(s => s.hydrate);
  useEffect(() => { hydrate(); }, [hydrate]);
  return null;
}

// Runs globally — watches printer gcodeState transitions and drives auto-deduction
function JobTracker() {
  useJobTracker();
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <TimerWatcher />
      <FilamentSync />
      <QueueSync />
      <AutoPrintSync />
      <JobTracker />
      <ToastContainer />
      <Routes>
        {/* Scan landing — no nav chrome, opened directly from QR codes on phones */}
        <Route path="scan" element={<ScanLanding />} />
        {/* Dev-only: filament calc debugger — drop a .3mf to verify gram math */}
        <Route path="dev/filament-debug" element={<FilamentDebug />} />
        <Route element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="orders" element={<Orders />} />
          <Route path="filament" element={<Filament />} />
          <Route path="products" element={<Products />} />
          <Route path="skus" element={<SKUCatalog />} />
          <Route path="sales" element={<Sales />} />
          <Route path="calculator" element={<Calculator />} />
          <Route path="bulk-labels" element={<BulkLabels />} />
          <Route path="locations" element={<Locations />} />
          <Route path="colors" element={<Colors />} />
          <Route path="hardware" element={<Hardware />} />
          <Route path="queue" element={<PrintQueue />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
