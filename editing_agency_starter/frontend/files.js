const urlParams = new URLSearchParams(window.location.search);
const jobId = urlParams.get('job_id');
const token = urlParams.get('token');

let API_URL = '';
let SUPABASE_URL = '';
let SUPABASE_KEY = '';
let currentJob = null;

async function loadConfig() {
  try {
    const res = await fetch('config.json');
    if (res.ok) {
      const cfg = await res.json();
      if (cfg.api_url) API_URL = cfg.api_url.replace(/\/$/, '');
      if (cfg.supabase_url) SUPABASE_URL = cfg.supabase_url.replace(/\/$/, '');
      if (cfg.supabase_key) SUPABASE_KEY = cfg.supabase_key;
    }
  } catch (e) {
    console.warn('config.json could not be loaded, using defaults.');
  }
}

if (!jobId || !token) {
  document.body.innerHTML = '<h1 style="color:white;text-align:center;margin-top:100px;font-family:sans-serif;">403 Forbidden: Invalid secure link.</h1>';
} else {
  document.addEventListener('DOMContentLoaded', async () => {
    const label = document.getElementById('jobIdLabel');
    if (label) label.textContent = 'VALIDATING...';
    await loadConfig();
    await validateAndLoad();
  });
}

async function validateAndLoad() {
  // 1. Valida o Job e Token via Supabase
  if (SUPABASE_URL && SUPABASE_KEY) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/jobs?id=eq.${jobId}&access_token=eq.${token}&select=id,title,access_token,drive_folder_id`, {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        }
      });
      if (res.ok) {
        const jobs = await res.json();
        if (jobs && jobs.length > 0) {
          currentJob = jobs[0];
          const label = document.getElementById('jobIdLabel');
          if (label) label.textContent = currentJob.title || `JOB #${jobId}`;
          renderDriveBanner(currentJob.drive_folder_id);
        } else {
          document.body.innerHTML = '<h1 style="color:white;text-align:center;margin-top:100px;font-family:sans-serif;">403 Forbidden: Invalid secure link.</h1>';
          return;
        }
      }
    } catch (e) {
      console.error('Error validating with Supabase:', e);
    }
  }

  // 2. Carrega arquivos (se houver API remota configurada tenta carregar, senao exibe modo nuvem)
  await loadFiles();
}

function renderDriveBanner(folderId) {
  if (!folderId) return;
  const existing = document.getElementById('driveDirectBanner');
  if (existing) return;

  const driveUrl = `https://drive.google.com/drive/folders/${folderId}`;
  const banner = document.createElement('div');
  banner.id = 'driveDirectBanner';
  banner.style.cssText = 'margin-bottom: 25px; padding: 20px; background: #121212; border: 1px solid var(--acid); border-radius: 6px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px;';
  banner.innerHTML = `
    <div>
      <div style="font: 500 11px 'DM Mono'; color: var(--acid); margin-bottom: 4px; text-transform: uppercase;">Google Drive Cloud Sync</div>
      <b style="color: #fff; font-size: 15px; letter-spacing: -0.01em;">Pasta de Arquivos do Projeto</b>
      <p style="color: #888; font-size: 12px; margin: 4px 0 0;">Envie vídeos brutos e baixe os renders finais direto pelo Google Drive oficial.</p>
    </div>
    <a href="${driveUrl}" target="_blank" rel="noopener noreferrer" class="button primary" style="text-decoration: none; padding: 10px 16px; font-size: 11px;">
      Abrir no Google Drive ↗
    </a>
  `;

  const container = document.querySelector('.files-container');
  const dropzone = document.getElementById('dropzone');
  if (container && dropzone) {
    container.insertBefore(banner, dropzone);
  }
}

async function loadFiles() {
  const listEl = document.getElementById('fileList');
  if (!listEl) return;

  const projectName = currentJob ? currentJob.title : `JOB #${jobId}`;
  const label = document.getElementById('jobIdLabel');
  if (label) label.textContent = projectName;

  const folderId = currentJob ? currentJob.drive_folder_id : null;
  const driveUrl = folderId ? `https://drive.google.com/drive/folders/${folderId}` : null;

  // Se a API remota estiver configurada com URL completa (ex: http:// ou https://)
  if (API_URL && API_URL.startsWith('http')) {
    try {
      const res = await fetch(`${API_URL}/api/files?job_id=${jobId}&token=${token}`);
      if (res.ok) {
        const data = await res.json();
        const files = data.files || [];
        const totalBytes = files.reduce((acc, f) => acc + (parseInt(f.size) || 0), 0);
        const statsEl = document.getElementById('folderStats');
        if (statsEl) statsEl.textContent = `${files.length} file${files.length === 1 ? '' : 's'} • ${formatBytes(totalBytes)} / 100 GB`;
        
        if (files.length === 0) {
          listEl.innerHTML = '<div style="padding: 20px; text-align: center; color: #777;">No files uploaded yet in this project.</div>';
          return;
        }
        
        listEl.innerHTML = files.map(f => `
          <div class="file-item">
            <div class="file-info">
              <span class="file-name">${esc(f.name)}</span>
              <span class="file-size">${formatBytes(f.size || 0)}</span>
            </div>
            <div class="file-actions">
              ${f.webContentLink ? `<a href="${esc(f.webContentLink)}" target="_blank" rel="noopener noreferrer" class="ghost-btn" style="background: var(--acid); color: #0b0b0b; border-color: var(--acid); font-weight: 500;">Download</a>` : ''}
              <button class="ghost-btn" style="color: var(--red); display: inline-flex; align-items: center; justify-content: center; padding: 7px; min-width: 34px;" onmouseover="this.style.borderColor='var(--red)'" onmouseout="this.style.borderColor='var(--line)'" onclick="deleteFile('${esc(f.id)}')" title="Delete file">
                <svg width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M16 2v4h6v2h-2v14H4V8H2V6h6V2h8zm-2 2h-4v2h4V4zm0 4H6v12h12V8h-4zm-5 2h2v8H9v-8zm6 0h-2v8h2v-8z" fill="currentColor"/></svg>
              </button>
            </div>
          </div>
        `).join('');
        return;
      }
    } catch (e) {
      console.log('Backend API offline, displaying Google Drive cloud portal.');
    }
  }

  // Modo Cloud Nativo (Vercel + Google Drive):
  if (driveUrl) {
    const statsEl = document.getElementById('folderStats');
    if (statsEl) statsEl.textContent = 'GOOGLE DRIVE CLOUD SYNC';

    listEl.innerHTML = `
      <div style="padding: 35px 20px; text-align: center; background: #0e0e0e; border: 1px solid var(--line); border-radius: 6px;">
        <div style="width: 48px; height: 48px; border-radius: 50%; background: rgba(168,255,62,0.1); border: 1px solid var(--acid); display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; color: var(--acid); font-size: 20px;">
          ☁️
        </div>
        <h3 style="color: #fff; font-size: 18px; margin: 0 0 8px; letter-spacing: -0.02em;">Pasta Oficial do Projeto no Google Drive</h3>
        <p style="color: #888; font-size: 13px; max-width: 480px; margin: 0 auto 20px; line-height: 1.5;">
          Os vídeos brutos (raw footage) e os renders finais deste trabalho são armazenados e sincronizados com segurança no Google Drive da agência.
        </p>
        <a href="${driveUrl}" target="_blank" rel="noopener noreferrer" class="button primary" style="text-decoration: none; display: inline-flex; padding: 14px 24px; font-size: 12px; font-weight: 600;">
          Abrir Pasta no Google Drive ↗
        </a>
      </div>
    `;

    // Dropzone direciona para o Drive também:
    const dropzone = document.getElementById('dropzone');
    if (dropzone && (!API_URL || !API_URL.startsWith('http'))) {
      dropzone.onclick = () => window.open(driveUrl, '_blank');
      const h3 = dropzone.querySelector('h3');
      const p = dropzone.querySelector('p');
      if (h3) h3.textContent = 'Clique para abrir o Google Drive';
      if (p) p.textContent = 'Envie e baixe arquivos de qualquer tamanho diretamente na pasta';
    }
  } else {
    listEl.innerHTML = `<div style="padding: 25px; text-align: center; color: #777;">Pasta em preparação pelo sistema. Recarregue em alguns segundos.</div>`;
  }
}

function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}

function showError(msg) {
  const modal = document.getElementById('errorModal');
  if (modal) {
    document.getElementById('errorModalMessage').innerHTML = msg;
    modal.classList.remove('hidden');
  } else {
    alert(msg.replace(/<[^>]*>?/gm, ''));
  }
}

async function deleteFile(fileId) {
  if (!confirm('Are you sure you want to delete this file?')) return;
  if (!API_URL || !API_URL.startsWith('http')) {
    if (currentJob && currentJob.drive_folder_id) {
      window.open(`https://drive.google.com/drive/folders/${currentJob.drive_folder_id}`, '_blank');
    }
    return;
  }
  try {
    const res = await fetch(`${API_URL}/api/files/${fileId}?job_id=${jobId}&token=${token}`, { method: 'DELETE' });
    if (res.ok) {
      loadFiles();
    } else {
      showError('Error deleting file');
    }
  } catch(e) {
    showError('Error connecting to server');
  }
}

// Drag and drop logic
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');

if (dropzone && fileInput) {
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (API_URL && API_URL.startsWith('http') && e.dataTransfer.files.length) {
      handleUpload(e.dataTransfer.files);
    } else if (currentJob && currentJob.drive_folder_id) {
      window.open(`https://drive.google.com/drive/folders/${currentJob.drive_folder_id}`, '_blank');
    }
  });

  fileInput.addEventListener('change', () => {
    if (API_URL && API_URL.startsWith('http') && fileInput.files.length) {
      handleUpload(fileInput.files);
    }
  });
}

function formatBytes(bytes, decimals = 2) {
  if (!+bytes) return '0 Bytes';
  const k = 1024, dm = decimals < 0 ? 0 : decimals, sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB

async function createUploadSession(file) {
    const response = await fetch(`${API_URL}/api/upload/session`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            job_id: parseInt(jobId),
            token: token,
            filename: file.name,
            mime_type: file.type || "application/octet-stream",
            file_size: file.size
        })
    });

    if (!response.ok) {
        let errorMsg = `HTTP ${response.status}`;
        try {
            const errData = await response.json();
            if (errData.detail) errorMsg = errData.detail;
        } catch(e) {
            errorMsg = await response.text();
        }
        throw new Error(errorMsg);
    }

    const data = await response.json();
    if (!data.upload_url) throw new Error("Google Drive não retornou upload_url");
    return data.upload_url;
}

function uploadChunk(uploadUrl, chunk, start, end, totalSize, progressBar, progressPercent) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", uploadUrl, true);
        xhr.setRequestHeader("Content-Range", `bytes ${start}-${end - 1}/${totalSize}`);

        xhr.upload.onprogress = (event) => {
            if (!event.lengthComputable) return;
            const percentage = ((start + event.loaded) / totalSize) * 100;
            progressBar.value = percentage;
            progressPercent.textContent = percentage.toFixed(1) + '%';
        };

        xhr.onload = () => {
            if (xhr.status === 308) {
                resolve({ completed: false });
                return;
            }
            if (xhr.status === 200 || xhr.status === 201) {
                resolve({ completed: true });
                return;
            }
            reject(new Error(`Google Drive respondeu ${xhr.status}: ${xhr.responseText}`));
        };

        xhr.onerror = () => reject(new Error("Erro de rede durante upload"));
        xhr.onabort = () => reject(new Error("Upload cancelado"));
        xhr.send(chunk);
    });
}

async function handleUpload(files) {
    if (!API_URL || !API_URL.startsWith('http')) {
        if (currentJob && currentJob.drive_folder_id) {
            window.open(`https://drive.google.com/drive/folders/${currentJob.drive_folder_id}`, '_blank');
        }
        return;
    }

    const progressCont = document.getElementById('progressContainer');
    const progressBar = document.getElementById('uploadProgress');
    const progressText = document.getElementById('progressText');
    const progressPercent = document.getElementById('progressPercent');
    
    if (progressCont) progressCont.style.display = 'block';
    
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (progressText) progressText.textContent = `Uploading ${file.name}... (${i+1}/${files.length})`;
        if (progressBar) progressBar.value = 0;
        if (progressPercent) progressPercent.textContent = '0%';
        
        try {
            const uploadUrl = await createUploadSession(file);
            let start = 0;
            while (start < file.size) {
                const end = Math.min(start + CHUNK_SIZE, file.size);
                const chunk = file.slice(start, end);
                const result = await uploadChunk(uploadUrl, chunk, start, end, file.size, progressBar, progressPercent);
                if (result.completed) break;
                start = end;
            }
        } catch (e) {
            let parsedMsg = e.message.replace(/(storage limit of )(\d+\s*[A-Z]+)/i, '$1<strong style="color:white;">$2</strong>');
            showError(`Failed to upload <strong style="color:white;">${file.name}</strong>:<br><br>${parsedMsg}`);
        }
    }
    
    if (progressCont) progressCont.style.display = 'none';
    if (fileInput) fileInput.value = '';
    loadFiles();
}
