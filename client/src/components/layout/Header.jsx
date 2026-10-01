import { Bell, ChevronDown } from "lucide-react";

function Header() {
  return (
    <header className="flex h-20 items-center justify-between border-b border-slate-200 bg-white px-5 lg:px-8">
      {/* Mobile Logo */}
      <div className="lg:hidden">
        <h1 className="font-bold text-emerald-600">LabelIQ</h1>
      </div>

      {/* Right Side */}
      <div className="ml-auto flex items-center gap-5">
        {/* Notifications */}
        <button
          type="button"
          className="relative text-slate-500 transition hover:text-slate-800"
        >
          <Bell size={20} />

          <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-emerald-500" />
        </button>

        {/* User */}
        <button
          type="button"
          className="flex items-center gap-2"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 font-semibold text-emerald-700">
            A
          </div>

          <div className="hidden text-left sm:block">
            <p className="text-sm font-semibold text-slate-800">
              Aditya
            </p>

            <p className="text-xs text-slate-400">
              User
            </p>
          </div>

          <ChevronDown
            size={16}
            className="text-slate-400"
          />
        </button>
      </div>
    </header>
  );
}

export default Header;