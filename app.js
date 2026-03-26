// ==========================================
// 全域設定與狀態
// ==========================================
// 【重要】請將下方網址替換為你最新的 Google Apps Script 部署 URL (結尾是 /exec)
const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbzj7n9sOar-So8_Yy-7gwr5EokeqoDRJFzjWOMxBfn--AtgcERVapjitNureZF-2sYx/exec'; 

let currentUser = null;
let currentDate = new Date().toISOString().split('T')[0];

// ==========================================
// 核心 API 呼叫函式
// ==========================================
async function apiCall(action, payload) {
  try {
    const response = await fetch(GAS_API_URL, {
      method: 'POST',
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

// ==========================================
// 初始化與事件綁定 (當網頁載入完成)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {

  // --- 1. 登入/註冊切換 ---
  document.getElementById('go-to-register').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('login-form').classList.add('hidden');
    document.getElementById('register-form').classList.remove('hidden');
  });

  document.getElementById('go-to-login').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('register-form').classList.add('hidden');
    document.getElementById('login-form').classList.remove('hidden');
  });

  // --- 2. 帳號登入 ---
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    showLoading('登入中...');
    
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    const res = await apiCall('login', { email, password });
    hideLoading();
    
    if (res.success) {
      currentUser = res.user;
      initDashboard(); // 登入成功，初始化主控台
    } else {
      alert(res.message);
    }
  });

  // --- 3. 帳號註冊 ---
  document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    showLoading('註冊中...');
    
    const userData = {
      email: document.getElementById('reg-email').value,
      password: document.getElementById('reg-password').value,
      gender: document.getElementById('reg-gender').value,
      age: document.getElementById('reg-age').value,
      height: document.getElementById('reg-height').value,
      weight: document.getElementById('reg-weight').value,
      activity_level: document.getElementById('reg-activity').value,
      goal: document.getElementById('reg-goal').value
    };

    const res = await apiCall('register', userData);
    hideLoading();
    
    if (res.success) {
      alert('註冊成功！您的 TDEE 為：' + res.user.tdee + ' kcal');
      currentUser = res.user;
      initDashboard(); // 註冊成功，初始化主控台
    } else {
      alert(res.message);
    }
  });

  // --- 4. 登出 ---
  document.getElementById('btn-logout').addEventListener('click', () => {
    currentUser = null;
    showView('auth-view');
  });

  // --- 5. 日期切換 ---
  document.getElementById('date-selector').addEventListener('change', loadDailyData);

  // --- 6. 飲食 Modal 控制 ---
  document.getElementById('btn-open-diet').addEventListener('click', () => {
    document.getElementById('diet-modal').classList.remove('hidden');
  });
  
  document.getElementById('btn-close-diet').addEventListener('click', () => {
    document.getElementById('diet-modal').classList.add('hidden');
  });

  // --- 7. 送出飲食紀錄 ---
  document.getElementById('add-diet-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    showLoading('儲存中...');
    
    const payload = {
      userId: currentUser.user_id,
      date: currentDate,
      mealType: document.getElementById('diet-meal').value,
      foodName: document.getElementById('diet-name').value,
      amount: document.getElementById('diet-amount').value,
      calories: document.getElementById('diet-cals').value,
      protein: document.getElementById('diet-pro').value,
      carbs: document.getElementById('diet-carb').value,
      fat: document.getElementById('diet-fat').value,
      isAiScanned: document.getElementById('diet-is-ai').value === 'true'
    };

    const res = await apiCall('addDietLog', payload);
    hideLoading();
    
    if (res.success) {
      document.getElementById('diet-modal').classList.add('hidden');
      document.getElementById('add-diet-form').reset();
      document.getElementById('diet-is-ai').value = 'false';
      loadDailyData(); // 重新載入畫面資料
    } else {
      alert(res.message);
    }
  });

  // --- 8. AI Modal 控制 ---
  document.getElementById('btn-close-ai').addEventListener('click', () => {
    document.getElementById('ai-modal').classList.add('hidden');
    // 重置圖片上傳預覽
    document.getElementById('ai-image-input').value = '';
    document.getElementById('ai-image-preview').classList.add('hidden');
    document.getElementById('ai-preview-container').classList.remove('hidden');
  });

  document.getElementById('btn-open-ai').addEventListener('click', (e) => {
    // 檢查方案，如果不是 Premium 則阻擋
    if (currentUser.plan_type !== 'Premium') {
      e.preventDefault();
      alert('此功能專屬於 Premium 帳號，請升級您的方案以解鎖 AI 拍照辨識！');
      return;
    }
    document.getElementById('ai-modal').classList.remove('hidden');
  });

  // --- 9. AI 圖片上傳與預覽 ---
  document.getElementById('ai-image-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(event) {
      const base64Data = event.target.result;
      
      // 顯示預覽圖
      document.getElementById('ai-preview-container').classList.add('hidden');
      const previewImg = document.getElementById('ai-image-preview');
      previewImg.src = base64Data;
      previewImg.classList.remove('hidden');

      // 呼叫 AI 辨識函式
      analyzeWithGemini(base64Data);
    };
    reader.readAsDataURL(file);
  });
});

// ==========================================
// Dashboard 資料邏輯
// ==========================================
function initDashboard() {
  showView('dashboard-view');
  document.getElementById('user-greeting').innerText = `Hi, ${currentUser.email.split('@')[0]} (${currentUser.plan_type})`;
  document.getElementById('date-selector').value = currentDate;
  
  // 視覺化處理 AI 按鈕 (如果不是 Premium)
  const aiBtn = document.getElementById('btn-open-ai');
  if (currentUser.plan_type !== 'Premium') {
    aiBtn.classList.add('opacity-50', 'grayscale');
  } else {
    aiBtn.classList.remove('opacity-50', 'grayscale');
  }

  loadDailyData();
}

async function loadDailyData() {
  currentDate = document.getElementById('date-selector').value;
  showLoading('載入資料中...');
  
  const res = await apiCall('getDailyStats', { userId: currentUser.user_id, targetDate: currentDate });
  hideLoading();
  
  if (res.success) {
    updateDashboardUI(res.stats);
  } else {
    alert(res.message);
  }
}

function updateDashboardUI(stats) {
  const targetCals = currentUser.target_calories || 2000;
  const calsIn = stats.caloriesIn;
  const calsOut = stats.caloriesOut;
  const remaining = Math.max(0, targetCals - calsIn + calsOut);
  
  document.getElementById('cals-target').innerText = targetCals;
  document.getElementById('cals-in').innerText = calsIn;
  document.getElementById('cals-out').innerText = calsOut;
  document.getElementById('cals-remaining').innerText = remaining;
  
  const progress = Math.min((calsIn / (targetCals + calsOut)) * 100, 100) || 0;
  document.getElementById('cals-progress').style.width = `${progress}%`;
  document.getElementById('cals-progress').className = progress > 100 ? 'h-full bg-rose-500 transition-all duration-500' : 'h-full bg-indigo-500 transition-all duration-500';

  document.getElementById('macro-protein').innerText = stats.protein;
  document.getElementById('macro-carbs').innerText = stats.carbs;
  document.getElementById('macro-fat').innerText = stats.fat;

  const container = document.getElementById('logs-container');
  container.innerHTML = '';
  
  if (stats.dietLogs.length === 0) {
    container.innerHTML = '<p class="text-sm text-slate-400 text-center py-4">尚無紀錄，點擊下方按鈕新增！</p>';
  } else {
    stats.dietLogs.forEach(log => {
      const aiBadge = (log.is_ai_scanned === true || log.is_ai_scanned === 'TRUE') 
        ? '<span class="text-[10px] bg-pink-100 text-pink-600 px-2 py-0.5 rounded-full ml-2">✨ AI</span>' : '';
        
      container.innerHTML += `
        <div class="bg-white p-3 rounded-xl border border-slate-100 shadow-sm flex justify-between items-center">
          <div>
            <p class="font-bold text-slate-800 text-sm">${log.food_name} ${aiBadge}</p>
            <p class="text-xs text-slate-400">${log.meal_type} • ${log.amount}</p>
          </div>
          <div class="text-right">
            <p class="font-bold text-indigo-600">${log.calories} kcal</p>
            <p class="text-[10px] text-slate-400">P:${log.protein} C:${log.carbs} F:${log.fat}</p>
          </div>
        </div>
      `;
    });
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
    document.getElementById('diet-name').value = data.foodName || '';
    document.getElementById('diet-amount').value = data.estimatedAmount || '';
    document.getElementById('diet-cals').value = data.calories || 0;
    document.getElementById('diet-pro').value = data.protein || 0;
    document.getElementById('diet-carb').value = data.carbs || 0;
    document.getElementById('diet-fat').value = data.fat || 0;
    document.getElementById('diet-is-ai').value = 'true';
    
    // 打開手動新增表單讓使用者確認
    document.getElementById('diet-modal').classList.remove('hidden');
    alert('✨ AI 辨識完成！請確認數值無誤後點擊儲存。');
  } else {
    alert(res.message);
    document.getElementById('ai-modal').classList.add('hidden');
  }
  
  // 重置圖片上傳區狀態
  document.getElementById('ai-image-input').value = '';
  document.getElementById('ai-image-preview').classList.add('hidden');
  document.getElementById('ai-preview-container').classList.remove('hidden');
}