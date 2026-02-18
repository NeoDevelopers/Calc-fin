let currentUser = '';
let orders = [];
let currentEditId = null;
let currentEditRow = null;
let currentUnit = 'cm';
let globalHidePrice = false;
let userSettings = { ...CONFIG.DEFAULTS };

function showToast(m) {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = 'toast'; t.innerText = m;
  c.appendChild(t); setTimeout(() => t.remove(), 3000);
}

function validateLoginInput() {
  const u = document.getElementById('user-select').value;
  const p = document.getElementById('user-pass').value;
  document.getElementById('login-btn').disabled = !(u && p.length > 0);
}

function handleLogin() {
  const u = document.getElementById('user-select').value;
  const p = document.getElementById('user-pass').value;
  const f = document.getElementById('user-pass');
  if (CONFIG.PASSWORDS[u] === p) {
    currentUser = u;
    document.getElementById('login-screen').classList.remove('show');
    if(u === 'Владелец' || u === 'Екатерина') {
        document.getElementById('admin-settings-btn').style.display = 'block';
        loadLocalSettings();
    }
    u === 'Рома' || u === 'Дима' ? setTab('queue') : setTab('calc');
    loadData();
    showToast(`Вход: ${u}`);
  } else {
    f.classList.add('shake'); setTimeout(() => f.classList.remove('shake'), 300);
    f.value = ''; validateLoginInput(); showToast("Неверный пароль");
  }
}

function logout() {
  currentUser = '';
  document.getElementById('login-screen').classList.add('show');
  document.getElementById('admin-settings-btn').style.display = 'none';
  document.getElementById('settings-panel').classList.remove('show');
  document.getElementById('user-pass').value = '';
  validateLoginInput(); setTab('calc');
}

function setUnit(u) {
  currentUnit = u;
  document.getElementById('unit-cm').classList.toggle('active', u === 'cm');
  document.getElementById('unit-mm').classList.toggle('active', u === 'mm');
  document.getElementById('unit-label-width').innerText = `(${u})`;
  document.getElementById('unit-label-height').innerText = `(${u})`;
  calc();
}

function stepSheets(v) {
  const i = document.getElementById('c-s');
  i.value = Math.max(0.1, (parseFloat(i.value || 0) + v)).toFixed(1);
  calc();
}

// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ УМНОЙ ФОРМУЛЫ
function clamp01(x) { return Math.max(0, Math.min(1, x)); }
function lerp(a, b, t) { return a + (b - a) * t; }

function calc() {
  const rawW = parseFloat(document.getElementById('c-w').value) || 0;
  const rawH = parseFloat(document.getElementById('c-h').value) || 0;
  const sheets = parseFloat(document.getElementById('c-s').value) || 0;
  const film = document.getElementById('c-film').checked;
  const light = document.getElementById('c-light').checked;
  const complex = document.getElementById('c-complex').checked;

  if (rawW <= 0 || rawH <= 0) {
    document.getElementById('price-display').innerText = "0 ₽";
    document.getElementById('order-btn-ui').style.display = "none";
    updatePreview(0, 0); return 0;
  }

  const w_m = currentUnit === 'mm' ? rawW / 1000 : rawW / 100;
  const h_m = currentUnit === 'mm' ? rawH / 1000 : rawH / 100;
  const area = w_m * h_m;

  // 1. Плавная маржа (от 1м² до 3м²)
  const tMargin = clamp01((area - 1.0) / (3.0 - 1.0));
  const margin = lerp(userSettings.marginSmall, userSettings.marginLarge, tMargin);

  // 2. Скидка на основу (от 1м² до 3м²)
  const baseDisc = clamp01((area - 1.0) / (3.0 - 1.0)) * (userSettings.baseDiscMaxPct / 100);
  const baseMatEff = userSettings.baseMat * (1 - baseDisc);

  // 3. Скидка на акрил (от 2 до 5 листов)
  const tAcrylic = clamp01((sheets - 2.0) / (5.0 - 2.0));
  const acrylicDisc = tAcrylic * (userSettings.acrylicDiscMaxPct / 100);
  const acrylicSheetEff = userSettings.acrylicSheet * (1 - acrylicDisc);

  // РАСЧЕТ СЕБЕСТОИМОСТИ
  const baseCost = area * baseMatEff;
  const acrylicCost = sheets * acrylicSheetEff;
  let filmCost = film ? acrylicCost * 0.3 : 0;
  
  const totalMat = baseCost + acrylicCost + filmCost;
  const prodCost = totalMat * userSettings.laborMult;
  const overhead = (area * userSettings.overheadPerM2) + userSettings.setupFix;
  
  // ИТОГОВАЯ ЦЕНА
  let finalPrice = (prodCost + overhead) * margin;
  if (light) finalPrice += userSettings.lightFix + (area * userSettings.lightM2);
  if (complex) finalPrice *= userSettings.complexMult;

  finalPrice = Math.round(finalPrice / 100) * 100;
  document.getElementById('price-display').innerText = finalPrice.toLocaleString() + " ₽";
  document.getElementById('order-btn-ui').style.display = "block";
  
  updatePreview(rawW, rawH);
  return finalPrice;
}

function updatePreview(w, h) {
  const b = document.getElementById('preview-box');
  const mounts = document.getElementById('mount-info');
  if (w <= 0 || h <= 0) { b.style.width = "0px"; b.style.height = "0px"; mounts.innerHTML = ""; return; }
  const max = 100; const ratio = w / h;
  let pW, pH;
  if (ratio > 1) { pW = max; pH = max / ratio; } else { pH = max; pW = max * ratio; }
  b.style.width = pW + "px"; b.style.height = pH + "px";
  document.getElementById('dim-w-label').innerText = w;
  document.getElementById('dim-h-label').innerText = h;
  const w_cm = currentUnit === 'mm' ? w / 10 : w;
  const h_cm = currentUnit === 'mm' ? h / 10 : h;
  const segX = Math.max(1, Math.ceil(w_cm / 75));
  const segY = Math.max(1, Math.ceil(h_cm / 75));
  const total = (segX + 1) * 2 + (segY - 1) * 2;
  b.querySelectorAll('.mount-hole').forEach(e => e.remove());
  for(let i=0; i<=segX; i++) { createHole(i/segX*100, 0, b); createHole(i/segX*100, 100, b); }
  for(let i=1; i<segY; i++) { createHole(0, i/segY*100, b); createHole(100, i/segY*100, b); }
  mounts.innerHTML = `Держателей: <b>${total} шт</b>`;
}

function createHole(l, t, p) {
  const h = document.createElement('div'); h.className = 'mount-hole';
  h.style.left = l + '%'; h.style.top = t + '%'; p.appendChild(h);
}

function toggleSettingsPanel() { document.getElementById('settings-panel').classList.toggle('show'); }

function loadLocalSettings() {
  const saved = localStorage.getItem('laser_settings');
  if(saved) userSettings = JSON.parse(saved);
  document.getElementById('s-base').value = userSettings.baseMat;
  document.getElementById('s-acrylic').value = userSettings.acrylicSheet;
  document.getElementById('s-labor').value = userSettings.laborMult;
  document.getElementById('s-overhead').value = userSettings.overheadPerM2;
  document.getElementById('s-setup').value = userSettings.setupFix;
  document.getElementById('s-m-small').value = userSettings.marginSmall;
  document.getElementById('s-m-large').value = userSettings.marginLarge;
  document.getElementById('s-acrylic-disc').value = userSettings.acrylicDiscMaxPct;
  document.getElementById('s-base-disc').value = userSettings.baseDiscMaxPct;
  document.getElementById('s-film').value = userSettings.filmMult;
  document.getElementById('s-complex').value = userSettings.complexMult;
  document.getElementById('s-light-fix').value = userSettings.lightFix;
  document.getElementById('s-light-m2').value = userSettings.lightM2;
}

function saveAdminSettings() {
  userSettings.baseMat = parseFloat(document.getElementById('s-base').value || 0);
  userSettings.acrylicSheet = parseFloat(document.getElementById('s-acrylic').value || 0);
  userSettings.laborMult = parseFloat(document.getElementById('s-labor').value || 0);
  userSettings.overheadPerM2 = parseFloat(document.getElementById('s-overhead').value || 0);
  userSettings.setupFix = parseFloat(document.getElementById('s-setup').value || 0);
  userSettings.marginSmall = parseFloat(document.getElementById('s-m-small').value || 0);
  userSettings.marginLarge = parseFloat(document.getElementById('s-m-large').value || 0);
  userSettings.acrylicDiscMaxPct = parseFloat(document.getElementById('s-acrylic-disc').value || 0);
  userSettings.baseDiscMaxPct = parseFloat(document.getElementById('s-base-disc').value || 0);
  userSettings.filmMult = parseFloat(document.getElementById('s-film').value || 0);
  userSettings.complexMult = parseFloat(document.getElementById('s-complex').value || 0);
  userSettings.lightFix = parseFloat(document.getElementById('s-light-fix').value || 0);
  userSettings.lightM2 = parseFloat(document.getElementById('s-light-m2').value || 0);
  localStorage.setItem('laser_settings', JSON.stringify(userSettings));
  calc();
}

function resetToDefaults() {
  if(confirm("Сбросить?")) { userSettings = { ...CONFIG.DEFAULTS }; localStorage.removeItem('laser_settings'); loadLocalSettings(); calc(); }
}

async function loadData() {
  try {
    const r = await fetch(CONFIG.WEB_APP_URL);
    const d = await r.json();
    orders = d.orders;
    globalHidePrice = !d.settings.showPrice;
    document.getElementById('sett-price').checked = globalHidePrice;
    renderOrders();
  } catch(e) { showToast("Ошибка данных"); }
}

async function updateGlobalPriceSetting() {
  const hide = document.getElementById('sett-price').checked;
  await fetch(CONFIG.WEB_APP_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify({ action: 'updateSettings', showPrice: !hide }) });
  globalHidePrice = hide; renderOrders();
}

function renderOrders() {
  const q = document.getElementById('queue-list'); const a = document.getElementById('history-list');
  if(!q || !a) return;
  q.innerHTML = ''; a.innerHTML = '';
  orders.forEach(o => {
    const isDone = o.status === 'Отправлен';
    const hide = (currentUser === 'Рома' || currentUser === 'Дима') && globalHidePrice;
    const debt = (o.price - (o.paid || 0));
    const photo = getDriveDirectLink(o.photo);
    const card = document.createElement('div');
    card.className = 'order-card';
    card.innerHTML = `
      <div class="order-header">
        <div><b>№${o.id} ${o.client}</b><div style="font-size:10px; color:var(--blue)">${o.manager || ''}</div></div>
        ${photo ? `<img src="${photo}" class="thumb" onclick="window.open('${o.photo}')">` : ''}
      </div>
      <div style="font-size:12px; color:var(--hint)">${o.phone} | ${o.date.split(',')[0]} <span class="status-badge">${o.status}</span></div>
      <div style="display:flex; justify-content:space-between; margin-top:10px; font-weight:700;">
        <span>${hide ? '***' : o.price + ' ₽'}</span>
        <span style="color:${debt>0?'var(--red)':'var(--green)'}">${hide ? '---' : (debt>0 ? 'Долг: '+debt : 'Оплачено')}</span>
      </div>
      <button class="btn-action" onclick="openEdit(${o.id})">Управление</button>
    `;
    isDone ? a.appendChild(card) : q.appendChild(card);
  });
}

function openOrderModal() { document.getElementById('modal-new').classList.add('show'); }
function closeModals() { document.querySelectorAll('.modal').forEach(m => { if(m.id !== 'login-screen') m.classList.remove('show'); }); }

async function submitOrder() {
  const title = document.getElementById('n-client').value;
  if(!title) return showToast("Введите название!");
  const btn = document.getElementById('btn-submit'); btn.innerText = "..."; btn.disabled = true;
  const p1 = await toBase64(document.getElementById('n-photo').files[0]);
  const p2 = await toBase64(document.getElementById('n-layout').files[0]);
  const data = {
    id: Math.floor(Math.random()*9000)+1000, title: title,
    contact: document.getElementById('n-phone').value, price: calc(), paid: 0,
    desc: document.getElementById('n-desc').value, manager: currentUser,
    photoFile: p1, layoutFile: p2
  };
  await fetch(CONFIG.WEB_APP_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify(data) });
  closeModals(); loadData(); btn.innerText = "🚀 Отправить в работу"; btn.disabled = false;
  showToast("Заказ создан");
}

function openEdit(id) {
  const o = orders.find(x => x.id == id);
  currentEditId = id; currentEditRow = o.rowIndex;
  document.getElementById('edit-id-title').innerText = `Заказ №${id}`;
  document.getElementById('e-status').value = o.status;
  document.getElementById('modal-edit').classList.add('show');
  checkStatusReq();
}

function checkStatusReq() {
  const v = document.getElementById('e-status').value;
  document.getElementById('finish-reqs').style.display = v === 'Отправлен' ? 'block' : 'none';
}

async function updateOrder() {
  const s = document.getElementById('e-status').value;
  const tk = document.getElementById('e-tk').value;
  const ph = await toBase64(document.getElementById('e-photo').files[0]);
  const add = parseFloat(document.getElementById('e-paid-add').value) || 0;
  const o = orders.find(x => x.id == currentEditId);
  if(s === 'Отправлен' && (!tk || !ph)) return showToast("Нужно фото готового и ТК!");
  const btn = document.getElementById('btn-update'); btn.innerText = "..."; btn.disabled = true;
  await fetch(CONFIG.WEB_APP_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify({ action: 'updateOrder', id: currentEditId, rowIndex: currentEditRow, status: s, tk: tk, paid: (parseFloat(o.paid||0)+add), photo: ph }) });
  closeModals(); setTimeout(loadData, 2000); btn.innerText = "💾 Сохранить"; btn.disabled = false;
  showToast("Обновлено");
}

function setTab(t) {
  document.querySelectorAll('.tab').forEach(x => x.style.display = 'none');
  document.querySelectorAll('.nav-btn').forEach(x => x.classList.remove('active'));
  document.getElementById('tab-'+t).style.display = 'block';
  const b = document.getElementById('nav-'+t);
  if(b) b.classList.add('active');
  if(t !== 'calc') loadData();
}

function updateFileLabel(i, l) { if(i.files[0]) { const el = document.getElementById(l); el.classList.add('active'); el.querySelector('span').innerText = "✅ " + i.files[0].name.substring(0,10); } }
function getDriveDirectLink(u) { if(!u) return ''; const m = u.match(/id=([a-zA-Z0-9_-]{25,})/) || u.match(/\/d\/([a-zA-Z0-9_-]{25,})/); return m ? `https://drive.google.com/uc?export=view&id=${m[1]}` : u; }
const toBase64 = f => !f ? null : new Promise((r,j)=>{const d=new FileReader();d.readAsDataURL(f);d.onload=()=>r(d.result);});
window.onload = () => { calc(); };