"""Copy the shared Stock Lens code into the iPhone project, and draw the app icons.

Run this before every iPhone build (from the stock-lens folder or the ios folder):
    python ios/sync.py

It copies:
    ../app     -> ios/src/app            (the Python server)
    ../static  -> ios/src/slweb/static   (the web page)
so there is still only one copy of Stock Lens to edit, same as the Android build.
Icons need Pillow (pip install pillow); if it's missing the icons are skipped.
"""
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(HERE, "src")


def copy_tree(src, dst):
    if os.path.isdir(dst):
        shutil.rmtree(dst)
    shutil.copytree(src, dst, ignore=shutil.ignore_patterns("__pycache__", "*.pyc", "*.tmp"))


def sync_code():
    copy_tree(os.path.join(ROOT, "app"), os.path.join(SRC, "app"))
    web = os.path.join(SRC, "slweb")
    os.makedirs(web, exist_ok=True)
    with open(os.path.join(web, "__init__.py"), "w", encoding="utf-8") as f:
        f.write('"""Holds the Stock Lens web page (static/) inside the iPhone app."""\n')
    copy_tree(os.path.join(ROOT, "static"), os.path.join(web, "static"))
    print("copied app/ and static/ into ios/src")


# Sizes Briefcase asks for on iOS (points x scale, plus the 1024 App Store icon).
ICON_SIZES = [20, 29, 40, 58, 60, 76, 80, 87, 120, 152, 167, 180, 1024]


def draw_icon(px):
    """The Stock Lens search-bar icon: white rounded bar, blue magnifier, one grey text line, on blue.
    Same design as the Android icon (android/app/src/main/res/drawable/ic_lens.xml)."""
    from PIL import Image, ImageDraw

    s = 4  # draw big, then shrink, for smooth edges
    W = px * s
    img = Image.new("RGB", (W, W))
    top, bottom = (0x29, 0x97, 0xFF), (0x00, 0x58, 0xB9)
    d = ImageDraw.Draw(img)
    for y in range(W):  # blue gradient, lighter at the top
        t = y / max(1, W - 1)
        d.line([(0, y), (W, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(top, bottom)))
    u = W / 72  # the Android icon's visible area is 72 units wide (x 18..90)
    x = lambda v: (v - 18) * u
    # the bar: x 28..80, y 39..69
    d.rounded_rectangle([x(28), x(39), x(80), x(69)], radius=15 * u, fill="white")
    blue, grey, lw = (0x00, 0x71, 0xE3), (0xB9, 0xCC, 0xE6), max(1, round(3.6 * u))
    d.ellipse([x(44 - 6.5), x(53 - 6.5), x(44 + 6.5), x(53 + 6.5)], outline=blue, width=lw)
    d.line([x(48.8), x(57.8), x(53), x(62)], fill=blue, width=lw)
    d.line([x(59), x(54), x(70), x(54)], fill=grey, width=lw)
    for cx, cy in ((53, 62), (59, 54), (70, 54)):  # round line ends
        r = lw / 2
        d.ellipse([x(cx) - r, x(cy) - r, x(cx) + r, x(cy) + r], fill=blue if cx == 53 else grey)
    return img.resize((px, px), Image.LANCZOS)


def make_icons():
    try:
        import PIL  # noqa: F401
    except ImportError:
        print("Pillow not installed: skipping icons (pip install pillow)")
        return
    out = os.path.join(HERE, "resources")
    os.makedirs(out, exist_ok=True)
    for px in ICON_SIZES:
        draw_icon(px).save(os.path.join(out, f"stocklens-{px}.png"))
    print(f"drew {len(ICON_SIZES)} icons in ios/resources")


if __name__ == "__main__":
    sync_code()
    if "--no-icons" not in sys.argv:
        make_icons()
