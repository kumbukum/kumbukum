import { useState } from "react";
import type { ServerOption } from "../types";
import { HOSTED_SERVER, LOCAL_SERVER, serverOption } from "../lib/config";
import { Icon } from "./Icon";

export function LoginScreen({ initialServer, loading, error, onLogin }: { initialServer: ServerOption; loading: boolean; error: string; onLogin: (server: ServerOption) => void }) {
	const [choice, setChoice] = useState(initialServer.hosted ? "hosted" : initialServer.baseUrl === LOCAL_SERVER.baseUrl ? "local" : "custom");
	const [customUrl, setCustomUrl] = useState(initialServer.hosted || initialServer.baseUrl === LOCAL_SERVER.baseUrl ? "" : initialServer.baseUrl);
	const submit = () => {
		if (choice === "hosted") return onLogin(HOSTED_SERVER);
		if (choice === "local") return onLogin(LOCAL_SERVER);
		onLogin(serverOption(customUrl));
	};
	return <main className="login-screen">
		<div className="login-brand"><span className="brand-mark">S</span><span>Streamient</span></div>
		<section className="login-card">
			<div className="login-icon"><Icon name="auto_awesome" /></div>
			<h1>Your knowledge, everywhere</h1>
			<p>Notes, memories, URLs, email, and AI—ready when you are.</p>
			<div className="server-options">
				<label className={choice === "hosted" ? "selected" : ""}><input type="radio" checked={choice === "hosted"} onChange={() => setChoice("hosted")} /><span><strong>Streamient Cloud</strong><small>app.streamient.com</small></span><Icon name="cloud" /></label>
				<label className={choice === "local" ? "selected" : ""}><input type="radio" checked={choice === "local"} onChange={() => setChoice("local")} /><span><strong>Local development</strong><small>{LOCAL_SERVER.baseUrl}</small></span><Icon name="developer_mode" /></label>
				<label className={choice === "custom" ? "selected" : ""}><input type="radio" checked={choice === "custom"} onChange={() => setChoice("custom")} /><span><strong>Custom server</strong><small>Self-hosted Streamient</small></span><Icon name="dns" /></label>
			</div>
			{choice === "custom" && <div className="form-group"><label htmlFor="server-url">Server URL</label><input id="server-url" className="form-control" type="url" value={customUrl} onChange={(event) => setCustomUrl(event.target.value)} /></div>}
			{error && <div className="inline-error">{error}</div>}
			<button className="button primary full" onClick={submit} disabled={loading}>{loading ? <span className="spinner" /> : <Icon name="login" />}{loading ? "Connecting…" : "Continue securely"}</button>
			<small className="login-security"><Icon name="lock" /> OAuth PKCE. Your password never enters the app.</small>
		</section>
	</main>;
}
