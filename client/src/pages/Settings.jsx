import { useEffect, useState } from "react";
import {
  User,
  Mail,
  CalendarDays,
  Palette,
  Bell,
  LockKeyhole,
  Check,
  AlertCircle,
  Eye,
  EyeOff,
  Save,
} from "lucide-react";

import api from "../api/axios";

const Settings = () => {
  const [user, setUser] = useState(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [theme, setTheme] = useState(
    localStorage.getItem("labeliq-theme") || "dark"
  );

  const [notifications, setNotifications] = useState(
    localStorage.getItem("labeliq-notifications") !== "false"
  );

  const [showPassword, setShowPassword] = useState(false);

  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchUser = async () => {
      try {
        setLoading(true);
        setError("");

        const response = await api.get("/auth/me");

        const currentUser = response?.data?.data;

        if (currentUser) {
          setUser(currentUser);

          localStorage.setItem(
            "user",
            JSON.stringify(currentUser)
          );
        }
      } catch (err) {
        console.error("Fetch settings user error:", err);

        setError(
          err?.response?.data?.message ||
            "Failed to load account information."
        );
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, []);

  const savePreferences = () => {
    setSaving(true);
    setSuccess("");
    setError("");

    localStorage.setItem("labeliq-theme", theme);
    localStorage.setItem(
      "labeliq-notifications",
      String(notifications)
    );

    setTimeout(() => {
      setSaving(false);
      setSuccess("Settings saved successfully.");

      setTimeout(() => {
        setSuccess("");
      }, 2500);
    }, 400);
  };

  const formatDate = (date) => {
    if (!date) return "—";

    const parsedDate = new Date(date);

    if (Number.isNaN(parsedDate.getTime())) {
      return "—";
    }

    return parsedDate.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  const getInitials = (name) => {
    if (!name) return "A";

    return (
      name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("") || "A"
    );
  };

  if (loading) {
    return (
      <div className="min-h-full bg-[#061310] text-white">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-8">
            <div className="h-8 w-36 animate-pulse rounded-lg bg-white/10" />
            <div className="mt-3 h-4 w-80 animate-pulse rounded bg-white/5" />
          </div>

          <div className="space-y-6">
            <div className="h-60 animate-pulse rounded-3xl border border-white/10 bg-white/[0.03]" />
            <div className="h-52 animate-pulse rounded-3xl border border-white/10 bg-white/[0.03]" />
            <div className="h-52 animate-pulse rounded-3xl border border-white/10 bg-white/[0.03]" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#061310] text-white">
      {/* Background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-emerald-500/10 blur-3xl" />

        <div className="absolute right-0 top-1/3 h-96 w-96 rounded-full bg-cyan-500/5 blur-3xl" />

        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
      </div>

      <div className="relative mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/5 px-3 py-1.5 text-xs font-medium text-emerald-300">
              <Palette size={13} />
              Preferences
            </div>

            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Settings
            </h1>

            <p className="mt-2 text-sm leading-6 text-white/50 sm:text-base">
              Manage your LabelIQ account and application preferences.
            </p>
          </div>

          <button
            type="button"
            onClick={savePreferences}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-400 px-5 py-2.5 text-sm font-semibold text-[#03100d] transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? (
              "Saving..."
            ) : (
              <>
                <Save size={16} />
                Save Settings
              </>
            )}
          </button>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-red-400/20 bg-red-400/5 px-4 py-3.5 text-sm text-red-300">
            <AlertCircle size={17} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/5 px-4 py-3.5 text-sm text-emerald-300">
            <Check size={17} />
            <span>{success}</span>
          </div>
        )}

        <div className="space-y-6">
          {/* Account */}
          <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035] backdrop-blur-xl">
            <div className="border-b border-white/10 px-6 py-5 sm:px-7">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-400/15 bg-emerald-400/10 text-emerald-300">
                  <User size={19} />
                </div>

                <div>
                  <h2 className="font-semibold">
                    Account Information
                  </h2>

                  <p className="mt-0.5 text-sm text-white/35">
                    Your LabelIQ account information.
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6 sm:p-7">
              <div className="mb-6 flex items-center gap-4 rounded-2xl border border-white/10 bg-black/15 p-5">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-400/10 text-lg font-bold text-emerald-300">
                  {getInitials(user?.name)}
                </div>

                <div>
                  <h3 className="font-semibold text-white">
                    {user?.name || "User"}
                  </h3>

                  <p className="mt-1 text-sm text-white/40">
                    {user?.email || "—"}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
                  <div className="flex items-center gap-2 text-white/35">
                    <User size={15} />
                    <span className="text-xs font-medium uppercase tracking-wider">
                      Name
                    </span>
                  </div>

                  <p className="mt-3 text-sm font-medium text-white/85">
                    {user?.name || "—"}
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
                  <div className="flex items-center gap-2 text-white/35">
                    <Mail size={15} />
                    <span className="text-xs font-medium uppercase tracking-wider">
                      Email
                    </span>
                  </div>

                  <p className="mt-3 break-all text-sm font-medium text-white/85">
                    {user?.email || "—"}
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:col-span-2">
                  <div className="flex items-center gap-2 text-white/35">
                    <CalendarDays size={15} />
                    <span className="text-xs font-medium uppercase tracking-wider">
                      Member Since
                    </span>
                  </div>

                  <p className="mt-3 text-sm font-medium text-white/85">
                    {formatDate(user?.created_at)}
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Appearance */}
          <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035] backdrop-blur-xl">
            <div className="border-b border-white/10 px-6 py-5 sm:px-7">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-400/15 bg-cyan-400/10 text-cyan-300">
                  <Palette size={19} />
                </div>

                <div>
                  <h2 className="font-semibold">Appearance</h2>

                  <p className="mt-0.5 text-sm text-white/35">
                    Choose how LabelIQ should look.
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6 sm:p-7">
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  {
                    id: "dark",
                    title: "Dark",
                    description: "Default",
                  },
                  {
                    id: "light",
                    title: "Light",
                    description: "Light interface",
                  },
                  {
                    id: "system",
                    title: "System",
                    description: "Follow device",
                  },
                ].map((option) => {
                  const active = theme === option.id;

                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setTheme(option.id)}
                      className={`rounded-2xl border p-4 text-left transition ${
                        active
                          ? "border-emerald-400/40 bg-emerald-400/[0.08]"
                          : "border-white/10 bg-white/[0.025] hover:border-white/20 hover:bg-white/[0.04]"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">
                          {option.title}
                        </span>

                        {active && (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-400 text-[#03100d]">
                            <Check size={12} strokeWidth={3} />
                          </span>
                        )}
                      </div>

                      <p className="mt-1 text-xs text-white/35">
                        {option.description}
                      </p>
                    </button>
                  );
                })}
              </div>

              <p className="mt-4 text-xs text-white/25">
                Dark mode is currently the primary LabelIQ interface.
                Theme preference is saved locally.
              </p>
            </div>
          </section>

          {/* Notifications */}
          <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035] backdrop-blur-xl">
            <div className="border-b border-white/10 px-6 py-5 sm:px-7">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-400/15 bg-violet-400/10 text-violet-300">
                  <Bell size={19} />
                </div>

                <div>
                  <h2 className="font-semibold">
                    Notifications
                  </h2>

                  <p className="mt-0.5 text-sm text-white/35">
                    Control application notifications.
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6 sm:p-7">
              <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/15 p-5">
                <div className="pr-5">
                  <p className="text-sm font-medium text-white/85">
                    Enable notifications
                  </p>

                  <p className="mt-1 text-xs leading-5 text-white/35">
                    Allow LabelIQ to show notification updates.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setNotifications((prev) => !prev)
                  }
                  className={`relative h-7 w-12 shrink-0 rounded-full transition ${
                    notifications
                      ? "bg-emerald-400"
                      : "bg-white/10"
                  }`}
                >
                  <span
                    className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${
                      notifications
                        ? "left-6"
                        : "left-1"
                    }`}
                  />
                </button>
              </div>
            </div>
          </section>

          {/* Password */}
          <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035] backdrop-blur-xl">
            <div className="border-b border-white/10 px-6 py-5 sm:px-7">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-400/15 bg-amber-400/10 text-amber-300">
                  <LockKeyhole size={19} />
                </div>

                <div>
                  <h2 className="font-semibold">
                    Change Password
                  </h2>

                  <p className="mt-0.5 text-sm text-white/35">
                    Update your account password.
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6 sm:p-7">
              <div className="rounded-2xl border border-amber-400/10 bg-amber-400/[0.03] p-5">
                <div className="flex items-start gap-3">
                  <LockKeyhole
                    size={18}
                    className="mt-0.5 shrink-0 text-amber-300"
                  />

                  <div>
                    <p className="text-sm font-medium text-white/80">
                      Password changes are not connected yet
                    </p>

                    <p className="mt-1 text-xs leading-5 text-white/35">
                      The current authentication backend does not
                      provide a password-change endpoint. The
                      functionality can be connected once that API
                      is added.
                    </p>
                  </div>
                </div>
              </div>

              {/* Visual password field */}
              <div className="mt-5">
                <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-white/35">
                  Password
                </label>

                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value="••••••••••••"
                    readOnly
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 pr-12 text-sm text-white/50 outline-none"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setShowPassword((prev) => !prev)
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-white/30 hover:text-white"
                  >
                    {showPassword ? (
                      <EyeOff size={16} />
                    ) : (
                      <Eye size={16} />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className="mt-8 pb-4 text-center text-xs text-white/20">
          LabelIQ · Scan. Understand. Decide.
        </div>
      </div>
    </div>
  );
};

export default Settings;