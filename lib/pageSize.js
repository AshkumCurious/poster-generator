export const PAGE_PRESETS = [
  { id: 'a4', name: 'A4', widthMm: 210, heightMm: 297 },
  { id: 'a3', name: 'A3', widthMm: 297, heightMm: 420 },
  { id: 'a5', name: 'A5', widthMm: 148, heightMm: 210 },
  { id: 'letter', name: 'Letter', widthMm: 216, heightMm: 279 },
  { id: 'square', name: 'Square', widthMm: 210, heightMm: 210 },
];

export const DEFAULT_PAGE = { widthMm: 210, heightMm: 297 };

const PX_PER_MM = 150 / 25.4;

export function pagePx(page = DEFAULT_PAGE) {
  const widthMm = Math.max(50, Number(page.widthMm) || DEFAULT_PAGE.widthMm);
  const heightMm = Math.max(50, Number(page.heightMm) || DEFAULT_PAGE.heightMm);
  return {
    width: Math.round(widthMm * PX_PER_MM),
    height: Math.round(heightMm * PX_PER_MM),
  };
}

export function presetIdFor(page = DEFAULT_PAGE) {
  const w = Number(page.widthMm);
  const h = Number(page.heightMm);
  const match = PAGE_PRESETS.find(
    (p) => (p.widthMm === w && p.heightMm === h) || (p.widthMm === h && p.heightMm === w)
  );
  return match?.id || 'custom';
}

export function emptyLayout() {
  return { page: { ...DEFAULT_PAGE }, items: [] };
}

export function normalizeLayout(raw) {
  if (!raw || typeof raw !== 'object') return emptyLayout();
  const items = Array.isArray(raw.items) ? raw.items : [];
  const page = {
    widthMm: Number(raw.page?.widthMm) || DEFAULT_PAGE.widthMm,
    heightMm: Number(raw.page?.heightMm) || DEFAULT_PAGE.heightMm,
  };
  return { page, items };
}
