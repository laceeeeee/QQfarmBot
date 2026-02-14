import { useEffect, useMemo, useRef, useState } from "react";

export type WsMessage =
  | { type: "log:init"; data: unknown[] }
  | { type: "log:append"; data: unknown }
  | { type: "snapshot"; data: unknown }
  | { type: "pong" };

type WsState = {
  connected: boolean;
  lastMessage: WsMessage | null;
};

export function useAdminWs(token: string | null): WsState {
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WsMessage | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const pingTimerRef = useRef<number | null>(null);
  const closingRef = useRef(false);
  const wsUrlRef = useRef<string | null>(null);

  const wsUrl = useMemo(() => {
    if (!token) return null;
    const scheme = location.protocol === "https:" ? "wss" : "ws";
    return `${scheme}://${location.host}/ws?token=${encodeURIComponent(token)}`;
  }, [token]);

  useEffect(() => {
    wsUrlRef.current = wsUrl;
    closingRef.current = false;
    if (!wsUrl) {
      if (reconnectTimerRef.current !== null) window.clearTimeout(reconnectTimerRef.current);
      if (pingTimerRef.current !== null) window.clearInterval(pingTimerRef.current);
      reconnectTimerRef.current = null;
      pingTimerRef.current = null;
      reconnectAttemptRef.current = 0;
      try {
        wsRef.current?.close();
      } catch {
        return;
      }
      wsRef.current = null;
      return;
    }

    const scheduleReconnect = (): void => {
      if (!wsUrlRef.current || closingRef.current) return;
      if (reconnectTimerRef.current !== null) return;
      const attempt = reconnectAttemptRef.current;
      const delayMs = Math.min(15_000, 1000 * Math.pow(2, Math.min(attempt, 4)));
      reconnectTimerRef.current = window.setTimeout(() => {
        reconnectTimerRef.current = null;
        reconnectAttemptRef.current = attempt + 1;
        connect();
      }, delayMs);
    };

    const startPing = (ws: WebSocket): void => {
      if (pingTimerRef.current !== null) window.clearInterval(pingTimerRef.current);
      pingTimerRef.current = window.setInterval(() => {
        try {
          if (ws.readyState !== WebSocket.OPEN) return;
          ws.send(JSON.stringify({ type: "ping" }));
        } catch {
          return;
        }
      }, 25_000);
    };

    const connect = (): void => {
      if (!wsUrlRef.current || closingRef.current) return;
      try {
        const ws = new WebSocket(wsUrlRef.current);
        wsRef.current = ws;

        ws.onopen = () => {
          reconnectAttemptRef.current = 0;
          setConnected(true);
        };
        ws.onclose = () => {
          setConnected(false);
          scheduleReconnect();
        };
        ws.onerror = () => {
          setConnected(false);
          scheduleReconnect();
        };
        ws.onmessage = (evt) => {
          try {
            const msg = JSON.parse(evt.data) as WsMessage;
            setLastMessage(msg);
          } catch {
            return;
          }
        };

        startPing(ws);
      } catch {
        scheduleReconnect();
      }
    };

    connect();

    return () => {
      closingRef.current = true;
      if (reconnectTimerRef.current !== null) window.clearTimeout(reconnectTimerRef.current);
      if (pingTimerRef.current !== null) window.clearInterval(pingTimerRef.current);
      reconnectTimerRef.current = null;
      pingTimerRef.current = null;
      try {
        wsRef.current?.close();
      } catch {
        return;
      }
      wsRef.current = null;
    };
  }, [wsUrl]);

  return { connected, lastMessage };
}
