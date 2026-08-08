// Trash section - mount/unmount for SPA navigation
(function () {
	var PAGE_SIZE = 50;
	var listEl, emptyState, emptyBtn, selectAllCb, batchActions, batchCount, batchRestoreBtn, batchDeleteBtn, filterBtns, infiniteScroll;
	var currentFilter = '';
	var pageNum = 1;
	var loadingMore = false;
	var hasMore = false;
	var knownTotal = 0;
	var loadSeq = 0;

	var ICONS = { notes: 'description', memories: 'lightbulb', urls: 'link', emails: 'mail' };
	var LABELS = { notes: 'Note', memories: 'Memory', urls: 'URL', emails: 'Email' };

	function escapeHtml(value) {
		var div = document.createElement('div');
		div.textContent = value || '';
		return div.innerHTML;
	}

	function itemTitle(item) {
		return item.subject || item.title || item.url || '(No subject)';
	}

	function trashPath(page, offset) {
		var params = ['page=' + page, 'limit=' + PAGE_SIZE];
		if (Number.isSafeInteger(offset) && offset >= 0) params.push('offset=' + offset);
		if (currentFilter) params.push('type=' + encodeURIComponent(currentFilter));
		return '/trash?' + params.join('&');
	}

	function loadedTrashItemCount() {
		return listEl ? listEl.querySelectorAll('.trash-item').length : 0;
	}

	function trashDate(value) {
		return window.StreamientDateFormat?.formatLocale(value, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) || '';
	}

	function getSelected() {
		if (!listEl) return [];
		return Array.from(listEl.querySelectorAll('.batch-cb:checked')).map(function (cb) {
			return { type: cb.dataset.type, id: cb.value };
		});
	}

	function updateBatchBar() {
		if (!listEl || !batchActions || !batchCount || !selectAllCb) return;
		var selected = getSelected();
		if (selected.length > 0) {
			batchActions.classList.remove('d-none');
			batchCount.textContent = selected.length + ' selected';
		} else {
			batchActions.classList.add('d-none');
		}
		var all = listEl.querySelectorAll('.batch-cb');
		if (all.length && selected.length === all.length) {
			selectAllCb.checked = true;
			selectAllCb.indeterminate = false;
		} else if (selected.length > 0) {
			selectAllCb.checked = false;
			selectAllCb.indeterminate = true;
		} else {
			selectAllCb.checked = false;
			selectAllCb.indeterminate = false;
		}
	}

	function resetBatchBar() {
		if (selectAllCb) {
			selectAllCb.checked = false;
			selectAllCb.indeterminate = false;
		}
		if (batchActions) batchActions.classList.add('d-none');
	}

	function setButtonLoading(button, loading) {
		if (!button) return;
		button.disabled = loading;
		button.classList.toggle('disabled', loading);
		if (loading) button.setAttribute('aria-busy', 'true');
		else button.removeAttribute('aria-busy');
	}

	function updateEmptyState() {
		if (!listEl || !emptyState) return;
		emptyState.classList.toggle('d-none', Boolean(listEl.querySelector('.trash-item')) || hasMore);
	}

	function setTrashBadgeCount(count) {
		var badge = document.getElementById('trash-count-badge');
		if (!badge) return;
		var next = Math.max(0, Number(count) || 0);
		badge.textContent = next || '';
		badge.classList.toggle('d-none', !next);
	}

	function adjustTrashBadge(removed) {
		var badge = document.getElementById('trash-count-badge');
		if (!badge) return;
		var current = Number(badge.textContent || 0);
		if (!Number.isFinite(current)) return;
		setTrashBadgeCount(current - removed);
	}

	function removeTrashItems(items) {
		if (!listEl) return 0;
		var scrollContainer = document.getElementById('main-content');
		var scrollTop = scrollContainer?.scrollTop;
		var windowScrollY = window.scrollY;
		var focusedItem = document.activeElement?.closest?.('.trash-item');
		var focusTarget = focusedItem?.nextElementSibling?.querySelector?.('button') || focusedItem?.previousElementSibling?.querySelector?.('button');
		var keys = new Set(items.map(function (item) { return item.type + '\u0000' + item.id; }));
		var removed = 0;
		listEl.querySelectorAll('.trash-item').forEach(function (item) {
			if (!keys.has(item.dataset.type + '\u0000' + item.dataset.id)) return;
			item.remove();
			removed++;
		});
		knownTotal = Math.max(0, knownTotal - keys.size);
		hasMore = loadedTrashItemCount() < knownTotal;
		adjustTrashBadge(keys.size);
		updateBatchBar();
		updateEmptyState();
		if (Number.isFinite(scrollTop)) scrollContainer.scrollTop = scrollTop;
		if (window.scrollY !== windowScrollY) window.scrollTo({ top: windowScrollY });
		focusTarget?.focus();
		infiniteScroll?.kick();
		return removed;
	}

	function renderTrashItemHtml(item) {
		return '<div class="list-group-item d-flex justify-content-between align-items-start trash-item" data-id="' + escapeHtml(item._id) + '" data-type="' + escapeHtml(item._type) + '">'
			+ '<div class="batch-cb-wrap me-2 pt-1"><input type="checkbox" class="form-check-input h-20px w-30px batch-cb" value="' + escapeHtml(item._id) + '" data-type="' + escapeHtml(item._type) + '"></div>'
			+ '<div class="flex-grow-1">'
			+ '<div class="d-flex align-items-center gap-2 mb-1">'
			+ '<span class="badge text-bg-secondary tag-badge rounded-pill">' + kkIcon(ICONS[item._type] || 'file') + ' ' + escapeHtml(LABELS[item._type] || item._type) + '</span>'
			+ '<strong>' + escapeHtml(itemTitle(item)) + '</strong>'
			+ '</div>'
			+ '<small class="text-muted" data-date-value="' + escapeHtml(item.trashed_at || '') + '" data-date-format="locale" data-date-prefix="Trashed " data-date-options="{&quot;year&quot;:&quot;numeric&quot;,&quot;month&quot;:&quot;short&quot;,&quot;day&quot;:&quot;numeric&quot;,&quot;hour&quot;:&quot;2-digit&quot;,&quot;minute&quot;:&quot;2-digit&quot;}">Trashed ' + escapeHtml(trashDate(item.trashed_at)) + '</small>'
			+ '</div>'
			+ '<div class="btn-group btn-group-sm ms-2">'
			+ '<button class="btn btn-link restore-btn" title="Restore">' + kkIcon('restore') + '</button>'
			+ '<button class="btn btn-link permanent-delete-btn" title="Delete forever">' + kkIcon('delete') + '</button>'
			+ '</div></div>';
	}

	function bindTrashItem(el) {
		el.querySelector('.restore-btn')?.addEventListener('click', async function (event) {
			var button = event.currentTarget;
			var item = { type: el.dataset.type, id: el.dataset.id };
			setButtonLoading(button, true);
			try {
				await api('POST', '/trash/restore', item);
				removeTrashItems([item]);
				showSuccess('Item restored');
				refreshTrashCount();
				refreshCounts();
			} catch (err) {
				if (err.stale) {
					removeTrashItems([item]);
					refreshTrashCount();
				}
				showError(err.message || 'Restore failed');
			} finally {
				setButtonLoading(button, false);
			}
		});

		el.querySelector('.permanent-delete-btn')?.addEventListener('click', async function (event) {
			var confirmed = await confirmAction('Delete Forever', 'This item will be permanently deleted. This cannot be undone.');
			if (!confirmed) return;
			var button = event.currentTarget;
			var item = { type: el.dataset.type, id: el.dataset.id };
			setButtonLoading(button, true);
			try {
				await api('DELETE', '/trash/' + item.type + '/' + item.id);
				removeTrashItems([item]);
				showSuccess('Item permanently deleted');
				refreshTrashCount();
				refreshCounts();
			} catch (err) {
				showError(err.message || 'Delete failed');
			} finally {
				setButtonLoading(button, false);
			}
		});

		el.querySelector('.batch-cb')?.addEventListener('change', updateBatchBar);
		el.querySelector('.batch-cb')?.addEventListener('click', function (e) { e.stopPropagation(); });
	}

	function renderTrashItems(items, append) {
		if (!listEl) return;
		if (!append && !items.length) {
			listEl.replaceChildren();
			updateEmptyState();
			return;
		}
		if (!items.length) return;

		if (!append) {
			listEl.innerHTML = items.map(renderTrashItemHtml).join('');
			listEl.querySelectorAll('.trash-item').forEach(bindTrashItem);
			updateEmptyState();
			return;
		}

		var wrapper = document.createElement('div');
		wrapper.innerHTML = items.map(renderTrashItemHtml).join('');
		Array.prototype.slice.call(wrapper.children).forEach(function (item) {
			bindTrashItem(item);
			listEl.appendChild(item);
		});
		updateBatchBar();
		updateEmptyState();
	}

	async function loadTrash() {
		if (!listEl) return;
		var seq = ++loadSeq;
		pageNum = 1;
		loadingMore = false;
		hasMore = false;
		resetBatchBar();
		try {
			var data = await api('GET', trashPath(pageNum));
			if (!listEl || seq !== loadSeq) return;
			var items = data.items || [];
			var total = Number(data.total || 0);
			knownTotal = total;
			hasMore = items.length < total;
			renderTrashItems(items, false);
			infiniteScroll?.kick();
		} catch (err) {
			showError('Failed to load trash: ' + (err.message || 'Unknown error'));
		}
	}

	async function loadMoreTrash() {
		if (!listEl || loadingMore || !hasMore) return;
		loadingMore = true;
		var seq = loadSeq;
		var page = pageNum + 1;
		var appended = false;
		try {
			var data = await api('GET', trashPath(page, loadedTrashItemCount()));
			if (!listEl || seq !== loadSeq) return;
			var items = data.items || [];
			var total = Number(data.total || 0);
			knownTotal = total;
			pageNum = page;
			renderTrashItems(items, true);
			hasMore = loadedTrashItemCount() < total;
			updateEmptyState();
			appended = items.length > 0;
		} catch (err) {
			showError('Failed to load more trash: ' + (err.message || 'Unknown error'));
		} finally {
			if (seq === loadSeq) {
				loadingMore = false;
				if (appended) infiniteScroll?.kick();
			}
		}
	}

	function setupInfiniteScroll() {
		var root = document.getElementById('main-content');
		if (infiniteScroll) infiniteScroll.destroy();
		infiniteScroll = window.kkInfiniteScroll?.create({
			root: root,
			insertAfter: listEl,
			sentinelClass: 'trash-scroll-sentinel',
			canLoad: function () {
				return Boolean(listEl) && !loadingMore && hasMore;
			},
			onLoadMore: loadMoreTrash,
		});
	}

	function mount() {
		listEl = document.getElementById('trash-list');
		emptyState = document.getElementById('trash-empty-state');
		emptyBtn = document.getElementById('empty-trash-btn');
		selectAllCb = document.getElementById('trash-select-all-cb');
		batchActions = document.getElementById('trash-batch-actions');
		batchCount = document.getElementById('trash-batch-count');
		batchRestoreBtn = document.getElementById('trash-batch-restore-btn');
		batchDeleteBtn = document.getElementById('trash-batch-delete-btn');
		filterBtns = document.querySelectorAll('.trash-filter-btn');
		currentFilter = '';
		pageNum = 1;
		loadingMore = false;
		hasMore = false;
		knownTotal = 0;
		loadSeq++;

		selectAllCb?.addEventListener('change', function () {
			var cbs = listEl.querySelectorAll('.batch-cb');
			cbs.forEach(function (cb) { cb.checked = selectAllCb.checked; });
			updateBatchBar();
		});

		batchRestoreBtn?.addEventListener('click', async function () {
			var items = getSelected();
			if (!items.length) return;
			setButtonLoading(batchRestoreBtn, true);
			try {
				await api('POST', '/trash/batch/restore', { items: items });
				removeTrashItems(items);
				showSuccess(items.length + ' items restored');
				refreshTrashCount();
				refreshCounts();
			} catch (err) {
				showError(err.message || 'Batch restore failed');
			} finally {
				setButtonLoading(batchRestoreBtn, false);
			}
		});

		batchDeleteBtn?.addEventListener('click', async function () {
			var items = getSelected();
			if (!items.length) return;
			var confirmed = await confirmAction('Delete Forever', items.length + ' items will be permanently deleted. This cannot be undone.');
			if (!confirmed) return;
			setButtonLoading(batchDeleteBtn, true);
			try {
				await api('POST', '/trash/batch/delete', { items: items });
				removeTrashItems(items);
				showSuccess(items.length + ' items permanently deleted');
				refreshTrashCount();
				refreshCounts();
			} catch (err) {
				showError(err.message || 'Batch delete failed');
			} finally {
				setButtonLoading(batchDeleteBtn, false);
			}
		});

		emptyBtn?.addEventListener('click', async function () {
			var confirmed = await confirmAction('Empty Trash', 'All items in trash will be permanently deleted. This cannot be undone.');
			if (!confirmed) return;
			setButtonLoading(emptyBtn, true);
			try {
				await api('DELETE', '/trash?confirm=true');
				setTrashBadgeCount(0);
				knownTotal = 0;
				hasMore = false;
				listEl.replaceChildren();
				resetBatchBar();
				updateEmptyState();
				showSuccess('Trash emptied');
				refreshTrashCount();
				refreshCounts();
			} catch (err) {
				showError(err.message || 'Empty trash failed');
			} finally {
				setButtonLoading(emptyBtn, false);
			}
		});

		filterBtns.forEach(function (btn) {
			btn.addEventListener('click', function () {
				filterBtns.forEach(function (b) { b.classList.remove('active'); });
				btn.classList.add('active');
				currentFilter = btn.dataset.type;
				loadTrash();
			});
		});

		setupInfiniteScroll();
		loadTrash();
	}

	function unmount() {
		if (infiniteScroll) infiniteScroll.destroy();
		infiniteScroll = null;
		loadSeq++;
		listEl = null;
		emptyState = null;
		emptyBtn = null;
		selectAllCb = null;
		batchActions = null;
		batchCount = null;
		batchRestoreBtn = null;
		batchDeleteBtn = null;
		filterBtns = null;
		currentFilter = '';
		pageNum = 1;
		loadingMore = false;
		hasMore = false;
		knownTotal = 0;
	}

	// Global for sidebar badge updates
	window.refreshTrashCount = function () {
		loadTrashCount();
	};

	window.__sections = window.__sections || {};
	window.__sections.trash = { mount: mount, unmount: unmount };
})();

async function refreshTrashCount() {
	try {
		const { count } = await api('GET', '/trash/count');
		const badge = document.getElementById('trash-count-badge');
		if (badge) {
			badge.textContent = count || '';
			badge.classList.toggle('d-none', !count);
		}
	} catch (e) {
		// ignore
	}
}
