// ==========================================
// 全域設定與狀態
// ==========================================
// 請換成你自己的 GAS Web App URL
const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbzj7n9sOar-So8_Yy-7gwr5EokeqoDRJFzjWOMxBfn--AtgcERVapjitNureZF-2sYx/exec';

let currentUser = null;
const tzOffset = (new Date()).getTimezoneOffset() * 60000;
let currentDate = new Date(Date.now() - tzOffset).toISOString().split('T')[0];
let foodDatabase = { categories: [], foods: [] };
let selectedFoodBase = null;
let dietCart = [];
let macrosChartInstance = null;
let weeklyChartInstance = null;
let bodyStatsChartInstance = null;
let currentAiBase64 = null;
window.currentDailyStats = null;
window.currentWeeklyStats = null;

// ==========================================
// 核心 API 呼叫函式
// ==========================================
async function apiCall(action, payload) {
  try {
    const response = await fetch(GAS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: action, payload: payload }),
      redirect: 'follow'
    });
    return await response.json();
  } catch (error) {
    console.error('API Error:', error);
    return { success: false, message: '伺服器連線失敗：' + error.message };
  }
}

// ==========================================
// UI 控制 Helper
// ==========================================
function showView(viewId) {
  document.getElementById('auth-view').classList.add('hidden');
  document.getElementById('dashboard-view').classList.add('hidden');
  document.getElementById(viewId).classList.remove('hidden');
}

function showLoading(text = '處理中...') {
  document.getElementById('loading-text').innerText = text;
  document.getElementById('loading-overlay').classList.remove('hidden');
}

function hideLoading() {
  document.getElementById('loading-overlay').classList.add('hidden');
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) {
    if (type === 'error') alert('❌ ' + message);
    else alert('✅ ' + message);
    return;
  }
  
  const toast = document.createElement('div');
  const bgColor = type === 'success' ? 'bg-emerald-600' : (type === 'error' ? 'bg-rose-600' : 'bg-indigo-600');
  const icon = type === 'success' ? '✅' : (type === 'error' ? '⚠️' : 'ℹ️');
  
  toast.className = `transform transition-all duration-300 -translate-y-[20px] opacity-0 flex items-center gap-3 ${bgColor} text-white px-4 py-3 rounded-xl shadow-lg w-full`;
  toast.innerHTML = `<span>${icon}</span><span class="text-sm font-medium flex-1">${message}</span>`;
  container.appendChild(toast);
  
  requestAnimationFrame(() => {
    toast.classList.remove('-translate-y-[20px]', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');
  });
  
  setTimeout(() => {
    toast.classList.remove('translate-y-0', 'opacity-100');
    toast.classList.add('-translate-y-[20px]', 'opacity-0');
    setTimeout(() => { if (container.contains(toast)) container.removeChild(toast); }, 300);
  }, 3000);
}

// 動態更新 Chart.js 主題 (已優化防呆)
function updateChartTheme(isDark) {
  const textColor = isDark ? '#e5e7eb' : '#475569'; 
  const gridColor = isDark ? '#334155' : '#f1f5f9';

  if (window.Chart && Chart.defaults) {
    Chart.defaults.color = textColor;
    if (Chart.defaults.scale && Chart.defaults.scale.grid) {
      Chart.defaults.scale.grid.color = gridColor;
      Chart.defaults.scale.grid.borderColor = gridColor;
    }
  }
  
  if (window.weeklyChartInstance) window.weeklyChartInstance.update();
  if (window.bodyStatsChartInstance) window.bodyStatsChartInstance.update();
  if (window.macrosChartInstance) window.macrosChartInstance.update();
}

// ==========================================
// 初始化與事件綁定
// ==========================================
document.addEventListener('DOMContentLoaded', () => {

  // --- 0. 深色模式控制 ---
  const themeToggleBtn = document.getElementById('theme-toggle');
  const darkIcon = document.getElementById('theme-toggle-dark-icon');
  const lightIcon = document.getElementById('theme-toggle-light-icon');

  const currentTheme = localStorage.getItem('color-theme');
  if (currentTheme === 'dark' || (!currentTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
    if (lightIcon) lightIcon.classList.remove('hidden');
  } else {
    document.documentElement.classList.remove('dark');
    if (darkIcon) darkIcon.classList.remove('hidden');
  }

  updateChartTheme(document.documentElement.classList.contains('dark'));

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      darkIcon.classList.toggle('hidden');
      lightIcon.classList.toggle('hidden');
      if (document.documentElement.classList.contains('dark')) {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('color-theme', 'light');
        updateChartTheme(false);
      } else {
        document.documentElement.classList.add('dark');
        localStorage.setItem('color-theme', 'dark');
        updateChartTheme(true);
      }
    });
  }

  // --- 0.5 檢查重設密碼 Token ---
  const urlParams = new URLSearchParams(window.location.search);
  const resetEmail = urlParams.get('email');
  const resetToken = urlParams.get('token');

  if (resetEmail && resetToken) {
    document.getElementById('login-form').classList.add('hidden');
    document.getElementById('register-form').classList.add('hidden');
    document.getElementById('forgot-form').classList.add('hidden');
    document.getElementById('reset-token-email').value = resetEmail;
    document.getElementById('reset-token-temp').value = resetToken;
    document.getElementById('reset-new-password-form').classList.remove('hidden');
    window.history.replaceState({}, document.title, window.location.pathname);
  } else {
    const cachedUser = localStorage.getItem('nutriLens_user');
    const cachedTime = localStorage.getItem('nutriLens_time');
    if (cachedUser && cachedTime) {
      if (new Date().getTime() - parseInt(cachedTime) < 604800000) { 
        currentUser = JSON.parse(cachedUser);
        setTimeout(() => {
           initDashboard();
           showToast(`歡迎回來，${currentUser.username || currentUser.email.split('@')[0]}！`, 'success');
        }, 0);
      } else {
        localStorage.removeItem('nutriLens_user');
        localStorage.removeItem('nutriLens_time');
      }
    }
  }

  // --- Auth 切換邏輯 ---
  document.getElementById('go-to-register').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('login-form').classList.add('hidden');
    document.getElementById('forgot-form').classList.add('hidden');
    document.getElementById('register-form').classList.remove('hidden');
  });
  document.getElementById('go-to-login').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('register-form').classList.add('hidden');
    document.getElementById('forgot-form').classList.add('hidden');
    document.getElementById('login-form').classList.remove('hidden');
  });
  document.getElementById('go-to-forgot').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('login-form').classList.add('hidden');
    document.getElementById('forgot-form').classList.remove('hidden');
  });
  document.getElementById('go-to-login-from-forgot').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('forgot-form').classList.add('hidden');
    document.getElementById('login-form').classList.remove('hidden');
  });

  // --- 帳號登入與註冊 API ---
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    showLoading('登入中...');
    const res = await apiCall('login', { username: document.getElementById('login-username').value, password: document.getElementById('login-password').value });
    hideLoading();
    if (res.success) {
      currentUser = res.user;
      localStorage.setItem('nutriLens_user', JSON.stringify(currentUser));
      localStorage.setItem('nutriLens_time', new Date().getTime().toString());
      initDashboard();
      showToast(`歡迎回來，${currentUser.username || currentUser.email.split('@')[0]}！`);
    } else { showToast(res.message, 'error'); }
  });

  document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    showLoading('註冊中...');
    const userData = {
      username: document.getElementById('reg-username').value,
      email: document.getElementById('reg-email').value,
      password: document.getElementById('reg-password').value,
      gender: document.getElementById('reg-gender').value,
      age: document.getElementById('reg-age').value,
      height: document.getElementById('reg-height').value,
      weight: document.getElementById('reg-weight').value,
      activity_level: document.getElementById('reg-activity').value
    };
    const res = await apiCall('register', userData);
    hideLoading();
    if (res.success) {
      showToast('註冊成功！您的 TDEE 為：' + res.user.tdee + ' kcal');
      currentUser = res.user;
      localStorage.setItem('nutriLens_user', JSON.stringify(currentUser));
      localStorage.setItem('nutriLens_time', new Date().getTime().toString());
      initDashboard();
    } else { showToast(res.message, 'error'); }
  });

  document.getElementById('btn-logout').addEventListener('click', () => {
    currentUser = null;
    localStorage.removeItem('nutriLens_user');
    localStorage.removeItem('nutriLens_time');
    document.getElementById('login-form').reset();
    document.getElementById('register-form').reset();
    document.getElementById('register-form').classList.add('hidden');
    document.getElementById('login-form').classList.remove('hidden');
    showView('auth-view');
  });

  // --- 忘記密碼 ---
  document.getElementById('forgot-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    showLoading('寄發密碼重設信件中...');
    const email = document.getElementById('forgot-email').value;
    const baseUrl = window.location.href.split('?')[0];
    const res = await apiCall('forgotPassword', { email, baseUrl });
    hideLoading();
    if (res.success) {
      showToast('密碼重設信件包含認證連結已發送至您的信箱，請至信箱點擊連結更改密碼！');
      document.getElementById('forgot-form').classList.add('hidden');
      document.getElementById('login-form').classList.remove('hidden');
      document.getElementById('forgot-form').reset();
    } else { showToast(res.message, 'error'); }
  });

  document.getElementById('reset-new-password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    showLoading('更新密碼中...');
    const email = document.getElementById('reset-token-email').value;
    const tempPass = document.getElementById('reset-token-temp').value;
    const newPass = document.getElementById('reset-new-password').value;
    const res = await apiCall('updatePassword', { email, tempPass, newPass });
    hideLoading();
    if (res.success) {
      showToast('密碼重設成功！請使用新密碼重新登入。');
      document.getElementById('reset-new-password-form').classList.add('hidden');
      document.getElementById('login-form').classList.remove('hidden');
      document.getElementById('reset-new-password-form').reset();
    } else { showToast(res.message, 'error'); }
  });

  // --- 日期切換 ---
  document.getElementById('date-selector').addEventListener('change', loadDailyData);

  // --- Modal 開關控制 ---
  document.getElementById('btn-open-diet').addEventListener('click', () => {
    document.getElementById('diet-modal').classList.remove('hidden');
    resetDietFormValues(false, true);
  });
  document.getElementById('btn-close-diet').addEventListener('click', () => {
    document.getElementById('diet-modal').classList.add('hidden');
    if (html5QrcodeScanner) {
       html5QrcodeScanner.pause(true);
       document.getElementById('scanner-container').classList.add('hidden');
    }
  });

  document.getElementById('btn-open-exercise').addEventListener('click', () => {
    document.getElementById('exercise-modal').classList.remove('hidden');
  });
  document.getElementById('btn-close-exercise').addEventListener('click', () => {
    document.getElementById('exercise-modal').classList.add('hidden');
  });

  // --- 運動計算邏輯 ---
  document.getElementById('tab-ex-calc').addEventListener('click', (e) => {
    document.getElementById('exercise-mode').value = 'calc';
    e.target.classList.replace('text-slate-500', 'text-emerald-600');
    e.target.classList.replace('dark:text-gray-400', 'dark:text-emerald-400');
    e.target.classList.add('bg-white', 'dark:bg-slate-600', 'shadow-sm');
    const manualTab = document.getElementById('tab-ex-manual');
    manualTab.classList.replace('text-emerald-600', 'text-slate-500');
    manualTab.classList.replace('dark:text-emerald-400', 'dark:text-gray-400');
    manualTab.classList.remove('bg-white', 'dark:bg-slate-600', 'shadow-sm');
    document.getElementById('ex-calc-container').classList.remove('hidden');
    document.getElementById('ex-manual-container').classList.add('hidden');
    const calsInput = document.getElementById('exercise-cals');
    calsInput.readOnly = true;
    calsInput.classList.add('bg-slate-50', 'dark:bg-slate-800');
    calculateExerciseCals();
  });

  document.getElementById('tab-ex-manual').addEventListener('click', (e) => {
    document.getElementById('exercise-mode').value = 'manual';
    e.target.classList.replace('text-slate-500', 'text-emerald-600');
    e.target.classList.replace('dark:text-gray-400', 'dark:text-emerald-400');
    e.target.classList.add('bg-white', 'dark:bg-slate-600', 'shadow-sm');
    const calcTab = document.getElementById('tab-ex-calc');
    calcTab.classList.replace('text-emerald-600', 'text-slate-500');
    calcTab.classList.replace('dark:text-emerald-400', 'dark:text-gray-400');
    calcTab.classList.remove('bg-white', 'dark:bg-slate-600', 'shadow-sm');
    document.getElementById('ex-calc-container').classList.add('hidden');
    document.getElementById('ex-manual-container').classList.remove('hidden');
    const calsInput = document.getElementById('exercise-cals');
    calsInput.readOnly = false;
    calsInput.classList.remove('bg-slate-50', 'dark:bg-slate-800');
    calsInput.value = '';
  });

  function calculateExerciseCals() {
    if (document.getElementById('exercise-mode')?.value !== 'calc') return;
    const met = parseFloat(document.getElementById('exercise-preset').value);
    const duration = parseFloat(document.getElementById('exercise-duration').value);
    const weight = currentUser?.weight || 60;
    if (!isNaN(met) && !isNaN(duration) && duration > 0) {
      document.getElementById('exercise-cals').value = Math.round(met * weight * (duration / 60));
    } else {
      document.getElementById('exercise-cals').value = '';
    }
  }
  document.getElementById('exercise-preset').addEventListener('change', calculateExerciseCals);
  document.getElementById('exercise-duration').addEventListener('input', calculateExerciseCals);

  // --- 飲食連動與算式 ---
  document.getElementById('diet-category').addEventListener('change', (e) => {
    const prefix = e.target.value;
    const foodSelect = document.getElementById('diet-food');
    if (prefix === 'custom') {
      document.getElementById('food-dropdown-wrapper').classList.add('hidden');
      document.getElementById('custom-food-container').classList.remove('hidden');
      document.getElementById('diet-name').value = '';
      document.getElementById('diet-cals').readOnly = false;
      document.getElementById('diet-pro').readOnly = false;
      document.getElementById('diet-carb').readOnly = false;
      document.getElementById('diet-fat').readOnly = false;
      document.getElementById('diet-amount-input').value = 100;
      document.getElementById('diet-unit-label').innerText = 'g';
      selectedFoodBase = null;
      return;
    }
    document.getElementById('food-dropdown-wrapper').classList.remove('hidden');
    document.getElementById('custom-food-container').classList.add('hidden');
    document.getElementById('diet-cals').readOnly = true;
    document.getElementById('diet-pro').readOnly = true;
    document.getElementById('diet-carb').readOnly = true;
    document.getElementById('diet-fat').readOnly = true;
    foodSelect.innerHTML = '<option value="" disabled selected>請選擇食物...</option>';
    foodDatabase.foods.filter(f => f.food_id.startsWith(prefix)).forEach(f => {
      const opt = document.createElement('option');
      opt.value = f.food_id;
      opt.textContent = `${f.name} (${f.calories}kcal/${f.serving_unit})`;
      foodSelect.appendChild(opt);
    });
    foodSelect.disabled = false;
    selectedFoodBase = null;
    resetDietFormValues(false);
  });

  document.getElementById('diet-food').addEventListener('change', (e) => {
    const food = foodDatabase.foods.find(f => f.food_id === e.target.value);
    if (!food) return;
    selectedFoodBase = food;
    document.getElementById('diet-name').value = food.name;
    let match = food.serving_unit.match(/^([\d.]+)(.*)$/);
    if (match) {
      selectedFoodBase.baseAmount = parseFloat(match[1]) || 1;
      document.getElementById('diet-unit-label').innerText = match[2] || '份';
    } else {
      selectedFoodBase.baseAmount = 1;
      document.getElementById('diet-unit-label').innerText = food.serving_unit || '份';
    }
    document.getElementById('diet-amount-input').value = selectedFoodBase.baseAmount;
    calculateMacros();
  });

  document.getElementById('diet-amount-input').addEventListener('input', calculateMacros);

  function calculateMacros() {
    if (!selectedFoodBase) return;
    const inputVal = parseFloat(document.getElementById('diet-amount-input').value) || 0;
    const ratio = inputVal / selectedFoodBase.baseAmount;
    document.getElementById('diet-cals').value = Math.round(selectedFoodBase.calories * ratio);
    document.getElementById('diet-pro').value = Math.round((selectedFoodBase.protein * ratio) * 10) / 10;
    document.getElementById('diet-carb').value = Math.round((selectedFoodBase.carbs * ratio) * 10) / 10;
    document.getElementById('diet-fat').value = Math.round((selectedFoodBase.fat * ratio) * 10) / 10;
    const unit = document.getElementById('diet-unit-label').innerText;
    document.getElementById('diet-amount').value = `${inputVal}${unit}`;
  }

  function resetDietFormValues(isCustom = false, fullReset = false) {
    if (!isCustom) {
      document.getElementById('diet-amount-input').value = '';
      document.getElementById('diet-unit-label').innerText = '-';
      document.getElementById('diet-cals').value = '';
      document.getElementById('diet-pro').value = '';
      document.getElementById('diet-carb').value = '';
      document.getElementById('diet-fat').value = '';
    }
    document.getElementById('diet-amount').value = '';
    if(fullReset) {
       document.getElementById('food-select-container').classList.remove('hidden');
       document.getElementById('custom-food-container').classList.add('hidden');
       document.getElementById('food-dropdown-wrapper').classList.remove('hidden');
       document.getElementById('diet-category').value = '';
       document.getElementById('diet-food').disabled = true;
       document.getElementById('diet-cals').readOnly = true;
       document.getElementById('diet-pro').readOnly = true;
       document.getElementById('diet-carb').readOnly = true;
       document.getElementById('diet-fat').readOnly = true;
       document.getElementById('diet-global-search').value = '';
       document.getElementById('diet-search-results').classList.add('hidden');
       dietCart = [];
       renderDietCart();
    }
  }

  // --- 全域食物搜尋 ---
  const searchInput = document.getElementById('diet-global-search');
  const searchResults = document.getElementById('diet-search-results');
  searchInput.addEventListener('input', (e) => {
    const keyword = e.target.value.trim().toLowerCase();
    if (!keyword) { searchResults.classList.add('hidden'); return; }
    const matches = foodDatabase.foods.filter(f => f.name.toLowerCase().includes(keyword)).slice(0, 15);
    if (matches.length > 0) {
      searchResults.innerHTML = matches.map(f => `
        <div class="px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-600 cursor-pointer text-sm border-b border-slate-100 dark:border-slate-600 search-item" data-id="${f.food_id}">
          <div class="font-bold text-slate-800 dark:text-gray-100">${f.name}</div>
          <div class="text-[11px] text-slate-500 dark:text-gray-400 mt-0.5">🔥 ${f.calories} kcal / ${f.serving_unit}</div>
        </div>`).join('');
    } else {
      searchResults.innerHTML = '<div class="px-4 py-4 text-sm text-slate-500 dark:text-gray-400 text-center">找不到相符的食物 😢</div>';
    }
    searchResults.classList.remove('hidden');
  });

  searchResults.addEventListener('click', (e) => {
    const itemEl = e.target.closest('.search-item');
    if (!itemEl) return;
    const food = foodDatabase.foods.find(f => f.food_id === itemEl.getAttribute('data-id'));
    if (food) {
      selectedFoodBase = food;
      searchInput.value = food.name;
      searchResults.classList.add('hidden');
      document.getElementById('diet-category').value = '';
      document.getElementById('diet-food').innerHTML = '<option value="" disabled selected>-- 從上方搜尋帶入 --</option>';
      document.getElementById('diet-food').disabled = true;
      document.getElementById('custom-food-container').classList.add('hidden');
      document.getElementById('food-dropdown-wrapper').classList.remove('hidden');
      document.getElementById('diet-name').value = food.name;

      let match = food.serving_unit.match(/^([\d.]+)(.*)$/);
      if (match) {
        selectedFoodBase.baseAmount = parseFloat(match[1]) || 1;
        document.getElementById('diet-unit-label').innerText = match[2] || '份';
      } else {
        selectedFoodBase.baseAmount = 1;
        document.getElementById('diet-unit-label').innerText = food.serving_unit || '份';
      }
      document.getElementById('diet-amount-input').value = selectedFoodBase.baseAmount;
      document.getElementById('diet-cals').readOnly = true;
      document.getElementById('diet-pro').readOnly = true;
      document.getElementById('diet-carb').readOnly = true;
      document.getElementById('diet-fat').readOnly = true;
      calculateMacros();
    }
  });

  // --- 掃碼辨識食品 ---
  let html5QrcodeScanner = null;
  const btnOpenScanner = document.getElementById('btn-open-scanner');
  const btnCloseScanner = document.getElementById('btn-close-scanner');
  const scannerContainer = document.getElementById('scanner-container');

  if (btnOpenScanner && scannerContainer) {
    btnOpenScanner.addEventListener('click', () => {
      scannerContainer.classList.remove('hidden');
      if (!html5QrcodeScanner) {
        html5QrcodeScanner = new Html5QrcodeScanner(
          "reader", { fps: 10, qrbox: { width: 250, height: 150 }, aspectRatio: 1.0 }, false
        );
        html5QrcodeScanner.render(async (decodedText, decodedResult) => {
          html5QrcodeScanner.pause(true); 
          showLoading('正在從食品資料庫抓取營養素...');
          try {
            const response = await fetch(`https://world.openfoodfacts.org/api/v0/product/${decodedText}.json`);
            const data = await response.json();
            hideLoading();
            if (data.status === 1 && data.product && data.product.nutriments) {
              const product = data.product;
              const nutriments = product.nutriments;
              document.getElementById('diet-category').value = 'custom';
              document.getElementById('diet-category').dispatchEvent(new Event('change'));
              const productName = product.product_name_zh || product.product_name || '掃描商品';
              document.getElementById('diet-name').value = productName;
              const cals = nutriments['energy-kcal_100g'] || (nutriments['energy_100g'] ? nutriments['energy_100g'] / 4.184 : 0);
              document.getElementById('diet-amount-input').value = 100;
              document.getElementById('diet-unit-label').innerText = 'g';
              document.getElementById('diet-cals').value = Math.round(cals);
              document.getElementById('diet-pro').value = Number(nutriments['proteins_100g'] || 0).toFixed(1);
              document.getElementById('diet-carb').value = Number(nutriments['carbohydrates_100g'] || 0).toFixed(1);
              document.getElementById('diet-fat').value = Number(nutriments['fat_100g'] || 0).toFixed(1);
              showToast(`✅ 成功載入：${productName}`);
              scannerContainer.classList.add('hidden'); 
              html5QrcodeScanner.resume(); 
            } else {
              showToast('資料庫找不到此商品，請確認是否為市售包裝食品', 'error');
              html5QrcodeScanner.resume();
            }
          } catch (err) {
            hideLoading();
            showToast('API 連線失敗，請稍後再試', 'error');
            html5QrcodeScanner.resume();
          }
        }, (errorMessage) => { /* 忽略背景掃描失敗 */ });
      } else {
        html5QrcodeScanner.resume();
      }
    });
  }

  if (btnCloseScanner && scannerContainer) {
    btnCloseScanner.addEventListener('click', () => {
      scannerContainer.classList.add('hidden');
      if (html5QrcodeScanner) html5QrcodeScanner.pause(true);
    });
  }

  // --- 購物車與紀錄存取 ---
  window.renderDietCart = function () {
    const list = document.getElementById('diet-cart-list');
    const container = document.getElementById('diet-cart-container');
    const count = document.getElementById('diet-cart-count');
    list.innerHTML = '';
    count.innerText = dietCart.length;

    if (dietCart.length === 0) { container.classList.add('hidden'); return; }
    container.classList.remove('hidden');

    dietCart.forEach((item, index) => {
      const mealLabel = { 'Breakfast': '早餐', 'Lunch': '午餐', 'Dinner': '晚餐', 'Snack': '點心' }[item.mealType] || item.mealType;
      list.innerHTML += `
        <li class="flex justify-between items-center bg-slate-50 dark:bg-slate-700 p-2 rounded-lg border border-slate-100 dark:border-slate-600">
          <div>
            <p class="text-sm font-bold text-slate-700 dark:text-gray-100">
              <span class="text-[10px] bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-gray-300 px-1 py-0.5 rounded mr-1">${mealLabel}</span>
              ${item.foodName} <span class="text-xs text-indigo-500 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-1 rounded ml-1">${item.amount}</span>
            </p>
            <p class="text-[10px] text-slate-500 dark:text-gray-400 uppercase mt-0.5">P: ${item.protein} | C: ${item.carbs} | F: ${item.fat}</p>
          </div>
          <div class="flex items-center gap-3">
            <span class="text-sm font-black text-rose-500">${item.calories} <span class="text-[10px]">kcal</span></span>
            <button type="button" class="text-slate-400 hover:text-red-500 text-xs px-2 py-1" onclick="removeDietCartItem(${index})">✕</button>
          </div>
        </li>`;
    });
  };

  window.removeDietCartItem = function (index) {
    dietCart.splice(index, 1);
    renderDietCart();
  };

  document.getElementById('btn-add-to-cart').addEventListener('click', () => {
    const foodName = document.getElementById('diet-name').value;
    const cals = document.getElementById('diet-cals').value;
    if (!foodName || !cals) { showToast('請先選擇食物與份量！', 'error'); return; }

    const isAi = document.getElementById('diet-is-ai').value === 'true';
    const isCustom = document.getElementById('diet-category').value === 'custom';
    let finalAmount = document.getElementById('diet-amount').value;
    
    if (isAi || isCustom || document.getElementById('diet-global-search').value.trim() !== '') {
      const u = document.getElementById('diet-unit-label').innerText;
      const v = document.getElementById('diet-amount-input').value;
      finalAmount = `${v}${u}`;
    }

    dietCart.push({
      mealType: document.getElementById('diet-meal').value,
      foodName: foodName,
      amount: finalAmount,
      calories: cals,
      protein: document.getElementById('diet-pro').value,
      carbs: document.getElementById('diet-carb').value,
      fat: document.getElementById('diet-fat').value,
      isAiScanned: isAi
    });

    renderDietCart();
    resetDietFormValues(true, false);
    document.getElementById('diet-global-search').value = '';
    document.getElementById('diet-category').value = '';
    document.getElementById('diet-name').value = '';
    document.getElementById('custom-food-container').classList.add('hidden');
    document.getElementById('food-dropdown-wrapper').classList.remove('hidden');
    document.getElementById('diet-food').disabled = true;
    document.getElementById('diet-food').innerHTML = '<option value="" disabled selected>請先選擇大分類...</option>';
    selectedFoodBase = null;
  });

  document.getElementById('btn-submit-diet-cart').addEventListener('click', async (e) => {
    if (dietCart.length === 0) return;
    const btn = e.target;
    btn.disabled = true;
    const oldText = btn.innerText;
    btn.innerText = '⏳ 處理中...';
    showLoading('批次儲存中...');

    const res = await apiCall('addDietLogsBatch', { userId: currentUser.user_id, date: currentDate, logs: dietCart });
    hideLoading();
    btn.disabled = false;
    btn.innerText = oldText;

    if (res.success) {
      document.getElementById('diet-modal').classList.add('hidden');
      if(html5QrcodeScanner) html5QrcodeScanner.pause(true);
      document.getElementById('add-diet-form').reset();
      dietCart = [];
      showToast('紀錄已成功批次儲存！');
      loadDailyData();
    } else {
      showToast(res.message, 'error');
    }
  });

  document.getElementById('add-exercise-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const isCalc = document.getElementById('exercise-mode').value === 'calc';
    let exName = '';
    if (isCalc) {
      const sel = document.getElementById('exercise-preset');
      if (!sel.value) { showToast('請選擇運動項目！', 'error'); return; }
      exName = sel.options[sel.selectedIndex].text.replace(/^.*?\s+/, '');
    } else {
      exName = document.getElementById('exercise-name').value;
    }
    if (!exName) { showToast('請填寫或選擇運動項目！', 'error'); return; }

    showLoading('儲存運動中...');
    const payload = {
      userId: currentUser.user_id, date: currentDate, type: exName,
      duration: document.getElementById('exercise-duration').value,
      calories: document.getElementById('exercise-cals').value
    };

    const res = await apiCall('addExerciseLog', payload);
    hideLoading();

    if (res.success) {
      document.getElementById('exercise-modal').classList.add('hidden');
      document.getElementById('add-exercise-form').reset();
      document.getElementById('tab-ex-calc').click();
      showToast('運動紀錄新增成功！');
      loadDailyData();
    } else {
      showToast(res.message, 'error');
    }
  });

  // --- 體態趨勢追蹤 (含自動重新載入 TDEE) ---
  const btnOpenBodyStats = document.querySelectorAll('#btn-open-bodystat');
  const btnCloseBodyStat = document.getElementById('btn-close-bodystat');
  const bodyStatModal = document.getElementById('bodystat-modal');

  btnOpenBodyStats.forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('bodystat-weight').value = currentUser?.weight || '';
      document.getElementById('bodystat-fat').value = '';
      bodyStatModal.classList.remove('hidden');
    });
  });

  if (btnCloseBodyStat) {
    btnCloseBodyStat.addEventListener('click', () => {
      bodyStatModal.classList.add('hidden');
    });
  }

  document.getElementById('add-bodystat-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const weight = document.getElementById('bodystat-weight').value;
    const fat = document.getElementById('bodystat-fat').value;

    showLoading('儲存體態紀錄中...');
    const res = await apiCall('addBodyStat', {
      userId: currentUser.user_id,
      date: currentDate,
      weight: weight,
      bodyFat: fat
    });
    hideLoading();

    if (res.success) {
      showToast('體態已更新！');
      document.getElementById('bodystat-modal').classList.add('hidden');
      
      // 更新目前使用者的 TDEE 等參數
      if (res.updatedUser) {
          currentUser = res.updatedUser;
      } else {
          currentUser.weight = weight;
      }
      localStorage.setItem('nutriLens_user', JSON.stringify(currentUser));
      
      loadBodyStats(); 
      loadDailyData(); 
    } else {
      showToast(res.message, 'error');
    }
  });

  // --- 目標設定 Modal ---
  document.getElementById('btn-goal-settings').addEventListener('click', () => {
    document.getElementById('goal-mode').value = 'maintain';
    document.getElementById('goal-details-container').classList.add('hidden');
    document.getElementById('goal-kg').value = '';
    document.getElementById('goal-months').value = '';
    document.getElementById('goal-modal').classList.remove('hidden');
  });
  document.getElementById('btn-close-goal').addEventListener('click', () => {
    document.getElementById('goal-modal').classList.add('hidden');
  });

  document.getElementById('goal-mode').addEventListener('change', (e) => {
    if (e.target.value === 'maintain') document.getElementById('goal-details-container').classList.add('hidden');
    else document.getElementById('goal-details-container').classList.remove('hidden');
  });

  document.getElementById('goal-setting-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const goalMode = document.getElementById('goal-mode').value;
    let targetKg = 0, targetMonths = 0;

    if (goalMode !== 'maintain') {
      targetKg = document.getElementById('goal-kg').value;
      targetMonths = document.getElementById('goal-months').value;
      if (!targetKg || !targetMonths) { showToast('請輸入期望變化的公斤數與月數預估！', 'error'); return; }
    }

    showLoading('重新精算目標中...');
    const res = await apiCall('updateUserGoal', { userId: currentUser.user_id, goalMode: goalMode, targetKg: targetKg, targetMonths: targetMonths });
    hideLoading();

    if (res.success) {
      currentUser = res.user;
      localStorage.setItem('nutriLens_user', JSON.stringify(currentUser));
      document.getElementById('goal-modal').classList.add('hidden');
      initDashboard();
      loadDailyData();
    } else {
      showToast(res.message, 'error');
    }
  });

  // --- 個人資料編輯 ---
  document.getElementById('btn-edit-profile').addEventListener('click', () => {
    document.getElementById('edit-age').value = currentUser.age || '';
    document.getElementById('edit-gender').value = currentUser.gender || 'male';
    document.getElementById('edit-height').value = currentUser.height || '';
    document.getElementById('edit-weight').value = currentUser.weight || '';
    document.getElementById('edit-activity').value = currentUser.activity_level || '1.2';
    document.getElementById('profile-modal').classList.remove('hidden');
  });
  document.getElementById('btn-close-profile').addEventListener('click', () => {
    document.getElementById('profile-modal').classList.add('hidden');
  });
  document.getElementById('edit-profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    showLoading('更新個人資料中...');
    const payload = {
      userId: currentUser.user_id, age: document.getElementById('edit-age').value,
      gender: document.getElementById('edit-gender').value, height: document.getElementById('edit-height').value,
      weight: document.getElementById('edit-weight').value, activityLevel: document.getElementById('edit-activity').value
    };
    const res = await apiCall('updateProfile', payload);
    hideLoading();
    if (res.success) {
      currentUser = res.user;
      localStorage.setItem('nutriLens_user', JSON.stringify(currentUser));
      document.getElementById('profile-modal').classList.add('hidden');
      showToast('個人資料已更新！新的 TDEE 為：' + currentUser.tdee + ' kcal');
      initDashboard();
      loadDailyData();
    } else {
      showToast(res.message, 'error');
    }
  });

  // --- AI Modal ---
  document.getElementById('btn-close-ai').addEventListener('click', () => {
    document.getElementById('ai-modal').classList.add('hidden');
    document.getElementById('ai-image-input').value = '';
    document.getElementById('ai-image-preview').classList.add('hidden');
    document.getElementById('ai-preview-container').classList.remove('hidden');
    document.getElementById('btn-submit-ai').classList.add('hidden');
    currentAiBase64 = null;
  });

  document.getElementById('btn-open-ai').addEventListener('click', (e) => {
    if (String(currentUser.plan_type).toLowerCase() !== 'premium') {
      e.preventDefault();
      showToast('此功能專屬於 Premium 帳號，請升級您的方案以解鎖 AI 拍照辨識！', 'error');
      return;
    }
    document.getElementById('ai-modal').classList.remove('hidden');
  });

  document.getElementById('ai-image-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (event) {
      const img = new Image();
      img.onload = function () {
        const MAX_SIZE = 800;
        let width = img.width, height = img.height;
        if (width > height) { if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; } } 
        else { if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; } }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        currentAiBase64 = canvas.toDataURL('image/jpeg', 0.7);
        
        document.getElementById('ai-preview-container').classList.add('hidden');
        const previewImg = document.getElementById('ai-image-preview');
        previewImg.src = currentAiBase64;
        previewImg.classList.remove('hidden');
        document.getElementById('btn-submit-ai').classList.remove('hidden');
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });

  document.getElementById('btn-submit-ai').addEventListener('click', async () => {
    if (!currentAiBase64) return;
    document.getElementById('btn-submit-ai').disabled = true;
    document.getElementById('btn-submit-ai').innerText = '⏳ AI 正在深度分析中...';
    showLoading('AI 正在分析食物...');
    
    const res = await apiCall('analyzeFoodImage', { userId: currentUser.user_id, base64Image: currentAiBase64 });
    hideLoading();
    
    document.getElementById('btn-submit-ai').disabled = false;
    document.getElementById('btn-submit-ai').innerText = '🚀 讓 AI 開始辨識';

    if (res.success) {
      document.getElementById('ai-modal').classList.add('hidden');
      const data = res.data;
      document.getElementById('diet-is-ai').value = 'true';
      document.getElementById('food-select-container').classList.add('hidden');
      document.getElementById('custom-food-container').classList.remove('hidden');
      document.getElementById('diet-name').value = data.foodName || 'AI 辨識食物';
      document.getElementById('diet-cals').readOnly = false;
      document.getElementById('diet-pro').readOnly = false;
      document.getElementById('diet-carb').readOnly = false;
      document.getElementById('diet-fat').readOnly = false;
      document.getElementById('diet-amount-input').value = 1;
      document.getElementById('diet-unit-label').innerText = data.estimatedAmount ? data.estimatedAmount.replace(/[\d\.]+/g, '').trim() || '份' : '份';
      document.getElementById('diet-amount').value = data.estimatedAmount || '1 份';
      document.getElementById('diet-cals').value = data.calories || 0;
      document.getElementById('diet-pro').value = data.protein || 0;
      document.getElementById('diet-carb').value = data.carbs || 0;
      document.getElementById('diet-fat').value = data.fat || 0;
      document.getElementById('diet-modal').classList.remove('hidden');
      showToast('✨ AI 辨識完成！請確認數值無誤後點擊儲存。');
    } else {
      showToast(res.message, 'error');
    }
  });

});

// --- 全局刪除紀錄 ---
window.showConfirmModal = function(message, onConfirmCallback) {
  const modal = document.getElementById('confirm-modal');
  const box = document.getElementById('confirm-box');
  const btnOk = document.getElementById('btn-confirm-ok');
  const btnCancel = document.getElementById('btn-confirm-cancel');
  document.getElementById('confirm-message').innerText = message;
  
  const newBtnOk = btnOk.cloneNode(true);
  const newBtnCancel = btnCancel.cloneNode(true);
  btnOk.parentNode.replaceChild(newBtnOk, btnOk);
  btnCancel.parentNode.replaceChild(newBtnCancel, btnCancel);
  
  const closeModal = () => {
    modal.classList.remove('opacity-100');
    box.classList.remove('scale-100');
    box.classList.add('scale-95');
    setTimeout(() => { modal.classList.add('hidden'); }, 300);
  };

  newBtnCancel.addEventListener('click', closeModal);
  newBtnOk.addEventListener('click', () => { closeModal(); onConfirmCallback(); });
  
  modal.classList.remove('hidden');
  requestAnimationFrame(() => {
    modal.classList.add('opacity-100');
    box.classList.remove('scale-95');
    box.classList.add('scale-100');
  });
};

window.deleteLogEntry = function (logId, logType) {
  window.showConfirmModal('確定要刪除這筆紀錄嗎？(雲端紀錄也將同步刪除)', async () => {
    const res = await apiCall('deleteLog', { logId, logType });
    if (!res.success) {
      showToast('與伺服器同步刪除失敗', 'error');
    } else {
      showToast('紀錄已同步刪除！');
      loadDailyData();
    }
  });
};

// ==========================================
// Dashboard 資料載入與圖表渲染
// ==========================================
function initDashboard() {
  showView('dashboard-view');
  document.getElementById('user-greeting').innerText = `Hi, ${currentUser.username || currentUser.email.split('@')[0]}`;
  document.getElementById('date-selector').value = currentDate;
  
  const aiBtn = document.getElementById('btn-open-ai');
  if (String(currentUser.plan_type).toLowerCase() !== 'premium') aiBtn.classList.add('opacity-50', 'grayscale');
  else aiBtn.classList.remove('opacity-50', 'grayscale');

  loadDailyData();
  loadFoodDatabase();
  loadBodyStats();
}

async function loadFoodDatabase() {
  const res = await apiCall('getFoodData', {});
  if (res.success) {
    foodDatabase = res.data;
    const catSelect = document.getElementById('diet-category');
    catSelect.innerHTML = '<option value="" disabled selected>請選擇大分類...</option>';
    foodDatabase.categories.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat.prefix;
      opt.textContent = `${cat.name} (${cat.prefix})`;
      catSelect.appendChild(opt);
    });
    catSelect.appendChild(new Option('✍️ 自訂其他食物', 'custom'));
  }
}

async function loadBodyStats() {
  const res = await apiCall('getBodyStats', { userId: currentUser.user_id, days: 30 });
  if (res.success) renderBodyStatsChart(res.stats);
}

// 已修復單點資料畫不出圖表的問題 (pointRadius 強制顯示)
function renderBodyStatsChart(stats) {
  const ctx = document.getElementById('bodyStatsChart');
  if (!ctx) return;
  if (window.bodyStatsChartInstance) window.bodyStatsChartInstance.destroy();

  // 確保依照日期從小到大排序
  stats.sort((a, b) => new Date(a.date) - new Date(b.date));

  const labels = stats.map(s => {
    const d = new Date(s.date);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  });
  
  const weights = stats.map(s => s.weight);
  const fats = stats.map(s => s.body_fat);

  // 防呆：如果只有一筆資料，複製一個點讓它畫成水平線
  if (stats.length === 1) {
    labels.push(labels[0]);
    weights.push(weights[0]);
    fats.push(fats[0]);
  }

  window.bodyStatsChartInstance = new Chart(ctx.getContext('2d'), {
    type: 'line',
    data: {
      labels: labels.length > 0 ? labels : ['無資料'],
      datasets: [
        {
          label: '體重 (kg)',
          data: weights.length > 0 ? weights : [0],
          borderColor: '#6366f1',
          backgroundColor: '#6366f120',
          yAxisID: 'y',
          tension: 0.3,
          fill: true,
          pointRadius: 4, 
          pointBackgroundColor: '#6366f1'
        },
        {
          label: '體脂率 (%)',
          data: fats.length > 0 ? fats : [0],
          borderColor: '#f43f5e',
          backgroundColor: 'transparent',
          yAxisID: 'y1',
          tension: 0.3,
          borderDash: [5, 5],
          pointRadius: 4,
          pointBackgroundColor: '#f43f5e'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: true, position: 'top', labels: { boxWidth: 12, font: {size: 10} } } },
      scales: {
        y: { type: 'linear', display: true, position: 'left', title: { display: false } },
        y1: { type: 'linear', display: true, position: 'right', grid: { drawOnChartArea: false }, title: { display: false } }
      }
    }
  });
}

async function loadDailyData() {
  currentDate = document.getElementById('date-selector').value;
  showLoading('載入資料中...');

  const res = await apiCall('getDailyStats', { userId: currentUser.user_id, targetDate: currentDate });
  if (res.success) {
    window.currentDailyStats = res.stats;
    updateDashboardUI(window.currentDailyStats);

    const weekRes = await apiCall('getWeeklyStats', { userId: currentUser.user_id, targetDate: currentDate });
    hideLoading();
    if (weekRes.success) {
      window.currentWeeklyStats = weekRes.stats;
      renderWeeklyChart(window.currentWeeklyStats);
    }
  } else {
    hideLoading();
    showToast(res.message, 'error');
  }
}

function renderWeeklyChart(weeklyStats) {
  const ctxWeek = document.getElementById('weeklyChart');
  if (!ctxWeek) return;
  if (window.weeklyChartInstance) window.weeklyChartInstance.destroy();

  const labels = weeklyStats.map(s => s.label);
  const netCals = weeklyStats.map(s => s.in - s.out);

  window.weeklyChartInstance = new Chart(ctxWeek.getContext('2d'), {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        data: netCals,
        backgroundColor: netCals.map(v => v > 0 ? '#6366f1' : '#10b981'),
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, grid: { borderDash: [4, 4] }, border: { display: false } },
        x: { grid: { display: false }, border: { display: false } }
      }
    }
  });
}

function updateDashboardUI(stats) {
  const targetCals = currentUser.target_calories || 2000;
  const calsIn = stats.caloriesIn;
  const calsOut = stats.caloriesOut;
  const remaining = targetCals - calsIn + calsOut;

  document.getElementById('cals-tdee').innerText = currentUser.tdee || 2000;
  document.getElementById('cals-target').innerText = targetCals;
  document.getElementById('cals-in').innerText = calsIn;
  document.getElementById('cals-out').innerText = calsOut;

  const remainingEl = document.getElementById('cals-remaining');
  remainingEl.innerText = remaining;
  if (remaining < 0) remainingEl.className = 'text-rose-500';
  else remainingEl.className = 'text-slate-800 dark:text-gray-100';

  const progress = Math.min((calsIn / (targetCals + calsOut)) * 100, 100) || 0;
  document.getElementById('cals-progress').style.width = `${progress}%`;
  document.getElementById('cals-progress').className = progress > 100 ? 'h-full bg-rose-500 transition-all duration-500' : 'h-full bg-indigo-500 transition-all duration-500';

  document.getElementById('macro-protein').innerText = stats.protein;
  document.getElementById('macro-carbs').innerText = stats.carbs;
  document.getElementById('macro-fat').innerText = stats.fat;

  const totalMacros = stats.protein + stats.carbs + stats.fat;
  document.getElementById('macro-total').innerText = totalMacros > 0 ? `${Math.round(totalMacros)}g` : '0g';

  if (totalMacros > 0) {
    document.getElementById('bar-protein').style.width = `${(stats.protein / totalMacros) * 100}%`;
    document.getElementById('bar-carbs').style.width = `${(stats.carbs / totalMacros) * 100}%`;
    document.getElementById('bar-fat').style.width = `${(stats.fat / totalMacros) * 100}%`;
  } else {
    document.getElementById('bar-protein').style.width = '0%';
    document.getElementById('bar-carbs').style.width = '0%';
    document.getElementById('bar-fat').style.width = '0%';
  }

  const ctxMacro = document.getElementById('macroChart');
  if (ctxMacro) {
    if (window.macrosChartInstance) window.macrosChartInstance.destroy();
    window.macrosChartInstance = new Chart(ctxMacro.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: ['蛋白質', '碳水', '脂肪'],
        datasets: [{
          data: totalMacros === 0 ? [1, 1, 1] : [stats.protein, stats.carbs, stats.fat],
          backgroundColor: totalMacros === 0 ? ['#e2e8f0', '#e2e8f0', '#e2e8f0'] : ['#3b82f6', '#f59e0b', '#f43f5e'],
          borderWidth: 0,
          cutout: '75%'
        }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { tooltip: { enabled: totalMacros > 0 }, legend: { display: false } } }
    });
  }

  const goalStr = String(currentUser.goal || '');
  const progressCard = document.getElementById('goal-progress-card');
  if (goalStr.includes('減脂') || goalStr.includes('增肌')) {
    progressCard.classList.remove('hidden');
    const match = goalStr.match(/(減脂|增肌)\s*([\d\.]+)kg/);
    if (match && match[2]) {
      const kg = parseFloat(match[2]);
      const totalDeficit = kg * 7700;
      document.getElementById('goal-progress-title').innerText = goalStr;
      document.getElementById('goal-total-deficit').innerText = totalDeficit;
      document.getElementById('goal-daily-deficit').innerText = Math.abs((currentUser.tdee || 2000) - currentUser.target_calories);
      
      const isLose = match[1] === '減脂';
      let todayAchieved = isLose ? ((currentUser.tdee || 2000) + calsOut - calsIn) : (calsIn - ((currentUser.tdee || 2000) + calsOut));
      const achievedEl = document.getElementById('goal-today-achieved');
      achievedEl.innerText = todayAchieved;
      achievedEl.className = todayAchieved >= 0 ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-rose-500 dark:text-rose-400 font-bold';
      document.getElementById('goal-total-remaining').innerText = totalDeficit - todayAchieved;
    }
  } else {
    progressCard.classList.add('hidden');
  }

  const container = document.getElementById('logs-container');
  container.innerHTML = '';
  if ((!stats.dietLogs || stats.dietLogs.length === 0) && (!stats.exerciseLogs || stats.exerciseLogs.length === 0)) {
    container.innerHTML = '<p class="text-sm text-slate-400 dark:text-gray-500 text-center py-4">尚無紀錄，點擊下方按鈕新增！</p>';
  } else {
    if (stats.dietLogs) {
      stats.dietLogs.forEach(log => {
        const aiBadge = (log.is_ai_scanned === true || log.is_ai_scanned === 'TRUE') ? '<span class="text-[10px] bg-pink-100 text-pink-600 px-2 py-0.5 rounded-full ml-2">✨ AI</span>' : '';
        container.innerHTML += `
          <div class="bg-white dark:bg-slate-700 p-3 rounded-xl border border-slate-100 dark:border-slate-600 shadow-sm flex justify-between items-center">
            <div>
              <p class="font-bold text-slate-800 dark:text-gray-100 text-sm">${log.food_name} ${aiBadge}</p>
              <p class="text-xs text-slate-400 dark:text-gray-400">${log.meal_type} • ${log.amount}</p>
            </div>
            <div class="text-right flex justify-end gap-3 items-center">
              <div>
                <p class="font-bold text-indigo-600 dark:text-indigo-400">${log.calories} kcal</p>
                <p class="text-[10px] text-slate-400 dark:text-gray-400">P:${log.protein} C:${log.carbs} F:${log.fat}</p>
              </div>
              <button onclick="window.deleteLogEntry('${log.log_id}', 'diet')" class="text-rose-300 hover:text-rose-500 transition p-1 cursor-pointer">🗑️</button>
            </div>
          </div>`;
      });
    }
    if (stats.exerciseLogs) {
      stats.exerciseLogs.forEach(log => {
        container.innerHTML += `
          <div class="bg-emerald-50 dark:bg-emerald-900/20 p-3 rounded-xl border border-emerald-100 dark:border-emerald-800 shadow-sm flex justify-between items-center">
            <div class="flex items-center gap-2">
              <span class="text-xl">🏃‍♂️</span>
              <div>
                <p class="font-bold text-emerald-800 dark:text-emerald-300 text-sm">${log.exercise_type}</p>
                <p class="text-xs text-emerald-600/70 dark:text-emerald-400/70">${log.duration_mins} 分鐘</p>
              </div>
            </div>
            <div class="text-right flex justify-end gap-3 items-center">
              <div>
                <p class="font-bold text-emerald-600 dark:text-emerald-400">-${log.calories_burned} kcal</p>
                <p class="text-[10px] text-emerald-500/70 dark:text-emerald-400/70">燃燒熱量</p>
              </div>
              <button onclick="window.deleteLogEntry('${log.log_id}', 'exercise')" class="text-emerald-400 hover:text-emerald-600 transition p-1 cursor-pointer">🗑️</button>
            </div>
          </div>`;
      });
    }
  }
}