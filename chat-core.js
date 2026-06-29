// ═══════════════════════════════════════════════════════════
// GhostChat · Chat Core v1.65
// 共享核心 — 跨仓库同步，不要手动修改此文件
//
// 依赖全局量（index.html 必须先定义）：
//   myId, G, _sb, lg, ls, esc, gt, show, initChatLayout,
//   resolveDisplayName, triggerPushToUser, isBlocked,
//   getBlockedContacts, openImgViewer, playAudio,
//   openContactCard, upgradeImg, recallPrompt, AdManager
// ═══════════════════════════════════════════════════════════

// ── 本地消息存储 (IndexedDB 主 + localStorage 备) ──
var _msgDB=null;
function openMsgDB(){
  if(_msgDB)return Promise.resolve(_msgDB);
  return new Promise(function(res){
    if(!window.indexedDB){res(null);return;}
    var req=indexedDB.open('ghostchat_msgs',1);
    req.onupgradeneeded=function(e){
      var db=e.target.result;
      if(!db.objectStoreNames.contains('chats'))db.createObjectStore('chats');
    };
    req.onsuccess=function(e){_msgDB=e.target.result;res(_msgDB);};
    req.onerror=function(){res(null);};
  });
}
function saveLocalMsgs(name,arr){
  var key='msgcache_'+String(name);
  var data=arr||[];
  try{localStorage.setItem(key,JSON.stringify(data.slice(-300)));}catch(e){}
  openMsgDB().then(function(db){
    if(!db)return;
    try{
      var tx=db.transaction('chats','readwrite');
      tx.objectStore('chats').put(JSON.stringify(data),key);
    }catch(e){}
  });
}
function loadLocalMsgs(name){
  try{
    var a=JSON.parse(localStorage.getItem('msgcache_'+String(name))||'[]');
    return Array.isArray(a)?a:[];
  }catch(e){return [];}
}
function loadLocalMsgsIDB(name,cb){
  openMsgDB().then(function(db){
    if(!db){cb(loadLocalMsgs(name));return;}
    try{
      var tx=db.transaction('chats','readonly');
      var req=tx.objectStore('chats').get('msgcache_'+String(name));
      req.onsuccess=function(){
        try{
          var a=JSON.parse(req.result||'[]');
          if(Array.isArray(a)&&a.length>0){
            try{localStorage.setItem('msgcache_'+String(name),JSON.stringify(a.slice(-300)));}catch(e){}
            cb(a);
          }else{cb(loadLocalMsgs(name));}
        }catch(e){cb(loadLocalMsgs(name));}
      };
      req.onerror=function(){cb(loadLocalMsgs(name));};
    }catch(e){cb(loadLocalMsgs(name));}
  });
}

// ── 联系人隐藏 / 删除状态 ──
function getHiddenContacts(){
  try{return JSON.parse(lg('hiddenContacts')||'[]');}catch(e){return [];}
}
function setHiddenContacts(arr){ls('hiddenContacts',JSON.stringify(arr));}
function getDeletedContacts(){
  try{return JSON.parse(lg('deletedContacts')||'[]');}catch(e){return [];}
}
function setDeletedContacts(arr){ls('deletedContacts',JSON.stringify(arr));}
function addDeletedContact(cid){
  var dl=getDeletedContacts(),s=String(cid);
  if(dl.indexOf(s)<0){dl.push(s);setDeletedContacts(dl);}
}
function isDeletedContact(cid){return getDeletedContacts().indexOf(String(cid))>=0;}

// ── 通知 / 未读角标 ──
var _unread={};
function updateUnreadBadge(){
  var total=0;
  Object.keys(_unread).forEach(function(k){total+=_unread[k]||0;});
  var badge=document.getElementById('msg-badge');
  if(!badge){
    var t=document.querySelector('.tabs .tab:first-child');
    if(t){badge=document.createElement('span');badge.id='msg-badge';badge.style.cssText='background:#ff3b30;color:#fff;border-radius:10px;padding:1px 6px;font-size:11px;margin-left:4px;display:none;vertical-align:middle;';t.appendChild(badge);}
  }
  if(badge){if(total>0){badge.textContent=total>99?'99+':String(total);badge.style.display='inline';}else{badge.style.display='none';}}
  if(typeof _syncNotifDot==='function')_syncNotifDot();
}
function addUnread(senderId){
  if(G.chat===senderId&&document.getElementById('chat')&&document.getElementById('chat').classList.contains('active'))return;
  _unread[senderId]=(_unread[senderId]||0)+1;
  updateUnreadBadge();
}
function clearUnread(senderId){
  _unread[senderId]=0;
  updateUnreadBadge();
  var lastEl=document.getElementById('last-'+senderId);
  if(lastEl){lastEl.style.color='#8e8e93';lastEl.style.fontWeight='normal';}
}
function _getNotifDot(){var el=document.getElementById('_gc_notif');if(!el){el=document.createElement('div');el.id='_gc_notif';el.style.cssText='position:fixed;top:max(10px,env(safe-area-inset-top,10px));right:12px;z-index:99999;font-size:10px;line-height:1;color:var(--theme-accent1,#a18cd1);opacity:0;transition:opacity 0.25s ease;pointer-events:none;font-weight:bold;';document.body.appendChild(el);}return el;}
function _syncNotifDot(){var total=0;Object.keys(_unread).forEach(function(k){total+=_unread[k]||0;});var el=_getNotifDot();var symMap={dot:'●',period:'·',tri:'▲',dia:'◆',star:'✦',line:'|',wave:'～',comma:'，'};if(total>0){el.textContent=symMap[lg('notifSym')||'dot']||'●';el.style.opacity='1';}else{el.style.opacity='0';}}
function sendNotif(){var el=_getNotifDot();var symMap={dot:'●',period:'·',tri:'▲',dia:'◆',star:'✦',line:'|',wave:'～',comma:'，'};el.textContent=symMap[lg('notifSym')||'dot']||'●';el.style.opacity='1';}

// ── 房间 ID ──
function roomIdOf(a,b){
  var ids=[String(a),String(b)].sort(function(x,y){return (parseInt(x)||0)-(parseInt(y)||0)||x.localeCompare(y);});
  return ids.join('_');
}

// ── 打字指示器 ──
var _typingTimeout=null,_typingSendAt=0;
function notifyTyping(){
  if(!typingSub||!G.chat)return;
  var now=Date.now();
  if(now-_typingSendAt<1500)return;
  _typingSendAt=now;
  typingSub.send({type:'broadcast',event:'typing',payload:{from:String(myId)}});
}
function showTypingIndicator(){
  var el=document.getElementById('chatName');
  if(!el)return;
  if(!el.dataset.origName)el.dataset.origName=el.textContent;
  el.innerHTML='<span style="color:#ff6b9d;">对方正在输入<span class="typing-dots"><span>.</span><span>.</span><span>.</span></span></span>';
  if(_typingTimeout)clearTimeout(_typingTimeout);
  _typingTimeout=setTimeout(function(){
    if(el.dataset.origName)el.textContent=el.dataset.origName;
    _typingTimeout=null;
  },3000);
}

// ── 实时频道 ──
var currentRoom=null,realtimeSub=null,typingSub=null;
function leaveChat(){
  G.chat=null;
  if(realtimeSub){try{realtimeSub.unsubscribe();}catch(e){}realtimeSub=null;}
  if(typingSub){try{typingSub.unsubscribe();}catch(e){}typingSub=null;}
  if(_typingTimeout){clearTimeout(_typingTimeout);_typingTimeout=null;}
  currentRoom=null;
  show('main');
  loadContacts();
}
function autoResizeMI(){
  var ta=document.getElementById('mi');
  if(!ta)return;
  ta.style.height='auto';
  ta.style.height=Math.min(ta.scrollHeight,120)+'px';
  var cm=document.getElementById('chatMsgs');
  if(cm&&cm.scrollHeight-cm.scrollTop-cm.clientHeight<200){
    requestAnimationFrame(function(){cm.scrollTop=cm.scrollHeight;});
  }
}

async function joinRoom(name){
  var a=parseInt(myId)||myId,b=parseInt(name)||name;
  currentRoom=roomIdOf(a,b);
  syncRoomMessages(name).then(function(){
    var cm=document.getElementById('chatMsgs');
    if(cm&&G.chat===name)requestAnimationFrame(function(){cm.scrollTop=cm.scrollHeight;});
  }).catch(function(){});
  if(realtimeSub){try{realtimeSub.unsubscribe();}catch(e){}}
  if(typingSub){try{typingSub.unsubscribe();}catch(e){}}
  realtimeSub=null;typingSub=null;
  try{
    typingSub=_sb.channel('typing_'+currentRoom)
      .on('broadcast',{event:'typing'},function(p){
        if(p.payload&&String(p.payload.from)!==String(myId))showTypingIndicator();
      })
      .on('broadcast',{event:'read'},function(p){
        if(!p.payload||String(p.payload.from)===String(myId))return;
        var upto=p.payload.upto||0;
        var list=G.msgs[name]||[];
        var changed=false;
        list.forEach(function(m){if(m.sent&&!m.read&&m.ts<=upto){m.read=true;changed=true;}});
        if(changed){
          if(G.chat===name)renderMsgs();
          saveLocalMsgs(name,list);
          var lastM=list[list.length-1];
          if(lastM&&lastM.sent)updateLastPreview(name,lastM.type==='text'?lastM.text:('['+lastM.type+']'),lastM.type,false,lastM.read?'read':(lastM.delivered?'delivered':'sent'),lastM.ts);
        }
      })
      .subscribe();
  }catch(e){console.log('typing channel setup failed:',e&&e.message);}
  try{
    realtimeSub=_sb.channel('room:'+currentRoom)
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'messages',filter:'room_id=eq.'+currentRoom},function(p){
        var m=p.new;
        if(String(m.sender)===String(myId))return;
        if(m.type==='read_receipt'||m.type==='gc_del')return;
        var createdMs1=new Date(m.created_at).getTime()||Date.now();
        var dl1=new Date(createdMs1);
        var msg={id:m.id,text:m.content,type:m.type||'text',sent:false,t:dl1.getHours()+':'+(dl1.getMinutes()<10?'0':'')+dl1.getMinutes(),ts:createdMs1};
        if(m.type==='image'){var imgParts=(m.content||'').split('|');msg.src=imgParts[0];if(imgParts[1])msg.thumb=imgParts[1];}
        if(m.type==='voice'){msg.src=m.content&&m.content.startsWith('http')?m.content:null;msg.dur=m.duration||(m.content&&m.content.match(/\d+/)?m.content.match(/\d+/)[0]:'?');}
        if(m.type==='location'){var pts=(m.content||'').split('|');msg.addr=pts[0];msg.mapUrl=pts[1]||('https://maps.google.com/?q='+pts[0]);}
        if(m.type==='contact'){try{var cc1=JSON.parse(m.content);msg.cid=cc1.id;msg.cname=cc1.name;}catch(e){}}
        if(m.type==='video')msg.src=m.content;
        if(m.type==='file'){var fp1=(m.content||'').split('|');msg.src=fp1[0];msg.fname=decodeURIComponent(fp1[1]||'File');}
        if(m.type==='recall'){
          var tgt=(G.msgs[name]||[]).find(function(x){return String(x.id)===String(m.content);});
          if(tgt){tgt.type='recalled';tgt.text='';tgt.src=null;if(G.chat===name)renderMsgs();saveLocalMsgs(name,G.msgs[name]);}
          return;
        }
        var already=(G.msgs[name]||[]).some(function(x){return x.id===m.id;});
        if(!already){
          msg.delivered=true;msg.read=false;
          addMsg(msg);
          sendNotif();
          _sb.from('messages').update({delivered:true}).eq('id',m.id).then(function(){});
          if(G.chat===name)scheduleMarkRoomRead(name);
        }
        updateLastPreview(m.sender,m.type==='text'?m.content:('['+m.type+']'),m.type,true,null);
      }).subscribe(function(status){
        console.log('Realtime:',status);
        if((status==='CLOSED'||status==='CHANNEL_ERROR')&&G.chat&&currentRoom){
          var _roomSnap=currentRoom,_nameSnap=G.chat;
          setTimeout(function(){
            if(G.chat===_nameSnap&&currentRoom===_roomSnap){
              realtimeSub=null;
              joinRoom(_nameSnap).catch(function(){});
            }
          },3000);
        }
      });
  }catch(e){console.log('realtime channel setup failed:',e&&e.message);}
  await syncRoomMessages(name);
}

// ── 媒体清理 ──
function cleanupMediaMessage(id,url,expired){
  try{var fname=url.split('/media/')[1];if(fname)_sb.storage.from('media').remove([fname]).then(function(){});}catch(e){}
  if(expired){
    _sb.from('messages').update({type:'text',content:'⏳ 视频已过期（7天未查看，已自动销毁）'}).eq('id',id).then(function(){});
  }else{
    _sb.from('messages').delete().eq('id',id).then(function(){});
  }
}

// ── 消息同步 ──
async function syncRoomMessages(name){
  var localMsgs=loadLocalMsgs(name);
  try{
    var a=parseInt(myId)||myId,b=parseInt(name)||name;
    var room=roomIdOf(a,b);
    var res=await _sb.from('messages').select('*').eq('room_id',room).order('created_at',{ascending:false}).limit(50);
    var serverMsgs=[];
    var toCleanup=[];
    var chatOpen=(G.chat===name);
    var weekAgo=Date.now()-7*24*60*60*1000;
    var otherLastRead=0;
    if(res.data){
      res.data.forEach(function(m){
        if(m.type==='read_receipt'&&String(m.sender)===String(name)){
          var v=parseInt(m.content)||0;
          if(v>otherLastRead)otherLastRead=v;
        }
      });
    }
    var prevReadIds={};
    (G.msgs[name]||[]).forEach(function(m){if(m.sent&&m.read&&m.id!=null)prevReadIds[m.id]=true;});
    if(res.data&&res.data.length>0){
      serverMsgs=res.data.filter(function(m){return m.type!=='gc_del';}).map(function(m){
        try{
          var content=m.content||'';
          var createdMs=new Date(m.created_at).getTime()||Date.now();
          var dlocal=new Date(createdMs);
          var msg={id:m.id,text:content,type:m.type||'text',sent:String(m.sender)===String(myId),t:dlocal.getHours()+':'+(dlocal.getMinutes()<10?'0':'')+dlocal.getMinutes(),ts:createdMs};
          if(m.type==='image'){var imgParts=content.split('|');msg.src=imgParts[0];if(imgParts[1])msg.thumb=imgParts[1];}
          if(m.type==='voice'){msg.src=content.startsWith('http')?content:null;var vm=content.match(/\d+/);msg.dur=m.duration||(vm?vm[0]:'?');}
          if(m.type==='location'){var pts=content.split('|');msg.addr=pts[0];msg.mapUrl=pts[1];}
          if(m.type==='contact'){try{var cc2=JSON.parse(content);msg.cid=cc2.id;msg.cname=cc2.name;}catch(e){}}
          if(m.type==='video')msg.src=content;
          if(m.type==='file'){var fp2=content.split('|');msg.src=fp2[0];msg.fname=decodeURIComponent(fp2[1]||'File');}
          if(msg.type==='text'&&msg.text&&msg.text.length>2000)msg.text='[Message]';
          if(msg.sent){
            msg.delivered=!!m.delivered;
            msg.read=(otherLastRead>=msg.ts)||!!prevReadIds[m.id];
          }else{
            msg.delivered=true;msg.read=true;
          }
          if((m.type==='video'||m.type==='file')&&msg.src){
            var isMediaUrl=msg.src.indexOf('/storage/v1/object/public/media/')>=0;
            if(isMediaUrl){
              var justRead=!msg.sent&&chatOpen;
              var expired=createdMs<weekAgo;
              if(justRead||expired)toCleanup.push({id:m.id,src:msg.src,expired:expired&&!justRead});
            }
          }
          return msg;
        }catch(e){
          console.log('parse msg failed, id='+m.id,e&&e.message);
          return {id:m.id,text:'[Message]',type:'text',sent:String(m.sender)===String(myId),t:gt(),ts:new Date(m.created_at).getTime()||Date.now()};
        }
      });
    }
    if(chatOpen)scheduleMarkRoomRead(name);
    var recallTargets={};
    serverMsgs.forEach(function(m){if(m.type==='recall'&&m.text)recallTargets[String(m.text)]=true;});
    if(Object.keys(recallTargets).length){
      serverMsgs=serverMsgs.filter(function(m){return m.type!=='recall';});
      serverMsgs.forEach(function(m){if(recallTargets[String(m.id)]){m.type='recalled';m.text='';m.src=null;}});
      localMsgs.forEach(function(m){if(recallTargets[String(m.id)]){m.type='recalled';m.text='';m.src=null;}});
    }
    localMsgs=localMsgs.filter(function(m){return m.type!=='recall'&&m.type!=='read_receipt';});
    serverMsgs=serverMsgs.filter(function(m){return m.type!=='read_receipt';});
    toCleanup.forEach(function(item){cleanupMediaMessage(item.id,item.src,item.expired);});
    var pendingMsgs=(G.msgs[name]||[]).filter(function(m){return m.id==null;});
    var serverIds={};serverMsgs.forEach(function(m){if(m.id!=null)serverIds[m.id]=true;});
    var merged=localMsgs.filter(function(m){return !(m.id!=null&&serverIds[m.id]);}).concat(serverMsgs);
    var mergedTs=new Set(merged.map(function(m){return m.ts+'_'+m.text;}));
    pendingMsgs.forEach(function(m){if(!mergedTs.has(m.ts+'_'+m.text))merged.push(m);});
    merged.sort(function(a,b){return (a.ts||0)-(b.ts||0);});
    var prevLen=(G.msgs[name]||[]).length;
    G.msgs[name]=merged;
    if(G.chat===name)renderMsgs();
    saveLocalMsgs(name,merged);
    if(merged.length>prevLen){
      var last=merged[merged.length-1];
      var isUnread=!last.sent&&G.chat!==name;
      var rs=last.sent?(last.read?'read':(last.delivered?'delivered':'sent')):null;
      updateLastPreview(name,last.type==='text'?last.text:('['+last.type+']'),last.type,isUnread,rs,last.ts);
      if(isUnread){addUnread(name);sendNotif();}
    }
  }catch(e){
    console.log('syncRoomMessages failed, falling back to local cache:',e&&e.message);
    if(localMsgs.length){
      localMsgs.sort(function(a,b){return (a.ts||0)-(b.ts||0);});
      G.msgs[name]=localMsgs;
      if(G.chat===name)renderMsgs();
    }
  }
}

// ── 已读回执 ──
async function markRoomRead(otherId){
  try{
    var ts=Date.now();
    var room=roomIdOf(parseInt(myId)||myId,parseInt(otherId)||otherId);
    var ins=await _sb.from('messages').insert({room_id:room,sender:String(myId),type:'read_receipt',content:String(ts)});
    if(ins.error)console.log('markRoomRead failed:',ins.error.message);
    if(typingSub)typingSub.send({type:'broadcast',event:'read',payload:{from:String(myId),upto:ts}});
  }catch(e){console.log('markRoomRead err',e&&e.message);}
}
var _lastMarkReadAt={};
var _readObserver=null;
function scheduleMarkRoomRead(name){
  setTimeout(function(){
    if(G.chat!==name)return;
    if(document.hidden||document.visibilityState!=='visible')return;
    if(Date.now()-(_lastMarkReadAt[name]||0)<3000)return;
    _lastMarkReadAt[name]=Date.now();
    markRoomRead(name);
    (G.msgs[name]||[]).forEach(function(m){if(!m.sent)m.read=true;});
    renderMsgs();
  },800);
}
function setupReadObserver(){
  if(_readObserver){_readObserver.disconnect();_readObserver=null;}
  if(!('IntersectionObserver' in window))return;
  _readObserver=new IntersectionObserver(function(entries){
    var hasUnread=false;
    entries.forEach(function(en){
      if(en.isIntersecting&&en.target.dataset.unread==='1'){en.target.dataset.unread='0';hasUnread=true;}
    });
    if(hasUnread&&G.chat){
      if(document.hidden||document.visibilityState!=='visible')return;
      (G.msgs[G.chat]||[]).forEach(function(m){if(!m.sent)m.read=true;});
      if(Date.now()-(_lastMarkReadAt[G.chat]||0)>3000){
        _lastMarkReadAt[G.chat]=Date.now();
        markRoomRead(G.chat);
      }
    }
  },{threshold:0.5});
  document.querySelectorAll('#chatMsgs .mr.r').forEach(function(el){
    el.dataset.unread='1';
    _readObserver.observe(el);
  });
}

// ── Conversations 表 ──
function _upsertConv(roomId,content,type,sender,ts){
  if(!roomId)return;
  var parts=roomId.split('_');
  var u1=parseInt(parts[0])||0,u2=parseInt(parts[1])||0;
  if(!u1||!u2)return;
  _sb.from('conversations').upsert({
    room_id:roomId,user1:u1,user2:u2,
    last_msg:(content||'').substring(0,200),
    last_type:type||'text',
    last_from:parseInt(sender)||0,
    last_ts:ts||Date.now(),
    updated_at:new Date().toISOString()
  },{onConflict:'room_id'}).then(function(r){
    if(r&&r.error)console.warn('[upsertConv ERR]',r.error.message,r.error.details||'');
  }).catch(function(e){console.warn('[upsertConv FAIL]',e&&e.message);});
}

var _convSub=null;
function _listenForConversations(){
  if(_convSub)return;
  var mid=String(myId),iMid=parseInt(mid)||0;
  _convSub=_sb.channel('conv_'+mid)
    .on('postgres_changes',{event:'*',schema:'public',table:'conversations',filter:'user1=eq.'+iMid},_onConvChange)
    .on('postgres_changes',{event:'*',schema:'public',table:'conversations',filter:'user2=eq.'+iMid},_onConvChange)
    .subscribe(function(status,err){console.log('[RT conv]',status,err?err.message:'');});
}
function _onConvChange(p){
  var conv=p.new;if(!conv||!conv.room_id)return;
  var mid=String(myId),iMid=parseInt(mid)||0;
  var otherId=String(conv.user1===iMid?conv.user2:conv.user1);
  if(isBlocked&&isBlocked(otherId))return;
  if(isDeletedContact&&isDeletedContact(otherId)){
    var _dlc2=getDeletedContacts();
    setDeletedContacts(_dlc2.filter(function(x){return x!==otherId;}));
  }
  var ts=conv.last_ts||new Date(conv.updated_at).getTime()||Date.now();
  var content=conv.last_msg||'';
  var type=conv.last_type||'text';
  var isMine=String(conv.last_from)===mid;
  var lastEl=document.getElementById('last-'+otherId);
  if(lastEl){
    updateLastPreview(otherId,content,type,!isMine&&(_unread[otherId]||0)>0,isMine?'sent':null,ts);
  }else{
    _lastContactsLoad=0;loadContacts();
  }
}

var _msgSub=null;
function listenForAllMessages(){
  if(_msgSub)return;
  var mid=String(myId);
  _msgSub=_sb.channel('all_msgs_'+mid)
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'messages'},function(p){
      try{
        var m=p.new;
        if(!m||!m.room_id)return;
        var parts=m.room_id.split('_');
        if(parts.indexOf(mid)<0)return;
        if(String(m.sender)===mid)return;
        if(m.type==='read_receipt'||m.type==='gc_del')return;
        var senderId=parts[0]===mid?parts[1]:parts[0];
        if(isBlocked(senderId))return;
        // 删除聊天只影响列表显示，不阻止收消息；收到新消息时自动恢复
        if(isDeletedContact(senderId)){
          var _dlr=getDeletedContacts();
          setDeletedContacts(_dlr.filter(function(x){return x!==senderId;}));
        }
        if(m.type==='recall'){
          var tgtG=(G.msgs[senderId]||[]).find(function(x){return String(x.id)===String(m.content);});
          if(tgtG){tgtG.type='recalled';tgtG.text='';tgtG.src=null;if(G.chat===senderId)renderMsgs();saveLocalMsgs(senderId,G.msgs[senderId]);}
          return;
        }
        var msgTs=new Date(m.created_at).getTime()||Date.now();
        var msgDate=new Date(msgTs);
        var msg={id:m.id,text:m.content,type:m.type||'text',sent:false,t:msgDate.getHours()+':'+(msgDate.getMinutes()<10?'0':'')+msgDate.getMinutes(),ts:msgTs};
        if(m.type==='image'){var imgParts=(m.content||'').split('|');msg.src=imgParts[0];if(imgParts[1])msg.thumb=imgParts[1];}
        if(m.type==='voice'){msg.src=m.content&&m.content.startsWith('http')?m.content:null;msg.dur=m.duration||'?';}
        if(m.type==='location'){var pts=(m.content||'').split('|');msg.addr=pts[0];msg.mapUrl=pts[1];}
        if(m.type==='contact'){try{var cc3=JSON.parse(m.content);msg.cid=cc3.id;msg.cname=cc3.name;}catch(e){}}
        if(m.type==='video')msg.src=m.content;
        if(m.type==='file'){var fp3=(m.content||'').split('|');msg.src=fp3[0];msg.fname=decodeURIComponent(fp3[1]||'File');}
        if(!G.msgs[senderId])G.msgs[senderId]=[];
        var already=G.msgs[senderId].some(function(x){return x.id===m.id;});
        if(!already){
          var chatOpenNow=(G.chat===senderId)&&document.getElementById('chat')&&document.getElementById('chat').classList.contains('active');
          msg.delivered=true;msg.read=false;
          G.msgs[senderId].push(msg);
          G.msgs[senderId].sort(function(a,b){return (a.ts||0)-(b.ts||0);});
          saveLocalMsgs(senderId,G.msgs[senderId]);
          _sb.from('messages').update({delivered:true}).eq('id',m.id).then(function(){});
          if(chatOpenNow)scheduleMarkRoomRead(senderId);
          if(G.chat===senderId)renderMsgs();
          if(document.hidden&&typeof Notification!=='undefined'&&Notification.permission==='granted'){
            try{
              var senderName2=senderId;
              (G.friends||[]).forEach(function(f){
                if(String(f.friend_id||f.id)===String(senderId))senderName2=f.nickname||f.name||senderId;
              });
              var notifTitle2='💬 '+senderName2;
              var notifBody2=msg.type==='text'?(msg.text||'').slice(0,80):'['+msg.type+']';
              if(navigator.serviceWorker&&navigator.serviceWorker.controller){
                navigator.serviceWorker.ready.then(function(reg){
                  reg.showNotification(notifTitle2,{body:notifBody2,icon:'./icon192.png',badge:'./icon192.png',tag:'gc-msg-'+senderId,renotify:true,data:{fromId:senderId}});
                }).catch(function(){new Notification(notifTitle2,{body:notifBody2,icon:'./icon192.png',tag:'gc-msg-'+senderId});});
              }else{
                new Notification(notifTitle2,{body:notifBody2,icon:'./icon192.png',tag:'gc-msg-'+senderId});
              }
            }catch(e){console.log('[LocalNotif]',e);}
          }
          var hset=getHiddenContacts();
          if(hset.indexOf(senderId)>=0)setHiddenContacts(hset.filter(function(x){return x!==senderId;}));
          _upsertConv(m.room_id,msg.type==='text'?msg.text:'['+msg.type+']',msg.type,m.sender,msgTs);
          var lastEl=document.getElementById('last-'+senderId);
          if(lastEl){
            updateLastPreview(senderId,msg.type==='text'?msg.text:'['+msg.type+']',msg.type,true,null,msgTs);
          }else{
            _lastContactsLoad=0;loadContacts();
          }
          sendNotif();
          if(!chatOpenNow){
            if('serviceWorker' in navigator&&Notification.permission==='granted'){
              navigator.serviceWorker.ready.then(function(reg){
                var sname=G.friends&&G.friends[senderId]?G.friends[senderId].name:('用户'+senderId);
                var body=msg.type==='text'?msg.text:msg.type==='image'?'[图片]':msg.type==='voice'?'[语音]':msg.type==='video'?'[视频]':'[消息]';
                var isWeatherDisguise=G.hide&&G.dis==='weather'&&document.getElementById('dweather')&&document.getElementById('dweather').classList.contains('active');
                if(isWeatherDisguise){
                  var wxFakeNotifs=['今日最高气温43°，注意防暑补水','紫外线指数极强，出门记得防晒','今晚有轻微沙尘，建议关好窗户','未来24小时天气稳定，适合出行','湿度降低，注意保湿补水'];
                  reg.showNotification('🌤 天气提醒',{body:wxFakeNotifs[Math.floor(Math.random()*wxFakeNotifs.length)],icon:'./icon192.png',tag:'weather-'+Date.now(),renotify:true,silent:false,data:{senderId:senderId,disguise:true}});
                }else{
                  reg.showNotification('💬 '+sname,{body:body,icon:'./icon192.png',badge:'./icon192.png',tag:'msg-'+senderId,renotify:true,silent:false,data:{senderId:senderId}});
                }
              });
            }
            triggerPushToUser(String(myId),null);
          }
        }
        var inThisChat=(G.chat===senderId)&&document.getElementById('chat')&&document.getElementById('chat').classList.contains('active');
        if(!inThisChat)addUnread(senderId);
      }catch(e){console.log('[listenForAllMessages] error:',e&&e.message,e&&e.stack);}
    }).subscribe(function(s){console.log('All msgs sub:',s);});
}

var _callSub=null;
function listenForCalls(){
  if(_callSub)return;
  _callSub=_sb.channel('inc:'+myId+'_'+Date.now())
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'calls'},function(p){
      var msg=p.new;
      if(!msg||String(msg.sender)===String(myId))return;
      var roomParts=(msg.room_id||'').split('_call');
      if(msg.type==='offer'&&roomParts.indexOf(String(myId))>=0){
        console.log('Incoming call from:',msg.sender);
        showIncoming(msg.sender,JSON.parse(msg.data),msg.created_at);
      }
    }).subscribe();
}

// ── 打开聊天 ──
function openChat(name,ini,color,displayName){
  clearUnread(name);
  G.chat=name;
  var dn=displayName||name;
  document.getElementById('chatName').textContent=dn;
  document.getElementById('chatName').dataset.origName=dn;
  if(_typingTimeout){clearTimeout(_typingTimeout);_typingTimeout=null;}
  document.getElementById('callAv').textContent=ini||dn[0];document.getElementById('callAv').style.background=color||'#007aff';
  document.getElementById('callNm').textContent=dn;document.getElementById('vidNm').textContent=dn;
  resolveDisplayName(name);
  var _cm=document.getElementById('chatMsgs');if(_cm)_cm._firstRender=true;
  if(!G.msgs[name]||G.msgs[name].length===0){
    var _lc=loadLocalMsgs(name);
    if(_lc.length>0)G.msgs[name]=_lc;
  }
  show('chat');
  initChatLayout();
  document.getElementById('xpanel').classList.remove('on');
  renderMsgs();
  setTimeout(function(){var cm=document.getElementById('chatMsgs');if(cm)cm.scrollTop=cm.scrollHeight;},150);
  loadLocalMsgsIDB(name,function(idbMsgs){
    if(!idbMsgs||!idbMsgs.length)return;
    var cur=G.msgs[name]||[];
    var curIds=new Set(cur.map(function(m){return m.id;}));
    var added=false;
    idbMsgs.forEach(function(m){if(m.id==null||!curIds.has(m.id)){cur.push(m);added=true;}});
    if(added){cur.sort(function(a,b){return (a.ts||0)-(b.ts||0);});G.msgs[name]=cur;if(G.chat===name)renderMsgs();}
  });
  joinRoom(name).catch(function(e){console.log('joinRoom error:',e&&e.message);});
}

// ── 撤回消息 ──
function setupRecallLongPress(){
  var c=document.getElementById('chatMsgs');
  if(!c||c.dataset.recallBound)return;
  c.dataset.recallBound='1';
  var timer=null;
  c.addEventListener('touchstart',function(e){
    var bub=e.target.closest('.mr.s .bub[data-mid]');if(!bub)return;
    timer=setTimeout(function(){timer=null;recallPrompt(bub.dataset.mid);},350);
  },{passive:true});
  c.addEventListener('touchend',function(){if(timer){clearTimeout(timer);timer=null;}});
  c.addEventListener('touchmove',function(){if(timer){clearTimeout(timer);timer=null;}});
  c.addEventListener('contextmenu',function(e){
    var bub=e.target.closest('.mr.s .bub[data-mid]');if(!bub)return;
    e.preventDefault();recallPrompt(bub.dataset.mid);
  });
}
var _recallTargetMid=null;
function recallPrompt(mid){if(!mid)return;_recallTargetMid=mid;document.getElementById('recallModal').style.display='flex';}
function closeRecallModal(){document.getElementById('recallModal').style.display='none';_recallTargetMid=null;}
function confirmRecall(){var mid=_recallTargetMid;closeRecallModal();if(mid)recallMsg(mid);}
async function recallMsg(mid){
  var msgs=G.msgs[G.chat]||[];
  var m=msgs.find(function(x){return String(x.id)===String(mid);});
  if(!m)return;
  var backup={type:m.type,text:m.text,src:m.src};
  m.type='recalled';m.text='';
  renderMsgs();saveLocalMsgs(G.chat,msgs);
  var room=roomIdOf(parseInt(myId)||myId,parseInt(G.chat)||G.chat);
  var ins=await _sb.from('messages').insert({room_id:room,sender:String(myId),content:String(mid),type:'recall'});
  if(ins.error){
    alert('撤回失败: '+ins.error.message);
    m.type=backup.type;m.text=backup.text;m.src=backup.src;
    renderMsgs();saveLocalMsgs(G.chat,msgs);
  }
}

// ── 渲染消息 ──
function retrySendText(el){retryFailedMsgs();}
function renderMsgs(){
  var c=document.getElementById('chatMsgs');
  if(!c)return;
  var msgs=G.msgs[G.chat]||[];
  var html='';
  for(var i=0;i<msgs.length;i++){
    var m=msgs[i];
    var s=m.sent;
    var b='';
    if(m.type==='recalled'){
      html+='<div style="text-align:center;color:#aaa;font-size:12px;margin:6px 0;">'+(s?'你撤回了一条消息':'对方撤回了一条消息')+'</div>';
      continue;
    }
    if(m.type==='image'){
      if(m.loading&&!m.src){b='<div style="width:160px;height:120px;border-radius:10px;background:rgba(255,255,255,.15);display:flex;align-items:center;justify-content:center;font-size:13px;opacity:.8;">📷 处理中...</div>';}
      else if(m.loading){b='<div style="display:flex;flex-direction:column;gap:4px;"><img class="msg-img" src="'+m.src+'" style="opacity:.6;"><div style="font-size:12px;opacity:.7;">发送中...</div></div>';}
      else if(m.failed){b='<div style="display:flex;flex-direction:column;gap:4px;"><img class="msg-img" src="'+m.src+'" style="opacity:.5;" onclick="openImgViewer(this.src)"><div style="font-size:12px;color:#ff3b30;">⚠️ 发送失败</div></div>';}
      else if(m.src&&m.src.length>4){
        if(m.thumb&&!m.sent){b='<img class="msg-img" src="'+m.thumb+'" style="filter:blur(3px);transition:filter .3s;" data-full="'+m.src+'" onload="upgradeImg(this)" onclick="openImgViewer(this.dataset.full||this.src)">';}
        else{b='<img class="msg-img" src="'+m.src+'" onclick="openImgViewer(this.src)">';}
      }else{b='<div>📷 Image</div>';}
    }else if(m.type==='voice'){
      if(m.src&&(m.src.startsWith('http')||m.src.startsWith('blob'))){
        var vdur=m.dur||'?';
        var barW=Math.min(120,Math.max(40,parseInt(vdur)*8||40));
        b='<div onclick="playAudio(this)" data-src="'+m.src+'" style="display:flex;align-items:center;gap:8px;cursor:pointer;min-width:'+(barW+60)+'px;"><span class="play-icon" style="font-size:18px;">▶️</span><div style="flex:1;height:3px;background:rgba(255,255,255,.4);border-radius:2px;min-width:'+barW+'px;"></div><span style="font-size:12px;opacity:.8;">'+vdur+'″</span></div>';
      }
    }else if(m.type==='location'){
      var mapUrl=m.mapUrl||('https://maps.google.com/?q='+(m.addr||''));
      b='<div>📍 <a href="'+mapUrl+'" target="_blank" style="color:inherit;text-decoration:underline;">'+(m.addr||'Location')+'</a></div>';
    }else if(m.type==='contact'){
      var ccName=m.cname||('User '+m.cid);
      b='<div onclick="openContactCard(\''+esc(String(m.cid||''))+'\',\''+esc(ccName).replace(/'/g,"\\'")+'\')" style="display:flex;align-items:center;gap:10px;cursor:pointer;min-width:160px;"><div style="width:40px;height:40px;border-radius:50%;background:#a18cd1;display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;flex-shrink:0;">'+esc(ccName[0].toUpperCase())+'</div><div><div style="font-weight:600;">'+esc(ccName)+'</div><div style="font-size:12px;opacity:.7;">名片 · 点击查看</div></div></div>';
    }else if(m.type==='video'){
      if(m.loading){b='<div style="opacity:.6;font-size:13px;">Sending...</div>';}
      else if(m.failed){b='<div style="font-size:12px;color:#ff3b30;">⚠️ 视频发送失败</div>';}
      else if(m.src){b='<video class="msg-img" src="'+m.src+'" controls style="max-width:220px;border-radius:10px;"></video>';}
      else{b='<div>🎬 Video</div>';}
    }else if(m.type==='file'){
      if(m.loading){b='<div style="opacity:.6;font-size:13px;">📄 '+esc(m.fname||'File')+' (Sending...)</div>';}
      else if(m.failed){b='<div style="font-size:12px;color:#ff3b30;">⚠️ '+esc(m.fname||'File')+' 发送失败</div>';}
      else if(m.src){b='<a href="'+m.src+'" target="_blank" download style="display:flex;align-items:center;gap:8px;color:inherit;text-decoration:none;min-width:160px;"><span style="font-size:24px;">📄</span><div style="overflow:hidden;"><div style="font-weight:600;word-break:break-all;">'+esc(m.fname||'File')+'</div><div style="font-size:12px;opacity:.7;">点击下载</div></div></a>';}
      else{b='<div>📄 File</div>';}
    }else{
      var txt=m.text||m.content||'';
      if(txt.length>500)txt='[Message]';
      b=esc(txt);
    }
    var statusTick='';
    var bubExtra='';
    if(s){
      if(m.failed){statusTick='<span style="color:#ff3b30;font-size:11px;margin-left:2px;cursor:pointer;" title="发送失败，点重试" onclick="retrySendText(this)">⚠️失败</span>';}
      else if(m.id==null||m.loading){statusTick='<span style="color:#aaa;font-size:11px;margin-left:2px;" title="发送中">🕐</span>';}
      else if(m.read){bubExtra='<span class="msg-paw" title="对方已读">🐾</span>';}
      else if(m.delivered){statusTick='<span style="color:#34c759;font-size:11px;margin-left:2px;font-weight:700;letter-spacing:-1px;" title="已送达">✓✓</span>';}
      else{statusTick='<span style="color:#8e8e93;font-size:11px;margin-left:2px;font-weight:700;" title="已发送">✓</span>';}
    }
    var bubCls='bub'+(s&&m.read?' bub-read':'');
    var midAttr=(s&&m.id!=null)?(' data-mid="'+m.id+'"'):'';
    html+='<div class="mr '+(s?'s':'r')+'"><div class="'+bubCls+'"'+midAttr+'>'+(s&&!m.read?bubExtra:'')+b+(s&&m.read?bubExtra:'')+'</div><div class="mt">'+m.t+statusTick+'</div></div>';
  }
  var _atBottom=(c.scrollHeight-c.scrollTop-c.clientHeight)<200;
  var _prevScrollTop=c.scrollTop;
  var _prevScrollHeight=c.scrollHeight;
  var _isFirst=c._firstRender;
  var _prevMsgCount=(c._msgCount||0);
  var _newMsgCount=msgs.length;
  c._msgCount=_newMsgCount;
  var _hasNewMsg=_newMsgCount>_prevMsgCount;
  var _forceBottom=c._forceBottom;c._forceBottom=false;
  c.innerHTML='<div class="chat-spacer"></div><div class="chat-sentinel">— 没有更多了 —</div>'+html;
  requestAnimationFrame(function(){
    requestAnimationFrame(function(){
      if(_isFirst||_atBottom||_hasNewMsg||_forceBottom){
        c.scrollTop=c.scrollHeight;c._firstRender=false;
      }else{
        c.scrollTop=_prevScrollTop+(c.scrollHeight-_prevScrollHeight);
      }
      setupReadObserver();
    });
  });
  setupRecallLongPress();
}

// ── 发送消息 ──
function addMsg(m){
  if(!G.msgs[G.chat])G.msgs[G.chat]=[];
  if(m.ts==null)m.ts=Date.now();
  G.msgs[G.chat].push(m);
  var c=document.getElementById('chatMsgs');
  if(c&&m.sent)c._forceBottom=true;
  renderMsgs();
  saveLocalMsgs(G.chat,G.msgs[G.chat]);
}
var _sendLock=false,_sendLockTimer=null;
async function sendMsg(){
  var inp=document.getElementById('mi'),t=inp.value.trim();if(!t)return;
  if(_sendLock)return;
  if(G.chat&&isBlocked(G.chat)){alert('对方已被你拉黑，请先在通讯录中解除拉黑');return;}
  if(G.chat){var _hh=getHiddenContacts();if(_hh.indexOf(String(G.chat))>=0)setHiddenContacts(_hh.filter(function(x){return x!==String(G.chat);}));}
  _sendLock=true;
  if(_sendLockTimer)clearTimeout(_sendLockTimer);
  _sendLockTimer=setTimeout(function(){_sendLock=false;_sendLockTimer=null;},10000);
  var chatAtSend=G.chat;
  var _nowTs=Date.now();
  var msgObj={text:t,sent:true,t:gt(),ts:_nowTs,id:null,failed:false};
  addMsg(msgObj);
  updateLastPreview(chatAtSend,t,'text',false,'sent',_nowTs);
  inp.value='';inp.style.height='';
  try{
    await _doSendText(msgObj,chatAtSend,currentRoom);
  }finally{
    clearTimeout(_sendLockTimer);
    _sendLockTimer=setTimeout(function(){_sendLock=false;_sendLockTimer=null;},300);
  }
}
async function _doSendText(msgObj,chatAtSend,room){
  if(!room)return;
  var _tmr=null;
  try{
    var _timeout=new Promise(function(_,rej){_tmr=setTimeout(function(){rej(new Error('send_timeout'));},8000);});
    var r=await Promise.race([
      _sb.from('messages').insert({room_id:room,sender:String(myId),content:msgObj.text,type:'text'}).select().single(),
      _timeout
    ]);
    clearTimeout(_tmr);
    if(r&&r.data&&!r.error){
      msgObj.id=r.data.id;msgObj.failed=false;msgObj.failCount=0;
      saveLocalMsgs(chatAtSend,G.msgs[chatAtSend]||[]);
      if(G.chat===chatAtSend)renderMsgs();
      triggerPushToUser(String(chatAtSend),msgObj.text);
      _upsertConv(room,msgObj.text,'text',myId,msgObj.ts);
    }else{_markFailed(msgObj,chatAtSend);}
  }catch(e){
    if(_tmr)clearTimeout(_tmr);
    _markFailed(msgObj,chatAtSend);
    console.log('[sendMsg] failed:',e&&e.message);
  }
}
function _markFailed(msgObj,chatAtSend){
  msgObj.failed=true;msgObj.failCount=(msgObj.failCount||0)+1;
  saveLocalMsgs(chatAtSend,G.msgs[chatAtSend]||[]);
  if(G.chat===chatAtSend)renderMsgs();
}
var _retrying=false;
function retryFailedMsgs(){
  if(_retrying||!myId||!navigator.onLine)return;
  _retrying=true;
  var tasks=[];
  Object.keys(G.msgs||{}).forEach(function(peerId){
    var room=roomIdOf(parseInt(myId)||myId,parseInt(peerId)||peerId);
    (G.msgs[peerId]||[]).forEach(function(m){
      if(m.failed&&m.sent&&(m.type==='text'||!m.type)&&m.text&&m.id==null)tasks.push({m:m,peerId:peerId,room:room});
    });
  });
  tasks.sort(function(a,b){return (a.m.ts||0)-(b.m.ts||0);});
  var i=0;
  function next(){
    if(i>=tasks.length){_retrying=false;return;}
    var t=tasks[i++];
    t.m.failed=false;
    _doSendText(t.m,t.peerId,t.room).then(function(){setTimeout(next,200);}).catch(function(){next();});
  }
  next();
}

// ── 在线/前台 同步 (guard 防止重复注册) ──
if(window._gcOnlineHandler)window.removeEventListener('online',window._gcOnlineHandler);
window._gcOnlineHandler=function(){
  setTimeout(function(){
    retryFailedMsgs();
    if(G.chat){syncRoomMessages(G.chat).catch(function(){});}
    _lastContactsLoad=0;loadContacts();
  },800);
};
window.addEventListener('online',window._gcOnlineHandler);

if(window._gcVisHandler)document.removeEventListener('visibilitychange',window._gcVisHandler);
window._gcVisHandler=function(){
  if(document.visibilityState!=='visible'||!lg('registered'))return;
  var chatEl=document.getElementById('chat');
  if(chatEl&&chatEl.classList.contains('active')&&G.chat)syncRoomMessages(G.chat).catch(function(){});
};
document.addEventListener('visibilitychange',window._gcVisHandler);

// ── 定期兜底刷新 ──
if(window._gcPollInterval)clearInterval(window._gcPollInterval);
window._gcPollInterval=setInterval(function(){
  if(!lg('registered'))return;
  var chatEl=document.getElementById('chat');
  if(chatEl&&chatEl.classList.contains('active')&&G.chat)syncRoomMessages(G.chat);
  var mainEl=document.getElementById('main');
  if(mainEl&&mainEl.classList.contains('active'))loadContacts();
},15000);

// ── 工具函数 ──
function fmtLastTime(ts){
  if(!ts)return'';
  var d=new Date(ts),now=new Date();
  if(d.toDateString()===now.toDateString())return d.getHours()+':'+(d.getMinutes()<10?'0':'')+d.getMinutes();
  if(now-d<7*24*60*60*1000){var days=['日','一','二','三','四','五','六'];return'周'+days[d.getDay()];}
  return(d.getMonth()+1)+'/'+(d.getDate());
}
function hk(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMsg();}}

function updateLastPreview(cid,content,type,highlight,readState,ts){
  var lastEl=document.getElementById('last-'+String(cid));
  if(!lastEl){
    try{
      var _cidStr=String(cid);
      var _dca=JSON.parse(localStorage.getItem('deletedContacts')||'[]');
      if(_dca.indexOf(_cidStr)>=0)localStorage.setItem('deletedContacts',JSON.stringify(_dca.filter(function(x){return x!==_cidStr;})));
      var _clc=JSON.parse(localStorage.getItem('chatListCache')||'null');
      if(!_clc){_clc={ids:[],seen:{},fm:{},um:{},am:{}};}
      if(!_clc.ids)_clc.ids=[];if(!_clc.seen)_clc.seen={};
      _clc.ids=_clc.ids.filter(function(x){return x!==_cidStr;});
      _clc.ids.unshift(_cidStr);
      _clc.seen[_cidStr]={content:content,type:type,sender:String(myId||''),created_at:ts?new Date(ts).toISOString():new Date().toISOString()};
      localStorage.setItem('chatListCache',JSON.stringify(_clc));
      _renderContacts(_clc.ids,_clc.seen,_clc.fm||{},_clc.um||{},_clc.am||{});
    }catch(e){}
    _lastContactsLoad=0;
    setTimeout(function(){loadContacts();},800);
    return;
  }
  var label;
  if(type==='text')label=content;
  else if(type==='contact')label='[名片]';
  else if(type==='image')label='[图片]';
  else if(type==='voice')label='[语音]';
  else if(type==='video')label='[视频]';
  else if(type==='file')label='[文件]';
  else if(type==='location')label='[位置]';
  else label='['+type+']';
  lastEl.textContent=label;
  if(highlight){lastEl.style.color='#d4537e';lastEl.style.fontWeight='600';}
  else if(readState==='sent'){lastEl.style.color='var(--theme-accent1,#a18cd1)';lastEl.style.fontWeight='600';}
  else if(readState==='delivered'){lastEl.style.color='var(--theme-accent1,#a18cd1)';lastEl.style.fontWeight='600';}
  else if(readState==='read'){lastEl.style.color='var(--theme-icon,#8e8e93)';lastEl.style.fontWeight='normal';}
  else{lastEl.style.color='';lastEl.style.fontWeight='';}
  var prefixEl=lastEl.parentElement&&lastEl.parentElement.querySelector('.last-prefix');
  if(prefixEl)prefixEl.innerHTML=(readState==='sent'||readState==='delivered'||readState==='read')?'我: ':'';
  if(ts){var tsEl=document.getElementById('lastts-'+String(cid));if(tsEl)tsEl.textContent=fmtLastTime(ts);}
  var wrap=document.getElementById('wrap-'+String(cid));
  var chatList=document.getElementById('chatList');
  if(wrap&&chatList&&chatList.firstChild!==wrap)chatList.insertBefore(wrap,chatList.firstChild);
}

// ── 联系人管理 ──
function _removeContactFromDOM(cid){
  var wrap=document.getElementById('wrap-'+cid);if(!wrap)return;
  wrap.style.transition='opacity .12s,max-height .2s';wrap.style.overflow='hidden';
  wrap.style.opacity='0';wrap.style.maxHeight=wrap.offsetHeight+'px';
  setTimeout(function(){wrap.style.maxHeight='0';},120);
  setTimeout(function(){if(wrap.parentNode)wrap.parentNode.removeChild(wrap);},320);
}
function hideContact(cid){
  _removeContactFromDOM(cid);
  var h=getHiddenContacts();if(h.indexOf(cid)<0)h.push(cid);setHiddenContacts(h);
}
function unhideContact(cid){
  setHiddenContacts(getHiddenContacts().filter(function(x){return x!==String(cid);}));
  _lastContactsLoad=0;loadFriendsList();
}
async function deleteContact(cid){
  var mid=String(myId),cidStr=String(cid);
  var room=roomIdOf(mid,cid);
  var legacyRoom=[mid,cid].sort().join('_');
  _removeContactFromDOM(cid);
  _removeCidFromChatListCache(cid);
  if(G.msgs&&G.msgs[cid])delete G.msgs[cid];
  var msgKey='msgcache_'+cidStr;
  try{localStorage.removeItem(msgKey);}catch(e){}
  openMsgDB().then(function(db){if(!db)return;try{db.transaction('chats','readwrite').objectStore('chats').delete(msgKey);}catch(e){}});
  if(_unread)_unread[cid]=0;
  addDeletedContact(cid);
  var h=getHiddenContacts();
  if(h.indexOf(cid)>=0){h=h.filter(function(x){return x!==cid;});setHiddenContacts(h);}
  if(currentRoom===room||currentRoom===legacyRoom){
    if(realtimeSub){try{realtimeSub.unsubscribe();}catch(e){}realtimeSub=null;}
    currentRoom=null;
  }
  var _gcDelClean=function(r){
    _sb.from('messages').select('id').eq('room_id',r).eq('type','gc_del').eq('sender',cidStr).limit(1).maybeSingle()
      .then(function(res){
        if(res&&res.data){
          _sb.from('messages').delete().eq('room_id',r).catch(function(){});
          _sb.from('conversations').delete().eq('room_id',r).catch(function(){});
        }else{
          _sb.from('messages').insert({room_id:r,sender:mid,type:'gc_del',content:'1'}).catch(function(){});
        }
      }).catch(function(){
        _sb.from('messages').insert({room_id:r,sender:mid,type:'gc_del',content:'1'}).catch(function(){});
      });
  };
  _gcDelClean(room);
  if(legacyRoom!==room)_gcDelClean(legacyRoom);
  _lastContactsLoad=0;loadContacts();
}

function attachSwipe(el,actionsEl){
  var startX=0,startY=0,curX=0,dragging=false,base=0,axisLocked=false,isHoriz=false;
  el.style.willChange='transform';if(actionsEl)actionsEl.style.willChange='transform';
  function applyPos(x,anim){
    el.style.transition=anim?'transform .2s':'none';
    if(actionsEl)actionsEl.style.transition=anim?'transform .2s':'none';
    el.style.transform='translateX('+x+'px)';
    if(actionsEl)actionsEl.style.transform='translateX('+(140+x)+'px)';
    curX=x;
  }
  el.addEventListener('touchstart',function(e){startX=e.touches[0].clientX;startY=e.touches[0].clientY;dragging=true;axisLocked=false;isHoriz=false;base=parseFloat((el.style.transform||'').replace(/[^-\d.]/g,''))||0;applyPos(base,false);},{passive:true});
  el.addEventListener('touchmove',function(e){
    if(!dragging)return;
    var dx=e.touches[0].clientX-startX,dy=e.touches[0].clientY-startY;
    if(!axisLocked){if(Math.abs(dx)<3&&Math.abs(dy)<3)return;isHoriz=Math.abs(dx)>Math.abs(dy);axisLocked=true;if(!isHoriz){dragging=false;return;}}
    if(!isHoriz)return;
    applyPos(Math.min(0,Math.max(-140,base+dx)),false);
  },{passive:true});
  el.addEventListener('touchend',function(){if(!dragging)return;dragging=false;applyPos(curX<-70?-140:0,true);});
}

var _loadingContacts=false,_lastContactsLoad=0;
function _saveChatListCache(contactIds,seen,friendMap,userMap,avatarMap){
  try{localStorage.setItem('chatListCache',JSON.stringify({ids:contactIds,seen:seen,fm:friendMap,um:userMap,am:avatarMap,t:Date.now()}));}catch(e){}
}
function _renderChatListCache(){
  try{
    var c=JSON.parse(localStorage.getItem('chatListCache')||'null');
    if(!c||!c.ids||!c.ids.length)return false;
    _renderContacts(c.ids,c.seen||{},c.fm||{},c.um||{},c.am||{});
    return true;
  }catch(e){return false;}
}
function _removeCidFromChatListCache(cid){
  try{
    var c=JSON.parse(localStorage.getItem('chatListCache')||'null');
    if(!c||!c.ids)return;
    var s=String(cid);
    c.ids=c.ids.filter(function(id){return id!==s;});
    if(c.seen)delete c.seen[s];
    localStorage.setItem('chatListCache',JSON.stringify(c));
  }catch(e){}
}

async function loadContacts(){
  if(!myId){return;}
  if(_loadingContacts)return;
  var _n=Date.now();
  var list=document.getElementById('chatList');
  if(!list)return;
  if(list.children.length===0||list.querySelector('.gc-loading')){
    var hadCache=_renderChatListCache();
    if(!hadCache)list.innerHTML='<div class="gc-loading" style="text-align:center;color:#8e8e93;padding:48px 0;font-size:15px;">加载中…</div>';
  }
  if(_lastContactsLoad>0&&_n-_lastContactsLoad<2000&&!list.querySelector('.gc-loading'))return;
  _lastContactsLoad=_n;_loadingContacts=true;
  setTimeout(function(){_loadingContacts=false;},5000);
  try{
    var mid=String(myId),iMid=parseInt(mid)||0;
    var seen={},contactIds=[];
    var fr=await _sb.from('friends').select('friend_id,nickname').eq('user_id',mid);
    var friendMap={};
    if(fr.data)fr.data.forEach(function(f){friendMap[String(f.friend_id)]=f.nickname||'';});
    var cq1=await _sb.from('conversations').select('*').eq('user1',iMid).order('updated_at',{ascending:false}).limit(100);
    var cq2=await _sb.from('conversations').select('*').eq('user2',iMid).order('updated_at',{ascending:false}).limit(100);
    var allConvs=[].concat(cq1.data||[]).concat(cq2.data||[]);
    allConvs.sort(function(a,b){return new Date(b.updated_at)-new Date(a.updated_at);});
    var _convSeen={};
    allConvs=allConvs.filter(function(c){if(_convSeen[c.room_id])return false;_convSeen[c.room_id]=true;return true;});
    var convErr=cq1.error||cq2.error;
    if(!convErr&&allConvs.length>0){
      allConvs.forEach(function(conv){
        var otherId=String(conv.user1===iMid?conv.user2:conv.user1);
        if(!seen[otherId]){seen[otherId]={content:conv.last_msg||'',type:conv.last_type||'text',sender:String(conv.last_from||0),created_at:conv.updated_at};contactIds.push(otherId);}
      });
    }else{
      var res1=await _sb.from('messages').select('sender,room_id,content,type,created_at').gte('room_id',mid+'_').lt('room_id',mid+'`').order('created_at',{ascending:false}).limit(100);
      var res2=await _sb.from('messages').select('sender,room_id,content,type,created_at').like('room_id','%\\_'+mid).order('created_at',{ascending:false}).limit(100);
      var allMsgs=[].concat(res1.data||[]).concat(res2.data||[]);
      allMsgs.sort(function(a,b){return new Date(b.created_at)-new Date(a.created_at);});
      allMsgs.forEach(function(m){
        if(!m.room_id)return;
        var parts=m.room_id.split('_');if(parts.length!==2)return;
        if(parts[0]!==mid&&parts[1]!==mid)return;
        var otherId=parts[0]===mid?parts[1]:parts[0];
        if(m.type==='read_receipt'||m.type==='recall'||m.type==='gc_del')return;
        if(otherId&&otherId!==mid&&!seen[otherId]){seen[otherId]=m;contactIds.push(otherId);_upsertConv(m.room_id,m.content,m.type,m.sender,new Date(m.created_at).getTime());}
      });
    }
    Object.keys(friendMap).forEach(function(fid){if(!seen[fid]){contactIds.push(fid);seen[fid]={};}});
    try{
      var _ec=JSON.parse(localStorage.getItem('chatListCache')||'null');
      var _ds=getDeletedContacts();
      if(_ec&&_ec.ids){
        _ec.ids.forEach(function(cachedCid){
          if(!seen[cachedCid]&&_ds.indexOf(String(cachedCid))<0){contactIds.push(cachedCid);seen[cachedCid]=(_ec.seen&&_ec.seen[cachedCid])||{};}
        });
      }
    }catch(e){}
    if(contactIds.length===0){list.innerHTML='<div style="text-align:center;color:#8e8e93;padding:64px 0 32px;font-size:15px;">暂无聊天<br><span style="font-size:13px;margin-top:8px;display:block;">在通讯录添加好友后开始聊天</span></div>';return;}
    var uids=contactIds.map(function(i){return parseInt(i)||0;});
    var users=await _sb.from('users').select('id,name,avatar_url').in('id',uids);
    var userMap={},avatarMap={};
    if(users.data)users.data.forEach(function(u){userMap[String(u.id)]=u.name;if(u.avatar_url)avatarMap[String(u.id)]=u.avatar_url;});
    try{
      var _ec2=JSON.parse(localStorage.getItem('chatListCache')||'null');
      if(_ec2){contactIds.forEach(function(cid){if(!userMap[cid]&&_ec2.um&&_ec2.um[cid])userMap[cid]=_ec2.um[cid];if(!avatarMap[cid]&&_ec2.am&&_ec2.am[cid])avatarMap[cid]=_ec2.am[cid];});}
    }catch(e){}
    _saveChatListCache(contactIds,seen,friendMap,userMap,avatarMap);
    _renderContacts(contactIds,seen,friendMap,userMap,avatarMap);
    if(typeof AdManager!=='undefined'&&AdManager._ready)AdManager.showInChatList();
  }catch(e){
    console.log('[loadContacts] error:',e&&e.message);
  }finally{_loadingContacts=false;}
}

function _renderContacts(contactIds,seen,friendMap,userMap,avatarMap){
  var list=document.getElementById('chatList');if(!list)return;
  var mid=String(myId);
  var colors=['#007aff','#34c759','#ff9f0a','#ff3b30','#bf5af2','#30b0c7'];
  var hiddenSet=getHiddenContacts(),deletedSet=getDeletedContacts();
  list.innerHTML='';
  contactIds.forEach(function(cid){
    if(deletedSet.indexOf(String(cid))>=0)return;
    if(hiddenSet.indexOf(cid)>=0&&!(_unread[cid]>0))return;
    var name=(friendMap&&friendMap[cid])||(userMap&&userMap[cid])||('User '+cid);
    var color=colors[parseInt(cid)%colors.length];
    var lm=seen&&seen[cid]?JSON.parse(JSON.stringify(seen[cid])):null;
    if(!lm||!lm.content){
      var _lc2=loadLocalMsgs(cid);
      for(var _li2=_lc2.length-1;_li2>=0;_li2--){
        var _lm2=_lc2[_li2];
        if(_lm2.type&&_lm2.type!=='read_receipt'&&_lm2.type!=='recall'&&_lm2.type!=='recalled'){
          if(!lm)lm={};
          lm.content=_lm2.text||('['+(_lm2.type||'msg')+']');
          lm.type=_lm2.type||'text';
          lm.sender=_lm2.sent?mid:cid;
          lm.created_at=_lm2.ts?new Date(_lm2.ts).toISOString():null;
          _upsertConv([mid,cid].sort().join('_'),lm.content,lm.type,lm.sender,_lm2.ts||Date.now());
          break;
        }
      }
    }
    var lastText='点击开始聊天';
    if(lm&&lm.content){
      if(lm.type==='text')lastText=lm.content.length<80?lm.content:lm.content.substring(0,77)+'...';
      else if(lm.type==='image')lastText='[图片]';
      else if(lm.type==='voice')lastText='[语音]';
      else if(lm.type==='video')lastText='[视频]';
      else if(lm.type==='file')lastText='[文件]';
      else if(lm.type==='location')lastText='[位置]';
      else if(lm.type==='contact')lastText='[名片]';
      else lastText='['+lm.type+']';
    }
    var hasUnread=(_unread[cid]||0)>0;
    var isMine=lm&&String(lm.sender)===mid;
    var readTick='';
    if(isMine&&lm&&lm.content){
      var cached=loadLocalMsgs(cid);var myLast=null;
      for(var ci=cached.length-1;ci>=0;ci--){if(cached[ci].sent){myLast=cached[ci];break;}}
      if(myLast){
        if(myLast.read){readTick=' <span style="color:var(--theme-accent1,#a18cd1);font-size:11px;">已读</span>';}
        else if(myLast.delivered){readTick=' <span style="color:#34c759;font-size:11px;font-weight:700;letter-spacing:-1px;">✓✓</span>';}
        else if(myLast.id!=null){readTick=' <span style="color:var(--theme-icon,#999);font-size:11px;font-weight:700;">✓</span>';}
      }
    }
    var accent='var(--theme-accent1,#a18cd1)';
    var lastStyle,nameStyle,timeStyle;
    if(hasUnread){
      lastStyle='font-size:14px;color:'+accent+';font-weight:600;margin-top:2px;';
      nameStyle='font-size:17px;font-weight:700;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      timeStyle='font-size:12px;color:'+accent+';font-weight:600;flex-shrink:0;';
    }else{
      lastStyle='font-size:14px;color:var(--theme-icon,#8e8e93);margin-top:2px;';
      nameStyle='font-size:17px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      timeStyle='font-size:12px;color:var(--theme-icon,#c7c7cc);flex-shrink:0;';
    }
    var lastTime=lm&&lm.created_at?fmtLastTime(new Date(lm.created_at).getTime()):'';
    var prefix=isMine?'我: ':'';
    var wrap=document.createElement('div');wrap.className='swipe-wrap';wrap.id='wrap-'+cid;
    wrap.style.cssText='position:relative;overflow:hidden;margin:6px 8px;border-radius:16px;';
    var actions=document.createElement('div');
    actions.style.cssText='position:absolute;top:0;right:0;bottom:0;display:flex;width:140px;transform:translateX(140px);';
    var _btnStyle='display:flex;align-items:center;justify-content:center;width:70px;font-size:14px;font-weight:600;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;user-select:none;';
    actions.innerHTML='<div onclick="hideContact(\''+cid+'\')" style="background:#a18cd1;color:#fff;'+_btnStyle+'">隐藏</div>'+'<div onclick="deleteContact(\''+cid+'\')" style="background:#ff3b30;color:#fff;'+_btnStyle+'">删除</div>';
    var div=document.createElement('div');div.className='row';div.id='contact-'+cid;
    div.style.cssText='background:var(--theme-bg,#fdf2f8);position:relative;transition:transform .2s;touch-action:pan-y;margin:0;border-radius:0;';
    div.dataset.cid=cid;
    var avUrl=avatarMap&&avatarMap[cid];
    var avHtml=avUrl
      ?'<div class="av" style="background:'+color+';overflow:hidden;padding:0;position:relative;"><img src="'+avUrl+'" style="width:100%;height:100%;object-fit:cover;display:block;" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\';"><span style="display:none;position:absolute;top:0;left:0;width:100%;height:100%;align-items:center;justify-content:center;color:#fff;font-weight:700;">'+esc(name[0].toUpperCase())+'</span></div>'
      :'<div class="av" style="background:'+color+'">'+name[0].toUpperCase()+'</div>';
    var unreadCount=_unread[cid]||0;
    var badgeHtml=unreadCount>0?'<span style="background:#ff3b30;color:#fff;font-size:12px;font-weight:600;min-width:20px;height:20px;border-radius:10px;display:flex;align-items:center;justify-content:center;padding:0 6px;margin-left:8px;flex-shrink:0;">'+(unreadCount>99?'99+':unreadCount)+'</span>':'';
    div.innerHTML=avHtml+'<div style="flex:1;min-width:0;overflow:hidden;"><div style="display:flex;align-items:baseline;justify-content:space-between;gap:6px;"><span style="'+nameStyle+'">'+esc(name)+'</span><span id="lastts-'+cid+'" style="'+timeStyle+'">'+lastTime+'</span></div><div style="'+lastStyle+'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"><span class="last-prefix">'+prefix+'</span><span id="last-'+cid+'">'+esc(lastText)+'</span>'+readTick+'</div></div>'+badgeHtml+'<span style="color:#c7c7cc;font-size:18px;flex-shrink:0;margin-left:4px;">&#x203A;</span>';
    div.onclick=(function(c,n,col){return function(e){if(parseFloat(div.style.transform.replace(/[^-\d.]/g,''))<-5)return;openChat(c,n[0].toUpperCase(),col,n);};})(cid,name,color);
    attachSwipe(div,actions);wrap.appendChild(actions);wrap.appendChild(div);list.appendChild(wrap);
  });
}
