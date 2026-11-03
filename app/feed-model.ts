import type { SocialPost, SocialComment } from "./social-store";

export type FeedFilter = "all" | "photo" | "video" | "saved";
export type FeedCursor = { createdAt: number; id: string };
export type FeedItem = { profileId: string; post: SocialPost; avatar?: Blob; person?: {id:string;name:string;image:string;avatarVideo?:string} };
export type FeedPage = { items: FeedItem[]; nextCursor: FeedCursor | null };
export type PostCommand = { type: "like" | "save"; value: boolean } | { type: "add-comment"; comment: SocialComment } | { type: "delete-comment"; commentId: string };

export function applyPostCommand(post: SocialPost, command: PostCommand, userId: string): SocialPost {
  if (command.type === "like" || command.type === "save") {
    const field = command.type === "like" ? "likedBy" : "savedBy";
    const others = (post[field] ?? []).filter((id) => id !== userId);
    const wasLiked = post.likedBy?.includes(userId) ?? false;
    const likeCount = command.type === "like" && post.likeCount !== undefined ? Math.max(0, post.likeCount + Number(command.value) - Number(wasLiked)) : post.likeCount;
    return { ...post, likeCount, [field]: command.value ? [...others, userId] : others };
  }
  if (command.type === "add-comment") {
    if (!command.comment.text.trim() || (post.comments ?? []).some((item) => item.id === command.comment.id)) return post;
    return { ...post, comments: [...(post.comments ?? []), { ...command.comment, authorId: userId }] };
  }
  if (command.type === "delete-comment") return { ...post, comments: post.comments?.filter((item) => item.id !== command.commentId || item.authorId !== userId) };
  return post;
}

export function mediaFrame(width: number, height: number) {
  const nativeRatio = width > 0 && height > 0 ? width / height : 1;
  // Keep natural proportions in the normal feed range; preserve unusual media inside that range.
  return { ratio: Math.max(3 / 4, Math.min(1.91, nativeRatio)), fit: nativeRatio < .5 || nativeRatio > 2.4 ? "contain" as const : "cover" as const };
}

export function matchesFeedFilter(post: SocialPost, filter: FeedFilter) {
  return !post.story && (filter === "all" || (filter === "saved" ? Boolean(post.savedBy?.includes("me")) : post.kind === filter));
}

export function selectVisibleVideo(items: { id: string; ratio: number; centerDistance: number }[]) {
  return items.filter((item) => item.ratio >= .55).sort((a, b) => b.ratio - a.ratio || a.centerDistance - b.centerDistance)[0]?.id ?? null;
}
