import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import fetch from 'node-fetch';
import supabase from './supabaseClient.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5001;

/**
 * ✅ Function to fetch device logs and update Supabase user statuses
 */
const syncDeviceLogs = async () => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const IN_API_URL = `${process.env.DEVICE_API_URL}?APIKey=${process.env.DEVICE_API_KEY}&SerialNumber=${process.env.IN_DEVICE_SERIAL}&FromDate=${today}&ToDate=${today}`;
    const OUT_API_URL = `${process.env.DEVICE_API_URL}?APIKey=${process.env.DEVICE_API_KEY}&SerialNumber=${process.env.OUT_DEVICE_SERIAL}&FromDate=${today}&ToDate=${today}`;

    const [inRes, outRes] = await Promise.all([fetch(IN_API_URL), fetch(OUT_API_URL)]);
    const inLogs = await inRes.json();
    const outLogs = await outRes.json();

    const allLogs = [...inLogs, ...outLogs].sort((a, b) => new Date(b.LogDate) - new Date(a.LogDate));
    const employeeStatus = {};

    allLogs.forEach(log => {
      const emp = log.EmployeeCode;
      const dir = log.PunchDirection?.toLowerCase();
      if (!employeeStatus[emp]) {
        employeeStatus[emp] = dir === 'in' ? 'active' : 'inactive';
      }
    });

    // Update users in Supabase
    for (const [empCode, status] of Object.entries(employeeStatus)) {
      const { data: users, error } = await supabase
        .from('users')
        .select('*')
        .eq('employee_id', empCode);

      if (error) console.error('User fetch error:', error.message);
      if (users && users.length > 0) {
        const user = users[0];
        if (user.status !== status) {
          await supabase.from('users').update({ status }).eq('id', user.id);
          console.log(`🔄 Updated ${user.user_name} → ${status}`);
        }
      }
    }

    console.log('✅ Device sync complete');
  } catch (error) {
    console.error('❌ Device sync failed:', error.message);
  }
};

// Automatically sync every 30 seconds
setInterval(syncDeviceLogs, 5000);

// Manual trigger endpoint
app.get('/api/device-sync', async (req, res) => {
  try {
    await syncDeviceLogs();
    res.json({ message: 'Manual device sync complete ✅' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => res.send('Device Sync Backend is running 🚀'));

app.listen(PORT, () => console.log(`✅ Device Sync Server on port ${PORT}`));
