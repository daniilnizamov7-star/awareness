// === CONFIG ===
const PRAYER_DATA_URL = 'https://raw.githubusercontent.com/daniilnizamov7-star/Namaz/main/api/prayer-data.json';
const STORAGE_KEY = 'prayer_tracker_v1';
const CACHE_KEY = 'prayer_cache_v1';

// Порядок намазов (sunrise исключаем из молитв)
const PRAYER_KEYS = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
const NAMES_RU = { fajr: 'Фаджр', sunrise: 'Восход', dhuhr: 'Зухр', asr: 'Аср', maghrib: 'Магриб', isha: 'Иша' };

// Русские месяцы для парсинга даты
const MONTHS_RU = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];

// === UTILS ===
const showToast = (msg) => {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
};
const showError = (show) => {
  document.getElementById('error-banner').classList.toggle('show', show);
};

// === ФОРМАТ ДАТЫ: "18 апр" ===
const getTodayDateStr = () => {
  const d = new Date();
  return `${d.getDate()} ${MONTHS_RU[d.getMonth()]}`;
};

// === РЕЗЕРВНЫЕ ДАННЫЕ (Челябинск) ===
const getFallbackData = () => ({
  fajr: "03:48", sunrise: "05:26", dhuhr: "12:49", asr: "17:03", maghrib: "20:12", isha: "21:50"
});

// === ПАРСИНГ: из твоего JSON в плоский объект с таймингами ===
const parsePrayerData = (json) => {
  try {
    // Твоя структура: { monthName: "...", schedule: [ { date: "18 апр", fajr: "...", ... }, ... ] }
    if (!json?.schedule || !Array.isArray(json.schedule)) {
      console.warn('⚠️ Нет массива schedule в данных');
      return null;
    }
    
    const todayStr = getTodayDateStr(); // "22 апр"
    console.log('🔍 Ищу дату:', todayStr);
    
    // Ищем запись на сегодня
    const todayEntry = json.schedule.find(item => item.date === todayStr);
    
    if (!todayEntry) {
      console.warn(`⚠️ Не найдена запись на "${todayStr}". Доступные даты:`, json.schedule.slice(0,5).map(i=>i.date));
      // Берем первую запись как фоллбэк
      return extractTimings(json.schedule[0]);
    }
    
    console.log('✅ Найдена запись:', todayEntry.date);
    return extractTimings(todayEntry);
    
  } catch (e) {
    console.error('❌ Ошибка парсинга:', e);
    return null;
  }
};

// === Извлечение таймингов из записи ===
const extractTimings = (entry) => {
  if (!entry) return null;
  const result = {};
  
  for (const key of PRAYER_KEYS) {
    if (entry[key]) {
      result[key] = entry[key];
    }
  }
  
  // Проверка: минимум 4 намаза должны быть
  if (Object.keys(result).length < 4) {
    console.warn('⚠️ Слишком мало таймингов:', result);
    return null;
  }
  
  return result;
};

// === ЗАГРУЗКА ДАННЫХ ===
const loadPrayerData = async () => {
  // 1. Пробуем кэш (быстро)
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < 24 * 60 * 60 * 1000) {
        console.log('✅ Данные из кэша');
        return data;
      }
    }
  } catch (e) { console.warn('Cache read error', e); }

  // 2. Загрузка с сервера
  try {
    console.log('🔄 Загрузка с GitHub...');
    const res = await fetch(PRAYER_DATA_URL + '?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    
    const json = await res.json();
    const timings = parsePrayerData(json);
    
    if (!timings) throw new Error('Не удалось распарсить данные');
    
    // Кэшируем результат
    localStorage.setItem(CACHE_KEY, JSON.stringify({  timings, timestamp: Date.now() }));
    console.log('✅ Данные обновлены:', timings);
    return timings;
    
  } catch (e) {
    console.warn('⚠️ Ошибка загрузки:', e.message);
    showError(true);
    
    // 3. Старый кэш
    const old = localStorage.getItem(CACHE_KEY);
    if (old) {
      try {
        const parsed = JSON.parse(old);
        if (parsed.data) {
          console.log('♻️ Данные из старого кэша');
          return parsed.data;
        }
      } catch {}
    }
    
    // 4. Фоллбэк
    console.log('🆘 Используем резервные данные');
    return getFallbackData();
  }
};
