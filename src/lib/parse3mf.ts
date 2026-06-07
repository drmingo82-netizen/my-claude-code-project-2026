import JSZip from 'jszip';

export interface FilamentSlotUsage {
  slot: number;  // 1-based AMS tray number
  grams: number;
}

export interface Parsed3MF {
  printTimeHours: number;          // decimal hours, e.g. 2.23
  filamentPerSlot: FilamentSlotUsage[];
  totalGrams: number;
}

export function formatPrintTime(hours: number): string {
  const total = Math.round(hours * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function secondsToHours(s: number): number {
  return Math.round((s / 3600) * 100) / 100;
}

// Primary: Metadata/slice_info.config (Bambu Studio XML)
function parseSliceInfo(xml: string): Parsed3MF | null {
  try {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    if (doc.querySelector('parsererror')) return null;

    const plate = doc.querySelector('plate');
    if (!plate) return null;

    const predEl = plate.querySelector('metadata[key="prediction"]');
    const seconds = predEl ? parseInt(predEl.getAttribute('value') ?? '0', 10) : 0;

    const filamentPerSlot: FilamentSlotUsage[] = Array.from(plate.querySelectorAll('filament'))
      .map((el) => ({
        slot: parseInt(el.getAttribute('id') ?? '1', 10),
        grams: parseFloat(el.getAttribute('used_g') ?? '0'),
      }))
      .filter((f) => !isNaN(f.slot) && f.grams > 0);

    const totalGrams = filamentPerSlot.reduce((s, f) => s + f.grams, 0);
    if (totalGrams === 0 && seconds === 0) return null;

    return { printTimeHours: secondsToHours(seconds), filamentPerSlot, totalGrams };
  } catch {
    return null;
  }
}

// Fallback: plate_1.json (Bambu Studio JSON, may not have per-slot breakdown)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parsePlateJson(text: string): Parsed3MF | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = JSON.parse(text) as any;
    const seconds: number = typeof d.prediction === 'number' ? d.prediction : 0;
    const weight: number = typeof d.weight === 'number' ? d.weight : 0;

    const filamentPerSlot: FilamentSlotUsage[] = [];
    if (Array.isArray(d.filament)) {
      for (let i = 0; i < d.filament.length; i++) {
        const f = d.filament[i];
        const grams: number = typeof f.used_g === 'number' ? f.used_g : 0;
        if (grams > 0) filamentPerSlot.push({ slot: i + 1, grams });
      }
    }

    const totalGrams = filamentPerSlot.length > 0
      ? filamentPerSlot.reduce((s, f) => s + f.grams, 0)
      : weight;

    if (filamentPerSlot.length === 0 && weight > 0) {
      filamentPerSlot.push({ slot: 1, grams: weight });
    }

    if (totalGrams === 0 && seconds === 0) return null;

    return { printTimeHours: secondsToHours(seconds), filamentPerSlot, totalGrams };
  } catch {
    return null;
  }
}

export async function parse3MF(file: File): Promise<Parsed3MF | null> {
  try {
    const zip = await JSZip.loadAsync(file);

    const sliceFile = zip.file('Metadata/slice_info.config');
    if (sliceFile) {
      const result = parseSliceInfo(await sliceFile.async('string'));
      if (result) return result;
    }

    for (const path of ['plate_1.json', 'Metadata/plate_1.json']) {
      const f = zip.file(path);
      if (f) {
        const result = parsePlateJson(await f.async('string'));
        if (result) return result;
      }
    }

    return null;
  } catch {
    return null;
  }
}
