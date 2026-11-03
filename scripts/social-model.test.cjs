const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRuntime } = require('./test-runtime.cjs');
const runtime = createRuntime();
const { activeStories, canReview, emptySocialRecord } = runtime.load('legacy-social-store');
const { groupStories, moveStory } = runtime.load('story-model');

test('stories disappear exactly after 24 hours; ordinary posts remain outside stories', () => {
  const now = 200000000;
  const posts = [
    { id: 'active', story: true, createdAt: now - 86399999 },
    { id: 'expired', story: true, createdAt: now - 86400000 },
    { id: 'older', story: true, createdAt: now - 86400001 },
    { id: 'post', story: false, createdAt: now },
  ];
  assert.deepEqual(Array.from(activeStories(posts, now), (post) => post.id), ['active']);
});

test('an invitation authorizes only its intended recipient', () => {
  const record = emptySocialRecord('owner');
  record.invitations.push({ id: 'invite', recipientId: 'guest' });
  assert.equal(canReview(record, 'invite', 'guest'), true);
  assert.equal(canReview(record, 'invite', 'other'), false);
  assert.equal(canReview(record, 'missing', 'guest'), false);
});

test('one invitation can be used only once, and a reported review still consumes it', () => {
  const record = emptySocialRecord('owner');
  record.invitations.push({ id: 'invite', recipientId: 'guest' });
  record.reviews.push({ invitationId: 'invite', reported: true });
  assert.equal(canReview(record, 'invite', 'guest'), false);
});

test('owners cannot review themselves, and revoking invitations removes permission', () => {
  const record = emptySocialRecord('owner');
  record.invitations.push({ id: 'self', recipientId: 'owner' });
  assert.equal(canReview(record, 'self', 'owner'), false);
  record.invitations = [];
  assert.equal(canReview(record, 'self', 'owner'), false);
});

test('stories are grouped by person and run oldest to newest within each person', () => {
  const groups = groupStories([
    { profileId: 'a', posts: [{ id: 'a2', story: true, createdAt: 300 }, { id: 'a1', story: true, createdAt: 100 }] },
    { profileId: 'b', posts: [{ id: 'b1', story: true, createdAt: 200 }] },
    { profileId: 'unknown', posts: [{ id: 'hidden', story: true, createdAt: 400 }] },
    { profileId: 'empty', posts: [{ id: 'ordinary', story: false, createdAt: 500 }] },
  ], [{ id: 'a' }, { id: 'b' }, { id: 'empty' }], 1000);
  assert.deepEqual(Array.from(groups, (group) => group.person.id), ['a', 'b']);
  assert.deepEqual(Array.from(groups[0].stories, (story) => story.id), ['a1', 'a2']);
});

test('forward navigation finishes the current person before opening the next person', () => {
  const groups = [{ stories: [{ id: 'a1' }, { id: 'a2' }] }, { stories: [{ id: 'b1' }] }];
  const first = moveStory(groups, { group: 0, story: 0 }, 1);
  assert.equal(first.group, 0); assert.equal(first.story, 1);
  const second = moveStory(groups, first, 1);
  assert.equal(second.group, 1); assert.equal(second.story, 0);
  assert.equal(moveStory(groups, second, 1), null);
});

test('backward navigation returns to the previous person last story and stays at the beginning', () => {
  const groups = [{ stories: [{ id: 'a1' }, { id: 'a2' }] }, { stories: [{ id: 'b1' }] }];
  const previous = moveStory(groups, { group: 1, story: 0 }, -1);
  assert.equal(previous.group, 0); assert.equal(previous.story, 1);
  const start = moveStory(groups, { group: 0, story: 0 }, -1);
  assert.equal(start.group, 0); assert.equal(start.story, 0);
});

test('expired stories and people without active stories do not enter the carousel', () => {
  const now = 200000000;
  const groups = groupStories([{ profileId: 'a', posts: [{ id: 'expired', story: true, createdAt: now - 86400000 }] }], [{ id: 'a' }], now);
  assert.equal(groups.length, 0);
  assert.equal(moveStory(groups, { group: 0, story: 0 }, 1), null);
});
