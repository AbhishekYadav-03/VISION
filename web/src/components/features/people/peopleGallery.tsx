import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { FocusCards } from "@/components/ui/focus-cards";
import { FloatingDock } from "@/components/ui/floating-dock";
import { navigationLinks } from "../../ui/dock-links";
import { api } from "@/lib/api";

type Photo = {
  id: string;
  url: string;
};

type Card = {
  title: string;
  src: string;
};

const PersonGallery = () => {
  const { personId } = useParams();

  const [cards, setCards] = useState<Card[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    if (!personId) return;

    let cancelled = false;

    const fetchPhotos = async () => {
      try {
        const { data } = await api.get<Photo[]>(`/api/segregate/people/${personId}/photos`);
        if (cancelled) return;

        setCards(data.map((photo) => ({ title: "", src: photo.url })));
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    };

    fetchPhotos();
    return () => {
      cancelled = true;
    };
  }, [personId]);

  return (
    <div className="min-h-screen bg-black">
      <div className="py-10">
        {status === "loading" && (
          <p className="py-20 text-center text-sm text-neutral-400">Loading photos...</p>
        )}
        {status === "error" && (
          <p className="py-20 text-center text-sm text-red-400">Could not load this person's photos.</p>
        )}
        {status === "ready" && cards.length === 0 && (
          <div className="py-20 text-center text-sm text-neutral-400">
            <p>No photos found for this person.</p>
            <Link to="/people" className="mt-3 inline-block text-violet-400 hover:underline">
              Back to people
            </Link>
          </div>
        )}
        {status === "ready" && cards.length > 0 && <FocusCards cards={cards} />}
      </div>

      <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-50 flex items-center justify-center h-auto w-auto">
        <FloatingDock items={navigationLinks} />
      </div>
    </div>
  );
};

export default PersonGallery;
