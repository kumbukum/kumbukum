document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('account-search');
    const resultsContainer = document.getElementById('search-results');
    const signInOwnBtn = document.getElementById('sign-in-own');
    let debounceTimer = null;

    searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        const q = searchInput.value.trim();
        if (q.length < 2) {
            resultsContainer.classList.add('d-none');
            resultsContainer.innerHTML = '';
            return;
        }
        debounceTimer = setTimeout(() => searchUsers(q), 250);
    });

    // Close results when clicking outside
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !resultsContainer.contains(e.target)) {
            resultsContainer.classList.add('d-none');
        }
    });

    async function searchUsers(q) {
        try {
            const res = await fetch(`/api/v1/admin/users/search?q=${encodeURIComponent(q)}`);
            if (!res.ok) return;
            const users = await res.json();

            resultsContainer.innerHTML = '';
            if (!users.length) {
                resultsContainer.innerHTML = '<div class="list-group-item text-muted">No accounts found</div>';
                resultsContainer.classList.remove('d-none');
                return;
            }

            for (const user of users) {
                const item = document.createElement('a');
                item.href = '#';
                item.className = 'list-group-item list-group-item-action d-flex justify-content-between align-items-center';
                item.innerHTML = `
                    <div>
                        <div class="fw-semibold">${escapeHtml(user.name)}</div>
                        <small class="text-muted">${escapeHtml(user.email)}</small>
                    </div>
                    ${user.is_active ? '<span class="badge bg-success">Active</span>' : '<span class="badge text-bg-secondary tag-badge rounded-pill">Inactive</span>'}
                `;
                item.addEventListener('click', (e) => {
                    e.preventDefault();
                    impersonate(user._id);
                });
                resultsContainer.appendChild(item);
            }
            resultsContainer.classList.remove('d-none');
        } catch (err) {
            console.error('Search error:', err);
        }
    }

    async function impersonate(userId) {
        try {
            const res = await fetch('/api/v1/admin/impersonate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId }),
            });
            const data = await res.json();
            if (data.ok) {
                window.location.href = data.redirect;
            } else {
                alert(data.error || 'Impersonation failed');
            }
        } catch (err) {
            console.error('Impersonate error:', err);
        }
    }

    // "Sign in to my account" — impersonate the user matching sysadmin email
    if (signInOwnBtn) {
        signInOwnBtn.addEventListener('click', async () => {
            try {
                // Search for own email (will match if a real user exists with same email)
                const res = await fetch('/api/v1/admin/users/search?q=sysadmin');
                const users = await res.json();
                if (users.length === 1) {
                    impersonate(users[0]._id);
                } else if (users.length > 1) {
                    // Show results so user can pick
                    searchInput.value = 'sysadmin';
                    searchUsers('sysadmin');
                } else {
                    alert('No matching account found for the sysadmin email.');
                }
            } catch (err) {
                console.error('Sign in to own error:', err);
            }
        });
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
});
