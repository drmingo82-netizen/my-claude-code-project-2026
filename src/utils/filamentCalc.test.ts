import { describe, it, expect } from 'vitest';
import {
  parseGcodeExtrusion,
  parseGcodeDetailed,
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

// ── M83 relative E mode (Bambu standard: G90 + M83) ──────────────────────────

describe('parseGcodeExtrusion — M83 relative E (Bambu standard)', () => {
  it('M83 enables relative E independently of G90', () => {
    // Bambu pattern: G90 (absolute XYZ) + M83 (relative E)
    const gcode = `
G90
M83
G92 E0
G1 X10 E0.1
G1 X20 E0.08
G1 X30 E0.15
`.trim();
    // In relative mode: sum all positive E = 0.1 + 0.08 + 0.15 = 0.33mm
    const result = parseGcodeExtrusion(gcode);
    expect(result[0]).toBeCloseTo(0.33);
  });

  it('M83 does not skip "small" E values that look like retracts in absolute mode', () => {
    // This is the core bug: 0.05 then 0.03 in absolute mode would skip 0.03
    const gcode = `
G90
M83
G1 E0.05
G1 E0.03
G1 E0.10
`.trim();
    // Relative: 0.05 + 0.03 + 0.10 = 0.18 (absolute would give 0.15)
    const result = parseGcodeExtrusion(gcode);
    expect(result[0]).toBeCloseTo(0.18);
  });

  it('M83 ignores negative E (retracts)', () => {
    const gcode = `G90\nM83\nG1 E0.5\nG1 E-0.8\nG1 E0.3`;
    const result = parseGcodeExtrusion(gcode);
    expect(result[0]).toBeCloseTo(0.8); // 0.5 + 0.3, skip -0.8
  });

  it('M82 after M83 restores absolute E tracking', () => {
    const gcode = `
G90
M83
G1 E0.5
G1 E0.3
M82
G92 E0
G1 E10.0
G1 E15.0
`.trim();
    // M83 section: 0.5 + 0.3 = 0.8
    // M82 section (absolute): 0→10 = 10, 10→15 = 5  →  15
    // Total: 15.8
    const result = parseGcodeExtrusion(gcode);
    expect(result[0]).toBeCloseTo(15.8);
  });

  it('diagnostics flag m83Detected when M83 is present', () => {
    const { diagnostics } = parseGcodeDetailed('G90\nM83\nG1 E0.1');
    expect(diagnostics.m83Detected).toBe(true);
  });

  it('diagnostics do not flag m83Detected when only G90/G91 used', () => {
    const { diagnostics } = parseGcodeDetailed('G90\nG91\nG1 E0.1');
    expect(diagnostics.m83Detected).toBe(false);
  });

  it('G92 E0 reset works correctly in M83 mode', () => {
    // G92 E0 in M83 mode only affects lastE (used when switching back to M82)
    // but doesn't change relative accumulation behavior
    const gcode = `G90\nM83\nG1 E0.5\nG92 E0\nG1 E0.3`;
    const result = parseGcodeExtrusion(gcode);
    expect(result[0]).toBeCloseTo(0.8); // 0.5 + 0.3 — g92 doesn't affect relative mode
  });
});

// ── G2/G3 arc moves ───────────────────────────────────────────────────────────

describe('parseGcodeExtrusion — G2/G3 arc moves', () => {
  it('captures extrusion in G2 arc moves (absolute E)', () => {
    const gcode = `G90\nG92 E0\nG2 X10 Y10 I5 J0 E8.0`;
    const result = parseGcodeExtrusion(gcode);
    expect(result[0]).toBeCloseTo(8.0);
  });

  it('captures extrusion in G3 arc moves (absolute E)', () => {
    const gcode = `G90\nG92 E0\nG3 X10 Y10 I5 J0 E5.5`;
    const result = parseGcodeExtrusion(gcode);
    expect(result[0]).toBeCloseTo(5.5);
  });

  it('captures G2/G3 in relative E mode (M83)', () => {
    const gcode = `G90\nM83\nG2 X10 Y10 I5 J0 E0.25\nG3 X0 Y0 I-5 J0 E0.30`;
    const result = parseGcodeExtrusion(gcode);
    expect(result[0]).toBeCloseTo(0.55);
  });

  it('mixes G1 and G2 correctly', () => {
    const gcode = `
G90
G92 E0
G1 X5 E5.0
G2 X10 Y5 I5 J0 E10.0
G1 X15 E14.0
`.trim();
    // 0→5 = 5mm, 5→10 = 5mm (arc), 10→14 = 4mm → total 14mm
    const result = parseGcodeExtrusion(gcode);
    expect(result[0]).toBeCloseTo(14.0);
  });

  it('diagnostics report G2/G3 contribution separately', () => {
    const gcode = `G90\nG92 E0\nG1 E5.0\nG2 X5 Y5 I2 J0 E8.0`;
    const { diagnostics } = parseGcodeDetailed(gcode);
    expect(diagnostics.g1Mm).toBeCloseTo(5.0);
    expect(diagnostics.g2g3Mm).toBeCloseTo(3.0); // 5→8
  });
});

// ── T command with parameters ─────────────────────────────────────────────────

describe('parseGcodeExtrusion — T command variants', () => {
  it('handles T command with trailing parameters (T1000 S1)', () => {
    const gcode = `G90\nT1000 S1\nG92 E0\nG1 E15.0`;
    const result = parseGcodeExtrusion(gcode);
    expect(result[1000]).toBeCloseTo(15.0);
  });

  it('handles T command followed by space only', () => {
    const gcode = `G90\nT2 \nG92 E0\nG1 E7.0`;
    const result = parseGcodeExtrusion(gcode);
    expect(result[2]).toBeCloseTo(7.0);
  });

  it('Bambu-specific T255 is tracked as its own slot', () => {
    const gcode = `G90\nT255\nG92 E0\nG1 E3.0`;
    const result = parseGcodeExtrusion(gcode);
    expect(result[255]).toBeCloseTo(3.0);
  });

  it('diagnostics record full tool sequence with line numbers', () => {
    const gcode = `G90\nT0\nG1 E5\nT1\nG1 E3\nT1000\nG1 E10`;
    const { diagnostics } = parseGcodeDetailed(gcode);
    expect(diagnostics.toolSequence.map((s) => s.tool)).toEqual([0, 1, 1000]);
  });
});

// ── G92 extended handling ─────────────────────────────────────────────────────

describe('parseGcodeExtrusion — G92 extended', () => {
  it('handles G92 reset to non-zero E value', () => {
    // Rare but valid: G92 E1.5 sets the E reference to 1.5
    const gcode = `G90\nG92 E0\nG1 E10.0\nG92 E1.5\nG1 E5.0`;
    // After G92 E1.5: lastE=1.5. G1 E5.0: 5.0 > 1.5 → add 3.5. Total: 10 + 3.5 = 13.5
    const result = parseGcodeExtrusion(gcode);
    expect(result[0]).toBeCloseTo(13.5);
  });

  it('G92 without E does not affect lastE', () => {
    const gcode = `G90\nG92 E0\nG1 E8.0\nG92 X0 Y0\nG1 E12.0`;
    // G92 X0 Y0 has no E — lastE stays 8.0. G1 E12.0: 12-8 = 4mm
    const result = parseGcodeExtrusion(gcode);
    expect(result[0]).toBeCloseTo(12.0); // 8 + 4
  });

  it('g92Count counts only resets that include E', () => {
    const gcode = `G92 E0\nG92 X0\nG92 E0\nG92 Z1.0`;
    const { diagnostics } = parseGcodeDetailed(gcode);
    expect(diagnostics.g92Count).toBe(2); // only the two with E
  });
});

// ── parseGcodeDetailed diagnostics ───────────────────────────────────────────

describe('parseGcodeDetailed', () => {
  it('returns extrusionByTool matching parseGcodeExtrusion', () => {
    const gcode = `G90\nG92 E0\nG1 E10.0\nT1\nG92 E0\nG1 E5.0`;
    const simple = parseGcodeExtrusion(gcode);
    const detailed = parseGcodeDetailed(gcode);
    expect(detailed.extrusionByTool).toEqual(simple);
  });

  it('captures first 50 non-blank lines', () => {
    const gcode = Array.from({ length: 60 }, (_, i) => `G1 E${i}`).join('\n');
    const { diagnostics } = parseGcodeDetailed(gcode);
    expect(diagnostics.firstLines.length).toBe(50);
  });

  it('flags m200Detected for volumetric mode', () => {
    const { diagnostics } = parseGcodeDetailed('M200 S1\nG1 E5.0');
    expect(diagnostics.m200Detected).toBe(true);
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
