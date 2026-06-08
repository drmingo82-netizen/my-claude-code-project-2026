// All Zustand persist keys for this app
const STORE_KEYS = [
  'tactile-filament',
  'tactile-products',
  'tactile-sales',
  'tactile-orders',
  'tactile-locations',
  'tactile-hardware',
  'tactile-ams-presets',
  'tactile-drying',
] as const;

export interface BackupFile {
  version: 1;
  exportedAt: string;
  stores: Record<string, unknown>;
}

export function exportAllData(): void {
  const stores: Record<string, unknown> = {};
  for (const key of STORE_KEYS) {
    const raw = localStorage.getItem(key);
    if (raw) {
      try {
        stores[key] = JSON.parse(raw);
      } catch {
        stores[key] = raw;
      }
    }
  }

  const backup: BackupFile = {
    version: 1,
    exportedAt: new Date().toISOString(),
    stores,
  };

  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const date = new Date().toISOString().slice(0, 10);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tactile-creations-backup-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function validateBackup(raw: unknown): raw is BackupFile {
  if (!raw || typeof raw !== 'object') return false;
  const b = raw as Record<string, unknown>;
  return b.version === 1 && typeof b.exportedAt === 'string' && typeof b.stores === 'object';
}

export function importAllData(backup: BackupFile): void {
  for (const key of STORE_KEYS) {
    const value = backup.stores[key];
    if (value !== undefined) {
      localStorage.setItem(key, JSON.stringify(value));
    }
  }
}

export function readBackupFile(file: File): Promise<BackupFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target?.result as string);
        if (!validateBackup(parsed)) {
          reject(new Error('File does not look like a Tactile Creations backup (missing version or stores).'));
          return;
        }
        resolve(parsed);
      } catch {
        reject(new Error('Could not parse file as JSON.'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsText(file);
  });
}
