import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  BarChart3,
  Activity,
  BrainCircuit,
  Bot,
  Boxes,
  CheckSquare2,
  Calculator,
  FileSearch,
  Image,
  LayoutDashboard,
  Link2,
  LogOut,
  Megaphone,
  MessageSquareText,
  Package,
  PanelsTopLeft,
  Settings2,
  ShieldCheck,
  ScrollText,
  ScanSearch,
  ShoppingCart,
  SquareTerminal,
  Sparkles,
  Truck,
  Workflow,
  Users,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { navigationItems } from "../../lib/navigation";

const iconByPath: Record<string, LucideIcon> = {
  "/enterprise-readiness": ShieldCheck,
  "/mcp-tools": Wrench,
  "/memory-governance": BrainCircuit,
  "/audit-logs": ScrollText,
  "/agent-quality": Activity,
  "/assistant": LayoutDashboard,
  "/agent-console": SquareTerminal,
  "/agent-roadmap": Bot,
  "/enterprise-team": Users,
  "/operations-center": PanelsTopLeft,
  "/daily-product-research": Boxes,
  "/ozon-observations": ScanSearch,
  "/products": Package,
  "/ozon-pricing": Calculator,
  "/supply-chain": Truck,
  "/listing-generator": FileSearch,
  "/image-prompt": Image,
  "/marketing": Megaphone,
  "/orders": ShoppingCart,
  "/customer-service": MessageSquareText,
  "/market": BarChart3,
  "/review": CheckSquare2,
  "/automation": Workflow,
  "/store-monitor": Link2,
  "/team": Settings2,
};

function Sidebar({
  mobileOpen = false,
  onClose,
}: {
  mobileOpen?: boolean;
  onClose?: () => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const userInitials = (user?.name || user?.email || "U")
    .slice(0, 2)
    .toUpperCase();

  const goTo = (path: string) => {
    navigate(path);
    onClose?.();
  };

  const handleLogout = async () => {
    if (logoutPending) return;

    setLogoutPending(true);
    setLogoutError(null);
    try {
      await logout();
      onClose?.();
    } catch {
      setLogoutError("退出登录失败，请检查网络后重试。");
    } finally {
      setLogoutPending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        aria-label="关闭导航"
        className={`fixed inset-0 z-40 bg-slate-950/50 transition md:hidden ${mobileOpen ? "visible opacity-100" : "invisible opacity-0"}`}
        onClick={onClose}
      />
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-800 bg-[#0B1428] text-slate-300 transition-transform md:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex h-[78px] items-center gap-3 border-b border-slate-800 px-5">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 text-white shadow-lg shadow-blue-950/30">
            <Sparkles size={21} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-[17px] font-bold text-white">
              GlobalPilot AI
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">跨境智营</p>
          </div>
          <button
            type="button"
            aria-label="关闭菜单"
            onClick={onClose}
            className="ml-auto grid h-8 w-8 place-items-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-white md:hidden"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="主导航">
          <div className="space-y-1">
            {navigationItems.map((item) => {
              const active =
                location.pathname === item.path ||
                (item.path !== "/assistant" &&
                  location.pathname.startsWith(item.path));
              const Icon = iconByPath[item.path] ?? Boxes;
              return (
                <button
                  key={`${item.path}-${item.label}`}
                  type="button"
                  onClick={() => goTo(item.path)}
                  className={`flex h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm transition ${active ? "bg-gradient-to-r from-blue-600 to-violet-600 font-semibold text-white shadow-md shadow-blue-950/30" : "text-slate-300 hover:bg-slate-800/80 hover:text-white"}`}
                >
                  <Icon size={18} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                </button>
              );
            })}
          </div>
        </nav>

        <div className="border-t border-slate-800 px-4 py-3">
          <button
            type="button"
            onClick={() => goTo("/team")}
            className="flex w-full items-center gap-3 rounded-md px-1 py-2 text-left hover:bg-slate-800/70"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-blue-500/20 text-xs font-bold text-blue-200">
              {userInitials}
            </span>
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-xs font-semibold text-white">
                {user?.name || "Jieke Design Studio"}
              </strong>
              <span className="mt-1 block text-[10px] text-slate-400">
                当前登录账户
              </span>
            </span>
            <Boxes size={15} className="text-slate-500" />
          </button>
          <button
            type="button"
            aria-label="退出登录"
            aria-busy={logoutPending}
            aria-describedby={logoutError ? "sidebar-logout-error" : undefined}
            disabled={logoutPending}
            onClick={() => void handleLogout()}
            className="mt-1 flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-xs font-medium text-slate-400 transition hover:bg-slate-800/70 hover:text-white disabled:cursor-wait disabled:opacity-60"
          >
            <LogOut size={15} aria-hidden="true" />
            <span>退出登录</span>
            {logoutPending ? (
              <span className="ml-auto text-[10px]" aria-live="polite">
                正在退出…
              </span>
            ) : null}
          </button>
          {logoutError ? (
            <p
              id="sidebar-logout-error"
              role="alert"
              className="mt-2 text-[11px] leading-4 text-red-300"
            >
              {logoutError}
            </p>
          ) : null}
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
