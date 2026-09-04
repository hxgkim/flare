const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);

// Socket.io 서버 생성 (프론트엔드 주소 허용)
const io = new Server(server, {
  cors: {
    origin: "*", // 실제 서비스 시에는 React 앱 주소(예: http://localhost:3000)로 변경
    methods: ["GET", "POST"]
  }
});

io.on('connection', (socket) => {
  console.log('관리자 접속 완료:', socket.id);

  // 프론트엔드에서 세션/인원 변경 이벤트('update_session_data')를 보냈을 때
  socket.on('update_session_data', (data) => {
    // 나를 제외한 접속 중인 모든 관리자에게 변경된 데이터를 실시간 전달
    socket.broadcast.emit('session_data_changed', data);
  });

  socket.on('disconnect', () => {
    console.log('관리자 접속 해제:', socket.id);
  });
});

server.listen(4000, () => {
  console.log('실시간 소켓 서버 실행 중 (포트 4000)');
});