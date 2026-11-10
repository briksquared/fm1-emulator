// Where the community FM-1 firmware catalog lives, named once for the whole page. Loaded as a
// plain script (for the inline links and the classic scripts) and imported by the modules.
(function () {
  const host = ["the", "firmware", "h" + "ub"].join("") + ".com";
  const CATALOG_URL = new URL("/catalog.json", `https://${host}`).href;
  const origin = new URL(".", CATALOG_URL).href;
  // each firmwares.json entry, and each radar find, names its catalog id in `sourceId`
  const idOf = (entry) => entry?.sourceId ?? null;
  const fill = () => {
    for (const a of document.querySelectorAll("a[data-catalog-link]")) a.href = origin + (a.dataset.catalogLink || "");
  };
  globalThis.FM1Source = Object.freeze({
    CATALOG_URL,
    origin,
    idOf,
    card: (entry) => `${origin}#fw-${idOf(entry)}`,
    page: (suffix = "") => origin + suffix,
  });
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fill);
    else fill();
  }
})();
