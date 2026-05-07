import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Icon from '../ui/Icon';

const PAGE_TITLES = {
  '/dashboard': 'Dashboard',
  '/track': 'Track Workout',
  '/history': 'Workout History',
  '/programs': 'Programs',
  '/nutrition': 'Nutrition',
  '/ai-coach': 'Kinetic AI',
  '/biometrics': 'Biometrics',
  '/profile': 'Profile',
};

export default function TopBar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const title = PAGE_TITLES[pathname] ?? 'Kinetic';
  const initials = user?.display_name
    ? user.display_name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : null;

  return (
    <header className="sticky top-0 z-40 bg-zinc-950/60 backdrop-blur-xl flex items-center justify-between px-4 sm:px-8 h-16 lg:h-20 w-full shadow-[0_16px_32px_-12px_rgba(209,255,38,0.1)]">
      <div className="flex items-center gap-4">
        <h2 className="text-xl font-bold tracking-tighter text-[#D1FF26] font-headline uppercase">
          {title}
        </h2>
      </div>
      <div className="flex items-center gap-6">
        <div className="flex gap-4">
          <button
            onClick={() => navigate('/profile')}
            className="text-zinc-500 hover:text-[#D1FF26] transition-colors active:scale-95"
          >
            <Icon name="settings" />
          </button>
        </div>
        <div className="flex items-center gap-3">
          {user?.display_name && (
            <span className="text-xs font-bold text-zinc-400 hidden sm:block">{user.display_name}</span>
          )}
          <div className="w-10 h-10 rounded-full bg-zinc-800 overflow-hidden ring-1 ring-[#D1FF26]/30 flex items-center justify-center">
            {initials
              ? <span className="text-xs font-black text-[#D1FF26]">{initials}</span>
              : <Icon name="person" className="text-zinc-400" />
            }
          </div>
        </div>
      </div>
    </header>
  );
}
