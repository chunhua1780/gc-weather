// ================================================================
// GhostChat 推送服务器 - 部署到 Supabase Edge Function 或 Vercel
// ================================================================
// 这是一个独立的Node.js推送服务，你可以：
// 1. 部署到 Vercel（免费，最简单）
// 2. 部署到 Railway / Render
// 3. 本地测试: node push-server.js
//
// 安装依赖: npm install express web-push @supabase/supabase-js cors
// ================================================================

const express = require('express');
const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// ── VAPID 配置 ──
const VAPID_PUBLIC  = 'BDQ8XlX1wbta3RwiuYkzXSnVs474RzEVomOsI9Q0j4Rc9s6ow9T2bMWr2ShMsMtIs6i4zyrOe9j78VTWh9JMsXU';
const VAPID_PRIVATE = 'CULeLI_Kb_DxH6eJzTiz6Vkud_eT64CGILkxBVZL9yc';
const VAPID_EMAIL   = 'mailto:admin@ghostchat.app';

webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE);

// ── Supabase 客户端（用 service_role key，后端专用）──
const supabase = createClient(
  'https://mztoenhgfuomzrashrqk.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || 'YOUR_SERVICE_ROLE_KEY_HERE'
);

// ── 1. 保存推送订阅 ──
app.post('/api/subscribe', async (req, res) => {
  const { userId, subscription } = req.body;
  if (!userId || !subscription) return res.status(400).json({ error: 'missing params' });

  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id: userId,
    subscription: JSON.stringify(subscription),
    updated_at: new Date().toISOString()
  }, { onConflict: 'user_id' });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ── 2. 发送推送（当有新消息时调用）──
app.post('/api/push', async (req, res) => {
  const { toUserId, fromNickname, notifSym, notifTxt } = req.body;

  // 取订阅信息
  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('subscription')
    .eq('user_id', toUserId)
    .single();

  if (error || !data) return res.status(404).json({ error: 'no subscription' });

  // 伪装通知内容（用用户设定的隐秘文案）
  const titles = {
    sys: '系统更新完成', sync: '数据同步中', cal: '日程提醒', none: ''
  };
  const syms = {
    dot:'●', line:'|', star:'✦', tri:'▲', dia:'◆', wave:'～', sync:'↻', mail:'✉'
  };
  const sym = syms[notifSym] || '●';
  const bodyText = titles[notifTxt] || '系统更新完成';

  const payload = JSON.stringify({
    title: sym,
    body: bodyText,
    icon: './icon192.png',
    tag: 'msg-' + toUserId,
    data: { url: './index.html' }
  });

  try {
    await webpush.sendNotification(JSON.parse(data.subscription), payload);
    res.json({ ok: true });
  } catch(e) {
    // 订阅过期，删掉
    if (e.statusCode === 410) {
      await supabase.from('push_subscriptions').delete().eq('user_id', toUserId);
    }
    res.status(500).json({ error: e.message });
  }
});

// ── 3. 健康检查 ──
app.get('/', (req, res) => res.json({ status: 'ok', service: 'GhostChat Push Server' }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log('Push server running on port', PORT));
