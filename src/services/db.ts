import { Book, CustomDictionaryEntry, VoiceSettings, ThemeMode, FontSize } from '../types';

const DB_NAME = 'VietVoiceReaderDB';
const DB_VERSION = 1;

let dbInstance: IDBDatabase | null = null;
let idbBlocked = false;

// In-memory fallback if IndexedDB is disabled (e.g. Safari Private Mode or strict privacy settings)
const memoryStore = {
  books: new Map<string, Book>(),
  settings: new Map<string, any>(),
  dictionary: new Map<string, CustomDictionaryEntry>(),
};

export async function initDB(): Promise<IDBDatabase | null> {
  if (dbInstance) return dbInstance;
  if (idbBlocked) return null;

  return new Promise((resolve) => {
    try {
      if (typeof window === 'undefined' || !window.indexedDB) {
        idbBlocked = true;
        resolve(null);
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        try {
          const db = (event.target as IDBOpenDBRequest).result;

          if (!db.objectStoreNames.contains('books')) {
            const bookStore = db.createObjectStore('books', { keyPath: 'id' });
            bookStore.createIndex('updatedAt', 'updatedAt', { unique: false });
          }

          if (!db.objectStoreNames.contains('dictionary')) {
            db.createObjectStore('dictionary', { keyPath: 'id' });
          }

          if (!db.objectStoreNames.contains('settings')) {
            db.createObjectStore('settings', { keyPath: 'key' });
          }
        } catch (e) {
          console.warn('IDB upgrade error:', e);
        }
      };

      request.onsuccess = (event) => {
        dbInstance = (event.target as IDBOpenDBRequest).result;
        resolve(dbInstance);
      };

      request.onerror = (event) => {
        console.warn('IndexedDB not accessible, using memory fallback:', (event.target as IDBOpenDBRequest).error);
        idbBlocked = true;
        resolve(null);
      };

      request.onblocked = () => {
        console.warn('IndexedDB open blocked, using memory fallback');
        resolve(null);
      };
    } catch (err) {
      console.warn('IndexedDB init caught error, using memory fallback:', err);
      idbBlocked = true;
      resolve(null);
    }
  });
}

// Default Dictionary Entries for Vietnamese
export const DEFAULT_DICTIONARY: CustomDictionaryEntry[] = [
  { id: '1', word: 'k', replaceWith: 'không' },
  { id: '2', word: 'ko', replaceWith: 'không' },
  { id: '3', word: 'hok', replaceWith: 'không' },
  { id: '4', word: 'đc', replaceWith: 'được' },
  { id: '5', word: 'dc', replaceWith: 'được' },
  { id: '6', word: 'ng', replaceWith: 'người' },
  { id: '7', word: 'ngta', replaceWith: 'người ta' },
  { id: '8', word: 'bt', replaceWith: 'biết' },
  { id: '9', word: 'tp.', replaceWith: 'thành phố' },
  { id: '10', word: 'TP.', replaceWith: 'thành phố' },
  { id: '11', word: 'đ/c', replaceWith: 'đồng chí' },
  { id: '12', word: 'tr.', replaceWith: 'trang' },
  { id: '13', word: 'NXB', replaceWith: 'Nhà xuất bản' },
  { id: '14', word: 'GS.TS', replaceWith: 'Giáo sư Tiến sĩ' },
  { id: '15', word: 'PGS.TS', replaceWith: 'Phó Giáo sư Tiến sĩ' },
  { id: '16', word: 'ThS.', replaceWith: 'Thạc sĩ' },
  { id: '17', word: 'BS.', replaceWith: 'Bác sĩ' },
];

export async function saveBook(book: Book): Promise<void> {
  const updatedBook = {
    ...book,
    updatedAt: Date.now(),
  };

  const db = await initDB();
  if (!db) {
    memoryStore.books.set(book.id, updatedBook);
    try {
      localStorage.setItem(`ruri_book_${book.id}`, JSON.stringify(updatedBook));
    } catch {}
    return;
  }

  return new Promise((resolve) => {
    try {
      const transaction = db.transaction(['books'], 'readwrite');
      const store = transaction.objectStore('books');
      const request = store.put(updatedBook);
      request.onsuccess = () => resolve();
      request.onerror = () => {
        memoryStore.books.set(book.id, updatedBook);
        resolve();
      };
    } catch {
      memoryStore.books.set(book.id, updatedBook);
      resolve();
    }
  });
}

export async function getAllBooks(): Promise<Book[]> {
  const db = await initDB();
  if (!db) {
    return Array.from(memoryStore.books.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  return new Promise((resolve) => {
    try {
      const transaction = db.transaction(['books'], 'readonly');
      const store = transaction.objectStore('books');
      const request = store.getAll();
      request.onsuccess = () => {
        const books: Book[] = request.result || [];
        books.sort((a, b) => b.updatedAt - a.updatedAt);
        resolve(books);
      };
      request.onerror = () => resolve(Array.from(memoryStore.books.values()));
    } catch {
      resolve(Array.from(memoryStore.books.values()));
    }
  });
}

export async function getBookById(id: string): Promise<Book | null> {
  const db = await initDB();
  if (!db) {
    return memoryStore.books.get(id) || null;
  }

  return new Promise((resolve) => {
    try {
      const transaction = db.transaction(['books'], 'readonly');
      const store = transaction.objectStore('books');
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(memoryStore.books.get(id) || null);
    } catch {
      resolve(memoryStore.books.get(id) || null);
    }
  });
}

export async function deleteBook(id: string): Promise<void> {
  memoryStore.books.delete(id);
  try {
    localStorage.removeItem(`ruri_book_${id}`);
  } catch {}

  const db = await initDB();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const transaction = db.transaction(['books'], 'readwrite');
      const store = transaction.objectStore('books');
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function getDictionary(): Promise<CustomDictionaryEntry[]> {
  const db = await initDB();
  if (!db) {
    if (memoryStore.dictionary.size === 0) {
      for (const d of DEFAULT_DICTIONARY) memoryStore.dictionary.set(d.id, d);
    }
    return Array.from(memoryStore.dictionary.values());
  }

  return new Promise((resolve) => {
    try {
      const transaction = db.transaction(['dictionary'], 'readonly');
      const store = transaction.objectStore('dictionary');
      const request = store.getAll();
      request.onsuccess = () => {
        const items: CustomDictionaryEntry[] = request.result || [];
        if (items.length === 0) {
          saveDictionary(DEFAULT_DICTIONARY);
          resolve(DEFAULT_DICTIONARY);
        } else {
          resolve(items);
        }
      };
      request.onerror = () => resolve(DEFAULT_DICTIONARY);
    } catch {
      resolve(DEFAULT_DICTIONARY);
    }
  });
}

export async function saveDictionary(entries: CustomDictionaryEntry[]): Promise<void> {
  memoryStore.dictionary.clear();
  for (const entry of entries) {
    memoryStore.dictionary.set(entry.id, entry);
  }

  const db = await initDB();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const transaction = db.transaction(['dictionary'], 'readwrite');
      const store = transaction.objectStore('dictionary');
      store.clear();
      for (const entry of entries) {
        store.put(entry);
      }
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function saveSetting<T>(key: string, value: T): Promise<void> {
  memoryStore.settings.set(key, value);
  try {
    localStorage.setItem(`ruri_setting_${key}`, JSON.stringify(value));
  } catch {}

  const db = await initDB();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const transaction = db.transaction(['settings'], 'readwrite');
      const store = transaction.objectStore('settings');
      const request = store.put({ key, value });
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function getSetting<T>(key: string, defaultValue: T): Promise<T> {
  try {
    const memVal = memoryStore.settings.get(key);
    if (memVal !== undefined) return memVal;

    try {
      const local = localStorage.getItem(`ruri_setting_${key}`);
      if (local !== null) {
        return JSON.parse(local);
      }
    } catch {}

    const db = await initDB();
    if (!db) return defaultValue;

    return new Promise((resolve) => {
      try {
        const transaction = db.transaction(['settings'], 'readonly');
        const store = transaction.objectStore('settings');
        const request = store.get(key);
        request.onsuccess = () => {
          if (request.result && request.result.value !== undefined) {
            resolve(request.result.value);
          } else {
            resolve(defaultValue);
          }
        };
        request.onerror = () => resolve(defaultValue);
      } catch {
        resolve(defaultValue);
      }
    });
  } catch {
    return defaultValue;
  }
}
