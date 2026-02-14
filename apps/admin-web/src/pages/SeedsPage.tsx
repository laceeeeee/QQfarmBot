import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { apiFetch, type ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { GlassCard } from "../ui/GlassCard";
import { Button } from "../ui/Button";

type SeedListItem = {
  plantId: number;
  seedId: number;
  name: string;
  landLevelNeed: number;
  seasons: number;
  exp: number;
  fruitId: number | null;
  fruitCount: number | null;
  totalGrowSec: number | null;
  growPhases: Array<{ name: string; sec: number }>;
};

type SeedListReply = {
  items: SeedListItem[];
  total: number;
  updatedAtMs: number;
};

function useIsNarrow(maxWidthPx: number): boolean {
  const [ok, setOk] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia?.(`(max-width: ${maxWidthPx}px)`)?.matches ?? false;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia?.(`(max-width: ${maxWidthPx}px)`);
    if (!mql) return;
    const onChange = () => setOk(mql.matches);
    onChange();
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  }, [maxWidthPx]);

  return ok;
}

/**
 * 将秒数转为更可读的中文时间。
 */
function formatDurationSec(sec: number | null): string {
  if (sec == null) return "—";
  if (!Number.isFinite(sec)) return "—";
  const s = Math.max(0, Math.floor(sec));
  if (s < 60) return `${s}秒`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}分`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm ? `${h}小时${mm}分` : `${h}小时`;
}

export function SeedsPage(): React.JSX.Element {
  const auth = useAuth();
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<
    "name" | "seedId" | "plantId" | "landLevelNeed" | "seasons" | "exp" | "fruitId" | "totalGrowSec"
  >("seedId");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const isNarrow = useIsNarrow(720);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SeedListReply | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  /**
   * 切换排序（同列点击切换升降序，切换列时默认为升序）。
   */
  const toggleSort = useCallback(
    (key: typeof sortKey): void => {
      setSortKey((prevKey) => {
        if (prevKey !== key) {
          setSortDir("asc");
          return key;
        }
        setSortDir((prevDir) => (prevDir === "asc" ? "desc" : "asc"));
        return prevKey;
      });
    },
    []
  );

  /**
   * 渲染支持排序交互的表头单元格。
   */
  const SortTh = useCallback(
    (props: { label: string; k: typeof sortKey; align?: "left" | "right" }): React.JSX.Element => {
      const active = sortKey === props.k;
      const arrow = active ? (sortDir === "asc" ? "▲" : "▼") : "↕";
      const cls = ["seedsThBtn", active ? "active" : "", props.align === "right" ? "right" : ""]
        .filter(Boolean)
        .join(" ");
      return (
        <th>
          <button type="button" className={cls} onClick={() => toggleSort(props.k)}>
            <span>{props.label}</span>
            <span className="seedsThArrow">{arrow}</span>
          </button>
        </th>
      );
    },
    [sortDir, sortKey, toggleSort]
  );

  /**
   * 拉取“种子清单”数据（默认返回全部，不分页）。
   */
  const load = useCallback(
    async (next: { q: string }): Promise<void> => {
      setError(null);
      setLoading(true);
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const qs = new URLSearchParams();
        if (next.q.trim()) qs.set("q", next.q.trim());
        const res = await apiFetch<SeedListReply>(`/api/seeds?${qs.toString()}`, {
          token: auth.token,
          signal: controller.signal,
        });
        setData(res);
      } catch (e: unknown) {
        const err = e as ApiError;
        if ((err as { name?: string }).name === "AbortError") return;
        setError(err.message ?? err.code ?? "加载失败");
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        setLoading(false);
      }
    },
    [auth.token]
  );

  useEffect(() => {
    const t = window.setTimeout(() => {
      void load({ q });
    }, 220);
    return () => window.clearTimeout(t);
  }, [load, q]);

  const sortedItems = useMemo(() => {
    const items = data?.items ?? [];
    const dir = sortDir === "desc" ? -1 : 1;
    const clone = items.slice();
    clone.sort((a, b) => {
      if (sortKey === "name") return dir * a.name.localeCompare(b.name, "zh-Hans-CN");
      if (sortKey === "seedId") return dir * (a.seedId - b.seedId);
      if (sortKey === "plantId") return dir * (a.plantId - b.plantId);
      if (sortKey === "landLevelNeed") return dir * (a.landLevelNeed - b.landLevelNeed);
      if (sortKey === "seasons") return dir * (a.seasons - b.seasons);
      if (sortKey === "exp") return dir * (a.exp - b.exp);
      if (sortKey === "fruitId") {
        const av = a.fruitId ?? (sortDir === "asc" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY);
        const bv = b.fruitId ?? (sortDir === "asc" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY);
        return dir * (av - bv);
      }
      const av = a.totalGrowSec ?? (sortDir === "asc" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY);
      const bv = b.totalGrowSec ?? (sortDir === "asc" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY);
      return dir * (av - bv);
    });
    return clone;
  }, [data?.items, sortDir, sortKey]);

  return (
    <div className="grid seedsPage">
      <div className="gridSpan2">
        <GlassCard
          title="种子清单"
          subtitle={data ? `共 ${data.total} 条 · 数据更新时间 ${new Date(data.updatedAtMs).toLocaleString()}` : "从 Plant.json 构建的对照查询表"}
          right={
            <div className="row">
              <Button size="sm" variant="ghost" onClick={() => void load({ q })} disabled={loading}>
                {loading ? "刷新中..." : "刷新"}
              </Button>
            </div>
          }
          className="compactCard"
        >
          <div className="seedsTools">
            <input
              className="fieldInput"
              placeholder="按作物名/seed_id/id/fruit_id 搜索"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
              }}
            />
          </div>

          {error ? <div className="formError">{error}</div> : null}

          {isNarrow ? (
            <div className="mobileCards">
              {sortedItems.length ? (
                sortedItems.map((x) => (
                  <div className="mobileCard" key={`${x.seedId}-${x.plantId}`}>
                    <div className="mobileCardTop">
                      <div className="mobileCardTitle">{x.name}</div>
                      <div className="mobileCardRight mono">经验 {x.exp}</div>
                    </div>
                    <div className="mobileCardMeta">
                      <span className="chip mono">Seed {x.seedId}</span>
                      <span className="chip mono">Plant {x.plantId}</span>
                      <span className="chip mono">地块 Lv.{x.landLevelNeed}</span>
                      <span className="chip mono">季数 {x.seasons}</span>
                      <span className="chip mono">总时长 {formatDurationSec(x.totalGrowSec)}</span>
                      {x.fruitId == null ? (
                        <span className="chip mono">果实 —</span>
                      ) : (
                        <span className="chip mono">果实 {x.fruitId} ×{x.fruitCount ?? "—"}</span>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="mobileEmpty muted">暂无数据</div>
              )}
            </div>
          ) : (
            <div className="seedsTableWrap">
              <table className="seedsTable">
                <thead>
                  <tr>
                    <SortTh label="作物名" k="name" />
                    <SortTh label="seed_id" k="seedId" align="right" />
                    <SortTh label="plant_id" k="plantId" align="right" />
                    <SortTh label="地块等级" k="landLevelNeed" align="right" />
                    <SortTh label="季数" k="seasons" align="right" />
                    <SortTh label="经验" k="exp" align="right" />
                    <SortTh label="果实" k="fruitId" align="right" />
                    <SortTh label="总时长" k="totalGrowSec" align="right" />
                  </tr>
                </thead>
                <tbody>
                  {sortedItems.map((x) => (
                    <tr key={`${x.seedId}-${x.plantId}`}>
                      <td className="tdName">{x.name}</td>
                      <td className="tdNum">{x.seedId}</td>
                      <td className="tdNum">{x.plantId}</td>
                      <td className="tdNum">{x.landLevelNeed}</td>
                      <td className="tdNum">{x.seasons}</td>
                      <td className="tdNum">{x.exp}</td>
                      <td className="tdNum">{x.fruitId == null ? "—" : x.fruitCount ?? "—"}</td>
                      <td className="tdNum">{formatDurationSec(x.totalGrowSec)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  );
}
