import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/lib/supabase/database.types";

// Connects the integration tests to a running local Supabase stack
// (`npm run db:start`). Nothing here touches the hosted project: the URL is
// taken from the environment or from `supabase status`, never from a default
// that could point anywhere else.

export type Client = SupabaseClient<Database>;

interface Stack {
  url: string;
  publishableKey: string;
  secretKey: string;
}

let stack: Stack | undefined;

export function localStack(): Stack {
  if (stack) return stack;
  const env = {
    ...statusVariables(),
    ...process.env,
  };
  const url = env.SUPABASE_URL ?? env.API_URL;
  const publishableKey =
    env.SUPABASE_PUBLISHABLE_KEY ?? env.PUBLISHABLE_KEY ?? env.ANON_KEY;
  const secretKey =
    env.SUPABASE_SECRET_KEY ?? env.SECRET_KEY ?? env.SERVICE_ROLE_KEY;
  if (!url || !publishableKey || !secretKey)
    throw new Error(
      "No local Supabase stack found. Run `npm run db:start` first, or set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, and SUPABASE_SECRET_KEY.",
    );
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url))
    throw new Error(
      `Refusing to run integration tests against ${url}: only a local stack is allowed.`,
    );
  stack = { url, publishableKey, secretKey };
  return stack;
}

// `supabase status -o env` prints KEY="value" lines for the running stack.
function statusVariables(): Record<string, string> {
  if (process.env.SUPABASE_URL) return {};
  let output: string;
  try {
    output = execFileSync("npx", ["supabase", "status", "-o", "env"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return {};
  }
  const variables: Record<string, string> = {};
  for (const line of output.split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)="?([^"]*)"?$/);
    if (match) variables[match[1]] = match[2];
  }
  return variables;
}

export function anonymousClient(): Client {
  const { url, publishableKey } = localStack();
  return createClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function adminClient(): Client {
  const { url, secretKey } = localStack();
  return createClient<Database>(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface TestUser {
  id: string;
  email: string;
  client: Client;
}

// Creates a confirmed user through the admin API and returns a client signed
// in as that user, so every query runs under row-level security as they
// would from the app. The profile row comes from the sign-up trigger.
export async function createUser(admin: Client, label: string) {
  const suffix = randomBytes(4).toString("hex");
  const email = `${label}-${suffix}@example.com`;
  const password = randomBytes(12).toString("hex");
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("User creation failed");
  const client = anonymousClient();
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return { id: data.user.id, email, client } satisfies TestUser;
}

export async function deleteUser(admin: Client, user: TestUser) {
  await user.client.auth.signOut();
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) throw error;
}
