document.addEventListener('DOMContentLoaded', () => {
    // ---- Accounts listing page ----
    const accountsBody = document.getElementById('accounts-body');
    const accountsTotal = document.getElementById('accounts-total');
    const filterActive = document.getElementById('filter-active');
    const filterInactive = document.getElementById('filter-inactive');
    const paginationEl = document.getElementById('accounts-pagination');

    if (accountsBody) {
        let currentStatus = 'active';
        let currentPage = 1;

        filterActive?.addEventListener('click', (e) => {
            e.preventDefault();
            currentStatus = 'active';
            currentPage = 1;
            filterActive.classList.add('active');
            filterInactive.classList.remove('active');
            loadAccounts();
        });

        filterInactive?.addEventListener('click', (e) => {
            e.preventDefault();
            currentStatus = 'inactive';
            currentPage = 1;
            filterInactive.classList.add('active');
            filterActive.classList.remove('active');
            loadAccounts();
        });

        async function loadAccounts() {
            try {
                const res = await fetch(`/admin/api/accounts?status=${currentStatus}&page=${currentPage}`);
                const data = await res.json();

                if (accountsTotal) {
                    accountsTotal.textContent = `${data.total} account${data.total !== 1 ? 's' : ''}`;
                }

                if (!data.accounts.length) {
                    accountsBody.innerHTML = '<tr><td class="text-center text-muted" colspan="6">No accounts found</td></tr>';
                    if (paginationEl) paginationEl.innerHTML = '';
                    return;
                }

                accountsBody.innerHTML = data.accounts.map((a) => `
                    <tr>
                        <td>${escapeHtml(a.name)}</td>
                        <td>${escapeHtml(a.email)}</td>
                        <td>${formatDate(a.createdAt)}</td>
                        <td>${a.projectCount}</td>
                        <td>${a.itemCount}</td>
                        <td class="text-end">
                            <a href="/admin/accounts/${a._id}/edit" class="btn btn-sm btn-outline-primary me-1">Edit</a>
                            <button class="btn btn-sm btn-outline-danger btn-delete" data-id="${a._id}" data-name="${escapeHtml(a.name)}">Delete</button>
                        </td>
                    </tr>
                `).join('');

                // Bind delete buttons
                accountsBody.querySelectorAll('.btn-delete').forEach((btn) => {
                    btn.addEventListener('click', () => deleteAccount(btn.dataset.id, btn.dataset.name));
                });

                // Pagination
                if (paginationEl && data.pages > 1) {
                    let html = '<ul class="pagination pagination-sm">';
                    for (let p = 1; p <= data.pages; p++) {
                        html += `<li class="page-item ${p === currentPage ? 'active' : ''}"><a class="page-link" href="#" data-page="${p}">${p}</a></li>`;
                    }
                    html += '</ul>';
                    paginationEl.innerHTML = html;
                    paginationEl.querySelectorAll('.page-link').forEach((link) => {
                        link.addEventListener('click', (e) => {
                            e.preventDefault();
                            currentPage = parseInt(link.dataset.page, 10);
                            loadAccounts();
                        });
                    });
                } else if (paginationEl) {
                    paginationEl.innerHTML = '';
                }
            } catch (err) {
                console.error('Load accounts error:', err);
                accountsBody.innerHTML = '<tr><td class="text-center text-danger" colspan="6">Failed to load accounts</td></tr>';
            }
        }

        loadAccounts();
    }

    // ---- Edit account page ----
    const editForm = document.getElementById('edit-account-form');
    const deleteBtn = document.getElementById('delete-account');

    if (editForm) {
        editForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('account-id').value;
            const name = document.getElementById('name').value.trim();
            const email = document.getElementById('email').value.trim();
            const is_active = document.getElementById('is-active').checked;

            try {
                const res = await fetch(`/admin/api/accounts/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, email, is_active }),
                });
                const data = await res.json();
                if (data.ok) {
                    showToast('Account updated successfully');
                } else {
                    alert(data.error || 'Update failed');
                }
            } catch (err) {
                console.error('Update error:', err);
                alert('Failed to update account');
            }
        });
    }

    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
            const id = document.getElementById('account-id').value;
            const name = document.getElementById('name').value;
            deleteAccount(id, name);
        });
    }

    async function deleteAccount(id, name) {
        if (!confirm(`Delete account "${name}"?\n\nThis will permanently remove the user and ALL their data (notes, memories, URLs, projects). This cannot be undone.`)) {
            return;
        }

        try {
            const res = await fetch(`/admin/api/accounts/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.ok) {
                window.location.href = '/admin';
            } else {
                alert(data.error || 'Delete failed');
            }
        } catch (err) {
            console.error('Delete error:', err);
            alert('Failed to delete account');
        }
    }

    function showToast(message) {
        const toast = document.createElement('div');
        toast.className = 'alert alert-success position-fixed top-0 end-0 m-3';
        toast.style.zIndex = '9999';
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str || '';
        return div.innerHTML;
    }

    function formatDate(dateStr) {
        if (!dateStr) return '—';
        return new Date(dateStr).toLocaleDateString();
    }
});
