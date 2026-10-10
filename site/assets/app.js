// Galería de proyectos FreeQuest
// - Cada Year está cifrado (AES-GCM + PBKDF2) en data/year-N.json.
// - Al ingresar la contraseña correcta se descifra en el navegador y se arma
//   un lienzo con zoom (estilo Prezi): Year en el centro, proyectos en órbita,
//   y los trabajos de los alumnos dentro de cada proyecto.

const YEARS = 12;
const SESSION_KEY = (y) => `fq-gallery-year-${y}`;
const ACCENTS = ["#f1bc70", "#4b489c", "#e9a84b", "#6f6cc4"];

const HUB_R = 170;          // radio del círculo central
const TOPIC_D = 420;        // diámetro de cada proyecto
const RING_0 = 600;         // radio de la primera órbita
const RING_GAP = 480;       // distancia entre órbitas
const MAX_SCALE = 10;

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

// ---------------------------------------------------------------- cifrado
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function decryptYear(enc, password) {
  const baseKey = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"],
  );
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: fromB64(enc.salt), iterations: enc.iter, hash: "SHA-256" },
    baseKey, { name: "AES-GCM", length: 256 }, false, ["decrypt"],
  );
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(enc.iv) }, key, fromB64(enc.ct));
  return JSON.parse(new TextDecoder().decode(plain));
}

const encCache = new Map();
async function loadEncrypted(year) {
  if (!encCache.has(year)) {
    const res = await fetch(`data/year-${year}.json`, { cache: "no-cache" });
    if (!res.ok) throw new Error("No se pudo cargar la galería de este Year.");
    encCache.set(year, await res.json());
  }
  return encCache.get(year);
}

function sessionGet(year) {
  try { return sessionStorage.getItem(SESSION_KEY(year)); } catch { return null; }
}
function sessionSet(year, pw) {
  try { pw == null ? sessionStorage.removeItem(SESSION_KEY(year)) : sessionStorage.setItem(SESSION_KEY(year), pw); } catch { /* sin storage */ }
}

// ---------------------------------------------------------------- Drive
const prettyName = (name) => name.replace(/(\.(pdf|docx?|pptx?|xlsx?|png|jpe?g|gif|heic|mov|mp4|txt|zip))+$/i, "").replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
const thumbUrl = (id) => `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w480`;
const openUrl = (item) =>
  item.mimeType === "application/vnd.google-apps.folder"
    ? `https://drive.google.com/drive/folders/${item.id}`
    : `https://drive.google.com/open?id=${item.id}`;

function embedUrl(item) {
  const id = encodeURIComponent(item.id);
  switch (item.mimeType) {
    case "application/vnd.google-apps.document": return `https://docs.google.com/document/d/${id}/preview`;
    case "application/vnd.google-apps.presentation": return `https://docs.google.com/presentation/d/${id}/embed?start=false&loop=false`;
    case "application/vnd.google-apps.spreadsheet": return `https://docs.google.com/spreadsheets/d/${id}/preview`;
    case "application/vnd.google-apps.folder": return `https://drive.google.com/embeddedfolderview?id=${id}#grid`;
    default: return `https://drive.google.com/file/d/${id}/preview`;
  }
}

const ICONS = {
  doc: "M6 2h9l5 5v15H6zM14 3v5h5M9 12h8M9 15h8M9 18h5",
  slides: "M3 4h18v12H3zM8 20h8M12 16v4",
  image: "M3 4h18v16H3zM3 16l5-5 4 4 3-3 6 6M15 9a1.5 1.5 0 1 0 0-.01",
  video: "M3 5h14v14H3zM17 10l4-3v10l-4-3",
  folder: "M3 6h7l2 2h9v11H3z",
};
function iconFor(mime = "") {
  if (mime.includes("presentation")) return ICONS.slides;
  if (mime.startsWith("image/")) return ICONS.image;
  if (mime.startsWith("video/")) return ICONS.video;
  if (mime.includes("folder")) return ICONS.folder;
  return ICONS.doc;
}
function iconSvg(mime) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", iconFor(mime));
  p.setAttribute("fill", "none");
  p.setAttribute("stroke", "currentColor");
  p.setAttribute("stroke-width", "1.6");
  p.setAttribute("stroke-linejoin", "round");
  svg.style.color = "var(--gold)";
  svg.append(p);
  return svg;
}

function workCard(item, topicTitle, onOpen) {
  const card = el("button", "work");
  card.type = "button";
  card.title = item.student ? `${item.student} — ${prettyName(item.name)}` : prettyName(item.name);
  const thumb = el("div", "work__thumb");
  thumb.append(iconSvg(item.mimeType));
  // Miniatura de Drive (solo funciona si el archivo está compartido con enlace)
  const img = new Image();
  img.alt = "";
  img.decoding = "async";
  img.referrerPolicy = "no-referrer";
  img.onload = () => {
    if (img.naturalWidth > 1) { thumb.style.backgroundImage = `url("${img.src}")`; thumb.replaceChildren(); }
  };
  thumb.dataset.src = thumbUrl(item.id);
  thumb._img = img;
  card.append(thumb, el("div", "work__name", item.student ? `${item.student} · ${prettyName(item.name)}` : prettyName(item.name)));
  card.addEventListener("click", (e) => onOpen(e, item, topicTitle));
  return card;
}
function loadThumbs(root) {
  root.querySelectorAll(".work__thumb[data-src]").forEach((t) => {
    t._img.src = t.dataset.src;
    t.removeAttribute("data-src");
  });
}

// ---------------------------------------------------------------- portada
document.documentElement.classList.add("js");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// FREEQUEST entra letra por letra
document.querySelectorAll("#home .wordmark__name span").forEach((part) => {
  const text = part.textContent;
  part.textContent = "";
  [...text].forEach((c) => {
    const ch = el("span", "ch", c);
    ch.style.setProperty("--i", part.parentElement.querySelectorAll(".ch").length);
    part.append(ch);
  });
});

// "Distintos lugares, ..." va cambiando como si se escribiera
(function typewriter() {
  const node = $("#typed");
  const phrases = ["un mismo camino", "muchas ideas", "un mismo equipo", "un mismo camino"];
  if (reduceMotion) return;
  let p = 0, i = phrases[0].length, deleting = true;
  setTimeout(function tick() {
    const word = phrases[p];
    if (deleting) {
      i--;
      if (i <= 0) { deleting = false; p = (p + 1) % phrases.length; }
    } else {
      i++;
      if (i >= phrases[p].length) { deleting = true; node.textContent = phrases[p]; setTimeout(tick, 2600); return; }
    }
    node.textContent = (deleting ? word : phrases[p]).slice(0, Math.max(i, 0));
    setTimeout(tick, deleting ? 45 : 85);
  }, 2600);
})();

// Las secciones aparecen al llegar con el scroll (siempre quedan visibles)
const io = "IntersectionObserver" in window
  ? new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); }
    }), { threshold: 0.2 })
  : null;
document.querySelectorAll(".reveal").forEach((n) => (io ? io.observe(n) : n.classList.add("is-in")));

// El globo sigue un poquito al mouse
const heroArt = $("#heroArt");
window.addEventListener("pointermove", (e) => {
  if (reduceMotion || !heroArt || !gallery.hidden) return;
  const x = e.clientX / innerWidth - 0.5, y = e.clientY / innerHeight - 0.5;
  heroArt.style.transform = `translate(${x * -18}px, ${y * -18}px) rotate(${x * 4}deg)`;
});

// Cielo con estrellas que titilan y alguna estrella fugaz
(function sky() {
  const c = $("#sky");
  const ctx = c.getContext("2d");
  let stars = [], shooting = null, w = 0, h = 0, mx = 0, my = 0;
  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    w = innerWidth; h = innerHeight;
    c.width = w * dpr; c.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    stars = Array.from({ length: Math.round((w * h) / 9000) }, () => ({
      x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.4 + 0.3,
      t: Math.random() * Math.PI * 2, s: 0.5 + Math.random() * 1.5, d: 0.3 + Math.random() * 0.7,
      gold: Math.random() < 0.15,
    }));
  }
  resize();
  addEventListener("resize", resize);
  addEventListener("pointermove", (e) => { mx = e.clientX / w - 0.5; my = e.clientY / h - 0.5; });
  function frame(t) {
    if (gallery.hidden) {
      ctx.clearRect(0, 0, w, h);
      for (const st of stars) {
        const a = reduceMotion ? 0.7 : 0.35 + 0.65 * Math.abs(Math.sin(t / 1000 * st.s + st.t));
        ctx.globalAlpha = a;
        ctx.fillStyle = st.gold ? "#f1bc70" : "#f6f2ea";
        ctx.beginPath();
        ctx.arc(st.x - mx * 30 * st.d, st.y - my * 30 * st.d, st.r, 0, Math.PI * 2);
        ctx.fill();
      }
      if (!reduceMotion) {
        if (!shooting && Math.random() < 0.004) shooting = { x: Math.random() * w * 0.7, y: Math.random() * h * 0.4, life: 0 };
        if (shooting) {
          const { x, y, life } = shooting;
          const len = 120, px = x + life * 9, py = y + life * 4;
          const g = ctx.createLinearGradient(px, py, px - len, py - len * 0.45);
          g.addColorStop(0, "rgba(246,242,234,0.9)");
          g.addColorStop(1, "rgba(246,242,234,0)");
          ctx.globalAlpha = 1 - life / 60;
          ctx.strokeStyle = g; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - len, py - len * 0.45); ctx.stroke();
          if (++shooting.life > 60) shooting = null;
        }
      }
      ctx.globalAlpha = 1;
    }
    if (!reduceMotion) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();

// Years en órbita
const yearGrid = $("#yearGrid");
const orbitHint = $("#orbitHint");
const LOCK_PATH = "M12 2a5 5 0 0 0-5 5v3H5v12h14V10h-2V7a5 5 0 0 0-5-5zm-3 8V7a3 3 0 0 1 6 0v3z";
let lastClick = null;
for (let y = 1; y <= YEARS; y++) {
  const b = el("button", "year-tile");
  b.type = "button";
  b.dataset.year = y;
  b.style.setProperty("--a", `${(y - 1) * 30 - 90}deg`);
  b.setAttribute("aria-label", `Year ${y}`);
  const inner = el("span", "year-tile__inner");
  inner.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${LOCK_PATH}"/></svg>`;
  inner.append(el("span", null, `Y${y}`));
  b.append(inner);
  b.addEventListener("mouseenter", () => { orbitHint.textContent = `Year ${y}`; });
  b.addEventListener("mouseleave", () => { orbitHint.textContent = "Tocá tu Year"; });
  b.addEventListener("click", (e) => {
    lastClick = { x: e.clientX, y: e.clientY };
    b.classList.add("is-chosen");
    location.hash = `year-${y}`;
  });
  yearGrid.append(b);
}
function refreshTiles() {
  yearGrid.querySelectorAll(".year-tile").forEach((b) => {
    b.classList.toggle("is-open", !!sessionGet(b.dataset.year));
    b.classList.remove("is-chosen");
  });
}

// ---------------------------------------------------------------- portada de cada Year
const gate = $("#gate");
const flip = $("#flip");
const lockInput = $("#lockInput");
const lockError = $("#lockError");
const lockSubmit = $("#lockSubmit");
const warp = $("#warp");
let pendingYear = null;

function showGate(year) {
  pendingYear = year;
  $("#gateYearText").textContent = `YEAR ${year}`;
  $("#gateBadge").textContent = `Y${year}`;
  $("#gateMini").textContent = `Y${year}`;
  lockError.textContent = "";
  lockInput.value = "";
  lockInput.type = "password";
  flip.classList.remove("is-flipped", "is-unlocked");
  $("#home").hidden = true;
  gate.hidden = false;
  gate.scrollTop = 0;
  window.scrollTo(0, 0);
  $("#gateFront").focus({ preventScroll: true });
}
function hideGate() {
  gate.hidden = true;
  $("#home").hidden = false;
}
function flipToForm() {
  flip.classList.add("is-flipped");
  setTimeout(() => lockInput.focus(), reduceMotion ? 0 : 450);
}
$("#gateFront").addEventListener("click", flipToForm);
$("#pwEye").addEventListener("click", () => {
  lockInput.type = lockInput.type === "password" ? "text" : "password";
  lockInput.focus();
});

// Círculo dorado que crece desde el Year y "lleva" a la galería
function warpTo(x, y, then) {
  if (reduceMotion) { then(); return; }
  warp.style.setProperty("--x", `${x}px`);
  warp.style.setProperty("--y", `${y}px`);
  warp.className = "warp is-on";
  setTimeout(() => {
    then();
    warp.className = "warp is-off";
    setTimeout(() => { warp.className = "warp"; }, 650);
  }, 700);
}

$("#lockForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const year = pendingYear;
  const pw = lockInput.value.trim();
  if (!pw) { lockError.textContent = "Escribí la contraseña de tu Year."; return; }
  lockSubmit.disabled = true;
  lockSubmit.textContent = "Abriendo…";
  lockError.textContent = "";
  try {
    const data = await decryptYear(await loadEncrypted(year), pw);
    sessionSet(year, pw);
    flip.classList.add("is-unlocked");
    const r = flip.getBoundingClientRect();
    warpTo(r.left + r.width / 2, r.top + r.height / 2, () => { hideGate(); openGallery(data); });
  } catch (err) {
    lockError.textContent = err instanceof SyntaxError || err.name === "OperationError"
      ? "Esa no es la contraseña. Probá de nuevo."
      : err.message || "No se pudo abrir la galería.";
    const back = $(".flip__back");
    back.classList.remove("shake");
    void back.offsetWidth;
    back.classList.add("shake");
    lockInput.select();
  } finally {
    lockSubmit.disabled = false;
    lockSubmit.textContent = "Entrar";
  }
});

// ---------------------------------------------------------------- galería
const gallery = $("#gallery");
const stage = $("#stage");
const world = $("#world");
const listview = $("#listview");
const hint = $("#hint");

const state = {
  data: null,
  topics: [],        // { title, items, x, y, node, accent }
  flat: [],          // [{ item, topic }]
  cam: { x: 0, y: 0, s: 1 },
  step: 0,           // 0 = vista general, i = proyecto i-1
  bounds: null,
  listMode: false,
};

function layout(topics) {
  const placed = [];
  let ring = 0, i = 0;
  while (i < topics.length) {
    const r = RING_0 + ring * RING_GAP;
    const cap = Math.max(1, Math.floor((2 * Math.PI * r) / (TOPIC_D + 70)));
    const count = Math.min(cap, topics.length - i);
    const offset = -Math.PI / 2 + (ring % 2 ? Math.PI / count : 0);
    for (let k = 0; k < count; k++, i++) {
      const a = offset + (k / count) * Math.PI * 2;
      placed.push({ ...topics[i], x: Math.cos(a) * r, y: Math.sin(a) * r, ring });
    }
    ring++;
  }
  return { placed, rings: ring };
}

// Calcula columnas/filas para que n tarjetas (4:3.4) entren en la caja w×h
function gridFor(n, w, h) {
  let best = { cols: 1, cw: 0 };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const cw = Math.min((w - (cols - 1) * 4) / cols, ((h - (rows - 1) * 4) / rows) / 0.85);
    if (cw > best.cw) best = { cols, cw };
  }
  return best;
}

function buildWorld(data) {
  world.replaceChildren();
  const { placed, rings } = layout(data.topics);
  state.topics = placed;
  state.flat = placed.flatMap((t) => t.items.map((item) => ({ item, topic: t })));

  for (let r = 0; r < rings; r++) {
    const rad = RING_0 + r * RING_GAP;
    const ringEl = el("div", "ring");
    Object.assign(ringEl.style, { left: `${-rad}px`, top: `${-rad}px`, width: `${rad * 2}px`, height: `${rad * 2}px` });
    world.append(ringEl);
  }

  const hub = el("div", "hub");
  Object.assign(hub.style, { left: `${-HUB_R}px`, top: `${-HUB_R}px`, width: `${HUB_R * 2}px`, height: `${HUB_R * 2}px` });
  hub.append(el("div", "hub__y", `Y${data.year}`), el("div", "hub__label", "YEAR"));
  world.append(hub);
  if (!placed.length) {
    const msg = el("div", "topic__empty", "Todavía no hay proyectos cargados para este Year. ¡Muy pronto!");
    Object.assign(msg.style, { left: "-260px", top: `${HUB_R + 50}px`, width: "520px", fontSize: "26px", color: "var(--cream)" });
    world.append(msg);
  }

  placed.forEach((t, idx) => {
    t.accent = ACCENTS[idx % ACCENTS.length];
    const node = el("div", "topic");
    node.style.setProperty("--accent", t.accent);
    Object.assign(node.style, { left: `${t.x - TOPIC_D / 2}px`, top: `${t.y - TOPIC_D / 2}px`, width: `${TOPIC_D}px`, height: `${TOPIC_D}px` });
    node.setAttribute("role", "button");
    node.setAttribute("aria-label", `${t.title}, ${t.items.length} trabajos`);
    node.append(el("div", "topic__planet"));
    const head = el("div", "topic__head");
    head.append(el("div", "topic__title", t.title), el("div", "topic__count", `${t.items.length} ${t.items.length === 1 ? "trabajo" : "trabajos"}`));
    node.append(head);

    if (t.items.length) {
      const box = { x: TOPIC_D * 0.15, y: TOPIC_D * 0.3, w: TOPIC_D * 0.7, h: TOPIC_D * 0.53 };
      const { cols, cw: fitW } = gridFor(t.items.length, box.w, box.h);
      const cw = Math.min(fitW, 130); // pocos trabajos: tarjetas de tamaño razonable
      const rows = Math.ceil(t.items.length / cols);
      const gw = cols * cw + (cols - 1) * 4;
      const gh = rows * cw * 0.85 + (rows - 1) * 4;
      const grid = el("div", "topic__grid");
      Object.assign(grid.style, {
        left: `${box.x + (box.w - gw) / 2}px`, top: `${box.y + (box.h - gh) / 2}px`,
        gridTemplateColumns: `repeat(${cols}, ${cw}px)`, gridAutoRows: `${cw * 0.85}px`,
      });
      grid.style.setProperty("--label", `${Math.max(3, cw * 0.1)}px`);
      t.items.forEach((item) => grid.append(workCard(item, t.title, onWorkClick)));
      node.append(grid);
    } else {
      node.append(el("div", "topic__empty", "Pronto vas a ver trabajos acá"));
    }

    node.addEventListener("click", () => {
      if (suppressClick) return;
      goToStep(idx + 1);
    });
    t.node = node;
    world.append(node);
  });

  const extent = placed.length ? RING_0 + (rings - 1) * RING_GAP + TOPIC_D / 2 + 40 : HUB_R + 220;
  state.bounds = { x: -extent, y: -extent, w: extent * 2, h: extent * 2 };
}

function buildList(data) {
  const root = $("#listContent");
  root.replaceChildren();
  if (!data.topics.length) {
    root.append(el("p", "lempty", "Todavía no hay proyectos cargados para este Year."));
    return;
  }
  data.topics.forEach((t) => {
    const sec = el("section", "lsection");
    const h = el("h3", null, t.title);
    h.append(el("small", null, `${t.items.length} ${t.items.length === 1 ? "trabajo" : "trabajos"}`));
    const grid = el("div", "lgrid");
    t.items.forEach((item) => {
      const c = workCard(item, t.title, (e, it, title) => openViewer(it, title));
      c.dataset.search = `${t.title} ${item.name} ${item.student || ""}`.toLowerCase();
      grid.append(c);
    });
    sec.append(h, grid);
    sec.dataset.search = t.title.toLowerCase();
    root.append(sec);
  });
}

$("#search").addEventListener("input", (e) => {
  const q = e.target.value.trim().toLowerCase();
  document.querySelectorAll(".lsection").forEach((sec) => {
    const topicHit = sec.dataset.search.includes(q);
    let any = false;
    sec.querySelectorAll(".work").forEach((c) => {
      const hit = !q || topicHit || c.dataset.search.includes(q);
      c.hidden = !hit;
      any ||= hit;
    });
    sec.hidden = !any && !topicHit;
  });
});

function openGallery(data) {
  state.data = data;
  state.step = 0;
  const works = data.topics.reduce((n, t) => n + t.items.length, 0);
  $("#gTitle").textContent = `Year ${data.year}`;
  $("#gStats").textContent = `${data.topics.length} ${data.topics.length === 1 ? "proyecto" : "proyectos"} · ${works} ${works === 1 ? "trabajo" : "trabajos"}`;
  buildWorld(data);
  buildList(data);
  gallery.hidden = false;
  document.body.style.overflow = "hidden";
  setListMode(!data.topics.length ? false : state.listMode);
  hint.classList.remove("is-hidden");
  setTimeout(() => hint.classList.add("is-hidden"), 6000);
  requestAnimationFrame(() => { goToStep(0, false); stage.focus({ preventScroll: true }); });
  refreshTiles();
}

function closeGallery() {
  closeViewer();
  gallery.hidden = true;
  document.body.style.overflow = "";
  world.replaceChildren();
  $("#listContent").replaceChildren();
  state.data = null;
}

function setListMode(on) {
  state.listMode = on;
  listview.hidden = !on;
  stage.hidden = on;
  $("#pathbar").hidden = on;
  hint.hidden = on;
  const btn = $("#toggleView");
  btn.textContent = on ? "Ver como mapa" : "Ver como lista";
  btn.setAttribute("aria-pressed", String(on));
  if (on) loadThumbs(listview);
  else requestAnimationFrame(() => goToStep(state.step, false));
}
$("#toggleView").addEventListener("click", () => setListMode(!state.listMode));

$("#logout").addEventListener("click", () => {
  if (state.data) sessionSet(state.data.year, null);
  refreshTiles();
  location.hash = "years";
});
$("#backHome").addEventListener("click", () => { location.hash = "years"; });

// ---------------------------------------------------------------- cámara
function applyCam(animate) {
  world.classList.toggle("is-animating", !!animate);
  const { x, y, s } = state.cam;
  world.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
}

function fit(box, padding = 1.1, animate = true) {
  const vw = stage.clientWidth, vh = stage.clientHeight - 70; // espacio para la barra inferior
  const s = Math.min(vw / (box.w * padding), vh / (box.h * padding), MAX_SCALE);
  state.cam = { s, x: vw / 2 - (box.x + box.w / 2) * s, y: vh / 2 - (box.y + box.h / 2) * s };
  applyCam(animate);
}

function minScale() {
  const b = state.bounds;
  return b ? Math.min(stage.clientWidth / b.w, stage.clientHeight / b.h) * 0.5 : 0.05;
}

function zoomAt(factor, px, py, animate = false) {
  const { x, y, s } = state.cam;
  const ns = Math.min(MAX_SCALE, Math.max(minScale(), s * factor));
  const k = ns / s;
  state.cam = { s: ns, x: px - (px - x) * k, y: py - (py - y) * k };
  applyCam(animate);
}

function goToStep(step, animate = true) {
  const n = state.topics.length;
  state.step = Math.max(0, Math.min(step, n));
  state.topics.forEach((t, i) => t.node.classList.toggle("is-active", i === state.step - 1));
  if (state.step === 0 || !n) {
    fit(state.bounds, 1.02, animate);
    $("#stepLabel").textContent = n ? `Vista general · ${n} proyectos` : "Todavía no hay proyectos";
  } else {
    const t = state.topics[state.step - 1];
    fit({ x: t.x - TOPIC_D / 2, y: t.y - TOPIC_D / 2, w: TOPIC_D, h: TOPIC_D }, stage.clientWidth < 640 ? 1.0 : 1.08, animate);
    $("#stepLabel").textContent = `${state.step}/${n} · ${t.title}`;
    loadThumbs(t.node);
  }
  $("#prevStep").disabled = state.step === 0;
  $("#nextStep").disabled = state.step === n;
}

$("#prevStep").addEventListener("click", () => goToStep(state.step - 1));
$("#nextStep").addEventListener("click", () => goToStep(state.step + 1));
$("#overview").addEventListener("click", () => goToStep(0));
$("#zoomIn").addEventListener("click", () => {
  zoomAt(1.6, stage.clientWidth / 2, stage.clientHeight / 2, true);
  if (state.cam.s > 1) state.topics.forEach((t) => loadThumbs(t.node));
});
$("#zoomOut").addEventListener("click", () => zoomAt(1 / 1.6, stage.clientWidth / 2, stage.clientHeight / 2, true));
window.addEventListener("resize", () => { if (!gallery.hidden && !state.listMode) goToStep(state.step, false); });

// Clic en un trabajo: si el proyecto no está enfocado, primero se acerca.
function onWorkClick(e, item, topicTitle) {
  e.stopPropagation();
  if (suppressClick) return;
  const idx = state.topics.findIndex((t) => t.title === topicTitle);
  if (state.step !== idx + 1) { goToStep(idx + 1); return; }
  openViewer(item, topicTitle);
}

// Arrastrar, rueda del mouse y pellizco
const pointers = new Map();
let suppressClick = false;
let dragStart = null;
let pinch = null;

stage.addEventListener("pointerdown", (e) => {
  if (e.button !== 0 && e.pointerType === "mouse") return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  world.classList.remove("is-animating");
  suppressClick = false;
  if (pointers.size === 1) {
    dragStart = { px: e.clientX, py: e.clientY, cx: state.cam.x, cy: state.cam.y };
  } else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: state.cam.s };
    dragStart = null;
  }
});
stage.addEventListener("pointermove", (e) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2 && pinch) {
    const [a, b] = [...pointers.values()];
    const rect = stage.getBoundingClientRect();
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    const target = pinch.s * (d / pinch.d);
    zoomAt(target / state.cam.s, (a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top);
    suppressClick = true;
  } else if (dragStart) {
    const dx = e.clientX - dragStart.px, dy = e.clientY - dragStart.py;
    if (!suppressClick && Math.hypot(dx, dy) > 6) {
      suppressClick = true;
      stage.classList.add("is-dragging");
      stage.setPointerCapture(e.pointerId);
    }
    if (suppressClick) {
      state.cam.x = dragStart.cx + dx;
      state.cam.y = dragStart.cy + dy;
      applyCam(false);
    }
  }
});
function endPointer(e) {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
  if (pointers.size === 0) {
    dragStart = null;
    stage.classList.remove("is-dragging");
    // el click se dispara después de pointerup: liberar en el próximo tick
    setTimeout(() => { suppressClick = false; }, 0);
  }
}
stage.addEventListener("pointerup", endPointer);
stage.addEventListener("pointercancel", endPointer);
stage.addEventListener("wheel", (e) => {
  e.preventDefault();
  const rect = stage.getBoundingClientRect();
  const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
  zoomAt(Math.exp(-delta * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - rect.left, e.clientY - rect.top);
  // al cargar miniaturas cuando el usuario se acerca a mano
  if (state.cam.s > 1) state.topics.forEach((t) => loadThumbs(t.node));
}, { passive: false });

// ---------------------------------------------------------------- visor
const viewer = $("#viewer");
let viewerIndex = -1;

function openViewer(item) {
  viewerIndex = state.flat.findIndex((f) => f.item === item);
  renderViewer();
  viewer.hidden = false;
  $("#vClose").focus();
}
function renderViewer() {
  const { item, topic } = state.flat[viewerIndex];
  $("#vTopic").textContent = topic.title;
  $("#vTitle").textContent = item.student ? `${item.student} · ${prettyName(item.name)}` : prettyName(item.name);
  $("#vCount").textContent = `${viewerIndex + 1} / ${state.flat.length}`;
  $("#vOpen").href = openUrl(item);
  const frame = $("#vFrame");
  const loading = el("div", "loading", "Cargando…");
  const iframe = document.createElement("iframe");
  iframe.src = embedUrl(item);
  iframe.allow = "autoplay; fullscreen";
  iframe.allowFullscreen = true;
  iframe.referrerPolicy = "no-referrer";
  iframe.title = prettyName(item.name);
  iframe.addEventListener("load", () => loading.remove());
  frame.replaceChildren(loading, iframe);
  $("#vPrev").disabled = viewerIndex <= 0;
  $("#vNext").disabled = viewerIndex >= state.flat.length - 1;
  // mantener el mapa sincronizado con el proyecto que se está viendo
  const tIdx = state.topics.indexOf(topic);
  if (!state.listMode && state.step !== tIdx + 1) goToStep(tIdx + 1, false);
}
function closeViewer() {
  if (viewer.hidden) return;
  viewer.hidden = true;
  $("#vFrame").replaceChildren();
  stage.focus({ preventScroll: true });
}
$("#vClose").addEventListener("click", closeViewer);
$("#vPrev").addEventListener("click", () => { if (viewerIndex > 0) { viewerIndex--; renderViewer(); } });
$("#vNext").addEventListener("click", () => { if (viewerIndex < state.flat.length - 1) { viewerIndex++; renderViewer(); } });

// ---------------------------------------------------------------- teclado
document.addEventListener("keydown", (e) => {
  if (gallery.hidden) return;
  if (e.target.matches?.("input")) return;
  if (!viewer.hidden) {
    if (e.key === "Escape") closeViewer();
    else if (e.key === "ArrowRight") $("#vNext").click();
    else if (e.key === "ArrowLeft") $("#vPrev").click();
    return;
  }
  if (state.listMode) return;
  if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") { e.preventDefault(); goToStep(state.step + 1); }
  else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); goToStep(state.step - 1); }
  else if (e.key === "Escape" || e.key === "Home") goToStep(0);
  else if (e.key === "+" || e.key === "=") zoomAt(1.3, stage.clientWidth / 2, stage.clientHeight / 2);
  else if (e.key === "-") zoomAt(1 / 1.3, stage.clientWidth / 2, stage.clientHeight / 2);
});

// ---------------------------------------------------------------- rutas
async function route() {
  const m = location.hash.match(/^#year-(\d{1,2})$/);
  const year = m && Number(m[1]);
  if (!year || year < 1 || year > YEARS) {
    if (!gallery.hidden) closeGallery();
    hideGate();
    refreshTiles();
    if (location.hash === "#years") $("#years").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
    return;
  }
  if (state.data?.year === year && !gallery.hidden) return;
  if (!gallery.hidden) closeGallery();
  const saved = sessionGet(year);
  if (saved) {
    try {
      const data = await decryptYear(await loadEncrypted(year), saved);
      const p = lastClick || { x: innerWidth / 2, y: innerHeight / 2 };
      lastClick = null;
      warpTo(p.x, p.y, () => { hideGate(); $("#home").hidden = true; openGallery(data); });
      return;
    } catch {
      sessionSet(year, null);
    }
  }
  lastClick = null;
  showGate(year);
}
window.addEventListener("hashchange", route);
route();
