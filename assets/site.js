/* Destino del formulario. Cambie el correo cuando REDSEG entregue el oficial.
   WhatsApp: numero con indicativo, solo digitos. Vacio = el boton lleva al formulario. */
const REDSEG_MAIL = "comercial@redseg.com";
const REDSEG_WA = "";

const GATES = [
  "(prefers-reduced-motion: reduce)"
];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smoothstep = (p, e0, e1) => {
  const t = clamp((p - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

const video = document.getElementById("hero-video");
const stage = document.querySelector(".stage");
const header = document.querySelector(".site-header");
const bands = [...document.querySelectorAll(".band")];
window.__bgv = video;

let scrubOn = false;
let heroStarted = false;
let heroOn = true;
let seekBusy = false;
let pendingTime = null;
let lastSeek = -1;
let target = 0;
let shown = 0;
let rafId = null;
let lastTick = 0;
let seekTimer = 0;
let loadK = 0;
let loadStart = 0;

function rng(seed) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

function splitWords(el, seed) {
  const text = el.textContent.trim();
  const words = text.split(/\s+/);
  const sr = document.createElement("span");
  sr.className = "sr-only";
  sr.textContent = text;
  const visual = document.createElement("span");
  visual.setAttribute("aria-hidden", "true");
  words.forEach((word, i) => {
    const w = document.createElement("span");
    w.className = "w";
    w.style.setProperty("--th", (i / words.length) * 0.42);
    w.textContent = word;
    visual.append(w);
    if (i < words.length - 1) visual.append(document.createTextNode(" "));
  });
  el.replaceChildren(sr, visual);
  void seed;
}

function splitWeave(el) {
  const text = el.textContent.trim();
  const words = text.split(/\s+/);
  const total = words.reduce((n, w) => n + w.length, 0) || 1;
  const sr = document.createElement("span");
  sr.className = "sr-only";
  sr.textContent = text;
  const visual = document.createElement("span");
  visual.setAttribute("aria-hidden", "true");
  let i = 0;
  words.forEach((word, wi) => {
    const w = document.createElement("span");
    w.className = "w";
    [...word].forEach((ch) => {
      const c = document.createElement("span");
      c.className = "c";
      c.textContent = ch;
      c.style.setProperty("--th", (i / total) * 0.55);
      c.style.setProperty("--jy", (i % 2 ? 14 : -14) + "px");
      w.append(c);
      i += 1;
    });
    visual.append(w);
    if (wi < words.length - 1) visual.append(document.createTextNode(" "));
  });
  el.replaceChildren(sr, visual);
}

function splitFocus(el) {
  const text = el.textContent.trim();
  const sr = document.createElement("span");
  sr.className = "sr-only";
  sr.textContent = text;
  const soft = document.createElement("span");
  soft.className = "soft";
  soft.setAttribute("aria-hidden", "true");
  soft.textContent = text;
  const sharp = document.createElement("span");
  sharp.className = "sharp";
  sharp.setAttribute("aria-hidden", "true");
  sharp.textContent = text;
  el.classList.add("blur-title");
  el.replaceChildren(sr, soft, sharp);
}

document.querySelectorAll(".hero-title").forEach((el, index) => {
  const entrance = el.closest(".band")?.dataset.entrance;
  if (entrance === "weave") splitWeave(el);
  else if (entrance === "focus") splitFocus(el);
  else splitWords(el, 11 + index);
});

function heroProgress() {
  const hero = document.getElementById("hero");
  const range = hero.offsetHeight - window.innerHeight;
  if (range <= 0) return 0;
  const y = -hero.getBoundingClientRect().top;
  return clamp(y / range, 0, 1);
}

function bandOpacity(p, a, b, isFirst, isLast) {
  const f = Math.min(0.02, (b - a) / 3);
  const enter = isFirst ? 1 : smoothstep(p, a, a + f);
  const exit = isLast ? 1 : 1 - smoothstep(p, b - f, b);
  return enter * exit;
}

function bandK(p, a, b, ramp) {
  const span = ramp || Math.min(0.025, (b - a) * 0.35);
  return clamp((p - a) / span, 0, 1);
}

function updateCaptions(p) {
  const last = bands.length - 1;
  bands.forEach((band, i) => {
    const a = Number(band.dataset.a);
    const b = Number(band.dataset.b);
    const op = bandOpacity(p, a, b, i === 0, i === last);
    let k = bandK(p, a, b, Number(band.dataset.ramp) || 0);
    if (i === 0) k = Math.max(k, loadK);
    if (band._op === undefined || Math.abs(op - band._op) > 0.012 || op === 0 || op === 1) {
      band._op = op;
      band.style.opacity = String(op);
      band.style.visibility = op < 0.03 ? "hidden" : "visible";
      band.style.pointerEvents = op > 0.55 ? "auto" : "none";
    }
    if (band._k === undefined || Math.abs(k - band._k) > 0.008 || k === 0 || k === 1) {
      band._k = k;
      band.style.setProperty("--k", k.toFixed(3));
    }
  });
}

function scrubTime(p) {
  const duration = video.duration || 0;
  if (!duration) return 0;
  const holdP = 0.06;
  const holdT = Math.min(2.35, duration * 0.3);
  if (p <= holdP) return (p / holdP) * holdT;
  const u = (p - holdP) / (1 - holdP);
  const eased = 1 - Math.pow(1 - u, 1.2);
  return holdT + eased * (duration - holdT);
}

function requestSeek(t) {
  if (!video.duration || !scrubOn) return;
  const clamped = clamp(t, 0, Math.max(0, video.duration - 0.05));
  if (seekBusy) {
    pendingTime = clamped;
    return;
  }
  if (Math.abs(clamped - lastSeek) < 0.004) return;
  seekBusy = true;
  lastSeek = clamped;
  clearTimeout(seekTimer);
  seekTimer = setTimeout(() => {
    if (!seekBusy) return;
    seekBusy = false;
    onSeeked();
  }, 120);
  video.currentTime = clamped;
}

function onSeeked() {
  clearTimeout(seekTimer);
  seekBusy = false;
  if (pendingTime !== null) {
    const t = pendingTime;
    pendingTime = null;
    requestSeek(t);
  }
}

function tick(now) {
  const dt = Math.min(100, now - (lastTick || now));
  lastTick = now;
  const gap = Math.abs(target - shown);
  const k = gap > 0.06 ? 0.82 : 0.62;
  shown += (target - shown) * (1 - Math.pow(1 - k, dt / 16.667));
  if (Math.abs(target - shown) < 0.0005) {
    shown = target;
    rafId = null;
    lastTick = 0;
  } else {
    rafId = requestAnimationFrame(tick);
  }
  requestSeek(scrubTime(shown));
  updateCaptions(shown);
}

function onScroll() {
  header.classList.toggle("is-solid", window.scrollY > 12);
  if (!scrubOn || !heroOn) return;
  target = heroProgress();
  if (rafId === null) rafId = requestAnimationFrame(tick);
}

function loadLoop(now) {
  if (!scrubOn) return;
  if (!loadStart) loadStart = now;
  const t = Math.min(1, (now - loadStart) / 900);
  loadK = t * t * (3 - 2 * t);
  updateCaptions(heroProgress());
  if (loadK < 1) requestAnimationFrame(loadLoop);
}

function initHeroOnce() {
  if (heroStarted) return;
  heroStarted = true;
  video.addEventListener("seeked", onSeeked);
  video.addEventListener("error", () => {
    seekBusy = false;
    pendingTime = null;
    stage.classList.add("video-failed");
  });
  video.addEventListener("loadeddata", () => {
    stage.classList.add("video-ready");
    const kick = video.play();
    const settle = () => {
      video.pause();
      onScroll();
    };
    if (kick && typeof kick.then === "function") kick.then(settle).catch(settle);
    else settle();
  }, { once: true });
  fetch("assets/hero-scrub.mp4")
    .then((res) => {
      if (!res.ok) throw new Error("video");
      return res.blob();
    })
    .then((blob) => {
      video.src = URL.createObjectURL(blob);
      video.load();
    })
    .catch(() => stage.classList.add("video-failed"));
}

function pinToFinalStates() {
  document.body.classList.add("motion-pinned");
  document.querySelectorAll("[data-count]").forEach((el) => {
    el.textContent = el.dataset.count;
    el.dataset.done = "1";
  });
  const guard = document.getElementById("guard");
  if (guard) {
    guard.classList.add("is-on", "settled");
    guard.style.setProperty("--p", "1");
    const status = document.getElementById("guard-status");
    if (status) status.textContent = "Guardia activa. Señal, puesto y protocolo listos.";
  }
  document.querySelectorAll(".reveal").forEach((el) => el.classList.add("in", "settled"));
  document.querySelectorAll(".draw, .impact-draw").forEach((line) => {
    line.style.strokeDashoffset = "0";
  });
}

function unpinFinalStates() {
  document.body.classList.remove("motion-pinned");
  const guard = document.getElementById("guard");
  if (guard && guard.dataset.locked !== "1") {
    guard.classList.remove("is-on", "settled");
    guard.style.setProperty("--p", "0");
  }
  document.querySelectorAll(".draw, .impact-draw").forEach((line) => {
    line.style.strokeDashoffset = "";
    delete line.dataset.p;
  });
}

function enableScrub() {
  if (scrubOn) return;
  scrubOn = true;
  document.body.classList.remove("is-static");
  bands.forEach((b) => {
    b._op = -1;
    b._k = -1;
  });
  unpinFinalStates();
  initHeroOnce();
  onScroll();
  requestAnimationFrame(loadLoop);
}

function disableScrub() {
  const already = !scrubOn && document.body.classList.contains("is-static");
  scrubOn = false;
  document.body.classList.add("is-static");
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
    lastTick = 0;
  }
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) pinToFinalStates();
  else if (already) return;
}

function applyHeroMode() {
  if (GATES.some((q) => matchMedia(q).matches)) disableScrub();
  else enableScrub();
}

const MQLS = GATES.map((q) => matchMedia(q));
MQLS.forEach((mq) => mq.addEventListener("change", applyHeroMode));
matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", (event) => {
  if (event.matches) pinToFinalStates();
  else applyHeroMode();
});

new IntersectionObserver(([entry]) => {
  heroOn = entry.isIntersecting;
  if (!heroOn && rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
    lastTick = 0;
  } else if (heroOn && scrubOn) onScroll();
}, { threshold: 0 }).observe(stage);

addEventListener("scroll", onScroll, { passive: true });
addEventListener("resize", () => {
  if (scrubOn) onScroll();
});

function paintThread() {
  const max = document.documentElement.scrollHeight - innerHeight;
  const p = max > 0 ? scrollY / max : 0;
  document.documentElement.style.setProperty("--scroll", p.toFixed(4));
}
addEventListener("scroll", paintThread, { passive: true });
paintThread();

document.addEventListener("visibilitychange", () => {
  document.body.classList.toggle("paused", document.hidden);
});

const io = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    entry.target.classList.add("in");
    entry.target.querySelectorAll("[data-count]").forEach(animateCount);
    window.setTimeout(() => entry.target.classList.add("settled"), 720);
    io.unobserve(entry.target);
  });
}, { threshold: 0.22 });

document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

const life = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    entry.target.classList.toggle("awake", entry.isIntersecting);
  });
}, { threshold: 0.12 });

document.querySelectorAll("section, .facts, .marquee, .impact").forEach((el) => life.observe(el));

function animateCount(el) {
  if (el.dataset.done) return;
  el.dataset.done = "1";
  const targetN = Number(el.dataset.count);
  if (document.body.classList.contains("motion-pinned")) {
    el.textContent = String(targetN);
    return;
  }
  const t0 = performance.now();
  const frame = (now) => {
    const t = Math.min(1, (now - t0) / 1100);
    const eased = 1 - Math.pow(1 - t, 3);
    const val = Math.round(targetN * eased);
    if (el._v !== val) {
      el._v = val;
      el.textContent = String(val);
    }
    if (t < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

const guard = document.getElementById("guard");
const guardBtn = document.getElementById("guard-btn");
const guardStatus = document.getElementById("guard-status");
let holding = false;
let hold = 0;
let holdRaf = 0;
let holdLocked = false;

function paintHold() {
  guard.style.setProperty("--p", hold.toFixed(3));
}

function holdFrame(now) {
  const dt = Math.min(40, now - (holdFrame.last || now));
  holdFrame.last = now;
  if (holdLocked) hold = 1;
  else if (holding) hold = Math.min(1, hold + dt / 1400);
  else hold = Math.max(0, hold - dt / 520);
  if (hold >= 1 && holding && !holdLocked) completeHold();
  paintHold();
  const moving = holding || (!holdLocked && hold > 0 && hold < 1);
  if (moving) holdRaf = requestAnimationFrame(holdFrame);
  else holdRaf = 0;
}

function kickHold() {
  if (!holdRaf) holdRaf = requestAnimationFrame(holdFrame);
}

function startHold(event) {
  if (holdLocked || document.body.classList.contains("motion-pinned")) return;
  holding = true;
  if (event && event.pointerId !== undefined && guardBtn.setPointerCapture) {
    guardBtn.setPointerCapture(event.pointerId);
  }
  kickHold();
}

function stopHold() {
  holding = false;
  kickHold();
}

function completeHold() {
  holdLocked = true;
  guard.dataset.locked = "1";
  guard.classList.add("is-on");
  guardStatus.textContent = "Guardia activa. Señal, puesto y protocolo listos.";
  window.setTimeout(() => guard.classList.add("settled"), 700);
}

guardBtn.addEventListener("pointerdown", startHold);
guardBtn.addEventListener("pointerup", stopHold);
guardBtn.addEventListener("pointercancel", stopHold);
guardBtn.addEventListener("lostpointercapture", stopHold);
guardBtn.addEventListener("keydown", (event) => {
  if (event.repeat) return;
  if (event.key === " " || event.key === "Enter") {
    event.preventDefault();
    startHold();
  }
});
guardBtn.addEventListener("keyup", (event) => {
  if (event.key === " " || event.key === "Enter") stopHold();
});

const toggle = document.querySelector(".nav-toggle");
const nav = document.getElementById("nav-panel");
function setNav(open) {
  document.body.classList.toggle("nav-open", open);
  toggle.setAttribute("aria-expanded", open ? "true" : "false");
  toggle.querySelector(".sr-only").textContent = open ? "Cerrar menú" : "Abrir menú";
}
toggle.addEventListener("click", () => setNav(!document.body.classList.contains("nav-open")));
nav.addEventListener("click", (event) => {
  if (event.target.closest("a")) setNav(false);
});
addEventListener("keydown", (event) => {
  if (event.key === "Escape") setNav(false);
});

const form = document.getElementById("cotizacion");
const success = document.getElementById("form-success");
const summary = document.getElementById("form-summary");

function fieldError(input, message) {
  const field = input.closest(".field");
  const err = field.querySelector(".err");
  field.classList.toggle("is-bad", Boolean(message));
  input.setAttribute("aria-invalid", message ? "true" : "false");
  err.textContent = message || "";
  return !message;
}

function validateForm() {
  let ok = true;
  const nombre = form.nombre;
  const tel = form.telefono;
  const correo = form.correo;
  const necesidad = form.necesidad;
  ok = fieldError(nombre, nombre.value.trim().length < 2 ? "Escriba su nombre." : "") && ok;
  ok = fieldError(tel, tel.value.replace(/\D/g, "").length < 7 ? "Escriba un teléfono de contacto." : "") && ok;
  ok = fieldError(correo, /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.value.trim()) ? "" : "Escriba un correo válido.") && ok;
  ok = fieldError(necesidad, necesidad.value ? "" : "Cuéntenos qué hay que cuidar.") && ok;
  ok = fieldError(form.datos, form.datos.checked ? "" : "Debe aceptar el tratamiento de datos.") && ok;
  return ok;
}

form.querySelectorAll("input, select, textarea").forEach((input) => {
  input.addEventListener("blur", () => {
    if (form.dataset.touched) validateForm();
  });
});

function buildMessage() {
  const data = new FormData(form);
  return [
    "Solicitud de cotización REDSEG",
    "Nombre: " + data.get("nombre"),
    "Empresa: " + (data.get("empresa") || "No indica"),
    "Teléfono: " + data.get("telefono"),
    "Correo: " + data.get("correo"),
    "Qué hay que cuidar: " + data.get("necesidad"),
    "Mensaje: " + (data.get("mensaje") || "Sin mensaje adicional"),
    "Tratamiento de datos: aceptado, Ley 1581 de 2012"
  ].join("\n");
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  form.dataset.touched = "1";
  if (!validateForm()) {
    const bad = form.querySelector(".is-bad input, .is-bad select, .is-bad textarea");
    if (bad) bad.focus();
    return;
  }
  const text = buildMessage();
  const href = "mailto:" + REDSEG_MAIL + "?subject=" + encodeURIComponent("Cotización REDSEG") + "&body=" + encodeURIComponent(text);
  summary.textContent = text;
  form.hidden = true;
  success.classList.add("is-on");
  success.focus();
  window.location.href = href;
});

document.getElementById("copy-msg").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(summary.textContent);
    document.getElementById("copy-msg").textContent = "Texto copiado";
  } catch {
    document.getElementById("copy-msg").textContent = "Seleccione el texto y cópielo";
  }
});

const jobForm = document.getElementById("postulacion");
const jobSuccess = document.getElementById("postulacion-success");
const jobSummary = document.getElementById("postulacion-summary");

function validateJob() {
  let ok = true;
  ok = fieldError(jobForm.nombre, jobForm.nombre.value.trim().length < 2 ? "Escriba su nombre." : "") && ok;
  ok = fieldError(jobForm.telefono, jobForm.telefono.value.replace(/\D/g, "").length < 7 ? "Escriba un teléfono de contacto." : "") && ok;
  ok = fieldError(jobForm.correo, /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(jobForm.correo.value.trim()) ? "" : "Escriba un correo válido.") && ok;
  ok = fieldError(jobForm.curso, jobForm.curso.value.trim().length < 4 ? "Escriba la escuela y el curso vigente." : "") && ok;
  ok = fieldError(jobForm.psicofisico, jobForm.psicofisico.checked ? "" : "Debe declarar el examen y los antecedentes.") && ok;
  ok = fieldError(jobForm.datos, jobForm.datos.checked ? "" : "Debe aceptar el tratamiento de datos.") && ok;
  return ok;
}

jobForm.querySelectorAll("input").forEach((input) => {
  input.addEventListener("blur", () => {
    if (jobForm.dataset.touched) validateJob();
  });
});

jobForm.addEventListener("submit", (event) => {
  event.preventDefault();
  jobForm.dataset.touched = "1";
  if (!validateJob()) {
    const bad = jobForm.querySelector(".is-bad input");
    if (bad) bad.focus();
    return;
  }
  const data = new FormData(jobForm);
  const text = [
    "Postulación REDSEG",
    "Nombre: " + data.get("nombre"),
    "Teléfono: " + data.get("telefono"),
    "Correo: " + data.get("correo"),
    "Escuela y curso vigente: " + data.get("curso"),
    "Examen psicofísico y antecedentes: declarados",
    "Tratamiento de datos: aceptado, Ley 1581 de 2012"
  ].join("\n");
  jobSummary.textContent = text;
  jobForm.hidden = true;
  jobSuccess.classList.add("is-on");
  jobSuccess.focus();
  window.location.href = "mailto:" + REDSEG_MAIL + "?subject=" + encodeURIComponent("Postulación REDSEG") + "&body=" + encodeURIComponent(text);
});

document.getElementById("copy-postulacion").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(jobSummary.textContent);
    document.getElementById("copy-postulacion").textContent = "Texto copiado";
  } catch {
    document.getElementById("copy-postulacion").textContent = "Seleccione el texto y cópielo";
  }
});

const wa = document.getElementById("wa");
const waLine = document.getElementById("wa-line");
if (REDSEG_WA) {
  const href = "https://wa.me/" + REDSEG_WA;
  [wa, waLine].forEach((el) => {
    if (!el) return;
    el.href = href;
    el.setAttribute("target", "_blank");
    el.setAttribute("rel", "noopener");
  });
}

function setupImpact() {
  const section = document.getElementById("impacto");
  const line = section && section.querySelector(".impact__line");
  if (!line) return;
  const text = line.textContent.trim();
  const words = text.split(/\s+/);
  line.replaceChildren();
  const sr = document.createElement("span");
  sr.className = "sr-only";
  sr.textContent = text;
  const visual = document.createElement("span");
  visual.setAttribute("aria-hidden", "true");
  words.forEach((word, i) => {
    const span = document.createElement("span");
    span.className = "word";
    span.textContent = word;
    visual.append(span);
    if (i < words.length - 1) visual.append(document.createTextNode(" "));
  });
  line.append(sr, visual);
  const spans = [...visual.querySelectorAll(".word")];
  const shield = section.querySelector(".impact-draw");
  const narrow = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const render = () => {
    if (narrow()) {
      spans.forEach((w) => {
        w.style.opacity = "1";
        w.style.transform = "none";
      });
      if (shield) shield.style.strokeDashoffset = "0";
      return;
    }
    const range = Math.max(1, section.offsetHeight - innerHeight);
    const p = clamp(-section.getBoundingClientRect().top / range, 0, 1);
    spans.forEach((w, i) => {
      const start = (i / spans.length) * 0.78 - 0.08;
      const o = clamp((p - start) / 0.1, 0, 1);
      w.style.opacity = String(0.18 + o * 0.82);
      w.style.transform = `translateY(${((1 - o) * 12).toFixed(2)}px)`;
    });
    if (shield) shield.style.strokeDashoffset = (1 - p).toFixed(3);
  };
  addEventListener("scroll", render, { passive: true });
  addEventListener("resize", render);
  render();
}

function setupQuotes() {
  const quotes = [...document.querySelectorAll(".quote")];
  if (!quotes.length) return;
  let index = Math.max(0, quotes.findIndex((q) => q.classList.contains("is-on")));
  const show = (next) => {
    index = (next + quotes.length) % quotes.length;
    quotes.forEach((q, i) => {
      const on = i === index;
      q.classList.toggle("is-on", on);
      q.toggleAttribute("hidden", !on);
    });
  };
  show(index);
  document.querySelectorAll(".quote-btn").forEach((btn) => {
    btn.addEventListener("click", () => show(index + Number(btn.dataset.dir)));
  });
}

function setupZones() {
  const note = document.getElementById("zone-note");
  const zones = [...document.querySelectorAll(".zone")];
  zones.forEach((btn) => {
    btn.addEventListener("click", () => {
      zones.forEach((z) => {
        const on = z === btn;
        z.classList.toggle("is-on", on);
        z.setAttribute("aria-pressed", on ? "true" : "false");
      });
      if (note) note.textContent = btn.dataset.note || "";
    });
  });
}

function setupSpine() {
  const spine = document.querySelector(".draw");
  const wrap = document.querySelector(".pillars-wrap");
  if (!spine || !wrap) return;
  const render = () => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      spine.style.strokeDashoffset = "0";
      return;
    }
    const r = wrap.getBoundingClientRect();
    const p = clamp((innerHeight * 0.72 - r.top) / (r.height * 0.85), 0, 1);
    const next = (1 - p).toFixed(3);
    if (spine.dataset.p === next) return;
    spine.dataset.p = next;
    spine.style.strokeDashoffset = next;
  };
  addEventListener("scroll", render, { passive: true });
  addEventListener("resize", render);
  render();
}

setupImpact();
setupQuotes();
setupZones();
setupSpine();

applyHeroMode();
onScroll();
