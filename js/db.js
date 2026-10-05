// IndexedDB 키-값 저장소 (사용 불가 환경에서는 메모리로 대체)
let DB_NAME = 'schedule-hub';
export function setDbName(n) {
  DB_NAME = n;
  dbp = null;
}
const STORE = 'kv';
let dbp = null;
const mem = new Map();
let useMem = false;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    try {
      if (!('indexedDB' in self)) throw new Error('no idb');
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        useMem = true;
        resolve(null);
      };
      req.onblocked = () => {
        useMem = true;
        resolve(null);
      };
    } catch {
      useMem = true;
      resolve(null);
    }
  });
  return dbp;
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const st = t.objectStore(STORE);
    const r = fn(st);
    t.oncomplete = () => resolve(r && 'result' in r ? r.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export async function get(key, fallback = null) {
  const db = await open();
  if (useMem || !db) return mem.has(key) ? structuredClone(mem.get(key)) : fallback;
  try {
    const v = await tx(db, 'readonly', (st) => st.get(key));
    return v === undefined ? fallback : v;
  } catch {
    return mem.has(key) ? mem.get(key) : fallback;
  }
}

export async function set(key, value) {
  const db = await open();
  if (useMem || !db) {
    mem.set(key, structuredClone(value));
    return;
  }
  try {
    await tx(db, 'readwrite', (st) => st.put(value, key));
  } catch {
    mem.set(key, value);
  }
}

export async function del(key) {
  const db = await open();
  mem.delete(key);
  if (useMem || !db) return;
  try {
    await tx(db, 'readwrite', (st) => st.delete(key));
  } catch {
    /* noop */
  }
}

export async function clearAll() {
  const db = await open();
  mem.clear();
  if (useMem || !db) return;
  try {
    await tx(db, 'readwrite', (st) => st.clear());
  } catch {
    /* noop */
  }
}

// localStorage 안전 래퍼 (가벼운 개인 설정용)
export const ls = {
  get(k, fb = null) {
    try {
      const v = localStorage.getItem(k);
      return v == null ? fb : JSON.parse(v);
    } catch {
      return fb;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* noop */
    }
  },
  del(k) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* noop */
    }
  },
};
