import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { pickActiveTenantContext } from '../modules/tenancy.js';
import { canManageMembership, canManageTeam, sortTeamMembers } from '../services/team_service.js';

describe('team membership helpers', () => {
	it('prefers explicit tenant id when picking the active tenant', () => {
		const accessibleTenants = [
			{ tenantId: 'tenant-1', host_id: 'host-1', name: 'Alpha', role: 'owner', is_primary: true },
			{ tenantId: 'tenant-2', host_id: 'host-2', name: 'Beta', role: 'member', is_primary: false },
		];

		const active = pickActiveTenantContext(accessibleTenants, 'tenant-2', null);

		assert.equal(active.tenantId, 'tenant-2');
	});

	it('falls back to the preferred host id when tenant id is absent', () => {
		const accessibleTenants = [
			{ tenantId: 'tenant-1', host_id: 'host-1', name: 'Alpha', role: 'owner', is_primary: false },
			{ tenantId: 'tenant-2', host_id: 'host-2', name: 'Beta', role: 'member', is_primary: false },
		];

		const active = pickActiveTenantContext(accessibleTenants, null, 'host-2');

		assert.equal(active.host_id, 'host-2');
	});

	it('falls back to the primary tenant when no explicit match exists', () => {
		const accessibleTenants = [
			{ tenantId: 'tenant-1', host_id: 'host-1', name: 'Alpha', role: 'owner', is_primary: false },
			{ tenantId: 'tenant-2', host_id: 'host-2', name: 'Beta', role: 'member', is_primary: true },
		];

		const active = pickActiveTenantContext(accessibleTenants, 'missing', 'missing');

		assert.equal(active.tenantId, 'tenant-2');
	});

	it('allows owners to manage admins and members but not create another owner', () => {
		assert.equal(canManageTeam('owner'), true);
		assert.equal(canManageMembership('owner', 'admin', 'member'), true);
		assert.equal(canManageMembership('owner', 'member', 'admin'), true);
		assert.equal(canManageMembership('owner', 'member', 'owner'), false);
	});

	it('limits admins to managing members only', () => {
		assert.equal(canManageTeam('admin'), true);
		assert.equal(canManageMembership('admin', 'member', 'admin'), true);
		assert.equal(canManageMembership('admin', 'admin', 'member'), false);
		assert.equal(canManageMembership('admin', 'owner', 'member'), false);
	});

	it('sorts members by role rank before display', () => {
		const members = [
			{ role: 'member', user: { email: 'member@example.com' } },
			{ role: 'owner', user: { email: 'owner@example.com' } },
			{ role: 'admin', user: { email: 'admin@example.com' } },
		];

		members.sort(sortTeamMembers);

		assert.deepEqual(
			members.map((member) => member.role),
			['owner', 'admin', 'member'],
		);
	});
});
