# Galería de Proyectos · FreeQuest Academy

Una web donde los alumnos ven los proyectos de sus compañeros **sin entrar a Drive**.
Los proyectos se organizan por Year (Y1 a Y12) y **cada Year tiene su propia contraseña**.
Un alumno de Year 1 no puede ver los proyectos de Year 12, y al revés.

- **Portada** con los colores de la marca (azul `#051e35`, dorado `#f1bc70`, crema `#f6f2ea`, violeta `#4b489c`),
  basada en el diseño de Canva "Mirá lo que crean tus compañeros".
- **Mapa de proyectos con zoom (estilo Prezi):** el Year queda en el centro y los proyectos giran a su alrededor.
  Tocando un proyecto la cámara se acerca y aparecen los trabajos de cada alumno.
  Las flechas ‹ › (o las del teclado) recorren los proyectos uno por uno, como una presentación.
- **Visor integrado:** cada trabajo (PDF, Docs, Slides, imágenes, videos) se abre dentro de la web, y se puede
  pasar al siguiente sin salir.
- **Vista lista** con buscador por proyecto o por alumno.
- **Proyectos destacados** (`#destacados`), públicos y sin contraseña. Salen de la carpeta
  "PROYECTOS DESTACADOS" de Drive: una carpeta por proyecto y archivos nombrados
  "Nombre Apellido - YEAR 12". Para sumar una descripción, en Drive: clic derecho en el archivo →
  Información del archivo → Detalles → Descripción.
- **Portada de cada Year** con su propio enlace para mandar a cada grupo, por ejemplo
  `https://proyectosfq.github.io/FREEQUEST/#year-8`. La tarjeta del Year se da vuelta para poner la contraseña.

## Estructura

```
site/                  -> la web que se publica (HTML/CSS/JS, sin dependencias)
  data/year-N.json     -> datos de cada Year, CIFRADOS con su contraseña
scripts/build.mjs      -> genera site/data/ a partir del listado de Drive
scripts/drive-export.gs-> Apps Script que lista las carpetas de Drive
data/projects.source.json  (NO se sube) listado sin cifrar
config/passwords.json      (NO se sube) contraseñas de cada Year
```

## Cómo funcionan las contraseñas

Los datos de cada Year (nombres de proyectos, de alumnos y enlaces a Drive) se cifran con AES-256-GCM usando
una clave derivada de la contraseña del Year (PBKDF2-SHA256, 250.000 iteraciones). El servidor nunca tiene la
contraseña: el navegador del alumno descifra los datos solamente si la contraseña es correcta.
La contraseña queda recordada mientras la pestaña esté abierta; el botón **Salir** la olvida.

> Es una protección adecuada para separar Years en una escuela. Para más seguridad, usá contraseñas largas.

## Actualizar los proyectos (cuando se suben trabajos nuevos a Drive)

1. Abrí <https://script.google.com> con la cuenta admin, creá un proyecto, pegá `scripts/drive-export.gs`
   y ejecutá `exportarProyectos`. Se crea `projects.source.json` en *Mi unidad*.
2. Descargalo y copialo a `data/projects.source.json`.
3. Ejecutá `node scripts/build.mjs` (necesita Node 18 o superior).
4. Subí los cambios de `site/data/` a la rama `claude/freequest-projects-gallery-7v6h43`. La web se publica sola (GitHub Pages).

La carpeta de Drive que se lee es **"11. Proyectos realizados por alumnos"**, con una subcarpeta por Year
(`Y1` … `Y12`) y dentro una carpeta por proyecto. Si una carpeta de proyecto tiene subcarpetas, se toman como
el nombre del alumno.

## Cambiar contraseñas

- Editá `config/passwords.json` (por ejemplo `"5": "mi-clave-nueva"`) y corré `node scripts/build.mjs`.
- Para generar todas de nuevo al azar: `node scripts/build.mjs --new-passwords`.
- Guardá `config/passwords.json` en un lugar seguro (no se sube al repositorio).

## Importante: permisos de Drive

Para que los trabajos se vean dentro de la web, cada archivo tiene que poder verse con el enlace:

- **Opción A (recomendada si los alumnos tienen cuenta @freequestacademy.com):** compartir la carpeta
  "11. Proyectos realizados por alumnos" con *FreeQuest Academy → cualquiera con el enlace*.
  Los alumnos tienen que estar con su cuenta de la escuela iniciada en el navegador.
- **Opción B:** "Cualquier persona con el enlace puede ver". La función `compartirTrabajosConEnlace`
  del Apps Script lo hace para todos los archivos de una vez. Los enlaces solo aparecen en la web después de
  ingresar la contraseña del Year.

Si un archivo no tiene permiso, la tarjeta muestra un ícono en lugar de la miniatura y el visor de Google
pide acceso.

## Publicar

Activá GitHub Pages en *Settings → Pages → Source: GitHub Actions*. El workflow
`.github/workflows/pages.yml` publica la carpeta `site/` cada vez que cambia en la rama `claude/freequest-projects-gallery-7v6h43`.
También se puede subir la carpeta `site/` tal cual a cualquier hosting estático (Netlify, Vercel, Hostinger, etc.).

Para probarla en tu computadora: `cd site && python3 -m http.server 8000` y abrir <http://localhost:8000>.
