import WebSocket from "ws";

const ws = new WebSocket("ws://localhost:3000/frontendws");

ws.on("open", () => {
    console.log("Connected to frontendws");
});

ws.on("message", (data) => {
    const message = JSON.parse(data.toString());
    if (message.code) {
        console.log(`Room Code: ${message.code}`);
        // Keep connection open
    }
});

// Keep process alive
setInterval(() => { }, 10000);
