const statusEl = document.getElementById('status');
const messagesEl = document.getElementById('messages');
const formEl = document.getElementById('form');
const inputEl = document.getElementById('input');

const wsProtocol = location.protocol === 'https:' ? 'wss' : 'ws';
const wsUrl = `${wsProtocol}://${location.host}`;
let ws;
let myUserId = null;

function appendMessage(node) {
	messagesEl.appendChild(node);
	messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderChat({ userId, text }) {
	const div = document.createElement('div');
	div.className = `msg ${userId === myUserId ? 'me' : 'other'}`;
	div.textContent = text;
	appendMessage(div);
}

function renderSystem(text) {
	const div = document.createElement('div');
	div.className = 'msg system';
	div.textContent = text;
	appendMessage(div);
}

function connect() {
	ws = new WebSocket(wsUrl);
	statusEl.textContent = 'Connecting…';

	ws.onopen = () => {
		statusEl.textContent = 'Connected';
	};

	ws.onmessage = (ev) => {
		try {
			const data = JSON.parse(ev.data);
			if (data.type === 'history' && Array.isArray(data.messages)) {
				data.messages.forEach((m) => {
					if (m.type === 'chat') renderChat(m);
					if (m.type === 'system') renderSystem(m.message);
				});
				return;
			}
			if (data.type === 'chat') renderChat(data);
			if (data.type === 'system') renderSystem(data.message);
			if (data.type === 'whoami') {
				myUserId = data.userId;
			}
		} catch {
			// ignore malformed
		}
	};

	ws.onclose = () => {
		statusEl.textContent = 'Disconnected – retrying in 2s…';
		setTimeout(connect, 2000);
	};
}

formEl.addEventListener('submit', (e) => {
	e.preventDefault();
	const text = inputEl.value.trim();
	if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;
	ws.send(JSON.stringify({ text }));
	inputEl.value = '';
});

connect();

