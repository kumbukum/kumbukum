import type { AppView } from "../types";
import { Icon } from "./Icon";

export function BottomNav({ active, onChange, onAdd }: { active: AppView; onChange: (view: AppView) => void; onAdd: () => void }) {
	return <nav className="bottom-nav" aria-label="Primary">
		<button className={active === "projects" ? "active" : ""} onClick={() => onChange("projects")}><Icon name="folder_open" /><span>Projects</span></button>
		<button className="add-nav" onClick={onAdd} aria-label="Add"><span className="add-nav-circle"><Icon name="add" /></span><span>Add</span></button>
		<button className={active === "ai" ? "active" : ""} onClick={() => onChange("ai")}><Icon name="auto_awesome" /><span>AI</span></button>
	</nav>;
}
