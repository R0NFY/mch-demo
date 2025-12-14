import argparse
import json
import os
import sys
from pathlib import Path

import boto3
from botocore.config import Config

try:
    from oceanai import OCEANAI
except Exception:
    OCEANAI = None


def required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing env var: {name}")
    return value


def s3_client():
    endpoint = os.getenv("YANDEX_S3_ENDPOINT", "https://storage.yandexcloud.net").rstrip("/")
    region = os.getenv("YANDEX_REGION", "ru-central1")
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        region_name=region,
        aws_access_key_id=required_env("YANDEX_ACCESS_KEY_ID"),
        aws_secret_access_key=required_env("YANDEX_SECRET_ACCESS_KEY"),
        config=Config(signature_version="s3v4"),
    )


def download_video(bucket: str, key: str, out_path: Path) -> Path:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    client = s3_client()
    client.download_file(bucket, key, str(out_path))
    return out_path


def upload_json(bucket: str, key: str, payload: dict):
    client = s3_client()
    body = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
    client.put_object(Bucket=bucket, Key=key, Body=body, ContentType="application/json")


def run_oceanai(video_path: Path) -> dict:
    if OCEANAI is None:
        raise RuntimeError("oceanai is not available in this environment.")
    predictor = OCEANAI()
    raw = predictor.predict(path=str(video_path))
    return {"raw": raw}


def interpret_with_gpt(raw_scores: dict) -> dict:
    from openai import OpenAI

    client = OpenAI(api_key=required_env("OPENAI_API_KEY"), base_url=os.getenv("OPENAI_BASE_URL"))
    model = os.getenv("OPENAI_MODEL", "gpt-5.2")

    system = "You are a professional HR recruiter conducting a personality assessment."
    prompt = (
        "You are given raw output from an 'oceanai' Big Five predictor.\n"
        "Convert it into a clean JSON object with normalized Big Five scores (0..1) and a short summary.\n"
        "Return ONLY valid JSON with this schema:\n"
        '{ "scores": { "openness": 0.0, "conscientiousness": 0.0, "extraversion": 0.0, "agreeableness": 0.0, "neuroticism": 0.0 }, "summary": "..." }\n\n'
        f"Raw:\n{json.dumps(raw_scores, ensure_ascii=False)}"
    )

    resp = client.responses.create(
        model=model,
        input=[
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
    )
    text = resp.output_text or ""
    return json.loads(text)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--bucket", required=True)
    parser.add_argument("--s3_object_key", required=True)
    parser.add_argument("--job_id", required=True)
    parser.add_argument("--workdir", default="/tmp/uhp-worker")
    args = parser.parse_args()

    video_out = Path(args.workdir) / "input" / Path(args.s3_object_key).name
    download_video(args.bucket, args.s3_object_key, video_out)

    raw = run_oceanai(video_out)
    interpreted = interpret_with_gpt(raw)

    result = {
        **interpreted,
        "job_id": args.job_id,
        "source_video_key": args.s3_object_key,
    }
    upload_json(args.bucket, f"results/{args.job_id}.json", result)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(str(e), file=sys.stderr)
        sys.exit(1)

