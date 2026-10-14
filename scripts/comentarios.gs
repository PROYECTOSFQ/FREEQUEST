/**
 * Comentarios de la Galería de Proyectos FreeQuest.
 *
 * Los comentarios se guardan en la hoja "Comentarios" de esta planilla.
 * Cada comentario entra como "pendiente" y aparece en la web recién cuando
 * se aprueba: desde el mail que llega a AVISAR_A (botones Aprobar / Rechazar)
 * o cambiando la columna Estado a "aprobado" en la planilla.
 *
 * Instalación (una sola vez):
 *  1. Crear una planilla de Google nueva (por ejemplo "Comentarios galería").
 *  2. Extensiones → Apps Script. Borrar lo que haya y pegar este archivo.
 *  3. Agregar un segundo archivo (+ → Secuencia de comandos) llamado "claves" y pegar
 *     el contenido de claves que te pasó Claude (no se sube a GitHub).
 *  4. Ejecutar la función `configurar` y aceptar los permisos (incluye enviar mails).
 *  5. Implementar → Nueva implementación → Tipo: Aplicación web.
 *     Ejecutar como: yo. Quién tiene acceso: Cualquier persona.
 *  6. Copiar la URL de la aplicación web y pasársela a Claude.
 */

const HOJA = 'Comentarios';
const COLUMNAS = ['Fecha', 'Year', 'Proyecto', 'Trabajo', 'Autor', 'Comentario', 'Estado', 'ID archivo', 'Código'];
const MAX_TEXTO = 500;
const MAX_NOMBRE = 40;
// Mail que recibe un aviso con cada comentario nuevo
const AVISAR_A = 'proyectos@freequestacademy.com';

function configurar() {
  // CLAVES_POR_YEAR viene del archivo "claves" (un hash por Year, no la contraseña)
  const props = PropertiesService.getScriptProperties();
  props.setProperty('claves', JSON.stringify(CLAVES_POR_YEAR));
  // Secreto para firmar los botones Aprobar / Rechazar del mail
  if (!props.getProperty('secreto')) props.setProperty('secreto', Utilities.getUuid() + Utilities.getUuid());
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

function firma_(codigo, estado) {
  const secreto = PropertiesService.getScriptProperties().getProperty('secreto');
  const bytes = Utilities.computeHmacSha256Signature(codigo + ':' + estado, secreto);
  return bytes.map((b) => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

function pagina_(titulo, texto) {
  return HtmlService.createHtmlOutput(
    '<div style="font-family:sans-serif;max-width:480px;margin:60px auto;padding:24px;border-radius:16px;background:#f6f2ea;color:#051e35;text-align:center">' +
    '<h2 style="margin-top:0">' + titulo + '</h2><p>' + texto + '</p></div>').setTitle(titulo);
}

// Botones del mail: ?accion=moderar&codigo=...&estado=aprobado&firma=...
// Se busca por código (no por número de fila) para que ordenar la planilla no rompa nada.
function moderar_(p) {
  const codigo = String(p.codigo || '');
  const estado = p.estado === 'aprobado' ? 'aprobado' : 'rechazado';
  if (!codigo || p.firma !== firma_(codigo, estado)) return pagina_('Enlace no válido', 'Abrí la planilla para revisar el comentario.');
  const sh = SpreadsheetApp.getActive().getSheetByName(HOJA);
  const idx = filas_().findIndex((r) => r[8] === codigo);
  if (idx < 0) return pagina_('No se encontró el comentario', 'Puede que lo hayan borrado de la planilla.');
  const fila = idx + 2;
  sh.getRange(fila, 7).setValue(estado);
  const autor = sh.getRange(fila, 5).getValue();
  return estado === 'aprobado'
    ? pagina_('Comentario aprobado ✓', 'El comentario de ' + autor + ' ya se ve en la galería.')
    : pagina_('Comentario rechazado', 'El comentario de ' + autor + ' no se va a publicar.');
}

// GET ?accion=listar&year=8&clave=...           -> comentarios aprobados del Year
// GET ?accion=contar&year=8&clave=...           -> { idArchivo: cantidad }
function doGet(e) {
  const p = e.parameter;
  if (p.accion === 'moderar') return moderar_(p);
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
    const codigo = Utilities.getUuid();
    // "'" adelante evita que la planilla interprete el texto como fórmula
    sh.appendRow([new Date(), year, "'" + String(d.proyecto || '').slice(0, 120), "'" + String(d.trabajo || '').slice(0, 160),
      "'" + autor, "'" + texto, 'pendiente', String(d.archivo).slice(0, 80), codigo]);
    avisar_(codigo, year, String(d.proyecto || ''), String(d.trabajo || ''), autor, texto);
  } finally {
    lock.releaseLock();
  }
  return json_({ ok: true });
}

function escapar_(t) {
  return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Mail a AVISAR_A con el comentario y botones para aprobarlo o rechazarlo
function avisar_(codigo, year, proyecto, trabajo, autor, texto) {
  if (!AVISAR_A) return;
  const base = ScriptApp.getService().getUrl();
  const link = (estado) => base + '?accion=moderar&codigo=' + codigo + '&estado=' + estado + '&firma=' + firma_(codigo, estado);
  const boton = (href, color, label) =>
    '<a href="' + href + '" style="display:inline-block;padding:12px 22px;margin-right:8px;border-radius:10px;background:' + color +
    ';color:#fff;font-weight:bold;text-decoration:none">' + label + '</a>';
  const html =
    '<div style="font-family:sans-serif;color:#051e35;max-width:560px">' +
    '<p style="margin:0;color:#4b489c;font-weight:bold">Year ' + escapar_(year) + ' · ' + escapar_(proyecto) + '</p>' +
    '<p style="margin:4px 0 16px">Trabajo: ' + escapar_(trabajo) + '</p>' +
    '<div style="background:#f6f2ea;border-radius:12px;padding:14px 16px;margin-bottom:18px">' +
    '<strong>' + escapar_(autor) + '</strong> escribió:<br><span style="white-space:pre-wrap">' + escapar_(texto) + '</span></div>' +
    boton(link('aprobado'), '#1e6b3a', 'Aprobar') + boton(link('rechazado'), '#b3261e', 'Rechazar') +
    '<p style="margin-top:18px;font-size:12px;color:#666">También podés cambiar la columna Estado en la planilla: ' +
    SpreadsheetApp.getActive().getUrl() + '</p></div>';
  MailApp.sendEmail({
    to: AVISAR_A,
    subject: 'Nuevo comentario para aprobar · Year ' + year + ' · ' + proyecto,
    body: autor + ' escribió en "' + trabajo + '":\n\n' + texto + '\n\nAprobar: ' + link('aprobado') + '\nRechazar: ' + link('rechazado'),
    htmlBody: html,
    name: 'Galería FreeQuest',
  });
}

