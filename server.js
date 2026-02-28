// npm install ws

const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: process.env.PORT || 8080 });

// rooms: { roomCode: { id: { ws, name } } }
const rooms = {};

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

wss.on('connection', (ws) => {
  let myId = null;
  let myRoom = null;
  let myName = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'join') {
      myId = genId();
      myRoom = msg.room.toUpperCase();
      myName = msg.name;

      if (!rooms[myRoom]) rooms[myRoom] = {};

      // Send welcome with existing peers
      const existingPeers = Object.entries(rooms[myRoom]).map(([id, p]) => ({ id, name: p.name }));
      ws.send(JSON.stringify({ type: 'welcome', id: myId, peers: existingPeers }));

      // Tell everyone else this person joined
      broadcast(myRoom, myId, { type: 'peer-joined', id: myId, name: myName });

      // Add to room
      rooms[myRoom][myId] = { ws, name: myName };
    }

    else if (msg.type === 'offer' || msg.type === 'answer' || msg.type === 'ice') {
      // Forward to specific peer
      const room = rooms[msg.room];
      if (room && room[msg.to]) {
        room[msg.to].ws.send(JSON.stringify({ ...msg, from: myId }));
      }
    }

    else if (msg.type === 'speaking') {
      // Broadcast speaking state to room
      broadcast(myRoom, myId, { type: 'speaking', from: myId, name: myName, speaking: msg.speaking });
    }
  });

  ws.on('close', () => {
    if (myRoom && rooms[myRoom] && myId) {
      delete rooms[myRoom][myId];
      if (Object.keys(rooms[myRoom]).length === 0) delete rooms[myRoom];
      broadcast(myRoom, myId, { type: 'peer-left', id: myId, name: myName });
    }
  });
});

function broadcast(room, excludeId, msg) {
  if (!rooms[room]) return;
  const data = JSON.stringify(msg);
  for (const [id, peer] of Object.entries(rooms[room])) {
    if (id !== excludeId && peer.ws.readyState === WebSocket.OPEN) {
      peer.ws.send(data);
    }
  }
}

console.log('Signaling server running...');
