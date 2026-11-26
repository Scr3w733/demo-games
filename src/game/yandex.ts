// Обёртка над SDK Яндекс Игр. Если игра открыта не внутри Яндекса,
// все методы безопасно возвращают false — работает демо-режим.

interface YandexPlayer {
  getName(): string;
  getAvatarSrc(size: 'small' | 'medium' | 'large'): string;
  getUniqueId(): string;
}

interface YandexBanner {
  show(): void;
  hide(): void;
  destroy(): void;
}

interface YandexSDK {
  player?: { get(): Promise<YandexPlayer> };
  ads?: {
    showRewardedVideo(id: string): Promise<unknown>;
    showInterstitial(id: string): Promise<unknown>;
  };
  banner?: { create(id: string): Promise<YandexBanner> };
  leaderboards?: { setScore(name: string, score: number): Promise<unknown> };
  advanced?: { isDesktop?(): boolean };
  environment?: { isMobile?(): boolean };
}

declare global {
  interface Window {
    YaGames?: { init(): Promise<YandexSDK> };
  }
}

export const AD = {
  revive: 'revive',
  chest: 'chest',
  interstitial: 'gameover',
  banner: 'menu_banner',
} as const;

export const LEADERBOARD = 'grimhollow_best';

/** Загрузку SDK разрешаем только для доверенных origin'ов Яндекса. */
function isTrustedYandexOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    return host === 'yandexgames.net'
      || host === 'yandex.ru' || host.endsWith('.yandex.ru')
      || host === 'ya.ru' || host.endsWith('.ya.ru')
      || host === 'yandex.com' || host.endsWith('.yandex.com')
      || host === 'yandex.kz' || host.endsWith('.yandex.kz')
      || host === 'yandex.by' || host.endsWith('.yandex.by')
      || host === 'yandex.com.tr' || host.endsWith('.yandex.com.tr');
  } catch {
    return false;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => { window.clearTimeout(timer); resolve(value); },
      () => { window.clearTimeout(timer); resolve(null); },
    );
  });
}

export class Yandex {
  ready = false;
  playerName = '';
  playerAvatar = '';
  private sdk: YandexSDK | null = null;
  private banner: YandexBanner | null = null;

  private async loadSdk(): Promise<void> {
    // Вне Яндекс Игр не делаем внешних запросов — игра работает в демо-режиме.
    // Простое window.parent !== window trusting любой iframe, поэтому проверяем
    // реальный origin родителя (Chromium) или точный host реферера.
    const ancestors = window.location.ancestorOrigins;
    const inTrustedFrame = ancestors
      ? Array.from(ancestors).some(isTrustedYandexOrigin)
      : (window.parent !== window && isTrustedYandexOrigin(document.referrer));
    if (!inTrustedFrame) return;
    await new Promise<void>((resolve) => {
      const script = document.createElement('script');
      const timer = window.setTimeout(resolve, 3000);
      script.src = 'https://yandexgames.net/sdk/game.js';
      script.async = true;
      script.onload = () => { window.clearTimeout(timer); resolve(); };
      script.onerror = () => { window.clearTimeout(timer); resolve(); };
      document.head.appendChild(script);
    });
  }

  async init(): Promise<void> {
    if (!window.YaGames) await this.loadSdk();
    if (!window.YaGames) return;
    const sdk = await withTimeout(window.YaGames.init(), 4000);
    if (!sdk) return;
    this.sdk = sdk;
    this.ready = true;

    if (sdk.player) {
      const player = await withTimeout(sdk.player.get(), 2000);
      if (player) {
        const name = player.getName();
        this.playerName = typeof name === 'string'
          ? name.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 80)
          : '';
        const avatar = player.getAvatarSrc('small');
        this.playerAvatar = typeof avatar === 'string' ? avatar.slice(0, 2048) : '';
      }
    }

    if (sdk.banner) {
      try {
        this.banner = await sdk.banner.create(AD.banner);
      } catch {
        this.banner = null;
      }
    }
  }

  showBanner(): void {
    try { this.banner?.show(); } catch { /* баннер необязателен */ }
  }

  hideBanner(): void {
    try { this.banner?.hide(); } catch { /* баннер необязателен */ }
  }

  isMobile(): boolean {
    return this.sdk?.environment?.isMobile?.() ?? ('ontouchstart' in window);
  }

  async rewarded(id: string): Promise<boolean> {
    if (!this.sdk?.ads) return false;
    try {
      const result = await withTimeout(this.sdk.ads.showRewardedVideo(id), 30000);
      if (result === null || result instanceof Error) return false;
      if (typeof result === 'object' && result !== null && 'shown' in result) {
        return Boolean((result as { shown?: boolean }).shown);
      }
      return true;
    } catch {
      return false;
    }
  }

  async interstitial(id: string): Promise<void> {
    if (!this.sdk?.ads) return;
    try {
      await withTimeout(this.sdk.ads.showInterstitial(id), 15000);
    } catch {
      // Реклама не должна ломать игру.
    }
  }

  async setScore(score: number): Promise<void> {
    if (!this.sdk?.leaderboards) return;
    try {
      await withTimeout(this.sdk.leaderboards.setScore(LEADERBOARD, Math.round(score)), 5000);
    } catch {
      // Лидерборд может быть не настроен в консоли — это не критично.
    }
  }
}
