import {
  LayoutDashboard,
  ScanLine,
  History,
  BarChart3,
  Tags,
  UserRound,
  Settings,
  LogOut,
  Leaf,
} from "lucide-react";
import { NavLink } from "react-router-dom";

const mainLinks = [
  {
    name: "Dashboard",
    path: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    name: "Scan Food Label",
    path: "/scan",
    icon: ScanLine,
  },
  {
    name: "History",
    path: "/history",
    icon: History,
  },
  {
    name: "Analytics",
    path: "/analytics",
    icon: BarChart3,
  },
  {
    name: "Brand Ratings",
    path: "/brands",
    icon: Tags,
  },
];

const profileLinks = [
  {
    name: "Health Profile",
    path: "/profile",
    icon: UserRound,
  },
  {
    name: "Settings",
    path: "/settings",
    icon: Settings,
  },
];

function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 z-40 hidden h-screen w-64 flex-col bg-slate-950 text-white lg:flex">
      {/* Logo */}
      <div className="flex h-20 items-center gap-3 border-b border-slate-800 px-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500">
          <Leaf size={20} />
        </div>

        <div>
          <h1 className="text-lg font-bold">LabelIQ</h1>
          <p className="text-[10px] text-slate-400">
            Scan. Understand. Decide.
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-6">
        <p className="mb-3 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Main
        </p>

        <div className="space-y-1">
          {mainLinks.map(({ name, path, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                  isActive
                    ? "bg-emerald-600 text-white"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`
              }
            >
              <Icon size={18} />
              <span>{name}</span>
            </NavLink>
          ))}
        </div>

        <p className="mb-3 mt-8 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Profile
        </p>

        <div className="space-y-1">
          {profileLinks.map(({ name, path, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                  isActive
                    ? "bg-emerald-600 text-white"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`
              }
            >
              <Icon size={18} />
              <span>{name}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Logout */}
      <div className="border-t border-slate-800 p-4">
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-300 transition hover:bg-slate-800 hover:text-white"
        >
          <LogOut size={18} />
          Logout
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;