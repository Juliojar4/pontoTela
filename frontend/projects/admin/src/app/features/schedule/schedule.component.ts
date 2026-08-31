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
      <div class="page-head"><h1>Programação</h1></div>
      <div class="card">
        <div class="empty">Cadastre uma tela primeiro — a programação é sempre de uma tela.</div>
      </div>
    } @else {
      <div class="page-head">
        <h1>Programação</h1>
        <span class="spacer"></span>
        <div class="screen-pick">
          <label for="tela">Tela</label>
          <select id="tela" [(ngModel)]="screenId" (ngModelChange)="onScreenChange()">
            @for (s of screens(); track s.id) {
              <option [value]="s.id">{{ s.name }}</option>
            }
          </select>
        </div>
      </div>

      <div class="card">
        <h2>Adicionar à programação</h2>
        <div class="row">
          <div>
            <label>Mídia</label>
            <app-media-picker [items]="media()" [value]="mediaId" (valueChange)="mediaId = $event" />
          </div>
          <div><label>Duração (s)</label><input type="number" [(ngModel)]="duration" /></div>
          <div><label>Início (opcional)</label><input type="date" [(ngModel)]="startDate" /></div>
          <div><label>Fim (opcional)</label><input type="date" [(ngModel)]="endDate" /></div>
          <div class="tight"><button class="primary inline" (click)="addToPlaylist()">Adicionar</button></div>
        </div>
      </div>

      <div class="card">
        <div class="loop-head">
          <h2>No ar nesta tela</h2>
          @if (list().length) {
            <span class="loop">
              <strong>{{ loopLabel() }}</strong> por volta · {{ list().length }} {{ list().length === 1 ? 'item' : 'itens' }}
            </span>
          }
        </div>

        @if (list().length) {
          <ol class="items">
            @for (item of list(); track $index) {
              <li>
                <span class="pos">{{ $index + 1 }}</span>
                @if (mediaFor(item.mediaId); as m) {
                  @if (m.type === 'image') {
                    <img class="thumb" [src]="'/uploads/' + m.filename" [alt]="m.advertiser || m.originalName" />
                  } @else {
                    <span class="thumb video-thumb">
                      <video [src]="'/uploads/' + m.filename + '#t=0.1'" preload="metadata" muted playsinline></video>
                      <span class="play">▶</span>
                    </span>
                  }
                } @else {
                  <span class="thumb"></span>
                }

                @if (editingIndex() === $index) {
                  <div class="fields">
                    <div class="field">
                      <label>Duração</label>
                      @if (mediaFor(item.mediaId)?.type === 'video') {
                        <span class="muted">o vídeo todo</span>
                      } @else {
                        <input type="number" class="cell-input" [(ngModel)]="editDuration" />
                      }
                    </div>
                    <div class="field"><label>Início</label><input type="date" class="cell-input" [(ngModel)]="editStartDate" /></div>
                    <div class="field"><label>Fim</label><input type="date" class="cell-input" [(ngModel)]="editEndDate" /></div>
                  </div>
                  <div class="actions">
                    <button class="ghost" (click)="saveEdit($index)">salvar</button>
                    <button class="del" (click)="cancelEdit()">cancelar</button>
                  </div>
                } @else {
                  <div class="info">
                    <strong>{{ titleFor(item) }}</strong>
                    <span class="meta">
                      {{ durationLabel(item) }}
                      @if (item.startDate || item.endDate) {
                        · campanha {{ item.startDate || '…' }} → {{ item.endDate || '…' }}
                      }
                    </span>
                  </div>
                  <div class="actions">
                    <button class="ghost" (click)="move($index, -1)" [disabled]="$index === 0" aria-label="Subir">↑</button>
                    <button class="ghost" (click)="move($index, 1)" [disabled]="$index === list().length - 1" aria-label="Descer">↓</button>
                    <button class="ghost" (click)="startEdit($index, item)">editar</button>
                    <button class="del" (click)="removeItem($index)">remover</button>
                  </div>
                }
              </li>
            }
          </ol>
        } @else {
          <div class="empty">Nada programado. A tela mostra "Sem conteúdo".</div>
        }
      </div>
    }
  `,
  styles: [`
    .screen-pick { display: flex; align-items: center; gap: 10px; }
    .screen-pick label { margin: 0; }
    .screen-pick select { width: auto; min-width: 200px; }

    .loop-head { display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; margin-bottom: 16px; }
    .loop-head h2 { margin: 0; }
    .loop { margin-left: auto; color: var(--muted); font-size: 14px; }
    .loop strong {
      font-family: var(--display); font-variation-settings: 'wdth' 84;
      color: var(--green-deep); font-size: 16px;
    }

    .items { list-style: none; margin: 0; padding: 0; }
    .items li {
      display: flex; align-items: center; gap: 14px;
      padding: 12px 0; border-bottom: 1px solid var(--line-soft); flex-wrap: wrap;
    }
    .items li:last-child { border-bottom: 0; padding-bottom: 0; }
    .pos {
      font-family: var(--display); font-variation-settings: 'wdth' 84; font-weight: 800;
      font-size: 14px; color: var(--muted); width: 22px; text-align: right; flex: none;
    }
    .video-thumb { position: relative; overflow: hidden; display: inline-block; }
    .video-thumb video { width: 100%; height: 100%; object-fit: cover; display: block; }
    .video-thumb .play {
      position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
      color: #fff; font-size: 10px; text-shadow: 0 1px 2px rgba(0,0,0,.9); pointer-events: none;
    }

    .info { flex: 1; min-width: 160px; display: flex; flex-direction: column; }
    .info strong {
      font-family: var(--display); font-variation-settings: 'wdth' 84;
      font-weight: 700; font-size: 16px; overflow-wrap: anywhere;
    }
    .info .meta { color: var(--muted); font-size: 13px; }

    .fields { flex: 1; display: flex; gap: 10px; flex-wrap: wrap; min-width: 200px; }
    .field { display: flex; flex-direction: column; gap: 2px; }
    .field label { margin: 0; font-size: 10px; }
    .cell-input { width: auto; min-width: 92px; padding: 6px 9px; font-size: 14px; }
    .field .muted { padding: 6px 0; }

    @media (max-width: 640px) {
      .screen-pick { width: 100%; }
      .screen-pick select { flex: 1; min-width: 0; }
      .loop { margin-left: 0; }
      .items li { gap: 10px; }
      .actions { width: 100%; padding-left: 36px; }
    }
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

  titleFor(item: PlaylistItem): string {
    const m = this.mediaFor(item.mediaId);
    return m?.advertiser || m?.originalName || 'Mídia removida';
  }

  durationLabel(item: PlaylistItem): string {
    return this.mediaFor(item.mediaId)?.type === 'video' ? 'vídeo completo' : `${item.duration}s`;
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

  loopLabel(): string {
    const total = this.loopSeconds();
    if (total < 60) return `${total}s`;
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return secs ? `${mins}min ${secs}s` : `${mins}min`;
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
