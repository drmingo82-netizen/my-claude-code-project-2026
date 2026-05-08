import { NavLink, Outlet } from 'react-router-dom';

const navItems = [
  { to: '/', label: 'Dashboard', icon: '📊' },
  { to: '/filament', label: 'Filament', icon: '🧵' },
  { to: '/products', label: 'Products', icon: '🖨️' },
  { to: '/calculator', label: 'Calculator', icon: '🧮' },
];

function NavItem({ to, label, icon }: { to: string; label: string; icon: string }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        [
          'flex flex-col items-center gap-0.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors',
          isActive
            ? 'text-[#f97316] bg-orange-50'
            : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100',
        ].join(' ')
      }
    >
      <span className="text-xl leading-none">{icon}</span>
      <span className="hidden sm:inline">{label}</span>
    </NavLink>
  );
}

export default function AppLayout() {
  return (
    <div className="flex flex-col min-h-dvh lg:flex-row">
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
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto pb-20 lg:pb-0">
        <Outlet />
      </main>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex justify-around px-2 py-1 z-50">
        {navItems.map((item) => (
          <NavItem key={item.to} {...item} />
        ))}
      </nav>
    </div>
  );
}
