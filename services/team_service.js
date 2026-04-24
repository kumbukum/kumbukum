import crypto from 'node:crypto';
import { User } from '../model/user.js';
import { TeamInvite } from '../model/team_invite.js';
import { TenantMember, TEAM_MEMBER_ROLE_RANK } from '../model/tenant_member.js';
import { Tenant } from '../modules/tenancy.js';
import { sendTeamInviteEmail } from './email_service.js';
import * as audit from './audit_service.js';

export function canManageTeam(role) {
	return role === 'owner' || role === 'admin';
}

export function canManageMembership(actorRole, targetRole, nextRole = null) {
	if (!canManageTeam(actorRole)) return false;
	if (targetRole === 'owner') return actorRole === 'owner';
	if (nextRole === 'owner') return false;
	if (actorRole === 'owner') return true;
	return targetRole === 'member';
}

export async function listTeamMembers(host_id) {
	const members = await TenantMember.find({ host_id })
		.populate('user', 'name email last_login createdAt')
		.sort({ createdAt: 1 })
		.lean();

	return members.map((member) => ({
		_id: member._id.toString(),
		role: member.role,
		joined_at: member.joined_at,
		user: member.user
			? {
				_id: member.user._id.toString(),
				name: member.user.name,
				email: member.user.email,
				last_login: member.user.last_login,
				createdAt: member.user.createdAt,
			}
			: null,
	})).sort(sortTeamMembers);
}

export async function listTeamInvites(host_id) {
	const invites = await TeamInvite.find({
		host_id,
		expires_at: { $gt: new Date() },
		accepted_at: null,
	})
		.populate('invited_by', 'name email')
		.sort({ createdAt: -1 })
		.lean();

	return invites.map((invite) => ({
		_id: invite._id.toString(),
		email: invite.email,
		name: invite.name,
		role: invite.role,
		expires_at: invite.expires_at,
		createdAt: invite.createdAt,
		invited_by: invite.invited_by
			? {
				_id: invite.invited_by._id.toString(),
				name: invite.invited_by.name,
				email: invite.invited_by.email,
			}
			: null,
	}));
}

export async function getInviteByToken(token) {
	if (!token) return null;
	return TeamInvite.findOne({
		token,
		expires_at: { $gt: new Date() },
		accepted_at: null,
	})
		.populate('tenant', 'name host_id')
		.populate('invited_by', 'name email');
}

export async function createTeamInvite(userId, host_id, data, ctx = {}) {
	const tenant = await Tenant.findOne({ host_id, is_active: true });
	if (!tenant) throw new Error('Tenant not found');

	const email = String(data.email || '').trim().toLowerCase();
	if (!email) throw new Error('Email is required');

	const role = 'member';
	const existingUser = await User.findOne({ email });
	if (existingUser) {
		const existingMembership = await TenantMember.findOne({ tenant: tenant._id, user: existingUser._id }).lean();
		if (existingMembership) throw new Error('User is already a member of this account');
	}

	await TeamInvite.deleteMany({
		tenant: tenant._id,
		email,
		accepted_at: null,
	});

	const token = crypto.randomBytes(32).toString('hex');
	const invite = await TeamInvite.create({
		tenant: tenant._id,
		host_id,
		email,
		name: typeof data.name === 'string' ? data.name.trim() : '',
		role,
		invited_by: userId,
		token,
		expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
	});

	const inviter = await User.findById(userId).select('name email').lean();
	await sendTeamInviteEmail(email, token, tenant.name, inviter?.name || inviter?.email || 'A teammate', invite.name || '');

	audit.log({
		action: 'create',
		resource: 'team_invite',
		resource_id: invite._id.toString(),
		user_id: userId,
		host_id,
		details: { email, role },
		...ctx,
	});

	return invite;
}

export async function acceptTeamInvite(invite, user, ctx = {}) {
	if (!invite) throw new Error('Invite not found');
	if (!user) throw new Error('User is required');
	if (user.email.toLowerCase() !== invite.email.toLowerCase()) {
		throw new Error('Invite email does not match the signed-in user');
	}

	const existingMembership = await TenantMember.findOne({ tenant: invite.tenant._id, user: user._id });
	if (!existingMembership) {
		await TenantMember.create({
			tenant: invite.tenant._id,
			user: user._id,
			host_id: invite.host_id,
			role: invite.role,
			invited_by: invite.invited_by?._id || invite.invited_by,
			joined_at: new Date(),
		});
	}

	invite.accepted_at = new Date();
	await invite.save();
	await TeamInvite.deleteOne({ _id: invite._id });

	audit.log({
		action: 'create',
		resource: 'team_member',
		resource_id: `${invite.tenant._id}:${user._id}`,
		user_id: user._id,
		host_id: invite.host_id,
		details: { role: invite.role, accepted_via: 'invite' },
		...ctx,
	});
}

export async function updateTeamMemberRole(host_id, membershipId, actor, nextRole, ctx = {}) {
	const membership = await TenantMember.findOne({ _id: membershipId, host_id }).populate('user', 'name email');
	if (!membership) throw new Error('Member not found');
	if (!['admin', 'member'].includes(nextRole)) throw new Error('Invalid role');
	if (!canManageMembership(actor.role, membership.role, nextRole)) throw new Error('You do not have permission to change this role');
	if (String(membership.user._id) === String(actor.userId)) throw new Error('You cannot change your own role here');

	const beforeRole = membership.role;
	membership.role = nextRole;
	await membership.save();

	audit.log({
		action: 'update',
		resource: 'team_member',
		resource_id: membership._id.toString(),
		user_id: actor.userId,
		host_id,
		details: { before_role: beforeRole, after_role: nextRole, member_email: membership.user.email },
		...ctx,
	});

	return membership;
}

export async function removeTeamMember(host_id, membershipId, actor, ctx = {}) {
	const membership = await TenantMember.findOne({ _id: membershipId, host_id }).populate('user', 'name email');
	if (!membership) throw new Error('Member not found');
	if (!canManageMembership(actor.role, membership.role)) throw new Error('You do not have permission to remove this member');
	if (String(membership.user._id) === String(actor.userId)) throw new Error('You cannot remove yourself here');
	if (membership.role === 'owner') throw new Error('The account owner cannot be removed');

	await TenantMember.deleteOne({ _id: membership._id });

	audit.log({
		action: 'delete',
		resource: 'team_member',
		resource_id: membership._id.toString(),
		user_id: actor.userId,
		host_id,
		details: { member_email: membership.user.email, role: membership.role },
		...ctx,
	});

	return membership;
}

export async function cancelTeamInvite(host_id, inviteId, actor, ctx = {}) {
	const invite = await TeamInvite.findOne({ _id: inviteId, host_id, accepted_at: null }).lean();
	if (!invite) throw new Error('Invite not found');
	await TeamInvite.deleteOne({ _id: inviteId });

	audit.log({
		action: 'delete',
		resource: 'team_invite',
		resource_id: inviteId,
		user_id: actor.userId,
		host_id,
		details: { email: invite.email },
		...ctx,
	});

	return invite;
}

export async function ensureMembershipForInviteUser(host_id, userId) {
	const tenant = await Tenant.findOne({ host_id }).select('_id host_id owner').lean();
	if (!tenant) return null;
	return TenantMember.findOneAndUpdate(
		{ tenant: tenant._id, user: userId },
		{
			$setOnInsert: {
				host_id: tenant.host_id,
				role: String(tenant.owner) === String(userId) ? 'owner' : 'member',
				joined_at: new Date(),
			},
		},
		{ upsert: true, returnDocument: 'after' },
	);
}

export async function getMembershipByUserAndHost(userId, host_id) {
	return TenantMember.findOne({ user: userId, host_id }).populate('tenant', 'name host_id');
}

export function sortTeamMembers(a, b) {
	return (TEAM_MEMBER_ROLE_RANK[b.role] || 0) - (TEAM_MEMBER_ROLE_RANK[a.role] || 0);
}
