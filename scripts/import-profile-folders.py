"""Import only recognized media from the supplied ZIP into the test folder library."""
import re
import stat
import sys
from pathlib import Path, PurePosixPath
from zipfile import ZipFile

source = Path(sys.argv[1])
target = Path(__file__).resolve().parents[1] / 'test-data' / 'personas'
extensions = {'.jpg', '.jpeg', '.png', '.webp', '.avif', '.mp4', '.webm'}
groups = {}
with ZipFile(source) as archive:
    entries = [entry for entry in archive.infolist() if not entry.is_dir()]
    if len(entries) > 10000 or sum(entry.file_size for entry in entries) > 2 * 1024**3:
        raise ValueError('Archive exceeds the import limits')
    for entry in entries:
        parts = PurePosixPath(entry.filename.replace('\\', '/'))
        if parts.is_absolute() or '..' in parts.parts or stat.S_ISLNK(entry.external_attr >> 16):
            raise ValueError('Unsafe archive path')
        person = next((part for part in parts.parts if re.fullmatch(r'persona-\d{4}', part)), None)
        if not person or not 1 <= int(person[-4:]) <= 500 or parts.suffix.lower() not in extensions:
            continue
        if entry.file_size > 50 * 1024**2:
            raise ValueError('Media exceeds 50 MB')
        suffix = parts.parts[parts.parts.index(person) + 1:]
        if len(suffix) == 1:
            kind = 'profile'
        elif len(suffix) == 2 and suffix[0].lower() in ('publicacion', 'publicaciones', 'historias'):
            kind = 'story' if suffix[0].lower() == 'historias' else 'post'
        else:
            continue
        groups.setdefault(person, []).append((kind, entry, parts.suffix.lower()))
    plans = []
    for person, files in sorted(groups.items()):
        profile = [item for item in files if item[0] == 'profile']
        if len(profile) != 1:
            raise ValueError(f'{person}: exactly one profile file is required')
        for index, (kind, entry, extension) in enumerate(sorted(files, key=lambda item: item[1].filename)):
            folder = '' if kind == 'profile' else 'historias' if kind == 'story' else 'publicacion'
            filename = 'perfil' + extension if kind == 'profile' else f'{index:04d}' + extension
            destination = target / person / folder / filename
            if not destination.resolve().is_relative_to(target.resolve()) or destination.exists():
                raise ValueError(f'Unsafe or already existing destination: {destination.name}')
            plans.append((entry, destination))
    for entry, destination in plans:
        destination.parent.mkdir(parents=True, exist_ok=True)
        with archive.open(entry) as incoming, destination.open('xb') as outgoing:
            while chunk := incoming.read(1024 * 1024):
                outgoing.write(chunk)
for number in range(1, 501):
    (target / f'persona-{number:04d}' / 'publicacion').mkdir(parents=True, exist_ok=True)
print(f'Imported {len(groups)} people and {len(plans)} media files into test-data/personas.')
