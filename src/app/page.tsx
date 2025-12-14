import UploadCard from "@/components/UploadCard";
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Universal Human Profiler — VVS</h1>
        <p className="text-sm text-slate-300">
          Phase 2 scaffold: upload a recorded{" "}
          <code className="text-slate-200">video/webm</code> or{" "}
          <code className="text-slate-200">video/mp4</code>{" "}
          to Yandex Object Storage via <code className="text-slate-200">/api/upload-video</code>.
        </p>
      </header>

      <UploadCard />

      <Link
        href="/interview"
        className="inline-flex w-fit rounded-xl border border-slate-800 bg-slate-900/30 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-900/50"
      >
        Go to Interview →
      </Link>

      <section className="rounded-xl border border-slate-800 bg-slate-900/30 p-4 text-sm text-slate-300">
        Next phases will add the interview UI (Simli + Deepgram + GPT-5.2), full-session recording,
        and DataSphere job triggering.
      </section>
    </main>
  );
}
