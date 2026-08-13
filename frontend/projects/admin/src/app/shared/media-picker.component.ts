import { Component, ElementRef, EventEmitter, HostListener, Input, Output, signal } from '@angular/core';
import { Media } from '../core/models';

@Component({
  selector: 'app-media-picker',
  template: `
    <div class="picker">
      <button type="button" class="trigger" (click)="toggle()">
        @if (selected(); as m) {
          @if (m.type === 'image') {
            <img class="thumb" [src]="'/uploads/' + m.filename" />
          } @else {
            <span class="thumb video-thumb">
              <video [src]="'/uploads/' + m.filename + '#t=0.1'" preload="metadata" muted playsinline></video>
              <span class="play">▶</span>
            </span>
          }
          <span class="label">{{ m.advertiser || m.originalName }}</span>
        } @else {
          <span class="label muted">Selecione uma mídia</span>
        }
        <span class="chevron">▾</span>
      </button>
      @if (open()) {
        <div class="menu">
          @for (m of items; track m.id) {
            <button type="button" class="option" [class.active]="m.id === value" (click)="select(m)">
              @if (m.type === 'image') {
                <img class="thumb" [src]="'/uploads/' + m.filename" />
              } @else {
                <span class="thumb video-thumb">
                  <video [src]="'/uploads/' + m.filename + '#t=0.1'" preload="metadata" muted playsinline></video>
                  <span class="play">▶</span>
                </span>
              }
              <span class="label">{{ m.advertiser || m.originalName }}</span>
            </button>
          } @empty {
            <div class="empty-option">Nenhuma mídia enviada ainda.</div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .picker { position: relative; }
    .trigger {
      width: 100%; display: flex; align-items: center; gap: 10px; text-align: left;
      background: var(--bg); border: 1px solid var(--line); color: var(--txt);
      padding: 6px 11px; border-radius: 8px; font-size: 14px; cursor: pointer; font-family: inherit;
    }
    .trigger .label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .trigger .label.muted { color: var(--muted); }
    .chevron { color: var(--muted); font-size: 11px; flex-shrink: 0; }
    .video-thumb {
      width: 52px; height: 34px; border-radius: 5px; background: #000;
      position: relative; overflow: hidden; flex-shrink: 0; display: inline-block;
    }
    .video-thumb video { width: 100%; height: 100%; object-fit: cover; display: block; }
    .video-thumb .play {
      position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
      color: #fff; font-size: 10px; text-shadow: 0 1px 2px rgba(0,0,0,.9); pointer-events: none;
    }

    .menu {
      position: absolute; z-index: 20; top: calc(100% + 4px); left: 0; right: 0;
      background: var(--card); border: 1px solid var(--line); border-radius: 10px;
      max-height: 280px; overflow-y: auto; padding: 6px; box-shadow: 0 12px 28px rgba(0,0,0,.4);
    }
    .option {
      width: 100%; display: flex; align-items: center; gap: 10px; text-align: left;
      background: transparent; border: 0; color: var(--txt); padding: 7px 8px; border-radius: 7px;
      cursor: pointer; font-size: 13px; font-family: inherit;
    }
    .option:hover { background: var(--bg); }
    .option.active { background: var(--bg); outline: 1px solid var(--accent); }
    .option .label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .empty-option { padding: 10px 8px; color: var(--muted); font-size: 13px; }
  `],
})
export class MediaPickerComponent {
  @Input() items: Media[] = [];
  @Input() value = '';
  @Output() valueChange = new EventEmitter<string>();

  readonly open = signal(false);

  constructor(private elementRef: ElementRef<HTMLElement>) {}

  selected(): Media | undefined {
    return this.items.find((m) => m.id === this.value);
  }

  toggle(): void {
    this.open.update((v) => !v);
  }

  select(m: Media): void {
    this.valueChange.emit(m.id);
    this.open.set(false);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.elementRef.nativeElement.contains(event.target as Node)) {
      this.open.set(false);
    }
  }
}
