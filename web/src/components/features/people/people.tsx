import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FloatingDock } from "@/components/ui/floating-dock";
import { navigationLinks } from "../../ui/dock-links";
import { api, apiErrorMessage } from "@/lib/api";

type Person = {
  id: string;
  avatar_url: string | null;
  name?: string | null;
};

const People = () => {
  const navigate = useNavigate();

  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");

  const fetchPeople = useCallback(async () => {
    try {
      const { data } = await api.get<Person[]>("/api/avatars/people");
      setPeople(data);
      setError("");
    } catch (err) {
      setError(apiErrorMessage(err, "Could not load people"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPeople();
  }, [fetchPeople]);

  const saveName = async (personId: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;

    try {
      await api.put(`/api/avatars/people/${personId}`, { name: trimmed });
      setEditingId(null);
      setName("");
      await fetchPeople();
    } catch (err) {
      setError(apiErrorMessage(err, "Could not rename this person"));
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-7xl mx-auto px-8 py-10">
        <h1 className="text-5xl font-bold">People</h1>
        <p className="mt-2 mb-12 text-neutral-400">Automatically grouped using on-device face embeddings</p>

        {error && (
          <p role="alert" className="mb-8 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </p>
        )}

        {loading && <p className="text-sm text-neutral-400">Grouping faces...</p>}

        {!loading && people.length === 0 && (
          <p className="text-sm text-neutral-400">No people yet. Upload photos containing faces to build your people index.</p>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-10">
          {people.map((person) => (
            <div key={person.id} className="flex flex-col items-center">
              {person.avatar_url ? (
                <img
                  src={person.avatar_url}
                  alt={person.name ? `${person.name}'s profile` : "Detected person"}
                  loading="lazy"
                  onClick={() => navigate(`/people/${person.id}`)}
                  className="w-36 h-36 rounded-full object-cover border-4 border-white shadow-xl cursor-pointer transition duration-300 hover:scale-105 hover:border-violet-500"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => navigate(`/people/${person.id}`)}
                  aria-label="Open person gallery"
                  className="w-36 h-36 rounded-full border-4 border-white bg-neutral-900 text-3xl font-semibold shadow-xl transition duration-300 hover:scale-105 hover:border-violet-500"
                >
                  {person.name?.charAt(0)?.toUpperCase() || "?"}
                </button>
              )}

              {editingId === person.id ? (
                <div className="mt-4 w-full space-y-2">
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Person name"
                    aria-label="Person name"
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-violet-500"
                  />
                  <button
                    onClick={() => saveName(person.id)}
                    className="w-full rounded-lg bg-violet-600 py-2 text-sm transition hover:bg-violet-500"
                  >
                    Save
                  </button>
                </div>
              ) : (
                <>
                  <p className="mt-4 font-medium">{person.name || "Unnamed Person"}</p>
                  <button
                    onClick={() => {
                      setEditingId(person.id);
                      setName(person.name || "");
                    }}
                    className="text-sm text-violet-400 hover:text-violet-300"
                  >
                    Edit
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-50">
        <FloatingDock items={navigationLinks} />
      </div>
    </div>
  );
};

export default People;
