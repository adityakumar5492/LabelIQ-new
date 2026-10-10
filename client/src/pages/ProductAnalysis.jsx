import { useEffect, useState } from "react";
import {
    ArrowLeft,
    CheckCircle2,
    CircleAlert,
    FileSearch,
    LoaderCircle,
    ShieldCheck,
    Sparkles,
    Target,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";

import api from "../api/axios";
import { useAuth } from "../context/AuthContext";

const ProductAnalysis = () => {
    const { productId } = useParams();
    const { user } = useAuth();

    const [product, setProduct] = useState(null);
    const [nutritionAnalysis, setNutritionAnalysis] =
        useState(null);
    const [ingredientAnalysis, setIngredientAnalysis] =
        useState([]);

    const [selectedServings, setSelectedServings] =
        useState(1);
    const [servingLoading, setServingLoading] =
        useState(false);

    const [aiAnswer, setAiAnswer] = useState("");
    const [aiLoading, setAiLoading] = useState(false);
    const [aiError, setAiError] = useState("");

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    /*
     * Load product and ingredient information.
     */
    useEffect(() => {
        const fetchProductData = async () => {
            try {
                setLoading(true);
                setError("");

                const [
                    productResponse,
                    ingredientResponse,
                ] = await Promise.all([
                    api.get(`/products/${productId}`),
                    api.get(
                        `/ingredients/products/${productId}`
                    ),
                ]);

                const productData =
                    productResponse.data.data;

                setProduct(productData);

                setIngredientAnalysis(
                    ingredientResponse.data.data
                        .ingredients || []
                );

                setSelectedServings(1);
            } catch (error) {
                setError(
                    error.response?.data?.message ||
                        "Unable to load product analysis."
                );
            } finally {
                setLoading(false);
            }
        };

        fetchProductData();
    }, [productId]);

    /*
     * Load nutrition analysis for the selected
     * number of servings.
     */
    useEffect(() => {
        const fetchNutritionAnalysis = async () => {
            if (!productId) {
                return;
            }

            try {
                setServingLoading(true);

                const response = await api.get(
                    `/nutrition/products/${productId}`,
                    {
                        params: {
                            servings: selectedServings,
                        },
                    }
                );

                setNutritionAnalysis(
                    response.data.data
                );
            } catch (error) {
                setError(
                    error.response?.data?.message ||
                        "Unable to load nutrition analysis."
                );
            } finally {
                setServingLoading(false);
            }
        };

        fetchNutritionAnalysis();
    }, [productId, selectedServings]);

    /*
     * Generate Gemini explanation once for the product.
     * Serving changes do not trigger another AI request.
     */
    useEffect(() => {
        if (!product) {
            return;
        }

        const generateAiExplanation = async () => {
            setAiLoading(true);
            setAiError("");
            setAiAnswer("");

            try {
                const response = await api.post(
                    "/rag/ask",
                    {
                        question:
                            "Analyze this food product and explain the result in simple language.",

                        product: {
                            name: product.name,
                            brand: product.brand,
                            category: product.category,
                            servingSize:
                                product.servingSize,
                            nutrition:
                                product.nutrition || {},
                            ingredients:
                                product.ingredients || [],
                        },

                        userPreferences: {
                            goal:
                                user?.preferences
                                    ?.goal || "general",

                            dietaryPreference:
                                user?.preferences
                                    ?.dietaryPreference ||
                                "none",

                            allergens:
                                user?.preferences
                                    ?.allergens || [],

                            ingredientsToAvoid:
                                user?.preferences
                                    ?.ingredientsToAvoid ||
                                [],
                        },
                    }
                );

                setAiAnswer(
                    response.data.data.answer
                );
            } catch (error) {
                setAiError(
                    error.response?.data?.message ||
                        "Unable to generate the explanation."
                );
            } finally {
                setAiLoading(false);
            }
        };

        generateAiExplanation();
    }, [product, user]);

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
                <div className="flex flex-col items-center gap-3 text-center">
                    <LoaderCircle className="h-8 w-8 animate-spin text-emerald-600" />

                    <p className="text-sm text-gray-500">
                        Loading analysis...
                    </p>
                </div>
            </div>
        );
    }

    if (error || !product) {
        return (
            <div className="min-h-screen overflow-x-hidden bg-gray-50">
                <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
                    <Link
                        to="/dashboard"
                        className="inline-flex min-h-10 items-center gap-2 text-sm font-medium text-gray-600 transition hover:text-gray-950"
                    >
                        <ArrowLeft className="h-4 w-4 shrink-0" />
                        Back to dashboard
                    </Link>

                    <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5 sm:mt-8 sm:p-6">
                        <div className="flex items-start gap-3">
                            <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />

                            <div className="min-w-0">
                                <h1 className="font-bold text-red-900">
                                    Unable to load product
                                </h1>

                                <p className="mt-2 break-words text-sm leading-6 text-red-700">
                                    {error ||
                                        "Product not found."}
                                </p>
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        );
    }

    const nutrition =
        nutritionAnalysis?.nutrition ||
        product.nutrition ||
        {};

    const analysis =
        nutritionAnalysis?.analysis || {};

    const flags = Array.isArray(analysis.flags)
        ? analysis.flags
        : [];

    const grade = analysis.grade || null;

    const assessment =
        analysis.assessment ||
        "insufficient-data";

    const goalAlignment =
        analysis.goalAlignment || null;

    const reasons = Array.isArray(analysis.reasons)
        ? analysis.reasons
        : [];

    const missingData = Array.isArray(
        analysis.missingData
    )
        ? analysis.missingData
        : [];

    const confidence =
        analysis.confidence || "low";

    const servingsPerPackage =
        nutritionAnalysis?.product
            ?.servingsPerPackage || null;

    const getAssessmentLabel = () => {
        switch (assessment) {
            case "everyday":
                return "Everyday";

            case "regular":
                return "Regular";

            case "occasional":
                return "Occasional";

            default:
                return "Insufficient data";
        }
    };

    const getAssessmentDescription = () => {
        switch (assessment) {
            case "everyday":
                return "The available label information fits LabelIQ's everyday-use assessment.";

            case "regular":
                return "The available information suggests this product may fit regular consumption, depending on your overall diet and goal.";

            case "occasional":
                return "The available information gives some reasons to keep this product more occasional within your overall eating pattern.";

            default:
                return "There is not enough reliable nutrition information to make a meaningful consumption assessment.";
        }
    };

    const getGradeDescription = () => {
        if (!grade) {
            return "A grade could not be calculated from the available information.";
        }

        return "Based on LabelIQ's nutrition rules. This is not a medical or government rating.";
    };

    const getConfidenceLabel = () => {
        switch (confidence) {
            case "high":
                return "High confidence";

            case "moderate":
                return "Moderate confidence";

            default:
                return "Low confidence";
        }
    };

    const formatFieldName = (field) => {
        return String(field)
            .replace(/([A-Z])/g, " $1")
            .replace(/^./, (character) =>
                character.toUpperCase()
            );
    };

    const getSourceName = (source) => {
        if (typeof source === "string") {
            return source;
        }

        if (
            !source ||
            typeof source !== "object"
        ) {
            return "Trusted source";
        }

        if (
            typeof source.sourceName === "string" &&
            source.sourceName.trim()
        ) {
            return source.sourceName;
        }

        if (
            typeof source.source === "string" &&
            source.source.trim()
        ) {
            return source.source;
        }

        if (
            source.source &&
            typeof source.source === "object"
        ) {
            if (
                typeof source.source.source ===
                "string"
            ) {
                return source.source.source;
            }

            if (
                typeof source.source.sourceName ===
                "string"
            ) {
                return source.source.sourceName;
            }
        }

        return "Trusted source";
    };

    const getSourceUrl = (source) => {
        if (
            !source ||
            typeof source !== "object"
        ) {
            return null;
        }

        if (
            typeof source.url === "string" &&
            source.url.trim()
        ) {
            return source.url;
        }

        if (
            source.source &&
            typeof source.source === "object" &&
            typeof source.source.url === "string"
        ) {
            return source.source.url;
        }

        return null;
    };

    const nutritionItems = [
        [
            "Calories",
            nutrition.calories,
            "kcal",
        ],
        [
            "Protein",
            nutrition.protein,
            "g",
        ],
        [
            "Carbohydrates",
            nutrition.carbohydrates,
            "g",
        ],
        [
            "Total Fat",
            nutrition.totalFat,
            "g",
        ],
        [
            "Sugar",
            nutrition.sugar,
            "g",
        ],
        [
            "Fiber",
            nutrition.fiber,
            "g",
        ],
        [
            "Saturated Fat",
            nutrition.saturatedFat,
            "g",
        ],
        [
            "Sodium",
            nutrition.sodium,
            "mg",
        ],
    ];

    return (
        <div className="min-h-screen overflow-x-hidden bg-gray-50">
            <main className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 sm:py-8 lg:px-8 lg:py-10">

                {/* Back navigation */}
                <Link
                    to="/dashboard"
                    className="inline-flex min-h-10 items-center gap-2 text-sm font-medium text-gray-500 transition hover:text-gray-950"
                >
                    <ArrowLeft className="h-4 w-4 shrink-0" />
                    <span>Back to dashboard</span>
                </Link>

                {/* Product Header */}
                <section className="mt-6 sm:mt-7">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                                    Product analysis
                                </span>

                                <span className="flex items-center gap-1.5 text-xs font-medium text-gray-400">
                                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                                    Ready
                                </span>
                            </div>

                            <h1 className="mt-3 break-words text-2xl font-bold leading-tight tracking-tight text-gray-950 sm:mt-4 sm:text-4xl">
                                {product.name}
                            </h1>

                            {product.brand && (
                                <p className="mt-2 break-words text-sm text-gray-500 sm:text-base">
                                    {product.brand}
                                </p>
                            )}
                        </div>

                        <div className="flex max-w-full flex-wrap gap-2 lg:max-w-md lg:justify-end">
                            {product.category && (
                                <span className="max-w-full break-words rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium capitalize text-gray-600">
                                    {product.category}
                                </span>
                            )}

                            {product.servingSize?.value && (
                                <span className="max-w-full break-words rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600">
                                    {product.servingSize.value}{" "}
                                    {product.servingSize.unit}{" "}
                                    per serving
                                </span>
                            )}
                        </div>
                    </div>
                </section>

                {/* Assessment Hero */}
                <section className="mt-6 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm sm:mt-8 sm:rounded-3xl">
                    <div className="grid lg:grid-cols-[minmax(0,1fr)_280px]">

                        <div className="min-w-0 p-5 sm:p-8 lg:p-10">
                            <div className="flex items-start gap-3 sm:gap-4">
                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 sm:h-12 sm:w-12 sm:rounded-2xl">
                                    <Target className="h-5 w-5 text-emerald-600 sm:h-6 sm:w-6" />
                                </div>

                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-emerald-600">
                                        LabelIQ assessment
                                    </p>

                                    <h2 className="mt-1 text-2xl font-bold tracking-tight text-gray-950 sm:text-3xl">
                                        {getAssessmentLabel()}
                                    </h2>

                                    <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-600">
                                        {getAssessmentDescription()}
                                    </p>
                                </div>
                            </div>

                            {reasons.length > 0 && (
                                <div className="mt-7 sm:mt-8">
                                    <h3 className="text-sm font-semibold text-gray-950">
                                        Why this result?
                                    </h3>

                                    <div className="mt-3 space-y-3">
                                        {reasons.map(
                                            (
                                                reason,
                                                index
                                            ) => (
                                                <div
                                                    key={`${String(
                                                        reason
                                                    )}-${index}`}
                                                    className="flex items-start gap-3"
                                                >
                                                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />

                                                    <p className="min-w-0 break-words text-sm leading-6 text-gray-600">
                                                        {String(
                                                            reason
                                                        )}
                                                    </p>
                                                </div>
                                            )
                                        )}
                                    </div>
                                </div>
                            )}

                            {goalAlignment &&
                                goalAlignment.goal !==
                                    "general" && (
                                    <div className="mt-6 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 sm:mt-7">
                                        <div className="flex items-start gap-3">
                                            <Target className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />

                                            <div className="min-w-0">
                                                <p className="break-words text-sm font-semibold capitalize text-gray-900">
                                                    Your goal:{" "}
                                                    {String(
                                                        goalAlignment.goal
                                                    ).replace(
                                                        "-",
                                                        " "
                                                    )}
                                                </p>

                                                <p className="mt-1 break-words text-sm leading-6 text-gray-600">
                                                    {
                                                        goalAlignment.message
                                                    }
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                            <div className="mt-6 flex flex-wrap items-center gap-2 sm:mt-7">
                                <span className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-600">
                                    {getConfidenceLabel()}
                                </span>

                                {analysis.score !==
                                    null &&
                                    analysis.score !==
                                        undefined && (
                                        <span className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-600">
                                            Score{" "}
                                            {analysis.score}/100
                                        </span>
                                    )}

                                <span className="text-xs text-gray-400">
                                    Based on available label
                                    information
                                </span>
                            </div>
                        </div>

                        {/* Grade */}
                        <div className="flex flex-col items-center justify-center border-t border-gray-200 bg-gray-50 p-6 text-center sm:p-8 lg:border-l lg:border-t-0">
                            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                                Nutrition grade
                            </p>

                            <div className="mt-4 flex h-24 w-24 items-center justify-center rounded-3xl border border-gray-200 bg-white shadow-sm sm:h-28 sm:w-28">
                                <span className="text-4xl font-black text-gray-950 sm:text-5xl">
                                    {grade || "—"}
                                </span>
                            </div>

                            <p className="mt-4 max-w-[240px] text-xs leading-5 text-gray-500">
                                {getGradeDescription()}
                            </p>
                        </div>
                    </div>
                </section>

                {/* Product Details */}
                <section className="mt-5 grid gap-3 sm:mt-6 sm:grid-cols-3 sm:gap-4">
                    <div className="min-w-0 rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
                        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                            Category
                        </p>

                        <p className="mt-2 break-words font-semibold capitalize text-gray-900">
                            {product.category ||
                                "Not provided"}
                        </p>
                    </div>

                    <div className="min-w-0 rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
                        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                            Serving size
                        </p>

                        <p className="mt-2 break-words font-semibold text-gray-900">
                            {product.servingSize?.value
                                ? `${product.servingSize.value} ${product.servingSize.unit}`
                                : "Not provided"}
                        </p>
                    </div>

                    <div className="min-w-0 rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
                        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                            Data source
                        </p>

                        <p className="mt-2 break-words font-semibold capitalize text-gray-900">
                            {product.dataSource ||
                                "Manual"}
                        </p>
                    </div>
                </section>

                {/* Missing Data */}
                {missingData.length > 0 && (
                    <section className="mt-5 rounded-2xl border border-gray-200 bg-white p-5 sm:mt-6 sm:p-7">
                        <div className="flex items-start gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-100">
                                <CircleAlert className="h-5 w-5 text-gray-500" />
                            </div>

                            <div className="min-w-0">
                                <h2 className="font-bold text-gray-950">
                                    Some information is missing
                                </h2>

                                <p className="mt-1 text-sm leading-6 text-gray-500">
                                    These nutrition fields were
                                    not available in the product
                                    data:
                                </p>

                                <div className="mt-4 flex flex-wrap gap-2">
                                    {missingData.map(
                                        (field) => (
                                            <span
                                                key={String(
                                                    field
                                                )}
                                                className="max-w-full break-words rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600"
                                            >
                                                {formatFieldName(
                                                    field
                                                )}
                                            </span>
                                        )
                                    )}
                                </div>
                            </div>
                        </div>
                    </section>
                )}

                {/* Nutrition Breakdown */}
                <section className="mt-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:mt-6 sm:rounded-3xl sm:p-8">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-5">
                        <div className="min-w-0">
                            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">
                                Nutrition
                            </p>

                            <h2 className="mt-1 text-xl font-bold tracking-tight text-gray-950 sm:text-2xl">
                                Nutrition breakdown
                            </h2>

                            <p className="mt-1 text-sm text-gray-500">
                                Values shown for{" "}
                                <span className="font-medium text-gray-700">
                                    {selectedServings}{" "}
                                    {selectedServings ===
                                    1
                                        ? "serving"
                                        : "servings"}
                                </span>
                            </p>
                        </div>

                        <div className="flex w-full items-center justify-between gap-3 rounded-xl bg-gray-50 p-2 sm:w-auto sm:justify-start sm:bg-transparent sm:p-0">
                            <label
                                htmlFor="servings"
                                className="text-sm font-medium text-gray-600"
                            >
                                Servings
                            </label>

                            <select
                                id="servings"
                                value={selectedServings}
                                onChange={(event) =>
                                    setSelectedServings(
                                        Number(
                                            event.target
                                                .value
                                        )
                                    )
                                }
                                disabled={servingLoading}
                                className="min-h-10 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {[1, 2, 3, 4, 5, 6].map(
                                    (serving) => (
                                        <option
                                            key={serving}
                                            value={serving}
                                        >
                                            {serving}
                                        </option>
                                    )
                                )}
                            </select>
                        </div>
                    </div>

                    {servingsPerPackage && (
                        <div className="mt-4 rounded-xl bg-gray-50 px-4 py-3 sm:mt-5">
                            <p className="text-xs leading-5 text-gray-500">
                                Approximately{" "}
                                <span className="font-semibold text-gray-700">
                                    {servingsPerPackage}
                                </span>{" "}
                                servings per package.
                            </p>
                        </div>
                    )}

                    <div className="relative">
                        {servingLoading && (
                            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/75 px-4 backdrop-blur-[1px]">
                                <div className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-600 shadow-sm">
                                    <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-emerald-600" />
                                    Updating...
                                </div>
                            </div>
                        )}

                        <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
                            {nutritionItems.map(
                                ([
                                    label,
                                    value,
                                    unit,
                                ]) => (
                                    <div
                                        key={label}
                                        className="min-w-0 rounded-2xl border border-gray-100 bg-gray-50 p-3 sm:p-4"
                                    >
                                        <p className="truncate text-xs font-medium text-gray-500">
                                            {label}
                                        </p>

                                        <p className="mt-2 break-words text-lg font-bold tracking-tight text-gray-950 sm:text-xl">
                                            {value ?? "—"}

                                            {value !==
                                                undefined &&
                                                value !==
                                                    null && (
                                                    <span className="ml-1 text-[11px] font-semibold text-gray-400 sm:text-xs">
                                                        {unit}
                                                    </span>
                                                )}
                                        </p>
                                    </div>
                                )
                            )}
                        </div>
                    </div>
                </section>

                {/* Nutrition Flags */}
                {flags.length > 0 && (
                    <section className="mt-5 sm:mt-6">
                        <div className="mb-3">
                            <p className="text-xs font-semibold uppercase tracking-wider text-amber-600">
                                Things to notice
                            </p>

                            <h2 className="mt-1 text-xl font-bold text-gray-950">
                                Nutrition flags
                            </h2>
                        </div>

                        <div className="space-y-3">
                            {flags.map(
                                (flag, index) => (
                                    <div
                                        key={`${flag.nutrient || "flag"}-${index}`}
                                        className="rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-5"
                                    >
                                        <div className="flex items-start gap-3">
                                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/70">
                                                <CircleAlert className="h-5 w-5 text-amber-600" />
                                            </div>

                                            <div className="min-w-0">
                                                <h3 className="break-words font-bold capitalize text-gray-900">
                                                    {
                                                        flag.nutrient
                                                    }

                                                    {flag.level && (
                                                        <span className="ml-2 font-medium text-amber-700">
                                                            {
                                                                flag.level
                                                            }
                                                        </span>
                                                    )}
                                                </h3>

                                                <p className="mt-1 break-words text-sm leading-6 text-gray-600">
                                                    {
                                                        flag.message
                                                    }
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )
                            )}
                        </div>
                    </section>
                )}

                {/* Daily Contribution */}
                {Object.keys(
                    analysis.dailyContribution || {}
                ).length > 0 && (
                    <section className="mt-5 rounded-2xl border border-gray-200 bg-white p-5 sm:mt-6 sm:p-8">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                                Daily reference
                            </p>

                            <h2 className="mt-1 text-xl font-bold text-gray-950">
                                Daily value contribution
                            </h2>

                            <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-500">
                                Approximate contribution based
                                on LabelIQ's configured daily
                                reference values.
                            </p>
                        </div>

                        <div className="mt-5 grid grid-cols-2 gap-2.5 sm:mt-6 sm:grid-cols-4 sm:gap-3">
                            {Object.entries(
                                analysis.dailyContribution
                            ).map(
                                ([
                                    nutrient,
                                    percentage,
                                ]) => (
                                    <div
                                        key={nutrient}
                                        className="min-w-0 rounded-2xl border border-gray-100 bg-gray-50 p-3 sm:p-4"
                                    >
                                        <p className="break-words text-xs font-medium capitalize text-gray-500">
                                            {formatFieldName(
                                                nutrient
                                            )}
                                        </p>

                                        <p className="mt-2 text-lg font-bold text-gray-950 sm:text-xl">
                                            {percentage}%
                                        </p>
                                    </div>
                                )
                            )}
                        </div>
                    </section>
                )}

                {/* Ingredient Insights */}
                <section className="mt-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:mt-6 sm:rounded-3xl sm:p-8">
                    <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 sm:h-11 sm:w-11 sm:rounded-2xl">
                            <FileSearch className="h-5 w-5 text-gray-600" />
                        </div>

                        <div className="min-w-0">
                            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                                Ingredients
                            </p>

                            <h2 className="mt-1 text-xl font-bold tracking-tight text-gray-950 sm:text-2xl">
                                Ingredient insights
                            </h2>

                            <p className="mt-1 text-sm leading-6 text-gray-500">
                                Information from the available
                                knowledge base and trusted
                                references.
                            </p>
                        </div>
                    </div>

                    {ingredientAnalysis.length ===
                    0 ? (
                        <div className="mt-5 rounded-2xl bg-gray-50 p-4 sm:mt-6 sm:p-5">
                            <p className="text-sm text-gray-500">
                                No ingredients were provided
                                for this product.
                            </p>
                        </div>
                    ) : (
                        <div className="mt-5 space-y-3 sm:mt-6">
                            {ingredientAnalysis.map(
                                (
                                    ingredient,
                                    ingredientIndex
                                ) => {
                                    const trustedEvidence =
                                        Array.isArray(
                                            ingredient.trustedEvidence
                                        )
                                            ? ingredient.trustedEvidence
                                            : [];

                                    const possibleUses =
                                        trustedEvidence.flatMap(
                                            (evidence) =>
                                                Array.isArray(
                                                    evidence?.possibleUses
                                                )
                                                    ? evidence.possibleUses
                                                    : []
                                        );

                                    const uniquePossibleUses =
                                        [
                                            ...new Set(
                                                possibleUses
                                                    .filter(
                                                        Boolean
                                                    )
                                                    .map(
                                                        (
                                                            use
                                                        ) =>
                                                            typeof use ===
                                                            "string"
                                                                ? use
                                                                : use?.description ||
                                                                  use?.name ||
                                                                  null
                                                    )
                                                    .filter(
                                                        Boolean
                                                    )
                                            ),
                                        ];

                                    const sources =
                                        trustedEvidence
                                            .map(
                                                (
                                                    evidence
                                                ) =>
                                                    evidence?.source
                                            )
                                            .filter(
                                                Boolean
                                            );

                                    return (
                                        <div
                                            key={`${ingredient.name || "ingredient"}-${ingredientIndex}`}
                                            className="min-w-0 rounded-2xl border border-gray-200 bg-gray-50 p-4 sm:p-5"
                                        >
                                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                                <div className="min-w-0">
                                                    <h3 className="break-words text-base font-bold text-gray-950">
                                                        {
                                                            ingredient.name
                                                        }
                                                    </h3>

                                                    {ingredient.purpose && (
                                                        <p className="mt-1 break-words text-sm text-gray-500">
                                                            {typeof ingredient.purpose ===
                                                            "string"
                                                                ? ingredient.purpose
                                                                : ingredient
                                                                      .purpose
                                                                      ?.description ||
                                                                  "Purpose information available."}
                                                        </p>
                                                    )}
                                                </div>

                                                <span
                                                    className={
                                                        ingredient.informationAvailable
                                                            ? "flex w-fit max-w-full shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700"
                                                            : "flex w-fit max-w-full shrink-0 items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-500"
                                                    }
                                                >
                                                    {ingredient.informationAvailable && (
                                                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                                                    )}

                                                    <span>
                                                        {ingredient.informationAvailable
                                                            ? "Reference found"
                                                            : "No reference found"}
                                                    </span>
                                                </span>
                                            </div>

                                            {uniquePossibleUses.length >
                                                0 && (
                                                <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4 sm:mt-5">
                                                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                                                        Possible food
                                                        uses
                                                    </p>

                                                    <ul className="mt-3 space-y-2">
                                                        {uniquePossibleUses.map(
                                                            (
                                                                use,
                                                                index
                                                            ) => (
                                                                <li
                                                                    key={`${use}-${index}`}
                                                                    className="flex items-start gap-2 text-sm leading-6 text-gray-600"
                                                                >
                                                                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />

                                                                    <span className="min-w-0 break-words">
                                                                        {
                                                                            use
                                                                        }
                                                                    </span>
                                                                </li>
                                                            )
                                                        )}
                                                    </ul>
                                                </div>
                                            )}

                                            {ingredient.informationAvailable &&
                                                trustedEvidence.length >
                                                    0 && (
                                                    <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
                                                        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                                                            What the
                                                            reference
                                                            tells us
                                                        </p>

                                                        <p className="mt-2 text-sm leading-6 text-gray-600">
                                                            Trusted
                                                            references
                                                            describe
                                                            possible
                                                            food uses
                                                            for this
                                                            ingredient.
                                                            Its exact
                                                            function in
                                                            this specific
                                                            product cannot
                                                            be confirmed
                                                            from the label
                                                            alone.
                                                        </p>
                                                    </div>
                                                )}

                                            {sources.length >
                                                0 && (
                                                <div className="mt-4">
                                                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                                                        References
                                                    </p>

                                                    <div className="mt-2 space-y-2">
                                                        {sources.map(
                                                            (
                                                                source,
                                                                index
                                                            ) => {
                                                                const sourceName =
                                                                    getSourceName(
                                                                        source
                                                                    );

                                                                const sourceUrl =
                                                                    getSourceUrl(
                                                                        source
                                                                    );

                                                                return (
                                                                    <div
                                                                        key={`${sourceName}-${index}`}
                                                                        className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                                                                    >
                                                                        <div className="flex min-w-0 items-start gap-2">
                                                                            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />

                                                                            <p className="min-w-0 break-words text-sm font-medium text-gray-700">
                                                                                {
                                                                                    sourceName
                                                                                }
                                                                            </p>
                                                                        </div>

                                                                        {sourceUrl && (
                                                                            <a
                                                                                href={
                                                                                    sourceUrl
                                                                                }
                                                                                target="_blank"
                                                                                rel="noopener noreferrer"
                                                                                className="inline-flex min-h-9 w-fit shrink-0 items-center text-xs font-semibold text-emerald-600 transition hover:text-emerald-700"
                                                                            >
                                                                                View
                                                                                source
                                                                                →
                                                                            </a>
                                                                        )}
                                                                    </div>
                                                                );
                                                            }
                                                        )}
                                                    </div>
                                                </div>
                                            )}

                                            {!ingredient.informationAvailable && (
                                                <p className="mt-4 break-words text-sm leading-6 text-gray-500">
                                                    No reliable reference
                                                    information is
                                                    currently available
                                                    for this ingredient.
                                                </p>
                                            )}
                                        </div>
                                    );
                                }
                            )}
                        </div>
                    )}
                </section>

                {/* AI Explanation */}
                <section className="mt-5 overflow-hidden rounded-2xl bg-gray-950 shadow-sm sm:mt-6 sm:rounded-3xl">
                    <div className="p-5 sm:p-8 lg:p-10">
                        <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 sm:h-11 sm:w-11 sm:rounded-2xl">
                                <Sparkles className="h-5 w-5 text-emerald-400" />
                            </div>

                            <div className="min-w-0">
                                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                                    Simple explanation
                                </p>

                                <h2 className="mt-1 text-xl font-bold text-white sm:text-2xl">
                                    LabelIQ analysis
                                </h2>

                                <p className="mt-1 text-sm leading-6 text-gray-400">
                                    A plain-language explanation of
                                    the available product information.
                                </p>
                            </div>
                        </div>

                        {aiLoading ? (
                            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4 sm:mt-7 sm:p-5">
                                <div className="flex items-center gap-3 text-gray-400">
                                    <LoaderCircle className="h-5 w-5 shrink-0 animate-spin text-emerald-400" />

                                    <span className="text-sm">
                                        Preparing your explanation...
                                    </span>
                                </div>
                            </div>
                        ) : aiError ? (
                            <div className="mt-6 rounded-2xl border border-red-900 bg-red-950/40 p-4 sm:mt-7 sm:p-5">
                                <div className="flex items-start gap-3">
                                    <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />

                                    <p className="min-w-0 break-words text-sm leading-6 text-red-300">
                                        {aiError}
                                    </p>
                                </div>
                            </div>
                        ) : aiAnswer ? (
                            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4 sm:mt-7 sm:p-6">
                                <p className="whitespace-pre-line break-words text-sm leading-7 text-gray-300">
                                    {aiAnswer}
                                </p>
                            </div>
                        ) : (
                            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4 sm:mt-7">
                                <p className="text-sm leading-6 text-gray-400">
                                    No explanation is available right
                                    now.
                                </p>
                            </div>
                        )}

                        <div className="mt-5 flex items-start gap-2 border-t border-white/10 pt-5">
                            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />

                            <p className="min-w-0 text-xs leading-5 text-gray-500">
                                This explanation uses the available
                                product information and reference
                                evidence. Always use the original food
                                label for the underlying values.
                            </p>
                        </div>
                    </div>
                </section>

                {/* Bottom spacing */}
                <div className="h-6 sm:h-8" />
            </main>
        </div>
    );
};

export default ProductAnalysis;