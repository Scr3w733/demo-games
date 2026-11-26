import './../styles/fonts.css';
import './../styles/common.css';
import './../styles/landing.css';

const FALLBACK_GAME_URL = 'https://yandex.ru/games/app/PLACEHOLDER';
const COPY_RESET_DELAY_MS = 2200;

type StatusState = 'ok' | 'error';

function getGameUrl(): string {
  const gameLink: HTMLAnchorElement | null = document.querySelector<HTMLAnchorElement>('[data-game-url]');
  const configuredUrl: string = gameLink?.dataset.gameUrl ?? gameLink?.href ?? '';
  return configuredUrl.trim() || FALLBACK_GAME_URL;
}

function updateFooterYear(): void {
  const yearNodes: NodeListOf<HTMLElement> = document.querySelectorAll<HTMLElement>('[data-year]');
  const currentYear: string = String(new Date().getFullYear());

  yearNodes.forEach((node: HTMLElement): void => {
    node.textContent = currentYear;
  });
}

function setupAnchorScroll(): void {
  const reduceMotion: MediaQueryList = window.matchMedia('(prefers-reduced-motion: reduce)');
  const anchors: NodeListOf<HTMLAnchorElement> = document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]');

  anchors.forEach((anchor: HTMLAnchorElement): void => {
    anchor.addEventListener('click', (event: MouseEvent): void => {
      const href: string | null = anchor.getAttribute('href');
      if (href === null || href === '#') {
        return;
      }

      const target: HTMLElement | null = document.getElementById(href.slice(1));
      if (target === null) {
        return;
      }

      event.preventDefault();
      target.scrollIntoView({
        behavior: reduceMotion.matches ? 'auto' : 'smooth',
        block: 'start',
      });
      window.history.replaceState(null, '', href);

      if (!target.hasAttribute('tabindex')) {
        target.setAttribute('tabindex', '-1');
      }
      target.focus({ preventScroll: true });
    });
  });
}

async function writeToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard !== undefined) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Clipboard API может быть недоступен — пробуем запасной способ ниже.
  }

  try {
    const textarea: HTMLTextAreaElement = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const copied: boolean = document.execCommand('copy');
    textarea.remove();
    return copied;
  } catch {
    return false;
  }
}

function setupCopyLink(): void {
  const buttons: NodeListOf<HTMLButtonElement> = document.querySelectorAll<HTMLButtonElement>('[data-copy-link]');
  const statusNodes: NodeListOf<HTMLElement> = document.querySelectorAll<HTMLElement>('[data-copy-status]');

  const setStatus = (message: string, state: StatusState): void => {
    statusNodes.forEach((node: HTMLElement): void => {
      node.textContent = message;
      node.dataset.state = state;
    });
  };

  buttons.forEach((button: HTMLButtonElement): void => {
    button.addEventListener('click', async (): Promise<void> => {
      const url: string = getGameUrl();
      const copied: boolean = await writeToClipboard(url);

      setStatus(
        copied ? `Ссылка скопирована: ${url}` : `Не удалось скопировать. Ссылка: ${url}`,
        copied ? 'ok' : 'error',
      );

      if (!copied) {
        return;
      }

      button.dataset.copied = 'true';
      window.setTimeout((): void => {
        delete button.dataset.copied;
      }, COPY_RESET_DELAY_MS);
    });
  });
}

function initLanding(): void {
  updateFooterYear();
  setupAnchorScroll();
  setupCopyLink();
}

initLanding();
