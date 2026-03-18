import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import LottoTracker from "@/components/apps/LottoTracker";
import LoadingSpinner from "@/components/LoadingSpinner";

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
    return <LoadingSpinner label="Checking access…" />;
  }

  if (access === false) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center px-4">
        <div className="text-5xl mb-4">🔒</div>
        <h2 className="font-display text-2xl text-brand-800 mb-2">Access Required</h2>
        <p className="text-brand-500 text-sm max-w-sm mb-6">
          You don't have access to the Lotto Syndicate app. Please contact an administrator.
        </p>
        <button
          onClick={() => navigate("/")}
          className="px-5 py-2 bg-brand-700 text-white rounded-lg text-sm hover:bg-brand-800 transition"
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
