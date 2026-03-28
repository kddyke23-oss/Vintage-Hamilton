import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabase";

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
      const [catRes, entryRes, settingsRes, profileRes] = await Promise.all([
        supabase.from("budget_categories").select("*").order("sort_order"),
        supabase.from("budget_entries").select("*").order("entry_date", { ascending: false }),
        supabase.from("budget_settings").select("*").eq("id", 1).maybeSingle(),
        supabase.from("profiles").select("resident_id").eq("id", user.id).maybeSingle(),
      ]);
      if (catRes.data) setCategories(catRes.data);
      if (settingsRes.data) setSettings(settingsRes.data);
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
        {activeTab === "summary" && <SummaryTab entries={entries} categoryMap={categoryMap} settings={settings} />}
        {activeTab === "targets" && <TargetsTab categories={categories} settings={settings} isBudgetAdmin={isBudgetAdmin} />}
        {activeTab === "admin"   && <AdminTab categories={categories} settings={settings} isBudgetAdmin={isBudgetAdmin} myResidentId={myResidentId} onRefresh={loadData} />}
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
        const { error: err } = await supabase
          .from("budget_entries")
          .insert(payload);
        if (err) throw err;
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
function SummaryTab({ entries, categoryMap, settings }) {
  return (
    <div style={{ animation: "slideUp 0.3s ease" }}>
      <div className="bg-white rounded-xl border border-brand-200 p-8 text-center shadow-sm">
        <Ic path={ICONS.summary} size={48} />
        <h2 className="font-display text-xl text-brand-800 mt-4 mb-2">Summary</h2>
        <p className="text-brand-500 text-sm">
          Monthly and category breakdowns with charts will appear here once entries are added.
        </p>
        <p className="text-brand-400 text-xs mt-2">Coming in Session 3</p>
      </div>
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════════════════
//  TAB: BUDGET vs ACTUAL
// ══════════════════════════════════════════════════════════════════════════════
function TargetsTab({ categories, settings, isBudgetAdmin }) {
  return (
    <div style={{ animation: "slideUp 0.3s ease" }}>
      <div className="bg-white rounded-xl border border-brand-200 p-8 text-center shadow-sm">
        <Ic path={ICONS.target} size={48} />
        <h2 className="font-display text-xl text-brand-800 mt-4 mb-2">Budget vs Actual</h2>
        <p className="text-brand-500 text-sm">
          Set budget targets in the Admin tab to see planned vs. actual spending with progress bars.
        </p>
        <p className="text-brand-400 text-xs mt-2">Coming in Session 4</p>
      </div>
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════════════════
//  TAB: ADMIN
// ══════════════════════════════════════════════════════════════════════════════
function AdminTab({ categories, settings, isBudgetAdmin, myResidentId, onRefresh }) {
  if (!isBudgetAdmin) return null;

  return (
    <div style={{ animation: "slideUp 0.3s ease" }}>
      <div className="space-y-6">
        {/* Categories Management */}
        <div className="bg-white rounded-xl border border-brand-200 p-6 shadow-sm">
          <h2 className="font-display text-lg text-brand-800 mb-4">Categories</h2>
          <div className="space-y-2">
            {categories.map(c => (
              <div key={c.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-brand-50">
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
                </div>
                <span className="text-brand-400 text-xs">#{c.sort_order || "\u2014"}</span>
              </div>
            ))}
          </div>
          <p className="text-brand-400 text-xs mt-4">Full category management coming in Session 4</p>
        </div>

        {/* Settings */}
        <div className="bg-white rounded-xl border border-brand-200 p-6 shadow-sm">
          <h2 className="font-display text-lg text-brand-800 mb-4">Settings</h2>
          <div className="text-sm text-brand-600">
            <span className="font-medium">Fiscal year starts:</span>{" "}
            {new Date(2000, settings.fiscal_year_start_month - 1, 1).toLocaleDateString("en-US", { month: "long" })}
          </div>
          <p className="text-brand-400 text-xs mt-4">Settings editor coming in Session 4</p>
        </div>

        {/* Import placeholder */}
        <div className="bg-white rounded-xl border border-brand-200 p-6 shadow-sm">
          <h2 className="font-display text-lg text-brand-800 mb-4">Import Data</h2>
          <p className="text-brand-500 text-sm">
            Upload an Excel or CSV file to bulk-import historical budget data.
          </p>
          <p className="text-brand-400 text-xs mt-2">Coming in Session 5</p>
        </div>
      </div>
    </div>
  );
}
