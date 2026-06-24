// WebRTC 语音/视频通话
var rtc = {
  pc: null,
  localStream: null,
  remoteStream: null,
  callRoom: null,
  isCaller: false
};

var iceServers = {
  iceServers: [
    {urls: 'stun:stun.l.google.com:19302'},
    {urls: 'stun:stun1.l.google.com:19302'},
    {urls: 'stun:stun2.l.google.com:19302'}
  ]
};

// 发起通话
async function initiateCall(contactName, isVideo) {
  rtc.isCaller = true;
  rtc.callRoom = [myId, contactName].sort().join('_call');

  try {
    rtc.localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: isVideo
    });

    if (isVideo) {
      var lv = document.getElementById('localVideo');
      if (lv) lv.srcObject = rtc.localStream;
    }

    rtc.pc = new RTCPeerConnection(iceServers);
    rtc.localStream.getTracks().forEach(function(t) {
      rtc.pc.addTrack(t, rtc.localStream);
    });

    rtc.pc.ontrack = function(e) {
      rtc.remoteStream = e.streams[0];
      var rv = document.getElementById('remoteVideo');
      var ra = document.getElementById('remoteAudio');
      if (rv && isVideo) rv.srcObject = rtc.remoteStream;
      if (ra) { ra.srcObject = rtc.remoteStream; ra.play(); }
    };

    rtc.pc.onicecandidate = function(e) {
      if (e.candidate) {
        _sb.from('calls').insert({
          room_id: rtc.callRoom,
          type: 'ice',
          data: JSON.stringify(e.candidate),
          sender: myId
        });
      }
    };

    var offer = await rtc.pc.createOffer();
    await rtc.pc.setLocalDescription(offer);

    await _sb.from('calls').insert({
      room_id: rtc.callRoom,
      type: 'offer',
      data: JSON.stringify(offer),
      sender: myId
    });

    // 监听应答
    _sb.channel('call:'+rtc.callRoom)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'calls',
        filter: 'room_id=eq.'+rtc.callRoom
      }, handleCallSignal)
      .subscribe();

    // 显示通话界面
    if (isVideo) showVideoCallScreen();
    else showVoiceCallScreen();

  } catch(e) {
    alert('无法访问麦克风/摄像头：' + e.message);
  }
}

// 接听通话
async function answerCall(contactName, offerData, isVideo) {
  rtc.isCaller = false;
  rtc.callRoom = [myId, contactName].sort().join('_call');

  try {
    rtc.localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: isVideo
    });

    rtc.pc = new RTCPeerConnection(iceServers);
    rtc.localStream.getTracks().forEach(function(t) {
      rtc.pc.addTrack(t, rtc.localStream);
    });

    rtc.pc.ontrack = function(e) {
      rtc.remot
cd ~/GhostChat
cat > webrtc.js << 'EOF'
// WebRTC 语音/视频通话
var rtc = {
  pc: null,
  localStream: null,
  remoteStream: null,
  callRoom: null,
  isCaller: false
};

var iceServers = {
  iceServers: [
    {urls: 'stun:stun.l.google.com:19302'},
    {urls: 'stun:stun1.l.google.com:19302'},
    {urls: 'stun:stun2.l.google.com:19302'}
  ]
};

// 发起通话
async function initiateCall(contactName, isVideo) {
  rtc.isCaller = true;
  rtc.callRoom = [myId, contactName].sort().join('_call');

  try {
    rtc.localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: isVideo
    });

    if (isVideo) {
      var lv = document.getElementById('localVideo');
      if (lv) lv.srcObject = rtc.localStream;
    }

    rtc.pc = new RTCPeerConnection(iceServers);
    rtc.localStream.getTracks().forEach(function(t) {
      rtc.pc.addTrack(t, rtc.localStream);
    });

    rtc.pc.ontrack = function(e) {
      rtc.remoteStream = e.streams[0];
      var rv = document.getElementById('remoteVideo');
      var ra = document.getElementById('remoteAudio');
      if (rv && isVideo) rv.srcObject = rtc.remoteStream;
      if (ra) { ra.srcObject = rtc.remoteStream; ra.play(); }
    };

    rtc.pc.onicecandidate = function(e) {
      if (e.candidate) {
        _sb.from('calls').insert({
          room_id: rtc.callRoom,
          type: 'ice',
          data: JSON.stringify(e.candidate),
          sender: myId
        });
      }
    };

    var offer = await rtc.pc.createOffer();
    await rtc.pc.setLocalDescription(offer);

    await _sb.from('calls').insert({
      room_id: rtc.callRoom,
      type: 'offer',
      data: JSON.stringify(offer),
      sender: myId
    });

    // 监听应答
    _sb.channel('call:'+rtc.callRoom)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'calls',
        filter: 'room_id=eq.'+rtc.callRoom
      }, handleCallSignal)
      .subscribe();

    // 显示通话界面
    if (isVideo) showVideoCallScreen();
    else showVoiceCallScreen();

  } catch(e) {
    alert('无法访问麦克风/摄像头：' + e.message);
  }
}

// 接听通话
async function answerCall(contactName, offerData, isVideo) {
  rtc.isCaller = false;
  rtc.callRoom = [myId, contactName].sort().join('_call');

  try {
    rtc.localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: isVideo
    });

    rtc.pc = new RTCPeerConnection(iceServers);
    rtc.localStream.getTracks().forEach(function(t) {
      rtc.pc.addTrack(t, rtc.localStream);
    });

    rtc.pc.ontrack = function(e) {
      rtc.remoteStream = e.streams[0];
      var ra = document.getElementById('remoteAudio');
      var rv = document.getElementById('remoteVideo');
      if (ra) { ra.srcObject = rtc.remoteStream; ra.play(); }
      if (rv) rv.srcObject = rtc.remoteStream;
    };

    rtc.pc.onicecandidate = function(e) {
      if (e.candidate) {
        _sb.from('calls').insert({
          room_id: rtc.callRoom,
          type: 'ice',
          data: JSON.stringify(e.candidate),
          sender: myId
        });
      }
    };

    await rtc.pc.setRemoteDescription(new RTCSessionDescription(offerData));
    var answer = await rtc.pc.createAnswer();
    await rtc.pc.setLocalDescription(answer);

    await _sb.from('calls').insert({
      room_id: rtc.callRoom,
      type: 'answer',
      data: JSON.stringify(answer),
      sender: myId
    });

  } catch(e) {
    alert('无法接听：' + e.message);
  }
}

// 处理信令
async function handleCallSignal(payload) {
  var msg = payload.new;
  if (msg.sender === myId) return;

  if (msg.type === 'answer' && rtc.isCaller) {
    await rtc.pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(msg.data)));
    document.getElementById('callSt').textContent = '通话中 00:00';
    startCallTimer();
  }

  if (msg.type === 'ice') {
    try {
      await rtc.pc.addIceCandidate(new RTCIceCandidate(JSON.parse(msg.data)));
    } catch(e) {}
  }

  if (msg.type === 'offer' && !rtc.isCaller) {
    showIncomingCall(msg.sender, JSON.parse(msg.data));
  }

  if (msg.type === 'hangup') {
    endRTCCall();
  }
}

// 来电界面
function showIncomingCall(from, offerData) {
  var name = from;
  if (confirm('📞 ' + name + ' 来电，接听？')) {
    answerCall(name, offerData, false);
    showVoiceCallScreen();
  } else {
    _sb.from('calls').insert({
      room_id: [myId, from].sort().join('_call'),
      type: 'hangup', data: '{}', sender: myId
    });
  }
}

function showVoiceCallScreen() {
  document.getElementById('callAv').textContent = G.chat ? G.chat[0] : '?';
  document.getElementById('callNm').textContent = G.chat || '通话';
  document.getElementById('callSt').textContent = '正在连接...';
  show('callscr');
}

function showVideoCallScreen() {
  show('vidscr');
}

// 结束通话
function endRTCCall() {
  if (rtc.pc) { rtc.pc.close(); rtc.pc = null; }
  if (rtc.localStream) {
    rtc.localStream.getTracks().forEach(function(t) { t.stop(); });
    rtc.localStream = null;
  }
  if (rtc.callRoom) {
    _sb.from('calls').insert({
      room_id: rtc.callRoom, type: 'hangup', data: '{}', sender: myId
    });
  }
  clearInterval(G.callI);
  show('chat');
}

// 静音切换
function toggleMicMute() {
  if (rtc.localStream) {
    rtc.localStream.getAudioTracks().forEach(function(t) {
      t.enabled = !t.enabled;
    });
  }
}
