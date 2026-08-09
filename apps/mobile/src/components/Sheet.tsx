import { useEffect, type ReactNode } from "react";
import { Icon } from "./Icon";

export function Sheet({ open, title, children, onClose, wide = false }: { open: boolean; title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
	useEffect(() => {
		if (!open) return;
		const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
		window.addEventListener("keydown", close);
		return () => window.removeEventListener("keydown", close);
	}, [open, onClose]);
	if (!open) return null;
	return <div className="sheet-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
		<section className={`sheet ${wide ? "sheet-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
			<div className="sheet-grabber" />
			<header className="sheet-header"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close"><Icon name="close" /></button></header>
			<div className="sheet-body">{children}</div>
		</section>
	</div>;
}
