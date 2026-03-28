const SPREADSHEET_ID = '15cWD63H0sy6zW6zpSHj-tr6TwrbvjVz_JZi0wGaR_9k';
const GEMINI_API_KEY = 'AIzaSyBosEGscJ42HgLIcSNVt6FFvuU2KWiAdXM'; // 之後要用 AI 功能時再填入

// ==========================================
// 1. API 接收端
// ==========================================
function doPost(e) {
  const output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);
  
  try {
    const params = JSON.parse(e.postData.contents);
    const action = params.action;
    const payload = params.payload;
    let result = {};

    if (action === 'register') {
      result = registerUser(payload);
    } else if (action === 'login') {
      result = loginUser(payload.username, payload.password);
    } else if (action === 'forgotPassword') {
      result = forgotPassword(payload.email, payload.baseUrl);
    } else if (action === 'updatePassword') {
      result = updatePassword(payload.email, payload.tempPass, payload.newPass);
    } else if (action === 'getDailyStats') {
      result = getDailyStats(payload.userId, payload.targetDate);
    } else if (action === 'getWeeklyStats') {
      result = getWeeklyStats(payload.userId, payload.targetDate);
    } else if (action === 'addDietLog') {
      result = addDietLog(payload.userId, payload.date, payload.mealType, payload.foodName, payload.amount, payload.calories, payload.protein, payload.carbs, payload.fat, payload.isAiScanned);
    } else if (action === 'addDietLogsBatch') {
      result = addDietLogsBatch(payload.userId, payload.date, payload.logs);
    } else if (action === 'addExerciseLog') {
      result = addExerciseLog(payload.userId, payload.date, payload.type, payload.duration, payload.calories);
    } else if (action === 'deleteLog') {
      result = deleteLog(payload.logId, payload.logType);
    } else if (action === 'updateProfile') {
      result = updateProfile(payload.userId, payload.age, payload.gender, payload.height, payload.weight, payload.activityLevel);
    } else if (action === 'updateUserGoal') {
      result = updateUserGoal(payload.userId, payload.goalMode, payload.targetKg, payload.targetMonths);
    } else if (action === 'analyzeFoodImage') {
      result = analyzeFoodImage(payload.userId, payload.base64Image);
      
    // 【新增】：取得食物分類與資料庫 API
    } else if (action === 'getFoodData') {
      result = getFoodData();
      
    } else if (action === 'addBodyStat') {
      result = addBodyStat(payload.userId, payload.date, payload.weight, payload.bodyFat);
    } else if (action === 'getBodyStats') {
      result = getBodyStats(payload.userId, payload.days);
      
    } else {
      throw new Error('未知的 API 動作: ' + action);
    }

    output.setContent(JSON.stringify(result));
  } catch (error) {
    output.setContent(JSON.stringify({ success: false, message: 'API 錯誤：' + error.toString() }));
  }
  return output;
}

function doGet(e) {
  return ContentService.createTextOutput("NutriLens API is running!");
}

// ==========================================
// 2. 核心邏輯與 Helper
// ==========================================
function getDb() { return SpreadsheetApp.openById(SPREADSHEET_ID); }
function generateUUID() { return Utilities.getUuid(); }

// 【新增】：模糊比對工作表名稱，避免因為有全半形空白或大小寫問題抓不到工作表
function getSheetFuzzy(db, targetName) {
  const sheets = db.getSheets();
  const normalizedTarget = targetName.replace(/\s+/g, '').toLowerCase();
  for (let i = 0; i < sheets.length; i++) {
    const sheetName = sheets[i].getName();
    if (sheetName.replace(/\s+/g, '').toLowerCase() === normalizedTarget) {
      return sheets[i];
    }
  }
  return null;
}

// 【修復 Bug 2】：新增密碼加密函式 (SHA-256)
function hashPassword(password) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(password), Utilities.Charset.UTF_8);
  return digest.map(b => (b < 0 ? b + 256 : b).toString(16).padStart(2, '0')).join('');
}

// 【修復 Bug 1 & 3 的潛在元凶】：強制清除試算表標題的前後空白，避免抓不到資料
function getSheetDataAsObjects(sheetName) {
  const sheet = getDb().getSheetByName(sheetName);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  
  const headers = data[0].map(h => String(h).trim()); // 強制去除空白
  const rows = data.slice(1);
  return rows.map(row => {
    let obj = {};
    headers.forEach((header, index) => { obj[header] = row[index]; });
    return obj;
  });
}

function calculateNutritionTargets(gender, age, height, weight, activityLevel, goal) {
  let bmr = (10 * weight) + (6.25 * height) - (5 * age);
  bmr += (gender === 'male') ? 5 : -161;
  const tdee = Math.round(bmr * activityLevel);
  let targetCalories = tdee;
  if (goal === 'muscle_gain') targetCalories += 300;
  else if (goal === 'fat_loss') targetCalories -= 300;
  const proteinPerKg = (goal === 'maintain') ? 1.8 : 2.2;
  const targetProtein = Math.round(weight * proteinPerKg);
  const fatPerKg = (goal === 'fat_loss') ? 0.8 : 1.0;
  const targetFat = Math.round(weight * fatPerKg);
  const remainingCals = targetCalories - (targetProtein * 4) - (targetFat * 9);
  const targetCarbs = Math.max(0, Math.round(remainingCals / 4));
  return { tdee, targetCalories, targetProtein, targetFat, targetCarbs };
}

// ==========================================
// 3. 帳號系統
// ==========================================
function registerUser(userData) {
  try {
    const sheet = getDb().getSheetByName('Users');
    const users = getSheetDataAsObjects('Users');
    
    // 【修復 Bug 1】：註冊防呆，強制把輸入的 Email 去空白並轉小寫後再比對
    const emailToSave = String(userData.email).trim().toLowerCase();
    if (users.find(u => String(u.email).trim().toLowerCase() === emailToSave)) {
      return { success: false, message: '此 Email 已經註冊過囉！' };
    }

    // 【修復 Bug 2】：密碼進行 SHA-256 加密
    const hashedPassword = hashPassword(userData.password);

    const targets = calculateNutritionTargets(userData.gender, Number(userData.age), Number(userData.height), Number(userData.weight), Number(userData.activity_level), 'maintain');
    const userId = generateUUID();
    const createdAt = new Date().toISOString();
    const planType = 'Free'; 

    // 為了不破壞舊有資料的欄位排序，我們將 username 往後加
    // 但請記得到 Google Sheets 的 Users 表格補上一個 header 叫 'username'
    const rowData = [userId, emailToSave, hashedPassword, planType, userData.gender, userData.age, userData.height, userData.weight, userData.activity_level, targets.tdee, '維持體重', targets.targetCalories, targets.targetProtein, targets.targetCarbs, targets.targetFat, createdAt, userData.username];
    sheet.appendRow(rowData);

    return { success: true, message: '註冊成功！', user: { user_id: userId, email: emailToSave, username: userData.username, gender: userData.gender, age: userData.age, height: userData.height, weight: userData.weight, activity_level: userData.activity_level, plan_type: planType, tdee: targets.tdee, goal: '維持體重', target_calories: targets.targetCalories } };
  } catch (error) { return { success: false, message: '註冊失敗：' + error.toString() }; }
}

function loginUser(username, password) {
  try {
    const loginUsername = String(username).trim().toLowerCase();
    const loginPasswordHash = hashPassword(password);
    
    const users = getSheetDataAsObjects('Users');
    const user = users.find(u => {
      // 若舊資料沒有 username 欄位，則跌代使用 email 大老鼠前面的文字作為預設 username 進行比對
      const uName = u.username ? String(u.username).trim().toLowerCase() : '';
      const emailPrefix = String(u.email || '').split('@')[0].trim().toLowerCase();
      const matchName = uName || emailPrefix;
      return matchName === loginUsername && String(u.password) === loginPasswordHash;
    });
    
    if (user) {
      delete user.password; // 確保回傳給前端的資料沒有密碼欄位
      return { success: true, message: '登入成功！', user: user };
    } else { 
      return { success: false, message: '帳號或密碼錯誤！' }; 
    }
  } catch (error) { return { success: false, message: '登入失敗：' + error.toString() }; }
}

function forgotPassword(email, baseUrl) {
  try {
    const targetEmail = String(email).trim().toLowerCase();
    const sheet = getDb().getSheetByName('Users');
    if (!sheet) return { success: false, message: '找不到 Users 表格' };
    
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return { success: false, message: '查無使用者' };
    
    // 解析欄位
    let emailCol = -1;
    let pwdCol = -1;
    for(let i=0; i<data[0].length; i++) {
        const h = String(data[0][i]).trim().toLowerCase();
        if (h === 'email') emailCol = i;
        if (h === 'password') pwdCol = i;
    }
    
    if (emailCol === -1 || pwdCol === -1) return { success: false, message: '資料表格式錯誤，缺少 email 或 password 欄位' };
    
    let userRowIndex = -1;
    for (let r=1; r<data.length; r++) {
       if (String(data[r][emailCol]).trim().toLowerCase() === targetEmail) {
           userRowIndex = r + 1; // Google Sheet range is 1-indexed
           break;
       }
    }
    
    if (userRowIndex === -1) return { success: false, message: '沒有找到此 Email 的註冊記錄！' };
    
    // 生成隨機密碼 (8位英數) 作為驗證 Token
    const newPass = Math.random().toString(36).slice(-8);
    const hashedNewPass = hashPassword(newPass);
    
    // 寫入臨時密碼
    sheet.getRange(userRowIndex, pwdCol + 1).setValue(hashedNewPass);
    
    // 建立重設連結 (例如： https://your-site/?email=abc@gmail.com&token=12345678)
    const resetLink = `${baseUrl}?email=${encodeURIComponent(targetEmail)}&token=${newPass}`;
    
    // 寄信
    const subject = "NutriLens 帳號密碼重設教學";
    const body = `您好，\n\n您剛剛提出了密碼重設的要求。\n請點擊下方連結以設定並啟動您的新密碼：\n\n${resetLink}\n\n如果您並未提出此要求，請忽略這封信件。`;
    MailApp.sendEmail(targetEmail, subject, body);
    
    return { success: true, message: '新密碼設定連結已發送' };
  } catch (error) { return { success: false, message: '重設密碼失敗：' + error.toString() }; }
}

function updatePassword(email, tempPass, newPass) {
  try {
    const targetEmail = String(email).trim().toLowerCase();
    const tempPassHash = hashPassword(tempPass);
    const newPassHash = hashPassword(newPass);
    
    const sheet = getDb().getSheetByName('Users');
    if (!sheet) return { success: false, message: '找不到 Users 表格' };
    
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return { success: false, message: '查無此帳號' };
    
    let emailCol = -1;
    let pwdCol = -1;
    for(let i=0; i<data[0].length; i++) {
        const h = String(data[0][i]).trim().toLowerCase();
        if (h === 'email') emailCol = i;
        if (h === 'password') pwdCol = i;
    }
    
    if (emailCol === -1 || pwdCol === -1) return { success: false, message: '系統錯誤' };
    
    let userRowIndex = -1;
    for (let r=1; r<data.length; r++) {
       if (String(data[r][emailCol]).trim().toLowerCase() === targetEmail) {
           // 驗證原本的網址 TOKEN 密碼是否正確匹配
           if (String(data[r][pwdCol]) === tempPassHash) {
               userRowIndex = r + 1;
           }
           break;
       }
    }
    
    if (userRowIndex === -1) return { success: false, message: '驗證連結無效或已過期！請重新申請忘記密碼。' };
    
    // 更新為真正新輸入的密碼
    sheet.getRange(userRowIndex, pwdCol + 1).setValue(newPassHash);
    
    return { success: true, message: '密碼更新成功' };
  } catch (error) { return { success: false, message: '更新失敗：' + error.toString() }; }
}

// ==========================================
// 4. 資料讀寫與 AI
// ==========================================
function getDailyStats(userId, targetDate) {
  try {
    const targetDateStr = new Date(targetDate).toDateString();
    
    // 【修復 Bug】：統一將試算表的 Log 日期跟前端目標日期轉成 Date String 再比對，解決時區或純文字與 Date 物件的型別衝突
    const dietLogs = getSheetDataAsObjects('DietLogs').filter(log => {
      if (log.user_id !== userId) return false;
      if (!log.date) return false;
      return new Date(log.date).toDateString() === targetDateStr;
    });
    
    const exerciseLogs = getSheetDataAsObjects('ExerciseLogs').filter(log => {
      if (log.user_id !== userId) return false;
      if (!log.date) return false;
      return new Date(log.date).toDateString() === targetDateStr;
    });

    let totalCaloriesIn = 0, totalProtein = 0, totalCarbs = 0, totalFat = 0, totalCaloriesOut = 0;
    dietLogs.forEach(log => {
      totalCaloriesIn += Number(log.calories) || 0;
      totalProtein += Number(log.protein) || 0;
      totalCarbs += Number(log.carbs) || 0;
      totalFat += Number(log.fat) || 0;
    });
    exerciseLogs.forEach(log => { totalCaloriesOut += Number(log.calories_burned) || 0; });
    
    totalCaloriesIn = Math.round(totalCaloriesIn);
    totalProtein = Math.round(totalProtein * 10) / 10;
    totalCarbs = Math.round(totalCarbs * 10) / 10;
    totalFat = Math.round(totalFat * 10) / 10;

    return { success: true, stats: { date: targetDate, caloriesIn: totalCaloriesIn, protein: totalProtein, carbs: totalCarbs, fat: totalFat, caloriesOut: totalCaloriesOut, dietLogs: dietLogs, exerciseLogs: exerciseLogs } };
  } catch (error) { return { success: false, message: '取得統計數據失敗：' + error.toString() }; }
}

function getWeeklyStats(userId, targetDate) {
  try {
    const end = new Date(targetDate);
    const start = new Date(end);
    start.setDate(end.getDate() - 6);

    const dietData = getSheetDataAsObjects('DietLogs').filter(log => log.user_id === userId);
    const exerciseData = getSheetDataAsObjects('ExerciseLogs').filter(log => log.user_id === userId);

    const dailyData = {};
    for (let i = 0; i <= 6; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        const label = `${d.getMonth()+1}/${d.getDate()}`;
        dailyData[d.toDateString()] = { label: label, in: 0, out: 0, fullDate: d };
    }

    dietData.forEach(log => {
      if (!log.date) return;
      const key = new Date(log.date).toDateString();
      if (dailyData[key]) dailyData[key].in += Number(log.calories) || 0;
    });

    exerciseData.forEach(log => {
      if (!log.date) return;
      const key = new Date(log.date).toDateString();
      if (dailyData[key]) dailyData[key].out += Number(log.calories_burned) || 0;
    });

    const resultList = Object.values(dailyData).sort((a,b) => a.fullDate - b.fullDate).map(item => ({
       label: item.label,
       in: Math.round(item.in),
       out: Math.round(item.out)
    }));

    return { success: true, stats: resultList };
  } catch (error) { return { success: false, message: '取得趨勢失敗：' + error.toString() }; }
}


function addDietLog(userId, date, mealType, foodName, amount, calories, protein, carbs, fat, isAiScanned) {
  try {
    const sheet = getDb().getSheetByName('DietLogs');
    sheet.appendRow([generateUUID(), userId, date, mealType, foodName, amount, calories, protein, carbs, fat, isAiScanned, new Date().toISOString()]);
    SpreadsheetApp.flush();
    return { success: true, message: '飲食紀錄新增成功！' };
  } catch (error) { return { success: false, message: '新增失敗：' + error.toString() }; }
}

function addDietLogsBatch(userId, date, logs) {
  try {
    const sheet = getDb().getSheetByName('DietLogs');
    const timestamp = new Date().toISOString();
    
    if (!logs || logs.length === 0) {
      return { success: false, message: '沒有任何飲食紀錄可新增。' };
    }
    
    // 建立 2D 陣列批次寫入
    const rows = logs.map(log => [
      generateUUID(), 
      userId, 
      date, 
      log.mealType || 'Breakfast', 
      log.foodName, 
      log.amount, 
      log.calories, 
      log.protein, 
      log.carbs, 
      log.fat, 
      log.isAiScanned, 
      timestamp
    ]);
    
    // 使用 getRange().setValues() 批次寫入效能極高
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    SpreadsheetApp.flush();
    
    return { success: true, message: `已成功批次新增 ${rows.length} 筆飲食紀錄！` };
  } catch (error) { return { success: false, message: '批次新增失敗：' + error.toString() }; }
}

function addExerciseLog(userId, date, type, duration, calories) {
  try {
    const sheet = getDb().getSheetByName('ExerciseLogs');
    sheet.appendRow([
      generateUUID(), 
      userId, 
      date, 
      type, 
      Number(duration) || 0, 
      Number(calories) || 0, 
      new Date().toISOString()
    ]);
    SpreadsheetApp.flush();
    return { success: true, message: '運動紀錄新增成功！' };
  } catch (error) { return { success: false, message: '新增失敗：' + error.toString() }; }
}

function deleteLog(logId, logType) {
  try {
    const sheetName = logType === 'diet' ? 'DietLogs' : 'ExerciseLogs';
    const sheet = getDb().getSheetByName(sheetName);
    if (!sheet) return { success: false, message: '找不到對應的資料表' };
    
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return { success: false, message: '無可刪除的紀錄' };
    
    // log_id 預設在第一欄 (index 0)
    for (let r = 1; r < data.length; r++) {
      if (String(data[r][0]) === String(logId)) {
        sheet.deleteRow(r + 1);
        return { success: true, message: '紀錄已刪除' };
      }
    }
    
    return { success: false, message: '找不到該筆紀錄' };
  } catch (error) { return { success: false, message: '刪除失敗：' + error.toString() }; }
}

function updateUserGoal(userId, goalMode, targetKg, targetMonths) {
  try {
    const sheet = getDb().getSheetByName('Users');
    const data = sheet.getDataRange().getValues();
    
    let headers = data[0].map(h => String(h).trim().toLowerCase());
    let userRowIndex = -1;
    let userData = null;
    
    for (let r = 1; r < data.length; r++) {
      if (String(data[r][0]) === String(userId)) {
        userRowIndex = r + 1;
        userData = data[r];
        break;
      }
    }
    
    if (userRowIndex === -1) return { success: false, message: '找不到使用者' };
    
    const userObj = {};
    headers.forEach((h, i) => { userObj[h] = userData[i]; });
    
    const tdee = Number(userObj.tdee) || 2000;
    
    let dailyDiff = 0;
    if (goalMode === 'lose' || goalMode === 'gain') {
       const totalCals = Number(targetKg) * 7700;
       const days = Number(targetMonths) * 30;
       if (days > 0) dailyDiff = Math.round(totalCals / days);
    }
    
    let targetCalories = tdee;
    let goalText = '維持現狀';
    
    if (goalMode === 'lose' || goalMode === 'gain') {
       const today = new Date();
       today.setMonth(today.getMonth() + Number(targetMonths));
       const y = today.getFullYear();
       const m = String(today.getMonth() + 1).padStart(2, '0');
       const d = String(today.getDate()).padStart(2, '0');
       const dateStr = `${y}/${m}/${d}`;

       if (goalMode === 'lose') {
          targetCalories -= dailyDiff;
          goalText = `減脂 ${targetKg}kg (${targetMonths}個月) [${dateStr} 目標]`;
       } else {
          targetCalories += dailyDiff;
          goalText = `增肌 ${targetKg}kg (${targetMonths}個月) [${dateStr} 目標]`;
       }
    }
    
    // Macros 30% Protein, 40% Carbs, 30% Fats
    const targetProtein = Math.round((targetCalories * 0.30) / 4);
    const targetCarbs = Math.round((targetCalories * 0.40) / 4);
    const targetFat = Math.round((targetCalories * 0.30) / 9);
    
    if (headers.indexOf('goal') !== -1) sheet.getRange(userRowIndex, headers.indexOf('goal') + 1).setValue(goalText);
    if (headers.indexOf('target_calories') !== -1) sheet.getRange(userRowIndex, headers.indexOf('target_calories') + 1).setValue(targetCalories);
    if (headers.indexOf('target_protein') !== -1) sheet.getRange(userRowIndex, headers.indexOf('target_protein') + 1).setValue(targetProtein);
    if (headers.indexOf('target_carbs') !== -1) sheet.getRange(userRowIndex, headers.indexOf('target_carbs') + 1).setValue(targetCarbs);
    if (headers.indexOf('target_fat') !== -1) sheet.getRange(userRowIndex, headers.indexOf('target_fat') + 1).setValue(targetFat);
    
    return { 
      success: true, 
      message: '目標設定已更新！',
      user: {
        user_id: userObj.user_id,
        email: userObj.email,
        username: userObj.username,
        gender: userObj.gender,
        age: userObj.age,
        height: userObj.height,
        weight: userObj.weight,
        activity_level: userObj.activity_level,
        plan_type: userObj.plan_type,
        tdee: tdee,
        goal: goalText,
        target_calories: targetCalories
      }
    };
  } catch(e) { return { success: false, message: '更新失敗: ' + e.toString() }; }
}

function updateProfile(userId, age, gender, height, weight, activityLevel) {
  try {
    const sheet = getDb().getSheetByName('Users');
    const data = sheet.getDataRange().getValues();
    
    let headers = data[0].map(h => String(h).trim().toLowerCase());
    let userRowIndex = -1;
    let userData = null;
    
    for (let r = 1; r < data.length; r++) {
      if (String(data[r][0]) === String(userId)) {
        userRowIndex = r + 1;
        userData = data[r];
        break;
      }
    }
    
    if (userRowIndex === -1) return { success: false, message: '找不到使用者' };
    
    const userObj = {};
    headers.forEach((h, i) => { userObj[h] = userData[i]; });
    
    // 計算新 TDEE
    const isMale = String(gender).toLowerCase() === 'male';
    const bmr = (10 * Number(weight)) + (6.25 * Number(height)) - (5 * Number(age)) + (isMale ? 5 : -161);
    const tdee = Math.round(bmr * Number(activityLevel));
    
    // 寫入基礎屬性
    if (headers.indexOf('age') !== -1) sheet.getRange(userRowIndex, headers.indexOf('age') + 1).setValue(age);
    if (headers.indexOf('gender') !== -1) sheet.getRange(userRowIndex, headers.indexOf('gender') + 1).setValue(gender);
    if (headers.indexOf('height') !== -1) sheet.getRange(userRowIndex, headers.indexOf('height') + 1).setValue(height);
    if (headers.indexOf('weight') !== -1) sheet.getRange(userRowIndex, headers.indexOf('weight') + 1).setValue(weight);
    if (headers.indexOf('activity_level') !== -1) sheet.getRange(userRowIndex, headers.indexOf('activity_level') + 1).setValue(activityLevel);
    if (headers.indexOf('tdee') !== -1) sheet.getRange(userRowIndex, headers.indexOf('tdee') + 1).setValue(tdee);
    
    // 若原先有建立減脂/增肌目標，順帶基於新 TDEE 計算新的赤字與參數
    let targetCalories = tdee;
    let goalText = userObj.goal || '維持現狀';
    
    const match = goalText.match(/(減脂|增肌)\s*([\d\.]+)kg\s*\(([\d\.]+)個月\)/);
    if (match) {
        const goalMode = match[1] === '減脂' ? 'lose' : 'gain';
        const targetKg = Number(match[2]);
        const targetMonths = Number(match[3]);
        const totalCals = targetKg * 7700;
        const days = targetMonths * 30;
        const dailyDiff = days > 0 ? Math.round(totalCals / days) : 0;
        
        if (goalMode === 'lose') targetCalories -= dailyDiff;
        else targetCalories += dailyDiff;
    }
    
    // 重新配置 3:4:3 四大巨集
    const targetProtein = Math.round((targetCalories * 0.30) / 4);
    const targetCarbs = Math.round((targetCalories * 0.40) / 4);
    const targetFat = Math.round((targetCalories * 0.30) / 9);
    
    if (headers.indexOf('target_calories') !== -1) sheet.getRange(userRowIndex, headers.indexOf('target_calories') + 1).setValue(targetCalories);
    if (headers.indexOf('target_protein') !== -1) sheet.getRange(userRowIndex, headers.indexOf('target_protein') + 1).setValue(targetProtein);
    if (headers.indexOf('target_carbs') !== -1) sheet.getRange(userRowIndex, headers.indexOf('target_carbs') + 1).setValue(targetCarbs);
    if (headers.indexOf('target_fat') !== -1) sheet.getRange(userRowIndex, headers.indexOf('target_fat') + 1).setValue(targetFat);
    
    return { 
      success: true, 
      message: '個人資料與 TDEE 已更新！',
      user: {
        user_id: userObj.user_id,
        email: userObj.email,
        username: userObj.username,
        gender: gender,
        age: age,
        height: height,
        weight: weight,
        activity_level: activityLevel,
        plan_type: userObj.plan_type,
        tdee: tdee,
        goal: goalText,
        target_calories: targetCalories
      }
    };
  } catch(e) { return { success: false, message: '更新失敗: ' + e.toString() }; }
}

function analyzeFoodImage(userId, base64Image) {
  try {
    const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    if (!apiKey) {
      return { success: false, message: '尚未設定 GEMINI_API_KEY，請依照教學在 Apps Script 專案屬性中新增金鑰。' };
    }

    const base64Data = base64Image.split(',')[1] || base64Image;
    
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    
    const payload = {
      "contents": [{
        "parts": [
          {"text": "你是一位專業營養師。請精準辨識圖片中的主要食物，估算一份合理的實用份量，並提供大致的熱量(kcal)與三大營養素(克)。請嚴格只回傳 JSON 格式，格式要求：{\"foodName\": \"...\", \"estimatedAmount\": \"...\", \"calories\": 0, \"protein\": 0, \"carbs\": 0, \"fat\": 0}"},
          {
            "inline_data": {
              "mime_type": "image/jpeg",
              "data": base64Data
            }
          }
        ]
      }],
      "generationConfig": {
         "responseMimeType": "application/json"
      }
    };

    const options = {
      "method": "post",
      "contentType": "application/json",
      "payload": JSON.stringify(payload),
      "muteHttpExceptions": true
    };

    const res = UrlFetchApp.fetch(url, options);
    const resultText = res.getContentText();
    const resultObj = JSON.parse(resultText);

    if (res.getResponseCode() !== 200) {
      return { success: false, message: 'AI 辨識發生錯誤：' + (resultObj.error?.message || '未知的 API 錯誤') };
    }

    const aiResponseText = resultObj.candidates[0].content.parts[0].text;
    const nutritionInfo = JSON.parse(aiResponseText);

    return {
      success: true,
      data: {
        foodName: nutritionInfo.foodName || 'AI 辨識食物',
        estimatedAmount: nutritionInfo.estimatedAmount || '1份',
        calories: Number(nutritionInfo.calories) || 0,
        protein: Number(nutritionInfo.protein) || 0,
        carbs: Number(nutritionInfo.carbs) || 0,
        fat: Number(nutritionInfo.fat) || 0
      }
    };
  } catch (error) {
    return { success: false, message: '伺服器執行 AI 分析時發生異常：' + error.toString() };
  }
}

// 【新增】：讀取食物資料庫與分類清單並回傳給前端
function getFoodData() {
  try {
    const db = getDb();
    
    // 不再使用 getSheetDataAsObjects 以避免標題空白、字元不同導致抓錯
    // 改用 fuzzy 抓取，防止工作表名稱被不小心多按空白鍵
    const classSheet = getSheetFuzzy(db, 'Food ID Classification');
    const categories = [];
    if (classSheet) {
      const cData = classSheet.getDataRange().getValues();
      for (let i = 1; i < cData.length; i++) {
        if (String(cData[i][0]).trim()) {
          categories.push({
            prefix: String(cData[i][0]).trim(),
            name: String(cData[i][1]).trim()
          });
        }
      }
    }

    const foodSheet = getSheetFuzzy(db, 'FoodDB');
    const foods = [];
    if (foodSheet) {
      const fData = foodSheet.getDataRange().getValues();
      for (let i = 1; i < fData.length; i++) {
        if (String(fData[i][0]).trim()) {
          foods.push({
            food_id: String(fData[i][0]).trim(),
            name: String(fData[i][1]).trim(),
            calories: Number(fData[i][2]) || 0,
            protein: Number(fData[i][3]) || 0,
            carbs: Number(fData[i][4]) || 0,
            fat: Number(fData[i][5]) || 0,
            serving_unit: String(fData[i][6] || '1份').trim()
          });
        }
      }
    }

    return { 
      success: true, 
      data: { categories: categories, foods: foods } 
    };
  } catch (error) {
    return { success: false, message: '取得食物資料庫失敗：' + error.toString() };
  }
}

// ==========================================
// 8. 體重與體脂歷史追蹤 API
// ==========================================

function addBodyStat(userId, dateStr, weight, bodyFat) {
  try {
    const sheet = getDb().getSheetByName('BodyStats');
    if (!sheet) return { success: false, message: '尚未建立 BodyStats 資料表' };
    
    const data = sheet.getDataRange().getValues();
    const headers = data[0].map(h => String(h).trim().toLowerCase());
    
    // 將輸入日期正規化為字串，避免 JS Date 與 Sheet Date 比對失敗
    const inputDateStr = new Date(dateStr).toDateString();
    
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
        const rowUserId = String(data[i][headers.indexOf('user_id')]);
        const rowDate = new Date(data[i][headers.indexOf('date')]).toDateString();
        
        if (rowUserId === String(userId) && rowDate === inputDateStr) {
            rowIndex = i + 1;
            break;
        }
    }
    
    const logId = rowIndex === -1 ? generateUUID() : String(data[rowIndex - 1][headers.indexOf('log_id')]);
    const now = new Date().toISOString();

    if (rowIndex === -1) {
        const newRow = Array(headers.length).fill('');
        if (headers.indexOf('log_id') !== -1) newRow[headers.indexOf('log_id')] = logId;
        if (headers.indexOf('user_id') !== -1) newRow[headers.indexOf('user_id')] = userId;
        if (headers.indexOf('date') !== -1) newRow[headers.indexOf('date')] = dateStr;
        if (headers.indexOf('weight') !== -1) newRow[headers.indexOf('weight')] = weight;
        if (headers.indexOf('body_fat') !== -1) newRow[headers.indexOf('body_fat')] = bodyFat;
        if (headers.indexOf('created_at') !== -1) newRow[headers.indexOf('created_at')] = now;
        sheet.appendRow(newRow);
    } else {
        if (headers.indexOf('weight') !== -1) sheet.getRange(rowIndex, headers.indexOf('weight') + 1).setValue(weight);
        if (headers.indexOf('body_fat') !== -1) sheet.getRange(rowIndex, headers.indexOf('body_fat') + 1).setValue(bodyFat);
    }
    
    SpreadsheetApp.flush(); // 強制寫入後再讀取，確保抓到最新資料
    
    // --- 尋找該使用者的「最新一筆」紀錄 ---
    const newData = sheet.getDataRange().getValues();
    let latestWeight = weight;
    let latestDate = new Date('2000-01-01');
    
    for (let i = 1; i < newData.length; i++) {
        if (String(newData[i][headers.indexOf('user_id')]) === String(userId)) {
            const d = new Date(newData[i][headers.indexOf('date')]);
            if (d >= latestDate) {
                latestDate = d;
                latestWeight = newData[i][headers.indexOf('weight')];
            }
        }
    }
    
    // --- 更新 Users 表 (只用找到的最新體重重算 TDEE) ---
    let updatedUser = null;
    try {
      const uSheet = getDb().getSheetByName('Users');
      const uData = uSheet.getDataRange().getValues();
      const uHeaders = uData[0].map(h => String(h).trim().toLowerCase());

      for (let r = 1; r < uData.length; r++) {
         if (String(uData[r][0]) === String(userId)) {
             const userRowIndex = r + 1;
             const userObj = {};
             uHeaders.forEach((h, idx) => { userObj[h] = uData[r][idx]; });

             if (uHeaders.indexOf('weight') !== -1) uSheet.getRange(userRowIndex, uHeaders.indexOf('weight') + 1).setValue(latestWeight);

             const age = Number(userObj.age);
             const gender = String(userObj.gender);
             const height = Number(userObj.height);
             const activityLevel = Number(userObj.activity_level);
             const goalText = String(userObj.goal || '維持現狀');

             const isMale = gender.toLowerCase() === 'male';
             const bmr = (10 * Number(latestWeight)) + (6.25 * height) - (5 * age) + (isMale ? 5 : -161);
             const tdee = Math.round(bmr * activityLevel);

             if (uHeaders.indexOf('tdee') !== -1) uSheet.getRange(userRowIndex, uHeaders.indexOf('tdee') + 1).setValue(tdee);

             let targetCalories = tdee;
             const match = goalText.match(/(減脂|增肌)\s*([\d\.]+)kg\s*\(([\d\.]+)個月\)/);

             if (match) {
                 const goalMode = match[1] === '減脂' ? 'lose' : 'gain';
                 const targetKg = Number(match[2]);
                 const targetMonths = Number(match[3]);
                 const dailyDiff = (targetMonths * 30) > 0 ? Math.round((targetKg * 7700) / (targetMonths * 30)) : 0;
                 if (goalMode === 'lose') targetCalories -= dailyDiff;
                 else targetCalories += dailyDiff;
             }

             const targetProtein = Math.round((targetCalories * 0.30) / 4);
             const targetCarbs = Math.round((targetCalories * 0.40) / 4);
             const targetFat = Math.round((targetCalories * 0.30) / 9);

             if (uHeaders.indexOf('target_calories') !== -1) uSheet.getRange(userRowIndex, uHeaders.indexOf('target_calories') + 1).setValue(targetCalories);
             if (uHeaders.indexOf('target_protein') !== -1) uSheet.getRange(userRowIndex, uHeaders.indexOf('target_protein') + 1).setValue(targetProtein);
             if (uHeaders.indexOf('target_carbs') !== -1) uSheet.getRange(userRowIndex, uHeaders.indexOf('target_carbs') + 1).setValue(targetCarbs);
             if (uHeaders.indexOf('target_fat') !== -1) uSheet.getRange(userRowIndex, uHeaders.indexOf('target_fat') + 1).setValue(targetFat);

             updatedUser = { ...userObj, weight: latestWeight, tdee: tdee, target_calories: targetCalories };
             break;
         }
      }
    } catch(e) {}
    
    return { success: true, message: '體態紀錄成功', updatedUser: updatedUser };
  } catch (err) {
    return { success: false, message: '新增體態失敗：' + err.toString() };
  }
}
// ==========================================
// 補回：取得體態歷史資料 API
// ==========================================
function getBodyStats(userId, days) {
  try {
    const sheet = getDb().getSheetByName('BodyStats');
    if (!sheet) return { success: false, message: '尚未建立 BodyStats 資料表' };

    const data = sheet.getDataRange().getValues();
    const headers = data[0].map(h => String(h).trim().toLowerCase());

    let stats = [];
    for (let i = 1; i < data.length; i++) {
        if (String(data[i][headers.indexOf('user_id')]) === String(userId)) {
             stats.push({
                 date: String(data[i][headers.indexOf('date')]),
                 weight: Number(data[i][headers.indexOf('weight')]),
                 body_fat: Number(data[i][headers.indexOf('body_fat')])
             });
        }
    }
    // 確保日期由舊到新排序
    stats.sort((a,b) => new Date(a.date) - new Date(b.date));
    return { success: true, stats: stats };
  } catch (err) {
    return { success: false, message: '取得體態失敗：' + err.toString() };
  }
}