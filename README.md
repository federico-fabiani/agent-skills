# agent-skills

Agent skills by [Federico Fabiani](https://github.com/federico-fabiani). Compatible with
[skills.sh](https://skills.sh) — works with Claude Code, Codex, Cursor, and other agents
that read the `SKILL.md` convention.

Skills are organized under a vendor subfolder — `gemini/` or `gpt/` — so a single skill
is installed by its full subpath.

## Install

Install everything in this repo:

```bash
npx skills add federico-fabiani/agent-skills
```

Or pick a single skill (note the vendor subpath):

```bash
# Google Gemini
npx skills add federico-fabiani/agent-skills/gemini/gemini-image
npx skills add federico-fabiani/agent-skills/gemini/gemini-transcribe
npx skills add federico-fabiani/agent-skills/gemini/media-comprehension

# OpenAI
npx skills add federico-fabiani/agent-skills/gpt/gpt-image
npx skills add federico-fabiani/agent-skills/gpt/gpt-transcribe

# standalone
npx skills add federico-fabiani/agent-skills/chatbot-gif-icons
npx skills add federico-fabiani/agent-skills/italian-diceware
```

## Skills

| Skill | What it does |
|---|---|
| [`gemini/gemini-image`](skills/gemini/gemini-image) | Generate/edit images with Google's Gemini image models (Nano Banana), via a zero-dependency Node script. Defaults to the cheap/fast tier and documents when to escalate. Requires a `GEMINI_API_KEY`. |
| [`gemini/gemini-transcribe`](skills/gemini/gemini-transcribe) | Transcribe audio/video to text with a Gemini multimodal model. No dedicated transcription endpoint — the prompt does the work. Splits long audio at silences; model default `gemini-3.5-flash-lite`. Requires a `GEMINI_API_KEY`. |
| [`gemini/media-comprehension`](skills/gemini/media-comprehension) | Understand media files (images, audio, video) by delegating perception to Google's Gemini via a zero-dependency Node script. Returns a focused textual analysis for the task you ask. Requires a `GEMINI_API_KEY`. |
| [`gpt/gpt-image`](skills/gpt/gpt-image) | Generate/edit images with OpenAI GPT Image (`gpt-image-2.5-sunburst` / `gpt-image-2.5-flare`) via shell scripts. Requires an `OPENAI_API_KEY`. |
| [`gpt/gpt-transcribe`](skills/gpt/gpt-transcribe) | Transcribe audio/video to text with OpenAI `gpt-transcribe` via a shell script. Requires an `OPENAI_API_KEY`. |
| [`chatbot-gif-icons`](skills/chatbot-gif-icons) | Generate small, seamlessly-looping animated GIF status icons for chatbot UIs (thinking / typing / processing indicators). Requires Python + Pillow. |
| [`italian-diceware`](skills/italian-diceware) | Generate strong Italian passphrases from a Diceware word list via a zero-dependency Node script (real dice or CSPRNG). |

## Layout

```
skills/
  <vendor>/                # gemini/ | gpt/  (optional grouping)
    <skill-name>/
      SKILL.md             # frontmatter: name, description
      scripts/             # optional supporting files
```

## License

MIT
