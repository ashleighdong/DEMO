import http from 'http';
import path from 'path';
import express from 'express';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { MongoClient, ServerApiVersion } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';

/** Trim and strip accidental wrapping quotes from env-based URIs. */
function normalizeMongoUri(raw) {
	if (typeof raw !== 'string') return '';
	let uri = raw.trim();
	if (
		(uri.startsWith('"') && uri.endsWith('"')) ||
		(uri.startsWith("'") && uri.endsWith("'"))
	) {
		uri = uri.slice(1, -1).trim();
	}
	return uri;
}

/** Log-safe URI for debugging (never log raw passwords). */
function redactMongoUri(uri) {
	if (!uri) return '(empty)';
	try {
		return uri.replace(
			/^(mongodb(?:\+srv)?:\/\/)([^:@/]+):([^@]+)@/,
			(_m, proto, user) => `${proto}${user}:***@`
		);
	} catch {
		return '(unable to redact)';
	}
}

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
const mongoUri = normalizeMongoUri(process.env.MONGODB_URI);

// In-memory message history (kept small)
const MAX_HISTORY = 100;
const messageHistory = [];
let messagesCollection = null;

if (mongoUri) {
	try {
		// Atlas from cloud hosts: force IPv4 and disable address-family racing (common TLS fix).
		const mongoClient = new MongoClient(mongoUri, {
			family: 4,
			autoSelectFamily: false,
			serverApi: {
				version: ServerApiVersion.v1,
				strict: true,
				deprecationErrors: true
			}
		});
		await mongoClient.connect();
		messagesCollection = mongoClient.db('chat').collection('messages');
		// eslint-disable-next-line no-console
		console.log('Connected to MongoDB');
	} catch (err) {
		// eslint-disable-next-line no-console
		console.error('MongoDB connection failed, falling back to in-memory history:', err);
		// eslint-disable-next-line no-console
		console.error('Diagnostics:', {
			node: process.version,
			uriRedacted: redactMongoUri(mongoUri),
			startsWithSrv: mongoUri.startsWith('mongodb+srv://')
		});
		const code = err?.cause?.code ?? err?.cause?.cause?.code;
		if (code === 'ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR') {
			// eslint-disable-next-line no-console
			console.error(
				'Atlas TLS checklist: (1) URL-encode any special chars in the DB password in MONGODB_URI. (2) In Atlas → Database, ensure the cluster is not Paused. (3) User must exist under Database Access with a password (not "certificate only"). (4) URI must be mongodb+srv://... from Atlas "Connect your application", with no angle brackets.'
			);
		}
	}
} else {
	// eslint-disable-next-line no-console
	console.log('MONGODB_URI not set, using in-memory history');
}

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
	(async () => {
		try {
			if (messagesCollection) {
				const docs = await messagesCollection
					.find({ type: 'chat' }, { projection: { _id: 0 } })
					.sort({ timestamp: -1 })
					.limit(MAX_HISTORY)
					.toArray();
				ws.send(JSON.stringify({ type: 'history', messages: docs.reverse() }));
				return;
			}
		} catch {
			// fall through to in-memory history if database read fails
		}
		ws.send(JSON.stringify({ type: 'history', messages: messageHistory }));
	})();

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

		if (messagesCollection) {
			messagesCollection.insertOne(chatMessage).catch(() => {
				// keep chat running even if database write fails
			});
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

