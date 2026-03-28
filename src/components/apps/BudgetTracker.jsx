import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabase";

// ─── CSS Variables (matching VintageHamilton design system) ──────────────────
const VH_STYLES = `
  @keyframes slideUp   { from { transform: translateY(8px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
  @keyframes fadeIn    { from { opacity: 0; } to { opacity: 1; } }
  @keyframes spin      { to { transform: rotate(360deg); } }
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
  income:   '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>',
  expense:  '<polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/>',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtDate = d => d ? new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
const fmtMoney = n => {
  const val = Number(n) || 0;
  return "$" + val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// ─── Tab Definitions ──────────────────────────────────────────────────────────
const TABS = [
  { id: "ledger",  label: "Ledger",           icon: ICONS.ledger },
  { id: "summary", label: "Summary",          icon: ICONS.summary },
  { id: "targets", label: "Budget vs Actual", icon: ICONS.target },
  { id: "admin",   label: "Admin",            icon: ICONS.admin, adminOnly: true },
];

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
export default function BudgetTracker({ user, isAdmin, isBudgetAdmin }) {
  const [activeTab, setActiveTab] = useState("ledger");
  const [categories, setCategories] = useState([]);
  const [entries, setEntries] = useState([]);
  const [settings, setSettings] = useState({ fiscal_year_start_month: 1 });
  const [loading, setLoading] = useState(true);
  const [myResidentId, setMyResidentId] = useState(null);

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
      if (entryRes.data) setEntries(entryRes.data);
      if (settingsRes.data) setSettings(settingsRes.data);
      if (profileRes.data) setMyResidentId(profileRes.data.resident_id);
    } catch (err) {
      console.error("Budget load error:", err);
    } finally {
      setLoading(false);
    }
  }

  // ─── Active categories only ───────────────────────────────────────────────
  const activeCategories = useMemo(
    () => categories.filter(c => c.is_active),
    [categories]
  );

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
        <span className="ml-3 text-brand-500 text-sm">Loading budget data…</span>
      </div>
    );
  }

  return (
    <>
      <style>{VH_STYLES}</style>
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
        {activeTab === "ledger"  && <LedgerTab entries={entries} categories={categories} categoryMap={categoryMap} isBudgetAdmin={isBudgetAdmin} myResidentId={myResidentId} onRefresh={loadData} />}
        {activeTab === "summary" && <SummaryTab entries={entries} categoryMap={categoryMap} settings={settings} />}
        {activeTab === "targets" && <TargetsTab categories={categories} settings={settings} isBudgetAdmin={isBudgetAdmin} />}
        {activeTab === "admin"   && <AdminTab categories={categories} settings={settings} isBudgetAdmin={isBudgetAdmin} myResidentId={myResidentId} onRefresh={loadData} />}
      </div>
    </>
  );
}


// ══════════════════════════════════════════════════════════════════════════════
//  TAB: LEDGER
// ══════════════════════════════════════════════════════════════════════════════
function LedgerTab({ entries, categories, categoryMap, isBudgetAdmin, myResidentId, onRefresh }) {
  const [filterType, setFilterType] = useState("all"); // 'all' | 'income' | 'expense'
  const [filterCategory, setFilterCategory] = useState("all");

  // Filtered entries
  const filtered = useMemo(() => {
    let list = [...entries];
    if (filterType !== "all") list = list.filter(e => e.entry_type === filterType);
    if (filterCategory !== "all") list = list.filter(e => e.category_id === Number(filterCategory));
    return list;
  }, [entries, filterType, filterCategory]);

  // Running balance (sorted by date ascending for calculation)
  const withBalance = useMemo(() => {
    const sorted = [...filtered].sort((a, b) => a.entry_date.localeCompare(b.entry_date));
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

  return (
    <div style={{ animation: "slideUp 0.3s ease" }}>
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

        {/* Spacer */}
        <div className="flex-1" />

        {/* Add Entry button (admin only) */}
        {isBudgetAdmin && (
          <button
            className="flex items-center gap-2 px-4 py-2 bg-brand-700 text-white rounded-lg text-sm font-medium hover:bg-brand-800 transition-colors"
            onClick={() => { /* TODO: open Add Entry modal */ }}
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
                <th className="text-left px-4 py-3 font-semibold text-brand-700">Category</th>
                <th className="text-right px-4 py-3 font-semibold text-brand-700">Amount</th>
                <th className="text-right px-4 py-3 font-semibold text-brand-700">Balance</th>
                {isBudgetAdmin && <th className="text-center px-4 py-3 font-semibold text-brand-700 w-20">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {withBalance.length === 0 ? (
                <tr>
                  <td colSpan={isBudgetAdmin ? 6 : 5} className="text-center py-12 text-brand-400">
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
                    <td className="px-4 py-3">
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-brand-100 text-brand-700">
                        {categoryMap[e.category_id]?.name || "—"}
                      </span>
                    </td>
                    <td className={`px-4 py-3 text-right font-medium whitespace-nowrap ${
                      e.entry_type === "income" ? "text-green-700" : "text-red-700"
                    }`}>
                      {e.entry_type === "income" ? "+" : "-"}{fmtMoney(e.amount)}
                    </td>
                    <td className={`px-4 py-3 text-right font-semibold whitespace-nowrap ${
                      e.runningBalance >= 0 ? "text-brand-800" : "text-red-700"
                    }`}>
                      {fmtMoney(e.runningBalance)}
                    </td>
                    {isBudgetAdmin && (
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button className="p-1.5 text-brand-400 hover:text-brand-700 rounded transition-colors"
                            title="Edit" onClick={() => { /* TODO */ }}>
                            <Ic path={ICONS.edit} size={14} />
                          </button>
                          <button className="p-1.5 text-brand-400 hover:text-red-600 rounded transition-colors"
                            title="Delete" onClick={() => { /* TODO */ }}>
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
                  <td colSpan={3} className="px-4 py-3 font-semibold text-brand-700">Totals</td>
                  <td className="px-4 py-3 text-right">
                    <div className="text-green-700 text-xs font-medium">+{fmtMoney(totals.income)}</div>
                    <div className="text-red-700 text-xs font-medium">-{fmtMoney(totals.expense)}</div>
                  </td>
                  <td className={`px-4 py-3 text-right font-bold ${totals.net >= 0 ? "text-brand-800" : "text-red-700"}`}>
                    {fmtMoney(totals.net)}
                  </td>
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
                <span className="text-brand-400 text-xs">#{c.sort_order || "—"}</span>
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
