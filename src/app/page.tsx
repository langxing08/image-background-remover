import type { Metadata } from "next";
import { AuthControls, UploadCard } from "@/components/upload-card";

export const metadata: Metadata = {
  title: "Image Background Remover | Remove Background from Image Online",
  description:
    "Remove background from image online in seconds. Upload JPG, PNG, or WEBP and download a transparent PNG instantly.",
};

const trustPoints = ["Google sign-in", "$9.9 / $19.9 / $39.9 per month", "PayPal subscription"];

export default function Home() {
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#fffaff_0%,#fee8ff_24%,#eef8ff_56%,#f2fff4_100%)] px-4 py-4 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col">
        <div className="flex justify-end">
          <AuthControls />
        </div>

        <section className="mt-4 w-full text-center">
          <h1 className="mt-1 text-[clamp(2rem,4.2vw,3.4rem)] font-semibold tracking-[-0.055em] text-slate-950">
            Remove image backgrounds
          </h1>

          <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-[15px]">
            Sign in with Google, choose a monthly plan, remove image backgrounds automatically, and download clean transparent PNG files.
          </p>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
            {trustPoints.map((item) => (
              <span
                key={item}
                className="rounded-full border border-[rgba(220,188,255,0.46)] bg-[rgba(255,255,255,0.96)] px-3 py-1.5 text-xs font-medium text-[#865f95] shadow-sm"
              >
                {item}
              </span>
            ))}
          </div>
        </section>

        <section className="mt-6 w-full">
          <UploadCard />
        </section>
      </div>
    </main>
  );
}
