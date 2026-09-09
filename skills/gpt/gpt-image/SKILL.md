---
name: gpt-image
description: Generate or edit images with OpenAI GPT Image 2.5 (gpt-image-2.5-sunburst / gpt-image-2.5-flare) via shell scripts. Use whenever the user asks to create, generate, draw, render, illustrate, restyle, edit, merge, or combine images, icons, logos, mockups, banners, photos, or product cutouts.
metadata:
  author: federico-fabiani
  version: "1.0.0"
---

# GPT Image 2.5 — generation & editing

Calls the OpenAI Images API directly. Needs `curl`, `jq`, `base64` (present on Git Bash / MSYS2). No SDK.

Scripts, next to this SKILL.md:
- `scripts/generate.sh` — generate from a text prompt (`/v1/images/generations`)
- `scripts/edit.sh` — edit, reference or merge image(s) (`/v1/images/edits`, multipart)

In the examples below `$G` is a placeholder for the absolute path to this skill's directory
(normally `~/.agents/skills/gpt-image`). Substitute it before running.

Refer to `prompt-guide.md` for how to write prompts (models, settings, patterns).

> **Uso diretto**: chiama direttamente gli script (`generate.sh` / `edit.sh`) senza rileggere il loro contenuto né riscriverlo. Rileggili o modificali **solo** se compare un errore da diagnosticare.

## 0. API key

Scripts read `OPENAI_API_KEY`. If missing they exit 2 — run and surface the error, don't pre-echo the key. If user needs one: https://platform.openai.com/api-keys.

Generation is billed — no free tier. See §4.

## 1. Generate

```bash
$G/scripts/generate.sh \
  --prompt "isometric 3d icon of a coffee machine, soft studio lighting, pastel palette" \
  --out icon.png
```

## 2. Edit / merge

```bash
# edit one image (prompt = instruction)
$G/scripts/edit.sh --image photo.jpg --out photo-clean.png \
  --prompt "remove the background, keep the subject, transparent white backdrop"

# merge / reference multiple images (repeat --image)
$G/scripts/edit.sh --image scene.png --image dog.png --out composite.png \
  --prompt "place the dog from image 2 into the scene of image 1, same lighting, change nothing else"
```

## 3. Flags

Both accept `--model` (default `gpt-image-2.5-sunburst`), `--size` (default `1024x1024`), `--quality` (default `auto`), `--format` (default `png`), `--background`, `--compression`, `--count|-n`, `--out`, `--help`. `edit.sh` also takes `--image|-i` (repeatable) and `--mask`.

Where files go: `--out` is an absolute-or-relative path; parent dirs are created. Default `gpt-<timestamp>.<fmt>`. With `--count > 1` an index is appended. The script prints the absolute path of everything it saved.

Ask where to save if it isn't obvious, else default to the project dir — never scatter into a random cwd.

### Settings (pick deliberately)

- `--size`: `1024x1024` (default), `1536x1024` (landscape), `1024x1536` (portrait), 2K/4K. Custom `WIDTHxHEIGHT`: mult. of 16, max 3840/edge, ratio 1:3–3:1.
- `--quality`: `auto` (default) · `low` · `medium` · `high` · `xhigh` · `max`. `low` for drafts; go higher only if needed.
- `--format`: `png` (default, slower) · `jpeg` (faster) · `webp`. Transparency only via png/webp + `--background transparent`.
- `--compression`: 0–100, jpeg/webp only.

## 4. Cost discipline

- Every call is billed. A rejected/retried generation is billed twice.
- Write a careful prompt before the first call; don't burn calls iterating.
- `gpt-image-2.5-flare` is faster; `sunburst` is more precise for edits. Same token rates: $8/M image-in, $2/M cached, $30/M image-out, $5/M text-in, $1.25/M cached text-in.
- Complex prompts can take up to ~2 min. `jpeg` is faster than `png`.

## 5. Review before delivering — mandatory

**Open the generated file and look at it before telling the user it's done.** Models fail in checkable ways:

- **Text**: garbled letters, invented words, wrong spelling (most common).
- **Brief coverage**: every requested element present? Right count?
- **Anatomy/geometry**: extra fingers, broken perspective, melted hardware.
- **Aspect ratio**: framing matches, subject not cropped.
- **Edits**: untouched regions stayed untouched.

Fix with a targeted edit pass on the output (usually cheaper than regenerating). Never present an image you haven't viewed.

## 6. Prompting notes (full guide in `prompt-guide.md`)

- Describe a **scene**, not a keyword list. Full sentences beat comma-salad.
- Be explicit about camera/lighting/style/mood/palette.
- For text, quote it exactly and say "once, legible, no extra text". Check spelling.
- For edits, name what must **not** change: "change only X; keep Y identical".
- Assign roles to references: "image 1 is the scene, image 2 is the subject".
- Iterate: feed the previous output back as `--image`, one focused change, restate constraints.

## 7. Troubleshooting

- HTTP 400 / 401 — check key or that the requested `--size`/`--quality`/`--background` combo is valid for the model.
- `moderation_blocked` — prompt triggered a safety filter. Rephrase, make the visual intent explicit.
- HTTP 429 — rate/quota limit. Back off.
- No `.data[0].b64_json` — the script prints the raw body; inspect it.
