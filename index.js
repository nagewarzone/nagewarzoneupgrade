import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import admin from 'firebase-admin';
import serviceAccount from './serviceAccountKey.json' assert { type: 'json' };
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);



admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});


const db = admin.firestore();
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

async function sendDiscord(message, embed = null) {
  const webhookURL = process.env.DISCORD_WEBHOOK_URL;
  try {
    const body = embed ? { embeds: [embed] } : { content: message };
    await fetch(webhookURL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (error) {
    console.error('ส่งข้อความ Discord ล้มเหลว:', error);
  }
}

const ADMIN_PASSWORD = '7890';

function adminAuth(req, res, next) {
  const adminPass = req.headers['x-admin-password'];
  if (!adminPass || adminPass !== ADMIN_PASSWORD) {
    return res.status(403).json({ success: false, message: 'Forbidden: Admin access required' });
  }
  next();
}

const ADMIN_CREDENTIALS = {
  username: 'admin',
  password: ADMIN_PASSWORD,
};

app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'กรุณากรอก username และ password' });
  }
  if (username === ADMIN_CREDENTIALS.username && password === ADMIN_CREDENTIALS.password) {
    return res.json({ success: true, message: 'เข้าสู่ระบบสำเร็จ', token: 'dummy-admin-token' });
  } else {
    return res.status(401).json({ success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง หรือไม่ใช่ Admin' });
  }
});

app.post('/proxy', async (req, res) => {
  const { action, username, password, name, pointChange, topgmChange } = req.body;

  if (!action) return res.json({ success: false, message: 'Missing action' });

  try {
    const userRef = db.collection('users').doc(username);
    const userDoc = await userRef.get();

    if (action === 'register') {
      if (!username || !password) return res.json({ success: false, message: 'Missing username or password' });

      if (userDoc.exists) return res.json({ success: false, message: 'Username ซ้ำ' });

      await userRef.set({
        password,
        token: 0,
        topgm: 0,
        warzone: 0,
        point: 0
      });
      return res.json({ success: true });
    }

    if (!userDoc.exists) return res.json({ success: false, message: 'ไม่พบผู้ใช้' });
    const userData = userDoc.data();
    if (userData.password !== password) return res.json({ success: false, message: 'รหัสผ่านไม่ถูกต้อง' });

    if (action === 'login' || action === 'userinfo') {
      return res.json({ success: true, ...userData });
    }

    if (action === 'usepoint') {
      if (typeof pointChange !== 'number' || typeof topgmChange !== 'number') {
        return res.json({ success: false, message: 'Invalid pointChange or topgmChange' });
      }

      const displayName = name || username;
      const currentPoint = userData.point || 0;
      const currentTopgm = userData.topgm || 0;

      const newPoint = currentPoint + pointChange;
      const newTopgm = currentTopgm + topgmChange;

      if (newPoint < 0) {
        return res.json({ success: false, message: 'POINT ไม่พอ' });
      }

      if (newTopgm < 0) {
        return res.json({ success: false, message: 'ไม่สามารถลบ topgm ได้มากกว่าที่มี' });
      }

      await userRef.update({ point: newPoint, topgm: newTopgm });

      await sendDiscord(`${displayName} แลก ${Math.abs(pointChange)} พ้อยท์ ได้รับไอเท็ม TOPGM จำนวน ${Math.abs(topgmChange)} ชิ้น`);

      return res.json({ success: true });
    }

    if (action === 'upgrade') {
      const itemName = 'topgm';
      const hasItem = userData[itemName] || 0;
      let currentToken = userData.token || 0;
      let warzone = userData.warzone || 0;
      let topgm = hasItem;

      if (currentToken <= 0) {
        return res.json({ success: false, message: 'คุณไม่มี PEMTO สำหรับอัปเกรด' });
      }
      if (topgm <= 0) {
        return res.json({ success: false, message: 'คุณไม่มีไอเท็มสำหรับอัพเกรด' });
      }

      const rateDoc = await db.collection('upgraderates').doc(itemName).get();
      if (!rateDoc.exists) return res.json({ success: false, message: 'ไม่มีข้อมูลอัตราอัพเกรด' });

      const { successRate, failRate, breakRate } = rateDoc.data();
      if (
        typeof successRate !== 'number' || typeof failRate !== 'number' || typeof breakRate !== 'number' ||
        successRate < 0 || failRate < 0 || breakRate < 0 ||
        successRate + failRate + breakRate > 1
      ) {
        return res.json({ success: false, message: 'ข้อมูลอัตราอัพเกรดไม่ถูกต้อง' });
      }

      const roll = Math.random();
      let result = '';
      let logResult = '';
      let resultMessage = '';

      currentToken -= 1;

      if (roll < successRate) {
        result = 'success';
        topgm -= 1;
        logResult = `สำเร็จ`;
        resultMessage = `อัพเกรดสำเร็จ: Warzone`;

        const embed = { 
          title: `🎉 ${name || username} ได้อัพเกรด สำเร็จ !`,
          description: `ไอเท็มมีระดับสูงขึ้นเป็น "   Warzone S.GOD+7  "\u00A0!!`,
          color: 0x00FF00,
          image: {
            url: "https://img5.pic.in.th/file/secure-sv1/image_2025-05-21_025140493-removebg-preview.png"
          },
          footer: {
            text: "ได้รับไอเท็ม Warzone S.GOD+7"
          },
          timestamp: new Date().toISOString()
        };

        await sendDiscord(null, embed);

      } else if (roll < successRate + failRate) {
        result = 'fail';
        logResult = `ล้มเหลว`;
        resultMessage = `อัพเกรดไม่สำเร็จ (TOPGM ยังอยู่)`;
        await sendDiscord(`\u00A0\u00A0\u00A0\u00A0${name || username}\u00A0\u00A0 ⚠️\u00A0\u00A0 ได้อัพเกรด \u00A0\u00A0ปลอกTOPGM ล้มเหลว!\u00A0\ ขอให้โชคดีครั้งหน้า`);
      } else {
        result = 'broken';
        topgm -= 1;
        logResult = `แตก`;
        resultMessage = `อัพเกรดล้มเหลว ไอเท็มสูญหาย (TOPGM หาย)`;
        await sendDiscord(`\u00A0\u00A0\u00A0\u00A0${name || username}\u00A0\u00A0 💥\u00A0\u00A0 ได้อัพเกรดล้มเหลว! \u00A0\u00A0ไอเท็ม \u00A0\u00A0ปลอกTOPGM\u00A0\u00A0 ถูกทำลาย`);
      }

      if (topgm < 0) topgm = 0;

      await userRef.update({
        token: currentToken,
        warzone: warzone,
        topgm: topgm
      });

      await db.collection('logs').add({
        Date: admin.firestore.FieldValue.serverTimestamp(),
        Username: username,
        Name: name || '',
        Item: itemName,
        Result: logResult
      });

      return res.json({ success: true, result: logResult, resultMessage });
    }

    return res.json({ success: false, message: 'Unknown action' });
  } catch (err) {
    console.error(err);
    return res.json({ success: false, message: 'Server Error' });
  }
});

app.get('/getUpgradeRates', async (req, res) => {
  try {
    const snapshot = await db.collection('upgraderates').get();
    const rates = {};
    snapshot.forEach(doc => {
      rates[doc.id] = doc.data();
    });
    res.json({ success: true, rates });
  } catch (err) {
    console.error(err);
    res.json({ success: false, message: 'Server Error' });
  }
});

app.get('/getLogs', adminAuth, async (req, res) => {
  try {
    const logsSnapshot = await db.collection('logs').orderBy('Date', 'desc').limit(100).get();
    const logs = [];
    logsSnapshot.forEach(doc => {
      logs.push({ id: doc.id, ...doc.data() });
    });
    res.json({ success: true, logs });
  } catch (err) {
    console.error(err);
    res.json({ success: false, message: 'Server Error' });
  }
});

app.get('/getUserByName', adminAuth, async (req, res) => {
  try {
    const name = req.query.name;
    if (!name) return res.json({ success: false, message: 'Missing name parameter' });
    const usersSnapshot = await db.collection('users').where('name', '==', name).get();
    if (usersSnapshot.empty) return res.json({ success: false, message: 'ไม่พบผู้ใช้' });

    const users = [];
    usersSnapshot.forEach(doc => {
      users.push({ id: doc.id, ...doc.data() });
    });

    res.json({ success: true, users });
  } catch (err) {
    console.error(err);
    res.json({ success: false, message: 'Server Error' });
  }
});

app.listen(port, () => {
  console.log(`🔥 Server is running at http://localhost:${port}`);
});
