import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Report } from './models';

@Injectable({ providedIn: 'root' })
export class ReportsService {
  constructor(private http: HttpClient) {}

  run(from: string, to: string, screenId: string): Promise<Report> {
    const params: Record<string, string> = {};
    if (from) params['from'] = from;
    if (to) params['to'] = to;
    if (screenId) params['screenId'] = screenId;
    const qs = new URLSearchParams(params).toString();
    return firstValueFrom(this.http.get<Report>('/api/report' + (qs ? '?' + qs : '')));
  }
}
