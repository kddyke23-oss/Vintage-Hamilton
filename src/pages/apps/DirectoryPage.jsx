import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import ResidentDirectory, { ResidentCard, EntryModal } from "@/pages/ResidentDirectory";
import { deleteStoragePhoto } from "@/lib/storage";
import LoadingSpinner from "@/components/LoadingSpinner";

export default function DirectoryPage() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [access, setAccess] = useState(null); // null=loading, false=denied, 'user'|'admin'=granted
  const [isDirectoryAdmin, setIsDirectoryAdmin] = useState(false);
  const [hiddenSelf, setHiddenSelf] = useState(false); // true = access denied because the resident opted out of the directory
  const [optingIn, setOptingIn] = useState(false);
  const [optInError, setOptInError] = useState(null);
  // Hidden residents can still view/correct their OWN entry (nobody else's)
  const [myEntries, setMyEntries] = useState([]);
  const [editingMine, setEditingMine] = useState(null);
  const [savingMine, setSavingMine] = useState(false);
  const [mineMsg, setMineMsg] = useState(null);

  useEffect(() => {
    if (!user) return;
    checkAccess();
  }, [user]);

  async function checkAccess() {
    // Super admins always have full access
    if (isAdmin) {
      setAccess("admin");
      setIsDirectoryAdmin(true);
      return;
    }
    const { data, error } = await supabase
      .from("app_access")
      .select("role")
      .eq("user_id", user.id)
      .eq("app_id", "directory")
      .maybeSingle();

    if (error || !data) {
      // Directory is reciprocal: residents who hide their own details lose
      // access (database trigger). Work out whether that's the reason so we
      // can offer a way back in.
      const { data: me } = await supabase
        .from("profiles")
        .select("directory_visible")
        .eq("id", user.id)
        .maybeSingle();
      const hidden = me?.directory_visible === false;
      setHiddenSelf(hidden);
      if (hidden) await loadMine();
      setAccess(false);
    } else {
      setHiddenSelf(false);
      setAccess(data.role);
      setIsDirectoryAdmin(data.role === "admin");
    }
  }

  async function loadMine() {
    const { data } = await supabase
      .from("profiles")
      .select("resident_id, id, surname, names, address, phones, emails, tags, directory_visible, notify_digest, photo_url")
      .eq("id", user.id);
    setMyEntries(data || []);
  }

  async function saveMine(entry) {
    setSavingMine(true);
    const { resident_id, id, _isOwnRecord, _isSelf, ...fields } = entry;
    const existing = myEntries.find(r => r.resident_id === resident_id);
    if (existing?.photo_url && existing.photo_url !== fields.photo_url) {
      deleteStoragePhoto(existing.photo_url, "avatars");
    }
    const { error } = await supabase.from("profiles").update(fields).eq("resident_id", resident_id);
    if (error) {
      console.error(error);
      setMineMsg("Sorry, your details could not be saved. Please try again.");
    } else {
      setMineMsg(null);
      setEditingMine(null);
      await checkAccess(); // if they ticked "visible", the trigger restores access and the full directory loads
    }
    setSavingMine(false);
  }

  async function optIn() {
    setOptingIn(true);
    setOptInError(null);
    const { error } = await supabase
      .from("profiles")
      .update({ directory_visible: true })
      .eq("id", user.id);
    if (error) {
      console.error(error);
      setOptInError("Sorry, that didn't work. Please try again or contact an administrator.");
      setOptingIn(false);
      return;
    }
    await checkAccess(); // the database trigger restores directory access
    setOptingIn(false);
  }

  if (access === null) {
    return <LoadingSpinner label="Checking access…" />;
  }

  if (access === false && hiddenSelf) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center px-4">
        <div className="text-5xl mb-4">🔒</div>
        <h2 className="font-display text-2xl text-brand-800 mb-2">Directory Access Is Off</h2>
        <p className="text-brand-500 text-sm max-w-md mb-6">
          Your details are currently hidden from other residents. The directory is shared, so
          residents who are not listed cannot view it. If you include your details, you will
          get access to the directory straight away.
        </p>
        {myEntries.length > 0 && (
          <div className="w-full max-w-md text-left mb-6">
            <h3 className="font-display text-brand-800 text-sm mb-2 text-center">Your own details (only you can see this)</h3>
            {myEntries.map(entry => (
              <ResidentCard
                key={entry.resident_id}
                entry={entry}
                canEdit={true}
                onEdit={() => setEditingMine({ ...entry, _isSelf: true, _isOwnRecord: true })}
                onDelete={null}
                onSendInvite={null}
                canAdminister={false}
                selectMode={false}
                selected={false}
                onToggleSelect={() => {}}
              />
            ))}
            {mineMsg && <p className="text-red-600 text-sm mt-2 text-center">{mineMsg}</p>}
          </div>
        )}
        {optInError && <p className="text-red-600 text-sm mb-4">{optInError}</p>}
        <button
          onClick={optIn}
          disabled={optingIn}
          className="px-5 py-2 bg-brand-700 text-white rounded-lg text-sm hover:bg-brand-800 transition mb-3 disabled:opacity-60"
        >
          {optingIn ? "Updating…" : "Include me in the directory"}
        </button>
        <button
          onClick={() => navigate("/")}
          className="px-5 py-2 text-brand-700 text-sm hover:underline"
        >
          ← Back to Dashboard
        </button>
        {editingMine && (
          <EntryModal
            entry={editingMine}
            onSave={saveMine}
            onClose={() => setEditingMine(null)}
            title="Edit My Details"
            isSaving={savingMine}
            isOwnRecord={true}
            isSelf={true}
            isAdmin={false}
          />
        )}
      </div>
    );
  }

  if (access === false) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center px-4">
        <div className="text-5xl mb-4">🔒</div>
        <h2 className="font-display text-2xl text-brand-800 mb-2">Access Required</h2>
        <p className="text-brand-500 text-sm max-w-sm mb-6">
          You don't have access to the Resident Directory. Please contact an administrator.
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
    <ResidentDirectory
      user={user}
      isAdmin={isAdmin}
      isDirectoryAdmin={isDirectoryAdmin}
      onAccessChanged={checkAccess}
    />
  );
}
