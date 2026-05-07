import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Icon from '../ui/Icon';

const NAV_ITEMS = [
  { to: '/dashboard', icon: 'grid_view',      label: 'Dashboard' },
  { to: '/programs',  icon: 'fitness_center', label: 'Train'     },
  { to: '/nutrition', icon: 'restaurant',     label: 'Nutrition' },
  { to: '/ai-coach',  icon: 'psychology',     label: 'AI'        },
  { to: '/profile',   icon: 'person',         label: 'Profile'   },
];

export default function SideNav() {
  const { logout, user } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/');
  }

  return (
    <>
      {/* ── Desktop sidebar ── */}
      <aside className="hidden lg:flex fixed left-0 top-0 h-full w-64 z-50 bg-zinc-950 flex-col py-8 px-4 border-r border-zinc-800/20">
        {/* Brand */}
        <div className="mb-12 px-2">
          <h1 className="text-3xl font-black italic text-[#D1FF26] font-headline tracking-widest">
            KINETIC
          </h1>
          <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-medium mt-1">
            High Performance
          </p>
        </div>

        {/* Nav links */}
        <nav className="flex-1 space-y-1">
          {NAV_ITEMS.slice(0, 4).map(({ to, icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-4 px-4 py-3 transition-all duration-300 font-headline font-medium uppercase tracking-widest text-xs ${
                  isActive
                    ? 'text-[#D1FF26] border-r-4 border-[#D1FF26] bg-zinc-900/50'
                    : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900/80'
                }`
              }
            >
              <Icon name={icon} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Bottom actions */}
        <div className="mt-auto space-y-1">
          <NavLink
            to="/profile"
            className={({ isActive }) =>
              `flex items-center gap-4 px-4 py-3 transition-all duration-300 font-headline font-medium uppercase tracking-widest text-xs ${
                isActive
                  ? 'text-[#D1FF26] border-r-4 border-[#D1FF26] bg-zinc-900/50'
                  : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900/80'
              }`
            }
          >
            <Icon name="person" />
            <span>{user?.display_name ?? 'Profile'}</span>
          </NavLink>
          <a
            href="#"
            className="flex items-center gap-4 px-4 py-3 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900/80 transition-all duration-300 font-headline font-medium uppercase tracking-widest text-xs"
            onClick={(e) => { e.preventDefault(); handleLogout(); }}
          >
            <Icon name="logout" />
            <span>Logout</span>
          </a>
        </div>
      </aside>

      {/* ── Mobile bottom nav bar ── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-zinc-950 border-t border-zinc-800/30 flex">
        {NAV_ITEMS.map(({ to, icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors duration-200 ${
                isActive ? 'text-[#D1FF26]' : 'text-zinc-500 active:text-zinc-300'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  name={icon}
                  fill={isActive}
                  style={{ fontSize: '22px' }}
                />
                <span className="text-[9px] font-bold uppercase tracking-wider leading-none">
                  {label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </>
  );
}
