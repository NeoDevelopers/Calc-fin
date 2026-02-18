let currentUser = '';
let orders = [];
let currentEditId = null;
let currentEditRow = null;
let currentUnit = 'cm';
let globalHidePrice = false;
let userSettings = { ...CONFIG.DEFAULTS };

function showToast(message) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerText = message;
    container.appendChild(toast);
    setTimeout(function() {
        toast.remove();
    }, 3000);
}

function validateLoginInput() {
    const user = document.getElementById('user-select').value;
    const pass = document.getElementById('user-pass').value;
    const btn = document.getElementById('login-btn');
    btn.disabled = !(user && pass.length > 0);
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
        }
        if (user === 'Рома' || user === 'Дима') {
            setTab('queue');
        } else {
            setTab('calc');
        }
        loadData();
        showToast("Добро пожаловать!");
    } else {
        inputField.classList.add('shake');
        setTimeout(function() {
            inputField.classList.remove('shake');
        }, 300);
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
    const newValue = parseFloat(input.value || 0) + value;
    input.value = Math.max(0.1, newValue).toFixed(1);
    calc();
}

function clamp01(value) {
    return Math.max(0, Math.min(1, value));
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

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
        updatePreview(0, 0);
        return 0;
    }
    const widthInMeters = currentUnit === 'mm' ? rawW / 1000 : rawW / 100;
    const heightInMeters = currentUnit === 'mm' ? rawH / 1000 : rawH / 100;
    const area = widthInMeters * heightInMeters;
    const tArea = clamp01((area - 1.0) / (3.0 - 1.0));
    const margin = lerp(userSettings.marginSmall, userSettings.marginLarge, tArea);
    const baseDiscount = clamp01((area - 1.0) / (3.0 - 1.0)) * (userSettings.baseDiscMaxPct / 100);
    const effectiveBasePrice = userSettings.baseMat * (1 - baseDiscount);
    const tSheets = clamp01((sheets - 2.0) / (5.0 - 2.0));
    const acrylicDiscount = tSheets * (userSettings.acrylicDiscMaxPct / 100);
    const effectiveAcrylicPrice = userSettings.acrylicSheet * (1 - acrylicDiscount);
    const baseCost = area * effectiveBasePrice;
    const acrylicCost = sheets * effectiveAcrylicPrice;
    let filmCost = 0;
    if (film) {
        filmCost = acrylicCost * (userSettings.filmMult - 1);
    }
    const totalMaterialCost = baseCost + acrylicCost + filmCost;
    const productionCost = totalMaterialCost * userSettings.laborMult;
    const totalOverhead = (area * userSettings.overheadPerM2) + userSettings.setupFix;
    const costWithOverhead = productionCost + totalOverhead;
    let finalPrice = costWithOverhead * margin;
    if (light) {
        finalPrice += userSettings.lightFix + (area * userSettings.lightM2);
    }
    if (complex) {
        finalPrice *= userSettings.complexMult;
    }
    finalPrice = Math.round(finalPrice / 100) * 100;
    document.getElementById('price-display').innerText = finalPrice.toLocaleString() + " ₽";
    document.getElementById('order-btn-ui').style.display = "block";
    updatePreview(rawW, rawH);
    return finalPrice;
}

function updatePreview(w, h) {
    const box = document.getElementById('preview-box');
    const info = document.getElementById('mount-info');
    if (w <= 0 || h <= 0) {
        box.style.width = "0px";
        box.style.height = "0px";
        info.innerHTML = "";
        return;
    }
    const maxSize = 100;
    const ratio = w / h;
    let previewWidth, previewHeight;
    if (ratio > 1) {
        previewWidth = maxSize;
        previewHeight = maxSize / ratio;
    } else {
        previewHeight = maxSize;
        previewWidth = maxSize * ratio;
    }
    box.style.width = previewWidth + "px";
    box.style.height = previewHeight + "px";
    document.getElementById('dim-w-label').innerText = w;
    document.getElementById('dim-h-label').innerText = h;
    const widthCm = currentUnit === 'mm' ? w / 10 : w;
    const heightCm = currentUnit === 'mm' ? h / 10 : h;
    const segmentsX = Math.max(1, Math.ceil(widthCm / 75));
    const segmentsY = Math.max(1, Math.ceil(heightCm / 75));
    const totalMounts = (segmentsX + 1) * 2 + (segmentsY - 1) * 2;
    box.querySelectorAll('.mount-hole').forEach(function(element) {
        element.remove();
    });
    for (let i = 0; i <= segmentsX; i++) {
        createHole(i / segmentsX * 100, 0, box);
        createHole(i / segmentsX * 100, 100, box);
    }
    for (let i = 1; i < segmentsY; i++) {
        createHole(0, i / segmentsY * 100, box);
        createHole(100, i / segmentsY * 100, box);
    }
    info.innerHTML = "Держателей: <b>" + totalMounts + " шт</b>";
}

function createHole(left, top, parent) {
    const hole = document.createElement('div');
    hole.className = 'mount-hole';
    hole.style.left = left + '%';
    hole.style.top = top + '%';
    parent.appendChild(hole);
}

function toggleSettingsPanel() {
    document.getElementById('settings-panel').classList.toggle('show');
}

function loadLocalSettings() {
    const saved = localStorage.getItem('laser_settings');
    if (saved) {
        userSettings = JSON.parse(saved);
    }
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
    if (confirm("Сбросить?")) {
        userSettings = { ...CONFIG.DEFAULTS };
        localStorage.removeItem('laser_settings');
        loadLocalSettings();
        calc();
        showToast("Сброшено");
    }
}

async function loadData() {
    try {
        const response = await fetch(CONFIG.WEB_APP_URL);
        const result = await response.json();
        orders = result.orders;
        globalHidePrice = !result.settings.showPrice;
        const check = document.getElementById('sett-price');
        if (check) {
            check.checked = globalHidePrice;
        }
        renderOrders();
    } catch (error) {
        showToast("Ошибка связи");
    }
}

async function updateGlobalPriceSetting() {
    const hide = document.getElementById('sett-price').checked;
    try {
        await fetch(CONFIG.WEB_APP_URL, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify({
                action: 'updateSettings',
                showPrice: !hide
            })
        });
        globalHidePrice = hide;
        renderOrders();
        showToast("Сохранено");
    } catch (error) {
        showToast("Ошибка");
    }
}

function renderOrders() {
    const queueList = document.getElementById('queue-list');
    const historyList = document.getElementById('history-list');
    if (!queueList || !historyList) return;
    queueList.innerHTML = '';
    historyList.innerHTML = '';
    orders.forEach(function(order) {
        const isDone = order.status === 'Отправлен';
        const hide = (currentUser === 'Рома' || currentUser === 'Дима') && globalHidePrice;
        const debt = (order.price - (order.paid || 0));
        const photoLink = getDriveDirectLink(order.photo);
        const card = document.createElement('div');
        card.className = 'order-card';
        let html = '<div class="order-header"><div><b>№' + order.id + ' ' + order.client + '</b><div style="font-size:10px; color:var(--blue)">' + (order.manager || '') + '</div></div>';
        if (photoLink) {
            html += '<img src="' + photoLink + '" class="thumb" onclick="window.open(\'' + order.photo + '\')">';
        }
        html += '</div>';
        html += '<div style="font-size:12px; color:var(--hint)">' + order.phone + ' | ' + order.date.split(',')[0] + ' <span class="status-badge">' + order.status + '</span></div>';
        html += '<div style="display:flex; justify-content:space-between; margin-top:10px; font-weight:700;">';
        html += '<span>' + (hide ? '***' : order.price + ' ₽') + '</span>';
        html += '<span style="color:' + (debt > 0 ? 'var(--red)' : 'var(--green)') + '">' + (hide ? '---' : (debt > 0 ? 'Долг: ' + debt : 'Оплачено')) + '</span>';
        html += '</div>';
        html += '<button class="btn-action" onclick="openEdit(' + order.id + ')">Управление</button>';
        card.innerHTML = html;
        if (isDone) {
            historyList.appendChild(card);
        } else {
            queueList.appendChild(card);
        }
    });
}

function openOrderModal() {
    document.getElementById('modal-new').classList.add('show');
}

function closeModals() {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(function(modal) {
        if (modal.id !== 'login-screen') {
            modal.classList.remove('show');
        }
    });
}

async function submitOrder() {
    const titleField = document.getElementById('n-client');
    const phoneField = document.getElementById('n-phone');
    const photoInput = document.getElementById('n-photo');
    const layoutInput = document.getElementById('n-layout');
    const descField = document.getElementById('n-desc');
    const btn = document.getElementById('btn-submit');
    if (!titleField.value) {
        showToast("Введите название!");
        return;
    }
    btn.innerText = "⏳ Отправка...";
    btn.disabled = true;
    try {
        const p1 = await toBase64(photoInput.files[0]);
        const p2 = await toBase64(layoutInput.files[0]);
        const data = {
            id: Math.floor(Math.random() * 9000) + 1000,
            title: titleField.value,
            contact: phoneField.value,
            price: calc(),
            sheets: parseFloat(document.getElementById('c-s').value || 1),
            paid: 0,
            desc: descField.value,
            manager: currentUser,
            photoFile: p1,
            layoutFile: p2
        };
        await fetch(CONFIG.WEB_APP_URL, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify(data)
        });
        showToast("✅ Успешно!");
        closeModals();
        titleField.value = '';
        phoneField.value = '';
        photoInput.value = '';
        layoutInput.value = '';
        descField.value = '';
        document.getElementById('lbl-photo').classList.remove('active');
        document.getElementById('lbl-layout').classList.remove('active');
        loadData();
    } catch (error) {
        showToast("❌ Ошибка");
    } finally {
        btn.innerText = "🚀 Отправить в работу";
        btn.disabled = false;
    }
}

function openEdit(id) {
    const order = orders.find(function(item) {
        return item.id == id;
    });
    if (!order) return;
    currentEditId = id;
    currentEditRow = order.rowIndex;
    document.getElementById('edit-id-title').innerText = "Заказ №" + id;
    document.getElementById('e-status').value = order.status;
    document.getElementById('e-paid-add').value = '';
    document.getElementById('modal-edit').classList.add('show');
    checkStatusReq();
}

function checkStatusReq() {
    const status = document.getElementById('e-status').value;
    document.getElementById('finish-reqs').style.display = (status === 'Отправлен') ? 'block' : 'none';
}

async function updateOrder() {
    const status = document.getElementById('e-status').value;
    const tk = document.getElementById('e-tk').value;
    const file = document.getElementById('e-photo').files[0];
    const add = parseFloat(document.getElementById('e-paid-add').value) || 0;
    const btn = document.getElementById('btn-update');
    const order = orders.find(function(item) {
        return item.id == currentEditId;
    });
    if (status === 'Отправлен' && (!tk || !file)) {
        showToast("Нужно фото и ТК!");
        return;
    }
    btn.innerText = "⏳ Сохранение...";
    btn.disabled = true;
    try {
        const photo = await toBase64(file);
        const data = {
            action: 'updateOrder',
            id: currentEditId,
            rowIndex: currentEditRow,
            status: status,
            tk: tk,
            paid: (parseFloat(order.paid || 0) + add),
            photo: photo
        };
        await fetch(CONFIG.WEB_APP_URL, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify(data)
        });
        showToast("Обновлено");
        closeModals();
        setTimeout(loadData, 1500);
    } catch (error) {
        showToast("Ошибка");
    } finally {
        btn.innerText = "💾 Сохранить";
        btn.disabled = false;
    }
}

function setTab(id) {
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(function(tab) {
        tab.style.display = 'none';
    });
    const buttons = document.querySelectorAll('.nav-btn');
    buttons.forEach(function(btn) {
        btn.classList.remove('active');
    });
    const target = document.getElementById('tab-' + id);
    if (target) {
        target.style.display = 'block';
    }
    const btnTarget = document.getElementById('nav-' + id);
    if (btnTarget) {
        btnTarget.classList.add('active');
    }
    if (id !== 'calc') {
        loadData();
    }
}

function updateFileLabel(input, id) {
    if (input.files && input.files[0]) {
        const el = document.getElementById(id);
        el.classList.add('active');
        el.querySelector('span').innerText = "✅ " + input.files[0].name.substring(0, 10);
    }
}

function getDriveDirectLink(url) {
    if (!url) return '';
    const m = url.match(/id=([a-zA-Z0-9_-]{25,})/) || url.match(/\/d\/([a-zA-Z0-9_-]{25,})/);
    if (m) {
        return "https://drive.google.com/uc?export=view&id=" + m[1];
    }
    return url;
}

const toBase64 = function(file) {
    return new Promise(function(resolve, reject) {
        if (!file) {
            resolve(null);
            return;
        }
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = function() {
            resolve(reader.result);
        };
        reader.onerror = function(err) {
            reject(err);
        };
    });
};

window.onload = function() {
    calc();
};
