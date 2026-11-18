"use client";

import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { api, apiErrorMessage } from "@/lib/api";
import { FileUpload } from "@/components/ui/file-upload";
import { CanvasRevealEffectDemo4 } from "#components/features/backgrounds/background2";

export function FileUploadDemo() {

  const navigate = useNavigate();

  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");

  const handleFileUpload = async (files: File[]) => {

    if (!files.length) return;

    setUploading(true);
    setProgress(0);
    setMessage("Uploading...");

    try {

      for (let index = 0; index < files.length; index += 1) {

        const formData = new FormData();

        formData.append("photo", files[index]);

        await api.post("/api/photo/upload", formData, {
          timeout: 180_000,
          onUploadProgress: (event) => {
            if (!event.total) return;
            const fileShare = Math.round((event.loaded / event.total) * 100);
            const overall = (index * 100 + fileShare) / files.length;
            setProgress(Math.min(100, Math.round(overall)));
          },
        });

      }

      setMessage("Upload successful - faces are now indexed");

      setTimeout(() => {
        navigate("/gallery");
      }, 900);

    } catch (err) {

      setMessage(apiErrorMessage(err, "Upload failed, please try again"));

    } finally {

      setUploading(false);

    }

  };

  return (

    <div className="w-full max-w-4xl mx-auto min-h-96 border border-dashed mt-40 rounded-4xl bg-white dark:bg-black border-neutral-200 dark:border-neutral-800 relative overflow-hidden">

      <div className="absolute inset-0 z-0">
        <CanvasRevealEffectDemo4 hovered={true} />
      </div>

      <div className="relative z-10 flex flex-col items-center justify-center min-h-96">

        <FileUpload onChange={handleFileUpload} />

        <div className="mt-6 h-8">

          {uploading && (

            <p className="text-blue-400 animate-pulse text-lg">

              Uploading {progress > 0 ? `${progress}%` : "..."}

            </p>

          )}

          {!uploading && message && (

            <p
              className={`text-lg font-medium ${
                message.includes("successful")
                  ? "text-green-400"
                  : "text-red-400"
              }`}
            >
              {message}
            </p>

          )}

        </div>

      </div>

    </div>

  );

}
