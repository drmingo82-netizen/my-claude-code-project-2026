import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { getBambuColorHex } from './bambuColors';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface BambuLineItem {
  id: string;
  productRaw: string;
  material: string;
  colorName: string;
  colorCode: string;
  colorHex: string | undefined;
  spoolType: 'Refill' | 'Regular';
  weightG: number;
  qty: number;
  pricePerUnit: number;
  sku: string;
}

export interface BambuParseResult {
  items: BambuLineItem[];
  invoiceDate: string | undefined;
  warnings: string[];
  error?: string;
}

export interface RawDebugResult {
  pages: number;
  rowsView: string[];
  error?: string;
}

// ── Types ────────────────────────────────────────────────────────────────────

interface RowItem { x: number; text: string; }
interface Row { page: number; y: number; items: RowItem[]; }

// ── Helpers ──────────────────────────────────────────────────────────────────

// Text items in the "name" column (left side of page)
function leftText(row: Row, maxX = 215): string {
  return row.items
    .filter(i => i.x <= maxX)
    .sort((a, b) => a.x - b.x)
    .map(i => i.text)
    .join(' ')
    .trim();
}

// Text items in a specific x range — used for qty/price columns
function textAtX(row: Row, xMin: number, xMax: number): string {
  return row.items
    .filter(i => i.x >= xMin && i.x <= xMax)
    .sort((a, b) => a.x - b.x)
    .map(i => i.text.trim())
    .filter(Boolean)
    .join(' ');
}

// All text joined left-to-right
function fullText(row: Row): string {
  return [...row.items].sort((a, b) => a.x - b.x).map(i => i.text).join(' ').trim();
}

// Only A0x and A1x SKU prefixes are filament — exclude hardware/accessories
function isFilamentSku(sku: string): boolean {
  return /^A[01]\d/i.test(sku.trim());
}

function normalizeMaterial(raw: string): string {
  const s = raw.toLowerCase().trim();
  if (s.startsWith('pla matte'))       return 'PLA Matte';
  if (s.startsWith('pla basic'))       return 'PLA Basic';
  if (s.startsWith('pla silk'))        return 'PLA Silk';
  if (s.startsWith('pla metal'))       return 'PLA';
  if (s.startsWith('pla translucent')) return 'PLA';
  if (s.startsWith('pla sparkle'))     return 'PLA Sparkle';
  if (s.startsWith('pla+') || s.startsWith('pla plus')) return 'PLA+';
  if (s.startsWith('pla'))             return 'PLA';
  if (s.startsWith('petg hf'))         return 'PETG';
  if (s.startsWith('petg cf'))         return 'PETG';
  if (s.startsWith('petg'))            return 'PETG';
  if (s.startsWith('abs'))             return 'ABS';
  if (s.startsWith('asa'))             return 'ASA';
  if (s.startsWith('tpu'))             return 'TPU';
  if (s.includes('nylon') || s.includes('pa-cf') || s.includes('pa12') ||
      s.includes('paht') || s.includes('ppa'))         return 'Nylon';
  return 'Other';
}

function parseWeight(text: string): number {
  const m = text.match(/(\d+(?:\.\d+)?)\s*(kg|g)\b/i);
  if (!m) return 1000;
  return m[2].toLowerCase() === 'kg' ? parseFloat(m[1]) * 1000 : parseFloat(m[1]);
}

// ── PDF Extraction ───────────────────────────────────────────────────────────

async function extractRows(arrayBuffer: ArrayBuffer): Promise<Row[]> {
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const allRows: Row[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();

    const rowMap = new Map<number, RowItem[]>();
    for (const item of content.items) {
      if (!('str' in item) || !item.str) continue;
      const x = Math.round(item.transform[4]);
      const y = Math.round(item.transform[5]);
      if (!rowMap.has(y)) rowMap.set(y, []);
      rowMap.get(y)!.push({ x, text: item.str });
    }

    const sortedY = Array.from(rowMap.keys()).sort((a, b) => b - a);
    for (const y of sortedY) {
      allRows.push({ page: pageNum, y, items: rowMap.get(y)!.sort((a, b) => a.x - b.x) });
    }
  }

  return allRows;
}

// ── Parser ───────────────────────────────────────────────────────────────────

function parseRows(rows: Row[]): { items: BambuLineItem[]; warnings: string[] } {
  const warnings: string[] = [];
  const items: BambuLineItem[] = [];

  for (let i = 0; i < rows.length; i++) {
    const lt = leftText(rows[i]);

    // Anchor: row whose left text starts with "SKU:"
    if (!/^SKU:\s*/i.test(lt)) continue;

    const skuPart = lt.replace(/^SKU:\s*/i, '').trim();

    // Filament SKUs start with A0x or A1x; skip hardware/accessories
    if (!isFilamentSku(skuPart)) continue;

    // ── Qty + Price ─────────────────────────────────────────────────────────
    // The SKU may be split across two rows. Qty/price are at x≈222/271 on
    // whichever row contains "SPLFREE" or the first row after the SKU line
    // that has a number in the qty column.
    let qty = 1;
    let pricePerUnit = 0;
    let qtyPriceRow = -1;

    for (let scan = i; scan <= Math.min(i + 3, rows.length - 1); scan++) {
      const qtyRaw = textAtX(rows[scan], 205, 240).trim();
      const priceRaw = textAtX(rows[scan], 255, 295).trim();

      if (/^\d{1,2}$/.test(qtyRaw)) qty = parseInt(qtyRaw);
      if (/^\$\d+\.\d{2}$/.test(priceRaw)) {
        pricePerUnit = parseFloat(priceRaw.slice(1));
        qtyPriceRow = scan;
        break;
      }
    }

    // ── Product name ─────────────────────────────────────────────────────────
    // Look up to 5 rows above the SKU line for a material name in the left col
    let productRaw = '';
    for (let back = i - 1; back >= Math.max(0, i - 5); back--) {
      const bt = leftText(rows[back]);
      if (/^(PLA|PETG|ABS|ASA|TPU|PA[-\s]|Nylon|PC\b)/i.test(bt)) {
        productRaw = bt;
        break;
      }
    }

    if (!productRaw) {
      warnings.push(`No product name for SKU: ${skuPart}`);
      continue;
    }

    // ── Variant ──────────────────────────────────────────────────────────────
    // Scan forward from just after the qty/price row for "Variant:"
    const fwdStart = qtyPriceRow >= 0 ? qtyPriceRow + 1 : i + 1;
    let variantText = '';

    for (let fwd = fwdStart; fwd <= Math.min(fwdStart + 5, rows.length - 1); fwd++) {
      const vt = leftText(rows[fwd]);
      if (/^Variant:/i.test(vt)) {
        variantText = vt;
        // Append next line if it continues (starts with "(" or "/")
        if (fwd + 1 < rows.length) {
          const nextLt = leftText(rows[fwd + 1]);
          if (nextLt.startsWith('(') || nextLt.startsWith('/')) {
            variantText += ' ' + nextLt;
          }
        }
        break;
      }
      // Also stop if we hit the next product's SKU
      if (/^SKU:\s*A[01]\d/i.test(vt)) break;
    }

    // ── Parse variant fields ──────────────────────────────────────────────────
    // Format: "Variant: Color Name (CODE) / Refill / 1kg"
    // or split: "Variant: Color Name" then "(CODE) / Refill / 1kg"
    if (!variantText) {
      warnings.push(`No Variant line found for: ${productRaw} (${skuPart})`);
      continue;
    }

    const variantMatch = variantText.match(
      /Variant:\s*(.+?)\s*\((\d{4,6})\)(.*)/i
    );
    if (!variantMatch) {
      warnings.push(`Could not parse Variant: "${variantText}"`);
      continue;
    }

    const colorName = variantMatch[1].trim();
    const colorCode = variantMatch[2];
    const rest = variantMatch[3]; // " / Refill / 1kg" etc.

    const spoolType: 'Refill' | 'Regular' = /Refill/i.test(rest) ? 'Refill' : 'Regular';
    const weightG = parseWeight(rest) || 1000;
    const colorHex = getBambuColorHex(colorCode);

    if (!colorHex) {
      warnings.push(`Unknown color code ${colorCode} (${colorName}) — assign hex after import`);
    }

    items.push({
      id: crypto.randomUUID(),
      productRaw,
      material: normalizeMaterial(productRaw),
      colorName,
      colorCode,
      colorHex,
      spoolType,
      weightG,
      qty: Math.max(1, qty),
      pricePerUnit,
      sku: skuPart,
    });
  }

  return { items, warnings };
}

// ── Public API ───────────────────────────────────────────────────────────────

const DATE_REGEX =
  /(?:Order\s*Date|Date|Ordered)[:\s]+([A-Za-z]+ \d+,?\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})/i;

export async function parseBambuInvoice(file: File): Promise<BambuParseResult> {
  let arrayBuffer: ArrayBuffer;
  try {
    arrayBuffer = await file.arrayBuffer();
  } catch {
    return { items: [], invoiceDate: undefined, warnings: [], error: 'Could not read the file.' };
  }

  let rows: Row[];
  try {
    rows = await extractRows(arrayBuffer);
  } catch {
    return {
      items: [],
      invoiceDate: undefined,
      warnings: [],
      error: 'Could not parse PDF. Make sure it is a valid, non-scanned PDF.',
    };
  }

  if (rows.length === 0) {
    return { items: [], invoiceDate: undefined, warnings: [], error: 'PDF appears to be empty or image-only.' };
  }

  // Sanity check: must look like a Bambu Lab document
  const allText = rows.map(r => fullText(r)).join(' ');
  if (!allText.toLowerCase().includes('bambu') && !/SKU:\s*A[01]\d/i.test(allText)) {
    return {
      items: [],
      invoiceDate: undefined,
      warnings: [],
      error: 'This does not appear to be a Bambu Lab invoice.',
    };
  }

  // Extract invoice date
  let invoiceDate: string | undefined;
  for (const row of rows) {
    const m = fullText(row).match(DATE_REGEX);
    if (m) { invoiceDate = m[1].trim(); break; }
  }

  const { items, warnings } = parseRows(rows);

  if (items.length === 0) {
    return {
      items: [],
      invoiceDate,
      warnings,
      error: 'No filament line items found. Try debug mode to inspect the raw PDF text.',
    };
  }

  return { items, invoiceDate, warnings };
}

// ── Debug extraction ─────────────────────────────────────────────────────────

export async function extractRawDebug(file: File): Promise<RawDebugResult> {
  let arrayBuffer: ArrayBuffer;
  try {
    arrayBuffer = await file.arrayBuffer();
  } catch {
    return { pages: 0, rowsView: [], error: 'Could not read the file.' };
  }

  try {
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const rowsView: string[] = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();

      rowsView.push('='.repeat(60));
      rowsView.push(`PAGE ${pageNum} of ${pdf.numPages}`);
      rowsView.push('='.repeat(60));

      const rowMap = new Map<number, Array<{ x: number; text: string }>>();
      for (const item of content.items) {
        if (!('str' in item)) continue;
        const x = Math.round(item.transform[4]);
        const y = Math.round(item.transform[5]);
        if (!rowMap.has(y)) rowMap.set(y, []);
        rowMap.get(y)!.push({ x, text: item.str });
      }

      const sortedY = Array.from(rowMap.keys()).sort((a, b) => b - a);
      for (const y of sortedY) {
        const items = rowMap.get(y)!.sort((a, b) => a.x - b.x);
        const hasContent = items.some(i => i.text.trim());
        if (!hasContent) continue;
        const detail = items.map(i => `[x${i.x}] ${JSON.stringify(i.text)}`).join('  ');
        const joined = items.map(i => i.text).join(' ');
        rowsView.push(`y=${String(y).padStart(4)}  JOINED: ${JSON.stringify(joined)}`);
        rowsView.push(`         ITEMS:  ${detail}`);
      }
      rowsView.push('');
    }

    console.group('[BambuDebug] Raw PDF extraction');
    console.log(`Pages: ${pdf.numPages}`);
    console.log(rowsView.join('\n'));
    console.groupEnd();

    return { pages: pdf.numPages, rowsView };
  } catch (e) {
    return { pages: 0, rowsView: [], error: `PDF parse error: ${String(e)}` };
  }
}
