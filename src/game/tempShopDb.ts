import { getWeapon } from './config';
import type { ClassId } from './types';

/**
 * Локальное хранилище магазина временного оружия открытого мира.
 * Отдельный namespace: покупки живут только до выхода из забега и не попадают
 * в постоянный SaveData. Позже этот модуль заменяется HTTP-репозиторием.
 */
const KEY = 'grimhollow.tempshop.v1';
const MAX_PURCHASES = 24;

export interface TempWeaponEntry {
  weaponId: string;
  classId: ClassId;
  purchasedAt: number;
}

export interface TempShopState {
  /** Оружие, действующее до выхода из текущей игры. */
  active: TempWeaponEntry | null;
  /** История покупок забега — пригодится при переносе на сервер. */
  purchases: TempWeaponEntry[];
}

/** Товар витрины торговца; цена указывается в монетах текущего забега. */
export interface TempShopOffer {
  weaponId: string;
  name: string;
  description: string;
  price: number;
  color: string;
  kind: string;
}

/** Снимок для UI: не хранит ссылки на внутреннее состояние движка. */
export interface TempShopContext {
  coins: number;
  offers: TempShopOffer[];
  activeWeaponId: string | null;
}

const EMPTY: TempShopState = { active: null, purchases: [] };

function isEntry(value: unknown): value is TempWeaponEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<TempWeaponEntry>;
  if (typeof entry.weaponId !== 'string' || !/^[a-z0-9_]{1,48}$/.test(entry.weaponId)) return false;
  if (typeof entry.classId !== 'string' || !/^[a-z0-9_]{1,24}$/.test(entry.classId)) return false;
  if (typeof entry.purchasedAt !== 'number' || !Number.isFinite(entry.purchasedAt) || entry.purchasedAt < 0) return false;
  return getWeapon(entry.weaponId).id === entry.weaponId;
}

/** Синхронное чтение: покупка применяется в том же кадре, что и нажатие. */
export function loadTempShop(): TempShopState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { active: null, purchases: [] };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { active: null, purchases: [] };
    const state = parsed as Partial<TempShopState>;
    const active = isEntry(state.active) ? state.active : null;
    const purchases = Array.isArray(state.purchases)
      ? state.purchases.filter(isEntry).slice(-MAX_PURCHASES)
      : [];
    return { active, purchases };
  } catch {
    return { active: null, purchases: [] };
  }
}

export function saveTempShop(state: TempShopState): void {
  try {
    const clean: TempShopState = {
      active: isEntry(state.active) ? state.active : null,
      purchases: state.purchases.filter(isEntry).slice(-MAX_PURCHASES),
    };
    localStorage.setItem(KEY, JSON.stringify(clean));
  } catch {
    // Приватный режим или переполненный storage не должны ломать забег.
  }
}

/** Вызывается при выходе из игры: временное оружие не переживает забег. */
export function clearTempShop(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // См. saveTempShop.
  }
}

export { EMPTY as EMPTY_TEMP_SHOP };
