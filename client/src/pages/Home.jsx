import {
    ArrowRight,
    CheckCircle2,
    ChevronRight,
    CircleAlert,
    FileSearch,
    ScanLine,
    ShieldCheck,
    Sparkles,
} from "lucide-react";

import { Link } from "react-router-dom";

const Home = () => {
    return (
        <div className="min-h-screen overflow-x-hidden bg-white text-gray-900">
            {/* Header */}
            <header className="border-b border-gray-100">
                <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-3 sm:h-16 sm:px-6 lg:px-8">
                    <Link
                        to="/"
                        className="inline-flex min-h-10 items-center gap-2"
                    >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600">
                            <ScanLine className="h-5 w-5 text-white" />
                        </div>

                        <span className="text-lg font-bold tracking-tight sm:text-xl">
                            LabelIQ
                        </span>
                    </Link>

                    <div className="flex items-center gap-1.5 sm:gap-3">
                        <Link
                            to="/login"
                            className="hidden min-h-10 items-center px-3 py-2 text-sm font-medium text-gray-600 transition hover:text-gray-900 sm:inline-flex"
                        >
                            Login
                        </Link>

                        <Link
                            to="/register"
                            className="inline-flex min-h-10 items-center justify-center rounded-lg bg-gray-900 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 active:bg-gray-950 sm:px-4"
                        >
                            Get Started
                        </Link>
                    </div>
                </div>
            </header>

            <main>
                {/* Hero */}
                <section className="overflow-hidden">
                    <div className="mx-auto grid w-full max-w-7xl items-center gap-8 px-3 py-12 sm:gap-12 sm:px-6 sm:py-20 lg:grid-cols-2 lg:px-8 lg:py-28">

                        <div className="min-w-0">
                            <div className="mb-5 inline-flex max-w-full items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 sm:mb-6 sm:text-sm">
                                <Sparkles className="h-4 w-4 shrink-0" />
                                <span>Understand what you eat</span>
                            </div>

                            <h1 className="max-w-3xl text-3xl font-bold leading-tight tracking-tight text-gray-950 sm:text-5xl lg:text-6xl">
                                Turn confusing food labels into
                                <span className="text-emerald-600">
                                    {" "}
                                    clear decisions.
                                </span>
                            </h1>

                            <p className="mt-5 max-w-2xl text-base leading-7 text-gray-600 sm:mt-6 sm:text-lg sm:leading-8">
                                LabelIQ helps you understand packaged
                                food by breaking down nutrition,
                                ingredients, serving sizes, and
                                product information into simple,
                                evidence-backed insights.
                            </p>

                            <div className="mt-6 flex flex-col gap-2.5 sm:mt-8 sm:flex-row sm:gap-3">
                                <Link
                                    to="/register"
                                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3.5 font-semibold text-white transition hover:bg-emerald-700 active:bg-emerald-800"
                                >
                                    <span>Analyze a Product</span>
                                    <ArrowRight className="h-5 w-5 shrink-0" />
                                </Link>

                                <a
                                    href="#how-it-works"
                                    className="inline-flex min-h-12 items-center justify-center rounded-xl border border-gray-200 px-6 py-3.5 font-semibold text-gray-700 transition hover:bg-gray-50 active:bg-gray-100"
                                >
                                    See how it works
                                </a>
                            </div>

                            <div className="mt-6 flex flex-col gap-3 text-sm text-gray-500 sm:mt-8 sm:flex-row sm:flex-wrap sm:gap-x-6">
                                <span className="flex items-center gap-2">
                                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                                    Simple explanations
                                </span>

                                <span className="flex items-center gap-2">
                                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                                    Source-backed information
                                </span>
                            </div>
                        </div>

                        {/* Product Analysis Preview */}
                        <div className="relative min-w-0">
                            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3 shadow-xl sm:rounded-3xl sm:p-6">
                                <div className="rounded-xl border border-gray-200 bg-white p-4 sm:rounded-2xl sm:p-5">

                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-xs text-gray-500 sm:text-sm">
                                                Product analysis
                                            </p>

                                            <h2 className="mt-1 break-words text-lg font-bold sm:text-xl">
                                                Chocolate Protein Bar
                                            </h2>
                                        </div>

                                        <div className="shrink-0 rounded-xl bg-emerald-50 px-2.5 py-1.5 text-center sm:px-3 sm:py-2">
                                            <p className="text-[10px] text-emerald-700 sm:text-xs">
                                                Assessment
                                            </p>

                                            <p className="text-sm font-semibold text-emerald-700 sm:text-base">
                                                Regular
                                            </p>
                                        </div>
                                    </div>

                                    <div className="mt-5 grid grid-cols-2 gap-2 sm:mt-6 sm:grid-cols-4 sm:gap-3">
                                        {[
                                            ["Calories", "210"],
                                            ["Protein", "15g"],
                                            ["Sugar", "8g"],
                                            ["Sodium", "180mg"],
                                        ].map(([label, value]) => (
                                            <div
                                                key={label}
                                                className="rounded-xl bg-gray-50 p-3"
                                            >
                                                <p className="text-xs text-gray-500">
                                                    {label}
                                                </p>

                                                <p className="mt-1 text-sm font-semibold sm:text-base">
                                                    {value}
                                                </p>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50 p-3 sm:mt-5 sm:p-4">
                                        <div className="flex gap-2.5 sm:gap-3">
                                            <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />

                                            <div className="min-w-0">
                                                <p className="text-sm font-semibold text-gray-900">
                                                    Sugar deserves attention
                                                </p>

                                                <p className="mt-1 text-xs leading-5 text-gray-600 sm:text-sm sm:leading-6">
                                                    LabelIQ highlights
                                                    nutrients that may
                                                    matter based on the
                                                    product serving.
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-4 flex items-center gap-2 text-xs font-medium text-emerald-700 sm:mt-5 sm:text-sm">
                                        <ShieldCheck className="h-4 w-4 shrink-0" />
                                        Explainable analysis
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* How It Works */}
                <section
                    id="how-it-works"
                    className="border-y border-gray-100 bg-gray-50"
                >
                    <div className="mx-auto w-full max-w-7xl px-3 py-12 sm:px-6 sm:py-20 lg:px-8">
                        <div className="mx-auto max-w-2xl text-center">
                            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600 sm:text-sm">
                                How it works
                            </p>

                            <h2 className="mt-2 text-2xl font-bold tracking-tight sm:mt-3 sm:text-4xl">
                                From label to understanding
                            </h2>

                            <p className="mt-3 text-sm leading-6 text-gray-600 sm:mt-4 sm:text-base">
                                LabelIQ turns complicated product
                                information into something you can
                                actually understand.
                            </p>
                        </div>

                        <div className="mt-8 grid gap-3 sm:mt-12 sm:gap-6 md:grid-cols-3">
                            {[
                                {
                                    number: "01",
                                    icon: ScanLine,
                                    title: "Add a product",
                                    description:
                                        "Provide product information and its nutrition or ingredient label.",
                                },
                                {
                                    number: "02",
                                    icon: FileSearch,
                                    title: "Analyze the label",
                                    description:
                                        "LabelIQ organizes nutrition facts and identifies important ingredients.",
                                },
                                {
                                    number: "03",
                                    icon: ShieldCheck,
                                    title: "Understand the result",
                                    description:
                                        "Get simple explanations backed by calculations and trusted references.",
                                },
                            ].map((step) => {
                                const Icon = step.icon;

                                return (
                                    <div
                                        key={step.number}
                                        className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6"
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50">
                                                <Icon className="h-5 w-5 text-emerald-600" />
                                            </div>

                                            <span className="text-sm font-bold text-gray-300">
                                                {step.number}
                                            </span>
                                        </div>

                                        <h3 className="mt-5 text-lg font-bold sm:mt-6">
                                            {step.title}
                                        </h3>

                                        <p className="mt-2 text-sm leading-6 text-gray-600 sm:text-base">
                                            {step.description}
                                        </p>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </section>

                {/* Features */}
                <section className="mx-auto w-full max-w-7xl px-3 py-12 sm:px-6 sm:py-20 lg:px-8">
                    <div className="grid gap-8 sm:gap-12 lg:grid-cols-2 lg:items-center">

                        <div className="min-w-0">
                            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600 sm:text-sm">
                                Built for clarity
                            </p>

                            <h2 className="mt-2 text-2xl font-bold tracking-tight sm:mt-3 sm:text-4xl">
                                More than just a food score
                            </h2>

                            <p className="mt-3 text-sm leading-6 text-gray-600 sm:mt-4 sm:text-base sm:leading-7">
                                Instead of hiding everything behind a
                                single number, LabelIQ shows you the
                                information behind the assessment.
                            </p>

                            <div className="mt-6 space-y-5 sm:mt-8">
                                {[
                                    {
                                        title: "Nutrition breakdown",
                                        text: "Understand calories, sugar, protein, fat, fiber, sodium, and serving sizes.",
                                    },
                                    {
                                        title: "Ingredient explanations",
                                        text: "See what unfamiliar ingredients are and why they are used.",
                                    },
                                    {
                                        title: "Evidence-backed answers",
                                        text: "Our basic RAG system retrieves reference information before generating explanations.",
                                    },
                                    {
                                        title: "Personalized insights",
                                        text: "Interpret products according to your selected nutrition goal.",
                                    },
                                ].map((feature) => (
                                    <div
                                        key={feature.title}
                                        className="flex gap-3 sm:gap-4"
                                    >
                                        <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-emerald-600" />

                                        <div className="min-w-0">
                                            <h3 className="font-semibold">
                                                {feature.title}
                                            </h3>

                                            <p className="mt-1 text-sm leading-6 text-gray-600">
                                                {feature.text}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="rounded-2xl bg-gray-950 p-5 text-white sm:rounded-3xl sm:p-8">
                            <div className="flex items-start gap-3">
                                <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-emerald-400" />

                                <h3 className="text-lg font-bold sm:text-xl">
                                    Why trust the explanation?
                                </h3>
                            </div>

                            <p className="mt-4 text-sm leading-6 text-gray-300 sm:text-base sm:leading-7">
                                LabelIQ separates product facts,
                                calculations, reference information,
                                and AI-generated explanations.
                            </p>

                            <div className="mt-6 space-y-3 sm:mt-8 sm:space-y-4">
                                {[
                                    "Label-derived information",
                                    "Deterministic nutrition calculations",
                                    "Retrieved reference information",
                                    "AI explanation grounded in that context",
                                ].map((item) => (
                                    <div
                                        key={item}
                                        className="flex items-start gap-3 rounded-xl border border-gray-800 bg-gray-900 p-3.5 sm:p-4"
                                    >
                                        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />

                                        <span className="text-sm leading-5 text-gray-200">
                                            {item}
                                        </span>
                                    </div>
                                ))}
                            </div>

                            <div className="mt-6 flex items-start gap-2 text-xs leading-5 text-gray-400 sm:mt-8 sm:text-sm">
                                <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
                                <span>
                                    AI explains — it doesn't replace the
                                    underlying information.
                                </span>
                            </div>
                        </div>
                    </div>
                </section>

                {/* CTA */}
                <section className="bg-emerald-600">
                    <div className="mx-auto max-w-4xl px-3 py-12 text-center sm:px-6 sm:py-16">
                        <h2 className="text-2xl font-bold tracking-tight text-white sm:text-4xl">
                            Know what's inside before you buy.
                        </h2>

                        <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-emerald-50 sm:mt-4 sm:text-base sm:leading-7">
                            Start understanding packaged food labels
                            with LabelIQ.
                        </p>

                        <Link
                            to="/register"
                            className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-6 py-3.5 font-semibold text-gray-900 transition hover:bg-gray-100 active:bg-gray-200 sm:mt-8"
                        >
                            Get Started
                            <ChevronRight className="h-5 w-5 shrink-0" />
                        </Link>
                    </div>
                </section>
            </main>

            {/* Footer */}
            <footer className="bg-gray-950">
                <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-3 py-6 sm:gap-4 sm:px-6 sm:py-8 md:flex-row md:items-center md:justify-between lg:px-8">
                    <div className="flex items-center gap-2 text-white">
                        <ScanLine className="h-5 w-5 shrink-0 text-emerald-400" />
                        <span className="font-bold">
                            LabelIQ
                        </span>
                    </div>

                    <p className="text-sm text-gray-500">
                        Scan. Understand. Decide.
                    </p>

                    <p className="text-xs text-gray-600 sm:text-sm">
                        © {new Date().getFullYear()} LabelIQ
                    </p>
                </div>
            </footer>
        </div>
    );
};

export default Home;