import { ApplicationConfig, provideBrowserGlobalErrorListeners, isDevMode } from '@angular/core';
import { provideServiceWorker } from '@angular/service-worker';
import { provideHttpClient } from '@angular/common/http';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(),
    // Servido tambem na raiz pelo server.js: so com escopo '/' o service worker
    // consegue controlar as URLs curtas do player (/1, /2) e manter o cache offline.
    provideServiceWorker('/ngsw-worker.js', {
      enabled: !isDevMode(),
      scope: '/',
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
