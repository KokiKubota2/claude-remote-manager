export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { jobManager } = await import("./lib/server/job-manager");
    jobManager();
  }
}
