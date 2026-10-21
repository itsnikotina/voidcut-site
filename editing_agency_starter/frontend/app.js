let API_URL = '';
let SUPABASE_URL = '';
let SUPABASE_KEY = '';
const STORAGE='voidcut_demo_v1';
const DEFAULT_PASSWORD='12b647ç8';

async function supabaseRequest(endpoint, options = {}){
  if(!SUPABASE_URL || !SUPABASE_KEY) return null;
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
    ...(options.headers || {})
  };
  const res = await fetch(`${SUPABASE_URL}/rest/v1${endpoint}`, {
    ...options,
    headers
  });
  if(!res.ok){
    const text = await res.text();
    throw new Error(text || `Supabase error ${res.status}`);
  }
  return res.json();
}

async function getData(){
  // 1. Supabase nativo em nuvem (Prioridade máxima para acesso direto na Vercel)
  if(SUPABASE_URL && SUPABASE_KEY){
    try {
      const [projects, leads, editors] = await Promise.all([
        supabaseRequest('/jobs?select=*,client:client_id(name),editor:editor_id(name)&order=id.desc'),
        supabaseRequest('/users?role=eq.client&order=name.asc'),
        supabaseRequest('/users?role=eq.editor&order=name.asc')
      ]);
      const normalizedProjects = (projects || []).map(p => ({
        ...p,
        client_name: p.client?.name || p.client_name || null,
        editor_name: p.editor?.name || p.editor_name || null
      }));
      return { projects: normalizedProjects, leads: leads || [], editors: editors || [], notes: '' };
    } catch (e) {
      console.error('Supabase fetch failed, falling back to local API:', e);
    }
  }

  // 2. Fallback para API FastAPI local
  try {
    const [jobsRes, clientsRes, editorsRes] = await Promise.all([
      fetch(`${API_URL}/jobs`),
      fetch(`${API_URL}/users?role=client`),
      fetch(`${API_URL}/users?role=editor`)
    ]);
    const projects = await jobsRes.json();
    const leads = await clientsRes.json();
    const editors = await editorsRes.json();
    return { projects, leads, editors, notes: '' };
  } catch (e) {
    console.error('API not running, falling back to empty state.', e);
    return { projects: [], leads: [], editors: [], notes: '' };
  }
}
async function saveData(d){
  // In a real app we'd send POST/PUT requests to the API. 
  // For now this prevents errors when the UI tries to save local state.
  console.log('Would save to API:', d);
}
function $(s){return document.querySelector(s)}
function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}

document.addEventListener('DOMContentLoaded',()=>{
  const path=location.pathname.split('/').pop()||'index.html';
  if(path==='dashboard.html') initDashboard(); else initLanding();
});

function initLanding(){
  const modal=$('#loginModal');
  $('#teamBtn')?.addEventListener('click',()=>modal.classList.remove('hidden'));
  document.querySelectorAll('[data-close]').forEach(x=>x.addEventListener('click',()=>x.closest('.modal').classList.add('hidden')));
  $('#loginBtn')?.addEventListener('click',()=>{
    const pass=$('#teamPassword').value;
    if(pass===DEFAULT_PASSWORD){sessionStorage.setItem('voidcut_auth','1');location.href='dashboard.html'}
    else $('#loginError').textContent='Wrong password.';
  });
  $('#teamPassword')?.addEventListener('keydown',e=>{if(e.key==='Enter')$('#loginBtn').click()});
  const mobileNav = $('#mobileNav');
  $('#menuBtn')?.addEventListener('click',()=>{
    const open = mobileNav?.classList.toggle('open');
    $('#menuBtn').textContent = open ? '✕' : '☰';
  });
  // Close mobile nav on link click
  document.querySelectorAll('#mobileNav a').forEach(a => a.addEventListener('click', () => {
    mobileNav?.classList.remove('open');
    $('#menuBtn').textContent = '☰';
  }));
  loadConfig();
  loadPortfolio();
}

async function loadConfig(){
  try {
    const res = await fetch('config.json');
    if(res.ok){
      const cfg = await res.json();
      if(cfg.discord_invite){
        document.querySelectorAll('[data-discord-link]').forEach(a => {
          a.href = cfg.discord_invite;
        });
      }
      if(cfg.api_url){
        API_URL = cfg.api_url.replace(/\/$/, '');
      }
      if(cfg.supabase_url){
        SUPABASE_URL = cfg.supabase_url.replace(/\/$/, '');
      }
      if(cfg.supabase_key){
        SUPABASE_KEY = cfg.supabase_key;
      }
    }
  } catch(e) {
    // Mantém o link do HTML
  }
}

function getClientInitials(name){
  if(!name) return 'VC';
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if(parts.length >= 2){
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.trim().slice(0, 2).toUpperCase();
}

function extractYouTubeId(url){
  if(!url) return '';
  const m = String(url).match(/(?:v=|\/embed\/|\/shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : '';
}

function renderClientAvatar(client){
  const name = client.client || client.name || 'Creator';
  const initials = getClientInitials(name);
  const avatarUrl = (client.avatar_url || '').trim();

  if(!avatarUrl){
    return `<div class="client-avatar-wrapper"><div class="client-avatar-fallback">${esc(initials)}</div></div>`;
  }

  return `
    <div class="client-avatar-wrapper">
      <img src="${esc(avatarUrl)}" alt="${esc(name)}" class="client-avatar-img"
        onerror="this.onerror=null; this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='flex';"
        loading="lazy" />
      <div class="client-avatar-fallback" style="display:none;">${esc(initials)}</div>
    </div>
  `;
}

async function loadPortfolio(){
  const container = $('#portfolioContainer');
  if(!container) return;
  try {
    let res = await fetch('/api/portfolio');
    if(!res.ok) res = await fetch('portfolio.json');
    if(!res.ok) throw new Error('Could not load portfolio data');
    const clients = await res.json();
    if(!clients.length){
      container.innerHTML = '<div style="padding:40px 0;color:#777;font:12px \'DM Mono\';">NO WORK FOUND.</div>';
      return;
    }

    container.innerHTML = clients.map((c, idx) => {
      const clientName = esc(c.client || c.name || 'Creator');
      const category = esc(c.category || '');
      const handle = esc(c.handle || '');
      const channelUrl = (c.channel_url || c.channel || '').trim();
      const workType = c.type || c.work_type || 'Style Reference';
      const isReference = /reference|benchmark/i.test(workType);

      const metaParts = [];
      if(category) metaParts.push(category);
      if(handle) metaParts.push(handle);
      const subMeta = metaParts.join(' • ');

      const badgeHtml = workType 
        ? `<span class="client-type-badge ${isReference ? 'reference' : ''}">${esc(workType)}</span>` 
        : '';

      const videos = Array.isArray(c.videos) ? c.videos : [];

      return `
        <div class="client-portfolio-group" style="${idx > 0 ? 'margin-top: 60px; padding-top: 60px; border-top: 1px solid var(--line);' : ''}">
          <div class="client-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:20px; margin-bottom: 30px; background: #101010; border: 1px solid var(--line); padding: 18px 24px;">
            <div style="display:flex; align-items:center; gap:16px;">
              ${renderClientAvatar(c)}
              <div>
                <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                  <h3 style="margin:0; font-size:22px; font-weight:700; letter-spacing:-0.03em; color:#fff;">${clientName}</h3>
                  ${badgeHtml}
                </div>
                ${subMeta ? `<div style="font: 11px 'DM Mono'; color:#777; margin-top:4px;">${subMeta}</div>` : ''}
              </div>
            </div>
            ${channelUrl ? `<a href="${esc(channelUrl)}" target="_blank" rel="noopener noreferrer" class="ghost-btn" style="font:11px 'DM Mono'; text-transform:uppercase; display:inline-flex; align-items:center; gap:6px;">Visit Channel ↗</a>` : ''}
          </div>

          <div class="portfolio-video-grid" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px;">
            ${videos.map(v => {
              const videoId = (v.id || extractYouTubeId(v.url) || '').trim();
              const videoTitle = esc(v.title || 'YouTube Video');
              const videoTag = esc(v.tag || v.category || 'EDIT');
              const videoUrl = (v.url || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : '#')).trim();

              return `
                <article class="work-card" style="background:#101010; border:1px solid var(--line); display:flex; flex-direction:column; overflow:hidden;">
                  <div class="video-embed-wrapper" style="position:relative; width:100%; padding-bottom:56.25%; background:#050505;">
                    ${videoId ? `
                      <iframe 
                        src="https://www.youtube-nocookie.com/embed/${esc(videoId)}" 
                        title="${videoTitle}" 
                        style="position:absolute; top:0; left:0; width:100%; height:100%; border:0;" 
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                        allowfullscreen
                        loading="lazy">
                      </iframe>
                    ` : `
                      <div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; color:#555; font:11px 'DM Mono';">
                        VIDEO EMBED NOT AVAILABLE
                      </div>
                    `}
                  </div>
                  <div class="work-info" style="padding:16px; border-top:1px solid var(--line); display:flex; flex-direction:column; gap:8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
                      <span style="color:var(--acid); font:500 10px 'DM Mono'; text-transform:uppercase;">${videoTag}</span>
                      ${videoUrl && videoUrl !== '#' ? `
                        <a href="${esc(videoUrl)}" target="_blank" rel="noopener noreferrer" style="font:10px 'DM Mono'; color:#777; text-decoration:none;" onmouseover="this.style.color='var(--acid)'" onmouseout="this.style.color='#777'">YouTube ↗</a>
                      ` : ''}
                    </div>
                    <b style="font-size:14px; font-weight:600; line-height:1.4; color:#eee; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;" title="${videoTitle}">${videoTitle}</b>
                  </div>
                </article>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }).join('');
  } catch(e) {
    console.error('Error loading portfolio:', e);
    container.innerHTML = '<div style="padding:40px 0;color:var(--red);font:12px \'DM Mono\';">FAILED TO LOAD PORTFOLIO VIDEOS.</div>';
  }
}

async function initDashboard(){
  if(sessionStorage.getItem('voidcut_auth')!=='1'){location.href='index.html';return}
  await loadConfig();
  const dateStr = new Date().toLocaleDateString('pt-BR', {day:'2-digit', month:'short', year:'numeric'}).toUpperCase();
  if($('#dashDate')) $('#dashDate').textContent = dateStr;
  $('#logoutBtn')?.addEventListener('click', ()=>{sessionStorage.removeItem('voidcut_auth');location.href='index.html'});
  $('#refreshBtn')?.addEventListener('click', renderDash);
  $('#addProject')?.addEventListener('click', ()=>openForm('project'));
  await renderDash();
}

async function renderDash(){
  const d = await getData();
  const clientMap = Object.fromEntries((d.leads || []).map(c => [c.id, c.name]));
  const editorMap = Object.fromEntries((d.editors || []).map(e => [e.id, e.name]));

  const projects = d.projects || [];
  const activeProjects = projects.filter(p => p.status !== 'Completed' && p.status !== 'Deleted');
  const reviewProjects = projects.filter(p => p.status === 'Pending Review');
  const completedProjects = projects.filter(p => p.status === 'Completed');
  const availableEditors = (d.editors || []).filter(e => (e.status || 'Available') === 'Available');

  const pipelineValue = activeProjects.reduce((acc, p) => acc + Number(p.client_price || p.value || 0), 0);
  const editorCost = activeProjects.reduce((acc, p) => acc + Number(p.editor_price || 0), 0);
  const margin = pipelineValue - editorCost;

  if($('#statProjects')) $('#statProjects').textContent = activeProjects.length;
  if($('#statProjectsSub')) $('#statProjectsSub').textContent = `${completedProjects.length} concluído(s)`;
  if($('#statReview')) $('#statReview').textContent = reviewProjects.length;
  if($('#statEditors')) $('#statEditors').textContent = (d.editors || []).length;
  if($('#statEditorsSub')) $('#statEditorsSub').textContent = `${availableEditors.length} disponível(is)`;
  if($('#statValue')) $('#statValue').textContent = '$' + pipelineValue.toLocaleString();
  if($('#statMarginSub')) $('#statMarginSub').textContent = editorCost > 0 ? `Margem estimada: +$${margin.toLocaleString()}` : 'Total em produção';

  if($('#projectsCount')) $('#projectsCount').textContent = `${projects.length} trabalhos`;
  if($('#clientsCount')) $('#clientsCount').textContent = (d.leads || []).length;
  if($('#editorsCount')) $('#editorsCount').textContent = (d.editors || []).length;

  renderProjects(projects, clientMap, editorMap);
  renderClients(d.leads || []);
  renderEditors(d.editors || []);
}

function renderProjects(items, clientMap, editorMap){
  const el = $('#projectList');
  if(!el) return;
  if(!items.length){
    el.innerHTML = '<div class="empty">NENHUM PROJETO CADASTRADO NO MOMENTO. CLIQUE EM "+ NOVO PROJETO" ACIMA.</div>';
    return;
  }

  el.innerHTML = items.map(p => {
    const title = esc(p.title || p.name || 'Sem título');
    const client = esc(p.client_name || clientMap[p.client_id] || (p.client_id ? `Cliente #${p.client_id}` : 'Cliente não informado'));
    const editor = esc(p.editor_name || editorMap[p.editor_id] || (p.editor_id ? `Editor #${p.editor_id}` : 'Não atribuído'));
    const service = esc(p.service || 'Edição');
    const deadline = p.deadline ? `<span>📅 Prazo: <strong>${esc(p.deadline)}</strong></span>` : '';
    
    const clientPrice = Number(p.client_price || p.value || 0);
    const editorPrice = Number(p.editor_price || 0);
    const margin = clientPrice - editorPrice;

    const status = p.status || 'New';
    let statusClass = 'status-new';
    let statusLabel = status;
    if(status === 'Editing') { statusClass = 'status-editing'; statusLabel = '✂️ Em Edição'; }
    else if(status === 'Pending Review') { statusClass = 'status-review'; statusLabel = '⏳ Aguardando Revisão'; }
    else if(status === 'Completed') { statusClass = 'status-completed'; statusLabel = '✓ Concluído'; }

    let actionButtons = '';
    if(status === 'Pending Review'){
      actionButtons += `<button class="approve-btn" data-approve="${p.id}" title="Aprovar entrega do editor">✓ Aprovar</button>`;
    }

    if(p.access_token){
      actionButtons += `<a href="files.html?job_id=${p.id}&token=${p.access_token}" target="_blank" rel="noopener" class="portal-link" title="Abrir portal de arquivos brutos e renders">📂 Arquivos ↗</a>`;
    }

    actionButtons += `<button class="icon-btn" data-delete="project:${p.id}" title="Excluir projeto">×</button>`;

    return `
      <div class="project-card-row">
        <div class="project-main-info">
          <div class="project-title-bar">
            <b>${title}</b>
            <span class="service-tag">${service}</span>
          </div>
          <div class="project-meta-line">
            <span>👤 Cliente: <strong>${client}</strong></span>
            <span>✂️ Editor: <strong>${editor}</strong></span>
            ${deadline}
          </div>
        </div>
        <div class="project-side-info">
          <div class="project-finance">
            <div class="project-price">$${clientPrice.toLocaleString()}</div>
            ${editorPrice > 0 ? `<small class="project-margin">Margem: +$${margin.toLocaleString()}</small>` : ''}
          </div>
          <span class="status-pill ${statusClass}">${statusLabel}</span>
          ${actionButtons}
        </div>
      </div>
    `;
  }).join('');

  // Event handlers for project actions
  el.querySelectorAll('[data-approve]').forEach(btn => {
    btn.onclick = async () => {
      const jobId = btn.dataset.approve;
      try {
        if(SUPABASE_URL && SUPABASE_KEY){
          await supabaseRequest(`/jobs?id=eq.${jobId}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'Completed' })
          });
        } else {
          await fetch(`${API_URL}/jobs/${jobId}/status`, {
            method: 'PATCH',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ status: 'Completed' })
          });
        }
        await renderDash();
      } catch(e) {
        alert('Erro ao atualizar status do projeto');
      }
    };
  });

  el.querySelectorAll('[data-delete]').forEach(btn => {
    btn.onclick = async () => {
      const [, id] = btn.dataset.delete.split(':');
      if (confirm('Tem certeza que deseja excluir este projeto?')) {
        try {
          if(SUPABASE_URL && SUPABASE_KEY){
            await supabaseRequest(`/jobs?id=eq.${id}`, { method: 'DELETE' });
          } else {
            await fetch(`${API_URL}/jobs/${id}`, { method: 'DELETE' });
          }
          await renderDash();
        } catch (e) {
          alert('Erro ao excluir projeto');
        }
      }
    };
  });
}

function renderClients(items){
  const el = $('#leadList');
  if(!el) return;
  if(!items.length){
    el.innerHTML = '<div class="empty">NENHUM CLIENTE CADASTRADO NO DISCORD.</div>';
    return;
  }
  el.innerHTML = items.map(c => `
    <div class="row">
      <div>
        <b>${esc(c.name)}</b>
        <small>Discord ID: ${esc(c.discord_id || 'Sincronizado')}</small>
      </div>
      <div class="row-actions">
        <span class="pill active">Cliente</span>
      </div>
    </div>
  `).join('');
}

function renderEditors(items){
  const el = $('#editorList');
  if(!el) return;
  if(!items.length){
    el.innerHTML = '<div class="empty">NENHUM EDITOR CADASTRADO NO DISCORD.</div>';
    return;
  }
  el.innerHTML = items.map(e => `
    <div class="row">
      <div>
        <b>${esc(e.name)}</b>
        <small>Especialidade: ${esc(e.specialties || 'Edição Geral')}</small>
      </div>
      <div class="row-actions">
        <span class="pill ${e.status === 'Available' ? 'active' : ''}">${esc(e.status || 'Disponível')}</span>
      </div>
    </div>
  `).join('');
}

async function openForm(type){
  const modal = $('#dashModal'), fields = $('#modalFields');
  const d = await getData();

  if (type === 'project') {
    const hasClients = (d.leads || []).length > 0;
    const hasEditors = (d.editors || []).length > 0;

    let clientFieldHtml = '';
    if(hasClients){
      const clientOpts = d.leads.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
      clientFieldHtml = `<div class="field"><label>Cliente *<select id="f2">${clientOpts}</select></label></div>`;
    } else {
      clientFieldHtml = `<div class="field"><label>Novo Cliente *<input id="f2_new" required placeholder="Nome do criador (ex: Trickywi)"></label></div>`;
    }

    let editorFieldHtml = '';
    if(hasEditors){
      const editorOpts = d.editors.map(e => `<option value="${e.id}">${esc(e.name)}</option>`).join('');
      editorFieldHtml = `<div class="field"><label>Editor Responsável *<select id="f3">${editorOpts}</select></label></div>`;
    } else {
      editorFieldHtml = `<div class="field"><label>Editor Responsável *<input id="f3_new" required placeholder="Nome do editor (ex: John Doe)"></label></div>`;
    }

    const html = `
      <div class="field"><label>Título do Projeto / Vídeo *<input id="f1" required placeholder="ex: Episódio 10 - Minecraft Hardcore"></label></div>
      <div class="form-grid-2">
        ${clientFieldHtml}
        ${editorFieldHtml}
      </div>
      <div class="form-grid-2">
        <div class="field"><label>Tipo de Serviço<input id="f4" placeholder="ex: YouTube Long-form, Shorts, VFX"></label></div>
        <div class="field"><label>Prazo / Deadline<input id="f5" placeholder="ex: 28/10/2026"></label></div>
      </div>
      <div class="form-grid-2">
        <div class="field"><label>Valor do Cliente (USD) *<input id="f6" type="number" step="any" placeholder="300"></label></div>
        <div class="field"><label>Custo do Editor (USD)<input id="f7" type="number" step="any" placeholder="180 (opcional)"></label></div>
      </div>
      <div class="field"><label>Briefing / Instruções para o Editor<textarea id="f8" rows="3" placeholder="Instruções de corte, estilo, músicas, referências..."></textarea></label></div>
    `;
    $('#modalTitle').textContent = 'NOVO PROJETO';
    fields.innerHTML = html;
  }
  
  modal.classList.remove('hidden');
  
  $('#modalSave').onclick = async () => {
    if(type === 'project') {
      const title = $('#f1').value.trim();
      if(!title) { alert('Informe o título do projeto.'); return; }

      let clientId = $('#f2') ? parseInt($('#f2').value) : null;
      let editorId = $('#f3') ? parseInt($('#f3').value) : null;

      // Se for novo cliente digitado manualmente:
      if(!clientId && $('#f2_new')) {
        const clientName = $('#f2_new').value.trim();
        if(!clientName) { alert('Informe o nome do cliente.'); return; }
        if(SUPABASE_URL && SUPABASE_KEY){
          try {
            const res = await supabaseRequest('/users', {
              method: 'POST',
              body: JSON.stringify({ name: clientName, role: 'client' })
            });
            if(res && res[0]) clientId = res[0].id;
          } catch(e) {
            console.error('Erro ao criar cliente:', e);
          }
        }
      }

      // Se for novo editor digitado manualmente:
      if(!editorId && $('#f3_new')) {
        const editorName = $('#f3_new').value.trim();
        if(!editorName) { alert('Informe o nome do editor.'); return; }
        if(SUPABASE_URL && SUPABASE_KEY){
          try {
            const res = await supabaseRequest('/users', {
              method: 'POST',
              body: JSON.stringify({ name: editorName, role: 'editor', specialties: 'Edição Geral' })
            });
            if(res && res[0]) editorId = res[0].id;
          } catch(e) {
            console.error('Erro ao criar editor:', e);
          }
        }
      }

      const payload = {
        title: title,
        client_id: clientId || null,
        editor_id: editorId || null,
        service: $('#f4').value || 'Edição',
        deadline: $('#f5').value || null,
        client_price: Number($('#f6').value || 0),
        editor_price: Number($('#f7').value || 0),
        description: $('#f8').value || '',
        status: 'New',
        access_token: Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10)
      };
      
      try {
        if(SUPABASE_URL && SUPABASE_KEY){
          await supabaseRequest('/jobs', {
            method: 'POST',
            body: JSON.stringify(payload)
          });
        } else {
          const res = await fetch(`${API_URL}/jobs/create_from_panel`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
          });
          if(!res.ok) throw new Error('Falha na resposta da API');
        }
        modal.classList.add('hidden');
        await renderDash();
      } catch(e) {
        console.error(e);
        alert('Erro ao salvar projeto.');
      }
    }
  };
  modal.querySelectorAll('[data-close]').forEach(btn => btn.onclick = () => modal.classList.add('hidden'));
}
