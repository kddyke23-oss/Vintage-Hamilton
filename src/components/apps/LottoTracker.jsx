import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell,
} from "recharts";

// ─── CSS Variables (matching VintageHamilton design system) ──────────────────
const VH_STYLES = `
  @keyframes slideUp   { from { transform: translateY(8px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
  @keyframes fadeIn    { from { opacity: 0; } to { opacity: 1; } }
  @keyframes spin      { to { transform: rotate(360deg); } }
  :root {
    --color-primary:      #1e4976;
    --color-primary-dark: #163758;
    --color-primary-rgb:  30, 73, 118;
    --color-gold:         #c9a94e;
    --color-gold-light:   #f5e9c8;
    --font-display:       'Playfair Display', Georgia, serif;
    --font-body:          'Lato', 'Segoe UI', sans-serif;
  }
`;

// ─── Icons ────────────────────────────────────────────────────────────────────
const Ic = ({ path, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    dangerouslySetInnerHTML={{ __html: path }} />
);
const ICONS = {
  dash:    '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
  members: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  draws:   '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="12" x2="16" y2="12"/>',
  winnings:'<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  payments:'<rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>',
  chart:   '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
  plus:    '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  x:       '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  edit:    '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
  check:   '<polyline points="20 6 9 17 4 12"/>',
  chevD:   '<polyline points="6 9 12 15 18 9"/>',
  chevU:   '<polyline points="18 15 12 9 6 15"/>',
  trophy:  '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
  mail:    '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>',
  copy:    '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  back:    '<polyline points="15 18 9 12 15 6"/>',
  home:    '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  user:    '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  calendar:'<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt  = d => d ? new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
const fmtS = d => d ? new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—";
const fmtMoney = n => `$${(n || 0).toFixed(2)}`;

const isActive = (m, dt) => m.join_date && m.join_date <= dt && (!m.exit_date || m.exit_date > dt);
const isPending = dr => dr.is_pending || (dr.winning?.[0] === 0 && dr.winning?.[1] === 0);

const getMatches = (nums, pb, winNums, winPb) => {
  let count = 0;
  for (const n of nums) if (winNums.includes(n)) count++;
  return { matchCount: count, pbMatch: pb === winPb };
};

const memberDisplayName = (m) => {
  const p1 = m.profile1;
  const p2 = m.profile2;
  if (!p1) return `Member ${m.id}`;
  if (!p2) return `${p1.names} ${p1.surname}`;
  // Same surname — just show names
  if (p1.surname === p2.surname) return `${p1.names} & ${p2.names} ${p1.surname}`;
  return `${p1.names} ${p1.surname} & ${p2.names} ${p2.surname}`;
};

// ─── Powerball ────────────────────────────────────────────────────────────────
function Ball({ number, isPb, isMatch, small }) {
  const sz = small ? { width: 28, height: 28, fontSize: 11 } : { width: 36, height: 36, fontSize: 13 };
  let bg, color, ring;
  if (isMatch && isPb)  { bg = "#c9a94e"; color = "#5a3e00"; ring = "2px solid #f5e9c8"; }
  else if (isMatch)     { bg = "#1e4976"; color = "white";   ring = "2px solid #7ba7d4"; }
  else if (isPb)        { bg = "rgba(201,169,78,0.15)"; color = "#9a7520"; ring = "1px solid rgba(201,169,78,0.4)"; }
  else                  { bg = "#f1f5f9"; color = "#64748b"; ring = "1px solid #e2e8f0"; }
  return (
    <span style={{
      ...sz, borderRadius: "50%", display: "inline-flex", alignItems: "center",
      justifyContent: "center", fontWeight: "700", fontFamily: "var(--font-body)",
      boxSizing: "border-box", outline: ring, background: bg, color,
      flexShrink: 0,
    }}>{number}</span>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ message }) {
  if (!message) return null;
  return (
    <div style={{
      position: "fixed", bottom: "2rem", right: "2rem", zIndex: 2000,
      background: "var(--color-primary)", color: "white",
      padding: "0.75rem 1.25rem", borderRadius: "8px",
      boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
      fontSize: "0.875rem", fontFamily: "var(--font-body)",
      animation: "slideUp 0.3s ease",
    }}>{message}</div>
  );
}

// ─── Shared Styles ────────────────────────────────────────────────────────────
const s = {
  btnPrimary: {
    display: "inline-flex", alignItems: "center", gap: "0.4rem",
    padding: "0.5rem 1rem", background: "var(--color-primary)", color: "white",
    border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "0.875rem", fontWeight: "500",
    fontFamily: "var(--font-body)",
  },
  btnGold: {
    display: "inline-flex", alignItems: "center", gap: "0.4rem",
    padding: "0.5rem 1rem", background: "var(--color-gold)", color: "white",
    border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "0.875rem", fontWeight: "500",
    fontFamily: "var(--font-body)",
  },
  btnSec: {
    display: "inline-flex", alignItems: "center", gap: "0.4rem",
    padding: "0.5rem 1rem", background: "white", color: "#374151",
    border: "1px solid #e5e7eb", borderRadius: "6px", cursor: "pointer",
    fontSize: "0.875rem", fontWeight: "500", fontFamily: "var(--font-body)",
  },
  btnDanger: {
    display: "inline-flex", alignItems: "center", gap: "0.35rem",
    padding: "0.3rem 0.65rem", background: "#fef2f2", color: "#dc2626",
    border: "1px solid #fca5a5", borderRadius: "5px", cursor: "pointer", fontSize: "0.8rem",
  },
  btnIcon: {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    padding: "0.35rem", background: "#f3f4f6", border: "none",
    borderRadius: "5px", cursor: "pointer", color: "#6b7280",
  },
  input: {
    padding: "0.55rem 0.75rem", border: "1px solid #e5e7eb", borderRadius: "6px",
    fontSize: "0.9rem", outline: "none", fontFamily: "var(--font-body)", background: "white",
  },
  card: {
    background: "white", borderRadius: "10px", padding: "1.25rem",
    boxShadow: "0 2px 8px rgba(0,0,0,0.06)", borderLeft: "4px solid var(--color-primary)",
  },
  overlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 1500, padding: "1rem",
  },
  modal: {
    background: "white", borderRadius: "12px", maxWidth: "560px", width: "100%",
    maxHeight: "90vh", boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
    display: "flex", flexDirection: "column",
    fontFamily: "var(--font-body)",
  },
};

// ─── Tab Button ───────────────────────────────────────────────────────────────
function TabBtn({ id, label, icon, active, onClick }) {
  return (
    <button onClick={() => onClick(id)} style={{
      display: "inline-flex", alignItems: "center", gap: "0.4rem",
      padding: "0.55rem 1rem", border: "none", borderRadius: "6px",
      background: active ? "var(--color-primary)" : "transparent",
      color: active ? "white" : "#6b7280",
      cursor: "pointer", fontSize: "0.85rem", fontWeight: active ? "600" : "400",
      fontFamily: "var(--font-body)", transition: "all 0.15s", whiteSpace: "nowrap",
    }}>
      <Ic path={ICONS[icon]} size={15} />
      <span>{label}</span>
    </button>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────
function SectionHeader({ title, subtitle, action }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.75rem" }}>
      <div>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", color: "var(--color-primary-dark)", margin: 0 }}>{title}</h2>
        {subtitle && <p style={{ fontSize: "0.85rem", color: "#6b7280", margin: "0.2rem 0 0" }}>{subtitle}</p>}
      </div>
      {action && <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>{action}</div>}
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent }) {
  return (
    <div style={{ ...s.card, borderLeftColor: accent || "var(--color-primary)" }}>
      <div style={{ fontSize: "0.75rem", fontWeight: "600", color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.25rem" }}>{label}</div>
      <div style={{ fontSize: "1.6rem", fontWeight: "700", color: accent || "var(--color-primary-dark)", fontFamily: "var(--font-display)" }}>{value}</div>
      {sub && <div style={{ fontSize: "0.78rem", color: "#9ca3af", marginTop: "0.15rem" }}>{sub}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD TAB
// ─────────────────────────────────────────────────────────────────────────────
function DashboardTab({ members, draws, periods, payments, isAdmin, onAddDraw, onAddPeriod, onShowSummary }) {
  const completed = draws.filter(d => !isPending(d));
  const totalPrize = completed.reduce((s, d) => s + (d.prize || 0), 0);
  const activeMembers = members.filter(m => !m.exit_date);

  // Current period
  const sortedPeriods = [...periods].sort((a, b) => a.start_date.localeCompare(b.start_date));
  const today = new Date().toISOString().slice(0, 10);
  const currentPeriod = sortedPeriods.findLast(p => p.start_date <= today) || sortedPeriods[sortedPeriods.length - 1];

  const periodDraws = currentPeriod
    ? draws.filter(d => d.period_id === currentPeriod.id)
    : [];
  const periodCompleted = periodDraws.filter(d => !isPending(d));
  const dpp = currentPeriod?.weeks === 4 ? 12 : 9;
  const periodPrize = periodCompleted.reduce((s, d) => s + (d.prize || 0), 0);

  // Top earners
  const earnings = {};
  members.forEach(m => { earnings[m.id] = 0; });
  periods.forEach(p => {
    const pDraws = draws.filter(d => d.period_id === p.id && !isPending(d));
    const pPrize = pDraws.reduce((s, d) => s + (d.prize || 0), 0);
    const actMs = members.filter(m => isActive(m, p.start_date));
    const share = actMs.length > 0 ? pPrize / actMs.length : 0;
    actMs.forEach(m => { earnings[m.id] = (earnings[m.id] || 0) + share; });
  });

  const recentDraws = [...completed].sort((a, b) => b.draw_date.localeCompare(a.draw_date)).slice(0, 5);

  return (
    <div style={{ animation: "fadeIn 0.3s ease" }}>
      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
        <StatCard label="Total Draws" value={completed.length} sub={`of ${draws.length} total`} />
        <StatCard label="Total Winnings" value={fmtMoney(totalPrize)} accent="var(--color-gold)" />
        <StatCard label="Active Members" value={activeMembers.length} sub={`${members.length} total`} />
        <StatCard label="Current Period" value={currentPeriod?.label || "—"} sub={`${periodCompleted.length}/${dpp} draws`} />
        <StatCard label="Period Winnings" value={fmtMoney(periodPrize)} sub="this period" accent="var(--color-gold)" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem" }}>
        {/* Recent draws */}
        <div style={s.card}>
          <h3 style={{ fontFamily: "var(--font-display)", color: "var(--color-primary)", fontSize: "1.1rem", marginBottom: "0.75rem" }}>Recent Draws</h3>
          {recentDraws.length === 0 && <p style={{ color: "#9ca3af", fontSize: "0.85rem" }}>No draws yet.</p>}
          {recentDraws.map(dr => (
            <div key={dr.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.6rem", flexWrap: "wrap" }}>
              <span style={{ fontSize: "0.78rem", color: "#9ca3af", minWidth: 60 }}>#{dr.draw_num}</span>
              <span style={{ fontSize: "0.78rem", color: "#6b7280", minWidth: 70 }}>{fmtS(dr.draw_date)}</span>
              <div style={{ display: "flex", gap: 3 }}>
                {dr.winning.map((n, i) => <Ball key={i} number={n} isPb={false} isMatch={false} small />)}
                <Ball number={dr.powerball} isPb={true} isMatch={false} small />
              </div>
              {dr.prize > 0 && (
                <span style={{ marginLeft: "auto", background: "var(--color-gold-light)", color: "#7a5c00", padding: "0.15rem 0.5rem", borderRadius: "12px", fontSize: "0.75rem", fontWeight: "600" }}>
                  {fmtMoney(dr.prize)}
                </span>
              )}
            </div>
          ))}
          {isAdmin && (
            <button onClick={onAddDraw} style={{ ...s.btnPrimary, marginTop: "0.75rem", width: "100%", justifyContent: "center" }}>
              <Ic path={ICONS.plus} size={14} /> Add Draw
            </button>
          )}
        </div>

        {/* Top earners */}
        <div style={s.card}>
          <h3 style={{ fontFamily: "var(--font-display)", color: "var(--color-primary)", fontSize: "1.1rem", marginBottom: "0.75rem" }}>
            <Ic path={ICONS.trophy} size={16} /> Top Earners
          </h3>
          {Object.entries(earnings)
            .filter(([id]) => members.find(m => m.id === id && !m.exit_date))
            .sort(([, a], [, b]) => b - a)
            .slice(0, 6)
            .map(([id, amt], i) => {
              const m = members.find(m => m.id === id);
              return (
                <div key={id} style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.5rem" }}>
                  <span style={{ width: 20, fontSize: "0.8rem", color: i === 0 ? "var(--color-gold)" : "#9ca3af", fontWeight: "700" }}>{i + 1}</span>
                  <span style={{ flex: 1, fontSize: "0.875rem", color: "#374151" }}>{memberDisplayName(m)}</span>
                  <span style={{ fontSize: "0.875rem", fontWeight: "600", color: "var(--color-primary)" }}>{fmtMoney(amt)}</span>
                </div>
              );
            })}
        </div>

        {/* Periods */}
        <div style={{ ...s.card, gridColumn: "1 / -1" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap", gap: "0.5rem" }}>
            <h3 style={{ fontFamily: "var(--font-display)", color: "var(--color-primary)", fontSize: "1.1rem", margin: 0 }}>Periods</h3>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              {isAdmin && <button onClick={onShowSummary} style={s.btnSec}><Ic path={ICONS.mail} size={14} /> Period Summary</button>}
              {isAdmin && <button onClick={onAddPeriod} style={s.btnPrimary}><Ic path={ICONS.plus} size={14} /> Add Period</button>}
            </div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #f0f4f8" }}>
                  {["Period", "Start", "Weeks", "Draws", "Total Won", "Per Member"].map(h => (
                    <th key={h} style={{ padding: "0.4rem 0.75rem", textAlign: "left", color: "#6b7280", fontWeight: "600", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedPeriods.map(p => {
                  const pDraws = draws.filter(d => d.period_id === p.id);
                  const pComp = pDraws.filter(d => !isPending(d));
                  const pPrize = pComp.reduce((s, d) => s + (d.prize || 0), 0);
                  const actMs = members.filter(m => isActive(m, p.start_date));
                  const perM = actMs.length > 0 ? pPrize / actMs.length : 0;
                  const isCurrent = p.id === currentPeriod?.id;
                  return (
                    <tr key={p.id} style={{ borderBottom: "1px solid #f0f4f8", background: isCurrent ? "rgba(var(--color-primary-rgb),0.04)" : "transparent" }}>
                      <td style={{ padding: "0.5rem 0.75rem", fontWeight: isCurrent ? "600" : "400", color: isCurrent ? "var(--color-primary)" : "#374151" }}>
                        {p.label} {isCurrent && <span style={{ fontSize: "0.7rem", background: "var(--color-primary)", color: "white", padding: "0.1rem 0.4rem", borderRadius: "10px", marginLeft: 4 }}>Current</span>}
                      </td>
                      <td style={{ padding: "0.5rem 0.75rem", color: "#6b7280" }}>{fmtS(p.start_date)}</td>
                      <td style={{ padding: "0.5rem 0.75rem", color: "#6b7280" }}>{p.weeks}</td>
                      <td style={{ padding: "0.5rem 0.75rem" }}>{pComp.length}/{pDraws.length}</td>
                      <td style={{ padding: "0.5rem 0.75rem", color: pPrize > 0 ? "#7a5c00" : "#9ca3af", fontWeight: pPrize > 0 ? "600" : "400" }}>{fmtMoney(pPrize)}</td>
                      <td style={{ padding: "0.5rem 0.75rem", color: perM > 0 ? "#7a5c00" : "#9ca3af" }}>{fmtMoney(perM)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MEMBERS TAB
// ─────────────────────────────────────────────────────────────────────────────
function MembersTab({ members, draws, periods, isAdmin, allResidents, onSaveMember, showToast }) {
  const [editingMember, setEditingMember] = useState(null);
  const [showAddModal, setShowAddModal]   = useState(false);

  // Compute earnings per member
  const earnings = {};
  members.forEach(m => { earnings[m.id] = 0; });
  periods.forEach(p => {
    const pDraws = draws.filter(d => d.period_id === p.id && !isPending(d));
    const pPrize = pDraws.reduce((s, d) => s + (d.prize || 0), 0);
    const actMs  = members.filter(m => isActive(m, p.start_date));
    const share  = actMs.length > 0 ? pPrize / actMs.length : 0;
    actMs.forEach(m => { earnings[m.id] = (earnings[m.id] || 0) + share; });
  });

  return (
    <div style={{ animation: "fadeIn 0.3s ease" }}>
      <SectionHeader
        title="Syndicate Members"
        subtitle={`${members.filter(m => !m.exit_date).length} active · ${members.filter(m => m.exit_date).length} exited`}
        action={isAdmin && <button onClick={() => setShowAddModal(true)} style={s.btnPrimary}><Ic path={ICONS.plus} size={14} /> Add Member</button>}
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "1rem" }}>
        {members.map(m => (
          <MemberCard
            key={m.id} member={m} earnings={earnings[m.id] || 0}
            isAdmin={isAdmin} onEdit={() => setEditingMember({ ...m })}
          />
        ))}
      </div>
      {editingMember && (
        <MemberModal
          member={editingMember} allResidents={allResidents} title="Edit Member"
          onSave={async (data) => { await onSaveMember(data); setEditingMember(null); }}
          onClose={() => setEditingMember(null)}
        />
      )}
      {showAddModal && (
        <MemberModal
          member={null} allResidents={allResidents} title="Add Member"
          onSave={async (data) => { await onSaveMember(data); setShowAddModal(false); }}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
}

function MemberCard({ member: m, earnings, isAdmin, onEdit }) {
  const active = !m.exit_date;
  return (
    <div style={{
      ...s.card,
      borderLeftColor: active ? "var(--color-primary)" : "#e5e7eb",
      opacity: active ? 1 : 0.65,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: "1rem", fontWeight: "700", color: "var(--color-primary-dark)" }}>
            {memberDisplayName(m)}
          </div>
          <div style={{ fontSize: "0.78rem", color: "#9ca3af", marginTop: "0.1rem" }}>
            Member {m.id} · Joined {fmtS(m.join_date)}
            {m.exit_date && <span style={{ color: "#dc2626" }}> · Exited {fmtS(m.exit_date)}</span>}
          </div>
        </div>
        <span style={{
          background: active ? "rgba(var(--color-primary-rgb),0.08)" : "#f3f4f6",
          color: active ? "var(--color-primary)" : "#9ca3af",
          padding: "0.2rem 0.6rem", borderRadius: "12px", fontSize: "0.72rem", fontWeight: "600",
        }}>{active ? "Active" : "Exited"}</span>
      </div>

      {/* Numbers */}
      <div style={{ display: "flex", gap: 4, alignItems: "center", marginBottom: "0.6rem", flexWrap: "wrap" }}>
        {m.nums.map((n, i) => <Ball key={i} number={n} isPb={false} isMatch={false} small />)}
        <span style={{ color: "#9ca3af", fontSize: "0.75rem", margin: "0 2px" }}>PB</span>
        <Ball number={m.pb} isPb={true} isMatch={false} small />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "0.8rem", color: "#6b7280" }}>
          Total earnings: <strong style={{ color: earnings > 0 ? "var(--color-gold)" : "#9ca3af" }}>{fmtMoney(earnings)}</strong>
        </span>
        {isAdmin && (
          <button onClick={onEdit} style={{ ...s.btnIcon, padding: "0.3rem 0.65rem", gap: "0.3rem", fontSize: "0.8rem", color: "var(--color-primary)" }}>
            <Ic path={ICONS.edit} size={13} /> Edit
          </button>
        )}
      </div>
    </div>
  );
}

function MemberModal({ member, allResidents, title, onSave, onClose }) {
  const isNew = !member;
  const [form, setForm] = useState({
    id:          member?.id || "",
    resident_id_1: member?.resident_id_1 || "",
    resident_id_2: member?.resident_id_2 || "",
    join_date:   member?.join_date || new Date().toISOString().slice(0, 10),
    exit_date:   member?.exit_date || "",
    nums:        member?.nums?.join(", ") || "",
    pb:          member?.pb || "",
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const nums = form.nums.split(/[\s,]+/).map(Number).filter(n => n >= 1 && n <= 69);
    if (nums.length !== 5) { alert("Please enter exactly 5 numbers (1–69)."); return; }
    const pb = parseInt(form.pb);
    if (!pb || pb < 1 || pb > 26) { alert("Powerball must be 1–26."); return; }
    if (!form.resident_id_1) { alert("Primary resident is required."); return; }
    setSaving(true);
    await onSave({
      id:           form.id.toUpperCase(),
      resident_id_1: parseInt(form.resident_id_1),
      resident_id_2: form.resident_id_2 ? parseInt(form.resident_id_2) : null,
      join_date:    form.join_date,
      exit_date:    form.exit_date || null,
      nums,
      pb,
    });
    setSaving(false);
  };

  const residentOptions = allResidents.map(r => ({
    value: r.resident_id,
    label: `${r.names} ${r.surname}`,
  }));

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1.5rem 2rem 1rem", flexShrink: 0 }}>
          <h3 style={{ fontFamily: "var(--font-display)", color: "var(--color-primary)", fontSize: "1.25rem", margin: 0 }}>{title}</h3>
          <button onClick={onClose} style={s.btnIcon}><Ic path={ICONS.x} size={14} /></button>
        </div>
        <div style={{ overflowY: "auto", padding: "0 2rem", flex: 1 }}>
          {isNew && (
            <MField label="Member ID (single letter)">
              <input value={form.id} onChange={e => setForm(f => ({ ...f, id: e.target.value }))}
                style={{ ...s.input, width: "100%" }} placeholder="e.g. M" maxLength={2} />
            </MField>
          )}
          <MField label="Primary Resident *">
            <select value={form.resident_id_1} onChange={e => setForm(f => ({ ...f, resident_id_1: e.target.value }))} style={{ ...s.input, width: "100%" }}>
              <option value="">— Select resident —</option>
              {residentOptions.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </MField>
          <MField label="Second Resident (optional — for couples/households)">
            <select value={form.resident_id_2} onChange={e => setForm(f => ({ ...f, resident_id_2: e.target.value }))} style={{ ...s.input, width: "100%" }}>
              <option value="">— None —</option>
              {residentOptions.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </MField>
          <MField label="Numbers (5 numbers, 1–69)">
            <input value={form.nums} onChange={e => setForm(f => ({ ...f, nums: e.target.value }))}
              style={{ ...s.input, width: "100%" }} placeholder="e.g. 8, 19, 23, 26, 31" />
          </MField>
          <MField label="Powerball (1–26)">
            <input type="number" value={form.pb} onChange={e => setForm(f => ({ ...f, pb: e.target.value }))}
              style={{ ...s.input, width: "100%" }} min={1} max={26} />
          </MField>
          <MField label="Join Date">
            <input type="date" value={form.join_date} onChange={e => setForm(f => ({ ...f, join_date: e.target.value }))} style={{ ...s.input, width: "100%" }} />
          </MField>
          <MField label="Exit Date (leave blank if still active)">
            <input type="date" value={form.exit_date} onChange={e => setForm(f => ({ ...f, exit_date: e.target.value }))} style={{ ...s.input, width: "100%" }} />
          </MField>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", padding: "1rem 2rem 1.5rem", flexShrink: 0, borderTop: "1px solid #f0f0f0" }}>
          <button onClick={handleSave} disabled={saving} style={{ ...s.btnPrimary, flex: 1, justifyContent: "center" }}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button onClick={onClose} style={{ ...s.btnSec, flex: 1, justifyContent: "center" }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function MField({ label, children }) {
  return (
    <div style={{ marginBottom: "1rem" }}>
      <label style={{ display: "block", fontSize: "0.8rem", fontWeight: "600", color: "#374151", marginBottom: "0.35rem", fontFamily: "var(--font-body)" }}>{label}</label>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DRAWS TAB
// ─────────────────────────────────────────────────────────────────────────────
function DrawsTab({ members, draws, periods, isAdmin, onSaveDraw }) {
  const [expanded, setExpanded]     = useState(null);
  const [showAddDraw, setShowAddDraw] = useState(false);
  const [filterPeriod, setFilterPeriod] = useState("all");

  const sortedDraws = [...draws].sort((a, b) => b.draw_date.localeCompare(a.draw_date));
  const filtered = filterPeriod === "all" ? sortedDraws : sortedDraws.filter(d => d.period_id === parseInt(filterPeriod));

  return (
    <div style={{ animation: "fadeIn 0.3s ease" }}>
      <SectionHeader
        title="Draw History"
        subtitle={`${draws.filter(d => !isPending(d)).length} completed draws`}
        action={
          <>
            <select value={filterPeriod} onChange={e => setFilterPeriod(e.target.value)} style={{ ...s.input, fontSize: "0.85rem" }}>
              <option value="all">All Periods</option>
              {[...periods].sort((a, b) => a.start_date.localeCompare(b.start_date)).map(p => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
            {isAdmin && <button onClick={() => setShowAddDraw(true)} style={s.btnPrimary}><Ic path={ICONS.plus} size={14} /> Add Draw</button>}
          </>
        }
      />
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {filtered.map(dr => {
          const pending = isPending(dr);
          const isExpanded = expanded === dr.id;
          const period = periods.find(p => p.id === dr.period_id);
          let matches = [];
          if (!pending) {
            const activeMs = members.filter(m => isActive(m, dr.draw_date));
            matches = activeMs.map(m => {
              const r = getMatches(m.nums, m.pb, dr.winning, dr.powerball);
              return { ...m, ...r };
            }).filter(m => m.matchCount >= 1 || m.pbMatch);
          }

          return (
            <div key={dr.id} style={{ background: "white", borderRadius: "8px", boxShadow: "0 2px 6px rgba(0,0,0,0.05)", overflow: "hidden" }}>
              <div
                onClick={() => !pending && setExpanded(isExpanded ? null : dr.id)}
                style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem 1rem", cursor: pending ? "default" : "pointer", flexWrap: "wrap" }}
              >
                <span style={{ fontSize: "0.75rem", color: "#9ca3af", minWidth: 40 }}>#{dr.draw_num}</span>
                <span style={{ fontSize: "0.8rem", color: "#6b7280", minWidth: 70 }}>{fmtS(dr.draw_date)}</span>
                <span style={{ fontSize: "0.72rem", color: "var(--color-primary)", background: "rgba(var(--color-primary-rgb),0.08)", padding: "0.1rem 0.4rem", borderRadius: "10px", marginRight: 4 }}>
                  {period?.label}
                </span>
                {pending ? (
                  <span style={{ fontSize: "0.75rem", color: "#9ca3af", background: "#f3f4f6", padding: "0.15rem 0.5rem", borderRadius: "10px" }}>Pending</span>
                ) : (
                  <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
                    {dr.winning.map((n, i) => <Ball key={i} number={n} isPb={false} isMatch={false} small />)}
                    <span style={{ margin: "0 2px", color: "#9ca3af", fontSize: "0.7rem" }}>PB</span>
                    <Ball number={dr.powerball} isPb={true} isMatch={false} small />
                  </div>
                )}
                {dr.prize > 0 && (
                  <span style={{ marginLeft: "auto", background: "var(--color-gold-light)", color: "#7a5c00", padding: "0.15rem 0.5rem", borderRadius: "12px", fontSize: "0.8rem", fontWeight: "700" }}>
                    {fmtMoney(dr.prize)}
                  </span>
                )}
                {!pending && <Ic path={isExpanded ? ICONS.chevU : ICONS.chevD} size={14} />}
              </div>

              {isExpanded && matches.length > 0 && (
                <div style={{ borderTop: "1px solid #f0f4f8", padding: "0.75rem 1rem", background: "#fafbfc" }}>
                  {matches.map(m => (
                    <div key={m.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem", fontSize: "0.85rem", flexWrap: "wrap" }}>
                      <span style={{ minWidth: 160, color: "#374151" }}>{memberDisplayName(m)}</span>
                      <div style={{ display: "flex", gap: 3 }}>
                        {m.nums.map((n, i) => (
                          <Ball key={i} number={n} isPb={false} isMatch={dr.winning.includes(n)} small />
                        ))}
                        <Ball number={m.pb} isPb={true} isMatch={m.pbMatch} small />
                      </div>
                      <span style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                        {m.matchCount > 0 && `${m.matchCount} match${m.matchCount > 1 ? "es" : ""}`}
                        {m.pbMatch && " + PB"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showAddDraw && (
        <AddDrawModal
          members={members} draws={draws} periods={periods}
          onSave={async (d) => { await onSaveDraw(d); setShowAddDraw(false); }}
          onClose={() => setShowAddDraw(false)}
        />
      )}
    </div>
  );
}

// ─── Add Draw Modal ────────────────────────────────────────────────────────────
function AddDrawModal({ members, draws, periods, onSave, onClose }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ winning: "", pb: "", prize: "" });
  const [matchResult, setMatchResult] = useState(null);
  const [saving, setSaving] = useState(false);

  // Find next pending draw
  const nextPending = [...draws].sort((a, b) => a.draw_date.localeCompare(b.draw_date)).find(d => isPending(d));

  const checkMatches = () => {
    const winning = form.winning.split(/[\s,]+/).map(Number).filter(n => n >= 1 && n <= 69);
    const pb = parseInt(form.pb);
    if (winning.length !== 5) { alert("Enter exactly 5 winning numbers."); return; }
    if (!pb || pb < 1 || pb > 26) { alert("Powerball must be 1–26."); return; }
    const drawDate = nextPending?.draw_date || new Date().toISOString().slice(0, 10);
    const activeMs = members.filter(m => isActive(m, drawDate));
    const results = activeMs.map(m => {
      const r = getMatches(m.nums, m.pb, winning, pb);
      return { ...m, ...r };
    });
    const winners = results.filter(r => r.matchCount >= 3 || r.pbMatch);
    setMatchResult({ winning, pb, drawDate, results, winners, isWinner: winners.length > 0 });
    setStep(2);
  };

  const handleSave = async () => {
    if (!matchResult) return;
    setSaving(true);
    await onSave({
      draw_id:  nextPending?.id,
      draw_num: nextPending?.draw_num,
      draw_date: matchResult.drawDate,
      period_id: nextPending?.period_id,
      winning:   matchResult.winning,
      powerball: matchResult.pb,
      prize:     matchResult.isWinner ? parseFloat(form.prize || 0) : 0,
      is_pending: false,
    });
    setSaving(false);
  };

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1.5rem 2rem 1rem", flexShrink: 0 }}>
          <h3 style={{ fontFamily: "var(--font-display)", color: "var(--color-primary)", fontSize: "1.25rem", margin: 0 }}>
            Add Draw {nextPending && `— #${nextPending.draw_num} (${fmtS(nextPending.draw_date)})`}
          </h3>
          <button onClick={onClose} style={s.btnIcon}><Ic path={ICONS.x} size={14} /></button>
        </div>
        <div style={{ overflowY: "auto", padding: "0 2rem", flex: 1 }}>
          {step === 1 && (
            <>
              <MField label="Winning Numbers (5 numbers, 1–69)">
                <input value={form.winning} onChange={e => setForm(f => ({ ...f, winning: e.target.value }))}
                  style={{ ...s.input, width: "100%" }} placeholder="e.g. 11, 23, 44, 61, 62" />
              </MField>
              <MField label="Powerball (1–26)">
                <input type="number" value={form.pb} onChange={e => setForm(f => ({ ...f, pb: e.target.value }))}
                  style={{ ...s.input, width: "100%" }} min={1} max={26} />
              </MField>
            </>
          )}
          {step === 2 && matchResult && (
            <>
              <div style={{ marginBottom: "1rem" }}>
                <div style={{ fontSize: "0.85rem", color: "#6b7280", marginBottom: "0.5rem" }}>Winning numbers:</div>
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  {matchResult.winning.map((n, i) => <Ball key={i} number={n} isPb={false} isMatch={false} />)}
                  <span style={{ color: "#9ca3af", margin: "0 4px" }}>PB</span>
                  <Ball number={matchResult.pb} isPb={true} isMatch={false} />
                </div>
              </div>

              {matchResult.isWinner ? (
                <div style={{ background: "var(--color-gold-light)", border: "1px solid var(--color-gold)", borderRadius: "8px", padding: "0.75rem 1rem", marginBottom: "1rem" }}>
                  <div style={{ fontWeight: "700", color: "#7a5c00", marginBottom: "0.5rem" }}>🎉 Winner! Prize amount:</div>
                  <input type="number" value={form.prize} onChange={e => setForm(f => ({ ...f, prize: e.target.value }))}
                    style={{ ...s.input, width: "100%" }} placeholder="e.g. 4.00" step="0.01" min="0" />
                  <div style={{ marginTop: "0.75rem" }}>
                    {matchResult.winners.map(w => (
                      <div key={w.id} style={{ fontSize: "0.85rem", color: "#374151", marginBottom: "0.3rem" }}>
                        <strong>{memberDisplayName(w)}</strong>: {w.matchCount} match{w.matchCount !== 1 ? "es" : ""}{w.pbMatch ? " + PB" : ""}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ background: "#f0f4f8", borderRadius: "8px", padding: "0.75rem 1rem", marginBottom: "1rem", color: "#6b7280", fontSize: "0.875rem" }}>
                  No winning matches this draw.
                </div>
              )}

              <div style={{ fontSize: "0.8rem", color: "#9ca3af", marginBottom: "0.5rem" }}>All member matches:</div>
              {matchResult.results.filter(r => r.matchCount > 0 || r.pbMatch).map(r => (
                <div key={r.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem", fontSize: "0.85rem" }}>
                  <span style={{ minWidth: 150 }}>{memberDisplayName(r)}</span>
                  <div style={{ display: "flex", gap: 3 }}>
                    {r.nums.map((n, i) => <Ball key={i} number={n} isPb={false} isMatch={matchResult.winning.includes(n)} small />)}
                    <Ball number={r.pb} isPb={true} isMatch={r.pbMatch} small />
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
        <div style={{ display: "flex", gap: "0.5rem", padding: "1rem 2rem 1.5rem", flexShrink: 0, borderTop: "1px solid #f0f0f0" }}>
          {step === 1 && <>
            <button onClick={checkMatches} style={{ ...s.btnPrimary, flex: 1, justifyContent: "center" }}>Check Matches →</button>
            <button onClick={onClose} style={{ ...s.btnSec, flex: 1, justifyContent: "center" }}>Cancel</button>
          </>}
          {step === 2 && <>
            <button onClick={handleSave} disabled={saving} style={{ ...s.btnPrimary, flex: 1, justifyContent: "center" }}>
              {saving ? "Saving…" : "Save Draw"}
            </button>
            <button onClick={() => setStep(1)} style={{ ...s.btnSec, flex: 1, justifyContent: "center" }}>← Back</button>
          </>}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WINNINGS TAB
// ─────────────────────────────────────────────────────────────────────────────
function WinningsTab({ members, draws, periods }) {
  const sortedPeriods = [...periods].sort((a, b) => a.start_date.localeCompare(b.start_date));
  const activeMembers = members.filter(m => !m.exit_date);

  const table = sortedPeriods.map(p => {
    const pDraws = draws.filter(d => d.period_id === p.id && !isPending(d));
    const pPrize = pDraws.reduce((s, d) => s + (d.prize || 0), 0);
    const actMs  = members.filter(m => isActive(m, p.start_date));
    const share  = actMs.length > 0 ? pPrize / actMs.length : 0;
    return { period: p, prize: pPrize, actMs, share };
  });

  const totals = {};
  members.forEach(m => { totals[m.id] = 0; });
  table.forEach(row => {
    row.actMs.forEach(m => { totals[m.id] = (totals[m.id] || 0) + row.share; });
  });

  return (
    <div style={{ animation: "fadeIn 0.3s ease" }}>
      <SectionHeader title="Winnings" subtitle="Per-member earnings by period" />
      <div style={{ background: "white", borderRadius: "10px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #f0f4f8" }}>
              <th style={{ padding: "0.75rem 1rem", textAlign: "left", fontFamily: "var(--font-display)", color: "var(--color-primary)", fontWeight: "600" }}>Member</th>
              {sortedPeriods.map(p => (
                <th key={p.id} style={{ padding: "0.75rem 0.5rem", textAlign: "right", color: "#6b7280", fontWeight: "600", whiteSpace: "nowrap", fontSize: "0.78rem" }}>{p.label}</th>
              ))}
              <th style={{ padding: "0.75rem 1rem", textAlign: "right", color: "var(--color-gold)", fontWeight: "700" }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {activeMembers.map((m, i) => (
              <tr key={m.id} style={{ borderBottom: "1px solid #f0f4f8", background: i % 2 === 0 ? "white" : "#fafbfc" }}>
                <td style={{ padding: "0.6rem 1rem", fontWeight: "500", color: "#374151" }}>{memberDisplayName(m)}</td>
                {table.map(row => {
                  const share = row.actMs.find(a => a.id === m.id) ? row.share : null;
                  return (
                    <td key={row.period.id} style={{ padding: "0.6rem 0.5rem", textAlign: "right", color: share > 0 ? "#7a5c00" : "#d1d5db" }}>
                      {share !== null ? fmtMoney(share) : "—"}
                    </td>
                  );
                })}
                <td style={{ padding: "0.6rem 1rem", textAlign: "right", fontWeight: "700", color: totals[m.id] > 0 ? "var(--color-gold)" : "#9ca3af" }}>
                  {fmtMoney(totals[m.id])}
                </td>
              </tr>
            ))}
            <tr style={{ borderTop: "2px solid #f0f4f8", background: "rgba(var(--color-primary-rgb),0.03)", fontWeight: "700" }}>
              <td style={{ padding: "0.6rem 1rem", color: "var(--color-primary)" }}>Total</td>
              {table.map(row => (
                <td key={row.period.id} style={{ padding: "0.6rem 0.5rem", textAlign: "right", color: row.prize > 0 ? "#7a5c00" : "#9ca3af" }}>
                  {fmtMoney(row.prize)}
                </td>
              ))}
              <td style={{ padding: "0.6rem 1rem", textAlign: "right", color: "var(--color-gold)" }}>
                {fmtMoney(table.reduce((s, r) => s + r.prize, 0))}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAYMENTS TAB (admin only)
// ─────────────────────────────────────────────────────────────────────────────
function PaymentsTab({ members, periods, payments, isAdmin, onSavePayment }) {
  const sortedPeriods = [...periods].sort((a, b) => a.start_date.localeCompare(b.start_date));
  const activeMembers = members.filter(m => !m.exit_date);

  const getPayment = (memberId, periodId) =>
    payments.find(p => p.member_id === memberId && p.period_id === periodId)?.amount ?? null;

  const getExpected = (member, period) => {
    if (!isActive(member, period.start_date)) return null;
    return period.weeks === 4 ? 24 : 18;
  };

  const [editing, setEditing] = useState(null);
  const [editVal, setEditVal] = useState("");

  const startEdit = (memberId, periodId, current) => {
    setEditing(`${memberId}-${periodId}`);
    setEditVal(current !== null ? String(current) : "");
  };

  const commitEdit = async (memberId, periodId) => {
    const amt = parseFloat(editVal);
    if (!isNaN(amt)) await onSavePayment(memberId, periodId, amt);
    setEditing(null);
  };

  return (
    <div style={{ animation: "fadeIn 0.3s ease" }}>
      <SectionHeader title="Payments" subtitle="Click any cell to edit a payment amount" />
      <div style={{ background: "white", borderRadius: "10px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #f0f4f8" }}>
              <th style={{ padding: "0.75rem 1rem", textAlign: "left", fontFamily: "var(--font-display)", color: "var(--color-primary)", fontWeight: "600" }}>Member</th>
              {sortedPeriods.map(p => (
                <th key={p.id} style={{ padding: "0.75rem 0.5rem", textAlign: "right", color: "#6b7280", fontWeight: "600", whiteSpace: "nowrap", fontSize: "0.78rem" }}>{p.label}</th>
              ))}
              <th style={{ padding: "0.75rem 1rem", textAlign: "right", color: "#6b7280", fontWeight: "600" }}>Balance</th>
            </tr>
          </thead>
          <tbody>
            {activeMembers.map((m, i) => {
              let totalPaid = 0, totalExpected = 0;
              return (
                <tr key={m.id} style={{ borderBottom: "1px solid #f0f4f8", background: i % 2 === 0 ? "white" : "#fafbfc" }}>
                  <td style={{ padding: "0.6rem 1rem", fontWeight: "500", color: "#374151", whiteSpace: "nowrap" }}>{memberDisplayName(m)}</td>
                  {sortedPeriods.map(p => {
                    const paid     = getPayment(m.id, p.id);
                    const expected = getExpected(m, p);
                    if (expected !== null) { totalExpected += expected; totalPaid += (paid || 0); }
                    const key = `${m.id}-${p.id}`;
                    const isEdit = editing === key;
                    if (expected === null) return <td key={p.id} style={{ padding: "0.6rem 0.5rem", textAlign: "right", color: "#d1d5db" }}>—</td>;
                    const diff = (paid || 0) - expected;
                    let cellColor = "#374151";
                    if (diff > 0) cellColor = "#7a5c00";
                    else if (diff < 0) cellColor = "#dc2626";
                    return (
                      <td key={p.id} style={{ padding: "0.4rem 0.5rem", textAlign: "right" }}>
                        {isEdit ? (
                          <input
                            type="number" value={editVal} autoFocus
                            onChange={e => setEditVal(e.target.value)}
                            onBlur={() => commitEdit(m.id, p.id)}
                            onKeyDown={e => e.key === "Enter" && commitEdit(m.id, p.id)}
                            style={{ ...s.input, width: 64, padding: "0.25rem 0.4rem", textAlign: "right", fontSize: "0.82rem" }}
                          />
                        ) : (
                          <span
                            onClick={() => isAdmin && startEdit(m.id, p.id, paid)}
                            style={{ color: cellColor, cursor: isAdmin ? "pointer" : "default", fontWeight: diff !== 0 ? "600" : "400" }}
                            title={expected ? `Expected: $${expected}` : ""}
                          >
                            {paid !== null ? fmtMoney(paid) : <span style={{ color: "#d1d5db" }}>—</span>}
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td style={{ padding: "0.6rem 1rem", textAlign: "right", fontWeight: "600" }}>
                    {(() => {
                      const bal = totalPaid - totalExpected;
                      return <span style={{ color: bal >= 0 ? "#059669" : "#dc2626" }}>{bal >= 0 ? "+" : ""}{fmtMoney(bal)}</span>;
                    })()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PERIOD SUMMARY MODAL
// ─────────────────────────────────────────────────────────────────────────────
function PeriodSummaryModal({ members, draws, periods, payments, onClose }) {
  const today = new Date().toISOString().slice(0, 10);
  const sortedPeriods = [...periods].sort((a, b) => a.start_date.localeCompare(b.start_date));
  const currentPeriod = sortedPeriods.findLast(p => p.start_date <= today) || sortedPeriods[sortedPeriods.length - 1];
  const [copied, setCopied] = useState(false);

  if (!currentPeriod) return null;

  const pDraws      = draws.filter(d => d.period_id === currentPeriod.id);
  const completed   = pDraws.filter(d => !isPending(d));
  const dpp         = currentPeriod.weeks === 4 ? 12 : 9;
  const remaining   = dpp - completed.length;
  const pPrize      = completed.reduce((s, d) => s + (d.prize || 0), 0);
  const actMs       = members.filter(m => isActive(m, currentPeriod.start_date) && !m.exit_date);
  const share       = actMs.length > 0 ? pPrize / actMs.length : 0;
  const winningDraws = completed.filter(d => d.prize > 0);

  // All-time stats
  const allCompleted = draws.filter(d => !isPending(d));
  const allTimePrize = allCompleted.reduce((s, d) => s + (d.prize || 0), 0);

  // Per-member balance (all periods to date)
  const getBalance = (m) => {
    const paid = payments.filter(p => p.member_id === m.id).reduce((s, p) => s + (p.amount || 0), 0);
    const expected = sortedPeriods
      .filter(p => p.start_date <= today)
      .reduce((s, p) => isActive(m, p.start_date) ? s + (p.weeks === 4 ? 24 : 18) : s, 0);
    return paid - expected;
  };

  const nextPeriod = sortedPeriods[sortedPeriods.indexOf(currentPeriod) + 1];
  const nextCost   = nextPeriod ? (nextPeriod.weeks === 4 ? 24 : 18) : 24;

  // Net balance = current balance minus next period subscription (if next period exists)
  // Positive = in credit after paying next period, Negative = still owes money
  const getNetBalance = (m) => {
    const currentBal = getBalance(m);
    return nextPeriod ? currentBal - nextCost : currentBal;
  };

  // All active members with their net position, sorted worst first
  const memberBalances = actMs
    .map(m => ({ m, currentBal: getBalance(m), netBal: getNetBalance(m) }))
    .sort((a, b) => a.netBal - b.netBal);

  // First name only helper for compact display
  const shortName = (m) => {
    const p1 = m.profile1;
    if (!p1) return `Member ${m.id}`;
    const first = p1.names?.split(" ")[0] || p1.names;
    return first;
  };

  const divider = `━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

  const lines = [
    `🎱 LOTTO SYNDICATE — ${currentPeriod.label.toUpperCase()} UPDATE`,
    divider,
    ``,
    `📅 Period: ${fmt(currentPeriod.start_date)} — ${currentPeriod.weeks} weeks (${dpp} draws)`,
    `✅ Draws completed: ${completed.length} of ${dpp}`,
    remaining > 0 ? `⏳ Draws remaining: ${remaining}` : `🏁 Period complete`,
    ``,
    // Winning draws detail
    pPrize > 0
      ? [`💰 PERIOD WINNINGS: ${fmtMoney(pPrize)}`,
         ...winningDraws.map(d => `   Draw #${d.draw_num} (${fmtS(d.draw_date)}): ${fmtMoney(d.prize)}`),
        ].join("\n")
      : `💰 Period winnings: ${fmtMoney(pPrize)} (no wins yet)`,
    `👥 Active members: ${actMs.length}`,
    `💵 Per member earnings: ${fmtMoney(share)}`,
    ``,
    divider,
    ``,
    // Next period subscription
    nextPeriod
      ? [`🔔 NEXT PERIOD: ${nextPeriod.label}`,
         `📅 Starts: ${fmt(nextPeriod.start_date)}`,
         `💲 Subscription: ${fmtMoney(nextCost)} (${nextPeriod.weeks * 3} draws × $2)`,
        ].join("\n")
      : ``,
    // Unified balance list
    nextPeriod
      ? [``,
         `💳 AMOUNTS DUE (including ${nextPeriod.label} subscription):`,
         ...memberBalances.map(({ m, currentBal, netBal }) => {
           if (netBal < 0) {
             // Owes money — show what they need to send
             const owes = Math.abs(netBal);
             if (currentBal > 0) {
               // Had credit but still owes after next period sub
               return `   ${shortName(m)}: Send ${fmtMoney(owes)}  (had ${fmtMoney(currentBal)} credit, minus ${fmtMoney(nextCost)} sub)`;
             }
             return `   ${shortName(m)}: Send ${fmtMoney(owes)}`;
           } else if (netBal === 0) {
             return `   ${shortName(m)}: All paid up ✓`;
           } else {
             // In credit even after next period sub
             return `   ${shortName(m)}: In credit ${fmtMoney(netBal)} ✓ (no payment needed)`;
           }
         }),
        ].join("\n")
      : memberBalances.some(({ currentBal }) => currentBal < 0)
        ? [``,
           `⚠️  OUTSTANDING BALANCES:`,
           ...memberBalances
             .filter(({ currentBal }) => currentBal !== 0)
             .map(({ m, currentBal }) => currentBal < 0
               ? `   ${shortName(m)}: Owes ${fmtMoney(Math.abs(currentBal))}`
               : `   ${shortName(m)}: Credit ${fmtMoney(currentBal)} ✓`),
          ].join("\n")
        : ``,
    ``,
    divider,
    `📊 ALL-TIME STATS`,
    `   Total draws: ${allCompleted.length}`,
    `   Total won: ${fmtMoney(allTimePrize)}`,
  ].filter(l => l !== undefined && l !== "").join("\n");

  const copy = () => {
    navigator.clipboard.writeText(lines).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={{ ...s.modal, maxWidth: "660px" }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1.5rem 2rem 1rem", flexShrink: 0, borderBottom: "1px solid #f0f0f0" }}>
          <div>
            <h3 style={{ fontFamily: "var(--font-display)", color: "var(--color-primary)", fontSize: "1.25rem", margin: 0 }}>Period Summary</h3>
            <p style={{ fontSize: "0.8rem", color: "#9ca3af", margin: "0.2rem 0 0" }}>Copy and paste into an email or group message</p>
          </div>
          <button onClick={onClose} style={s.btnIcon}><Ic path={ICONS.x} size={14} /></button>
        </div>

        {/* Preview */}
        <div style={{ overflowY: "auto", padding: "1.25rem 2rem", flex: 1 }}>
          {/* Visual preview cards */}
          <div style={{ background: "linear-gradient(135deg, #1e4976 0%, #163758 100%)", borderRadius: "10px", padding: "1.25rem 1.5rem", marginBottom: "1rem", color: "white" }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: "1.1rem", marginBottom: "0.75rem" }}>🎱 {currentPeriod.label} — Progress</div>
            <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
              <div><div style={{ fontSize: "1.5rem", fontWeight: "700" }}>{completed.length}/{dpp}</div><div style={{ fontSize: "0.75rem", opacity: 0.8 }}>Draws Done</div></div>
              <div><div style={{ fontSize: "1.5rem", fontWeight: "700", color: "#f5e9c8" }}>{fmtMoney(pPrize)}</div><div style={{ fontSize: "0.75rem", opacity: 0.8 }}>Period Winnings</div></div>
              <div><div style={{ fontSize: "1.5rem", fontWeight: "700", color: "#f5e9c8" }}>{fmtMoney(share)}</div><div style={{ fontSize: "0.75rem", opacity: 0.8 }}>Per Member</div></div>
              <div><div style={{ fontSize: "1.5rem", fontWeight: "700" }}>{allCompleted.length}</div><div style={{ fontSize: "0.75rem", opacity: 0.8 }}>All-Time Draws</div></div>
              <div><div style={{ fontSize: "1.5rem", fontWeight: "700", color: "#f5e9c8" }}>{fmtMoney(allTimePrize)}</div><div style={{ fontSize: "0.75rem", opacity: 0.8 }}>All-Time Won</div></div>
            </div>
          </div>

          {/* Colour-coded balance preview */}
          {nextPeriod && (
            <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: "8px", marginBottom: "1rem", overflow: "hidden" }}>
              <div style={{ background: "#f8fafc", padding: "0.6rem 1rem", borderBottom: "1px solid #e5e7eb", fontSize: "0.78rem", fontWeight: "600", color: "#6b7280" }}>
                💳 AMOUNTS DUE — including {nextPeriod.label} subscription ({fmtMoney(nextCost)})
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
                {memberBalances.map(({ m, currentBal, netBal }, i) => {
                  const owes = netBal < 0;
                  const even = i % 2 === 0;
                  return (
                    <div key={m.id} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "0.5rem 1rem", background: even ? "white" : "#fafbfc",
                      borderBottom: "1px solid #f0f4f8",
                    }}>
                      <span style={{ fontSize: "0.85rem", color: "#374151" }}>{shortName(m)}</span>
                      <span style={{
                        fontSize: "0.85rem", fontWeight: "700",
                        color: owes ? "#dc2626" : "#059669",
                      }}>
                        {owes ? `-${fmtMoney(Math.abs(netBal))}` : netBal === 0 ? "✓ Paid" : `+${fmtMoney(netBal)}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Text preview */}
          <pre style={{
            background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: "8px",
            padding: "1rem 1.25rem", fontSize: "0.82rem", fontFamily: "'Courier New', monospace",
            whiteSpace: "pre-wrap", color: "#374151", lineHeight: 1.7, margin: 0,
          }}>
            {lines}
          </pre>
        </div>

        {/* Footer */}
        <div style={{ display: "flex", gap: "0.5rem", padding: "1rem 2rem 1.5rem", flexShrink: 0, borderTop: "1px solid #f0f0f0" }}>
          <button onClick={copy} style={{ ...s.btnPrimary, flex: 1, justifyContent: "center" }}>
            {copied
              ? <><Ic path={ICONS.check} size={14} /> Copied!</>
              : <><Ic path={ICONS.copy} size={14} /> Copy to Clipboard</>}
          </button>
          <button onClick={onClose} style={{ ...s.btnSec, flex: 1, justifyContent: "center" }}>Close</button>
        </div>
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// CHARTS TAB
// ─────────────────────────────────────────────────────────────────────────────
function ChartsTab({ members, draws, periods }) {
  const completedDraws = draws.filter(d => !isPending(d))
    .sort((a, b) => a.draw_date.localeCompare(b.draw_date));
  const activeMembers = members.filter(m => !m.exit_date)
    .sort((a, b) => memberDisplayName(a).localeCompare(memberDisplayName(b)));

  // ── Bar chart data: winnings + win count per member ──
  const barData = useMemo(() => {
    return activeMembers.map(m => {
      let totalWon = 0;
      let winCount = 0;
      completedDraws.forEach(dr => {
        if (!isActive(m, dr.draw_date)) return;
        const actMs = members.filter(x => isActive(x, dr.draw_date));
        const share = actMs.length > 0 ? (dr.prize || 0) / actMs.length : 0;
        totalWon += share;
        const result = getMatches(m.nums, m.pb, dr.winning, dr.powerball);
        if (result.matchCount >= 3 || result.pbMatch) winCount++;
      });
      return {
        name: (m.profile1?.names || memberDisplayName(m)).split(" ")[0],
        fullName: memberDisplayName(m),
        winnings: parseFloat(totalWon.toFixed(2)),
        wins: winCount,
      };
    }).sort((a, b) => b.winnings - a.winnings);
  }, [members, completedDraws]);

  // ── Line chart data: cumulative invested vs won ──
  const lineData = useMemo(() => {
    let cumInvested = 0, cumWon = 0;
    return completedDraws.map(dr => {
      const active = members.filter(m => isActive(m, dr.draw_date)).length;
      cumInvested += active * 2;
      cumWon += (dr.prize || 0);
      return {
        date: fmtS(dr.draw_date),
        invested: cumInvested,
        won: parseFloat(cumWon.toFixed(2)),
      };
    });
  }, [members, completedDraws]);

  // ── Summary stats ──
  const totalInvested = lineData.length > 0 ? lineData[lineData.length - 1].invested : 0;
  const totalWon      = lineData.length > 0 ? lineData[lineData.length - 1].won : 0;
  const roi           = totalInvested > 0 ? ((totalWon / totalInvested) * 100).toFixed(1) : "0.0";
  const winningDraws  = completedDraws.filter(d => d.prize > 0).length;

  const CustomBarTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: "8px", padding: "0.6rem 0.9rem", boxShadow: "0 4px 12px rgba(0,0,0,0.1)", fontSize: "0.82rem" }}>
        <div style={{ fontWeight: "600", color: "var(--color-primary)", marginBottom: "0.3rem" }}>{payload[0]?.payload?.fullName || label}</div>
        {payload.map((p, i) => (
          <div key={i} style={{ color: p.color, marginBottom: "0.15rem" }}>
            {p.name}: {p.name === "Winnings ($)" ? `$${p.value.toFixed(2)}` : p.value}
          </div>
        ))}
      </div>
    );
  };

  const CustomLineTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: "8px", padding: "0.6rem 0.9rem", boxShadow: "0 4px 12px rgba(0,0,0,0.1)", fontSize: "0.82rem" }}>
        <div style={{ fontWeight: "600", color: "#6b7280", marginBottom: "0.3rem" }}>{label}</div>
        {payload.map((p, i) => (
          <div key={i} style={{ color: p.color, marginBottom: "0.15rem" }}>
            {p.name}: ${p.value.toFixed(2)}
          </div>
        ))}
        {payload.length === 2 && (
          <div style={{ color: "#9ca3af", marginTop: "0.3rem", paddingTop: "0.3rem", borderTop: "1px solid #f0f0f0" }}>
            Gap: ${(payload[0].value - payload[1].value).toFixed(2)} net cost
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ animation: "fadeIn 0.3s ease" }}>
      <SectionHeader title="Charts & Statistics" subtitle="Syndicate performance at a glance" />

      {/* Summary stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem", marginBottom: "1.5rem" }}>
        {[
          { label: "Total Invested", value: `$${totalInvested.toFixed(2)}`, sub: `${completedDraws.length} draws × active members`, color: "#dc2626" },
          { label: "Total Won",      value: `$${totalWon.toFixed(2)}`,      sub: `${winningDraws} winning draws`,                      color: "#059669" },
          { label: "Return",         value: `${roi}%`,                      sub: totalWon > totalInvested ? "In profit! 🎉" : "Keep playing!", color: "var(--color-gold)" },
        ].map(({ label, value, sub, color }) => (
          <div key={label} style={{ background: "white", borderRadius: "10px", padding: "1.25rem 1.5rem", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", borderTop: `3px solid ${color}` }}>
            <div style={{ fontSize: "0.75rem", color: "#6b7280", marginBottom: "0.25rem" }}>{label}</div>
            <div style={{ fontSize: "1.6rem", fontWeight: "700", fontFamily: "var(--font-display)", color }}>{value}</div>
            <div style={{ fontSize: "0.72rem", color: "#9ca3af", marginTop: "0.2rem" }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Bar chart */}
      <div style={{ background: "white", borderRadius: "10px", padding: "1.5rem", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", marginBottom: "1.5rem" }}>
        <h3 style={{ fontFamily: "var(--font-display)", color: "var(--color-primary)", fontSize: "1rem", margin: "0 0 1.25rem" }}>
          Member Winnings &amp; Win Count
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={barData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f4f8" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#6b7280" }} />
            <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "#6b7280" }} tickFormatter={v => `$${v}`} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "#6b7280" }} allowDecimals={false} />
            <Tooltip content={<CustomBarTooltip />} />
            <Legend wrapperStyle={{ fontSize: "0.8rem", color: "#6b7280" }} />
            <Bar yAxisId="left" dataKey="winnings" name="Winnings ($)" radius={[4, 4, 0, 0]} barSize={28}>
              {barData.map((entry, i) => (
                <Cell key={i} fill={entry.winnings > 0 ? "rgba(30,73,118,0.7)" : "rgba(209,213,219,0.5)"} />
              ))}
            </Bar>
            <Bar yAxisId="right" dataKey="wins" name="Times Won" fill="rgba(201,169,78,0.7)" radius={[4, 4, 0, 0]} barSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Line chart */}
      <div style={{ background: "white", borderRadius: "10px", padding: "1.5rem", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
        <h3 style={{ fontFamily: "var(--font-display)", color: "var(--color-primary)", fontSize: "1rem", margin: "0 0 1.25rem" }}>
          Cumulative Investment vs Winnings
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={lineData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f4f8" />
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#6b7280" }} interval={Math.floor(lineData.length / 10)} />
            <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} tickFormatter={v => `$${v}`} />
            <Tooltip content={<CustomLineTooltip />} />
            <Legend wrapperStyle={{ fontSize: "0.8rem", color: "#6b7280" }} />
            <Line type="monotone" dataKey="invested" name="Total Invested" stroke="#dc2626" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="won"      name="Total Won"      stroke="#059669" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
        <div style={{ textAlign: "center", fontSize: "0.75rem", color: "#9ca3af", marginTop: "0.5rem" }}>
          Gap = ${(totalInvested - totalWon).toFixed(2)} net cost to date
        </div>
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// MOBILE DASHBOARD — phone-optimised summary view
// ─────────────────────────────────────────────────────────────────────────────
function LottoMobileDashboard({ members, draws, periods, payments, user }) {
  const completed = draws.filter(d => !isPending(d));
  const totalPrize = completed.reduce((s, d) => s + (d.prize || 0), 0);
  const activeMembers = members.filter(m => !m.exit_date);

  const sortedPeriods = [...periods].sort((a, b) => a.start_date.localeCompare(b.start_date));
  const today = new Date().toISOString().slice(0, 10);
  const currentPeriod = sortedPeriods.findLast(p => p.start_date <= today) || sortedPeriods[sortedPeriods.length - 1];
  const periodDraws = currentPeriod ? draws.filter(d => d.period_id === currentPeriod.id) : [];
  const periodCompleted = periodDraws.filter(d => !isPending(d));
  const dpp = currentPeriod?.weeks === 4 ? 12 : 9;
  const periodPrize = periodCompleted.reduce((s, d) => s + (d.prize || 0), 0);

  // Find the logged-in user's member entry (match by resident profile uuid linkage)
  const myMember = members.find(m =>
    m.profile1?.resident_id != null || m.profile2?.resident_id != null
  ) || null;

  // Recent draws (last 3)
  const recentDraws = [...completed]
    .sort((a, b) => b.draw_date.localeCompare(a.draw_date))
    .slice(0, 3);

  // Next pending draw
  const nextDraw = draws
    .filter(d => isPending(d))
    .sort((a, b) => a.draw_date.localeCompare(b.draw_date))[0];

  const mStyle = {
    page:    { fontFamily: "var(--font-body)", padding: "1rem", maxWidth: 480, margin: "0 auto" },
    heading: { fontFamily: "var(--font-display)", fontSize: "1.6rem", color: "var(--color-primary-dark)", margin: "0 0 0.2rem" },
    sub:     { fontSize: "0.82rem", color: "#6b7280", margin: "0 0 1.25rem" },
    grid:    { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1rem" },
    card:    { background: "white", borderRadius: 10, padding: "0.85rem 1rem", boxShadow: "0 1px 6px rgba(0,0,0,0.07)", borderLeft: "3px solid var(--color-primary)" },
    cardGold:{ background: "white", borderRadius: 10, padding: "0.85rem 1rem", boxShadow: "0 1px 6px rgba(0,0,0,0.07)", borderLeft: "3px solid var(--color-gold)" },
    lbl:     { fontSize: "0.68rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 },
    val:     { fontSize: "1.4rem", fontWeight: 700, color: "var(--color-primary-dark)", fontFamily: "var(--font-display)" },
    valGold: { fontSize: "1.4rem", fontWeight: 700, color: "var(--color-gold)", fontFamily: "var(--font-display)" },
    hint:    { fontSize: "0.73rem", color: "#9ca3af", marginTop: 1 },
    section: { background: "white", borderRadius: 10, padding: "1rem", boxShadow: "0 1px 6px rgba(0,0,0,0.07)", marginBottom: "0.75rem" },
    secTitle:{ fontFamily: "var(--font-display)", fontSize: "1rem", color: "var(--color-primary)", marginBottom: "0.6rem" },
    drawRow: { display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.5rem", flexWrap: "wrap" },
    drawDate:{ fontSize: "0.75rem", color: "#9ca3af", minWidth: 55 },
    pill:    { background: "var(--color-gold-light)", color: "#7a5c00", padding: "0.1rem 0.45rem", borderRadius: 10, fontSize: "0.72rem", fontWeight: 600, marginLeft: "auto" },
    warning: { background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: 8, padding: "0.65rem 0.85rem", marginBottom: "0.75rem", display: "flex", gap: "0.5rem", alignItems: "flex-start" },
    warnTxt: { fontSize: "0.78rem", color: "#92400e", lineHeight: 1.4 },
    fullBtn: { display: "block", width: "100%", padding: "0.75rem", background: "var(--color-primary)", color: "white", border: "none", borderRadius: 8, fontSize: "0.9rem", fontWeight: 600, fontFamily: "var(--font-body)", cursor: "pointer", textAlign: "center", marginTop: "0.25rem" },
  };

  return (
    <div style={mStyle.page}>
      <style>{VH_STYLES}</style>

      <h1 style={mStyle.heading}>🎱 Lotto Syndicate</h1>
      <p style={mStyle.sub}>Vintage at Hamilton · Powerball Syndicate</p>

      {/* Stats grid */}
      <div style={mStyle.grid}>
        <div style={mStyle.card}>
          <div style={mStyle.lbl}>Total Winnings</div>
          <div style={mStyle.valGold}>{fmtMoney(totalPrize)}</div>
          <div style={mStyle.hint}>{completed.length} draws complete</div>
        </div>
        <div style={mStyle.card}>
          <div style={mStyle.lbl}>Active Members</div>
          <div style={mStyle.val}>{activeMembers.length}</div>
          <div style={mStyle.hint}>{members.length} total</div>
        </div>
        <div style={mStyle.card}>
          <div style={mStyle.lbl}>{currentPeriod?.label || "Period"}</div>
          <div style={mStyle.val}>{periodCompleted.length}<span style={{ fontSize: "0.9rem", fontWeight: 400 }}>/{dpp}</span></div>
          <div style={mStyle.hint}>draws complete</div>
        </div>
        <div style={mStyle.cardGold}>
          <div style={mStyle.lbl}>Period Winnings</div>
          <div style={mStyle.valGold}>{fmtMoney(periodPrize)}</div>
          <div style={mStyle.hint}>this period</div>
        </div>
      </div>

      {/* Next draw */}
      {nextDraw && (
        <div style={mStyle.section}>
          <div style={mStyle.secTitle}>Next Draw</div>
          <div style={{ fontSize: "0.85rem", color: "#374151" }}>
            {fmt(nextDraw.draw_date)} · Draw #{nextDraw.draw_num}
          </div>
        </div>
      )}

      {/* Recent draws */}
      <div style={mStyle.section}>
        <div style={mStyle.secTitle}>Recent Draws</div>
        {recentDraws.length === 0 && <p style={{ color: "#9ca3af", fontSize: "0.82rem" }}>No draws yet.</p>}
        {recentDraws.map(dr => (
          <div key={dr.id} style={mStyle.drawRow}>
            <span style={mStyle.drawDate}>{fmtS(dr.draw_date)}</span>
            <div style={{ display: "flex", gap: 3 }}>
              {dr.winning.map((n, i) => <Ball key={i} number={n} isPb={false} isMatch={false} small />)}
              <Ball number={dr.powerball} isPb={true} isMatch={false} small />
            </div>
            {dr.prize > 0 && <span style={mStyle.pill}>{fmtMoney(dr.prize)}</span>}
          </div>
        ))}
      </div>

      {/* Full app link with warning */}
      <div style={mStyle.warning}>
        <span style={{ fontSize: "1rem" }}>📱</span>
        <span style={mStyle.warnTxt}>
          The full Lotto app works best on a tablet or desktop. On a phone you may need to scroll sideways on some screens.
        </span>
      </div>
      <button
        style={mStyle.fullBtn}
        onClick={() => {
          // Set a flag so LottoTracker shows full view
          window.__lottoForceDesktop = true;
          window.dispatchEvent(new Event("lottoForceDesktop"));
        }}
      >
        Open Full App →
      </button>
    </div>
  );
}

export default function LottoTracker({ user, isAdmin, isLottoAdmin }) {
  const navigate = useNavigate();
  const canAdmin = isAdmin || isLottoAdmin;

  // Mobile detection — phone = < 768px width
  const [isMobileView, setIsMobileView] = useState(() => window.innerWidth < 768);
  const [forceDesktop, setForceDesktop] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobileView(window.innerWidth < 768);
    const handleForce  = () => setForceDesktop(true);
    window.addEventListener("resize", handleResize);
    window.addEventListener("lottoForceDesktop", handleForce);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("lottoForceDesktop", handleForce);
    };
  }, []);

  const [tab, setTab]             = useState("dash");
  const [members, setMembers]     = useState([]);
  const [draws, setDraws]         = useState([]);
  const [periods, setPeriods]     = useState([]);
  const [payments, setPayments]   = useState([]);
  const [allResidents, setAllResidents] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [toast, setToast]         = useState(null);
  const [showSummary, setShowSummary] = useState(false);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  // ── Load all data ──────────────────────────────────────────────────────────
  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [periodsRes, drawsRes, membersRes, paymentsRes, residentsRes] = await Promise.all([
      supabase.from("lotto_periods").select("*").order("start_date"),
      supabase.from("lotto_draws").select("*").order("draw_date"),
      supabase.from("lotto_members").select(`
        id, resident_id_1, resident_id_2, join_date, exit_date, nums, pb,
        profile1:profiles!lotto_members_resident_id_1_fkey(resident_id, names, surname),
        profile2:profiles!lotto_members_resident_id_2_fkey(resident_id, names, surname)
      `).order("id"),
      supabase.from("lotto_payments").select("*"),
      supabase.from("profiles").select("resident_id, names, surname").order("surname"),
    ]);

    if (periodsRes.error)  console.error("periods",  periodsRes.error);
    if (drawsRes.error)    console.error("draws",    drawsRes.error);
    if (membersRes.error)  console.error("members",  membersRes.error);
    if (paymentsRes.error) console.error("payments", paymentsRes.error);

    setPeriods(periodsRes.data   || []);
    setDraws(drawsRes.data       || []);
    setMembers(membersRes.data   || []);
    setPayments(paymentsRes.data || []);
    setAllResidents(residentsRes.data || []);
    setLoading(false);
  }

  // ── Save draw ──────────────────────────────────────────────────────────────
  async function handleSaveDraw(draw) {
    const { draw_id, ...fields } = draw;
    let error;
    if (draw_id) {
      ({ error } = await supabase.from("lotto_draws").update({
        winning: fields.winning, powerball: fields.powerball,
        prize: fields.prize, is_pending: false,
      }).eq("id", draw_id));
    } else {
      ({ error } = await supabase.from("lotto_draws").insert([{
        period_id: fields.period_id, draw_num: fields.draw_num,
        draw_date: fields.draw_date, winning: fields.winning,
        powerball: fields.powerball, prize: fields.prize, is_pending: false,
      }]));
    }
    if (error) { showToast("Error saving draw"); console.error(error); }
    else { showToast("Draw saved"); await loadAll(); }
  }

  // ── Save member ────────────────────────────────────────────────────────────
  async function handleSaveMember(member) {
    const { id, ...fields } = member;
    const existing = members.find(m => m.id === id);
    let error;
    if (existing) {
      ({ error } = await supabase.from("lotto_members").update(fields).eq("id", id));
    } else {
      ({ error } = await supabase.from("lotto_members").insert([{ id, ...fields }]));
    }
    if (error) { showToast("Error saving member"); console.error(error); }
    else { showToast(existing ? "Member updated" : "Member added"); await loadAll(); }
  }

  // ── Save payment ───────────────────────────────────────────────────────────
  async function handleSavePayment(memberId, periodId, amount) {
    const existing = payments.find(p => p.member_id === memberId && p.period_id === periodId);
    let error;
    if (existing) {
      ({ error } = await supabase.from("lotto_payments").update({ amount }).eq("id", existing.id));
    } else {
      ({ error } = await supabase.from("lotto_payments").insert([{ member_id: memberId, period_id: periodId, amount }]));
    }
    if (error) { showToast("Error saving payment"); console.error(error); }
    else { showToast("Payment updated"); setPayments(prev => {
      const filtered = prev.filter(p => !(p.member_id === memberId && p.period_id === periodId));
      return [...filtered, { member_id: memberId, period_id: periodId, amount, id: existing?.id || Date.now() }];
    }); }
  }

  // ── Add period ─────────────────────────────────────────────────────────────
  async function handleAddPeriod() {
    const sorted = [...periods].sort((a, b) => a.start_date.localeCompare(b.start_date));
    const last   = sorted[sorted.length - 1];
    if (!last) return;
    const lastStart = new Date(last.start_date + "T12:00:00");
    const newStart  = new Date(lastStart);
    newStart.setDate(newStart.getDate() + last.weeks * 7);
    const newStartStr = newStart.toISOString().slice(0, 10);
    const nextLabel  = `Period ${sorted.length + 1}`;
    if (!confirm(`Add ${nextLabel} starting ${fmt(newStartStr)} (4 weeks, 12 draws)?`)) return;

    const { data: periodData, error: pErr } = await supabase
      .from("lotto_periods").insert([{ label: nextLabel, start_date: newStartStr, weeks: 4 }]).select().single();
    if (pErr) { showToast("Error adding period"); return; }

    // Generate Mon/Wed/Sat dates
    const dates = [];
    const end   = new Date(newStart); end.setDate(end.getDate() + 4 * 7);
    const cur   = new Date(newStart);
    while (cur < end) {
      if ([1, 3, 6].includes(cur.getDay())) dates.push(cur.toISOString().slice(0, 10));
      cur.setDate(cur.getDate() + 1);
    }
    const lastDrawNum = Math.max(...draws.map(d => d.draw_num), 0);
    const newDraws = dates.map((dt, i) => ({
      period_id: periodData.id, draw_num: lastDrawNum + i + 1,
      draw_date: dt, winning: [0,0,0,0,0], powerball: 0, prize: 0, is_pending: true,
    }));

    const { error: dErr } = await supabase.from("lotto_draws").insert(newDraws);
    if (dErr) { showToast("Error adding draws"); return; }
    showToast(`${nextLabel} added with ${newDraws.length} pending draws`);
    await loadAll();
  }

  const TABS = [
    { id: "dash",     label: "Dashboard", icon: "dash" },
    { id: "members",  label: "Members",   icon: "members" },
    { id: "draws",    label: "Draws",     icon: "draws" },
    { id: "winnings", label: "Winnings",  icon: "winnings" },
    ...(canAdmin ? [{ id: "payments", label: "Payments", icon: "payments" }] : []),
    { id: "charts", label: "Charts", icon: "winnings" },
  ];

  // Show mobile summary if on phone and user hasn't tapped "Open Full App"
  const showMobile = isMobileView && !forceDesktop;

  if (loading) return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "50vh" }}>
      <div style={{ width: 36, height: 36, border: "3px solid #e5e7eb", borderTopColor: "var(--color-primary)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
    </div>
  );

  // ── Mobile view ──────────────────────────────────────────────────────────
  if (showMobile) {
    return (
      <LottoMobileDashboard
        members={members} draws={draws} periods={periods}
        payments={payments} user={user}
      />
    );
  }

  return (
    <div style={{ fontFamily: "var(--font-body)" }}>
      <style>{VH_STYLES}</style>

      {/* ── Page Header ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem", flexWrap: "wrap", gap: "0.75rem" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "2rem", color: "var(--color-primary-dark)", margin: 0 }}>
            🎱 Lotto Syndicate
          </h1>
          <p style={{ fontSize: "0.85rem", color: "#6b7280", margin: "0.25rem 0 0" }}>
            Vintage at Hamilton Powerball Syndicate
          </p>
        </div>
        <button
          onClick={() => navigate("/")}
          style={{ ...s.btnSec, gap: "0.5rem" }}
        >
          <Ic path={ICONS.back} size={15} />
          Back to Dashboard
        </button>
      </div>

      {/* ── Tab Bar ── */}
      <div style={{ background: "white", borderRadius: "8px", padding: "0.4rem", marginBottom: "1.5rem", boxShadow: "0 2px 6px rgba(0,0,0,0.05)", display: "flex", gap: "0.25rem", overflowX: "auto" }}>
        {TABS.map(t => (
          <TabBtn key={t.id} id={t.id} label={t.label} icon={t.icon} active={tab === t.id} onClick={setTab} />
        ))}
      </div>

      {/* ── Tab Content ── */}
      {tab === "dash" && (
        <DashboardTab
          members={members} draws={draws} periods={periods} payments={payments}
          isAdmin={canAdmin}
          onAddDraw={() => setTab("draws")}
          onAddPeriod={handleAddPeriod}
          onShowSummary={() => setShowSummary(true)}
        />
      )}
      {tab === "members" && (
        <MembersTab
          members={members} draws={draws} periods={periods}
          isAdmin={canAdmin} allResidents={allResidents}
          onSaveMember={handleSaveMember} showToast={showToast}
        />
      )}
      {tab === "draws" && (
        <DrawsTab
          members={members} draws={draws} periods={periods}
          isAdmin={canAdmin} onSaveDraw={handleSaveDraw}
        />
      )}
      {tab === "winnings" && (
        <WinningsTab members={members} draws={draws} periods={periods} />
      )}
      {tab === "charts" && (
        <ChartsTab members={members} draws={draws} periods={periods} />
      )}
      {tab === "payments" && canAdmin && (
        <PaymentsTab
          members={members} periods={periods} payments={payments}
          isAdmin={canAdmin} onSavePayment={handleSavePayment}
        />
      )}

      {showSummary && (
        <PeriodSummaryModal
          members={members} draws={draws} periods={periods} payments={payments}
          onClose={() => setShowSummary(false)}
        />
      )}

      <Toast message={toast} />
    </div>
  );
}
