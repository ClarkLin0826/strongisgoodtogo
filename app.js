// ==========================================
// 全域設定與狀態
// ==========================================
// 【重要】請將下方網址替換為你最新的 Google Apps Script 部署 URL (結尾是 /exec)
const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbzj7n9sOar-So8_Yy-7gwr5EokeqoDRJFzjWOMxBfn--AtgcERVapjitNureZF-2sYx/exec';

let currentUser = null;
const tzOffset = (new Date()).getTimezoneOffset() * 60000;
let currentDate = new Date(Date.now() - tzOffset).toISOString().split('T')[0];
let foodDatabase = { categories: [], foods: [] };
let selectedFoodBase = null;
let dietCart = [];
let macrosChartInstance = null;
let weeklyChartInstance = null;
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
      // 加入這行 headers，告訴 GAS 我們傳的是純文字，避免 CORS 阻擋
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify({ action: action, payload: payload }),
      redirect: 'follow'
    });
    const result = await response.json();
    return result;
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
    setTimeout(() => {
      if (container.contains(toast)) container.removeChild(toast);
    }, 300);
  }, 3000);
}

// ==========================================
// 初始化與事件綁定 (當網頁載入完成)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {

  // --- 0.5 檢查網址是否有重設密碼的 Token ---
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
    // 清除網址參數避免重新整理又跳回
    window.history.replaceState({}, document.title, window.location.pathname);
  } else {
    // 沒有密碼重設需求，走原本的快取邏輯
    const cachedUser = localStorage.getItem('nutriLens_user');
    const cachedTime = localStorage.getItem('nutriLens_time');
    if (cachedUser && cachedTime) {
      const now = new Date().getTime();
      if (now - parseInt(cachedTime) < 604800000) { // 7 天
        currentUser = JSON.parse(cachedUser);
        setTimeout(initDashboard, 0);
      } else {
        localStorage.removeItem('nutriLens_user');
        localStorage.removeItem('nutriLens_time');
      }
    }
  }

  // --- 1. 登入/註冊/忘記密碼切換 ---
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
    document.getElementById('register-form').classList.add('hidden');
    document.getElementById('forgot-form').classList.remove('hidden');
  });

  document.getElementById('go-to-login-from-forgot').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('forgot-form').classList.add('hidden');
    document.getElementById('login-form').classList.remove('hidden');
  });

  // --- 2. 帳號登入 ---
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    showLoading('登入中...');

    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;

    const res = await apiCall('login', { username, password });
    hideLoading();

    if (res.success) {
      currentUser = res.user;
      localStorage.setItem('nutriLens_user', JSON.stringify(currentUser));
      localStorage.setItem('nutriLens_time', new Date().getTime().toString());
      initDashboard();
    } else {
      showToast(res.message, 'error');
    }
  });

  // --- 3. 帳號註冊 ---
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
      alert('註冊成功！您的 TDEE 為：' + res.user.tdee + ' kcal');
      currentUser = res.user;
      localStorage.setItem('nutriLens_user', JSON.stringify(currentUser));
      localStorage.setItem('nutriLens_time', new Date().getTime().toString());
      initDashboard();
    } else {
      showToast(res.message, 'error');
    }
  });

  // --- 4. 登出 (已修復畫面殘留問題) ---
  document.getElementById('btn-logout').addEventListener('click', () => {
    currentUser = null;
    localStorage.removeItem('nutriLens_user');
    localStorage.removeItem('nutriLens_time');

    document.getElementById('login-form').reset();
    document.getElementById('register-form').reset();
    document.getElementById('forgot-form').reset();

    document.getElementById('register-form').classList.add('hidden');
    document.getElementById('forgot-form').classList.add('hidden');
    document.getElementById('login-form').classList.remove('hidden');

    showView('auth-view');
  });

  // --- 4.5 忘記密碼 ---
  document.getElementById('forgot-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    showLoading('寄發密碼重設信件中...');

    const email = document.getElementById('forgot-email').value;
    // 取得當下網址，這樣信件裡的連結才能正確帶回這個前端環境
    const baseUrl = window.location.href.split('?')[0];
    const res = await apiCall('forgotPassword', { email, baseUrl });
    hideLoading();

    if (res.success) {
      alert('密碼重設信件包含認證連結已發送至您的信箱，請至信箱點擊連結更改密碼！');
      document.getElementById('forgot-form').classList.add('hidden');
      document.getElementById('login-form').classList.remove('hidden');
      document.getElementById('forgot-form').reset();
    } else {
      showToast(res.message, 'error');
    }
  });

  // --- 4.6 設定新密碼 ---
  document.getElementById('reset-new-password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    showLoading('更新密碼中...');

    const email = document.getElementById('reset-token-email').value;
    const tempPass = document.getElementById('reset-token-temp').value;
    const newPass = document.getElementById('reset-new-password').value;

    const res = await apiCall('updatePassword', { email, tempPass, newPass });
    hideLoading();

    if (res.success) {
      alert('密碼重設成功！請使用新密碼重新登入。');
      document.getElementById('reset-new-password-form').classList.add('hidden');
      document.getElementById('login-form').classList.remove('hidden');
      document.getElementById('reset-new-password-form').reset();
    } else {
      showToast(res.message, 'error');
    }
  });

  // --- 5. 日期切換 ---
  document.getElementById('date-selector').addEventListener('change', loadDailyData);

  // --- 6. 飲食 Modal 控制 ---
  document.getElementById('btn-open-diet').addEventListener('click', () => {
    document.getElementById('diet-is-ai').value = 'false';
    document.getElementById('food-select-container').classList.remove('hidden');
    document.getElementById('custom-food-container').classList.add('hidden');
    document.getElementById('food-dropdown-wrapper').classList.remove('hidden');

    document.getElementById('diet-category').value = '';
    document.getElementById('diet-food').disabled = true;

    document.getElementById('diet-cals').readOnly = true;
    document.getElementById('diet-pro').readOnly = true;
    document.getElementById('diet-carb').readOnly = true;
    document.getElementById('diet-fat').readOnly = true;

    document.getElementById('diet-modal').classList.remove('hidden');
    dietCart = [];
    if (typeof renderDietCart === 'function') renderDietCart();
    document.getElementById('diet-global-search').value = '';
    document.getElementById('diet-search-results').classList.add('hidden');
  });

  document.getElementById('btn-close-diet').addEventListener('click', () => {
    document.getElementById('diet-modal').classList.add('hidden');
  });

  // --- 6.2 運動 Modal 控制 ---
  const btnOpenEx = document.getElementById('btn-open-exercise');
  if (btnOpenEx) {
    btnOpenEx.addEventListener('click', () => {
      document.getElementById('exercise-modal').classList.remove('hidden');
    });
  }

  const btnCloseEx = document.getElementById('btn-close-exercise');
  if (btnCloseEx) {
    btnCloseEx.addEventListener('click', () => {
      document.getElementById('exercise-modal').classList.add('hidden');
    });
  }

  // --- 6.3 運動計算機 / 手動輸入切換 ---
  const tabExCalc = document.getElementById('tab-ex-calc');
  const tabExManual = document.getElementById('tab-ex-manual');
  if (tabExCalc && tabExManual) {
    tabExCalc.addEventListener('click', () => {
      document.getElementById('exercise-mode').value = 'calc';
      tabExCalc.classList.replace('text-slate-500', 'text-emerald-600');
      tabExCalc.classList.replace('font-medium', 'font-bold');
      tabExCalc.classList.add('bg-white', 'shadow-sm');

      tabExManual.classList.replace('text-emerald-600', 'text-slate-500');
      tabExManual.classList.replace('font-bold', 'font-medium');
      tabExManual.classList.remove('bg-white', 'shadow-sm');

      document.getElementById('ex-calc-container').classList.remove('hidden');
      document.getElementById('ex-manual-container').classList.add('hidden');

      const calsInput = document.getElementById('exercise-cals');
      calsInput.readOnly = true;
      calsInput.classList.add('bg-slate-50', 'text-emerald-600', 'font-bold');

      calculateExerciseCals();
    });

    tabExManual.addEventListener('click', () => {
      document.getElementById('exercise-mode').value = 'manual';
      tabExManual.classList.replace('text-slate-500', 'text-emerald-600');
      tabExManual.classList.replace('font-medium', 'font-bold');
      tabExManual.classList.add('bg-white', 'shadow-sm');

      tabExCalc.classList.replace('text-emerald-600', 'text-slate-500');
      tabExCalc.classList.replace('font-bold', 'font-medium');
      tabExCalc.classList.remove('bg-white', 'shadow-sm');

      document.getElementById('ex-calc-container').classList.add('hidden');
      document.getElementById('ex-manual-container').classList.remove('hidden');

      const calsInput = document.getElementById('exercise-cals');
      calsInput.readOnly = false;
      calsInput.classList.remove('bg-slate-50', 'text-emerald-600', 'font-bold');

      calsInput.value = '';
    });
  }

  function calculateExerciseCals() {
    if (document.getElementById('exercise-mode')?.value !== 'calc') return;

    const presetSelect = document.getElementById('exercise-preset');
    const met = parseFloat(presetSelect.value);
    const duration = parseFloat(document.getElementById('exercise-duration').value);
    const weight = currentUser?.weight || 60; // 預設 60kg

    if (!isNaN(met) && !isNaN(duration) && duration > 0) {
      // 消耗熱量 = MET * 體重(kg) * 時間(小時)
      const cals = Math.round(met * weight * (duration / 60));
      document.getElementById('exercise-cals').value = cals;
    } else {
      document.getElementById('exercise-cals').value = '';
    }
  }

  const exPreset = document.getElementById('exercise-preset');
  const exDuration = document.getElementById('exercise-duration');
  if (exPreset) exPreset.addEventListener('change', calculateExerciseCals);
  if (exDuration) exDuration.addEventListener('input', calculateExerciseCals);

  // --- 6.5 食物選單連動邏輯 ---
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

      document.getElementById('diet-amount-input').value = 1;
      document.getElementById('diet-unit-label').innerText = '份';

      selectedFoodBase = null;
      resetDietFormValues(true);
      return;
    }

    document.getElementById('food-dropdown-wrapper').classList.remove('hidden');
    document.getElementById('custom-food-container').classList.add('hidden');

    document.getElementById('diet-cals').readOnly = true;
    document.getElementById('diet-pro').readOnly = true;
    document.getElementById('diet-carb').readOnly = true;
    document.getElementById('diet-fat').readOnly = true;

    foodSelect.innerHTML = '<option value="" disabled selected>請選擇食物...</option>';

    const matchedFoods = foodDatabase.foods.filter(f => f.food_id.startsWith(prefix));
    matchedFoods.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f.food_id;
      opt.textContent = `${f.name} (${f.calories}kcal/${f.serving_unit})`;
      foodSelect.appendChild(opt);
    });

    foodSelect.disabled = false;
    selectedFoodBase = null;
    resetDietFormValues();
  });

  document.getElementById('diet-food').addEventListener('change', (e) => {
    const foodId = e.target.value;
    const food = foodDatabase.foods.find(f => f.food_id === foodId);
    if (!food) return;

    selectedFoodBase = food;
    document.getElementById('diet-name').value = food.name;

    // 解析 serving_unit (例如 "100g" -> 基準值100, 單位"g", "1碗" -> 基準值1, 單位"碗")
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

  function resetDietFormValues(isCustom = false) {
    if (!isCustom) {
      document.getElementById('diet-amount-input').value = '';
      document.getElementById('diet-unit-label').innerText = '-';
      document.getElementById('diet-cals').value = '';
      document.getElementById('diet-pro').value = '';
      document.getElementById('diet-carb').value = '';
      document.getElementById('diet-fat').value = '';
    }
    document.getElementById('diet-amount').value = '';
  }

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

  // --- 6.7 關鍵字搜尋 (Autocomplete) ---
  const searchInput = document.getElementById('diet-global-search');
  const searchResults = document.getElementById('diet-search-results');

  if (searchInput && searchResults) {
    searchInput.addEventListener('input', (e) => {
      const keyword = e.target.value.trim().toLowerCase();
      if (!keyword) {
        searchResults.classList.add('hidden');
        return;
      }

      const matches = foodDatabase.foods.filter(f => f.name.toLowerCase().includes(keyword)).slice(0, 15);

      if (matches.length > 0) {
        searchResults.innerHTML = matches.map(f => `
          <div class="px-4 py-3 hover:bg-slate-50 cursor-pointer text-sm border-b border-slate-100 search-item" data-id="${f.food_id}">
            <div class="font-bold text-slate-800">${f.name}</div>
            <div class="text-[11px] text-slate-500 mt-0.5">🔥 ${f.calories} kcal / ${f.serving_unit}</div>
          </div>
        `).join('');
        searchResults.classList.remove('hidden');
      } else {
        searchResults.innerHTML = '<div class="px-4 py-4 text-sm text-slate-500 text-center">找不到相符的食物 😢</div>';
        searchResults.classList.remove('hidden');
      }
    });

    searchResults.addEventListener('click', (e) => {
      const itemEl = e.target.closest('.search-item');
      if (!itemEl) return;

      const foodId = itemEl.getAttribute('data-id');
      const food = foodDatabase.foods.find(f => f.food_id === foodId);
      if (food) {
        selectedFoodBase = food;
        searchInput.value = food.name;
        searchResults.classList.add('hidden');

        // Reset category drop down visually to avoid confusion
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

    document.addEventListener('click', (e) => {
      if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
        searchResults.classList.add('hidden');
      }
    });
  }

  // --- 6.8 購物車清單 UI 渲染 ---
  window.renderDietCart = function () {
    const list = document.getElementById('diet-cart-list');
    const container = document.getElementById('diet-cart-container');
    const count = document.getElementById('diet-cart-count');

    list.innerHTML = '';
    count.innerText = dietCart.length;

    if (dietCart.length === 0) {
      container.classList.add('hidden');
      return;
    }

    container.classList.remove('hidden');
    dietCart.forEach((item, index) => {
      const mealLabel = { 'Breakfast': '早餐', 'Lunch': '午餐', 'Dinner': '晚餐', 'Snack': '點心' }[item.mealType] || item.mealType;

      list.innerHTML += `
        <li class="flex justify-between items-center bg-slate-50 p-2 rounded-lg border border-slate-100">
          <div>
            <p class="text-sm font-bold text-slate-700">
              <span class="text-[10px] bg-slate-200 text-slate-600 px-1 py-0.5 rounded mr-1">${mealLabel}</span>
              ${item.foodName} <span class="text-xs text-indigo-500 bg-indigo-50 px-1 rounded ml-1">${item.amount}</span>
            </p>
            <p class="text-[10px] text-slate-500 uppercase mt-0.5">P: ${item.protein} | C: ${item.carbs} | F: ${item.fat}</p>
          </div>
          <div class="flex items-center gap-3">
            <span class="text-sm font-black text-rose-500">${item.calories} <span class="text-[10px]">kcal</span></span>
            <button type="button" class="text-slate-400 hover:text-red-500 text-xs px-2 py-1" onclick="removeDietCartItem(${index})">✕</button>
          </div>
        </li>
      `;
    });
  };

  window.removeDietCartItem = function (index) {
    dietCart.splice(index, 1);
    renderDietCart();
  };

  // --- 6.9 加到這一餐 (加入購物車) ---
  document.getElementById('btn-add-to-cart').addEventListener('click', () => {
    const foodName = document.getElementById('diet-name').value;
    const cals = document.getElementById('diet-cals').value;

    if (!foodName || !cals) {
      showToast('請先選擇食物與份量！', 'error');
      return;
    }

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

    // 清空表單以利下一筆輸入
    resetDietFormValues(true);
    document.getElementById('diet-global-search').value = '';
    document.getElementById('diet-category').value = '';
    document.getElementById('diet-name').value = '';
    document.getElementById('diet-amount-input').value = '';
    document.getElementById('diet-unit-label').innerText = '-';
    document.getElementById('custom-food-container').classList.add('hidden');
    document.getElementById('food-dropdown-wrapper').classList.remove('hidden');
    document.getElementById('diet-food').disabled = true;
    document.getElementById('diet-food').innerHTML = '<option value="" disabled selected>請先選擇大分類...</option>';
    selectedFoodBase = null;
  });

  // --- 7. 送出全車紀錄 (Batch Submit) ---
  document.getElementById('btn-submit-diet-cart').addEventListener('click', async (e) => {
    if (dietCart.length === 0) return;
    
    const btn = e.target;
    btn.disabled = true;
    const oldText = btn.innerText;
    btn.innerText = '⏳ 處理中...';

    showLoading('批次儲存中...');

    const payload = {
      userId: currentUser.user_id,
      date: currentDate,
      logs: dietCart
    };

    const res = await apiCall('addDietLogsBatch', payload);
    hideLoading();
    
    btn.disabled = false;
    btn.innerText = oldText;

    if (res.success) {
      if (window.currentDailyStats) {
        dietCart.forEach(log => {
          const itemCals = Number(log.calories) || 0;
          window.currentDailyStats.dietLogs.push({
            log_id: 'temp-diet-' + Date.now() + Math.random(),
            food_name: log.foodName,
            meal_type: log.mealType || 'Breakfast',
            amount: log.amount,
            calories: itemCals,
            protein: Number(log.protein) || 0,
            carbs: Number(log.carbs) || 0,
            fat: Number(log.fat) || 0,
            is_ai_scanned: log.isAiScanned,
            created_at: new Date().toISOString()
          });
          window.currentDailyStats.caloriesIn += itemCals;
          window.currentDailyStats.protein += Number(log.protein) || 0;
          window.currentDailyStats.carbs += Number(log.carbs) || 0;
          window.currentDailyStats.fat += Number(log.fat) || 0;

          if (window.currentWeeklyStats && window.currentWeeklyStats.length > 0) {
            window.currentWeeklyStats[window.currentWeeklyStats.length - 1].in += itemCals;
          }
        });
        updateDashboardUI(window.currentDailyStats);
        if (window.currentWeeklyStats) renderWeeklyChart(window.currentWeeklyStats);
      }

      document.getElementById('diet-modal').classList.add('hidden');
      document.getElementById('add-diet-form').reset();
      document.getElementById('diet-is-ai').value = 'false';
      dietCart = [];
      showToast('紀錄已成功批次儲存！');
    } else {
      showToast(res.message, 'error');
    }
  });

  // --- 7.5 新增運動紀錄 ---
  const exerciseForm = document.getElementById('add-exercise-form');
  if (exerciseForm) {
    exerciseForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const isCalc = document.getElementById('exercise-mode').value === 'calc';
      let exName = '';
      if (isCalc) {
        const sel = document.getElementById('exercise-preset');
        if (!sel.value) {
          showToast('請選擇運動項目！', 'error');
          return;
        }
        // 去除前面 emoji 和格式
        exName = sel.options[sel.selectedIndex].text.replace(/^.*?\s+/, '');
      } else {
        exName = document.getElementById('exercise-name').value;
      }

      if (!exName) {
        showToast('請填寫或選擇運動項目！', 'error');
        return;
      }

      showLoading('儲存運動中...');
      const payload = {
        userId: currentUser.user_id,
        date: currentDate,
        type: exName,
        duration: document.getElementById('exercise-duration').value,
        calories: document.getElementById('exercise-cals').value
      };

      const res = await apiCall('addExerciseLog', payload);
      hideLoading();

      if (res.success) {
        if (window.currentDailyStats) {
          const itemCals = Number(payload.calories) || 0;
          window.currentDailyStats.exerciseLogs.push({
            log_id: 'temp-ex-' + Date.now() + Math.random(),
            exercise_type: payload.type,
            duration_mins: payload.duration,
            calories_burned: itemCals,
            created_at: new Date().toISOString()
          });
          window.currentDailyStats.caloriesOut += itemCals;

          if (window.currentWeeklyStats && window.currentWeeklyStats.length > 0) {
            window.currentWeeklyStats[window.currentWeeklyStats.length - 1].out += itemCals;
          }
          updateDashboardUI(window.currentDailyStats);
          if (window.currentWeeklyStats) renderWeeklyChart(window.currentWeeklyStats);
        }

        document.getElementById('exercise-modal').classList.add('hidden');
        document.getElementById('add-exercise-form').reset();

        // 預設跳回計算機模式
        document.getElementById('tab-ex-calc').click();

        showToast('運動紀錄新增成功！');
      } else {
        showToast(res.message, 'error');
      }
    });
  }

  // --- 8. AI Modal 控制 ---
  document.getElementById('btn-close-ai').addEventListener('click', () => {
    document.getElementById('ai-modal').classList.add('hidden');
    resetAiModalUI();
  });

  function resetAiModalUI() {
    document.getElementById('ai-image-input').value = '';
    document.getElementById('ai-image-preview').classList.add('hidden');
    document.getElementById('ai-preview-container').classList.remove('hidden');
    document.getElementById('btn-submit-ai').classList.add('hidden');
    document.getElementById('btn-submit-ai').disabled = false;
    document.getElementById('btn-submit-ai').innerText = '🚀 讓 AI 開始辨識';
    currentAiBase64 = null;
  }

  document.getElementById('btn-open-ai').addEventListener('click', (e) => {
    // 檢查方案，如果不是 Premium 則阻擋
    if (String(currentUser.plan_type).toLowerCase() !== 'premium') {
      e.preventDefault();
      showToast('此功能專屬於 Premium 帳號，請升級您的方案以解鎖 AI 拍照辨識！', 'error');
      return;
    }
    resetAiModalUI();
    document.getElementById('ai-modal').classList.remove('hidden');
  });

  // --- 9. AI 圖片壓縮與預覽 ---
  document.getElementById('ai-image-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (event) {
      const img = new Image();
      img.onload = function () {
        const MAX_SIZE = 800; // 壓縮圖片最大邊長至 800px 以減少 API 爆頭風險
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_SIZE) {
            height *= MAX_SIZE / width;
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width *= MAX_SIZE / height;
            height = MAX_SIZE;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // 轉出高壓縮率的 JPEG
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
        currentAiBase64 = compressedBase64;

        // 顯示預覽圖
        document.getElementById('ai-preview-container').classList.add('hidden');
        const previewImg = document.getElementById('ai-image-preview');
        previewImg.src = compressedBase64;
        previewImg.classList.remove('hidden');

        // 顯示執行辨識按鈕
        document.getElementById('btn-submit-ai').classList.remove('hidden');
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });

  // --- 9.5 觸發 AI 辨識 ---
  document.getElementById('btn-submit-ai').addEventListener('click', () => {
    if (!currentAiBase64) return;
    document.getElementById('btn-submit-ai').disabled = true;
    document.getElementById('btn-submit-ai').innerText = '⏳ AI 正在深度分析中...';
    analyzeWithGemini(currentAiBase64);
  });

  // --- 10. 目標設定 Modal 控制 ---
  const btnGoal = document.getElementById('btn-goal-settings');
  const btnCloseGoal = document.getElementById('btn-close-goal');
  const goalModal = document.getElementById('goal-modal');

  if (btnGoal && btnCloseGoal && goalModal) {
    btnGoal.addEventListener('click', () => {
      document.getElementById('goal-mode').value = 'maintain';
      document.getElementById('goal-details-container').classList.add('hidden');
      document.getElementById('goal-kg').value = '';
      document.getElementById('goal-months').value = '';
      goalModal.classList.remove('hidden');
    });

    btnCloseGoal.addEventListener('click', () => {
      goalModal.classList.add('hidden');
    });

    document.getElementById('goal-mode').addEventListener('change', (e) => {
      if (e.target.value === 'maintain') {
        document.getElementById('goal-details-container').classList.add('hidden');
      } else {
        document.getElementById('goal-details-container').classList.remove('hidden');
      }
    });

    document.getElementById('goal-setting-form').addEventListener('submit', async (e) => {
      e.preventDefault();

      const goalMode = document.getElementById('goal-mode').value;
      let targetKg = 0;
      let targetMonths = 0;

      if (goalMode !== 'maintain') {
        targetKg = document.getElementById('goal-kg').value;
        targetMonths = document.getElementById('goal-months').value;
        if (!targetKg || !targetMonths) {
          showToast('請輸入期望變化的公斤數與月數預估！', 'error');
          return;
        }
      }

      showLoading('重新精算目標中...');
      const payload = {
        userId: currentUser.user_id,
        goalMode: goalMode,
        targetKg: targetKg,
        targetMonths: targetMonths
      };

      const res = await apiCall('updateUserGoal', payload);
      hideLoading();

      if (res.success) {
        currentUser = res.user;
        localStorage.setItem('nutriLens_user', JSON.stringify(currentUser));
        goalModal.classList.add('hidden');
        initDashboard();
        loadDailyData();
      } else {
        showToast(res.message, 'error');
      }
    });
  }

});

// --- 全域方法：供 HTML onclick 呼叫刪除 ---
window.deleteLogEntry = async function (logId, logType) {
  if (!confirm('確定要刪除這筆紀錄嗎？(雲端紀錄也將同步刪除)')) return;

  // 樂觀執行本地刪除與畫面更新
  if (logType === 'diet' && window.currentDailyStats) {
    const idx = window.currentDailyStats.dietLogs.findIndex(x => x.log_id === logId);
    if (idx > -1) {
      const log = window.currentDailyStats.dietLogs[idx];
      window.currentDailyStats.caloriesIn -= (Number(log.calories) || 0);
      window.currentDailyStats.protein -= (Number(log.protein) || 0);
      window.currentDailyStats.carbs -= (Number(log.carbs) || 0);
      window.currentDailyStats.fat -= (Number(log.fat) || 0);
      
      if (window.currentWeeklyStats && window.currentWeeklyStats.length > 0) {
        window.currentWeeklyStats[window.currentWeeklyStats.length - 1].in -= (Number(log.calories) || 0);
      }
      
      window.currentDailyStats.dietLogs.splice(idx, 1);
      updateDashboardUI(window.currentDailyStats);
      if (window.currentWeeklyStats) renderWeeklyChart(window.currentWeeklyStats);
    }
  } else if (logType === 'exercise' && window.currentDailyStats) {
    const idx = window.currentDailyStats.exerciseLogs.findIndex(x => x.log_id === logId);
    if (idx > -1) {
      const log = window.currentDailyStats.exerciseLogs[idx];
      window.currentDailyStats.caloriesOut -= (Number(log.calories_burned) || 0);
      
      if (window.currentWeeklyStats && window.currentWeeklyStats.length > 0) {
        window.currentWeeklyStats[window.currentWeeklyStats.length - 1].out -= (Number(log.calories_burned) || 0);
      }
      
      window.currentDailyStats.exerciseLogs.splice(idx, 1);
      updateDashboardUI(window.currentDailyStats);
      if (window.currentWeeklyStats) renderWeeklyChart(window.currentWeeklyStats);
    }
  }

  // 發送同步資訊給雲端
  const res = await apiCall('deleteLog', { logId, logType });

  if (!res.success) {
    showToast('與伺服器同步刪除失敗', 'error');
    loadDailyData(); // rollback UI
  } else {
    showToast('紀錄已同步刪除！');
  }
};

// ==========================================
// Dashboard 資料邏輯
// ==========================================
function initDashboard() {
  showView('dashboard-view');
  const displayUsername = currentUser.username || currentUser.email.split('@')[0];
  document.getElementById('user-greeting').innerText = `Hi, ${displayUsername}`;
  document.getElementById('date-selector').value = currentDate;

  // 視覺化處理 AI 按鈕 (如果不是 Premium)
  const aiBtn = document.getElementById('btn-open-ai');
  if (String(currentUser.plan_type).toLowerCase() !== 'premium') {
    aiBtn.classList.add('opacity-50', 'grayscale');
  } else {
    aiBtn.classList.remove('opacity-50', 'grayscale');
  }

  loadDailyData();
  loadFoodDatabase();
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

    const customOpt = document.createElement('option');
    customOpt.value = 'custom';
    customOpt.textContent = '✍️ 自訂其他食物';
    catSelect.appendChild(customOpt);
  } else {
    console.error('Failed to load food database:', res.message);
  }
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

  if (weeklyChartInstance) weeklyChartInstance.destroy();

  const labels = weeklyStats.map(s => s.label);
  const netCals = weeklyStats.map(s => s.in - s.out);

  weeklyChartInstance = new Chart(ctxWeek.getContext('2d'), {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: '淨攝取熱量 (kcal)',
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
        y: { beginAtZero: true, grid: { color: '#f1f5f9', borderDash: [4, 4] }, border: { display: false } },
        x: { grid: { display: false }, border: { display: false } }
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  // --- Profile Edit Event Bindings ---
  // Must execute after DOM is fully loaded, since updateProfile form logic doesn't exist inside the former loop.
  // We can attach it directly here or append to the end.
});

// For safety, placing bindings at the root level if elements exist, or inside a safe listener.
setTimeout(() => {
  const btnEditProfile = document.getElementById('btn-edit-profile');
  const modalProfile = document.getElementById('profile-modal');
  const btnCloseProfile = document.getElementById('btn-close-profile');

  if (btnEditProfile && modalProfile && btnCloseProfile) {
    btnEditProfile.addEventListener('click', () => {
      document.getElementById('edit-age').value = currentUser.age || '';
      document.getElementById('edit-gender').value = currentUser.gender || 'male';
      document.getElementById('edit-height').value = currentUser.height || '';
      document.getElementById('edit-weight').value = currentUser.weight || '';
      document.getElementById('edit-activity').value = currentUser.activity_level || '1.2';
      modalProfile.classList.remove('hidden');
    });

    btnCloseProfile.addEventListener('click', () => {
      modalProfile.classList.add('hidden');
    });

    document.getElementById('edit-profile-form').addEventListener('submit', async (e) => {
      e.preventDefault();

      showLoading('更新個人資料與 TDEE 中...');
      const payload = {
        userId: currentUser.user_id,
        age: document.getElementById('edit-age').value,
        gender: document.getElementById('edit-gender').value,
        height: document.getElementById('edit-height').value,
        weight: document.getElementById('edit-weight').value,
        activityLevel: document.getElementById('edit-activity').value
      };

      const res = await apiCall('updateProfile', payload);
      hideLoading();

      if (res.success) {
        currentUser = res.user;
        localStorage.setItem('nutriLens_user', JSON.stringify(currentUser));
        modalProfile.classList.add('hidden');
        showToast('個人資料已更新！新的 TDEE 為：' + currentUser.tdee + ' kcal');
        initDashboard();
        loadDailyData();
      } else {
        showToast(res.message, 'error');
      }
    });
  }
}, 500);

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
  if (remaining < 0) {
    remainingEl.classList.add('text-rose-500');
    remainingEl.classList.remove('text-slate-800');
  } else {
    remainingEl.classList.add('text-slate-800');
    remainingEl.classList.remove('text-rose-500');
  }

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
    if (macrosChartInstance) macrosChartInstance.destroy();
    macrosChartInstance = new Chart(ctxMacro.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: ['蛋白質', '碳水', '脂肪'],
        datasets: [{
          data: totalMacros === 0 ? [1, 1, 1] : [stats.protein, stats.carbs, stats.fat],
          backgroundColor: totalMacros === 0 ? ['#f1f5f9', '#f1f5f9', '#f1f5f9'] : ['#3b82f6', '#f59e0b', '#f43f5e'],
          borderWidth: 0,
          cutout: '75%'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { tooltip: { enabled: totalMacros > 0 }, legend: { display: false } },
        animation: { duration: 800 }
      }
    });
  }

  // 總缺口進度卡片渲染
  const goalStr = String(currentUser.goal || '');
  const progressCard = document.getElementById('goal-progress-card');

  if (goalStr.includes('減脂') || goalStr.includes('增肌')) {
    progressCard.classList.remove('hidden');

    // 解析目標公斤數，例如 "減脂 5kg (5個月)"
    const match = goalStr.match(/(減脂|增肌)\s*([\d\.]+)kg/);
    if (match && match[2]) {
      const kg = parseFloat(match[2]);
      const totalDeficit = kg * 7700;

      document.getElementById('goal-progress-title').innerText = goalStr;
      document.getElementById('goal-total-deficit').innerText = totalDeficit;

      // 計算預期每日缺口 (TDEE 與 目標熱量的差)
      const dailyDeficit = Math.abs((currentUser.tdee || 2000) - currentUser.target_calories);
      document.getElementById('goal-daily-deficit').innerText = dailyDeficit;

      // 計算今日實際達成缺口 (TDEE + 活動消耗 - 飲食)
      const isLose = match[1] === '減脂';
      let todayAchieved = 0;
      if (isLose) {
        todayAchieved = (currentUser.tdee || 2000) + calsOut - calsIn;
      } else {
        todayAchieved = calsIn - ((currentUser.tdee || 2000) + calsOut);
      }

      const achievedEl = document.getElementById('goal-today-achieved');
      achievedEl.innerText = todayAchieved;
      if (todayAchieved >= 0) {
        achievedEl.classList.remove('text-rose-500');
        achievedEl.classList.add('text-emerald-600');
      } else {
        achievedEl.classList.remove('text-emerald-600');
        achievedEl.classList.add('text-rose-500');
      }

      // 計算進度扣除後的剩餘
      const remainingTotal = totalDeficit - todayAchieved;
      document.getElementById('goal-total-remaining').innerText = remainingTotal;
    } else {
      progressCard.classList.add('hidden');
    }
  } else {
    progressCard.classList.add('hidden');
  }

  const container = document.getElementById('logs-container');
  container.innerHTML = '';

  if ((!stats.dietLogs || stats.dietLogs.length === 0) && (!stats.exerciseLogs || stats.exerciseLogs.length === 0)) {
    container.innerHTML = '<p class="text-sm text-slate-400 text-center py-4">尚無紀錄，點擊下方按鈕新增！</p>';
  } else {
    if (stats.dietLogs && stats.dietLogs.length > 0) {
      stats.dietLogs.forEach(log => {
        const aiBadge = (log.is_ai_scanned === true || log.is_ai_scanned === 'TRUE')
          ? '<span class="text-[10px] bg-pink-100 text-pink-600 px-2 py-0.5 rounded-full ml-2">✨ AI</span>' : '';

        container.innerHTML += `
          <div class="bg-white p-3 rounded-xl border border-slate-100 shadow-sm flex justify-between items-center">
            <div>
              <p class="font-bold text-slate-800 text-sm">${log.food_name} ${aiBadge}</p>
              <p class="text-xs text-slate-400">${log.meal_type} • ${log.amount}</p>
            </div>
            <div class="text-right flex justify-end gap-3 items-center">
              <div>
                <p class="font-bold text-indigo-600">${log.calories} kcal</p>
                <p class="text-[10px] text-slate-400">P:${log.protein} C:${log.carbs} F:${log.fat}</p>
              </div>
              <button onclick="window.deleteLogEntry('${log.log_id}', 'diet')" class="text-rose-300 hover:text-rose-500 transition p-1 cursor-pointer">🗑️</button>
            </div>
          </div>
        `;
      });
    }

    if (stats.exerciseLogs && stats.exerciseLogs.length > 0) {
      stats.exerciseLogs.forEach(log => {
        container.innerHTML += `
          <div class="bg-emerald-50 p-3 rounded-xl border border-emerald-100 shadow-sm flex justify-between items-center">
            <div class="flex items-center gap-2">
              <span class="text-xl">🏃‍♂️</span>
              <div>
                <p class="font-bold text-emerald-800 text-sm">${log.exercise_type}</p>
                <p class="text-xs text-emerald-600/70">${log.duration_mins} 分鐘</p>
              </div>
            </div>
            <div class="text-right flex justify-end gap-3 items-center">
              <div>
                <p class="font-bold text-emerald-600">-${log.calories_burned} kcal</p>
                <p class="text-[10px] text-emerald-500/70">燃燒熱量</p>
              </div>
              <button onclick="window.deleteLogEntry('${log.log_id}', 'exercise')" class="text-emerald-400 hover:text-emerald-600 transition p-1 cursor-pointer">🗑️</button>
            </div>
          </div>
        `;
      });
    }
  }
}

// ==========================================
// AI 辨識流程
// ==========================================
async function analyzeWithGemini(base64Data) {
  showLoading('AI 正在分析食物...');

  const res = await apiCall('analyzeFoodImage', {
    userId: currentUser.user_id,
    base64Image: base64Data
  });

  hideLoading();

  if (res.success) {
    // 關閉 AI Modal
    document.getElementById('ai-modal').classList.add('hidden');

    // 將 AI 回傳的資料填入「手動新增」的表單中
    const data = res.data;
    document.getElementById('diet-is-ai').value = 'true';

    document.getElementById('food-select-container').classList.add('hidden');
    document.getElementById('custom-food-container').classList.remove('hidden');

    document.getElementById('diet-name').value = data.foodName || 'AI 辨識食物';

    // 開放 AI 狀態下的編輯權限
    document.getElementById('diet-cals').readOnly = false;
    document.getElementById('diet-pro').readOnly = false;
    document.getElementById('diet-carb').readOnly = false;
    document.getElementById('diet-fat').readOnly = false;

    // 解析預估份量
    document.getElementById('diet-amount-input').value = 1;
    document.getElementById('diet-unit-label').innerText = data.estimatedAmount ? data.estimatedAmount.replace(/[\d\.]+/g, '').trim() || '份' : '份';
    document.getElementById('diet-amount').value = data.estimatedAmount || '1 份';

    document.getElementById('diet-cals').value = data.calories || 0;
    document.getElementById('diet-pro').value = data.protein || 0;
    document.getElementById('diet-carb').value = data.carbs || 0;
    document.getElementById('diet-fat').value = data.fat || 0;

    // 打開手動新增表單讓使用者確認
    document.getElementById('diet-modal').classList.remove('hidden');
    showToast('✨ AI 辨識完成！請確認數值無誤後點擊儲存。');
  } else {
    showToast(res.message, 'error');
    document.getElementById('ai-modal').classList.add('hidden');
  }

  // 重置圖片上傳區狀態
  document.getElementById('ai-image-input').value = '';
  document.getElementById('ai-image-preview').classList.add('hidden');
  document.getElementById('ai-preview-container').classList.remove('hidden');
}