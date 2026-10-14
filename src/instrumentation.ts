import type { Instrumentation } from "next";
import { notifyOwnerOnce } from "@/lib/alerts";
import { formatServerError, serverErrorKey } from "@/lib/error-reports";

// Next.js calls this for every unhandled error in a Server Component, route
// handler, server function, or the proxy. The owner gets one line per
// distinct error per minute; headers and bodies are never read.
export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  await notifyOwnerOnce(
    serverErrorKey(error, context),
    formatServerError(error, request, context),
  );
};
