"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { SAMPLE_HOLDS } from "@/features/holds/sample-data";
import type { Hold, Review } from "@/features/holds/types";
import {
  loadLibrary,
  saveFavorites,
  saveHold,
  saveReview,
} from "@/lib/local-repository";
import { validateHold, validateReview } from "@/features/holds/validation";

interface LibraryContextValue {
  holds: Hold[];
  reviews: Review[];
  savedIds: string[];
  ready: boolean;
  storageError: string;
  addHold: (hold: Hold, assets: { id: string; file: File }[]) => Promise<void>;
  addReview: (review: Review) => Promise<void>;
  toggleSaved: (id: string) => Promise<void>;
}
const LibraryContext = createContext<LibraryContextValue | null>(null);

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [holds, setHolds] = useState(SAMPLE_HOLDS);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const savedRef = useRef<string[]>([]);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState("");

  useEffect(() => {
    let active = true;
    loadLibrary()
      .then((data) => {
        if (!active) return;
        setHolds([...data.holds, ...SAMPLE_HOLDS]);
        setReviews(data.reviews);
        setSavedIds(data.savedIds);
        savedRef.current = data.savedIds;
        setReady(true);
      })
      .catch((error: Error) => {
        if (active) {
          setStorageError(error.message);
          setReady(true);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  async function addHold(hold: Hold, assets: { id: string; file: File }[]) {
    const errors = validateHold(hold);
    if (errors.length) throw new Error(errors.join(" "));
    await saveHold(hold, assets);
    setHolds((current) => [hold, ...current]);
  }
  async function addReview(review: Review) {
    const errors = validateReview(review);
    if (errors.length) throw new Error(errors.join(" "));
    await saveReview(review);
    setReviews((current) => [review, ...current]);
  }
  function toggleSaved(id: string) {
    const operation = saveQueue.current.then(async () => {
      const next = savedRef.current.includes(id)
        ? savedRef.current.filter((saved) => saved !== id)
        : [...savedRef.current, id];
      await saveFavorites(next);
      savedRef.current = next;
      setSavedIds(next);
    });
    saveQueue.current = operation.catch(() => undefined);
    return operation;
  }

  return (
    <LibraryContext.Provider
      value={{
        holds,
        reviews,
        savedIds,
        ready,
        storageError,
        addHold,
        addReview,
        toggleSaved,
      }}
    >
      {children}
    </LibraryContext.Provider>
  );
}

export function useLibrary() {
  const context = useContext(LibraryContext);
  if (!context)
    throw new Error("useLibrary must be used within LibraryProvider");
  return context;
}
