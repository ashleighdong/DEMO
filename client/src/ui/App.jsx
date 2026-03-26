import React, { useEffect, useMemo, useRef, useState } from 'react';

function useWebSocketChat() {
	const [messages, setMessages] = useState([]);
	const [status, setStatus] = useState('Connecting…');
	const [myUserId, setMyUserId] = useState(null);
	const wsRef = useRef(null);

	const wsUrl = useMemo(() => {
		const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
		return `${proto}://${window.location.host}`;
	}, []);

	useEffect(() => {
		let closed = false;
		function connect() {
			const ws = new WebSocket(wsUrl);
			wsRef.current = ws;
			setStatus('Connecting…');

			ws.onopen = () => setStatus('Connected');
			ws.onclose = () => {
				setStatus('Disconnected – retrying…');
				if (!closed) setTimeout(connect, 1500);
			};
			ws.onmessage = (e) => {
				try {
					const data = JSON.parse(e.data);
					if (data.type === 'history' && Array.isArray(data.messages)) {
						setMessages(data.messages);
						return;
					}
					if (data.type === 'chat') setMessages((m) => [...m, data]);
					if (data.type === 'system') setMessages((m) => [...m, data]);
					if (data.type === 'whoami') setMyUserId(data.userId);
				} catch {
					// ignore
				}
			};
		}
		connect();
		return () => {
			closed = true;
			wsRef.current?.close();
		};
	}, [wsUrl]);

	const send = (text) => {
		if (wsRef.current?.readyState === WebSocket.OPEN) {
			wsRef.current.send(JSON.stringify({ text }));
		}
	};

	return { messages, send, status, myUserId };
}

async function fetchWeather(city) {
	const res = await fetch(`/api/weather?city=${encodeURIComponent(city)}`);
	const data = await res.json();
	if (!res.ok) throw new Error(data?.error || 'weather error');
	return data;
}

export function App() {
	const { messages, send, status, myUserId } = useWebSocketChat();
	const [input, setInput] = useState('');
	const [city, setCity] = useState('New York');
	const [weather, setWeather] = useState(null);
	const [weatherStatus, setWeatherStatus] = useState('--');

	useEffect(() => {
		(async () => {
			try {
				setWeatherStatus('Loading…');
				const w = await fetchWeather(city);
				setWeather(w);
				const temp = typeof w.tempF === 'number' ? `${Math.round(w.tempF)}F` : '--';
				setWeatherStatus(`${w.city}: ${temp}, ${w.description || ''}`);
			} catch (e) {
				setWeather(null);
				setWeatherStatus('Weather error');
			}
		})();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const onSubmit = (e) => {
		e.preventDefault();
		const text = input.trim();
		if (!text) return;
		send(text);
		setInput('');
	};

	const onWeather = async (e) => {
		e.preventDefault();
		const c = city.trim();
		if (!c) return;
		try {
			setWeatherStatus('Loading…');
			const w = await fetchWeather(c);
			setWeather(w);
			const temp = typeof w.tempF === 'number' ? `${Math.round(w.tempF)}F` : '--';
			setWeatherStatus(`${w.city}: ${temp}, ${w.description || ''}`);
		} catch {
			setWeather(null);
			setWeatherStatus('Weather error');
		}
	};

	return (
		<div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', background: 'Canvas', color: 'CanvasText' }}>
			<div style={{ width: 'min(960px, 100%)', height: 'min(720px, 100%)', display: 'grid', gridTemplateRows: 'auto 1fr auto', border: '1px solid rgba(0,0,0,.1)', borderRadius: 12, overflow: 'hidden', background: 'color-mix(in oklab, Canvas 96%, CanvasText 4%)' }}>
				<header style={{ padding: '16px 20px', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, background: 'color-mix(in oklab, Canvas 92%, CanvasText 8%)' }}>
					<div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
						<div>Chatroom</div>
						<div style={{ fontSize: 12, opacity: .8 }}>{status}</div>
					</div>
					<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
						<form onSubmit={onWeather} style={{ display: 'flex', gap: 6 }}>
							<input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" style={{ width: 120, padding: 8, borderRadius: 8, border: '1px solid rgba(0,0,0,.2)', background: 'Canvas', color: 'CanvasText' }} />
							<button type="submit" style={{ padding: '8px 10px', fontSize: 12, borderRadius: 8, border: 0, background: '#334155', color: 'white', cursor: 'pointer' }}>Weather</button>
						</form>
						<div style={{ fontSize: 12, opacity: .9, minWidth: 170, textAlign: 'right' }}>{weatherStatus}</div>
					</div>
				</header>
				<main style={{ padding: 16, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
					{messages.map((m) => {
						if (m.type === 'system') {
							return <div key={m.id} style={{ alignSelf: 'center', fontSize: 12, opacity: .8 }}>{m.message}</div>;
						}
						const isMe = m.userId && myUserId && m.userId === myUserId;
						return (
							<div key={m.id} style={{ padding: '10px 12px', borderRadius: 10, maxWidth: '75%', width: 'fit-content', boxShadow: '0 1px 1px rgba(0,0,0,.05)', alignSelf: isMe ? 'flex-end' : 'flex-start', background: isMe ? '#4f46e5' : 'color-mix(in oklab, Canvas 85%, CanvasText 15%)', color: isMe ? 'white' : 'inherit' }}>
								{m.text}
							</div>
						);
					})}
				</main>
				<form onSubmit={onSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, padding: 12, background: 'color-mix(in oklab, Canvas 92%, CanvasText 8%)' }}>
					<input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type a message…" required style={{ padding: 12, borderRadius: 8, border: '1px solid rgba(0,0,0,.2)', background: 'Canvas', color: 'CanvasText' }} />
					<button type="submit" style={{ padding: '12px 16px', borderRadius: 8, border: 0, background: '#4f46e5', color: 'white', fontWeight: 600, cursor: 'pointer' }}>Send</button>
				</form>
			</div>
		</div>
	);
}
