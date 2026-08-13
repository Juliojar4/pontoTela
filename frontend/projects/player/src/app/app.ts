import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

interface PlayItem {
  mediaId: string;
  type: 'image' | 'video';
  url: string;
  duration: number;
  advertiser: string;
}

const POLL_MS = 5 * 60 * 1000;
const HEARTBEAT_MS = 25 * 1000;

@Component({
  selector: 'app-root',
  imports: [],
  template: `
    <div class="stage">
      @if (current(); as item) {
        @if (item.type === 'video') {
          <video [src]="item.url" autoplay muted playsinline (ended)="playNext()" (error)="onMediaError()"></video>
        } @else {
          <img [src]="item.url" (error)="onMediaError()" />
        }
      } @else {
        <div class="msg">{{ message() }}</div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; position: fixed; inset: 0; background: #000; overflow: hidden; }
    .stage { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; }
    video, img { width: 100%; height: 100%; object-fit: contain; background: #000; }
    .msg { color: #555; font-size: 22px; text-align: center; font-family: system-ui, sans-serif; }
  `],
})
export class App implements OnInit, OnDestroy {
  readonly current = signal<PlayItem | null>(null);
  readonly message = signal('Carregando…');

  private items: PlayItem[] = [];
  private idx = 0;
  private screenId = '';
  private advanceTimer?: ReturnType<typeof setTimeout>;
  private pollTimer?: ReturnType<typeof setInterval>;
  private heartbeatTimer?: ReturnType<typeof setInterval>;

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    const params = new URLSearchParams(location.search);
    this.screenId = params.get('screen') || '';
    if (!this.screenId) {
      this.message.set('Falta ?screen=ID na URL');
      return;
    }
    this.fetchPlaylist().then(() => this.playNext());
    this.pollTimer = setInterval(() => this.fetchPlaylist(), POLL_MS);
    this.heartbeat();
    this.heartbeatTimer = setInterval(() => this.heartbeat(), HEARTBEAT_MS);
  }

  ngOnDestroy(): void {
    clearTimeout(this.advanceTimer);
    clearInterval(this.pollTimer);
    clearInterval(this.heartbeatTimer);
  }

  private heartbeat(): void {
    const sent = navigator.sendBeacon?.('/api/heartbeat/' + this.screenId, new Blob([], { type: 'application/json' }));
    if (!sent) fetch('/api/heartbeat/' + this.screenId, { method: 'POST' }).catch(() => {});
  }

  private cacheKey(): string {
    return 'playlist_' + this.screenId;
  }

  private saveCache(items: PlayItem[]): void {
    try {
      localStorage.setItem(this.cacheKey(), JSON.stringify(items));
    } catch {
      /* storage indisponivel, ignora */
    }
  }

  private loadCache(): PlayItem[] | null {
    try {
      const raw = localStorage.getItem(this.cacheKey());
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  private async fetchPlaylist(): Promise<void> {
    try {
      const res = await firstValueFrom(
        this.http.get<{ items: PlayItem[] }>('/api/play/' + this.screenId),
      );
      if (res.items?.length) {
        this.items = res.items;
        this.saveCache(res.items);
      }
    } catch {
      const cached = this.loadCache();
      if (cached?.length) this.items = cached;
    }
  }

  private impression(item: PlayItem): void {
    const payload = JSON.stringify({ screenId: this.screenId, mediaId: item.mediaId });
    const sent = navigator.sendBeacon?.('/api/impression', new Blob([payload], { type: 'application/json' }));
    if (!sent) {
      fetch('/api/impression', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      }).catch(() => {});
    }
  }

  playNext(): void {
    clearTimeout(this.advanceTimer);
    if (!this.items.length) {
      this.current.set(null);
      this.message.set('Sem conteúdo programado');
      this.advanceTimer = setTimeout(() => this.playNext(), 5000);
      return;
    }
    const item = this.items[this.idx % this.items.length];
    this.idx++;
    this.impression(item);
    this.current.set(item);
    if (item.type === 'image') {
      this.advanceTimer = setTimeout(() => this.playNext(), (item.duration || 10) * 1000);
    }
  }

  onMediaError(): void {
    this.advanceTimer = setTimeout(() => this.playNext(), 500);
  }
}
