"use client";

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "@/lib/api";
import { FocusCards } from "@/components/ui/focus-cards";

interface BackendPhoto {
  id: string;
  url: string;
}

interface FocusCard {
  title: string;
  src: string;
}

type Status = "loading" | "ready" | "error";

export function FocusCardsDemo() {
  const [cards, setCards] = useState<FocusCard[]>([]);
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    let cancelled = false;

    const fetchPhotos = async () => {
      try {
        const { data } = await api.get<BackendPhoto[]>("/api/photo/feed");
        if (cancelled) return;

        setCards(
          data.map((photo, index) => ({
            title: `Photo ${index + 1}`,
            src: photo.url,
          })),
        );
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    };

    fetchPhotos();
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === "loading") {
    return <p className="py-24 text-center text-sm text-neutral-400">Loading your photo library...</p>;
  }

  if (status === "error") {
    return <p className="py-24 text-center text-sm text-red-400">Could not load your photos. Please refresh the page.</p>;
  }

  if (cards.length === 0) {
    return (
      <div className="py-24 text-center">
        <p className="text-lg text-neutral-300">Your library is empty.</p>
        <Link to="/upload" className="mt-3 inline-block text-sm font-medium text-violet-400 hover:underline">
          Upload your first photo
        </Link>
      </div>
    );
  }

  return <FocusCards cards={cards} />;
}
