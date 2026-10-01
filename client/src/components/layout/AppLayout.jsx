import {
  Bell,
  BarChart3,
  Camera,
  ChevronDown,
  History,
  LayoutDashboard,
  Leaf,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  Tag,
  UserRound,
  X,
} from "lucide-react";

import {
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";

import { useEffect, useRef, useState } from "react";
import api from "../../api/axios";

const mainNavigation = [
  {
    label: "Dashboard",
    path: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "Scan Food Label",
    path: "/scan",
    icon: Camera,
  },
  {
    label: "History",
    path: "/history",
    icon: History,
  },
  {
    label: "Analytics",
    path: "/analytics",
    icon: BarChart3,
  },
  {
    label: "Brand Ratings",
    path: "/brands",
    icon: Tag,
  },
];

const profileNavigation = [
  {
    label: "Health Profile",
    path: "/profile",
    icon: UserRound,
  },
  {
    label: "Settings",
    path: "/settings",
    icon: Settings,
  },
];

function NavigationItem({ item, onClick }) {
  const Icon = item.icon;

  return (
    <NavLink
      to={item.path}
      onClick={onClick}
      className={({ isActive }) =>
        `
        group flex items-center gap-3 rounded-xl px-3 py-2.5
        text-sm font-medium transition-all duration-200
        ${
          isActive
            ? "bg-emerald-400 text-[#03100c] shadow-[0_8px_25px_rgba(52,211,153,0.12)]"
            : "text-slate-400 hover:bg-white/[0.04] hover:text-white"
        }
        `
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            size={17}
            strokeWidth={isActive ? 2.2 : 1.8}
            className={
              isActive
                ? "text-[#03100c]"
                : "text-slate-500 transition-colors group-hover:text-emerald-400"
            }
          />

          <span>{item.label}</span>
        </>
      )}
    </NavLink>
  );
}

function Sidebar({ mobile = false, onClose }) {
  const navigate = useNavigate();

  return (
    <aside
      className={`
        flex h-full w-[260px] flex-col
        border-r border-white/[0.06]
        bg-[#020b08]
        ${mobile ? "relative" : ""}
      `}
    >
      {/* Brand */}
      <div className="flex h-[76px] shrink-0 items-center justify-between border-b border-white/[0.06] px-5">
        <button
          type="button"
          onClick={() => navigate("/dashboard")}
          className="flex items-center gap-3"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-400 text-[#03100c] shadow-[0_8px_25px_rgba(52,211,153,0.15)]">
            <Leaf size={21} strokeWidth={2.4} />
          </div>

          <div className="text-left">
            <h1 className="text-[17px] font-bold tracking-tight text-white">
              LabelIQ
            </h1>

            <p className="text-[9px] font-medium tracking-wide text-slate-500">
              Scan. Understand. Decide.
            </p>
          </div>
        </button>

        {mobile && (
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-white/[0.05] hover:text-white"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto px-3 py-5">
        <div className="mb-3 px-3">
          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-600">
            Main
          </p>
        </div>

        <nav className="space-y-1">
          {mainNavigation.map((item) => (
            <NavigationItem
              key={item.path}
              item={item}
              onClick={mobile ? onClose : undefined}
            />
          ))}
        </nav>

        <div className="mb-3 mt-8 px-3">
          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-600">
            Profile
          </p>
        </div>

        <nav className="space-y-1">
          {profileNavigation.map((item) => (
            <NavigationItem
              key={item.path}
              item={item}
              onClick={mobile ? onClose : undefined}
            />
          ))}
        </nav>

        {/* Health intelligence */}
        <div className="mt-7 overflow-hidden rounded-2xl border border-emerald-400/10 bg-gradient-to-br from-emerald-400/[0.08] to-cyan-400/[0.03] p-4">
          <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-400">
            <ShieldCheck size={15} />
          </div>

          <p className="text-xs font-semibold text-white">
            Health intelligence
          </p>

          <p className="mt-1 text-[10px] leading-4 text-slate-600">
            Personalized analysis based on your health profile.
          </p>

          <button
            type="button"
            onClick={() => navigate("/profile")}
            className="mt-3 flex items-center gap-1 text-[10px] font-semibold text-emerald-400 hover:text-emerald-300"
          >
            Update profile
            <span>→</span>
          </button>
        </div>
      </div>
    </aside>
  );
}

export default function AppLayout() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [user, setUser] = useState(null);

  const location = useLocation();
  const navigate = useNavigate();

  const userMenuRef = useRef(null);

  const currentPage = [
    ...mainNavigation,
    ...profileNavigation,
  ].find((item) => location.pathname.startsWith(item.path));

  /* ---------------------------------------------
     Fetch logged-in user
  --------------------------------------------- */

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const response = await api.get("/auth/me");

        const currentUser = response?.data?.data;

        if (currentUser) {
          setUser(currentUser);

          localStorage.setItem(
            "user",
            JSON.stringify(currentUser)
          );
        }
      } catch (error) {
        console.error("Header user fetch error:", error);

        if (error?.response?.status === 401) {
          localStorage.removeItem("token");
          localStorage.removeItem("user");

          navigate("/login", { replace: true });
        }
      }
    };

    const storedUser = localStorage.getItem("user");

    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch {
        localStorage.removeItem("user");
      }
    }

    fetchUser();
  }, [navigate]);

  /* ---------------------------------------------
     Close dropdown when clicking outside
  --------------------------------------------- */

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(event.target)
      ) {
        setUserMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener(
        "mousedown",
        handleClickOutside
      );
    };
  }, []);

  /* ---------------------------------------------
     Logout
  --------------------------------------------- */

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");

    setUserMenuOpen(false);

    navigate("/login", { replace: true });
  };

  /* ---------------------------------------------
     User helpers
  --------------------------------------------- */

  const userName = user?.name || "Aditya";

  const userEmail = user?.email || "User";

  const initials = userName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "A";

  return (
    <div className="min-h-screen bg-[#06110e] text-white">
      {/* Desktop sidebar */}
      <div className="fixed inset-y-0 left-0 z-40 hidden w-[260px] lg:block">
        <Sidebar />
      </div>

      {/* Mobile sidebar */}
      {mobileSidebarOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
            onClick={() => setMobileSidebarOpen(false)}
          />

          <div className="fixed inset-y-0 left-0 z-50 lg:hidden">
            <Sidebar
              mobile
              onClose={() => setMobileSidebarOpen(false)}
            />
          </div>
        </>
      )}

      {/* Main application */}
      <div className="min-h-screen lg:pl-[260px]">
        {/* Header */}
        <header className="sticky top-0 z-30 h-[76px] border-b border-white/[0.06] bg-[#06110e]/95 backdrop-blur-xl">
          <div className="flex h-full items-center justify-between px-4 sm:px-6 lg:px-8">
            {/* Left */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(true)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.025] text-slate-400 hover:bg-white/[0.05] hover:text-white lg:hidden"
              >
                <Menu size={18} />
              </button>

              <div className="hidden sm:block">
                <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-600">
                  LabelIQ
                </p>

                <h2 className="mt-0.5 text-sm font-semibold text-white">
                  {currentPage?.label || "Dashboard"}
                </h2>
              </div>
            </div>

            {/* Right */}
            <div className="flex items-center gap-2 sm:gap-4">
              {/* Notification */}
              <button
                type="button"
                className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.025] text-slate-400 transition hover:bg-white/[0.05] hover:text-white"
              >
                <Bell size={17} />

                <span className="absolute right-[9px] top-[8px] h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]" />
              </button>

              {/* User menu */}
              <div
                ref={userMenuRef}
                className="relative"
              >
                <button
                  type="button"
                  onClick={() =>
                    setUserMenuOpen((prev) => !prev)
                  }
                  className="flex items-center gap-2 rounded-xl px-2 py-1.5 transition hover:bg-white/[0.04]"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-400/15 text-sm font-bold text-emerald-400 ring-1 ring-emerald-400/10">
                    {initials}
                  </div>

                  <div className="hidden text-left sm:block">
                    <p className="text-xs font-semibold text-white">
                      {userName}
                    </p>

                    <p className="max-w-[150px] truncate text-[9px] text-slate-600">
                      {userEmail}
                    </p>
                  </div>

                  <ChevronDown
                    size={14}
                    className={`hidden text-slate-600 transition-transform sm:block ${
                      userMenuOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {/* Dropdown */}
                {userMenuOpen && (
                  <div className="absolute right-0 top-[52px] w-64 overflow-hidden rounded-2xl border border-white/10 bg-[#0a1b17] shadow-2xl shadow-black/40">
                    {/* User info */}
                    <div className="border-b border-white/[0.07] px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-400/15 text-sm font-bold text-emerald-400">
                          {initials}
                        </div>

                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-white">
                            {userName}
                          </p>

                          <p className="truncate text-xs text-slate-500">
                            {userEmail}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Settings */}
                    <div className="p-2">
                      <button
                        type="button"
                        onClick={() => {
                          setUserMenuOpen(false);
                          navigate("/settings");
                        }}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-300 transition hover:bg-white/[0.05] hover:text-white"
                      >
                        <Settings size={16} />
                        Settings
                      </button>

                      {/* Logout */}
                      <button
                        type="button"
                        onClick={handleLogout}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-400 transition hover:bg-rose-400/[0.06] hover:text-rose-400"
                      >
                        <LogOut size={16} />
                        Logout
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="min-h-[calc(100vh-76px)] bg-[#06110e]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}