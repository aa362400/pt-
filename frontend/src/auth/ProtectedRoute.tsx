import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

export default function ProtectedRoute() {
  const { user } = useAuth();
  const location = useLocation();

  // Initializing: show a short loading state to avoid flashing the login page
  if (user === undefined) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex items-center gap-3 text-[#6C63FF]">
          <div className="h-5 w-5 rounded-full border-2 border-[#6C63FF] border-t-transparent animate-spin" />
          <span className="text-sm">Verifying login status...</span>
        </div>
      </div>
    );
  }

  if (user === null) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return <Outlet />;
}
