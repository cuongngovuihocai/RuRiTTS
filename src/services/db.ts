import { Book, CustomDictionaryEntry, VoiceSettings, ThemeMode, FontSize } from '../types';

const DB_NAME = 'VietVoiceReaderDB';
const DB_VERSION = 1;

let dbInstance: IDBDatabase | null = null;

export async function initDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
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
    };

    request.onsuccess = (event) => {
      dbInstance = (event.target as IDBOpenDBRequest).result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      console.error('IndexedDB Error:', (event.target as IDBOpenDBRequest).error);
      reject((event.target as IDBOpenDBRequest).error);
    };
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
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['books'], 'readwrite');
    const store = transaction.objectStore('books');
    const request = store.put({
      ...book,
      updatedAt: Date.now(),
    });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getAllBooks(): Promise<Book[]> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['books'], 'readonly');
    const store = transaction.objectStore('books');
    const request = store.getAll();
    request.onsuccess = () => {
      const books: Book[] = request.result || [];
      books.sort((a, b) => b.updatedAt - a.updatedAt);
      resolve(books);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getBookById(id: string): Promise<Book | null> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['books'], 'readonly');
    const store = transaction.objectStore('books');
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteBook(id: string): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['books'], 'readwrite');
    const store = transaction.objectStore('books');
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getDictionary(): Promise<CustomDictionaryEntry[]> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['dictionary'], 'readonly');
    const store = transaction.objectStore('dictionary');
    const request = store.getAll();
    request.onsuccess = () => {
      const items: CustomDictionaryEntry[] = request.result || [];
      if (items.length === 0) {
        // Seed default dictionary
        saveDictionary(DEFAULT_DICTIONARY);
        resolve(DEFAULT_DICTIONARY);
      } else {
        resolve(items);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

export async function saveDictionary(entries: CustomDictionaryEntry[]): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['dictionary'], 'readwrite');
    const store = transaction.objectStore('dictionary');
    store.clear();
    for (const entry of entries) {
      store.put(entry);
    }
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function saveSetting<T>(key: string, value: T): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['settings'], 'readwrite');
    const store = transaction.objectStore('settings');
    const request = store.put({ key, value });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getSetting<T>(key: string, defaultValue: T): Promise<T> {
  try {
    const db = await initDB();
    return new Promise((resolve) => {
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
    });
  } catch {
    return defaultValue;
  }
}
