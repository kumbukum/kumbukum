import type { AppView } from "../types";
import { Icon } from "./Icon";

export function BottomNav({ active, onProjects, onAdd, onAi }: { active: AppView; onProjects: () => void; onAdd: () => void; onAi: () => void }) {
	return <nav className="bottom-nav" aria-label="Primary">
		<button className={active === "projects" ? "active" : ""} onClick={onProjects} type="button"><Icon name="folder_open" /><span>Projects</span></button>
		<button className="add-nav" onClick={onAdd} aria-label="Add" type="button"><span className="add-nav-circle"><Icon name="add" /></span><span>Add</span></button>
		<button className={active === "ai" ? "active" : ""} onClick={onAi} type="button"><Icon name="auto_awesome" /><span>AI</span></button>
	</nav>;
}
