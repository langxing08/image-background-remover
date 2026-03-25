"use client";

import { ChangeEvent, DragEvent, useMemo, useRef, useState } from "react";

type RequestState = "idle" | "uploading" | "success" | "error";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 10 * 1024 * 1024;

function formatFileSize(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

export function UploadCard() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [state, setState] = useState<RequestState>("idle");
  const [error, setError] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string>("");
  const [resultUrl, setResultUrl] = useState<string>("");

  const isBusy = state === "uploading";

  const helperText = useMemo(() => {
    if (isBusy) return "Removing the background...";
    if (state === "success") return "Done. Your transparent PNG is ready.";
    if (state === "error") return error;
    return "Upload one JPG, PNG, or WEBP image up to 10MB.";
  }, [error, isBusy, state]);

  const resetResult = () => {
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setResultUrl("");
  };

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
      resetResult();

      if (originalUrl) URL.revokeObjectURL(originalUrl);
      const nextOriginalUrl = URL.createObjectURL(nextFile);
      setOriginalUrl(nextOriginalUrl);

      const formData = new FormData();
      formData.append("image_file", nextFile);

      setState("uploading");
      const response = await fetch("/api/remove-background", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error || "Failed to remove background. Please try again later.");
      }

      const blob = await response.blob();
      setResultUrl(URL.createObjectURL(blob));
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

  const onDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    const nextFile = event.dataTransfer.files?.[0];
    if (!nextFile) return;
    await handleSelectedFile(nextFile);
  };

  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-xl shadow-slate-200/60 sm:p-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-700">
            Online tool
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
            Upload and remove background
          </h2>
        </div>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        className={`rounded-3xl border-2 border-dashed p-8 text-center transition ${
          dragActive
            ? "border-sky-500 bg-sky-50"
            : "border-slate-200 bg-slate-50"
        }`}
      >
        <div className="mx-auto flex max-w-md flex-col items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-3xl shadow-sm">
            ✂️
          </div>
          <div className="space-y-2">
            <p className="text-lg font-semibold text-slate-950">
              Drop your image here
            </p>
            <p className="text-sm leading-6 text-slate-600">
              Or choose a file from your device. We support single-image upload
              only for this MVP.
            </p>
          </div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={isBusy}
            className="inline-flex h-11 items-center justify-center rounded-full bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {isBusy ? "Processing..." : "Choose image"}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={onFileChange}
          />
        </div>
      </div>

      <p
        className={`mt-4 text-sm ${
          state === "error" ? "text-rose-600" : "text-slate-600"
        }`}
      >
        {helperText}
      </p>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
              Original
            </h3>
            {file ? <span className="text-xs text-slate-500">{file.name}</span> : null}
          </div>
          <div className="checkerboard flex aspect-square items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {originalUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={originalUrl} alt="Original upload preview" className="h-full w-full object-contain" />
            ) : (
              <p className="max-w-[220px] text-center text-sm leading-6 text-slate-400">
                Your uploaded image preview will appear here.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
              Result
            </h3>
            {resultUrl ? (
              <a
                href={resultUrl}
                download="removed-background.png"
                className="text-sm font-semibold text-sky-700 hover:text-sky-800"
              >
                Download PNG
              </a>
            ) : null}
          </div>
          <div className="checkerboard flex aspect-square items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {resultUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={resultUrl} alt="Background removed result preview" className="h-full w-full object-contain" />
            ) : (
              <p className="max-w-[220px] text-center text-sm leading-6 text-slate-400">
                The transparent PNG result will show here after processing.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
