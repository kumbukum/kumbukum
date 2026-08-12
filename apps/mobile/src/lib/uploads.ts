import type { StreamientApi } from "./api";
import { uriChunk, uriSize } from "./nativeFile";
import type { UploadSession } from "../types";

export type UploadSource = Blob | { uri: string; name: string; mimeType: string };
export type SavedUpload = { local_id: string; session: UploadSession; source_kind: "blob" | "uri"; uri?: string; name: string; mime_type: string };

const REGISTRY_KEY = "streamient_upload_registry";
const DB_NAME = "streamient-mobile";
const STORE_NAME = "uploads";

function registry(): SavedUpload[] {
	try {
		return JSON.parse(localStorage.getItem(REGISTRY_KEY) || "[]") as SavedUpload[];
	} catch {
		return [];
	}
}

function saveRegistry(items: SavedUpload[]) {
	localStorage.setItem(REGISTRY_KEY, JSON.stringify(items));
}

function openDatabase() {
	return new Promise<IDBDatabase>((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, 1);
		request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME); };
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

async function storeBlob(key: string, blob: Blob) {
	const db = await openDatabase();
	await new Promise<void>((resolve, reject) => {
		const transaction = db.transaction(STORE_NAME, "readwrite");
		transaction.objectStore(STORE_NAME).put(blob, key);
		transaction.oncomplete = () => resolve();
		transaction.onerror = () => reject(transaction.error);
	});
	db.close();
}

async function loadBlob(key: string) {
	const db = await openDatabase();
	const value = await new Promise<Blob | null>((resolve, reject) => {
		const request = db.transaction(STORE_NAME).objectStore(STORE_NAME).get(key);
		request.onsuccess = () => resolve(request.result as Blob || null);
		request.onerror = () => reject(request.error);
	});
	db.close();
	return value;
}

async function removeBlob(key: string) {
	const db = await openDatabase();
	await new Promise<void>((resolve, reject) => {
		const transaction = db.transaction(STORE_NAME, "readwrite");
		transaction.objectStore(STORE_NAME).delete(key);
		transaction.oncomplete = () => resolve();
		transaction.onerror = () => reject(transaction.error);
	});
	db.close();
}

export async function sourceSize(source: UploadSource) {
	return source instanceof Blob ? source.size : uriSize(source.uri);
}

async function sourceChunk(source: UploadSource, offset: number, length: number) {
	return source instanceof Blob ? source.slice(offset, offset + length) : uriChunk(source.uri, offset, length);
}

async function checksum(blob: Blob) {
	const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()));
	let binary = "";
	for (const value of digest) binary += String.fromCharCode(value);
	return btoa(binary);
}

export async function rememberUpload(localId: string, session: UploadSession, source: UploadSource, name: string, mimeType: string) {
	const saved: SavedUpload = { local_id: localId, session, source_kind: source instanceof Blob ? "blob" : "uri", uri: source instanceof Blob ? undefined : source.uri, name, mime_type: mimeType };
	const items = registry().filter((item) => item.local_id !== localId);
	items.push(saved);
	saveRegistry(items);
	if (source instanceof Blob) await storeBlob(localId, source);
}

export async function updateRememberedUpload(localId: string, session: UploadSession) {
	const items = registry();
	const item = items.find((entry) => entry.local_id === localId);
	if (item) item.session = session;
	saveRegistry(items);
}

export async function forgetUpload(localId: string) {
	saveRegistry(registry().filter((item) => item.local_id !== localId));
	await removeBlob(localId).catch(() => undefined);
}

export async function restoreUploads() {
	const result: { saved: SavedUpload; source: UploadSource | null }[] = [];
	for (const saved of registry()) {
		const source = saved.source_kind === "uri" && saved.uri ? { uri: saved.uri, name: saved.name, mimeType: saved.mime_type } : await loadBlob(saved.local_id);
		result.push({ saved, source });
	}
	return result;
}

export async function uploadWithResume(api: StreamientApi, session: UploadSession, source: UploadSource, onUpdate: (session: UploadSession) => void, signal?: AbortSignal) {
	const status = await api.uploadStatus(session.id, true);
	let offset = status.upload_offset;
	if (status.state !== "uploading") return api.uploadStatus(session.id);
	while (offset < session.upload_length) {
		if (signal?.aborted) throw new DOMException("Upload paused", "AbortError");
		const chunk = await sourceChunk(source, offset, Math.min(session.chunk_size, session.upload_length - offset));
		if (!chunk.size) throw new Error("The shared file ended before its expected size");
		offset = await api.uploadChunk(session.id, offset, session.upload_length, await checksum(chunk), chunk, signal);
		session = { ...session, upload_offset: offset, state: "uploading", updated_at: new Date().toISOString() };
		onUpdate(session);
	}
	session = (await api.completeUpload(session.id)).upload;
	onUpdate(session);
	return session;
}

export async function waitForProcessing(api: StreamientApi, session: UploadSession, onUpdate: (session: UploadSession) => void, signal?: AbortSignal) {
	while (["uploading", "processing"].includes(session.state)) {
		if (signal?.aborted) throw new DOMException("Monitoring paused", "AbortError");
		await new Promise((resolve) => window.setTimeout(resolve, 1500));
		session = await api.uploadStatus(session.id);
		onUpdate(session);
	}
	return session;
}
