import { SecureStorage } from "@aparajita/capacitor-secure-storage";
import { Capacitor } from "@capacitor/core";

const PREFIX = "streamient_mobile_";
let prefixReady: Promise<void> | null = null;

function ensurePrefix() {
	if (!prefixReady) prefixReady = SecureStorage.setKeyPrefix(PREFIX);
	return prefixReady;
}

export async function getStoredJson<T>(key: string): Promise<T | null> {
	if (Capacitor.isNativePlatform()) {
		await ensurePrefix();
		return await SecureStorage.get(key) as T | null;
	}
	const raw = localStorage.getItem(`${PREFIX}${key}`);
	return raw ? JSON.parse(raw) as T : null;
}

export async function setStoredJson<T>(key: string, value: T): Promise<void> {
	if (Capacitor.isNativePlatform()) {
		await ensurePrefix();
		await SecureStorage.set(key, value as never);
		return;
	}
	localStorage.setItem(`${PREFIX}${key}`, JSON.stringify(value));
}

export async function removeStoredValue(key: string): Promise<void> {
	if (Capacitor.isNativePlatform()) {
		await ensurePrefix();
		await SecureStorage.remove(key);
		return;
	}
	localStorage.removeItem(`${PREFIX}${key}`);
}
