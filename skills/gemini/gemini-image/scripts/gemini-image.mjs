#!/usr/bin/env node
// Zero-dependency Gemini image generation / editing (Nano Banana).
// Requires Node 18+ (global fetch). Reads GEMINI_API_KEY (or GOOGLE_API_KEY) from env.
//
// Usage:
//   node gemini-image.mjs --prompt "a red fox in snow" --out fox.png
//   node gemini-image.mjs --prompt "make it night" --input fox.png --out fox-night.png
//   node gemini-image.mjs --prompt "..." --model gemini-3-pro-image --size 4K --aspect 16:9
//
// Flags:
//   --prompt <text>       required
//   --out <path>          output file name (default: nb-<timestamp>.png). With -n>1 an index is appended.
//   --dir <path>          output directory (created if missing). Default: current working directory.
//                         Ignored when --out is an absolute path.
//   --input <path>        input image to edit; repeat for multiple reference images
//   --model <id>          default gemini-3.1-flash-lite-image
//   --aspect <ratio>      1:1 3:2 2:3 3:4 4:3 4:5 5:4 9:16 16:9 21:9  (default 1:1)
//   --size <1K|2K|4K>     default 1K
//   --thinking <MINIMAL|HIGH>  only sent if passed (pro model only)
//   --tier <standard|flex|priority>  only sent if passed
//   -n <count>            number of images (separate API calls; default 1)

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const API = "https://generativelanguage.googleapis.com/v1beta/models";

const MIME = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".gif": "image/gif", ".heic": "image/heic",
};

function parseArgs(argv) {
  const o = { inputs: [], n: 1 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case "--prompt": o.prompt = next(); break;
      case "--out": o.out = next(); break;
      case "--dir": o.dir = next(); break;
      case "--input": o.inputs.push(next()); break;
      case "--model": o.model = next(); break;
      case "--aspect": o.aspect = next(); break;
      case "--size": o.size = next(); break;
      case "--thinking": o.thinking = next(); break;
      case "--tier": o.tier = next(); break;
      case "-n": o.n = parseInt(next(), 10); break;
      default: throw new Error(`Unknown flag: ${a}`);
    }
  }
  return o;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) {
    console.error("ERROR: GEMINI_API_KEY (or GOOGLE_API_KEY) is not set in the environment.");
    console.error("Get an API key at https://aistudio.google.com/apikey and set it before running.");
    process.exit(2);
  }
  if (!args.prompt) { console.error("ERROR: --prompt is required."); process.exit(2); }

  const model = args.model || "gemini-3.1-flash-lite-image";
  const size = (args.size || "1K").toUpperCase();

  if (model.includes("lite") && size !== "1K") {
    throw new Error(
      `${model} only supports 1K output (requested ${size}). ` +
      `Use --model gemini-3.1-flash-image for 2K/4K.`
    );
  }

  // Build the parts array: reference/source images first, prompt text last.
  const parts = [];
  for (const p of args.inputs) {
    const buf = await readFile(p);
    const mimeType = MIME[path.extname(p).toLowerCase()] || "image/png";
    parts.push({ inlineData: { mimeType, data: buf.toString("base64") } });
  }
  parts.push({ text: args.prompt });

  const generationConfig = {
    responseModalities: ["TEXT", "IMAGE"],
    imageConfig: {
      aspectRatio: args.aspect || "1:1",
      imageSize: size,
    },
  };
  if (args.thinking) {
    generationConfig.thinkingConfig = { thinkingLevel: args.thinking.toUpperCase() };
  }

  const body = { contents: [{ parts }], generationConfig };
  if (args.tier) body.serviceTier = args.tier.toLowerCase();

  if (args.dir) await mkdir(args.dir, { recursive: true });

  const saved = [];
  for (let i = 0; i < args.n; i++) {
    const res = await fetch(`${API}/${model}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`HTTP ${res.status} ${res.statusText}\n${detail}`);
    }

    const json = await res.json();
    const outParts = json?.candidates?.[0]?.content?.parts || [];
    let text = "";
    let found = false;

    for (const part of outParts) {
      if (part.text) text += part.text;
      if (part.inlineData?.data) {
        const ext = (part.inlineData.mimeType || "image/png").split("/")[1].replace("jpeg", "jpg");
        const base = args.out || `nb-${Date.now()}.${ext}`;
        const named = args.n > 1
          ? base.replace(/(\.[^.]+)?$/, (m) => `-${i + 1}${m || `.${ext}`}`)
          : base;
        const target = (args.dir && !path.isAbsolute(named)) ? path.join(args.dir, named) : named;
        await writeFile(target, Buffer.from(part.inlineData.data, "base64"));
        saved.push(path.resolve(target));
        found = true;
      }
    }

    if (!found) {
      const reason = json?.candidates?.[0]?.finishReason || "unknown";
      let msg = `no image returned (finishReason: ${reason}).`;
      if (text) msg += `\nModel said: ${text}`;
      if (json?.promptFeedback) msg += `\n${JSON.stringify(json.promptFeedback)}`;
      throw new Error(msg);
    }
    if (text.trim()) console.log(`note: ${text.trim()}`);
  }

  console.log(`model: ${model}  aspect: ${generationConfig.imageConfig.aspectRatio}  size: ${generationConfig.imageConfig.imageSize}`);
  for (const s of saved) console.log(`saved: ${s}`);
}

main().catch((e) => { console.error(`ERROR: ${e.message}`); process.exitCode = 1; });
