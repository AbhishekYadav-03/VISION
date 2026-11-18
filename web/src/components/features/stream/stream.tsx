import { useEffect, useRef, useState } from "react";
import { api, apiErrorMessage } from "@/lib/api";

type RecognizedPerson = {
  id: string;
  name: string | null;
  avatar_url: string | null;
  confidence?: number;
  distance?: number;
};

type RecognizedFace = {
  bbox: [number, number, number, number];
  person: RecognizedPerson | null;
};

const SAMPLE_INTERVAL_MS = 750;

const Stream = () => {
  const webcamVideo = useRef<HTMLVideoElement>(null);
  const overlayCanvas = useRef<HTMLCanvasElement>(null);
  const captureCanvas = useRef<HTMLCanvasElement>(null);
  const intervalRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const [streaming, setStreaming] = useState(false);
  const [status, setStatus] = useState("Camera is off");

  const drawFaces = (faces: RecognizedFace[]) => {
    const canvas = overlayCanvas.current;
    const video = webcamVideo.current;
    if (!canvas || !video) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext("2d");
    if (!context) return;

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "#8b5cf6";
    context.lineWidth = 4;
    context.fillStyle = "#8b5cf6";
    context.font = "22px Arial";

    for (const face of faces) {
      const [x1, y1, x2, y2] = face.bbox;

      context.strokeRect(x1, y1, x2 - x1, y2 - y1);
      context.fillText(face.person?.name || "Unknown", x1, Math.max(20, y1 - 10));
    }

    setStatus(
      faces.length
        ? `${faces.length} face${faces.length === 1 ? "" : "s"} detected`
        : "No faces in frame",
    );
  };

  const captureFrame = async () => {
    const video = webcamVideo.current;
    const canvas = captureCanvas.current;

    if (!video || !canvas || video.videoWidth === 0 || inFlightRef.current) return;

    inFlightRef.current = true;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext("2d");
    if (!context) {
      inFlightRef.current = false;
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          inFlightRef.current = false;
          return;
        }

        const formData = new FormData();
        formData.append("photo", blob, "frame.jpg");

        try {
          const { data } = await api.post<{ faces: RecognizedFace[] }>(
            "/api/recognize",
            formData,
            { timeout: 30_000 },
          );
          drawFaces(data.faces ?? []);
        } catch (err) {
          setStatus(apiErrorMessage(err, "Recognition paused"));
        } finally {
          inFlightRef.current = false;
        }
      },
      "image/jpeg",
      0.8,
    );
  };

  const stopCamera = () => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;

    if (webcamVideo.current) {
      webcamVideo.current.srcObject = null;
    }

    const canvas = overlayCanvas.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);

    setStreaming(false);
    setStatus("Camera is off");
  };

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: "user" },
      });

      if (!webcamVideo.current) return;

      mediaStreamRef.current = mediaStream;
      webcamVideo.current.srcObject = mediaStream;
      webcamVideo.current.onloadedmetadata = () => {
        webcamVideo.current?.play();
        setStreaming(true);
        setStatus("Looking for faces...");

        if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
        intervalRef.current = window.setInterval(captureFrame, SAMPLE_INTERVAL_MS);
      };
    } catch (err) {
      setStatus(apiErrorMessage(err, "Camera permission was denied or no camera was found"));
    }
  };

  useEffect(() => {
    return () => {
      if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-6">
      <div className="w-full max-w-5xl rounded-3xl border border-neutral-800 bg-neutral-950 p-8 shadow-2xl">
        <h1 className="text-4xl font-bold text-white mb-2">Live Recognition</h1>
        <p className="mb-6 text-sm text-neutral-400">
          Frames are sampled every {SAMPLE_INTERVAL_MS} ms and matched against your people index. Nothing is stored.
        </p>

        <div className="relative overflow-hidden rounded-2xl border border-neutral-800">
          <video ref={webcamVideo} autoPlay muted playsInline className="w-full aspect-video object-cover" />
          <canvas ref={overlayCanvas} className="absolute inset-0 w-full h-full pointer-events-none" />
        </div>

        <canvas ref={captureCanvas} className="hidden" />

        <div className="flex flex-col items-center gap-4 mt-8">
          <button
            onClick={streaming ? stopCamera : startCamera}
            className="rounded-xl bg-white px-6 py-3 font-semibold text-black hover:bg-neutral-200 transition"
          >
            {streaming ? "Stop Camera" : "Start Camera"}
          </button>
          <p className="text-xs text-neutral-400">{status}</p>
        </div>
      </div>
    </div>
  );
};

export default Stream;
