import type { Hold, Review } from "@/features/holds/types";
import {
  migrateClimbingMetadata,
  migratePrintingMetadata,
} from "./local-migrations";

const DB_NAME = "crux-library";
const DB_VERSION = 3;
type Store = "holds" | "reviews" | "assets" | "preferences";
let database: Promise<IDBDatabase> | undefined;

function openDatabase(): Promise<IDBDatabase> {
  if (!database) {
    database = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => {
        for (const store of [
          "holds",
          "reviews",
          "assets",
          "preferences",
        ] as Store[]) {
          if (!request.result.objectStoreNames.contains(store))
            request.result.createObjectStore(store, { keyPath: "id" });
        }
        if (
          event.oldVersion > 0 &&
          event.oldVersion < 3 &&
          request.transaction
        ) {
          for (const [store, kind] of [
            ["holds", "hold"],
            ["reviews", "review"],
          ] as const) {
            const cursorRequest = request.transaction
              .objectStore(store)
              .openCursor();
            cursorRequest.onsuccess = () => {
              const cursor = cursorRequest.result;
              if (!cursor) return;
              let record = cursor.value;
              if (event.oldVersion < 2)
                record = migrateClimbingMetadata(record, kind);
              if (kind === "hold") record = migratePrintingMetadata(record);
              cursor.update(record);
              cursor.continue();
            };
          }
        }
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => {
          request.result.close();
          database = undefined;
        };
        resolve(request.result);
      };
      request.onerror = () => {
        database = undefined;
        reject(
          new Error(
            "Browser storage is unavailable. Enable site storage to use uploads, reviews, and saved holds.",
          ),
        );
      };
      request.onblocked = () => {
        database = undefined;
        reject(
          new Error(
            "Close other Garage Holds tabs and reload to finish updating browser storage.",
          ),
        );
      };
    });
  }
  return database;
}

async function readAll<T>(store: Store): Promise<T[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db
      .transaction(store, "readonly")
      .objectStore(store)
      .getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () =>
      reject(new Error("Could not read your browser library."));
  });
}

async function write(
  stores: Store[],
  operation: (transaction: IDBTransaction) => void,
): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(stores, "readwrite");
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(
        new Error(
          "Could not save to this browser. Storage may be full; try smaller files.",
        ),
      );
    transaction.onabort = () =>
      reject(
        new Error("Nothing was saved. Storage may be full; try smaller files."),
      );
    try {
      operation(transaction);
    } catch (error) {
      transaction.abort();
      reject(error);
    }
  });
}

export async function loadLibrary() {
  const [holds, reviews, preferences] = await Promise.all([
    readAll<Hold>("holds"),
    readAll<Review>("reviews"),
    readAll<{ id: string; values: string[] }>("preferences"),
  ]);
  return {
    holds,
    reviews,
    savedIds:
      preferences.find((preference) => preference.id === "saved")?.values ?? [],
  };
}

export async function saveHold(
  hold: Hold,
  assets: { id: string; file: File }[],
) {
  await write(["holds", "assets"], (transaction) => {
    transaction.objectStore("holds").put(hold);
    for (const asset of assets) transaction.objectStore("assets").put(asset);
  });
}

export async function saveReview(review: Review) {
  await write(["reviews"], (transaction) =>
    transaction.objectStore("reviews").put(review),
  );
}

export async function saveFavorites(values: string[]) {
  await write(["preferences"], (transaction) =>
    transaction.objectStore("preferences").put({ id: "saved", values }),
  );
}

export async function getAsset(id: string): Promise<File> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db
      .transaction("assets", "readonly")
      .objectStore("assets")
      .get(id);
    request.onsuccess = () =>
      request.result?.file
        ? resolve(request.result.file)
        : reject(new Error("This file is missing from browser storage."));
    request.onerror = () => reject(new Error("Could not load this file."));
  });
}
