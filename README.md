# Chatroom (Express + React + Socket.IO + MongoDB)

## What you get
- Node/Express backend
- Socket.IO real-time chat
- MongoDB message storage
- React/Vite frontend

## Local setup
1. Start MongoDB
   - Recommended: MongoDB Atlas, or a local MongoDB instance.
2. Backend env:
   - Copy `server/.env.example` to `server/.env`
   - Set `MONGODB_URI` (and `CLIENT_ORIGIN` if you want stricter CORS)
3. Install dependencies:
   - `cd server && npm install`
   - `cd ../client && npm install`
4. Run both:
   - Backend: `cd server && npm run dev`
   - Frontend: `cd client && npm run dev`
5. Open the frontend (Vite) URL. Send messages; they’ll be stored in Mongo.

## Deployment to Render (recommended split)
You’ll deploy:
- `server` as a Render “Web Service”
- `client` as a Render “Static Site”

### 1) Deploy backend (Express + Socket.IO)
1. Create a Render Web Service from `server/`
2. Build command:
   - `npm install`
3. Start command:
   - `npm run start`
4. Environment variables:
   - `MONGODB_URI` (MongoDB Atlas connection string)
   - `PORT` (Render sets this automatically; you can omit)
   - `CLIENT_ORIGIN` = your frontend URL (example: `https://your-frontend.onrender.com`)

### 2) Deploy frontend (React)
1. Create a Render Static Site from `client/`
2. Build command:
   - `npm install && npm run build`
3. Publish directory:
   - `dist`
4. Environment variable for build/runtime:
   - `VITE_SOCKET_URL` = your backend URL (example: `https://your-backend.onrender.com`)

### 3) CORS + websockets note
- The backend `CLIENT_ORIGIN` must match the frontend origin for Socket.IO to connect.

