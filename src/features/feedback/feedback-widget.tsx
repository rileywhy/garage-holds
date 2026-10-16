"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Flag, LoaderCircle, MessageSquare, Send, X } from "lucide-react";
import { FieldErrors } from "@/components/form-fields";
import { trackEvent } from "@/features/analytics/events";
import { submitFeedback, type FeedbackState } from "./actions";
import { MAX_BODY } from "./validation";

// A button that opens a small dialog: bug reports and general feedback from
// the footer, or a report about one design from its page, which is the
// same form with the first line filled in.
export function FeedbackWidget({
  label = "Report a bug or send feedback",
  prefill = "",
  icon = "feedback",
  signedIn = false,
}: {
  label?: string;
  prefill?: string;
  icon?: "feedback" | "report";
  signedIn?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState("");
  // Counts openings. The form below is keyed on it, so each opening gets a
  // fresh form and a fresh action state instead of last time's "Sent".
  const [opening, setOpening] = useState(0);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      setPage(window.location.pathname + window.location.search);
      element.showModal();
    } else if (!open && element.open) element.close();
  }, [open]);

  const Icon = icon === "report" ? Flag : MessageSquare;
  return (
    <>
      <button
        type="button"
        className="feedback-trigger"
        onClick={() => {
          setOpening((n) => n + 1);
          setOpen(true);
        }}
      >
        <Icon size={14} /> {label}
      </button>
      <dialog
        ref={dialog}
        className="feedback-dialog"
        aria-labelledby="feedback-heading"
        onClose={() => setOpen(false)}
      >
        <div className="feedback-dialog-head">
          <h2 id="feedback-heading">
            {icon === "report" ? "Report this design" : "Bug or feedback"}
          </h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Close"
            onClick={() => setOpen(false)}
          >
            <X size={16} />
          </button>
        </div>
        <FeedbackForm
          key={opening}
          icon={icon}
          page={page}
          prefill={prefill}
          signedIn={signedIn}
          close={() => setOpen(false)}
        />
      </dialog>
    </>
  );
}

function FeedbackForm({
  icon,
  page,
  prefill,
  signedIn,
  close,
}: {
  icon: "feedback" | "report";
  page: string;
  prefill: string;
  signedIn: boolean;
  close: () => void;
}) {
  const [state, action, pending] = useActionState<FeedbackState, FormData>(
    submitFeedback,
    { errors: [], sent: false },
  );

  useEffect(() => {
    if (state.sent)
      trackEvent({
        name: "feedback_sent",
        kind: icon === "report" ? "report" : "feedback",
      });
  }, [state.sent, icon]);

  return (
    <>
      {state.sent ? (
        <div className="feedback-sent" role="status">
          <p>
            <strong>Sent. Thank you.</strong>
          </p>
          <p className="small-note">
            It goes straight to the person running the site.
          </p>
          <button
            type="button"
            className="button button-outline"
            onClick={close}
          >
            Close
          </button>
        </div>
      ) : (
        <form action={action} className="feedback-form" noValidate>
          <input type="hidden" name="page" value={page} />
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            className="sr-only"
            aria-hidden
          />
          <label>
            <span>
              {icon === "report"
                ? "What is wrong with it?"
                : "What happened, or what would help?"}
            </span>
            <textarea
              name="body"
              rows={5}
              maxLength={MAX_BODY}
              required
              defaultValue={prefill}
              placeholder={
                icon === "report"
                  ? "Stolen model, broken file, wrong license, something else…"
                  : "Steps to reproduce help a lot."
              }
            />
          </label>
          {!signedIn && (
            <label>
              <span>How to reach you (optional)</span>
              <input
                type="text"
                name="contact"
                maxLength={120}
                placeholder="Email or a handle"
              />
            </label>
          )}
          <FieldErrors errors={state.errors} />
          <div className="feedback-actions">
            <button
              type="submit"
              className="button button-dark"
              disabled={pending}
            >
              {pending ? (
                <LoaderCircle size={16} className="spin" />
              ) : (
                <Send size={16} />
              )}{" "}
              {pending ? "Sending…" : "Send"}
            </button>
          </div>
        </form>
      )}
    </>
  );
}
