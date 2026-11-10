import type { Skill } from "../model/extensions.model";

const DATABASE = "research-assistant";
const STORE = "skills";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then((database) => new Promise<T>((resolve, reject) => {
    const request = action(database.transaction(STORE, mode).objectStore(STORE));
    request.onsuccess = () => {
      database.close();
      resolve(request.result);
    };
    request.onerror = () => {
      database.close();
      reject(request.error);
    };
  }));
}

/** Personal skills live in IndexedDB, because localStorage is small and holds the conversations. */
export const skillStore = {
  all: () => run<Skill[]>("readonly", (store) => store.getAll()),
  put: (skill: Skill) => run("readwrite", (store) => store.put(skill)),
  delete: (id: string) => run("readwrite", (store) => store.delete(id)),
};
