export interface Screen {
  id: string;
  code: number;
  name: string;
  location: string;
  createdAt: number;
  lastSeen: number | null;
  reloadAt: number | null;
  ownerId: string | null;
  ownerEmail: string | null;
  ownerTotpEnabled: boolean;
}

export interface Media {
  id: string;
  filename: string;
  originalName: string;
  type: 'image' | 'video';
  advertiser: string;
  createdAt: number;
}

export interface PlaylistItem {
  mediaId: string;
  duration: number;
  startDate: string | null;
  endDate: string | null;
  ownerMedia?: Media | null;
}

export interface Report {
  total: number;
  byAdvertiser: Record<string, number>;
}
