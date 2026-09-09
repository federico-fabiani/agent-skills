#!/usr/bin/env node
// transcribe.mjs — transcribe an audio file with a Gemini multimodal model.
//
// Gemini has no dedicated transcription endpoint/model: audio is just a
// modality of a general multimodal model and the *prompt* does the work. This
// script sends the audio inline (base64) with an explicit instruction to output
// the verbatim transcript, optionally diarized, passing any user context into
// the prompt.
//
// Long / byte-heavy audio is split at the LONGEST silences (never mid-word) and
// each chunk is re-encoded to mono 16 kHz. Cost: audio is billed at the model's
// input price, 32 tokens/second (audio docs: 1 min = 1920 tokens).
//
// Dependencies: Node 18+ (global fetch). ffprobe + ffmpeg for duration,
// silence detection and splitting. No SDKs.
//
// Authentication: GEMINI_API_KEY (or GOOGLE_API_KEY).
//
// Exit codes: 0 ok · 2 usage/auth error · 1 request/failure.

import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import os from "node:os";

// ---------------------------------------------------------------------------
// Gemini config. Model / inline cap are overridable via env; the API is fixed.
// ---------------------------------------------------------------------------
const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_MODEL = process.env.GEMINI_TRANSCRIBE_MODEL || "gemini-3.5-flash-lite";
// Gemini inline requests are capped around 20 MB. Stay under it.
const MAX_INLINE_BYTES = Number(process.env.GEMINI_MAX_INLINE_BYTES || 18000000);

// Audio technical details (ai.google.dev/gemini-api/docs/audio):
//   - tokens: 32 tokens per second of audio (1 minute = 1920 tokens)
//   - max length: 9.5 hours of audio per prompt
//   - resolution: downsampled to 16 kbps; multi-channel collapsed to mono
const TOKENS_PER_AUDIO_SEC = 32;
const MAX_DURATION_SEC = 9.5 * 3600; // soft per-prompt ceiling

// Chunk re-encode: mono 16 kHz MP3 @ 64 kbps -> ~8000 B/s. A ~30 min chunk then
// stays comfortably under the inline byte cap.
const ENCODE_BR = 64000;
const BYTES_PER_SEC = ENCODE_BR / 8;

// Silence-detection defaults (configurable).
const DEFAULT_MAX_MINUTES = 30;
const SILENCE_DB = Number(process.env.GEMINI_SILENCE_DB || -30);
const SILENCE_SEC = Number(process.env.GEMINI_SILENCE_SEC || 0.8);
const MIN_CHUNK_SEC = 2; // never create a sub-2s sliver

// Input price per 1M tokens (USD). Audio is billed at the model's general input
// price (flash-lite's row explicitly says "text / image / video / audio").
// 3.6/3.7/3.8 flash double from $0.75 to $1.50 on 2027-01-01.
const INPUT_PRICE_PER_M = {
  "gemini-3.5-flash-lite": 0.30,
  "gemini-3.5-flash": 1.50,
  "gemini-3.6-flash": 0.75,
  "gemini-3.7-flash": 0.75,
  "gemini-3.8-flash": 0.75,
};

const AUDIO_MIME = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".wave": "audio/wav",
  ".aiff": "audio/aiff",
  ".aif": "audio/aiff",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".oga": "audio/ogg",
  ".flac": "audio/flac",
  ".m4a": "audio/mp4",
  ".m4b": "audio/mp4",
  ".m4r": "audio/mp4",
  ".l16": "audio/l16",
  ".opus": "audio/opus",
  ".alac": "audio/mp4",
  ".amr": "audio/amr",
};
// Video containers: we transcribe their audio track.
const VIDEO_EXT = new Set([".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi", ".wmv", ".mpg", ".mpeg", ".3gp", ".ts"]);

const USAGE = `Usage:
  transcribe.mjs --audio FILE [options]

Transcribe audio (or a video's audio track) with a Gemini multimodal model.

Required:
  --audio FILE        Input file (mp3, wav, m4a, flac, aac, ogg, opus, webm,
                      mp4, mov, mkv, ...). Video containers are audio-extracted.

Optional:
  --model NAME        Gemini model id (default: ${DEFAULT_MODEL}).
  --prompt TEXT       Free-form context about the recording (topic, names,
                      setting, expected jargon). Injected into the prompt.
  --diarize           Request diarization (Speaker 1/2/... per turn). Only
                      useful if there really are multiple speakers.
  --language CODE     Hint the spoken language(s), e.g. it, en (repeatable).
  --max-minutes N     Max minutes per chunk. Splitting is automatic when needed
                      (byte cap / 9.5h ceiling); this forces an earlier cut.
  --out FILE          Transcript output file. Default: <audio>.txt .
  --json              Also save each part's raw Gemini JSON (<out>.partNN.json).
  --silence-db NUM    Silence detector threshold in dB (default: ${SILENCE_DB}).
  --silence-sec NUM   Min silence duration in s to be a cut point (default: ${SILENCE_SEC}).
  -h, --help          Show this help.`;

function parseArgs(argv) {
  const o = { file: "", model: DEFAULT_MODEL, prompt: "", diarize: false, languages: [], out: "", maxMinutes: 0, json: false, db: SILENCE_DB, dur: SILENCE_SEC };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => { const v = argv[++i]; if (v === undefined) throw new Error(`${a} requires a value`); return v; };
    switch (a) {
      case "--audio": case "--file": o.file = val(); break;
      case "--model": o.model = val(); break;
      case "--prompt": o.prompt = val(); break;
      case "--diarize": o.diarize = true; break;
      case "--language": o.languages.push(val()); break;
      case "--max-minutes": o.maxMinutes = Number(val()); break;
      case "--out": o.out = val(); break;
      case "--json": o.json = true; break;
      case "--silence-db": o.db = Number(val()); break;
      case "--silence-sec": o.dur = Number(val()); break;
      case "-h": case "--help": o.help = true; break;
      default: throw new Error(`Unknown option: ${a}`);
    }
  }
  return o;
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  if (r.error) throw new Error(`${cmd} failed to start: ${r.error.message}`);
  return r;
}

function probeDuration(file) {
  const r = run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nk=1:nw=1", file]);
  const s = parseFloat((r.stdout || "").trim());
  return Number.isFinite(s) ? s : 0;
}

// ffmpeg silencedetect writes START/END pairs to stderr.
function detectSilences(file, db, minSec) {
  const r = run("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", `silencedetect=noise=${db}dB:d=${minSec}`, "-f", "null", "-"]);
  const text = r.stderr || "";
  const re = /silence_start:\s*([0-9.]+)|silence_end:\s*([0-9.]+)/g;
  const sils = [];
  let m, start = null;
  while ((m = re.exec(text))) {
    if (m[1] !== undefined) start = parseFloat(m[1]);
    else if (start !== null) { sils.push({ start, end: parseFloat(m[2]) }); start = null; }
  }
  return sils;
}

// Partition [0, duration] into segments each <= maxChunkSec, cutting at the
// midpoint of the available silences (longest gap first when forced). Falls back
// to a fixed-time cut where there is no silence; never cuts if a silence's
// midpoint is right at a segment edge.
function planCuts(duration, maxChunkSec, silences) {
  const mids = silences
    .map((s) => (s.start + s.end) / 2)
    .filter((m) => m > MIN_CHUNK_SEC && m < duration - MIN_CHUNK_SEC)
    .sort((a, b) => a - b);
  const cuts = [];
  let segStart = 0;
  while (true) {
    const target = segStart + maxChunkSec;
    if (target >= duration - 0.5) break;
    let cut = -1;
    for (const m of mids) if (m <= target && m > segStart) cut = m; // largest usable silence
    if (cut < 0 || cut - segStart < MIN_CHUNK_SEC) cut = target; // no silence -> time cut
    cuts.push(cut);
    segStart = cut;
  }
  if (cuts.length && duration - cuts[cuts.length - 1] < MIN_CHUNK_SEC) cuts.pop(); // merge tiny tail
  return cuts;
}

function encodeSegment(src, start, length, out) {
  // -ss/-t after -i -> accurate seek + trim while re-encoding.
  run("ffmpeg", ["-y", "-v", "error", "-i", src, "-ss", start.toFixed(3), "-t", length.toFixed(3), "-ac", "1", "-ar", "16000", "-b:a", String(ENCODE_BR), out]);
}

function normalizeSingleFile(src, out, dropVideo) {
  const args = ["-y", "-v", "error", "-i", src];
  if (dropVideo) args.push("-vn");
  args.push("-ac", "1", "-ar", "16000", "-b:a", String(ENCODE_BR), out);
  run("ffmpeg", args);
}

async function google(key, model, parts, prompt, wantJson) {
  const body = { contents: [{ parts: [...parts, { text: prompt }] }] };
  const res = await fetch(`${API_BASE}/models/${model}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  if (!res.ok) {
    let detail = raw;
    try { detail = JSON.parse(raw)?.error?.message || raw; } catch {}
    const e = new Error(`HTTP ${res.status} ${res.statusText} (model: ${model}): ${detail}`);
    e.status = res.status; e.raw = raw;
    throw e;
  }
  let json;
  try { json = JSON.parse(raw); } catch { throw new Error("invalid JSON from Gemini"); }
  if (wantJson) return { text: "", raw, json };
  const text = (json?.candidates || []).flatMap((c) => c?.content?.parts || []).map((p) => p.text || "").join("");
  return { text, raw, json };
}

function fmtDur(s) { const m = Math.floor(s / 60); return `${m}m ${Math.round(s % 60)}s`; }

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(USAGE); return; }

  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) {
    console.error("ERROR: GEMINI_API_KEY (or GOOGLE_API_KEY) is not set in the environment.");
    console.error("Get a key at https://aistudio.google.com/apikey and set it before running.");
    process.exit(2);
  }
  if (!args.file) { console.error("ERROR: --audio is required."); console.error(USAGE); process.exit(2); }
  if (!Number.isFinite(args.maxMinutes) || args.maxMinutes < 0) { console.error("ERROR: --max-minutes must be a positive number"); process.exit(2); }
  for (const t of ["ffprobe", "ffmpeg"]) { if (run(t, ["-version"]).status !== 0) { console.error(`ERROR: missing tool: ${t}`); process.exit(2); } }

  const input = path.resolve(args.file);
  try { await readFile(input); } catch { console.error(`ERROR: file not found: ${args.file}`); process.exit(2); }

  const ext = path.extname(input).toLowerCase();
  const isVideo = VIDEO_EXT.has(ext);
  const mimeType = isVideo ? "audio/mp4" : AUDIO_MIME[ext];
  if (!mimeType) {
    console.error(`ERROR: cannot determine MIME type for '${ext}'. Convert to a supported audio format (mp3/wav/m4a/flac/aac/ogg/opus) or a video container (${[...VIDEO_EXT].join(", ")}).`);
    process.exit(2);
  }

  console.error(`Input : ${input}`);
  console.error(`Model : ${args.model}`);
  const duration = probeDuration(input);
  console.error(`Length: ${fmtDur(duration)}   Max per prompt: ${fmtDur(MAX_DURATION_SEC)}`);

  // Prompt — the model is NOT a "transcription" model, the prompt is the job.
  let prompt = "You are transcribing a single audio recording. Transcribe everything spoken, verbatim, preserving the exact words. Output ONLY the transcription text: no commentary, no headings, no timestamps, no explanations, no preamble, no notes. Do not add anything that is not spoken.";
  if (args.diarize) {
    prompt += "\nIf the recording has multiple distinct speakers, diarize by prefixing each turn with \"Speaker 1:\", \"Speaker 2:\", etc. and start each turn on a new line. If it is a single speaker, do not add labels — output the verbatim text only.";
  }
  if (args.languages.length) prompt += `\nThe recording is spoken in: ${args.languages.join(", ")}.`;
  if (args.prompt) prompt += `\nContext: ${args.prompt}`;

  const tmp = await mkdtemp(path.join(os.tmpdir(), "gtrans-"));
  process.on("exit", () => spawnSync("rm", ["-rf", tmp], { shell: true }));
  const size = (await readFile(input)).length;

  const byteCapSec = Math.floor((MAX_INLINE_BYTES / BYTES_PER_SEC) * 0.85); // safety margin
  let maxChunkSec = Math.min(MAX_DURATION_SEC, byteCapSec);
  if (args.maxMinutes > 0) maxChunkSec = Math.min(maxChunkSec, args.maxMinutes * 60);
  if (maxChunkSec < MIN_CHUNK_SEC) maxChunkSec = MIN_CHUNK_SEC;

  const needSplit = size > MAX_INLINE_BYTES || duration > maxChunkSec;

  const files = []; // { path, mime, sec }
  if (!needSplit) {
    files.push({ path: input, mime: mimeType, sec: duration });
  } else {
    const norm = path.join(tmp, "norm.mp3");
    console.error(`Over ${fmtDur(maxChunkSec)} or >${(MAX_INLINE_BYTES / 1e6).toFixed(0)} MB -> normalizing to mono 16 kHz + silence-splitting.`);
    normalizeSingleFile(input, norm, isVideo);
    const d2 = probeDuration(norm);
    const sils = detectSilences(norm, args.db, args.dur);
    const cuts = planCuts(d2, maxChunkSec, sils);
    const ends = cuts.concat([d2]);
    let start = 0;
    for (let i = 0; i < ends.length; i++) {
      const len = ends[i] - start;
      if (len < MIN_CHUNK_SEC) { start = ends[i]; continue; }
      const out = path.join(tmp, `part${String(i).padStart(3, "0")}.mp3`);
      encodeSegment(norm, start, len, out);
      files.push({ path: out, mime: "audio/mpeg", sec: len });
      start = ends[i];
    }
  }

  const out = args.out || `${input.replace(/\.[^.]+$/, "")}.txt`;
  const transcripts = [];
  const TOTAL = files.length;
  let totalSec = 0;
  let part = 0;
  for (const f of files) {
    part++;
    totalSec += f.sec;
    const bytes = (await readFile(f.path)).length;
    console.error(`-> Transcribing [${part}/${TOTAL}] ${path.basename(f.path)} (~${fmtDur(f.sec)}, ${bytes} bytes) ...`);
    const b64 = (await readFile(f.path)).toString("base64");
    const res = await google(key, args.model, [{ inlineData: { mimeType: f.mime, data: b64 } }], prompt, args.json);
    if (args.json) {
      const j = path.join(path.dirname(out), `${path.basename(out, ".txt")}.part${String(part).padStart(2, "0")}.json`);
      await writeFile(j, res.raw + "\n");
      console.error("  raw JSON :", j);
    }
    if (!res.text || !res.text.trim()) {
      console.error(`ERROR: no transcript (finishReason: ${res.json?.candidates?.[0]?.finishReason || "unknown"}).`);
      console.error(res.raw);
      process.exit(1);
    }
    transcripts.push(res.text.trim());
    const fr = res.json?.candidates?.[0]?.finishReason;
    if (fr && fr !== "STOP" && fr !== "MAX_TOKENS") console.error(`  note: finishReason = ${fr}`);
  }

  writeFileSync(out, transcripts.join("\n\n") + "\n", "utf8");
  console.error("--- done ---");
  console.error("Transcript :", out);
  const perMin = INPUT_PRICE_PER_M[args.model];
  if (perMin !== undefined) {
    const rate = TOKENS_PER_AUDIO_SEC * 60 * (perMin / 1e6);
    const cost = (totalSec / 60) * rate;
    console.error(`Duration   : ${fmtDur(totalSec)}   Est. audio cost: $${cost.toFixed(5)}   (~$${rate.toFixed(5)}/min audio @ $${perMin}/1M in)`);
  } else {
    console.error(`Duration   : ${fmtDur(totalSec)}   (price unknown for model ${args.model})`);
  }
}

main().catch((e) => { console.error(`ERROR: ${e.message}`); if (e.raw && e.raw.length < 2000) console.error(e.raw); process.exit(1); });
