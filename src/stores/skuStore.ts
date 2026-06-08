import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SKUItem } from '../types';

const INITIAL_SKUS: Omit<SKUItem, 'id'>[] = [
  { sku: 'ANM-001', name: 'Medium Bees', category: 'Animal', quantity: 31, status: 'Active' },
  { sku: 'ANM-002', name: 'Small Avocado Clickers', category: 'Animal', quantity: 30, status: 'Active' },
  { sku: 'ANM-003', name: 'Green Spiky Chapstick Holder', category: 'Animal', quantity: 3, status: 'Active' },
  { sku: 'ANM-004', name: 'Small Purple Axolotls', category: 'Animal', quantity: 44, status: 'Active' },
  { sku: 'ANM-005', name: 'Medium Blue and Red Axolotls', category: 'Animal', quantity: 23, status: 'Active' },
  { sku: 'ANM-006', name: 'Medium Turtles', category: 'Animal', quantity: 7, status: 'Active' },
  { sku: 'ANM-007', name: 'Medium Red Crabs', category: 'Animal', quantity: 19, status: 'Active' },
  { sku: 'ANM-008', name: 'Medium Blue and White Dolphins', category: 'Animal', quantity: 16, status: 'Active' },
  { sku: 'ANM-009', name: 'Small Blue Sharks', category: 'Animal', quantity: 31, status: 'Active' },
  { sku: 'ANM-010', name: 'Small Blue Striped Fish', category: 'Animal', quantity: 28, status: 'Active' },
  { sku: 'ANM-011', name: 'Small Green Crocodiles', category: 'Animal', quantity: 26, status: 'Active' },
  { sku: 'ANM-012', name: 'Small White Bunny', category: 'Animal', quantity: 51, status: 'Active' },
  { sku: 'ANM-013', name: 'Medium White Bunnies', category: 'Animal', quantity: 8, status: 'Active' },
  { sku: 'ANM-014', name: 'Medium Pink Axolotls', category: 'Animal', quantity: 13, status: 'Active' },
  { sku: 'ANM-015', name: 'Medium Green Chameleons', category: 'Animal', quantity: 28, status: 'Active' },
  { sku: 'ANM-016', name: 'Fox Clickers', category: 'Animal', quantity: 5, status: 'Active' },
  { sku: 'ANM-017', name: 'Medium Blue Snakes', category: 'Animal', quantity: 8, status: 'Active' },
  { sku: 'ANM-018', name: 'Tiny Blue Snakes', category: 'Animal', quantity: 2, status: 'Active' },
  { sku: 'ANM-019', name: 'Medium White Cats', category: 'Animal', quantity: 7, status: 'Active' },
  { sku: 'ANM-020', name: 'Small Yellow Cats', category: 'Animal', quantity: 11, status: 'Active' },
  { sku: 'ANM-021', name: 'Medium Chibi Miscellaneous Animals', category: 'Animal', quantity: 10, status: 'Active' },
  { sku: 'ANM-022', name: 'Blue Egg with Green Snake', category: 'Animal', quantity: 1, status: 'Active' },
  { sku: 'FDG-001', name: 'Medium Lucky Charm Clickers', category: 'Fidget', quantity: 16, status: 'Active' },
  { sku: 'FDG-002', name: 'Medium Lucky Charm Clickers Keychain', category: 'Fidget', quantity: 12, status: 'Active' },
  { sku: 'FDG-003', name: 'Snowcone Clickers', category: 'Fidget', quantity: 5, status: 'Active' },
  { sku: 'FDG-004', name: 'Dumpling Clickers', category: 'Fidget', quantity: 9, status: 'Active' },
  { sku: 'FDG-005', name: 'Egg Clicker', category: 'Fidget', quantity: 2, status: 'Active' },
  { sku: 'FDG-006', name: 'Small Pink Spiky Ball', category: 'Fidget', quantity: 2, status: 'Active' },
  { sku: 'FDG-007', name: 'Large Pink Spiky Ball', category: 'Fidget', quantity: 1, status: 'Active' },
  { sku: 'FDG-008', name: 'Large Blue Spiky Ball', category: 'Fidget', quantity: 1, status: 'Active' },
  { sku: 'FDG-009', name: 'Small Green White and Brown Infinity Square', category: 'Fidget', quantity: 2, status: 'Active' },
  { sku: 'FDG-010', name: 'Rectangular Triangle Yellow Grey Black Fidget', category: 'Fidget', quantity: 1, status: 'Active' },
  { sku: 'FDG-011', name: 'White One Key Clickers', category: 'Fidget', quantity: 6, status: 'Active' },
  { sku: 'FDG-012', name: 'White Two Key Clickers', category: 'Fidget', quantity: 6, status: 'Active' },
  { sku: 'FDG-013', name: 'White Three Key Clickers', category: 'Fidget', quantity: 6, status: 'Active' },
  { sku: 'FDG-014', name: 'White Six Key Clickers', category: 'Fidget', quantity: 6, status: 'Active' },
  { sku: 'FDG-015', name: 'Pink One Key Clickers', category: 'Fidget', quantity: 1, status: 'Active' },
  { sku: 'FDG-016', name: 'Pink Two Key Clickers', category: 'Fidget', quantity: 1, status: 'Active' },
  { sku: 'FDG-017', name: 'Pink Three Key Clickers', category: 'Fidget', quantity: 1, status: 'Active' },
  { sku: 'FDG-018', name: 'Pink Four Key Clickers', category: 'Fidget', quantity: 1, status: 'Active' },
  { sku: 'FDG-019', name: 'Flexi Stars', category: 'Fidget', quantity: 2, status: 'Active' },
  { sku: 'FDG-020', name: 'Rubber Band Squishy Balls', category: 'Fidget', quantity: 16, status: 'Active' },
  { sku: 'FDG-021', name: 'Rotating Gear Balls', category: 'Fidget', quantity: 2, status: 'Active' },
  { sku: 'FDG-022', name: 'Small Blue and Red Hexagon Fidget', category: 'Fidget', quantity: 5, status: 'Active' },
  { sku: 'FDG-023', name: 'Medium Blue Hexagon Fidget', category: 'Fidget', quantity: 3, status: 'Active' },
  { sku: 'FDG-024', name: 'Large Hexagon Fidget', category: 'Fidget', quantity: 1, status: 'Active' },
  { sku: 'FDG-025', name: 'Extra Large Hexagon Fidget', category: 'Fidget', quantity: 1, status: 'Active' },
  { sku: 'FDG-026', name: 'Large Black Spiky Fidgets', category: 'Fidget', quantity: 5, status: 'Active' },
  { sku: 'FDG-027', name: 'Medium Black Spiky Fidgets', category: 'Fidget', quantity: 4, status: 'Active' },
  { sku: 'FDG-028', name: 'Smooth Infinity Red and Blue Sphere', category: 'Fidget', quantity: 1, status: 'Active' },
  { sku: 'FDG-029', name: 'Bumpy Infinity Purple Sphere', category: 'Fidget', quantity: 1, status: 'Active' },
  { sku: 'FDG-030', name: 'Oval Expanding and Condensing Fidget', category: 'Fidget', quantity: 2, status: 'Active' },
  { sku: 'FDG-031', name: 'Small Infinity Orange Dragon Egg', category: 'Fidget', quantity: 1, status: 'Active' },
  { sku: 'FDG-032', name: 'Medium Infinity Blue Dragon Egg', category: 'Fidget', quantity: 1, status: 'Active' },
  { sku: 'FDG-033', name: 'Gyroscope Pink Fidget', category: 'Fidget', quantity: 2, status: 'Active' },
  { sku: 'KEY-001', name: 'Black White Best Dad Ever Keychain', category: 'Keychain', quantity: 10, status: 'Active' },
  { sku: 'KEY-002', name: 'Yellow Black Best Father Keychain', category: 'Keychain', quantity: 28, status: 'Active' },
  { sku: 'KEY-003', name: 'HTX Astros Keychain', category: 'Keychain', quantity: 14, status: 'Active' },
  { sku: 'KEY-004', name: 'Fox Clickers Keychain', category: 'Keychain', quantity: 3, status: 'Active' },
  { sku: 'ORG-001', name: 'Three Hole Grey Container', category: 'Organizational', quantity: 1, status: 'Active' },
  { sku: 'ORG-002', name: 'Three Hole Blue Container', category: 'Organizational', quantity: 1, status: 'Active' },
  { sku: 'ORG-003', name: 'Two Hole Grey Container', category: 'Organizational', quantity: 1, status: 'Active' },
  { sku: 'ORG-004', name: 'Two Hole Blue Container', category: 'Organizational', quantity: 1, status: 'Active' },
  { sku: 'ORG-005', name: 'One Hole Grey Container', category: 'Organizational', quantity: 1, status: 'Active' },
  { sku: 'ORG-006', name: 'One Hole Blue Container', category: 'Organizational', quantity: 1, status: 'Active' },
  { sku: 'ORG-007', name: 'Heel Holders', category: 'Organizational', quantity: 5, status: 'Active' },
  { sku: 'ORG-008', name: 'Heel Holder Bedazzled', category: 'Organizational', quantity: 1, status: 'Active' },
  { sku: 'ORG-009', name: 'PP Scrub Daddy Holder', category: 'Organizational', quantity: 1, status: 'Active' },
  { sku: 'ORG-010', name: 'Scrub Daddy Holder', category: 'Organizational', quantity: 1, status: 'Active' },
  { sku: 'ORG-011', name: 'Pink Can Cozie', category: 'Organizational', quantity: 2, status: 'Active' },
  { sku: 'ORG-012', name: 'Large Metal Nut Container', category: 'Organizational', quantity: 1, status: 'Active' },
  { sku: 'ORG-013', name: 'Bedazzled Measuring Tapes', category: 'Organizational', quantity: 7, status: 'Active' },
  { sku: 'ORG-014', name: 'Tap to Pay Wand', category: 'Organizational', quantity: 1, status: 'Active' },
  { sku: 'NOV-001', name: 'Best Farter Ever Signs', category: 'Novelty', quantity: 2, status: 'Active' },
  { sku: 'NOV-002', name: 'Lego Clicker', category: 'Novelty', quantity: 9, status: 'In Development' },
  { sku: 'NOV-003', name: 'Minion Clickers', category: 'Novelty', quantity: 10, status: 'In Development' },
];

interface SKUStore {
  skus: SKUItem[];
  addSKU: (sku: Omit<SKUItem, 'id'>) => void;
  updateSKU: (id: string, updates: Partial<Omit<SKUItem, 'id'>>) => void;
  deleteSKU: (id: string) => void;
}

export const useSKUStore = create<SKUStore>()(
  persist(
    (set) => ({
      skus: [],
      addSKU: (sku) =>
        set((s) => ({ skus: [...s.skus, { ...sku, id: crypto.randomUUID() }] })),
      updateSKU: (id, updates) =>
        set((s) => ({ skus: s.skus.map((i) => (i.id === id ? { ...i, ...updates } : i)) })),
      deleteSKU: (id) =>
        set((s) => ({ skus: s.skus.filter((i) => i.id !== id) })),
    }),
    {
      name: 'tactile-skus',
      onRehydrateStorage: () => (state) => {
        if (state && state.skus.length === 0) {
          state.skus = INITIAL_SKUS.map((s) => ({ ...s, id: crypto.randomUUID() }));
        }
      },
    }
  )
);
