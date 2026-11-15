// Builds src/domain/fonts/catalog.json from the free public metadata of Google Fonts and Fontshare.
// Only families with an open or free licence that allows embedding (SIL OFL, Apache, UFL, ITF FFL).
// Run: node scripts/font-catalog.mjs
import { writeFile } from "node:fs/promises";

const google = await (await fetch("https://fonts.google.com/metadata/fonts")).json();
const gCat = { "Sans Serif": "sans", Serif: "serif", Display: "display", Handwriting: "handwriting", Monospace: "mono" };
const out = [];
for (const f of google.familyMetadataList) {
  if (!f.isOpenSource || f.isBrandFont) continue;
  if (!f.subsets?.includes("latin") || f.primaryScript) continue;
  if (f.colorCapabilities?.length) continue;
  const cat = gCat[f.category];
  if (!cat) continue;
  const keys = Object.keys(f.fonts);
  const w = [...new Set(keys.filter((k) => !k.endsWith("i")).map(Number))].sort((a, b) => a - b);
  const i = [...new Set(keys.filter((k) => k.endsWith("i")).map((k) => Number(k.slice(0, -1))))].sort((a, b) => a - b);
  if (!w.length) continue;
  out.push({ r: `g:${f.family}`, n: f.family, c: cat, w, i, p: f.popularity ?? 9999 });
}

const fs = [];
for (let page = 1; page < 10; page += 1) {
  const data = await (await fetch(`https://api.fontshare.com/v2/fonts?limit=100&page=${page}`)).json();
  fs.push(...data.fonts);
  if (!data.has_more) break;
}
const fsCat = (c) => {
  const v = c.toLowerCase();
  if (v.includes("script") || v.includes("handwrit")) return "handwriting";
  if (v.includes("display")) return "display";
  if (v.includes("serif") || v.includes("slab")) return "serif";
  return "sans";
};
const byViews = [...fs].sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
byViews.forEach((f, index) => {
  if (!["itf_ffl", "sil_ofl"].includes(f.license_type)) return;
  const styles = (f.styles ?? []).filter((s) => !s.is_variable);
  const w = [...new Set(styles.filter((s) => !s.is_italic).map((s) => Math.round(s.weight.number / 100) * 100))].sort((a, b) => a - b);
  const i = [...new Set(styles.filter((s) => s.is_italic).map((s) => Math.round(s.weight.number / 100) * 100))].sort((a, b) => a - b);
  if (!w.length) return;
  // Fontshare families are curated and popular: they sit among the first results.
  out.push({ r: `fs:${f.slug}`, n: f.name, c: fsCat(f.category ?? ""), w, i, p: index * 6 + 1 });
});

out.sort((a, b) => a.p - b.p);
const compact = out.map(({ r, n, c, w, i }) => [r, n, c, w, i]);
await writeFile(new URL("../src/domain/fonts/catalog.json", import.meta.url), JSON.stringify(compact));
console.log(`${compact.length} famiglie (${compact.filter((x) => x[0].startsWith("fs:")).length} Fontshare)`);
