import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  message: string;
  kind: 'success' | 'error' | 'info';
}

interface ConfirmRequest {
  message: string;
  resolve: (ok: boolean) => void;
}

let toastId = 0;

@Injectable({ providedIn: 'root' })
export class UiService {
  readonly toasts = signal<Toast[]>([]);
  readonly confirmRequest = signal<ConfirmRequest | null>(null);

  toast(message: string, kind: Toast['kind'] = 'info'): void {
    const t: Toast = { id: ++toastId, message, kind };
    this.toasts.update((list) => [...list, t]);
    setTimeout(() => this.dismiss(t.id), 3500);
  }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }

  confirm(message: string): Promise<boolean> {
    return new Promise((resolve) => {
      this.confirmRequest.set({ message, resolve });
    });
  }

  resolveConfirm(ok: boolean): void {
    this.confirmRequest()?.resolve(ok);
    this.confirmRequest.set(null);
  }
}
