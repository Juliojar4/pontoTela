import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Media } from './models';

@Injectable({ providedIn: 'root' })
export class MediaService {
  constructor(private http: HttpClient) {}

  list(): Promise<Media[]> {
    return firstValueFrom(this.http.get<Media[]>('/api/media'));
  }

  upload(file: File, advertiser: string): Promise<Media> {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('advertiser', advertiser);
    return firstValueFrom(this.http.post<Media>('/api/media', fd));
  }

  remove(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>('/api/media/' + id));
  }
}
