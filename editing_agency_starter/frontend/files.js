const urlParams = new URLSearchParams(window.location.search);
const jobId = urlParams.get('job_id');
const token = urlParams.get('token');

let API_URL = '';
let SUPABASE_URL = 'https://thceapyxksoljuuouskx.supabase.co';
let SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRoY2VhcHl4a3NvbGp1dW91c2t4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1NDcyNTgsImV4cCI6MjEwODEyMzI1OH0.yJzS61J7VjVEe-WzitgvIeOMH5ILOnGyyVv7dSflcU8';
let currentJob = null;

function addLog(msg, color = '#888') {
  console.log('[PORTAL]', msg);
  const out = document.getElementById('logOutput');
  if (out) {
    const time = new Date().toLocaleTimeString();
    out.innerHTML += `<div><span style="color:#555;">[${time}]</span> <span style="color:${color};">${msg}</span></div>`;
  }
}

async function loadConfig() {
  addLog('Carregando config.json...');
  try {
    const res = await fetch('config.json');
    if (res.ok) {
      const cfg = await res.json();
      if (cfg.api_url) API_URL = cfg.api_url.replace(/\/$/, '');
      if (cfg.supabase_url) SUPABASE_URL = cfg.supabase_url.replace(/\/$/, '');
      if (cfg.supabase_key) SUPABASE_KEY = cfg.supabase_key;
      addLog('config.json carregado com sucesso.', '#a8ff3e');
    }
  } catch (e) {
    addLog('Aviso: config.json nao carregado, usando chaves padrao.', '#ffb84d');
  }
}

if (!jobId || !token) {
  document.body.innerHTML = '<h1 style="color:white;text-align:center;margin-top:100px;font-family:sans-serif;">403 Forbidden: Link de acesso incompleto.</h1>';
} else {
  document.addEventListener('DOMContentLoaded', async () => {
    addLog(`Iniciando portal para o Job #${jobId}...`);
    await loadConfig();
    await validateAndLoad();
  });
}

async function validateAndLoad() {
  addLog(`Consultando Supabase para validar token do Job #${jobId}...`);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/jobs?id=eq.${jobId}&access_token=eq.${token}&select=id,title,access_token,drive_folder_id`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });

    if (!res.ok) {
      const errTxt = await res.text();
      addLog(`Erro ao responder do Supabase (HTTP ${res.status}): ${errTxt}`, '#ff5d5d');
      throw new Error('Falha na resposta do Supabase');
    }

    const jobs = await res.json();
    if (jobs && jobs.length > 0) {
      currentJob = jobs[0];
      addLog(`Job validado com sucesso! Titulo: "${currentJob.title}"`, '#a8ff3e');
      
      const label = document.getElementById('jobIdLabel');
      if (label) label.textContent = currentJob.title || `JOB #${jobId}`;

      if (currentJob.drive_folder_id) {
        addLog(`Pasta do Google Drive vinculada: ${currentJob.drive_folder_id}`, '#a8ff3e');
        renderDriveBanner(currentJob.drive_folder_id);
      } else {
        addLog('Aviso: Nenhuma pasta do Google Drive encontrada neste job.', '#ffb84d');
      }
    } else {
      addLog(`Token invalido ou projeto #${jobId} nao encontrado no Supabase.`, '#ff5d5d');
      document.body.innerHTML = '<h1 style="color:white;text-align:center;margin-top:100px;font-family:sans-serif;">403 Forbidden: Token de acesso invalido.</h1>';
      return;
    }
  } catch (e) {
    addLog(`Falha de rede ao consultar Supabase: ${e.message}`, '#ff5d5d');
  }

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
      <b style="color: #fff; font-size: 15px; letter-spacing: -0.01em;">Pasta Oficial de Arquivos</b>
      <p style="color: #888; font-size: 12px; margin: 4px 0 0;">Envie seus vídeos brutos e baixe os cortes prontos direto pelo Google Drive.</p>
    </div>
    <a href="${driveUrl}" target="_blank" rel="noopener noreferrer" class="button primary" style="text-decoration: none; padding: 10px 18px; font-size: 11px; font-weight: 600;">
      Abrir Pasta no Google Drive ↗
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

  const folderId = currentJob ? currentJob.drive_folder_id : null;
  const driveUrl = folderId ? `https://drive.google.com/drive/folders/${folderId}` : null;

  // Se a API remota estiver configurada (ex: túnel ativo com http:// ou https://)
  if (API_URL && API_URL.startsWith('http')) {
    addLog(`Tentando listar arquivos via API backend em: ${API_URL}`);
    try {
      const res = await fetch(`${API_URL}/api/files?job_id=${jobId}&token=${token}`);
      if (res.ok) {
        const data = await res.json();
        const files = data.files || [];
        addLog(`API retornou ${files.length} arquivos.`, '#a8ff3e');
        
        const totalBytes = files.reduce((acc, f) => acc + (parseInt(f.size) || 0), 0);
        const statsEl = document.getElementById('folderStats');
        if (statsEl) statsEl.textContent = `${files.length} file${files.length === 1 ? '' : 's'} • ${formatBytes(totalBytes)} / 100 GB`;
        
        if (files.length === 0) {
          listEl.innerHTML = '<div style="padding: 20px; text-align: center; color: #777;">Nenhum arquivo enviado ainda nesta pasta.</div>';
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
            </div>
          </div>
        `).join('');
        return;
      }
    } catch (e) {
      addLog(`API backend offline ou inacessivel: ${e.message}. Alternando para modo direto Google Drive.`, '#ffb84d');
    }
  }

  // Modo Cloud Nativo (Vercel + Google Drive):
  if (driveUrl) {
    addLog('Modo Cloud Nativo ativado com Google Drive.', '#a8ff3e');
    const statsEl = document.getElementById('folderStats');
    if (statsEl) statsEl.textContent = 'GOOGLE DRIVE CLOUD SYNC';

    listEl.innerHTML = `
      <div style="padding: 35px 20px; text-align: center; background: #0e0e0e; border: 1px solid var(--line); border-radius: 6px;">
        <div style="width: 48px; height: 48px; border-radius: 50%; background: rgba(168,255,62,0.1); border: 1px solid var(--acid); display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; color: var(--acid); font-size: 20px;">
          ☁️
        </div>
        <h3 style="color: #fff; font-size: 18px; margin: 0 0 8px; letter-spacing: -0.02em;">Pasta Oficial do Projeto no Google Drive</h3>
        <p style="color: #888; font-size: 13px; max-width: 480px; margin: 0 auto 20px; line-height: 1.5;">
          Os arquivos brutos (raw footage) e os renders finais deste trabalho são armazenados e sincronizados com segurança no Google Drive da agência.
        </p>
        <a href="${driveUrl}" target="_blank" rel="noopener noreferrer" class="button primary" style="text-decoration: none; display: inline-flex; padding: 14px 24px; font-size: 12px; font-weight: 600;">
          Abrir Pasta no Google Drive ↗
        </a>
      </div>
    `;

    // Dropzone direciona para o Drive também:
    const dropzone = document.getElementById('dropzone');
    if (dropzone) {
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

function formatBytes(bytes, decimals = 2) {
  if (!+bytes) return '0 Bytes';
  const k = 1024, dm = decimals < 0 ? 0 : decimals, sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}
