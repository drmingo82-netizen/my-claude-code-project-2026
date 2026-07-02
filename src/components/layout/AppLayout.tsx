import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import QRScannerModal from '../scanner/QRScannerModal';

const navItems = [
  { to: '/', label: 'Dashboard', icon: '📊' },
  { to: '/orders', label: 'Orders', icon: '📦' },
  { to: '/queue', label: 'Print Queue', icon: '📋' },
  { to: '/filament', label: 'Filament', icon: '🧵' },
  { to: '/locations', label: 'Locations', icon: '📍' },
  { to: '/colors', label: 'Colors', icon: '🎨' },
  { to: '/hardware', label: 'Hardware', icon: '🌡️' },
  { to: '/products', label: 'Products', icon: '🖨️' },
  { to: '/skus', label: 'SKU Catalog', icon: '🏷️' },
  { to: '/sales', label: 'Sales', icon: '💰' },
  { to: '/calculator', label: 'Calculator', icon: '🧮' },
  { to: '/settings',  label: 'Settings',   icon: '⚙️' },
];

// The mobile bottom bar can't fit 12 tabs. Show the first few as primary tabs plus a "More"
// button that opens the rest in a sheet. Desktop sidebar still lists all of navItems.
const PRIMARY_COUNT = 4;
const primaryNav = navItems.slice(0, PRIMARY_COUNT);
const moreNav = navItems.slice(PRIMARY_COUNT);

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

// "More" bottom-nav entry: a button that opens a sheet with the overflow nav items. The button
// shows active styling when the current route lives under one of those items.
function MoreNav({ items }: { items: { to: string; label: string; icon: string }[] }) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const isActive = items.some((n) => pathname.startsWith(n.to));

  // Close on route change (a tap navigated) and on Escape.
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{ touchAction: 'manipulation' }}
        aria-label="More"
        aria-expanded={open}
        className={[
          'flex flex-col items-center gap-0.5 px-3 py-2 rounded-lg font-medium transition-colors',
          isActive ? 'text-[#f97316] bg-orange-50' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100',
        ].join(' ')}
      >
        <span className="text-xl leading-none font-bold tracking-tight">•••</span>
        <span className="text-[10px] leading-none">More</span>
      </button>

      {open && (
        <div
          className="lg:hidden fixed inset-0 z-[60] flex items-end"
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative bg-white w-full rounded-t-2xl shadow-xl max-h-[80dvh] overflow-y-auto overscroll-contain pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white">
              <h2 className="text-base font-semibold text-[#1e2a3a]">More</h2>
              <button
                onClick={() => setOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-xl leading-none p-1 -mr-1"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="grid grid-cols-4 gap-2 p-4">
              {items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  onClick={() => setOpen(false)}
                  style={{ touchAction: 'manipulation' }}
                  className={({ isActive: active }) =>
                    [
                      'flex flex-col items-center gap-1 px-2 py-3 rounded-xl text-center transition-colors',
                      active ? 'text-[#f97316] bg-orange-50' : 'text-slate-600 hover:bg-slate-100',
                    ].join(' ')
                  }
                >
                  <span className="text-2xl leading-none">{item.icon}</span>
                  <span className="text-[10px] leading-tight">{item.label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
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
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);

  // Scroll to top on every route change — React Router v6 does not do this automatically
  // when the scroll container is an inner element (overflow-auto on <main>).
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

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
      <main ref={mainRef} className="flex-1 overflow-auto pt-14 pb-20 lg:pt-0 lg:pb-0">
        <Outlet />
      </main>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex justify-around px-2 py-1 z-50">
        {primaryNav.map((item) => (
          <NavItem key={item.to} {...item} />
        ))}
        <MoreNav items={moreNav} />
      </nav>

      {/* QR scanner modal — fullscreen, renders over everything */}
      {showScanner && <QRScannerModal onClose={() => setShowScanner(false)} />}
    </div>
  );
}
