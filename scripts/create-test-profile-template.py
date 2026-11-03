"""Create the empty photo package for 400 synthetic test profiles."""
import csv
import io
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


def csv_bytes(headers, rows):
    stream = io.StringIO(newline="")
    writer = csv.writer(stream)
    writer.writerow(headers)
    writer.writerows(rows)
    return stream.getvalue().encode("utf-8-sig")


root = "perfiles-prueba/"
output = Path(__file__).resolve().parents[1] / "artifacts" / "perfiles-prueba-400.zip"
output.parent.mkdir(parents=True, exist_ok=True)
guide = """PLANTILLA PARA 400 PERSONAS DE PRUEBA

1. Extrae este ZIP. Encontrarás las carpetas persona-0001 a persona-0400.
2. Coloca en cada carpeta la foto principal de UNA persona adulta ficticia
   o una persona cuya imagen tengas autorización para este uso.
   Nómbrala perfil.jpg (también se admite preparar perfil.png o perfil.webp).
3. Mantén el identificador y el nombre de la carpeta. No mezcles fotografías
   de distintas personas dentro de una misma carpeta.
4. Puedes dejar nombre, edad, género y ciudad vacíos en datos.csv.
   Son campos pendientes de completar y revisar cuando preparemos los datos.
   Si conoces la edad del modelo o sus características, puedes indicarlas.
   Todas las personas deben ser adultas; no deducimos una edad exacta del rostro.
5. Dentro de cada persona encontrarás una subcarpeta llamada publicacion.
   Coloca allí todas sus imágenes y videos. Puedes usar nombres como foto-01.jpg,
   foto-02.png o video-01.mp4; no es obligatorio renombrar todos los archivos.
   Puedes preparar imágenes JPG, PNG o WebP y videos MP4 o WebM.
   Cada contenido debe mostrar o pertenecer a la misma persona del perfil.
   No hay un número obligatorio de archivos por persona: puedes dejar vacía
   la subcarpeta publicacion cuando esa persona solo tenga foto de perfil.
6. publicaciones.csv es OPCIONAL y contiene únicamente sus encabezados.
   Si deseas indicar cuáles archivos serán historias o agregar textos,
   añade filas con identificador, tipo (publicacion o historia), archivo y texto.
   Ejemplo de ruta: persona-0001/publicacion/video-01.mp4.
   Podemos organizar los 150 contenidos previstos después de recibir tus archivos.
7. Evita direcciones, teléfonos y otros datos personales reales. Puedes anotar
   el proveedor y la licencia de cada imagen en las columnas correspondientes.
8. Al terminar, comprime otra vez la carpeta perfiles-prueba y entrégala como ZIP.

EJEMPLO DE UNA CARPETA COMPLETA
persona-0001/
  perfil.jpg
  publicacion/
    foto-01.jpg
    foto-02.webp
    video-01.mp4

Los CSV son UTF-8 y pueden abrirse en un editor o importarse en Excel eligiendo
coma como separador. No cambies los identificadores persona-NNNN.

Este paquete es una plantilla vacía: no contiene imágenes ni crea cuentas,
contraseñas o publicaciones por sí mismo. El importador ZIP del backoffice
todavía debe implementarse. El número 400 corresponde a las carpetas preparadas.
"""
profiles = []
posts = []
for number in range(1, 401):
    identifier = f"persona-{number:04d}"
    profiles.append([identifier, "", "", "", "", f"{identifier}/perfil.jpg", "", ""])

with ZipFile(output, "w", compression=ZIP_DEFLATED) as archive:
    archive.writestr(root, b"")
    for number in range(1, 401):
        archive.writestr(f"{root}persona-{number:04d}/", b"")
        archive.writestr(f"{root}persona-{number:04d}/publicacion/", b"")
    archive.writestr(root + "LEEME.txt", guide.encode("utf-8-sig"))
    archive.writestr(root + "datos.csv", csv_bytes(
        ["identificador", "nombre", "edad", "genero", "ciudad", "foto_perfil", "fuente", "licencia"], profiles))
    archive.writestr(root + "publicaciones.csv", csv_bytes(
        ["identificador", "tipo", "archivo", "texto"], posts))

with ZipFile(output) as archive:
    assert archive.testzip() is None
    assert sum(entry.is_dir() and entry.filename.startswith(root + "persona-") and entry.filename.count("/") == 2 for entry in archive.infolist()) == 400
    assert sum(entry.is_dir() and entry.filename.endswith("/publicacion/") for entry in archive.infolist()) == 400
    assert len(list(csv.DictReader(io.StringIO(archive.read(root + "datos.csv").decode("utf-8-sig"))))) == 400
    assert len(list(csv.DictReader(io.StringIO(archive.read(root + "publicaciones.csv").decode("utf-8-sig"))))) == 0

print(f"ZIP verificado: {output.name}; 400 personas, cada una con subcarpeta publicacion.")
