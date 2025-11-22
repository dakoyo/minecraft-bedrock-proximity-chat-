# minecraft-proximity-vc
Minecraft統合版でプロキシミティチャット（近づくと喋れるボイスチャット）を実装しようと考えています。統合版はJava版のModやプラグインのようにアドオンを使用して外部と通信することはできません。そのため/connectコマンドを使用して接続できるwebSocketサーバーを利用して統合版と通信をしていきます。

```

import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'crypto';

// Minimal WebSocket server to interact with Minecraft Bedrock Edition
// This server listens for a connection, sends a command, and logs the response.

const PORT = 8080;

// 1. WebSocket Server Setup
const wss = new WebSocketServer({ port: PORT });

console.log(`WebSocket server started on ws://localhost:${PORT}`);

wss.on('connection', (ws: WebSocket) => {
    console.log('Minecraft client connected.');

    // 2. Subscribe to PlayerMessage event
    // Without this, Minecraft won't send any events to the server.
    // This is a bit of a magic packet, but it's necessary.
    // The requestId is a random UUID.
    const subscribePacket = {
        header: {
            version: 1,
            requestId: randomUUID(),
            messagePurpose: 'subscribe',
            messageType: 'commandRequest',
        },
        body: {
            eventName: 'PlayerMessage',
        },
    };
    ws.send(JSON.stringify(subscribePacket));
    console.log('Sent subscribe packet for PlayerMessage.');


    // 3. Sending a Command
    // We'll send a `/list` command to get the list of players.
    const commandPacket = {
        header: {
            version: 1,
            requestId: randomUUID(),
            messagePurpose: 'commandRequest',
        },
        body: {
            version: 1, // This seems to be a required field for command requests
            commandLine: '/getlocalplayer', // get owner playername
            origin: {
                type: 'player', // The origin of the command
            }
        },
    };

    ws.send(JSON.stringify(commandPacket));

    // 4. Receiving Messages
    ws.on('message', (data: Buffer) => {
        const message = data.toString('utf-8');
        try {
            const jsonMessage = JSON.parse(message);
            
            // Log the entire message for debugging
            console.log('Received message:', JSON.stringify(jsonMessage, null, 2));

            const header = jsonMessage.header;
            const body = jsonMessage.body;

            if (header && header.messagePurpose === 'commandResponse') {
                console.log('Received command response:');
                if (body.statusCode === 0) {
                    console.log('Command successful!');
                    console.log('Status Message:', body.statusMessage);
                } else {
                    console.error('Command failed with status code:', body.statusCode);
                    console.error('Status Message:', body.statusMessage);
                }
            } else if (header && header.messagePurpose === 'event' && header.eventName === 'PlayerMessage') {
                console.log('Received PlayerMessage event (chat from player):', body);
            } else if (header && header.messagePurpose === 'error') {
                console.error('Received an error from the client:', body);
            }

        } catch (error) {
            console.error('Failed to parse incoming message:', message);
        }
    });

    ws.on('close', () => {
        console.log('Minecraft client disconnected.');
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});
```

上の様なコードを書き、マインクラフト内で/connect localhost8080（例）と書くことでコマンドライン（今回は say Hello）のコマンド返り値を取得できます。
近接ボイスチャット、立体音響を実装するためにはプレイヤーの顔の向きや座標などを細かかつ連続的に取得する必要があります。現在マインクラフトにはwebSocketにデータを垂れ流す手法がありません。
そこで、マインクラフト内のScriptAPIの機能を使用してオリジナルコマンドを作成します

```ts
import * as mc from "@minecraft/server";
const { world, system } = mc;

system.beforeEvents.startup.subscribe(ev => {
    console.warn("TES")
    ev.customCommandRegistry.registerCommand({
        name: "vc:sync",
        description: "test",
        permissionLevel: mc.CommandPermissionLevel.GameDirectors,

    }
        ,
        (origin: mc.CustomCommandOrigin, ...args: any[]) => {
            return {
                message: "TEST", //ここで返すメッセージを指定（差分更新）
                status: mc.CustomCommandStatus.Success
            }
        })
})
```

こちらのコマンドの戻り値のmessageをプレイヤーの座標や顔の向き、グループなどにし、サーバー側は0.1秒ごと程度にポーリングすることでデータを取得します。
サーバーは外部（renderなど）にホストし、複数のクライアントとの接続に耐えられるようにします。

本題のボイスチャットでは技術としてwebRTCを使用します。cloudflare workers durable objectsを使用することによりシグナリングを行います。座標や顔の向きのブロードキャストに関しては、webSocketサーバーからオーナーのみ配信、差分のみdataChannelを介して他のプレイヤーに配信します。

@apps/addonにはすでに差分をwebSocketに配信するアドオンコードが書かれています。将来的にグループ機能なども追加する予定です。
