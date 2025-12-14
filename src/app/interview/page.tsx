import InterviewSession from "@/components/InterviewSession";
import Link from "next/link";

export default function InterviewPage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-10">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold">Interview</h1>
          <p className="text-sm text-slate-300">
            Starts recording immediately and uploads the full file when you end the interview.
          </p>
        </div>
        <Link
          href="/"
          className="rounded-xl border border-slate-800 bg-slate-900/30 px-3 py-2 text-sm text-slate-200 hover:bg-slate-900/50"
        >
          Back
        </Link>
      </header>

      <InterviewSession />
    </main>
  );
}

