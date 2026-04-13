// Batch selection & actions for notes, memories, urls
(function () {
    const toolbar = document.getElementById('batch-toolbar');
    if (!toolbar) return;

    const batchType = toolbar.dataset.type;
    const batchActions = document.getElementById('batch-actions');
    const selectAllCb = document.getElementById('select-all-cb');
    const batchCount = document.getElementById('batch-count');
    const batchDeleteBtn = document.getElementById('batch-delete-btn');
    const batchMoveBtn = document.getElementById('batch-move-btn');
    const batchCopyBtn = document.getElementById('batch-copy-btn');

    function getSelected() {
        return Array.from(document.querySelectorAll('.batch-cb:checked')).map((cb) => cb.value);
    }

    function getAllCheckboxes() {
        return document.querySelectorAll('.batch-cb');
    }

    function updateBatchBar() {
        const selected = getSelected();
        const count = selected.length;
        batchCount.textContent = `${count} selected`;

        if (count > 0) {
            batchActions.classList.remove('d-none');
        } else {
            batchActions.classList.add('d-none');
        }

        const all = getAllCheckboxes();
        selectAllCb.checked = all.length > 0 && count === all.length;
        selectAllCb.indeterminate = count > 0 && count < all.length;
    }

    function resetBatch() {
        selectAllCb.checked = false;
        selectAllCb.indeterminate = false;
        batchActions.classList.add('d-none');
    }

    selectAllCb.addEventListener('change', () => {
        const checked = selectAllCb.checked;
        getAllCheckboxes().forEach((cb) => {
            cb.checked = checked;
        });
        updateBatchBar();
    });

    let lastChecked = null;

    document.addEventListener('change', (e) => {
        if (e.target.classList.contains('batch-cb')) {
            updateBatchBar();
        }
    });

    // Shift+click range selection and prevent checkbox clicks from triggering list-item click
    document.addEventListener('click', (e) => {
        const cb = e.target.classList.contains('batch-cb')
            ? e.target
            : e.target.closest('.batch-cb-wrap')?.querySelector('.batch-cb');

        if (!cb) return;

        if (e.target.closest('.batch-cb-wrap')) {
            e.stopPropagation();
        }

        if (e.shiftKey && lastChecked && lastChecked !== cb) {
            const all = Array.from(getAllCheckboxes());
            const start = all.indexOf(lastChecked);
            const end = all.indexOf(cb);
            if (start !== -1 && end !== -1) {
                const low = Math.min(start, end);
                const high = Math.max(start, end);
                const checked = cb.checked;
                for (let i = low; i <= high; i++) {
                    all[i].checked = checked;
                }
                updateBatchBar();
            }
        }

        lastChecked = cb;
    }, true);

    batchDeleteBtn.addEventListener('click', async () => {
        const ids = getSelected();
        if (!ids.length) return;
        const confirmed = await confirmAction('Move to Trash', `${ids.length} item(s) will be moved to trash.`);
        if (!confirmed) return;

        await api('POST', '/batch/delete', { type: batchType, ids });
        showSuccess(`${ids.length} moved to trash`);
        resetBatch();
        window.dispatchEvent(new CustomEvent('batch-done'));
    });

    async function pickProject(action) {
        const ids = getSelected();
        if (!ids.length) return;

        const { projects } = await api('GET', '/projects');
        const others = projects.filter((p) => p._id !== currentProjectId);
        if (!others.length) {
            showError('No other projects available');
            return;
        }

        const { Swal } = await import('/static/js/vendor.js');
        const options = others.map((p) => `<option value="${p._id}">${p.name}</option>`).join('');
        const { value: project } = await Swal.fire({
            title: `${action === 'move' ? 'Move' : 'Copy'} to project`,
            html: `<select id="batch-project-select" class="form-select">${options}</select>`,
            showCancelButton: true,
            confirmButtonText: action === 'move' ? 'Move' : 'Copy',
            preConfirm: () => document.getElementById('batch-project-select').value,
        });
        if (!project) return;

        await api('POST', `/batch/${action}`, { type: batchType, ids, project });
        showSuccess(`${ids.length} ${action === 'move' ? 'moved' : 'copied'}`);
        resetBatch();
        window.dispatchEvent(new CustomEvent('batch-done'));
    }

    batchMoveBtn.addEventListener('click', () => pickProject('move'));
    batchCopyBtn.addEventListener('click', () => pickProject('copy'));

    // Expose for list renderers to call after re-rendering items
    window.updateBatchBar = updateBatchBar;
})();
