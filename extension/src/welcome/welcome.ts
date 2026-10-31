if (document.body.dataset.installed === "true" && typeof chrome !== "undefined" && chrome.i18n?.getMessage) {
  const name = document.querySelector<HTMLElement>(".brand-name");
  if (name) name.textContent = chrome.i18n.getMessage("extName") || name.textContent;
}
// Shared between the installation welcome page and the public landing page.
const installed = document.body.dataset.installed === "true";
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const russian = installed && (typeof chrome !== "undefined" && chrome.i18n?.getUILanguage?.() || navigator.language).startsWith("ru");
if (russian) {
  document.documentElement.lang = "ru";
  const copy: Record<string, string> = {
    onboardingEyebrow: "РАСШИРЕНИЕ УСТАНОВЛЕНО",
    onboardingSubtitle: "Наша кнопка CC уже в плеере YouTube. Откройте видео — и пусть каждое слово станет понятнее.",
    onboardingCta: "Открыть YouTube",
  };
  for (const element of document.querySelectorAll<HTMLElement>("[data-i18n]")) {
    const value = copy[element.dataset.i18n ?? ""];
    if (value) element.textContent = value;
  }
  const heading = document.querySelector("h1");
  if (heading) heading.innerHTML = "Всё готово.<br><em>YouTube на вашем языке.</em>";
  const badge = document.querySelector(".header-badge");
  if (badge) badge.textContent = "✓ Добавлено в Chrome";
  const note = document.querySelector(".cta-note");
  if (note) note.textContent = "Без регистрации. Ваше первое видео уже ждёт.";
  const headings = ["Откройте видео.", "Выберите свой язык.", "Сохраните нужные слова."];
  const descriptions = ["Найдите интересное видео. Наша кнопка CC находится прямо в панели управления плеером.", "Читайте субтитры в отдельной боковой панели. Выберите язык и нажмите «Перевести».", "Скопируйте текст или скачайте SRT, VTT или TXT. Оригинал, перевод или оба сразу."];
  document.querySelectorAll(".steps article").forEach((article, i) => {
    article.querySelector("h2")!.textContent = headings[i];
    article.querySelector("p")!.textContent = descriptions[i];
  });
}

const captions = russian ? [
  "Нажмите нашу кнопку CC в плеере YouTube.",
  "Читайте и переводите в отдельной боковой панели.",
  "Скопируйте текст или скачайте SRT, VTT или TXT.",
] : [
  "Click our CC icon in the YouTube player.",
  "Read and translate in a separate side panel.",
  "Copy your transcript or download SRT, VTT or TXT.",
];
let step = 0;
const browser = document.querySelector<HTMLElement>(".demo-browser")!;
const dots = [...document.querySelectorAll<HTMLButtonElement>(".step-dots button")];
function showStep(index: number): void {
  step = index;
  browser.dataset.step = String(step);
  const caption = document.getElementById("demo-caption-text")!;
  caption.textContent = captions[step];
  if (!reducedMotion) caption.animate([{ opacity: 0, transform: "translateY(4px)" }, { opacity: 1, transform: "none" }], { duration: 350, easing: "ease-out" });
  document.querySelector(".step-count")!.textContent = `0${step + 1} / 03`;
  dots.forEach((dot, i) => {
    dot.classList.toggle("active", i === step);
    dot.setAttribute("aria-pressed", String(i === step));
  });
}
// A real mini-tutorial: pointer movement, a click, panel reveal and text sync.
const pointer = document.createElement("div");
pointer.className = "demo-pointer";
pointer.setAttribute("aria-hidden", "true");
browser.appendChild(pointer);
const timeline = document.createElement("div");
timeline.className = "demo-timeline";
timeline.setAttribute("aria-hidden", "true");
timeline.innerHTML = "<i></i><i></i><i></i>";
browser.prepend(timeline);
const exportMenu = document.createElement("div");
exportMenu.className = "demo-export";
exportMenu.setAttribute("aria-hidden", "true");
exportMenu.innerHTML = "<span>↓ &nbsp; Download subtitles</span><b>SRT <small>SubRip captions</small><i>✓</i></b><b>VTT <small>Web captions</small></b><b>TXT <small>Plain text</small></b>";
const panel = document.querySelector(".demo-panel")!;
const transcriptViewport = document.createElement("div");
transcriptViewport.className = "demo-transcript";
panel.querySelectorAll(".caption").forEach(caption => transcriptViewport.appendChild(caption));
panel.append(transcriptViewport, exportMenu);
const replay = document.createElement("button");
replay.className = "demo-replay";
replay.type = "button";
replay.textContent = "↻";
replay.title = russian ? "Повторить анимацию" : "Replay animation";
replay.setAttribute("aria-label", replay.title);
document.querySelector(".demo-caption")!.appendChild(replay);

const durations = [4500, 5500, 4000];
let timer: ReturnType<typeof setTimeout> | undefined;
let motionTimer: ReturnType<typeof setTimeout> | undefined;
let playback = !reducedMotion;
let pointerMotion: Animation | undefined;
function stopTour(): void {
  playback = false;
  if (timer !== undefined) clearTimeout(timer);
}
function animateStep(index: number): void {
  if (motionTimer !== undefined) clearTimeout(motionTimer);
  pointerMotion?.cancel();
  browser.classList.remove("demo-clicked");
  browser.dataset.playing = String(playback);
  browser.style.setProperty("--step-duration", `${durations[index]}ms`);
  if (reducedMotion) return;
  const target = document.querySelector<HTMLElement>(index === 0 ? ".demo-launch" : index === 1 ? ".demo-tools .selected" : ".demo-tools > span:first-child")!;
  // Wait for the responsive panel/zoom transition before measuring its target.
  motionTimer = setTimeout(() => {
    const box = browser.getBoundingClientRect();
    const rect = target.getBoundingClientRect();
    const x = rect.left - box.left + rect.width * .65;
    const y = rect.top - box.top + rect.height * .65;
    pointerMotion = pointer.animate([
      { transform: `translate(${x - 75}px, ${y - 60}px) scale(1)`, opacity: 0, offset: 0 },
      { transform: `translate(${x - 75}px, ${y - 60}px) scale(1)`, opacity: 1, offset: .15 },
      { transform: `translate(${x}px, ${y}px) scale(1)`, opacity: 1, offset: .65 },
      { transform: `translate(${x}px, ${y}px) scale(.8)`, opacity: 1, offset: .8 },
      { transform: `translate(${x}px, ${y}px) scale(1)`, opacity: 1, offset: 1 },
    ], { duration: 1100, easing: "ease-in-out", fill: "forwards" });
    motionTimer = setTimeout(() => browser.classList.add("demo-clicked"), 900);
  }, index === 0 ? 700 : 1000);
}
function goTo(index: number): void {
  showStep(index);
  animateStep(index);
}
function schedule(): void {
  if (!playback || document.hidden) return;
  timer = setTimeout(() => { goTo((step + 1) % 3); schedule(); }, durations[step]);
}
dots.forEach((dot, i) => dot.addEventListener("click", () => { stopTour(); goTo(i); }));
document.querySelector(".demo-launch")!.addEventListener("click", () => { stopTour(); goTo(1); });
replay.addEventListener("click", () => {
  stopTour();
  playback = !reducedMotion;
  goTo(0);
  schedule();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (timer !== undefined) clearTimeout(timer);
    if (motionTimer !== undefined) clearTimeout(motionTimer);
    pointerMotion?.pause();
  } else {
    pointerMotion?.play();
    schedule();
  }
});
goTo(0);
schedule();

// Reveal lower sections as they enter view, without hiding content if JS fails.
if (!reducedMotion) {
  const observer = new IntersectionObserver(entries => entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    entry.target.classList.add("revealed");
    observer.unobserve(entry.target);
  }), { threshold: .15 });
  document.querySelectorAll(".steps article, .closing").forEach(element => {
    element.classList.add("reveal-on-scroll");
    observer.observe(element);
  });
}

function celebrate(): void {
  if (reducedMotion) return;
  const canvas = document.getElementById("confetti") as HTMLCanvasElement;
  const context = canvas.getContext("2d");
  if (!context) return;
  const width = window.innerWidth, height = window.innerHeight;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  context.scale(ratio, ratio);
  const colors = ["#4fd1c5", "#8e7bff", "#c1b5ff", "#a2f2e4", "#508cff"];
  const pieces = Array.from({ length: 210 }, (_, i) => {
    const left = i % 2 === 0;
    return { x: i < 130 ? (left ? width * .08 : width * .92) : Math.random() * width, y: i < 130 ? height * .32 : -Math.random() * height * 1.5,
      vx: i < 130 ? (left ? 1 : -1) * (60 + Math.random() * 430) : (Math.random() - .5) * 70, vy: i < 130 ? -100 - Math.random() * 470 : 100 + Math.random() * 80,
      spin: Math.random() * 8 - 4, rotation: Math.random() * 6,
      size: 4 + Math.random() * 7, color: colors[i % colors.length] };
  });
  const start = performance.now();
  let previous = start;
  function frame(now: number): void {
    const dt = Math.min((now - previous) / 1000, .04);
    previous = now;
    const elapsed = (now - start) / 1000;
    context!.clearRect(0, 0, width, height);
    context!.globalAlpha = Math.max(0, Math.min(1, 7.5 - elapsed));
    for (const piece of pieces) {
      piece.vy += 240 * dt;
      piece.x += piece.vx * dt;
      piece.y += piece.vy * dt;
      piece.rotation += piece.spin * dt;
      context!.save();
      context!.translate(piece.x, piece.y);
      context!.rotate(piece.rotation);
      context!.fillStyle = piece.color;
      context!.fillRect(-piece.size / 2, -piece.size / 2, piece.size, piece.size * .5);
      context!.restore();
    }
    if (elapsed < 7.5 && !document.hidden) requestAnimationFrame(frame);
    else { context!.clearRect(0, 0, width, height); canvas.hidden = true; }
  }
  requestAnimationFrame(frame);
}
if (installed) {
  // Runs only on the successful-install page, never on an Add to Chrome click.
  let played = false;
  try { played = sessionStorage.getItem("welcomeCelebrated") === "true"; sessionStorage.setItem("welcomeCelebrated", "true"); } catch { /* Storage can be disabled. */ }
  if (!played) celebrate();
}
