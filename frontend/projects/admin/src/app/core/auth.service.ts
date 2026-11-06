import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly authenticated = signal(false);
  private checked = false;

  constructor(private http: HttpClient) {}

  async ensureChecked(): Promise<boolean> {
    if (this.checked) return this.authenticated();
    const res = await firstValueFrom(this.http.get<{ authenticated: boolean }>('/api/me'));
    this.authenticated.set(res.authenticated);
    this.checked = true;
    return res.authenticated;
  }

  async logout(): Promise<void> {
    await firstValueFrom(this.http.post('/api/logout', {}));
    this.authenticated.set(false);
  }

  markLoggedOut(): void {
    this.authenticated.set(false);
    this.checked = true;
  }
}
