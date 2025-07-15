// --- Global State and Element Selectors ---
let currentUser = null, allData = [], map = null, doughnutChartInstance = null, markers = [];
let provinceData = { provinces: {}, loading: false, apiKey: "AIzaSyBitndsZjoAO9w0dzVl39xkm2LuuwdGlyE" };
const loginView = document.getElementById('login-view');
const mainAppView = document.getElementById('main-app-view');
const formModal = document.getElementById('form-modal');
const formModalContainer = document.getElementById('form-modal-container');
const loginForm = document.getElementById('login-form');
const backButton = document.getElementById('back-button');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingText = document.getElementById('loading-text');

//*** IMPORTANT! Make sure this URL is correct ***
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyWYuttyt5bFw3h7jzUhEaWBpowkLikqILd5kaL0V6b_jveMP1Tdpd1gPGqJmqexcLS1g/exec';

// --- Core API and Authentication Functions ---
async function apiCall(payload, showLoading = false) {
    if (showLoading) {
        loadingOverlay.classList.remove('hidden');
    }
    try {
        const response = await fetch(SCRIPT_URL, { method: 'POST', cache: 'no-cache', body: JSON.stringify(payload), headers: { 'Content-Type': 'text/plain;charset=utf-8' } });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } finally {
        if (showLoading) { loadingOverlay.classList.add('hidden'); }
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const username = e.target.username.value;
    const password = e.target.password.value;
    const loginError = document.getElementById('login-error');
    loginError.textContent = '';
    const submitButton = e.target.querySelector('button');
    submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    submitButton.disabled = true;

    try {
        const data = await apiCall({ action: 'login', username, password }, true);
        if (data.result === 'success' && data.user) {
            currentUser = data.user;
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            initializeApp();
        } else {
            loginError.textContent = data.message || 'Username หรือ Password ไม่ถูกต้อง';
            submitButton.innerHTML = 'เข้าสู่ระบบ';
            submitButton.disabled = false;
        }
    } catch (err) {
        console.error("Login Fetch Error:", err);
        loginError.textContent = 'เกิดข้อผิดพลาดในการเชื่อมต่อ';
        submitButton.innerHTML = 'เข้าสู่ระบบ';
        submitButton.disabled = false;
    }
}

async function initializeApp() {
    loginView.classList.remove('active');
    loginView.classList.add('hidden');
    mainAppView.classList.remove('hidden');
    mainAppView.classList.add('active');
    await fetchData(true);
    showPage('dashboard');
}

function handleLogout() {
    localStorage.removeItem('currentUser');
    location.reload();
}

function checkSession() {
    const user = localStorage.getItem('currentUser');
    if (user) {
        currentUser = JSON.parse(user);
        initializeApp();
    } else {
        loginView.classList.add('active');
        mainAppView.classList.remove('active');
        mainAppView.classList.add('hidden');
    }
}

// --- Page Navigation and Rendering ---
function showPage(pageName, detailData = null) {
    document.querySelectorAll('.page-content').forEach(p => p.classList.remove('active'));
    const newPage = document.getElementById(`${pageName}-page`);
    if(newPage) newPage.classList.add('active');
    
    document.querySelectorAll('.bottom-nav-item').forEach(item => {
        item.dataset.active = item.getAttribute('onclick').includes(`'${pageName}'`);
    });
    
    document.getElementById('header-title').textContent = { dashboard: 'ภาพรวม', feed: 'ข้อมูลลูกค้า', map: 'แผนที่', detail: 'รายละเอียด' }[pageName] || 'ภาพรวม';
    backButton.classList.toggle('hidden', pageName !== 'detail');

    if (pageName === 'dashboard') renderDashboard();
    if (pageName === 'feed') renderFeedPage();
    if (pageName === 'detail') renderDetailPage(detailData);
    if (pageName === 'map') initMap();
}

async function geocodeAndCacheProvinces() {
    if (provinceData.loading) return;
    provinceData.loading = true;
    console.log("Starting geocoding process...");

    const storesToGeocode = allData.filter(item => 
        item.formType === 'ร้านค้า' && 
        item.GPS && 
        !provinceData.provinces[item.rowId]
    );

    if (storesToGeocode.length === 0) {
        console.log("No new stores to geocode.");
        provinceData.loading = false;
        renderDashboard(); // Re-render in case the view was loaded before
        return;
    }

    const geocodePromises = storesToGeocode.map(async (store) => {
        try {
            const [lat, lng] = String(store.GPS).split(',').map(s => s.trim());
            if (isNaN(parseFloat(lat)) || isNaN(parseFloat(lng))) return null;

            const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${provinceData.apiKey}&language=th`);
            if (!response.ok) return null;
            
            const data = await response.json();
            if (data.status === 'OK' && data.results.length > 0) {
                const addressComponents = data.results[0].address_components;
                const provinceComponent = addressComponents.find(c => c.types.includes('administrative_area_level_1'));
                if (provinceComponent) {
                    return { rowId: store.rowId, province: provinceComponent.long_name.replace('จังหวัด', '').trim() };
                }
            }
            return null;
        } catch (error) {
            console.error("Geocoding API error:", error);
            return null;
        }
    });

    const results = await Promise.all(geocodePromises);

    results.forEach(result => {
        if (result && result.rowId && result.province) {
            provinceData.provinces[result.rowId] = result.province;
        }
    });

    console.log("Geocoding process finished. Cache updated:", provinceData.provinces);
    provinceData.loading = false;
    
    if (document.getElementById('dashboard-page').classList.contains('active')) {
        renderDashboard();
    }
}

function renderDashboard() {
    const page = document.getElementById('dashboard-page');

    const storeCount = allData.filter(d => d.formType === 'ร้านค้า').length;
    const farmerCount = allData.filter(d => d.formType === 'เกษตรกร').length;
    const trialCount = allData.filter(d => d.formType === 'แปลงทดลอง').length;

    const recentItems = [...allData]
        .sort((a, b) => new Date(b.createdDate) - new Date(a.createdDate))
        .slice(0, 7);

    const newStores = allData.filter(d => d.formType === 'ร้านค้า' && d['สถานะ'] === 'ร้านใหม่').length;
    const oldStores = allData.filter(d => d.formType === 'ร้านค้า' && d['สถานะ'] === 'ร้านเก่า').length;

    const provinceCounts = {};
    Object.values(provinceData.provinces).forEach(province => {
        if (province) {
            provinceCounts[province] = (provinceCounts[province] || 0) + 1;
        }
    });
    const topProvinces = Object.entries(provinceCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5);

    let recentItemsHtml = recentItems.map(item => {
        let name = 'N/A';
        switch (item.formType) {
            case 'ร้านค้า':
                name = item['ชื่อร้านค้า'];
                break;
            case 'เกษตรกร':
                name = item['ชื่อเกษตรกร'];
                break;
            case 'แปลงทดลอง':
                name = item['พืชที่ทดลอง'] || item['เกษตรกรเจ้าของแปลง'];
                break;
        }
        name = name || 'N/A';

        const subtext = item.formType;
        const iconClass = { 'ร้านค้า': 'fa-store text-blue-500', 'เกษตรกร': 'fa-leaf text-green-500', 'แปลงทดลอง': 'fa-vial text-purple-500' }[item.formType] || 'fa-question-circle';
        return `<div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer" onclick='showLinkedDetail("${item.rowId}")'>
                    <div class="flex items-center space-x-4 overflow-hidden">
                        <i class="fas ${iconClass} text-xl w-6 text-center"></i>
                        <div class="overflow-hidden">
                            <p class="font-semibold text-gray-800 truncate">${name}</p>
                            <p class="text-sm text-gray-500 truncate">${subtext}</p>
                        </div>
                    </div>
                    <i class="fas fa-chevron-right text-gray-400"></i>
                </div>`;
    }).join('');
    if(recentItems.length === 0) recentItemsHtml = '<p class="text-center text-gray-500 py-4">ไม่มีข้อมูลล่าสุด</p>';

    let topProvincesHtml = '';
    if (provinceData.loading && topProvinces.length === 0) {
        topProvincesHtml = '<p class="text-center text-gray-500 py-4">กำลังโหลดข้อมูลจังหวัด...</p>';
    } else if (topProvinces.length > 0) {
        topProvincesHtml = topProvinces.map(([name, count]) => `
            <div class="flex justify-between items-center py-2 border-b">
                <span class="text-gray-700">${name}</span>
                <span class="font-bold text-gray-900">${count}</span>
            </div>
        `).join('');
    } else {
        topProvincesHtml = '<p class="text-center text-gray-500 py-4">ไม่มีข้อมูลจังหวัดของร้านค้า</p>';
    }

    page.innerHTML = `
        <div class="grid grid-cols-3 gap-4 mb-6">
            <div class="bg-white p-4 rounded-lg shadow-sm text-center"><p class="text-sm text-gray-500">ร้านค้า</p><p class="text-3xl font-bold text-blue-500">${storeCount}</p></div>
            <div class="bg-white p-4 rounded-lg shadow-sm text-center"><p class="text-sm text-gray-500">เกษตรกร</p><p class="text-3xl font-bold text-green-500">${farmerCount}</p></div>
            <div class="bg-white p-4 rounded-lg shadow-sm text-center"><p class="text-sm text-gray-500">แปลงทดลอง</p><p class="text-3xl font-bold text-purple-500">${trialCount}</p></div>
        </div>
        <div class="mb-6">
            <h3 class="text-lg font-bold text-gray-700 mb-3">สรุปสถานะร้านค้า</h3>
            <div class="grid grid-cols-2 gap-4">
                <div class="bg-white p-3 rounded-lg shadow-sm text-center"><p class="text-sm text-gray-500">ร้านค้าใหม่</p><p class="text-2xl font-bold text-blue-500">${newStores}</p></div>
                <div class="bg-white p-3 rounded-lg shadow-sm text-center"><p class="text-sm text-gray-500">ร้านค้าเก่า</p><p class="text-2xl font-bold text-gray-600">${oldStores}</p></div>
            </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="bg-white p-4 rounded-lg shadow-sm"><h3 class="font-bold mb-3 text-gray-700">รายการล่าสุด</h3><div class="space-y-3">${recentItemsHtml}</div></div>
            <div class="space-y-6">
                 <div class="bg-white p-4 rounded-lg shadow-sm">
                    <h3 class="font-bold mb-2 text-gray-700">Top 5 จังหวัด (ร้านค้า)</h3>
                    <div class="space-y-1" id="top-provinces-container">${topProvincesHtml}</div>
                </div>
                <div class="bg-white p-4 rounded-lg shadow-sm">
                    <h3 class="font-bold mb-2 text-center text-gray-700">สัดส่วนข้อมูล</h3>
                    <div class="max-w-xs mx-auto"><canvas id="doughnutChart"></canvas></div>
                </div>
            </div>
        </div>`;
    
    if (doughnutChartInstance) doughnutChartInstance.destroy();
    const doughnutCtx = document.getElementById('doughnutChart')?.getContext('2d');
    if(doughnutCtx) {
        doughnutChartInstance = new Chart(doughnutCtx, { 
            type: 'doughnut', 
            data: { 
                labels: ['ร้านค้า', 'เกษตรกร', 'แปลงทดลอง'], 
                datasets: [{ data: [storeCount, farmerCount, trialCount], backgroundColor: ['#3b82f6', '#22c55e', '#a855f7'], hoverOffset: 4 }] 
            } 
        });
    }
}

function renderFeedPage() {
    const page = document.getElementById('feed-page');
    page.innerHTML = `
        <div class="flex justify-between items-center mb-4"><h1 class="text-2xl font-bold text-gray-800">ข้อมูลลูกค้า</h1><button onclick="showAddFormSelection()" class="bg-pink-500 hover:bg-pink-600 text-white font-bold py-2 px-4 rounded-lg flex items-center space-x-2"><i class="fas fa-plus"></i><span>เพิ่ม</span></button></div>
        <div class="p-1 bg-gray-200 rounded-lg flex space-x-1 mb-4"><button onclick="showTab('stores')" class="tab-button w-1/3 py-2 rounded-md" data-active="true">ร้านค้า</button><button onclick="showTab('farmers')" class="tab-button w-1/3 py-2 rounded-md">เกษตรกร</button><button onclick="showTab('trials')" class="tab-button w-1/3 py-2 rounded-md">แปลงทดลอง</button></div>
        <div class="relative mb-4"><input id="search-input" type="text" placeholder="ค้นหาด้วยชื่อ..." class="form-input pl-10"><i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i></div>
        <div id="feed-container">
            <div id="stores-tab" class="tab-content active space-y-3"></div>
            <div id="farmers-tab" class="tab-content space-y-3"></div>
            <div id="trials-tab" class="tab-content space-y-3"></div>
        </div>
        <p id="empty-feed" class="hidden text-center text-gray-500 py-10">ไม่มีข้อมูล</p>`;
    
    document.getElementById('search-input').addEventListener('input', renderAllTabs);
    showTab('stores');
}

function showTab(tabName) {
    document.querySelectorAll('.tab-button').forEach(b => b.dataset.active = b.getAttribute('onclick').includes(`'${tabName}'`));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.getElementById(`${tabName}-tab`).classList.add('active');
    renderAllTabs();
}

function renderAllTabs() {
    renderDataList('stores');
    renderDataList('farmers');
    renderDataList('trials');
}

function renderDataList(tabId) {
    const container = document.getElementById(`${tabId}-tab`);
    if(!container) return;
    
    const formTypeMapping = { stores: 'ร้านค้า', farmers: 'เกษตรกร', trials: 'แปลงทดลอง' };
    const formType = formTypeMapping[tabId];
    const searchInputEl = document.getElementById('search-input');
    const searchTerm = searchInputEl ? searchInputEl.value.toLowerCase() : '';
    
    const data = allData.filter(item => {
        if (item.formType !== formType) return false;
        const name = String(item['ชื่อร้านค้า'] || item['ชื่อเกษตรกร'] || item['เกษตรกรเจ้าของแปลง'] || item['พืชที่ทดลอง'] || '');
        return name.toLowerCase().includes(searchTerm);
    });
    
    container.innerHTML = '';
    if (data.length === 0) {
        container.innerHTML = `<p class="text-center text-gray-500 py-10">ไม่มีข้อมูล</p>`;
        return;
    }

    data.sort((a, b) => new Date(b.createdDate) - new Date(a.createdDate));

    data.forEach((item) => {
        let name = 'N/A';
        if (item.formType === 'ร้านค้า') {
            name = item['ชื่อร้านค้า'] || 'N/A';
        } else if (item.formType === 'เกษตรกร') {
            name = item['ชื่อเกษตรกร'] || 'N/A';
        } else if (item.formType === 'แปลงทดลอง') {
            name = item['เกษตรกรเจ้าของแปลง'] || item['ชื่อเจ้าของสวน'] || 'แปลงทดลอง';
        }

        const subtext = item['ชื่อเจ้าของ'] || `โดย: ${item.createdBy}`;
        const iconClass = { 'ร้านค้า': 'fa-store text-blue-500', 'เกษตรกร': 'fa-leaf text-green-500', 'แปลงทดลอง': 'fa-vial text-purple-500' }[item.formType] || 'fa-question-circle';
        const row = document.createElement('div');
        row.className = 'bg-white p-4 rounded-lg shadow-sm flex items-center justify-between cursor-pointer hover:bg-gray-100';
        row.onclick = () => showPage("detail", item);
        row.innerHTML = `<div class="flex items-center space-x-4 overflow-hidden"><i class="fas ${iconClass} text-xl w-6 text-center"></i><div class="overflow-hidden"><p class="font-semibold text-gray-800 truncate">${name}</p><p class="text-sm text-gray-500 truncate">${subtext}</p></div></div><i class="fas fa-chevron-right text-gray-400"></i>`;
        container.appendChild(row);
    });
}

function renderDetailPage(data) {
    const container = document.getElementById('detail-page');
    let detailsHtml = '', linkedHtml = '', galleryHtml = '';
    
    let mainName = 'รายละเอียด';
    if (data.formType === 'ร้านค้า') {
        mainName = data['ชื่อร้านค้า'] || 'N/A';
    } else if (data.formType === 'เกษตรกร') {
        mainName = data['ชื่อเกษตรกร'] || 'N/A';
    } else if (data.formType === 'แปลงทดลอง') {
        mainName = data['เกษตรกรเจ้าของแ��ลง'] || data['ชื่อเจ้าของสวน'] || 'แปลงทดลอง';
    }

    
    for (const [key, value] of Object.entries(data)) {
        if (value && !['formType', 'rowId', 'sheetRow', 'images'].some(k => key.startsWith(k)) && !key.startsWith('creator')) {
            let displayValue;
            if ((key === 'GPS' || key === 'GPSแปลง') && String(value).includes(',')) {
                const [lat, lon] = String(value).split(',').map(s => s.trim());
                if (!isNaN(parseFloat(lat)) && !isNaN(parseFloat(lon))) {
                    displayValue = `<a href="https://www.google.com/maps?q=${lat},${lon}" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:underline font-bold">${value}</a>`;
                } else {
                    displayValue = value;
                }
            } else {
                displayValue = value;
            }
            detailsHtml += `<div class="flex justify-between py-3 border-b"><span class="text-gray-500 w-1/3 break-words">${key}</span><span class="font-semibold text-right w-2/3 break-words">${displayValue}</span></div>`;
        }
    }

    if (data.formType === 'ร้านค้า') {
        const linkedFarmers = allData.filter(f => f.formType === 'เกษตรกร' && f['ร้านค้าในสังกัด'] === data['ชื่อร้านค้า']);
        if(linkedFarmers.length > 0) {
            linkedHtml += `<h3 class="text-lg font-bold mt-6 mb-2 border-t pt-4">เกษตรกรในสังกัด</h3><div class="space-y-2">`;
            linkedFarmers.forEach(farmer => {
                linkedHtml += `<button onclick="showLinkedDetail('${farmer.rowId}')" class="w-full text-left bg-gray-100 hover:bg-gray-200 p-3 rounded-lg flex justify-between items-center transition"><span><i class="fas fa-leaf text-green-500 mr-2"></i>${farmer['ชื่อเกษตรกร']}</span><i class="fas fa-chevron-right text-gray-400"></i></button>`;
            });
            linkedHtml += '</div>';
        }
    } else if (data.formType === 'เกษตรกร') {
        const linkedTrials = allData.filter(t => t.formType === 'แปลงทดลอง' && t['เกษตรกรเจ้าของแปลง'] === data['ชื่อเกษตรกร']);
        if(linkedTrials.length > 0) {
            linkedHtml += `<h3 class="text-lg font-bold mt-6 mb-2 border-t pt-4">แปลงทดลอง</h3><div class="space-y-2">`;
            linkedTrials.forEach(trial => {
                linkedHtml += `<button onclick="showLinkedDetail('${trial.rowId}')" class="w-full text-left bg-gray-100 hover:bg-gray-200 p-3 rounded-lg flex justify-between items-center transition"><span><i class="fas fa-vial text-purple-500 mr-2"></i>${trial['พืชที่ทดลอง'] || 'แปลงทดลอง'}</span><i class="fas fa-chevron-right text-gray-400"></i></button>`;
            });
            linkedHtml += '</div>';
        }
    }
    
    if (data.images && data.images.length > 0) {
        galleryHtml += `<h3 class="text-lg font-bold mt-6 mb-2 border-t pt-4">แกลเลอรีรูปภาพ</h3>`;
        const imagesByType = data.images.reduce((acc, img) => {
            // **สำคัญ:** เปลี่ยนกลับมาใช้ 'imageUrl' ซึ่งเป็นลิงก์ไปยัง Google Drive
            const imageUrl = img.imageUrl; 
            const imageType = img.imageType || 'ทั่วไป';
            if (!acc[imageType]) {
                acc[imageType] = [];
            }
            if(imageUrl) acc[imageType].push(imageUrl);
            return acc;
        }, {});

        for(const [type, urls] of Object.entries(imagesByType)) {
            galleryHtml += `<h4 class="font-semibold mt-2">${type}</h4><div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4 mb-4">`;
            urls.forEach(url => {
                galleryHtml += `<a href="${url}" target="_blank" rel="noopener noreferrer"><img src="${url}" class="w-full h-24 object-cover rounded-lg shadow-md hover:opacity-80 transition-opacity" loading="lazy"></a>`;
            });
            galleryHtml += `</div>`;
        }
    }

    container.innerHTML = `<div class="bg-white p-4 rounded-lg shadow-sm">
        <div class="flex justify-between items-center mb-4">
            <h2 class="text-2xl font-bold text-gray-800">${mainName}</h2>
            <button onclick="handleEditClick('${data.rowId}')" class="text-blue-500 hover:text-blue-700 text-lg"><i class="fas fa-pencil-alt"></i></button>
        </div>
        ${detailsHtml}
        ${galleryHtml}
        ${linkedHtml}
    </div>`;
}

function handleEditClick(rowId) {
    const data = allData.find(item => item.rowId === rowId);
    if (!data) {
        console.error("Item not found for editing:", rowId);
        return;
    }
    const type = { 'ร้านค้า': 'store', 'เกษตรกร': 'farmer', 'แปลงทดลอง': 'trial' }[data.formType];
    if (type) generateForm(type, data);
}

function showLinkedDetail(rowId) {
    const item = allData.find(d => d.rowId === rowId);
    if (item) {
        showPage('detail', item);
    } else {
        console.error("Linked item not found:", rowId);
    }
}

function showAddFormSelection() {
    formModal.classList.remove('hidden');
    formModalContainer.innerHTML = `
        <div class="p-6 text-center">
            <h2 class="text-2xl font-bold text-gray-800 mb-6">เลือกประเภทข้อมูล</h2>
            <div class="space-y-4">
                <button onclick="generateForm('store')" class="w-full max-w-xs text-lg bg-blue-500 text-white py-3 rounded-lg"><i class="fas fa-store mr-3"></i>ข้อมูลร้านค้า</button>
                <button onclick="generateForm('farmer')" class="w-full max-w-xs text-lg bg-green-500 text-white py-3 rounded-lg"><i class="fas fa-leaf mr-3"></i>ข้อมูลเกษตรกร</button>
                <button onclick="generateForm('trial')" class="w-full max-w-xs text-lg bg-purple-500 text-white py-3 rounded-lg"><i class="fas fa-vial mr-3"></i>ข้อมูลแปลงทดลอง</button>
            </div>
            <button onclick="closeFormModal()" class="mt-8 text-gray-500">ยกเลิก</button>
        </div>`;
}

function closeFormModal() { formModal.classList.add('hidden'); }

function generateForm(type, data = {}) {
    const isEdit = Object.keys(data).length > 0;
    let html = '', title = '', formType = '';
    const safeVal = (key) => data[key] || '';

    const createImageUploadInput = (label, imageType) => `
        <div class="md:col-span-2">
            <label class="form-label">${label}</label>
            <input data-image-type="${imageType}" type="file" class="form-input image-upload-input" multiple accept="image/*">
            <div id="image-preview-${imageType.replace(/\s+/g, '-')}" class="mt-4 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4"></div>
        </div>`;
    
    if (type === 'store') {
        title = isEdit ? 'แก้ไขข้อมูลร้านค้า' : 'เพิ่มข้อมูลร้านค้า';
        formType = 'ร้านค้า';
        html = `<div class="p-6 overflow-y-auto"><h3 class="text-xl font-bold mb-6 border-b pb-4">ข้อมูลร้านค้า</h3><div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div><label class="form-label">ชื่อร้านค้า</label><input name="ชื่อร้านค้า" class="form-input" required value="${safeVal('ชื่อร้านค้า')}"></div>
                    <div><label class="form-label">สถานะ</label><select name="สถานะ" class="form-select"><option ${safeVal('สถานะ') === 'ร้านเก่า' ? 'selected' : ''}>ร้านเก่า</option><option ${safeVal('สถานะ') === 'ร้านใหม่' ? 'selected' : ''}>ร้านใหม่</option></select></div>
                    <div class="md:col-span-2"><label class="form-label">GPS</label><div class="flex"><input name="GPS" id="gps-input" class="form-input rounded-r-none" value="${safeVal('GPS')}"><button type="button" onclick="getGeoLocation('gps-input')" class="bg-blue-500 text-white px-4 rounded-r-lg"><i class="fas fa-map-marker-alt"></i></button></div></div>
                    <div><label class="form-label">ขนาดร้านค้า</label><input name="ขนาดร้านค้า" class="form-input" value="${safeVal('ขนาดร้านค้า')}"></div>
                    <div><label class="form-label">เปิดมากี่ปี</label><input name="เปิดมากี่ปี" type="number" class="form-input" value="${safeVal('เปิดมากี่ปี')}"></div>
                    <div><label class="form-label">สินค้าหลัก</label><input name="สินค้าหลัก" class="form-input" value="${safeVal('สินค้าหลัก')}"></div>
                    <div><label class="form-label">ยอดปุ๋ย/ปี</label><input name="ยอดปุ๋ย/ปี" class="form-input" value="${safeVal('ยอดปุ๋ย/ปี')}"></div>
                    <div><label class="form-label">การจ่ายเงิน</label><input name="การจ่ายเงิน" class="form-input" value="${safeVal('การจ่ายเงิน')}"></div>
                    <div><label class="form-label">พืชหลักในพื้นที่</label><input name="พืชหลักในพื้นที่" class="form-input" value="${safeVal('พืชหลักในพื้นที่')}"></div>
                    <div><label class="form-label">พื้นที่ขายของร้าน</label><input name="พื้นที่ขายของร้าน" class="form-input" value="${safeVal('พื้นที่ขายของร้าน')}"></div>
                    <div><label class="form-label">ลักษณะการขาย</label><input name="ลักษณะการขาย" class="form-input" value="${safeVal('ลักษณะการขาย')}"></div>
                    <div><label class="form-label">มีร้านซาปัวหรือไม่</label><select name="มีร้านซาปัวหรือไม่" class="form-select"><option ${safeVal('มีร้านซาปัวหรือไม่') === 'มี' ? 'selected' : ''}>มี</option><option ${safeVal('มีร้านซาปัวหรือไม่') === 'ไม่มี' ? 'selected' : ''}>ไม่มี</option></select></div>
                    <div><label class="form-label">มีแบรนด์ของตัวเองหรือไม่</label><select name="มีแบรนด์ของตัวเองหรือไม่" class="form-select"><option ${safeVal('มีแบรนด์ของตัวเองหรือไม่') === 'มี' ? 'selected' : ''}>มี</option><option ${safeVal('มีแบรนด์ของตัวเองหรือไม่') === 'ไม่มี' ? 'selected' : ''}>ไม่มี</option></select></div>
                    <div><label class="form-label">ลักษณะของร้าน</label><input name="ลักษณะของร้าน" class="form-input" value="${safeVal('ลักษณะของร้าน')}"></div>
                </div>
                <h3 class="text-xl font-bold mt-8 mb-6 border-b pb-4">พฤติกรรมเจ้าของร้าน</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div><label class="form-label">ชื่อเจ้าของ</label><input name="ชื่อเจ้าของ" class="form-input" value="${safeVal('ชื่อเจ้าของ')}"></div>
                    <div><label class="form-label">เบอร์โทรเจ้าของ</label><input name="เบอร์โทรเจ้าของ" class="form-input" value="${safeVal('เบอร์โทรเจ้าของ')}"></div>
                    <div><label class="form-label">เพศเจ้าของ</label><select name="เพศเจ้าของ" class="form-select"><option ${safeVal('เพศเจ้าของ') === 'ชาย' ? 'selected' : ''}>ชาย</option><option ${safeVal('เพศเจ้าของ') === 'หญิง' ? 'selected' : ''}>หญิง</option></select></div>
                    <div><label class="form-label">อายุเจ้าของ</label><input name="อายุเจ้าของ" type="number" class="form-input" value="${safeVal('อายุเจ้าของ')}"></div>
                    <div><label class="form-label">สถานะเจ้าของ</label><input name="สถานะเจ้าของ" class="form-input" value="${safeVal('สถานะเจ้าของ')}"></div>
                    <div><label class="form-label">รุ่นที่ของร้าน</label><input name="รุ่นที่ของร้าน" type="number" class="form-input" value="${safeVal('รุ่นที่ของร้าน')}"></div>
                    <div><label class="form-label">ชอบสังสรรค์</label><select name="ชอบสังสรรค์" class="form-select"><option ${safeVal('ชอบสังสรรค์') === 'ชอบ' ? 'selected' : ''}>ชอบ</option><option ${safeVal('ชอบสังสรรค์') === 'ไม่ชอบ' ? 'selected' : ''}>ไม่ชอบ</option></select></div>
                    <div><label class="form-label">งานอดิเรก</label><input name="งานอดิเรก" class="form-input" value="${safeVal('งานอดิเรก')}"></div>
                    <div><label class="form-label">กีฬาที่ชอบ</label><input name="กีฬาที่ชอบ" class="form-input" value="${safeVal('กีฬาที่ชอบ')}"></div>
                    <div class="md:col-span-2"><label class="form-label">เป็นคนประเภทใด</label><select name="เป็นคนประเภทใด" class="form-select"><option ${safeVal('เป็นคนประเภทใด') === 'ชอบเจ๊าะแจ๊ะ' ? 'selected' : ''}>ชอบเจ๊าะแจ๊ะ</option><option ${safeVal('เป็นคนประเภทใด') === 'ชอบข้อมูล' ? 'selected' : ''}>ชอบข้อมูล</option><option ${safeVal('เป็นคนประเภทใด') === 'ชอบทดลอง' ? 'selected' : ''}>ชอบทดลอง</option><option ${safeVal('เป็นคนประเภทใด') === 'ชอบต่อราคา' ? 'selected' : ''}>ชอบต่อราคา</option></select></div>
                    <div class="md:col-span-2"><label class="form-label">แนวคิดการตลาดปุ๋ย</label><textarea name="แนวคิดการตลาดปุ๋ย" class="form-textarea h-24">${safeVal('แนวคิดการตลาดปุ๋ย')}</textarea></div>
                </div>
                <h3 class="text-xl font-bold mt-8 mb-6 border-b pb-4">รูปภาพ</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    ${createImageUploadInput('รูปร้าน', 'รูปร้าน')}
                    ${createImageUploadInput('รูปเจ้าของร้าน', 'รูปเจ้าของร้าน')}
                </div></div>`;
    } else if (type === 'farmer') {
        const stores = allData.filter(d => d.formType === 'ร้านค้า');
        const storeOptions = stores.map(s => `<option value="${s['ชื่อร้านค้า']}" ${safeVal('ร้านค้าในสังกัด') === s['��ื่อร้านค้า'] ? 'selected' : ''}>${s['ชื่อร้านค้า']}</option>`).join('');
        title = isEdit ? 'แก้ไขข้อมูลเกษตรกร' : 'เพิ่มข้อมูลเกษตรกร';
        formType = 'เกษตรกร';
        html = `<div class="p-6 overflow-y-auto"><h3 class="text-xl font-bold mb-6 border-b pb-4">ข้อมูลเกษตรกร</h3><div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div><label class="form-label">ชื่อเกษตรกร</label><input name="ชื่อเกษตรกร" class="form-input" required value="${safeVal('ชื่อเกษตรกร')}"></div>
                    <div><label class="form-label">ร้านค้าในสังกัด</label><select name="ร้านค้าในสังกัด" class="form-select"><option value="">-- ไม่ระบุ --</option>${storeOptions}</select></div>
                    <div><label class="form-label">เบอร์โทรเกษตรกร</label><input name="เบอร์โทรเกษตรกร" class="form-input" value="${safeVal('เบอร์โทรเกษตรกร')}"></div>
                    <div class="md:col-span-2"><label class="form-label">GPS</label><div class="flex"><input name="GPS" id="gps-input" class="form-input rounded-r-none" value="${safeVal('GPS')}"><button type="button" onclick="getGeoLocation('gps-input')" class="bg-blue-500 text-white px-4 rounded-r-lg"><i class="fas fa-map-marker-alt"></i></button></div></div>
                    <div class="md:col-span-2"><label class="form-label">ที่อยู่เกษตรกร</label><textarea name="ที่อยู่เกษตรกร" class="form-textarea">${safeVal('ที่อยู่เกษตรกร')}</textarea></div>
                    <div><label class="form-label">เพศเกษตรกร</label><select name="เพศเกษตรกร" class="form-select"><option ${safeVal('เพศเกษตรกร') === 'ชาย' ? 'selected' : ''}>ชาย</option><option ${safeVal('เพศเกษตรกร') === 'หญิง' ? 'selected' : ''}>หญิง</option></select></div>
                    <div><label class="form-label">อายุเกษตรกร</label><input name="อายุเกษตรกร" type="number" class="form-input" value="${safeVal('อายุเกษตรกร')}"></div>
                    <div><label class="form-label">ปลูกอะไร</label><input name="ปลูกอะไร" class="form-input" value="${safeVal('ปลูกอะไร')}"></div>
                    <div><label class="form-label">ปลูกกี่ไร่</label><input name="ปลูกกี่ไร่" type="number" class="form-input" value="${safeVal('ปลูกกี่ไร่')}"></div>
                    <div><label class="form-label">ใช้ปุ๋ยประเภทไหน</label><input name="ใช้ปุ๋ยประเภทไหน" class="form-input" value="${safeVal('ใช้ปุ๋ยประเภทไหน')}"></div>
                    <div><label class="form-label">ใช้ปุ๋ยปีละกี่ครั้ง/ครั้งละเท่าไร</label><input name="ใช้ปุ๋ยปีละกี่ครั้ง/ครั้งละเท่าไร" class="form-input" value="${safeVal('ใช้ปุ๋ยปีละกี่ครั้ง/ครั้งละเท่าไร')}"></div>
                    <div><label class="form-label">ใช้ปุ๋ยช่วงไหน</label><input name="ใช้ปุ๋ยช่วงไหน" class="form-input" value="${safeVal('ใช้ปุ๋ยช่วงไหน')}"></div>
                    <div><label class="form-label">ลักษณะตัวตนในพื้นที่</label><input name="ลักษณะตัวตนในพื้นที่" class="form-input" value="${safeVal('ลักษณะตัวตนในพื้นที่')}"></div>
                    <div class="md:col-span-2"><label class="form-label">ความคิดเรื่องปุ๋ยอินทรีย์</label><textarea name="ความคิดเรื่องปุ๋ยอินทรีย์" class="form-textarea">${safeVal('ความคิดเรื่องปุ๋ยอินทรีย์')}</textarea></div>
                    <div class="md:col-span-2"><label class="form-label">อาชีพอื่นๆ</label><input name="อาชีพอื่นๆ" class="form-input" value="${safeVal('อาชีพอื่นๆ')}"></div>
                </div>
                <h3 class="text-xl font-bold mt-8 mb-6 border-b pb-4">รูปภาพ</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                   ${createImageUploadInput('รูปเกษตรกร', 'รูปเกษตรกร')}
                   ${createImageUploadInput('รูปผลผลิต', 'รูปผลผลิต')}
                </div></div>`;
    } else if (type === 'trial') {
        const farmers = allData.filter(d => d.formType === 'เกษตรกร');
        const farmerOptions = farmers.map(f => `<option value="${f['ชื่อเกษตรกร']}" ${safeVal('เกษตรกรเจ้าของแปลง') === f['ชื่อเกษตรกร'] ? 'selected' : ''}>${f['ชื่อเกษตรกร']}</option>`).join('');
        title = isEdit ? 'แก้ไขข้อมูลแปลงทดลอง' : 'เพิ่มข้อมูลแปลงทดลอง';
        formType = 'แปลงทดลอง';
        html = `<div class="p-6 overflow-y-auto"><h3 class="text-xl font-bold mb-6 border-b pb-4">ข้อมูลการขอทำแปลง</h3><div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div><label class="form-label">เกษตรกรเจ้าของแปลง</label><select name="เกษตรกรเจ้าของแปลง" class="form-select"><option value="">-- ไม่ระบุ --</option>${farmerOptions}</select></div>
                    <div><label class="form-label">ชื่อเจ้าของสวน</label><input name="ชื่อเจ้าของสวน" class="form-input" value="${safeVal('ชื่อเจ้าของสวน')}"></div>
                    <div><label class="form-label">ร้านตัวแทน</label><input name="ร้านตัวแทน" class="form-input" value="${safeVal('ร้านตัวแทน')}"></div>
                    <div><label class="form-label">เบอร์โทรแปลงทดลอง</label><input name="เบอร์โทรแปลงทดลอง" class="form-input" value="${safeVal('เบอร์โทรแปลงทดลอง')}"></div>
                    <div class="md:col-span-2"><label class="form-label">ที่อยู่แปลงทดลอง</label><textarea name="ที่อยู่แปลงทดลอง" class="form-textarea">${safeVal('ที่อยู่แปลงทดลอง')}</textarea></div>
                    <div><label class="form-label">พื้นที่ทำเกษตรทั้งหมด (ไร่)</label><input name="พื้นที่ทำเกษตรทั้งหมด" type="number" class="form-input" value="${safeVal('พื้นที่ทำเกษตรทั้งหมด')}"></div>
                    <div><label class="form-label">พืชที่ทดลอง</label><input name="พืชที่ทดลอง" class="form-input" value="${safeVal('พืชที่ทดลอง')}"></div>
                    <div><label class="form-label">พื้นที่ทดลอง (ไร่)</label><input name="พื้นที่ทดลอง" type="number" class="form-input" value="${safeVal('พื้นที่ทดลอง')}"></div>
                    <div><label class="form-label">ปุ๋ยที่ทดลอง</label><input name="ปุ๋ยที่ทดลอง" class="form-input" value="${safeVal('ปุ๋ยที่ทดลอง')}"></div>
                    <div><label class="form-label">ช่วงเวลาทดลอง</label><input name="ช่วงเวลาทดลอง" class="form-input" value="${safeVal('ช่วงเวลาทดลอง')}"></div>
                    <div><label class="form-label">ทำสวนเองหรือมีคนงาน</label><input name="ทำสวนเองหรือมีคนงาน" class="form-input" value="${safeVal('ทำสวนเองหรือมีคนงาน')}"></div>
                    <div class="md:col-span-2"><label class="form-label">ปัญหาการปลูก</label><textarea name="ปัญหาการปลูก" class="form-textarea">${safeVal('ปัญหาการปลูก')}</textarea></div>
                </div>
                <h3 class="text-xl font-bold mt-8 mb-6 border-b pb-4">ข้อมูลการติดตามผล</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div class="md:col-span-2"><label class="form-label">GPSแปลง</label><div class="flex"><input name="GPSแปลง" id="gps-input" class="form-input rounded-r-none" value="${safeVal('GPSแปลง')}"><button type="button" onclick="getGeoLocation('gps-input')" class="bg-blue-500 text-white px-4 rounded-r-lg"><i class="fas fa-map-marker-alt"></i></button></div></div>
                    <div><label class="form-label">ลักษณะพื้นที่และดิน</label><input name="ลักษณะพื้นที่และดิน" class="form-input" value="${safeVal('ลักษณะพื้นที่และดิน')}"></div>
                    <div><label class="form-label">ปุ๋ยที่เคยใช้</label><input name="ปุ๋ยที่เคยใช้" class="form-input" value="${safeVal('ปุ๋ยที่เคยใช้')}"></div>
                    <div class="md:col-span-2"><label class="form-label">วิธีใช้ปุ๋ยทดลอง</label><textarea name="วิธีใช้ปุ๋ยทดลอง" class="form-textarea">${safeVal('วิธีใช้ปุ๋ยทดลอง')}</textarea></div>
                    <div class="md:col-span-2"><label class="form-label">ผลที่คาดหวัง</label><textarea name="ผลที่คาดหวัง" class="form-textarea">${safeVal('ผลที่คาดหวัง')}</textarea></div>
                    <div><label class="form-label">วันติดตามผล</label><input name="วันติดตามผล" type="date" class="form-input" value="${safeVal('วันติดตามผล')}"></div>
                    <div><label class="form-label">ผลเป็นไปตามคาดหวังหรือไม่</label><select name="ผลเป็นไปตามคาดหวังหรือไม่" class="form-select"><option ${safeVal('ผลเป็นไปตามคาดหวังหรือไม่') === 'ใช่' ? 'selected' : ''}>ใช่</option><option ${safeVal('ผลเป็นไปตามคาดหวังหรือไม่') === 'ไม่' ? 'selected' : ''}>ไม่</option><option ${safeVal('ผลเป็นไปตามคาดหวังหรือ���ม่') === 'ยังไม่ทราบ' ? 'selected' : ''}>ยังไม่ทราบ</option></select></div>
                    <div><label class="form-label">การเปลี่ยนแปลงของดิน</label><input name="การเปลี่ยนแปลงของดิน" class="form-input" value="${safeVal('การเปลี่ยนแปลงของดิน')}"></div>
                    <div><label class="form-label">การเปลี่ยนแปลงของพืช</label><input name="การเปลี่ยนแปลงของพืช" class="form-input" value="${safeVal('การเปลี่ยนแปลงของพืช')}"></div>
                    <div class="md:col-span-2"><label class="form-label">โอกาสที่จะซื้อ</label><input name="โอกาสที่จะซื้อ" class="form-input" value="${safeVal('โอกาสที่จะซื้อ')}"></div>
                </div>
                <h3 class="text-xl font-bold mt-8 mb-6 border-b pb-4">รูปภาพ</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                   ${createImageUploadInput('รูปแปลงทดลอง', 'รูปแปลงทดลอง')}
                   ${createImageUploadInput('รูปผลลัพธ์การทดลอง', 'รูปผลลัพธ์')}
                </div></div>`;
    }

    formModalContainer.innerHTML = `
        <header class="p-4 flex items-center border-b sticky top-0 bg-white"><h2 class="text-xl font-bold text-gray-800 text-center flex-grow">${title}</h2><button onclick="closeFormModal()"><i class="fas fa-times text-2xl text-gray-600"></i></button></header>
        <form id="data-form" class="flex-1 overflow-y-auto">
            <input type="hidden" name="formType" value="${formType}">
            <input type="hidden" name="rowId" value="${data.rowId || ''}">
            ${html}
            <div class="p-6 mt-auto bg-gray-50 border-t"><button type="submit" class="w-full bg-pink-500 hover:bg-pink-600 text-white font-bold py-3 rounded-lg">${isEdit ? 'บันทึกการแก้ไข' : 'เพิ่มข้อมูล'}</button></div>
        </form>
    `;
    formModal.classList.remove('hidden');
    document.getElementById('data-form').addEventListener('submit', handleFormSubmit);

    document.querySelectorAll('.image-upload-input').forEach(input => {
        input.addEventListener('change', handleImagePreview);
    });
}

function handleImagePreview(event) {
    const imageInput = event.target;
    const imageType = imageInput.dataset.imageType;
    const previewContainer = document.getElementById(`image-preview-${imageType.replace(/\s+/g, '-')}`);
    previewContainer.innerHTML = '';
    
    if (imageInput.files.length > 0) {
        Array.from(imageInput.files).forEach(file => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const imgWrapper = document.createElement('div');
                imgWrapper.className = 'relative';
                imgWrapper.innerHTML = `<img src="${e.target.result}" class="w-full h-24 object-cover rounded-lg shadow-md">`;
                previewContainer.appendChild(imgWrapper);
            };
            reader.readAsDataURL(file);
        });
    }
}

function getGeoLocation(inputElId) {
    const inputEl = document.getElementById(inputElId);
    const buttonEl = inputEl.nextElementSibling;
    const originalHtml = buttonEl.innerHTML;
    buttonEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    buttonEl.disabled = true;
    showMessageModal('กำลังระบุตำแหน่ง...');
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            pos => {
                inputEl.value = `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`;
                closeMessageModal();
                buttonEl.innerHTML = originalHtml;
                buttonEl.disabled = false;
            },
            err => {
                showMessageModal(`เกิดข้��ผิดพลาด: ${err.message}`);
                buttonEl.innerHTML = originalHtml;
                buttonEl.disabled = false;
            }
        );
    } else { 
        showMessageModal("เบราว์เซอร์ไม่รองรับ Geolocation");
        buttonEl.disabled = false;
    }
}

async function handleFormSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const submitButton = form.querySelector('button[type="submit"]');
    const originalButtonText = submitButton.innerHTML;
    submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลังบันทึกข้อมูล...';
    submitButton.disabled = true;

    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    const isEdit = data.rowId && data.rowId !== '';

    // 1. Collect image files to be uploaded
    const imagesToUpload = [];
    const imageInputs = form.querySelectorAll('.image-upload-input');
    imageInputs.forEach(input => {
        const imageType = input.dataset.imageType;
        Array.from(input.files).forEach(file => {
            imagesToUpload.push({ file, imageType });
        });
    });

    try {
        // 2. Save text data first
        const textDataPayload = {
            action: isEdit ? 'updateData' : 'saveData',
            payload: data,
            user: currentUser
        };
        const response = await apiCall(textDataPayload, !isEdit); 
        
        if (response.result !== 'success' || !response.rowId) {
            throw new Error(response.message || 'ไม่สามารถบันทึกข้อมูลหลักได้');
        }
        
        const savedRowId = response.rowId;

        // 3. If there are images, upload them one by one
        if (imagesToUpload.length > 0) {
            for (let i = 0; i < imagesToUpload.length; i++) {
                const { file, imageType } = imagesToUpload[i];
                submitButton.innerHTML = `<i class="fas fa-spinner fa-spin"></i> กำลังอัปโหลดรูป ${i + 1}/${imagesToUpload.length}...`;
                
                const reader = new FileReader();
                const fileReadPromise = new Promise((resolve, reject) => {
                    reader.onload = () => resolve(reader.result.split(',')[1]);
                    reader.onerror = reject;
                });
                reader.readAsDataURL(file);
                const base64Data = await fileReadPromise;

                const imagePayload = {
                    action: 'uploadImage',
                    rowId: savedRowId,
                    user: currentUser,
                    image: {
                        fileName: file.name,
                        mimeType: file.type,
                        data: base64Data,
                        imageType: imageType
                    }
                };
                
                const imageResponse = await apiCall(imagePayload);
                if (imageResponse.result !== 'success') {
                    console.warn(`Failed to upload image ${file.name}: ${imageResponse.message}`);
                    showMessageModal(`อัปโหลดรูป ${file.name} ไม่สำเร็จ: ${imageResponse.message}`);
                }
            }
        }

        // 4. Finalize
        showMessageModal(isEdit ? 'แก้ไขข้อมูลสำเร็จ!' : 'บันทึกข้อมูลและรูปภาพสำเร็จ!');
        closeFormModal();
        
        // Force a full data refresh and then navigate
        await fetchData(true); 
        const updatedItem = allData.find(item => item.rowId === savedRowId);
        showPage(updatedItem ? 'detail' : 'feed', updatedItem);


    } catch (error) {
        console.error("Submit Error:", error);
        showMessageModal(`เกิดข้อผิดพลาดในการบันทึก: ${error.message}`);
    } finally {
        submitButton.innerHTML = originalButtonText;
        submitButton.disabled = false;
    }
}

async function fetchData(force = false) {
    if (!currentUser) return;
    if (allData.length > 0 && !force) {
        renderAllTabs();
        return;
    }
    
    try {
        const response = await apiCall({ action: 'getData', user: currentUser }, true);
        if(response.result === 'success' && Array.isArray(response.data)) {
            allData = response.data;
            geocodeAndCacheProvinces(); // Start geocoding in the background
            renderDashboard();
            const currentPage = document.querySelector('.page-content.active')?.id.replace('-page','');
            if(currentPage === 'feed') {
               renderFeedPage();
            }
        } else { throw new Error(response.message || "Invalid data format from server"); }
    } catch (error) {
        console.error('Error fetching data:', error);
        const emptyFeedEl = document.getElementById('empty-feed');
        if(emptyFeedEl) {
            emptyFeedEl.textContent = 'ไม่สามารถโหลดข้อมูลได้';
        }
    }
}

async function initMap() {
    console.log("initMap called.");
    const page = document.getElementById('map-page');
    page.innerHTML = `<div id="map" class="h-full w-full rounded-lg shadow-md min-h-[calc(100vh-180px)]"></div>`;

    if (typeof google === 'undefined' || typeof google.maps === 'undefined') {
        console.error("Google Maps API not loaded yet.");
        page.innerHTML = `<div class="flex items-center justify-center h-full text-red-500">ไม่สามารถโหลด Google Maps API ได้.</div>`;
        return;
    }
    
    const { Map } = await google.maps.importLibrary("maps");
    const { AdvancedMarkerElement } = await google.maps.importLibrary("marker");

    const mapOptions = {
        center: { lat: 13.7563, lng: 100.5018 },
        zoom: 6,
        mapId: "ADVANCE_FERTILIZER_MAP",
        mapTypeControl: false,
        streetViewControl: false,
    };

    map = new Map(document.getElementById('map'), mapOptions);

    const legend = document.createElement('div');
    legend.className = 'info legend bg-white p-2 rounded-md shadow-lg';
    legend.innerHTML += '<h4 class="font-bold mb-1">สัญลักษณ์</h4>';
    
    const types = {
        'ร้านค้า': '#3b82f6',
        'เกษตรกร': '#22c55e',
        'แปลงทดลอง': '#a855f7',
        'ตำแหน่งของคุณ': '#f54e42'
    };
    
    const createPinSvg = (color) => {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '28');
        svg.setAttribute('height', '40');
        svg.setAttribute('viewBox', '0 0 384 512');
        svg.innerHTML = `<path fill="${color}" d="M172.268 501.67C26.97 291.031 0 269.413 0 192 0 85.961 85.961 0 192 0s192 85.961 192 192c0 77.413-26.97 99.031-172.268 309.67a24 24 0 0 1-35.464 0zM192 256a64 64 0 1 0 0-128 64 64 0 1 0 0 128z"/>`;
        return svg;
    };


    for (const [key, value] of Object.entries(types)) {
        const legendItem = document.createElement('div');
        legendItem.className = 'flex items-center my-1';
        const iconContainer = document.createElement('div');
        iconContainer.className = 'w-5 h-7 flex items-center justify-center mr-2';
        iconContainer.appendChild(createPinSvg(value));
        legendItem.appendChild(iconContainer);
        const text = document.createElement('span');
        text.textContent = key;
        legendItem.appendChild(text);
        legend.appendChild(legendItem);
    }
    map.controls[google.maps.ControlPosition.RIGHT_BOTTOM].push(legend);

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {
            const userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            map.setCenter(userLocation);
            map.setZoom(13);
            
            new AdvancedMarkerElement({
                position: userLocation,
                map: map,
                title: 'ตำแหน่งของคุณ',
                content: createPinSvg(types['ตำแหน่งของคุณ']),
            });
        });
    }

    if (allData.length > 0) {
        plotDataOnMap(AdvancedMarkerElement, createPinSvg);
    }
}

function plotDataOnMap(AdvancedMarkerElement, createPinSvg) {
    if (!map) {
        console.log("plotDataOnMap called, but map object is missing.");
        return;
    }
    console.log("plotDataOnMap called. Clearing existing markers.");

    markers.forEach(marker => marker.setMap(null));
    markers = [];

    const infoWindow = new google.maps.InfoWindow();
    
    const iconColors = { 'ร้านค้า': '#3b82f6', 'เกษตรกร': '#22c55e', 'แปลงทดลอง': '#a855f7' };

    allData.forEach((item, index) => {
        const gps = item['GPS'] || item['GPSแปลง'];
        if (gps && String(gps).includes(',')) {
            const [lat, lon] = String(gps).split(',').map(s => parseFloat(s.trim()));
            if (!isNaN(lat) && !isNaN(lon)) {
                let popupContent = '';
                let title = 'N/A';

                if (item.formType === 'ร้านค้า') {
                    title = item['ชื่อร้านค้า'] || 'N/A';
                    popupContent = `<b>${title}</b>`;
                } else if (item.formType === 'เกษตรกร') {
                    title = item['ชื่อเกษตรกร'] || 'N/A';
                    const storeAffiliation = item['ร้านค้าในสังกัด'] || 'ไม่มี';
                    popupContent = `<b>${title}</b><br><small>สังกัด: ${storeAffiliation}</small>`;
                } else if (item.formType === 'แปลงทดลอง') {
                    title = item['ชื่อเจ้าของสวน'] || item['พืชที่ทดลอง'] || 'N/A';
                    const farmerAffiliation = item['เกษตรกรเจ้าของแปลง'] || 'ไม่มี';
                    popupContent = `<b>${title}</b><br><small>สังกัด: ${farmerAffiliation}</small>`;
                }
                
                popupContent += `<br><a href="https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}" target="_blank" class="text-blue-600 font-bold">นำทาง</a>`;

                const color = iconColors[item.formType] || '#7f7f7f';
                
                const marker = new AdvancedMarkerElement({
                    position: { lat, lng: lon },
                    map: map,
                    content: createPinSvg(color),
                    title: String(title)
                });

                marker.addListener('click', () => {
                    infoWindow.close();
                    infoWindow.setContent(popupContent);
                    infoWindow.open(map, marker);
                });

                markers.push(marker);
            }
        }
    });
}

function showMessageModal(message) {
    const modal = document.getElementById('message-modal');
    document.getElementById('modal-message').innerText = message;
    modal.classList.remove('hidden');
}
function closeMessageModal() { document.getElementById('message-modal').classList.add('hidden'); }

// --- Initial Setup Event Listeners ---
loginForm.addEventListener('submit', handleLogin);
document.getElementById('logout-button').addEventListener('click', handleLogout);
backButton.addEventListener('click', () => showPage('feed'));

checkSession();

// === PWA INSTALLATION LOGIC ===
let deferredPrompt;
const installButton = document.getElementById('install-button');

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installButton.classList.remove('hidden');
    console.log('PWA install prompt is ready.');
});

installButton.addEventListener('click', async () => {
    installButton.classList.add('hidden');
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to the install prompt: ${outcome}`);
    deferredPrompt = null;
});

window.addEventListener('appinstalled', () => {
    installButton.classList.add('hidden');
    deferredPrompt = null;
    console.log('PWA was installed');
    showMessageModal('ติดตั้งแอปพลิเคชันเรียบร้อยแล้ว!');
});
// ==============================

// === PWA SERVICE WORKER REGISTRATION ===
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
        .then(registration => {
            console.log('ServiceWorker registration successful with scope: ', registration.scope);
        })
        .catch(err => {
            console.log('ServiceWorker registration failed: ', err);
        });
    });
}
// =======================================
