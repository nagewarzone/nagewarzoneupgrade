const admin = require('firebase-admin');
const serviceAccount = require('./firebase-adminsdk.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function addAdminUser() {
  const adminUser = {
    password: '7890', // รหัสผ่านเดียวกับ ADMIN_PASSWORD
    token: 999,       // กำหนด token สำหรับ admin (ตามใจ)
    topgm: 999,
    warzone: 999,
    point: 999,
    role: 'admin'     // กำหนด role ไว้ระบุว่าเป็น admin ก็ได้
  };

  await db.collection('users').doc('admin').set(adminUser);
  console.log('เพิ่ม user admin เรียบร้อย');
}

addAdminUser().catch(console.error);

