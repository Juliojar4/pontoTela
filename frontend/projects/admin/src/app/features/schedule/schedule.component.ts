import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Media, PlaylistItem, Screen } from '../../core/models';
import { ScreensService } from '../../core/screens.service';
import { MediaService } from '../../core/media.service';
import { PlaylistsService } from '../../core/playlists.service';
import { UiService } from '../../core/ui.service';
import { MediaPickerComponent } from '../../shared/media-picker.component';

@Component({
  selector: 'app-schedule',
  imports: [FormsModule, MediaPickerComponent],
  template: `
    @if (!screens().length) {
      <div class="card"><div class="empty">Cadastre uma tela primeiro.</div></div>
    } @else {
      <div class="card">
        <h2>Programação da tela</h2>
        <label>Tela</label>
        <select [(ngModel)]="screenId" (ngModelChange)="onScreenChange()">
          @for (s of screens(); track s.id) {
            <option [value]="s.id">{{ s.name }}</option>
          }
        </select>
        <div class="row" style="margin-top:12px">
          <div>
            <label>Mídia</label>
            <app-media-picker [items]="media()" [value]="mediaId" (valueChange)="mediaId = $event" />
          </div>
          <div><label>Duração (s)</label><input type="number" [(ngModel)]="duration" /></div>
          <div><label>Início (opcional)</label><input type="date" [(ngModel)]="startDate" /></div>
          <div><label>Fim (opcional)</label><input type="date" [(ngModel)]="endDate" /></div>
        </div>
        <button class="primary" (click)="addToPlaylist()">Adicionar à programação</button>
      </div>
      <div class="card">
        <h2>No ar nesta tela</h2>
        @if (list().length) {
          <div class="table-wrap">
            <table>
              <tr><th>#</th><th>Anunciante</th><th>Duração</th><th>Campanha</th><th></th></tr>
              @for (item of list(); track $index) {
                <tr>
                  <td class="muted">{{ $index + 1 }}</td>
                  <td>{{ mediaFor(item.mediaId)?.advertiser || mediaFor(item.mediaId)?.originalName || '?' }}</td>
                  @if (editingIndex() === $index) {
                    <td>
                      @if (mediaFor(item.mediaId)?.type === 'video') {
                        <span class="muted">vídeo</span>
                      } @else {
                        <input type="number" class="cell-input" [(ngModel)]="editDuration" />
                      }
                    </td>
                    <td>
                      <div class="edit-dates">
                        <input type="date" class="cell-input" [(ngModel)]="editStartDate" />
                        <input type="date" class="cell-input" [(ngModel)]="editEndDate" />
                      </div>
                    </td>
                    <td>
                      <button class="ghost" (click)="saveEdit($index)">salvar</button>
                      <button class="del" (click)="cancelEdit()">cancelar</button>
                    </td>
                  } @else {
                    <td>
                      @if (mediaFor(item.mediaId)?.type === 'video') {
                        <span class="muted">vídeo</span>
                      } @else {
                        {{ item.duration }}s
                      }
                    </td>
                    <td class="muted">{{ item.startDate || '—' }} → {{ item.endDate || '—' }}</td>
                    <td>
                      <button class="ghost" (click)="startEdit($index, item)">editar</button>
                      <button class="ghost" (click)="move($index, -1)">↑</button>
                      <button class="ghost" (click)="move($index, 1)">↓</button>
                      <button class="del" (click)="removeItem($index)">remover</button>
                    </td>
                  }
                </tr>
              }
            </table>
          </div>
          <p class="muted" style="margin-top:12px">Loop total: {{ loopSeconds() }}s por volta.</p>
        } @else {
          <div class="empty">Nada programado. A tela mostra "Sem conteúdo".</div>
        }
      </div>
    }
  `,
  styles: [`
    .cell-input { width: auto; min-width: 80px; padding: 6px 8px; font-size: 13px; }
    .edit-dates { display: flex; gap: 6px; flex-wrap: wrap; }
    .edit-dates .cell-input { min-width: 130px; }
  `],
})
export class ScheduleComponent implements OnInit {
  readonly screens = signal<Screen[]>([]);
  readonly media = signal<Media[]>([]);
  readonly list = signal<PlaylistItem[]>([]);
  readonly editingIndex = signal<number | null>(null);
  screenId = '';
  mediaId = '';
  duration = 10;
  startDate = '';
  endDate = '';
  editDuration = 10;
  editStartDate = '';
  editEndDate = '';

  constructor(
    private screensService: ScreensService,
    private mediaService: MediaService,
    private playlistsService: PlaylistsService,
    private ui: UiService,
  ) {}

  async ngOnInit(): Promise<void> {
    const [screens, media] = await Promise.all([this.screensService.list(), this.mediaService.list()]);
    this.screens.set(screens);
    this.media.set(media);
    if (screens.length) {
      this.screenId = screens[0].id;
      await this.loadList();
    }
  }

  mediaFor(id: string): Media | undefined {
    return this.media().find((m) => m.id === id);
  }

  async onScreenChange(): Promise<void> {
    this.editingIndex.set(null);
    await this.loadList();
  }

  async loadList(): Promise<void> {
    this.list.set(await this.playlistsService.list(this.screenId));
  }

  loopSeconds(): number {
    return this.list().reduce((acc, i) => {
      const m = this.mediaFor(i.mediaId);
      return acc + (m?.type === 'video' ? 15 : i.duration || 10);
    }, 0);
  }

  async addToPlaylist(): Promise<void> {
    if (!this.mediaId) { this.ui.toast('Envie uma mídia primeiro', 'error'); return; }
    await this.playlistsService.add(this.screenId, {
      mediaId: this.mediaId,
      duration: Number(this.duration) || 10,
      startDate: this.startDate || null,
      endDate: this.endDate || null,
    });
    this.ui.toast('Adicionado à programação.', 'success');
    await this.loadList();
  }

  startEdit(ix: number, item: PlaylistItem): void {
    this.editingIndex.set(ix);
    this.editDuration = item.duration || 10;
    this.editStartDate = item.startDate || '';
    this.editEndDate = item.endDate || '';
  }

  cancelEdit(): void {
    this.editingIndex.set(null);
  }

  async saveEdit(ix: number): Promise<void> {
    const l = [...this.list()];
    l[ix] = {
      ...l[ix],
      duration: Number(this.editDuration) || 10,
      startDate: this.editStartDate || null,
      endDate: this.editEndDate || null,
    };
    await this.playlistsService.save(this.screenId, l);
    this.editingIndex.set(null);
    this.ui.toast('Programação atualizada.', 'success');
    await this.loadList();
  }

  async move(ix: number, dir: number): Promise<void> {
    const l = [...this.list()];
    const j = ix + dir;
    if (j < 0 || j >= l.length) return;
    [l[ix], l[j]] = [l[j], l[ix]];
    await this.playlistsService.save(this.screenId, l);
    await this.loadList();
  }

  async removeItem(ix: number): Promise<void> {
    const l = [...this.list()];
    l.splice(ix, 1);
    await this.playlistsService.save(this.screenId, l);
    await this.loadList();
  }
}
