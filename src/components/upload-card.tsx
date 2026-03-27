"use client";

import Image from "next/image";
import { ChangeEvent, DragEvent, useMemo, useState } from "react";

type RequestState = "idle" | "uploading" | "success" | "error";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 10 * 1024 * 1024;

function formatFileSize(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Failed to read the selected image."));
    reader.readAsDataURL(file);
  });
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Failed to render the processed image preview."));
    reader.readAsDataURL(blob);
  });
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-6 w-6">
      <path d="M12 15.5V5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="m7.5 9.5 4.5-4.5 4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 18.5c0 .83.67 1.5 1.5 1.5h11c.83 0 1.5-.67 1.5-1.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-6 w-6">
      <rect x="4" y="5" width="16" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="m8 15 2.5-2.5a1 1 0 0 1 1.4 0L15 15l1.5-1.5a1 1 0 0 1 1.4 0L20 15.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9" cy="10" r="1.2" fill="currentColor" />
    </svg>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="max-w-[220px] text-center">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
        <ImageIcon />
      </div>
      <p className="mt-3 text-sm font-semibold text-slate-700">{title}</p>
      <p className="mt-1.5 text-sm leading-6 text-slate-500">{description}</p>
    </div>
  );
}

export function UploadCard() {
  const [dragActive, setDragActive] = useState(false);
  const [state, setState] = useState<RequestState>("idle");
  const [error, setError] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string>("");
  const [resultUrl, setResultUrl] = useState<string>("");

  const isBusy = state === "uploading";

  const helperText = useMemo(() => {
    if (isBusy) return "Removing background...";
    if (state === "success") return "Done. Your transparent PNG is ready.";
    if (state === "error") return error;
    return "Supports JPG, PNG, and WEBP. Max file size: 10MB.";
  }, [error, isBusy, state]);

  const validateFile = (nextFile: File) => {
    if (!ACCEPTED_TYPES.includes(nextFile.type)) {
      throw new Error("Unsupported file type. Please upload JPG, PNG, or WEBP.");
    }

    if (nextFile.size > MAX_SIZE) {
      throw new Error(
        `File is too large. Please upload an image smaller than ${formatFileSize(MAX_SIZE)}.`
      );
    }
  };

  const handleSelectedFile = async (nextFile: File) => {
    try {
      validateFile(nextFile);
      setState("idle");
      setError("");
      setFile(nextFile);
      setResultUrl("");

      const nextOriginalUrl = await fileToDataUrl(nextFile);
      setOriginalUrl(nextOriginalUrl);

      const formData = new FormData();
      formData.append("image_file", nextFile);

      setState("uploading");
      const response = await fetch("/api/remove-background", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || "Failed to remove background. Please try again later.");
      }

      const blob = await response.blob();
      if (!blob.type.startsWith("image/")) {
        throw new Error("Server returned a non-image response.");
      }

      const nextResultUrl = await blobToDataUrl(blob);
      setResultUrl(nextResultUrl);
      setState("success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      setState("error");
      setError(message);
    }
  };

  const onFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0];
    if (!nextFile) return;
    await handleSelectedFile(nextFile);
    event.target.value = "";
  };

  const onDrop = async (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragActive(false);
    const nextFile = event.dataTransfer.files?.[0];
    if (!nextFile) return;
    await handleSelectedFile(nextFile);
  };

  return (
    <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
      <div className="border-b border-slate-200 px-4 py-3 sm:px-5">
        <div>
          <h2 className="text-[15px] font-semibold tracking-[-0.025em] text-slate-950 sm:text-[17px]">
            Upload image
          </h2>
          <p className="mt-1 text-xs leading-5 text-slate-500 sm:text-[13px]">
            Preview the original and export a transparent PNG.
          </p>
        </div>
      </div>

      <div className="grid gap-3 p-3 sm:gap-4 sm:p-4 lg:grid-cols-[320px_minmax(0,1fr)_minmax(0,1fr)] lg:p-5 xl:grid-cols-[340px_minmax(0,1fr)_minmax(0,1fr)]">
        <label
          htmlFor="image-upload-input"
          onDragOver={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={onDrop}
          className={`flex min-h-[360px] flex-col rounded-[24px] border-2 px-5 py-6 text-center transition lg:min-h-[420px] ${
            dragActive
              ? "border-blue-300 bg-blue-50/70 shadow-[0_16px_40px_rgba(37,99,235,0.10)]"
              : "border-slate-200 bg-slate-50/60"
          } ${isBusy ? "cursor-not-allowed" : "cursor-pointer hover:border-blue-200 hover:bg-blue-50/40"}`}
        >
          <div className="flex flex-1 flex-col items-center justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
              <UploadIcon />
            </div>

            <p className="mt-4 text-[22px] font-semibold tracking-[-0.035em] text-slate-950 sm:text-[24px]">
              {isBusy ? "Processing image..." : "Choose an image"}
            </p>
            <p className="mt-2 max-w-[240px] text-sm leading-6 text-slate-600">
              Drag and drop here, or click to upload your image.
            </p>

            <span
              aria-disabled={isBusy}
              className={`mt-5 inline-flex min-h-11 min-w-[176px] items-center justify-center rounded-full px-5 text-sm font-semibold shadow-[0_6px_18px_rgba(37,99,235,0.16)] transition ${
                isBusy
                  ? "cursor-not-allowed bg-slate-300 text-slate-600 shadow-none"
                  : "cursor-pointer bg-blue-600 text-white hover:bg-blue-700"
              }`}
            >
              {isBusy ? "Processing..." : "Upload image"}
            </span>

            {resultUrl ? (
              <a
                href={resultUrl}
                download="removed-background.png"
                className="mt-3 inline-flex cursor-pointer items-center justify-center rounded-full border border-blue-100 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
              >
                Download PNG
              </a>
            ) : null}

            <input
              id="image-upload-input"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={onFileChange}
              disabled={isBusy}
            />
          </div>

          <div className="mt-6 flex flex-wrap justify-center gap-2 text-xs text-slate-500">
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">JPG / PNG / WEBP · Up to 10MB</span>
          </div>
        </label>

        <div className="rounded-[24px] border border-slate-200 bg-slate-50/60 p-3">
          <div className="mb-2 px-1 text-[10px] font-medium tracking-[0.01em] text-slate-400">
            Original image
          </div>
          <div className="checkerboard flex min-h-[360px] items-center justify-center overflow-hidden rounded-[20px] border border-slate-200 bg-white p-3 lg:min-h-[420px]">
            {originalUrl ? (
              <Image
                src={originalUrl}
                alt="Original upload preview"
                width={1600}
                height={1200}
                unoptimized
                className="block max-h-full max-w-full object-contain"
              />
            ) : (
              <EmptyState title="Original preview" description="Your uploaded image will appear here." />
            )}
          </div>
          {file ? (
            <div className="mt-2 truncate px-1 text-xs text-slate-500" title={file.name}>
              {file.name}
            </div>
          ) : null}
        </div>

        <div className="rounded-[24px] border border-slate-200 bg-slate-50/60 p-3">
          <div className="mb-2 px-1 text-[10px] font-medium tracking-[0.01em] text-slate-400">
            Transparent PNG
          </div>
          <div className="checkerboard flex min-h-[360px] items-center justify-center overflow-hidden rounded-[20px] border border-slate-200 bg-white p-3 lg:min-h-[420px]">
            {resultUrl ? (
              <Image
                src={resultUrl}
                alt="Background removed result preview"
                width={1600}
                height={1200}
                unoptimized
                className="block max-h-full max-w-full object-contain"
              />
            ) : state === "error" ? (
              <div className="max-w-[260px] rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-center text-sm leading-6 text-rose-700">
                {error || "Processing failed. Please try another image."}
              </div>
            ) : (
              <EmptyState title="Transparent PNG" description="The processed result will appear here." />
            )}
          </div>
        </div>
      </div>

      {state !== "idle" ? (
        <div
          className={`border-t px-4 py-3 text-sm sm:px-5 ${
            state === "error"
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : state === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-slate-200 bg-slate-50 text-slate-600"
          }`}
        >
          {helperText}
        </div>
      ) : null}
    </section>
  );
}
