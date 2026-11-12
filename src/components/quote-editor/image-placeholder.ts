/**
 * What an image block shows in the editors before a photo is chosen. The PDF prints
 * nothing until there is a photo, and the picture says so.
 */
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="440" viewBox="0 0 1200 440">
<rect width="1200" height="440" fill="#efedf3"/>
<rect x="12" y="12" width="1176" height="416" rx="10" fill="none" stroke="#a9a4b8" stroke-width="3" stroke-dasharray="14 12"/>
<g transform="translate(560 140)" fill="none" stroke="#6b6680" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">
<rect x="0" y="0" width="80" height="64" rx="10"/><circle cx="26" cy="22" r="8"/><path d="M4 56 30 34l18 14 12-10 18 16"/>
</g>
<text x="600" y="270" text-anchor="middle" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="34" font-weight="600" fill="#3c3946">Scegli una foto per questo blocco</text>
<text x="600" y="318" text-anchor="middle" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="26" fill="#5c586b">Senza foto il blocco non va in stampa</text>
</svg>`;

export const imagePlaceholder = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
