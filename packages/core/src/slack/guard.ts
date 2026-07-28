/**
 * Slack操作の認可(§19.2)。
 * 許可されたユーザー・チャンネル以外の操作をすべて拒否する。
 */
export type SlackGuardConfig = {
  channelId: string;
  allowedUserIds: string[];
};

export function isAllowedSlackUser(config: SlackGuardConfig, userId: string | undefined): boolean {
  if (!userId) return false;
  return config.allowedUserIds.includes(userId);
}

export function isAllowedSlackChannel(
  config: SlackGuardConfig,
  channelId: string | undefined,
): boolean {
  if (!channelId) return false;
  return channelId === config.channelId;
}

export function isAuthorizedSlackAction(
  config: SlackGuardConfig,
  userId: string | undefined,
  channelId: string | undefined,
): boolean {
  return isAllowedSlackUser(config, userId) && isAllowedSlackChannel(config, channelId);
}

/** Modal送信などchannelIdが取れない操作用(ユーザーのみ検証) */
export function isAuthorizedSlackUserOnly(
  config: SlackGuardConfig,
  userId: string | undefined,
): boolean {
  return isAllowedSlackUser(config, userId);
}
