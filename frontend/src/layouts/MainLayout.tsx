import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '../components/sidebar/Sidebar';
import TopBar from '../components/topbar/TopBar';

function MainLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#F5F7FB]">
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="min-h-screen overflow-x-hidden md:ml-64">
        <TopBar onMenuClick={() => setMobileOpen(true)} />
        <main className="min-h-[calc(100vh-136px)] px-4 py-5 md:px-6 lg:px-8">
          <div className="mx-auto max-w-[1600px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

export default MainLayout;
