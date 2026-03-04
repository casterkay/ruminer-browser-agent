/**
 * Random Loading texts
 * Used by TimelineStatusStep as playful waiting hints.
 *
 * Note: texts are NOT direct translations across languages.
 */

type LoadingLocale = 'en' | 'de' | 'ja' | 'ko' | 'zh-CN' | 'zh-TW';

const LOADING_TEXTS: Record<LoadingLocale, string[]> = {
  // English (funny, slightly nerdy)
  en: [
    'Brewing a fresh batch of words…',
    'Reticulating splines (for legal reasons)…',
    'Consulting the council of tabs…',
    'Assembling pixels into meaning…',
    'Negotiating with the laws of physics…',
    'Turning coffee into conclusions…',
    'Loading… but with confidence.',
    'Counting to infinity. Almost there.',
    'Polishing the punchline…',
    'Summoning an answer from the void…',
    'Finding the missing semicolon…',
    'Warming up the thinking engine…',
    'Unspooling the thread of logic…',
    'Asking politely for more CPU…',
    'Calibrating the vibes…',
    'Spinning up tiny hamsters…',
    'Compiling thoughts into sentences…',
    'Searching for the correct "it depends"…',
    'Making it make sense…',
    'Converting chaos into bullet points…',
    'Buffering brilliance…',
    'Reading between the lines… literally.',
    'Negotiating with the cache…',
    'Putting the finishing touch on reality…',
  ],

  // German (dry humor, office + engineering vibes)
  de: [
    'Kaffee rein, Erkenntnis raus…',
    'Bitte warten – das Gehirn macht ein Update.',
    'Ich sortiere Gedanken nach DIN-Norm…',
    'Die Antwort wird gerade entknotet…',
    'Kurz die Realität neu kompilieren…',
    'Ich suche noch die letzte Fußnote…',
    'Einmal tief durchatmen, dann Vollgas.',
    'Das dauert nur ein paar Nanosekunden (plus Versand).',
    'Ich verhandle mit dem Cache…',
    'Wörter werden gerade frisch abgewogen…',
    'Die Logik sitzt noch im Stau.',
    'Antwort wird sorgfältig entstaubt…',
    'Bitte nicht drücken – Denkprozess läuft.',
    'Ich lese die Zwischenzeilen im Schritttempo…',
    'Noch schnell die Kommas zählen…',
    'Gedanken werden gerade entwirrt.',
    'Synchronisiere Hirn und Bildschirm…',
    'Ich baue eine Brücke über den Abgrund der Unklarheit…',
    'Die letzte Schraube am Satz sitzt gleich.',
    'Qualitätssicherung für gute Ideen läuft…',
    'Ich finde den einen Bug in der Formulierung…',
    'Warte kurz – ich lade die passenden Wörter nach.',
  ],

  // Japanese (light, friendly internet tone; no direct CN meme translations)
  ja: [
    'ただいま脳内会議中…',
    'ことばを煮詰めています…',
    'アイデア、焼きたてでお届けします。',
    '思考が回線を温めています…',
    '答えのパーツを組み立て中…',
    '少々お待ちを。語彙が整列中です。',
    '今、最適解を探して迷子です。',
    'ログを読みながらそれっぽく頷いています…',
    '文章に魂を込めています…',
    '脳みそ、起動しました。二度寝しないで。',
    '答えを見つけるまで三周します（予定）',
    '知識の引き出しをひっくり返し中…',
    'ちょっとだけ、深呼吸タイム。',
    '推論が散歩から戻るのを待っています…',
    'いい感じの言い回しを探しています。',
    '「なるほど」を生成中…',
    '一旦、宇宙に問い合わせています…',
    '答えの輪郭が見えてきました。たぶん。',
    '読みやすさを最優先で調整中…',
    '最後の一文が反抗期です…',
  ],

  // Korean (playful, casual; tech + daily life)
  ko: [
    '뇌가 지금 회의 중입니다…',
    '답변을 예쁘게 다듬는 중…',
    '문장에 숨을 불어넣는 중…',
    '잠깐만요, 논리가 줄을 서고 있어요.',
    '커피를 아이디어로 변환 중…',
    '정답 후보들이 싸우는 중…',
    '맞는 단어를 찾느라 서랍 뒤지는 중…',
    '지금은 로딩이 아니라 “생각”입니다.',
    '마지막 문장이 말썽… 설득 중…',
    '뭔가 그럴듯한 정리력을 소환 중…',
    '캐시랑 협상 중입니다…',
    '단어를 한 땀 한 땀 꿰매는 중…',
    '알아듣기 쉬운 버전으로 변환 중…',
    '뇌내 검색 결과를 정렬하는 중…',
    '답이 곧 도착합니다. (아마도)',
    '잠깐만요, 정확도를 올리는 중…',
    '의미를 픽셀처럼 맞추는 중…',
    '이번엔 진짜로 거의 다 왔어요.',
    '생각이 생각을 부르는 중…',
    '좋은 비유를 찾는 중…',
  ],

  // Simplified Chinese (existing set)
  'zh-CN': [
    // 必选神梗
    '本来应该从从容容游刃有余',
    '现在是匆匆忙忙连滚带爬',
    '我知道你很急，但是先别急',
    '在知识的海洋里狗刨',
    '让子弹再飞一会儿',
    '正在为您手搓答案',
    '浪浪山小妖怪集结中',
    '别催，已经在写了（新建文件夹）',
    '正在汗流浃背地思考中',
    'CPU 都要给我干烧了',
    // 生活气息
    '村咖慢焙，精华需要时间',
    '知识煎饼翻面中',
    '敬自己一杯，马上好',
    '正在把灵感放入烤箱',
    '让答案再泡一会儿',
    '情绪价值拉满中',
    '正在为您编织语言的毛衣',
    // 脑洞大开
    '神经元蹦迪中',
    '熬夜的猫头鹰在思考',
    '给答案上色中',
    '正在疯狂翻阅知识库',
    '大脑马戏团开演',
    '正在把 0 和 1 捏在一起',
    '正在憋个大招',
    '放大镜有点起雾，擦擦',
    '试图理解这个离谱的需求',
    // 玄幻
    '正在施法，莫打扰',
    '唤醒硅基朋友',
    '正在连接赛博空间的智慧',
    '道友请留步，正在推演',
    '穿越知识黑洞',
    '正在反向解析人类意图',
    '水晶球有点模糊，拍两下',
    // 职场
    '代码跑得比记者还快',
    '主理人已上线，请稍候',
    '快马加鞭赶来中',
    '正在光速搬运知识',
    '拼图最后一块',
    '答案即将杀青',
    '发射倒计时',
    '目标锁定中',
  ],

  // Traditional Chinese (Taiwan / HK flavor; not a direct conversion)
  'zh-TW': [
    '先讓我把腦袋開機一下…',
    '答案正在路上，別催它。',
    '我在跟邏輯談判中…',
    '文字正在排隊報到。',
    '把靈感放進烤箱，溫度剛好。',
    '正在把想法整理成好讀的樣子…',
    '我知道你很急，但先喝口水。',
    '正在把複雜變簡單（努力中）',
    '腦內小劇場演出中…',
    '語氣正在調到剛剛好。',
    '最後一句話有點叛逆，正在哄。',
    '我在知識倉庫裡翻箱倒櫃…',
    '把 0 和 1 攪拌均勻中…',
    '請稍候，精準度正在加料。',
    '正在把答案拋光，不刺眼那種。',
    '思考速度取決於咖啡濃度…',
    '快好了！我先把重點圈起來。',
    '正在把「嗯…」變成「原來如此」。',
    '先把雜訊降到最低…',
    '我在找最不廢話的說法。',
    '正在校正詞彙雷達…',
    '等等，剛剛那個比喻差一點點。',
    '腦袋風扇轉起來了。',
    '把答案打包成小小一包，馬上寄出。',
  ],
};

function getUiLanguage(): string {
  try {
    if (
      typeof chrome !== 'undefined' &&
      chrome.i18n &&
      typeof chrome.i18n.getUILanguage === 'function'
    ) {
      return chrome.i18n.getUILanguage();
    }
  } catch {
    // ignore
  }

  if (typeof navigator !== 'undefined' && navigator.language) {
    return navigator.language;
  }

  return 'en';
}

function resolveLoadingLocale(rawLocale: string): LoadingLocale {
  const normalized = rawLocale.trim();
  if (normalized === 'zh-TW' || normalized === 'zh-HK' || normalized === 'zh-MO') {
    return 'zh-TW';
  }
  if (normalized === 'zh-CN' || normalized.startsWith('zh')) {
    return 'zh-CN';
  }

  const base = normalized.split('-')[0];
  if (base === 'de' || base === 'ja' || base === 'ko' || base === 'en') {
    return base;
  }

  return 'en';
}

/**
 * 获取随机 Loading 文案
 */
export function getRandomLoadingText(): string {
  const locale = resolveLoadingLocale(getUiLanguage());
  const pool = LOADING_TEXTS[locale] ?? LOADING_TEXTS.en;

  if (!pool || pool.length === 0) {
    return 'Loading…';
  }

  return pool[Math.floor(Math.random() * pool.length)];
}
