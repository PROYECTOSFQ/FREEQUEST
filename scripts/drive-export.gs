/**
 * Exporta el listado de proyectos de Drive a JSON (projects.source.json).
 *
 * Cómo usarlo:
 *  1. Ir a https://script.google.com con la cuenta admin@freequestacademy.com
 *     y crear un proyecto nuevo.
 *  2. Pegar este archivo y ejecutar la función `exportarProyectos`.
 *  3. Se crea en "Mi unidad" un archivo "projects.source.json".
 *     Descargarlo y copiarlo a data/projects.source.json en este repositorio.
 *  4. Correr `node scripts/build.mjs` y publicar.
 */

// ID de la carpeta "01. PROYECTOS REALIZADOS POR ALUMNOS" (lo que va después de
// /folders/ en la URL). Pegalo solo en script.google.com, no en este archivo del repo.
const ROOT_FOLDER_ID = 'PEGAR_ACA_EL_ID_DE_LA_CARPETA'; // no subir el ID real a GitHub

// Archivos que no son trabajos de alumnos (devoluciones, rúbricas, etc.)
const SKIP = /^(devoluci[oó]n|rubrica|r[uú]brica|actividades repaso)/i;

function exportarProyectos() {
  const years = {};
  for (let y = 1; y <= 12; y++) years[String(y)] = [];

  const destacados = [];
  const yearFolders = DriveApp.getFolderById(ROOT_FOLDER_ID).getFolders();
  while (yearFolders.hasNext()) {
    const yf = yearFolders.next();
    // "PROYECTOS DESTACADOS": página pública, una carpeta por proyecto
    if (/destacados/i.test(yf.getName())) {
      const tfs = yf.getFolders();
      while (tfs.hasNext()) {
        const tf = tfs.next();
        destacados.push({ title: tf.getName().trim(), folderId: tf.getId(), items: listFiles_(tf, null) });
      }
      continue;
    }
    const m = yf.getName().trim().match(/^Y(?:EAR)?\s*(\d{1,2})$/i); // "Y7", "YEAR 7 "
    if (!m || !years[m[1]]) continue;
    const topics = years[m[1]];

    const loose = listFiles_(yf, null);
    if (loose.length) topics.push({ title: 'Otros proyectos', folderId: yf.getId(), items: loose });

    const topicFolders = yf.getFolders();
    while (topicFolders.hasNext()) {
      const tf = topicFolders.next();
      const items = listFiles_(tf, null);
      // Subcarpetas (por ejemplo, una por alumno)
      const subs = tf.getFolders();
      while (subs.hasNext()) {
        const sf = subs.next();
        collect_(sf, sf.getName(), items, 2);
      }
      topics.push({ title: tf.getName().trim(), folderId: tf.getId(), items: items });
    }
  }

  const json = JSON.stringify({ generated: new Date().toISOString(), years: years, destacados: destacados }, null, 2);
  const name = 'projects.source.json';
  const existing = DriveApp.getRootFolder().getFilesByName(name);
  if (existing.hasNext()) existing.next().setContent(json);
  else DriveApp.getRootFolder().createFile(name, json, 'application/json');
  Logger.log('Listo: ' + name + ' actualizado en Mi unidad');
}

function collect_(folder, student, items, depth) {
  listFiles_(folder, student).forEach(function (f) { items.push(f); });
  if (depth <= 0) return;
  const subs = folder.getFolders();
  while (subs.hasNext()) collect_(subs.next(), student, items, depth - 1);
}

function listFiles_(folder, student) {
  const out = [];
  const files = folder.getFiles();
  while (files.hasNext()) {
    const f = files.next();
    const mime = f.getMimeType();
    if (SKIP.test(f.getName()) || mime === 'application/vnd.google-apps.shortcut') continue;
    const item = { name: f.getName(), id: f.getId(), mimeType: mime };
    if (student) item.student = student;
    out.push(item);
  }
  return out;
}

/**
 * Opcional: deja todos los trabajos como "Cualquier persona con el enlace
 * puede ver", necesario para que se vean dentro de la galería sin pedir
 * iniciar sesión en Google. Revisar antes con la dirección de la escuela.
 */
function compartirTrabajosConEnlace() {
  const yearFolders = DriveApp.getFolderById(ROOT_FOLDER_ID).getFolders();
  while (yearFolders.hasNext()) share_(yearFolders.next(), 4);
}

function share_(folder, depth) {
  const files = folder.getFiles();
  while (files.hasNext()) {
    const f = files.next();
    try { f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { Logger.log(f.getName() + ': ' + e); }
  }
  if (depth <= 0) return;
  const subs = folder.getFolders();
  while (subs.hasNext()) share_(subs.next(), depth - 1);
}
