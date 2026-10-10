import { Link, useNavigate } from "react-router-dom";
import {
    History,
    LogIn,
    LogOut,
    Menu,
    ScanLine,
    User,
    X,
} from "lucide-react";
import { useState } from "react";

import { useAuth } from "../context/AuthContext";

const Navbar = () => {
    const { user, isAuthenticated, logout } = useAuth();
    const navigate = useNavigate();

    const [mobileMenuOpen, setMobileMenuOpen] =
        useState(false);

    const handleLogout = () => {
        setMobileMenuOpen(false);
        logout();
        navigate("/login");
    };

    const closeMobileMenu = () => {
        setMobileMenuOpen(false);
    };

    return (
        <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/95 backdrop-blur">
            <nav className="mx-auto w-full max-w-7xl px-3 sm:px-6 lg:px-8">
                <div className="flex min-h-14 items-center justify-between sm:min-h-16">
                    {/* Logo */}
                    <Link
                        to="/"
                        onClick={closeMobileMenu}
                        className="flex min-h-10 shrink-0 items-center gap-2 text-lg font-bold text-gray-900 sm:text-xl"
                    >
                        <ScanLine className="h-5 w-5 shrink-0 text-emerald-600 sm:h-6 sm:w-6" />

                        <span>LabelIQ</span>
                    </Link>

                    {/* Desktop navigation */}
                    <div className="hidden items-center gap-1 sm:flex">
                        {isAuthenticated ? (
                            <>
                                <Link
                                    to="/dashboard"
                                    className="flex min-h-10 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 hover:text-gray-950"
                                >
                                    <User className="h-4 w-4 shrink-0" />
                                    Dashboard
                                </Link>

                                <Link
                                    to="/history"
                                    className="flex min-h-10 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 hover:text-gray-950"
                                >
                                    <History className="h-4 w-4 shrink-0" />
                                    History
                                </Link>

                                <button
                                    type="button"
                                    onClick={handleLogout}
                                    className="flex min-h-10 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 hover:text-gray-950"
                                >
                                    <LogOut className="h-4 w-4 shrink-0" />
                                    Logout
                                </button>
                            </>
                        ) : (
                            <>
                                <Link
                                    to="/login"
                                    className="flex min-h-10 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 hover:text-gray-950"
                                >
                                    <LogIn className="h-4 w-4 shrink-0" />
                                    Login
                                </Link>

                                <Link
                                    to="/register"
                                    className="inline-flex min-h-10 items-center justify-center rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 active:bg-emerald-800 sm:px-4"
                                >
                                    Get Started
                                </Link>
                            </>
                        )}
                    </div>

                    {/* Mobile menu button */}
                    <button
                        type="button"
                        onClick={() =>
                            setMobileMenuOpen(
                                (previous) => !previous
                            )
                        }
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-gray-700 transition hover:bg-gray-100 active:bg-gray-200 sm:hidden"
                        aria-label={
                            mobileMenuOpen
                                ? "Close menu"
                                : "Open menu"
                        }
                        aria-expanded={mobileMenuOpen}
                        aria-controls="mobile-navigation"
                    >
                        {mobileMenuOpen ? (
                            <X className="h-5 w-5" />
                        ) : (
                            <Menu className="h-5 w-5" />
                        )}
                    </button>
                </div>

                {/* Mobile navigation */}
                {mobileMenuOpen && (
                    <div
                        id="mobile-navigation"
                        className="border-t border-gray-100 py-2 sm:hidden"
                    >
                        <div className="flex min-w-0 flex-col gap-1 pb-1">
                            {isAuthenticated ? (
                                <>
                                    <Link
                                        to="/dashboard"
                                        onClick={closeMobileMenu}
                                        className="flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-100 active:bg-gray-200"
                                    >
                                        <User className="h-5 w-5 shrink-0" />
                                        <span>Dashboard</span>
                                    </Link>

                                    <Link
                                        to="/history"
                                        onClick={closeMobileMenu}
                                        className="flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-100 active:bg-gray-200"
                                    >
                                        <History className="h-5 w-5 shrink-0" />
                                        <span>History</span>
                                    </Link>

                                    <Link
                                        to="/compare"
                                        onClick={closeMobileMenu}
                                        className="flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-100 active:bg-gray-200"
                                    >
                                        <ScanLine className="h-5 w-5 shrink-0" />
                                        <span>Compare Products</span>
                                    </Link>

                                    <Link
                                        to="/profile"
                                        onClick={closeMobileMenu}
                                        className="flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-100 active:bg-gray-200"
                                    >
                                        <User className="h-5 w-5 shrink-0" />
                                        <span>Profile</span>
                                    </Link>

                                    <div className="my-2 border-t border-gray-100" />

                                    <button
                                        type="button"
                                        onClick={handleLogout}
                                        className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-gray-700 transition hover:bg-gray-100 active:bg-gray-200"
                                    >
                                        <LogOut className="h-5 w-5 shrink-0" />
                                        <span>Logout</span>
                                    </button>
                                </>
                            ) : (
                                <>
                                    <Link
                                        to="/login"
                                        onClick={closeMobileMenu}
                                        className="flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-100 active:bg-gray-200"
                                    >
                                        <LogIn className="h-5 w-5 shrink-0" />
                                        <span>Login</span>
                                    </Link>

                                    <Link
                                        to="/register"
                                        onClick={closeMobileMenu}
                                        className="mt-1 flex min-h-11 items-center justify-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 active:bg-emerald-800"
                                    >
                                        Get Started
                                    </Link>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </nav>
        </header>
    );
};

export default Navbar;