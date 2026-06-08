/**
 * Extrusion length (mm) per tool/AMS slot index.
 * Key = tool index (0-based), value = total mm extruded.
 */
export type ExtrusionByTool = Record<number, number>;

// ── Material density table ────────────────────────────────────────────────────
// Units: g/cm³. Values are typical mid-point densities for FDM filaments.
// Bambu-specific trade names are mapped to their base material density.

export const MATERIAL_DENSITIES: Record<string, number> = {
  // PLA variants
  PLA: 1.24,
  'PLA Basic': 1.24,
  'PLA Matte': 1.24,
  'PLA+': 1.24,
  'PLA Meta': 1.22,

  // PETG variants
  PETG: 1.27,
  'PETG HF': 1.27,

  // ABS / ASA
  ABS: 1.04,
  ASA: 1.07,

  // TPU / Flexible
  TPU: 1.21,
  'TPU 95A': 1.21,

  // Support materials
  HIPS: 1.07,
  PVA: 1.23,

  // Specialty
  PA: 1.14, // Nylon
  PC: 1.2, // Polycarbonate

  // Fallback
  AMS: 1.24,
};

// ── Unit conversion ───────────────────────────────────────────────────────────

/**
 * Converts a linear extrusion distance to grams of filament consumed.
 *
 * Formula: volume_mm³ = π × r² × length  →  volume_cm³ / 1000  →  × density
 */
export function extrusionToGrams(
  extrusionMm: number,
  densityGperCm3: number,
  diameterMm: number = 1.75,
): number {
  const radius = diameterMm / 2;
  const volumeMm3 = Math.PI * radius * radius * extrusionMm;
  const volumeCm3 = volumeMm3 / 1000;
  return volumeCm3 * densityGperCm3;
}

// ── G-code parser ─────────────────────────────────────────────────────────────

/**
 * Parses raw G-code text and returns total extrusion length (mm) per tool index.
 *
 * Handles:
 *   - Tool changes (T0–T15)
 *   - G90 / G91 absolute / relative mode
 *   - G92 E0 reset
 *   - G1 ... E<value> moves in both absolute and relative modes
 *
 * Only forward (positive) extrusion is counted; retracts are ignored.
 */
export function parseGcodeExtrusion(gcodeText: string): ExtrusionByTool {
  const toolTotals: ExtrusionByTool = { 0: 0 };
  let currentTool = 0;
  let lastE = 0;
  let absoluteMode = true;

  const lines = gcodeText.split('\n');

  for (const rawLine of lines) {
    // Strip inline comments and trim
    const line = rawLine.split(';')[0].trim();
    if (!line) continue;

    // Tool change: T0, T1, T2, ...
    if (/^T\d+$/.test(line)) {
      currentTool = parseInt(line.slice(1), 10);
      if (toolTotals[currentTool] === undefined) {
        toolTotals[currentTool] = 0;
      }
      // E position is per-extruder on tool change; reset tracking reference
      lastE = 0;
      continue;
    }

    // Positioning mode
    if (line === 'G90') { absoluteMode = true; continue; }
    if (line === 'G91') { absoluteMode = false; continue; }

    // E axis reset
    if (/^G92\b/.test(line) && /\bE0\b/.test(line)) {
      lastE = 0;
      continue;
    }

    // Extrusion move: G1 (or G0 rarely) with an E value
    if (/^G[01]\b/.test(line)) {
      const eMatch = line.match(/\bE([-\d.]+)/);
      if (!eMatch) continue;

      const eValue = parseFloat(eMatch[1]);

      if (absoluteMode) {
        if (eValue > lastE) {
          toolTotals[currentTool] += eValue - lastE;
        }
        lastE = eValue;
      } else {
        // Relative mode: positive values only (ignore retracts)
        if (eValue > 0) {
          toolTotals[currentTool] += eValue;
        }
      }
    }
  }

  return toolTotals;
}
