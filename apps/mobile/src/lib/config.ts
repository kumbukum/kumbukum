import { Capacitor } from "@capacitor/core";
import type { ServerOption } from "../types";

export const MOBILE_CLIENT_ID = "streamient-mobile";
export const NATIVE_REDIRECT_URI = "com.streamient.mobile://oauth/callback";
export const WEB_REDIRECT_URI = `${window.location.origin}/oauth/callback`;
export const MOBILE_SCOPES = "knowledge:read knowledge:write ai:chat profile:write";
export const APP_VERSION = "1.0.0";

export function serverOption(value: string, hosted = false, name = "Custom server"): ServerOption {
	const baseUrl = normalizeServerUrl(value);
	return { baseUrl, hosted, name, resourceUrl: `${baseUrl}/api/v1` };
}

export const LOCAL_SERVER = serverOption(import.meta.env.VITE_STREAMIENT_SERVER || "http://s.lan", false, "Local Streamient");
export const HOSTED_SERVER = serverOption("https://app.streamient.com", true, "Streamient Cloud");

export function normalizeServerUrl(value: string) {
	const allowHttp = import.meta.env.DEV || import.meta.env.VITE_ENABLE_LOCAL_SERVER === "true";
	const raw = String(value || "").trim();
	if (!raw) throw new Error("Server URL is required");
	const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
	if (url.protocol !== "https:" && !(allowHttp && url.protocol === "http:")) throw new Error("Custom servers must use HTTPS");
	if (url.username || url.password) throw new Error("Server URL cannot contain credentials");
	return url.origin.replace(/\/$/, "");
}

export function oauthRedirectUri() {
	return Capacitor.isNativePlatform() ? NATIVE_REDIRECT_URI : WEB_REDIRECT_URI;
}
