import { useEffect, useRef, useState } from "react";
import type React from "react";
import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useData } from "../lib/data";
import { apiFetch, type ApiError } from "../lib/api";
import { Button } from "../ui/Button";

type ShellProps = {
  title?: string;
  children: React.ReactNode;
};

export function Shell(props: ShellProps): React.JSX.Element {
  const auth = useAuth();
  const data = useData();
  const { snapshot } = data;
  const [wallpaperUrl, setWallpaperUrl] = useState<string | null>(null);
  const [wallpaperCacheCount, setWallpaperCacheCount] = useState<number | null>(null);
  const [wallpaperMode, setWallpaperMode] = useState<"online" | "local" | "off">(() => {
    const raw = localStorage.getItem("ui:wallpaperMode");
    return raw === "local" || raw === "off" ? raw : "online";
  });
  const [glassAlpha, setGlassAlpha] = useState(0.5);
  const wallpaperObjectUrlRef = useRef<string | null>(null);
  const [fatalWs400, setFatalWs400] = useState<{ active: boolean; msg: string }>({ active: false, msg: "" });
  const [recoveryCode, setRecoveryCode] = useState("");
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);

  const [shutdownLoading, setShutdownLoading] = useState(false);
  const [shutdownError, setShutdownError] = useState<string | null>(null);

  useEffect(() => {
    if (fatalWs400.active) return;
    if (!snapshot?.bot?.startedAt) return;
    const top = data.logs[data.logs.length - 1];
    if (!top) return;
    if (top.message.includes("Unexpected server response: 400")) setFatalWs400({ active: true, msg: top.message });
  }, [data.logs, fatalWs400.active, snapshot?.bot?.startedAt]);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        if (!("caches" in window)) return;
        const cache = await caches.open("farm-wallpaper-v1");
        let keys = await cache.keys();
        setWallpaperCacheCount(keys.length);

        const onlineKeys = keys.filter((k) => k.url.includes("/__wallpaper/online/"));
        const localKeys = keys.filter((k) => k.url.includes("/__wallpaper/local/"));

        if (wallpaperMode === "off") {
          if (wallpaperObjectUrlRef.current) URL.revokeObjectURL(wallpaperObjectUrlRef.current);
          wallpaperObjectUrlRef.current = null;
          setWallpaperUrl(null);
          return;
        }

        if (wallpaperMode === "online" && onlineKeys.length < 15) {
          const res = await fetch(`/api/ui/wallpaper/random?t=${Date.now()}`, { cache: "no-store" });
          if (res.ok) {
            const blob = await res.blob();
            const key = new Request(`/__wallpaper/online/${Date.now()}`, { method: "GET" });
            await cache.put(
              key,
              new Response(blob, { headers: { "content-type": res.headers.get("content-type") ?? "image/jpeg" } })
            );
            keys = await cache.keys();
            setWallpaperCacheCount(keys.length);
          }
        }

        const pickFrom = wallpaperMode === "local" ? localKeys : onlineKeys;
        const fallbackPickFrom = pickFrom.length ? pickFrom : keys;
        if (!fallbackPickFrom.length) return;
        const pick = fallbackPickFrom[Math.floor(Math.random() * fallbackPickFrom.length)];
        const cached = await cache.match(pick);
        if (!cached) return;
        const blob = await cached.blob();
        const obj = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(obj);
          return;
        }
        if (wallpaperObjectUrlRef.current) URL.revokeObjectURL(wallpaperObjectUrlRef.current);
        wallpaperObjectUrlRef.current = obj;
        setWallpaperUrl(obj);
      } catch {
        return;
      }
    }

    void load();
    return () => {
      cancelled = true;
      if (wallpaperObjectUrlRef.current) URL.revokeObjectURL(wallpaperObjectUrlRef.current);
      wallpaperObjectUrlRef.current = null;
    };
  }, [wallpaperMode]);

  useEffect(() => {
    const onStorage = (evt: StorageEvent) => {
      if (evt.key !== "ui:wallpaperMode") return;
      const raw = localStorage.getItem("ui:wallpaperMode");
      setWallpaperMode(raw === "local" || raw === "off" ? raw : "online");
    };
    const onCustom = () => {
      const raw = localStorage.getItem("ui:wallpaperMode");
      setWallpaperMode(raw === "local" || raw === "off" ? raw : "online");
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("ui:wallpaper", onCustom as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("ui:wallpaper", onCustom as EventListener);
    };
  }, []);

  async function restartBot(): Promise<void> {
    setRecoveryError(null);
    setRecoveryLoading(true);
    try {
      await apiFetch("/api/bot/start", { method: "POST", token: auth.token, body: { code: recoveryCode } });
      setFatalWs400({ active: false, msg: "" });
      setRecoveryCode("");
    } catch (e: unknown) {
      const err = e as ApiError;
      setRecoveryError(err.message ?? err.code ?? "启动失败");
    } finally {
      setRecoveryLoading(false);
    }
  }

  useEffect(() => {
    const raw = localStorage.getItem("ui:glassAlpha");
    if (!raw) return;
    const v = Number(raw);
    if (!Number.isFinite(v)) return;
    setGlassAlpha(Math.min(0.9, Math.max(0.3, v)));
  }, []);

  useEffect(() => {
    const a = Math.min(0.9, Math.max(0.3, glassAlpha));
    const a2 = Math.min(0.85, Math.max(0.2, a - 0.1));
    document.documentElement.style.setProperty("--glass-alpha", String(a));
    document.documentElement.style.setProperty("--glass-alpha2", String(a2));
    localStorage.setItem("ui:glassAlpha", String(a));
  }, [glassAlpha]);

  async function shutdownApp(): Promise<void> {
    setShutdownError(null);
    setShutdownLoading(true);
    try {
      await apiFetch("/api/system/shutdown", { method: "POST", token: auth.token });
    } catch (e: unknown) {
      const err = e as ApiError;
      setShutdownError(err.message ?? err.code ?? "退出失败");
    } finally {
      setShutdownLoading(false);
    }
  }

  return (
    <div className="appRoot" style={wallpaperUrl ? { backgroundImage: `url(${wallpaperUrl})` } : undefined}>
      <div className="shell">
        <aside className="glass nav">
          <div className="navBrand">
            <Link to="/" className="brand">
              <div className="brandText">
                <div className="brandName">Farm Console</div>
                <div className="brandSub">WebUI 管理台</div>
              </div>
            </Link>
          </div>

          <nav className="navLinks">
            <NavLink to="/" end className={({ isActive }) => (isActive ? "navLink active" : "navLink")}>
              数据 & 日志
            </NavLink>
            <NavLink to="/settings" className={({ isActive }) => (isActive ? "navLink active" : "navLink")}>
              配置
            </NavLink>
          </nav>

          <div className="navPanel">
            <div className="navPanelHead">
              <div className="navPanelTitle">UI 透明度</div>
              <div className="navPanelSub">{Math.round(glassAlpha * 100)}%</div>
            </div>
            <input
              className="range"
              type="range"
              min={30}
              max={90}
              step={1}
              value={Math.round(glassAlpha * 100)}
              onChange={(e) => setGlassAlpha(Number(e.target.value) / 100)}
            />
          </div>

          <div className="navPanel">
            <div className="navPanelHead">
              <div className="navPanelTitle">壁纸缓存</div>
              <div className="navPanelSub">{wallpaperCacheCount == null ? "—" : `${wallpaperCacheCount} 张`}</div>
            </div>
            <div className="muted" style={{ paddingTop: 6 }}>
              {wallpaperMode === "off" ? "已关闭" : wallpaperMode === "local" ? "本地壁纸" : "在线壁纸"}
            </div>
          </div>

          <div className="navFooter">
            <div className="chip">
              <span className="dot dot-accent" />
              <span>已登录</span>
            </div>
            <button className="navLogout" onClick={auth.logout}>
              退出登录
            </button>
          </div>
        </aside>

        <main className="main">
          <header className="glass topbar">
            <div className="topbarTitle">
              <div className="topbarH">{props.title ?? "控制台"}</div>
              <div className="topbarHint">
                <span className="chip">
                  <span className="dot dot-blue" />
                  <span>WebSocket 实时推送</span>
                </span>
                <Button variant="danger" size="sm" onClick={shutdownApp} disabled={shutdownLoading}>
                  {shutdownLoading ? "退出中..." : "退出程序"}
                </Button>
                {shutdownError ? <span className="chip">{shutdownError}</span> : null}
              </div>
            </div>
          </header>

          <div className="content">{props.children}</div>
        </main>
      </div>

      {fatalWs400.active ? (
        <div className="fatalOverlay" role="dialog" aria-modal="true">
          <div className="glass fatalCard">
            <div className="fatalHead">
              <div className="fatalIcon" />
              <div className="fatalTitle">连接异常：WS 400</div>
            </div>
            <div className="fatalMsg mono">{fatalWs400.msg}</div>
            <div className="fatalHint muted">系统已自动停止 bot。请输入新的 code 后重新启动。</div>
            <div className="fatalActions">
              <input
                className="fieldInput fatalInput"
                value={recoveryCode}
                onChange={(e) => setRecoveryCode(e.target.value)}
                placeholder="输入新 code"
                disabled={recoveryLoading}
              />
              <Button size="sm" variant="primary" onClick={restartBot} disabled={recoveryLoading || recoveryCode.trim().length < 5}>
                {recoveryLoading ? "启动中..." : "重新启动"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setFatalWs400({ active: false, msg: "" })} disabled={recoveryLoading}>
                关闭提示
              </Button>
            </div>
            {recoveryError ? <div className="formError">{recoveryError}</div> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
