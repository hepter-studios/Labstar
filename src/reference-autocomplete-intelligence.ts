export {};

type Trigger = "@" | "#" | "/";

type ActiveReference = {
  trigger: Trigger;
  query: string;
};

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function activeReference(): ActiveReference | null {
  const field = document.activeElement;
  if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) return null;
  const cursor = field.selectionStart ?? field.value.length;
  const before = field.value.slice(0, cursor);
  const match = before.match(/(^|[\s([{])([@#/])([^\s@#/]{0,64})$/);
  if (!match) return null;
  return { trigger: match[2] as Trigger, query: normalize(match[3] ?? "") };
}

function isSubsequence(text: string, query: string) {
  if (!query) return true;
  let queryIndex = 0;
  for (const character of text) {
    if (character === query[queryIndex]) queryIndex += 1;
    if (queryIndex === query.length) return true;
  }
  return false;
}

function nameScore(name: string, query: string) {
  const text = normalize(name);
  if (!query) return 1;
  if (text === query) return 1000;
  if (text.startsWith(query)) return 900 - Math.min(100, text.length - query.length);
  if (text.split(/[\s._-]+/).some((part) => part.startsWith(query))) return 800;
  if (text.includes(query)) return 700 - Math.min(100, text.indexOf(query));
  if (query.length >= 2 && isSubsequence(text.replace(/\s+/g, ""), query.replace(/\s+/g, ""))) return 500;
  return 0;
}

function ownSuggestionName(button: HTMLButtonElement) {
  const strong = button.querySelector("strong");
  return strong?.textContent?.replace(/^\//, "").trim() ?? "";
}

function suggestionKind(button: HTMLButtonElement) {
  return normalize(button.querySelector("em")?.textContent ?? "");
}

function applyIntelligentFilter() {
  const panel = document.querySelector<HTMLElement>(".universal-autocomplete");
  if (!panel) return;
  const reference = activeReference();
  if (!reference) return;

  const buttons = Array.from(panel.querySelectorAll<HTMLButtonElement>(".universal-autocomplete-list > button"));
  if (!buttons.length) return;

  const scored = buttons.map((button) => {
    const kind = suggestionKind(button);
    const name = ownSuggestionName(button);
    let score = nameScore(name, reference.query);

    /* # deve responder ao nome do próprio canal/servidor. O servidor pai não
       pode manter todos os canais visíveis só porque ele combina com a busca. */
    if (reference.trigger === "#" && !kind.includes("canal") && !kind.includes("servidor")) score = 0;
    if (reference.trigger === "@" && !kind.includes("pessoa")) score = 0;
    if (reference.trigger === "/" && !kind.includes("comando")) score = 0;

    return { button, score, name };
  });

  const positive = scored.filter((entry) => entry.score > 0);
  const best = positive.reduce((value, entry) => Math.max(value, entry.score), 0);
  const strongPrefix = reference.query.length >= 2 && best >= 800;
  const threshold = strongPrefix ? Math.max(1, best - 120) : 1;

  let visibleIndex = 0;
  for (const entry of scored) {
    const visible = entry.score >= threshold;
    entry.button.hidden = !visible;
    entry.button.style.display = visible ? "" : "none";
    entry.button.dataset.smartReferenceScore = String(entry.score);
    if (visible) {
      entry.button.style.order = String(1000 - entry.score);
      entry.button.setAttribute("aria-posinset", String(++visibleIndex));
    }
  }

  const list = panel.querySelector<HTMLElement>(".universal-autocomplete-list");
  if (list) {
    list.style.display = "flex";
    list.style.flexDirection = "column";
  }

  /* O destaque visual acompanha o primeiro resultado que realmente sobrou. */
  const visibleButtons = scored.filter((entry) => !entry.button.hidden).sort((a, b) => b.score - a.score);
  if (visibleButtons.length) {
    buttons.forEach((button) => button.classList.remove("smart-reference-best"));
    visibleButtons[0].button.classList.add("smart-reference-best");
  }
}

function scheduleFilter() {
  window.requestAnimationFrame(() => window.requestAnimationFrame(applyIntelligentFilter));
}

function startReferenceAutocompleteIntelligence() {
  const observer = new MutationObserver(scheduleFilter);
  observer.observe(document.body, { childList: true, subtree: true });
  document.addEventListener("input", scheduleFilter, true);
  document.addEventListener("focusin", scheduleFilter, true);
  document.addEventListener("keyup", scheduleFilter, true);
  document.addEventListener("click", scheduleFilter, true);
  scheduleFilter();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startReferenceAutocompleteIntelligence, { once: true });
} else {
  startReferenceAutocompleteIntelligence();
}
