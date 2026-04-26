// Team settings — IIFE (loaded dynamically via SPA partial)
(function () {
	var page = document.getElementById('team-page');
	if (!page) return;
	if (page.dataset.canManageTeam !== 'true') return;

	var currentUserId = page.dataset.userId;
	var inviteForm = document.getElementById('team-invite-form');
	var membersList = document.getElementById('team-members-list');
	var invitesList = document.getElementById('team-invites-list');

	loadMembers();
	loadInvites();

	inviteForm?.addEventListener('submit', async function (e) {
		e.preventDefault();
		var email = document.getElementById('team-invite-email').value.trim();
		var name = document.getElementById('team-invite-name').value.trim();

		if (!email) return showError('Email is required');

		try {
			await api('POST', '/team/invites', { email: email, name: name });
			inviteForm.reset();
			showSuccess('Invite sent');
			loadInvites();
		} catch (err) {
			showError(err.message);
		}
	});

	async function loadMembers() {
		try {
			var data = await api('GET', '/team/members');
			var members = Array.isArray(data.members) ? data.members : [];
			if (!members.length) {
				membersList.innerHTML = '<p class="text-muted mb-0">No team members yet.</p>';
				return;
			}

			membersList.innerHTML = members.map(function (member) {
				var user = member.user || {};
				var isCurrentUser = user._id === currentUserId;
				var isOwner = member.role === 'owner';
				var roleControl = isOwner
					? '<span class="badge text-bg-dark text-uppercase">owner</span>'
					: '';
				var removeButton = (!isOwner && !isCurrentUser)
					? '<button class="btn btn-sm btn-outline-danger team-remove-member" data-id="' + member._id + '">' + kkIcon('delete') + '</button>'
					: '';
				var lastLogin = user.last_login ? '<small class="text-muted">Last login ' + escapeHtml(new Date(user.last_login).toLocaleDateString()) + '</small>' : '<small class="text-muted">No recent login recorded</small>';

				return '<div class="list-group-item d-flex justify-content-between align-items-start gap-3 mb-3">'
					+ '<div class="flex-grow-1">'
						+ '<div class="fw-semibold">' + escapeHtml(user.name || 'Unknown user') + (isCurrentUser ? ' <span class="badge text-bg-light ms-2">You</span>' : '') + '</div>'
						+ '<div class="text-muted small">' + escapeHtml(user.email || '') + '</div>'
						+ lastLogin
					+ '</div>'
					+ '<div class="d-flex align-items-center gap-2">'
						+ roleControl
						+ removeButton
					+ '</div>'
				+ '</div>';
			}).join('');

			membersList.querySelectorAll('.team-remove-member').forEach(function (button) {
				button.addEventListener('click', async function () {
					var confirmed = await confirmAction('Remove teammate', 'This user will lose access to this account.');
					if (!confirmed) return;
					try {
						await api('DELETE', '/team/members/' + button.dataset.id);
						showSuccess('Member removed');
						loadMembers();
					} catch (err) {
						showError(err.message);
					}
				});
			});
		} catch (err) {
			membersList.innerHTML = '<p class="text-danger mb-0">Failed to load team members.</p>';
		}
	}

	async function loadInvites() {
		try {
			var data = await api('GET', '/team/invites');
			var invites = Array.isArray(data.invites) ? data.invites : [];
			if (!invites.length) {
				invitesList.innerHTML = '<p class="text-muted mb-0">No pending invites.</p>';
				return;
			}

			invitesList.innerHTML = '<div class="list-group">' + invites.map(function (invite) {
				var subtitle = (invite.name ? escapeHtml(invite.name) + ' · ' : '') + escapeHtml(invite.email);
				return '<div class="list-group-item d-flex justify-content-between align-items-start gap-3">'
					+ '<div class="flex-grow-1">'
						+ '<div class="fw-semibold">Pending invite</div>'
						+ '<div class="text-muted small">' + subtitle + '</div>'
						+ '<small class="text-muted">Expires ' + escapeHtml(new Date(invite.expires_at).toLocaleDateString()) + '</small>'
					+ '</div>'
					+ '<button class="btn btn-sm btn-outline-danger team-cancel-invite" data-id="' + invite._id + '">' + kkIcon('close') + '</button>'
				+ '</div>';
			}).join('') + '</div>';

			invitesList.querySelectorAll('.team-cancel-invite').forEach(function (button) {
				button.addEventListener('click', async function () {
					var confirmed = await confirmAction('Cancel invite', 'This invitation link will stop working.');
					if (!confirmed) return;
					try {
						await api('DELETE', '/team/invites/' + button.dataset.id);
						showSuccess('Invite cancelled');
						loadInvites();
					} catch (err) {
						showError(err.message);
					}
				});
			});
		} catch (err) {
			invitesList.innerHTML = '<p class="text-danger mb-0">Failed to load invites.</p>';
		}
	}

	function escapeHtml(str) {
		var div = document.createElement('div');
		div.textContent = str || '';
		return div.innerHTML;
	}
})();
