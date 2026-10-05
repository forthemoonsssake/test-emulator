export async function register() {
  // Only run inside the Node.js server runtime (not edge / client builds).
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startWsServer } = await import("./server/ws");
    startWsServer();
  }
}
