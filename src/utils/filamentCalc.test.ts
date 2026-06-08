import { describe, it, expect } from 'vitest';
import {
  parseGcodeExtrusion,
  extrusionToGrams,
  MATERIAL_DENSITIES,
} from './filamentCalc';

// ── extrusionToGrams ──────────────────────────────────────────────────────────

describe('extrusionToGrams', () => {
  it('converts 1000mm of PLA to ~2.98g', () => {
    const g = extrusionToGrams(1000, MATERIAL_DENSITIES.PLA);
    expect(g).toBeCloseTo(2.983, 2);
  });

  it('converts 1000mm of PETG to ~3.06g', () => {
    const g = extrusionToGrams(1000, MATERIAL_DENSITIES.PETG);
    expect(g).toBeCloseTo(3.058, 2);
  });

  it('returns 0 for 0mm extrusion', () => {
    expect(extrusionToGrams(0, 1.24)).toBe(0);
  });

  it('accepts custom filament diameter', () => {
    // 2.85mm diameter PLA
    const g285 = extrusionToGrams(1000, MATERIAL_DENSITIES.PLA, 2.85);
    const g175 = extrusionToGrams(1000, MATERIAL_DENSITIES.PLA, 1.75);
    // 2.85mm diameter has ~2.65x the cross-section of 1.75mm
    expect(g285).toBeGreaterThan(g175 * 2);
  });
});

// ── parseGcodeExtrusion ───────────────────────────────────────────────────────

describe('parseGcodeExtrusion — absolute mode (default)', () => {
  it('accumulates extrusion in absolute mode', () => {
    const gcode = `
G90
G92 E0
G1 X10 E5.0
G1 X20 E12.5
G1 X30 E20.0
`.trim();
    const result = parseGcodeExtrusion(gcode);
    expect(result[0]).toBeCloseTo(20.0);
  });

  it('ignores backward E moves (retracts) in absolute mode', () => {
    const gcode = `
G90
G92 E0
G1 E10.0
G1 E8.0
G1 E18.0
`.trim();
    // 0→10 = 10, 10→8 = retract (skip), 8→18 = 10  →  total 20
    const result = parseGcodeExtrusion(gcode);
    expect(result[0]).toBeCloseTo(20.0);
  });

  it('initializes tool 0 even with no extrusion', () => {
    const result = parseGcodeExtrusion('G90');
    expect(result[0]).toBe(0);
  });
});

describe('parseGcodeExtrusion — G92 E0 reset', () => {
  it('resets E reference after G92 E0', () => {
    const gcode = `
G90
G92 E0
G1 E10.0
G92 E0
G1 E5.0
`.trim();
    // First segment: 10mm. After reset: 5mm. Total: 15mm.
    const result = parseGcodeExtrusion(gcode);
    expect(result[0]).toBeCloseTo(15.0);
  });

  it('G92 with other axes but E0 still resets E', () => {
    const gcode = `
G90
G92 E0
G1 E8.0
G92 X0 Y0 E0
G1 E3.0
`.trim();
    const result = parseGcodeExtrusion(gcode);
    expect(result[0]).toBeCloseTo(11.0);
  });
});

describe('parseGcodeExtrusion — relative mode (G91)', () => {
  it('sums positive E values in relative mode', () => {
    const gcode = `
G91
G1 E2.0
G1 E3.5
G1 E1.0
`.trim();
    const result = parseGcodeExtrusion(gcode);
    expect(result[0]).toBeCloseTo(6.5);
  });

  it('ignores negative E values (retracts) in relative mode', () => {
    const gcode = `
G91
G1 E5.0
G1 E-0.8
G1 E3.0
`.trim();
    // Only positive: 5 + 3 = 8
    const result = parseGcodeExtrusion(gcode);
    expect(result[0]).toBeCloseTo(8.0);
  });

  it('handles mode switch mid-print G91 → G90', () => {
    const gcode = `
G90
G92 E0
G1 E10.0
G91
G1 E2.0
G1 E-0.5
G90
G1 E15.0
`.trim();
    // Absolute: 10mm. Relative: 2mm (skip -0.5). Back to absolute: lastE=10, E=15 → +5. Total: 17mm.
    const result = parseGcodeExtrusion(gcode);
    expect(result[0]).toBeCloseTo(17.0);
  });
});

describe('parseGcodeExtrusion — tool changes', () => {
  it('tracks each tool separately', () => {
    const gcode = `
G90
G92 E0
G1 E10.0
T1
G92 E0
G1 E6.0
T0
G92 E0
G1 E4.0
`.trim();
    const result = parseGcodeExtrusion(gcode);
    expect(result[0]).toBeCloseTo(14.0); // 10 + 4
    expect(result[1]).toBeCloseTo(6.0);
  });

  it('resets E reference on tool change', () => {
    const gcode = `
G90
G92 E0
G1 E20.0
T1
G1 E5.0
`.trim();
    // T0: 20mm. T1: lastE reset to 0 on tool change → E5.0 - 0 = 5mm.
    const result = parseGcodeExtrusion(gcode);
    expect(result[0]).toBeCloseTo(20.0);
    expect(result[1]).toBeCloseTo(5.0);
  });

  it('initializes new tool slot on first encounter', () => {
    const gcode = `T3\nG92 E0\nG1 E7.0`;
    const result = parseGcodeExtrusion(gcode);
    expect(result[3]).toBeCloseTo(7.0);
  });

  it('handles 4-tool AMS print (slots 0-3)', () => {
    const gcode = `
G90
T0\nG92 E0\nG1 E100.0
T1\nG92 E0\nG1 E80.0
T2\nG92 E0\nG1 E60.0
T3\nG92 E0\nG1 E40.0
`.trim();
    const result = parseGcodeExtrusion(gcode);
    expect(result[0]).toBeCloseTo(100.0);
    expect(result[1]).toBeCloseTo(80.0);
    expect(result[2]).toBeCloseTo(60.0);
    expect(result[3]).toBeCloseTo(40.0);
  });
});

describe('parseGcodeExtrusion — comment stripping', () => {
  it('ignores semicolon comments on the same line', () => {
    const gcode = `
G90
G92 E0          ; reset E
G1 X10 E5.0     ; first move
G1 X20 E10.0    ; second move
`.trim();
    const result = parseGcodeExtrusion(gcode);
    expect(result[0]).toBeCloseTo(10.0);
  });

  it('ignores full-line comments', () => {
    const gcode = `
; Bambu Studio generated gcode
G90
; start sequence
G92 E0
G1 E8.0
`.trim();
    const result = parseGcodeExtrusion(gcode);
    expect(result[0]).toBeCloseTo(8.0);
  });
});

describe('parseGcodeExtrusion — edge cases', () => {
  it('returns { 0: 0 } for empty string', () => {
    const result = parseGcodeExtrusion('');
    expect(result).toEqual({ 0: 0 });
  });

  it('returns { 0: 0 } for gcode with no E moves', () => {
    const gcode = `G28\nG29\nG1 X10 Y10 F3000\nM104 S200`;
    const result = parseGcodeExtrusion(gcode);
    expect(result[0]).toBe(0);
  });

  it('handles G0 moves with E values', () => {
    const gcode = `G90\nG92 E0\nG0 E4.0`;
    const result = parseGcodeExtrusion(gcode);
    expect(result[0]).toBeCloseTo(4.0);
  });
});

// ── MATERIAL_DENSITIES completeness ──────────────────────────────────────────

describe('MATERIAL_DENSITIES', () => {
  const requiredMaterials = ['PLA', 'PETG', 'ABS', 'ASA', 'TPU', 'PA', 'PC'];

  for (const mat of requiredMaterials) {
    it(`has a positive density for ${mat}`, () => {
      expect(MATERIAL_DENSITIES[mat]).toBeGreaterThan(0);
    });
  }

  it('has a fallback AMS entry', () => {
    expect(MATERIAL_DENSITIES['AMS']).toBeGreaterThan(0);
  });
});
