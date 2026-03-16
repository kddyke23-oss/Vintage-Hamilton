import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useImageUpload } from "@/hooks/useImageUpload";

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

// Extract storage path from a Supabase public URL and delete the file
// e.g. https://xyz.supabase.co/storage/v1/object/public/recommendations/cards/file.jpg
// → deletes 'cards/file.jpg' from the 'recommendations' bucket
async function deleteStoragePhoto(photoUrl, bucket) {
  if (!photoUrl) return;
  try {
    const marker = `/object/public/${bucket}/`;
    const idx = photoUrl.indexOf(marker);
    if (idx === -1) return;
    const storagePath = photoUrl.slice(idx + marker.length);
    await supabase.storage.from(bucket).remove([storagePath]);
  } catch {}
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

// ─── Add / Edit Post Modal ────────────────────────────────────────────────────

function AddPostModal({ categories, subcategories, residentId, onClose, onSaved, editRec = null }) {
  const isEditMode = editRec !== null;

  const [postType, setPostType] = useState(editRec?.type ?? "recommend");
  const [form, setForm] = useState({
    title:         editRec?.title ?? "",
    description:   editRec?.description ?? "",
    category_id:   editRec?.category_id ? String(editRec.category_id) : "",
    subcategory_id: editRec?.subcategory_id ? String(editRec.subcategory_id) : "",
    external_url:  editRec?.external_url ?? "",
    contact_phone: editRec?.contact_phone ?? "",
    contact_email: editRec?.contact_email ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  // Photo upload
  const [photoFile, setPhotoFile] = useState(null);
  // In edit mode seed the preview from the existing photo_url
  const [photoPreview, setPhotoPreview] = useState(editRec?.photo_url ?? null);
  // Track whether we want to keep the existing photo (no new file selected, preview still showing)
  const existingPhotoUrl = editRec?.photo_url ?? null;
  const fileInputRef = useRef(null);
  const { uploading: photoUploading, error: photoError, uploadImage } = useImageUpload({
    bucket: "recommendations",
    folder: "cards",
    maxDimension: 1200,
  });

  // Has this post received any reactions? If so, type change is locked.
  const hasReactions = (editRec?.rec_reactions?.length ?? 0) > 0;

  const filteredSubs = subcategories.filter(
    (s) => String(s.category_id) === String(form.category_id)
  );

  const set = (field) => (e) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    setPhotoFile(file);
    const url = URL.createObjectURL(file);
    setPhotoPreview(url);
  };

  const handleRemovePhoto = () => {
    setPhotoFile(null);
    if (photoPreview && photoPreview !== existingPhotoUrl) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

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
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true);

    // Resolve photo_url:
    // - new file selected → upload it
    // - preview still shows existing url, no new file → keep existing
    // - preview cleared → set null (remove photo)
    let photo_url = null;
    if (photoFile) {
      photo_url = await uploadImage(photoFile);
      if (!photo_url) { setSaving(false); return; }
    } else if (photoPreview && photoPreview === existingPhotoUrl) {
      photo_url = existingPhotoUrl;
    }

    const payload = {
      type: postType,
      title: form.title.trim(),
      description: form.description.trim() || null,
      category_id: parseInt(form.category_id),
      subcategory_id: form.subcategory_id ? parseInt(form.subcategory_id) : null,
      external_url: form.external_url.trim() || null,
      contact_phone: form.contact_phone.trim() || null,
      contact_email: form.contact_email.trim() || null,
      photo_url,
    };

    let error;
    if (isEditMode) {
      ;({ error } = await supabase.from("recommendations").update(payload).eq("id", editRec.id));
    } else {
      ;({ error } = await supabase.from("recommendations").insert({
        ...payload,
        created_by: residentId,
        removed: false,
        // pending_review set by DB trigger for 'avoid' posts
      }));
    }

    setSaving(false);
    if (error) {
      onSaved(null, error.message);
    } else {
      onSaved(postType, null, isEditMode);
    }
  };

  const isAvoid = postType === "avoid";
  const labelColor = isAvoid ? "text-red-700" : "text-[#2C5F8A]";
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
            <h2 className={`font-bold text-lg font-['Playfair_Display'] ${labelColor}`}>
              {isEditMode
                ? isAvoid ? "⚠️ Edit Steer Clear Warning" : "⭐ Edit Recommendation"
                : isAvoid ? "⚠️ Post a Steer Clear Warning" : "⭐ Share a Recommendation"}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {isEditMode
                ? "Update your post details below"
                : isAvoid
                ? "Warn your neighbours about a bad experience"
                : "Recommend a business, service, or product to your neighbours"}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        {/* Type toggle */}
        <div className="px-6 pt-4 pb-2 flex flex-col gap-2">
          <div className="flex gap-2">
            <button
              onClick={() => { if (!hasReactions) setPostType("recommend"); }}
              disabled={hasReactions}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition ${
                postType === "recommend"
                  ? "bg-[#2C5F8A] text-white border-[#2C5F8A]"
                  : "bg-white text-gray-500 border-gray-200 hover:border-[#2C5F8A]"
              } ${hasReactions ? "opacity-60 cursor-not-allowed" : ""}`}
            >
              ⭐ Recommendation
            </button>
            <button
              onClick={() => { if (!hasReactions) setPostType("avoid"); }}
              disabled={hasReactions}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition ${
                postType === "avoid"
                  ? "bg-red-600 text-white border-red-600"
                  : "bg-white text-gray-500 border-gray-200 hover:border-red-400"
              } ${hasReactions ? "opacity-60 cursor-not-allowed" : ""}`}
            >
              ⚠️ Steer Clear
            </button>
          </div>
          {/* Locked type message */}
          {isEditMode && hasReactions && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              ⚠️ Post type cannot be changed after reactions have been received — please remove and repost if needed.
            </p>
          )}
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

          {/* Photo upload */}
          <div>
            <label className={labelClass}>Photo</label>

            {photoPreview ? (
              /* Preview state */
              <div className="relative rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
                <img
                  src={photoPreview}
                  alt="Preview"
                  className="w-full max-h-48 object-cover"
                />
                <button
                  onClick={handleRemovePhoto}
                  className="absolute top-2 right-2 bg-white bg-opacity-90 hover:bg-opacity-100 text-gray-700 rounded-full w-7 h-7 flex items-center justify-center shadow text-sm font-bold transition"
                  title="Remove photo"
                >
                  ×
                </button>
              </div>
            ) : (
              /* Drop zone / picker */
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full border border-dashed border-gray-300 rounded-lg px-4 py-4 bg-gray-50 hover:bg-gray-100 transition flex flex-col items-center gap-1 cursor-pointer"
              >
                <span className="text-2xl">📷</span>
                <span className="text-sm text-gray-500 font-medium">
                  Click to add a photo
                </span>
                <span className="text-xs text-gray-400">
                  JPEG, PNG or WebP · max 5 MB · compressed automatically
                </span>
              </button>
            )}

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp"
              onChange={handlePhotoChange}
              className="hidden"
            />

            {/* Upload error */}
            {photoError && (
              <p className="text-xs text-red-500 mt-1">{photoError}</p>
            )}
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
            disabled={saving || photoUploading}
            className={`px-5 py-2 text-sm font-semibold text-white rounded-lg transition ${btnColor} disabled:opacity-60`}
          >
            {photoUploading
              ? "Uploading photo…"
              : saving
              ? "Saving…"
              : isEditMode
              ? "Save Changes"
              : isAvoid
              ? "Post Warning"
              : "Post Recommendation"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Negative Reaction Modal ──────────────────────────────────────────────────
// Shown when user clicks 👎 or 🤔 — requires a mandatory comment before submitting.

function NegativeReactionModal({ rec, reactionType, residentId, onClose, onSaved }) {
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isAvoid = rec.type === "avoid";
  const emoji = isAvoid ? "🤔" : "👎";
  const label = isAvoid ? "Not My Experience" : "Thumbs Down";
  const promptText = isAvoid
    ? "Please describe your experience to help your neighbours:"
    : "Please share why you disagree with this recommendation:";

  const handleSubmit = async () => {
    if (!comment.trim()) {
      setError("A comment is required.");
      return;
    }
    setSaving(true);

    // 1. Upsert reaction row (toggles: if they already reacted negatively this replaces it;
    //    UNIQUE(recommendation_id, user_id) means we upsert on conflict)
    const { error: reactionError } = await supabase
      .from("rec_reactions")
      .upsert(
        {
          recommendation_id: rec.id,
          user_id: residentId,
          reaction_type: reactionType,
        },
        { onConflict: "recommendation_id,user_id" }
      );

    if (reactionError) {
      setSaving(false);
      setError("Failed to save reaction. Please try again.");
      return;
    }

    // 2. Insert report with the mandatory comment
    const { error: reportError } = await supabase.from("rec_reports").insert({
      recommendation_id: rec.id,
      reporter_id: residentId,
      reaction_type: reactionType,
      comment: comment.trim(),
      comment_public: false,
    });

    setSaving(false);
    if (reportError) {
      setError("Failed to submit your comment. Please try again.");
      return;
    }

    onSaved(reactionType);
  };

  return (
    <div
      className="fixed inset-0 z-[1600] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-gray-50 rounded-t-2xl border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-gray-800 text-base font-['Playfair_Display']">
              {emoji} {label}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Your comment will be reviewed by an administrator
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-3">
          {/* Post title context */}
          <div className="bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-600 border border-gray-100">
            <span className="font-semibold text-gray-800">{rec.title}</span>
          </div>

          {/* Comment */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              {promptText} <span className="text-red-500">*</span>
            </label>
            <textarea
              value={comment}
              onChange={(e) => {
                setComment(e.target.value);
                if (error) setError("");
              }}
              rows={4}
              maxLength={500}
              placeholder="Share your experience or reason…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2C5F8A] resize-none text-gray-800 placeholder-gray-400"
            />
            <div className="flex justify-between items-center mt-1">
              {error ? (
                <p className="text-xs text-red-500">{error}</p>
              ) : (
                <p className="text-xs text-gray-400">
                  Your comment will only be visible to admins unless they choose to make it public.
                </p>
              )}
              <span className="text-xs text-gray-400 ml-2 shrink-0">
                {comment.length}/500
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition text-gray-600"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-5 py-2 text-sm font-semibold text-white bg-[#2C5F8A] hover:bg-[#1A3F5C] rounded-lg transition disabled:opacity-60"
          >
            {saving ? "Submitting…" : "Submit"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Public Comments Modal ────────────────────────────────────────────────────
// Shown when a resident clicks a negative reaction count that has public comments.

function PublicCommentsModal({ rec, onClose }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);

  const isAvoid = rec.type === "avoid";
  const emoji = isAvoid ? "🤔" : "👎";
  const label = isAvoid ? "Not My Experience" : "Thumbs Down";

  useEffect(() => {
    const fetchComments = async () => {
      const { data } = await supabase
        .from("rec_reports")
        .select("id, comment, created_at, profiles!reporter_id(names, surname)")
        .eq("recommendation_id", rec.id)
        .eq("comment_public", true)
        .order("created_at", { ascending: true });
      setComments(data || []);
      setLoading(false);
    };
    fetchComments();
  }, [rec.id]);

  return (
    <div
      className="fixed inset-0 z-[1600] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-gray-50 rounded-t-2xl border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-gray-800 text-base font-['Playfair_Display']">
              {emoji} {label} — Neighbour Comments
            </h2>
            <p className="text-xs text-gray-500 mt-0.5 truncate max-w-[280px]">
              {rec.title}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none ml-3"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 overflow-y-auto flex-1">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#2C5F8A]" />
            </div>
          ) : comments.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No public comments yet.</p>
          ) : (
            <div className="space-y-3">
              {comments.map((c) => {
                const name = c.profiles
                  ? `${c.profiles.names ?? ""} ${c.profiles.surname ?? ""}`.trim()
                  : "A neighbour";
                return (
                  <div key={c.id} className="bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
                    <p className="text-sm text-gray-700 leading-relaxed">{c.comment}</p>
                    <p className="text-xs text-gray-400 mt-2">
                      {name} · {formatDate(c.created_at)}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 text-sm font-semibold bg-[#2C5F8A] text-white rounded-lg hover:bg-[#1A3F5C] transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Recommendation Detail Modal ─────────────────────────────────────────────

function RecDetailModal({
  rec,
  isAdmin,
  currentResidentId,
  onClose,
  onRemove,
  onEdit,
  onAcknowledge,
  onReactionChange,
  onConflictToast,
}) {
  const isAvoid = rec.type === "avoid";

  const positiveType = isAvoid ? "agree" : "heart";
  const negativeType = isAvoid ? "notmyexperience" : "thumbsdown";
  const positiveEmoji = isAvoid ? "👍" : "❤️";
  const negativeEmoji = isAvoid ? "🤔" : "👎";

  const positiveReactions = (rec.rec_reactions || []).filter(
    (r) => r.reaction_type === positiveType
  );
  const negativeReactions = (rec.rec_reactions || []).filter(
    (r) => r.reaction_type === negativeType
  );

  const myReaction = (rec.rec_reactions || []).find(
    (r) => String(r.user_id) === String(currentResidentId)
  );
  const myPositive = myReaction?.reaction_type === positiveType;
  const myNegative = myReaction?.reaction_type === negativeType;
  const isOwner = String(rec.created_by) === String(currentResidentId);

  const [showNegativeModal, setShowNegativeModal] = useState(false);
  const [reactSaving, setReactSaving] = useState(false);
  const [publicComments, setPublicComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(true);

  const recommenderName = rec.profiles
    ? `${rec.profiles.names ?? ""} ${rec.profiles.surname ?? ""}`.trim()
    : "A neighbour";
  const categoryName = rec.rec_categories?.name ?? "";
  const subcategoryName = rec.rec_subcategories?.name ?? "";

  // Fetch public comments on mount
  useEffect(() => {
    const fetchComments = async () => {
      const { data } = await supabase
        .from("rec_reports")
        .select("id, comment, created_at, profiles!reporter_id(names, surname)")
        .eq("recommendation_id", rec.id)
        .eq("comment_public", true)
        .order("created_at", { ascending: true });
      setPublicComments(data || []);
      setCommentsLoading(false);
    };
    fetchComments();
  }, [rec.id]);

  // ── Positive reaction ──
  const handlePositiveClick = async () => {
    if (isOwner || reactSaving) return;
    if (myNegative) { onConflictToast(); return; }
    setReactSaving(true);
    if (myPositive) {
      await supabase
        .from("rec_reactions")
        .delete()
        .eq("recommendation_id", rec.id)
        .eq("user_id", currentResidentId);
    } else {
      await supabase
        .from("rec_reactions")
        .upsert(
          { recommendation_id: rec.id, user_id: currentResidentId, reaction_type: positiveType },
          { onConflict: "recommendation_id,user_id" }
        );
    }
    setReactSaving(false);
    onReactionChange(rec.id);
  };

  // ── Negative reaction ──
  const handleNegativeClick = () => {
    if (isOwner || reactSaving) return;
    if (myPositive) { onConflictToast(); return; }
    if (myNegative) { handleRemoveNegative(); return; }
    setShowNegativeModal(true);
  };

  const handleRemoveNegative = async () => {
    setReactSaving(true);
    await Promise.all([
      supabase.from("rec_reactions").delete()
        .eq("recommendation_id", rec.id).eq("user_id", currentResidentId),
      supabase.from("rec_reports").delete()
        .eq("recommendation_id", rec.id).eq("reporter_id", currentResidentId),
    ]);
    setReactSaving(false);
    onReactionChange(rec.id);
  };

  const handleNegativeSaved = () => {
    setShowNegativeModal(false);
    onReactionChange(rec.id);
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[1500] flex items-center justify-center p-4"
        style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        onClick={onClose}
      >
        <div
          className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Photo */}
          {rec.photo_url && (
            <div className="w-full max-h-56 overflow-hidden shrink-0">
              <img
                src={rec.photo_url}
                alt={rec.title}
                className="w-full h-full object-cover"
              />
            </div>
          )}

          {/* Type banner */}
          <div
            className={`px-5 py-2 flex items-center justify-between text-xs font-semibold shrink-0 ${
              isAvoid ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"
            }`}
          >
            <span>{isAvoid ? "⚠️ Steer Clear" : "⭐ Recommendation"}</span>
            {rec.pending_review && isAdmin && (
              <span className="bg-red-500 text-white px-2 py-0.5 rounded-full text-[10px]">
                Pending Review
              </span>
            )}
          </div>

          {/* Scrollable body */}
          <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
            {/* Category breadcrumb */}
            {categoryName && (
              <div className="flex items-center gap-1 text-xs text-gray-400">
                <span>{categoryName}</span>
                {subcategoryName && <><span>›</span><span>{subcategoryName}</span></>}
              </div>
            )}

            {/* Title */}
            <h2 className="font-bold text-xl text-gray-800 font-['Playfair_Display'] leading-snug">
              {rec.title}
            </h2>

            {/* Description — full, no truncation */}
            {rec.description && (
              <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
                {rec.description}
              </p>
            )}

            {/* Contact details */}
            {(rec.contact_phone || rec.contact_email || rec.external_url) && (
              <div className="flex flex-wrap gap-3 text-sm text-gray-500 border border-gray-100 rounded-xl px-4 py-3 bg-gray-50">
                {rec.contact_phone && (
                  <a href={`tel:${rec.contact_phone}`}
                    className="flex items-center gap-1.5 hover:text-[#2C5F8A] transition">
                    📞 {rec.contact_phone}
                  </a>
                )}
                {rec.contact_email && (
                  <a href={`mailto:${rec.contact_email}`}
                    className="flex items-center gap-1.5 hover:text-[#2C5F8A] transition">
                    ✉️ {rec.contact_email}
                  </a>
                )}
                {rec.external_url && (
                  <a href={rec.external_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 hover:text-[#2C5F8A] transition">
                    🔗 Visit website
                  </a>
                )}
              </div>
            )}

            {/* Recommender + date */}
            <div className="text-xs text-gray-400">
              Posted by{" "}
              <span className="font-medium text-gray-600">{recommenderName}</span>
              {" · "}
              {formatDate(rec.created_at)}
            </div>

            {/* Reactions */}
            <div className="flex items-center gap-3 pt-1">
              {/* Positive */}
              <button
                onClick={handlePositiveClick}
                disabled={isOwner || reactSaving}
                title={isOwner ? "You can't react to your own post" : myPositive ? "Remove reaction" : ""}
                className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full transition font-medium
                  ${isOwner ? "cursor-default opacity-40 bg-gray-100 text-gray-400" : ""}
                  ${!isOwner && myPositive
                    ? isAvoid ? "bg-blue-100 text-blue-700" : "bg-rose-100 text-rose-600"
                    : !isOwner ? "bg-gray-100 text-gray-500 hover:bg-gray-200" : ""
                  }`}
              >
                {positiveEmoji} {positiveReactions.length}
              </button>

              {/* Negative — non-owners only */}
              {!isOwner && (
                <button
                  onClick={handleNegativeClick}
                  disabled={reactSaving}
                  title={myNegative ? "Remove your reaction" : isAvoid ? "Not my experience" : "Thumbs down"}
                  className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full transition font-medium
                    ${myNegative
                      ? "bg-orange-100 text-orange-700"
                      : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                    }`}
                >
                  {negativeEmoji} {negativeReactions.length}
                </button>
              )}

              {/* Negative count (display only) for owner */}
              {isOwner && (
                <span className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full bg-gray-100 text-gray-400">
                  {negativeEmoji} {negativeReactions.length}
                </span>
              )}
            </div>

            {/* Public comments */}
            {!commentsLoading && publicComments.length > 0 && (
              <div className="space-y-2 pt-1">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Neighbour Comments
                </p>
                {publicComments.map((c) => {
                  const name = c.profiles
                    ? `${c.profiles.names ?? ""} ${c.profiles.surname ?? ""}`.trim()
                    : "A neighbour";
                  return (
                    <div key={c.id} className="bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
                      <p className="text-sm text-gray-700 leading-relaxed">{c.comment}</p>
                      <p className="text-xs text-gray-400 mt-1.5">
                        {name} · {formatDate(c.created_at)}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Owner / Admin controls */}
            {(isOwner || isAdmin) && (
              <div className="pt-2 border-t border-gray-100 flex flex-wrap gap-4 items-center">
                {/* Admin: acknowledge pending Steer Clear */}
                {isAdmin && isAvoid && rec.pending_review && (
                  <button
                    onClick={() => { onClose(); onAcknowledge(rec); }}
                    className="text-sm text-green-600 hover:text-green-800 font-medium transition"
                  >
                    ✓ Acknowledge
                  </button>
                )}
                {isOwner && (
                  <button
                    onClick={() => { onClose(); onEdit(rec); }}
                    className="text-sm text-[#2C5F8A] hover:text-[#1A3F5C] transition"
                  >
                    Edit post
                  </button>
                )}
                {(isOwner || isAdmin) && (
                  <button
                    onClick={() => { onClose(); onRemove(rec); }}
                    className="text-sm text-red-500 hover:text-red-700 transition"
                  >
                    Remove post
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Footer close button */}
          <div className="px-6 py-4 border-t border-gray-100 shrink-0 flex justify-end">
            <button
              onClick={onClose}
              className="px-5 py-2 text-sm font-semibold bg-[#2C5F8A] text-white rounded-lg hover:bg-[#1A3F5C] transition"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Negative reaction modal — sits above detail modal */}
      {showNegativeModal && (
        <NegativeReactionModal
          rec={rec}
          reactionType={negativeType}
          residentId={currentResidentId}
          onClose={() => setShowNegativeModal(false)}
          onSaved={handleNegativeSaved}
        />
      )}
    </>
  );
}

// ─── Recommendation Card ──────────────────────────────────────────────────────

function RecommendationCard({
  rec,
  isAdmin,
  currentResidentId,
  onRemove,
  onEdit,
  onAcknowledge,
  onReactionChange,
  onConflictToast,
}) {
  const isAvoid = rec.type === "avoid";

  const positiveType = isAvoid ? "agree" : "heart";
  const negativeType = isAvoid ? "notmyexperience" : "thumbsdown";
  const positiveEmoji = isAvoid ? "👍" : "❤️";
  const negativeEmoji = isAvoid ? "🤔" : "👎";

  const positiveReactions = (rec.rec_reactions || []).filter(
    (r) => r.reaction_type === positiveType
  );
  const negativeReactions = (rec.rec_reactions || []).filter(
    (r) => r.reaction_type === negativeType
  );

  // Has the current resident already reacted?
  const myReaction = (rec.rec_reactions || []).find(
    (r) => String(r.user_id) === String(currentResidentId)
  );
  const myPositive = myReaction?.reaction_type === positiveType;
  const myNegative = myReaction?.reaction_type === negativeType;

  const isOwner = String(rec.created_by) === String(currentResidentId);

  // Public comments available to show?
  const hasPublicComments = (rec.rec_reports || []).some((r) => r.comment_public);

  // Modal state (local to each card)
  const [showDetail, setShowDetail] = useState(false);
  const [showNegativeModal, setShowNegativeModal] = useState(false);
  const [showPublicComments, setShowPublicComments] = useState(false);
  const [reactSaving, setReactSaving] = useState(false);

  const recommenderName = rec.profiles
    ? `${rec.profiles.names ?? ""} ${rec.profiles.surname ?? ""}`.trim()
    : "A neighbour";

  const categoryName = rec.rec_categories?.name ?? "";
  const subcategoryName = rec.rec_subcategories?.name ?? "";

  // ── Toggle positive reaction ──
  const handlePositiveClick = async () => {
    if (isOwner || reactSaving) return;

    // Block if they already have a negative reaction — must remove it first
    if (myNegative) {
      onConflictToast();
      return;
    }

    setReactSaving(true);

    if (myPositive) {
      // Remove reaction
      await supabase
        .from("rec_reactions")
        .delete()
        .eq("recommendation_id", rec.id)
        .eq("user_id", currentResidentId);
    } else {
      await supabase
        .from("rec_reactions")
        .upsert(
          {
            recommendation_id: rec.id,
            user_id: currentResidentId,
            reaction_type: positiveType,
          },
          { onConflict: "recommendation_id,user_id" }
        );
    }

    setReactSaving(false);
    onReactionChange(rec.id);
  };

  // ── Negative reaction: open modal for mandatory comment ──
  const handleNegativeClick = () => {
    if (isOwner || reactSaving) return;
    // Block if they already have a positive reaction — must remove it first
    if (myPositive) {
      onConflictToast();
      return;
    }
    // If they already reacted negatively, clicking again removes it (no comment needed)
    if (myNegative) {
      handleRemoveNegative();
      return;
    }
    setShowNegativeModal(true);
  };

  const handleRemoveNegative = async () => {
    setReactSaving(true);
    // Delete both the reaction and any reports from this resident on this post
    await Promise.all([
      supabase
        .from("rec_reactions")
        .delete()
        .eq("recommendation_id", rec.id)
        .eq("user_id", currentResidentId),
      supabase
        .from("rec_reports")
        .delete()
        .eq("recommendation_id", rec.id)
        .eq("reporter_id", currentResidentId),
    ]);
    setReactSaving(false);
    onReactionChange(rec.id);
  };

  const handleNegativeSaved = () => {
    setShowNegativeModal(false);
    onReactionChange(rec.id);
  };

  return (
    <>
      <div
        onClick={() => setShowDetail(true)}
        className={`rounded-2xl border shadow-sm hover:shadow-md transition-shadow bg-white overflow-hidden flex flex-col cursor-pointer ${
          isAvoid ? "border-red-200" : "border-[#C9922A]/30"
        }`}
      >
        {/* Photo thumbnail */}
        {rec.photo_url && (
          <div className="w-full h-36 overflow-hidden shrink-0">
            <img
              src={rec.photo_url}
              alt={rec.title}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Type banner */}
        <div
          className={`px-4 py-1.5 flex items-center justify-between text-xs font-semibold ${
            isAvoid ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"
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

            {/* Reaction buttons */}
            <div className="flex items-center gap-2">
              {/* Positive reaction */}
              <button
                onClick={(e) => { e.stopPropagation(); handlePositiveClick(); }}
                disabled={isOwner || reactSaving}
                title={
                  isOwner
                    ? "You can't react to your own post"
                    : myPositive
                    ? `Remove your ${positiveType}`
                    : `${positiveType === "heart" ? "Love it" : "I agree"}`
                }
                className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full transition
                  ${isOwner ? "cursor-default opacity-40 bg-gray-100 text-gray-400" : ""}
                  ${!isOwner && myPositive
                    ? isAvoid
                      ? "bg-blue-100 text-blue-700 font-semibold"
                      : "bg-rose-100 text-rose-600 font-semibold"
                    : !isOwner
                    ? "bg-gray-100 text-gray-500 hover:bg-gray-200"
                    : ""
                  }`}
              >
                {positiveEmoji} <span>{positiveReactions.length}</span>
              </button>

              {/* Negative reaction button — only for non-owners */}
              {!isOwner && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleNegativeClick(); }}
                  disabled={reactSaving}
                  title={myNegative ? "Remove your reaction" : isAvoid ? "Not my experience" : "Thumbs down"}
                  className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full transition
                    ${myNegative
                      ? "bg-orange-100 text-orange-700 font-semibold"
                      : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                    }`}
                >
                  {negativeEmoji} <span>{negativeReactions.length}</span>
                </button>
              )}

              {/* Negative count (display only) for post owner */}
              {isOwner && (
                <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-400">
                  {negativeEmoji} <span>{negativeReactions.length}</span>
                </span>
              )}

              {/* View public comments — opens detail modal */}
              {hasPublicComments && (
                <button
                  onClick={(e) => { e.stopPropagation(); setShowDetail(true); }}
                  className="text-xs text-[#2C5F8A] underline underline-offset-2 hover:text-[#1A3F5C] transition"
                  title="View neighbour comments"
                >
                  View comments
                </button>
              )}
            </div>
          </div>

          {/* Owner / Admin controls */}
          {(isOwner || isAdmin) && (
            <div className="flex gap-2 pt-2 border-t border-gray-100">
              {isOwner && (
                <button
                  onClick={(e) => { e.stopPropagation(); onEdit(rec); }}
                  className="text-xs text-[#2C5F8A] hover:text-[#1A3F5C] transition"
                >
                  Edit post
                </button>
              )}
              {(isOwner || isAdmin) && (
                <button
                  onClick={(e) => { e.stopPropagation(); onRemove(rec); }}
                  className="text-xs text-red-500 hover:text-red-700 transition"
                >
                  Remove post
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Detail modal */}
      {showDetail && (
        <RecDetailModal
          rec={rec}
          isAdmin={isAdmin}
          currentResidentId={currentResidentId}
          onClose={() => setShowDetail(false)}
          onRemove={onRemove}
          onEdit={onEdit}
          onAcknowledge={onAcknowledge}
          onReactionChange={onReactionChange}
          onConflictToast={onConflictToast}
        />
      )}

      {/* Negative reaction modal */}
      {showNegativeModal && (
        <NegativeReactionModal
          rec={rec}
          reactionType={negativeType}
          residentId={currentResidentId}
          onClose={() => setShowNegativeModal(false)}
          onSaved={handleNegativeSaved}
        />
      )}
    </>
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
  const location = useLocation();
  const [activeTab, setActiveTab] = useState("recommend");
  const [recs, setRecs] = useState([]);
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterCategory, setFilterCategory] = useState("");
  const [filterSubcategory, setFilterSubcategory] = useState("");
  const [sortBy, setSortBy] = useState("newest");

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [removeSaving, setRemoveSaving] = useState(false);
  const [deepLinkRec, setDeepLinkRec] = useState(null); // rec to open via ?openPost

  // Toast
  const [toast, setToast] = useState(null);
  const showToast = (message, type = "success") => setToast({ message, type });
  const showConflictToast = () =>
    showToast("You can't react both positively and negatively — remove your existing reaction first.", "error");

  // ── Deep link: ?openPost=ID ──
  // Navigating here from admin reports opens the detail modal for that post
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const openPostId = params.get("openPost");
    if (!openPostId) return;

    const fetchDeepLinkRec = async () => {
      const { data } = await supabase
        .from("recommendations")
        .select(
          `*, profiles!created_by(resident_id, names, surname),
          rec_categories!category_id(id, name),
          rec_subcategories!subcategory_id(id, name),
          rec_reactions(id, reaction_type, user_id),
          rec_reports!recommendation_id(id, comment_public)`
        )
        .eq("id", openPostId)
        .single();

      if (data) {
        // Switch to the correct tab so the card list matches
        setActiveTab(data.type);
        setDeepLinkRec(data);
      }
    };
    fetchDeepLinkRec();
  }, [location.search]);

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
  // Includes rec_reactions AND rec_reports (public only) for card display
  const fetchRecs = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("recommendations")
      .select(
        `*,
        profiles!created_by (resident_id, names, surname),
        rec_categories!category_id (id, name),
        rec_subcategories!subcategory_id (id, name),
        rec_reactions (id, reaction_type, user_id),
        rec_reports!recommendation_id (id, comment_public)`
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

  // ── Refresh a single rec's reactions after a reaction change ──
  // Avoids full reload — fetches updated reactions + reports for just that card
  const handleReactionChange = useCallback(async (recId) => {
    const { data } = await supabase
      .from("recommendations")
      .select(
        `rec_reactions (id, reaction_type, user_id),
         rec_reports!recommendation_id (id, comment_public)`
      )
      .eq("id", recId)
      .single();

    if (data) {
      setRecs((prev) =>
        prev.map((r) =>
          r.id === recId
            ? { ...r, rec_reactions: data.rec_reactions, rec_reports: data.rec_reports }
            : r
        )
      );
    }
  }, []);

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

  // ── Add / Edit post saved ──
  const handlePostSaved = (postType, errorMsg, wasEdit = false) => {
    setShowAddModal(false);
    setEditTarget(null);
    if (errorMsg) {
      showToast(`Error: ${errorMsg}`, "error");
      return;
    }
    showToast(
      wasEdit
        ? "Post updated successfully!"
        : postType === "avoid"
        ? "Steer Clear warning posted and flagged for admin review."
        : "Recommendation posted successfully!"
    );
    fetchRecs();
  };

  // ── Acknowledge Steer Clear ──
  const handleAcknowledge = async (rec) => {
    const { error } = await supabase
      .from("recommendations")
      .update({ pending_review: false })
      .eq("id", rec.id);
    if (error) {
      showToast("Could not acknowledge post.", "error");
    } else {
      showToast("Steer Clear acknowledged — post stays live.");
      setRecs((prev) =>
        prev.map((r) => r.id === rec.id ? { ...r, pending_review: false } : r)
      );
    }
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
      // Clean up photo from storage (fire and forget — don't block on this)
      deleteStoragePhoto(removeTarget.photo_url, "recommendations");
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
              onEdit={(r) => setEditTarget(r)}
              onAcknowledge={handleAcknowledge}
              onReactionChange={handleReactionChange}
              onConflictToast={showConflictToast}
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

      {editTarget && (
        <AddPostModal
          categories={categories}
          subcategories={subcategories}
          residentId={residentId}
          editRec={editTarget}
          onClose={() => setEditTarget(null)}
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

      {/* Deep-link detail modal — opened via ?openPost=ID from admin reports */}
      {deepLinkRec && (
        <RecDetailModal
          rec={deepLinkRec}
          isAdmin={isAdmin}
          currentResidentId={residentId}
          onClose={() => setDeepLinkRec(null)}
          onRemove={(r) => { setDeepLinkRec(null); setRemoveTarget(r); }}
          onEdit={(r) => { setDeepLinkRec(null); setEditTarget(r); }}
          onAcknowledge={(r) => { setDeepLinkRec(null); handleAcknowledge(r); }}
          onReactionChange={handleReactionChange}
          onConflictToast={showConflictToast}
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
