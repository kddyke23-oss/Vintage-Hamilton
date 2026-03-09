import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import LottoTracker from "@/components/apps/LottoTracker";

export default function LottoPage() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [access, setAccess] = useState(null); // null=loading, false=denied, 'user'|'admin'=granted
  const [isLottoAdmin, setIsLottoAdmin] = useState(false);

  useEffect(() => {
    if (!user) return;
    checkAccess();
  }, [user]);

  async function checkAccess() {
    // Super admins always have full access
    if (isAdmin) {
      setAccess("admin");
      setIsLottoAdmin(true);
      return;
    }
    const { data, error } = await supabase
      .from("app_access")
      .select("role")
      .eq("user_id", user.id)
      .eq("app_id", "lotto")
      .maybeSingle();

    if (error || !data) {
      setAccess(false);
    } else {
      setAccess(data.role);
      setIsLottoAdmin(data.role === "admin");
    }
  }

  if (access === null) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "50vh" }}>
        <div style={{ width: 36, height: 36, border: "3px solid #e5e7eb", borderTopColor: "#1e4976", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (access === false) {
    return (
      <div style={{ maxWidth: 480, margin: "4rem auto", textAlign: "center", padding: "0 1rem", fontFamily: "'Lato', sans-serif" }}>
        <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🔒</div>
        <h2 style={{ fontFamily: "'Playfair Display', serif", color: "#1e4976", marginBottom: "0.5rem" }}>Access Required</h2>
        <p style={{ color: "#6b7280", marginBottom: "1.5rem" }}>
          You don't have access to the Lotto Syndicate app. Please contact an administrator.
        </p>
        <button
          onClick={() => navigate("/")}
          style={{ padding: "0.6rem 1.5rem", background: "#1e4976", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "0.9rem" }}
        >
          ← Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <LottoTracker
      user={user}
      isAdmin={isAdmin}
      isLottoAdmin={isLottoAdmin}
    />
  );
}
