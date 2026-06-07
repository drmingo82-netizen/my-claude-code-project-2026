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

// Matches a Bambu Lab material name anywhere in a line
const PRODUCT_REGEX =
  /(?:Bambu\s+Lab\s+)?(PLA\s+(?:Matte|Basic|Silk|Metal|Sparkle|CF|\+)?|PETG(?:\s+(?:HF|CF))?|ABS(?:[-\s]CF)?|ASA(?:[-\s]CF)?|TPU(?:\s+95A(?:\s+HF)?)?|PA(?:12)?[-\s]CF|PAHT[-\s]CF|PPA[-\s]CF|PC(?:[-\s]CF)?|Nylon)\b/i;

const VARIANT_REGEX =
  /Variant:\s*(.+?)\s*\((\d{4,6})\)(?:\s*\/\s*(Refill|Regular))?(?:\s*\/\s*(\d+(?:\.\d+)?)\s*(kg|g))?/i;

const SKU_REGEX = /^SKU:\s*(.+)/i;

const DATE_REGEX =
  /(?:Date|Ordered|Order Date|Invoice Date)[:\s]+([A-Za-z]+ \d+,?\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})/i;

function normalizeMaterial(raw: string): string {
  const s = raw.toLowerCase();
  if (s.includes('pla matte') || s.includes('matte pla')) return 'PLA Matte';
  if (s.includes('pla basic') || s.includes('basic pla')) return 'PLA Basic';
  if (s.includes('pla silk') || s.includes('silk pla')) return 'PLA Silk';
  if (s.includes('pla metal')) return 'PLA Metal';
  if (s.includes('pla sparkle')) return 'PLA Sparkle';
  if (s.includes('pla+') || s.includes('pla plus')) return 'PLA+';
  if (s.includes('pla cf')) return 'PLA';
  if (s.includes('petg hf')) return 'PETG';
  if (s.includes('petg cf')) return 'PETG';
  if (s.includes('petg')) return 'PETG';
  if (s.includes('abs')) return 'ABS';
  if (s.includes('asa')) return 'ASA';
  if (s.includes('tpu')) return 'TPU';
  if (s.includes('pa') || s.includes('nylon') || s.includes('paht') || s.includes('ppa')) return 'Nylon';
  if (s.includes('pc')) return 'Other';
  return 'Other';
}

async function extractLines(arrayBuffer: ArrayBuffer): Promise<string[]> {
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const allLines: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();

    // Group text items by rounded y-coordinate into rows
    const rows = new Map<number, Array<{ x: number; text: string }>>();
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue;
      const y = Math.round(item.transform[5]);
      const x = item.transform[4];
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y)!.push({ x, text: item.str });
    }

    // Sort rows top-to-bottom (PDF y=0 at bottom, higher y = higher on page)
    const sortedY = Array.from(rows.keys()).sort((a, b) => b - a);
    for (const y of sortedY) {
      const rowItems = rows.get(y)!.sort((a, b) => a.x - b.x);
      allLines.push(rowItems.map((i) => i.text).join(' '));
    }
  }

  return allLines;
}

function parseItems(lines: string[]): { items: BambuLineItem[]; warnings: string[] } {
  const warnings: string[] = [];
  const items: BambuLineItem[] = [];

  // Find all Variant line indices — they anchor each line item
  const variantIndices: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (VARIANT_REGEX.test(lines[i])) variantIndices.push(i);
  }

  if (variantIndices.length === 0) {
    return { items, warnings };
  }

  for (let vi = 0; vi < variantIndices.length; vi++) {
    const vIdx = variantIndices[vi];
    const prevVIdx = vi > 0 ? variantIndices[vi - 1] : -1;
    const nextVIdx = vi + 1 < variantIndices.length ? variantIndices[vi + 1] : lines.length;

    const variantLine = lines[vIdx];
    const variantMatch = variantLine.match(VARIANT_REGEX);
    if (!variantMatch) continue;

    const colorName = variantMatch[1].trim();
    const colorCode = variantMatch[2];
    const spoolTypeRaw = variantMatch[3];
    const weightVal = variantMatch[4] ? parseFloat(variantMatch[4]) : 1;
    const weightUnit = variantMatch[5];

    const weightG = weightUnit?.toLowerCase() === 'kg' ? weightVal * 1000 : (weightVal >= 1 && !weightUnit ? weightVal * 1000 : weightVal);
    const spoolType: 'Refill' | 'Regular' = spoolTypeRaw?.toLowerCase() === 'refill' ? 'Refill' : 'Regular';
    const colorHex = getBambuColorHex(colorCode);

    if (!colorHex) {
      warnings.push(`Unknown color code ${colorCode} (${colorName}) — assign hex manually`);
    }

    // Backtrack from Variant to find product name and SKU
    let productRaw = '';
    let sku = '';
    const backStart = prevVIdx + 1;

    for (let back = vIdx - 1; back >= backStart; back--) {
      const ln = lines[back].trim();
      if (!sku) {
        const skuMatch = ln.match(SKU_REGEX);
        if (skuMatch) { sku = skuMatch[1].trim(); continue; }
      }
      if (!productRaw && PRODUCT_REGEX.test(ln)) {
        productRaw = ln;
        break;
      }
    }

    if (!productRaw) {
      warnings.push(`Could not identify product name near "${colorName} (${colorCode})"`);
      continue;
    }

    const material = normalizeMaterial(productRaw);

    // Find qty and price: check Variant line itself first, then look forward
    let qty = 1;
    let pricePerUnit = 0;

    const inlineMatch = variantLine.match(/(\d+)\s+\$(\d+\.\d{2})\s+\$\d+\.\d{2}/);
    if (inlineMatch) {
      qty = parseInt(inlineMatch[1]);
      pricePerUnit = parseFloat(inlineMatch[2]);
    } else {
      for (let fwd = vIdx + 1; fwd < Math.min(nextVIdx, vIdx + 6); fwd++) {
        const ln = lines[fwd].trim();

        // "2 $17.99 $35.98" — qty unit-price total
        const qtyPriceTotal = ln.match(/^(\d+)\s+\$(\d+\.\d{2})\s+\$\d+\.\d{2}$/);
        if (qtyPriceTotal) {
          qty = parseInt(qtyPriceTotal[1]);
          pricePerUnit = parseFloat(qtyPriceTotal[2]);
          break;
        }

        // "2 $17.99" — qty unit-price
        const qtyPrice = ln.match(/^(\d+)\s+\$(\d+\.\d{2})$/);
        if (qtyPrice) {
          qty = parseInt(qtyPrice[1]);
          pricePerUnit = parseFloat(qtyPrice[2]);
          break;
        }

        // Standalone qty
        const qtyOnly = ln.match(/^(\d{1,3})$/);
        if (qtyOnly && !qty) qty = parseInt(qtyOnly[1]);

        // Standalone price "$19.99"
        const priceOnly = ln.match(/^\$(\d+\.\d{2})$/);
        if (priceOnly && !pricePerUnit) pricePerUnit = parseFloat(priceOnly[1]);
      }
    }

    items.push({
      id: crypto.randomUUID(),
      productRaw,
      material,
      colorName,
      colorCode,
      colorHex,
      spoolType,
      weightG: weightG || 1000,
      qty: Math.max(1, qty),
      pricePerUnit,
      sku,
    });
  }

  return { items, warnings };
}

export async function parseBambuInvoice(file: File): Promise<BambuParseResult> {
  let arrayBuffer: ArrayBuffer;
  try {
    arrayBuffer = await file.arrayBuffer();
  } catch {
    return { items: [], invoiceDate: undefined, warnings: [], error: 'Could not read the file.' };
  }

  let lines: string[];
  try {
    lines = await extractLines(arrayBuffer);
  } catch {
    return {
      items: [],
      invoiceDate: undefined,
      warnings: [],
      error: 'Could not parse PDF. Make sure it is a valid, non-scanned PDF.',
    };
  }

  if (lines.length === 0) {
    return { items: [], invoiceDate: undefined, warnings: [], error: 'PDF appears to be empty or image-only.' };
  }

  // Sanity check: must look like a Bambu Lab document
  const fullText = lines.join(' ');
  if (!fullText.toLowerCase().includes('bambu') && !VARIANT_REGEX.test(fullText)) {
    return {
      items: [],
      invoiceDate: undefined,
      warnings: [],
      error: 'This does not appear to be a Bambu Lab invoice. No Bambu products or Variant lines found.',
    };
  }

  // Extract invoice date
  let invoiceDate: string | undefined;
  for (const line of lines) {
    const dateMatch = line.match(DATE_REGEX);
    if (dateMatch) {
      invoiceDate = dateMatch[1].trim();
      break;
    }
  }

  const { items, warnings } = parseItems(lines);

  if (items.length === 0) {
    return {
      items: [],
      invoiceDate,
      warnings,
      error: 'No filament line items found. The invoice format may not be supported — check the warnings.',
    };
  }

  return { items, invoiceDate, warnings };
}
