export type SocialComment = { id: string; authorId: string; authorName: string; text: string; createdAt: number };
export type SocialPost = { id: string; caption: string; createdAt: number; kind: "photo" | "video"; media?: Blob; width?: number; height?: number; story: boolean; likedBy?: string[]; savedBy?: string[]; comments?: SocialComment[] };
export type ReviewInvitation = { id: string; recipientId: string; recipientName: string; createdAt: number };
export type SocialReview = { id: string; invitationId: string; authorId: string; authorName: string; text: string; stars: number; createdAt: number; reported?: boolean; simulated?: boolean };
export type SocialRecord = { profileId: string; posts: SocialPost[]; invitations: ReviewInvitation[]; reviews: SocialReview[]; avatar?: Blob; cover?: Blob };

export function emptySocialRecord(profileId: string): SocialRecord {
  return { profileId, posts: [], invitations: [], reviews: [] };
}

export function activeStories(posts: SocialPost[], now: number) {
  return posts.filter((post) => post.story && now - post.createdAt < 24 * 60 * 60 * 1000);
}

export function canReview(record: SocialRecord, invitationId: string, recipientId: string) {
  return record.profileId !== recipientId && record.invitations.some((invitation) => invitation.id === invitationId && invitation.recipientId === recipientId) && !record.reviews.some((review) => review.invitationId === invitationId);
}

import { matchesFeedFilter, type FeedCursor, type FeedFilter, type FeedItem, type FeedPage } from "./feed-model";

const stores = ["socialMeta", "socialPosts", "socialMedia"];
type PostRow = Omit<SocialPost, "media"> & { profileId: string; storyFlag: number };

let databaseName = "conecta-social-v1";
export function configureAccountStorage(userId: string | null) {
  databaseName = userId ? `conecta-account-${userId}` : "conecta-guest-v2";
}

async function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore("socialMeta", { keyPath: "profileId" });
      const posts = db.createObjectStore("socialPosts", { keyPath: "id" });
      posts.createIndex("profile", "profileId");
      posts.createIndex("chronological", ["createdAt", "id"]);
      posts.createIndex("stories", ["storyFlag", "createdAt", "id"]);
      db.createObjectStore("socialMedia", { keyPath: "id" });
      // Migrate the previous demo atomically. Files are moved, not deleted before the upgrade commits.
      if (db.objectStoreNames.contains("profiles")) {
        const cursor = request.transaction!.objectStore("profiles").openCursor();
        cursor.onsuccess = () => { if (cursor.result) { persistRecord(request.transaction!, cursor.result.value); cursor.result.delete(); cursor.result.continue(); } };
      }
    };
    request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
    request.onerror = () => reject(new Error("No fue posible abrir el almacenamiento local."));
    request.onblocked = () => reject(new Error("Cierra otras pestañas de ClicKiss e inténtalo otra vez."));
  });
}

function postFromRow(row: PostRow): SocialPost {
  const { profileId: _profileId, storyFlag: _storyFlag, ...post } = row;
  return post;
}

function persistRecord(tx: IDBTransaction, record: SocialRecord) {
  const { posts, ...meta } = record;
  tx.objectStore("socialMeta").put(meta);
  const postStore = tx.objectStore("socialPosts"), mediaStore = tx.objectStore("socialMedia");
  const ids = new Set(posts.map((post) => post.id));
  const old = postStore.index("profile").getAllKeys(record.profileId);
  old.onsuccess = () => old.result.forEach((id) => { if (!ids.has(String(id))) { postStore.delete(id); mediaStore.delete(id); } });
  posts.forEach(({ media, ...post }) => {
    postStore.put({ ...post, profileId: record.profileId, storyFlag: post.story ? 1 : 0 });
    if (media) mediaStore.put({ id: post.id, media });
  });
}

function loadRecord(tx: IDBTransaction, profileId: string, done: (record: SocialRecord) => void) {
  let meta: Omit<SocialRecord, "posts"> | undefined, posts: SocialPost[] = [];
  let metaReady = false, postsReady = false, remaining = 0;
  const finish = () => { if (metaReady && postsReady && remaining === 0) done({ ...(meta ?? emptySocialRecord(profileId)), posts }); };
  const metaRequest = tx.objectStore("socialMeta").get(profileId);
  metaRequest.onsuccess = () => { meta = metaRequest.result; metaReady = true; finish(); };
  const postsRequest = tx.objectStore("socialPosts").index("profile").getAll(profileId);
  postsRequest.onsuccess = () => {
    posts = postsRequest.result.map(postFromRow); postsReady = true; remaining = posts.length;
    if (!remaining) finish();
    posts.forEach((post) => { const media = tx.objectStore("socialMedia").get(post.id); media.onsuccess = () => { post.media = media.result?.media; remaining--; finish(); }; });
  };
}

export async function readSocialRecord(profileId: string): Promise<SocialRecord> {
  const db = await openDatabase();
  try { return await new Promise((resolve, reject) => {
    const tx = db.transaction(stores, "readonly"); loadRecord(tx, profileId, resolve);
    tx.onerror = () => reject(new Error("No fue posible recuperar el perfil."));
  }); } finally { db.close(); }
}

async function editRecord(profileId: string, update: (record: SocialRecord) => SocialRecord, replacement?: SocialRecord) {
  const db = await openDatabase();
  try { await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(stores, "readwrite");
    if (replacement) persistRecord(tx, replacement);
    else loadRecord(tx, profileId, (record) => { try { persistRecord(tx, update(record)); } catch (err) { tx.abort(); reject(err); } });
    tx.oncomplete = () => { window.dispatchEvent(new Event("conecta-social-update")); resolve(); };
    tx.onerror = () => reject(new Error("No se pudo guardar. Revisa el espacio de almacenamiento."));
    tx.onabort = () => reject(new Error("No se guardaron los cambios."));
  }); } finally { db.close(); }
}

export function writeSocialRecord(record: SocialRecord) { return editRecord(record.profileId, () => record, record); }
export function updateSocialRecord(profileId: string, update: (record: SocialRecord) => SocialRecord) { return editRecord(profileId, update); }

export async function updateSocialPost(profileId: string, postId: string, update: (post: SocialPost) => SocialPost) {
  const db = await openDatabase();
  try { await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("socialPosts", "readwrite"), store = tx.objectStore("socialPosts");
    const request = store.get(postId);
    request.onsuccess = () => { if (!request.result || request.result.profileId !== profileId) { tx.abort(); return; } try { store.put({ ...update(postFromRow(request.result)), profileId, storyFlag: request.result.storyFlag }); } catch (err) { tx.abort(); reject(err); } };
    tx.oncomplete = () => { window.dispatchEvent(Object.assign(new Event("conecta-social-update"), { postId })); resolve(); };
    tx.onerror = tx.onabort = () => reject(new Error("No se pudo actualizar la publicación."));
  }); } finally { db.close(); }
}

export async function readPostMedia(postId: string): Promise<Blob> {
  const db = await openDatabase();
  try { return await new Promise((resolve, reject) => {
    const request = db.transaction("socialMedia", "readonly").objectStore("socialMedia").get(postId);
    request.onsuccess = () => request.result?.media ? resolve(request.result.media) : reject(new Error("El archivo ya no está disponible."));
    request.onerror = () => reject(new Error("No fue posible cargar el archivo."));
  }); } finally { db.close(); }
}

export async function readFeedPage(filter: FeedFilter, after: FeedCursor | null, limit = 12, profileIds?: string[]): Promise<FeedPage> {
  limit = Math.max(1, Math.min(120, Math.trunc(limit)));
  const db = await openDatabase();
  try { return await new Promise((resolve, reject) => {
    const items: FeedItem[] = [], allowed = profileIds ? new Set(profileIds) : null;
    const tx = db.transaction(["socialPosts", "socialMeta"], "readonly");
    let result: FeedPage;
    const finish = (nextCursor: FeedCursor | null) => {
      result = { items, nextCursor };
      new Set(items.map((item) => item.profileId)).forEach((profileId) => { const meta = tx.objectStore("socialMeta").get(profileId); meta.onsuccess = () => items.forEach((item) => { if (item.profileId === profileId) item.avatar = meta.result?.avatar; }); });
    };
    tx.oncomplete = () => resolve(result);
    tx.onerror = tx.onabort = () => reject(new Error("No se pudo cargar el feed."));
    const cursor = tx.objectStore("socialPosts").index("chronological").openCursor(after ? IDBKeyRange.upperBound([after.createdAt, after.id], true) : undefined, "prev");
    cursor.onsuccess = () => {
      const current = cursor.result;
      if (!current) { finish(null); return; }
      const row: PostRow = current.value;
      if ((!allowed || allowed.has(row.profileId)) && matchesFeedFilter(row, filter)) {
        if (items.length === limit) { const last = items.at(-1)!.post; finish({ createdAt: last.createdAt, id: last.id }); return; }
        items.push({ profileId: row.profileId, post: postFromRow(row) });
      }
      current.continue();
    };
    cursor.onerror = () => reject(new Error("No se pudo cargar el feed."));
  }); } finally { db.close(); }
}

export async function readStoryMetadata(now: number, limit = 200): Promise<SocialRecord[]> {
  const db = await openDatabase();
  try { return await new Promise((resolve, reject) => {
    const grouped = new Map<string, SocialRecord>();
    const tx = db.transaction(["socialPosts", "socialMeta"], "readonly");
    const request = tx.objectStore("socialPosts").index("stories").getAll(IDBKeyRange.bound([1, now - 86400000, ""], [1, now, "\uffff"], true, false), limit);
    request.onsuccess = () => { request.result.forEach((row: PostRow) => { const record = grouped.get(row.profileId) ?? emptySocialRecord(row.profileId); record.posts.push(postFromRow(row)); grouped.set(row.profileId, record); }); grouped.forEach((record) => { const meta = tx.objectStore("socialMeta").get(record.profileId); meta.onsuccess = () => { record.avatar = meta.result?.avatar; }; }); };
    tx.oncomplete = () => resolve(Array.from(grouped.values()));
    tx.onerror = () => reject(new Error("No se pudo cargar las historias."));
  }); } finally { db.close(); }
}
