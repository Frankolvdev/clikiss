export type Profile = {
  id: string;
  name: string;
  age: number;
  location: string;
  distance: number | null;
  gender: string;
  bio: string;
  interests: string[];
  image: string;
  online: boolean;
  reciprocal: boolean;
  adventureAvailable?: boolean;
  isTest?: boolean;
  avatarVideo?:string;
  discoveryImage?:string;
  hasDiscoveryPhoto?:boolean;
};

export type Message = { id: string; text: string; fromMe: boolean; time: string; createdAt?: string; readAt?:string|null };

export const emptyCurrentUser = {
  adventureAvailable: false,
  name: "", age: 18, location: "", gender: "Prefiero no decirlo",
  bio: "", interests: [] as string[],
};
