import { hostname as osHostname } from "node:os";
import { basename } from "node:path";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import type { BuiltinStatusLineSegmentId, RenderedSegment, SegmentContext, SemanticColor, StatusLineSegment, StatusLineSegmentId } from "./types.ts";
import { normalizeCompactExtensionStatus, normalizeExtensionStatusValue } from "./powerline-config.ts";
import { fg, applyColor } from "./theme.ts";
import { getIcons, SEP_DOT, getThinkingText } from "./icons.ts";

function color(ctx: SegmentContext, semantic: SemanticColor, text: string): string {
  return fg(ctx.theme, semantic, text, ctx.colors);
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

function withIcon(icon: string, text: string): string {
  return icon ? `${icon} ${text}` : text;
}

function formatTokens(n: number): string {
  if (n < 1000) return n.toString();
  if (n < 10000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1000000) return `${Math.round(n / 1000)}k`;
  if (n < 10000000) return `${(n / 1000000).toFixed(1)}M`;
  return `${Math.round(n / 1000000)}M`;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m${seconds % 60}s`;
  return `${seconds}s`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Segment Implementations
// ═══════════════════════════════════════════════════════════════════════════

const modelSegment: StatusLineSegment = {
  id: "model",
  render(ctx) {
    const icons = getIcons();
    const opts = ctx.options.model ?? {};

    let modelName = ctx.model?.name || ctx.model?.id || "no-model";
    // Strip "Claude " prefix for brevity
    if (modelName.startsWith("Claude ")) {
      modelName = modelName.slice(7);
    }

    let content = withIcon(icons.model, modelName);

    if (opts.showThinkingLevel !== false && ctx.model?.reasoning) {
      const level = ctx.thinkingLevel || "off";
      if (level !== "off") {
        const thinkingText = getThinkingText(level);
        if (thinkingText) {
          content += `${SEP_DOT}${thinkingText}`;
        }
      }
    }

    return { content: color(ctx, "model", content), visible: true };
  },
};

const shellModeSegment: StatusLineSegment = {
  id: "shell_mode",
  render(ctx) {
    if (!ctx.shellModeActive) {
      return { content: "", visible: false };
    }

    const shellName = ctx.shellName ?? "shell";
    const state = ctx.shellRunning ? "run" : "idle";
    const cwd = ctx.shellCwd ? basename(ctx.shellCwd) : null;
    const parts = [shellName, state];
    if (cwd) {
      parts.push(cwd);
    }

    return { content: color(ctx, "shellMode", parts.join(SEP_DOT)), visible: true };
  },
};

const pathSegment: StatusLineSegment = {
  id: "path",
  render(ctx) {
    const icons = getIcons();
    const opts = ctx.options.path ?? {};
    const mode = opts.mode ?? "basename";

    let pwd = ctx.shellModeActive && ctx.shellCwd ? ctx.shellCwd : process.cwd();
    const home = process.env.HOME || process.env.USERPROFILE;

    if (mode === "basename") {
      // Just the last directory component (cross-platform)
      pwd = basename(pwd) || pwd;
    } else {
      // Abbreviate home directory for abbreviated/full modes
      if (home && pwd.startsWith(home)) {
        pwd = `~${pwd.slice(home.length)}`;
      }

      // Strip /work/ prefix (common in containers)
      if (pwd.startsWith("/work/")) {
        pwd = pwd.slice(6);
      }

      // Truncate if too long (only for abbreviated mode)
      if (mode === "abbreviated") {
        const maxLen = opts.maxLength ?? 40;
        if (pwd.length > maxLen) {
          pwd = `…${pwd.slice(-(maxLen - 1))}`;
        }
      }
    }

    const content = withIcon(icons.folder, pwd);
    return { content: color(ctx, "path", content), visible: true };
  },
};

const gitSegment: StatusLineSegment = {
  id: "git",
  render(ctx) {
    const icons = getIcons();
    const opts = ctx.options.git ?? {};
    const { branch } = ctx.git;

    if (!branch || opts.showBranch === false) return { content: "", visible: false };

    return {
      content: color(ctx, "gitClean", withIcon(icons.branch, branch)),
      visible: true,
    };
  },
};

const thinkingSegment: StatusLineSegment = {
  id: "thinking",
  render(ctx) {
    const level = ctx.thinkingLevel || "off";

    const levelText: Record<string, string> = {
      off: "off",
      minimal: "min",
      low: "low",
      medium: "med",
      high: "high",
      xhigh: "xhigh",
    };
    const label = levelText[level] || level;
    const content = label;

    if (level === "high") {
      return { content: color(ctx, "thinkingHigh", content), visible: true };
    }

    if (level === "xhigh") {
      return { content: color(ctx, "thinkingXhigh", content), visible: true };
    }

    if (level === "minimal") {
      return { content: color(ctx, "thinkingMinimal", content), visible: true };
    }
    if (level === "low") {
      return { content: color(ctx, "thinkingLow", content), visible: true };
    }
    if (level === "medium") {
      return { content: color(ctx, "thinkingMedium", content), visible: true };
    }

    return { content: color(ctx, "thinking", content), visible: true };
  },
};

const subagentsSegment: StatusLineSegment = {
  id: "subagents",
  render() {
    // Note: pi-mono doesn't have subagent tracking built-in
    // This would require extension state management
    // For now, return not visible
    return { content: "", visible: false };
  },
};

const tokenInSegment: StatusLineSegment = {
  id: "token_in",
  render(ctx) {
    const icons = getIcons();
    const { input } = ctx.usageStats;
    if (!input) return { content: "", visible: false };

    const content = withIcon(icons.input, formatTokens(input));
    return { content: color(ctx, "tokens", content), visible: true };
  },
};

const tokenOutSegment: StatusLineSegment = {
  id: "token_out",
  render(ctx) {
    const icons = getIcons();
    const { output } = ctx.usageStats;
    if (!output) return { content: "", visible: false };

    const content = withIcon(icons.output, formatTokens(output));
    return { content: color(ctx, "tokens", content), visible: true };
  },
};

const tokenTotalSegment: StatusLineSegment = {
  id: "token_total",
  render(ctx) {
    const icons = getIcons();
    const { input, output, cacheRead, cacheWrite } = ctx.usageStats;
    const total = input + output + cacheRead + cacheWrite;
    if (!total) return { content: "", visible: false };

    const content = withIcon(icons.tokens, formatTokens(total));
    return { content: color(ctx, "tokens", content), visible: true };
  },
};

const costSegment: StatusLineSegment = {
  id: "cost",
  render(ctx) {
    const { cost } = ctx.usageStats;

    if (!cost) {
      return { content: "", visible: false };
    }

    const costDisplay = `$${cost.toFixed(2)}`;
    return { content: color(ctx, "cost", costDisplay), visible: true };
  },
};

const contextPctSegment: StatusLineSegment = {
  id: "context_pct",
  render(ctx) {
    if (ctx.customCompactionEnabled) return { content: "", visible: false };

    const pct = ctx.contextPercent;
    const text = `${pct.toFixed(1)}%`;

    if (pct > 90) {
      return { content: color(ctx, "contextError", text), visible: true };
    }
    if (pct > 70) {
      return { content: color(ctx, "contextWarn", text), visible: true };
    }
    return { content: color(ctx, "context", text), visible: true };
  },
};

const contextTotalSegment: StatusLineSegment = {
  id: "context_total",
  render(ctx) {
    if (ctx.customCompactionEnabled) return { content: "", visible: false };

    const icons = getIcons();
    const window = ctx.contextWindow;
    if (!window) return { content: "", visible: false };

    return {
      content: color(ctx, "context", withIcon(icons.context, formatTokens(window))),
      visible: true,
    };
  },
};

const timeSpentSegment: StatusLineSegment = {
  id: "time_spent",
  render(ctx) {
    const icons = getIcons();
    const elapsed = Date.now() - ctx.sessionStartTime;
    if (elapsed < 1000) return { content: "", visible: false };

    return { content: withIcon(icons.time, formatDuration(elapsed)), visible: true };
  },
};

const timeSegment: StatusLineSegment = {
  id: "time",
  render(ctx) {
    const icons = getIcons();
    const opts = ctx.options.time ?? {};
    const now = new Date();

    let hours = now.getHours();
    let suffix = "";
    if (opts.format === "12h") {
      suffix = hours >= 12 ? "pm" : "am";
      hours = hours % 12 || 12;
    }

    const mins = now.getMinutes().toString().padStart(2, "0");
    let timeStr = `${hours}:${mins}`;
    if (opts.showSeconds) {
      timeStr += `:${now.getSeconds().toString().padStart(2, "0")}`;
    }
    timeStr += suffix;

    return { content: withIcon(icons.time, timeStr), visible: true };
  },
};

const sessionSegment: StatusLineSegment = {
  id: "session",
  render(ctx) {
    const icons = getIcons();
    const sessionId = ctx.sessionId;
    const rawDisplay = ctx.sessionName?.trim() || ctx.lastUserPrompt?.replace(/\s+/g, " ").trim() || sessionId?.slice(0, 8) || "new";
    const maxWidth = Math.max(1, ctx.options.session?.maxWidth ?? 72);
    const display = visibleWidth(rawDisplay) > maxWidth
      ? `${truncateToWidth(rawDisplay, maxWidth - 1, "")}${applyColor(ctx.theme, "muted", "…")}`
      : rawDisplay;
    const stashStatus = ctx.options.session?.showStash === false ? "" : normalizeExtensionStatusValue(ctx.extensionStatuses.get("stash") ?? "");
    const stashSuffix = stashStatus ? `${color(ctx, "session", " | ")}${color(ctx, "model", stashStatus)}` : "";

    return { content: `${color(ctx, "session", withIcon(icons.session, display))}${stashSuffix}`, visible: true };
  },
};

const hostnameSegment: StatusLineSegment = {
  id: "hostname",
  render() {
    const icons = getIcons();
    const name = osHostname().split(".")[0];
    return { content: withIcon(icons.host, name), visible: true };
  },
};

const cacheReadSegment: StatusLineSegment = {
  id: "cache_read",
  render(ctx) {
    const { cacheRead } = ctx.usageStats;
    if (!cacheRead) return { content: "", visible: false };

    return { content: color(ctx, "tokens", formatTokens(cacheRead)), visible: true };
  },
};

const cacheWriteSegment: StatusLineSegment = {
  id: "cache_write",
  render(ctx) {
    const icons = getIcons();
    const { cacheWrite } = ctx.usageStats;
    if (!cacheWrite) return { content: "", visible: false };

    const parts = [icons.cache, icons.output, formatTokens(cacheWrite)].filter(Boolean);
    const content = parts.join(" ");
    return { content: color(ctx, "tokens", content), visible: true };
  },
};

const extensionStatusesSegment: StatusLineSegment = {
  id: "extension_statuses",
  render(ctx) {
    const statuses = ctx.extensionStatuses;
    if (!statuses || statuses.size === 0) return { content: "", visible: false };

    // Join compact statuses with a separator
    // Skip: empty strings, notification-style ("[...") shown above editor,
    // and strings that are only ANSI codes with no visible text.
    // Also skip statuses explicitly elevated into dedicated custom segments.
    const parts: string[] = [];
    for (const [statusKey, value] of statuses.entries()) {
      if (statusKey === "vim-mode" || statusKey === "vim-pending") continue;
      if (ctx.hiddenExtensionStatusKeys.has(statusKey)) continue;
      const normalized = value ? normalizeCompactExtensionStatus(value) : null;
      if (normalized) {
        parts.push(normalized);
      }
    }

    if (parts.length === 0) return { content: "", visible: false };

    // Statuses already have their own styling applied by the extensions
    const content = parts.join(` ${SEP_DOT} `);
    return { content, visible: true };
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// Segment Registry
// ═══════════════════════════════════════════════════════════════════════════

export const SEGMENTS: Record<BuiltinStatusLineSegmentId, StatusLineSegment> = {
  model: modelSegment,
  shell_mode: shellModeSegment,
  path: pathSegment,
  git: gitSegment,
  thinking: thinkingSegment,
  subagents: subagentsSegment,
  token_in: tokenInSegment,
  token_out: tokenOutSegment,
  token_total: tokenTotalSegment,
  cost: costSegment,
  context_pct: contextPctSegment,
  context_total: contextTotalSegment,
  time_spent: timeSpentSegment,
  time: timeSegment,
  session: sessionSegment,
  hostname: hostnameSegment,
  cache_read: cacheReadSegment,
  cache_write: cacheWriteSegment,
  extension_statuses: extensionStatusesSegment,
};

function renderCustomSegment(id: `custom:${string}`, ctx: SegmentContext): RenderedSegment {
  const customItemId = id.slice("custom:".length);
  const custom = ctx.customItemsById.get(customItemId);
  if (!custom) return { content: "", visible: false };

  const rawStatus = ctx.extensionStatuses.get(custom.statusKey);
  const normalizedStatus = rawStatus ? normalizeExtensionStatusValue(rawStatus) : null;
  if (!normalizedStatus) {
    return custom.hideWhenMissing ? { content: "", visible: false } : { content: custom.prefix ?? custom.id, visible: true };
  }

  let content = normalizedStatus;
  if (custom.prefix) {
    content = `${custom.prefix}${SEP_DOT}${content}`;
  }
  if (custom.color) {
    content = applyColor(ctx.theme, custom.color, content);
  }

  return { content, visible: true };
}

export function renderSegment(id: StatusLineSegmentId, ctx: SegmentContext): RenderedSegment {
  if (id.startsWith("custom:")) {
    return renderCustomSegment(id, ctx);
  }

  const segment = SEGMENTS[id];
  if (!segment) {
    return { content: "", visible: false };
  }
  return segment.render(ctx);
}
