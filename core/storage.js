/* core/storage.js
   Generic local database. Everything lives in one of two IndexedDB stores:
     - 'kv'   : simple key/value settings (pin hash, currency, etc.)
     - 'docs' : every record from every module, tagged with a `collection`
                string (e.g. "finance.transactions", "family.contacts").

   Modules never need their own object store. To add a new kind of record,
   a module just calls Storage.put('some.new.collection', {...}) — no
   schema migration, no DB version bump, nothing to change here.
*/

const DB_NAME = 'app_db';
const DB_VERSION = 1;

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('kv')) {
        db.createObjectStore('kv', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('docs')) {
        const docs = db.createObjectStore('docs', { keyPath: 'id' });
        docs.createIndex('by_collection', 'collection', { unique: false });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

async function store(name, mode) {
  const db = await openDB();
  return db.transaction(name, mode).objectStore(name);
}

const Storage = {
  uid,

  // ---- generic documents (what modules use for everything) ----

  async put(collection, record) {
    const s = await store('docs', 'readwrite');
    if (!record.id) record.id = uid();
    record.collection = collection;
    return new Promise((resolve, reject) => {
      const r = s.put(record);
      r.onsuccess = () => resolve(record);
      r.onerror = () => reject(r.error);
    });
  },

  async getAll(collection) {
    const s = await store('docs', 'readonly');
    return new Promise((resolve, reject) => {
      const r = s.index('by_collection').getAll(IDBKeyRange.only(collection));
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  },

  async get(id) {
    const s = await store('docs', 'readonly');
    return new Promise((resolve, reject) => {
      const r = s.get(id);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  },

  async remove(id) {
    const s = await store('docs', 'readwrite');
    return new Promise((resolve, reject) => {
      const r = s.delete(id);
      r.onsuccess = () => resolve();
      r.onerror = () => reject(r.error);
    });
  },

  // convenience for a collection that only ever holds one document
  // (e.g. "My Will" free-text notes)
  async getSingleton(collection) {
    const all = await this.getAll(collection);
    return all[0] || null;
  },

  async putSingleton(collection, data) {
    const existing = await this.getSingleton(collection);
    return this.put(collection, { ...(existing || {}), ...data, id: existing ? existing.id : undefined });
  },

  // ---- settings (pin hash, currency, etc.) ----

  async setSetting(key, value) {
    const s = await store('kv', 'readwrite');
    return new Promise((resolve, reject) => {
      const r = s.put({ id: key, value });
      r.onsuccess = () => resolve();
      r.onerror = () => reject(r.error);
    });
  },

  async getSetting(key, fallback = null) {
    const s = await store('kv', 'readonly');
    return new Promise((resolve, reject) => {
      const r = s.get(key);
      r.onsuccess = () => resolve(r.result ? r.result.value : fallback);
      r.onerror = () => reject(r.error);
    });
  },

  // ---- backup (the app's only backup mechanism — it's fully offline) ----

  async exportAll() {
    const db = await openDB();
    // Read both stores inside ONE transaction — awaiting between two separate
    // transactions lets the second one auto-close before its getAll() runs.
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['kv', 'docs'], 'readonly');
      let kv = [];
      let docs = [];
      tx.objectStore('kv').getAll().onsuccess = (e) => { kv = e.target.result; };
      tx.objectStore('docs').getAll().onsuccess = (e) => { docs = e.target.result; };
      tx.oncomplete = () => resolve({ kv, docs, exportedAt: new Date().toISOString(), dbVersion: DB_VERSION });
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  },

  // Wipe both stores. The caller (restore flow) uses this before importAll so a
  // restore replaces the current data rather than merging into it.
  async clearAll() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['kv', 'docs'], 'readwrite');
      tx.objectStore('kv').clear();
      tx.objectStore('docs').clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  },

  // Restore from an exportAll() dump. Validates shape, then writes every record
  // (one transaction per store) and resolves only once both have committed.
  async importAll(dump) {
    if (!dump || typeof dump !== 'object' || !Array.isArray(dump.kv) || !Array.isArray(dump.docs)) {
      throw new Error('Not a valid Anchor backup file (missing "kv" / "docs").');
    }
    const db = await openDB();
    const writeStore = (name, records) => new Promise((resolve, reject) => {
      if (!records.length) return resolve();
      const tx = db.transaction(name, 'readwrite');
      const os = tx.objectStore(name);
      records.forEach((rec) => { if (rec && rec.id != null) os.put(rec); });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    await writeStore('kv', dump.kv);
    await writeStore('docs', dump.docs);
  }
};
