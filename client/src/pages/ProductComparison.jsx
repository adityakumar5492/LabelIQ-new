import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
    ArrowLeft,
    ArrowRight,
    Check,
    ChevronDown,
    Loader2,
    Scale,
    ShieldCheck,
    Sparkles,
    Trophy,
} from "lucide-react";
import api from "../api/axios";

const nutritionFields = [
    {
        key: "calories",
        label: "Calories",
        unit: "kcal",
        higherIsBetter: false,
    },
    {
        key: "protein",
        label: "Protein",
        unit: "g",
        higherIsBetter: true,
    },
    {
        key: "carbohydrates",
        label: "Carbohydrates",
        unit: "g",
        higherIsBetter: false,
    },
    {
        key: "totalFat",
        label: "Total fat",
        unit: "g",
        higherIsBetter: false,
    },
    {
        key: "saturatedFat",
        label: "Saturated fat",
        unit: "g",
        higherIsBetter: false,
    },
    {
        key: "sugar",
        label: "Sugar",
        unit: "g",
        higherIsBetter: false,
    },
    {
        key: "fiber",
        label: "Fiber",
        unit: "g",
        higherIsBetter: true,
    },
    {
        key: "sodium",
        label: "Sodium",
        unit: "mg",
        higherIsBetter: false,
    },
];

const getProductId = (product) =>
    product?._id ||
    product?.id ||
    product?.productId ||
    "";

const getProductName = (product) =>
    product?.name || "Unnamed product";

const getBrand = (product) =>
    product?.brand || "Unknown brand";

const formatGoal = (goal) => {
    if (!goal || goal === "general") {
        return "General";
    }

    return goal
        .split("-")
        .map(
            (word) =>
                word.charAt(0).toUpperCase() +
                word.slice(1)
        )
        .join(" ");
};

const formatValue = (value) => {
    if (
        value === undefined ||
        value === null ||
        Number.isNaN(Number(value))
    ) {
        return "—";
    }

    return Number(value).toLocaleString(
        undefined,
        {
            maximumFractionDigits: 2,
        }
    );
};

const getGradeClasses = (grade) => {
    switch (grade) {
        case "A":
            return "bg-emerald-50 text-emerald-700 border-emerald-200";

        case "B":
            return "bg-lime-50 text-lime-700 border-lime-200";

        case "C":
            return "bg-amber-50 text-amber-700 border-amber-200";

        case "D":
            return "bg-orange-50 text-orange-700 border-orange-200";

        case "E":
            return "bg-red-50 text-red-700 border-red-200";

        default:
            return "bg-gray-50 text-gray-600 border-gray-200";
    }
};

const getReasonText = (
    reason,
    products
) => {
    if (!reason?.message) {
        return null;
    }

    const product1Name =
        getProductName(products?.[0]);

    const product2Name =
        getProductName(products?.[1]);

    return reason.message
        .replaceAll(
            "Product 1",
            product1Name
        )
        .replaceAll(
            "Product 2",
            product2Name
        );
};

/*
 * Product summary card.
 */
const ProductCard = ({
    product,
    isWinner,
    comparisonScore,
    side,
}) => {
    const analysis =
        product?.analysis || {};

    const nutrition =
        product?.nutrition || {};

    return (
        <div
            className={`relative min-w-0 overflow-hidden rounded-2xl border bg-white p-4 transition sm:p-5 ${
                isWinner
                    ? "border-emerald-300 shadow-md shadow-emerald-100/60"
                    : "border-gray-200"
            }`}
        >
            {isWinner && (
                <div className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 sm:right-4 sm:top-4 sm:text-xs">
                    <Trophy className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                    Better choice
                </div>
            )}

            <div className="flex min-w-0 items-start gap-3 sm:gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 sm:h-12 sm:w-12">
                    <Scale className="h-5 w-5" />
                </div>

                <div className="min-w-0 flex-1 pr-20 sm:pr-16">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 sm:text-xs">
                        {side}
                    </p>

                    <h2 className="mt-1 break-words text-base font-bold leading-5 text-gray-900 sm:text-lg sm:leading-6">
                        {getProductName(product)}
                    </h2>

                    <p className="mt-0.5 break-words text-xs text-gray-500 sm:text-sm">
                        {getBrand(product)}
                    </p>
                </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-2.5 min-[360px]:grid-cols-3 sm:mt-5 sm:gap-3">
                <div className="rounded-xl bg-gray-50 p-3">
                    <p className="text-[11px] text-gray-500">
                        Grade
                    </p>

                    <div
                        className={`mt-2 inline-flex h-8 w-8 items-center justify-center rounded-lg border text-sm font-bold ${getGradeClasses(
                            analysis.grade
                        )}`}
                    >
                        {analysis.grade || "—"}
                    </div>
                </div>

                <div className="rounded-xl bg-gray-50 p-3">
                    <p className="text-[11px] leading-4 text-gray-500">
                        Individual score
                    </p>

                    <p className="mt-2 text-lg font-bold text-gray-900">
                        {analysis.score ?? "—"}

                        <span className="text-xs font-medium text-gray-400">
                            /100
                        </span>
                    </p>
                </div>

                <div className="rounded-xl bg-emerald-50 p-3">
                    <p className="text-[11px] leading-4 text-emerald-600">
                        Comparison score
                    </p>

                    <p className="mt-2 text-lg font-bold text-emerald-700">
                        {comparisonScore ?? "—"}

                        <span className="text-xs font-medium text-emerald-500">
                            /100
                        </span>
                    </p>
                </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
                {product?.servingSize?.value && (
                    <span className="max-w-full break-words rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-600">
                        Serving:{" "}
                        {product.servingSize.value}{" "}
                        {product.servingSize.unit}
                    </span>
                )}

                {analysis.confidence && (
                    <span className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs capitalize text-gray-600">
                        {analysis.confidence} confidence
                    </span>
                )}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:mt-5 sm:grid-cols-4">
                {[
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
                        "Sugar",
                        nutrition.sugar,
                        "g",
                    ],
                    [
                        "Sodium",
                        nutrition.sodium,
                        "mg",
                    ],
                ].map(
                    ([
                        label,
                        value,
                        unit,
                    ]) => (
                        <div
                            key={label}
                            className="min-w-0 rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-2.5"
                        >
                            <p className="truncate text-[11px] text-gray-400">
                                {label}
                            </p>

                            <p className="mt-1 break-words text-sm font-semibold text-gray-800">
                                {formatValue(
                                    value
                                )}

                                {value !==
                                    undefined &&
                                    value !==
                                        null && (
                                        <span className="ml-1 text-[10px] font-medium text-gray-400">
                                            {unit}
                                        </span>
                                    )}
                            </p>
                        </div>
                    )
                )}
            </div>
        </div>
    );
};

/*
 * Metric-by-metric comparison row.
 */
const ComparisonRow = ({
    field,
    product1,
    product2,
}) => {
    const value1 =
        product1?.nutrition?.[
            field.key
        ];

    const value2 =
        product2?.nutrition?.[
            field.key
        ];

    const hasValue1 =
        value1 !== undefined &&
        value1 !== null &&
        Number.isFinite(
            Number(value1)
        );

    const hasValue2 =
        value2 !== undefined &&
        value2 !== null &&
        Number.isFinite(
            Number(value2)
        );

    let winner = null;

    if (hasValue1 && hasValue2) {
        const number1 =
            Number(value1);

        const number2 =
            Number(value2);

        if (number1 !== number2) {
            if (field.higherIsBetter) {
                winner =
                    number1 > number2
                        ? "one"
                        : "two";
            } else {
                winner =
                    number1 < number2
                        ? "one"
                        : "two";
            }
        }
    }

    return (
        <div className="border-t border-gray-100 py-3.5 first:border-t-0 sm:py-4">
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-3">

                <div
                    className={`min-w-0 rounded-xl px-2.5 py-2.5 text-left sm:px-3 sm:py-3 sm:text-right ${
                        winner === "one"
                            ? "bg-emerald-50"
                            : "bg-gray-50"
                    }`}
                >
                    <p
                        className={`break-words text-sm font-semibold ${
                            winner === "one"
                                ? "text-emerald-700"
                                : "text-gray-800"
                        }`}
                    >
                        {formatValue(value1)}

                        {hasValue1 && (
                            <span className="ml-1 text-[10px] font-medium text-gray-400 sm:text-xs">
                                {field.unit}
                            </span>
                        )}
                    </p>

                    {winner === "one" && (
                        <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
                            <Check className="h-3 w-3" />
                            Better
                        </span>
                    )}
                </div>

                <div className="w-[86px] text-center sm:w-24">
                    <p className="break-words text-[11px] font-semibold leading-4 text-gray-700 sm:text-xs">
                        {field.label}
                    </p>

                    <p className="mt-0.5 hidden text-[10px] leading-3 text-gray-400 min-[400px]:block">
                        {field.higherIsBetter
                            ? "Higher is better"
                            : "Lower is better"}
                    </p>
                </div>

                <div
                    className={`min-w-0 rounded-xl px-2.5 py-2.5 text-left sm:px-3 sm:py-3 ${
                        winner === "two"
                            ? "bg-emerald-50"
                            : "bg-gray-50"
                    }`}
                >
                    <p
                        className={`break-words text-sm font-semibold ${
                            winner === "two"
                                ? "text-emerald-700"
                                : "text-gray-800"
                        }`}
                    >
                        {formatValue(value2)}

                        {hasValue2 && (
                            <span className="ml-1 text-[10px] font-medium text-gray-400 sm:text-xs">
                                {field.unit}
                            </span>
                        )}
                    </p>

                    {winner === "two" && (
                        <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
                            <Check className="h-3 w-3" />
                            Better
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
};

const ProductComparison = () => {
    const [products, setProducts] =
        useState([]);

    const [product1Id, setProduct1Id] =
        useState("");

    const [product2Id, setProduct2Id] =
        useState("");

    const [
        loadingProducts,
        setLoadingProducts,
    ] = useState(true);

    const [comparing, setComparing] =
        useState(false);

    const [comparison, setComparison] =
        useState(null);

    const [error, setError] =
        useState("");

    /*
     * Load products.
     */
    useEffect(() => {
        const loadProducts =
            async () => {
                setLoadingProducts(
                    true
                );

                setError("");

                try {
                    const response =
                        await api.get(
                            "/products"
                        );

                    const receivedProducts =
                        response?.data
                            ?.data?.products ||
                        response?.data
                            ?.products ||
                        response?.data
                            ?.data ||
                        [];

                    setProducts(
                        Array.isArray(
                            receivedProducts
                        )
                            ? receivedProducts
                            : []
                    );
                } catch (
                    requestError
                ) {
                    setError(
                        requestError
                            ?.response
                            ?.data
                            ?.message ||
                            "Unable to load products."
                    );
                } finally {
                    setLoadingProducts(
                        false
                    );
                }
            };

        loadProducts();
    }, []);

    const selectedProduct1 =
        useMemo(
            () =>
                products.find(
                    (product) =>
                        getProductId(
                            product
                        ) ===
                        product1Id
                ),
            [
                products,
                product1Id,
            ]
        );

    const selectedProduct2 =
        useMemo(
            () =>
                products.find(
                    (product) =>
                        getProductId(
                            product
                        ) ===
                        product2Id
                ),
            [
                products,
                product2Id,
            ]
        );

    /*
     * Compare selected products.
     */
    const handleCompare =
        async () => {
            if (
                !product1Id ||
                !product2Id
            ) {
                setError(
                    "Please select two products."
                );

                return;
            }

            if (
                product1Id ===
                product2Id
            ) {
                setError(
                    "Please select two different products."
                );

                return;
            }

            setComparing(true);
            setError("");
            setComparison(null);

            try {
                const response =
                    await api.get(
                        `/products/compare/${product1Id}/${product2Id}`
                    );

                const result =
                    response?.data
                        ?.data;

                if (
                    !result?.products ||
                    result.products
                        .length < 2
                ) {
                    throw new Error(
                        "Comparison data is incomplete."
                    );
                }

                setComparison(
                    result
                );
            } catch (
                requestError
            ) {
                setError(
                    requestError
                        ?.response
                        ?.data
                        ?.message ||
                        requestError?.message ||
                        "Unable to compare the selected products."
                );
            } finally {
                setComparing(
                    false
                );
            }
        };

    const winnerId =
        comparison?.comparison
            ?.winner;

    const winnerProduct =
        winnerId &&
        winnerId !== "tie"
            ? comparison?.products?.find(
                  (product) =>
                      String(
                          product.id
                      ) ===
                      String(
                          winnerId
                      )
              )
            : null;

    const winnerIndex =
        winnerId &&
        winnerId !== "tie"
            ? comparison?.products?.findIndex(
                  (product) =>
                      String(
                          product.id
                      ) ===
                      String(
                          winnerId
                      )
              )
            : -1;

    const winnerScore =
        winnerIndex === 0
            ? comparison?.comparison
                  ?.product1Score
            : winnerIndex === 1
              ? comparison?.comparison
                    ?.product2Score
              : null;

    return (
        <main className="min-h-screen overflow-x-hidden bg-gray-50">
            <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 sm:py-8 lg:px-8">

                {/* Back navigation */}
                <Link
                    to="/dashboard"
                    className="inline-flex min-h-10 items-center gap-2 text-sm font-medium text-gray-500 transition hover:text-gray-900"
                >
                    <ArrowLeft className="h-4 w-4 shrink-0" />
                    <span>Back to dashboard</span>
                </Link>

                {/* Page heading */}
                <div className="mt-6 sm:mt-8">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                            <Scale className="h-5 w-5" />
                        </div>

                        <p className="text-sm font-semibold text-emerald-600">
                            Product Comparison
                        </p>
                    </div>

                    <h1 className="mt-3 break-words text-2xl font-bold leading-tight tracking-tight text-gray-950 sm:mt-4 sm:text-4xl">
                        Compare products smarter
                    </h1>

                    <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500 sm:text-lg">
                        Compare nutrition and see
                        which product better matches
                        your goal.
                    </p>
                </div>

                {/* Product selection */}
                <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:mt-8 sm:rounded-3xl sm:p-7">
                    <div className="flex items-start gap-3 sm:gap-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 sm:h-11 sm:w-11">
                            <ArrowRight className="h-5 w-5" />
                        </div>

                        <div className="min-w-0">
                            <h2 className="text-base font-semibold text-gray-900 sm:text-lg">
                                Choose two products
                            </h2>

                            <p className="mt-1 text-sm leading-5 text-gray-500">
                                Select products to see which
                                one is the better match.
                            </p>
                        </div>
                    </div>

                    {error && (
                        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 sm:mt-5">
                            <p className="break-words text-sm font-medium text-red-700">
                                {error}
                            </p>
                        </div>
                    )}

                    <div className="mt-5 grid gap-4 sm:mt-7 md:grid-cols-2 md:gap-5">

                        {/* Product 1 */}
                        <div className="min-w-0">
                            <label
                                htmlFor="product-one"
                                className="mb-2 block text-sm font-semibold text-gray-700"
                            >
                                Product 1
                            </label>

                            <div className="relative">
                                <select
                                    id="product-one"
                                    value={product1Id}
                                    onChange={(
                                        event
                                    ) => {
                                        setProduct1Id(
                                            event
                                                .target
                                                .value
                                        );

                                        setComparison(
                                            null
                                        );

                                        setError(
                                            ""
                                        );
                                    }}
                                    disabled={
                                        loadingProducts ||
                                        comparing
                                    }
                                    className="min-h-12 w-full appearance-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 pr-10 text-sm text-gray-900 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    <option value="">
                                        {loadingProducts
                                            ? "Loading products..."
                                            : "Select a product"}
                                    </option>

                                    {products.map(
                                        (
                                            product
                                        ) => {
                                            const id =
                                                getProductId(
                                                    product
                                                );

                                            return (
                                                <option
                                                    key={
                                                        id
                                                    }
                                                    value={
                                                        id
                                                    }
                                                    disabled={
                                                        id ===
                                                        product2Id
                                                    }
                                                >
                                                    {getProductName(
                                                        product
                                                    )}

                                                    {getBrand(
                                                        product
                                                    )
                                                        ? ` — ${getBrand(
                                                              product
                                                          )}`
                                                        : ""}
                                                </option>
                                            );
                                        }
                                    )}
                                </select>

                                <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                            </div>
                        </div>

                        {/* Product 2 */}
                        <div className="min-w-0">
                            <label
                                htmlFor="product-two"
                                className="mb-2 block text-sm font-semibold text-gray-700"
                            >
                                Product 2
                            </label>

                            <div className="relative">
                                <select
                                    id="product-two"
                                    value={product2Id}
                                    onChange={(
                                        event
                                    ) => {
                                        setProduct2Id(
                                            event
                                                .target
                                                .value
                                        );

                                        setComparison(
                                            null
                                        );

                                        setError(
                                            ""
                                        );
                                    }}
                                    disabled={
                                        loadingProducts ||
                                        comparing
                                    }
                                    className="min-h-12 w-full appearance-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 pr-10 text-sm text-gray-900 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    <option value="">
                                        {loadingProducts
                                            ? "Loading products..."
                                            : "Select a product"}
                                    </option>

                                    {products.map(
                                        (
                                            product
                                        ) => {
                                            const id =
                                                getProductId(
                                                    product
                                                );

                                            return (
                                                <option
                                                    key={
                                                        id
                                                    }
                                                    value={
                                                        id
                                                    }
                                                    disabled={
                                                        id ===
                                                        product1Id
                                                    }
                                                >
                                                    {getProductName(
                                                        product
                                                    )}

                                                    {getBrand(
                                                        product
                                                    )
                                                        ? ` — ${getBrand(
                                                              product
                                                          )}`
                                                        : ""}
                                                </option>
                                            );
                                        }
                                    )}
                                </select>

                                <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                            </div>
                        </div>
                    </div>

                    <div className="mt-4 sm:mt-6">
                        <button
                            type="button"
                            onClick={
                                handleCompare
                            }
                            disabled={
                                !product1Id ||
                                !product2Id ||
                                comparing ||
                                loadingProducts
                            }
                            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-gray-400 sm:w-auto"
                        >
                            {comparing ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Comparing...
                                </>
                            ) : (
                                <>
                                    <Scale className="h-4 w-4" />
                                    Compare Products
                                </>
                            )}
                        </button>
                    </div>
                </section>

                {/* Empty state */}
                {!comparison &&
                    !comparing && (
                        <section className="mt-6 rounded-2xl border border-dashed border-gray-300 bg-white px-5 py-12 text-center sm:mt-8 sm:rounded-3xl sm:px-10 sm:py-16">
                            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-gray-400 sm:h-16 sm:w-16">
                                <Scale className="h-6 w-6 sm:h-7 sm:w-7" />
                            </div>

                            <h2 className="mt-4 text-lg font-semibold text-gray-900 sm:mt-5 sm:text-xl">
                                Ready to compare
                            </h2>

                            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-gray-500">
                                Choose two products above
                                and LabelIQ will recommend
                                the stronger match based
                                on your nutrition goal.
                            </p>
                        </section>
                    )}

                {/* Loading state */}
                {comparing && (
                    <section className="mt-6 rounded-2xl border border-gray-200 bg-white px-5 py-12 text-center sm:mt-8 sm:rounded-3xl sm:px-6 sm:py-16">
                        <Loader2 className="mx-auto h-8 w-8 animate-spin text-emerald-600" />

                        <h2 className="mt-4 text-lg font-semibold text-gray-900">
                            Comparing products
                        </h2>

                        <p className="mt-1 text-sm text-gray-500">
                            Analyzing the selected
                            nutrition data...
                        </p>
                    </section>
                )}

                {/* Results */}
                {comparison && (
                    <div className="mt-6 space-y-5 sm:mt-8 sm:space-y-6">

                        {/* Main recommendation */}
                        <section className="overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50/70 sm:rounded-3xl">
                            <div className="p-4 sm:p-7">
                                <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">

                                    <div className="flex min-w-0 items-start gap-3 sm:gap-4">
                                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-600 shadow-sm sm:h-12 sm:w-12 sm:rounded-2xl">
                                            {winnerProduct ? (
                                                <Trophy className="h-5 w-5 sm:h-6 sm:w-6" />
                                            ) : (
                                                <Scale className="h-5 w-5 sm:h-6 sm:w-6" />
                                            )}
                                        </div>

                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold text-emerald-700">
                                                LabelIQ recommendation
                                            </p>

                                            <h2 className="mt-1 break-words text-xl font-bold leading-tight text-gray-950 sm:text-2xl">
                                                {winnerProduct
                                                    ? getProductName(
                                                          winnerProduct
                                                      )
                                                    : winnerId ===
                                                        "tie"
                                                      ? "Both products are very close"
                                                      : "No clear winner"}
                                            </h2>

                                            <p className="mt-1 break-words text-sm leading-6 text-gray-600">
                                                {winnerProduct
                                                    ? "This product is the stronger overall match for your selected goal."
                                                    : comparison
                                                          ?.comparison
                                                          ?.message ||
                                                      "The products are very close based on the available nutrition data."}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2.5 sm:flex sm:gap-3">
                                        {winnerProduct && (
                                            <div className="min-w-0 rounded-2xl bg-white px-3 py-3 text-center shadow-sm sm:px-5 sm:py-4">
                                                <p className="text-[11px] font-medium text-gray-400 sm:text-xs">
                                                    Better match
                                                </p>

                                                <p className="mt-1 text-2xl font-bold text-emerald-600 sm:text-3xl">
                                                    {winnerScore}
                                                </p>

                                                <p className="text-[10px] text-gray-400 sm:text-xs">
                                                    comparison score
                                                </p>
                                            </div>
                                        )}

                                        <div className="min-w-0 rounded-2xl bg-white px-3 py-3 text-center shadow-sm sm:px-5 sm:py-4">
                                            <p className="text-[11px] font-medium text-gray-400 sm:text-xs">
                                                Your goal
                                            </p>

                                            <p className="mt-2 break-words text-sm font-bold text-gray-900">
                                                {formatGoal(
                                                    comparison.goal
                                                )}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Why / tradeoff */}
                            {winnerProduct &&
                                (comparison
                                    ?.comparison
                                    ?.reasons
                                    ?.length ||
                                    comparison
                                        ?.comparison
                                        ?.tradeoffs
                                        ?.length) && (
                                    <div className="grid border-t border-emerald-200 bg-white/70 md:grid-cols-2">

                                        {/* Why winner */}
                                        <div className="min-w-0 p-4 sm:p-7">
                                            <div className="flex items-center gap-2">
                                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
                                                    <Check className="h-4 w-4" />
                                                </div>

                                                <h3 className="text-sm font-bold text-gray-900">
                                                    Why this is a better choice
                                                </h3>
                                            </div>

                                            <div className="mt-4 space-y-3">
                                                {(
                                                    comparison
                                                        ?.comparison
                                                        ?.reasons ||
                                                    []
                                                )
                                                    .slice(
                                                        0,
                                                        4
                                                    )
                                                    .map(
                                                        (
                                                            reason,
                                                            index
                                                        ) => (
                                                            <div
                                                                key={`${reason.nutrient}-${index}`}
                                                                className="flex items-start gap-2.5"
                                                            >
                                                                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />

                                                                <p className="min-w-0 break-words text-sm leading-5 text-gray-600">
                                                                    {getReasonText(
                                                                        reason,
                                                                        comparison.products
                                                                    )}
                                                                </p>
                                                            </div>
                                                        )
                                                    )}
                                            </div>
                                        </div>

                                        {/* Tradeoffs */}
                                        <div className="min-w-0 border-t border-emerald-200 p-4 md:border-l md:border-t-0 sm:p-7">
                                            <div className="flex items-center gap-2">
                                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                                                    <Sparkles className="h-4 w-4" />
                                                </div>

                                                <h3 className="text-sm font-bold text-gray-900">
                                                    What the other product does better
                                                </h3>
                                            </div>

                                            {comparison
                                                ?.comparison
                                                ?.tradeoffs
                                                ?.length ? (
                                                <div className="mt-4 space-y-3">
                                                    {comparison.comparison.tradeoffs
                                                        .slice(
                                                            0,
                                                            3
                                                        )
                                                        .map(
                                                            (
                                                                tradeoff,
                                                                index
                                                            ) => (
                                                                <div
                                                                    key={`${tradeoff.nutrient}-${index}`}
                                                                    className="flex items-start gap-2.5"
                                                                >
                                                                    <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />

                                                                    <p className="min-w-0 break-words text-sm leading-5 text-gray-600">
                                                                        {getReasonText(
                                                                            tradeoff,
                                                                            comparison.products
                                                                        )}
                                                                    </p>
                                                                </div>
                                                            )
                                                        )}
                                                </div>
                                            ) : (
                                                <p className="mt-4 text-sm leading-5 text-gray-500">
                                                    No major tradeoffs were found in the available nutrition data.
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                )}
                        </section>

                        {/* Product cards */}
                        <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
                            <ProductCard
                                product={
                                    comparison
                                        .products[0]
                                }
                                side="Product 1"
                                comparisonScore={
                                    comparison
                                        ?.comparison
                                        ?.product1Score
                                }
                                isWinner={
                                    winnerId !==
                                        "tie" &&
                                    winnerId &&
                                    String(
                                        winnerId
                                    ) ===
                                        String(
                                            comparison
                                                .products[0]
                                                .id
                                        )
                                }
                            />

                            <ProductCard
                                product={
                                    comparison
                                        .products[1]
                                }
                                side="Product 2"
                                comparisonScore={
                                    comparison
                                        ?.comparison
                                        ?.product2Score
                                }
                                isWinner={
                                    winnerId !==
                                        "tie" &&
                                    winnerId &&
                                    String(
                                        winnerId
                                    ) ===
                                        String(
                                            comparison
                                                .products[1]
                                                .id
                                        )
                                }
                            />
                        </div>

                        {/* Nutrition comparison */}
                        <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-7">
                            <div className="flex items-start gap-3">
                                <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />

                                <div className="min-w-0">
                                    <h2 className="text-lg font-bold text-gray-900">
                                        Nutrition comparison
                                    </h2>

                                    <p className="mt-1 text-sm leading-5 text-gray-500">
                                        Compare each nutrition metric
                                        side by side.
                                    </p>
                                </div>
                            </div>

                            <div className="mt-5 sm:mt-6">
                                {nutritionFields.map(
                                    (field) => (
                                        <ComparisonRow
                                            key={
                                                field.key
                                            }
                                            field={
                                                field
                                            }
                                            product1={
                                                comparison
                                                    .products[0]
                                            }
                                            product2={
                                                comparison
                                                    .products[1]
                                            }
                                        />
                                    )
                                )}
                            </div>
                        </section>

                        {/* Goal explanation */}
                        <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-7">
                            <div className="flex items-start gap-3">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                                    <ShieldCheck className="h-5 w-5" />
                                </div>

                                <div className="min-w-0">
                                    <h2 className="text-lg font-bold text-gray-900">
                                        How LabelIQ chose
                                    </h2>

                                    <p className="mt-1 break-words text-sm leading-6 text-gray-500">
                                        The recommendation considers
                                        the nutrition values of both
                                        products and gives more
                                        importance to metrics that
                                        matter for your selected goal.
                                    </p>
                                </div>
                            </div>

                            <div className="mt-5 grid gap-3 sm:grid-cols-3">
                                <div className="rounded-xl bg-gray-50 p-4">
                                    <p className="text-sm font-semibold text-gray-900">
                                        Comparison score
                                    </p>

                                    <p className="mt-1 text-xs leading-5 text-gray-500">
                                        Helps show which product has
                                        the stronger overall match
                                        between these two choices.
                                    </p>
                                </div>

                                <div className="rounded-xl bg-gray-50 p-4">
                                    <p className="text-sm font-semibold text-gray-900">
                                        Your goal
                                    </p>

                                    <p className="mt-1 text-xs leading-5 text-gray-500">
                                        {formatGoal(
                                            comparison.goal
                                        )}{" "}
                                        changes which nutrition
                                        factors receive more weight.
                                    </p>
                                </div>

                                <div className="rounded-xl bg-gray-50 p-4">
                                    <p className="text-sm font-semibold text-gray-900">
                                        Available data
                                    </p>

                                    <p className="mt-1 text-xs leading-5 text-gray-500">
                                        Confidence:{" "}
                                        <span className="font-medium capitalize text-gray-700">
                                            {comparison
                                                ?.comparison
                                                ?.confidence ||
                                                "unknown"}
                                        </span>
                                    </p>
                                </div>
                            </div>
                        </section>
                    </div>
                )}

                <div className="h-6 sm:h-8" />
            </div>
        </main>
    );
};

export default ProductComparison;