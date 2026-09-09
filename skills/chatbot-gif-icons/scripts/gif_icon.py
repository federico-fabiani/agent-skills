#!/usr/bin/env python3
"""Generate small, seamlessly-looping animated GIF icons for AI chatbot UIs
(thinking/typing/status indicators). Zero deps beyond Pillow.

Usage:
    python gif_icon.py --style twinkle-spark --out thinking.gif
    python gif_icon.py --style orbit-dots --fg "#c56d49" --bg "#181822" --out typing.gif
    python gif_icon.py --style pulse-ring --size 96 --frames 10 --delay 100 --out pulse.gif
    python gif_icon.py --style squash-blob --bg transparent --out blob.gif

Run with --help for the full flag list.
"""
import argparse
import math
import os
import sys

from PIL import Image, ImageDraw

CHROMA_KEY = (255, 0, 255)  # reserved color for transparency punch-through


# ---------------------------------------------------------------------------
# Easing — a plain sine pulse has no character in only 6-10 frames. A back/
# spring easing (slight undershoot before the extreme, slight overshoot after)
# reads as "alive" instead of "mechanical" at low frame counts.
# ---------------------------------------------------------------------------
def ease_in_out_back(x, c1=1.70158):
    c2 = c1 * 1.525
    if x < 0.5:
        return (pow(2 * x, 2) * ((c2 + 1) * 2 * x - c2)) / 2
    t = 2 * x - 2
    return (pow(t, 2) * ((c2 + 1) * (x * 2 - 2) + c2) + 2) / 2


def ease_in_out_sine(x):
    return -(math.cos(math.pi * x) - 1) / 2


def spring_pulse(t, min_v=0.0, max_v=1.0):
    """t in [0,1) -> value cycling max -> min -> max once, with spring overshoot."""
    if t < 0.5:
        u = ease_in_out_back(t / 0.5)
        return max_v - (max_v - min_v) * u
    u = ease_in_out_back((t - 0.5) / 0.5)
    return min_v + (max_v - min_v) * u


def hex_to_rgb(s):
    s = s.lstrip("#")
    return tuple(int(s[i : i + 2], 16) for i in (0, 2, 4))


# ---------------------------------------------------------------------------
# Shape presets. Each returns a list of RGBA PIL Images, one per frame,
# rendered at `size * supersample` and downscaled for anti-aliasing.
# ---------------------------------------------------------------------------
def draw_star(draw, cx, cy, outer_r, inner_r, points, fill, rotation=0.0):
    verts = []
    for i in range(points * 2):
        ang = rotation + i * math.pi / points
        r = outer_r if i % 2 == 0 else inner_r
        verts.append((cx + r * math.sin(ang), cy - r * math.cos(ang)))
    draw.polygon(verts, fill=fill)


def style_twinkle_spark(n, size, fg, bg, points=6, min_scale=0.05, rotation_deg=0.0):
    """The pattern reverse-engineered from the Claude Code 'thinking' icon:
    a spark/asterisk that scales down to almost nothing and pops back with a
    slight spring overshoot. NOT a 3D rotation — width and height shrink
    together (aspect ratio stays ~1 the whole time)."""
    frames = []
    cx = cy = size / 2
    base_outer = size * 0.36
    base_inner = base_outer * 0.34
    rot = math.radians(rotation_deg)
    for i in range(n):
        t = i / n
        s = spring_pulse(t, min_v=min_scale, max_v=1.0)
        img = Image.new("RGBA", (size, size), bg)
        d = ImageDraw.Draw(img)
        draw_star(d, cx, cy, base_outer * s, base_inner * s, points, fg, rotation=rot)
        frames.append(img)
    return frames


def style_orbit_dots(n, size, fg, bg, dots=3, min_scale=0.55):
    """Classic three-dot 'typing…' indicator: dots pulse in sequence, each
    offset by 1/dots of the loop, so exactly one dot is 'active' at a time."""
    frames = []
    cy = size / 2
    spacing = size * 0.22
    x0 = size / 2 - spacing * (dots - 1) / 2
    r = size * 0.09
    for i in range(n):
        t = i / n
        img = Image.new("RGBA", (size, size), bg)
        d = ImageDraw.Draw(img)
        for k in range(dots):
            phase = (t - k / dots) % 1.0
            s = spring_pulse(phase, min_v=min_scale, max_v=1.0)
            cx = x0 + k * spacing
            d.ellipse([cx - r * s, cy - r * s, cx + r * s, cy + r * s], fill=fg)
        frames.append(img)
    return frames


def style_pulse_ring(n, size, fg, bg, rings=1, width_frac=0.10):
    """A ring expands from the center and fades out — radar/ripple 'processing'
    cue. Good when you want motion that reads at a glance without a static
    resting shape (pair it with a static logo underneath in the real UI)."""
    frames = []
    cx = cy = size / 2
    max_r = size * 0.46
    min_r = size * 0.08
    lw = max(1, int(size * width_frac))
    for i in range(n):
        t = i / n
        u = ease_in_out_sine(t)
        r = min_r + (max_r - min_r) * u
        alpha = int(255 * (1 - u) ** 1.4)
        img = Image.new("RGBA", (size, size), bg)
        d = ImageDraw.Draw(img)
        col = (*fg[:3], alpha) if len(fg) == 3 else fg
        d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=col, width=lw)
        frames.append(img)
    return frames


def style_squash_blob(n, size, fg, bg, squash=0.55):
    """A ball doing a squash-and-stretch bounce in place — reads as
    'working on it' without implying rotation or progress."""
    frames = []
    cx = cy = size / 2
    base_r = size * 0.30
    for i in range(n):
        t = i / n
        s = spring_pulse(t, min_v=0.0, max_v=1.0)
        sx = base_r * (1 + (1 - squash) * s)
        sy = base_r * (1 - (1 - squash) * s * 0.6)
        img = Image.new("RGBA", (size, size), bg)
        d = ImageDraw.Draw(img)
        d.ellipse([cx - sx, cy - sy, cx + sx, cy + sy], fill=fg)
        frames.append(img)
    return frames


STYLES = {
    "twinkle-spark": style_twinkle_spark,
    "orbit-dots": style_orbit_dots,
    "pulse-ring": style_pulse_ring,
    "squash-blob": style_squash_blob,
}


# ---------------------------------------------------------------------------
# Assembly: supersample -> downscale (AA) -> shared palette -> GIF
# ---------------------------------------------------------------------------
def render(style, n, size, supersample, fg, bg, transparent, **kw):
    big = size * supersample
    fn = STYLES[style]
    # Anti-alias against real alpha=0, not the chroma key directly — blending
    # edge pixels toward magenta and only punching out the exact chroma-key
    # color afterwards leaves a visible magenta fringe (edge pixels are
    # magenta/fg *blends*, not pure magenta). Real alpha lets us binarize
    # transparency after resize instead, with zero color bleed.
    render_bg = (0, 0, 0, 0) if transparent else bg
    frames_big = fn(n, big, fg, render_bg, **kw)
    frames = []
    for f in frames_big:
        small = f.resize((size, size), Image.LANCZOS)
        if transparent:
            alpha_mask = small.getchannel("A").point(lambda v: 255 if v >= 128 else 0)
            flat = Image.new("RGB", small.size, CHROMA_KEY)
            flat.paste(small.convert("RGB"), mask=alpha_mask)
            frames.append(flat)
        else:
            frames.append(small.convert("RGB"))
    return frames


def to_gif_frames(frames, transparent):
    """Build a single shared palette across all frames (no per-frame flicker)
    and remap every frame onto it. Icon-sized renders (a couple of flat
    colors plus AA gradient) almost always fit under 256 unique colors, so
    we build an *exact* palette by direct lookup instead of quantizing —
    quantize(palette=...) is approximate even for exact matches, which is
    fatal for chroma-key transparency."""
    all_colors = []
    seen = set()
    for f in frames:
        for c in f.getdata():
            if c not in seen:
                seen.add(c)
                all_colors.append(c)

    if transparent and CHROMA_KEY not in seen:
        all_colors.insert(0, CHROMA_KEY)
        seen.add(CHROMA_KEY)

    if len(all_colors) <= 256:
        palette = all_colors
        color_to_idx = {c: i for i, c in enumerate(palette)}
        pal_flat = [v for c in palette for v in c] + [0] * (256 * 3 - len(palette) * 3)
        out = []
        for f in frames:
            p = Image.new("P", f.size)
            p.putpalette(pal_flat)
            p.putdata([color_to_idx[c] for c in f.getdata()])
            out.append(p)
        chroma_idx = color_to_idx.get(CHROMA_KEY) if transparent else None
        return out, chroma_idx

    # Fallback for busy/high-color renders (large size, many gradient
    # shades): approximate quantization. Transparent-edge fringing is
    # possible here — prefer a solid --bg for anything this colorful.
    strip = Image.new("RGB", (frames[0].width * len(frames), frames[0].height))
    for i, f in enumerate(frames):
        strip.paste(f, (i * f.width, 0))
    colors = 32 if transparent else 128
    pal_img = strip.quantize(colors=colors, method=Image.MEDIANCUT)
    dither = Image.Dither.NONE if transparent else Image.Dither.FLOYDSTEINBERG
    out = [f.quantize(palette=pal_img, dither=dither) for f in frames]
    chroma_idx = None
    if transparent:
        pal = pal_img.getpalette()
        for idx in range(len(pal) // 3):
            if tuple(pal[idx * 3 : idx * 3 + 3]) == CHROMA_KEY:
                chroma_idx = idx
                break
    return out, chroma_idx


def save_gif(frames_p, out_path, delay_ms, transparent, chroma_idx):
    kwargs = dict(
        save_all=True,
        append_images=frames_p[1:],
        duration=delay_ms,
        loop=0,
        disposal=2,
        # optimize=True lets Pillow re-map/drop unused palette entries per
        # frame, which silently invalidates a fixed `transparency` index —
        # so it must stay off whenever we rely on that index.
        optimize=not transparent,
    )
    if transparent and chroma_idx is not None:
        kwargs["transparency"] = chroma_idx
    frames_p[0].save(out_path, **kwargs)


def save_contact_sheet(frames, out_path, label_every=1):
    tile = frames[0].width
    sheet = Image.new("RGB", (tile * len(frames), tile), (30, 30, 30))
    for i, f in enumerate(frames):
        sheet.paste(f, (i * tile, 0))
    sheet.save(out_path)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--style", choices=sorted(STYLES), default="twinkle-spark")
    ap.add_argument("--size", type=int, default=64, help="final canvas size in px (square). Default 64.")
    ap.add_argument("--supersample", type=int, default=4, help="render scale before downscale, for AA. Default 4.")
    ap.add_argument("--frames", type=int, default=8, help="frame count. Default 8 (sweet spot: 6-10).")
    ap.add_argument("--delay", type=int, default=120, help="ms per frame. Default 120 (~1s loop @ 8 frames).")
    ap.add_argument("--fg", default="#c56d49", help="foreground/accent hex color.")
    ap.add_argument("--bg", default="#181822", help="background hex color, or 'transparent'.")
    ap.add_argument("--points", type=int, default=6, help="[twinkle-spark] star point count.")
    ap.add_argument("--min-scale", type=float, default=0.05, help="[twinkle-spark/squash-blob] minimum scale factor.")
    ap.add_argument("--rotation-deg", type=float, default=0.0, help="[twinkle-spark] static rotation of the star.")
    ap.add_argument("--dots", type=int, default=3, help="[orbit-dots] number of dots.")
    ap.add_argument("--out", default=None, help="output .gif path. Defaults to <style>.gif in --dir.")
    ap.add_argument("--dir", default=".", help="output directory. Default: current directory.")
    ap.add_argument("--contact-sheet", action="store_true", help="also write a <name>-sheet.png review strip.")
    args = ap.parse_args()

    transparent = args.bg.strip().lower() == "transparent"
    bg = (0, 0, 0, 0) if transparent else hex_to_rgb(args.bg)
    fg = hex_to_rgb(args.fg)

    kw = {}
    if args.style == "twinkle-spark":
        kw = dict(points=args.points, min_scale=args.min_scale, rotation_deg=args.rotation_deg)
    elif args.style == "orbit-dots":
        kw = dict(dots=args.dots, min_scale=max(args.min_scale, 0.3))
    elif args.style == "squash-blob":
        kw = dict(squash=max(args.min_scale, 0.3))

    frames = render(
        args.style, args.frames, args.size, args.supersample, fg, bg, transparent, **kw
    )
    frames_p, chroma_idx = to_gif_frames(frames, transparent)

    os.makedirs(args.dir, exist_ok=True)
    if args.out:
        out_path = args.out if os.path.isabs(args.out) else os.path.join(args.dir, args.out)
    else:
        out_path = os.path.join(args.dir, f"{args.style}.gif")
    save_gif(frames_p, out_path, args.delay, transparent, chroma_idx)

    loop_ms = args.frames * args.delay
    print(f"saved {os.path.abspath(out_path)}  ({args.frames} frames, {args.size}px, {loop_ms}ms loop, {'transparent' if transparent else 'opaque'} bg)")

    if args.contact_sheet:
        sheet_path = os.path.splitext(out_path)[0] + "-sheet.png"
        save_contact_sheet(frames, sheet_path)
        print(f"saved {os.path.abspath(sheet_path)}")


if __name__ == "__main__":
    sys.exit(main())
