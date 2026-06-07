import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import AppLayout from './components/layout/AppLayout';
import Dashboard from './pages/Dashboard';
import Filament from './pages/Filament';
import Products from './pages/Products';
import Calculator from './pages/Calculator';
import Sales from './pages/Sales';
import Orders from './pages/Orders';
import BulkLabels from './pages/BulkLabels';
import Locations from './pages/Locations';
import Colors from './pages/Colors';
import Hardware from './pages/Hardware';
import { useDryingStore } from './stores/dryingStore';

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

export default function App() {
  return (
    <BrowserRouter>
      <TimerWatcher />
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="orders" element={<Orders />} />
          <Route path="filament" element={<Filament />} />
          <Route path="products" element={<Products />} />
          <Route path="sales" element={<Sales />} />
          <Route path="calculator" element={<Calculator />} />
          <Route path="bulk-labels" element={<BulkLabels />} />
          <Route path="locations" element={<Locations />} />
          <Route path="colors" element={<Colors />} />
          <Route path="hardware" element={<Hardware />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
