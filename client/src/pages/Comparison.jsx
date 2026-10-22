import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Camera,
  Check,
  ChevronDown,
  FileImage,
  History,
  ImagePlus,
  Loader2,
  Scale,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
  AlertTriangle,
  Trophy,
  Leaf,
  Flame,
  CircleAlert,
} from "lucide-react";
import api from "../api/axios";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

const NUTRITION_FIELDS = [
  {
    key: "calories",
    label: "Calories",
    unit: "kcal",
    lowerIsBetter: true,
  },
  {
    key: "protein_g",
    label: "Protein",
    unit: "g",
    lowerIsBetter: false,
  },
  {
    key: "carbohydrates_g",
    label: "Carbohydrates",
    unit: "g",
    lowerIsBetter: true,
  },
  {
    key: "total_fat_g",
    label: "Total Fat",
    unit: "g",
    lowerIsBetter: true,
  },
  {
    key: "saturated_fat_g",
    label: "Saturated Fat",
    unit: "g",
    lowerIsBetter: true,
  },
  {
    key: "total_sugars_g",
    label: "Total Sugars",
    unit: "g",
    lowerIsBetter: true,
  },
  {
    key: "added_sugars_g",
    label: "Added Sugars",
    unit: "g",
    lowerIsBetter: true,
  },
  {
    key: "dietary_fiber_g",
    label: "Dietary Fiber",
    unit: "g",
    lowerIsBetter: false,
  },
  {
    key: "sodium_mg",
    label: "Sodium",
    unit: "mg",
    lowerIsBetter: true,
  },
];

function formatValue(value, unit = "") {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return `${value}${unit ? ` ${unit}` : ""}`;
  }

  return `${Number.isInteger(number) ? number : number.toFixed(1)}${
    unit ? ` ${unit}` : ""
  }`;
}

function gradeClass(grade) {
  switch (String(grade || "").toUpperCase()) {
    case "A":
      return "border-emerald-400/20 bg-emerald-400/10 text-emerald-300";
    case "B":
      return "border-cyan-400/20 bg-cyan-400/10 text-cyan-300";
    case "C":
      return "border-amber-400/20 bg-amber-400/10 text-amber-300";
    case "D":
      return "border-rose-400/20 bg-rose-400/10 text-rose-300";
    default:
      return "border-white/10 bg-white/[0.04] text-slate-300";
  }
}

function severityClass(severity) {
  const value = String(severity || "").toLowerCase();

  if (value === "high") {
    return "border-rose-400/20 bg-rose-400/10 text-rose-300";
  }

  if (value === "medium") {
    return "border-amber-400/20 bg-amber-400/10 text-amber-300";
  }

  return "border-white/10 bg-white/[0.04] text-slate-400";
}

function extractScanId(response) {
  return (
    response?.data?.data?.database?.scanId ??
    response?.data?.database?.scanId ??
    response?.data?.data?.scanId ??
    response?.data?.scanId ??
    response?.data?.data?.analysis?.id ??
    response?.data?.analysis?.id ??
    null
  );
}

function metricWinner(left, right, lowerIsBetter) {
  if (
    left === null ||
    left === undefined ||
    right === null ||
    right === undefined
  ) {
    return null;
  }

  const a = Number(left);
  const b = Number(right);

  if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) {
    return null;
  }

  if (lowerIsBetter) {
    return a < b ? "left" : "right";
  }

  return a > b ? "left" : "right";
}

/* =========================================================
   PRODUCT SELECTION
========================================================= */

function HistorySelect({
  products,
  selectedId,
  disabledId,
  onChange,
}) {
  return (
    <div className="relative">
      <History
        size={14}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
      />

      <select
        value={selectedId}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full appearance-none rounded-xl border border-white/[0.08] bg-black/20 pl-9 pr-9 text-xs font-medium text-slate-200 outline-none transition focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/10"
      >
        <option value="" className="bg-[#06110e]">
          Select from scan history
        </option>

        {products.map((product) => {
          const id = String(product.scan_id ?? product.id);

          return (
            <option
              key={id}
              value={id}
              disabled={id === String(disabledId || "")}
              className="bg-[#06110e]"
            >
              {product.product_name ||
                product.name ||
                "Unnamed product"}{" "}
              {product.safety_grade
                ? `• Grade ${product.safety_grade}`
                : ""}
            </option>
          );
        })}
      </select>

      <ChevronDown
        size={14}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"
      />
    </div>
  );
}

/* =========================================================
   SCAN SLOT
========================================================= */

function ScanSlot({
  title,
  slot,
  value,
  setSlot,
  products,
  disabledHistoryId,
  onScanComplete,
}) {
  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCameraOpen(false);
  };

  useEffect(() => {
    return () => {
      stopCamera();

      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const selectFile = (selectedFile) => {
    setError("");

    if (!selectedFile) return;

    if (!ALLOWED_TYPES.includes(selectedFile.type)) {
      setError("Please select a JPG, PNG or WebP image.");
      return;
    }

    if (selectedFile.size > MAX_FILE_SIZE) {
      setError("Image size must be less than 10 MB.");
      return;
    }

    stopCamera();

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setFile(selectedFile);
    setPreviewUrl(URL.createObjectURL(selectedFile));
  };

  const handleFileChange = (event) => {
    selectFile(event.target.files?.[0]);
    event.target.value = "";
  };

  const startCamera = async () => {
    try {
      setError("");
      setCameraLoading(true);

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          "Camera access is not supported by this browser."
        );
      }

      stopCamera();

      const stream =
        await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

      streamRef.current = stream;

      setCameraOpen(true);

      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current
            .play()
            .catch(() => {});
        }
      }, 0);
    } catch (cameraError) {
      console.error("Camera error:", cameraError);

      setError(
        cameraError?.message ||
          "Unable to access the camera."
      );
    } finally {
      setCameraLoading(false);
    }
  };

  const capturePhoto = async () => {
    const video = videoRef.current;

    if (!video || !video.videoWidth || !video.videoHeight) {
      setError("Camera is not ready yet.");
      return;
    }

    try {
      const canvas = document.createElement("canvas");

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const context = canvas.getContext("2d");

      context.drawImage(
        video,
        0,
        0,
        canvas.width,
        canvas.height
      );

      const blob = await new Promise((resolve) => {
        canvas.toBlob(
          resolve,
          "image/jpeg",
          0.92
        );
      });

      if (!blob) {
        throw new Error("Unable to capture image.");
      }

      const capturedFile = new File(
        [blob],
        `comparison-${Date.now()}.jpg`,
        {
          type: "image/jpeg",
        }
      );

      selectFile(capturedFile);
      stopCamera();
    } catch (captureError) {
      console.error("Capture error:", captureError);

      setError(
        captureError?.message ||
          "Unable to capture the image."
      );
    }
  };

  const clearFile = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setFile(null);
    setPreviewUrl("");
    setError("");
  };

  const handleScan = async () => {
    if (!file) {
      setError("Please upload or capture an image first.");
      return;
    }

    try {
      setScanning(true);
      setError("");

      const formData = new FormData();
      formData.append("image", file);

      const response = await api.post(
        "/scan",
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
          timeout: 120000,
        }
      );

      const scanId = extractScanId(response);

      if (!scanId) {
        throw new Error(
          "Scan completed but no scan ID was returned."
        );
      }

      await onScanComplete(scanId, slot);

      clearFile();
    } catch (requestError) {
      console.error("Comparison scan failed:", requestError);

      const status = requestError?.response?.status;

      let message =
        requestError?.response?.data?.message ||
        requestError?.response?.data?.detail ||
        requestError?.response?.data?.error ||
        requestError?.message ||
        "Unable to scan this product.";

      if (requestError?.code === "ECONNABORTED") {
        message =
          "The scan is taking too long. Please try again.";
      }

      if (status === 401) {
        message =
          "Your session has expired. Please login again.";
      }

      if (status === 413) {
        message =
          "Image is too large. Please upload an image under 10 MB.";
      }

      setError(message);
    } finally {
      setScanning(false);
    }
  };

  const selectedHistoryProduct = products.find(
    (product) =>
      String(product.scan_id ?? product.id) ===
      String(value.scanId)
  );

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 sm:p-5">
      <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-emerald-400/[0.04] blur-3xl" />

      <div className="relative">
        {/* HEADER */}

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-400">
              <Scale size={16} />
            </div>

            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-emerald-400">
                Comparison slot
              </p>

              <h2 className="mt-0.5 text-base font-bold text-white">
                {title}
              </h2>
            </div>
          </div>

          {value.scanId && (
            <div className="flex items-center gap-1.5 rounded-full border border-emerald-400/15 bg-emerald-400/[0.06] px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-emerald-300">
              <Check size={11} />
              Selected
            </div>
          )}
        </div>

        {/* SELECTED PRODUCT */}

        {selectedHistoryProduct && (
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-emerald-400/10 bg-emerald-400/[0.04] p-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-400">
              <FileImage size={17} />
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-white">
                {selectedHistoryProduct.product_name ||
                  selectedHistoryProduct.name ||
                  "Selected product"}
              </p>

              <p className="mt-0.5 text-[10px] text-slate-600">
                From scan history
              </p>
            </div>

            {selectedHistoryProduct.safety_grade && (
              <span
                className={`rounded-lg border px-2 py-1 text-xs font-black ${gradeClass(
                  selectedHistoryProduct.safety_grade
                )}`}
              >
                {selectedHistoryProduct.safety_grade}
              </span>
            )}
          </div>
        )}

        {/* CAMERA */}

        {cameraOpen && (
          <div className="mt-4 overflow-hidden rounded-2xl border border-emerald-400/15 bg-black">
            <div className="relative aspect-video">
              <video
                ref={videoRef}
                muted
                playsInline
                className="h-full w-full object-cover"
              />

              <div className="pointer-events-none absolute inset-0">
                <div className="absolute left-4 top-4 h-7 w-7 border-l-2 border-t-2 border-emerald-400" />
                <div className="absolute right-4 top-4 h-7 w-7 border-r-2 border-t-2 border-emerald-400" />
                <div className="absolute bottom-4 left-4 h-7 w-7 border-b-2 border-l-2 border-emerald-400" />
                <div className="absolute bottom-4 right-4 h-7 w-7 border-b-2 border-r-2 border-emerald-400" />
              </div>
            </div>

            <div className="flex gap-2 p-3">
              <button
                type="button"
                onClick={capturePhoto}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 py-3 text-xs font-black text-[#03100c] transition hover:bg-emerald-300"
              >
                <Camera size={15} />
                Capture
              </button>

              <button
                type="button"
                onClick={stopCamera}
                className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-xs font-bold text-slate-300 transition hover:bg-white/[0.07]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* PREVIEW */}

        {previewUrl && !cameraOpen && (
          <div className="relative mt-4 overflow-hidden rounded-2xl border border-white/[0.08] bg-black/20">
            <img
              src={previewUrl}
              alt={`${title} preview`}
              className="max-h-64 w-full object-contain"
            />

            <button
              type="button"
              onClick={clearFile}
              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/60 text-white backdrop-blur transition hover:bg-black/80"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* ACTIONS */}

        {!cameraOpen && !previewUrl && (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={startCamera}
              disabled={cameraLoading}
              className="group flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border border-emerald-400/10 bg-emerald-400/[0.04] text-emerald-300 transition hover:border-emerald-400/25 hover:bg-emerald-400/[0.08] disabled:opacity-50"
            >
              {cameraLoading ? (
                <Loader2
                  size={19}
                  className="animate-spin"
                />
              ) : (
                <Camera
                  size={19}
                  className="transition group-hover:scale-110"
                />
              )}

              <span className="text-[10px] font-bold">
                Take Photo
              </span>

              <span className="text-[9px] text-slate-600">
                Use camera
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                fileInputRef.current?.click()
              }
              className="group flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.025] text-slate-300 transition hover:border-white/[0.14] hover:bg-white/[0.05]"
            >
              <Upload
                size={19}
                className="text-slate-400 transition group-hover:scale-110 group-hover:text-emerald-400"
              />

              <span className="text-[10px] font-bold">
                Upload Image
              </span>

              <span className="text-[9px] text-slate-600">
                JPG, PNG or WebP
              </span>
            </button>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* HISTORY */}

        <div className="mt-3">
          <HistorySelect
            products={products}
            selectedId={value.scanId}
            disabledId={disabledHistoryId}
            onChange={(scanId) => {
              setError("");
              setSlot({
                scanId,
                source: scanId ? "history" : "",
              });

              if (previewUrl) {
                clearFile();
              }
            }}
          />
        </div>

        {/* SCAN */}

        {file && (
          <button
            type="button"
            onClick={handleScan}
            disabled={scanning}
            className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 text-xs font-black text-[#03100c] transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {scanning ? (
              <>
                <Loader2
                  size={15}
                  className="animate-spin"
                />
                Analyzing product...
              </>
            ) : (
              <>
                <Sparkles size={15} />
                Analyze this product
              </>
            )}
          </button>
        )}

        {/* ERROR */}

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-400/15 bg-rose-400/[0.04] px-3 py-2.5 text-[10px] leading-5 text-rose-300">
            <AlertTriangle
              size={13}
              className="mt-0.5 shrink-0"
            />

            <span>{error}</span>
          </div>
        )}

        {/* SOURCE */}

        {value.scanId && (
          <p className="mt-3 text-center text-[9px] text-slate-700">
            {value.source === "new"
              ? "Newly scanned product"
              : "Selected from your scan history"}
          </p>
        )}
      </div>
    </div>
  );
}

/* =========================================================
   PRODUCT SUMMARY
========================================================= */

function ProductSummary({
  product,
  side,
  winner,
}) {
  const isWinner = Boolean(winner);

  return (
    <section
      className={`relative overflow-hidden rounded-2xl border p-5 shadow-sm sm:rounded-3xl sm:p-6 ${
        isWinner
          ? "border-emerald-400/25 bg-gradient-to-br from-emerald-400/[0.08] via-white/[0.025] to-transparent"
          : "border-white/[0.07] bg-white/[0.025]"
      }`}
    >
      {isWinner && (
        <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-emerald-400/[0.07] blur-3xl" />
      )}

      <div className="relative">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-600">
              {side === "left" ? "Product 1" : "Product 2"}
            </p>

            <h3 className="mt-1 truncate text-lg font-bold text-white">
              {product?.name || "Unnamed product"}
            </h3>
          </div>

          {isWinner && (
            <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1.5 text-[9px] font-black uppercase tracking-wider text-emerald-300">
              <Trophy size={11} />
              Winner
            </div>
          )}
        </div>

        <div className="mt-5 flex items-center gap-4">
          <div
            className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border ${
              isWinner
                ? "border-emerald-400/20 bg-emerald-400/10"
                : "border-white/[0.07] bg-black/20"
            }`}
          >
            <div className="text-center">
              <p
                className={`text-3xl font-black ${
                  isWinner
                    ? "text-emerald-300"
                    : "text-white"
                }`}
              >
                {product?.grade || "—"}
              </p>

              <p className="text-[8px] font-bold uppercase tracking-wider text-slate-600">
                Grade
              </p>
            </div>
          </div>

          <div>
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-600">
              Safety score
            </p>

            <p className="mt-1 text-3xl font-black text-white">
              {product?.score ?? "—"}
              <span className="ml-1 text-xs font-medium text-slate-600">
                / 100
              </span>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* =========================================================
   NUTRITION TABLE
========================================================= */

function NutritionTable({ products }) {
  const left = products?.[0]?.nutritionDetails || {};
  const right = products?.[1]?.nutritionDetails || {};

  return (
    <div className="overflow-x-auto rounded-2xl border border-white/[0.06]">
      <table className="w-full min-w-[620px] border-collapse">
        <thead>
          <tr className="border-b border-white/[0.06] bg-white/[0.025]">
            <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-[0.15em] text-slate-600">
              Nutrition
            </th>

            <th className="px-4 py-3 text-right text-[9px] font-bold uppercase tracking-[0.15em] text-emerald-400">
              {products?.[0]?.name || "Product 1"}
            </th>

            <th className="px-4 py-3 text-right text-[9px] font-bold uppercase tracking-[0.15em] text-cyan-400">
              {products?.[1]?.name || "Product 2"}
            </th>
          </tr>
        </thead>

        <tbody>
          {NUTRITION_FIELDS.map((field) => {
            const leftValue = left[field.key];
            const rightValue = right[field.key];

            const winner = metricWinner(
              leftValue,
              rightValue,
              field.lowerIsBetter
            );

            return (
              <tr
                key={field.key}
                className="border-b border-white/[0.04] last:border-0"
              >
                <td className="px-4 py-3 text-xs font-medium text-slate-400">
                  {field.label}
                </td>

                <td className="px-4 py-3 text-right">
                  <MetricValue
                    value={leftValue}
                    unit={field.unit}
                    winner={winner === "left"}
                  />
                </td>

                <td className="px-4 py-3 text-right">
                  <MetricValue
                    value={rightValue}
                    unit={field.unit}
                    winner={winner === "right"}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MetricValue({
  value,
  unit,
  winner,
}) {
  return (
    <span
      className={`inline-flex items-center justify-end gap-1.5 text-xs font-bold ${
        winner
          ? "text-emerald-300"
          : "text-slate-300"
      }`}
    >
      {winner && <Check size={12} />}

      {formatValue(value, unit)}
    </span>
  );
}

/* =========================================================
   RULE LIST
========================================================= */

function RuleList({ product }) {
  const rules = product?.rules || [];

  if (!rules.length) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-emerald-400/10 bg-emerald-400/[0.03] p-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-400">
          <ShieldCheck size={16} />
        </div>

        <div>
          <p className="text-xs font-bold text-emerald-300">
            No flagged rules
          </p>

          <p className="mt-0.5 text-[10px] text-slate-600">
            No deterministic rule was triggered for this scan.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {rules.map((rule, index) => (
        <div
          key={`${rule.rule_code || rule.ruleCode || "rule"}-${index}`}
          className="rounded-xl border border-white/[0.06] bg-black/15 p-3"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-200">
                {rule.rule_name ||
                  rule.ruleName ||
                  rule.name ||
                  "Rule match"}
              </p>

              {rule.explanation && (
                <p className="mt-1 text-[10px] leading-5 text-slate-600">
                  {rule.explanation}
                </p>
              )}
            </div>

            <span
              className={`shrink-0 rounded-lg border px-2 py-1 text-[8px] font-black uppercase tracking-wider ${severityClass(
                rule.severity
              )}`}
            >
              {rule.severity || "Flagged"}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* =========================================================
   MAIN PAGE
========================================================= */

export default function Comparison() {
  const [products, setProducts] = useState([]);

  const [product1, setProduct1] = useState({
    scanId: "",
    source: "",
  });

  const [product2, setProduct2] = useState({
    scanId: "",
    source: "",
  });

  const [comparison, setComparison] = useState(null);

  const [loadingProducts, setLoadingProducts] =
    useState(true);

  const [comparing, setComparing] = useState(false);

  const [error, setError] = useState("");

  const loadProducts = async () => {
    try {
      setLoadingProducts(true);

      const response = await api.get(
        "/scan/history?limit=50&sort=newest"
      );

      const data = response?.data?.data;

      setProducts(
        Array.isArray(data) ? data : []
      );
    } catch (requestError) {
      console.error(
        "Unable to load scan history:",
        requestError
      );

      setError(
        requestError?.response?.data?.message ||
          "Unable to load your scanned products."
      );
    } finally {
      setLoadingProducts(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const handleScanComplete = async (
    scanId,
    slot
  ) => {
    await loadProducts();

    if (slot === "product1") {
      setProduct1({
        scanId: String(scanId),
        source: "new",
      });
    } else {
      setProduct2({
        scanId: String(scanId),
        source: "new",
      });
    }

    setComparison(null);
    setError("");
  };

  const canCompare = useMemo(() => {
    return Boolean(
      product1.scanId &&
        product2.scanId &&
        product1.scanId !== product2.scanId
    );
  }, [
    product1.scanId,
    product2.scanId,
  ]);

  const handleCompare = async () => {
    if (!product1.scanId || !product2.scanId) {
      setError(
        "Please choose or scan both products."
      );
      return;
    }

    if (
      product1.scanId === product2.scanId
    ) {
      setError(
        "Please select two different products."
      );
      return;
    }

    try {
      setComparing(true);
      setComparison(null);
      setError("");

      const response = await api.get(
        `/comparison?scan1=${encodeURIComponent(
          product1.scanId
        )}&scan2=${encodeURIComponent(
          product2.scanId
        )}`
      );

      setComparison(
        response?.data?.data || null
      );
    } catch (requestError) {
      console.error(
        "Product comparison failed:",
        requestError
      );

      setError(
        requestError?.response?.data?.message ||
          "Unable to compare the selected products."
      );
    } finally {
      setComparing(false);
    }
  };

  const winner =
    comparison?.comparison?.winner;

  const nutritionComparison =
    comparison?.comparison?.nutrition;

  return (
    <main className="min-h-[calc(100vh-76px)] bg-[#06110e] text-white">
      <div className="mx-auto w-full max-w-[1500px] px-4 py-5 sm:px-6 lg:px-8 xl:px-10">

        {/* =================================================
            HEADER
        ================================================= */}

        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link
              to="/dashboard"
              className="mb-4 inline-flex items-center gap-1.5 text-[10px] font-medium text-slate-600 transition hover:text-emerald-400"
            >
              <ArrowLeft size={13} />
              Back to dashboard
            </Link>

            <div className="mb-1.5 flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]" />

              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-emerald-400">
                Product Intelligence
              </p>
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Compare food products
            </h1>

            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600 sm:text-sm">
              Scan new products or select previous scans
              to compare safety, nutrition and ingredient
              rules side by side.
            </p>
          </div>
        </div>

        {/* =================================================
            ERROR
        ================================================= */}

        {error && (
          <div className="mb-5 flex items-start gap-2 rounded-2xl border border-rose-400/15 bg-rose-400/[0.04] px-4 py-3 text-xs text-rose-300">
            <CircleAlert
              size={14}
              className="mt-0.5 shrink-0"
            />
            <span>{error}</span>
          </div>
        )}

        {/* =================================================
            SELECTION AREA
        ================================================= */}

        <section className="relative mb-5 overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 sm:p-5">
          <div className="pointer-events-none absolute right-[-80px] top-[-80px] h-56 w-56 rounded-full bg-emerald-400/[0.04] blur-[80px]" />

          <div className="relative mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="mb-1.5 flex items-center gap-2">
                <Sparkles
                  size={12}
                  className="text-emerald-400"
                />

                <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-emerald-400">
                  Choose products
                </p>
              </div>

              <h2 className="text-lg font-bold text-white">
                What do you want to compare?
              </h2>

              <p className="mt-1 text-[10px] leading-5 text-slate-600">
                Use your camera, upload a label, or pick a
                product from your scan history.
              </p>
            </div>

            <div className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2">
              <Scale
                size={13}
                className="text-emerald-400"
              />

              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
                2 products
              </span>
            </div>
          </div>

          {loadingProducts ? (
            <div className="flex min-h-40 items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <Loader2
                  size={22}
                  className="animate-spin text-emerald-400"
                />

                <p className="text-[10px] text-slate-600">
                  Loading your scan history...
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                <ScanSlot
                  title="Product 1"
                  slot="product1"
                  value={product1}
                  setSlot={setProduct1}
                  products={products}
                  disabledHistoryId={
                    product2.scanId
                  }
                  onScanComplete={
                    handleScanComplete
                  }
                />

                <ScanSlot
                  title="Product 2"
                  slot="product2"
                  value={product2}
                  setSlot={setProduct2}
                  products={products}
                  disabledHistoryId={
                    product1.scanId
                  }
                  onScanComplete={
                    handleScanComplete
                  }
                />
              </div>

              {/* COMPARE BUTTON */}

              <button
                type="button"
                disabled={
                  !canCompare || comparing
                }
                onClick={handleCompare}
                className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-5 text-xs font-black text-[#03100c] shadow-[0_8px_30px_rgba(52,211,153,0.08)] transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-white/[0.06] disabled:text-slate-600 disabled:shadow-none"
              >
                {comparing ? (
                  <>
                    <Loader2
                      size={15}
                      className="animate-spin"
                    />
                    Comparing products...
                  </>
                ) : (
                  <>
                    <Scale size={15} />
                    Compare Products
                  </>
                )}
              </button>

              {!canCompare && (
                <p className="mt-2 text-center text-[9px] text-slate-700">
                  Select two different products to start
                  the comparison.
                </p>
              )}
            </>
          )}
        </section>

        {/* =================================================
            COMPARISON RESULT
        ================================================= */}

        {comparison && (
          <div className="space-y-5">

            {/* RECOMMENDATION */}

            <section className="relative overflow-hidden rounded-2xl border border-emerald-400/15 bg-gradient-to-br from-emerald-400/[0.07] via-white/[0.025] to-transparent p-5 sm:p-6">
              <div className="pointer-events-none absolute right-[-60px] top-[-70px] h-52 w-52 rounded-full bg-emerald-400/[0.06] blur-[70px]" />

              <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-400">
                    <Trophy size={19} />
                  </div>

                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-emerald-400">
                      Recommendation
                    </p>

                    <h2 className="mt-1 text-xl font-bold text-white sm:text-2xl">
                      {winner === "product1"
                        ? comparison.products[0]
                            .name
                        : winner === "product2"
                          ? comparison.products[1]
                              .name
                          : "Very close comparison"}
                    </h2>

                    <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-500 sm:text-sm">
                      {
                        comparison.comparison
                          .overallMessage
                      }
                    </p>
                  </div>
                </div>

                <div className="shrink-0 rounded-xl border border-emerald-400/10 bg-black/20 px-4 py-3">
                  <p className="text-[8px] font-bold uppercase tracking-wider text-slate-600">
                    Decision basis
                  </p>

                  <p className="mt-1 text-[10px] font-semibold text-emerald-300">
                    Deterministic analysis
                  </p>
                </div>
              </div>
            </section>

            {/* PRODUCT SUMMARIES */}

            <div className="grid gap-4 lg:grid-cols-2">
              <ProductSummary
                product={
                  comparison.products[0]
                }
                side="left"
                winner={
                  winner === "product1"
                    ? "left"
                    : null
                }
              />

              <ProductSummary
                product={
                  comparison.products[1]
                }
                side="right"
                winner={
                  winner === "product2"
                    ? "right"
                    : null
                }
              />
            </div>

            {/* NUTRITION */}

            <section className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 sm:p-5">
              <div className="mb-5 flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-400">
                  <Flame size={16} />
                </div>

                <div>
                  <h2 className="text-base font-bold text-white">
                    Nutrition comparison
                  </h2>

                  <p className="mt-1 text-[10px] leading-5 text-slate-600">
                    Lower is better for calories, sugar, fat
                    and sodium. Higher is better for protein
                    and fiber.
                  </p>
                </div>
              </div>

              <NutritionTable
                products={comparison.products}
              />

              {nutritionComparison && (
                <div className="mt-4 rounded-xl border border-white/[0.05] bg-black/15 p-3.5">
                  <p className="text-[10px] leading-5 text-slate-400">
                    <span className="font-bold text-slate-300">
                      Nutrition result:
                    </span>{" "}
                    {nutritionComparison.message}

                    {nutritionComparison.basis && (
                      <span className="text-slate-700">
                        {" "}
                        Basis:{" "}
                        {nutritionComparison.basis}.
                      </span>
                    )}
                  </p>
                </div>
              )}
            </section>

            {/* RULES */}

            <section>
              <div className="mb-3 flex items-end justify-between">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-emerald-400">
                    Safety intelligence
                  </p>

                  <h2 className="mt-1 text-lg font-bold text-white">
                    Flagged rules
                  </h2>

                  <p className="mt-1 text-[10px] text-slate-600">
                    Deterministic rules triggered during each
                    original scan.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                {comparison.products.map(
                  (product) => (
                    <section
                      key={product.id}
                      className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 sm:p-5"
                    >
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <h3 className="truncate text-sm font-bold text-white">
                          {product.name}
                        </h3>

                        <span
                          className={`shrink-0 rounded-lg border px-2 py-1 text-[9px] font-black ${gradeClass(
                            product.grade
                          )}`}
                        >
                          Grade {product.grade || "—"}
                        </span>
                      </div>

                      <RuleList
                        product={product}
                      />
                    </section>
                  )
                )}
              </div>
            </section>

            {/* INGREDIENTS */}

            <section className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-400">
                  <Leaf size={16} />
                </div>

                <div>
                  <h2 className="text-base font-bold text-white">
                    Ingredient comparison
                  </h2>

                  <p className="mt-1 text-[10px] leading-5 text-slate-600">
                    Ingredients detected and stored during each
                    product scan.
                  </p>
                </div>
              </div>

              <div className="mt-5 grid gap-5 lg:grid-cols-2">
                {comparison.products.map(
                  (product) => (
                    <div key={product.id}>
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <h3 className="truncate text-xs font-bold text-slate-300">
                          {product.name}
                        </h3>

                        <span className="text-[9px] text-slate-700">
                          {product.ingredients
                            ?.length || 0}{" "}
                          detected
                        </span>
                      </div>

                      {product.ingredients
                        ?.length ? (
                        <div className="flex flex-wrap gap-1.5">
                          {product.ingredients.map(
                            (
                              ingredient
                            ) => (
                              <span
                                key={`${product.id}-${ingredient.id}`}
                                className="rounded-lg border border-white/[0.06] bg-black/20 px-2.5 py-1.5 text-[9px] font-medium text-slate-500 transition hover:border-emerald-400/15 hover:text-emerald-300"
                              >
                                {
                                  ingredient.name
                                }
                              </span>
                            )
                          )}
                        </div>
                      ) : (
                        <div className="rounded-xl border border-white/[0.05] bg-black/15 p-4 text-center">
                          <p className="text-[10px] text-slate-700">
                            No saved ingredients for
                            this scan.
                          </p>
                        </div>
                      )}
                    </div>
                  )
                )}
              </div>
            </section>

            {/* FOOTER NOTE */}

            <div className="flex items-start gap-2 px-1 pb-5">
              <ShieldCheck
                size={13}
                className="mt-0.5 shrink-0 text-emerald-400/50"
              />

              <p className="text-[9px] leading-5 text-slate-700">
                Comparison uses LabelIQ's existing
                deterministic safety scores, stored nutrition
                values and stored rule matches. The LLM does not
                decide the winner.
              </p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}