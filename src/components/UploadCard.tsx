"use client";

import { UploadCloud } from "lucide-react";
import { useMemo, useState } from "react";

type UploadResult =
  | { ok: true; bucket: string; object_key: string; bytes: number; content_type: string }
  | { ok: false; error: string; details?: unknown };

export default function UploadCard() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);

  const canUpload = useMemo(() => !!file && !loading, [file, loading]);

  async function onUpload() {
    if (!file) return;
    setLoading(true);
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", file, file.name);
      const res = await fetch("/api/upload-video", { method: "POST", body: form });
      const json = (await res.json()) as UploadResult;
      setResult(json);
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : "Upload failed", details: e });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">Upload test video</h2>
            <p className="mt-1 text-sm text-slate-300">
              Select a <code className="text-slate-200">.webm</code> or{" "}
              <code className="text-slate-200">.mp4</code> file and upload it.
            </p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800">
            <UploadCloud className="h-5 w-5" />
          </div>
        </div>

      <div className="mt-4 flex flex-col gap-3">
        <input
          type="file"
          accept="video/webm,video/mp4,video/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full cursor-pointer rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200 file:mr-4 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-slate-100 hover:file:bg-slate-700"
        />

        <button
          onClick={onUpload}
          disabled={!canUpload}
          className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Uploading…" : "Upload"}
        </button>
      </div>

      <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs text-slate-200">
        {result ? <pre className="whitespace-pre-wrap">{JSON.stringify(result, null, 2)}</pre> : "—"}
      </div>
    </section>
  );
}
