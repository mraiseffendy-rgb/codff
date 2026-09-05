const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
    if (req.url === "/" || req.url === "/index.html") {
        const file = path.join(__dirname, "index.html");

        fs.readFile(file, (err, data) => {
            if (err) {
                res.writeHead(500);
                res.end("Gagal membaca index.html");
                return;
            }

            res.writeHead(200, {
                "Content-Type": "text/html; charset=utf-8",
                "Cache-Control": "no-cache"
            });

            res.end(data);
        });

        return;
    }

    res.writeHead(404);
    res.end("404 Not Found");
});

const wss = new WebSocket.Server({ server });

const users = new Map();

function broadcast(data) {
    const message = JSON.stringify(data);

    for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    }
}

function sendUserList() {
    const list = [];

    for (const [, user] of users) {
        list.push(user);
    }

    broadcast({
        type: "users",
        users: list
    });
}

wss.on("connection", (socket) => {
    let currentUser = null;

    socket.send(JSON.stringify({
        type: "system",
        message: "Terhubung ke server."
    }));

    socket.on("message", (raw) => {
        let data;

        try {
            data = JSON.parse(raw.toString());
        } catch {
            return;
        }

        // USER JOIN
        if (data.type === "join") {
            const username = String(data.username || "")
                .trim()
                .slice(0, 24);

            if (!username) {
                socket.send(JSON.stringify({
                    type: "error",
                    message: "Username tidak boleh kosong."
                }));
                return;
            }

            currentUser = {
                username,
                joinedAt: Date.now()
            };

            users.set(socket, currentUser);

            broadcast({
                type: "system",
                message: `${username} bergabung ke chat.`
            });

            sendUserList();

            return;
        }

        // CHAT MESSAGE
        if (data.type === "message") {
            if (!currentUser) return;

            const text = String(data.message || "")
                .trim()
                .slice(0, 2000);

            if (!text) return;

            broadcast({
                type: "message",
                username: currentUser.username,
                message: text,
                time: new Date().toISOString()
            });

            return;
        }

        // TYPING
        if (data.type === "typing") {
            if (!currentUser) return;

            for (const client of wss.clients) {
                if (
                    client !== socket &&
                    client.readyState === WebSocket.OPEN
                ) {
                    client.send(JSON.stringify({
                        type: "typing",
                        username: currentUser.username,
                        typing: Boolean(data.typing)
                    }));
                }
            }

            return;
        }
    });

    socket.on("close", () => {
        if (!currentUser) return;

        users.delete(socket);

        broadcast({
            type: "system",
            message: `${currentUser.username} keluar dari chat.`
        });

        sendUserList();
    });

    socket.on("error", () => {
        users.delete(socket);
    });
});

server.listen(PORT, "0.0.0.0", () => {
    console.log("=================================");
    console.log(" RANZ REALTIME CHAT");
    console.log("=================================");
    console.log(`Server berjalan di port ${PORT}`);
    console.log(`Local: http://localhost:${PORT}`);
});
