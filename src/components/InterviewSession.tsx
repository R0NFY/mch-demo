"use client";

import { Mic, PhoneOff, Play, UploadCloud, Volume2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type Phase =
  | "idle"
  | "starting"
  | "live"
  | "stopping"
  | "uploading"
  | "analyzing"
  | "done"
  | "error";

type ChatResult =
  | { ok: true; text: string; ms: number; provider?: string; model_uri?: string }
  | { ok: false; error: string; details?: unknown };

type UploadResult =
  | { ok: true; bucket: string; object_key: string; bytes: number; content_type: string }
  | { ok: false; error: string; details?: unknown };

type AnalyzeResult =
  | { ok: true; job_id: string }
  | { ok: false; error: string; details?: unknown };

type ProfileResult =
  | { ok: true; status: "pending" }
  | { ok: true; status: "ready"; result: unknown }
  | { ok: false; error: string; details?: unknown };

type SttResult = { ok: true; transcript: string } | { ok: false; error: string; details?: unknown };

export default function InterviewSession() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  const [prompt, setPrompt] = useState(
    "Hi, I’m ready for the personality assessment interview. Please start with an opening question."
  );
  const [assistant, setAssistant] = useState<string>("");
  const [liveTranscript, setLiveTranscript] = useState<string>("");
  const [voiceBusy, setVoiceBusy] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const utteranceRecorderRef = useRef<MediaRecorder | null>(null);
  const utteranceChunksRef = useRef<BlobPart[]>([]);
  const [recordingBytes, setRecordingBytes] = useState<number>(0);

  const [objectKey, setObjectKey] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileResult | null>(null);

  const canStart = useMemo(() => phase === "idle" || phase === "done" || phase === "error", [phase]);
  const canEnd = useMemo(() => phase === "live", [phase]);

  useEffect(() => {
    return () => {
      try {
        recorderRef.current?.stop();
      } catch {}
      try {
        utteranceRecorderRef.current?.stop();
      } catch {}
      for (const t of streamRef.current?.getTracks() ?? []) t.stop();
    };
  }, []);

  async function initSimliAndDeepgram() {
    try {
      await import("simli-client");
    } catch {}
  }

  async function startInterview() {
    setError(null);
    setProfile(null);
    setObjectKey(null);
    setJobId(null);
    setAssistant("");
    setRecordingBytes(0);

    setPhase("starting");
    try {
      await initSimliAndDeepgram();

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;

      const mimeCandidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
      const mimeType = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (evt) => {
        if (evt.data && evt.data.size > 0) {
          chunksRef.current.push(evt.data);
          setRecordingBytes((b) => b + evt.data.size);
        }
      };

      recorder.start(1000);

      // Prepare a separate audio-only recorder for push-to-talk utterances.
      const audioOnly = new MediaStream(stream.getAudioTracks());
      const audioMimeCandidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
      const audioMimeType = audioMimeCandidates.find((m) => MediaRecorder.isTypeSupported(m));
      const urec = new MediaRecorder(audioOnly, audioMimeType ? { mimeType: audioMimeType } : undefined);
      utteranceRecorderRef.current = urec;
      utteranceChunksRef.current = [];
      urec.ondataavailable = (evt) => {
        if (evt.data && evt.data.size > 0) utteranceChunksRef.current.push(evt.data);
      };

      setPhase("live");
    } catch (e) {
      setPhase("error");
      setError(e instanceof Error ? e.message : "Failed to start interview");
    }
  }

  async function endInterview() {
    setPhase("stopping");
    setError(null);
    try {
      const recorder = recorderRef.current;
      const stream = streamRef.current;
      if (!recorder || !stream) throw new Error("No active recording.");

      const stopped = new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
      });
      recorder.stop();
      await stopped;

      for (const t of stream.getTracks()) t.stop();
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;

      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "video/webm" });
      const file = new File([blob], `interview-${Date.now()}.webm`, { type: blob.type });

      setPhase("uploading");
      const upload = await uploadVideo(file);
      if (!upload.ok) {
        throw new Error(
          `Upload failed: ${upload.error}${upload.details ? `\n${JSON.stringify(upload.details)}` : ""}`
        );
      }
      setObjectKey(upload.object_key);

      setPhase("analyzing");
      const analyze = await analyzeProfile(upload.object_key);
      if (!analyze.ok) {
        throw new Error(
          `Analyze failed: ${analyze.error}${analyze.details ? `\n${JSON.stringify(analyze.details)}` : ""}`
        );
      }
      setJobId(analyze.job_id);

      await pollProfile(analyze.job_id);
      setPhase("done");
    } catch (e) {
      setPhase("error");
      setError(e instanceof Error ? e.message : "Failed to end interview");
    }
  }

  async function startUtterance() {
    if (phase !== "live") return;
    if (voiceBusy) return;
    const rec = utteranceRecorderRef.current;
    if (!rec) return;
    setError(null);
    utteranceChunksRef.current = [];
    setVoiceBusy(true);
    try {
      rec.start();
    } catch (e) {
      setVoiceBusy(false);
      setError(e instanceof Error ? e.message : "Failed to start utterance");
    }
  }

  async function stopUtteranceAndSend() {
    const rec = utteranceRecorderRef.current;
    if (!rec) return;
    if (rec.state !== "recording") return;
    const stopped = new Promise<void>((resolve) => {
      rec.onstop = () => resolve();
    });
    try {
      rec.stop();
      await stopped;

      const blob = new Blob(utteranceChunksRef.current, { type: rec.mimeType || "audio/webm" });
      const file = new File([blob], `utterance-${Date.now()}.webm`, { type: blob.type });

      const transcript = await transcribeUtterance(file);
      const trimmed = transcript.trim();
      if (!trimmed) throw new Error("No speech detected. Try speaking louder/closer to the mic.");

      setLiveTranscript((t) => (t ? `${t}\n${trimmed}` : trimmed));

      const reply = await askRecruiter(trimmed);
      setAssistant(reply);
      await speak(reply);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Voice request failed");
    } finally {
      setVoiceBusy(false);
    }
  }

  async function transcribeUtterance(file: File): Promise<string> {
    const form = new FormData();
    form.append("file", file, file.name);
    const res = await fetch("/api/stt", { method: "POST", body: form });
    const json = (await res.json()) as SttResult;
    if (!json.ok) {
      throw new Error(
        `STT failed: ${json.error}${(json as any).details ? `\n${JSON.stringify((json as any).details)}` : ""}`
      );
    }
    return json.transcript ?? "";
  }

  async function askRecruiter(userText: string): Promise<string> {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: userText }),
    });
    const json = (await res.json()) as ChatResult;
    if (!json.ok) {
      throw new Error(
        `LLM failed: ${json.error}${(json as any).details ? `\n${JSON.stringify((json as any).details)}` : ""}`
      );
    }
    return json.text ?? "";
  }

  async function speak(text: string) {
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) return;
      const bytes = await res.arrayBuffer();
      const blob = new Blob([bytes], { type: res.headers.get("content-type") ?? "audio/mpeg" });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      await audio.play();
    } catch {
      // ignore TTS failures for now
    }
  }

  async function uploadVideo(file: File): Promise<UploadResult> {
    const form = new FormData();
    form.append("file", file, file.name);
    const res = await fetch("/api/upload-video", { method: "POST", body: form });
    return (await res.json()) as UploadResult;
  }

  async function analyzeProfile(object_key: string): Promise<AnalyzeResult> {
    const res = await fetch("/api/analyze-profile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ object_key }),
    });
    return (await res.json()) as AnalyzeResult;
  }

  async function pollProfile(job_id: string) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 2 * 60_000) {
      const res = await fetch(`/api/profile-result?job_id=${encodeURIComponent(job_id)}`);
      const json = (await res.json()) as ProfileResult;
      setProfile(json);
      if (json.ok && json.status === "ready") return;
      await new Promise((r) => setTimeout(r, 2000));
    }
    setProfile({ ok: true, status: "pending" });
  }

  async function sendToLLM() {
    setError(null);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: prompt }),
      });
      const json = (await res.json()) as ChatResult;
      if (!json.ok) throw new Error(json.error);
      setAssistant(json.text);
    } catch (e) {
      setError(e instanceof Error ? e.message : "LLM request failed");
    }
  }

  return (
    <section className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">Session</h2>
            <p className="mt-1 text-sm text-slate-300">
              Phase 1 scaffold: camera+mic + continuous recording.
            </p>
          </div>
          <div className="text-xs text-slate-300">
            <div>
              Phase: <span className="text-slate-100">{phase}</span>
            </div>
            <div>
              Recorded: <span className="text-slate-100">{Math.round(recordingBytes / 1024)}KB</span>
            </div>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-slate-800 bg-black">
          <video ref={videoRef} autoPlay playsInline muted className="h-64 w-full object-cover" />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={startInterview}
            disabled={!canStart}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Mic className="h-4 w-4" />
            Start interview
          </button>

          <button
            onClick={endInterview}
            disabled={!canEnd}
            className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            <PhoneOff className="h-4 w-4" />
            End interview
          </button>
        </div>

        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onMouseDown={startUtterance}
              onMouseUp={stopUtteranceAndSend}
              onTouchStart={startUtterance}
              onTouchEnd={stopUtteranceAndSend}
              disabled={phase !== "live" || voiceBusy}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Volume2 className="h-4 w-4" />
              Hold to talk
            </button>
            <div className="text-xs text-slate-300">
              Uses Deepgram STT (<span className="text-slate-100">nova-2</span>) + Deepgram TTS (
              <span className="text-slate-100">aura</span>) + YandexGPT Lite.
            </div>
          </div>
          <div className="mt-3 text-xs text-slate-300">Transcript</div>
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-800 bg-black/30 p-2 text-xs text-slate-100">
            {liveTranscript || "—"}
          </pre>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-rose-900/60 bg-rose-950/40 p-3 text-sm text-rose-100">
            {error}
          </div>
        ) : null}

        <div className="mt-4 grid gap-2 text-sm text-slate-300">
          <div>
            Uploaded key: <span className="text-slate-100">{objectKey ?? "—"}</span>
          </div>
          <div>
            Job ID: <span className="text-slate-100">{jobId ?? "—"}</span>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
        <h2 className="text-base font-semibold">Conversation (YandexGPT Lite)</h2>
        <p className="mt-1 text-sm text-slate-300">
          Basic text prompt to validate the LLM wiring; Simli avatar wiring comes next.
        </p>

        <label className="mt-4 block text-xs text-slate-300">Your message</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none"
          rows={6}
        />

        <div className="mt-3 flex gap-2">
          <button
            onClick={sendToLLM}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"
          >
            <Play className="h-4 w-4" />
            Ask
          </button>
        </div>

        <label className="mt-4 block text-xs text-slate-300">Assistant</label>
        <div className="mt-2 rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm text-slate-100">
          <pre className="whitespace-pre-wrap">{assistant || "—"}</pre>
        </div>

        <div className="mt-4 flex items-center gap-2 text-xs text-slate-300">
          <UploadCloud className="h-4 w-4" />
          Results:{" "}
          <span className="text-slate-100">
            {profile
              ? profile.ok
                ? profile.status === "ready"
                  ? "ready"
                  : "pending"
                : "error"
              : "—"}
          </span>
        </div>

        {profile && profile.ok && profile.status === "ready" ? (
          <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs text-slate-100">
            <pre className="whitespace-pre-wrap">{JSON.stringify(profile.result, null, 2)}</pre>
          </div>
        ) : null}

        {profile && !profile.ok ? (
          <div className="mt-3 rounded-xl border border-rose-900/60 bg-rose-950/40 p-3 text-xs text-rose-100">
            <pre className="whitespace-pre-wrap">{JSON.stringify(profile, null, 2)}</pre>
          </div>
        ) : null}
      </div>
    </section>
  );
}
