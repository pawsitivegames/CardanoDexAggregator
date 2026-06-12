import { connect } from "net";

export function waitUntilUsed(port: number, timeoutMs: number): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function tryConnect() {
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Port ${port} not available after ${timeoutMs}ms`));
        return;
      }
      const socket = connect(port, "127.0.0.1", () => {
        socket.destroy();
        resolve();
      });
      socket.on("error", () => {
        socket.destroy();
        setTimeout(tryConnect, 200);
      });
    }
    tryConnect();
  });
}
