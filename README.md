# agent-skills

Agent skills by [Federico Fabiani](https://github.com/federico-fabiani). Compatible with
[skills.sh](https://skills.sh) — works with Claude Code, Codex, Cursor, and other agents
that read the `SKILL.md` convention.

## Install

Install everything in this repo:

```bash
npx skills add federico-fabiani/agent-skills
```

Or pick a single skill:

```bash
npx skills add federico-fabiani/agent-skills/nano-banana
```

## Skills

| Skill | What it does |
|---|---|
| [`nano-banana`](skills/nano-banana) | Generate and edit images with Google's Gemini image models (Nano Banana), via a zero-dependency Node script. Defaults to the cheap/fast tier and documents when to escalate. Requires a `GEMINI_API_KEY`. |

## Layout

```
skills/
  <skill-name>/
    SKILL.md      # frontmatter: name, description
    scripts/      # optional supporting files
```

## License

MIT
