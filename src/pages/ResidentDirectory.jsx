import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { deleteStoragePhoto } from "@/lib/storage";
import { useImageUpload } from "@/hooks/useImageUpload";
import { STREETS } from "@/config/constants";

// Parse "12 Kay Chiarello Way" → { houseNumber: 12, street: "Kay Chiarello Way" }
function parseAddress(address) {
  if (!address) return { houseNumber: null, street: "" };
  const match = address.trim().match(/^(\d+)\s+(.+)$/);
  if (match) {
    return { houseNumber: parseInt(match[1], 10), street: match[2] };
  }
  return { houseNumber: null, street: address };
}

// ─── icons ────────────────────────────────────────────────────────────────────
const IconPin     = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" /></svg>;
const IconPhone   = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.68A2 2 0 012 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 8.9a16 16 0 006.19 6.19l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" /></svg>;
const IconMail    = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>;
const IconEdit    = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>;
const IconTrash   = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" /></svg>;
const IconSearch  = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>;
const IconPrint   = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>;
const IconSelect  = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></svg>;
const IconX       = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>;
const IconPlus    = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>;
const IconMinus   = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /></svg>;
const IconMap     = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" /><line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" /></svg>;

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ message }) {
  if (!message) return null;
  return (
    <div style={{
      position: "fixed", bottom: "2rem", right: "2rem",
      background: "var(--color-primary)", color: "white",
      padding: "0.75rem 1.25rem", borderRadius: "8px",
      boxShadow: "0 4px 16px rgba(0,0,0,0.2)", zIndex: 1000,
      fontSize: "0.875rem", fontFamily: "var(--font-body)",
      animation: "slideUp 0.3s ease",
    }}>
      {message}
    </div>
  );
}

// ─── Resident Card ────────────────────────────────────────────────────────────
function ResidentCard({ entry, canEdit, onEdit, onDelete, selectMode, selected, onToggleSelect }) {
  const isHidden = entry.directory_visible === false;
  return (
    <div
      onClick={() => selectMode && onToggleSelect()}
      style={{
        background: "white", borderRadius: "10px", padding: "1.25rem",
        boxShadow: selected ? "0 0 0 2px var(--color-gold), 0 4px 16px rgba(0,0,0,0.08)" : "0 2px 8px rgba(0,0,0,0.06)",
        borderLeft: `4px solid ${isHidden ? "#dc2626" : selected ? "var(--color-gold)" : "var(--color-primary)"}`,
        transition: "all 0.2s", cursor: selectMode ? "pointer" : "default",
        position: "relative", transform: selectMode && selected ? "translateY(-1px)" : "none",
        opacity: isHidden ? 0.6 : 1,
      }}
    >
      {selectMode && (
        <div style={{
          position: "absolute", top: "0.75rem", right: "0.75rem",
          width: "20px", height: "20px", borderRadius: "4px",
          border: `2px solid ${selected ? "var(--color-primary)" : "#d1d5db"}`,
          background: selected ? "var(--color-primary)" : "white",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "white", fontSize: "0.7rem", fontWeight: "bold",
        }}>
          {selected && "✓"}
        </div>
      )}
      {isHidden && !selectMode && (
        <div style={{
          position: "absolute", top: "0.75rem", right: "0.75rem",
          background: "#fee2e2", color: "#dc2626", fontSize: "0.68rem",
          fontWeight: "700", padding: "0.15rem 0.45rem", borderRadius: "10px",
          letterSpacing: "0.04em", textTransform: "uppercase",
        }}>Hidden</div>
      )}

      {/* Card layout: info left, photo right */}
      <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
        {/* Info column */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: "1.1rem", fontWeight: "700", color: "var(--color-primary-dark)", marginBottom: "0.15rem" }}>
            {entry.surname}
          </div>
          <div style={{ fontSize: "0.875rem", color: "#6b7280", marginBottom: "0.75rem", fontFamily: "var(--font-body)" }}>
            {entry.names}
          </div>
          {entry.address && <DetailRow icon={<IconPin />} value={entry.address} />}
          {entry.phones?.length > 0 && <DetailRow icon={<IconPhone />} value={entry.phones.join(" / ")} />}
          {entry.emails?.length > 0 && (
            <DetailRow icon={<IconMail />} value={
              entry.emails.map((em, i) => (
                <span key={i}>
                  <a href={`mailto:${em}`} style={{ color: "var(--color-primary)", textDecoration: "none" }}
                    onClick={e => e.stopPropagation()}>{em}</a>
                  {i < entry.emails.length - 1 ? " / " : ""}
                </span>
              ))
            } />
          )}
          {entry.tags?.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem", marginTop: "0.6rem" }}>
              {entry.tags.map((tag, i) => (
                <span key={i} style={{
                  background: "rgba(var(--color-primary-rgb), 0.08)", color: "var(--color-primary)",
                  padding: "0.15rem 0.5rem", borderRadius: "12px", fontSize: "0.72rem", fontWeight: "600",
                  fontFamily: "var(--font-body)",
                }}>{tag}</span>
              ))}
            </div>
          )}
          {canEdit && !selectMode && (
            <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid #f0f0f0" }}>
              <button onClick={onEdit} style={btnOutlineStyle}><IconEdit /> Edit</button>
              {onDelete && <button onClick={onDelete} style={btnDangerStyle}><IconTrash /> Remove</button>}
            </div>
          )}
        </div>

        {/* Photo column */}
        <div style={{
          width: "135px", height: "135px", borderRadius: "10px", flexShrink: 0,
          overflow: "hidden", background: "rgba(var(--color-primary-rgb), 0.08)",
          display: "flex", alignItems: "center", justifyContent: "center",
          border: "2px solid rgba(var(--color-primary-rgb), 0.12)",
        }}>
          {entry.photo_url
            ? <img src={entry.photo_url} alt={entry.names} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <span style={{ fontFamily: "var(--font-display)", fontSize: "1.8rem", fontWeight: "700", color: "var(--color-primary)", opacity: 0.6 }}>
                {((entry.names?.[0] || "") + (entry.surname?.[0] || "")).toUpperCase()}
              </span>
          }
        </div>
      </div>
    </div>
  );
}

function DetailRow({ icon, value }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", marginBottom: "0.3rem", fontSize: "0.85rem", color: "#374151", fontFamily: "var(--font-body)" }}>
      <span style={{ color: "var(--color-primary)", flexShrink: 0, marginTop: "1px" }}>{icon}</span>
      <span style={{ wordBreak: "break-word" }}>{value}</span>
    </div>
  );
}

// ─── Street List View ─────────────────────────────────────────────────────────
function StreetListView({ residents, street, onClose }) {
  const streetResidents = useMemo(() => {
    return residents
      .filter(r => {
        const { street: rStreet } = parseAddress(r.address);
        return rStreet.toLowerCase() === street.toLowerCase();
      })
      .map(r => ({ ...r, ...parseAddress(r.address) }))
      .sort((a, b) => (a.houseNumber ?? 9999) - (b.houseNumber ?? 9999));
  }, [residents, street]);

  return (
    <div style={{ background: "white", borderRadius: "12px", boxShadow: "0 2px 12px rgba(0,0,0,0.08)", overflow: "hidden" }}>
      {/* Street header */}
      <div style={{
        background: "var(--color-primary)", color: "white",
        padding: "1rem 1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: "1.2rem", fontWeight: "700" }}>
            {street}
          </div>
          <div style={{ fontSize: "0.8rem", opacity: 0.8, marginTop: "0.15rem" }}>
            {streetResidents.length} household{streetResidents.length !== 1 ? "s" : ""}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", color: "white", borderRadius: "6px", padding: "0.4rem 0.8rem", cursor: "pointer", fontSize: "0.8rem", display: "flex", alignItems: "center", gap: "0.4rem" }}
        >
          <IconX /> Back to Directory
        </button>
      </div>

      {streetResidents.length === 0 ? (
        <div style={{ padding: "3rem", textAlign: "center", color: "#9ca3af" }}>
          No residents found on {street}.
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
          <thead>
            <tr style={{ background: "#f5f7fa", borderBottom: "2px solid #e5e7eb" }}>
              <th style={thStyle}>#</th>
              <th style={thStyle}>Surname</th>
              <th style={thStyle}>Names</th>
              <th style={thStyle}>Phone(s)</th>
              <th style={thStyle}>Email(s)</th>
              <th style={thStyle}>Tags</th>
            </tr>
          </thead>
          <tbody>
            {streetResidents.map((r, i) => (
              <tr key={r.resident_id} style={{ background: i % 2 === 0 ? "white" : "#f9fafb", borderBottom: "1px solid #f0f0f0" }}>
                <td style={{ ...tdStyle, fontWeight: "700", color: "var(--color-primary)", width: "3rem", textAlign: "center" }}>
                  {r.houseNumber ?? "—"}
                </td>
                <td style={{ ...tdStyle, fontWeight: "700", fontFamily: "var(--font-display)", color: "var(--color-primary-dark)" }}>
                  {r.surname}
                </td>
                <td style={{ ...tdStyle, color: "#4b5563" }}>
                  {r.names}
                </td>
                <td style={{ ...tdStyle, color: "#374151" }}>
                  {(r.phones || []).join(" / ") || <span style={{ color: "#d1d5db" }}>—</span>}
                </td>
                <td style={{ ...tdStyle }}>
                  {r.emails?.length > 0 ? r.emails.map((em, j) => (
                    <span key={j}>
                      <a href={`mailto:${em}`} style={{ color: "var(--color-primary)", textDecoration: "none" }}>{em}</a>
                      {j < r.emails.length - 1 ? ", " : ""}
                    </span>
                  )) : <span style={{ color: "#d1d5db" }}>—</span>}
                </td>
                <td style={{ ...tdStyle }}>
                  {r.tags?.length > 0 ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem" }}>
                      {r.tags.map((tag, j) => (
                        <span key={j} style={{
                          background: "rgba(var(--color-primary-rgb),0.08)", color: "var(--color-primary)",
                          padding: "0.1rem 0.4rem", borderRadius: "10px", fontSize: "0.7rem", fontWeight: "600",
                        }}>{tag}</span>
                      ))}
                    </div>
                  ) : <span style={{ color: "#d1d5db" }}>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const thStyle = {
  padding: "0.6rem 1rem", textAlign: "left", fontWeight: "600",
  color: "#374151", fontSize: "0.8rem", textTransform: "uppercase",
  letterSpacing: "0.03em",
};
const tdStyle = {
  padding: "0.65rem 1rem", verticalAlign: "top",
};

// ─── Entry Modal ──────────────────────────────────────────────────────────────
function EntryModal({ entry, onSave, onClose, title, isSaving, isOwnRecord, isAdmin }) {
  // Split existing address into house number + street for the form
  const parsed = parseAddress(entry.address);
  const knownStreet = STREETS.includes(parsed.street) ? parsed.street : "";
  const customStreet = STREETS.includes(parsed.street) ? "" : parsed.street;

  const [form, setForm] = useState({
    surname: entry.surname || "",
    names: entry.names || "",
    houseNumber: parsed.houseNumber ? String(parsed.houseNumber) : "",
    street: knownStreet || STREETS[0],
    customStreet: customStreet,
    phones: entry.phones?.length ? entry.phones : [""],
    emails: entry.emails?.length ? entry.emails : [""],
    tags: entry.tags || [],
    notify_calendar: entry.notify_calendar ?? false,
    notify_blog: entry.notify_blog ?? false,
    directory_visible: entry.directory_visible ?? true,
  });
  const [newTag, setNewTag] = useState("");

  // Photo upload
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(entry.photo_url || null);
  const existingPhotoUrl = entry.photo_url || null;
  const photoInputRef = useRef(null);
  const { uploading: photoUploading, error: photoUploadError, uploadImage } = useImageUpload({
    bucket: "avatars",
    maxDimension: 400,
  });

  const updateField = (field, value) => setForm(prev => ({ ...prev, [field]: value }));
  const updateArr   = (field, i, val) => { const a = [...form[field]]; a[i] = val; setForm(prev => ({ ...prev, [field]: a })); };
  const addArr      = (field) => setForm(prev => ({ ...prev, [field]: [...prev[field], ""] }));
  const removeArr   = (field, i) => { const a = form[field].filter((_, idx) => idx !== i); setForm(prev => ({ ...prev, [field]: a.length ? a : [""] })); };
  const addTag      = () => { if (newTag.trim() && !form.tags.includes(newTag.trim())) { setForm(prev => ({ ...prev, tags: [...prev.tags, newTag.trim()] })); setNewTag(""); } };
  const removeTag   = (tag) => setForm(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tag) }));

  const handleSubmit = async () => {
    if (!form.surname.trim()) { alert("Surname is required."); return; }
    // Reassemble address string
    const streetName = form.street === "__other__" ? form.customStreet.trim() : form.street;
    const address = form.houseNumber.trim() && streetName
      ? `${form.houseNumber.trim()} ${streetName}`
      : streetName || form.houseNumber.trim() || "";

    // Handle photo
    let photo_url = existingPhotoUrl; // default: keep existing
    if (photoFile) {
      const uploaded = await uploadImage(photoFile);
      if (!uploaded) return; // error shown by hook
      photo_url = uploaded;
    } else if (!photoPreview) {
      photo_url = null; // preview cleared — remove photo
    }

    onSave({
      ...entry,
      surname: form.surname.toUpperCase().trim(),
      names: form.names,
      address,
      phones: form.phones.filter(p => p.trim()),
      emails: form.emails.filter(e => e.trim()),
      tags: form.tags,
      notify_calendar: form.notify_calendar,
      notify_blog: form.notify_blog,
      directory_visible: form.directory_visible,
      photo_url,
    });
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>

        {/* Fixed header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1.5rem 2rem 1rem", flexShrink: 0 }}>
          <h3 style={{ fontFamily: "var(--font-display)", color: "var(--color-primary)", fontSize: "1.3rem", margin: 0 }}>{title}</h3>
          <button onClick={onClose} style={iconBtnStyle}><IconX /></button>
        </div>

        {/* Scrollable fields */}
        <div style={{ overflowY: "auto", padding: "0 2rem", flex: 1 }}>

          {/* ── Profile Photo ── */}
          <ModalField label="Profile Photo">
            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              {/* Avatar preview */}
              <div style={{
                width: "72px", height: "72px", borderRadius: "50%", flexShrink: 0,
                overflow: "hidden", background: "rgba(var(--color-primary-rgb), 0.1)",
                display: "flex", alignItems: "center", justifyContent: "center",
                border: "2px solid rgba(var(--color-primary-rgb), 0.2)",
              }}>
                {photoPreview
                  ? <img src={photoPreview} alt="Avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <span style={{ fontFamily: "var(--font-display)", fontSize: "1.2rem", fontWeight: "700", color: "var(--color-primary)" }}>
                      {((form.names?.[0] || "") + (form.surname?.[0] || "")).toUpperCase() || "?"}
                    </span>
                }
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  style={{ ...btnSecStyle, fontSize: "0.8rem", padding: "0.35rem 0.75rem" }}
                >
                  {photoPreview ? "Change photo" : "Upload photo"}
                </button>
                {photoPreview && (
                  <button
                    type="button"
                    onClick={() => {
                      setPhotoFile(null);
                      if (photoPreview !== existingPhotoUrl) URL.revokeObjectURL(photoPreview);
                      setPhotoPreview(null);
                      if (photoInputRef.current) photoInputRef.current.value = "";
                    }}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", fontSize: "0.8rem", textAlign: "left", padding: 0 }}
                  >
                    Remove photo
                  </button>
                )}
                <span style={{ fontSize: "0.72rem", color: "#9ca3af" }}>JPEG, PNG or WebP · max 5 MB</span>
              </div>
            </div>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp"
              style={{ display: "none" }}
              onChange={e => {
                const f = e.target.files?.[0];
                if (!f) return;
                setPhotoFile(f);
                setPhotoPreview(URL.createObjectURL(f));
              }}
            />
            {photoUploadError && (
              <p style={{ fontSize: "0.75rem", color: "#ef4444", marginTop: "0.35rem" }}>{photoUploadError}</p>
            )}
          </ModalField>

          <ModalField label="Surname *">
            <input value={form.surname} onChange={e => updateField("surname", e.target.value.toUpperCase())} style={inputStyle} placeholder="e.g. SMITH" />
          </ModalField>
          <ModalField label="First Names *">
            <input value={form.names} onChange={e => updateField("names", e.target.value)} style={inputStyle} placeholder="e.g. John Mary" />
          </ModalField>

          {/* ── Split address fields ── */}
          <ModalField label="Street">
            <select
              value={form.street}
              onChange={e => updateField("street", e.target.value)}
              style={{ ...inputStyle, width: "100%", marginBottom: "0.5rem" }}
            >
              {STREETS.map(s => <option key={s} value={s}>{s}</option>)}
              <option value="__other__">Other / Unknown</option>
            </select>
            {form.street === "__other__" && (
              <input
                value={form.customStreet}
                onChange={e => updateField("customStreet", e.target.value)}
                style={{ ...inputStyle, width: "100%" }}
                placeholder="Enter street name"
              />
            )}
          </ModalField>
          <ModalField label="House Number">
            <input
              value={form.houseNumber}
              onChange={e => updateField("houseNumber", e.target.value)}
              style={{ ...inputStyle, width: "120px" }}
              placeholder="e.g. 12"
              type="number"
              min="1"
            />
          </ModalField>

          <ModalField label="Phone Numbers">
            {form.phones.map((phone, i) => (
              <div key={i} style={{ display: "flex", gap: "0.4rem", marginBottom: "0.3rem" }}>
                <input value={phone} onChange={e => updateArr("phones", i, e.target.value)} style={{ ...inputStyle, flex: 1 }} placeholder="Phone number" />
                {form.phones.length > 1 && <button type="button" onClick={() => removeArr("phones", i)} style={iconBtnStyle}><IconMinus /></button>}
              </div>
            ))}
            <button type="button" onClick={() => addArr("phones")} style={addMoreBtnStyle}><IconPlus /> Add Phone</button>
          </ModalField>
          <ModalField label="Email Addresses">
            {form.emails.map((email, i) => (
              <div key={i} style={{ display: "flex", gap: "0.4rem", marginBottom: "0.3rem" }}>
                <input value={email} onChange={e => updateArr("emails", i, e.target.value)} style={{ ...inputStyle, flex: 1 }} placeholder="email@example.com" type="email" />
                {form.emails.length > 1 && <button type="button" onClick={() => removeArr("emails", i)} style={iconBtnStyle}><IconMinus /></button>}
              </div>
            ))}
            <button type="button" onClick={() => addArr("emails")} style={addMoreBtnStyle}><IconPlus /> Add Email</button>
          </ModalField>
          <ModalField label="Tags / Roles">
            <div style={{ display: "flex", gap: "0.4rem" }}>
              <input value={newTag} onChange={e => setNewTag(e.target.value)}
                onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addTag())}
                style={{ ...inputStyle, flex: 1 }} placeholder="e.g. Social Committee" />
              <button type="button" onClick={addTag} style={addMoreBtnStyle}><IconPlus /> Add</button>
            </div>
            {form.tags.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem", marginTop: "0.5rem", marginBottom: "0.5rem" }}>
                {form.tags.map((tag, i) => (
                  <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", background: "rgba(var(--color-primary-rgb),0.08)", color: "var(--color-primary)", padding: "0.2rem 0.5rem", borderRadius: "12px", fontSize: "0.8rem" }}>
                    {tag}
                    <button onClick={() => removeTag(tag)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", padding: 0, display: "flex" }}><IconX /></button>
                  </span>
                ))}
              </div>
            )}
          </ModalField>

          {/* ── Directory Visibility (admin only) ── */}
          {isAdmin && (
            <ModalField label="Directory Visibility">
              <label style={{ display: "flex", alignItems: "center", gap: "0.75rem", cursor: "pointer", padding: "0.5rem 0.75rem", borderRadius: "6px", background: form.directory_visible ? "#f0fdf4" : "#fef2f2", border: `1px solid ${form.directory_visible ? "#86efac" : "#fca5a5"}` }}>
                <input
                  type="checkbox"
                  checked={form.directory_visible}
                  onChange={e => updateField("directory_visible", e.target.checked)}
                  style={{ width: "16px", height: "16px", accentColor: "var(--color-primary)", cursor: "pointer", flexShrink: 0 }}
                />
                <div>
                  <div style={{ fontSize: "0.875rem", fontWeight: "600", color: "#374151" }}>
                    {form.directory_visible ? "Visible in directory" : "Hidden from directory"}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "#9ca3af" }}>
                    {form.directory_visible ? "Resident appears on the directory page" : "Resident is not shown to other residents"}
                  </div>
                </div>
              </label>
            </ModalField>
          )}

          {/* ── Notification Preferences (own record only) ── */}
          {isOwnRecord && (
            <ModalField label="Email Notifications">
              <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                {[
                  { key: "notify_calendar", label: "Social Calendar", desc: "New events and updates" },
                  { key: "notify_blog",     label: "Community Blog",  desc: "New posts and comments" },
                ].map(({ key, label, desc }) => (
                  <label key={key} style={{ display: "flex", alignItems: "center", gap: "0.75rem", cursor: "pointer", padding: "0.5rem 0.75rem", borderRadius: "6px", background: "#f9fafb", border: "1px solid #e5e7eb" }}>
                    <input
                      type="checkbox"
                      checked={form[key]}
                      onChange={e => updateField(key, e.target.checked)}
                      style={{ width: "16px", height: "16px", accentColor: "var(--color-primary)", cursor: "pointer", flexShrink: 0 }}
                    />
                    <div>
                      <div style={{ fontSize: "0.875rem", fontWeight: "600", color: "#374151" }}>{label}</div>
                      <div style={{ fontSize: "0.75rem", color: "#9ca3af" }}>{desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </ModalField>
          )}
        </div>

        {/* Fixed footer — always visible */}
        <div style={{ display: "flex", gap: "0.5rem", padding: "1rem 2rem 1.5rem", flexShrink: 0, borderTop: "1px solid #f0f0f0" }}>
          <button onClick={handleSubmit} disabled={isSaving || photoUploading} style={{ ...btnPrimaryStyle, flex: 1 }}>
            {photoUploading ? "Uploading photo…" : isSaving ? "Saving…" : "Save"}
          </button>
          <button onClick={onClose} style={{ ...btnSecStyle, flex: 1 }}>Cancel</button>
        </div>

      </div>
    </div>
  );
}

function ModalField({ label, children }) {
  return (
    <div style={{ marginBottom: "1rem" }}>
      <label style={{ display: "block", fontSize: "0.8rem", fontWeight: "600", color: "#374151", marginBottom: "0.35rem", fontFamily: "var(--font-body)" }}>{label}</label>
      {children}
    </div>
  );
}

// ─── Add Resident Modal (directory + optional invite) ─────────────────────────
async function callEdgeFunction(payload) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("No active session");
  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}` },
      body: JSON.stringify(payload),
    }
  );
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Something went wrong");
  return result;
}

function AddResidentModal({ onSaved, onClose }) {
  const [form, setForm] = useState({
    surname: "", names: "",
    houseNumber: "", street: STREETS[0], customStreet: "",
    phones: [""], emails: [""],
    tags: [], directory_visible: true, sendInvite: true,
  });
  const [newTag, setNewTag]   = useState("");
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState(null);
  const [success, setSuccess] = useState(null);

  const upd    = (f, v) => setForm(p => ({ ...p, [f]: v }));
  const updArr = (f, i, v) => { const a = [...form[f]]; a[i] = v; setForm(p => ({ ...p, [f]: a })); };
  const addArr = (f) => setForm(p => ({ ...p, [f]: [...p[f], ""] }));
  const remArr = (f, i) => { const a = form[f].filter((_, idx) => idx !== i); setForm(p => ({ ...p, [f]: a.length ? a : [""] })); };
  const addTag = () => { if (newTag.trim() && !form.tags.includes(newTag.trim())) { setForm(p => ({ ...p, tags: [...p.tags, newTag.trim()] })); setNewTag(""); } };
  const remTag = (t) => setForm(p => ({ ...p, tags: p.tags.filter(x => x !== t) }));

  const handleSubmit = async () => {
    if (!form.surname.trim()) { setError("Surname is required"); return; }
    if (!form.names.trim())   { setError("First name(s) are required"); return; }
    const emails = form.emails.filter(e => e.trim());
    if (form.sendInvite && !emails.length) { setError("Email is required to send an invitation"); return; }

    const streetName = form.street === "__other__" ? form.customStreet.trim() : form.street;
    const address = form.houseNumber.trim() && streetName
      ? `${form.houseNumber.trim()} ${streetName}`
      : streetName || form.houseNumber.trim() || "";

    setSaving(true); setError(null); setSuccess(null);
    try {
      const { error: insertError } = await supabase.from("profiles").insert([{
        surname: form.surname.toUpperCase().trim(),
        names: form.names.trim(),
        address,
        phones: form.phones.filter(p => p.trim()),
        emails,
        tags: form.tags,
        directory_visible: form.directory_visible,
        is_active: true,
        is_admin: false,
      }]);
      if (insertError) throw insertError;

      if (form.sendInvite && emails[0]) {
        try {
          await callEdgeFunction({ mode: "invite", email: emails[0] });
          setSuccess(`${form.names} ${form.surname} added — invitation sent to ${emails[0]}`);
        } catch (inviteErr) {
          setSuccess(`${form.names} ${form.surname} added to directory`);
          setError(`Invite failed: ${inviteErr.message} — use Invite in the admin panel to retry`);
        }
      } else {
        setSuccess(`${form.names} ${form.surname} added to directory`);
      }
      onSaved();
    } catch (e) {
      setError(e.message);
    }
    setSaving(false);
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1.5rem 2rem 1rem", flexShrink: 0 }}>
          <h3 style={{ fontFamily: "var(--font-display)", color: "var(--color-primary)", fontSize: "1.3rem", margin: 0 }}>➕ Add Resident</h3>
          <button onClick={onClose} style={iconBtnStyle}><IconX /></button>
        </div>

        {/* Feedback banners */}
        {error && (
          <div style={{ margin: "0 2rem 0.75rem", padding: "0.6rem 0.85rem", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "6px", fontSize: "0.85rem", color: "#dc2626" }}>
            ❌ {error}
          </div>
        )}
        {success && (
          <div style={{ margin: "0 2rem 0.75rem", padding: "0.6rem 0.85rem", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: "6px", fontSize: "0.85rem", color: "#16a34a" }}>
            ✅ {success}
          </div>
        )}

        {/* Scrollable fields */}
        <div style={{ overflowY: "auto", padding: "0 2rem", flex: 1 }}>
          <ModalField label="Surname *">
            <input value={form.surname} onChange={e => upd("surname", e.target.value.toUpperCase())} style={inputStyle} placeholder="e.g. SMITH" />
          </ModalField>
          <ModalField label="First Names *">
            <input value={form.names} onChange={e => upd("names", e.target.value)} style={inputStyle} placeholder="e.g. John Mary" />
          </ModalField>
          <ModalField label="Street">
            <select value={form.street} onChange={e => upd("street", e.target.value)} style={{ ...inputStyle, width: "100%", marginBottom: "0.5rem" }}>
              {STREETS.map(s => <option key={s} value={s}>{s}</option>)}
              <option value="__other__">Other / Unknown</option>
            </select>
            {form.street === "__other__" && (
              <input value={form.customStreet} onChange={e => upd("customStreet", e.target.value)} style={{ ...inputStyle, width: "100%" }} placeholder="Enter street name" />
            )}
          </ModalField>
          <ModalField label="House Number">
            <input value={form.houseNumber} onChange={e => upd("houseNumber", e.target.value)} style={{ ...inputStyle, width: "120px" }} placeholder="e.g. 12" type="number" min="1" />
          </ModalField>
          <ModalField label="Phone Numbers">
            {form.phones.map((phone, i) => (
              <div key={i} style={{ display: "flex", gap: "0.4rem", marginBottom: "0.3rem" }}>
                <input value={phone} onChange={e => updArr("phones", i, e.target.value)} style={{ ...inputStyle, flex: 1 }} placeholder="Phone number" />
                {form.phones.length > 1 && <button type="button" onClick={() => remArr("phones", i)} style={iconBtnStyle}><IconMinus /></button>}
              </div>
            ))}
            <button type="button" onClick={() => addArr("phones")} style={addMoreBtnStyle}><IconPlus /> Add Phone</button>
          </ModalField>
          <ModalField label="Email Addresses">
            {form.emails.map((email, i) => (
              <div key={i} style={{ display: "flex", gap: "0.4rem", marginBottom: "0.3rem" }}>
                <input value={email} onChange={e => updArr("emails", i, e.target.value)} style={{ ...inputStyle, flex: 1 }} placeholder="email@example.com" type="email" />
                {form.emails.length > 1 && <button type="button" onClick={() => remArr("emails", i)} style={iconBtnStyle}><IconMinus /></button>}
              </div>
            ))}
            <button type="button" onClick={() => addArr("emails")} style={addMoreBtnStyle}><IconPlus /> Add Email</button>
          </ModalField>
          <ModalField label="Tags / Roles">
            <div style={{ display: "flex", gap: "0.4rem" }}>
              <input value={newTag} onChange={e => setNewTag(e.target.value)}
                onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addTag())}
                style={{ ...inputStyle, flex: 1 }} placeholder="e.g. Social Committee" />
              <button type="button" onClick={addTag} style={addMoreBtnStyle}><IconPlus /> Add</button>
            </div>
            {form.tags.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem", marginTop: "0.5rem" }}>
                {form.tags.map((tag, i) => (
                  <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", background: "rgba(var(--color-primary-rgb),0.08)", color: "var(--color-primary)", padding: "0.2rem 0.5rem", borderRadius: "12px", fontSize: "0.8rem" }}>
                    {tag}
                    <button onClick={() => remTag(tag)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", padding: 0, display: "flex" }}><IconX /></button>
                  </span>
                ))}
              </div>
            )}
          </ModalField>
          <ModalField label="Directory Visibility">
            <label style={{ display: "flex", alignItems: "center", gap: "0.75rem", cursor: "pointer", padding: "0.5rem 0.75rem", borderRadius: "6px", background: form.directory_visible ? "#f0fdf4" : "#fef2f2", border: `1px solid ${form.directory_visible ? "#86efac" : "#fca5a5"}` }}>
              <input type="checkbox" checked={form.directory_visible} onChange={e => upd("directory_visible", e.target.checked)} style={{ width: "16px", height: "16px", accentColor: "var(--color-primary)", cursor: "pointer", flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: "0.875rem", fontWeight: "600", color: "#374151" }}>{form.directory_visible ? "Visible in directory" : "Hidden from directory"}</div>
                <div style={{ fontSize: "0.75rem", color: "#9ca3af" }}>{form.directory_visible ? "Resident appears on the directory page" : "Resident is not shown to other residents"}</div>
              </div>
            </label>
          </ModalField>

          {/* Send invite toggle — separated with a divider */}
          <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: "1rem", marginBottom: "1rem" }}>
            <label style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem", cursor: "pointer", padding: "0.75rem", borderRadius: "6px", background: form.sendInvite ? "rgba(30,73,118,0.04)" : "#f9fafb", border: `1px solid ${form.sendInvite ? "rgba(30,73,118,0.2)" : "#e5e7eb"}` }}>
              <input type="checkbox" checked={form.sendInvite} onChange={e => upd("sendInvite", e.target.checked)} style={{ width: "16px", height: "16px", accentColor: "var(--color-primary)", cursor: "pointer", flexShrink: 0, marginTop: "2px" }} />
              <div>
                <div style={{ fontSize: "0.875rem", fontWeight: "600", color: "#374151" }}>Send invitation email</div>
                <div style={{ fontSize: "0.75rem", color: "#9ca3af", marginTop: "0.15rem" }}>Resident will receive a link to set their password</div>
              </div>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: "flex", gap: "0.5rem", padding: "1rem 2rem 1.5rem", flexShrink: 0, borderTop: "1px solid #f0f0f0" }}>
          <button onClick={handleSubmit} disabled={saving} style={{ ...btnPrimaryStyle, flex: 1 }}>
            {saving ? "Saving…" : form.sendInvite ? "Add & Send Invite" : "Add to Directory"}
          </button>
          <button onClick={onClose} style={{ ...btnSecStyle, flex: 1 }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── Print View ───────────────────────────────────────────────────────────────
function openPrintWindow(data) {
  const sorted = [...data].sort((a, b) => (a.surname || "").localeCompare(b.surname || ""));
  const date = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  const rows = sorted.map((e, i) => `
    <tr style="background:${i % 2 === 0 ? "white" : "#f5f7fa"}">
      <td style="padding:5pt 8pt;font-weight:600;border-bottom:0.5pt solid #ddd">${e.surname || ""}</td>
      <td style="padding:5pt 8pt;color:#555;border-bottom:0.5pt solid #ddd">${e.names || ""}</td>
      <td style="padding:5pt 8pt;border-bottom:0.5pt solid #ddd">${e.address || ""}</td>
      <td style="padding:5pt 8pt;border-bottom:0.5pt solid #ddd">${(e.phones || []).join(", ")}</td>
      <td style="padding:5pt 8pt;border-bottom:0.5pt solid #ddd">${(e.emails || []).join(", ")}</td>
    </tr>`).join("");

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>Vintage at Hamilton — Community Directory</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 9pt; color: #333; }
    @page { margin: 0.5in; size: landscape; }
    .header { text-align: center; margin-bottom: 16pt; padding-bottom: 8pt; border-bottom: 2pt solid #1e4976; }
    h1 { font-family: Georgia, serif; font-size: 16pt; color: #1e4976; }
    .subtitle { font-size: 8pt; color: #666; margin-top: 4pt; }
    table { width: 100%; border-collapse: collapse; font-size: 9pt; }
    th { background: #1e4976; color: white; padding: 6pt 8pt; text-align: left; }
    td { padding: 5pt 8pt; border-bottom: 0.5pt solid #ddd; }
    tr:nth-child(even) { background: #f5f7fa; }
    .no-print { margin-bottom: 12pt; text-align: right; }
    .no-print button { 
      padding: 6pt 16pt; background: #1e4976; color: white; 
      border: none; border-radius: 4pt; cursor: pointer; font-size: 10pt;
      margin-left: 8pt;
    }
    .no-print button.secondary {
      background: white; color: #333; border: 1pt solid #ccc;
    }
    @media print { .no-print { display: none; } }
  </style>
</head>
<body>
  <div class="no-print">
    <button class="secondary" onclick="window.close()">← Close</button>
    <button onclick="window.print()">🖨 Print</button>
  </div>
  <div class="header">
    <h1>Vintage at Hamilton — Community Directory</h1>
    <p class="subtitle">${sorted.length} Households · Printed ${date} · Confidential — For Resident Use Only</p>
  </div>
  <table>
    <thead>
      <tr>
        <th>Surname</th>
        <th>Names</th>
        <th>Address</th>
        <th>Phone(s)</th>
        <th>Email(s)</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;

  const win = window.open("", "_blank", "width=1000,height=700");
  win.document.write(html);
  win.document.close();
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ResidentDirectory({ user, isAdmin, isDirectoryAdmin }) {
  const canAdminister = isAdmin || isDirectoryAdmin;

  const [residents, setResidents]           = useState([]);
  const [loading, setLoading]               = useState(true);
  const [search, setSearch]                 = useState("");
  const [searchField, setSearchField]       = useState("all");
  const [tagFilter, setTagFilter]           = useState("");
  const [editingEntry, setEditingEntry]     = useState(null);
  const [showAddModal, setShowAddModal]     = useState(false);
  const [toast, setToast]                   = useState(null);
  const [isSaving, setIsSaving]             = useState(false);
  const [selectMode, setSelectMode]         = useState(false);
  const [selectedIds, setSelectedIds]       = useState(new Set());
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [streetFilter, setStreetFilter]     = useState(""); // "" = normal grid view
  const [showHidden, setShowHidden]         = useState(false);

  useEffect(() => { fetchResidents(showHidden); }, [showHidden]);

  async function fetchResidents(includeHidden = false) {
    setLoading(true);
    let query = supabase
      .from("profiles")
      .select("resident_id, id, surname, names, address, phones, emails, tags, directory_visible, notify_calendar, notify_blog, photo_url")
      .not("surname", "is", null)
      .order("surname");
    if (!includeHidden) query = query.eq("directory_visible", true);
    const { data, error } = await query;
    if (error) { showToast("Error loading directory"); console.error(error); }
    else setResidents(data || []);
    setLoading(false);
  }

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const allTags = useMemo(() => {
    const tags = new Set();
    residents.forEach(r => r.tags?.forEach(t => tags.add(t)));
    return Array.from(tags).sort();
  }, [residents]);

  const filteredResidents = useMemo(() => {
    let result = residents;
    if (tagFilter) result = result.filter(r => r.tags?.includes(tagFilter));
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(r => {
        if (searchField === "name"    || searchField === "all") { if ((r.surname + " " + r.names).toLowerCase().includes(q)) return true; }
        if (searchField === "address" || searchField === "all") { if (r.address?.toLowerCase().includes(q)) return true; }
        if (searchField === "tag"     || searchField === "all") { if (r.tags?.some(t => t.toLowerCase().includes(q))) return true; }
        return false;
      });
    }
    return result;
  }, [residents, search, searchField, tagFilter]);

  function canEdit(entry) {
    if (canAdminister) return true;
    return entry.emails?.some(em => em.toLowerCase() === user?.email?.toLowerCase());
  }

  async function handleSave(entry) {
    setIsSaving(true);
    const { resident_id, id, _isOwnRecord, ...fields } = entry;
    let error;
    if (resident_id) {
      // Clean up old avatar if photo changed or removed
      const existing = residents.find(r => r.resident_id === resident_id);
      if (existing?.photo_url && existing.photo_url !== fields.photo_url) {
        deleteStoragePhoto(existing.photo_url, 'avatars');
      }
      ({ error } = await supabase.from("profiles").update(fields).eq("resident_id", resident_id));
    } else {
      ({ error } = await supabase.from("profiles").insert([{ ...fields }]));
    }
    if (error) { showToast("Error saving entry"); console.error(error); }
    else { showToast(resident_id ? "Entry updated" : "Resident added"); await fetchResidents(showHidden); }
    setEditingEntry(null);
    setShowAddModal(false);
    setIsSaving(false);
  }

  async function handleDelete(residentId) {
    if (!confirm("Remove this resident from the directory?")) return;
    const { error } = await supabase.from("profiles").update({ directory_visible: false }).eq("resident_id", residentId);
    if (error) { showToast("Error removing entry"); }
    else { showToast("Resident removed"); await fetchResidents(showHidden); }
  }

  const toggleSelect     = (rid) => setSelectedIds(prev => { const s = new Set(prev); s.has(rid) ? s.delete(rid) : s.add(rid); return s; });
  const selectAll        = ()    => setSelectedIds(new Set(filteredResidents.map(r => r.resident_id)));
  const selectNone       = ()    => setSelectedIds(new Set());
  const toggleSelectMode = ()    => { setSelectMode(s => !s); setSelectedIds(new Set()); };

  const handleEmailSelected = () => {
    const emails = residents.filter(r => selectedIds.has(r.resident_id)).flatMap(r => r.emails || []).filter(Boolean);
    if (!emails.length) { showToast("No emails for selected residents"); return; }
    window.location.href = "mailto:" + [...new Set(emails)].join(",");
  };

  const handleCopyEmails = () => {
    const emails = [...new Set(residents.filter(r => selectedIds.has(r.resident_id)).flatMap(r => r.emails || []))];
    if (!emails.length) { showToast("No emails to copy"); return; }
    navigator.clipboard.writeText(emails.join("\n")).then(() => showToast(`Copied ${emails.length} email${emails.length !== 1 ? "s" : ""}`));
  };

  const handleCopyPhones = () => {
    const phones = [...new Set(residents.filter(r => selectedIds.has(r.resident_id)).flatMap(r => r.phones || []))];
    if (!phones.length) { showToast("No phones to copy"); return; }
    navigator.clipboard.writeText(phones.join("\n")).then(() => showToast(`Copied ${phones.length} phone number${phones.length !== 1 ? "s" : ""}`));
  };

  const handlePrint = (mode) => {
    setShowPrintModal(false);
    openPrintWindow(mode === "all" ? residents : filteredResidents);
  };

  return (
    <div style={{ fontFamily: "var(--font-body)" }}>
      <style>{`
        @keyframes slideUp { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        :root {
          --color-primary: #1e4976;
          --color-primary-dark: #163758;
          --color-primary-rgb: 30, 73, 118;
          --color-gold: #c9a94e;
        }
        @media print { .no-print { display: none !important; } }
      `}</style>

      {/* ── Header ── */}
      <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "0.75rem" }}>
        <div>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.6rem", color: "var(--color-primary-dark)", margin: 0 }}>Resident Directory</h2>
          <p style={{ fontSize: "0.85rem", color: "#6b7280", margin: "0.25rem 0 0" }}>{residents.length} households · {new Date().getFullYear()}</p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {canAdminister && (
            <button onClick={() => setShowAddModal(true)} style={btnPrimaryStyle}><IconPlus /> Add Resident</button>
          )}
          {canAdminister && (
            <button
              onClick={() => setShowHidden(s => !s)}
              style={showHidden ? { ...btnPrimaryStyle, background: "#dc2626" } : btnSecStyle}
            >
              {showHidden ? "👁 Hiding Hidden" : "👁 Show Hidden"}
            </button>
          )}
          <button onClick={() => setShowPrintModal(true)} style={btnSecStyle}><IconPrint /> Print</button>
          <button onClick={toggleSelectMode} style={selectMode ? btnPrimaryStyle : btnSecStyle}>
            <IconSelect /> {selectMode ? "Exit Select" : "Select"}
          </button>
        </div>
      </div>

      {/* ── Street Filter Bar ── */}
      <div className="no-print" style={{
        background: "white", borderRadius: "10px", padding: "0.875rem 1.25rem",
        marginBottom: "1rem", boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
        display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap",
      }}>
        <span style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem", fontWeight: "600", color: "#374151", whiteSpace: "nowrap" }}>
          <IconMap /> Browse by street:
        </span>
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
          {STREETS.map(s => {
            const count = residents.filter(r => parseAddress(r.address).street === s).length;
            const isActive = streetFilter === s;
            return (
              <button
                key={s}
                onClick={() => setStreetFilter(isActive ? "" : s)}
                style={{
                  padding: "0.35rem 0.85rem",
                  borderRadius: "20px",
                  fontSize: "0.8rem",
                  fontWeight: "600",
                  cursor: "pointer",
                  border: `1.5px solid ${isActive ? "var(--color-primary)" : "#e5e7eb"}`,
                  background: isActive ? "var(--color-primary)" : "white",
                  color: isActive ? "white" : "#374151",
                  transition: "all 0.15s",
                  display: "flex", alignItems: "center", gap: "0.35rem",
                }}
              >
                {s}
                <span style={{
                  fontSize: "0.7rem", fontWeight: "700",
                  background: isActive ? "rgba(255,255,255,0.2)" : "#f3f4f6",
                  color: isActive ? "white" : "#6b7280",
                  padding: "0.05rem 0.4rem", borderRadius: "10px",
                }}>{count}</span>
              </button>
            );
          })}
        </div>
        {streetFilter && (
          <button
            onClick={() => setStreetFilter("")}
            style={{ fontSize: "0.78rem", color: "#ef4444", background: "none", border: "none", cursor: "pointer", marginLeft: "auto" }}
          >
            ✕ Clear
          </button>
        )}
      </div>

      {/* ── Street List View (replaces grid when a street is selected) ── */}
      {streetFilter ? (
        <StreetListView
          residents={residents}
          street={streetFilter}
          onClose={() => setStreetFilter("")}
        />
      ) : (
        <>
          {/* ── Search Bar ── */}
          <div className="no-print" style={{ background: "white", borderRadius: "10px", padding: "1rem 1.25rem", marginBottom: "1.25rem", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ position: "relative", flex: 1, minWidth: "200px" }}>
              <span style={{ position: "absolute", left: "0.7rem", top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }}><IconSearch /></span>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search residents…" style={{ ...inputStyle, paddingLeft: "2.2rem", width: "100%" }} />
            </div>
            <select value={searchField} onChange={e => setSearchField(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
              <option value="all">All Fields</option>
              <option value="name">Name</option>
              <option value="address">Address</option>
              <option value="tag">Tag / Role</option>
            </select>
            {allTags.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem", alignItems: "center" }}>
                <span style={{ fontSize: "0.75rem", color: "#9ca3af" }}>Tags:</span>
                {allTags.map(tag => (
                  <span key={tag} onClick={() => setTagFilter(tagFilter === tag ? "" : tag)} style={{
                    padding: "0.2rem 0.55rem", borderRadius: "12px", fontSize: "0.75rem", cursor: "pointer",
                    border: `1px solid ${tagFilter === tag ? "var(--color-primary)" : "#e5e7eb"}`,
                    background: tagFilter === tag ? "var(--color-primary)" : "white",
                    color: tagFilter === tag ? "white" : "#374151", transition: "all 0.15s",
                  }}>{tag}</span>
                ))}
                {tagFilter && <span onClick={() => setTagFilter("")} style={{ fontSize: "0.75rem", color: "#ef4444", cursor: "pointer" }}>Clear</span>}
              </div>
            )}
            <span style={{ fontSize: "0.8rem", color: "#9ca3af", marginLeft: "auto", whiteSpace: "nowrap" }}>
              Showing {filteredResidents.length} of {residents.length}
            </span>
          </div>

          {/* ── Select Bar ── */}
          {selectMode && (
            <div className="no-print" style={{ background: "var(--color-primary)", color: "white", borderRadius: "8px", padding: "0.65rem 1rem", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
              <span style={{ fontWeight: "600", fontSize: "0.9rem", marginRight: "auto" }}>{selectedIds.size} selected</span>
              <button onClick={selectAll}          style={selectBarBtnStyle}>Select All</button>
              <button onClick={selectNone}          style={selectBarBtnStyle}>Clear</button>
              <button onClick={handleEmailSelected} disabled={!selectedIds.size} style={selectBarBtnStyle}>✉ Email</button>
              <button onClick={handleCopyEmails}    disabled={!selectedIds.size} style={selectBarBtnStyle}>📋 Copy Emails</button>
              <button onClick={handleCopyPhones}    disabled={!selectedIds.size} style={selectBarBtnStyle}>📞 Copy Phones</button>
              <button onClick={toggleSelectMode}    style={{ ...selectBarBtnStyle, opacity: 0.7 }}>Done</button>
            </div>
          )}

          {/* ── Grid ── */}
          {loading ? (
            <div style={{ textAlign: "center", padding: "3rem", color: "#9ca3af" }}>Loading directory…</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "1rem" }}>
              {filteredResidents.map(entry => (
                <ResidentCard
                  key={entry.resident_id}
                  entry={entry}
                  canEdit={canEdit(entry)}
                  onEdit={() => setEditingEntry({ ...entry, _isOwnRecord: canAdminister || entry.emails?.some(em => em.toLowerCase() === user?.email?.toLowerCase()) })}
                  onDelete={canAdminister ? () => handleDelete(entry.resident_id) : null}
                  selectMode={selectMode}
                  selected={selectedIds.has(entry.resident_id)}
                  onToggleSelect={() => toggleSelect(entry.resident_id)}
                />
              ))}
              {filteredResidents.length === 0 && (
                <div style={{ gridColumn: "1/-1", textAlign: "center", padding: "3rem", color: "#9ca3af" }}>
                  No residents found matching your search.
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Edit Modal ── */}
      {editingEntry && (
        <EntryModal entry={editingEntry} onSave={handleSave} onClose={() => setEditingEntry(null)} title="Edit Resident" isSaving={isSaving} isOwnRecord={!!editingEntry._isOwnRecord} isAdmin={canAdminister} />
      )}

      {/* ── Add Resident Modal ── */}
      {showAddModal && (
        <AddResidentModal
          onSaved={() => { fetchResidents(showHidden); setShowAddModal(false); }}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {/* ── Print Modal ── */}
      {showPrintModal && (
        <div style={overlayStyle} onClick={() => setShowPrintModal(false)}>
          <div style={{ ...modalStyle, maxWidth: "400px", textAlign: "center" }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontFamily: "var(--font-display)", color: "var(--color-primary)", marginBottom: "0.5rem" }}>Print Directory</h3>
            <p style={{ fontSize: "0.875rem", color: "#6b7280", marginBottom: "1.5rem" }}>Choose what to print:</p>
            {[
              { label: "Full Directory", desc: `All ${residents.length} households`, icon: "📋", mode: "all" },
              { label: "Current View",   desc: `${filteredResidents.length} household${filteredResidents.length !== 1 ? "s" : ""} (filtered)`, icon: "🔍", mode: "filtered" },
            ].map(opt => (
              <div key={opt.mode} onClick={() => handlePrint(opt.mode)}
                style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.875rem 1rem", border: "2px solid #e5e7eb", borderRadius: "8px", cursor: "pointer", marginBottom: "0.5rem", textAlign: "left" }}
                onMouseEnter={e => e.currentTarget.style.borderColor = "var(--color-primary)"}
                onMouseLeave={e => e.currentTarget.style.borderColor = "#e5e7eb"}>
                <span style={{ fontSize: "1.4rem" }}>{opt.icon}</span>
                <div>
                  <div style={{ fontWeight: "600", fontSize: "0.9rem" }}>{opt.label}</div>
                  <div style={{ fontSize: "0.78rem", color: "#6b7280" }}>{opt.desc}</div>
                </div>
              </div>
            ))}
            <button onClick={() => setShowPrintModal(false)} style={{ ...btnSecStyle, width: "100%", marginTop: "0.5rem" }}>Cancel</button>
          </div>
        </div>
      )}

      <Toast message={toast} />
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const inputStyle = {
  padding: "0.55rem 0.75rem", border: "1px solid #e5e7eb", borderRadius: "6px",
  fontSize: "0.9rem", outline: "none", fontFamily: "var(--font-body)", background: "white",
};
const btnPrimaryStyle = {
  display: "inline-flex", alignItems: "center", gap: "0.4rem",
  padding: "0.5rem 1rem", background: "var(--color-primary)", color: "white",
  border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "0.875rem", fontWeight: "500",
};
const btnSecStyle = {
  display: "inline-flex", alignItems: "center", gap: "0.4rem",
  padding: "0.5rem 1rem", background: "white", color: "#374151",
  border: "1px solid #e5e7eb", borderRadius: "6px", cursor: "pointer", fontSize: "0.875rem", fontWeight: "500",
};
const btnOutlineStyle = {
  display: "inline-flex", alignItems: "center", gap: "0.35rem",
  padding: "0.3rem 0.65rem", background: "transparent", color: "var(--color-primary)",
  border: "1px solid var(--color-primary)", borderRadius: "5px", cursor: "pointer", fontSize: "0.8rem",
};
const btnDangerStyle = {
  display: "inline-flex", alignItems: "center", gap: "0.35rem",
  padding: "0.3rem 0.65rem", background: "#fef2f2", color: "#dc2626",
  border: "1px solid #fca5a5", borderRadius: "5px", cursor: "pointer", fontSize: "0.8rem",
};
const iconBtnStyle = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  padding: "0.35rem", background: "#f3f4f6", border: "none", borderRadius: "5px",
  cursor: "pointer", color: "#6b7280",
};
const addMoreBtnStyle = {
  display: "inline-flex", alignItems: "center", gap: "0.3rem",
  padding: "0.3rem 0.65rem", background: "transparent", color: "var(--color-primary)",
  border: "1px dashed var(--color-primary)", borderRadius: "5px", cursor: "pointer",
  fontSize: "0.8rem", marginTop: "0.25rem",
};
const selectBarBtnStyle = {
  padding: "0.3rem 0.7rem", background: "rgba(255,255,255,0.15)", color: "white",
  border: "1px solid rgba(255,255,255,0.3)", borderRadius: "5px", cursor: "pointer", fontSize: "0.8rem",
};
const overlayStyle = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
  display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500, padding: "1rem",
};
const modalStyle = {
  background: "white", borderRadius: "12px",
  maxWidth: "540px", width: "100%", maxHeight: "90vh",
  boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
  display: "flex", flexDirection: "column",
};
