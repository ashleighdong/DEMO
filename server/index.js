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

// Serve React client build (created during npm run build)
app.use(express.static(path.join(__dirname, 'client-dist')));

// Basic healthcheck for Render
app.get('/healthz', (_req, res) => {
	res.status(200).send('ok');
});

app.get('/api/weather', async (req, res) => {
	const apiKey = process.env.OPENWEATHER_API_KEY;
	const city = typeof req.query.city === 'string' ? req.query.city.trim() : '';

	if (!apiKey) {
		return res.status(500).json({ error: 'OPENWEATHER_API_KEY is not configured' });
	}

	if (!city) {
		return res.status(400).json({ error: 'city query param is required' });
	}

	const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${encodeURIComponent(apiKey)}&units=imperial`;

	try {
		const upstreamRes = await fetch(weatherUrl);
		const upstreamData = await upstreamRes.json();

		if (!upstreamRes.ok) {
			const msg = typeof upstreamData?.message === 'string' ? upstreamData.message : 'Weather lookup failed';
			return res.status(upstreamRes.status).json({ error: msg });
		}

		const payload = {
			city: upstreamData?.name || city,
			tempF: upstreamData?.main?.temp,
			feelsLikeF: upstreamData?.main?.feels_like,
			description: upstreamData?.weather?.[0]?.description || '',
			icon: upstreamData?.weather?.[0]?.icon || ''
		};

		return res.status(200).json(payload);
	} catch {
		return res.status(502).json({ error: 'Failed to contact weather provider' });
	}
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

// Fallback to client index.html for any other route (SPA)
app.get('*', (_req, res) => {
	res.sendFile(path.join(__dirname, 'client-dist', 'index.html'));
});

server.listen(port, () => {
	// eslint-disable-next-line no-console
	console.log(`Server listening on http://0.0.0.0:${port}`);
});

