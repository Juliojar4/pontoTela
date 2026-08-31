import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Media } from '../../core/models';
import { MediaService } from '../../core/media.service';
import { UiService } from '../../core/ui.service';

@Component({
  selector: 'app-media',
  imports: [FormsModule],
  template: `
    <div class="page-head">
      <h1>Mídias</h1>
      <span class="sub">{{ media().length }} na biblioteca</span>
    </div>

    <div class="card">
      <h2>Enviar mídia</h2>
      <div class="row">
        <div>
          <label>Arquivo</label>
          <label class="file-drop" [class.filled]="fileName()">
            <input type="file" accept="image/*,video/*" (change)="onFile($event)" #fileInput />
            <span class="file-name">{{ fileName() || 'Escolher imagem ou vídeo…' }}</span>
            <span class="file-cta">{{ fileName() ? 'trocar' : 'procurar' }}</span>
          </label>
        </div>
        <div><label>Anunciante</label><input [(ngModel)]="advertiser" placeholder="Pizzaria do João" /></div>
        <div class="tight">
          <button class="primary inline" (click)="upload(fileInput)" [disabled]="uploading()">
            {{ uploading() ? 'Enviando…' : 'Enviar' }}
          </button>
        </div>
      </div>
    </div>

    @if (media().length) {
      <div class="grid">
        @for (m of media(); track m.id) {
          <figure class="item">
            <div class="preview">
              @if (m.type === 'image') {
                <img [src]="'/uploads/' + m.filename" [alt]="m.advertiser || m.originalName" />
              } @else {
                <video [src]="'/uploads/' + m.filename + '#t=0.1'" preload="metadata" muted playsinline></video>
                <span class="play">▶</span>
              }
              <span class="tag kind">{{ m.type === 'video' ? 'vídeo' : 'imagem' }}</span>
            </div>
            <figcaption>
              <strong [title]="m.advertiser || 'Sem anunciante'">{{ m.advertiser || 'Sem anunciante' }}</strong>
              <span class="file">{{ m.originalName }}</span>
            </figcaption>
            <button class="del" (click)="remove(m.id)">excluir</button>
          </figure>
        }
      </div>
    } @else {
      <div class="card">
        <div class="empty">
          Nenhuma mídia enviada.<br />
          Envie a arte ou o vídeo do anunciante para poder colocá-lo na programação.
        </div>
      </div>
    }
  `,
  styles: [`
    .file-drop {
      display: flex; align-items: center; gap: 10px; cursor: pointer;
      background: var(--paper); border: 1px dashed var(--line); border-radius: var(--r);
      padding: 10px 12px; min-height: 44px; margin: 0;
      font-family: var(--body); font-size: 15px; text-transform: none; letter-spacing: 0;
      color: var(--muted); font-weight: 400; transition: border-color .15s, background .15s;
    }
    .file-drop:hover { border-color: var(--green); }
    .file-drop.filled { border-style: solid; background: var(--green-soft); border-color: var(--green); color: var(--txt); }
    .file-drop input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
    .file-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .file-cta {
      flex: none; font-family: var(--display); font-variation-settings: 'wdth' 90;
      font-weight: 700; font-size: 11px; letter-spacing: .07em; text-transform: uppercase;
      color: var(--green-deep);
    }

    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 18px; }
    .item {
      margin: 0; background: var(--surface); border: 1px solid var(--line); border-radius: var(--r);
      box-shadow: var(--shadow); overflow: hidden; display: flex; flex-direction: column;
     }
    .preview { position: relative; aspect-ratio: 16 / 9; max-height: 170px; background: var(--ink); flex: none; }
    .preview img, .preview video { width: 100%; height: 100%; max-height: 170px; object-fit: cover; display: block; }
    .preview .play {
      position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
      color: #fff; font-size: 22px; text-shadow: 0 2px 6px rgba(0,0,0,.8); pointer-events: none;
    }
    .tag.kind { position: absolute; top: 8px; left: 8px; background: rgba(236,232,222,.94); color: var(--txt); }

    figcaption { padding: 12px 14px 4px; display: flex; flex-direction: column; gap: 2px; min-height: 0; }
    figcaption strong {
      font-family: var(--display); font-variation-settings: 'wdth' 84; font-weight: 700;
      font-size: 16px;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    figcaption .file {
      color: var(--muted); font-size: 13px;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .item .del { align-self: flex-start; margin: auto 8px 8px; }
  `],
})
export class MediaComponent implements OnInit {
  readonly media = signal<Media[]>([]);
  readonly uploading = signal(false);
  readonly fileName = signal('');
  advertiser = '';
  private file: File | null = null;

  constructor(private mediaService: MediaService, private ui: UiService) {}

  async ngOnInit(): Promise<void> {
    await this.refresh();
  }

  async refresh(): Promise<void> {
    this.media.set(await this.mediaService.list());
  }

  onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.file = input.files?.[0] ?? null;
    this.fileName.set(this.file?.name ?? '');
  }

  async upload(fileInput: HTMLInputElement): Promise<void> {
    if (!this.file) { this.ui.toast('Escolha um arquivo', 'error'); return; }
    this.uploading.set(true);
    try {
      await this.mediaService.upload(this.file, this.advertiser.trim());
      this.advertiser = '';
      this.file = null;
      this.fileName.set('');
      fileInput.value = '';
      this.ui.toast('Mídia enviada.', 'success');
      await this.refresh();
    } catch {
      this.ui.toast('Falha ao enviar a mídia.', 'error');
    } finally {
      this.uploading.set(false);
    }
  }

  async remove(id: string): Promise<void> {
    if (!(await this.ui.confirm('Excluir esta mídia?'))) return;
    await this.mediaService.remove(id);
    this.ui.toast('Mídia excluída.', 'success');
    await this.refresh();
  }
}
