import { useCallback, useEffect, useMemo, useState } from "react";
import type React from "react";
import { useAuth } from "../lib/auth";
import { apiFetch, type ApiError } from "../lib/api";
import { GlassCard } from "../ui/GlassCard";
import { Button } from "../ui/Button";

type Config = {
  selfIntervalSecMin: number;
  selfIntervalSecMax: number;
  friendIntervalSecMin: number;
  friendIntervalSecMax: number;
  platform: "qq" | "wx";
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

export function NotificationsPage(): React.JSX.Element {
  const auth = useAuth();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [loadedConfig, setLoadedConfig] = useState<Config | null>(null);

  const [smtpEnabled, setSmtpEnabled] = useState(false);
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [smtpPassSet, setSmtpPassSet] = useState(false);
  const [smtpFrom, setSmtpFrom] = useState("");
  const [smtpTo, setSmtpTo] = useState("");

  const canSave = useMemo(() => {
    if (saving) return false;
    if (!smtpEnabled) return true;
    if (!smtpHost.trim()) return false;
    if (!smtpPort) return false;
    if (!smtpFrom.trim()) return false;
    if (!smtpTo.trim()) return false;
    return true;
  }, [saving, smtpEnabled, smtpFrom, smtpHost, smtpPort, smtpTo]);

  const load = useCallback(async (): Promise<void> => {
    setError(null);
    setOk(null);
    setLoading(true);
    try {
      const res = await apiFetch<ConfigReply>("/api/config", { token: auth.token });
      setLoadedConfig(res.config);
      const smtp = res.config.smtp;
      setSmtpEnabled(Boolean(smtp?.enabled));
      setSmtpHost(smtp?.host ?? "");
      setSmtpPort(smtp?.port ?? 587);
      setSmtpSecure(Boolean(smtp?.secure));
      setSmtpUser(smtp?.user ?? "");
      setSmtpPass("");
      setSmtpPassSet(Boolean(smtp?.passSet));
      setSmtpFrom(smtp?.from ?? "");
      setSmtpTo(smtp?.to ?? "");
    } catch (e: unknown) {
      const err = e as ApiError;
      setError(err.code ?? "加载失败");
    } finally {
      setLoading(false);
    }
  }, [auth.token]);

  const save = useCallback(async (): Promise<void> => {
    setError(null);
    setOk(null);
    setSaving(true);
    try {
      const base = loadedConfig;
      if (!base) throw new Error("CONFIG_NOT_LOADED");
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
      setLoadedConfig(res.config);
      setOk("已保存");
    } catch (e: unknown) {
      const err = e as ApiError;
      setError(err.message ?? err.code ?? "保存失败");
    } finally {
      setSaving(false);
    }
  }, [
    auth.token,
    loadedConfig,
    smtpEnabled,
    smtpFrom,
    smtpHost,
    smtpPass,
    smtpPort,
    smtpSecure,
    smtpTo,
    smtpUser,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="grid settingsPage">
      <div className="gridSpan2">
        <GlassCard
          title="邮件通知（SMTP）"
          subtitle="当检测到 WS 400 错误时停止 bot 并邮件提醒"
          right={
            <div className="row">
              <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
                {loading ? "刷新中..." : "刷新"}
              </Button>
              <Button size="sm" variant="primary" onClick={save} disabled={!canSave}>
                {saving ? "保存中..." : "保存"}
              </Button>
            </div>
          }
          className="compactCard"
        >
          <div className="formGrid">
            <label className="field">
              <div className="fieldLabel">启用</div>
              <select className="fieldInput select" value={smtpEnabled ? "on" : "off"} onChange={(e) => setSmtpEnabled(e.target.value === "on")}>
                <option value="off">关闭</option>
                <option value="on">开启</option>
              </select>
              <div className="fieldHint">关闭后不会发邮件，但仍可保留配置。</div>
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
              <div className="fieldLabel">TLS</div>
              <select className="fieldInput select" value={smtpSecure ? "secure" : "starttls"} onChange={(e) => setSmtpSecure(e.target.value === "secure")}>
                <option value="starttls">STARTTLS</option>
                <option value="secure">SSL/TLS</option>
              </select>
              <div className="fieldHint">一般 465 选 SSL/TLS；587 选 STARTTLS。</div>
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

          {error ? <div className="formError">{error}</div> : null}
          {ok ? <div className="formOk">{ok}</div> : null}
        </GlassCard>
      </div>
    </div>
  );
}
