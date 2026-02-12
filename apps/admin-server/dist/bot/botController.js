import path from "node:path";
import { createRequire } from "node:module";
import nodemailer from "nodemailer";
export class BotController {
    require;
    logBuffer;
    configStore;
    status = {
        running: false,
        connected: false,
        platform: "qq",
        farmSummary: null,
    };
    unsubscribeBotLog = null;
    onWsClosed = null;
    userPollTimer = null;
    fatalWs400Triggered = false;
    levelExpStarts = null;
    constructor(opts) {
        this.require = createRequire(import.meta.url);
        this.logBuffer = opts.logBuffer;
        this.configStore = opts.configStore;
        this.projectRoot = opts.projectRoot;
    }
    projectRoot;
    getStatus() {
        return { ...this.status };
    }
    getLevelExpStarts() {
        if (this.levelExpStarts)
            return this.levelExpStarts;
        try {
            const list = this.require(path.join(this.projectRoot, "gameConfig", "RoleLevel.json"));
            if (!Array.isArray(list) || !list.length)
                return null;
            const maxLevel = list.reduce((m, x) => (typeof x?.level === "number" ? Math.max(m, x.level) : m), 0);
            if (!Number.isFinite(maxLevel) || maxLevel <= 0)
                return null;
            const starts = new Array(maxLevel + 2).fill(NaN);
            for (const item of list) {
                if (!item || typeof item.level !== "number" || typeof item.exp !== "number")
                    continue;
                starts[item.level] = item.exp;
            }
            const hasAtLeastTwo = Number.isFinite(starts[1]) && Number.isFinite(starts[2]);
            if (!hasAtLeastTwo)
                return null;
            this.levelExpStarts = starts;
            return starts;
        }
        catch {
            return null;
        }
    }
    computeExpProgress(level, totalExp) {
        const starts = this.getLevelExpStarts();
        if (!starts)
            return null;
        const exp = Number(totalExp);
        if (!Number.isFinite(exp) || exp < 0)
            return null;
        const maxLevel = starts.length - 2;
        let lvl = Number(level);
        if (!Number.isFinite(lvl) || lvl < 1)
            lvl = 1;
        lvl = Math.min(Math.floor(lvl), maxLevel);
        const startAt = starts[lvl];
        const nextAt = starts[lvl + 1];
        const lvlLooksValid = Number.isFinite(startAt) && Number.isFinite(nextAt) && exp >= startAt && exp < nextAt;
        let effective = lvl;
        if (!lvlLooksValid) {
            let lo = 1;
            let hi = maxLevel;
            while (lo <= hi) {
                const mid = (lo + hi) >> 1;
                const midAt = starts[mid];
                if (!Number.isFinite(midAt)) {
                    hi = mid - 1;
                    continue;
                }
                if (exp >= midAt)
                    lo = mid + 1;
                else
                    hi = mid - 1;
            }
            effective = Math.max(1, Math.min(hi, maxLevel));
        }
        const curStart = starts[effective];
        const nxtStart = starts[effective + 1];
        if (!Number.isFinite(curStart) || !Number.isFinite(nxtStart))
            return null;
        const needed = nxtStart - curStart;
        const current = exp - curStart;
        if (!Number.isFinite(needed) || !Number.isFinite(current) || needed <= 0)
            return null;
        return { current: Math.max(0, Math.min(needed, current)), needed };
    }
    async start(input) {
        await this.stop();
        this.fatalWs400Triggered = false;
        const configMod = this.require(path.join(this.projectRoot, "src", "config.js"));
        const networkMod = this.require(path.join(this.projectRoot, "src", "network.js"));
        const protoMod = this.require(path.join(this.projectRoot, "src", "proto.js"));
        const farmMod = this.require(path.join(this.projectRoot, "src", "farm.js"));
        const friendMod = this.require(path.join(this.projectRoot, "src", "friend.js"));
        const taskMod = this.require(path.join(this.projectRoot, "src", "task.js"));
        const warehouseMod = this.require(path.join(this.projectRoot, "src", "warehouse.js"));
        const statusMod = this.require(path.join(this.projectRoot, "src", "status.js"));
        const utilsMod = this.require(path.join(this.projectRoot, "src", "utils.js"));
        const CONFIG = configMod.CONFIG;
        CONFIG.platform = input.platform;
        const selfMinMs = Math.max(1, input.selfIntervalSecMin) * 1000;
        const selfMaxMs = Math.max(1, input.selfIntervalSecMax) * 1000;
        const friendMinMs = Math.max(1, input.friendIntervalSecMin) * 1000;
        const friendMaxMs = Math.max(1, input.friendIntervalSecMax) * 1000;
        CONFIG.farmCheckInterval = selfMinMs;
        CONFIG.farmCheckIntervalMin = Math.min(selfMinMs, selfMaxMs);
        CONFIG.farmCheckIntervalMax = Math.max(selfMinMs, selfMaxMs);
        CONFIG.friendCheckInterval = friendMinMs;
        CONFIG.friendCheckIntervalMin = Math.min(friendMinMs, friendMaxMs);
        CONFIG.friendCheckIntervalMax = Math.max(friendMinMs, friendMaxMs);
        await protoMod.loadProto();
        this.status = {
            running: true,
            connected: false,
            platform: input.platform,
            startedAt: new Date().toISOString(),
            farmSummary: null,
        };
        const onBotLog = async (payload) => {
            const level = payload.level === "warn" ? "warn" : payload.level === "error" ? "error" : "info";
            await this.logBuffer.append({ level, scope: payload.tag, message: payload.message });
            if (!this.status.running)
                return;
            if (payload.message.includes("Unexpected server response: 400")) {
                void this.handleFatalWs400(payload.message);
            }
        };
        utilsMod.botEvents.on("log", onBotLog);
        this.unsubscribeBotLog = () => utilsMod.botEvents.off("log", onBotLog);
        statusMod.initStatusBar();
        statusMod.setStatusPlatform(input.platform);
        utilsMod.emitRuntimeHint(true);
        networkMod.connect(input.code, async () => {
            this.status.connected = true;
            const user = networkMod.getUserState();
            const expProgress = this.computeExpProgress(user.level, user.exp);
            this.status.user = {
                ...user,
                expProgress: expProgress ?? undefined,
            };
            await this.logBuffer.append({
                level: "info",
                scope: "BOT",
                message: `登录成功: ${user.name || "unknown"} (gid=${user.gid})`,
            });
            farmMod.startFarmCheckLoop();
            friendMod.startFriendCheckLoop();
            taskMod.initTaskSystem();
            setTimeout(() => warehouseMod.debugSellFruits(), 3000);
            warehouseMod.startSellLoop(60_000);
            let lastGold = Number(user.gold ?? 0);
            let lastExp = Number(user.exp ?? 0);
            const poll = async () => {
                const next = networkMod.getUserState();
                const expProgress = this.computeExpProgress(next.level, next.exp);
                this.status.user = {
                    ...next,
                    expProgress: expProgress ?? undefined,
                };
                const gold = Number(next.gold ?? 0);
                const exp = Number(next.exp ?? 0);
                const goldDelta = gold - lastGold;
                const expDelta = exp - lastExp;
                lastGold = gold;
                lastExp = exp;
                const parts = [];
                if (Number.isFinite(goldDelta) && goldDelta > 0)
                    parts.push(`金币+${goldDelta}`);
                if (Number.isFinite(expDelta) && expDelta > 0)
                    parts.push(`经验+${expDelta}`);
                if (!parts.length)
                    return;
                await this.logBuffer.append({ level: "info", scope: "收益", message: parts.join("/") });
            };
            if (this.userPollTimer)
                clearInterval(this.userPollTimer);
            this.userPollTimer = setInterval(() => {
                void poll();
            }, 1200);
            this.onWsClosed = () => {
                const farmSummary = farmMod.getLastFarmSummary();
                this.status.farmSummary = (farmSummary && typeof farmSummary === "object" ? farmSummary : null);
            };
            this.onWsClosed();
        });
        const ws = networkMod.getWs();
        if (ws) {
            const originalClose = ws.close.bind(ws);
            ws.close = () => {
                try {
                    this.onWsClosed?.();
                }
                finally {
                    originalClose();
                }
            };
        }
        this.stopFn = async () => {
            try {
                warehouseMod.stopSellLoop();
                taskMod.cleanupTaskSystem();
                friendMod.stopFriendCheckLoop();
                farmMod.stopFarmCheckLoop();
                statusMod.cleanupStatusBar();
                networkMod.cleanup();
                networkMod.getWs()?.close();
            }
            catch {
                return;
            }
        };
    }
    stopFn = null;
    async stop() {
        if (!this.status.running)
            return;
        this.status.running = false;
        this.status.connected = false;
        this.unsubscribeBotLog?.();
        this.unsubscribeBotLog = null;
        if (this.userPollTimer)
            clearInterval(this.userPollTimer);
        this.userPollTimer = null;
        await this.stopFn?.();
        this.stopFn = null;
    }
    static toStartInput(config, code) {
        return {
            code,
            platform: config.platform,
            selfIntervalSecMin: config.selfIntervalSecMin,
            selfIntervalSecMax: config.selfIntervalSecMax,
            friendIntervalSecMin: config.friendIntervalSecMin,
            friendIntervalSecMax: config.friendIntervalSecMax,
        };
    }
    async handleFatalWs400(msg) {
        if (this.fatalWs400Triggered)
            return;
        this.fatalWs400Triggered = true;
        this.status.lastError = msg;
        await this.logBuffer.append({
            level: "error",
            scope: "系统",
            message: "检测到 WS 400 错误，已立即停止 bot 并尝试发送邮件通知",
        });
        await this.stop();
        await this.sendSmtpAlert("Bot 已停止：WS 400", `检测到错误：${msg}\n已停止 bot。请检查 code/网络环境后重新启动。`);
    }
    async sendSmtpAlert(subject, text) {
        try {
            const config = await this.configStore.getSecret();
            const smtp = config.smtp;
            if (!smtp?.enabled)
                return;
            if (!smtp.host || !smtp.port || !smtp.from || !smtp.to)
                return;
            if (!smtp.user || !smtp.pass) {
                await this.logBuffer.append({ level: "warn", scope: "SMTP", message: "SMTP 未配置账号或密码，已跳过邮件通知" });
                return;
            }
            const transporter = nodemailer.createTransport({
                host: smtp.host,
                port: smtp.port,
                secure: smtp.secure,
                auth: { user: smtp.user, pass: smtp.pass },
            });
            await transporter.sendMail({
                from: smtp.from,
                to: smtp.to,
                subject,
                text,
            });
            await this.logBuffer.append({ level: "info", scope: "SMTP", message: "邮件通知已发送" });
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : "发送失败";
            await this.logBuffer.append({ level: "warn", scope: "SMTP", message: `邮件通知失败: ${msg}` });
        }
    }
}
