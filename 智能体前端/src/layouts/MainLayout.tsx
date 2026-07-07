import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '../components/sidebar/Sidebar';
import TopBar from '../components/topbar/TopBar';

function MainLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#F8F9FF]">
      <Sidebar
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />
      <TopBar onMenuClick={() => setMobileOpen(true)} />
      <main className="ml-0 md:ml-[250px] mt-16 min-h-[calc(100vh-64px)] p-4 md:p-6">
        <div className="mx-auto max-w-[1600px]">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export default MainLayout;