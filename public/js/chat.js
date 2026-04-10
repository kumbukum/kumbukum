/**
* AI Chat sidebar logic
*/
function initChat() {
	const input = document.getElementById('chat-input');
	const sendBtn = document.getElementById('chat-send');
	const messages = document.getElementById('chat-messages');
	const clearBtn = document.getElementById('clear-chat');

	if (!input || !sendBtn) return;

	function addMessage(role, text) {
		const div = document.createElement('div');
		div.className = `chat-message ${role}`;
		div.textContent = text;
		messages.appendChild(div);
		messages.scrollTop = messages.scrollHeight;
		return div;
	}

	async function sendMessage() {
		const query = input.value.trim();
		if (!query) return;

		addMessage('user', query);
		input.value = '';

		try {
			const { answer } = await api('POST', '/chat/search', { query });
			addMessage('assistant', answer);
		} catch (err) {
			addMessage('assistant', `Error: ${err.message}`);
		}
	}

	sendBtn.addEventListener('click', sendMessage);
	input.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') sendMessage();
	});

	clearBtn?.addEventListener('click', () => {
		messages.innerHTML = '';
	});
}
