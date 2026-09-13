#!/usr/bin/env python3
"""Arc local server: static files + AI proxy. The API key is never logged."""

from __future__ import annotations

import json
import os
import re
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
os.chdir(ROOT)

PROVIDERS = {
    "openai": {
        "url": "https://api.openai.com/v1/chat/completions",
        "model": "gpt-4o-mini",
    },
    "openrouter": {
        "url": "https://openrouter.ai/api/v1/chat/completions",
        "model": "thinkingmachines/inkling:free",
    },
    "groq": {
        "url": "https://api.groq.com/openai/v1/chat/completions",
        "model": "llama-3.3-70b-versatile",
    },
}

OPENROUTER_FALLBACKS = [
    "thinkingmachines/inkling:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "google/gemini-2.0-flash-exp:free",
]

WHISPER_MODELS = [
    "openai/whisper-large-v3:free",
    "openai/whisper-large-v3",
]


def load_env() -> None:
    path = ROOT / ".env"
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def api_key_from(body: dict | None = None) -> str:
    body = body or {}
    return (
        (body.get("apiKey") or "")
        or os.environ.get("OPENROUTER_API_KEY")
        or os.environ.get("OPENAI_API_KEY")
        or ""
    ).strip()


def read_json(handler: SimpleHTTPRequestHandler) -> dict:
    length = int(handler.headers.get("Content-Length") or 0)
    raw = handler.rfile.read(length) if length else b"{}"
    try:
        data = json.loads(raw.decode("utf-8") or "{}")
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid JSON: {exc}") from exc
    if not isinstance(data, dict):
        raise ValueError("Body must be an object")
    return data


def send_json(handler: SimpleHTTPRequestHandler, payload: dict, status: int = 200) -> None:
    body = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Cache-Control", "no-store")
    handler.end_headers()
    handler.wfile.write(body)


def extract_json(text: str) -> dict:
    text = (text or "").strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence:
        text = fence.group(1).strip()
    decoder = json.JSONDecoder()
    for index, char in enumerate(text):
        if char != "{":
            continue
        try:
            obj, _ = decoder.raw_decode(text[index:])
        except json.JSONDecodeError:
            continue
        if isinstance(obj, dict):
            return obj
    raise ValueError("Model did not return JSON")


def message_chars(messages: list) -> int:
    total = 0
    for msg in messages:
        total += len(str(msg.get("content") or ""))
    return total


def openai_compatible(url: str, api_key: str, model: str, messages: list, extra_headers: dict | None = None, fallbacks: list | None = None) -> str:
    payload = {
        "model": model,
        "temperature": 0.3,
        "messages": messages,
    }
    if fallbacks:
        payload["models"] = fallbacks
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    if extra_headers:
        headers.update(extra_headers)
    req = Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
    try:
        with urlopen(req, timeout=90) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:800]
        raise RuntimeError(f"AI provider error {exc.code}: {detail}") from exc
    except URLError as exc:
        raise RuntimeError(f"Could not reach AI provider: {exc.reason}") from exc
    try:
        return data["choices"][0]["message"]["content"] or ""
    except (KeyError, IndexError, TypeError) as exc:
        raise RuntimeError("Unexpected AI response shape") from exc


def anthropic_complete(api_key: str, model: str, messages: list) -> str:
    system = ""
    converted = []
    for msg in messages:
        if msg.get("role") == "system":
            system = msg.get("content") or ""
        else:
            converted.append({"role": msg["role"], "content": msg["content"]})
    payload = {
        "model": model or "claude-3-5-haiku-latest",
        "max_tokens": 2000,
        "temperature": 0.3,
        "system": system,
        "messages": converted,
    }
    req = Request(
        "https://api.anthropic.com/v1/messages",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        method="POST",
    )
    try:
        with urlopen(req, timeout=90) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:800]
        raise RuntimeError(f"Anthropic error {exc.code}: {detail}") from exc
    except URLError as exc:
        raise RuntimeError(f"Could not reach Anthropic: {exc.reason}") from exc
    try:
        return data["content"][0]["text"]
    except (KeyError, IndexError, TypeError) as exc:
        raise RuntimeError("Unexpected Anthropic response shape") from exc


def run_model(body: dict) -> tuple[dict, dict]:
    api_key = api_key_from(body)
    if not api_key:
        raise ValueError("Add an AI key in Settings, or put OPENROUTER_API_KEY in .env")
    provider = (body.get("provider") or os.environ.get("ARC_PROVIDER") or "openrouter").strip().lower()
    messages = body.get("messages")
    if not isinstance(messages, list) or not messages:
        raise ValueError("messages is required")
    chars = message_chars(messages)

    if provider == "anthropic":
        model = (body.get("model") or "claude-3-5-haiku-latest").strip()
        content = anthropic_complete(api_key, model, messages)
        used = model
    else:
        spec = PROVIDERS.get(provider)
        if not spec:
            raise ValueError("Unknown provider. Use openai, openrouter, groq, or anthropic.")
        primary = (
            (body.get("model") or os.environ.get("OPENROUTER_MODEL") or spec["model"]).strip()
        )
        extra = {}
        if provider == "openrouter":
            extra = {
                "HTTP-Referer": "http://127.0.0.1:5173",
                "X-Title": "Arc",
            }
        chain = [primary] + [m for m in OPENROUTER_FALLBACKS if m != primary]
        last_error = None
        content = ""
        used = primary
        for index, model in enumerate(chain):
            try:
                rest = chain[index + 1 :] if provider == "openrouter" else None
                content = openai_compatible(spec["url"], api_key, model, messages, extra, rest)
                used = model
                last_error = None
                break
            except RuntimeError as exc:
                last_error = exc
                continue
        if last_error and not content:
            raise last_error
    return extract_json(content), {"chars": chars, "model": used, "provider": provider}


def transcribe_audio(body: dict) -> tuple[str, dict]:
    api_key = api_key_from(body)
    if not api_key:
        raise ValueError("Add an AI key in Settings, or put OPENROUTER_API_KEY in .env")
    audio = (body.get("audio") or "").strip()
    fmt = (body.get("format") or "webm").strip().lstrip(".").lower()
    if fmt in {"mp4", "m4a"}:
        fmt = "m4a"
    if not audio:
        raise ValueError("audio is required")
    last_error = None
    for model in WHISPER_MODELS:
        payload = {
            "model": model,
            "input_audio": {"data": audio, "format": fmt},
        }
        req = Request(
            "https://openrouter.ai/api/v1/audio/transcriptions",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "HTTP-Referer": "http://127.0.0.1:5173",
                "X-Title": "Arc",
            },
            method="POST",
        )
        try:
            with urlopen(req, timeout=90) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            text = (data.get("text") or "").strip()
            if text:
                return text, {"model": model, "chars": len(text)}
        except HTTPError as exc:
            last_error = RuntimeError(
                f"Whisper error {exc.code}: {exc.read().decode('utf-8', errors='replace')[:400]}"
            )
        except URLError as exc:
            last_error = RuntimeError(f"Could not reach Whisper: {exc.reason}")
    if last_error:
        raise last_error
    raise RuntimeError("Whisper returned empty text")


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, fmt: str, *args) -> None:
        message = fmt % args
        if "apiKey" in message or "Bearer" in message or "sk-" in message:
            return
        sys.stderr.write("%s - %s\n" % (self.address_string(), message))

    def do_POST(self) -> None:  # noqa: N802
        path = self.path.rstrip("/")
        try:
            body = read_json(self)
            if path == "/api/ai":
                result, usage = run_model(body)
                send_json(self, {"ok": True, "data": result, "usage": usage})
                return
            if path == "/api/transcribe":
                text, usage = transcribe_audio(body)
                send_json(self, {"ok": True, "text": text, "usage": usage})
                return
            self.send_error(404, "Not found")
        except ValueError as exc:
            send_json(self, {"ok": False, "error": str(exc)}, 400)
        except RuntimeError as exc:
            send_json(self, {"ok": False, "error": str(exc)}, 502)
        except Exception as exc:  # noqa: BLE001
            send_json(self, {"ok": False, "error": f"Server error: {exc}"}, 500)


def main() -> None:
    load_env()
    port = int(os.environ.get("PORT", "5173"))
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"Arc running at http://127.0.0.1:{port}")
    print("Open /app.html  ·  POST /api/ai  ·  POST /api/transcribe")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped")


if __name__ == "__main__":
    main()
