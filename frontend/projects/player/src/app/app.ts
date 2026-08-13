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

interface Layer {
  key: number;
  item: PlayItem;
}

const POLL_MS = 5 * 60 * 1000;
const HEARTBEAT_MS = 25 * 1000;
const TRANSITION_MS = 700;

@Component({
  selector: 'app-root',
  imports: [],
  template: `
    <div class="stage">
      @for (l of layers(); track l.key) {
        <div class="layer" [class.active]="l.key === activeKey()">
          @if (l.item.type === 'video') {
            <video [src]="l.item.url" autoplay muted playsinline (ended)="onVideoEnded(l.key)" (error)="onMediaError()"></video>
          } @else {
            <img [src]="l.item.url" (error)="onMediaError()" />
          }
        </div>
      }
      @if (!layers().length) {
        <div class="msg">{{ message() }}</div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; position: fixed; inset: 0; background: #000; overflow: hidden; }
    .stage { position: fixed; inset: 0; }
    .layer {
      position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
      opacity: 0; transition: opacity ${TRANSITION_MS}ms ease;
    }
    .layer.active { opacity: 1; }
    video, img { width: 100%; height: 100%; object-fit: contain; background: #000; }
    .msg { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #555; font-size: 22px; text-align: center; font-family: system-ui, sans-serif; }
  `],
})
export class App implements OnInit, OnDestroy {
  readonly layers = signal<Layer[]>([]);
  readonly activeKey = signal(-1);
  readonly message = signal('Carregando…');

  private items: PlayItem[] = [];
  private idx = 0;
  private layerSeq = 0;
  private screenId = '';
  private readonly bootTime = Date.now();
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

  private async heartbeat(): Promise<void> {
    try {
      const res = await fetch('/api/heartbeat/' + this.screenId, { method: 'POST' });
      const data = await res.json();
      // Admin pediu reload dessa tela depois que esse player carregou: recarrega pra pegar a versao nova.
      if (data.reloadAt && data.reloadAt > this.bootTime) {
        location.reload();
      }
    } catch {
      /* rede instavel, tenta de novo no proximo heartbeat */
    }
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
      this.layers.set([]);
      this.activeKey.set(-1);
      this.message.set('Sem conteúdo programado');
      this.advanceTimer = setTimeout(() => this.playNext(), 5000);
      return;
    }
    const item = this.items[this.idx % this.items.length];
    this.idx++;
    this.impression(item);

    const key = ++this.layerSeq;
    this.layers.update((ls) => [...ls, { key, item }].slice(-2));
    // proximo frame: dispara o fade-in da nova camada
    requestAnimationFrame(() => requestAnimationFrame(() => this.activeKey.set(key)));
    // depois da transicao, descarta a camada antiga (fadeu embaixo)
    setTimeout(() => this.layers.update((ls) => ls.filter((l) => l.key === key)), TRANSITION_MS + 100);

    if (item.type === 'image') {
      this.advanceTimer = setTimeout(() => this.playNext(), (item.duration || 10) * 1000);
    }
  }

  onVideoEnded(key: number): void {
    if (key === this.layerSeq) this.playNext();
  }

  onMediaError(): void {
    this.advanceTimer = setTimeout(() => this.playNext(), 500);
  }
}
