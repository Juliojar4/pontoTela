import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Screen } from '../../core/models';
import { ScreensService } from '../../core/screens.service';
import { UiService } from '../../core/ui.service';

const ONLINE_WINDOW_MS = 90 * 1000;
const REFRESH_MS = 20 * 1000;

@Component({
  selector: 'app-screens',
  imports: [FormsModule],
  template: `
    <div class="card">
      <h2>Nova tela (ponto)</h2>
      <div class="row">
        <div><label>Nome</label><input [(ngModel)]="name" placeholder="Academia Fit Center" /></div>
        <div><label>Local</label><input [(ngModel)]="location" placeholder="Recepção" /></div>
      </div>
      <button class="primary" (click)="add()">Adicionar tela</button>
    </div>
    <div class="card">
      <h2>Telas cadastradas</h2>
      @if (screens().length) {
        <div class="table-wrap">
          <table>
            <tr><th>Status</th><th>Nome</th><th>Local</th><th>Link do player</th><th></th></tr>
            @for (s of screens(); track s.id) {
              <tr>
                <td>
                  <span class="status" [class.online]="isOnline(s)">
                    <span class="dot"></span>{{ isOnline(s) ? 'online' : lastSeenLabel(s) }}
                  </span>
                </td>
                <td>{{ s.name }}</td>
                <td class="muted">{{ s.location || '—' }}</td>
                <td>
                  <a class="link" [href]="'/' + s.code" target="_blank">{{ shortUrl(s) }} ↗</a>
                </td>
                <td>
                  <button class="ghost" [disabled]="reloading().has(s.id)" (click)="reload(s.id)">
                    {{ reloading().has(s.id) ? 'enviado ✓' : 'recarregar' }}
                  </button>
                  <button class="del" (click)="remove(s.id)">excluir</button>
                </td>
              </tr>
            }
          </table>
        </div>
      } @else {
        <div class="empty">Nenhuma tela ainda. Cada tela vira uma URL que você abre na TV/box.</div>
      }
    </div>
  `,
  styles: [`
    .status { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--muted); white-space: nowrap; }
    .status .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--muted); flex-shrink: 0; }
    .status.online { color: var(--ok); }
    .status.online .dot { background: var(--ok); }
  `],
})
export class ScreensComponent implements OnInit, OnDestroy {
  readonly screens = signal<Screen[]>([]);
  readonly reloading = signal<Set<string>>(new Set());
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
    this.reloading.update((s) => new Set(s).add(id));
    this.ui.toast('Comando de recarregar enviado — a tela atualiza em até 25s.', 'success');
    setTimeout(() => {
      this.reloading.update((s) => { const next = new Set(s); next.delete(id); return next; });
    }, 3000);
  }
}
