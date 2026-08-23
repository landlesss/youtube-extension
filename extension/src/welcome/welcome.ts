import { t } from "../lib/i18n";

for (const el of document.querySelectorAll<HTMLElement>("[data-i18n]")) {
  const key = el.dataset.i18n;
  if (key) el.textContent = t(key);
}
