import { useState, type FormEvent } from "react";
import type { ServerOption } from "../types";
import { HOSTED_SERVER, LOCAL_SERVER, serverOption } from "../lib/config";
import { Icon } from "./Icon";

export function LoginScreen({ initialServer, loading, error, onLogin }: { initialServer: ServerOption; loading: boolean; error: string; onLogin: (server: ServerOption) => void }) {
	const rememberedCustomServer = !initialServer.hosted && initialServer.baseUrl !== LOCAL_SERVER.baseUrl;
	const [advancedOpen, setAdvancedOpen] = useState(rememberedCustomServer);
	const [customUrl, setCustomUrl] = useState(initialServer.hosted ? "" : initialServer.baseUrl);
	const [validationError, setValidationError] = useState("");
	const [loginTarget, setLoginTarget] = useState<"cloud" | "custom" | null>(null);
	const loginWithCloud = () => {
		setLoginTarget("cloud");
		setValidationError("");
		onLogin(HOSTED_SERVER);
	};
	const submitCustom = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		try {
			setLoginTarget("custom");
			setValidationError("");
			onLogin(serverOption(customUrl));
		} catch (serverError) {
			setLoginTarget(null);
			setValidationError(serverError instanceof Error ? serverError.message : "Enter a valid server URL");
		}
	};

	return (
		<main className="login-screen">
			<div className="login-orbit login-orbit-one" aria-hidden="true" />
			<div className="login-orbit login-orbit-two" aria-hidden="true" />

			<section className="login-card">
				<div className="login-brand"><span className="brand-mark">S</span><strong>Streamient</strong></div>
				<span className="login-eyebrow">Your knowledge, in motion</span>
				<h1>Everything you know. Wherever you go.</h1>
				<p className="login-intro">Your projects, notes, memories, URLs, email, and AI—together on your phone.</p>

				{error || validationError ? <div className="inline-error" role="alert"><Icon name="error" /><span>{error || validationError}</span></div> : null}

				<button className="login-cloud-button" disabled={loading} onClick={loginWithCloud} type="button">
					<span className="login-cloud-icon"><Icon className={loading && loginTarget === "cloud" ? "login-spinner-icon" : ""} name={loading && loginTarget === "cloud" ? "progress_activity" : "cloud"} /></span>
					<span><strong>{loading && loginTarget === "cloud" ? "Opening Streamient Cloud…" : "Continue with Cloud"}</strong><small>app.streamient.com</small></span>
					<Icon name="arrow_forward" />
				</button>

				<button aria-controls="login-custom-server-form" aria-expanded={advancedOpen} className="login-advanced-toggle" disabled={loading} onClick={() => setAdvancedOpen((current) => !current)} type="button">
					<span>Advanced</span>
					<Icon name={advancedOpen ? "expand_less" : "expand_more"} />
				</button>

				{advancedOpen ? (
					<form className="login-custom-server" id="login-custom-server-form" onSubmit={submitCustom}>
						<label htmlFor="server-url">Custom server URL</label>
						<input autoCapitalize="none" autoComplete="url" autoCorrect="off" id="server-url" inputMode="url" onChange={(event) => { setCustomUrl(event.target.value); setValidationError(""); }} spellCheck={false} type="url" value={customUrl} />
						<button disabled={loading || !customUrl.trim()} type="submit"><span>{loading && loginTarget === "custom" ? "Connecting…" : "Connect to custom server"}</span><Icon name="arrow_forward" /></button>
						<small>HTTPS is required except during local development.</small>
					</form>
				) : null}

				<p className="login-security"><Icon name="lock" /><span>Secure sign-in with OAuth PKCE</span></p>
			</section>
		</main>
	);
}
