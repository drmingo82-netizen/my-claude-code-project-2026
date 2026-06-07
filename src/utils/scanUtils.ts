const BASE = 'https://tactile-creations.vercel.app';

export function spoolQrUrl(spoolId: string): string {
  return `${BASE}/scan?spoolId=${encodeURIComponent(spoolId)}&type=filament`;
}

export function productQrUrl(skuId: string): string {
  return `${BASE}/scan?skuId=${encodeURIComponent(skuId)}&type=product`;
}

export interface LabelItem {
  qrDataUrl: string;
  line1: string;
  line2: string;
  id: string;
  meta: string;
}

export function buildPrintHtml(items: LabelItem[], single: boolean): string {
  const labelsHtml = items
    .map(
      (item) => `
    <div class="label">
      <img src="${item.qrDataUrl}" width="90" height="90" />
      <p class="title">${item.line1}</p>
      <p class="sub">${item.line2}</p>
      <p class="mono">${item.id}</p>
      <p class="meta">${item.meta}</p>
    </div>`,
    )
    .join('');

  const pageStyle = single
    ? `@page { margin: 0; size: 2in 2in; }`
    : `@page { margin: 0.25in; size: letter; }`;

  const cols = single ? 1 : 4;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  ${pageStyle}
  body { margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; }
  .sheet {
    display: grid;
    grid-template-columns: repeat(${cols}, 2in);
  }
  .label {
    width: 2in;
    height: 2in;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 4pt;
    border: 0.5pt dashed #ccc;
    page-break-inside: avoid;
    break-inside: avoid;
    gap: 1.5pt;
  }
  .label p { margin: 0; text-align: center; }
  .title { font-size: 8pt; font-weight: bold; color: #111; }
  .sub   { font-size: 7.5pt; color: #333; }
  .mono  { font-family: 'Courier New', monospace; font-size: 5.5pt; color: #666; }
  .meta  { font-size: 7pt; color: #444; }
</style>
</head>
<body>
  <div class="sheet">
    ${labelsHtml}
  </div>
  <script>
    window.addEventListener('load', function() {
      setTimeout(function() { window.print(); }, 250);
    });
  </script>
</body>
</html>`;
}
