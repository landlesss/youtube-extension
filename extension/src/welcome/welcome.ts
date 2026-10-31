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
  document.getElementById("demo-caption-text")!.textContent = captions[step];
  document.querySelector(".step-count")!.textContent = `0${step + 1} / 03`;
  dots.forEach((dot, i) => {
    dot.classList.toggle("active", i === step);
    dot.setAttribute("aria-pressed", String(i === step));
  });
}
let timer: ReturnType<typeof setInterval> | undefined;
function stopTour(): void { if (timer !== undefined) clearInterval(timer); }
dots.forEach((dot, i) => dot.addEventListener("click", () => { stopTour(); showStep(i); }));
document.querySelector(".demo-launch")!.addEventListener("click", () => { stopTour(); showStep(1); });
browser.addEventListener("focusin", stopTour);
showStep(0);
if (!reducedMotion) timer = setInterval(() => { if (!document.hidden) showStep((step + 1) % 3); }, 5000);

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
  const pieces = Array.from({ length: 150 }, (_, i) => {
    const left = i % 2 === 0;
    return { x: left ? width * .12 : width * .88, y: height * .3,
      vx: (left ? 1 : -1) * (60 + Math.random() * 430), vy: -100 - Math.random() * 470,
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
    context!.globalAlpha = Math.max(0, Math.min(1, 4.5 - elapsed));
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
    if (elapsed < 4.5 && !document.hidden) requestAnimationFrame(frame);
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
