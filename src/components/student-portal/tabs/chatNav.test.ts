// Unit tests for the Phase 1 chat navigation helpers, in the repo's
// assert style (run by `npm test` through tsx).

import assert from 'node:assert/strict';
import { ChatNavGroup, orbBadgeLabel, splitGroupsAndChannels, totalUnread } from './chatNav';

console.log('--- Running chatNav.ts Unit Tests (Phase 1 chat navigation) ---');

const g = (id: string, kind: ChatNavGroup['kind'], unread: number, locked = false): ChatNavGroup => ({
  id,
  name: id,
  kind,
  unread,
  locked,
});

// --- splitGroupsAndChannels: only tos_channel goes to Channels ---
const mixed: ChatNavGroup[] = [
  g('subj-chem', 'subject', 2),
  g('ann', 'announcements', 1),
  g('custom-x', 'custom', 0),
  g('tos-channel', 'tos_channel', 4),
  g('tos-channel-2', 'tos_channel', 0),
];
const split = splitGroupsAndChannels(mixed);
assert.deepEqual(split.groups.map((x) => x.id), ['subj-chem', 'ann', 'custom-x']);
assert.deepEqual(split.channels.map((x) => x.id), ['tos-channel', 'tos-channel-2']);

// Nothing lost or duplicated
assert.equal(split.groups.length + split.channels.length, mixed.length);
const seen = new Set([...split.groups, ...split.channels].map((x) => x.id));
assert.equal(seen.size, mixed.length);
for (const x of mixed) assert.ok(seen.has(x.id));

// Announcements stay in Groups (they are centre-owned, not channels)
assert.ok(split.groups.some((x) => x.kind === 'announcements'));
assert.ok(!split.channels.some((x) => x.kind === 'announcements'));

// --- totalUnread ---
// Locked groups count 0, even if a stale copy carries unread > 0
assert.equal(totalUnread([g('a', 'subject', 5, true), g('b', 'custom', 3)]), 3);
// Server zeroes locked groups' unread; that must total 0 as well
assert.equal(totalUnread([g('a', 'subject', 0, true)]), 0);
// Simple sums
assert.equal(totalUnread([g('a', 'subject', 2), g('b', 'announcements', 1), g('c', 'tos_channel', 7)]), 10);
// Empty list
assert.equal(totalUnread([]), 0);
// Negative/unset guards
assert.equal(totalUnread([g('a', 'custom', -3)]), 0);

// --- orbBadgeLabel ---
assert.equal(orbBadgeLabel(0), null, 'hidden at 0');
assert.equal(orbBadgeLabel(1), '1');
assert.equal(orbBadgeLabel(99), '99');
assert.equal(orbBadgeLabel(100), '99+');
assert.equal(orbBadgeLabel(999), '99+');

console.log('chatNav.ts: all unit tests passed.');
