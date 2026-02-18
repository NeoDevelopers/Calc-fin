let currentUser = '';
let orders = [];
let currentEditId = null;
let currentEditRow = null;
let currentUnit = 'cm';
let globalHidePrice = false;
let userSettings = { ...CONFIG.DEFAULTS };
let selectedDelivery = { type: '', track: '' };
let currentStatusEditId = null;
let isStatusSaving = false;

function showToast(message) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerText = message;
    container.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 3000);
}

function clamp01(value) { return Math.max(0, Math.min(1, value)); }
function lerp(a, b, t) { return a + (b - a) * t; }

function formatMoscowDate(dateStr) {
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;
        return date.toLocaleString('ru-RU', {
            timeZone: 'Europe/Moscow',
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        }).replace(',', '');
    } catch (e) { return dateStr; }
}

function toBase64(file) {
    return new Promise((resolve, reject) => {
        if (!file) { resolve(null); return; }
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

function getDriveDirectLink(url) {
    if (!url || typeof url !== 'string') return '';
    // Для кнопок оставляем ссылку как есть, чтобы открывалась в новой вкладке
    return url;
}

function updateFileLabel(input, labelId) {
    if (input.files && input.files[0]) {
        const label = document.getElementById(labelId);
        label.classList.add('active');
        const span = label.querySelector('span');
        if (span) span.innerText = "✅ " + input.files[0].name.substring(0, 15) + "...";
    }
}

// === АВТОРИЗАЦИЯ ===
function validateLoginInput() {
    const user = document.getElementById('user-select').value;
    const pass = document.getElementById('user-pass').value;
    const btn = document.getElementById('login-btn');
    if (btn) btn.disabled = !(user && pass.length > 0);
}

function handleLogin() {
    const user = document.getElementById('user-select').value;
    const pass = document.getElementById('user-pass').value;
    const inputField = document.getElementById('user-pass');

    if (CONFIG.PASSWORDS[user] === pass) {
        currentUser = user;
        document.getElementById('login-screen').classList.remove('show');
        
        if (user === 'Владелец' || user === 'Екатерина') {
            document.getElementById('admin-settings-btn').style.display = 'block';
            loadLocalSettings();
        } else {
            document.getElementById('admin-settings-btn').style.display = 'none';
        }

        if (user === 'Рома' || user === 'Дима') {
            setTab('queue');
        } else {
            setTab('calc');
        }
        loadData();
        showToast("Добро пожаловать, " + user + "!");
    } else {
        inputField.classList.add('shake');
        setTimeout(() => inputField.classList.remove('shake'), 300);
        inputField.value = '';
        validateLoginInput();
        showToast("Неверный пароль");
    }
}

function logout() {
    currentUser = '';
    document.getElementById('login-screen').classList.add('show');
    document.getElementById('admin-settings-btn').style.display = 'none';
    document.getElementById('settings-panel').classList.remove('show');
    document.getElementById('user-pass').value = '';
    validateLoginInput();
    setTab('calc');
}

// === КАЛЬКУЛЯТОР ===
function setUnit(unit) {
    currentUnit = unit;
    document.getElementById('unit-cm').classList.toggle('active', unit === 'cm');
    document.getElementById('unit-mm').classList.toggle('active', unit === 'mm');
    document.getElementById('unit-label-width').innerText = "(" + unit + ")";
    document.getElementById('unit-label-height').innerText = "(" + unit + ")";
    calc(); 
}

function stepSheets(value) {
    const input = document.getElementById('c-s');
    let newValue = parseFloat(input.value || 0) + value;
    newValue = Math.max(0.1, newValue);
    input.value = newValue.toFixed(1);
    calc();
}

function calc() {
    const rawW = parseFloat(document.getElementById('c-w').value) || 0;
    const rawH = parseFloat(document.getElementById('c-h').value) || 0;
    const sheets = parseFloat(document.getElementById('c-s').value) || 0;
    
    const film = document.getElementById('c-film').checked;
    const light = document.getElementById('c-light').checked;
    const complex = document.getElementById('c-complex').checked;

    const previewCard = document.getElementById('preview-card');
    const orderBtn = document.getElementById('order-btn-ui');
    const breakdown = document.getElementById('cost-breakdown');

    if ((rawW <= 0 && rawH <= 0) && sheets <= 0) {
        document.getElementById('price-display').innerText = "0 ₽";
        previewCard.classList.remove('show');
        orderBtn.style.display = "none";
        breakdown.style.display = "none";
        return 0;
    }

    if (rawW > 0 && rawH > 0) {
        previewCard.classList.add('show');
        updatePreview(rawW, rawH);
    } else {
        previewCard.classList.remove('show');
    }

    orderBtn.style.display = "block";
    breakdown.style.display = "block";

    const widthInMeters = currentUnit === 'mm' ? rawW / 1000 : rawW / 100;
    const heightInMeters = currentUnit === 'mm' ? rawH / 1000 : rawH / 100;
    const area = widthInMeters * heightInMeters;

    let margin = userSettings.marginSmall;
    if (area > 0) {
        const tArea = clamp01((area - 1.0) / (3.0 - 1.0));
        margin = lerp(userSettings.marginSmall, userSettings.marginLarge, tArea);
    }

    let effectiveBasePrice = userSettings.baseMat;
    if (area > 0) {
        const baseDiscount = clamp01((area - 1.0) / (3.0 - 1.0)) * (userSettings.baseDiscMaxPct / 100);
        effectiveBasePrice = userSettings.baseMat * (1 - baseDiscount);
    }

    const tSheets = clamp01((sheets - 2.0) / (5.0 - 2.0));
    const acrylicDiscount = tSheets * (userSettings.acrylicDiscMaxPct / 100);
    const effectiveAcrylicPrice = userSettings.acrylicSheet * (1 - acrylicDiscount);

    const baseCost = area * effectiveBasePrice;
    const acrylicCost = sheets * effectiveAcrylicPrice;
    let filmCost = film ? acrylicCost * (userSettings.filmMult - 1) : 0;
    
    const totalMaterialCost = baseCost + acrylicCost + filmCost;
    const productionCost = totalMaterialCost * userSettings.laborMult;
    const totalOverhead = (area * userSettings.overheadPerM2) + userSettings.setupFix;
    const costWithOverhead = productionCost + totalOverhead;

    let priceBaseWithMargin = costWithOverhead * margin;
    let priceLight = light ? userSettings.lightFix + (area * userSettings.lightM2) : 0;
    let finalPrice = priceBaseWithMargin + priceLight;
    let priceComplex = 0;

    if (complex) {
        let beforeComplex = finalPrice;
        finalPrice *= userSettings.complexMult;
        priceComplex = finalPrice - beforeComplex;
    }

    finalPrice = Math.round(finalPrice / 100) * 100;
    document.getElementById('price-display').innerText = finalPrice.toLocaleString() + " ₽";

    document.getElementById('price-base').innerText = Math.round(priceBaseWithMargin * 0.6).toLocaleString() + ' ₽';
    document.getElementById('price-acrylic').innerText = Math.round(priceBaseWithMargin * 0.4).toLocaleString() + ' ₽';

    const rowFilm = document.getElementById('row-film');
    if (film) {
        rowFilm.style.display = 'flex';
        document.getElementById('price-film').innerText = Math.round(filmCost * userSettings.laborMult * margin).toLocaleString() + ' ₽';
    } else { rowFilm.style.display = 'none'; }

    const rowLight = document.getElementById('row-light');
    if (light) {
        rowLight.style.display = 'flex';
        document.getElementById('price-light').innerText = Math.round(priceLight).toLocaleString() + ' ₽';
    } else { rowLight.style.display = 'none'; }

    const rowComplex = document.getElementById('row-complex');
    if (complex) {
        rowComplex.style.display = 'flex';
        document.getElementById('price-complex').innerText = '+' + Math.round(priceComplex).toLocaleString() + ' ₽';
    } else { rowComplex.style.display = 'none'; }

    return finalPrice;
}

function updatePreview(w, h) {
    const box = document.getElementById('preview-box');
    const info = document.getElementById('mount-info');
    if (w <= 0 || h <= 0) return;

    const maxSize = 100; 
    const ratio = w / h;
    let previewWidth, previewHeight;

    if (ratio > 1) { previewWidth = maxSize; previewHeight = maxSize / ratio; } 
    else { previewHeight = maxSize; previewWidth = maxSize * ratio; }

    box.style.width = previewWidth + "px";
    box.style.height = previewHeight + "px";
    document.getElementById('dim-w-label').innerText = w;
    document.getElementById('dim-h-label').innerText = h;

    const widthCm = currentUnit === 'mm' ? w / 10 : w;
    const heightCm = currentUnit === 'mm' ? h / 10 : h;
    const segmentsX = Math.max(1, Math.ceil(widthCm / 75));
    const segmentsY = Math.max(1, Math.ceil(heightCm / 75));
    const totalMounts = (segmentsX + 1) * 2 + (segmentsY - 1) * 2;

    box.querySelectorAll('.mount-hole').forEach(el => el.remove());
    for (let i = 0; i <= segmentsX; i++) { createHole(i/segmentsX*100, 0, box); createHole(i/segmentsX*100, 100, box); }
    for (let i = 1; i < segmentsY; i++) { createHole(0, i/segmentsY*100, box); createHole(100, i/segmentsY*100, box); }
    info.innerHTML = "Держателей: <b>" + totalMounts + " шт</b>";
}

function createHole(left, top, parent) {
    const hole = document.createElement('div');
    hole.className = 'mount-hole';
    hole.style.left = left + '%'; hole.style.top = top + '%';
    parent.appendChild(hole);
}

function toggleSettingsPanel() {
    document.getElementById('settings-panel').classList.toggle('show');
}

function loadLocalSettings() {
    const saved = localStorage.getItem('laser_settings');
    if (saved) { userSettings = JSON.parse(saved); }
    document.getElementById('s-base').value = userSettings.baseMat;
    document.getElementById('s-acrylic').value = userSettings.acrylicSheet;
    document.getElementById('s-labor').value = userSettings.laborMult;
    document.getElementById('s-m-small').value = userSettings.marginSmall;
    document.getElementById('s-m-large').value = userSettings.marginLarge;
    document.getElementById('s-acrylic-disc').value = userSettings.acrylicDiscMaxPct;
    document.getElementById('s-base-disc').value = userSettings.baseDiscMaxPct;
}

function saveAdminSettings() {
    userSettings.baseMat = parseFloat(document.getElementById('s-base').value || 0);
    userSettings.acrylicSheet = parseFloat(document.getElementById('s-acrylic').value || 0);
    userSettings.laborMult = parseFloat(document.getElementById('s-labor').value || 0);
    userSettings.marginSmall = parseFloat(document.getElementById('s-m-small').value || 0);
    userSettings.marginLarge = parseFloat(document.getElementById('s-m-large').value || 0);
    userSettings.acrylicDiscMaxPct = parseFloat(document.getElementById('s-acrylic-disc').value || 0);
    userSettings.baseDiscMaxPct = parseFloat(document.getElementById('s-base-disc').value || 0);
    localStorage.setItem('laser_settings', JSON.stringify(userSettings));
    calc(); 
}

function resetToDefaults() {
    if (confirm("Сбросить настройки к заводским?")) {
        userSettings = { ...CONFIG.DEFAULTS };
        localStorage.removeItem('laser_settings');
        loadLocalSettings();
        calc();
        showToast("Настройки сброшены");
    }
}

// === БЭКЕНД И ОТРИСОВКА ===
async function loadData() {
    const loaderQ = document.getElementById('loader-queue');
    const loaderH = document.getElementById('loader-history');
    if (loaderQ) loaderQ.style.display = 'block';
    if (loaderH) loaderH.style.display = 'block';

    try {
        const response = await fetch(CONFIG.WEB_APP_URL);
        const result = await response.json();
        orders = result.orders;
        globalHidePrice = !result.settings.showPrice; 
        renderOrders();
    } catch (error) {
        showToast("Ошибка связи с базой");
    } finally {
        if (loaderQ) loaderQ.style.display = 'none';
        if (loaderH) loaderH.style.display = 'none';
    }
}

function renderOrders() {
    const queueList = document.getElementById('queue-list');
    const historyList = document.getElementById('history-list');
    if (!queueList || !historyList) return;
    
    queueList.innerHTML = '';
    historyList.innerHTML = '';

    const isWorker = (currentUser === 'Рома' || currentUser === 'Дима');
    const shouldHidePrice = isWorker && globalHidePrice;

    orders.forEach(order => {
        const isArchive = (order.status === 'Готово' || order.status === 'Отправлен'); 
        
        const price = parseFloat(order.price) || 0;
        const paid = parseFloat(order.paid) || 0;
        const percent = price > 0 ? Math.round((paid / price) * 100) : 0;
        
        let payClass = 'paid-none'; 
        if (percent >= 100) payClass = 'paid-full'; 
        else if (percent > 0) payClass = 'paid-part'; 
        
        const payText = shouldHidePrice 
            ? '<span style="color:#555">*** ₽</span>' 
            : `<span class="${payClass}">${paid} / ${price} ₽ (${percent}%)</span>`;

        let cardStatusClass = 'card-st-new';
        let statusClass = 'st-new';
        if (order.status === 'В работе') { cardStatusClass = 'card-st-work'; statusClass = 'st-work'; }
        if (order.status === 'Отправить') { cardStatusClass = 'card-st-send'; statusClass = 'st-send'; }
        if (order.status === 'Готово') { cardStatusClass = 'card-st-done'; statusClass = 'st-done'; }

        // Кнопки файлов
        const layoutLink = order.layout ? getDriveDirectLink(order.layout) : '';
        const layoutBtn = layoutLink ? `<a href="${layoutLink}" target="_blank" class="btn-dl">📂 Макет</a>` : '';

        const photoLink = order.photo ? getDriveDirectLink(order.photo) : '';
        const photoBtn = photoLink ? `<a href="${photoLink}" target="_blank" class="btn-dl">📷 Фото</a>` : '';

        const card = document.createElement('div');
        card.className = `order-card ${cardStatusClass}`;

        const gearIcon = `
            <button class="gear-btn" onclick="openEdit('${order.id}')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                </svg>
            </button>
        `;

        card.innerHTML = `
            ${gearIcon}
            <div class="order-flex">
                <div class="order-left">
                    <div class="order-header">#${order.id} ${order.client}</div>
                    <div class="order-desc">${order.desc || 'Нет описания'}</div>
                    <div class="order-meta">
                        <span class="status-badge ${statusClass}" onclick="openStatusModal(${order.id})">${order.status}</span>
                        <span>${order.delivery || ''} ${order.track ? '('+order.track+')' : ''}</span>
                    </div>
                    <div class="order-meta" style="margin-top:5px;">
                        ${layoutBtn}
                        ${photoBtn}
                    </div>
                    <div class="order-footer">
                        <div class="paid-tag">${payText}</div>
                        <div style="font-size:11px; color:var(--hint)">${formatMoscowDate(order.date)}</div>
                    </div>
                </div>
            </div>
        `;

        if (isArchive) { historyList.appendChild(card); } 
        else { queueList.appendChild(card); }
    });
}

function openStatusModal(id) {
    currentStatusEditId = id;
    document.getElementById('modal-status').classList.add('show');
}

async function saveStatus(newStatus) {
    if (isStatusSaving) return;
    isStatusSaving = true;

    const btnBox = document.getElementById('modal-status').querySelector('.modal-content');
    const originalContent = btnBox.innerHTML;
    
    // Блокируем кнопки
    const btns = btnBox.querySelectorAll('button');
    btns.forEach(b => b.disabled = true);
    
    const title = btnBox.querySelector('h3');
    const originalTitle = title.innerText;
    title.innerText = "⏳ Сохранение...";

    try {
        const order = orders.find(o => o.id == currentStatusEditId);
        if(!order) throw new Error("Order not found");

        await fetch(CONFIG.WEB_APP_URL, {
            method: 'POST', mode: 'no-cors',
            body: JSON.stringify({
                action: 'updateOrderFull',
                id: order.id,
                rowIndex: order.rowIndex,
                status: newStatus
            })
        });
        showToast("Статус обновлен: " + newStatus);
        
        closeModals();
        loadData();
    } catch(e) {
        showToast("Ошибка смены статуса");
        title.innerText = originalTitle;
    } finally {
        isStatusSaving = false;
        btns.forEach(b => b.disabled = false);
        setTimeout(() => {
            if (!document.getElementById('modal-status').classList.contains('show')) {
                // Если модалка закрыта (через closeModals или вручную), сбрасываем заголовок
                title.innerText = "Изменить статус";
            }
        }, 500);
    }
}

function selectDelivery(prefix, type, btn) {
    const container = document.getElementById(prefix + '-delivery-chips');
    container.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    
    const trackInput = document.getElementById(prefix + '-track');
    if (type === 'cdek') {
        trackInput.style.display = 'block';
    } else {
        trackInput.style.display = 'none';
        trackInput.value = ''; 
    }
    if (prefix === 'n') selectedDelivery.type = type;
}

function quickPay(prefix, factor) {
    const priceId = prefix === 'n' ? 'n-price-final' : 'e-price';
    const paidId = prefix + '-paid';
    const priceVal = parseFloat(document.getElementById(priceId).value) || 0;
    document.getElementById(paidId).value = Math.round(priceVal * factor);
}

function openOrderModal() {
    const calcPrice = calc(); 
    document.getElementById('n-price-final').value = calcPrice;
    
    document.getElementById('n-client').value = '';
    document.getElementById('n-phone').value = '';
    document.getElementById('n-desc').value = '';
    document.getElementById('n-track').value = '';
    document.getElementById('n-paid').value = '';
    document.getElementById('n-photo').value = '';
    document.getElementById('n-layout').value = '';
    
    document.getElementById('lbl-n-photo').classList.remove('active');
    document.getElementById('lbl-n-photo').querySelector('span').innerText = "📸 Фото";
    document.getElementById('lbl-n-layout').classList.remove('active');
    document.getElementById('lbl-n-layout').querySelector('span').innerText = "📂 Макет";

    const chips = document.getElementById('n-delivery-chips').querySelectorAll('.chip');
    chips.forEach(c => c.classList.remove('active'));
    document.getElementById('n-track').style.display = 'none';
    selectedDelivery = { type: '', track: '' };

    document.getElementById('modal-new').classList.add('show');
}

async function submitOrder() {
    const clientName = document.getElementById('n-client').value;
    const clientPhone = document.getElementById('n-phone').value;

    if (!clientName) {
        showToast("⚠️ Введите имя клиента!");
        return;
    }

    const btn = document.getElementById('btn-submit');
    btn.innerText = "⏳ Отправка..."; btn.disabled = true;

    let deliveryType = 'Не указано';
    const chips = document.getElementById('n-delivery-chips').querySelectorAll('.chip');
    if (chips[0].classList.contains('active')) deliveryType = 'Самовывоз';
    if (chips[1].classList.contains('active')) deliveryType = 'Яндекс';
    if (chips[2].classList.contains('active')) deliveryType = 'СДЭК';

    try {
        const photoFile = document.getElementById('n-photo').files[0];
        const layoutFile = document.getElementById('n-layout').files[0];
        const photoB64 = await toBase64(photoFile);
        const layoutB64 = await toBase64(layoutFile);

        const data = {
            id: Math.floor(Math.random() * 9000) + 1000,
            client: clientName,
            phone: clientPhone,
            desc: document.getElementById('n-desc').value,
            price: parseFloat(document.getElementById('n-price-final').value) || 0,
            paid: parseFloat(document.getElementById('n-paid').value) || 0,
            delivery: deliveryType,
            track: document.getElementById('n-track').value,
            manager: currentUser,
            status: 'Изготовить',
            photoFile: photoB64,
            layoutFile: layoutB64
        };

        await fetch(CONFIG.WEB_APP_URL, {
            method: 'POST', mode: 'no-cors', body: JSON.stringify(data)
        });

        showToast("✅ Заказ добавлен!");
        closeModals();
        loadData(); 
    } catch (e) {
        showToast("❌ Ошибка отправки");
    } finally {
        btn.innerText = "🚀 Отправить в работу"; btn.disabled = false;
    }
}

function openEdit(id) {
    const order = orders.find(o => o.id == id);
    if (!order) return;
    
    currentEditId = id;
    currentEditRow = order.rowIndex;
    
    document.getElementById('edit-id-title').innerText = "Редактирование #" + id;
    document.getElementById('e-client').value = order.client || '';
    document.getElementById('e-phone').value = order.phone || '';
    document.getElementById('e-desc').value = order.desc || '';
    document.getElementById('e-price').value = order.price || 0;
    document.getElementById('e-paid').value = order.paid || 0;
    document.getElementById('e-status').value = order.status || 'Изготовить';
    document.getElementById('e-track').value = order.track || '';
    
    const chips = document.getElementById('e-delivery-chips').querySelectorAll('.chip');
    chips.forEach(c => c.classList.remove('active'));
    const d = order.delivery || '';
    if (d.includes('Самовывоз')) chips[0].classList.add('active');
    else if (d.includes('Яндекс')) chips[1].classList.add('active');
    else if (d.includes('СДЭК')) chips[2].classList.add('active');
    
    document.getElementById('e-track').style.display = d.includes('СДЭК') ? 'block' : 'none';

    document.getElementById('e-photo-done').value = '';
    const lbl = document.getElementById('lbl-e-photo-done');
    lbl.classList.remove('active');
    lbl.querySelector('span').innerText = "📸 Фото готового изделия";

    document.getElementById('e-layout').value = '';
    const lblL = document.getElementById('lbl-e-layout');
    lblL.classList.remove('active');
    lblL.querySelector('span').innerText = "📂 Заменить макет";

    document.getElementById('modal-edit').classList.add('show');
    checkStatusReq(); 
}

function checkStatusReq() {
    const val = document.getElementById('e-status').value;
    const block = document.getElementById('finish-reqs');
    if (val === 'Готово') { block.style.display = 'block'; } 
    else { block.style.display = 'none'; }
}

async function updateOrder() {
    const btn = document.getElementById('btn-update');
    btn.innerText = "⏳..."; btn.disabled = true;

    let delType = 'Не указано';
    const chips = document.getElementById('e-delivery-chips').querySelectorAll('.chip');
    if (chips[0].classList.contains('active')) delType = 'Самовывоз';
    if (chips[1].classList.contains('active')) delType = 'Яндекс';
    if (chips[2].classList.contains('active')) delType = 'СДЭК';

    try {
        const photoDoneFile = document.getElementById('e-photo-done').files[0];
        const layoutFile = document.getElementById('e-layout').files[0];
        
        const photoDoneB64 = await toBase64(photoDoneFile);
        const layoutB64 = await toBase64(layoutFile);

        const data = {
            action: 'updateOrderFull',
            id: currentEditId,
            rowIndex: currentEditRow,
            client: document.getElementById('e-client').value,
            phone: document.getElementById('e-phone').value,
            desc: document.getElementById('e-desc').value,
            price: parseFloat(document.getElementById('e-price').value) || 0,
            paid: parseFloat(document.getElementById('e-paid').value) || 0,
            status: document.getElementById('e-status').value,
            delivery: delType,
            track: document.getElementById('e-track').value,
            photoDone: photoDoneB64,
            layoutNew: layoutB64
        };

        await fetch(CONFIG.WEB_APP_URL, {
            method: 'POST', mode: 'no-cors', body: JSON.stringify(data)
        });
        
        showToast("💾 Изменения сохранены");
        closeModals();
        loadData();
    } catch (e) {
        showToast("❌ Ошибка сохранения");
    } finally {
        btn.innerText = "💾 Сохранить"; btn.disabled = false;
    }
}

async function deleteOrder() {
    if (!confirm("⚠️ Удалить заказ навсегда?")) return;
    try {
        await fetch(CONFIG.WEB_APP_URL, {
            method: 'POST', mode: 'no-cors',
            body: JSON.stringify({ action: 'deleteOrder', rowIndex: currentEditRow })
        });
        showToast("🗑 Заказ удален");
        closeModals();
        loadData();
    } catch (e) { showToast("Ошибка удаления"); }
}

function setTab(id) {
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => tab.style.display = 'none');
    
    const buttons = document.querySelectorAll('.nav-btn');
    buttons.forEach(btn => btn.classList.remove('active'));
    
    const targetTab = document.getElementById('tab-' + id);
    if (targetTab) targetTab.style.display = 'block';
    
    const targetBtn = document.getElementById('nav-' + id);
    if (targetBtn) targetBtn.classList.add('active');
    
    if (id !== 'calc') { loadData(); }
}

function closeModals() {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        if (modal.id !== 'login-screen') { modal.classList.remove('show'); }
    });
}

window.onload = function() { calc(); };