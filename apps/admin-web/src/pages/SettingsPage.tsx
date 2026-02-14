import { useCallback, useEffect, useMemo, useState } from "react";
import type React from "react";
import { useAuth } from "../lib/auth";
import { apiFetch, type ApiError } from "../lib/api";
import { GlassCard } from "../ui/GlassCard";
import { Button } from "../ui/Button";
import { useData } from "../lib/data";

type Config = {
  selfIntervalSecMin: number;
  selfIntervalSecMax: number;
  friendIntervalSecMin: number;
  friendIntervalSecMax: number;
  platform: "qq" | "wx";
  automation?: {
    autoHarvest: boolean;
    autoFertilize: boolean;
    autoWater: boolean;
    autoWeed: boolean;
    autoBug: boolean;
    autoPlant: boolean;
    autoFriendFarm: boolean;
    autoTask: boolean;
    autoSell: boolean;
  };
  farming?: {
    forceLowestLevelCrop: boolean;
    forceLatestLevelCrop?: boolean;
    fixedSeedId?: number;
  };
  ui?: {
    wallpaper?: {
      sync: boolean;
      mode: "local" | "off";
    };
  };
  smtp?: {
    enabled: boolean;
    host: string;
    port: number;
    secure: boolean;
    user: string;
    passSet: boolean;
    from: string;
    to: string;
  };
};
type ConfigReply = { config: Config };

/**
 * 表单提示图标。
 */
function Hint(props: { text: string }): React.JSX.Element {
  return <span className="fieldHint" title={props.text} aria-label={props.text} />;
}

/**
 * 设置页：壁纸 + 配置导入导出 + 邮件通知的合并视图。
 */
export function SettingsPage(): React.JSX.Element {
  const auth = useAuth();
  const { snapshot } = useData();

  const [loading, setLoading] = useState(false);
  const [loadedConfig, setLoadedConfig] = useState<Config | null>(null);

  const [smtpSaving, setSmtpSaving] = useState(false);
  const [smtpError, setSmtpError] = useState<string | null>(null);
  const [smtpOk, setSmtpOk] = useState<string | null>(null);

  const [wallpaperSaving, setWallpaperSaving] = useState(false);
  const [wallpaperError, setWallpaperError] = useState<string | null>(null);
  const [wallpaperOk, setWallpaperOk] = useState<string | null>(null);

  const [configIoSaving, setConfigIoSaving] = useState(false);
  const [configIoError, setConfigIoError] = useState<string | null>(null);
  const [configIoOk, setConfigIoOk] = useState<string | null>(null);

  const [platform, setPlatform] = useState<"qq" | "wx">("qq");
  const [selfIntervalSecMin, setSelfIntervalSecMin] = useState(10);
  const [selfIntervalSecMax, setSelfIntervalSecMax] = useState(10);
  const [friendIntervalSecMin, setFriendIntervalSecMin] = useState(1);
  const [friendIntervalSecMax, setFriendIntervalSecMax] = useState(1);

  const [smtpEnabled, setSmtpEnabled] = useState(false);
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [smtpPassSet, setSmtpPassSet] = useState(false);
  const [smtpFrom, setSmtpFrom] = useState("");
  const [smtpTo, setSmtpTo] = useState("");

  const [wallpaperMode, setWallpaperMode] = useState<"local" | "off">("local");

  const canSaveSmtp = useMemo(() => {
    if (smtpSaving) return false;
    if (!smtpEnabled) return true;
    if (!smtpHost.trim()) return false;
    if (!smtpPort) return false;
    if (!smtpFrom.trim()) return false;
    if (!smtpTo.trim()) return false;
    return true;
  }, [smtpEnabled, smtpFrom, smtpHost, smtpPort, smtpSaving, smtpTo]);

  const canChangeWallpaper = useMemo(() => !wallpaperSaving && !loading, [loading, wallpaperSaving]);
  const canUseConfigIo = useMemo(() => !configIoSaving && !loading, [configIoSaving, loading]);

  /**
   * 将服务端配置同步到本地表单状态。
   */
  const syncFormWithConfig = useCallback((config: Config): void => {
    setLoadedConfig(config);
    setPlatform(config.platform);
    setSelfIntervalSecMin(config.selfIntervalSecMin);
    setSelfIntervalSecMax(config.selfIntervalSecMax);
    setFriendIntervalSecMin(config.friendIntervalSecMin);
    setFriendIntervalSecMax(config.friendIntervalSecMax);
    const smtp = config.smtp;
    setSmtpEnabled(Boolean(smtp?.enabled));
    setSmtpHost(smtp?.host ?? "");
    setSmtpPort(smtp?.port ?? 587);
    setSmtpSecure(Boolean(smtp?.secure));
    setSmtpUser(smtp?.user ?? "");
    setSmtpPass("");
    setSmtpPassSet(Boolean(smtp?.passSet));
    setSmtpFrom(smtp?.from ?? "");
    setSmtpTo(smtp?.to ?? "");
    const ui = config.ui?.wallpaper;
    setWallpaperMode(ui?.mode === "off" ? "off" : "local");
  }, []);

  /**
   * 拉取服务器配置并同步到本地表单状态。
   */
  const load = useCallback(async (): Promise<void> => {
    setSmtpError(null);
    setSmtpOk(null);
    setWallpaperError(null);
    setWallpaperOk(null);
    setLoading(true);
    try {
      const res = await apiFetch<ConfigReply>("/api/config", { token: auth.token });
      syncFormWithConfig(res.config);
    } catch (e: unknown) {
      const err = e as ApiError;
      setSmtpError(err.code ?? "加载失败");
      setWallpaperError(err.code ?? "加载失败");
    } finally {
      setLoading(false);
    }
  }, [auth.token, syncFormWithConfig]);

  /**
   * 保存 SMTP 邮件通知配置。
   */
  const saveSmtp = useCallback(async (): Promise<void> => {
    setSmtpError(null);
    setSmtpOk(null);
    setSmtpSaving(true);
    try {
      const base = loadedConfig ?? {
        platform,
        selfIntervalSecMin,
        selfIntervalSecMax,
        friendIntervalSecMin,
        friendIntervalSecMax,
      };
      const body: Omit<Config, "smtp"> & { smtp: Omit<NonNullable<Config["smtp"]>, "passSet"> & { pass?: string } } = {
        platform: base.platform,
        selfIntervalSecMin: base.selfIntervalSecMin,
        selfIntervalSecMax: base.selfIntervalSecMax,
        friendIntervalSecMin: base.friendIntervalSecMin,
        friendIntervalSecMax: base.friendIntervalSecMax,
        ui: base.ui,
        smtp: {
          enabled: smtpEnabled,
          host: smtpHost,
          port: smtpPort,
          secure: smtpSecure,
          user: smtpUser,
          pass: smtpPass,
          from: smtpFrom,
          to: smtpTo,
        },
      };
      const res = await apiFetch<ConfigReply>("/api/config", { method: "PUT", token: auth.token, body });
      syncFormWithConfig(res.config);
      setSmtpOk("已保存");
    } catch (e: unknown) {
      const err = e as ApiError;
      setSmtpError(err.message ?? err.code ?? "保存失败");
    } finally {
      setSmtpSaving(false);
    }
  }, [
    auth.token,
    friendIntervalSecMax,
    friendIntervalSecMin,
    loadedConfig,
    platform,
    selfIntervalSecMax,
    selfIntervalSecMin,
    smtpEnabled,
    smtpFrom,
    smtpHost,
    smtpPass,
    smtpPort,
    smtpSecure,
    smtpTo,
    smtpUser,
    syncFormWithConfig,
  ]);

  /**
   * 保存壁纸模式并广播到 UI。
   */
  const saveWallpaperConfig = useCallback(
    async (next: { mode: "local" | "off" }): Promise<void> => {
      setWallpaperError(null);
      setWallpaperOk(null);
      setWallpaperSaving(true);
      try {
        const base = loadedConfig ?? {
          platform,
          selfIntervalSecMin,
          selfIntervalSecMax,
          friendIntervalSecMin,
          friendIntervalSecMax,
        };
        const body: Omit<Config, "smtp"> = {
          platform: base.platform,
          selfIntervalSecMin: base.selfIntervalSecMin,
          selfIntervalSecMax: base.selfIntervalSecMax,
          friendIntervalSecMin: base.friendIntervalSecMin,
          friendIntervalSecMax: base.friendIntervalSecMax,
          ui: { wallpaper: { sync: true, mode: next.mode } },
        };
        const res = await apiFetch<ConfigReply>("/api/config", { method: "PUT", token: auth.token, body });
        syncFormWithConfig(res.config);
        const ui = res.config.ui?.wallpaper;
        const mode: "local" | "off" = ui?.mode === "off" ? "off" : "local";
        window.dispatchEvent(new CustomEvent("ui:wallpaper", { detail: { mode } }));
        setWallpaperOk("已保存");
      } catch (e: unknown) {
        const err = e as ApiError;
        setWallpaperError(err.message ?? err.code ?? "保存失败");
      } finally {
        setWallpaperSaving(false);
      }
    },
    [
      auth.token,
      friendIntervalSecMax,
      friendIntervalSecMin,
      loadedConfig,
      platform,
      selfIntervalSecMax,
      selfIntervalSecMin,
      syncFormWithConfig,
    ]
  );

  /**
   * 导入本地壁纸到浏览器缓存。
   */
  const onPickLocalWallpaper = useCallback(
    async (files: FileList | null): Promise<void> => {
      try {
        if (!files?.length) return;
        if (!("caches" in window)) return;
        const cache = await caches.open("farm-wallpaper-v1");
        const now = Date.now();
        const list = Array.from(files).slice(0, 20);
        for (let i = 0; i < list.length; i++) {
          const f = list[i];
          if (!f.type.startsWith("image/")) continue;
          const key = new Request(`/__wallpaper/local/${now}-${i}`, { method: "GET" });
          await cache.put(key, new Response(f, { headers: { "content-type": f.type || "image/jpeg" } }));
        }
        await saveWallpaperConfig({ mode: "local" });
      } catch {
        return;
      }
    },
    [saveWallpaperConfig]
  );

  /**
   * 切换壁纸模式并触发保存。
   */
  const onChangeWallpaperMode = useCallback(
    (mode: "local" | "off"): void => {
      setWallpaperMode(mode);
      void saveWallpaperConfig({ mode });
    },
    [saveWallpaperConfig]
  );

  /**
   * 清空本地壁纸缓存。
   */
  const clearWallpaperCache = useCallback(async (): Promise<void> => {
    try {
      if (!("caches" in window)) return;
      await caches.delete("farm-wallpaper-v1");
      window.dispatchEvent(new Event("ui:wallpaper"));
    } catch {
      return;
    }
  }, []);

  /**
   * 导出当前运行配置为 JSON 文件。
   */
  const onExportConfig = useCallback(async (): Promise<void> => {
    setConfigIoError(null);
    setConfigIoOk(null);
    setConfigIoSaving(true);
    try {
      const res = await apiFetch<ConfigReply>("/api/config", { token: auth.token });
      const raw = res.config as Config & { smtp?: { passSet?: boolean } };
      const cleaned: Config & { smtp?: { pass?: string } } = {
        ...raw,
        smtp: raw.smtp ? { ...raw.smtp } : undefined,
      };
      if (cleaned.smtp && "passSet" in cleaned.smtp) delete (cleaned.smtp as { passSet?: boolean }).passSet;
      const json = JSON.stringify(cleaned, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `farm-config-${stamp}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setConfigIoOk("已导出");
    } catch (e: unknown) {
      const err = e as ApiError;
      setConfigIoError(err.message ?? err.code ?? "导出失败");
    } finally {
      setConfigIoSaving(false);
    }
  }, [auth.token]);

  /**
   * 导入 JSON 配置文件并下发到服务端。
   */
  const onImportConfig = useCallback(
    async (files: FileList | null): Promise<void> => {
      setConfigIoError(null);
      setConfigIoOk(null);
      if (!files?.length) return;
      const file = files[0];
      setConfigIoSaving(true);
      try {
        const text = await file.text();
        const parsed = JSON.parse(text) as Config & { smtp?: { passSet?: boolean; pass?: string } };
        if (!parsed || typeof parsed !== "object") throw new Error("配置文件格式不正确");
        const body: Config & { smtp?: { pass?: string } } = {
          ...(parsed as Config),
          smtp: parsed.smtp ? { ...parsed.smtp } : undefined,
        };
        if (body.smtp && "passSet" in body.smtp) delete (body.smtp as { passSet?: boolean }).passSet;
        const res = await apiFetch<ConfigReply>("/api/config", { method: "PUT", token: auth.token, body });
        syncFormWithConfig(res.config);
        setConfigIoOk("已导入");
      } catch (e: unknown) {
        const err = e as ApiError;
        setConfigIoError(err.message ?? err.code ?? "导入失败");
      } finally {
        setConfigIoSaving(false);
      }
    },
    [auth.token, syncFormWithConfig]
  );

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="grid settingsPage">
      <div className="gridSpan2">
        <GlassCard
          title="壁纸"
          subtitle="默认多端同步；仅支持本地壁纸或关闭（本地壁纸存储在浏览器缓存）"
          right={
            <div className="row">
              <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
                {loading ? "刷新中..." : "刷新"}
              </Button>
              <Button size="sm" variant="danger" onClick={clearWallpaperCache} disabled={!canChangeWallpaper}>
                清空本地壁纸
              </Button>
            </div>
          }
          className="compactCard"
        >
          <div className="formGrid">
            <label className="field">
              <div className="fieldRow">
                <div className="fieldLabel">模式</div>
                <Hint text="所有浏览器/设备保持一致（通过服务端配置同步）。" />
              </div>
              <select className="fieldInput select" value={wallpaperMode} onChange={(e) => onChangeWallpaperMode(e.target.value as "local" | "off")} disabled={!canChangeWallpaper}>
                <option value="local">本地</option>
                <option value="off">关闭</option>
              </select>
            </label>

            <label className="field">
              <div className="fieldRow">
                <div className="fieldLabel">导入本地壁纸</div>
                <Hint text="选择后自动切换到“本地”模式（最多一次导入 20 张）。" />
              </div>
              <input className="fieldInput" type="file" accept="image/*" multiple onChange={(e) => void onPickLocalWallpaper(e.target.files)} disabled={!canChangeWallpaper} />
            </label>
          </div>

          {wallpaperError ? <div className="formError">{wallpaperError}</div> : null}
          {wallpaperOk ? <div className="formOk">{wallpaperOk}</div> : null}
        </GlassCard>
      </div>

      <div className="gridSpan2">
        <GlassCard title="配置导入导出" subtitle="支持运行配置、自动化与种植策略一键迁移（不会导出 SMTP 密码）" className="compactCard">
          <div className="formGrid">
            <label className="field">
              <div className="fieldRow">
                <div className="fieldLabel">导入配置</div>
                <Hint text="导入后会立即覆盖当前配置并下发到服务端。" />
              </div>
              <input className="fieldInput" type="file" accept="application/json,.json" onChange={(e) => void onImportConfig(e.target.files)} disabled={!canUseConfigIo} />
            </label>
            <label className="field">
              <div className="fieldRow">
                <div className="fieldLabel">导出配置</div>
                <Hint text="生成 JSON 文件用于备份或跨设备迁移。" />
              </div>
              <div className="row">
                <Button size="sm" variant="primary" onClick={onExportConfig} disabled={!canUseConfigIo}>
                  {configIoSaving ? "处理中..." : "导出 JSON"}
                </Button>
              </div>
            </label>
          </div>
          {configIoError ? <div className="formError">{configIoError}</div> : null}
          {configIoOk ? <div className="formOk">{configIoOk}</div> : null}
        </GlassCard>
      </div>

      <div className="gridSpan2">
        <GlassCard
          title="邮件通知（SMTP）"
          subtitle="当检测到巡查连接异常或 WS 400 错误时停止 bot 并邮件提醒"
          right={
            <div className="row">
              <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
                {loading ? "刷新中..." : "刷新"}
              </Button>
              <Button size="sm" variant="primary" onClick={saveSmtp} disabled={!canSaveSmtp}>
                {smtpSaving ? "保存中..." : "保存"}
              </Button>
            </div>
          }
          className="compactCard"
        >
          <div className="formGrid">
            <label className="field">
              <div className="fieldRow">
                <div className="fieldLabel">启用</div>
                <Hint text="关闭后不会发邮件，但仍可保留配置。" />
              </div>
              <select className="fieldInput select" value={smtpEnabled ? "on" : "off"} onChange={(e) => setSmtpEnabled(e.target.value === "on")}>
                <option value="off">关闭</option>
                <option value="on">开启</option>
              </select>
            </label>

            <label className="field">
              <div className="fieldLabel">服务器 Host</div>
              <input className="fieldInput" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.example.com" />
            </label>

            <label className="field">
              <div className="fieldLabel">端口</div>
              <input className="fieldInput" type="number" min={0} max={65535} value={smtpPort} onChange={(e) => setSmtpPort(Number(e.target.value))} />
            </label>

            <label className="field">
              <div className="fieldRow">
                <div className="fieldLabel">TLS</div>
                <Hint text="一般 465 选 SSL/TLS；587 选 STARTTLS。" />
              </div>
              <select className="fieldInput select" value={smtpSecure ? "secure" : "starttls"} onChange={(e) => setSmtpSecure(e.target.value === "secure")}>
                <option value="starttls">STARTTLS</option>
                <option value="secure">SSL/TLS</option>
              </select>
            </label>

            <label className="field">
              <div className="fieldLabel">用户名</div>
              <input className="fieldInput" value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} placeholder="user@example.com" />
            </label>

            <label className="field">
              <div className="fieldLabel">密码</div>
              <input
                className="fieldInput"
                type="password"
                value={smtpPass}
                onChange={(e) => setSmtpPass(e.target.value)}
                placeholder={smtpPassSet ? "已设置（留空则不改）" : "请输入 SMTP 密码"}
              />
            </label>

            <label className="field">
              <div className="fieldLabel">From</div>
              <input className="fieldInput" value={smtpFrom} onChange={(e) => setSmtpFrom(e.target.value)} placeholder="Farm Console <noreply@example.com>" />
            </label>

            <label className="field">
              <div className="fieldLabel">To</div>
              <input className="fieldInput" value={smtpTo} onChange={(e) => setSmtpTo(e.target.value)} placeholder="a@example.com, b@example.com" />
            </label>
          </div>

          {smtpError ? <div className="formError">{smtpError}</div> : null}
          {smtpOk ? <div className="formOk">{smtpOk}</div> : null}
        </GlassCard>
      </div>

      <div className="gridSpan2">
        <GlassCard title="当前状态" subtitle="来自实时快照（WebSocket 推送）" className="compactCard">
          <div className="stats">
            <div className="stat">
              <div className="statK">Bot</div>
              <div className="statV">{snapshot?.bot?.running ? "RUNNING" : "STOPPED"}</div>
            </div>
            <div className="stat">
              <div className="statK">Connected</div>
              <div className="statV">{snapshot?.bot?.connected ? "YES" : "NO"}</div>
            </div>
            <div className="stat">
              <div className="statK">User</div>
              <div className="statV">{snapshot?.bot?.user?.name ?? "—"}</div>
            </div>
            <div className="stat">
              <div className="statK">GID</div>
              <div className="statV">{snapshot?.bot?.user?.gid ?? "—"}</div>
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
