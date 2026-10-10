import { useEffect, useState } from "react";
import {
    ArrowLeft,
    CheckCircle2,
    LoaderCircle,
    Save,
    User,
} from "lucide-react";
import { Link } from "react-router-dom";

import api from "../api/axios";
import { useAuth } from "../context/AuthContext";

const Profile = () => {
    const { user } = useAuth();

    const [formData, setFormData] = useState({
        goal: "general",
        dietaryPreference: "none",
        allergens: "",
        ingredientsToAvoid: "",
    });

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState("");
    const [error, setError] = useState("");

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const response = await api.get(
                    "/users/profile"
                );

                const profile = response.data.data;

                setFormData({
                    goal:
                        profile.preferences?.goal ||
                        "general",

                    dietaryPreference:
                        profile.preferences
                            ?.dietaryPreference ||
                        "none",

                    allergens:
                        profile.preferences?.allergens?.join(
                            ", "
                        ) || "",

                    ingredientsToAvoid:
                        profile.preferences?.ingredientsToAvoid?.join(
                            ", "
                        ) || "",
                });
            } catch (error) {
                setError(
                    error.response?.data?.message ||
                        "Unable to load your preferences."
                );
            } finally {
                setLoading(false);
            }
        };

        fetchProfile();
    }, []);

    const handleChange = (event) => {
        const { name, value } = event.target;

        setFormData((previous) => ({
            ...previous,
            [name]: value,
        }));

        setSuccess("");
    };

    const handleSubmit = async (event) => {
        event.preventDefault();

        setError("");
        setSuccess("");
        setSaving(true);

        try {
            const allergens = formData.allergens
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean);

            const ingredientsToAvoid =
                formData.ingredientsToAvoid
                    .split(",")
                    .map((item) => item.trim())
                    .filter(Boolean);

            await api.patch("/users/preferences", {
                goal: formData.goal,
                dietaryPreference:
                    formData.dietaryPreference,
                allergens,
                ingredientsToAvoid,
            });

            setSuccess(
                "Your preferences have been saved."
            );
        } catch (error) {
            setError(
                error.response?.data?.message ||
                    "Unable to save your preferences."
            );
        } finally {
            setSaving(false);
        }
    };

    const inputClass =
        "min-h-12 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10";

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
                <LoaderCircle className="h-7 w-7 animate-spin text-emerald-600" />
            </div>
        );
    }

    return (
        <div className="min-h-screen overflow-x-hidden bg-gray-50">
            <main className="mx-auto w-full max-w-3xl px-3 py-5 sm:px-6 sm:py-8 lg:px-8">

                {/* Back */}
                <Link
                    to="/dashboard"
                    className="inline-flex min-h-10 items-center gap-2 text-sm font-medium text-gray-600 transition hover:text-gray-900"
                >
                    <ArrowLeft className="h-4 w-4 shrink-0" />
                    <span>Back to dashboard</span>
                </Link>

                {/* Header */}
                <section className="mt-6 sm:mt-8">
                    <div className="flex items-start gap-3 sm:items-center sm:gap-4">

                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50">
                            <User className="h-5 w-5 text-emerald-600" />
                        </div>

                        <div className="min-w-0">
                            <h1 className="text-2xl font-bold tracking-tight text-gray-950 sm:text-3xl">
                                Profile & preferences
                            </h1>

                            <p className="mt-1 max-w-2xl text-sm leading-5 text-gray-500 sm:text-base">
                                Customize how LabelIQ understands your food choices.
                            </p>
                        </div>
                    </div>
                </section>

                {/* Account */}
                <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:mt-8 sm:p-8">
                    <h2 className="text-lg font-bold text-gray-950">
                        Account
                    </h2>

                    <div className="mt-5 grid gap-4 sm:grid-cols-2">
                        <div className="min-w-0">
                            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                                Name
                            </p>

                            <p className="mt-1 break-words font-medium text-gray-900">
                                {user?.name || "—"}
                            </p>
                        </div>

                        <div className="min-w-0">
                            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                                Email
                            </p>

                            <p className="mt-1 break-all font-medium text-gray-900">
                                {user?.email || "—"}
                            </p>
                        </div>
                    </div>
                </section>

                {/* Preferences */}
                <form
                    onSubmit={handleSubmit}
                    className="mt-4 space-y-4 sm:mt-6 sm:space-y-6"
                >
                    {/* Nutrition goal */}
                    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-8">
                        <h2 className="text-lg font-bold text-gray-950">
                            Nutrition goal
                        </h2>

                        <p className="mt-1 text-sm leading-5 text-gray-500">
                            Choose the area you want LabelIQ to pay more attention to.
                        </p>

                        <select
                            name="goal"
                            value={formData.goal}
                            onChange={handleChange}
                            className={`${inputClass} mt-4 sm:mt-5`}
                        >
                            <option value="general">
                                General
                            </option>

                            <option value="low-sugar">
                                Low Sugar
                            </option>

                            <option value="low-sodium">
                                Low Sodium
                            </option>

                            <option value="high-protein">
                                High Protein
                            </option>

                            <option value="high-fiber">
                                High Fiber
                            </option>
                        </select>
                    </section>

                    {/* Dietary preference */}
                    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-8">
                        <h2 className="text-lg font-bold text-gray-950">
                            Dietary preference
                        </h2>

                        <p className="mt-1 text-sm leading-5 text-gray-500">
                            Choose your preferred dietary pattern.
                        </p>

                        <select
                            name="dietaryPreference"
                            value={
                                formData.dietaryPreference
                            }
                            onChange={handleChange}
                            className={`${inputClass} mt-4 sm:mt-5`}
                        >
                            <option value="none">
                                No preference
                            </option>

                            <option value="vegetarian">
                                Vegetarian
                            </option>

                            <option value="vegan">
                                Vegan
                            </option>
                        </select>
                    </section>

                    {/* Allergens */}
                    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-8">
                        <h2 className="text-lg font-bold text-gray-950">
                            Allergens
                        </h2>

                        <p className="mt-1 text-sm leading-5 text-gray-500">
                            Enter allergens separated by commas.
                        </p>

                        <input
                            name="allergens"
                            value={formData.allergens}
                            onChange={handleChange}
                            placeholder="e.g. peanuts, milk, soy"
                            className={`${inputClass} mt-4 sm:mt-5`}
                        />
                    </section>

                    {/* Ingredients to avoid */}
                    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-8">
                        <h2 className="text-lg font-bold text-gray-950">
                            Ingredients to avoid
                        </h2>

                        <p className="mt-1 text-sm leading-5 text-gray-500">
                            Enter ingredients you personally want LabelIQ to highlight.
                        </p>

                        <textarea
                            name="ingredientsToAvoid"
                            value={
                                formData.ingredientsToAvoid
                            }
                            onChange={handleChange}
                            rows={4}
                            placeholder="e.g. maltodextrin, artificial flavors"
                            className={`${inputClass} mt-4 min-h-28 resize-none sm:mt-5`}
                        />
                    </section>

                    {/* Error */}
                    {error && (
                        <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm leading-5 text-red-700 sm:px-4">
                            {error}
                        </div>
                    )}

                    {/* Success */}
                    {success && (
                        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm leading-5 text-emerald-700 sm:items-center sm:px-4">
                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 sm:mt-0" />
                            <span>{success}</span>
                        </div>
                    )}

                    {/* Save */}
                    <button
                        type="submit"
                        disabled={saving}
                        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3.5 font-semibold text-white shadow-sm transition hover:bg-emerald-700 hover:shadow-md active:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {saving ? (
                            <>
                                <LoaderCircle className="h-5 w-5 animate-spin" />
                                <span>Saving...</span>
                            </>
                        ) : (
                            <>
                                <Save className="h-5 w-5" />
                                <span>Save preferences</span>
                            </>
                        )}
                    </button>
                </form>
            </main>
        </div>
    );
};

export default Profile;