import { Outlet } from 'react-router-dom';
import SideNav from './SideNav';
import TopBar from './TopBar';

export default function AppShell() {
  return (
    <div className="flex min-h-screen bg-[#0e0e0e]">
      <SideNav />
      <div className="lg:ml-64 flex-1 flex flex-col min-h-screen">
        <TopBar />
        <main className="flex-1 overflow-x-clip pb-16 lg:pb-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
