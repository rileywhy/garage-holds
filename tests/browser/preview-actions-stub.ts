// Stands in for src/features/holds/preview-actions.ts in the test page,
// which has no server to call: the fresh link is the fixture's working one.
export async function freshPreviewUrl(): Promise<string | null> {
  return "/hold.stl";
}
