---
name: gemini-image
description: Generate or edit images with Google's Gemini image models (Nano Banana) via a zero-dependency script. Use whenever the user asks to create, generate, draw, render, illustrate, restyle, upscale, or edit an image, icon, logo, mockup, banner, or photo.
metadata:
  author: federico-fabiani
  version: "1.0.0"
---

# Gemini Image — image generation & editing

Calls the Gemini REST API directly. No SDK, no install — just Node 18+.

Script: `scripts/gemini-image.mjs`, sitting next to this SKILL.md. Examples below write it as
`$GI` — substitute the real absolute path to this skill's directory (in Claude Code that's
normally `~/.claude/skills/gemini-image/scripts/gemini-image.mjs`).

If the API key is missing, the script exits with a clear error that tells the user to get
one from Google AI Studio.

Image generation has **no free tier** — every call costs money. See §4.

## 1. Basic usage

Generate:
```bash
node $GI \
  --prompt "isometric 3d icon of a coffee machine, soft studio lighting, pastel palette" \
  --out icon.png
```

Edit an existing image (pass it as `--input`; the prompt is the edit instruction):
```bash
node $GI \
  --prompt "remove the background, keep the subject, transparent-looking white backdrop" \
  --input photo.jpg --out photo-clean.png
```

Compose from multiple references (repeat `--input`, up to a handful):
```bash
... --input character.png --input style-ref.png --prompt "draw the character in the style of the second image"
```

Flags: `--prompt` (required) · `--out` · `--dir` · `--input` (repeatable) · `--model` · `--aspect` · `--size` · `--thinking` · `--tier` · `-n <count>`

### Where the files go

- `--out <name>` — output file name. Default `nb-<timestamp>.png`. With `-n > 1` an index is appended (`icon-1.png`, `icon-2.png`, …).
- `--dir <path>` — destination folder, created if missing. Defaults to the current working directory; ignored if `--out` is already an absolute path.

Ask the user where they want the images if it isn't obvious from the request, or default to the project directory you're working in — never scatter files into a random cwd. The script prints the absolute path of everything it saved.

```bash
... --prompt "hero banner" --dir ./assets/generated --out hero.png
```

## 2. Models — pick deliberately

| Model | Use it for | Max size | ~Cost / image |
|---|---|---|---|
| `gemini-3.1-flash-lite-image` **(default)** | Most work: icons, illustrations, mockups, social assets, drafts, bulk variations | **1K only** | **$0.034** |
| `gemini-3.1-flash-image` | When lite isn't good enough, or you need 2K/4K | 4K | $0.045 (0.5K) · $0.067 (1K) · $0.101 (2K) · $0.151 (4K) |
| `gemini-3-pro-image` | Hero/final deliverables, legible text in-image, infographics, precise multi-reference composition, factual grounding | 4K | $0.134 (1K–2K) · $0.24 (4K) |
| `gemini-2.5-flash-image` | Legacy. Only for reproducing older output. | 1K | — |

**Default to `gemini-3.1-flash-lite-image` at `1K`** — it's the cheapest and fastest, and it's genuinely
good enough for the majority of requests. Start here unless you already know it won't cut it.

Escalate only when the job justifies it:
- → **`gemini-3.1-flash-image`** when lite has failed the brief once, when the scene is compositionally
  complex (many interacting subjects, specific spatial layout), or when you need **2K/4K** — lite is
  1K-only and the script will refuse a larger `--size` on it.
- → **`gemini-3-pro-image`** when the image contains **text that must be readable**, when it's a final
  client-facing deliverable, or when flash has failed the same brief twice.
- → **`4K`** only for print or large-format. It roughly doubles the cost for detail nobody sees on a screen.
- → **`--thinking HIGH`** (pro model only) for complex compositional prompts. Adds latency and cost.

**Before spending on pro or 4K, say what it will cost and why.** For a batch (`-n 5` on lite ≈ $0.17)
mention the total. Upgrading a model is a ~2–4× cost jump — do it because the output demanded it, not by reflex.

## 3. Aspect ratio & size

`--aspect`: `1:1` (default) · `3:2` · `2:3` · `3:4` · `4:3` · `4:5` · `5:4` · `9:16` · `16:9` · `21:9`

Pick from the destination, don't leave it at the default: `16:9` slides/banners/thumbnails, `9:16` stories/reels, `4:5` Instagram feed, `21:9` wide hero, `1:1` icons/avatars.

`--size`: `1K` (default) · `2K` · `4K`. Uppercase K is required. The default lite model is **1K-only** —
asking for more fails fast with a message telling you to switch to `gemini-3.1-flash-image`.

## 4. Cost discipline

- Every generation is billed; there is **no free tier**. A failed/rejected generation you retry is billed twice.
- Write a careful prompt *before* the first call rather than burning calls iterating.
- When exploring directions, stay on the default lite model and only re-run the winner on flash or pro.
- Don't silently generate 10 variations. Ask, or generate 2–3.

## 5. Review before delivering — mandatory

**Always open the generated file with the Read tool and actually look at it before telling the user it's done.** The models fail in specific, checkable ways:

- **Text**: garbled letters, invented words, wrong spelling. The single most common failure.
- **Brief coverage**: is every element the user asked for actually present? Right count of objects?
- **Anatomy/geometry**: extra fingers, broken perspective, melted hardware.
- **Aspect ratio**: does the framing match what was requested, or is the subject cropped?
- **Edits**: did the untouched regions actually stay untouched?

If it's wrong, fix it with a targeted follow-up (an edit pass on the output is usually cheaper and more faithful than regenerating), and only then hand it over. If you regenerate, say so.
Never present an image you haven't viewed.

## 6. Prompting notes

- Describe a **scene**, not a keyword list. Full sentences beat comma-salad tags.
- Be explicit about camera/lighting/style/mood/palette — "85mm portrait, shallow depth of field, warm rim light".
- For text in an image, quote it exactly: `a sign reading "OPEN 24H"`. Use the pro model for this.
- For edits, name what must **not** change: "change only the sky to sunset; keep the building, people and colours identical".
- Iterate conversationally: feed the previous output back in with `--input` and give one focused instruction.

## 7. Troubleshooting

- `no image returned (finishReason: ...)` — usually a safety block or a prompt read as text-only. Rephrase; make the visual intent explicit.
- HTTP 400 on `imageConfig` / `thinkingConfig` — the model doesn't support that field (e.g. 4K or thinking on lite). Drop it or switch model.
- HTTP 429 — rate/quota limit. Back off, or check billing at https://aistudio.google.com.
