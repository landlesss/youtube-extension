"""Build icon sizes from the approved PNG without changing its artwork."""
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
source = root / "icons" / "source.png"
with Image.open(source) as image:
    image = image.convert("RGBA")
    for size in (16, 48, 128):
        image.resize((size, size), Image.Resampling.LANCZOS).save(root / "icons" / f"icon{size}.png")
    image.save(root.parent / "docs" / "logo.png")
