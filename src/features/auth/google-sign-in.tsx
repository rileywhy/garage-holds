"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Script from "next/script";
import { LoaderCircle } from "lucide-react";
import { trackEvent } from "@/features/analytics/events";
import { signInWithGoogleToken } from "./actions";
import { createGoogleNonce } from "./google-nonce";

// The parts of Google Identity Services this button uses.
interface GoogleIdentity {
  accounts: {
    id: {
      initialize(config: {
        client_id: string;
        callback: (response: { credential: string }) => void;
        nonce: string;
        context: "signin";
        ux_mode: "popup";
        itp_support: boolean;
      }): void;
      renderButton(
        parent: HTMLElement,
        options: {
          type: "standard";
          theme: "outline" | "filled_black";
          size: "large";
          text: "continue_with";
          shape: "rectangular";
          logo_alignment: "center";
          width: number;
        },
      ): void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

const COULD_NOT_LOAD =
  "Google sign-in couldn't load. Check your connection or use an email code.";

function darkTheme() {
  const chosen = document.documentElement.dataset.theme;
  if (chosen === "dark" || chosen === "light") return chosen === "dark";
  return matchMedia("(prefers-color-scheme: dark)").matches;
}

// Google's own "Continue with Google" button. It opens Google's popup from
// garageholds.com, so the consent screen names this site, and passes the ID
// token it returns to the server, which signs in with Supabase.
export function GoogleSignIn({
  clientId,
  next,
}: {
  clientId: string;
  next: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const parent = container.current;
    if (!loaded || !parent || !window.google) return;
    const google = window.google;
    let cancelled = false;
    void createGoogleNonce().then(({ raw, hashed }) => {
      if (cancelled) return;
      google.accounts.id.initialize({
        client_id: clientId,
        nonce: hashed,
        context: "signin",
        ux_mode: "popup",
        itp_support: true,
        callback: ({ credential }) => {
          setError("");
          trackEvent({ name: "sign_in", method: "google" });
          startTransition(async () => {
            const result = await signInWithGoogleToken(credential, raw, next);
            if (result?.error) setError(result.error);
          });
        },
      });
      google.accounts.id.renderButton(parent, {
        type: "standard",
        theme: darkTheme() ? "filled_black" : "outline",
        size: "large",
        text: "continue_with",
        shape: "rectangular",
        logo_alignment: "center",
        // Google draws the button at a fixed width between 200 and 400 px.
        width: Math.max(200, Math.min(400, parent.clientWidth)),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [loaded, clientId, next]);

  return (
    <>
      <Script
        src="https://accounts.google.com/gsi/client"
        onReady={() => setLoaded(true)}
        onError={() => setError(COULD_NOT_LOAD)}
      />
      <div
        ref={container}
        className="google-button"
        aria-busy={pending || !loaded}
      />
      {pending && (
        <p className="small-note" role="status">
          <LoaderCircle size={14} className="spin" /> Signing you in…
        </p>
      )}
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
