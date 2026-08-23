"""Generates the extension icon: a glossy blue sphere (matching the
reference screenshot's look) with a white "translate" glyph centered —
the same Languages-style glyph already used in the panel's Translate button,
for visual consistency between the toolbar icon and the extension icon.
"""
import math
import os
from PIL import Image, ImageDraw, ImageFilter

MASTER = 1024
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "icons")


def lerp(a, b, t):
    return a + (b - a) * t


def lerp_color(c1, c2, t):
    return tuple(int(round(lerp(c1[i], c2[i], t))) for i in range(3))


def make_sphere(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    px = img.load()

    cx = cy = size / 2
    radius = size * 0.46  # padding around the circle, like the existing icon

    # Light comes from the upper-left-front, matching the reference image's
    # highlight position.
    light = (-0.55, -0.65, 0.55)
    light_len = math.sqrt(sum(c * c for c in light))
    light = tuple(c / light_len for c in light)

    deep = (10, 25, 66)      # shadowed rim
    mid = (23, 74, 168)      # sphere body
    bright = (92, 176, 255)  # lit face
    hot = (214, 236, 255)    # specular hotspot

    for y in range(size):
        dy = (y - cy) / radius
        for x in range(size):
            dx = (x - cx) / radius
            r2 = dx * dx + dy * dy
            if r2 > 1.0:
                continue
            r = math.sqrt(r2)
            z = math.sqrt(max(0.0, 1.0 - r2))

            # Antialiased edge.
            edge_alpha = 1.0
            edge_band = 1.0 - (size * 0.01) / radius
            if r > edge_band:
                edge_alpha = max(0.0, (1.0 - r) / (1.0 - edge_band))

            diffuse = dx * light[0] + dy * light[1] + z * light[2]
            diffuse = max(0.0, diffuse)

            # Base shading: deep rim -> mid body -> bright lit face.
            if diffuse < 0.55:
                t = diffuse / 0.55
                color = lerp_color(deep, mid, t)
            else:
                t = (diffuse - 0.55) / 0.45
                color = lerp_color(mid, bright, min(1.0, t))

            # Tight specular hotspot for the glossy highlight.
            spec = max(0.0, diffuse) ** 24
            color = lerp_color(color, hot, min(1.0, spec * 1.4))

            # Subtle watery streaks across the surface (soft sine bands),
            # barely visible but adds the "glossy water" texture from the
            # reference without needing a noise library.
            streak = 0.05 * math.sin(6.0 * dx + 3.0 * dy) * z
            color = lerp_color(color, bright, max(0.0, streak))

            # Faint darker rim for sphere definition against the background.
            if r > 0.86:
                rim_t = (r - 0.86) / 0.14
                color = lerp_color(color, deep, rim_t * 0.5)

            px[x, y] = (color[0], color[1], color[2], int(255 * edge_alpha))

    return img


def bezier(p0, p1, p2, p3, steps=40):
    pts = []
    for i in range(steps + 1):
        t = i / steps
        mt = 1 - t
        x = (mt**3) * p0[0] + 3 * (mt**2) * t * p1[0] + 3 * mt * (t**2) * p2[0] + (t**3) * p3[0]
        y = (mt**3) * p0[1] + 3 * (mt**2) * t * p1[1] + 3 * mt * (t**2) * p2[1] + (t**3) * p3[1]
        pts.append((x, y))
    return pts


def draw_thick_polyline(draw: ImageDraw.ImageDraw, points, width, fill):
    r = width / 2
    for i in range(len(points) - 1):
        draw.line([points[i], points[i + 1]], fill=fill, width=int(width))
    for p in points:
        draw.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=fill)


def draw_translate_glyph(img: Image.Image, center, glyph_size, stroke_width, color, compact=False):
    # Lucide "languages" glyph, viewBox 0 0 24 24 — same shape used for the
    # Translate button in the panel's toolbar. At very small sizes the full
    # glyph's left-side curves turn into an illegible smudge, so `compact`
    # keeps only the "A" mountain (the strongest, most legible silhouette)
    # plus a single short tick standing in for the second-language stroke.
    scale = glyph_size / 24.0
    ox, oy = center[0] - glyph_size / 2, center[1] - glyph_size / 2

    def pt(x, y):
        return (ox + x * scale, oy + y * scale)

    draw = ImageDraw.Draw(img)

    if compact:
        # At 16px even two elements blur into a blob — just the bold "A"
        # (centered, enlarged) reads cleanly at that size.
        draw_thick_polyline(draw, [pt(4, 21), pt(12, 3), pt(20, 21)], stroke_width, color)
        draw_thick_polyline(draw, [pt(7.2, 14), pt(16.8, 14)], stroke_width, color)
        return

    # 1. M4 5h7
    draw_thick_polyline(draw, [pt(4, 5), pt(11, 5)], stroke_width, color)

    # 2. M7 3v2 c0 4 -2 7 -5 9
    seg2 = [pt(7, 3), pt(7, 5)]
    seg2 += bezier(pt(7, 5), pt(7, 9), pt(5, 12), pt(2, 14))
    draw_thick_polyline(draw, seg2, stroke_width, color)

    # 3. M3 12 c2 1 4 1 6 0
    seg3 = bezier(pt(3, 12), pt(5, 13), pt(7, 13), pt(9, 12))
    draw_thick_polyline(draw, seg3, stroke_width, color)

    # 4. M13 21 l4-9 4 9
    draw_thick_polyline(draw, [pt(13, 21), pt(17, 12), pt(21, 21)], stroke_width, color)

    # 5. M14.5 18h5
    draw_thick_polyline(draw, [pt(14.5, 18), pt(19.5, 18)], stroke_width, color)


def make_icon(size: int, stroke_ratio: float, sphere_master=None, compact=False) -> Image.Image:
    # The sphere gradient is smooth and resamples fine; render it once at a
    # high resolution and downscale, rather than recomputing per size.
    sphere = sphere_master.resize((size, size), Image.LANCZOS) if sphere_master else make_sphere(size)

    shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    r = size * 0.4
    cx, cy = size / 2, size * 0.58
    sd.ellipse([cx - r, cy - r * 0.5, cx + r, cy + r * 0.5], fill=(0, 10, 40, 140))
    shadow = shadow.filter(ImageFilter.GaussianBlur(max(1, size * 0.05)))

    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.alpha_composite(shadow)
    canvas.alpha_composite(sphere)

    # The glyph is drawn fresh at each target size (not downsampled from a
    # master) so small sizes can use a proportionally bolder stroke — a thin
    # stroke that reads fine at 128px disappears at 16px otherwise.
    glyph_size = size * 0.46
    center = (size / 2, size / 2)
    stroke_width = max(1.6, size * stroke_ratio)

    # Dark navy halo behind the white strokes so the glyph stays legible even
    # where it crosses the sphere's bright highlight — a plain white glyph
    # became nearly invisible there at small sizes.
    halo_width = stroke_width + max(1.2, size * 0.028)
    draw_translate_glyph(canvas, center, glyph_size, halo_width, (8, 20, 56, 235), compact=compact)
    draw_translate_glyph(canvas, center, glyph_size, stroke_width, (255, 255, 255, 255), compact=compact)

    return canvas


if __name__ == "__main__":
    sphere_master = make_sphere(MASTER)
    # Smaller icons get a proportionally bolder stroke to stay legible; 16px
    # also switches to the compact glyph (see draw_translate_glyph).
    ratios = {128: 0.060, 48: 0.090, 16: 0.145}
    compact_sizes = {16}
    for out_size in (128, 48, 16):
        icon = make_icon(out_size, ratios[out_size], sphere_master, compact=out_size in compact_sizes)
        out_path = os.path.join(OUT_DIR, f"icon{out_size}.png")
        icon.save(out_path)
        print(f"saved {out_path}")
