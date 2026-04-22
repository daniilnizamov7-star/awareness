// === CONFIG ===
const PRAYER_DATA_URL = 'https://raw.githubusercontent.com/daniilnizamov7-star/Namaz/main/api/prayer-data.json';
const STORAGE_KEY = 'prayer_tracker_v1';
const CACHE_KEY = 'prayer_cache_v1';
const PRAYER_ORDER = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
const NAMES_RU = { fajr: 'Фаджр', sunrise: 'Восход', dhuhr: 'Зухр', asr: 'Аср', maghrib: 'Магриб', isha: 'Иша' };

// === UTILS ===
const sanitize = (str) => String(str || '').replace(/[<>]/g, '').trim();
const showToast = (msg) => {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
};
const showError = (show) => {
  document.getElementById('error-banner').classList.toggle('show', show);
};

// === DEBUG: Показать, что реально приходит ===
const debugFetch = async () => {
  try {
    const res = await fetch(PRAYER_DATA_URL + '?t=' + Date.now(), { cache: 'no-store' });
    const text = await res.text();
    console.log('🔍 RAW RESPONSE (' + res.status + '):', text.substring(0, 800));
    try {
      const json = JSON.parse(text);
      console.log('🔍 PARSED TYPE:', Array.isArray(json) ? 'ARRAY' : typeof json, 'KEYS:', Object.keys(json).slice(0,10));
    } catch(e) { console.log('🔍 NOT JSON'); }
  } catch(e) { console.log('🔍 FETCH ERROR:', e.message); }
};
// Раскомментируй для отладки: 
// debugFetch();

// === DATA: Универсальный парсер ===
const getFallbackData = () => ({
  fajr: "03:48", sunrise: "05:26", dhuhr: "12:49", asr: "17:03", maghrib: "20:12", isha: "21:50"
});

const parseTodayFromSchedule = (schedule) => {
  // Ищем запись на сегодня. Формат даты в файле может быть "27 мая" или "2026-04-22"
  const today = new Date();
  const todayStr1 = today.getDate() + ' ' + ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'][today.getMonth()];
  const todayStr2 = today.toISOString().split('T')[0];
  
  const entry = schedule.find(item => 
    item.date === todayStr1 || item.date === todayStr2 || item.date?.includes(String(today.getDate()))
  );
  
  if (!entry) {
    console.warn('⚠️ Не найдена запись на сегодня в расписании. Беру первую.');
    return schedule[0];
  }
  return entry;
};

const extractTimings = (raw) => {
  // Формат 1: { timings: { Fajr: "..." } }
  if (raw?.timings && typeof raw.timings === 'object') return raw.timings;
  
  // Формат 2: Плоский объект { Fajr: "03:48", ... }
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && raw['Fajr'] || raw['fajr']) return raw;
  
  // Формат 3: Массив расписания [{ date: "...", fajr: "..." }]
  if (Array.isArray(raw) && raw.length > 0) {
    const todayEntry = parseTodayFromSchedule(raw);
    if (todayEntry) {
      // Конвертируем ключи в нижний регистр и маппим возможные названия
      const map = { Fajr: 'fajr', Sunrise: 'sunrise', Dhuhr: 'dhuhr', Asr: 'asr', Maghrib: 'maghrib', Isha: 'isha' };
      const result = {};
      for (const [key, val] of Object.entries(todayEntry)) {
        const lower = key.toLowerCase();
        // Если ключ уже намаз — берем
        if (PRAYER_ORDER.includes(lower)) result[lower] = val;
        // Если ключ в маппинге — конвертируем
        else if (map[key] && val) result[map[key]] = val;
      }
      if (Object.keys(result).length >= 3) return result; // минимум 3 намаза = валидно
    }
  }
  
  // Формат 4: Объект, где ключи — даты { "27 мая": { fajr: "..." } }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const today = new Date().getDate() + ' ' + ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'][new Date().getMonth()];
    if (raw[today] && typeof raw[today] === 'object') return raw[today];
  }
  
  return null;
};

const normalizeData = (raw) => {
  const timings = extractTimings(raw);
  if (!timings) {
    console.warn('⚠️ Не удалось извлечь timings, структура:', raw);
    return getFallbackData();
  }
  
  const normalized = {};
  for (const [key, val] of Object.entries(timings)) {
    const k = key.toLowerCase();
    // Поддержка разных написаний
    if (PRAYER_ORDER.includes(k)) normalized[k] = val;
    else if (k === 'fagr') normalized['fajr'] = val; // опечатки
    else if (k === 'zuhr') normalized['dhuhr'] = val;
  }
  
  // Проверка: есть ли хотя бы 3 намаза
  const count = PRAYER_ORDER.filter(k => normalized[k]).length;
  if (count < 3) {
    console.warn('⚠️ Слишком мало намазов найдено (' + count + '), использую фоллбэк');
    return getFallbackData();
  }
  
  console.log('✅ Нормализовано:', normalized);
  return normalized;
};

const loadPrayerData = async () => {
  // 1. Кэш (быстрый путь)
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < 24 * 60 * 60 * 1000) {
        console.log('✅ Данные из кэша');
        return normalizeData(data);
      }
    }
  } catch (e) { console.warn('Cache read error', e); }

  // 2. Сеть
  try {
    console.log('🔄 Загрузка с ' + PRAYER_DATA_URL);
    const res = await fetch(PRAYER_DATA_URL + '?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data: json, timestamp: Date.now() }));
    console.log('✅ Данные обновлены');
    return normalizeData(json);
  } catch (e) {
    console.warn('⚠️ Ошибка загрузки:', e.message);
    showError(true);
    
    // 3. Старый кэш
    const old = localStorage.getItem(CACHE_KEY);
    if (old) {
      console.log('♻️ Старый кэш');
      return normalizeData(JSON.parse(old).data);
    }
    
    // 4. Фоллбэк
    console.log('🆘 Резервные данные');
    return getFallbackData();
  }
};
