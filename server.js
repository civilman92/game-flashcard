const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// ===================================================
// 1. 設定（全部從環境變數讀，不再寫死敏感資料）
// ===================================================
const REPO      = process.env.GITHUB_REPO      || 'civilman92/game-flashcard';
const BRANCH    = process.env.GITHUB_BRANCH    || 'main';
const FILE_PATH = process.env.GITHUB_FILE_PATH || 'data/groups.json';
const TOKEN     = process.env.GITHUB_TOKEN;

if (!TOKEN) {
  console.error('❌ 缺少環境變數 GITHUB_TOKEN');
  process.exit(1);
}

const COMMITTER = {
  name:  process.env.COMMITTER_NAME  || 'civilman92',
  email: process.env.COMMITTER_EMAIL || 'civilman92@users.noreply.github.com'
};

const GH_HEADERS = {
  'Authorization': `token ${TOKEN}`,
  'Accept': 'application/vnd.github+json',
  'User-Agent': 'game-flashcard-server'
};
const GH_API = 'https://api.github.com';

// ===================================================
// 2. GitHub Contents API 工具（讀 / 寫）
// ===================================================
async function readGroups() {
  const url = `${GH_API}/repos/${REPO}/contents/${encodeURIComponent(FILE_PATH)}?ref=${BRANCH}`;
  const res = await fetch(url, { headers: GH_HEADERS });
  if (res.status === 404) return { groups: [], sha: null };
  if (!res.ok) throw new Error(`GitHub 讀取 ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = Buffer.from(data.content, 'base64').toString('utf-8');
  return { groups: JSON.parse(text), sha: data.sha };
}

async function writeGroups(groups, message) {
  // 每次寫入前重抓 sha，避免 race condition 與 409 conflict
  const { sha } = await readGroups();
  const body = {
    message,
    branch: BRANCH,
    content: Buffer.from(JSON.stringify(groups, null, 2) + '\n').toString('base64'),
    committer: COMMITTER
  };
  if (sha) body.sha = sha;

  const url = `${GH_API}/repos/${REPO}/contents/${encodeURIComponent(FILE_PATH)}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...GH_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`GitHub 寫入 ${res.status}: ${await res.text()}`);
  return await res.json();
}

// ===================================================
// 3. API 路由（保持向後相容，admin 1.html 不用改）
// ===================================================

app.get('/', (req, res) => res.json({ ok: true, backend: 'github', repo: REPO, file: FILE_PATH }));

// [GET] 取得所有題組
app.get('/api/groups', async (req, res) => {
  try {
    const { groups } = await readGroups();
    res.json(groups);
  } catch (err) {
    console.error('GET error:', err.message);
    res.status(500).json({ error: '無法讀取資料', detail: err.message });
  }
});

// [POST] 新增題組
app.post('/api/groups', async (req, res) => {
  const { name, words } = req.body || {};
  if (!name || !Array.isArray(words)) {
    return res.status(400).json({ message: '資料格式不正確' });
  }
  try {
    const { groups } = await readGroups();
    if (groups.some(g => g.name === name)) {
      return res.status(400).json({ message: '題組名稱已存在' });
    }
    const newGroup = { name, words };
    groups.push(newGroup);
    await writeGroups(groups, `新增題組: ${name}`);
    res.status(201).json({ message: '新增成功', data: newGroup });
  } catch (err) {
    console.error('POST error:', err.message);
    res.status(500).json({ error: '新增失敗', detail: err.message });
  }
});

// [PUT] 更新題組（用 :oldName 對應原 server.js 行為）
app.put('/api/groups/:oldName', async (req, res) => {
  const { oldName } = req.params;
  const { name, words } = req.body || {};
  if (!name || !Array.isArray(words)) {
    return res.status(400).json({ message: '資料格式不正確' });
  }
  try {
    const { groups } = await readGroups();
    const idx = groups.findIndex(g => g.name === oldName);
    if (idx === -1) return res.status(404).json({ message: '找不到題組' });
    groups[idx] = { name, words };
    await writeGroups(groups, `更新題組: ${oldName} → ${name}`);
    res.json({ message: '更新成功', data: groups[idx] });
  } catch (err) {
    console.error('PUT error:', err.message);
    res.status(500).json({ error: '更新失敗', detail: err.message });
  }
});

// [DELETE] 刪除題組
app.delete('/api/groups/:name', async (req, res) => {
  const { name } = req.params;
  try {
    const { groups } = await readGroups();
    const idx = groups.findIndex(g => g.name === name);
    if (idx === -1) return res.status(404).json({ message: '找不到題組' });
    groups.splice(idx, 1);
    await writeGroups(groups, `刪除題組: ${name}`);
    res.json({ message: '刪除成功' });
  } catch (err) {
    console.error('DELETE error:', err.message);
    res.status(500).json({ error: '刪除失敗', detail: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 伺服器啟動：port ${PORT}`);
  console.log(`📦 儲存後端：GitHub ${REPO} / ${FILE_PATH}`);
});
