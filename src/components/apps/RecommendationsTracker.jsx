import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function truncate(text, max = 160) {
  if (!text) return "";
  return text.length > max ? text.slice(0, max).trimEnd() + "…" : text;
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message, type, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);

  const bg = type === "error" ? "bg-red-600" : "bg-green-600";
  return (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[2000] px-5 py-3 rounded-xl text-white text-sm shadow-xl ${bg} flex items-center gap-3`}
    >
      <span>{message}</span>
      <button onClick={onClose} className="opacity-70 hover:opacity-100 text-lg leading-none">
        ×
      </button>
    </div>
  );
}

// ─── Add Post Modal ───────────────────────────────────────────────────────────

function AddPostModal({ categories, subcategories, residentId, onClose, onSaved }) {
  const [postType, setPostType] = useState("recommend");
  const [form, setForm] = useState({
    title: "",
    description: "",
    category_id: "",
    subcategory_id: "",
    external_url: "",
    contact_phone: "",
    contact_email: "",
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  const filteredSubs = subcategories.filter(
    (s) => String(s.category_id) === String(form.category_id)
  );

  const set = (field) => (e) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const validate = () => {
    const errs = {};
    if (!form.title.trim()) errs.title = "Title is required";
    if (!form.category_id) errs.category_id = "Category is required";
    if (form.external_url && !/^https?:\/\//.test(form.external_url))
      errs.external_url = "URL must start with http:// or https://";
    return errs;
  };

  const handleSubmit = async () => {
    const errs = validate();
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    setSaving(true);
    const payload = {
      type: postType,
      title: form.title.trim(),
      description: form.description.trim() || null,
      category_id: parseInt(form.category_id),
      subcategory_id: form.subcategory_id ? parseInt(form.subcategory_id) : null,
      external_url: form.external_url.trim() || null,
      contact_phone: form.contact_phone.trim() || null,
      contact_email: form.contact_email.trim() || null,
      created_by: residentId,
      removed: false,
      // pending_review set by DB trigger for 'avoid' posts
    };
    const { error } = await supabase.from("recommendations").insert(payload);
    setSaving(false);
    if (error) {
      onSaved(null, error.message);
    } else {
      onSaved(postType);
    }
  };

  const isAvoid = postType === "avoid";
  const labelColor = isAvoid ? "text-red-700" : "text-[#2C5F8A]";
  const accentBorder = isAvoid ? "border-red-300 focus:ring-red-400" : "border-[#C9922A] focus:ring-[#C9922A]";
  const btnColor = isAvoid
    ? "bg-red-600 hover:bg-red-700"
    : "bg-[#C9922A] hover:bg-[#a97820]";

  const inputClass = `w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2C5F8A] text-gray-800 placeholder-gray-400`;
  const labelClass = `block text-xs font-semibold text-gray-600 mb-1`;

  return (
    <div
      className="fixed inset-0 z-[1500] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div
          className={`px-6 py-4 rounded-t-2xl flex items-center justify-between ${
            isAvoid ? "bg-red-50 border-b border-red-100" : "bg-[#EAF0F7] border-b border-blue-100"
          }`}
        >
          <div>
            <h2
              className={`font-bold text-lg font-['Playfair_Display'] ${labelColor}`}
            >
              {isAvoid ? "⚠️ Post a Steer Clear Warning" : "⭐ Share a Recommendation"}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {isAvoid
                ? "Warn your neighbours about a bad experience"
                : "Recommend a business, service, or product to your neighbours"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Type toggle */}
        <div className="px-6 pt-4 pb-2 flex gap-2">
          <button
            onClick={() => setPostType("recommend")}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition ${
              postType === "recommend"
                ? "bg-[#2C5F8A] text-white border-[#2C5F8A]"
                : "bg-white text-gray-500 border-gray-200 hover:border-[#2C5F8A]"
            }`}
          >
            ⭐ Recommendation
          </button>
          <button
            onClick={() => setPostType("avoid")}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition ${
              postType === "avoid"
                ? "bg-red-600 text-white border-red-600"
                : "bg-white text-gray-500 border-gray-200 hover:border-red-400"
            }`}
          >
            ⚠️ Steer Clear
          </button>
        </div>

        {/* Form body */}
        <div className="px-6 py-4 overflow-y-auto flex-1 space-y-4">
          {/* Title */}
          <div>
            <label className={labelClass}>
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder={isAvoid ? "e.g. Dodgy Roofing Co." : "e.g. Bob's Plumbing"}
              value={form.title}
              onChange={set("title")}
              className={inputClass}
              maxLength={120}
            />
            {errors.title && (
              <p className="text-xs text-red-500 mt-1">{errors.title}</p>
            )}
          </div>

          {/* Category + Subcategory */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>
                Category <span className="text-red-500">*</span>
              </label>
              <select
                value={form.category_id}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    category_id: e.target.value,
                    subcategory_id: "",
                  }))
                }
                className={inputClass}
              >
                <option value="">Select…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {errors.category_id && (
                <p className="text-xs text-red-500 mt-1">{errors.category_id}</p>
              )}
            </div>
            <div>
              <label className={labelClass}>Subcategory</label>
              <select
                value={form.subcategory_id}
                onChange={set("subcategory_id")}
                disabled={!form.category_id || filteredSubs.length === 0}
                className={`${inputClass} disabled:opacity-50 disabled:bg-gray-50`}
              >
                <option value="">None</option>
                {filteredSubs.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className={labelClass}>Description</label>
            <textarea
              placeholder={
                isAvoid
                  ? "Describe what went wrong…"
                  : "Why do you recommend this? Any tips?"
              }
              value={form.description}
              onChange={set("description")}
              rows={3}
              className={`${inputClass} resize-none`}
              maxLength={1000}
            />
          </div>

          {/* Website */}
          <div>
            <label className={labelClass}>Website / Link</label>
            <input
              type="url"
              placeholder="https://example.com"
              value={form.external_url}
              onChange={set("external_url")}
              className={inputClass}
            />
            {errors.external_url && (
              <p className="text-xs text-red-500 mt-1">{errors.external_url}</p>
            )}
          </div>

          {/* Contact details */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Contact Phone</label>
              <input
                type="tel"
                placeholder="(609) 555-0100"
                value={form.contact_phone}
                onChange={set("contact_phone")}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Contact Email</label>
              <input
                type="email"
                placeholder="contact@example.com"
                value={form.contact_email}
                onChange={set("contact_email")}
                className={inputClass}
              />
            </div>
          </div>

          {/* Photo upload — placeholder until Session 4 */}
          <div>
            <label className={labelClass}>Photo</label>
            <div className="border border-dashed border-gray-300 rounded-lg px-4 py-3 bg-gray-50 flex items-center gap-3">
              <span className="text-2xl">📷</span>
              <div>
                <p className="text-sm text-gray-400 font-medium">Photo upload coming soon</p>
                <p className="text-xs text-gray-400">Available in a future update</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className={`px-5 py-2 text-sm font-semibold text-white rounded-lg transition ${btnColor} disabled:opacity-60`}
          >
            {saving ? "Saving…" : isAvoid ? "Post Warning" : "Post Recommendation"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Recommendation Card ──────────────────────────────────────────────────────

function RecommendationCard({ rec, isAdmin, currentResidentId, onRemove }) {
  const isAvoid = rec.type === "avoid";

  const positiveEmoji = isAvoid ? "👍" : "❤️";
  const negativeEmoji = isAvoid ? "🤔" : "👎";
  const positiveReactions = (rec.rec_reactions || []).filter((r) =>
    isAvoid ? r.reaction_type === "agree" : r.reaction_type === "heart"
  );
  const negativeReactions = (rec.rec_reactions || []).filter((r) =>
    isAvoid ? r.reaction_type === "notmyexperience" : r.reaction_type === "thumbsdown"
  );

  const recommenderName = rec.profiles
    ? `${rec.profiles.names ?? ""} ${rec.profiles.surname ?? ""}`.trim()
    : "A neighbour";

  const categoryName = rec.rec_categories?.name ?? "";
  const subcategoryName = rec.rec_subcategories?.name ?? "";

  return (
    <div
      className={`rounded-2xl border shadow-sm hover:shadow-md transition-shadow bg-white overflow-hidden flex flex-col ${
        isAvoid ? "border-red-200" : "border-[#C9922A]/30"
      }`}
    >
      {/* Type banner */}
      <div
        className={`px-4 py-1.5 flex items-center justify-between text-xs font-semibold ${
          isAvoid
            ? "bg-red-50 text-red-700"
            : "bg-amber-50 text-amber-800"
        }`}
      >
        <span>{isAvoid ? "⚠️ Steer Clear" : "⭐ Recommendation"}</span>
        {rec.pending_review && isAdmin && (
          <span className="bg-red-500 text-white px-2 py-0.5 rounded-full text-[10px]">
            Pending Review
          </span>
        )}
      </div>

      <div className="p-4 flex-1 flex flex-col gap-3">
        {/* Category breadcrumb */}
        {categoryName && (
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <span>{categoryName}</span>
            {subcategoryName && (
              <>
                <span>›</span>
                <span>{subcategoryName}</span>
              </>
            )}
          </div>
        )}

        {/* Title */}
        <h3 className="font-bold text-gray-800 text-base leading-snug font-['Playfair_Display']">
          {rec.title}
        </h3>

        {/* Description */}
        {rec.description && (
          <p className="text-sm text-gray-600 leading-relaxed">
            {truncate(rec.description)}
          </p>
        )}

        {/* Contact details */}
        {(rec.contact_phone || rec.contact_email || rec.external_url) && (
          <div className="flex flex-wrap gap-3 text-xs text-gray-500">
            {rec.contact_phone && (
              <a
                href={`tel:${rec.contact_phone}`}
                className="flex items-center gap-1 hover:text-[#2C5F8A] transition"
              >
                📞 {rec.contact_phone}
              </a>
            )}
            {rec.contact_email && (
              <a
                href={`mailto:${rec.contact_email}`}
                className="flex items-center gap-1 hover:text-[#2C5F8A] transition"
              >
                ✉️ {rec.contact_email}
              </a>
            )}
            {rec.external_url && (
              <a
                href={rec.external_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 hover:text-[#2C5F8A] transition"
              >
                🔗 Website
              </a>
            )}
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Footer row */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
          {/* Recommender + date */}
          <div className="text-xs text-gray-400">
            <span className="text-gray-600 font-medium">{recommenderName}</span>
            <span className="mx-1">·</span>
            {formatDate(rec.created_at)}
          </div>

          {/* Reaction placeholders */}
          <div className="flex items-center gap-2">
            <button
              disabled
              title={`${positiveReactions.length} ${isAvoid ? "agree" : "hearts"} — reactions coming soon`}
              className="flex items-center gap-1 text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full cursor-default"
            >
              {positiveEmoji} <span>{positiveReactions.length}</span>
            </button>
            <button
              disabled
              title={`${negativeReactions.length} ${isAvoid ? "not my experience" : "thumbsdowns"} — reactions coming soon`}
              className="flex items-center gap-1 text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full cursor-default"
            >
              {negativeEmoji} <span>{negativeReactions.length}</span>
            </button>
          </div>
        </div>

        {/* Admin controls */}
        {isAdmin && (
          <div className="flex gap-2 pt-2 border-t border-gray-100">
            <button
              onClick={() => onRemove(rec)}
              className="text-xs text-red-500 hover:text-red-700 transition"
            >
              Remove post
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Confirm Remove Modal ─────────────────────────────────────────────────────

function ConfirmRemoveModal({ rec, onClose, onConfirm, saving }) {
  return (
    <div
      className="fixed inset-0 z-[1500] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <h3 className="font-bold text-gray-800 text-lg mb-2 font-['Playfair_Display']">
          Remove Post?
        </h3>
        <p className="text-sm text-gray-600 mb-5">
          Are you sure you want to remove{" "}
          <span className="font-semibold">"{rec.title}"</span>? This cannot be
          undone.
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={saving}
            className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-60"
          >
            {saving ? "Removing…" : "Yes, Remove"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function RecommendationsTracker({ currentUserId, residentId, isAdmin }) {
  const [activeTab, setActiveTab] = useState("recommend"); // 'recommend' | 'avoid'
  const [recs, setRecs] = useState([]);
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterCategory, setFilterCategory] = useState("");
  const [filterSubcategory, setFilterSubcategory] = useState("");
  const [sortBy, setSortBy] = useState("newest"); // 'newest' | 'popular'

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [removeSaving, setRemoveSaving] = useState(false);

  // Toast
  const [toast, setToast] = useState(null);
  const showToast = (message, type = "success") => setToast({ message, type });

  // ── Fetch categories ──
  useEffect(() => {
    const fetchCategories = async () => {
      const [{ data: cats }, { data: subs }] = await Promise.all([
        supabase.from("rec_categories").select("*").order("name"),
        supabase.from("rec_subcategories").select("*").order("name"),
      ]);
      setCategories(cats || []);
      setSubcategories(subs || []);
    };
    fetchCategories();
  }, []);

  // ── Fetch recommendations ──
  const fetchRecs = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("recommendations")
      .select(
        `*,
        profiles!created_by (resident_id, names, surname),
        rec_categories!category_id (id, name),
        rec_subcategories!subcategory_id (id, name),
        rec_reactions (id, reaction_type, user_id)`
      )
      .eq("removed", false)
      .eq("type", activeTab)
      .order("created_at", { ascending: false });

    if (error) {
      showToast("Failed to load recommendations", "error");
    } else {
      setRecs(data || []);
    }
    setLoading(false);
  }, [activeTab]);

  useEffect(() => {
    fetchRecs();
  }, [fetchRecs]);

  // Reset subcategory filter when category changes
  useEffect(() => {
    setFilterSubcategory("");
  }, [filterCategory]);

  // ── Filtered + sorted list ──
  const filteredRecs = recs
    .filter((r) => {
      if (filterCategory && String(r.category_id) !== String(filterCategory)) return false;
      if (filterSubcategory && String(r.subcategory_id) !== String(filterSubcategory)) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "newest") {
        return new Date(b.created_at) - new Date(a.created_at);
      }
      // popular: sort by positive reaction count
      const positiveType = activeTab === "avoid" ? "agree" : "heart";
      const aCount = (a.rec_reactions || []).filter((r) => r.reaction_type === positiveType).length;
      const bCount = (b.rec_reactions || []).filter((r) => r.reaction_type === positiveType).length;
      return bCount - aCount;
    });

  const filteredSubs = subcategories.filter(
    (s) => String(s.category_id) === String(filterCategory)
  );

  // ── Add post saved ──
  const handlePostSaved = (postType, errorMsg) => {
    setShowAddModal(false);
    if (errorMsg) {
      showToast(`Error: ${errorMsg}`, "error");
      return;
    }
    showToast(
      postType === "avoid"
        ? "Steer Clear warning posted and flagged for admin review."
        : "Recommendation posted successfully!"
    );
    fetchRecs();
  };

  // ── Remove post ──
  const handleRemoveConfirm = async () => {
    if (!removeTarget) return;
    setRemoveSaving(true);
    const { error } = await supabase
      .from("recommendations")
      .update({ removed: true })
      .eq("id", removeTarget.id);
    setRemoveSaving(false);
    setRemoveTarget(null);
    if (error) {
      showToast("Failed to remove post", "error");
    } else {
      showToast("Post removed.");
      setRecs((prev) => prev.filter((r) => r.id !== removeTarget.id));
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-[#1A3F5C] font-['Playfair_Display']">
          Residents' Recommendations
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Share tips and steer-clear warnings with your neighbours
        </p>
      </div>

      {/* Tab bar + Add button */}
      <div className="flex items-center justify-between gap-4 mb-5 flex-wrap">
        {/* Tabs */}
        <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
          <button
            onClick={() => {
              setActiveTab("recommend");
              setFilterCategory("");
              setFilterSubcategory("");
            }}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition ${
              activeTab === "recommend"
                ? "bg-white text-[#2C5F8A] shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            ⭐ Recommendations
            {activeTab !== "recommend" && recs.length === 0 ? "" : ""}
          </button>
          <button
            onClick={() => {
              setActiveTab("avoid");
              setFilterCategory("");
              setFilterSubcategory("");
            }}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition ${
              activeTab === "avoid"
                ? "bg-white text-red-700 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            ⚠️ Steer Clear
          </button>
        </div>

        {/* Add button */}
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[#C9922A] hover:bg-[#a97820] text-white text-sm font-semibold rounded-xl transition shadow-sm"
        >
          <span className="text-lg leading-none">+</span>
          Add Post
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5 items-center">
        {/* Category filter */}
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#2C5F8A] min-w-[160px]"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        {/* Subcategory filter */}
        {filterCategory && filteredSubs.length > 0 && (
          <select
            value={filterSubcategory}
            onChange={(e) => setFilterSubcategory(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#2C5F8A] min-w-[160px]"
          >
            <option value="">All subcategories</option>
            {filteredSubs.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}

        {/* Sort */}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-gray-400">Sort:</span>
          <button
            onClick={() => setSortBy("newest")}
            className={`text-xs px-3 py-1.5 rounded-lg border transition ${
              sortBy === "newest"
                ? "bg-[#2C5F8A] text-white border-[#2C5F8A]"
                : "border-gray-200 text-gray-500 hover:border-[#2C5F8A]"
            }`}
          >
            Newest
          </button>
          <button
            onClick={() => setSortBy("popular")}
            className={`text-xs px-3 py-1.5 rounded-lg border transition ${
              sortBy === "popular"
                ? "bg-[#2C5F8A] text-white border-[#2C5F8A]"
                : "border-gray-200 text-gray-500 hover:border-[#2C5F8A]"
            }`}
          >
            Most Popular
          </button>
        </div>
      </div>

      {/* Result count */}
      {!loading && (
        <p className="text-xs text-gray-400 mb-4">
          {filteredRecs.length === 0
            ? "No posts found"
            : `${filteredRecs.length} post${filteredRecs.length === 1 ? "" : "s"}`}
          {filterCategory &&
            ` in ${categories.find((c) => String(c.id) === String(filterCategory))?.name ?? ""}`}
        </p>
      )}

      {/* Cards grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#2C5F8A]" />
        </div>
      ) : filteredRecs.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-5xl mb-3">{activeTab === "avoid" ? "⚠️" : "⭐"}</div>
          <p className="font-medium text-gray-500">
            {activeTab === "avoid"
              ? "No Steer Clear warnings yet"
              : "No recommendations yet"}
          </p>
          <p className="text-sm mt-1">Be the first to post one!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredRecs.map((rec) => (
            <RecommendationCard
              key={rec.id}
              rec={rec}
              isAdmin={isAdmin}
              currentResidentId={residentId}
              onRemove={(r) => setRemoveTarget(r)}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {showAddModal && (
        <AddPostModal
          categories={categories}
          subcategories={subcategories}
          residentId={residentId}
          onClose={() => setShowAddModal(false)}
          onSaved={handlePostSaved}
        />
      )}

      {removeTarget && (
        <ConfirmRemoveModal
          rec={removeTarget}
          onClose={() => setRemoveTarget(null)}
          onConfirm={handleRemoveConfirm}
          saving={removeSaving}
        />
      )}

      {/* Toast */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
