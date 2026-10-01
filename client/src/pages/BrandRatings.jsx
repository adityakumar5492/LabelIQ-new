import { useEffect, useMemo, useState } from "react";
import {
  Search,
  Plus,
  RefreshCw,
  X,
  Building2,
  ChevronRight,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Database,
} from "lucide-react";
import api from "../api/axios";

const BrandRatings = () => {
  const [brands, setBrands] = useState([]);
  const [selectedBrand, setSelectedBrand] = useState(null);

  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [brandName, setBrandName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  // --------------------------------------------------
  // Fetch all brands
  // --------------------------------------------------

  const fetchBrands = async (showRefreshLoader = false) => {
    try {
      if (showRefreshLoader) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

      const response = await api.get("/brands");

      const data = response?.data?.data;

      if (Array.isArray(data)) {
        setBrands(data);
      } else {
        setBrands([]);
      }
    } catch (err) {
      console.error("Fetch brands error:", err);

      setError(
        err?.response?.data?.message ||
          "Failed to load brands. Please try again."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchBrands();
  }, []);

  // --------------------------------------------------
  // Fetch brand details
  // --------------------------------------------------

  const handleBrandClick = async (brand) => {
    try {
      setDetailsLoading(true);
      setError("");

      const response = await api.get(`/brands/${brand.id}`);

      setSelectedBrand(response?.data?.data || brand);
    } catch (err) {
      console.error("Fetch brand details error:", err);

      setError(
        err?.response?.data?.message ||
          "Failed to load brand details."
      );
    } finally {
      setDetailsLoading(false);
    }
  };

  // --------------------------------------------------
  // Create brand
  // --------------------------------------------------

  const handleCreateBrand = async (e) => {
    e.preventDefault();

    const trimmedName = brandName.trim();

    if (!trimmedName) {
      setCreateError("Brand name is required.");
      return;
    }

    if (trimmedName.length > 255) {
      setCreateError("Brand name must be 255 characters or less.");
      return;
    }

    try {
      setCreating(true);
      setCreateError("");
      setSuccess("");

      const response = await api.post("/brands", {
        name: trimmedName,
      });

      const createdBrand = response?.data?.data;

      if (createdBrand) {
        setBrands((prev) =>
          [...prev, createdBrand].sort((a, b) =>
            String(a.name || "").localeCompare(String(b.name || ""))
          )
        );

        setSelectedBrand(createdBrand);
      }

      setBrandName("");
      setShowCreateModal(false);

      setSuccess("Brand created successfully.");

      setTimeout(() => {
        setSuccess("");
      }, 3000);
    } catch (err) {
      console.error("Create brand error:", err);

      if (err?.response?.status === 409) {
        setCreateError("Brand already exists.");
      } else {
        setCreateError(
          err?.response?.data?.message ||
            "Failed to create brand. Please try again."
        );
      }
    } finally {
      setCreating(false);
    }
  };

  // --------------------------------------------------
  // Search
  // --------------------------------------------------

  const filteredBrands = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return brands;
    }

    return brands.filter((brand) =>
      String(brand?.name || "")
        .toLowerCase()
        .includes(query)
    );
  }, [brands, search]);

  // --------------------------------------------------
  // Helpers
  // --------------------------------------------------

  const closeCreateModal = () => {
    if (creating) return;

    setShowCreateModal(false);
    setBrandName("");
    setCreateError("");
  };

  const closeBrandDetails = () => {
    setSelectedBrand(null);
  };

  // --------------------------------------------------
  // Loading state
  // --------------------------------------------------

  if (loading) {
    return (
      <div className="min-h-full bg-[#061310] text-white">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-8">
            <div className="h-8 w-56 animate-pulse rounded-lg bg-white/10" />
            <div className="mt-3 h-4 w-80 animate-pulse rounded bg-white/5" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <div
                key={index}
                className="h-32 animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]"
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // --------------------------------------------------
  // UI
  // --------------------------------------------------

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

      <div className="relative mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/5 px-3 py-1.5 text-xs font-medium text-emerald-300">
              <Building2 size={13} />
              Brand Intelligence
            </div>

            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Brand Ratings
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/50 sm:text-base">
              Explore food brands available in the LabelIQ database and
              inspect their stored information.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => fetchBrands(true)}
              disabled={refreshing}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-white/80 transition hover:border-white/20 hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw
                size={16}
                className={refreshing ? "animate-spin" : ""}
              />
              Refresh
            </button>

            <button
              type="button"
              onClick={() => {
                setCreateError("");
                setBrandName("");
                setShowCreateModal(true);
              }}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-[#03100d] shadow-lg shadow-emerald-500/10 transition hover:bg-emerald-300"
            >
              <Plus size={17} />
              Add Brand
            </button>
          </div>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-red-400/20 bg-red-400/5 px-4 py-3.5 text-sm text-red-300">
            <AlertCircle className="mt-0.5 shrink-0" size={17} />
            <span>{error}</span>

            <button
              type="button"
              onClick={() => setError("")}
              className="ml-auto shrink-0 text-white/40 transition hover:text-white"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {success && (
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/5 px-4 py-3.5 text-sm text-emerald-300">
            <CheckCircle2 size={17} />
            <span>{success}</span>
          </div>
        )}

        {/* Stats */}
        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-white/35">
                  Total Brands
                </p>

                <p className="mt-2 text-3xl font-bold">
                  {brands.length}
                </p>
              </div>

              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-400/15 bg-emerald-400/10 text-emerald-300">
                <Building2 size={20} />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-white/35">
                  Search Results
                </p>

                <p className="mt-2 text-3xl font-bold">
                  {filteredBrands.length}
                </p>
              </div>

              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-400/15 bg-cyan-400/10 text-cyan-300">
                <Search size={20} />
              </div>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="mb-6 rounded-2xl border border-white/10 bg-white/[0.035] p-3 backdrop-blur-xl">
          <div className="relative">
            <Search
              size={18}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/30"
            />

            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search brands..."
              className="w-full rounded-xl border border-white/10 bg-black/20 py-3 pl-11 pr-10 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/10"
            />

            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-white/30 transition hover:bg-white/5 hover:text-white"
              >
                <X size={15} />
              </button>
            )}
          </div>
        </div>

        {/* Empty state */}
        {filteredBrands.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.025] px-6 py-16 text-center backdrop-blur-xl">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/30">
              <Database size={26} />
            </div>

            <h2 className="mt-5 text-lg font-semibold">
              {search ? "No brands found" : "No brands available"}
            </h2>

            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-white/40">
              {search
                ? `No brands match "${search}". Try a different search term.`
                : "There are currently no brands stored in the LabelIQ database."}
            </p>

            {!search && (
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-[#03100d] transition hover:bg-emerald-300"
              >
                <Plus size={16} />
                Add First Brand
              </button>
            )}
          </div>
        ) : (
          /* Brand grid */
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredBrands.map((brand) => (
              <button
                key={brand.id}
                type="button"
                onClick={() => handleBrandClick(brand)}
                className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035] p-5 text-left backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-emerald-400/25 hover:bg-white/[0.055] hover:shadow-xl hover:shadow-emerald-950/20"
              >
                {/* Glow */}
                <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-emerald-400/10 opacity-0 blur-2xl transition group-hover:opacity-100" />

                <div className="relative flex items-start justify-between gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-emerald-400/15 bg-emerald-400/10 text-emerald-300 transition group-hover:bg-emerald-400/15">
                    <Building2 size={20} />
                  </div>

                  <ChevronRight
                    size={18}
                    className="mt-1 text-white/20 transition group-hover:translate-x-1 group-hover:text-emerald-300"
                  />
                </div>

                <div className="relative mt-5">
                  <h3 className="truncate text-base font-semibold text-white">
                    {brand.name || "Unnamed Brand"}
                  </h3>

                  <p className="mt-1 text-xs text-white/35">
                    Brand ID #{brand.id}
                  </p>
                </div>

                <div className="relative mt-5 flex items-center justify-between border-t border-white/5 pt-4">
                  <span className="text-xs text-white/35">
                    View details
                  </span>

                  <span className="text-xs font-medium text-emerald-300/70 transition group-hover:text-emerald-300">
                    Explore
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* --------------------------------------------------
          Create Brand Modal
      -------------------------------------------------- */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-[#0a1b17] shadow-2xl shadow-black/50">
            {/* Modal header */}
            <div className="flex items-start justify-between border-b border-white/10 px-6 py-5">
              <div>
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-400/15 bg-emerald-400/10 text-emerald-300">
                  <Plus size={19} />
                </div>

                <h2 className="text-lg font-semibold">
                  Add New Brand
                </h2>

                <p className="mt-1 text-sm text-white/40">
                  Add a brand to the LabelIQ database.
                </p>
              </div>

              <button
                type="button"
                onClick={closeCreateModal}
                disabled={creating}
                className="rounded-xl p-2 text-white/40 transition hover:bg-white/5 hover:text-white disabled:opacity-40"
              >
                <X size={19} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleCreateBrand}>
              <div className="px-6 py-6">
                <label className="mb-2 block text-sm font-medium text-white/70">
                  Brand name
                </label>

                <input
                  type="text"
                  value={brandName}
                  onChange={(e) => {
                    setBrandName(e.target.value);
                    setCreateError("");
                  }}
                  placeholder="e.g. Nestlé"
                  maxLength={255}
                  autoFocus
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/10"
                />

                <div className="mt-2 flex justify-between text-xs text-white/25">
                  <span>Required</span>
                  <span>{brandName.length}/255</span>
                </div>

                {createError && (
                  <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-400/20 bg-red-400/5 px-3 py-2.5 text-sm text-red-300">
                    <AlertCircle
                      size={16}
                      className="mt-0.5 shrink-0"
                    />
                    <span>{createError}</span>
                  </div>
                )}
              </div>

              <div className="flex gap-3 border-t border-white/10 px-6 py-5">
                <button
                  type="button"
                  onClick={closeCreateModal}
                  disabled={creating}
                  className="flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-medium text-white/70 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-[#03100d] transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {creating ? (
                    <>
                      <Loader2 size={17} className="animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus size={17} />
                      Create Brand
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --------------------------------------------------
          Brand Details Modal
      -------------------------------------------------- */}
      {selectedBrand && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-white/10 bg-[#0a1b17] shadow-2xl shadow-black/50">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-white/10 px-6 py-5">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-emerald-400/15 bg-emerald-400/10 text-emerald-300">
                  <Building2 size={21} />
                </div>

                <div>
                  <p className="text-xs uppercase tracking-wider text-emerald-300/60">
                    Brand
                  </p>

                  <h2 className="mt-1 text-xl font-semibold">
                    {selectedBrand.name || "Unnamed Brand"}
                  </h2>
                </div>
              </div>

              <button
                type="button"
                onClick={closeBrandDetails}
                className="rounded-xl p-2 text-white/40 transition hover:bg-white/5 hover:text-white"
              >
                <X size={19} />
              </button>
            </div>

            {/* Details */}
            <div className="px-6 py-6">
              {detailsLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2
                    size={24}
                    className="animate-spin text-emerald-300"
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-xs uppercase tracking-wider text-white/30">
                      Brand ID
                    </p>

                    <p className="mt-1 font-medium text-white/80">
                      {selectedBrand.id}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-xs uppercase tracking-wider text-white/30">
                      Name
                    </p>

                    <p className="mt-1 font-medium text-white/80">
                      {selectedBrand.name || "Unnamed Brand"}
                    </p>
                  </div>

                  {/* 
                    Display other backend fields if the brands table
                    contains them. This keeps the UI flexible without
                    assuming fields that are not currently guaranteed.
                  */}
                  {Object.entries(selectedBrand)
                    .filter(
                      ([key]) =>
                        key !== "id" &&
                        key !== "name"
                    )
                    .map(([key, value]) => (
                      <div
                        key={key}
                        className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
                      >
                        <p className="text-xs uppercase tracking-wider text-white/30">
                          {key.replace(/_/g, " ")}
                        </p>

                        <p className="mt-1 break-words font-medium text-white/80">
                          {value === null || value === undefined
                            ? "—"
                            : typeof value === "object"
                            ? JSON.stringify(value)
                            : String(value)}
                        </p>
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-white/10 px-6 py-5">
              <button
                type="button"
                onClick={closeBrandDetails}
                className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-medium text-white/70 transition hover:bg-white/[0.06] hover:text-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BrandRatings;