// Browser-to-R2 PUTs against signed URLs, a few at a time, so one large
// file never blocks photos. Returns the names of files that did not land.

const PARALLEL_UPLOADS = 3;

export async function uploadAll(jobs: { url: string; file: File }[]) {
  const queue = [...jobs];
  const failed: string[] = [];
  await Promise.all(
    Array.from({ length: PARALLEL_UPLOADS }, async () => {
      for (let job = queue.shift(); job; job = queue.shift()) {
        try {
          const response = await fetch(job.url, {
            method: "PUT",
            body: job.file,
            headers: {
              "Content-Type": job.file.type || "application/octet-stream",
            },
          });
          if (!response.ok) failed.push(job.file.name);
        } catch {
          failed.push(job.file.name);
        }
      }
    }),
  );
  return failed;
}
