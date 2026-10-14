/**
 * Comentarios de la Galería de Proyectos FreeQuest.
 *
 * Los comentarios se guardan en la hoja "Comentarios" de esta planilla.
 * Cada comentario entra como "pendiente" y aparece en la web recién cuando
 * alguien cambia la columna Estado a "aprobado".
 *
 * Instalación (una sola vez):
 *  1. Crear una planilla de Google nueva (por ejemplo "Comentarios galería").
 *  2. Extensiones → Apps Script. Borrar lo que haya y pegar este archivo.
 *  3. Agregar un segundo archivo (+ → Secuencia de comandos) llamado "claves" y pegar
 *     el contenido de claves que te pasó Claude (no se sube a GitHub).
 *  4. Ejecutar la función `configurar` y aceptar los permisos.
 *  5. Implementar → Nueva implementación → Tipo: Aplicación web.
 *     Ejecutar como: yo. Quién tiene acceso: Cualquier persona.
 *  6. Copiar la URL de la aplicación web y pasársela a Claude.
 */

const HOJA = 'Comentarios';
const COLUMNAS = ['Fecha', 'Year', 'Proyecto', 'Trabajo', 'Autor', 'Comentario', 'Estado', 'ID archivo'];
const MAX_TEXTO = 500;
const MAX_NOMBRE = 40;

function configurar() {
  // CLAVES_POR_YEAR viene del archivo "claves" (un hash por Year, no la contraseña)
  PropertiesService.getScriptProperties().setProperty('claves', JSON.stringify(CLAVES_POR_YEAR));
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(HOJA) || ss.insertSheet(HOJA);
  sh.getRange(1, 1, 1, COLUMNAS.length).setValues([COLUMNAS]).setFontWeight('bold');
  sh.setFrozenRows(1);
  const estado = SpreadsheetApp.newDataValidation().requireValueInList(['pendiente', 'aprobado', 'rechazado'], true).build();
  sh.getRange(2, 7, sh.getMaxRows() - 1, 1).setDataValidation(estado);
  sh.setColumnWidth(6, 420);
}

function claveValida_(year, clave) {
  const claves = JSON.parse(PropertiesService.getScriptProperties().getProperty('claves') || '{}');
  return !!claves[year] && claves[year] === clave;
}

function json_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function filas_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(HOJA);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, COLUMNAS.length).getValues();
}

// GET ?accion=listar&year=8&clave=...           -> comentarios aprobados del Year
// GET ?accion=contar&year=8&clave=...           -> { idArchivo: cantidad }
function doGet(e) {
  const p = e.parameter;
  const year = String(p.year || '');
  if (!claveValida_(year, p.clave)) return json_({ ok: false, error: 'clave' });
  const aprobados = filas_().filter((r) => String(r[1]) === year && r[6] === 'aprobado');
  if (p.accion === 'contar') {
    const cuenta = {};
    aprobados.forEach((r) => { cuenta[r[7]] = (cuenta[r[7]] || 0) + 1; });
    return json_({ ok: true, cuenta: cuenta });
  }
  const lista = aprobados
    .filter((r) => !p.archivo || r[7] === p.archivo)
    .map((r) => ({ fecha: r[0], autor: r[4], texto: r[5], archivo: r[7] }));
  return json_({ ok: true, comentarios: lista });
}

// POST (texto JSON): { year, clave, archivo, proyecto, trabajo, autor, texto }
function doPost(e) {
  let d;
  try { d = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'formato' }); }
  const year = String(d.year || '');
  if (!claveValida_(year, d.clave)) return json_({ ok: false, error: 'clave' });
  const autor = String(d.autor || '').trim().slice(0, MAX_NOMBRE);
  const texto = String(d.texto || '').trim().slice(0, MAX_TEXTO);
  if (!autor || !texto || !d.archivo) return json_({ ok: false, error: 'vacio' });
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = SpreadsheetApp.getActive().getSheetByName(HOJA);
    // "'" adelante evita que la planilla interprete el texto como fórmula
    sh.appendRow([new Date(), year, "'" + String(d.proyecto || '').slice(0, 120), "'" + String(d.trabajo || '').slice(0, 160),
      "'" + autor, "'" + texto, 'pendiente', String(d.archivo).slice(0, 80)]);
  } finally {
    lock.releaseLock();
  }
  return json_({ ok: true });
}
