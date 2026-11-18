"""Pre-shrink the card PNGs so they stay sharp in the game.

Browsers shrink large images on the fly with a fast, blurry filter (especially for
moving or rotated elements). The source PNGs are ~486px wide but shown at 32–64px,
so we resize them here with a high-quality Lanczos filter instead.

Input:  art/cards/*.png          (the original deck, kept out of the site)
Output: public/cards/<width>/*.png for each width in WIDTHS
        (1x/2x/4x of each on-screen card size; the browser picks one via srcset)

Usage (needs Pillow: pip install pillow):
    python scripts/resize-cards.py
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art" / "cards"
OUT = ROOT / "public" / "cards"
WIDTHS = [32, 40, 64, 80, 128, 256]
SKIP = ("X-", "Back-B")  # jokers and the blue back aren't used in the game


def main() -> None:
    sources = sorted(p for p in SRC.glob("*.png") if not p.name.startswith(SKIP))
    if not sources:
        raise SystemExit(f"No PNGs found in {SRC}")
    for width in WIDTHS:
        (OUT / str(width)).mkdir(exist_ok=True)
    for src in sources:
        with Image.open(src) as im:
            im = im.convert("RGBA")
            for width in WIDTHS:
                height = round(im.height * width / im.width)
                small = im.resize((width, height), Image.Resampling.LANCZOS)
                small.save(OUT / str(width) / src.name, optimize=True)
    print(f"Resized {len(sources)} cards to widths {WIDTHS} in {OUT}")


if __name__ == "__main__":
    main()
