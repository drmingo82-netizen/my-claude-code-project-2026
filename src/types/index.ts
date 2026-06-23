export type LocationType = 'AMS' | 'Shelf' | 'Drawer' | 'Dryer' | 'Box' | 'Other';

export interface StorageLocation {
  id: string;
  name: string;
  type: LocationType;
  notes?: string;
  maxCapacity?: number;
}

export interface FilamentSpool {
  id: string;
  brand: string;
  material: string; // PLA, PETG, ABS, TPU, etc.
  color: string;
  colorHex?: string; // e.g. "#ff6b6b" — used by palette tools
  weightTotalG: number;
  weightRemainingG: number;
  costPerSpool: number;
  purchasedAt: string; // ISO date
  notes?: string;
  locationId?: string;
  nfcProgrammed?: boolean;
  nfcProgrammedAt?: string; // ISO date
  lowStockThresholdGrams?: number; // default: 100g; alert fires when remaining drops to or below this
  lowStockAlertSent?: boolean;     // prevents duplicate alerts; reset when weight rises above threshold
}

// ── Hardware registry ─────────────────────────────────────────────────────────

export type PrinterStatus = 'active' | 'maintenance' | 'retired';

export interface Printer3D {
  id: string;
  name: string;
  brand: string;
  model: string;
  buildVolumeX?: number;
  buildVolumeY?: number;
  buildVolumeZ?: number;
  maxNozzleTempC?: number;
  maxBedTempC?: number;
  filamentDiameter: '1.75' | '2.85';
  compatibleMaterials: string[];
  purchaseDate?: string;
  purchasePrice?: number;
  notes?: string;
  status: PrinterStatus;
}

export type AmsType = 'AMS' | 'AMS Lite' | 'AMS 2 Pro' | 'AMS Hub';

export interface AMSSystem {
  id: string;
  name: string;
  type: AmsType;
  slotCount: 4 | 8;
  linkedPrinterId?: string; // UUID from Printer3D or bridge ID ('p1s', 'h2s')
  notes?: string;
}

export type PlateType =
  | 'Cool Plate'
  | 'Engineering Plate'
  | 'High Temp Plate'
  | 'Textured PEI'
  | 'Smooth PEI'
  | 'Other';

export interface BuildPlate {
  id: string;
  name: string;
  type: PlateType;
  compatibleMaterials: string[];
  linkedPrinterId?: string;
  conditionNotes?: string;
}

// ── Drying ────────────────────────────────────────────────────────────────────

export interface DryingSession {
  id: string;
  spoolId: string;
  spoolLabel: string;
  startedAt: string;
  durationMinutes: number;
  tempC: number;
  completedAt: string;
}

export interface ActiveDryingTimer {
  spoolId: string;
  spoolLabel: string;
  startedAt: string;
  durationMinutes: number;
  tempC: number;
  dryerId?: string;
}

export interface FilamentDryer {
  id: string;
  name: string;
  brand?: string;
  model?: string;
  maxTempC: number;
  capacitySpools?: number;
  notes?: string;
}

export interface AmsSlotColor {
  colorHex: string;
  colorName: string;
  brand?: string;
  material?: string;
}

// ── Active job tracking / auto-deduction ─────────────────────────────────────

export interface ActivePrintJob {
  jobId: string;
  printerId: string;
  gcodeFile: string;
  startedAt: string;
  calculatedGrams: Record<number, number>;  // amsSlot → grams (populated by estimator)
  spoolAssignments: Record<number, string>; // amsSlot → spoolId (snapshot at start)
  lastProgressPct: number;
  status: 'running' | 'complete' | 'cancelled' | 'failed';
}

export type DeductionType = 'automatic' | 'partial' | 'manual';

export interface UsageHistoryRecord {
  id: string;
  spoolId: string;
  jobId: string;
  gcodeFile: string;
  gramsUsed: number;
  printerId: string;
  amsSlot: number;
  completedAt: string;
  deductionType: DeductionType;
  completionPct?: number; // set for partial deductions
}

export interface AmsPreset {
  id: string;
  name: string;
  slots: (AmsSlotColor | null)[]; // always length 4
  createdAt: string;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  filamentSpoolId?: string;
  filamentUsedG: number;
  printTimeHours: number;
  laborHours: number;
  laborRatePerHour: number;
  otherCosts: number; // packaging, supports, etc.
  sellingPrice: number;
  notes?: string;
}

// ── SKU Catalog ───────────────────────────────────────────────────────────────

export type SKUCategory = 'Fidget' | 'Animal' | 'Keychain' | 'Organizational' | 'Novelty';
export type SKUStatus = 'Active' | 'In Development' | 'Inactive';

export interface SKUItem {
  id: string;
  sku: string;
  name: string;
  category: SKUCategory;
  quantity: number;
  salePrice?: number;
  filamentCost?: number;
  printTimeMinutes?: number;
  weightGrams?: number;
  amsSlots?: number;
  status: SKUStatus;
  notes?: string;
}

// ── Print Queue ───────────────────────────────────────────────────────────────

export type QueueStatus = 'queued' | 'printing' | 'done' | 'cancelled' | 'failed';
export type QueueTargetPrinter = 'p1s' | 'h2s' | 'a2l' | 'a1' | 'any';

export interface PrintQueueItem {
  id: string;
  displayName: string;
  fileName: string;
  skuId?: string;
  copies: number;
  copiesCompleted: number;
  targetPrinter: QueueTargetPrinter;
  priority: number;
  status: QueueStatus;
  createdAt: string;
  notes?: string;
  activePrinterId?: string;
  startedAt?: string;
}

export interface SaleEntry {
  id: string;
  productId: string;
  quantity: number;
  salePrice: number;
  soldAt: string; // ISO date
  platform: string; // Etsy, local, etc.
}

export interface OrderItem {
  productId: string;
  quantity: number;
  unitPrice: number;
  etsyTitle?: string; // original Etsy listing title when productId couldn't be matched
}

export type OrderStatus = 'new' | 'printing' | 'printed' | 'shipped';

export interface Order {
  id: string;
  orderNumber: string;
  platform: string;
  customerName: string;
  status: OrderStatus;
  items: OrderItem[];
  shippingCost: number;
  platformFeePercent: number;
  notes: string;
  createdAt: string; // YYYY-MM-DD
  etsyReceiptId?: number; // deduplication key for Etsy-synced orders
}
