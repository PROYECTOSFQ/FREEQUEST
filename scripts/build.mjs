#!/usr/bin/env node
// Genera los archivos cifrados de cada Year (site/data/year-N.json) a partir de
// data/projects.source.json y config/passwords.json.
//
// Cada Year se cifra con AES-GCM usando una clave derivada de su contraseña
// (PBKDF2-SHA256). Sin la contraseña correcta el navegador no puede leer
// ni los nombres de los proyectos ni los enlaces a Drive.
//
// Uso:
//   node scripts/build.mjs                 -> cifra todos los Years
//   node scripts/build.mjs --new-passwords -> regenera TODAS las contraseñas

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { webcrypto as crypto } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = path.join(ROOT, "data", "projects.source.json");
const PASSWORDS = path.join(ROOT, "config", "passwords.json");
const OUT_DIR = path.join(ROOT, "site", "data");
const ITERATIONS = 250_000;
const YEARS = Array.from({ length: 12 }, (_, i) => String(i + 1));

const WORDS = [
  "luna", "sol", "cometa", "nube", "rayo", "mar", "rio", "bosque", "volcan", "isla",
  "faro", "brujula", "mapa", "tigre", "zorro", "puma", "condor", "ballena", "delfin", "pinguino",
  "cactus", "roble", "pino", "jazmin", "girasol", "trueno", "aurora", "galaxia", "planeta", "orbita",
  "cohete", "robot", "pixel", "ancla", "velero", "montana", "glaciar", "desierto", "selva", "pradera",
];

function randomInt(max) {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % max;
}

function makePassword() {
  const a = WORDS[randomInt(WORDS.length)];
  let b = WORDS[randomInt(WORDS.length)];
  while (b === a) b = WORDS[randomInt(WORDS.length)];
  return `${a}-${b}-${10 + randomInt(90)}`;
}

const b64 = (bytes) => Buffer.from(bytes).toString("base64");

async function encrypt(plaintext, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const baseKey = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"],
  );
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    baseKey, { name: "AES-GCM", length: 256 }, false, ["encrypt"],
  );
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
  return { v: 1, kdf: "PBKDF2-SHA256", iter: ITERATIONS, salt: b64(salt), iv: b64(iv), ct: b64(new Uint8Array(ct)) };
}

// "Proyectos Ciudad robotizada " -> "Ciudad robotizada"
function cleanTitle(title) {
  let t = title.trim().replace(/\s+/g, " ");
  t = t.replace(/^proyectos?\s*:?\s*/i, "");
  t = t.replace(/^["“”']+|["“”']+$/g, "").trim();
  if (!t) t = title.trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

const normalize = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Une carpetas repetidas dentro del mismo Year ("Proyecto Drones" + "Drones")
// y quita archivos duplicados (mismo nombre).
function prepareYear(topics = []) {
  const byKey = new Map();
  for (const topic of topics) {
    const title = cleanTitle(topic.title);
    const key = normalize(title);
    if (!byKey.has(key)) byKey.set(key, { title, folderIds: [], items: [] });
    const entry = byKey.get(key);
    if (topic.folderId) entry.folderIds.push(topic.folderId);
    const seen = new Set(entry.items.map((i) => normalize(i.name)));
    for (const item of topic.items || []) {
      if (!item.id || item.mimeType === "application/vnd.google-apps.shortcut") continue;
      const k = normalize(item.name);
      if (seen.has(k)) continue;
      seen.add(k);
      entry.items.push({ name: item.name, id: item.id, mimeType: item.mimeType, ...(item.student ? { student: item.student } : {}) });
    }
  }
  return [...byKey.values()]
    .map((t) => ({ ...t, items: t.items.sort((a, b) => a.name.localeCompare(b.name, "es")) }))
    .sort((a, b) => b.items.length - a.items.length || a.title.localeCompare(b.title, "es"));
}

async function main() {
  if (!existsSync(SOURCE)) {
    console.error(`Falta ${path.relative(ROOT, SOURCE)}. Generalo con scripts/drive-export.gs (ver README).`);
    process.exit(1);
  }
  const source = JSON.parse(await readFile(SOURCE, "utf8"));

  let passwords = {};
  if (existsSync(PASSWORDS) && !process.argv.includes("--new-passwords")) {
    passwords = JSON.parse(await readFile(PASSWORDS, "utf8"));
  }
  let created = false;
  for (const y of YEARS) {
    if (!passwords[y]) {
      passwords[y] = makePassword();
      created = true;
    }
  }
  if (created) {
    await mkdir(path.dirname(PASSWORDS), { recursive: true });
    await writeFile(PASSWORDS, JSON.stringify(passwords, null, 2) + "\n");
    console.log(`Contraseñas nuevas guardadas en ${path.relative(ROOT, PASSWORDS)}`);
  }

  await mkdir(OUT_DIR, { recursive: true });
  const summary = [];
  for (const y of YEARS) {
    const topics = prepareYear(source.years?.[y]);
    const payload = JSON.stringify({ year: Number(y), generated: source.generated, topics });
    const enc = await encrypt(payload, passwords[y]);
    await writeFile(path.join(OUT_DIR, `year-${y}.json`), JSON.stringify(enc) + "\n");
    summary.push({ Year: y, Proyectos: topics.length, Trabajos: topics.reduce((n, t) => n + t.items.length, 0) });
  }
  console.table(summary);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
