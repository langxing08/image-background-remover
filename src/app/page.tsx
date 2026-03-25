import type { Metadata } from "next";
import { UploadCard } from "@/components/upload-card";

export const metadata: Metadata = {
  title: "Image Background Remover | Remove Background from Image Online",
  description:
    "Remove background from image online in seconds. Upload JPG, PNG, or WEBP and download a transparent PNG instantly.",
};

const faqItems = [
  {
    question: "Is this image background remover free to use?",
    answer:
      "This MVP is focused on fast background removal for single images. You can upload an image, remove the background, preview the result, and download the transparent PNG.",
  },
  {
    question: "What image formats are supported?",
    answer:
      "You can upload JPG, JPEG, PNG, and WEBP images up to 10MB.",
  },
  {
    question: "Will my images be stored?",
    answer:
      "No. This MVP does not save original or processed images. Files are only held in memory during the request.",
  },
  {
    question: "How long does processing take?",
    answer:
      "Most images should finish within a few seconds depending on image size and Remove.bg API response time.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#e0f2fe,_#ffffff_40%,_#f8fafc_100%)] text-slate-900">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-6 py-10 md:px-10 lg:px-12">
        <section className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div className="space-y-6">
            <div className="inline-flex items-center rounded-full border border-sky-200 bg-white/80 px-4 py-1 text-sm font-medium text-sky-700 shadow-sm backdrop-blur">
              Fast online tool for transparent PNG output
            </div>
            <div className="space-y-4">
              <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
                Image Background Remover
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-slate-600 sm:text-xl">
                Remove background from image online in seconds. Upload a photo,
                let the app cleanly cut out the subject, then download a
                transparent PNG right away.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm backdrop-blur">
                <p className="text-sm font-medium text-slate-500">Formats</p>
                <p className="mt-1 text-base font-semibold">JPG / PNG / WEBP</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm backdrop-blur">
                <p className="text-sm font-medium text-slate-500">Output</p>
                <p className="mt-1 text-base font-semibold">Transparent PNG</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm backdrop-blur">
                <p className="text-sm font-medium text-slate-500">Storage</p>
                <p className="mt-1 text-base font-semibold">In-memory only</p>
              </div>
            </div>
          </div>

          <UploadCard />
        </section>

        <section className="grid gap-4 rounded-3xl border border-slate-200 bg-white/85 p-6 shadow-sm md:grid-cols-3">
          {[
            {
              title: "1. Upload your image",
              description:
                "Drag and drop a JPG, PNG, or WEBP file, or choose one from your device.",
            },
            {
              title: "2. Remove the background",
              description:
                "The app sends the image to Remove.bg through a secure server-side API route.",
            },
            {
              title: "3. Download the result",
              description:
                "Preview the transparent PNG and save it immediately when processing finishes.",
            },
          ].map((item) => (
            <div key={item.title} className="rounded-2xl bg-slate-50 p-5">
              <h2 className="text-lg font-semibold text-slate-950">{item.title}</h2>
              <p className="mt-2 text-sm leading-7 text-slate-600">{item.description}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="space-y-3">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-700">
              Why this MVP exists
            </p>
            <h2 className="text-3xl font-semibold tracking-tight text-slate-950">
              Built for quick validation, not unnecessary complexity
            </h2>
            <p className="text-base leading-8 text-slate-600">
              This version is intentionally simple: no accounts, no history,
              and no object storage. It focuses on the core promise of an image
              background remover website — upload, remove, preview, download.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              "Single image upload only",
              "10MB file size limit",
              "Clear validation and error feedback",
              "Server-side Remove.bg API integration",
              "Mobile-friendly layout",
              "SEO-ready landing copy and FAQ section",
            ].map((feature) => (
              <div
                key={feature}
                className="rounded-2xl border border-slate-200 bg-white p-5 text-sm font-medium text-slate-700 shadow-sm"
              >
                {feature}
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="space-y-2">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-700">
              FAQ
            </p>
            <h2 className="text-3xl font-semibold tracking-tight text-slate-950">
              Common questions
            </h2>
          </div>
          <div className="grid gap-4">
            {faqItems.map((item) => (
              <article key={item.question} className="rounded-2xl bg-slate-50 p-5">
                <h3 className="text-lg font-semibold text-slate-950">{item.question}</h3>
                <p className="mt-2 text-sm leading-7 text-slate-600">{item.answer}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
