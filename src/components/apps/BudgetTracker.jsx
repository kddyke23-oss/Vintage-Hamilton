import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";

// ─── CSS Variables (matching VintageHamilton design system) ──────────────────
const VH_STYLES = `
  @keyframes slideUp   { from { transform: translateY(8px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
  @keyframes fadeIn    { from { opacity: 0; } to { opacity: 1; } }
  @keyframes spin      { to { transform: rotate(360deg); } }
  @keyframes toastIn   { from { transform: translateY(-12px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
`;

// ─── Icons ────────────────────────────────────────────────────────────────────
const Ic = ({ path, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    dangerouslySetInnerHTML={{ __html: path }} />
);
const ICONS = {
  ledger:   '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M8 10h8"/><path d="M8 14h4"/>',
  summary:  '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
  target:   '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  admin:    '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  plus:     '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  edit:     '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
  trash:    '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  receipt:  '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
  x:        '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  chevD:    '<polyline points="6 9 12 15 18 9"/>',
  check:    '<polyline points="20 6 9 17 4 12"/>',
  warn:     '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtDate = d => d ? new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "\u2014";
const fmtMoney = n => {
  const val = Number(n) || 0;
  return "$" + val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const todayStr = () => new Date().toISOString().slice(0, 10);

// ─── Tab Definitions ──────────────────────────────────────────────────────────
const TABS = [
  { id: "ledger",  label: "Ledger",           icon: ICONS.ledger },
  { id: "summary", label: "Summary",          icon: ICONS.summary },
  { id: "targets", label: "Budget vs Actual", icon: ICONS.target },
  { id: "admin",   label: "Admin",            icon: ICONS.admin, adminOnly: true },
];


// ══════════════════════════════════════════════════════════════════════════════
//  TOAST
// ══════════════════════════════════════════════════════════════════════════════
function Toast({ message, type, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);

  const bg = type === "error" ? "bg-red-600" : "bg-green-600";
  return (
    <div className={`fixed top-20 right-4 z-[100] ${bg} text-white px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium flex items-center gap-2`}
      style={{ animation: "toastIn 0.2s ease" }}>
      <Ic path={type === "error" ? ICONS.warn : ICONS.check} size={16} />
      {message}
      <button onClick={onClose} className="ml-2 opacity-70 hover:opacity-100">
        <Ic path={ICONS.x} size={14} />
      </button>
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
export default function BudgetTracker({ user, isAdmin, isBudgetAdmin }) {
  const [activeTab, setActiveTab] = useState("ledger");
  const [categories, setCategories] = useState([]);
  const [entries, setEntries] = useState([]);
  const [targets, setTargets] = useState([]);
  const [profileMap, setProfileMap] = useState({}); // resident_id -> display name
  const [settings, setSettings] = useState({ fiscal_year_start_month: 1 });
  const [loading, setLoading] = useState(true);
  const [myResidentId, setMyResidentId] = useState(null);
  const [toast, setToast] = useState(null); // { message, type }

  const showToast = useCallback((message, type = "success") => {
    setToast({ message, type });
  }, []);

  // ─── Load initial data ────────────────────────────────────────────────────
  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [catRes, entryRes, settingsRes, profileRes, targetRes] = await Promise.all([
        supabase.from("budget_categories").select("*").order("sort_order"),
        supabase.from("budget_entries").select("*").order("entry_date", { ascending: false }),
        supabase.from("budget_settings").select("*").eq("id", 1).maybeSingle(),
        supabase.from("profiles").select("resident_id").eq("id", user.id).maybeSingle(),
        supabase.from("budget_targets").select("*"),
      ]);
      if (catRes.data) setCategories(catRes.data);
      if (settingsRes.data) setSettings(settingsRes.data);
      if (targetRes.data) setTargets(targetRes.data);
      if (profileRes.data) setMyResidentId(profileRes.data.resident_id);

      // Load entries and then fetch profile names for all creators
      if (entryRes.data) {
        setEntries(entryRes.data);
        // Collect unique resident_ids from entries
        const rIds = [...new Set(entryRes.data.map(e => e.created_by).filter(Boolean))];
        if (rIds.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("resident_id, names, surname")
            .in("resident_id", rIds);
          if (profiles) {
            const map = {};
            for (const p of profiles) {
              map[p.resident_id] = `${p.names} ${p.surname}`;
            }
            setProfileMap(map);
          }
        }
      }
    } catch (err) {
      console.error("Budget load error:", err);
    } finally {
      setLoading(false);
    }
  }

  // ─── Category lookup ──────────────────────────────────────────────────────
  const categoryMap = useMemo(() => {
    const map = {};
    for (const c of categories) map[c.id] = c;
    return map;
  }, [categories]);

  // ─── Visible tabs (hide Admin for non-admins) ─────────────────────────────
  const visibleTabs = useMemo(
    () => TABS.filter(t => !t.adminOnly || isBudgetAdmin),
    [isBudgetAdmin]
  );

  // ─── Loading spinner ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div style={{ width: 32, height: 32, border: "3px solid #e2e8f0", borderTopColor: "#1e4976", borderRadius: "50%", animation: "spin 0.6s linear infinite" }} />
        <span className="ml-3 text-brand-500 text-sm">Loading budget data\u2026</span>
      </div>
    );
  }

  return (
    <>
      <style>{VH_STYLES}</style>

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div style={{ animation: "fadeIn 0.3s ease" }}>
        {/* ─── Header ──────────────────────────────────────────────────────── */}
        <div className="mb-6">
          <h1 className="font-display text-3xl text-brand-800 mb-1">Budget Tracker</h1>
          <p className="text-brand-500 text-sm">Social Committee financial ledger</p>
        </div>

        {/* ─── Tabs ────────────────────────────────────────────────────────── */}
        <div className="flex gap-1 mb-6 overflow-x-auto pb-1">
          {visibleTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? "bg-brand-700 text-white shadow-sm"
                  : "bg-white text-brand-600 hover:bg-brand-100 border border-brand-200"
              }`}
            >
              <Ic path={tab.icon} size={16} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* ─── Tab Content ─────────────────────────────────────────────────── */}
        {activeTab === "ledger"  && (
          <LedgerTab
            entries={entries} categories={categories} categoryMap={categoryMap}
            profileMap={profileMap} isBudgetAdmin={isBudgetAdmin}
            myResidentId={myResidentId} onRefresh={loadData} showToast={showToast}
          />
        )}
        {activeTab === "summary" && <SummaryTab entries={entries} categories={categories} categoryMap={categoryMap} settings={settings} />}
        {activeTab === "targets" && <TargetsTab entries={entries} categories={categories} targets={targets} categoryMap={categoryMap} settings={settings} />}
        {activeTab === "admin"   && <AdminTab categories={categories} targets={targets} settings={settings} isBudgetAdmin={isBudgetAdmin} myResidentId={myResidentId} onRefresh={loadData} showToast={showToast} />}
      </div>
    </>
  );
}


// ══════════════════════════════════════════════════════════════════════════════
//  ENTRY FORM MODAL (Add / Edit)
// ══════════════════════════════════════════════════════════════════════════════
function EntryModal({ entry, categories, myResidentId, onSave, onClose }) {
  const isEdit = !!entry;
  const [form, setForm] = useState({
    entry_date:  entry?.entry_date || todayStr(),
    entry_type:  entry?.entry_type || "expense",
    category_id: entry?.category_id || "",
    description: entry?.description || "",
    amount:      entry ? String(entry.amount) : "",
    paid_to:     entry?.paid_to || "",
  });
  const [receiptFile, setReceiptFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Filter categories by selected type
  const filteredCats = useMemo(() =>
    categories.filter(c => c.is_active && (c.type === form.entry_type || c.type === "both")),
    [categories, form.entry_type]
  );

  // Reset category if it's not valid for the new type
  useEffect(() => {
    if (form.category_id && !filteredCats.find(c => c.id === Number(form.category_id))) {
      set("category_id", "");
    }
  }, [form.entry_type]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    // Validation
    if (!form.entry_date) return setError("Date is required.");
    if (!form.category_id) return setError("Please select a category.");
    if (!form.description.trim()) return setError("Description is required.");
    const amt = parseFloat(form.amount);
    if (!amt || amt <= 0) return setError("Amount must be greater than zero.");

    // Validate receipt file if provided
    if (receiptFile) {
      const allowed = ["image/jpeg", "image/png", "application/pdf"];
      if (!allowed.includes(receiptFile.type)) return setError("Receipt must be JPEG, PNG, or PDF.");
      if (receiptFile.size > 5 * 1024 * 1024) return setError("Receipt must be under 5 MB.");
    }

    setSaving(true);
    try {
      const payload = {
        entry_date:  form.entry_date,
        entry_type:  form.entry_type,
        category_id: Number(form.category_id),
        description: form.description.trim(),
        amount:      amt,
        paid_to:     form.paid_to.trim() || null,
      };

      let savedId = entry?.id;

      if (isEdit) {
        payload.updated_by = myResidentId;
        payload.updated_at = new Date().toISOString();
        const { error: err } = await supabase
          .from("budget_entries")
          .update(payload)
          .eq("id", entry.id);
        if (err) throw err;
      } else {
        payload.created_by = myResidentId;
        const { data: inserted, error: err } = await supabase
          .from("budget_entries")
          .insert(payload)
          .select("id")
          .single();
        if (err) throw err;
        savedId = inserted.id;
      }

      // Upload receipt if provided
      if (receiptFile && savedId) {
        const ext = receiptFile.name.split(".").pop();
        const storagePath = `${savedId}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("budget-receipts")
          .upload(storagePath, receiptFile, { contentType: receiptFile.type, upsert: true });
        if (upErr) throw upErr;

        const { data: urlData } = supabase.storage
          .from("budget-receipts")
          .getPublicUrl(storagePath);

        await supabase.from("budget_entries")
          .update({ receipt_url: urlData.publicUrl, receipt_filename: receiptFile.name })
          .eq("id", savedId);
      }

      onSave();
    } catch (err) {
      console.error("Save error:", err);
      setError(err.message || "Failed to save entry.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" />
      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}
        style={{ animation: "slideUp 0.2s ease" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h2 className="font-display text-lg text-brand-800">
            {isEdit ? "Edit Entry" : "Add Entry"}
          </h2>
          <button onClick={onClose} className="text-brand-400 hover:text-brand-700 transition-colors">
            <Ic path={ICONS.x} size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-4">
          {/* Type toggle */}
          <div>
            <label className="block text-xs font-semibold text-brand-600 mb-1.5">Type</label>
            <div className="flex bg-brand-50 rounded-lg overflow-hidden border border-brand-200">
              {["income", "expense"].map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => set("entry_type", t)}
                  className={`flex-1 px-4 py-2 text-sm font-medium capitalize transition-colors ${
                    form.entry_type === t
                      ? (t === "income" ? "bg-green-600 text-white" : "bg-red-600 text-white")
                      : "text-brand-600 hover:bg-brand-100"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Date */}
          <div>
            <label className="block text-xs font-semibold text-brand-600 mb-1.5">Date</label>
            <input
              type="date"
              value={form.entry_date}
              onChange={e => set("entry_date", e.target.value)}
              className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm text-brand-800 focus:ring-2 focus:ring-brand-300 focus:border-brand-400 outline-none"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs font-semibold text-brand-600 mb-1.5">Category</label>
            <select
              value={form.category_id}
              onChange={e => set("category_id", e.target.value)}
              className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm text-brand-800 focus:ring-2 focus:ring-brand-300 focus:border-brand-400 outline-none bg-white"
            >
              <option value="">Select a category\u2026</option>
              {filteredCats.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-brand-600 mb-1.5">Description</label>
            <input
              type="text"
              value={form.description}
              onChange={e => set("description", e.target.value)}
              placeholder="What was this for?"
              className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm text-brand-800 focus:ring-2 focus:ring-brand-300 focus:border-brand-400 outline-none"
            />
          </div>

          {/* Paid To (optional) */}
          {form.entry_type === "expense" && (
            <div>
              <label className="block text-xs font-semibold text-brand-600 mb-1.5">Paid To <span className="font-normal text-brand-400">(optional)</span></label>
              <input
                type="text"
                value={form.paid_to}
                onChange={e => set("paid_to", e.target.value)}
                placeholder="Vendor or payee name"
                className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm text-brand-800 focus:ring-2 focus:ring-brand-300 focus:border-brand-400 outline-none"
              />
            </div>
          )}

          {/* Amount */}
          <div>
            <label className="block text-xs font-semibold text-brand-600 mb-1.5">Amount ($)</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={form.amount}
              onChange={e => set("amount", e.target.value)}
              placeholder="0.00"
              className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm text-brand-800 focus:ring-2 focus:ring-brand-300 focus:border-brand-400 outline-none"
            />
          </div>

          {/* Receipt (optional) */}
          <div>
            <label className="block text-xs font-semibold text-brand-600 mb-1.5">
              Receipt <span className="font-normal text-brand-400">(optional, JPEG/PNG/PDF, max 5 MB)</span>
            </label>
            {entry?.receipt_url && !receiptFile && (
              <div className="flex items-center gap-2 mb-2 text-xs text-brand-500">
                <Ic path={ICONS.receipt} size={14} />
                <a href={entry.receipt_url} target="_blank" rel="noopener noreferrer" className="underline hover:text-brand-700">
                  {entry.receipt_filename || "View current receipt"}
                </a>
              </div>
            )}
            <input
              type="file"
              accept=".jpg,.jpeg,.png,.pdf"
              onChange={e => setReceiptFile(e.target.files?.[0] || null)}
              className="w-full text-sm text-brand-600 file:mr-3 file:py-1.5 file:px-3 file:border-0 file:rounded-lg file:text-xs file:font-medium file:bg-brand-100 file:text-brand-700 hover:file:bg-brand-200 file:cursor-pointer"
            />
            {receiptFile && (
              <p className="text-xs text-brand-400 mt-1">
                {receiptFile.name} ({(receiptFile.size / 1024).toFixed(0)} KB)
              </p>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-brand-600 hover:text-brand-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-brand-700 text-white rounded-lg text-sm font-medium hover:bg-brand-800 transition-colors disabled:opacity-50"
            >
              {saving ? "Saving\u2026" : (isEdit ? "Update" : "Add Entry")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════════════════
//  DELETE CONFIRM MODAL
// ══════════════════════════════════════════════════════════════════════════════
function DeleteModal({ entry, categoryMap, onConfirm, onClose }) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    await onConfirm(entry.id);
    setDeleting(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}
        style={{ animation: "slideUp 0.2s ease" }}>
        <div className="p-6 text-center">
          <div className="text-4xl mb-3">🗑️</div>
          <h2 className="font-display text-lg text-brand-800 mb-2">Delete Entry?</h2>
          <p className="text-brand-500 text-sm mb-1">
            {fmtDate(entry.entry_date)} &mdash; {entry.description}
          </p>
          <p className={`text-sm font-medium mb-4 ${entry.entry_type === "income" ? "text-green-700" : "text-red-700"}`}>
            {entry.entry_type === "income" ? "+" : "-"}{fmtMoney(entry.amount)}
            {" "}<span className="text-brand-400 font-normal">({categoryMap[entry.category_id]?.name})</span>
          </p>
          <p className="text-brand-400 text-xs mb-5">This action cannot be undone.</p>
          <div className="flex items-center justify-center gap-3">
            <button onClick={onClose}
              className="px-4 py-2 text-sm text-brand-600 hover:text-brand-800 transition-colors">
              Cancel
            </button>
            <button onClick={handleDelete} disabled={deleting}
              className="px-5 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50">
              {deleting ? "Deleting\u2026" : "Delete"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════════════════
//  TAB: LEDGER
// ══════════════════════════════════════════════════════════════════════════════
function LedgerTab({ entries, categories, categoryMap, profileMap, isBudgetAdmin, myResidentId, onRefresh, showToast }) {
  const [filterType, setFilterType] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editEntry, setEditEntry] = useState(null);
  const [deleteEntry, setDeleteEntry] = useState(null);

  // Filtered entries
  const filtered = useMemo(() => {
    let list = [...entries];
    if (filterType !== "all") list = list.filter(e => e.entry_type === filterType);
    if (filterCategory !== "all") list = list.filter(e => e.category_id === Number(filterCategory));
    return list;
  }, [entries, filterType, filterCategory]);

  // Running balance (sorted by date ascending for calculation)
  const withBalance = useMemo(() => {
    const sorted = [...filtered].sort((a, b) => a.entry_date.localeCompare(b.entry_date) || a.id - b.id);
    let balance = 0;
    return sorted.map(e => {
      balance += e.entry_type === "income" ? Number(e.amount) : -Number(e.amount);
      return { ...e, runningBalance: balance };
    });
  }, [filtered]);

  // Totals
  const totals = useMemo(() => {
    let income = 0, expense = 0;
    for (const e of filtered) {
      if (e.entry_type === "income") income += Number(e.amount);
      else expense += Number(e.amount);
    }
    return { income, expense, net: income - expense };
  }, [filtered]);

  // ─── CRUD handlers ──────────────────────────────────────────────────────
  function handleAddSaved() {
    setShowAddModal(false);
    showToast("Entry added successfully.");
    onRefresh();
  }

  function handleEditSaved() {
    setEditEntry(null);
    showToast("Entry updated.");
    onRefresh();
  }

  async function handleDeleteConfirm(entryId) {
    const { error } = await supabase.from("budget_entries").delete().eq("id", entryId);
    setDeleteEntry(null);
    if (error) {
      showToast("Failed to delete: " + error.message, "error");
    } else {
      showToast("Entry deleted.");
      onRefresh();
    }
  }

  return (
    <div style={{ animation: "slideUp 0.3s ease" }}>
      {/* Modals */}
      {showAddModal && (
        <EntryModal
          entry={null}
          categories={categories}
          myResidentId={myResidentId}
          onSave={handleAddSaved}
          onClose={() => setShowAddModal(false)}
        />
      )}
      {editEntry && (
        <EntryModal
          entry={editEntry}
          categories={categories}
          myResidentId={myResidentId}
          onSave={handleEditSaved}
          onClose={() => setEditEntry(null)}
        />
      )}
      {deleteEntry && (
        <DeleteModal
          entry={deleteEntry}
          categoryMap={categoryMap}
          onConfirm={handleDeleteConfirm}
          onClose={() => setDeleteEntry(null)}
        />
      )}

      {/* Filters + Add button */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {/* Type filter */}
        <div className="flex bg-white rounded-lg border border-brand-200 overflow-hidden">
          {["all", "income", "expense"].map(t => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                filterType === t
                  ? "bg-brand-700 text-white"
                  : "text-brand-600 hover:bg-brand-50"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Category filter */}
        <select
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value)}
          className="text-sm border border-brand-200 rounded-lg px-3 py-1.5 bg-white text-brand-700"
        >
          <option value="all">All Categories</option>
          {categories.filter(c => c.is_active).map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <div className="flex-1" />

        {/* Entry count */}
        <span className="text-brand-400 text-xs">
          {withBalance.length} {withBalance.length === 1 ? "entry" : "entries"}
        </span>

        {/* Add Entry button (admin only) */}
        {isBudgetAdmin && (
          <button
            className="flex items-center gap-2 px-4 py-2 bg-brand-700 text-white rounded-lg text-sm font-medium hover:bg-brand-800 transition-colors"
            onClick={() => setShowAddModal(true)}
          >
            <Ic path={ICONS.plus} size={14} />
            Add Entry
          </button>
        )}
      </div>

      {/* Entries table */}
      <div className="bg-white rounded-xl border border-brand-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-brand-50 border-b border-brand-200">
                <th className="text-left px-4 py-3 font-semibold text-brand-700">Date</th>
                <th className="text-left px-4 py-3 font-semibold text-brand-700">Description</th>
                <th className="text-left px-4 py-3 font-semibold text-brand-700">Paid To</th>
                <th className="text-left px-4 py-3 font-semibold text-brand-700">Category</th>
                <th className="text-right px-4 py-3 font-semibold text-brand-700">Amount</th>
                <th className="text-right px-4 py-3 font-semibold text-brand-700">Balance</th>
                <th className="text-left px-4 py-3 font-semibold text-brand-700">Entered By</th>
                {isBudgetAdmin && <th className="text-center px-4 py-3 font-semibold text-brand-700 w-20">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {withBalance.length === 0 ? (
                <tr>
                  <td colSpan={isBudgetAdmin ? 8 : 7} className="text-center py-12 text-brand-400">
                    No entries yet.{isBudgetAdmin ? " Click 'Add Entry' to get started." : ""}
                  </td>
                </tr>
              ) : (
                withBalance.map(e => (
                  <tr key={e.id} className="border-b border-brand-100 hover:bg-brand-50 transition-colors">
                    <td className="px-4 py-3 text-brand-600 whitespace-nowrap">{fmtDate(e.entry_date)}</td>
                    <td className="px-4 py-3 text-brand-800">
                      <div className="flex items-center gap-2">
                        {e.description}
                        {e.receipt_url && (
                          <a href={e.receipt_url} target="_blank" rel="noopener noreferrer"
                            className="text-brand-400 hover:text-brand-600" title="View receipt">
                            <Ic path={ICONS.receipt} size={14} />
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-brand-500 text-sm">{e.paid_to || "\u2014"}</td>
                    <td className="px-4 py-3">
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-brand-100 text-brand-700">
                        {categoryMap[e.category_id]?.name || "\u2014"}
                      </span>
                    </td>
                    <td className={`px-4 py-3 text-right font-medium whitespace-nowrap ${
                      e.entry_type === "income" ? "text-green-700" : "text-red-700"
                    }`}>
                      {e.entry_type === "income" ? "+" : "\u2212"}{fmtMoney(e.amount)}
                    </td>
                    <td className={`px-4 py-3 text-right font-semibold whitespace-nowrap ${
                      e.runningBalance >= 0 ? "text-brand-800" : "text-red-700"
                    }`}>
                      {fmtMoney(e.runningBalance)}
                    </td>
                    <td className="px-4 py-3 text-brand-500 text-xs whitespace-nowrap">
                      {profileMap[e.created_by] || "\u2014"}
                    </td>
                    {isBudgetAdmin && (
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button className="p-1.5 text-brand-400 hover:text-brand-700 rounded transition-colors"
                            title="Edit" onClick={() => setEditEntry(e)}>
                            <Ic path={ICONS.edit} size={14} />
                          </button>
                          <button className="p-1.5 text-brand-400 hover:text-red-600 rounded transition-colors"
                            title="Delete" onClick={() => setDeleteEntry(e)}>
                            <Ic path={ICONS.trash} size={14} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
            {withBalance.length > 0 && (
              <tfoot>
                <tr className="bg-brand-50 border-t-2 border-brand-300">
                  <td colSpan={4} className="px-4 py-3 font-semibold text-brand-700">Totals</td>
                  <td className="px-4 py-3 text-right">
                    <div className="text-green-700 text-xs font-medium">+{fmtMoney(totals.income)}</div>
                    <div className="text-red-700 text-xs font-medium">{"\u2212"}{fmtMoney(totals.expense)}</div>
                  </td>
                  <td className={`px-4 py-3 text-right font-bold ${totals.net >= 0 ? "text-brand-800" : "text-red-700"}`}>
                    {fmtMoney(totals.net)}
                  </td>
                  <td />
                  {isBudgetAdmin && <td />}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════════════════
//  TAB: SUMMARY
// ══════════════════════════════════════════════════════════════════════════════
function SummaryTab({ entries, categories, categoryMap, settings }) {
  // ── Fiscal year helpers ──────────────────────────────────────────────────
  const fyStart = settings?.fiscal_year_start_month || 1; // 1 = Jan

  // Derive available fiscal years from entries
  const fiscalYears = useMemo(() => {
    if (!entries.length) return [];
    const years = new Set();
    entries.forEach(e => {
      const d = new Date(e.entry_date + "T12:00:00");
      const m = d.getMonth() + 1; // 1-based
      const y = d.getFullYear();
      // If fiscal year starts in April (4), then Jan-Mar belong to prior FY
      const fy = m < fyStart ? y - 1 : y;
      years.add(fy);
    });
    return [...years].sort((a, b) => b - a);
  }, [entries, fyStart]);

  const [selectedFY, setSelectedFY] = useState(() => fiscalYears[0] || new Date().getFullYear());

  // Update selection when fiscal years change
  useEffect(() => {
    if (fiscalYears.length && !fiscalYears.includes(selectedFY)) {
      setSelectedFY(fiscalYears[0]);
    }
  }, [fiscalYears]);

  // Fiscal year date range
  const fyRange = useMemo(() => {
    const start = new Date(selectedFY, fyStart - 1, 1);
    const end = new Date(selectedFY + 1, fyStart - 1, 0); // last day of prior month next year
    return { start, end };
  }, [selectedFY, fyStart]);

  // Label for the fiscal period
  const fyLabel = useMemo(() => {
    const startMonth = new Date(2000, fyStart - 1, 1).toLocaleDateString("en-US", { month: "long" });
    const endMonth = new Date(2000, (fyStart + 10) % 12, 1).toLocaleDateString("en-US", { month: "long" });
    if (fyStart === 1) return `${selectedFY}`;
    return `${startMonth} ${selectedFY} \u2013 ${endMonth} ${selectedFY + 1}`;
  }, [selectedFY, fyStart]);

  // Filter entries to selected fiscal year
  const fyEntries = useMemo(() => {
    return entries.filter(e => {
      const d = new Date(e.entry_date + "T12:00:00");
      return d >= fyRange.start && d <= fyRange.end;
    });
  }, [entries, fyRange]);

  // ── Monthly breakdown ────────────────────────────────────────────────────
  const monthlyData = useMemo(() => {
    const months = [];
    for (let i = 0; i < 12; i++) {
      const mIdx = (fyStart - 1 + i) % 12; // 0-based month index
      const yr = fyStart - 1 + i >= 12 ? selectedFY + 1 : selectedFY;
      months.push({
        monthIdx: mIdx,
        year: yr,
        label: new Date(yr, mIdx, 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
        fullLabel: new Date(yr, mIdx, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" }),
        income: 0,
        expense: 0,
        net: 0,
      });
    }

    fyEntries.forEach(e => {
      const d = new Date(e.entry_date + "T12:00:00");
      const m = d.getMonth();
      const y = d.getFullYear();
      const slot = months.find(s => s.monthIdx === m && s.year === y);
      if (slot) {
        if (e.entry_type === "income") slot.income += Number(e.amount);
        else slot.expense += Number(e.amount);
      }
    });

    // Calculate net and running total (seeded with opening balance)
    let running = openingBalance;
    months.forEach(m => {
      m.net = m.income - m.expense;
      running += m.net;
      m.runningTotal = running;
    });

    return months;
  }, [fyEntries, fyStart, selectedFY, openingBalance]);

  // ── Category breakdown ───────────────────────────────────────────────────
  const categoryData = useMemo(() => {
    const map = {};
    fyEntries.forEach(e => {
      const key = `${e.category_id}-${e.entry_type}`;
      if (!map[key]) {
        map[key] = {
          category_id: e.category_id,
          name: categoryMap[e.category_id]?.name || "Unknown",
          type: e.entry_type,
          total: 0,
          count: 0,
        };
      }
      map[key].total += Number(e.amount);
      map[key].count++;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [fyEntries, categoryMap]);

  const incomeCategories = categoryData.filter(c => c.type === "income");
  const expenseCategories = categoryData.filter(c => c.type === "expense");

  // ── Opening balance (carry-over from prior fiscal years) ─────────────
  const openingBalance = useMemo(() => {
    return entries
      .filter(e => new Date(e.entry_date + "T12:00:00") < fyRange.start)
      .reduce((sum, e) => sum + (e.entry_type === "income" ? Number(e.amount) : -Number(e.amount)), 0);
  }, [entries, fyRange]);

  // ── Totals ──────────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    const inc = fyEntries.filter(e => e.entry_type === "income").reduce((s, e) => s + Number(e.amount), 0);
    const exp = fyEntries.filter(e => e.entry_type === "expense").reduce((s, e) => s + Number(e.amount), 0);
    return { income: inc, expense: exp, net: inc - exp };
  }, [fyEntries]);

  // ── Chart data (only months that have data or all if few entries) ──────
  const chartData = useMemo(() => monthlyData.map(m => ({
    name: m.label,
    Income: Math.round(m.income * 100) / 100,
    Expenses: Math.round(m.expense * 100) / 100,
  })), [monthlyData]);

  // ── No entries state ──────────────────────────────────────────────────
  if (!entries.length) {
    return (
      <div style={{ animation: "slideUp 0.3s ease" }}>
        <div className="bg-white rounded-xl border border-brand-200 p-8 text-center shadow-sm">
          <Ic path={ICONS.summary} size={48} />
          <h2 className="font-display text-xl text-brand-800 mt-4 mb-2">Summary</h2>
          <p className="text-brand-500 text-sm">
            Add some entries in the Ledger tab to see your budget summary here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ animation: "slideUp 0.3s ease" }} className="space-y-5">
      {/* Fiscal year selector */}
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg text-brand-800">
          Fiscal Year: {fyLabel}
        </h2>
        {fiscalYears.length > 1 && (
          <select
            value={selectedFY}
            onChange={e => setSelectedFY(Number(e.target.value))}
            className="border border-brand-200 rounded-lg px-3 py-1.5 text-sm text-brand-700 bg-white focus:ring-2 focus:ring-brand-300 outline-none"
          >
            {fiscalYears.map(fy => (
              <option key={fy} value={fy}>
                {fyStart === 1 ? fy : `${fy}/${String(fy + 1).slice(2)}`}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Overview cards */}
      <div className={`grid grid-cols-1 ${openingBalance !== 0 ? "sm:grid-cols-4" : "sm:grid-cols-3"} gap-4`}>
        {openingBalance !== 0 && (
          <div className="bg-white rounded-xl border border-brand-200 p-5 shadow-sm">
            <p className="text-brand-500 text-xs font-medium uppercase tracking-wide mb-1">Opening Balance</p>
            <p className={`text-2xl font-bold ${openingBalance >= 0 ? "text-brand-800" : "text-red-700"}`}>{fmtMoney(openingBalance)}</p>
          </div>
        )}
        <div className="bg-white rounded-xl border border-brand-200 p-5 shadow-sm">
          <p className="text-brand-500 text-xs font-medium uppercase tracking-wide mb-1">Total Income</p>
          <p className="text-2xl font-bold text-green-700">{fmtMoney(totals.income)}</p>
        </div>
        <div className="bg-white rounded-xl border border-brand-200 p-5 shadow-sm">
          <p className="text-brand-500 text-xs font-medium uppercase tracking-wide mb-1">Total Expenses</p>
          <p className="text-2xl font-bold text-red-700">{fmtMoney(totals.expense)}</p>
        </div>
        <div className="bg-white rounded-xl border border-brand-200 p-5 shadow-sm">
          <p className="text-brand-500 text-xs font-medium uppercase tracking-wide mb-1">Net Balance</p>
          <p className={`text-2xl font-bold ${(openingBalance + totals.net) >= 0 ? "text-brand-800" : "text-red-700"}`}>
            {fmtMoney(openingBalance + totals.net)}
          </p>
        </div>
      </div>

      {/* Chart: Monthly Income vs Expenses */}
      <div className="bg-white rounded-xl border border-brand-200 p-5 shadow-sm">
        <h3 className="font-display text-base text-brand-800 mb-4">Monthly Income vs Expenses</h3>
        <div className="w-full" style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2ddd5" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#6b5e50" }} />
              <YAxis tick={{ fontSize: 11, fill: "#6b5e50" }} tickFormatter={v => `$${v.toLocaleString()}`} />
              <Tooltip
                formatter={(value) => fmtMoney(value)}
                contentStyle={{ borderRadius: 8, border: "1px solid #d4cec6", fontSize: 13 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Income" fill="#2E7D32" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Expenses" fill="#C62828" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Monthly breakdown table */}
      <div className="bg-white rounded-xl border border-brand-200 shadow-sm overflow-hidden">
        <h3 className="font-display text-base text-brand-800 px-5 pt-5 pb-3">Monthly Breakdown</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-brand-50 border-b border-brand-200">
                <th className="text-left px-4 py-2.5 font-semibold text-brand-700">Month</th>
                <th className="text-right px-4 py-2.5 font-semibold text-green-700">Income</th>
                <th className="text-right px-4 py-2.5 font-semibold text-red-700">Expenses</th>
                <th className="text-right px-4 py-2.5 font-semibold text-brand-700">Net</th>
                <th className="text-right px-4 py-2.5 font-semibold text-brand-700">Running Total</th>
              </tr>
            </thead>
            <tbody>
              {openingBalance !== 0 && (
                <tr className="border-b border-brand-200 bg-brand-50/50">
                  <td className="px-4 py-2.5 font-medium text-brand-700 italic">Opening Balance</td>
                  <td className="px-4 py-2.5 text-right">{"\u2014"}</td>
                  <td className="px-4 py-2.5 text-right">{"\u2014"}</td>
                  <td className="px-4 py-2.5 text-right">{"\u2014"}</td>
                  <td className={`px-4 py-2.5 text-right font-medium ${openingBalance >= 0 ? "text-brand-800" : "text-red-700"}`}>
                    {fmtMoney(openingBalance)}
                  </td>
                </tr>
              )}
              {monthlyData.map((m, i) => {
                const hasData = m.income > 0 || m.expense > 0;
                return (
                  <tr key={i} className={`border-b border-brand-100 ${hasData ? "" : "opacity-40"}`}>
                    <td className="px-4 py-2.5 text-brand-700">{m.fullLabel}</td>
                    <td className="px-4 py-2.5 text-right text-green-700">{hasData ? fmtMoney(m.income) : "\u2014"}</td>
                    <td className="px-4 py-2.5 text-right text-red-700">{hasData ? fmtMoney(m.expense) : "\u2014"}</td>
                    <td className={`px-4 py-2.5 text-right font-medium ${m.net >= 0 ? "text-brand-800" : "text-red-700"}`}>
                      {hasData ? fmtMoney(m.net) : "\u2014"}
                    </td>
                    <td className={`px-4 py-2.5 text-right font-medium ${m.runningTotal >= 0 ? "text-brand-800" : "text-red-700"}`}>
                      {hasData || m.runningTotal !== 0 ? fmtMoney(m.runningTotal) : "\u2014"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-brand-50 border-t-2 border-brand-300">
                <td className="px-4 py-2.5 font-semibold text-brand-700">Totals</td>
                <td className="px-4 py-2.5 text-right font-bold text-green-700">{fmtMoney(totals.income)}</td>
                <td className="px-4 py-2.5 text-right font-bold text-red-700">{fmtMoney(totals.expense)}</td>
                <td className={`px-4 py-2.5 text-right font-bold ${totals.net >= 0 ? "text-brand-800" : "text-red-700"}`}>
                  {fmtMoney(totals.net)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Category breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Income categories */}
        <div className="bg-white rounded-xl border border-brand-200 p-5 shadow-sm">
          <h3 className="font-display text-base text-brand-800 mb-3">Income by Category</h3>
          {incomeCategories.length === 0 ? (
            <p className="text-brand-400 text-sm">No income entries this period.</p>
          ) : (
            <div className="space-y-3">
              {incomeCategories.map(c => (
                <div key={c.category_id}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-brand-700">{c.name}</span>
                    <span className="text-sm font-medium text-green-700">{fmtMoney(c.total)}</span>
                  </div>
                  <div className="w-full bg-green-100 rounded-full h-2">
                    <div
                      className="bg-green-600 rounded-full h-2 transition-all"
                      style={{ width: `${Math.min(100, (c.total / totals.income) * 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-brand-400 mt-0.5">{c.count} {c.count === 1 ? "entry" : "entries"}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Expense categories */}
        <div className="bg-white rounded-xl border border-brand-200 p-5 shadow-sm">
          <h3 className="font-display text-base text-brand-800 mb-3">Expenses by Category</h3>
          {expenseCategories.length === 0 ? (
            <p className="text-brand-400 text-sm">No expense entries this period.</p>
          ) : (
            <div className="space-y-3">
              {expenseCategories.map(c => (
                <div key={c.category_id}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-brand-700">{c.name}</span>
                    <span className="text-sm font-medium text-red-700">{fmtMoney(c.total)}</span>
                  </div>
                  <div className="w-full bg-red-100 rounded-full h-2">
                    <div
                      className="bg-red-600 rounded-full h-2 transition-all"
                      style={{ width: `${Math.min(100, (c.total / totals.expense) * 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-brand-400 mt-0.5">{c.count} {c.count === 1 ? "entry" : "entries"}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════════════════
//  TAB: BUDGET vs ACTUAL
// ══════════════════════════════════════════════════════════════════════════════
function TargetsTab({ entries, categories, targets, categoryMap, settings }) {
  const fyStart = settings?.fiscal_year_start_month || 1;

  // Derive fiscal years that have targets
  const targetFYs = useMemo(() => {
    const years = [...new Set(targets.map(t => t.fiscal_year))].sort((a, b) => b - a);
    return years;
  }, [targets]);

  const [selectedFY, setSelectedFY] = useState(() => targetFYs[0] || new Date().getFullYear());

  useEffect(() => {
    if (targetFYs.length && !targetFYs.includes(selectedFY)) {
      setSelectedFY(targetFYs[0]);
    }
  }, [targetFYs]);

  // Fiscal year date range
  const fyRange = useMemo(() => {
    const start = new Date(selectedFY, fyStart - 1, 1);
    const end = new Date(selectedFY + 1, fyStart - 1, 0);
    return { start, end };
  }, [selectedFY, fyStart]);

  // Label
  const fyLabel = useMemo(() => {
    if (fyStart === 1) return `${selectedFY}`;
    const sm = new Date(2000, fyStart - 1, 1).toLocaleDateString("en-US", { month: "long" });
    const em = new Date(2000, (fyStart + 10) % 12, 1).toLocaleDateString("en-US", { month: "long" });
    return `${sm} ${selectedFY} \u2013 ${em} ${selectedFY + 1}`;
  }, [selectedFY, fyStart]);

  // Targets for selected FY
  const fyTargets = useMemo(() => targets.filter(t => t.fiscal_year === selectedFY), [targets, selectedFY]);

  // Actual spending per category for the FY
  const actualByCategory = useMemo(() => {
    const map = {};
    entries.forEach(e => {
      const d = new Date(e.entry_date + "T12:00:00");
      if (d >= fyRange.start && d <= fyRange.end) {
        if (!map[e.category_id]) map[e.category_id] = { income: 0, expense: 0 };
        if (e.entry_type === "income") map[e.category_id].income += Number(e.amount);
        else map[e.category_id].expense += Number(e.amount);
      }
    });
    return map;
  }, [entries, fyRange]);

  // Build comparison rows
  const rows = useMemo(() => {
    return fyTargets.map(t => {
      const cat = categoryMap[t.category_id];
      const catType = cat?.type || "expense";
      const actual = catType === "income"
        ? (actualByCategory[t.category_id]?.income || 0)
        : (actualByCategory[t.category_id]?.expense || 0);
      const budget = Number(t.target_amount);
      const remaining = budget - actual;
      const pct = budget > 0 ? (actual / budget) * 100 : 0;
      return {
        category_id: t.category_id,
        name: cat?.name || "Unknown",
        type: catType,
        budget,
        actual,
        remaining,
        pct,
        notes: t.notes,
      };
    }).sort((a, b) => b.budget - a.budget);
  }, [fyTargets, actualByCategory, categoryMap]);

  // Summary totals
  const summary = useMemo(() => {
    const budgeted = rows.reduce((s, r) => s + r.budget, 0);
    const spent = rows.reduce((s, r) => s + r.actual, 0);
    return { budgeted, spent, remaining: budgeted - spent, pct: budgeted > 0 ? (spent / budgeted) * 100 : 0 };
  }, [rows]);

  // Color for progress bar
  const barColor = (pct) => {
    if (pct > 100) return "bg-red-500";
    if (pct >= 80) return "bg-amber-500";
    return "bg-green-500";
  };
  const barBg = (pct) => {
    if (pct > 100) return "bg-red-100";
    if (pct >= 80) return "bg-amber-100";
    return "bg-green-100";
  };

  // No targets state
  if (!targetFYs.length) {
    return (
      <div style={{ animation: "slideUp 0.3s ease" }}>
        <div className="bg-white rounded-xl border border-brand-200 p-8 text-center shadow-sm">
          <Ic path={ICONS.target} size={48} />
          <h2 className="font-display text-xl text-brand-800 mt-4 mb-2">Budget vs Actual</h2>
          <p className="text-brand-500 text-sm">
            No budget targets have been set yet. Use the Admin tab to define targets per category for each fiscal year.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ animation: "slideUp 0.3s ease" }} className="space-y-5">
      {/* FY selector */}
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg text-brand-800">
          Budget vs Actual: {fyLabel}
        </h2>
        {targetFYs.length > 1 && (
          <select
            value={selectedFY}
            onChange={e => setSelectedFY(Number(e.target.value))}
            className="border border-brand-200 rounded-lg px-3 py-1.5 text-sm text-brand-700 bg-white focus:ring-2 focus:ring-brand-300 outline-none"
          >
            {targetFYs.map(fy => (
              <option key={fy} value={fy}>
                {fyStart === 1 ? fy : `${fy}/${String(fy + 1).slice(2)}`}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-brand-200 p-5 shadow-sm">
          <p className="text-brand-500 text-xs font-medium uppercase tracking-wide mb-1">Total Budgeted</p>
          <p className="text-2xl font-bold text-brand-800">{fmtMoney(summary.budgeted)}</p>
        </div>
        <div className="bg-white rounded-xl border border-brand-200 p-5 shadow-sm">
          <p className="text-brand-500 text-xs font-medium uppercase tracking-wide mb-1">Total Spent</p>
          <p className={`text-2xl font-bold ${summary.pct > 100 ? "text-red-700" : "text-brand-800"}`}>{fmtMoney(summary.spent)}</p>
        </div>
        <div className="bg-white rounded-xl border border-brand-200 p-5 shadow-sm">
          <p className="text-brand-500 text-xs font-medium uppercase tracking-wide mb-1">Remaining</p>
          <p className={`text-2xl font-bold ${summary.remaining >= 0 ? "text-green-700" : "text-red-700"}`}>{fmtMoney(summary.remaining)}</p>
        </div>
      </div>

      {/* Overall progress */}
      <div className="bg-white rounded-xl border border-brand-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-brand-700">Overall Budget Usage</span>
          <span className={`text-sm font-bold ${summary.pct > 100 ? "text-red-700" : summary.pct >= 80 ? "text-amber-700" : "text-green-700"}`}>
            {summary.pct.toFixed(1)}%
          </span>
        </div>
        <div className={`w-full ${barBg(summary.pct)} rounded-full h-3`}>
          <div
            className={`${barColor(summary.pct)} rounded-full h-3 transition-all`}
            style={{ width: `${Math.min(100, summary.pct)}%` }}
          />
        </div>
      </div>

      {/* Category breakdown table */}
      <div className="bg-white rounded-xl border border-brand-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-brand-50 border-b border-brand-200">
                <th className="text-left px-4 py-2.5 font-semibold text-brand-700">Category</th>
                <th className="text-right px-4 py-2.5 font-semibold text-brand-700">Budget</th>
                <th className="text-right px-4 py-2.5 font-semibold text-brand-700">Actual</th>
                <th className="text-right px-4 py-2.5 font-semibold text-brand-700">Remaining</th>
                <th className="text-right px-4 py-2.5 font-semibold text-brand-700 w-16">% Used</th>
                <th className="px-4 py-2.5 font-semibold text-brand-700 w-32">Progress</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.category_id} className="border-b border-brand-100 hover:bg-brand-50 transition-colors">
                  <td className="px-4 py-3">
                    <span className="text-brand-800">{r.name}</span>
                    {r.notes && <span className="text-brand-400 text-xs ml-2" title={r.notes}>({r.notes})</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-brand-700 font-medium">{fmtMoney(r.budget)}</td>
                  <td className={`px-4 py-3 text-right font-medium ${r.pct > 100 ? "text-red-700" : "text-brand-800"}`}>{fmtMoney(r.actual)}</td>
                  <td className={`px-4 py-3 text-right font-medium ${r.remaining >= 0 ? "text-green-700" : "text-red-700"}`}>{fmtMoney(r.remaining)}</td>
                  <td className={`px-4 py-3 text-right font-medium ${r.pct > 100 ? "text-red-700" : r.pct >= 80 ? "text-amber-700" : "text-green-700"}`}>
                    {r.pct.toFixed(0)}%
                  </td>
                  <td className="px-4 py-3">
                    <div className={`w-full ${barBg(r.pct)} rounded-full h-2`}>
                      <div
                        className={`${barColor(r.pct)} rounded-full h-2 transition-all`}
                        style={{ width: `${Math.min(100, r.pct)}%` }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-brand-50 border-t-2 border-brand-300">
                <td className="px-4 py-2.5 font-semibold text-brand-700">Totals</td>
                <td className="px-4 py-2.5 text-right font-bold text-brand-800">{fmtMoney(summary.budgeted)}</td>
                <td className={`px-4 py-2.5 text-right font-bold ${summary.pct > 100 ? "text-red-700" : "text-brand-800"}`}>{fmtMoney(summary.spent)}</td>
                <td className={`px-4 py-2.5 text-right font-bold ${summary.remaining >= 0 ? "text-green-700" : "text-red-700"}`}>{fmtMoney(summary.remaining)}</td>
                <td className={`px-4 py-2.5 text-right font-bold ${summary.pct > 100 ? "text-red-700" : summary.pct >= 80 ? "text-amber-700" : "text-green-700"}`}>
                  {summary.pct.toFixed(0)}%
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════════════════
//  CSV IMPORT SECTION (used inside Admin tab)
// ══════════════════════════════════════════════════════════════════════════════
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };
  // Handle quoted fields
  function splitRow(line) {
    const fields = [];
    let current = "", inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === "," && !inQuotes) { fields.push(current.trim()); current = ""; continue; }
      current += ch;
    }
    fields.push(current.trim());
    return fields;
  }
  const headers = splitRow(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9_]/g, "_"));
  const rows = lines.slice(1).map(l => {
    const vals = splitRow(l);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] || ""; });
    return obj;
  });
  return { headers, rows };
}

const IMPORT_FIELD_MAP = [
  { target: "entry_date",   label: "Date",        required: true },
  { target: "entry_type",   label: "Type",        required: true, hint: "income or expense" },
  { target: "category",     label: "Category",    required: true, hint: "must match existing category name" },
  { target: "description",  label: "Description", required: true },
  { target: "amount",       label: "Amount",      required: true },
  { target: "paid_to",      label: "Paid To",     required: false },
];

function ImportSection({ categories, myResidentId, onRefresh, showToast }) {
  const [file, setFile] = useState(null);
  const [parsed, setParsed] = useState(null); // { headers, rows }
  const [mapping, setMapping] = useState({}); // target -> csv header
  const [preview, setPreview] = useState(null); // processed rows ready to insert
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null); // { success, failed, errors }

  // Category name -> id lookup
  const catNameMap = useMemo(() => {
    const map = {};
    categories.forEach(c => { map[c.name.toLowerCase()] = c.id; });
    return map;
  }, [categories]);

  function handleFileChange(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setParsed(null);
    setPreview(null);
    setResult(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const { headers, rows } = parseCSV(ev.target.result);
      setParsed({ headers, rows });

      // Auto-map columns by name similarity
      const autoMap = {};
      IMPORT_FIELD_MAP.forEach(field => {
        const match = headers.find(h =>
          h.includes(field.target.replace("_", "")) ||
          h.includes(field.label.toLowerCase().replace(/\s/g, "_")) ||
          h.includes(field.label.toLowerCase().replace(/\s/g, ""))
        );
        if (match) autoMap[field.target] = match;
      });
      setMapping(autoMap);
    };
    reader.readAsText(f);
  }

  function buildPreview() {
    if (!parsed) return;
    const rows = [];
    const errors = [];

    parsed.rows.forEach((row, i) => {
      const lineNum = i + 2; // 1-indexed, +1 for header
      const entry = {};

      // Map fields
      const dateVal = row[mapping.entry_date] || "";
      const typeVal = (row[mapping.entry_type] || "").toLowerCase().trim();
      const catVal = (row[mapping.category] || "").trim();
      const descVal = (row[mapping.description] || "").trim();
      const amtVal = row[mapping.amount] || "";
      const paidVal = mapping.paid_to ? (row[mapping.paid_to] || "").trim() : "";

      // Parse date (try multiple formats: YYYY-MM-DD, M/D/YYYY, DD/MM/YYYY etc.)
      let parsedDate = null;
      if (dateVal) {
        const slashParts = dateVal.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
        const isoParts = dateVal.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
        if (slashParts) {
          // M/D/YYYY or MM/DD/YYYY
          const [, m, d, y] = slashParts;
          const dt = new Date(+y, +m - 1, +d, 12);
          if (!isNaN(dt.getTime()) && dt.getMonth() === +m - 1) parsedDate = dt.toISOString().slice(0, 10);
        } else if (isoParts) {
          // YYYY-MM-DD
          const [, y, m, d] = isoParts;
          const dt = new Date(+y, +m - 1, +d, 12);
          if (!isNaN(dt.getTime()) && dt.getMonth() === +m - 1) parsedDate = dt.toISOString().slice(0, 10);
        }
      }
      if (!parsedDate) { errors.push(`Row ${lineNum}: Invalid date "${dateVal}"`); return; }

      // Validate type
      if (typeVal !== "income" && typeVal !== "expense") {
        errors.push(`Row ${lineNum}: Type must be "income" or "expense", got "${typeVal}"`);
        return;
      }

      // Match category
      const catId = catNameMap[catVal.toLowerCase()];
      if (!catId) { errors.push(`Row ${lineNum}: Unknown category "${catVal}"`); return; }

      if (!descVal) { errors.push(`Row ${lineNum}: Description is empty`); return; }

      const amt = parseFloat(amtVal.replace(/[,$]/g, ""));
      if (!amt || amt <= 0) { errors.push(`Row ${lineNum}: Invalid amount "${amtVal}"`); return; }

      rows.push({
        entry_date: parsedDate,
        entry_type: typeVal,
        category_id: catId,
        description: descVal,
        amount: amt,
        paid_to: paidVal || null,
        created_by: myResidentId,
        _display: { date: parsedDate, type: typeVal, category: catVal, desc: descVal, amount: amt },
      });
    });

    setPreview({ rows, errors });
  }

  async function doImport() {
    if (!preview?.rows.length) return;
    setImporting(true);
    let success = 0, failed = 0;
    const importErrors = [];

    // Insert in batches of 50
    const batches = [];
    for (let i = 0; i < preview.rows.length; i += 50) {
      batches.push(preview.rows.slice(i, i + 50));
    }

    for (const batch of batches) {
      const payloads = batch.map(r => ({
        entry_date: r.entry_date,
        entry_type: r.entry_type,
        category_id: r.category_id,
        description: r.description,
        amount: r.amount,
        paid_to: r.paid_to,
        created_by: r.created_by,
      }));
      const { error } = await supabase.from("budget_entries").insert(payloads);
      if (error) {
        failed += batch.length;
        importErrors.push(error.message);
      } else {
        success += batch.length;
      }
    }

    setResult({ success, failed, errors: importErrors });
    if (success > 0) {
      showToast(`Imported ${success} entries${failed > 0 ? ` (${failed} failed)` : ""}`);
      onRefresh();
    } else {
      showToast("Import failed", "error");
    }
    setImporting(false);
  }

  function resetImport() {
    setFile(null);
    setParsed(null);
    setPreview(null);
    setResult(null);
    setMapping({});
  }

  return (
    <div className="bg-white rounded-xl border border-brand-200 p-6 shadow-sm">
      <h2 className="font-display text-lg text-brand-800 mb-2">Import Data</h2>
      <p className="text-brand-500 text-xs mb-4">
        Upload a CSV file to bulk-import budget entries. Excel files should be saved as CSV first.
      </p>

      {/* Step 1: File upload */}
      {!parsed && (
        <div>
          <input type="file" accept=".csv" onChange={handleFileChange}
            className="text-sm text-brand-600 file:mr-3 file:py-2 file:px-4 file:border-0 file:rounded-lg file:text-sm file:font-medium file:bg-brand-100 file:text-brand-700 hover:file:bg-brand-200 file:cursor-pointer" />
          <p className="text-brand-400 text-xs mt-3">
            Expected columns: Date, Type (income/expense), Category, Description, Amount, Paid To (optional)
          </p>
        </div>
      )}

      {/* Step 2: Column mapping */}
      {parsed && !preview && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-brand-700 font-medium">
              Found {parsed.rows.length} rows with {parsed.headers.length} columns
            </p>
            <button onClick={resetImport} className="text-xs text-brand-500 hover:text-brand-700">Start over</button>
          </div>

          <div className="space-y-2">
            {IMPORT_FIELD_MAP.map(field => (
              <div key={field.target} className="flex items-center gap-3">
                <span className="text-sm text-brand-700 w-28 flex-shrink-0">
                  {field.label}{field.required && <span className="text-red-500">*</span>}
                </span>
                <select
                  value={mapping[field.target] || ""}
                  onChange={e => setMapping(m => ({ ...m, [field.target]: e.target.value }))}
                  className="flex-1 border border-brand-200 rounded-lg px-2 py-1.5 text-sm text-brand-800 bg-white outline-none focus:ring-2 focus:ring-brand-300"
                >
                  <option value="">{field.required ? "Select column\u2026" : "(skip)"}</option>
                  {parsed.headers.map(h => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
                {field.hint && <span className="text-xs text-brand-400 hidden sm:inline">{field.hint}</span>}
              </div>
            ))}
          </div>

          <div className="flex justify-end">
            <button onClick={buildPreview}
              disabled={!IMPORT_FIELD_MAP.filter(f => f.required).every(f => mapping[f.target])}
              className="px-4 py-2 bg-brand-700 text-white rounded-lg text-sm font-medium hover:bg-brand-800 transition-colors disabled:opacity-50">
              Preview Import
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Preview */}
      {preview && !result && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-brand-700 font-medium">
              {preview.rows.length} valid rows ready to import
              {preview.errors.length > 0 && (
                <span className="text-red-600 ml-2">({preview.errors.length} errors)</span>
              )}
            </p>
            <button onClick={resetImport} className="text-xs text-brand-500 hover:text-brand-700">Start over</button>
          </div>

          {/* Error list */}
          {preview.errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 max-h-32 overflow-y-auto">
              {preview.errors.slice(0, 20).map((err, i) => (
                <p key={i} className="text-xs text-red-600">{err}</p>
              ))}
              {preview.errors.length > 20 && (
                <p className="text-xs text-red-500 mt-1">...and {preview.errors.length - 20} more</p>
              )}
            </div>
          )}

          {/* Preview table */}
          {preview.rows.length > 0 && (
            <div className="overflow-x-auto max-h-60 overflow-y-auto border border-brand-200 rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-brand-50 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 text-brand-600">Date</th>
                    <th className="text-left px-3 py-2 text-brand-600">Type</th>
                    <th className="text-left px-3 py-2 text-brand-600">Category</th>
                    <th className="text-left px-3 py-2 text-brand-600">Description</th>
                    <th className="text-right px-3 py-2 text-brand-600">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 50).map((r, i) => (
                    <tr key={i} className="border-t border-brand-100">
                      <td className="px-3 py-1.5 text-brand-700">{r._display.date}</td>
                      <td className={`px-3 py-1.5 capitalize ${r._display.type === "income" ? "text-green-700" : "text-red-700"}`}>
                        {r._display.type}
                      </td>
                      <td className="px-3 py-1.5 text-brand-700">{r._display.category}</td>
                      <td className="px-3 py-1.5 text-brand-700 max-w-[200px] truncate">{r._display.desc}</td>
                      <td className="px-3 py-1.5 text-right text-brand-800">{fmtMoney(r._display.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.rows.length > 50 && (
                <p className="text-xs text-brand-400 px-3 py-2">Showing first 50 of {preview.rows.length} rows</p>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-3">
            <button onClick={() => setPreview(null)} className="text-sm text-brand-600 hover:text-brand-800">
              Back to Mapping
            </button>
            <button onClick={doImport} disabled={importing || !preview.rows.length}
              className="px-5 py-2 bg-brand-700 text-white rounded-lg text-sm font-medium hover:bg-brand-800 transition-colors disabled:opacity-50">
              {importing ? "Importing\u2026" : `Import ${preview.rows.length} Entries`}
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Result */}
      {result && (
        <div className="space-y-3">
          <div className={`p-4 rounded-lg ${result.failed ? "bg-amber-50 border border-amber-200" : "bg-green-50 border border-green-200"}`}>
            <p className={`text-sm font-medium ${result.failed ? "text-amber-800" : "text-green-800"}`}>
              <Ic path={result.failed ? ICONS.warn : ICONS.check} size={16} />{" "}
              {result.success} entries imported successfully
              {result.failed > 0 && `, ${result.failed} failed`}
            </p>
            {result.errors.length > 0 && (
              <div className="mt-2">
                {result.errors.map((err, i) => (
                  <p key={i} className="text-xs text-amber-700">{err}</p>
                ))}
              </div>
            )}
          </div>
          <button onClick={resetImport}
            className="text-sm text-brand-600 hover:text-brand-800 underline">
            Import more data
          </button>
        </div>
      )}
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════════════════
//  TAB: ADMIN
// ══════════════════════════════════════════════════════════════════════════════
function AdminTab({ categories, targets, settings, isBudgetAdmin, myResidentId, onRefresh, showToast }) {
  if (!isBudgetAdmin) return null;

  // ── Category management state ────────────────────────────────────────────
  const [editCat, setEditCat] = useState(null); // category being edited, or { isNew: true }
  const [catForm, setCatForm] = useState({ name: "", type: "expense", sort_order: "", is_active: true });
  const [catSaving, setCatSaving] = useState(false);

  function startEditCat(c) {
    setEditCat(c);
    setCatForm({ name: c.name, type: c.type, sort_order: String(c.sort_order || ""), is_active: c.is_active });
  }
  function startAddCat() {
    const nextSort = categories.length ? Math.max(...categories.map(c => c.sort_order || 0)) + 1 : 1;
    setEditCat({ isNew: true });
    setCatForm({ name: "", type: "expense", sort_order: String(nextSort), is_active: true });
  }
  function cancelCatEdit() { setEditCat(null); }

  async function saveCat() {
    if (!catForm.name.trim()) return;
    setCatSaving(true);
    try {
      const payload = {
        name: catForm.name.trim(),
        type: catForm.type,
        sort_order: parseInt(catForm.sort_order) || 0,
        is_active: catForm.is_active,
      };
      if (editCat.isNew) {
        const { error } = await supabase.from("budget_categories").insert(payload);
        if (error) throw error;
        showToast("Category added");
      } else {
        const { error } = await supabase.from("budget_categories").update(payload).eq("id", editCat.id);
        if (error) throw error;
        showToast("Category updated");
      }
      setEditCat(null);
      onRefresh();
    } catch (err) {
      showToast(err.message || "Failed to save category", "error");
    } finally {
      setCatSaving(false);
    }
  }

  // ── Budget targets state ──────────────────────────────────────────────────
  const fyStart = settings?.fiscal_year_start_month || 1;
  const currentFY = useMemo(() => {
    const now = new Date();
    const m = now.getMonth() + 1;
    return m < fyStart ? now.getFullYear() - 1 : now.getFullYear();
  }, [fyStart]);

  const [targetFY, setTargetFY] = useState(currentFY);
  const [targetEdits, setTargetEdits] = useState({}); // category_id -> amount string
  const [targetNotes, setTargetNotes] = useState({}); // category_id -> notes string
  const [targetSaving, setTargetSaving] = useState(false);

  // Load existing targets for selected FY into form
  const fyTargets = useMemo(() => targets.filter(t => t.fiscal_year === targetFY), [targets, targetFY]);

  useEffect(() => {
    const edits = {};
    const notes = {};
    fyTargets.forEach(t => {
      edits[t.category_id] = String(t.target_amount);
      notes[t.category_id] = t.notes || "";
    });
    setTargetEdits(edits);
    setTargetNotes(notes);
  }, [fyTargets]);

  // Only expense categories for targets
  const expenseCategories = useMemo(
    () => categories.filter(c => c.is_active && (c.type === "expense" || c.type === "both")),
    [categories]
  );

  async function saveTargets() {
    setTargetSaving(true);
    try {
      for (const cat of expenseCategories) {
        const amt = parseFloat(targetEdits[cat.id]);
        const existing = fyTargets.find(t => t.category_id === cat.id);

        if (amt > 0) {
          const payload = {
            category_id: cat.id,
            fiscal_year: targetFY,
            target_amount: amt,
            notes: (targetNotes[cat.id] || "").trim() || null,
            created_by: myResidentId,
          };
          if (existing) {
            const { error } = await supabase.from("budget_targets").update(payload).eq("id", existing.id);
            if (error) throw error;
          } else {
            const { error } = await supabase.from("budget_targets").insert(payload);
            if (error) throw error;
          }
        } else if (existing) {
          // Remove target if amount cleared
          const { error } = await supabase.from("budget_targets").delete().eq("id", existing.id);
          if (error) throw error;
        }
      }
      showToast("Budget targets saved");
      onRefresh();
    } catch (err) {
      showToast(err.message || "Failed to save targets", "error");
    } finally {
      setTargetSaving(false);
    }
  }

  // ── Settings state ─────────────────────────────────────────────────────────
  const [fyMonth, setFyMonth] = useState(settings?.fiscal_year_start_month || 1);
  const [settingsSaving, setSettingsSaving] = useState(false);

  async function saveSettings() {
    setSettingsSaving(true);
    try {
      const { error } = await supabase.from("budget_settings").update({ fiscal_year_start_month: fyMonth }).eq("id", 1);
      if (error) throw error;
      showToast("Settings saved");
      onRefresh();
    } catch (err) {
      showToast(err.message || "Failed to save settings", "error");
    } finally {
      setSettingsSaving(false);
    }
  }

  // FY label for targets section
  const targetFYLabel = useMemo(() => {
    if (fyStart === 1) return `${targetFY}`;
    const sm = new Date(2000, fyStart - 1, 1).toLocaleDateString("en-US", { month: "short" });
    const em = new Date(2000, (fyStart + 10) % 12, 1).toLocaleDateString("en-US", { month: "short" });
    return `${sm} ${targetFY} \u2013 ${em} ${targetFY + 1}`;
  }, [targetFY, fyStart]);

  const MONTHS = Array.from({ length: 12 }, (_, i) =>
    new Date(2000, i, 1).toLocaleDateString("en-US", { month: "long" })
  );

  return (
    <div style={{ animation: "slideUp 0.3s ease" }}>
      <div className="space-y-6">

        {/* ── Categories Management ───────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-brand-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg text-brand-800">Categories</h2>
            <button onClick={startAddCat}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-700 text-white rounded-lg text-xs font-medium hover:bg-brand-800 transition-colors">
              <Ic path={ICONS.plus} size={14} /> Add Category
            </button>
          </div>

          {/* Category edit form */}
          {editCat && (
            <div className="mb-4 p-4 bg-brand-50 rounded-lg border border-brand-200 space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-brand-600 mb-1">Name</label>
                  <input type="text" value={catForm.name} onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full border border-brand-200 rounded-lg px-3 py-1.5 text-sm text-brand-800 outline-none focus:ring-2 focus:ring-brand-300" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-brand-600 mb-1">Type</label>
                  <select value={catForm.type} onChange={e => setCatForm(f => ({ ...f, type: e.target.value }))}
                    className="w-full border border-brand-200 rounded-lg px-3 py-1.5 text-sm text-brand-800 outline-none focus:ring-2 focus:ring-brand-300 bg-white">
                    <option value="income">Income</option>
                    <option value="expense">Expense</option>
                    <option value="both">Both</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-brand-600 mb-1">Sort Order</label>
                  <input type="number" value={catForm.sort_order} onChange={e => setCatForm(f => ({ ...f, sort_order: e.target.value }))}
                    className="w-full border border-brand-200 rounded-lg px-3 py-1.5 text-sm text-brand-800 outline-none focus:ring-2 focus:ring-brand-300" />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-brand-700 cursor-pointer">
                  <input type="checkbox" checked={catForm.is_active}
                    onChange={e => setCatForm(f => ({ ...f, is_active: e.target.checked }))}
                    className="rounded border-brand-300" />
                  Active
                </label>
                <div className="flex items-center gap-2">
                  <button onClick={cancelCatEdit} className="px-3 py-1.5 text-xs text-brand-600 hover:text-brand-800 transition-colors">Cancel</button>
                  <button onClick={saveCat} disabled={catSaving}
                    className="px-4 py-1.5 bg-brand-700 text-white rounded-lg text-xs font-medium hover:bg-brand-800 transition-colors disabled:opacity-50">
                    {catSaving ? "Saving\u2026" : (editCat.isNew ? "Add" : "Save")}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Category list */}
          <div className="space-y-1">
            {categories.map(c => (
              <div key={c.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-brand-50 hover:bg-brand-100 transition-colors">
                <div className="flex items-center gap-3">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                    c.type === "income" ? "bg-green-100 text-green-700" :
                    c.type === "expense" ? "bg-red-100 text-red-700" :
                    "bg-blue-100 text-blue-700"
                  }`}>
                    {c.type}
                  </span>
                  <span className={`text-sm ${c.is_active ? "text-brand-800" : "text-brand-400 line-through"}`}>
                    {c.name}
                  </span>
                  {!c.is_active && <span className="text-xs text-brand-400">(inactive)</span>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-brand-400 text-xs">#{c.sort_order || "\u2014"}</span>
                  <button onClick={() => startEditCat(c)}
                    className="p-1 text-brand-400 hover:text-brand-700 rounded transition-colors" title="Edit">
                    <Ic path={ICONS.edit} size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Budget Targets ──────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-brand-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg text-brand-800">Budget Targets</h2>
            <div className="flex items-center gap-2">
              <button onClick={() => setTargetFY(y => y - 1)}
                className="px-2 py-1 text-brand-500 hover:text-brand-700 transition-colors text-sm">&larr;</button>
              <span className="text-sm font-medium text-brand-700 min-w-[120px] text-center">{targetFYLabel}</span>
              <button onClick={() => setTargetFY(y => y + 1)}
                className="px-2 py-1 text-brand-500 hover:text-brand-700 transition-colors text-sm">&rarr;</button>
            </div>
          </div>
          <p className="text-brand-500 text-xs mb-4">
            Set a budget amount for each expense category. Leave blank for no target.
          </p>

          <div className="space-y-2">
            {expenseCategories.map(cat => (
              <div key={cat.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-brand-50">
                <span className="text-sm text-brand-800 flex-1 min-w-[120px]">{cat.name}</span>
                <div className="flex items-center gap-1">
                  <span className="text-brand-400 text-sm">$</span>
                  <input
                    type="number" step="0.01" min="0"
                    value={targetEdits[cat.id] || ""}
                    onChange={e => setTargetEdits(prev => ({ ...prev, [cat.id]: e.target.value }))}
                    placeholder="0.00"
                    className="w-28 border border-brand-200 rounded-lg px-2 py-1.5 text-sm text-brand-800 outline-none focus:ring-2 focus:ring-brand-300 text-right"
                  />
                </div>
                <input
                  type="text"
                  value={targetNotes[cat.id] || ""}
                  onChange={e => setTargetNotes(prev => ({ ...prev, [cat.id]: e.target.value }))}
                  placeholder="Notes (optional)"
                  className="w-40 border border-brand-200 rounded-lg px-2 py-1.5 text-xs text-brand-600 outline-none focus:ring-2 focus:ring-brand-300"
                />
              </div>
            ))}
          </div>

          {/* Allocation total */}
          <div className="mt-4 flex items-center justify-between px-3 py-2.5 rounded-lg bg-brand-100 border border-brand-200">
            <span className="text-sm font-semibold text-brand-700">Total Allocated</span>
            <span className="text-lg font-bold text-brand-800">
              {fmtMoney(expenseCategories.reduce((sum, cat) => sum + (parseFloat(targetEdits[cat.id]) || 0), 0))}
            </span>
          </div>

          <div className="flex justify-end mt-4">
            <button onClick={saveTargets} disabled={targetSaving}
              className="px-5 py-2 bg-brand-700 text-white rounded-lg text-sm font-medium hover:bg-brand-800 transition-colors disabled:opacity-50">
              {targetSaving ? "Saving\u2026" : "Save Targets"}
            </button>
          </div>
        </div>

        {/* ── Settings ────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-brand-200 p-6 shadow-sm">
          <h2 className="font-display text-lg text-brand-800 mb-4">Settings</h2>
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-brand-700">Fiscal year starts in:</label>
            <select value={fyMonth} onChange={e => setFyMonth(Number(e.target.value))}
              className="border border-brand-200 rounded-lg px-3 py-1.5 text-sm text-brand-800 bg-white outline-none focus:ring-2 focus:ring-brand-300">
              {MONTHS.map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </select>
            <button onClick={saveSettings} disabled={settingsSaving || fyMonth === settings?.fiscal_year_start_month}
              className="px-4 py-1.5 bg-brand-700 text-white rounded-lg text-xs font-medium hover:bg-brand-800 transition-colors disabled:opacity-50">
              {settingsSaving ? "Saving\u2026" : "Save"}
            </button>
          </div>
          {fyMonth !== (settings?.fiscal_year_start_month || 1) && (
            <p className="text-amber-600 text-xs mt-2">
              Changing the fiscal year start will affect how data is grouped across all tabs.
            </p>
          )}
        </div>

        {/* ── CSV Import ────────────────────────────────────────────────── */}
        <ImportSection categories={categories} myResidentId={myResidentId} onRefresh={onRefresh} showToast={showToast} />
      </div>
    </div>
  );
}
