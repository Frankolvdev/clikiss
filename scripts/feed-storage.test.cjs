const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRuntime } = require('./test-runtime.cjs');

function post(id, createdAt, extra = {}) { return { id, createdAt, caption: id, story: false, kind: 'photo', media: new Blob(['media-' + id], { type: 'image/jpeg' }), ...extra }; }

test('chat merges out-of-order HTTP and realtime snapshots without losing or duplicating messages', () => {
  const { mergeMessages } = createRuntime().load('chat-model');
  const earlier = { id: 'a', text: 'primero', createdAt: '2026-10-19T12:00:00Z' };
  const later = { id: 'b', text: 'segundo', createdAt: '2026-10-19T12:00:01Z' };
  const messages = mergeMessages([earlier, later], [earlier]);
  assert.deepEqual(Array.from(messages, (message) => message.id), ['a', 'b']);
  assert.equal(mergeMessages(messages, [later, earlier]).length, 2);
});

test('account storage does not expose another account or legacy local content', async () => {
  const store = createRuntime().load('legacy-social-store');
  await store.writeSocialRecord({ ...store.emptySocialRecord('me'), posts: [post('legacy', 1)] });
  store.configureAccountStorage('account-a');
  assert.equal((await store.readSocialRecord('me')).posts.length, 0);
  await store.writeSocialRecord({ ...store.emptySocialRecord('me'), posts: [post('private-a', 2)] });
  store.configureAccountStorage('account-b');
  assert.equal((await store.readSocialRecord('me')).posts.length, 0);
  await assert.rejects(() => store.readPostMedia('private-a'), /archivo/);
  store.configureAccountStorage(null);
  assert.equal((await store.readSocialRecord('me')).posts.length, 0);
  store.configureAccountStorage('account-a');
  assert.equal((await store.readSocialRecord('me')).posts[0].id, 'private-a');
});

test('v1 migration preserves uploaded files, stories, invitations and reviews', async () => {
  const runtime = createRuntime();
  const old = await new Promise((resolve, reject) => {
    const request = runtime.indexedDB.open('conecta-social-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('profiles', { keyPath: 'profileId' });
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  await new Promise((resolve, reject) => {
    const tx = old.transaction('profiles', 'readwrite');
    tx.objectStore('profiles').put({ profileId: 'me', posts: [post('photo', 100), post('story', Date.now(), { story: true })], invitations: [{ id: 'invitation', recipientId: 'guest' }], reviews: [{ id: 'review', text: 'Test' }], avatar: new Blob(['avatar']) });
    tx.oncomplete = resolve; tx.onerror = reject;
  });
  old.close();
  const store = runtime.load('legacy-social-store');
  const record = await store.readSocialRecord('me');
  assert.equal(record.posts.length, 2);
  assert.equal(record.invitations[0].id, 'invitation');
  assert.equal(record.reviews[0].id, 'review');
  assert.equal(await record.avatar.text(), 'avatar');
  assert.equal(await store.readPostMedia('photo').then((blob) => blob.text()), 'media-photo');
  const page = await store.readFeedPage('all', null, 12);
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].post.media, undefined);
  const stories = await store.readStoryMetadata(Date.now());
  assert.equal(stories[0].posts[0].id, 'story');
  assert.equal(stories[0].posts[0].media, undefined);
});

test('cursor pagination preserves ordering with equal timestamps and never duplicates records', async () => {
  const store = createRuntime().load('legacy-social-store');
  await store.writeSocialRecord({ ...store.emptySocialRecord('me'), posts: [post('a', 100), post('b', 100), post('c', 200), post('d', 300)] });
  const first = await store.readFeedPage('all', null, 2);
  const second = await store.readFeedPage('all', first.nextCursor, 2);
  assert.deepEqual(Array.from(first.items, (item) => item.post.id), ['d', 'c']);
  assert.deepEqual(Array.from(second.items, (item) => item.post.id), ['b', 'a']);
  assert.equal(second.nextCursor, null);
});

test('feed filters exclude stories and constrain profile access; likes update without loading files', async () => {
  const store = createRuntime().load('legacy-social-store');
  await store.writeSocialRecord({ ...store.emptySocialRecord('me'), posts: [post('photo', 100), post('video', 200, { kind: 'video' }), post('story', 300, { story: true })] });
  await store.writeSocialRecord({ ...store.emptySocialRecord('other'), posts: [post('other', 400)] });
  await store.updateSocialPost('me', 'photo', (post) => { assert.equal(post.media, undefined); return { ...post, likedBy: ['me'], savedBy: ['me'] }; });
  const saved = await store.readFeedPage('saved', null, 12, ['me']);
  assert.equal(saved.items[0].post.id, 'photo');
  assert.equal(saved.items[0].post.likedBy[0], 'me');
  const video = await store.readFeedPage('video', null, 12, ['me']);
  assert.equal(video.items.length, 1); assert.equal(video.items[0].post.id, 'video');
  const all = await store.readFeedPage('all', null, 12, ['me']);
  assert.equal(all.items.length, 2);
  assert.equal(await store.readPostMedia('photo').then((blob) => blob.text()), 'media-photo');
});

test('deleting a post deletes its binary file; concurrent record updates preserve both changes', async () => {
  const store = createRuntime().load('legacy-social-store');
  await store.writeSocialRecord({ ...store.emptySocialRecord('me'), posts: [post('old', 100)] });
  await Promise.all([
    store.updateSocialRecord('me', (record) => ({ ...record, posts: [...record.posts, post('first', 200)] })),
    store.updateSocialRecord('me', (record) => ({ ...record, posts: [...record.posts, post('second', 300)] })),
  ]);
  assert.equal((await store.readSocialRecord('me')).posts.length, 3);
  await store.updateSocialRecord('me', (record) => ({ ...record, posts: record.posts.filter((item) => item.id !== 'old') }));
  await assert.rejects(store.readPostMedia('old'));
  assert.equal((await store.readSocialRecord('me')).posts.length, 2);
});

test('normal media proportions fill naturally; unusual proportions remain uncropped', () => {
  const model = createRuntime().load('feed-model');
  for (const [width, height] of [[1080, 1080], [1080, 1350], [1080, 1440], [1910, 1000]]) {
    const frame = model.mediaFrame(width, height); assert.equal(frame.ratio, width / height); assert.equal(frame.fit, 'cover');
  }
  assert.equal(model.mediaFrame(1080, 1920).fit, 'cover');
  assert.equal(model.mediaFrame(1080, 1920).ratio, .75);
  assert.equal(model.mediaFrame(900, 3200).fit, 'contain');
  assert.equal(model.mediaFrame(4000, 1000).fit, 'contain');
  assert.equal(model.mediaFrame(0, 0).ratio, 1);
});

test('autoplay selects one sufficiently visible video and prefers the one closest to center on ties', () => {
  const { selectVisibleVideo } = createRuntime().load('feed-model');
  assert.equal(selectVisibleVideo([{ id: 'offscreen', ratio: .2, centerDistance: 10 }]), null);
  assert.equal(selectVisibleVideo([{ id: 'a', ratio: .8, centerDistance: 200 }, { id: 'b', ratio: .8, centerDistance: 10 }]), 'b');
  assert.equal(selectVisibleVideo([{ id: 'a', ratio: .95, centerDistance: 200 }, { id: 'b', ratio: .8, centerDistance: 10 }]), 'a');
});

test('post commands are idempotent and cannot delete another author comment', () => {
  const { applyPostCommand } = createRuntime().load('feed-model');
  let item = post('a', 100);
  const like = { type: 'like', value: true };
  item = applyPostCommand(applyPostCommand(item, like, 'me'), like, 'me');
  assert.equal(item.likedBy.length, 1);
  const comment = { id: 'comment', text: 'Hello', authorId: 'spoofed', authorName: 'Test', createdAt: 100 };
  item = applyPostCommand(applyPostCommand(item, { type: 'add-comment', comment }, 'me'), { type: 'add-comment', comment }, 'me');
  assert.equal(item.comments.length, 1); assert.equal(item.comments[0].authorId, 'me');
  item = applyPostCommand(item, { type: 'delete-comment', commentId: 'comment' }, 'other');
  assert.equal(item.comments.length, 1);
});

test('playback coordinator pauses the previous video, the hidden tab and all modal backgrounds', () => {
  const document = new EventTarget(); document.hidden = false;
  let modal = false, notify;
  let inside = false;
  document.querySelectorAll = () => modal ? [{getClientRects:()=>[{}],contains:()=>inside}] : [];
  document.body = {};
  class MutationObserver { constructor(callback) { notify = callback; } observe() {} disconnect() {} }
  const { registerFeedVideo } = createRuntime({ document, window: { innerHeight: 800 }, MutationObserver }).load('feed-playback');
  const state = { a: false, b: false };
  const element = (id) => ({ clientHeight: 500, getBoundingClientRect: () => ({ top: 100 }), pause: () => { state[id] = false; } });
  const a = registerFeedVideo('a', element('a'), (active) => { state.a = active; assert.equal(Number(state.a) + Number(state.b) <= 1, true); });
  const b = registerFeedVideo('b', element('b'), (active) => { state.b = active; assert.equal(Number(state.a) + Number(state.b) <= 1, true); });
  a.visibility(.8); assert.equal(state.a, true);
  b.visibility(.95); assert.equal(state.a, false); assert.equal(state.b, true);
  document.hidden = true; document.dispatchEvent(new Event('visibilitychange')); assert.equal(state.b, false);
  document.hidden = false; document.dispatchEvent(new Event('visibilitychange')); assert.equal(state.b, true);
  modal = true; notify(); assert.equal(state.b, false);
  inside = true; notify(); assert.equal(state.b, true); // Profile videos can play inside their own modal.
  inside = false; notify(); assert.equal(state.b, false);
  modal = false; notify(); assert.equal(state.b, true);
  b.visibility(0); assert.equal(state.b, false); assert.equal(state.a, true);
  a.dispose(); b.dispose();
});

test('audio state is shared by all listeners and applies to videos mounted later', () => {
  const { createAudioPreference } = createRuntime().load('audio-preference');
  const audio = createAudioPreference();
  let first, second, calls = 0;
  const unsubscribe = audio.subscribe(() => { first = audio.get(); calls++; });
  audio.subscribe(() => { second = audio.get(); });
  audio.set(false); assert.equal(first, false); assert.equal(second, false);
  assert.equal(audio.get(), false); // The next video reads the same preference on mount.
  audio.set(false); assert.equal(calls, 1);
  unsubscribe(); audio.set(true); assert.equal(first, false); assert.equal(second, true);
});

test('audio preference survives reload and unknown saved values remain muted', () => {
  const { createAudioPreference } = createRuntime().load('audio-preference');
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const first = createAudioPreference(); first.hydrate(storage); first.set(false);
  const next = createAudioPreference(); next.hydrate(storage); assert.equal(next.get(), false);
  next.set(true); assert.equal(values.get('conecta-media-muted-v1'), 'true');
  values.set('conecta-media-muted-v1', 'invalid');
  const invalid = createAudioPreference(); invalid.hydrate(storage); assert.equal(invalid.get(), true);
});

test('audio remains usable when browser storage is unavailable', () => {
  const { createAudioPreference } = createRuntime().load('audio-preference');
  const audio = createAudioPreference();
  audio.hydrate({ getItem() { throw new Error('unavailable'); }, setItem() { throw new Error('unavailable'); } });
  audio.set(false); assert.equal(audio.get(), false);
  audio.set(true); assert.equal(audio.get(), true);
});
