import { activeStories, type SocialPost, type SocialRecord } from "./social-store";

export type StoryPerson = { id: string; name: string; image: string; avatarVideo?:string };
export type StoryGroup = { person: StoryPerson; avatar?: Blob; stories: SocialPost[] };
export type StoryCursor = { group: number; story: number };

export function groupStories(records: SocialRecord[], people: StoryPerson[], now: number): StoryGroup[] {
  return records.flatMap((record) => {
    const person = people.find((item) => item.id === record.profileId);
    const stories = activeStories(record.posts, now).sort((a, b) => a.createdAt - b.createdAt);
    return person && stories.length ? [{ person, avatar: record.avatar, stories }] : [];
  }).sort((a, b) => b.stories.at(-1)!.createdAt - a.stories.at(-1)!.createdAt);
}

export function moveStory(groups: StoryGroup[], cursor: StoryCursor, direction: 1 | -1): StoryCursor | null {
  const group = groups[cursor.group];
  if (!group || !group.stories[cursor.story]) return null;
  if (direction === 1) {
    if (cursor.story + 1 < group.stories.length) return { ...cursor, story: cursor.story + 1 };
    return cursor.group + 1 < groups.length ? { group: cursor.group + 1, story: 0 } : null;
  }
  if (cursor.story > 0) return { ...cursor, story: cursor.story - 1 };
  return cursor.group > 0 ? { group: cursor.group - 1, story: groups[cursor.group - 1].stories.length - 1 } : cursor;
}
