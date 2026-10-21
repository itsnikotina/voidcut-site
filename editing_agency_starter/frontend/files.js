const urlParams = new URLSearchParams(window.location.search);
const jobId = urlParams.get('job_id');
const token = urlParams.get('token');
let API_URL = ''; // Relative or configured backend

async function loadConfig() {
  try {
    const res = await fetch('config.json');
    if (res.ok) {
      const cfg = await res.json();
      if (cfg.api_url) API_URL = cfg.api_url.replace(/\/$/, '');
    }
  } catch (e) {
    // Keep relative default
  }
}

if (!jobId || !token) {
  document.body.innerHTML = '<h1 style="color:white;text-align:center;margin-top:100px;font-family:sans-serif;">403 Forbidden: Invalid secure link.</h1>';
} else {
  document.addEventListener('DOMContentLoaded', async () => {
    const label = document.getElementById('jobIdLabel');
    if (label) label.textContent = 'LOADING...';
    await loadConfig();
    loadFiles();
  });
}

async function loadFiles() {
  const listEl = document.getElementById('fileList');
  if (!listEl) return;
  try {
    const res = await fetch(`${API_URL}/api/files?job_id=${jobId}&token=${token}`);
    if (!res.ok) throw new Error('Unauthorized or folder not ready');
    const data = await res.json();
    const files = data.files || [];
    const projectName = data.project_name || `JOB #${jobId}`;
    
    document.getElementById('jobIdLabel').textContent = projectName;
    
    const totalBytes = files.reduce((acc, f) => acc + (parseInt(f.size) || 0), 0);
    const statsEl = document.getElementById('folderStats');
    if (statsEl) statsEl.textContent = `${files.length} file${files.length === 1 ? '' : 's'} • ${formatBytes(totalBytes)} / 100 GB`;
    
    if (files.length === 0) {
      listEl.innerHTML = '<div style="padding: 20px; text-align: center; color: #777;">No files uploaded yet.</div>';
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
  } catch (err) {
    listEl.innerHTML = `<div style="padding: 20px; text-align: center; color: #f44336;">Error: ${err.message}</div>`;
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
  dropzone.addEventListener('click', () => fileInput.click());

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
    if (e.dataTransfer.files.length) {
      handleUpload(e.dataTransfer.files);
    }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length) {
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
    if (!data.upload_url) throw new Error("Upload session could not be created");
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
            reject(new Error(`Server responded ${xhr.status}: ${xhr.responseText}`));
        };

        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.onabort = () => reject(new Error("Upload cancelled"));
        xhr.send(chunk);
    });
}

async function handleUpload(files) {
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
