import { useRef, useState } from "react";
import {
    ArrowLeft,
    ArrowRight,
    Camera,
    CheckCircle2,
    FileImage,
    ImagePlus,
    Loader2,
    ScanLine,
    Sparkles,
    X,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import api from "../api/axios";

// Splits a comma-separated ingredient string into individual names,
// without breaking groups that contain commas inside parentheses.
const parseIngredientsList = (rawText) => {
    if (!rawText) {
        return [];
    }

    const parts = [];
    let current = "";
    let depth = 0;

    for (const char of rawText) {
        if (char === "(") {
            depth += 1;
            current += char;
        } else if (char === ")") {
            depth = Math.max(0, depth - 1);
            current += char;
        } else if (char === "," && depth === 0) {
            parts.push(current);
            current = "";
        } else {
            current += char;
        }
    }

    parts.push(current);

    return parts
        .map((name) => name.trim())
        .filter(Boolean);
};

const ProductInput = () => {
    const navigate = useNavigate();
    const fileInputRef = useRef(null);

    const [formData, setFormData] = useState({
        name: "",
        brand: "",
        category: "",

        servingValue: "",
        servingUnit: "g",

        packageValue: "",
        packageUnit: "g",

        nutritionBasis: "per-serving",

        calories: "",
        protein: "",
        carbohydrates: "",
        totalFat: "",
        saturatedFat: "",
        sugar: "",
        fiber: "",
        sodium: "",

        ingredients: "",
    });

    const [selectedImage, setSelectedImage] = useState(null);
    const [imagePreview, setImagePreview] = useState("");
    const [extracting, setExtracting] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [extracted, setExtracted] = useState(false);

    const handleChange = (event) => {
        const { name, value } = event.target;

        setFormData((previous) => ({
            ...previous,
            [name]: value,
        }));
    };

    const handleImageChange = (event) => {
        const file = event.target.files?.[0];

        if (!file) {
            return;
        }

        setError("");
        setExtracted(false);

        if (!file.type.startsWith("image/")) {
            setError("Please select an image file.");
            return;
        }

        if (file.size > 10 * 1024 * 1024) {
            setError("Image must be smaller than 10 MB.");
            return;
        }

        setSelectedImage(file);

        const previewUrl = URL.createObjectURL(file);
        setImagePreview(previewUrl);
    };

    const removeImage = () => {
        setSelectedImage(null);
        setImagePreview("");
        setExtracted(false);

        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const handleExtract = async () => {
        if (!selectedImage) {
            setError("Please select a product label image first.");
            return;
        }

        setError("");
        setExtracting(true);

        try {
            const data = new FormData();

            data.append("image", selectedImage);

            const response = await api.post(
                "/products/extract",
                data,
                {
                    headers: {
                        "Content-Type": "multipart/form-data",
                    },
                }
            );

            const extractedData =
                response.data?.data?.data ||
                response.data?.data;

            if (!extractedData) {
                throw new Error(
                    "No product information was extracted."
                );
            }

            const servingSize =
                extractedData.servingSize || {};

            const nutrition =
                extractedData.nutrition || {};

            const nutritionBasis =
                extractedData.nutritionBasis ||
                "per-serving";

            setFormData((previous) => ({
                ...previous,

                name:
                    extractedData.name ??
                    previous.name,

                brand:
                    extractedData.brand ??
                    previous.brand,

                category:
                    extractedData.category ??
                    previous.category,

                servingValue:
                    servingSize.value !== null &&
                    servingSize.value !== undefined
                        ? String(servingSize.value)
                        : previous.servingValue,

                servingUnit:
                    servingSize.unit ||
                    previous.servingUnit,

                nutritionBasis:
                    nutritionBasis,

                calories:
                    nutrition.calories !== null &&
                    nutrition.calories !== undefined
                        ? String(nutrition.calories)
                        : previous.calories,

                protein:
                    nutrition.protein !== null &&
                    nutrition.protein !== undefined
                        ? String(nutrition.protein)
                        : previous.protein,

                carbohydrates:
                    nutrition.carbohydrates !== null &&
                    nutrition.carbohydrates !== undefined
                        ? String(nutrition.carbohydrates)
                        : previous.carbohydrates,

                totalFat:
                    nutrition.totalFat !== null &&
                    nutrition.totalFat !== undefined
                        ? String(nutrition.totalFat)
                        : previous.totalFat,

                saturatedFat:
                    nutrition.saturatedFat !== null &&
                    nutrition.saturatedFat !== undefined
                        ? String(nutrition.saturatedFat)
                        : previous.saturatedFat,

                sugar:
                    nutrition.sugar !== null &&
                    nutrition.sugar !== undefined
                        ? String(nutrition.sugar)
                        : previous.sugar,

                fiber:
                    nutrition.fiber !== null &&
                    nutrition.fiber !== undefined
                        ? String(nutrition.fiber)
                        : previous.fiber,

                sodium:
                    nutrition.sodium !== null &&
                    nutrition.sodium !== undefined
                        ? String(nutrition.sodium)
                        : previous.sodium,

                ingredients:
                    Array.isArray(
                        extractedData.ingredients
                    )
                        ? extractedData.ingredients
                              .map(
                                  (ingredient) =>
                                      typeof ingredient ===
                                      "string"
                                          ? ingredient
                                          : ingredient?.name
                              )
                              .filter(Boolean)
                              .join(", ")
                        : previous.ingredients,
            }));

            setExtracted(true);
        } catch (error) {
            setError(
                error.response?.data?.message ||
                    error.message ||
                    "Unable to extract information from the image."
            );
        } finally {
            setExtracting(false);
        }
    };

    const handleSubmit = async (event) => {
        event.preventDefault();

        setError("");
        setLoading(true);

        try {
            const nutrition = {};

            const nutritionFields = [
                "calories",
                "protein",
                "carbohydrates",
                "totalFat",
                "saturatedFat",
                "sugar",
                "fiber",
                "sodium",
            ];

            nutritionFields.forEach((field) => {
                if (formData[field] !== "") {
                    nutrition[field] = Number(
                        formData[field]
                    );
                }
            });

            const ingredients = parseIngredientsList(
                formData.ingredients
            ).map((name) => ({
                name,
            }));

            const response = await api.post(
                "/products",
                {
                    name: formData.name.trim(),

                    brand: formData.brand.trim(),

                    category:
                        formData.category.trim(),

                    servingSize:
                        formData.servingValue !== ""
                            ? {
                                  value: Number(
                                      formData.servingValue
                                  ),
                                  unit:
                                      formData.servingUnit,
                              }
                            : undefined,

                    packageSize:
                        formData.packageValue !== ""
                            ? {
                                  value: Number(
                                      formData.packageValue
                                  ),
                                  unit:
                                      formData.packageUnit,
                              }
                            : undefined,

                    nutritionBasis:
                        formData.nutritionBasis,

                    nutrition,
                    ingredients,

                    inputType:
                        extracted
                            ? "photo"
                            : "manual",

                    dataSource:
                        extracted
                            ? "combined"
                            : "manual",
                }
            );

            const productId =
                response.data.data._id;

            navigate(`/products/${productId}`);
        } catch (error) {
            setError(
                error.response?.data?.message ||
                    "Unable to create the product."
            );
        } finally {
            setLoading(false);
        }
    };

    const inputClass =
        "w-full min-h-12 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 hover:border-gray-300 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10";

    const sectionTitleClass =
        "text-base font-semibold tracking-tight text-gray-950";

    const nutritionFields = [
        ["calories", "Calories", "kcal"],
        ["protein", "Protein", "g"],
        ["carbohydrates", "Carbohydrates", "g"],
        ["totalFat", "Total Fat", "g"],
        ["saturatedFat", "Saturated Fat", "g"],
        ["sugar", "Sugar", "g"],
        ["fiber", "Fiber", "g"],
        ["sodium", "Sodium", "mg"],
    ];

    return (
        <div className="min-h-screen overflow-x-hidden bg-[#f7f8fa]">
            <main className="mx-auto w-full max-w-5xl px-3 py-5 sm:px-6 sm:py-8 lg:px-8 lg:py-10">

                {/* Back */}
                <Link
                    to="/dashboard"
                    className="group inline-flex min-h-10 items-center gap-2 text-sm font-medium text-gray-500 transition hover:text-gray-950"
                >
                    <ArrowLeft className="h-4 w-4 shrink-0 transition group-hover:-translate-x-0.5" />
                    <span>Back to dashboard</span>
                </Link>

                {/* Page header */}
                <div className="mt-6 flex flex-col gap-5 sm:mt-8 sm:flex-row sm:items-end sm:justify-between">
                    <div className="flex min-w-0 items-start gap-3 sm:gap-4">

                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 sm:h-12 sm:w-12">
                            <ScanLine className="h-5 w-5 text-emerald-600 sm:h-6 sm:w-6" />
                        </div>

                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h1 className="text-2xl font-bold tracking-tight text-gray-950 sm:text-4xl">
                                    Add a product
                                </h1>

                                <span className="rounded-full border border-gray-200 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500 sm:px-2.5 sm:py-1 sm:text-[11px]">
                                    LabelIQ
                                </span>
                            </div>

                            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500 sm:text-base">
                                Scan a food label or enter the product details manually.
                            </p>
                        </div>
                    </div>

                    {/* Workflow */}
                    <div className="hidden items-center gap-2 text-xs font-medium text-gray-400 sm:flex">
                        <span className="text-emerald-600">
                            01 Add details
                        </span>

                        <span>→</span>

                        <span>02 Review</span>

                        <span>→</span>

                        <span>03 Analyze</span>
                    </div>
                </div>

                {/* Error */}
                {error && (
                    <div className="mt-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-3.5 py-3.5 text-sm text-red-700 sm:mt-6 sm:px-4 sm:py-4">
                        <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-red-500" />

                        <p className="min-w-0 break-words leading-5">
                            {error}
                        </p>
                    </div>
                )}

                <form
                    onSubmit={handleSubmit}
                    className="mt-5 space-y-4 sm:mt-8 sm:space-y-5"
                >

                    {/* Label scan */}
                    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm sm:rounded-3xl">

                        <div className="border-b border-gray-100 px-4 py-4 sm:px-7 sm:py-5">
                            <div className="flex items-start justify-between gap-3">

                                <div className="flex min-w-0 items-start gap-3">
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-100">
                                        <Camera className="h-4 w-4 text-gray-600" />
                                    </div>

                                    <div className="min-w-0">
                                        <h2 className={sectionTitleClass}>
                                            Scan your label
                                        </h2>

                                        <p className="mt-1 text-sm leading-5 text-gray-500">
                                            Upload a clear photo and we'll fill in the visible details.
                                        </p>
                                    </div>
                                </div>

                                <span className="hidden shrink-0 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 sm:block">
                                    Optional
                                </span>
                            </div>
                        </div>

                        <div className="p-4 sm:p-7">

                            {!selectedImage ? (
                                <button
                                    type="button"
                                    onClick={() =>
                                        fileInputRef.current?.click()
                                    }
                                    className="group flex min-h-52 w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50/70 px-4 py-8 text-center transition hover:border-emerald-300 hover:bg-emerald-50/30 sm:min-h-56 sm:px-6 sm:py-10"
                                >
                                    <div className="flex h-13 w-13 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 transition group-hover:scale-105 sm:h-14 sm:w-14">
                                        <ImagePlus className="h-6 w-6 text-emerald-600" />
                                    </div>

                                    <span className="mt-4 text-sm font-semibold text-gray-900">
                                        Upload label photo
                                    </span>

                                    <span className="mt-1.5 text-xs leading-5 text-gray-500">
                                        PNG, JPG or WEBP · Max 10 MB
                                    </span>

                                    <span className="mt-4 inline-flex flex-wrap items-center justify-center gap-1.5 text-xs font-medium text-emerald-600">
                                        <Sparkles className="h-3.5 w-3.5 shrink-0" />
                                        Automatically fill visible details
                                    </span>
                                </button>
                            ) : (
                                <div className="overflow-hidden rounded-2xl border border-gray-200 bg-gray-50">

                                    <div className="relative flex min-h-56 items-center justify-center bg-gray-100 sm:min-h-64">
                                        <img
                                            src={imagePreview}
                                            alt="Selected food label"
                                            className="max-h-[420px] w-full object-contain"
                                        />

                                        <button
                                            type="button"
                                            onClick={removeImage}
                                            className="absolute right-2.5 top-2.5 flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white/95 text-gray-700 shadow-sm transition hover:bg-white hover:text-gray-950 sm:right-3 sm:top-3"
                                            aria-label="Remove image"
                                        >
                                            <X className="h-4 w-4" />
                                        </button>
                                    </div>

                                    <div className="flex flex-col gap-4 border-t border-gray-200 bg-white p-3.5 sm:flex-row sm:items-center sm:justify-between sm:p-4">

                                        <div className="flex min-w-0 items-center gap-3">
                                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100">
                                                <FileImage className="h-4 w-4 text-gray-500" />
                                            </div>

                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-semibold text-gray-900">
                                                    {selectedImage.name}
                                                </p>

                                                <p className="mt-0.5 text-xs text-gray-500">
                                                    {(
                                                        selectedImage.size /
                                                        1024 /
                                                        1024
                                                    ).toFixed(2)}{" "}
                                                    MB
                                                </p>
                                            </div>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={handleExtract}
                                            disabled={extracting}
                                            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gray-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                                        >
                                            {extracting ? (
                                                <>
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                    <span>
                                                        Reading label...
                                                    </span>
                                                </>
                                            ) : (
                                                <>
                                                    <ScanLine className="h-4 w-4" />
                                                    <span>
                                                        Extract information
                                                    </span>
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            )}

                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                onChange={handleImageChange}
                                className="hidden"
                            />

                            {extracted && (
                                <div className="mt-4 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-3.5 py-3.5 sm:px-4 sm:py-4">
                                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />

                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-emerald-800">
                                            Label scanned successfully
                                        </p>

                                        <p className="mt-1 text-sm leading-5 text-emerald-700">
                                            Review the information below before analyzing the product.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </section>

                    {/* Product information */}
                    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-7">

                        <div className="flex items-start gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-100">
                                <FileImage className="h-4 w-4 text-gray-600" />
                            </div>

                            <div className="min-w-0">
                                <h2 className={sectionTitleClass}>
                                    Product details
                                </h2>

                                <p className="mt-1 text-sm leading-5 text-gray-500">
                                    Tell us what you're analyzing.
                                </p>
                            </div>
                        </div>

                        <div className="mt-5 grid gap-4 sm:mt-6 sm:grid-cols-2 sm:gap-5">

                            <div className="min-w-0">
                                <label
                                    htmlFor="name"
                                    className="mb-2 block text-sm font-medium text-gray-700"
                                >
                                    Product name *
                                </label>

                                <input
                                    id="name"
                                    name="name"
                                    value={formData.name}
                                    onChange={handleChange}
                                    placeholder="e.g. Chocolate Protein Bar"
                                    required
                                    className={inputClass}
                                />
                            </div>

                            <div className="min-w-0">
                                <label
                                    htmlFor="brand"
                                    className="mb-2 block text-sm font-medium text-gray-700"
                                >
                                    Brand
                                </label>

                                <input
                                    id="brand"
                                    name="brand"
                                    value={formData.brand}
                                    onChange={handleChange}
                                    placeholder="e.g. Example Foods"
                                    className={inputClass}
                                />
                            </div>

                            <div className="min-w-0">
                                <label
                                    htmlFor="category"
                                    className="mb-2 block text-sm font-medium text-gray-700"
                                >
                                    Category
                                </label>

                                <input
                                    id="category"
                                    name="category"
                                    value={formData.category}
                                    onChange={handleChange}
                                    placeholder="e.g. Snack"
                                    className={inputClass}
                                />
                            </div>

                            <div className="min-w-0">
                                <label className="mb-2 block text-sm font-medium text-gray-700">
                                    Serving size
                                </label>

                                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                                    <input
                                        name="servingValue"
                                        type="number"
                                        min="0"
                                        step="any"
                                        value={formData.servingValue}
                                        onChange={handleChange}
                                        placeholder="30"
                                        className={inputClass}
                                    />

                                    <select
                                        name="servingUnit"
                                        value={formData.servingUnit}
                                        onChange={handleChange}
                                        className="min-h-12 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none transition hover:border-gray-300 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                                    >
                                        <option value="g">
                                            g
                                        </option>

                                        <option value="ml">
                                            ml
                                        </option>

                                        <option value="piece">
                                            piece
                                        </option>
                                    </select>
                                </div>
                            </div>

                            <div className="min-w-0">
                                <label
                                    htmlFor="packageValue"
                                    className="mb-2 block text-sm font-medium text-gray-700"
                                >
                                    Package size
                                </label>

                                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                                    <input
                                        id="packageValue"
                                        name="packageValue"
                                        type="number"
                                        min="0"
                                        step="any"
                                        value={formData.packageValue}
                                        onChange={handleChange}
                                        placeholder="60"
                                        className={inputClass}
                                    />

                                    <select
                                        name="packageUnit"
                                        value={formData.packageUnit}
                                        onChange={handleChange}
                                        className="min-h-12 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none transition hover:border-gray-300 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                                    >
                                        <option value="g">
                                            g
                                        </option>

                                        <option value="kg">
                                            kg
                                        </option>

                                        <option value="ml">
                                            ml
                                        </option>

                                        <option value="l">
                                            l
                                        </option>

                                        <option value="piece">
                                            piece
                                        </option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Nutrition */}
                    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-7">

                        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                            <div className="min-w-0">
                                <h2 className={sectionTitleClass}>
                                    Nutrition
                                </h2>

                                <p className="mt-1 text-sm leading-5 text-gray-500">
                                    Review the values before analyzing the product.
                                </p>
                            </div>

                            <span className="mt-2 text-xs font-medium text-gray-400 sm:mt-0">
                                Values shown on the label
                            </span>
                        </div>

                        <div className="mt-5 grid gap-4 sm:mt-6 sm:grid-cols-2">

                            <div>
                                <label
                                    htmlFor="nutritionBasis"
                                    className="mb-2 block text-sm font-medium text-gray-700"
                                >
                                    Nutrition values are
                                </label>

                                <select
                                    id="nutritionBasis"
                                    name="nutritionBasis"
                                    value={formData.nutritionBasis}
                                    onChange={handleChange}
                                    className={inputClass}
                                >
                                    <option value="per-serving">
                                        Per serving
                                    </option>

                                    <option value="per-100g">
                                        Per 100 g
                                    </option>

                                    <option value="per-100ml">
                                        Per 100 ml
                                    </option>

                                    <option value="per-piece">
                                        Per piece
                                    </option>
                                </select>
                            </div>

                            <div className="flex items-end">
                                <div className="w-full rounded-xl bg-gray-50 px-4 py-3">
                                    <p className="text-xs leading-5 text-gray-500">
                                        Use the basis printed on the nutrition label. LabelIQ will use it to calculate serving and package values.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="mt-5 grid gap-2.5 sm:mt-6 sm:grid-cols-2 sm:gap-3 lg:grid-cols-4">

                            {nutritionFields.map(
                                ([name, label, unit]) => (
                                    <div
                                        key={name}
                                        className="rounded-2xl border border-gray-100 bg-gray-50/70 p-3.5 transition hover:border-gray-200 hover:bg-gray-50"
                                    >
                                        <label
                                            htmlFor={name}
                                            className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold text-gray-600"
                                        >
                                            <span className="min-w-0">
                                                {label}
                                            </span>

                                            <span className="shrink-0 font-medium text-gray-400">
                                                {unit}
                                            </span>
                                        </label>

                                        <input
                                            id={name}
                                            name={name}
                                            type="number"
                                            min="0"
                                            step="any"
                                            value={formData[name]}
                                            onChange={handleChange}
                                            placeholder="0"
                                            className="min-h-9 w-full border-0 bg-transparent p-0 text-base font-semibold text-gray-950 outline-none placeholder:text-gray-300 focus:ring-0"
                                        />
                                    </div>
                                )
                            )}
                        </div>
                    </section>

                    {/* Ingredients */}
                    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-7">

                        <div className="flex items-start gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-100">
                                <Sparkles className="h-4 w-4 text-gray-600" />
                            </div>

                            <div className="min-w-0">
                                <h2 className={sectionTitleClass}>
                                    Ingredients
                                </h2>

                                <p className="mt-1 text-sm leading-5 text-gray-500">
                                    Keep ingredients in the same order as they appear on the label.
                                </p>
                            </div>
                        </div>

                        <textarea
                            name="ingredients"
                            value={formData.ingredients}
                            onChange={handleChange}
                            rows={5}
                            placeholder="Maltodextrin, Citric Acid, Lecithin"
                            className={`${inputClass} mt-5 min-h-32 resize-none`}
                        />
                    </section>

                    {/* Final action */}
                    <div className="rounded-2xl border border-gray-200 bg-white p-3.5 shadow-sm sm:rounded-3xl sm:p-5">

                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">

                            <div className="hidden sm:block">
                                <p className="text-sm font-semibold text-gray-900">
                                    Ready to analyze?
                                </p>

                                <p className="mt-1 text-xs text-gray-500">
                                    Review your information before continuing.
                                </p>
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:min-w-52"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        <span>
                                            Creating product...
                                        </span>
                                    </>
                                ) : (
                                    <>
                                        <span>
                                            Analyze Product
                                        </span>

                                        <ArrowRight className="h-4 w-4 shrink-0" />
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </form>
            </main>
        </div>
    );
};

export default ProductInput;