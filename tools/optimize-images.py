"""Generate static, browser-cacheable WebP assets. Run: py tools/optimize-images.py.

Originals remain available for explicit full-size viewing. Requires Pillow only
when regenerating assets; the deployed app needs no image service or build step.
"""
import csv
import json
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'photos' / 'optimized'
OUTPUT.mkdir(exist_ok=True)
manifest = {}
with (ROOT / 'src' / 'trees.csv').open(encoding='utf-8-sig', newline='') as source:
    for row in csv.DictReader(source):
        name = row['Photo Filename'].strip()
        if not name:
            continue
        original = ROOT / 'photos' / name
        if not original.is_file():
            print(f'Missing original: {name}')
            continue
        variants = {}
        with Image.open(original) as source_image:
            image = ImageOps.exif_transpose(source_image).convert('RGB')
            for size in (160, 320, 640, 1280):
                target = OUTPUT / f'{original.stem}-{size}.webp'
                if not target.exists() or target.stat().st_mtime < original.stat().st_mtime:
                    if size == 160:
                        variant = ImageOps.fit(image, (size, size), Image.Resampling.LANCZOS)
                    else:
                        variant = image.copy()
                        variant.thumbnail((size, size), Image.Resampling.LANCZOS)
                    variant.save(target, 'WEBP', quality=78, method=6)
                variants[str(size)] = target.relative_to(ROOT).as_posix()
            # The supplied posters share a left-hand photographic panel.
            # Crop only list/supporting thumbnails; never alter the full poster.
            width, height = image.size
            photo = image.crop((round(width*.035), round(height*.23), round(width*.49), round(height*.94)))
            for size in (160, 320):
                target = OUTPUT / f'{original.stem}-photo-{size}.webp'
                if not target.exists() or target.stat().st_mtime < original.stat().st_mtime:
                    ImageOps.fit(photo, (size, size), Image.Resampling.LANCZOS).save(target, 'WEBP', quality=80, method=6)
                variants[f'photo{size}'] = target.relative_to(ROOT).as_posix()
        manifest[original.relative_to(ROOT).as_posix()] = variants
(OUTPUT / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
print(f'Generated variants for {len(manifest)} trees; {sum(p.stat().st_size for p in OUTPUT.glob("*.webp")) / 1e6:.2f} MB total')
