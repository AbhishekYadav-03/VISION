import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  IconX,
  IconPlayerPlay,
  IconPlayerPause,
  IconChevronLeft,
  IconChevronRight,
  IconVolume,
  IconVolumeOff,
  IconDownload,
  IconLoader2,
} from "@tabler/icons-react";
import { saveAs } from "file-saver";
import { api, apiErrorMessage } from "@/lib/api";

interface Album {
  id: string;
  name: string;
  music_url: string;
}

interface Photo {
  id: string;
  url: string;
}

const SLIDE_DURATION_MS = 4000;

export default function AlbumView() {
  const { albumId } = useParams();
  const navigate = useNavigate();

  const [album, setAlbum] = useState<Album | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [showAutoplayOverlay, setShowAutoplayOverlay] = useState(true);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const slideshowInterval = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  function stopSlideshow() {
    if (slideshowInterval.current !== null) {
      window.clearInterval(slideshowInterval.current);
      slideshowInterval.current = null;
    }
  }

  function startSlideshow() {
    stopSlideshow();
    if (photos.length <= 1) return;

    slideshowInterval.current = window.setInterval(() => {
      setCurrentIndex((previous) => (previous + 1) % photos.length);
    }, SLIDE_DURATION_MS);
  }

  useEffect(() => {
    if (!albumId) return;

    let cancelled = false;

    const fetchAlbumDetails = async () => {
      try {
        const { data } = await api.get<{ album: Album; photos: Photo[] }>(
          `/api/photo/albums/${albumId}`,
        );
        if (cancelled) return;

        setAlbum(data.album);
        setPhotos(data.photos ?? []);
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        setError(apiErrorMessage(err, "Could not load this album"));
        setStatus("error");
      }
    };

    fetchAlbumDetails();

    return () => {
      cancelled = true;
      stopSlideshow();
      abortControllerRef.current?.abort();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [albumId]);

  useEffect(() => {
    if (isPlaying && status === "ready" && photos.length > 1 && !showAutoplayOverlay) {
      startSlideshow();
    } else {
      stopSlideshow();
    }

    return stopSlideshow;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, photos, status, showAutoplayOverlay]);

  useEffect(() => {
    if (currentIndex >= photos.length) {
      setCurrentIndex(0);
    }
  }, [currentIndex, photos.length]);

  const handleInteraction = () => {
    setShowAutoplayOverlay(false);
    if (audioRef.current) {
      audioRef.current.play().catch(() => {
        // Browsers can still refuse autoplay; the slideshow continues silently.
      });
    }
  };

  const togglePlay = () => {
    setIsPlaying((playing) => {
      const next = !playing;
      if (audioRef.current) {
        if (next) {
          audioRef.current.play().catch(() => undefined);
        } else {
          audioRef.current.pause();
        }
      }
      return next;
    });
  };

  const handlePrev = () => {
    if (!photos.length) return;
    setCurrentIndex((previous) => (previous === 0 ? photos.length - 1 : previous - 1));
    if (isPlaying) startSlideshow();
  };

  const handleNext = () => {
    if (!photos.length) return;
    setCurrentIndex((previous) => (previous === photos.length - 1 ? 0 : previous + 1));
    if (isPlaying) startSlideshow();
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    audioRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleDownloadVideo = async () => {
    setIsDownloading(true);
    setDownloadError("");

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await api.get(`/api/photo/albums/${albumId}/video`, {
        responseType: "blob",
        timeout: 0,
        signal: controller.signal,
      });

      const videoBlob = new Blob([response.data], { type: "video/mp4" });
      saveAs(videoBlob, `${album?.name || "slideshow"}.mp4`);
    } catch (err) {
      if (controller.signal.aborted) return;
      setDownloadError(apiErrorMessage(err, "Could not generate the slideshow video"));
    } finally {
      setIsDownloading(false);
      abortControllerRef.current = null;
    }
  };

  const handleCancelDownload = () => {
    abortControllerRef.current?.abort();
    setIsDownloading(false);
  };

  const closeAlbum = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    navigate("/albums");
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-zinc-400">
        Loading album...
      </div>
    );
  }

  if (status === "error" || !album) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-red-400">{error || "Album not found"}</p>
        <button onClick={() => navigate("/albums")} className="text-sm text-zinc-400 underline">
          Back to albums
        </button>
      </div>
    );
  }

  if (photos.length === 0) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-4 px-6 text-center">
        <h2 className="text-xl font-semibold text-white">{album.name}</h2>
        <p className="text-sm text-zinc-400">This album does not contain any photos yet.</p>
        <button onClick={() => navigate("/albums")} className="text-sm text-zinc-400 underline">
          Back to albums
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center overflow-hidden select-none">
      {album.music_url && (
        <audio ref={audioRef} src={album.music_url} loop preload="auto" />
      )}

      {showAutoplayOverlay && (
        <div
          onClick={handleInteraction}
          className="absolute inset-0 z-50 bg-black/95 flex flex-col items-center justify-center cursor-pointer text-center p-6"
        >
          <div className="w-16 h-16 rounded-full bg-cyan-500/10 flex items-center justify-center border border-cyan-500/20 animate-pulse mb-6">
            <IconPlayerPlay className="h-8 w-8 text-cyan-400" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Welcome to {album.name}</h2>
          <p className="text-sm text-zinc-400 max-w-sm">
            Click anywhere to start the slideshow{album.music_url ? " and play background music" : ""}
          </p>
        </div>
      )}

      <div className="relative w-full h-full flex items-center justify-center">
        {photos.map((photo, index) => (
          <img
            key={photo.id}
            src={photo.url}
            alt=""
            loading={index < 2 ? "eager" : "lazy"}
            decoding="async"
            className={`absolute max-w-full max-h-full object-contain transition-opacity duration-1000 ease-in-out ${
              index === currentIndex ? "opacity-100 z-10" : "opacity-0 z-0"
            }`}
          />
        ))}
        <div className="absolute inset-x-0 top-0 h-24 bg-linear-to-b from-black/80 to-transparent z-20" />
        <div className="absolute inset-x-0 bottom-0 h-28 bg-linear-to-t from-black/80 to-transparent z-20" />
      </div>

      {downloadError && (
        <div
          role="alert"
          className="absolute top-24 left-1/2 -translate-x-1/2 z-40 max-w-md rounded-xl border border-red-500/30 bg-black/80 px-4 py-3 text-center text-xs text-red-400 backdrop-blur"
        >
          {downloadError}
        </div>
      )}

      <div className="absolute top-6 left-6 right-6 flex justify-between items-center z-30">
        <div>
          <h2 className="text-xl font-bold text-white">{album.name}</h2>
          <p className="text-xs text-zinc-400 mt-1">
            {currentIndex + 1} of {photos.length}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {!isDownloading ? (
            <button
              onClick={handleDownloadVideo}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-zinc-900/60 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white transition"
            >
              <IconDownload className="h-5 w-5 text-cyan-400" />
              <span className="text-xs font-medium">Download Video</span>
            </button>
          ) : (
            <>
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-zinc-900/60 border border-zinc-800 text-zinc-300">
                <IconLoader2 className="h-5 w-5 animate-spin text-cyan-400" />
                <span className="text-xs font-medium">Rendering video...</span>
              </div>
              <button
                onClick={handleCancelDownload}
                className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-red-600 hover:bg-red-700 text-white transition"
              >
                <IconX className="h-5 w-5" />
                <span className="text-xs font-medium">Cancel</span>
              </button>
            </>
          )}

          <button
            onClick={closeAlbum}
            aria-label="Close album"
            className="p-3 rounded-full bg-zinc-900/60 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white transition"
          >
            <IconX className="h-6 w-6" />
          </button>
        </div>
      </div>

      <div className="absolute bottom-8 flex items-center gap-6 z-30 px-6 py-3 rounded-full bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-md">
        <button onClick={handlePrev} aria-label="Previous photo" className="text-zinc-400 hover:text-white transition">
          <IconChevronLeft className="h-6 w-6" />
        </button>

        <button
          onClick={togglePlay}
          aria-label={isPlaying ? "Pause slideshow" : "Play slideshow"}
          className="w-12 h-12 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 transition"
        >
          {isPlaying ? (
            <IconPlayerPause className="h-5 w-5 fill-current" />
          ) : (
            <IconPlayerPlay className="h-5 w-5 fill-current ml-0.5" />
          )}
        </button>

        <button onClick={handleNext} aria-label="Next photo" className="text-zinc-400 hover:text-white transition">
          <IconChevronRight className="h-6 w-6" />
        </button>

        <div className="h-6 w-px bg-zinc-800" />

        <button onClick={toggleMute} aria-label={isMuted ? "Unmute" : "Mute"} className="text-zinc-400 hover:text-white transition">
          {isMuted ? <IconVolumeOff className="h-5 w-5" /> : <IconVolume className="h-5 w-5" />}
        </button>
      </div>
    </div>
  );
}
