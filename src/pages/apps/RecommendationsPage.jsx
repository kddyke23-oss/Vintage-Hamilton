import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "@/lib/supabase";
import RecommendationsTracker from "../../components/apps/RecommendationsTracker";

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

      // Get resident_id for use in add/react operations
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
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Loading…</p>
        </div>
      </div>
    );
  }

  if (accessLevel === false) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center max-w-sm mx-auto px-6">
          <div className="text-5xl mb-4">🔒</div>
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Access Required</h2>
          <p className="text-gray-500 text-sm mb-6">
            You don't have access to the Residents' Recommendations board yet.
            Please contact your administrator.
          </p>
          <button
            onClick={() => navigate("/")}
            className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition"
          >
            Back to Home
          </button>
        </div>
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
