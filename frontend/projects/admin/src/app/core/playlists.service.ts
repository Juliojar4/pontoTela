import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { PlaylistItem } from './models';

@Injectable({ providedIn: 'root' })
export class PlaylistsService {
  constructor(private http: HttpClient) {}

  list(screenId: string): Promise<{ version: string; items: PlaylistItem[] }> {
    return firstValueFrom(this.http.get<{ version: string; items: PlaylistItem[] }>('/api/playlists/' + screenId));
  }

  add(screenId: string, item: PlaylistItem): Promise<void> {
    return firstValueFrom(this.http.post<void>('/api/playlists/' + screenId, item));
  }

  save(screenId: string, version: string, items: PlaylistItem[]): Promise<void> {
    return firstValueFrom(this.http.put<void>('/api/playlists/' + screenId, { version, items }));
  }

  removeOwnerMedia(mediaId: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>('/api/owner-media/' + mediaId));
  }
}
