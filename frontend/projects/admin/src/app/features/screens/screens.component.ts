import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import QRCode from 'qrcode';
import { Screen } from '../../core/models';
import { ScreensService } from '../../core/screens.service';
import { UiService } from '../../core/ui.service';

const ONLINE_WINDOW_MS = 90 * 1000;
const REFRESH_MS = 20 * 1000;

@Component({
  selector: 'app-screens',
  imports: [FormsModule],
  template: `
    <div class="page-head">
      <h1>Telas</h1>
      <span class="sub">{{ onlineCount() }} de {{ screens().length }} no ar</span>
    </div>

    <div class="card">
      <h2>Nova tela (ponto)</h2>
      <div class="row">
        <div><label>Nome</label><input [(ngModel)]="name" placeholder="Academia Fit Center" /></div>
        <div><label>Local</label><input [(ngModel)]="location" placeholder="Recepção" /></div>
        <div class="tight"><button class="primary inline" (click)="add()">Adicionar tela</button></div>
      </div>
    </div>

    @if (screens().length) {
      <div class="grid">
        @for (s of screens(); track s.id) {
          <article class="screen">
            <header>
              <h3>{{ s.name }}</h3>
              <span class="status" [class.online]="isOnline(s)">
                <span class="dot"></span>{{ isOnline(s) ? 'no ar' : lastSeenLabel(s) }}
              </span>
            </header>
            <p class="local">{{ s.location || 'Sem local definido' }}</p>

            <div class="link-box">
              <span class="url">{{ shortUrl(s) }}</span>
              <button class="ghost" (click)="copy(s)">
                {{ copied().has(s.id) ? 'copiado ✓' : 'copiar' }}
              </button>
            </div>

            <div class="qr">
              @if (qr()[s.id]; as src) {
                <img [src]="src" width="112" height="112" [alt]="'QR code da galeria da tela ' + s.name" />
              } @else {
                <div class="qr-placeholder"></div>
              }
              <div class="qr-info">
                <strong>QR do ponto</strong>
                <p>Quem escaneia vê as mídias desta tela e avança/volta à vontade.</p>
                <div class="qr-actions">
                  <button class="ghost" (click)="copyGallery(s)">
                    {{ copiedGallery().has(s.id) ? 'copiado ✓' : 'copiar link' }}
                  </button>
                  <button class="ghost" (click)="downloadQr(s)">baixar PNG</button>
                </div>
              </div>
            </div>

            <div class="actions">
              <a class="ghost as-btn" [href]="'/' + s.code" target="_blank" rel="noopener">abrir player ↗</a>
              <a class="ghost as-btn" [href]="'/g/' + s.code" target="_blank" rel="noopener">abrir galeria ↗</a>
              <button class="ghost" [disabled]="reloading().has(s.id)" (click)="reload(s.id)">
                {{ reloading().has(s.id) ? 'enviado ✓' : 'recarregar' }}
              </button>
              <span class="spacer"></span>
              <button class="del" (click)="remove(s.id)">excluir</button>
            </div>
          </article>
        }
      </div>
    } @else {
      <div class="card">
        <div class="empty">
          Nenhuma tela ainda.<br />
          Cada tela vira uma URL que você abre na TV ou no box do ponto comercial.
        </div>
      </div>
    }
  `,
  styles: [`
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 18px; }
    .screen {
      background: var(--surface); border: 1px solid var(--line); border-radius: var(--r);
      padding: 20px; box-shadow: var(--shadow); display: flex; flex-direction: column; gap: 12px;
    }
    .screen header { display: flex; align-items: flex-start; gap: 12px; }
    .screen h3 {
      flex: 1; font-size: 19px; font-variation-settings: 'wdth' 82;
      overflow-wrap: anywhere;
    }
    .local { margin: -6px 0 0; color: var(--muted); font-size: 14px; }

    .status {
      display: inline-flex; align-items: center; gap: 6px; flex: none;
      font-family: var(--display); font-variation-settings: 'wdth' 90;
      font-weight: 700; font-size: 11px; letter-spacing: .06em; text-transform: uppercase;
      color: var(--muted); white-space: nowrap; padding-top: 3px;
    }
    .status .dot { width: 8px; height: 8px; border-radius: 50%; background: #b9c1ba; flex-shrink: 0; }
    .status.online { color: var(--green-deep); }
    .status.online .dot { background: var(--green); box-shadow: 0 0 0 3px rgba(31, 157, 90, .18); }

    .link-box {
      display: flex; align-items: center; gap: 8px;
      background: var(--paper); border: 1px solid var(--line-soft);
      border-radius: var(--r); padding: 7px 8px 7px 12px;
    }
    .link-box .url {
      flex: 1; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 13px; color: var(--green-deep);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .link-box button { flex: none; }

    .qr {
      display: flex; gap: 14px; align-items: flex-start;
      background: var(--paper); border: 1px solid var(--line-soft);
      border-radius: var(--r); padding: 12px;
    }
    .qr img, .qr-placeholder {
      flex: none; width: 112px; height: 112px; border-radius: 6px; background: #fff;
    }
    .qr-placeholder { border: 1px dashed var(--line); background: transparent; }
    .qr-info { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
    .qr-info strong {
      font-family: var(--display); font-variation-settings: 'wdth' 90;
      font-size: 12px; letter-spacing: .06em; text-transform: uppercase; color: var(--green-deep);
    }
    .qr-info p { margin: 0; font-size: 13px; line-height: 1.4; color: var(--muted); }
    .qr-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: auto; }

    .actions { margin-top: auto; padding-top: 4px; }
    .actions .spacer { flex: 1; }
    a.as-btn { text-decoration: none; display: inline-flex; align-items: center; }
  `],
})
export class ScreensComponent implements OnInit, OnDestroy {
  readonly screens = signal<Screen[]>([]);
  readonly reloading = signal<Set<string>>(new Set());
  readonly copied = signal<Set<string>>(new Set());
  readonly copiedGallery = signal<Set<string>>(new Set());
  // dataURL do QR por tela — gerado no navegador, sem depender de serviço externo.
  readonly qr = signal<Record<string, string>>({});
  name = '';
  location = '';
  private refreshTimer?: ReturnType<typeof setInterval>;

  constructor(private screensService: ScreensService, private ui: UiService) {}

  async ngOnInit(): Promise<void> {
    await this.refresh();
    this.refreshTimer = setInterval(() => this.refresh(), REFRESH_MS);
  }

  ngOnDestroy(): void {
    clearInterval(this.refreshTimer);
  }

  async refresh(): Promise<void> {
    this.screens.set(await this.screensService.list());
    await this.syncQrCodes();
  }

  // Toda tela ganha seu QR assim que aparece na lista — inclusive a que você acabou de criar.
  private async syncQrCodes(): Promise<void> {
    const done = this.qr();
    const missing = this.screens().filter((s) => !done[s.id]);
    if (!missing.length) return;
    const entries = await Promise.all(
      missing.map(async (s) => [s.id, await QRCode.toDataURL(this.galleryUrl(s), {
        width: 480, margin: 1, color: { dark: '#12261a', light: '#ffffff' },
      })] as const),
    );
    this.qr.update((map) => ({ ...map, ...Object.fromEntries(entries) }));
  }

  // Página pública que o QR abre: as mídias no ar naquela tela, navegáveis na mão.
  galleryUrl(s: Screen): string {
    return location.origin + '/g/' + s.code;
  }

  async copyGallery(s: Screen): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.galleryUrl(s));
    } catch {
      this.ui.toast('Não consegui copiar. Copie o link à mão.', 'error');
      return;
    }
    this.flag(this.copiedGallery, s.id, 2000);
    this.ui.toast('Link da galeria copiado.', 'success');
  }

  downloadQr(s: Screen): void {
    const src = this.qr()[s.id];
    if (!src) { this.ui.toast('QR ainda sendo gerado, tente de novo.', 'error'); return; }
    const a = document.createElement('a');
    a.href = src;
    a.download = `tela-${s.code}-qr.png`;
    a.click();
  }

  onlineCount(): number {
    return this.screens().filter((s) => this.isOnline(s)).length;
  }

  // URL curta que vai ser digitada na TV / no Fully Kiosk.
  shortUrl(s: Screen): string {
    return location.host + '/' + s.code;
  }

  isOnline(s: Screen): boolean {
    return !!s.lastSeen && Date.now() - s.lastSeen < ONLINE_WINDOW_MS;
  }

  lastSeenLabel(s: Screen): string {
    if (!s.lastSeen) return 'nunca visto';
    const mins = Math.floor((Date.now() - s.lastSeen) / 60000);
    if (mins < 1) return 'offline há instantes';
    if (mins < 60) return `offline há ${mins}min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `offline há ${hours}h`;
    return `offline há ${Math.floor(hours / 24)}d`;
  }

  async copy(s: Screen): Promise<void> {
    const url = location.origin + '/' + s.code;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      this.ui.toast('Não consegui copiar. Copie o link à mão.', 'error');
      return;
    }
    this.flag(this.copied, s.id, 2000);
    this.ui.toast('Link do player copiado.', 'success');
  }

  async add(): Promise<void> {
    if (!this.name.trim()) { this.ui.toast('Dê um nome à tela', 'error'); return; }
    await this.screensService.create(this.name.trim(), this.location.trim());
    this.name = '';
    this.location = '';
    this.ui.toast('Tela adicionada.', 'success');
    await this.refresh();
  }

  async remove(id: string): Promise<void> {
    if (!(await this.ui.confirm('Excluir esta tela?'))) return;
    await this.screensService.remove(id);
    this.ui.toast('Tela excluída.', 'success');
    await this.refresh();
  }

  async reload(id: string): Promise<void> {
    await this.screensService.reload(id);
    this.flag(this.reloading, id, 3000);
    this.ui.toast('Comando de recarregar enviado — a tela atualiza em até 25s.', 'success');
  }

  private flag(target: typeof this.copied, id: string, ms: number): void {
    target.update((s) => new Set(s).add(id));
    setTimeout(() => {
      target.update((s) => { const next = new Set(s); next.delete(id); return next; });
    }, ms);
  }
}
