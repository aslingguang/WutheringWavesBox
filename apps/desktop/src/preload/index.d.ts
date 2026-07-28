import type { DesktopApi } from '@wwbox/contracts';

declare global {
  interface Window {
    wwbox: DesktopApi;
  }
}

export {};
