#!/usr/bin/env node
// media-comprehension — understand media (images, audio, video) via Gemini.
//
// A deliberately tiny, zero-dependency Gemini client for the
// media-comprehension OpenCode skill. It reads one or more media files, sends
// them together with a focused natural-language task to the Gemini API, and
// prints the model's text answer to stdout.
//
// This script only PERCEIVES: it returns what the model reports about the
// media. Reasoning about that result, making decisions, and taking action are
// the calling agent's job.
//
// Dependencies: Node 18+ (global fetch). No SDKs, no install.
//
// Authentication:
//   GEMINI_API_KEY (or GOOGLE_API_KEY) must be set in the environment.
//   Never hard-code or print the key.
//
// Usage:
//   node comprehend.mjs --task "<question>" media1.png [media2.mp3 ...]
//   node comprehend.mjs --task "transcribe this" call.mp3
//   node comprehend.mjs --task "what happens at 0:10?" clip.mp4
//
// Options:
//   --task <text>       the focused question/task for the model (required)
//   --fileuri <uri>     reference a file already uploaded to the Gemini
//                       Files API (repeatable). Use for media larger than the
//                       inline cap (~18 MB), e.g. long videos.
//   --model <id>        Gemini model id (default: $DEFAULT_MODEL)
//   --json              print the full raw JSON response instead of just the text
//   -h | --help         print this help and exit
//
// Exit codes: 0 ok · 2 usage/auth error · 1 request failed.

import { readFile } from "node:fs/promises";
import path from "node:path";

// ---------------------------------------------------------------------------
// Gemini configuration. The model and inline limit are configurable, but this
// script is intentionally Gemini-only and keeps the API endpoint fixed.
// ---------------------------------------------------------------------------
const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
// Gemini inline-data requests are capped around 20 MB total. Stay under it to
// leave room for the JSON envelope. Larger media must use the Files API.
const MAX_INLINE_BYTES = Number(process.env.GEMINI_MAX_INLINE_BYTES || 18000000);
// ---------------------------------------------------------------------------

const MIME = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".wav": "audio/wav",
  ".flac": "audio/flac",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg",
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mpeg": "video/mpeg",
  ".mpg": "video/mpeg",
  ".mkv": "video/x-matroska",
  ".avi": "video/x-msvideo",
  ".wmv": "video/x-ms-wmv",
};

const USAGE = `Usage:
  comprehend.mjs --task "<question>" media1.png [media2.mp3 ...]
  comprehend.mjs --task "<question>" --fileuri https://.../files/<id>

Options:
  --task <text>    the focused question/task for the model (required)
  --fileuri <uri>  reference a file already uploaded to the Gemini Files API (repeatable)
  --model <id>     Gemini model id (default: ${DEFAULT_MODEL})
  --json           print the full raw JSON response instead of just the text
  -h, --help       show this help`;

function parseArgs(argv) {
  const o = { media: [], fileUris: [], model: DEFAULT_MODEL, json: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = (flag) => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${flag} requires a value`);
      return v;
    };
    switch (a) {
      case "--task": o.task = value("--task"); break;
      case "--fileuri": o.fileUris.push(value("--fileuri")); break;
      case "--model": o.model = value("--model"); break;
      case "--json": o.json = true; break;
      case "-h":
      case "--help": o.help = true; break;
      default:
        if (a.startsWith("-")) throw new Error(`Unknown flag: ${a}`);
        o.media.push(a);
    }
  }
  return o;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(USAGE);
    return;
  }

  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) {
    console.error("ERROR: GEMINI_API_KEY (or GOOGLE_API_KEY) is not set in the environment.");
    console.error("Get an API key at https://aistudio.google.com/apikey and set it before running.");
    process.exit(2);
  }
  if (!args.task) {
    console.error("ERROR: --task is required.");
    console.error(USAGE);
    process.exit(2);
  }
  if (args.media.length === 0 && args.fileUris.length === 0) {
    console.error("ERROR: provide at least one media file or --fileuri.");
    console.error(USAGE);
    process.exit(2);
  }

  // Build the parts array: media first, the task text last.
  const parts = [];
  let total = 0;
  for (const p of args.media) {
    const mimeType = MIME[path.extname(p).toLowerCase()];
    if (!mimeType) {
      throw new Error(
        `cannot determine MIME type for '${p}'. Supported extensions: ${Object.keys(MIME).join(" ")}. ` +
        `For larger media, upload to the Gemini Files API and pass --fileuri.`
      );
    }
    let buf;
    try {
      buf = await readFile(p);
    } catch (e) {
      if (e.code === "ENOENT") throw new Error(`media file not found: ${p}`);
      throw e;
    }
    if (buf.length > MAX_INLINE_BYTES) {
      throw new Error(
        `${p} is ${buf.length} bytes; inline requests are capped near ${MAX_INLINE_BYTES} bytes. ` +
        `Upload it to the Gemini Files API and pass --fileuri.`
      );
    }
    total += buf.length;
    if (total > MAX_INLINE_BYTES) {
      throw new Error(
        `combined media exceeds the inline request cap (${MAX_INLINE_BYTES} bytes). ` +
        `Use --fileuri for large or long media.`
      );
    }
    parts.push({ inlineData: { mimeType, data: buf.toString("base64") } });
  }
  for (const u of args.fileUris) {
    // fileData mimeType is marked required in the API docs but Gemini normally
    // infers it from the uploaded file; add it here if Gemini rejects a bare
    // fileUri.
    parts.push({ fileData: { fileUri: u } });
  }
  parts.push({ text: args.task });

  const body = { contents: [{ parts }] };

  const res = await fetch(`${API_BASE}/models/${args.model}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const raw = await res.text();
  if (!res.ok) {
    console.error(`ERROR: HTTP ${res.status} ${res.statusText} from Gemini (model: ${args.model})`);
    console.error(raw.split("\n").map((l) => `  ${l}`).join("\n"));
    process.exit(1);
  }

  let json;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    console.error("ERROR: invalid JSON in the model response.");
    console.error(raw);
    process.exit(1);
  }

  if (args.json) {
    console.log(raw);
    return;
  }

  const text = (json?.candidates || [])
    .flatMap((c) => c?.content?.parts || [])
    .map((p) => p.text || "")
    .join("");

  if (!text.trim()) {
    console.error("ERROR: no text in the model response.");
    console.error(`finishReason: ${json?.candidates?.[0]?.finishReason || "unknown"}`);
    console.error(raw);
    process.exit(1);
  }
  console.log(text);

  const fr = json?.candidates?.[0]?.finishReason;
  if (fr && fr !== "STOP" && fr !== "MAX_TOKENS") {
    console.error(`note: finishReason = ${fr} (model: ${args.model})`);
  }
}

main().catch((e) => { console.error(`ERROR: ${e.message}`); process.exitCode = 1; });
