---
name: media-comprehension
description: Inspect screenshots, images, and other media by delegating perception to Google's Gemini via a zero-dependency Node script. Use whenever an agent needs to read visible text, verify a UI, inspect an asset, or otherwise determine what is in an image, audio file, or video.
metadata:
  author: federico-fabiani
  version: "1.0.0"
---

# Media Comprehension — perceive media through Gemini

Delegates the *perception* of media files to a multimodal Gemini model and returns its
analysis as text. It is especially useful for text-only agents that need to inspect
screenshots, generated assets, UI renders, or other images, while still supporting audio
and video. The script sits next to this SKILL.md:

`scripts/comprehend.mjs` — invoked as `$MC` in the examples below (substitute the real
absolute path to this skill's directory, e.g. `~/.config/opencode/skills/media-comprehension/scripts/comprehend.mjs`).

Zero dependencies beyond Node 18+ (for built-in `fetch`): no SDK, no install. No MCP
server, no plugin, no local service.

## 1. What it does

Takes **one or more media files** plus a **focused natural-language task**, sends them to
Gemini, and prints the model's answer as text. That's the entire contract:

```
comprehend.mjs --task "<what you need to know>" file.png [file2.mp3 ...]
```

The script is deliberately dumb and deterministic: it does not invent steps, make
decisions, or take actions. It performs exactly one Gemini request and returns the text.

## 2. When to use it

Use this skill whenever your task requires **knowing what is in a media file**:

- **Images first** — use it to inspect screenshots, generated assets, UI renders,
  desktop windows, diagrams, and photos. Is the UI correct? What text is visible? Is
  there a visual bug? Does the actual screenshot match the expected one?
- **Audio also works** — transcribe a recording, extract action items from a call, find a
  specific piece of information in an interview, check what was said about a topic.
- **Video also works** — locate when an event occurs, describe what happens around a
  timestamp, or find the UI problem in a screen recording.

The general trigger: *the agent has a media file and needs to know something about its
contents that it cannot (or prefers not to) determine itself.*

## 3. When NOT to use it

- **No media, no call.** If you can answer without perceiving the file, don't send it to
  Gemini. The script has nothing to do if there is nothing to perceive.
- **You already have the facts.** If the needed information is in files you can already
  read (source code, logs, transcripts, config), use those instead.
- **The job is not perception.** If the question is purely about reasoning, planning, or
  coding, do that yourself. This skill only supplies "what is in the media" — it does not
  make decisions for you.
- **Media > ~18 MB total.** Inline requests are size-capped. For large/long media, upload
  via the Gemini Files API and pass `--fileuri` (see §6), or skip this skill.

## 4. Useful even when you are multimodal

This is especially valuable for **text-only models**, but it is **not only** for text-only
models. Even when your primary model can see and hear natively, delegated perception is
often the better choice:

- **Context economy.** A full video or a long recording does not enter your context window;
  only the focused answer does.
- **Focus.** You ask the exact question; you get the exact answer. No digressions.
- **Cost & latency.** The perception model can be cheaper and faster than pushing raw media
  through the main model.
- **Division of labour.** Gemini perceives; you reason, decide, code, and act. Each does
  what it is best at.

Rule of thumb: *if you need the raw media in context (to reason pixel-by-pixel, to quote a
timestamp precisely, to keep the transcript for later), inspect directly; otherwise
delegating is usually preferable.*

## 5. Perceiving vs. reasoning — read this first

This skill creates a strict separation of concerns:

- **Perception** (what the skill does): the media is *seen/heard* and converted into
  words. Gemini tells you what is in the image, what the audio says, what happens in the
  video.
- **Reasoning** (what you do): interpreting that report, drawing conclusions, deciding the
  next step, writing code, taking action.

You remain the agent in charge. The script's output is **evidence, not a verdict.** Treat
it like any tool output: trust it proportionally, verify what matters, and reason over it
yourself. Never offload the reasoning — only the perception.

## 6. Invoking the script

```bash
node "$MC" --task "<question>" <media-file> [more-media-files ...]
```

Flags:

| Flag | Meaning |
|---|---|
| `--task <text>` | **Required.** The focused question/task for the model. |
| `--fileuri <uri>` | Repeatable. Reference a file already uploaded to the Gemini Files API (for media over the ~18 MB inline cap, e.g. long videos). |
| `--model <id>` | Override the default model. |
| `--json` | Print the raw JSON response instead of just the text. |
| `-h`, `--help` | Show usage. |

Notes:

- Media paths are positional; multiple files are allowed (all are sent together with the
  one task).
- Every positional argument is treated as a media file. Do not mix flags and files
  ambiguously.
- If the model returns multiple text parts, they are concatenated in order.
- The answer is printed on stdout. Diagnostic notes (model used, `finishReason`) go to
  stderr. On failure the script exits non-zero and prints the reason, including the raw
  API error when available.
- If the API key is missing, the script exits with a clear error that tells the user to get
  one from Google AI Studio.
- **Windows**: runs natively — no WSL or Git Bash needed; just Node 18+.

## 7. Supported media & Gemini limitations

Inferred from the file extension. Anything else is rejected with a clear error.

| Type | Extensions |
|---|---|
| Image | `.png` `.jpg` `.jpeg` `.webp` `.gif` `.heic` `.heif` |
| Audio | `.mp3` `.m4a` `.aac` `.wav` `.flac` `.ogg` `.opus` |
| Video | `.mp4` `.mov` `.webm` `.mpeg` `.mpg` `.mkv` `.avi` `.wmv` |

Limitations:

- **Inline size cap ~18 MB** (total request). Files larger than that are rejected; upload
  them to the Gemini Files API first and pass the resulting URI via `--fileuri`.
- **Long video** (more than a couple of minutes, or high bitrate) will exceed the inline
  cap — use `--fileuri`. Video understanding is limited to what the chosen model supports.
- **Audio language/quality** depends on the model; transcription of heavy accents or noisy
  recordings may be imperfect.
- **All media types** depend on what the configured Gemini API and model actually support
  at the time. If a format is rejected, the API error is surfaced — re-check the docs or
  convert the file.

## 8. Expected input and output

**Input:** one or more media file paths (or Files-API URIs) + a `--task` string.

**Output (stdout):** the model's answer to your task, as plain text. Nothing else pollutes
stdout.

**Exit codes:** `0` success · `2` usage/auth error · `1` request failed.

Example of a real flow:

```bash
node "$MC" --task "Read all text visible in this screenshot, then list each UI element and its state." screenshot.png
```

```
The screenshot shows the settings screen with:
- Theme selector: "Dark" (active)
- Font size: "Medium"
- Button: "Save changes" (disabled, greyed out)
```

## 9. Examples

### Images

Verify a generated UI against the requirements:

```bash
node "$MC" --task "The design spec requires: a header titled 'Dashboard', a sidebar with 3 nav items (Home, Reports, Settings), and a green 'Export' button in the top-right. Does this screenshot match? List every discrepancy." ui-generated.png
```

Read text from a screenshot (e.g. error messages, logs, OCR):

```bash
node "$MC" --task "Transcribe the error message text visible on screen, exactly as written." crash.png
```

Identify a visual error:

```bash
node "$MC" --task "Find visual defects in this UI: overlapping elements, clipped text, misaligned items, or broken images. Be specific about where." browser.png
```

Compare expected vs actual:

```bash
node "$MC" --task "Compare these two screenshots. The first is the expected result, the second is the actual render. List every difference you can find, no matter how small." expected.png actual.png
```

Inspect a desktop application state:

```bash
node "$MC" --task "Describe the current state of this application window: which view is open, which elements are enabled or disabled, and whether anything looks stuck or loading." window.png
```

### Audio

Transcription:

```bash
node "$MC" --task "Transcribe this recording verbatim, preserving speaker turns where possible." meeting.mp3
```

Extract action items:

```bash
node "$MC" --task "Extract every action item from this call: who, what, and any deadlines mentioned." call.m4a
```

Find specific information:

```bash
node "$MC" --task "At what point in the interview is the candidate's salary expectation mentioned, and what number do they give?" interview.wav
```

### Video

Find when an event occurs:

```bash
node "$MC" --task "At what timestamp does the user first click the 'Submit' button, and what happens immediately after?" recording.mp4
```

Describe around a moment:

```bash
node "$MC" --task "Describe in detail what is happening on screen between 1:20 and 1:50." demo.mp4
```

Inspect a screen recording for a UI problem:

```bash
node "$MC" --task "Watch this screen recording and identify the UI problem: where it occurs (timestamp), what breaks, and what the user was doing right before." bug-repro.mp4
```

## 10. Formulating the task

- **Be precise.** The better the question, the better the answer. "Is the submit button
  visible?" beats "describe this screenshot."
- **When you know what you need, ask for exactly that.** Verification, extraction,
  comparison, and timestamp-location are all expressible as one sentence.
- **When you have no specific objective**, ask for a *useful structured description* of
  the relevant contents — not a generic "describe this":

```bash
node "$MC" --task "Give a structured summary of this image: main subject, visible text, layout, and anything notable or unexpected." photo.png
```

- Provide the ground truth you have when relevant ("expected: X; does the image match?"),
  because that turns an open-ended look into a checkable comparison.

## 11. Agent operating rules

- Default to **targeted inspection**, not generic description. Ask for the exact fact you
  need: visible text, discrepancy list, UI state, timestamp, action items.
- For image work, prefer **verification and comparison** prompts over open-ended prompts,
  especially when you have expected output or a design brief.
- If the task is OCR-like, ask for text **exactly as written**. If the task is UI review,
  ask for **specific discrepancies**. Shape the task so the answer is directly usable.
- Treat the output as **evidence, not certainty**. If the result sounds ambiguous,
  overgeneral, or incomplete, ask a narrower follow-up instead of over-interpreting it.

## 12. Where to change the model

Gemini-specific configuration lives at the top of `scripts/comprehend.mjs`:

- `DEFAULT_MODEL` — the Gemini model used unless `--model` is given.
- `MAX_INLINE_BYTES` — the inline upload cap.

Overrides are available as environment variables for `GEMINI_MODEL` and
`GEMINI_MAX_INLINE_BYTES`. The API base is intentionally fixed to Gemini's REST API:
this skill is Gemini-only by design. The skill's interface — media files + task → text —
never changes.

## 13. Troubleshooting

- **`GEMINI_API_KEY is not set`** (exit 2) — set the env var (see §7).
- **`cannot determine MIME type`** — unsupported extension; convert the file or use
  `--fileuri`.
- **`HTTP 4xx`** — the API error body is printed; a 400 usually means an unsupported
  media type or model, a 403/401 an invalid/expired key.
- **`HTTP 429`** — rate or quota limit. Back off and retry, or check
  <https://aistudio.google.com>.
- **`no text in the model response`** — often a safety block; the raw response and
  `finishReason` are printed. Rephrase the task.
- **Node missing / too old** — the script needs Node 18+ (for global `fetch`). Install or
  update Node: <https://nodejs.org>.
