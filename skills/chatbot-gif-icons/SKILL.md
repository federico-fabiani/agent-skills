---
name: chatbot-gif-icons
description: Generate small, seamlessly-looping animated GIF status icons for AI chatbot UIs (thinking/typing/processing indicators). Use whenever the user asks for a "thinking" spinner, typing indicator, loading/processing icon, or any small looping GIF/animated favicon meant to sit next to or inside a chat interface.
metadata:
  author: federico-fabiani
  version: "1.0.0"
---

# Chatbot GIF icons — peculiar looping status indicators

Generates small square animated GIFs for chat UI "the assistant is doing something" cues.
Design rules below come from reverse-engineering an actual product icon (see §5); the
generator script implements them directly so the defaults already look right.

Script: `scripts/gif_icon.py`, next to this file. Examples below write it as `$ICON` —
substitute the real absolute path (in Claude Code that's normally
`~/.claude/skills/chatbot-gif-icons/scripts/gif_icon.py`).

**Dependency**: Pillow. Check with `python -c "import PIL"`; if missing, `pip install pillow`.
No other install — pure stdlib + Pillow, no ffmpeg/node/browser needed.

## 1. Basic usage

```bash
python $ICON --style twinkle-spark --out thinking.gif
python $ICON --style orbit-dots --fg "#c56d49" --bg "#181822" --out typing.gif
python $ICON --style pulse-ring --size 96 --frames 10 --delay 100 --out pulse.gif
python $ICON --style squash-blob --bg transparent --out blob.gif
```

Flags: `--style` · `--size` · `--frames` · `--delay` · `--fg` · `--bg` (hex, or `transparent`)
· `--out` · `--dir` · `--contact-sheet` (also writes a `<name>-sheet.png` review strip)
· style-specific: `--points`/`--rotation-deg` (twinkle-spark) · `--dots` (orbit-dots) ·
`--min-scale` (twinkle-spark/squash-blob minimum size)

Full flag reference: `python $ICON --help`.

## 2. Styles

| Style | Look | Best for |
|---|---|---|
| `twinkle-spark` **(default)** | N-pointed spark/asterisk that shrinks almost to a point and pops back with a spring overshoot | generic "AI is thinking" — this is the pattern most AI product spinners actually use |
| `orbit-dots` | classic three-dot row, each dot pulsing in sequence | "typing…" / message composing |
| `pulse-ring` | a ring expands from center and fades out | background "processing" cue layered under a static logo |
| `squash-blob` | a ball doing a squash-and-stretch bounce in place | lighter-weight "working on it" without directional motion |

Ask which style fits the product before generating if it isn't obvious — they read very
differently in a UI (spark = "AI magic", dots = "composing", ring = "background work").

## 3. Design rules (why the defaults are what they are)

These came out of literally measuring an existing "thinking" icon frame-by-frame
(see §5) — don't override them without a reason:

- **Tiny canvas, rendered big.** Final size is usually 16–64px in the actual UI, but the
  script renders at `size × supersample` (default 4×) and downscales with Lanczos for
  clean anti-aliasing — never draw directly at the final small size.
- **Few frames: 6–10.** More frames don't read as smoother at this size/duration, they just
  bloat the file and slow down noticing the loop. Default 8.
- **Short loop: ~0.8–1.2s.** Default 8 frames × 120ms = 960ms. Long enough to register as
  an animation, short enough to not feel laggy.
- **Non-linear "spring" easing, not linear or plain ease-in-out.** A plain sine pulse looks
  mechanical at 8 frames. A back/spring ease (slight undershoot before an extreme, slight
  overshoot after) reads as "alive" — this is `ease_in_out_back` in the script, applied via
  `spring_pulse()`. Use it as the default timing function for any new custom style.
- **Scale, not rotation, for a single flat glyph.** A flat 2D shape "spinning" by shrinking
  toward a line only looks like real 3D rotation if width shrinks while height stays put.
  If both shrink together (aspect ratio stays ~1), it reads as pulsing/twinkling, not
  spinning — verify this if you're tempted to fake a 3D flip with `scaleX` alone; measure
  both dimensions before claiming an icon "rotates".
- **Tight, near-flat palette.** A couple of solid colors plus the AA gradient between them.
  Keeps file size tiny (a few KB) and avoids GIF dithering artifacts.
- **Solid background over transparent, by default.** Transparent GIFs have binary
  (on/off) alpha — anti-aliased edges either show a color fringe or get hard-thresholded
  (this script hard-thresholds at 50% alpha to avoid the fringe; see the code comments in
  `render()`). A solid badge/background matching the product's chrome, like the source icon
  uses, avoids the tradeoff entirely and is the more polished default. Only reach for
  `--bg transparent` when the icon truly must sit over a varying background.

## 4. Review before delivering

**Always open the generated GIF (or its contact sheet) with the Read tool and look at it**
before calling the task done — same discipline as any generated visual asset:

- Run with `--contact-sheet` and view the resulting `-sheet.png`: does the motion make sense
  frame-to-frame, does it look like it loops cleanly (last frame close to first)?
- For `--bg transparent`, composite a check frame over a light background before trusting it —
  don't just eyeball the raw GIF, magenta fringing is easy to miss at icon size:
  ```python
  from PIL import Image
  im = Image.open("out.gif"); im.seek(0)
  rgba = im.convert("RGBA")
  bg = Image.new("RGBA", rgba.size, (255,255,255,255))
  Image.alpha_composite(bg, rgba).save("check.png")
  ```
- If the motion looks off, adjust `--frames`/`--delay`/`--min-scale` and regenerate — this is
  a cheap local script, not a billed API call, so iterate freely.

## 5. Background: where these rules came from

Reverse-engineered from a screen recording of a real "thinking" icon (small square badge,
6-pointed spark, scale-pulse with spring overshoot, 8 frames, ~960ms loop). Two wrong
hypotheses were corrected along the way, which is why §3 states its rules the way it does:
first guess was 10 frames (a naive plateau-count on a noisy measurement — corrected to 8 by
detecting actual frame-boundary jumps instead); second guess was that it "rotated in 3D" (a
width-only measurement — corrected to "scale pulse" once height was measured too and found
to shrink in lockstep with width). Moral for any future reverse-engineering of a UI
animation: measure more than one dimension before concluding it rotates, and prefer
detecting discrete state changes over reading a smoothed curve.

## 6. Extending with a new style

Add a function `style_foo(n, size, fg, bg, **kw)` returning a list of `n` RGBA `PIL.Image`
frames (see the four existing ones in `scripts/gif_icon.py` for the pattern — they're all
short), register it in the `STYLES` dict, and wire any style-specific kwargs through in
`main()`. Reuse `spring_pulse()` for the timing curve unless you have a specific reason not to.
