"""Package an already-built extension for unpacked testing and the Web Store."""
from pathlib import Path
import json
import zipfile

root = Path(__file__).resolve().parents[2]
dist = root / 'extension' / 'dist'
version = json.loads((dist / 'manifest.json').read_text())['version']
output = root / 'releases'
output.mkdir(exist_ok=True)
for store in (False, True):
    target = output / f'youtube-subtitles-{version}-{"store" if store else "test"}.zip'
    with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        for source in sorted(dist.rglob('*')):
            if not source.is_file() or source.suffix == '.map' or source.name == 'source.png':
                continue
            name = source.relative_to(dist).as_posix()
            if store and name == 'manifest.json':
                manifest = json.loads(source.read_text())
                manifest.pop('key', None)
                archive.writestr(name, json.dumps(manifest, indent=2) + '\n')
            else:
                archive.write(source, name)
    with zipfile.ZipFile(target) as archive:
        assert archive.testzip() is None
        manifest = json.loads(archive.read('manifest.json'))
        assert manifest['version'] == version
        assert ('key' in manifest) == (not store)
        for name in ('background.js', 'content.js', 'sidepanel.html', 'welcome.html', 'welcome.js'):
            assert name in archive.namelist()
    print(target)
