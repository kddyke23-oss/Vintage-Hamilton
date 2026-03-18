import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "@/lib/supabase";
import RecommendationsTracker from "../../components/apps/RecommendationsTracker";
import LoadingSpinner from "@/components/LoadingSpinner";

export default function RecommendationsPage() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [accessLevel, setAccessLevel] = useState(null); // null=loading, false=none, 'user'|'admin'
  const [residentId, setResidentId] = useState(null);

  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }

    const checkAccess = async () => {
      // Super admins always have full access — no DB query needed
      if (isAdmin) {
        setAccessLevel("admin");
        const { data: profile } = await supabase
          .from("profiles")
          .select("resident_id")
          .eq("id", user.id)
          .single();
        if (profile) setResidentId(profile.resident_id);
        return;
      }

      const { data, error } = await supabase
        .from("app_access")
        .select("role")
        .eq("user_id", user.id)
        .in("app_id", ["recommendations", "admin"])
        .limit(1)
        .single();

      if (error || !data) {
        setAccessLevel(false);
        return;
      }

      setAccessLevel(data.role === "admin" ? "admin" : "user");

      const { data: profile } = await supabase
        .from("profiles")
        .select("resident_id")
        .eq("id", user.id)
        .single();

      if (profile) setResidentId(profile.resident_id);
    };

    checkAccess();
  }, [user, navigate]);

  if (accessLevel === null) {
    return <LoadingSpinner label="Loading…" />;
  }

  if (accessLevel === false) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center px-4">
        <div className="text-5xl mb-4">🔒</div>
        <h2 className="font-display text-2xl text-brand-800 mb-2">Access Required</h2>
        <p className="text-brand-500 text-sm max-w-sm mb-6">
          You don't have access to the Residents' Recommendations board yet.
          Please contact your administrator.
        </p>
        <button
          onClick={() => navigate("/")}
          className="px-5 py-2 bg-brand-700 text-white rounded-lg text-sm hover:bg-brand-800 transition"
        >
          Back to Home
        </button>
      </div>
    );
  }

  return (
    <RecommendationsTracker
      currentUserId={user.id}
      residentId={residentId}
      isAdmin={accessLevel === "admin"}
    />
  );
}
