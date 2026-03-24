import http from 'http';
import path from 'path';
import express from 'express';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

// Serve static client
app.use(express.static(path.join(__dirname, '..', 'public')));

// Basic healthcheck for Render
app.get('/healthz', (_req, res) => {
	res.status(200).send('ok');
});

const port = process.env.PORT || 3000;

// In-memory message history (kept small)
const MAX_HISTORY = 100;
const messageHistory = [];

// Simple room: all clients share the same channel
const wss = new WebSocketServer({ server });

function broadcast(data, excludeSocket = null) {
	wss.clients.forEach((client) => {
		if (client !== excludeSocket && client.readyState === 1) {
			client.send(JSON.stringify(data));
		}
	});
}

wss.on('connection', (ws) => {
	const userId = uuidv4();

	// Tell the client who they are
	ws.send(JSON.stringify({ type: 'whoami', userId }));

	// Send recent history on connect
	ws.send(JSON.stringify({ type: 'history', messages: messageHistory }));

	// Announce join
	const joinEvent = { type: 'system', id: uuidv4(), message: `User ${userId.slice(0, 8)} joined` };
	broadcast(joinEvent);

	ws.on('message', (raw) => {
		let text = '';
		try {
			// Accept either plain text or JSON {text}
			const parsed = JSON.parse(raw.toString());
			text = typeof parsed.text === 'string' ? parsed.text : raw.toString();
		} catch {
			text = raw.toString();
		}

		const trimmed = text.trim();
		if (!trimmed) return;

		const chatMessage = {
			type: 'chat',
			id: uuidv4(),
			userId,
			timestamp: new Date().toISOString(),
			text: trimmed
		};

		messageHistory.push(chatMessage);
		if (messageHistory.length > MAX_HISTORY) {
			messageHistory.shift();
		}

		broadcast(chatMessage);
	});

	ws.on('close', () => {
		const leaveEvent = { type: 'system', id: uuidv4(), message: `User ${userId.slice(0, 8)} left` };
		broadcast(leaveEvent);
	});
});

server.listen(port, () => {
	// eslint-disable-next-line no-console
	console.log(`Server listening on http://0.0.0.0:${port}`);
});

