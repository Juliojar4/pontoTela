import { Component } from '@angular/core';
import { UiService } from '../core/ui.service';

@Component({
  selector: 'app-ui-host',
  template: `
    <div class="toasts">
      @for (t of ui.toasts(); track t.id) {
        <div class="toast" [class]="t.kind" (click)="ui.dismiss(t.id)">
          <span class="mark"></span>
          <span>{{ t.message }}</span>
        </div>
      }
    </div>
    @if (ui.confirmRequest(); as req) {
      <div class="overlay" (click)="ui.resolveConfirm(false)">
        <div class="dialog" (click)="$event.stopPropagation()">
          <p>{{ req.message }}</p>
          <div class="dialog-actions">
            <button class="ghost" (click)="ui.resolveConfirm(false)">Cancelar</button>
            <button class="danger" (click)="ui.resolveConfirm(true)">Confirmar</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .toasts {
      position: fixed; top: 18px; right: 18px; z-index: 1000;
      display: flex; flex-direction: column; gap: 10px; max-width: calc(100vw - 36px);
    }
    .toast {
      display: flex; align-items: center; gap: 10px;
      background: var(--surface); border: 1px solid var(--line); color: var(--txt);
      padding: 12px 16px; border-radius: var(--r); font-size: 15px;
      box-shadow: var(--shadow-lg); cursor: pointer; animation: slide-in .16s ease-out;
    }
    .toast .mark { width: 4px; align-self: stretch; border-radius: 2px; background: var(--muted); flex: none; }
    .toast.success .mark { background: var(--green); }
    .toast.error .mark { background: var(--danger); }
    .toast.error { border-color: #f0cec8; }
    @keyframes slide-in { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }

    .overlay {
      position: fixed; inset: 0; background: rgba(16, 21, 17, .45); z-index: 1001;
      display: flex; align-items: center; justify-content: center; padding: 18px;
    }
    .dialog {
      background: var(--surface); border: 1px solid var(--line); border-radius: var(--r);
      padding: 24px; width: 100%; max-width: 380px; box-shadow: var(--shadow-lg);
    }
    .dialog p { margin: 0 0 20px; font-size: 16px; color: var(--txt); }
    .dialog-actions { display: flex; justify-content: flex-end; gap: 8px; }
    button.danger {
      font-family: var(--display); font-variation-settings: 'wdth' 88; font-weight: 700;
      background: var(--danger); color: #fff; border: 1px solid var(--danger);
      padding: 8px 16px; border-radius: var(--r); cursor: pointer; font-size: 14px;
    }
  `],
})
export class UiHostComponent {
  constructor(readonly ui: UiService) {}
}
