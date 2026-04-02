import type { StateSnapshot, UsageEvent } from './types.js';
import type { ApiUsageData } from './usage-api.js';
import { getTokenStatus } from './usage-api.js';
import type { OllamaStatus } from './ollama-probe.js';
import { adjustUsagePercent } from '@agentdeck/shared';
import type { CodexAuthStatus } from './codex-auth.js';
import type { AntigravityStatusInfo, BillingType, ModelCatalogEntry, SubscriptionInfo } from './types.js';

function formatChatGptPlan(planType?: string | null): string | undefined {
  const raw = planType?.trim();
  if (!raw) return undefined;
  switch (raw.toLowerCase()) {
    case 'plus': return 'ChatGPT Plus';
    case 'pro': return 'ChatGPT Pro';
    case 'team': return 'ChatGPT Team';
    case 'enterprise': return 'ChatGPT Enterprise';
    default: return `ChatGPT ${raw}`;
  }
}

function formatClaudeSubscription(
  apiUsage?: ApiUsageData | null,
  billingType?: BillingType,
): SubscriptionInfo | undefined {
  if (apiUsage?.inferredBillingType === 'subscription' || billingType === 'subscription') {
    return { name: 'Claude' };
  }
  return undefined;
}

export function buildSubscriptions(
  codexAuth?: CodexAuthStatus | null,
  apiUsage?: ApiUsageData | null,
  billingType?: BillingType,
): SubscriptionInfo[] | undefined {
  const items: SubscriptionInfo[] = [];
  const chatgptName = formatChatGptPlan(codexAuth?.planType);
  if (chatgptName) {
    items.push({
      name: chatgptName,
      until: codexAuth?.subscriptionActiveUntil ?? undefined,
    });
  }

  const claude = formatClaudeSubscription(apiUsage, billingType);
  if (claude) {
    items.push(claude);
  }

  return items.length > 0 ? items : undefined;
}

/**
 * Build a usage_update BridgeEvent from current state.
 * Single source of truth — used by both index.ts and daemon-server.ts.
 */
export function buildUsageEvent(
  snapshot: StateSnapshot,
  apiUsage?: ApiUsageData | null,
  oauthStatus?: boolean,
  ollamaStatus?: OllamaStatus | null,
  mlxModels?: string[] | null,
  stale?: boolean,
  codexAuth?: CodexAuthStatus | null,
  billingType?: BillingType,
  modelCatalog?: ModelCatalogEntry[] | null,
  antigravityStatus?: AntigravityStatusInfo | null,
  preAdjusted?: boolean,
): UsageEvent {
  const event: UsageEvent = {
    type: 'usage_update',
    sessionDurationSec: snapshot.sessionDurationSec,
    inputTokens: snapshot.inputTokens,
    outputTokens: snapshot.outputTokens,
    toolCalls: snapshot.toolCalls,
    estimatedCostUsd: snapshot.estimatedCostUsd ?? undefined,
    sessionPercent: snapshot.sessionPercent ?? undefined,
    costSpent: snapshot.costSpent ?? undefined,
    costLimit: snapshot.costLimit ?? undefined,
    resetTime: snapshot.resetTime ?? undefined,
    resetDate: snapshot.resetDate ?? undefined,
    fiveHourPercent: preAdjusted ? (apiUsage?.fiveHourPercent ?? undefined) : adjustUsagePercent(apiUsage?.fiveHourPercent, apiUsage?.fiveHourResetsAt),
    fiveHourResetsAt: apiUsage?.fiveHourResetsAt ?? undefined,
    sevenDayPercent: preAdjusted ? (apiUsage?.sevenDayPercent ?? undefined) : adjustUsagePercent(apiUsage?.sevenDayPercent, apiUsage?.sevenDayResetsAt),
    sevenDayResetsAt: apiUsage?.sevenDayResetsAt ?? undefined,
    extraUsageEnabled: apiUsage?.extraUsageEnabled ?? undefined,
    extraUsageMonthlyLimit: apiUsage?.extraUsageMonthlyLimit ?? undefined,
    extraUsageUsedCredits: apiUsage?.extraUsageUsedCredits ?? undefined,
    extraUsageUtilization: apiUsage?.extraUsageUtilization ?? undefined,
    oauthConnected: oauthStatus,
    ollamaStatus: ollamaStatus ?? undefined,
    usageStale: stale || undefined,
    tokenStatus: getTokenStatus() !== 'unknown' ? getTokenStatus() : undefined,
    codexAuthMode: codexAuth?.authMode,
    codexWebAuthConnected: codexAuth?.webAuthConnected,
    codexPlanType: codexAuth?.planType,
    codexAccountId: codexAuth?.accountId,
    codexSubscriptionActiveUntil: codexAuth?.subscriptionActiveUntil,
    codexLastRefreshAt: codexAuth?.lastRefreshAt,
    modelCatalog: modelCatalog && modelCatalog.length > 0 ? modelCatalog : undefined,
    mlxModels: mlxModels && mlxModels.length > 0 ? mlxModels : undefined,
    subscriptions: buildSubscriptions(codexAuth, apiUsage, billingType),
    antigravityStatus: antigravityStatus ?? undefined,
  };
  return event;
}
