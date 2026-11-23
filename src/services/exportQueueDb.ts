const EXPORT_DB_NAME = 'RuRiExportQueueDB';
const EXPORT_DB_VERSION = 1;
const STORE_NAME = 'segments';

interface ExportSegmentRecord {
  key: string; // `${jobId}#${segmentIndex}`
  jobId: string;
  segmentIndex: number;
  base64Audio: string;
  updatedAt: number;
}

let exportDbInstance: IDBDatabase | null = null;
let exportDbBlocked = false;

// In-memory fallback when IndexedDB is unavailable (e.g., Private Browsing)
const memorySegments = new Map<string, Map<number, string>>();

function initExportDB(): Promise<IDBDatabase | null> {
  if (exportDbInstance) return Promise.resolve(exportDbInstance);
  if (exportDbBlocked) return Promise.resolve(null);

  return new Promise((resolve) => {
    try {
      if (typeof window === 'undefined' || !window.indexedDB) {
        exportDbBlocked = true;
        resolve(null);
        return;
      }

      const request = indexedDB.open(EXPORT_DB_NAME, EXPORT_DB_VERSION);

      request.onupgradeneeded = (event) => {
        try {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
            store.createIndex('jobId', 'jobId', { unique: false });
            store.createIndex('updatedAt', 'updatedAt', { unique: false });
          }
        } catch (err) {
          console.warn('ExportQueueDB upgrade error:', err);
        }
      };

      request.onsuccess = (event) => {
        exportDbInstance = (event.target as IDBOpenDBRequest).result;
        resolve(exportDbInstance);
      };

      request.onerror = () => {
        exportDbBlocked = true;
        resolve(null);
      };

      request.onblocked = () => {
        resolve(null);
      };
    } catch {
      exportDbBlocked = true;
      resolve(null);
    }
  });
}

export function computeExportTextHash(text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= c ^ (i & 0xff);
    h2 = Math.imul(h2, 0x01000193);
  }
  return `${(h1 >>> 0).toString(36)}_${(h2 >>> 0).toString(36)}_${text.length}`;
}

export async function saveExportJobSegment(
  jobId: string,
  segmentIndex: number,
  base64Audio: string
): Promise<void> {
  let jobMap = memorySegments.get(jobId);
  if (!jobMap) {
    jobMap = new Map<number, string>();
    memorySegments.set(jobId, jobMap);
  }
  jobMap.set(segmentIndex, base64Audio);

  const db = await initExportDB();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const record: ExportSegmentRecord = {
        key: `${jobId}#${segmentIndex}`,
        jobId,
        segmentIndex,
        base64Audio,
        updatedAt: Date.now(),
      };
      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function getExportJobSegments(jobId: string): Promise<Map<number, string>> {
  const result = new Map<number, string>();
  const memMap = memorySegments.get(jobId);
  if (memMap) {
    memMap.forEach((val, idx) => result.set(idx, val));
  }

  const db = await initExportDB();
  if (!db) return result;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction([STORE_NAME], 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('jobId');
      const req = index.getAll(IDBKeyRange.only(jobId));
      req.onsuccess = () => {
        const items: ExportSegmentRecord[] = req.result || [];
        for (const item of items) {
          result.set(item.segmentIndex, item.base64Audio);
        }
        resolve(result);
      };
      req.onerror = () => resolve(result);
    } catch {
      resolve(result);
    }
  });
}

export async function getExportJobSavedIndices(jobId: string): Promise<Set<number>> {
  const indices = new Set<number>();
  const memMap = memorySegments.get(jobId);
  if (memMap) {
    memMap.forEach((_, idx) => indices.add(idx));
  }

  const db = await initExportDB();
  if (!db) return indices;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction([STORE_NAME], 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('jobId');
      const req = index.getAllKeys(IDBKeyRange.only(jobId));
      req.onsuccess = () => {
        const keys = req.result || [];
        for (const k of keys) {
          const keyStr = String(k);
          const sep = keyStr.lastIndexOf('#');
          if (sep !== -1) {
            const segIdx = Number(keyStr.slice(sep + 1));
            if (Number.isInteger(segIdx) && segIdx >= 0) {
              indices.add(segIdx);
            }
          }
        }
        resolve(indices);
      };
      req.onerror = () => resolve(indices);
    } catch {
      resolve(indices);
    }
  });
}

export async function clearExportJob(jobId: string): Promise<void> {
  memorySegments.delete(jobId);
  const db = await initExportDB();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('jobId');
      const req = index.getAllKeys(IDBKeyRange.only(jobId));
      req.onsuccess = () => {
        const keys = req.result || [];
        for (const key of keys) {
          store.delete(key);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      };
      req.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function pruneOldExportJobs(maxAgeMs = 3 * 24 * 60 * 60 * 1000): Promise<void> {
  const db = await initExportDB();
  if (!db) return;
  const cutoff = Date.now() - maxAgeMs;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('updatedAt');
      const range = IDBKeyRange.upperBound(cutoff);
      const req = index.getAllKeys(range);
      req.onsuccess = () => {
        const keys = req.result || [];
        for (const key of keys) {
          store.delete(key);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      };
      req.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}
