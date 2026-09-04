import { z } from 'zod';

export const MCP_DEFAULT_PER_PAGE = 1;

export const MCP_PER_PAGE_SCHEMA = z.number().int().min(1).default(MCP_DEFAULT_PER_PAGE).describe('Results per collection (default 1; increase only when needed)');

export function mcpPerPage(args = {}) {
	return args.per_page ?? MCP_DEFAULT_PER_PAGE;
}
