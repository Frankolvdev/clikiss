"use client";

import FeedMedia from "./feed-media";
import type { SocialPost } from "./social-store";

export default function ProfilePostMedia({ post, alt }: { post: SocialPost; alt: string }) {
  return <FeedMedia post={post} suspended={false} alt={alt}/>;
}
