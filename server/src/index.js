const http = require("http");

const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const helmet = require("helmet");
const mongoose = require("mongoose");
const morgan = require("morgan");
const { Server } = require("socket.io");

const Message = require("./models/Message");

dotenv.config();

const PORT = process.env.PORT || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "*";
const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/chatroom";

let mongoConnected = false;

const app = express();
app.use(helmet());
app.use(
  cors({
    origin: CLIENT_ORIGIN,
    credentials: true,
  })
);
app.use(morgan("dev"));
app.use(express.json());

app.get("/healthz", (req, res) => {
  // Health checks must be fast; MongoDB may not be ready yet on free instances.
  res.json({ ok: true, mongoConnected });
});

const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_ORIGIN,
    credentials: true,
  },
});

io.on("connection", (socket) => {
  // Default room if the client doesn't specify one.
  socket.data.roomId = "general";

  socket.on("join_room", async ({ roomId } = {}) => {
    const nextRoomId = (roomId || "general").toString();

    socket.data.roomId = nextRoomId;
    socket.join(nextRoomId);

    let messages = [];
    try {
      messages = await Message.find({ roomId: nextRoomId })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();
    } catch (err) {
      console.error("join_room failed:", err);
    }

    // Send oldest->newest for nicer UI rendering.
    socket.emit("messages", messages.reverse());
  });

  socket.on("send_message", async ({ roomId, username, content } = {}) => {
    const nextRoomId = (roomId || socket.data.roomId || "general").toString();
    const nextUsername = (username || "").toString().trim();
    const nextContent = (content || "").toString().trim();

    if (!nextUsername || !nextContent) return;
    if (nextContent.length > 1000) return;

    try {
      const created = await Message.create({
        roomId: nextRoomId,
        username: nextUsername,
        content: nextContent,
      });
      io.to(nextRoomId).emit("new_message", created.toObject());
    } catch (err) {
      console.error("send_message failed:", err);
    }
  });
});

function startServer() {
  httpServer.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

async function connectToMongoWithRetry() {
  // Keep the service up even if Mongo takes a while to come online.
  for (let attempt = 1; attempt <= Infinity; attempt++) {
    try {
      await mongoose.connect(MONGODB_URI);
      mongoConnected = true;
      console.log("Connected to MongoDB");
      return;
    } catch (err) {
      mongoConnected = false;
      const waitMs = Math.min(10000, 1000 * attempt);
      console.error(
        `MongoDB connection failed (attempt ${attempt}). Retrying in ${waitMs}ms:`,
        err?.message || err
      );
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}

startServer();
connectToMongoWithRetry();

