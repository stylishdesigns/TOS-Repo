// Pure helpers for the Phase 1 chat navigation shell (orb, fan menu, the
// Chats / Channels split). No React, no server access, no side effects:
// only shape data the chat overview already carries. The gate, unread
// counts and lock states stay owned by src/server/chatRoutes.ts; nothing
// here invents data.

export type ChatNavGroupKind = 'subject' | 'announcements' | 'custom' | 'tos_channel';

/** Structural view of one group from GET /api/student/chat/overview. */
export interface ChatNavGroup {
  id: string;
  name: string;
  kind: ChatNavGroupKind;
  unread: number;
  locked: boolean;
}

/** Everything except TOS-owned channels: subject groups, announcements and centre custom groups. */
export function isChatGroup(g: ChatNavGroup): boolean {
  return g.kind !== 'tos_channel';
}

/** TOS-owned channels only (kind 'tos_channel'). Centres cannot create these. */
export function isTosChannel(g: ChatNavGroup): boolean {
  return g.kind === 'tos_channel';
}

/**
 * Split the overview's groups into the Chats > Groups list and the Channels list.
 * Every group lands on exactly one side; nothing is dropped or duplicated.
 */
export function splitGroupsAndChannels(
  all: readonly ChatNavGroup[],
): { groups: ChatNavGroup[]; channels: ChatNavGroup[] } {
  const groups: ChatNavGroup[] = [];
  const channels: ChatNavGroup[] = [];
  for (const g of all) {
    if (isTosChannel(g)) channels.push(g);
    else groups.push(g);
  }
  return { groups, channels };
}

/**
 * Total unread for the orb badge. Locked groups count 0 (the server already
 * sends unread 0 for locked groups; the guard keeps the badge honest if a
 * stale cached copy disagrees).
 */
export function totalUnread(all: readonly ChatNavGroup[]): number {
  let total = 0;
  for (const g of all) {
    if (!g.locked) total += Math.max(0, g.unread || 0);
  }
  return total;
}

/** Badge text for the orb: hidden at 0, "99+" above 99. */
export function orbBadgeLabel(total: number): string | null {
  if (!Number.isFinite(total) || total <= 0) return null;
  if (total > 99) return '99+';
  return String(total);
}
