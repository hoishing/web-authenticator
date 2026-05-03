export type TotpRecord = {
  id: string;
  description: string;
  secret: string;
  createdAt: number;
  updatedAt: number;
};

export type TotpRecordInput = {
  description: string;
  secret: string;
};

const DATABASE_NAME = "web-authenticator";
const STORE_NAME = "totp-records";
const DATABASE_VERSION = 1;

let databasePromise: Promise<IDBDatabase> | undefined;

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) {
    return databasePromise;
  }

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("secret", "secret", { unique: true });
        store.createIndex("description", "description", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open IndexedDB"));
  });

  return databasePromise;
}

function createTransaction(mode: IDBTransactionMode) {
  return openDatabase().then((database) => database.transaction(STORE_NAME, mode).objectStore(STORE_NAME));
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

function normalizeInput(input: TotpRecordInput): TotpRecordInput {
  return {
    description: input.description.trim(),
    secret: input.secret.trim().replace(/\s+/g, "").toUpperCase(),
  };
}

export async function loadRecords(): Promise<TotpRecord[]> {
  const store = await createTransaction("readonly");
  const records = await requestToPromise<TotpRecord[]>(store.getAll());

  return records.sort((left, right) => left.description.localeCompare(right.description));
}

export async function addRecord(input: TotpRecordInput): Promise<TotpRecord> {
  const normalized = normalizeInput(input);
  const now = Date.now();
  const record: TotpRecord = {
    id: crypto.randomUUID(),
    description: normalized.description,
    secret: normalized.secret,
    createdAt: now,
    updatedAt: now,
  };
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, "readwrite");
  transaction.objectStore(STORE_NAME).add(record);
  await transactionDone(transaction);

  return record;
}

export async function updateRecord(id: string, changes: Partial<TotpRecordInput>): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, "readwrite");
  const store = transaction.objectStore(STORE_NAME);
  const current = await requestToPromise<TotpRecord | undefined>(store.get(id));

  if (!current) {
    throw new Error("Record not found");
  }

  const normalized = normalizeInput({
    description: changes.description ?? current.description,
    secret: changes.secret ?? current.secret,
  });

  store.put({
    ...current,
    ...normalized,
    updatedAt: Date.now(),
  });
  await transactionDone(transaction);
}

export async function deleteRecord(id: string): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, "readwrite");
  transaction.objectStore(STORE_NAME).delete(id);
  await transactionDone(transaction);
}

export async function upsertImportedRecords(records: TotpRecordInput[]): Promise<{ added: number; updated: number }> {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, "readwrite");
  const store = transaction.objectStore(STORE_NAME);
  const secretIndex = store.index("secret");
  let added = 0;
  let updated = 0;

  for (const input of records) {
    const normalized = normalizeInput(input);
    const existing = await requestToPromise<TotpRecord | undefined>(secretIndex.get(normalized.secret));
    const now = Date.now();

    if (existing) {
      store.put({
        ...existing,
        description: normalized.description,
        updatedAt: now,
      });
      updated += 1;
    } else {
      store.add({
        id: crypto.randomUUID(),
        description: normalized.description,
        secret: normalized.secret,
        createdAt: now,
        updatedAt: now,
      } satisfies TotpRecord);
      added += 1;
    }
  }

  await transactionDone(transaction);

  return { added, updated };
}
