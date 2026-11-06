import { DatePipe } from '@angular/common';
import { Component, ElementRef, EventEmitter, Input, Output, ViewChild, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MediaService } from '../core/media.service';
import { Media } from '../core/models';

export type MediaKind = 'all' | Media['type'];

const normalize = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Mais recentes primeiro; a busca ignora acentos e olha anunciante e nome do arquivo. */
export function filterMedia(items: Media[], query: string, kind: MediaKind): Media[] {
  const q = normalize(query.trim());
  return items
    .filter((m) => kind === 'all' || m.type === kind)
    .filter((m) => normalize(`${m.advertiser} ${m.originalName}`).includes(q))
    .sort((a, b) => b.createdAt - a.createdAt);
}

@Component({
  selector: 'app-media-picker',
  imports: [DatePipe, FormsModule],
  template: `
    <button type="button" class="trigger" (click)="openModal()">
      @for (m of selected().slice(0, 3); track m.id) {
        <span class="thumb">
          @if (m.type === 'image') {
            <img [src]="'/uploads/' + m.filename" alt="" />
          } @else {
            <video [src]="'/uploads/' + m.filename + '#t=0.1'" preload="metadata" muted playsinline></video>
            <span class="play">▶</span>
          }
        </span>
      }
      <span class="label" [class.muted]="!selected().length">{{ triggerLabel() }}</span>
      <span class="cta">{{ selected().length ? 'trocar' : 'escolher' }}</span>
    </button>

    <dialog #dialog aria-labelledby="media-modal-title" (close)="open.set(false)" (click)="onDialogClick($event)">
      <div class="frame">
        <header>
          <h2 id="media-modal-title">Selecionar mídia</h2>
          <button type="button" class="close" aria-label="Fechar" (click)="closeModal()">✕</button>
        </header>

        @if (open()) {
          <div class="tabs" role="tablist">
            <button type="button" role="tab" [attr.aria-selected]="tab() === 'upload'" (click)="tab.set('upload')">Enviar arquivo</button>
            <button type="button" role="tab" [attr.aria-selected]="tab() === 'library'" (click)="tab.set('library')">Biblioteca de mídia</button>
          </div>

          @if (tab() === 'library') {
            <div class="library">
              <div class="browser">
                <div class="toolbar">
                  <select aria-label="Filtrar por tipo" [ngModel]="kind()" (ngModelChange)="kind.set($event)">
                    <option value="all">Todas as mídias</option>
                    <option value="image">Imagens</option>
                    <option value="video">Vídeos</option>
                  </select>
                  <input type="search" aria-label="Buscar mídia" placeholder="Buscar por anunciante ou arquivo…"
                    [ngModel]="query()" (ngModelChange)="query.set($event)" />
                </div>
                <div class="grid">
                  @for (m of visible(); track m.id) {
                    <button type="button" class="tile" [class.active]="draft().includes(m.id)"
                      [attr.aria-pressed]="draft().includes(m.id)" [title]="m.advertiser || m.originalName"
                      (click)="toggle(m.id)" (dblclick)="add(m.id); confirm()">
                      @if (m.type === 'image') {
                        <img [src]="'/uploads/' + m.filename" [alt]="m.advertiser || m.originalName" loading="lazy" />
                      } @else {
                        <video [src]="'/uploads/' + m.filename + '#t=0.1'" preload="metadata" muted playsinline></video>
                        <span class="play">▶</span>
                      }
                      @if (draft().includes(m.id)) { <span class="check">✓</span> }
                    </button>
                  } @empty {
                    <div class="empty">
                      @if (items.length) {
                        Nenhuma mídia encontrada.
                      } @else {
                        Nenhuma mídia enviada ainda.<br />
                        <button type="button" class="ghost" (click)="tab.set('upload')">Enviar a primeira</button>
                      }
                    </div>
                  }
                </div>
              </div>

              <aside>
                @if (highlighted(); as m) {
                  <div class="preview">
                    @if (m.type === 'image') {
                      <img [src]="'/uploads/' + m.filename" [alt]="m.advertiser || m.originalName" />
                    } @else {
                      <video [src]="'/uploads/' + m.filename" controls preload="metadata" playsinline></video>
                    }
                  </div>
                  <dl>
                    <dt>Anunciante</dt><dd>{{ m.advertiser || 'Sem anunciante' }}</dd>
                    <dt>Arquivo</dt><dd>{{ m.originalName }}</dd>
                    <dt>Tipo</dt><dd>{{ m.type === 'video' ? 'Vídeo' : 'Imagem' }}</dd>
                    <dt>Enviado em</dt><dd>{{ m.createdAt | date: 'dd/MM/yyyy' }}</dd>
                  </dl>
                } @else {
                  <p class="hint">Clique nas mídias para selecionar uma ou várias.</p>
                }
              </aside>
            </div>
          } @else {
            <div class="upload">
              <label class="drop" [class.over]="dragging()" [class.filled]="file()"
                (dragover)="$event.preventDefault(); dragging.set(true)" (dragleave)="dragging.set(false)" (drop)="onDrop($event)">
                <input type="file" accept="image/*,video/*" (change)="onFile($event)" />
                <strong>{{ file()?.name || 'Arraste um arquivo para cá' }}</strong>
                <span>{{ file() ? 'clique para trocar' : 'ou clique para procurar uma imagem ou vídeo' }}</span>
              </label>
              <div class="advertiser">
                <label for="media-modal-advertiser">Anunciante</label>
                <input id="media-modal-advertiser" [(ngModel)]="advertiser" placeholder="Pizzaria do João" />
              </div>
              @if (uploadError(); as error) { <p class="error" role="alert">{{ error }}</p> }
              <button type="button" class="primary inline" [disabled]="!file() || uploading()" (click)="upload()">
                {{ uploading() ? 'Enviando…' : 'Enviar' }}
              </button>
            </div>
          }

          <footer>
            @if (draft().length) {
              <span class="count">{{ draft().length }} {{ draft().length === 1 ? 'selecionada' : 'selecionadas' }}</span>
              <button type="button" class="clear" (click)="draft.set([])">Limpar</button>
            }
            <button type="button" class="primary inline" [disabled]="!draft().length" (click)="confirm()">Selecionar</button>
          </footer>
        }
      </div>
    </dialog>
  `,
  styles: [`
    .trigger {
      width: 100%; display: flex; align-items: center; gap: 10px; text-align: left;
      background: var(--surface); border: 1px solid var(--line); color: var(--txt);
      padding: 6px 12px; border-radius: var(--r); font-size: 15px; cursor: pointer;
      font-family: inherit; min-height: 44px; transition: border-color .15s;
    }
    .trigger:hover { border-color: var(--green); }
    .label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .label.muted { color: var(--muted); }
    .cta {
      flex: none; font-family: var(--display); font-variation-settings: 'wdth' 90;
      font-weight: 700; font-size: 11px; letter-spacing: .07em; text-transform: uppercase;
      color: var(--green-deep);
    }
    .thumb {
      width: 56px; height: 36px; border-radius: var(--r); background: var(--ink);
      position: relative; overflow: hidden; flex: none;
    }
    .thumb + .thumb { margin-left: -48px; box-shadow: -2px 0 0 var(--surface); }
    .thumb img, .thumb video, .tile img, .tile video { width: 100%; height: 100%; object-fit: cover; display: block; }
    .play {
      position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
      color: #fff; font-size: 12px; text-shadow: 0 1px 3px rgba(0,0,0,.9); pointer-events: none;
    }

    dialog {
      width: min(1100px, calc(100vw - 32px)); height: min(760px, calc(100dvh - 32px));
      max-width: none; max-height: none; padding: 0; overflow: hidden;
      border: 1px solid var(--line); border-radius: var(--r);
      background: var(--surface); color: var(--txt); box-shadow: var(--shadow-lg);
    }
    dialog::backdrop { background: rgba(16, 21, 17, .55); }
    .frame { height: 100%; display: flex; flex-direction: column; min-height: 0; }

    header { display: flex; align-items: center; justify-content: space-between; padding: 14px 20px; flex: none; }
    header h2 { margin: 0; font-size: 20px; font-variation-settings: 'wdth' 84; }
    .close {
      width: 36px; height: 36px; background: transparent; border: 1px solid transparent; border-radius: var(--r);
      color: var(--muted); font-size: 16px; cursor: pointer;
    }
    .close:hover { color: var(--txt); border-color: var(--line); }

    .tabs { display: flex; gap: 4px; padding: 0 20px; border-bottom: 1px solid var(--line); flex: none; }
    .tabs button {
      background: transparent; border: 1px solid transparent; border-bottom: none; margin-bottom: -1px;
      padding: 9px 14px; font-size: 14px; font-weight: 600; color: var(--muted); cursor: pointer;
      border-radius: var(--r) var(--r) 0 0;
    }
    .tabs button:hover { color: var(--green-deep); }
    .tabs button[aria-selected='true'] { background: var(--surface); border-color: var(--line); color: var(--txt); }

    .library { flex: 1; min-height: 0; display: flex; }
    .browser { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .toolbar { display: flex; gap: 10px; padding: 14px 20px; flex: none; }
    .toolbar select { flex: 0 0 180px; }
    .toolbar input { flex: 1; min-width: 0; }
    .grid {
      flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 4px 20px 20px;
      display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 10px; align-content: start;
    }
    .tile {
      position: relative; aspect-ratio: 1; padding: 0; overflow: hidden; cursor: pointer;
      background: var(--ink); border: 1px solid var(--line); border-radius: var(--r);
    }
    .tile:hover { outline: 2px solid var(--line); }
    .tile.active { outline: 3px solid var(--green); outline-offset: 1px; }
    .check {
      position: absolute; top: 6px; right: 6px; width: 24px; height: 24px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      background: var(--green); color: #fff; font-size: 14px; font-weight: 700;
    }
    .empty { grid-column: 1 / -1; padding: 48px 12px; text-align: center; color: var(--muted); line-height: 2; }

    aside {
      flex: 0 0 280px; overflow-y: auto; padding: 16px; background: var(--paper);
      border-left: 1px solid var(--line);
    }
    .preview { background: var(--ink); border-radius: var(--r); overflow: hidden; }
    .preview img, .preview video { width: 100%; max-height: 200px; object-fit: contain; display: block; }
    dl { margin: 14px 0 0; font-size: 14px; }
    dt {
      font-family: var(--display); font-variation-settings: 'wdth' 90; font-weight: 700; font-size: 11px;
      letter-spacing: .07em; text-transform: uppercase; color: var(--muted); margin-top: 10px;
    }
    dd { margin: 2px 0 0; overflow-wrap: anywhere; }
    .hint { color: var(--muted); font-size: 14px; margin: 0; }

    .upload {
      flex: 1; min-height: 0; overflow-y: auto; padding: 24px 20px;
      display: flex; flex-direction: column; align-items: center; gap: 16px;
    }
    .drop {
      position: relative; width: 100%; max-width: 640px; min-height: 220px; margin: 0; padding: 24px; cursor: pointer;
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; text-align: center;
      background: var(--paper); border: 2px dashed var(--line); border-radius: var(--r);
      font-family: var(--body); font-size: 14px; font-weight: 400; letter-spacing: 0; text-transform: none;
      transition: border-color .15s, background .15s;
    }
    .drop strong { font-size: 18px; color: var(--txt); overflow-wrap: anywhere; }
    .drop:hover, .drop.over { border-color: var(--green); }
    .drop:focus-within { border-color: var(--green); box-shadow: 0 0 0 3px rgba(31, 157, 90, .18); }
    .drop.over, .drop.filled { background: var(--green-soft); }
    .drop input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
    .advertiser { width: 100%; max-width: 640px; }
    .error { margin: 0; color: var(--danger); font-size: 14px; }

    footer { display: flex; align-items: center; justify-content: flex-end; gap: 12px; padding: 12px 20px; border-top: 1px solid var(--line); flex: none; }

    .count { font-size: 14px; color: var(--muted); }
    .clear { background: none; border: none; padding: 4px; margin-right: auto; color: var(--green-deep); font-size: 14px; cursor: pointer; text-decoration: underline; }

    @media (max-width: 720px) {
      dialog { width: 100vw; height: 100dvh; border: none; border-radius: 0; }
      .library { flex-direction: column; }
      .browser { min-height: 0; }
      .toolbar { padding: 12px 16px; }
      .toolbar select { flex-basis: 130px; }
      .grid { padding: 4px 16px 16px; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); }
      aside {
        flex: 0 0 auto; max-height: 30dvh; padding: 10px 16px;
        border-left: none; border-top: 1px solid var(--line);
      }
      .preview { display: none; }
      dl { margin: 0; }
      dt:first-child { margin-top: 0; }
    }
  `],
})
export class MediaPickerComponent {
  @Input() items: Media[] = [];
  @Input() value: string[] = [];
  @Output() valueChange = new EventEmitter<string[]>();
  @Output() uploaded = new EventEmitter<Media>();

  @ViewChild('dialog') private dialog!: ElementRef<HTMLDialogElement>;

  readonly open = signal(false);
  readonly tab = signal<'library' | 'upload'>('library');
  readonly query = signal('');
  readonly kind = signal<MediaKind>('all');
  /** Seleção em andamento, na ordem dos cliques; só vale ao confirmar. */
  readonly draft = signal<string[]>([]);
  readonly file = signal<File | null>(null);
  readonly dragging = signal(false);
  readonly uploading = signal(false);
  readonly uploadError = signal('');
  advertiser = '';

  constructor(private mediaService: MediaService) {}

  selected(): Media[] {
    return this.value.flatMap((id) => this.items.find((m) => m.id === id) ?? []);
  }

  triggerLabel(): string {
    const selected = this.selected();
    if (!selected.length) return 'Selecione uma ou mais mídias';
    return selected.length === 1 ? selected[0].advertiser || selected[0].originalName : `${selected.length} mídias`;
  }

  /** O painel de detalhes mostra a última mídia marcada. */
  highlighted(): Media | undefined {
    return this.items.find((m) => m.id === this.draft().at(-1));
  }

  toggle(id: string): void {
    this.draft.update((ids) => (ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]));
  }

  add(id: string): void {
    if (!this.draft().includes(id)) this.toggle(id);
  }

  visible(): Media[] {
    return filterMedia(this.items, this.query(), this.kind());
  }

  openModal(): void {
    this.tab.set('library');
    this.query.set('');
    this.kind.set('all');
    this.draft.set([...this.value]);
    this.uploadError.set('');
    this.open.set(true);
    this.dialog.nativeElement.showModal();
  }

  closeModal(): void {
    this.dialog.nativeElement.close();
  }

  onDialogClick(event: MouseEvent): void {
    if (event.target === this.dialog.nativeElement) this.closeModal();
  }

  confirm(): void {
    if (!this.draft().length) return;
    this.valueChange.emit(this.draft());
    this.closeModal();
  }

  onFile(event: Event): void {
    this.pick((event.target as HTMLInputElement).files?.[0]);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    this.pick(event.dataTransfer?.files[0]);
  }

  async upload(): Promise<void> {
    const file = this.file();
    if (!file) return;
    this.uploading.set(true);
    this.uploadError.set('');
    try {
      const media = await this.mediaService.upload(file, this.advertiser.trim());
      this.uploaded.emit(media);
      this.file.set(null);
      this.advertiser = '';
      this.query.set('');
      this.kind.set('all');
      this.add(media.id);
      this.tab.set('library');
    } catch {
      this.uploadError.set('Falha ao enviar a mídia.');
    } finally {
      this.uploading.set(false);
    }
  }

  // Erros ficam no próprio modal: os toasts renderizam atrás do <dialog> (top layer).
  private pick(file: File | undefined): void {
    if (!file) return;
    if (!/^(image|video)\//.test(file.type)) {
      this.uploadError.set('Escolha uma imagem ou um vídeo.');
      return;
    }
    this.uploadError.set('');
    this.file.set(file);
  }
}
