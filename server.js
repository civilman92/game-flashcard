const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ===================================================
// 1. 資料庫連線設定
// ===================================================
const ATLAS_URL = 'mongodb+srv://civilman92_db_user:fMuAONShKVqa7lUD@cluster0.fyqvwaq.mongodb.net/vocabDB';

mongoose.connect(ATLAS_URL)
  .then(() => console.log('✅ 成功連接 MongoDB Atlas'))
  .catch(err => console.error('❌ 資料庫連接失敗:', err));

// ===================================================
// 2. 資料庫結構 (Schema) 定義
// ===================================================
const WordSchema = new mongoose.Schema({
  en: String,
  ch: String
});

const GroupSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true, 
    unique: true 
  },
  words: [WordSchema]
});

const Group = mongoose.model('Group', GroupSchema);

// ===================================================
// 3. API 路由 (Routes)
// ===================================================

// [GET] 取得所有題組
app.get('/api/groups', async (req, res) => {
  try {
    const groups = await Group.find();
    res.json(groups);
  } catch (err) {
    res.status(500).json({ error: '無法讀取資料' });
  }
});

// [POST] 新增題組
app.post('/api/groups', async (req, res) => {
  const { name, words } = req.body;
  if (!name || !words) return res.status(400).json({ message: '資料格式不正確' });

  try {
    // 檢查名稱是否已存在
    const existing = await Group.findOne({ name });
    if (existing) return res.status(400).json({ message: '題組名稱已存在' });

    const newGroup = new Group({ name, words });
    await newGroup.save();
    res.status(201).json({ message: '新增成功', data: newGroup });
  } catch (err) {
    res.status(500).json({ error: '新增失敗' });
  }
});

// [PUT] 更新現有題組 (修復 404 問題點)
app.put('/api/groups/:oldName', async (req, res) => {
  const { oldName } = req.params;
  const { name, words } = req.body;

  try {
    // 尋找舊題組並更新名稱與單字內容
    const updatedGroup = await Group.findOneAndUpdate(
      { name: decodeURIComponent(oldName) },
      { name: name, words: words },
      { new: true } // 回傳更新後的內容
    );

    if (!updatedGroup) {
      return res.status(404).json({ message: '找不到該題組' });
    }
    res.json({ message: '更新成功', data: updatedGroup });
  } catch (err) {
    res.status(500).json({ error: '更新失敗' });
  }
});

// [DELETE] 刪除題組 (修復刪除無效問題)
app.delete('/api/groups/:name', async (req, res) => {
  const { name } = req.params;
  try {
    const deletedGroup = await Group.findOneAndDelete({ name: decodeURIComponent(name) });
    if (!deletedGroup) {
      return res.status(404).json({ message: '找不到該題組' });
    }
    res.json({ message: '刪除成功' });
  } catch (err) {
    res.status(500).json({ error: '刪除失敗' });
  }
});

// ===================================================
// 4. 啟動伺服器
// ===================================================
app.listen(PORT, () => {
  console.log(`伺服器已啟動：http://localhost:${PORT}`);
});