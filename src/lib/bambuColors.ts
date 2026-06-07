// Hex values marked (exact) were confirmed from actual Bambu Lab invoices.
// All others are community-sourced visual approximations from print samples.
export const BAMBU_COLOR_MAP: Record<string, string> = {
  // Whites / Ivory
  '11100': '#FFFFF0', // Ivory White (exact)
  '11101': '#F8F5F0', // Warm White
  '11102': '#FFF8E7', // Cream
  '11103': '#F5F0E8', // Bone White (exact)
  '11104': '#F5F5F5', // Cool White
  '11105': '#EDF2EE', // Jade White
  '11107': '#FFFAF0', // Snow White
  '11108': '#F5DEB3', // Beige
  // Blacks / Grays
  '11109': '#1C1C1C', // Black
  '11110': '#2D2D2D', // Matte Black
  '11111': '#555555', // Dark Gray
  '11112': '#8C8C8C', // Gray
  '11115': '#C0C0C0', // Light Gray
  '11120': '#9DAAB4', // Cold Gray
  // Reds / Terracotta
  '11201': '#8B0000', // Dark Red
  '11202': '#E82020', // Red
  '11203': '#C67B5C', // Terracotta (exact)
  '11204': '#6B3FA0', // Plum (exact)
  '11205': '#C0292A', // Scarlet
  // Pinks
  '10202': '#CC0066', // Magenta (exact)
  '10203': '#FFB6C1', // Pink (exact)
  '11210': '#FF6680', // Coral Pink
  '11211': '#FFB6C1', // Baby Pink
  '11212': '#FF85A1', // Sakura Pink
  '11215': '#FFADA0', // Peach Pink
  '11220': '#E0289A', // Hot Magenta
  '11225': '#FF69B4', // Hot Pink
  '11240': '#80001E', // Burgundy
  '11245': '#722F37', // Wine Red
  '13211': '#FFB7C5', // Cherry Pink (exact)
  // Oranges
  '11301': '#FF6B00', // Orange
  '11302': '#FF8C00', // Pumpkin Orange
  '11303': '#FFA550', // Apricot
  '11305': '#FD5C26', // Bambu Orange
  // Yellows
  '11400': '#F5C518', // Lemon Yellow (exact)
  '11401': '#C4A882', // Desert Tan (exact)
  '11402': '#FFD700', // Gold Yellow
  '11403': '#FBED00', // Pure Yellow
  '11405': '#FFC300', // Sunflower Yellow
  // Greens
  '11501': '#1E5C1E', // Dark Green
  '11502': '#3A7D44', // Forest Green
  '11503': '#3CB371', // Grass Green
  '11504': '#00A36C', // Jade Green
  '11505': '#90EE90', // Light Green
  '11506': '#32CD32', // Lime Green
  '11507': '#98FF98', // Mint Green
  '11510': '#006400', // Deep Forest Green
  '11515': '#2E8B57', // Sea Green
  // Blues
  '11601': '#003580', // Navy Blue
  '11602': '#2952CC', // Royal Blue
  '11603': '#87CEEB', // Sky Blue (exact)
  '11604': '#0065CC', // Bambu Blue
  '11605': '#00BFFF', // Cyan Blue
  '11606': '#004080', // Dark Blue
  '11607': '#B0D4E8', // Ice Blue
  '11608': '#008B8B', // Teal
  '11610': '#4682B4', // Steel Blue
  '11615': '#ADD8E6', // Baby Blue
  // Purples
  '11701': '#6A0DAD', // Purple
  '11702': '#7B00D4', // Violet
  '11703': '#B57EDC', // Lilac
  '11704': '#C8A2C8', // Mauve
  '11705': '#E6E6FA', // Lavender
  '11706': '#9B30FF', // Blue Purple
  '11707': '#4B0082', // Indigo
  '11710': '#DDA0DD', // Plum
  // Browns
  '11801': '#8B4513', // Saddle Brown
  '11802': '#6F4E37', // Coffee Brown
  '11803': '#D2B48C', // Tan
  '11804': '#C68642', // Caramel Brown
  // Metallics / Special
  '11901': '#A8A9AD', // Silver
  '11902': '#D4AF37', // Gold
  '11903': '#CD7F32', // Bronze
  '11904': '#B87333', // Copper
};

export function getBambuColorHex(code: string): string | undefined {
  return BAMBU_COLOR_MAP[code];
}
