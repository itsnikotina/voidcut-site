export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { job_id, token, file_id } = req.query;
  const jobId = parseInt(job_id);

  if (!jobId || !token) {
    return res.status(403).json({ error: 'Missing job_id or access token' });
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
    if (!supaRes.ok) throw new Error('Supabase error');
    const jobs = await supaRes.json();
    if (jobs && jobs.length > 0) {
      job = jobs[0];
    }
  } catch (e) {
    console.error('Supabase validation error:', e);
  }

  if (!job) {
    return res.status(403).json({ error: 'Invalid token or job ID' });
  }

  if (!job.drive_folder_id) {
    return res.status(200).json({ project_name: job.title, files: [] });
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
    console.error('Google token refresh error:', e);
    return res.status(500).json({ error: 'Could not connect to Google Cloud' });
  }

  // 3. GET: Listar arquivos
  if (req.method === 'GET') {
    try {
      const q = encodeURIComponent(`'${job.drive_folder_id}' in parents and trashed = false`);
      const driveRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,size,webContentLink)`, {
        headers: {
          'Authorization': `Bearer ${googleAccessToken}`
        }
      });
      const driveData = await driveRes.json();
      return res.status(200).json({
        project_name: job.title,
        files: driveData.files || []
      });
    } catch (e) {
      console.error('Google drive list error:', e);
      return res.status(200).json({ project_name: job.title, files: [] });
    }
  }

  // 4. DELETE: Excluir arquivo
  if (req.method === 'DELETE') {
    const targetFileId = file_id || req.query.id;
    if (!targetFileId) {
      return res.status(400).json({ error: 'Missing file_id' });
    }
    try {
      await fetch(`https://www.googleapis.com/drive/v3/files/${targetFileId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${googleAccessToken}`
        }
      });
      return res.status(200).json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: 'Failed to delete file' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
