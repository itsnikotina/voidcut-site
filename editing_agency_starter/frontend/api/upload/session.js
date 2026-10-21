export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { job_id, token, filename, mime_type, file_size } = req.body || {};
  const jobId = parseInt(job_id);

  if (!jobId || !token || !filename) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://thceapyxksoljuuouskx.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_KEY;
  const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;

  // 1. Valida no Supabase
  let job = null;
  try {
    const supaRes = await fetch(`${SUPABASE_URL}/rest/v1/jobs?id=eq.${jobId}&access_token=eq.${token}&select=id,title,drive_folder_id`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });
    const jobs = await supaRes.json();
    if (jobs && jobs.length > 0) {
      job = jobs[0];
    }
  } catch (e) {
    console.error('Supabase error:', e);
  }

  if (!job || !job.drive_folder_id) {
    return res.status(403).json({ error: 'Invalid project or storage not ready' });
  }

  // 2. Renova token do Google Drive
  let googleAccessToken = null;
  try {
    const tokenParams = new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: REFRESH_TOKEN,
      grant_type: 'refresh_token'
    });
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams.toString()
    });
    const tokenData = await tokenRes.json();
    googleAccessToken = tokenData.access_token;
  } catch (e) {
    return res.status(500).json({ error: 'Google Cloud authentication failed' });
  }

  // 3. Cria sessão de upload resumable direta
  try {
    const origin = req.headers.origin || 'https://voidcut-site.vercel.app';
    const driveRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${googleAccessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': mime_type || 'application/octet-stream',
        'X-Upload-Content-Length': String(file_size),
        'Origin': origin
      },
      body: JSON.stringify({
        name: filename,
        parents: [job.drive_folder_id]
      })
    });

    if (!driveRes.ok) {
      const errTxt = await driveRes.text();
      return res.status(driveRes.status).json({ detail: `Google Drive error: ${errTxt}` });
    }

    const uploadUrl = driveRes.headers.get('location');
    if (!uploadUrl) {
      return res.status(500).json({ detail: 'Google Drive did not return upload location' });
    }

    return res.status(200).json({ upload_url: uploadUrl });
  } catch (e) {
    return res.status(500).json({ detail: e.message });
  }
}
