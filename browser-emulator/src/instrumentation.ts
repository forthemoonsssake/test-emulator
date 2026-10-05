import { isServerless } from "./lib/serverless";

export async function register() {
  // Only start the optional side-channel on a persistent Node server. Netlify
  // and other serverless hosts use the HTTP frame-polling transport instead.
  if (process.env.NEXT_RUNTIME === "nodejs" && !isServerless()) {
    const { startWsServer } = await import("./server/ws");
    startWsServer();
  }
}
