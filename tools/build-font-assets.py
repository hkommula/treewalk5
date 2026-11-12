"""Subset the OFL Montserrat variable fonts downloaded to .qa/font-source.
Requires fontTools when regenerating; deployed files need no font service.
"""
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
for name in ('Montserrat', 'Montserrat-Italic'):
    font = TTFont(ROOT / '.qa/font-source' / f'{name}.ttf')
    options = subset.Options()
    options.layout_features = ['*']
    worker = subset.Subsetter(options=options)
    worker.populate(unicodes=list(range(32, 512)) + list(range(8192, 8448)) + [0x2190, 0x2192, 0x2193, 0x2191, 0x2713])
    worker.subset(font)
    font.flavor = 'woff'
    target = ROOT / 'src/fonts' / f'{name}.woff'
    font.save(target)
    print(f'{target.name}: {target.stat().st_size:,} bytes')
