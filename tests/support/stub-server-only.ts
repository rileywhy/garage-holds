// Lets a test render a client component in Node. The preset actions reach
// the server-only Supabase client; Next gives the browser a stub for that
// module, and this does the same here. Import this before dynamically
// importing the component, so the stub is in place when its graph loads.
import { register } from "node:module";

register(
  "data:text/javascript," +
    encodeURIComponent(`
export async function resolve(specifier, context, next) {
  if (specifier === "server-only")
    return { url: "data:text/javascript,", shortCircuit: true };
  return next(specifier, context);
}`),
);
