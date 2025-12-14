# Universal Human Profiler — Vertical Slice

Next.js app scaffold for the "Universal Human Profiler" VVS.

## Phase 2 (Storage) — current

This repo currently implements:
- `lib/s3.ts`: Yandex Object Storage client + `ensureBucketExists(bucket)`
- `src/app/api/upload-video/route.ts`: accepts `multipart/form-data` field `file` and uploads to S3
- `src/app/page.tsx`: tiny UI to upload a `.webm` file and see the JSON response

## Phase 1 (Interview) — in progress

- `src/app/interview/page.tsx`: interview screen
- `src/components/InterviewSession.tsx`: camera+mic recording + push-to-talk (Deepgram STT/TTS) + LLM calls (YandexGPT Lite)
- `/api/chat`: YandexGPT Lite proxy
- `/api/stt`: Deepgram prerecorded STT proxy (nova-2)
- `/api/tts`: Deepgram TTS proxy (aura)

## Setup

```bash
npm install
cp .env.example .env.local
```

Edit `.env.local` and set at least:
- `YANDEX_ACCESS_KEY_ID`
- `YANDEX_SECRET_ACCESS_KEY`
- `YANDEX_BUCKET_NAME`
- `YANDEX_SERVICE_ACCOUNT_KEY_JSON`
- `YANDEX_FOLDER_ID`
- `DEEPGRAM_API_KEY`

## Run

```bash
npm run dev
```

Open http://localhost:3000 and upload a video file.
