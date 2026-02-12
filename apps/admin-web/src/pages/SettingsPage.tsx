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

export function SettingsPage(): React.JSX.Element {
  const auth = useAuth();
  const { snapshot } = useData();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [platform, setPlatform] = useState<"qq" | "wx">("qq");
  const [selfIntervalSecMin, setSelfIntervalSecMin] = useState(10);
  const [selfIntervalSecMax, setSelfIntervalSecMax] = useState(10);
  const [friendIntervalSecMin, setFriendIntervalSecMin] = useState(1);
  const [friendIntervalSecMax, setFriendIntervalSecMax] = useState(1);

  const canSave = useMemo(() => {
    if (saving) return false;
    if (selfIntervalSecMin < 1 || selfIntervalSecMax < 1) return false;
    if (friendIntervalSecMin < 1 || friendIntervalSecMax < 1) return false;
    if (selfIntervalSecMin > selfIntervalSecMax) return false;
    if (friendIntervalSecMin > friendIntervalSecMax) return false;
    return true;
  }, [
    friendIntervalSecMax,
    friendIntervalSecMin,
    saving,
    selfIntervalSecMax,
    selfIntervalSecMin,
  ]);

  const load = useCallback(async (): Promise<void> => {
    setError(null);
    setOk(null);
    setLoading(true);
    try {
      const res = await apiFetch<ConfigReply>("/api/config", { token: auth.token });
      setPlatform(res.config.platform);
      setSelfIntervalSecMin(res.config.selfIntervalSecMin);
      setSelfIntervalSecMax(res.config.selfIntervalSecMax);
      setFriendIntervalSecMin(res.config.friendIntervalSecMin);
      setFriendIntervalSecMax(res.config.friendIntervalSecMax);
    } catch (e: unknown) {
      const err = e as ApiError;
      setError(err.code ?? "加载失败");
    } finally {
      setLoading(false);
    }
  }, [auth.token]);

  async function save(): Promise<void> {
    setError(null);
    setOk(null);
    setSaving(true);
    try {
      const body: Omit<Config, "smtp"> = {
        platform,
        selfIntervalSecMin,
        selfIntervalSecMax,
        friendIntervalSecMin,
        friendIntervalSecMax,
      };
      await apiFetch<ConfigReply>("/api/config", { method: "PUT", token: auth.token, body });
      setOk("已保存");
    } catch (e: unknown) {
      const err = e as ApiError;
      setError(err.message ?? err.code ?? "保存失败");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="grid settingsPage">
      <div className="gridSpan2">
        <GlassCard
          title="运行配置"
          subtitle="修改后会在下次启动 bot 时生效（已运行的 bot 需要停止后重新启动）"
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
              <div className="fieldLabel">平台</div>
              <select
                className="fieldInput select"
                value={platform}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "qq" || v === "wx") setPlatform(v);
                }}
              >
                <option value="qq">QQ</option>
                <option value="wx">微信</option>
              </select>
              <div className="fieldHint">决定 bot 使用的 login 流程与协议差异。</div>
            </label>

            <label className="field">
              <div className="fieldLabel">自己农场巡查间隔范围（秒）</div>
              <div className="row">
                <input
                  className="fieldInput"
                  type="number"
                  min={1}
                  max={3600}
                  value={selfIntervalSecMin}
                  onChange={(e) => setSelfIntervalSecMin(Number(e.target.value))}
                />
                <span className="muted">~</span>
                <input
                  className="fieldInput"
                  type="number"
                  min={1}
                  max={3600}
                  value={selfIntervalSecMax}
                  onChange={(e) => setSelfIntervalSecMax(Number(e.target.value))}
                />
              </div>
              <div className="fieldHint">每次循环会在范围内随机取值；保存后下次启动生效。</div>
            </label>

            <label className="field">
              <div className="fieldLabel">好友巡查间隔范围（秒）</div>
              <div className="row">
                <input
                  className="fieldInput"
                  type="number"
                  min={1}
                  max={3600}
                  value={friendIntervalSecMin}
                  onChange={(e) => setFriendIntervalSecMin(Number(e.target.value))}
                />
                <span className="muted">~</span>
                <input
                  className="fieldInput"
                  type="number"
                  min={1}
                  max={3600}
                  value={friendIntervalSecMax}
                  onChange={(e) => setFriendIntervalSecMax(Number(e.target.value))}
                />
              </div>
              <div className="fieldHint">用于巡查好友农场、帮忙与偷菜；保存后下次启动生效。</div>
            </label>
          </div>

          {error ? <div className="formError">{error}</div> : null}
          {ok ? <div className="formOk">{ok}</div> : null}
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
