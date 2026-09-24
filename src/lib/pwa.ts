/** Client-only helpers for Home Screen / PWA install UX. */

export function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) return true;
  return window.matchMedia("(display-mode: standalone)").matches;
}

export function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ may report as Mac with touch
  return (
    navigator.platform === "MacIntel" &&
    typeof navigator.maxTouchPoints === "number" &&
    navigator.maxTouchPoints > 1
  );
}

export function isSafariBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // Chrome/Firefox/Edge on iOS include CriOS/FxiOS/EdgiOS
  if (/CriOS|FxiOS|EdgiOS|OPiOS|OPT\//.test(ua)) return false;
  return /Safari/.test(ua) && !/Chrome|Chromium|Android/.test(ua);
}

export const INSTALL_DISMISS_KEY = "gridiron-iq-install-dismissed";
export const INSTALL_OPEN_EVENT = "gridiron-iq:open-install";
/** Soft install banner visibility — trade sticky CTAs listen to clear the button. */
export const INSTALL_BANNER_EVENT = "gridiron-iq:install-banner";
export const INSTALL_BANNER_OFFSET_VAR = "--install-banner-offset";
/** Approximate soft-banner height above the tab bar (card + padding). */
export const INSTALL_BANNER_OFFSET = "4.75rem";

export function setInstallBannerOffset(visible: boolean): void {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty(
    INSTALL_BANNER_OFFSET_VAR,
    visible ? INSTALL_BANNER_OFFSET : "0px",
  );
  window.dispatchEvent(
    new CustomEvent(INSTALL_BANNER_EVENT, { detail: { visible } }),
  );
}

export function wasInstallDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(INSTALL_DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissInstallPrompt(): void {
  try {
    window.localStorage.setItem(INSTALL_DISMISS_KEY, "1");
  } catch {
    /* ignore quota / private mode */
  }
  setInstallBannerOffset(false);
}

export function openInstallGuide(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(INSTALL_OPEN_EVENT));
}
