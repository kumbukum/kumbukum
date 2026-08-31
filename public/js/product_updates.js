(function () {
	const CHECK_INTERVAL = 45 * 60 * 1000;
	const MIN_CHECK_GAP = 60 * 1000;
	let checkTimer = null;
	let checkInFlight = false;
	let lastCheckAt = 0;
	let modalLoadInFlight = false;
	let modalQueued = false;
	let dismissInFlight = false;

	function enabled() {
		return window.__product_updates_enabled === true && Boolean(document.getElementById('product-updates-modal-root'));
	}

	function productFetch(path, options) {
		return typeof window.accountFetch === 'function' ? window.accountFetch(path, options) : fetch(path, options);
	}

	function setBadge(count) {
		const badge = document.getElementById('product-updates-badge');
		if (!badge) return;
		const value = Math.max(Number(count) || 0, 0);
		badge.textContent = value > 99 ? '99+' : String(value);
		badge.classList.toggle('d-none', value === 0);
		badge.setAttribute('aria-label', value === 1 ? '1 unseen product update' : `${value} unseen product updates`);
	}

	async function showFailure(message) {
		if (typeof window.showError === 'function') return window.showError(message);
		const vendor = await import('/static/js/vendor.js');
		return vendor.Swal.fire({ title: 'Error', text: message, icon: 'error' });
	}

	async function modalClass() {
		if (window.BsModal) return window.BsModal;
		const vendor = await import('/static/js/vendor.js');
		window.BsModal = vendor.Modal;
		return window.BsModal;
	}

	function anotherModalIsOpen() {
		return Boolean(document.querySelector('.modal.show:not(#productUpdatesModal)'));
	}

	async function showQueuedModal() {
		if (!modalQueued || anotherModalIsOpen()) return;
		const modal = document.getElementById('productUpdatesModal');
		if (!modal) {
			modalQueued = false;
			return;
		}
		modalQueued = false;
		const Modal = await modalClass();
		Modal.getOrCreateInstance(modal, { backdrop: 'static', keyboard: false }).show();
	}

	async function markSeen(updateId) {
		const response = await productFetch('/ajax/product-updates/seen', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ update_id: updateId }),
		});
		if (!response.ok) {
			const payload = await response.json().catch(function () { return {}; });
			throw new Error(payload.error || 'Could not save the product update status');
		}
		setBadge(0);
		return response.json();
	}

	function setActionBusy(button, busy) {
		if (!button) return;
		button.disabled = busy;
		button.setAttribute('aria-busy', busy ? 'true' : 'false');
		button.querySelector('[data-product-updates-spinner]')?.classList.toggle('d-none', !busy);
	}

	async function dismissModal(button, openLink) {
		if (dismissInFlight) return;
		const modal = document.getElementById('productUpdatesModal');
		const updateId = modal?.dataset.throughUpdateId || '';
		if (!modal || !updateId) return;
		dismissInFlight = true;
		setActionBusy(button, true);
		modal.querySelectorAll('[data-product-updates-dismiss], [data-product-updates-read-more]').forEach(function (action) {
			if (action !== button) action.disabled = true;
		});
		let popup = null;
		if (openLink) {
			popup = window.open('about:blank', '_blank');
			if (popup) popup.opener = null;
		}
		try {
			await markSeen(updateId);
			const Modal = await modalClass();
			Modal.getOrCreateInstance(modal).hide();
			if (popup) popup.location.href = modal.dataset.readMoreLink;
		} catch (error) {
			if (popup) popup.close();
			await showFailure(error.message);
		} finally {
			dismissInFlight = false;
			setActionBusy(button, false);
			modal.querySelectorAll('[data-product-updates-dismiss], [data-product-updates-read-more]').forEach(function (action) { action.disabled = false; });
		}
	}

	function bindModal(modal) {
		modal.querySelectorAll('[data-product-updates-dismiss]').forEach(function (button) {
			button.addEventListener('click', function () { void dismissModal(button, false); });
		});
		modal.querySelector('[data-product-updates-read-more]')?.addEventListener('click', function (event) {
			void dismissModal(event.currentTarget, true);
		});
		modal.addEventListener('hidden.bs.modal', function () {
			document.getElementById('product-updates-modal-root')?.replaceChildren();
		}, { once: true });
	}

	async function loadModal() {
		if (modalLoadInFlight || document.getElementById('productUpdatesModal')) return;
		modalLoadInFlight = true;
		try {
			const response = await productFetch('/ajax/product-updates/modal');
			if (response.status === 204) return;
			if (!response.ok) throw new Error('Could not load product update details');
			const root = document.getElementById('product-updates-modal-root');
			if (!root) return;
			root.innerHTML = await response.text();
			const modal = document.getElementById('productUpdatesModal');
			if (!modal) return;
			bindModal(modal);
			modalQueued = true;
			await showQueuedModal();
		} catch (error) {
			console.error('Product update modal failed:', error);
		} finally {
			modalLoadInFlight = false;
		}
	}

	function scheduleCheck() {
		window.clearTimeout(checkTimer);
		checkTimer = window.setTimeout(checkStatus, CHECK_INTERVAL);
	}

	async function checkStatus() {
		if (!enabled()) return;
		if (document.hidden || checkInFlight || Date.now() - lastCheckAt < MIN_CHECK_GAP) {
			scheduleCheck();
			return;
		}
		checkInFlight = true;
		lastCheckAt = Date.now();
		try {
			const response = await productFetch('/ajax/product-updates/status');
			if (!response.ok) throw new Error(`Status ${response.status}`);
			const status = await response.json();
			setBadge(status.new_count);
			if (status.has_modal) await loadModal();
		} catch (error) {
			console.error('Product update status failed:', error);
		} finally {
			checkInFlight = false;
			scheduleCheck();
		}
	}

	async function appendNextPage(root, button) {
		const cursor = root.dataset.nextCursor || '';
		if (!cursor || button.disabled) return;
		setActionBusy(button, true);
		try {
			const response = await productFetch(`/ajax/product-updates/items?cursor=${encodeURIComponent(cursor)}`);
			if (!response.ok) throw new Error('Could not load more product updates');
			const template = document.createElement('template');
			template.innerHTML = await response.text();
			const fragmentRoot = template.content.querySelector('[data-product-update-items-fragment]');
			const list = root.querySelector('#product-updates-list');
			if (!fragmentRoot || !list) throw new Error('Product update response was invalid');
			while (fragmentRoot.firstChild) list.appendChild(fragmentRoot.firstChild);
			root.dataset.nextCursor = fragmentRoot.dataset.nextCursor || '';
			button.classList.toggle('d-none', !root.dataset.nextCursor);
		} catch (error) {
			await showFailure(error.message);
		} finally {
			setActionBusy(button, false);
		}
	}

	function mountNews() {
		const root = document.getElementById('product-updates-news');
		if (!root || root.dataset.mounted === 'true') return;
		root.dataset.mounted = 'true';
		const button = root.querySelector('[data-product-updates-load-more]');
		button?.addEventListener('click', function () { void appendNextPage(root, button); });
		const updateId = root.dataset.latestUpdateId || '';
		if (updateId) markSeen(updateId).catch(function (error) { void showFailure(error.message); });
	}

	window.__sections = window.__sections || {};
	window.__sections.news = { mount: mountNews, unmount: function () {} };
	document.addEventListener('hidden.bs.modal', function () { void showQueuedModal(); });
	document.addEventListener('visibilitychange', function () {
		if (!document.hidden && enabled()) {
			lastCheckAt = 0;
			void checkStatus();
		}
	});
	document.addEventListener('DOMContentLoaded', function () {
		mountNews();
		if (enabled()) void checkStatus();
	});
})();
