import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/inter";
import "@fontsource-variable/material-symbols-outlined";
import "sweetalert2/dist/sweetalert2.min.css";
import "./styles.css";

function StartupFailure() {
	return <main className="app-loading startup-failure" role="alert"><span className="brand-mark">S</span><h1>Streamient couldn’t start</h1><p>Close and reopen the app, or try again.</p><button className="button primary" onClick={() => window.location.reload()} type="button">Try again</button></main>;
}

class StartupBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
	state = { failed: false };

	static getDerivedStateFromError() {
		return { failed: true };
	}

	componentDidCatch(error: Error) {
		console.error("Streamient Mobile render failed:", error);
	}

	render() {
		return this.state.failed ? <StartupFailure /> : this.props.children;
	}
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Streamient Mobile root element is missing");
const root = ReactDOM.createRoot(rootElement);

root.render(<div className="app-loading"><span className="brand-mark">S</span><span className="spinner dark" /></div>);
void import("./App").then(({ App }) => root.render(<React.StrictMode><StartupBoundary><App /></StartupBoundary></React.StrictMode>)).catch((error) => {
	console.error("Streamient Mobile startup failed:", error);
	root.render(<StartupFailure />);
});
