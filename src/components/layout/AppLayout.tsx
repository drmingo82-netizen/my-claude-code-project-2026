import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useState } from 'react';
import QRScannerModal from '../scanner/QRScannerModal';

const navItems = [
  { to: '/', label: 'Dashboard', icon: '📊' },
  { to: '/orders', label: 'Orders', icon: '📦' },
  { to: '/filament', label: 'Filament', icon: '🧵' },
  { to: '/locations', label: 'Locations', icon: '📍' },
  { to: '/colors', label: 'Colors', icon: '🎨' },
  { to: '/hardware', label: 'Hardware', icon: '🌡️' },
  { to: '/products', label: 'Products', icon: '🖨️' },
  { to: '/sales', label: 'Sales', icon: '💰' },
  { to: '/calculator', label: 'Calculator', icon: '🧮' },
];

function NavItem({ to, label, icon }: { to: string; label: string; icon: string }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      style={{ touchAction: 'manipulation' }}
      className={({ isActive }) =>
        [
          'flex flex-col items-center gap-0.5 px-3 py-2 rounded-lg font-medium transition-colors',
          isActive
            ? 'text-[#f97316] bg-orange-50'
            : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100',
        ].join(' ')
      }
    >
      <span className="text-xl leading-none">{icon}</span>
      <span className="text-[10px] leading-none">{label}</span>
    </NavLink>
  );
}

function MobileHeader({ onScanClick }: { onScanClick: () => void }) {
  const { pathname } = useLocation();
  const current = navItems.find((n) =>
    n.to === '/' ? pathname === '/' : pathname.startsWith(n.to)
  );

  return (
    <header className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-[#1e2a3a] text-white flex items-center gap-3 px-4 h-14 shrink-0">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f97316] text-white text-sm font-bold leading-none shrink-0">
        TC
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[9px] uppercase tracking-widest text-white/40 leading-none mb-0.5">
          Tactile Creations
        </p>
        <p className="text-sm font-semibold leading-none truncate">
          {current?.label ?? 'App'}
        </p>
      </div>
      <button
        onClick={onScanClick}
        aria-label="Scan QR code"
        className="flex items-center justify-center w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors text-lg"
      >
        📷
      </button>
    </header>
  );
}

export default function AppLayout() {
  const [showScanner, setShowScanner] = useState(false);

  return (
    <div className="flex flex-col min-h-dvh lg:flex-row">
      {/* Mobile top header */}
      <MobileHeader onScanClick={() => setShowScanner(true)} />

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-56 bg-[#1e2a3a] text-white shrink-0 min-h-screen">
        <div className="px-5 py-6 border-b border-white/10">
          <p className="text-[10px] uppercase tracking-widest text-white/40 mb-0.5">Tactile</p>
          <h1 className="text-base font-semibold leading-tight">Creations</h1>
        </div>
        <nav className="flex flex-col gap-1 p-3 flex-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                [
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-[#f97316] text-white'
                    : 'text-white/70 hover:bg-white/10 hover:text-white',
                ].join(' ')
              }
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-white/10">
          <button
            onClick={() => setShowScanner(true)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors"
          >
            <span className="text-base">📷</span>
            Scan QR Code
          </button>
        </div>
      </aside>

      {/* Main content — push down past header on mobile, push up past bottom nav */}
      <main className="flex-1 overflow-auto pt-14 pb-20 lg:pt-0 lg:pb-0">
        <Outlet />
      </main>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex justify-around px-2 py-1 z-50">
        {navItems.map((item) => (
          <NavItem key={item.to} {...item} />
        ))}
      </nav>

      {/* QR scanner modal — fullscreen, renders over everything */}
      {showScanner && <QRScannerModal onClose={() => setShowScanner(false)} />}
    </div>
  );
}
