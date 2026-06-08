import JSZip from 'jszip';

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

export interface GcodeDiagnostics {
  /** M83 detected — Bambu's standard: absolute XYZ + relative E */
  m83Detected: boolean;
  /** M200 detected — volumetric extrusion mode (future handling needed if true) */
  m200Detected: boolean;
  /** Total mm captured from G2/G3 arc moves */
  g2g3Mm: number;
  /** Total mm captured from G0/G1 linear moves */
  g1Mm: number;
  /** Number of G92 E resets encountered */
  g92Count: number;
  /** Ordered list of tool changes with line number */
  toolSequence: Array<{ tool: number; lineNum: number }>;
  /** First 50 non-blank lines of the G-code (including comments) */
  firstLines: string[];
}

export interface GcodeParseResult {
  extrusionByTool: ExtrusionByTool;
  diagnostics: GcodeDiagnostics;
}

/**
 * Full G-code parser with diagnostic output.
 *
 * Handles:
 *   - Tool changes T0–T15 and Bambu-specific T255 / T1000 (with or without params)
 *   - G90 / G91 (absolute / relative all axes)
 *   - M82 / M83 (absolute / relative E independently — Bambu uses G90+M83)
 *   - G92 E<n> reset to any value
 *   - G0, G1 linear moves with E
 *   - G2, G3 arc moves with E (wipe tower patterns)
 *   - M200 volumetric mode detection (flagged but not yet recalculated)
 *
 * Only forward (positive) extrusion is counted; retracts are ignored.
 */
export function parseGcodeDetailed(gcodeText: string): GcodeParseResult {
  const toolTotals: ExtrusionByTool = { 0: 0 };
  let currentTool = 0;
  let lastE = 0;
  // Bambu uses M83 (relative E) with G90 (absolute XYZ). Track E mode separately.
  let absoluteE = true;

  let m83Detected = false;
  let m200Detected = false;
  let g2g3Mm = 0;
  let g1Mm = 0;
  let g92Count = 0;
  const toolSequence: Array<{ tool: number; lineNum: number }> = [];
  const firstLines: string[] = [];
  let firstLineCount = 0;

  const lines = gcodeText.split('\n');

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const rawLine = lines[lineIdx];

    if (firstLineCount < 50 && rawLine.trim()) {
      firstLines.push(rawLine.trimEnd());
      firstLineCount++;
    }

    const line = rawLine.split(';')[0].trim();
    if (!line) continue;

    // ── Tool change ───────────────────────────────────────────────────────────
    // Match T<digits> with optional trailing whitespace/params (handles T1000 S1 etc.)
    const tMatch = line.match(/^T(\d+)(?:\s|$)/);
    if (tMatch) {
      currentTool = parseInt(tMatch[1], 10);
      if (toolTotals[currentTool] === undefined) toolTotals[currentTool] = 0;
      lastE = 0;
      toolSequence.push({ tool: currentTool, lineNum: lineIdx + 1 });
      continue;
    }

    // ── Positioning mode (affects all axes including E) ───────────────────────
    if (line === 'G90') { absoluteE = true; continue; }
    if (line === 'G91') { absoluteE = false; continue; }

    // ── E-axis mode override (M83 = relative E, M82 = absolute E) ────────────
    // Bambu's standard start G-code: G90 then M83 → absolute XYZ, relative E
    if (/^M82\b/.test(line)) { absoluteE = true; continue; }
    if (/^M83\b/.test(line)) { absoluteE = false; m83Detected = true; continue; }

    // ── Volumetric extrusion detection ────────────────────────────────────────
    if (/^M200\b/.test(line)) { m200Detected = true; continue; }

    // ── E axis reset ──────────────────────────────────────────────────────────
    if (/^G92\b/.test(line)) {
      const eMatch = line.match(/\bE([-\d.]+)/);
      if (eMatch) {
        lastE = parseFloat(eMatch[1]);
        g92Count++;
      }
      continue;
    }

    // ── Extrusion moves: G0/G1 linear, G2/G3 arc ─────────────────────────────
    if (/^G[0123]\b/.test(line)) {
      const eMatch = line.match(/\bE([-\d.]+)/);
      if (!eMatch) continue;

      const eValue = parseFloat(eMatch[1]);
      const isArc = /^G[23]\b/.test(line);

      let added = 0;
      if (absoluteE) {
        if (eValue > lastE) {
          added = eValue - lastE;
          toolTotals[currentTool] += added;
        }
        lastE = eValue;
      } else {
        // Relative E (M83): each E value is its own increment; ignore retracts
        if (eValue > 0) {
          added = eValue;
          toolTotals[currentTool] += added;
        }
      }

      if (isArc) g2g3Mm += added;
      else g1Mm += added;
    }
  }

  return {
    extrusionByTool: toolTotals,
    diagnostics: {
      m83Detected,
      m200Detected,
      g2g3Mm,
      g1Mm,
      g92Count,
      toolSequence,
      firstLines,
    },
  };
}

/**
 * Returns total extrusion (mm) per tool index.
 * Thin wrapper around parseGcodeDetailed for callers that don't need diagnostics.
 */
export function parseGcodeExtrusion(gcodeText: string): ExtrusionByTool {
  return parseGcodeDetailed(gcodeText).extrusionByTool;
}

// ── 3MF extraction ────────────────────────────────────────────────────────────

/**
 * Extracts raw G-code text from a Bambu Studio .3mf file (ZIP archive).
 *
 * Search order:
 *  1. Metadata/plate_1.gcode  (Bambu Studio standard path)
 *  2. Any file matching plate_\d+.gcode
 *  3. Any file ending in .gcode (last resort)
 */
export async function extractGcodeFrom3mf(file: File): Promise<string> {
  const zip = await JSZip.loadAsync(file);

  const gcodeFile =
    zip.file('Metadata/plate_1.gcode') ??
    zip.file(/plate_\d+\.gcode/)[0] ??
    zip.file(/.*\.gcode/)[0];

  if (!gcodeFile) throw new Error('No G-code file found inside .3mf archive');

  return gcodeFile.async('string');
}
