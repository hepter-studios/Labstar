export function isDevPreviewMode() {
  return import.meta.env.DEV && new URLSearchParams(window.location.search).has("preview");
}
