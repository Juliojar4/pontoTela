import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Media } from '../../core/models';
import { MediaService } from '../../core/media.service';

@Component({
  selector: 'app-media',
  imports: [FormsModule],
  template: `
    <div class="card">
      <h2>Enviar mídia</h2>
      <div class="row">
        <div>
          <label>Arquivo (imagem ou vídeo)</label>
          <input type="file" accept="image/*,video/*" (change)="onFile($event)" #fileInput />
        </div>
        <div><label>Anunciante</label><input [(ngModel)]="advertiser" placeholder="Pizzaria do João" /></div>
      </div>
      <button class="primary" (click)="upload(fileInput)" [disabled]="uploading()">
        {{ uploading() ? 'Enviando…' : 'Enviar' }}
      </button>
    </div>
    <div class="card">
      <h2>Biblioteca</h2>
      @if (media().length) {
        <div class="table-wrap">
          <table>
            <tr><th></th><th>Anunciante</th><th>Arquivo</th><th>Tipo</th><th></th></tr>
            @for (m of media(); track m.id) {
              <tr>
                <td>
                  @if (m.type === 'image') {
                    <img class="thumb" [src]="'/uploads/' + m.filename" />
                  } @else {
                    🎬
                  }
                </td>
                <td>{{ m.advertiser || '—' }}</td>
                <td class="muted">{{ m.originalName }}</td>
                <td><span class="tag">{{ m.type }}</span></td>
                <td><button class="del" (click)="remove(m.id)">excluir</button></td>
              </tr>
            }
          </table>
        </div>
      } @else {
        <div class="empty">Nenhuma mídia enviada.</div>
      }
    </div>
  `,
})
export class MediaComponent implements OnInit {
  readonly media = signal<Media[]>([]);
  readonly uploading = signal(false);
  advertiser = '';
  private file: File | null = null;

  constructor(private mediaService: MediaService) {}

  async ngOnInit(): Promise<void> {
    await this.refresh();
  }

  async refresh(): Promise<void> {
    this.media.set(await this.mediaService.list());
  }

  onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.file = input.files?.[0] ?? null;
  }

  async upload(fileInput: HTMLInputElement): Promise<void> {
    if (!this.file) { alert('Escolha um arquivo'); return; }
    this.uploading.set(true);
    try {
      await this.mediaService.upload(this.file, this.advertiser.trim());
      this.advertiser = '';
      this.file = null;
      fileInput.value = '';
      await this.refresh();
    } finally {
      this.uploading.set(false);
    }
  }

  async remove(id: string): Promise<void> {
    if (!confirm('Excluir esta mídia?')) return;
    await this.mediaService.remove(id);
    await this.refresh();
  }
}
