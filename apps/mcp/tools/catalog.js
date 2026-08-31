import { emailTools } from './emails.js';
import { gitSyncTools } from './git_sync.js';
import { graphTools } from './graph.js';
import { memoryTools } from './memory.js';
import { noteTools } from './notes.js';
import { applyToolProfile, MCP_TOOL_PROFILES } from './profile.js';
import { projectTools } from './projects.js';
import { urlTools } from './urls.js';

/**
 * Build the single Streamient MCP tool catalog used by every transport profile.
 * Keeping composition here lets server registration, CLI coverage, and docs
 * validation observe the same enabled tool set.
 */
export function createMcpToolCatalog(api, {
	defaultProjectId,
	emailFeatureEnabled = true,
	gitSyncFeatureEnabled = true,
	toolProfile = MCP_TOOL_PROFILES.FULL,
} = {}) {
	const tools = {
		...noteTools(api, defaultProjectId),
		...memoryTools(api, defaultProjectId),
		...urlTools(api, defaultProjectId),
		...(emailFeatureEnabled ? emailTools(api, defaultProjectId) : {}),
		...projectTools(api),
		...graphTools(api),
		...(gitSyncFeatureEnabled ? gitSyncTools(api, defaultProjectId) : {}),
	};
	return applyToolProfile(tools, toolProfile);
}
