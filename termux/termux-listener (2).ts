import { execFile } from "node:child_process";
import { promisify } from "node:util";
import WebSocket, { WebSocketServer } from "ws";

const execFileAsync = promisify(execFile);

interface DialPayload {
  type: "dial";
  number: string;
}

interface AckPayload {
  type: "ack";
  action: "dial";
  number: string;
  status: "accepted";
}

interface ErrorPayload {
  type: "error";
  message: string;
}

type IncomingPayload = DialPayload | { type: "ping" };

type ManagedSocket = WebSocket & { isAlive?: boolean };

const port = Number(process.env.TERMUX_WS_PORT ?? "5001");
const pingIntervalMs = Number(process.env.TERMUX_WS_PING_INTERVAL_MS ?? "30000");


const wss = new WebSocketServer({ port });

// eslint-disable-next-line no-console
console.log(`Termux WebSocket listener waiting on ws://0.0.0.0:${port}`);

wss.on("connection", (socket, request) => {
  const managed = socket as ManagedSocket;

  managed.isAlive = true;

  managed.on("pong", () => {    managed.isAlive = true;
  });

  const heartbeat = setInterval(() => {
    if (managed.readyState !== WebSocket.OPEN) {
      return;
    }

    if (!managed.isAlive) {
      managed.terminate();
      return;
    }

    managed.isAlive = false;
    managed.ping();
  }, pingIntervalMs);

  managed.on("close", () => {
    clearInterval(heartbeat);
  });

  managed.on("message", async (raw) => {
    let payload: IncomingPayload | undefined;
    try {
      payload = JSON.parse(raw.toString()) as IncomingPayload;
    } catch (error) {
      managed.send(
        JSON.stringify({
          type: "error",
          message: `Invalid JSON payload: ${(error as Error).message}`,
        } satisfies ErrorPayload),
      );
      return;
    }

    if (payload.type === "ping") {
      managed.send(JSON.stringify({ type: "pong" }));
      return;
    }

    if (payload.type !== "dial" || typeof payload.number !== "string") {
      managed.send(
        JSON.stringify({
          type: "error",
          message: "Unsupported command received",
        } satisfies ErrorPayload),
      );
      return;
    }

    const sanitizedNumber = payload.number.trim();
    if (!sanitizedNumber) {
      managed.send(
        JSON.stringify({
          type: "error",
          message: "Dial command requires a non-empty number",
        } satisfies ErrorPayload),
      );
      return;
    }

    try {
      await execFileAsync("am", [
        "start",
        "-a",
        "android.intent.action.DIAL",
        "-d",
        `tel:${sanitizedNumber}`,
      ]);

      managed.send(
        JSON.stringify({
          type: "ack",
          action: "dial",
          number: sanitizedNumber,
          status: "accepted",
        } satisfies AckPayload),
      );
    } catch (error) {
      managed.send(
        JSON.stringify({
          type: "error",
          message: `Failed to execute dial intent: ${(error as Error).message}`,
        } satisfies ErrorPayload),
      );
    }
  });
});
