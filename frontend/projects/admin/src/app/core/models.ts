export interface Screen {
  id: string;
  name: string;
  location: string;
  createdAt: number;
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
}

export interface Report {
  total: number;
  byAdvertiser: Record<string, number>;
}
