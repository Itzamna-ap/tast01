/**
 * =================================================================
 * app.js - Advance Fertilizer PWA (ฉบับแก้ไขและปรับปรุง)
 * =================================================================
 * แก้ไขปัญหาข้อมูลลูกค้าและหมุดแผนที่ไม่แสดงผล
 * โดยปรับปรุงโครงสร้างการจัดการ State และการ Render ให้มีเสถียรภาพมากขึ้น
 */

// *** สำคัญ: ใช้ URL ของคุณที่ถูกต้อง ***
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyWYuttyt5bFw3h7jzUhEaWBpowkLikqILd5kaL0V6b_jveMP1Tdpd1gPGqJmqexcLS1g/exec";

// สถานะของแอปพลิเคชัน (State Management) - รวมข้อมูลไว้ที่เดียวเพื่อง่ายต่อการจัดการ
const appState = {
    user: null,         // ข้อมูลผู้ใช้ที่ล็อกอิน
    allData: [],        // ข้อมูลทั้งหมดที่ดึงมาจาก Backend
    activeFeedFilter: 'ร้านค้า', // ตัวกรองเริ่มต้นในหน้าลูกค้า
    feedSearchTerm: '', // คำค้นหาในหน้าลูกค้า
    currentMap: null,   // Object ของ Longdo Map
    isMapInitialized: false, // เพิ่ม state เพื่อตรวจสอบว่าแผนที่ถูกสร้างหรือยัง
};

// --- Initial Setup & Event Listeners ---

document.addEventListener('DOMContentLoaded', () => {
    console.log("App Initializing...");
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('logout-button').addEventListener('click', handleLogout);
    document.getElementById('back-button').addEventListener('click', () => showPage('dashboard'));
    setupPwaInstall();
    checkLoginStatus();
});


// --- Authentication (การยืนยันตัวตน) ---

function checkLoginStatus() {
    const storedUser = localStorage.getItem('currentUser'); // ใช้ key จากโค้ดเดิมของคุณ
    if (storedUser) {
        appState.user = JSON.parse(storedUser);
        console.log("User found in localStorage:", appState.user);
        showView('main-app-view');
        fetchDataAndRender();
    } else {
        console.log("No user found. Showing login view.");
        showView('login-view');
    }
}

async function handleLogin(event) {
    event.preventDefault();
    showLoading('กำลังเข้าสู่ระบบ...');
    const username = event.target.username.value;
    const password = event.target.password.value;
    const loginErrorEl = document.getElementById('login-error');
    loginErrorEl.textContent = '';

    try {
        const response = await postToServer({ action: 'login', username, password });
        if (response.result === 'success') {
            appState.user = response.user;
            localStorage.setItem('currentUser', JSON.stringify(response.user)); // ใช้ key เดิม
            console.log("Login successful:", appState.user);
            showView('main-app-view');
            fetchDataAndRender();
        } else {
            loginErrorEl.textContent = response.message || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';
        }
    } catch (error) {
        console.error("Login Error:", error);
        loginErrorEl.textContent = 'เกิดข้อผิดพลาดในการเชื่อมต่อ';
    } finally {
        hideLoading();
    }
}

function handleLogout() {
    localStorage.removeItem('currentUser');
    appState.user = null;
    appState.allData = [];
    if (appState.currentMap) {
        try { appState.currentMap.destroy(); } catch(e) { console.error(e); }
        appState.currentMap = null;
        appState.isMapInitialized = false;
    }
    showView('login-view');
    // ล้างข้อมูลในหน้าต่างๆ
    document.getElementById('dashboard-page').innerHTML = '';
    document.getElementById('feed-page').innerHTML = '';
    document.getElementById('map-page').innerHTML = '';
}


// --- Data Fetching (การดึงข้อมูล) ---

async function fetchDataAndRender() {
    showLoading('กำลังโหลดข้อมูล...');
    try {
        const response = await postToServer({ action: 'getData', user: appState.user });
        if (response.result === 'success' && Array.isArray(response.data)) {
            appState.allData = response.data;
            console.log("Data fetched successfully:", appState.allData.length, "records");
            // แสดงหน้า Dashboard เป็นหน้าแรกเสมอหลังดึงข้อมูล
            showPage('dashboard');
        } else {
            showMessageModal('ไม่สามารถโหลดข้อมูลได้: ' + (response.message || 'รูปแบบข้อมูลไม่ถูกต้อง'));
        }
    } catch (error) {
        console.error("Fetch Data Error:", error);
        showMessageModal('เกิดข้อผิดพลาดในการเชื่อมต่อเพื่อดึงข้อมูล');
    } finally {
        hideLoading();
    }
}


// --- Page Navigation (การเปลี่ยนหน้า) ---

function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
}

function showPage(pageId) {
    console.log(`Navigating to page: ${pageId}`);
    document.querySelectorAll('.page-content').forEach(p => p.classList.remove('active'));
    const targetPage = document.getElementById(`${pageId}-page`);
    if (targetPage) {
        targetPage.classList.add('active');
    }

    updateHeader(pageId);
    updateBottomNav(pageId);

    switch (pageId) {
        case 'dashboard':
            renderDashboardPage();
            break;
        case 'feed':
            renderFeedPage();
            break;
        case 'map':
            renderMapPage(); // เรียกฟังก์ชันแผนที่ที่ปรับปรุงใหม่
            break;
    }
}

function updateHeader(pageId) {
    const titleEl = document.getElementById('header-title');
    const backButton = document.getElementById('back-button');
    titleEl.textContent = { dashboard: 'ภาพรวม', feed: 'ข้อมูลลูกค้า', map: 'แผนที่', detail: 'รายละเอียด' }[pageId] || 'ภาพรวม';
    backButton.classList.toggle('hidden', pageId !== 'detail');
}

function updateBottomNav(pageId) {
    document.querySelectorAll('.bottom-nav-item').forEach(btn => {
        btn.dataset.active = btn.getAttribute('onclick').includes(`'${pageId}'`);
    });
}


// --- Page Rendering (การแสดงผลแต่ละหน้า) ---

function renderDashboardPage() {
    const container = document.getElementById('dashboard-page');
    if (appState.allData.length === 0) {
        container.innerHTML = `<div class="text-center text-gray-500 mt-8">ยังไม่มีข้อมูล...</div>`;
        return;
    }
    const storeCount = appState.allData.filter(d => d.formType === 'ร้านค้า').length;
    const farmerCount = appState.allData.filter(d => d.formType === 'เกษตรกร').length;
    const trialCount = appState.allData.filter(d => d.formType === 'แปลงทดลอง').length;

    container.innerHTML = `
        <div class="grid grid-cols-3 gap-4 mb-6">
            <div class="bg-blue-100 text-blue-800 p-4 rounded-lg text-center"><div class="text-3xl font-bold">${storeCount}</div><div class="text-sm">ร้านค้า</div></div>
            <div class="bg-green-100 text-green-800 p-4 rounded-lg text-center"><div class="text-3xl font-bold">${farmerCount}</div><div class="text-sm">เกษตรกร</div></div>
            <div class="bg-purple-100 text-purple-800 p-4 rounded-lg text-center"><div class="text-3xl font-bold">${trialCount}</div><div class="text-sm">แปลงทดลอง</div></div>
        </div>
        <div class="bg-white p-4 rounded-lg shadow"><h2 class="text-lg font-bold mb-4">สัดส่วนข้อมูล</h2><canvas id="summaryChart"></canvas></div>`;

    const ctx = document.getElementById('summaryChart').getContext('2d');
    // ทำลาย chart เก่าก่อนสร้างใหม่ (ป้องกัน memory leak)
    if (window.doughnutChartInstance) window.doughnutChartInstance.destroy();
    window.doughnutChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: ['ร้านค้า', 'เกษตรกร', 'แปลงทดลอง'], datasets: [{ data: [storeCount, farmerCount, trialCount], backgroundColor: ['#3b82f6', '#10b981', '#8b5cf6'] }] },
        options: { responsive: true, plugins: { legend: { position: 'top' } } }
    });
}

/**
 * ⭐ [แก้ไข] ฟังก์ชันแสดงผลหน้าข้อมูลลูกค้า (Feed)
 * ใช้โครงสร้างที่เรียบง่ายขึ้น โดยมี container แค่อันเดียว
 */
function renderFeedPage() {
    const container = document.getElementById('feed-page');
    // สร้างโครงสร้าง HTML หลักของหน้านี้ (ถ้ายังไม่มี) เพื่อป้องกันการสร้างซ้ำซ้อน
    if (!container.querySelector('#feed-tabs')) {
        console.log("Building Feed Page UI for the first time.");
        container.innerHTML = `
            <div class="flex justify-between items-center mb-4"><h1 class="text-2xl font-bold text-gray-800">ข้อมูลลูกค้า</h1><button onclick="showAddFormSelection()" class="bg-pink-500 hover:bg-pink-600 text-white font-bold py-2 px-4 rounded-lg flex items-center space-x-2"><i class="fas fa-plus"></i><span>เพิ่ม</span></button></div>
            <div class="p-1 bg-gray-200 rounded-lg flex space-x-1 mb-4" id="feed-tabs">
                <button data-type="ร้านค้า" class="tab-button w-1/3 py-2 rounded-md">ร้านค้า</button>
                <button data-type="เกษตรกร" class="tab-button w-1/3 py-2 rounded-md">เกษตรกร</button>
                <button data-type="แปลงทดลอง" class="tab-button w-1/3 py-2 rounded-md">แปลงทดลอง</button>
            </div>
            <div class="relative mb-4"><input type="text" id="feedSearchInput" class="form-input pl-10" placeholder="ค้นหาด้วยชื่อ..."><i class="fas fa-search text-gray-400 absolute left-3 top-1/2 -translate-y-1/2"></i></div>
            <div id="customer-list-container" class="space-y-3"></div>`;

        container.querySelector('#feed-tabs').addEventListener('click', (event) => {
            const button = event.target.closest('.tab-button');
            if (button) {
                appState.activeFeedFilter = button.dataset.type;
                document.getElementById('feedSearchInput').value = '';
                appState.feedSearchTerm = '';
                renderCustomerList();
            }
        });
        container.querySelector('#feedSearchInput').addEventListener('input', (event) => {
            appState.feedSearchTerm = event.target.value;
            renderCustomerList();
        });
    }
    // เรียกฟังก์ชัน render รายการข้อมูล (ทำทุกครั้งที่เข้ามาหน้านี้)
    renderCustomerList();
}

/**
 * ฟังก์ชันย่อย: ทำหน้าที่แสดง "รายการ" ข้อมูลลูกค้าจริงๆ
 */
function renderCustomerList() {
    const listContainer = document.getElementById('customer-list-container');
    if (!listContainer) return;

    // อัปเดต UI ของ Tab ที่ active
    document.querySelectorAll('#feed-tabs .tab-button').forEach(btn => {
        btn.dataset.active = btn.dataset.type === appState.activeFeedFilter;
    });

    // กรองข้อมูล
    const filteredData = appState.allData.filter(item => {
        const typeMatch = item.formType === appState.activeFeedFilter;
        if (!typeMatch) return false;
        const name = item['ชื่อร้านค้า'] || item['ชื่อเกษตรกร'] || item['เกษตรกรเจ้าของแปลง'] || '';
        const searchTermMatch = name.toLowerCase().includes(appState.feedSearchTerm.toLowerCase());
        return searchTermMatch;
    });

    listContainer.innerHTML = '';
    if (filteredData.length === 0) {
        listContainer.innerHTML = `<div class="text-center text-gray-500 py-10"><i class="fas fa-box-open fa-3x mb-4"></i><p>ไม่พบข้อมูล</p></div>`;
        return;
    }

    filteredData.forEach(item => {
        const name = item['ชื่อร้านค้า'] || item['ชื่อเกษตรกร'] || item['เกษตรกรเจ้าของแปลง'] || 'ไม่มีชื่อ';
        const location = item['ที่อยู่'] || item['จังหวัด'] || 'ไม่มีข้อมูลที่อยู่';
        const card = document.createElement('div');
        card.className = "bg-white p-4 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow cursor-pointer";
        card.innerHTML = `<h3 class="font-bold text-gray-800">${name}</h3><p class="text-sm text-gray-500">${location}</p>`;
        // card.onclick = () => showPage("detail", item); // หากต้องการทำหน้า detail
        listContainer.appendChild(card);
    });
}

/**
 * ⭐ [แก้ไข] ฟังก์ชันแสดงผลแผนที่
 * ปรับปรุงให้เสถียรขึ้น ไม่ใช้ setTimeout และจัดการการสร้างแผนที่ซ้ำซ้อน
 */
function renderMapPage() {
    const mapContainer = document.getElementById('map-page');
    
    // สร้าง div สำหรับแผนที่ถ้ายังไม่มี
    if (!mapContainer.querySelector('#longdo-map-div')) {
        mapContainer.innerHTML = '<div id="longdo-map-div" style="width: 100%; height: 100%;"></div>';
    }
    
    // ถ้าแผนที่ถูกสร้างแล้ว หรือข้อมูลยังไม่มา ก็ไม่ต้องทำอะไร
    if (appState.isMapInitialized || appState.allData.length === 0) {
        if(appState.allData.length === 0) {
            mapContainer.innerHTML = '<div class="flex items-center justify-center h-full text-center text-gray-500">ไม่มีข้อมูลสำหรับแสดงบนแผนที่</div>';
        }
        return;
    }

    try {
        console.log("Initializing Longdo Map...");
        appState.currentMap = new longdo.Map({
            placeholder: document.getElementById('longdo-map-div'),
            language: 'th'
        });

        appState.isMapInitialized = true; // ตั้งค่าว่าแผนที่ถูกสร้างแล้ว

        // เพิ่มหมุดลงบนแผนที่
        let plottedCount = 0;
        appState.allData.forEach(item => {
            const gps = item['GPS'] || item['GPSแปลง'];
            if (gps && typeof gps === 'string' && gps.includes(',')) {
                const [lat, lon] = String(gps).split(',').map(s => parseFloat(s.trim()));
                if (!isNaN(lat) && !isNaN(lon)) {
                    const name = item['ชื่อร้านค้า'] || item['ชื่อเกษตรกร'] || item['เกษตรกรเจ้าของแปลง'] || 'N/A';
                    
                    // ใช้ไอคอนของ Longdo Map โดยตรงเพื่อความเสถียร
                    let iconUrl;
                    switch(item.formType) {
                        case 'ร้านค้า': iconUrl = 'https://map.longdo.com/mmmap/images/pin_mark_b.png'; break;
                        case 'เกษตรกร': iconUrl = 'https://map.longdo.com/mmmap/images/pin_mark_g.png'; break;
                        case 'แปลงทดลอง': iconUrl = 'https://map.longdo.com/mmmap/images/pin_mark_p.png'; break;
                        default: iconUrl = 'https://map.longdo.com/mmmap/images/pin_mark.png';
                    }

                    appState.currentMap.Overlays.add(new longdo.Marker(
                        { lon, lat },
                        { title: name, detail: `ประเภท: ${item.formType}`, icon: { url: iconUrl, offset: { x: 12, y: 45 } } }
                    ));
                    plottedCount++;
                }
            }
        });
        console.log(`Plotting complete. ${plottedCount} markers added.`);

    } catch (error) {
        console.error("Longdo Map Error:", error);
        mapContainer.innerHTML = `<div class="text-center text-red-500 p-8">ไม่สามารถโหลดแผนที่ได้</div>`;
        appState.isMapInitialized = false; // Reset state on error
    }
}


// --- Utility & Helper Functions ---

async function postToServer(payload) {
    // ใช้ fetch แบบมาตรฐาน
    const response = await fetch(SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
        throw new Error(`Network response was not ok: ${response.statusText}`);
    }
    return response.json();
}

function showLoading(text = 'กำลังโหลด...') {
    document.getElementById('loading-text').textContent = text;
    document.getElementById('loading-overlay').classList.remove('hidden');
}

function hideLoading() {
    document.getElementById('loading-overlay').classList.add('hidden');
}

function showMessageModal(message) {
    document.getElementById('modal-message').textContent = message;
    document.getElementById('message-modal').style.display = 'flex';
}

function closeMessageModal() {
    document.getElementById('message-modal').style.display = 'none';
}

// --- PWA Installation ---
let deferredPrompt;
function setupPwaInstall() {
    const installButton = document.getElementById('install-button');
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        installButton.classList.remove('hidden');
    });
    installButton.addEventListener('click', async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            await deferredPrompt.userChoice;
            deferredPrompt = null;
            installButton.classList.add('hidden');
        }
    });
    window.addEventListener('appinstalled', () => {
        installButton.classList.add('hidden');
    });
}

// ฟังก์ชันอื่นๆ ที่จำเป็นจากโค้ดเดิมของคุณ (ถ้ามี) สามารถนำมาวางต่อที่นี่ได้
// เช่น showAddFormSelection, generateForm, handleFormSubmit, etc.
// เนื่องจากโค้ดส่วน Form ไม่ได้ให้มา จึงไม่ได้รวมไว้ในนี้
