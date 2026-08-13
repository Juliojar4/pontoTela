import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Screen } from './models';

@Injectable({ providedIn: 'root' })
export class ScreensService {
  constructor(private http: HttpClient) {}

  list(): Promise<Screen[]> {
    return firstValueFrom(this.http.get<Screen[]>('/api/screens'));
  }

  create(name: string, location: string): Promise<Screen> {
    return firstValueFrom(this.http.post<Screen>('/api/screens', { name, location }));
  }

  remove(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>('/api/screens/' + id));
  }
}
