/**
 * GeoBerdsk — Location Database
 * Реальные точки Бердска (НСО) на улицах с покрытием Яндекс.Панорам.
 */
window.GeoBerdsk = window.GeoBerdsk || {};

GeoBerdsk.DISTRICTS = [
    { id: 'center',     name: 'Центр',            color: '#0D7377' },
    { id: 'micro',      name: 'Микрорайон',       color: '#14919B' },
    { id: 'north',      name: 'Северный',         color: '#2A9D8F' },
    { id: 'south',      name: 'Южный',            color: '#E9C46A' },
    { id: 'razdolny',   name: 'Раздольный',       color: '#52B788' },
    { id: 'molodezh',   name: 'Молодёжный',       color: '#F4A261' },
    { id: 'waterfront', name: 'Набережная',       color: '#457B9D' },
    { id: 'military',   name: 'Военный городок',  color: '#6C757D' },
    { id: 'novpos',     name: 'Новый посёлок',    color: '#E76F51' },
];

GeoBerdsk.LOCATIONS = [
    // ─── Центр ──────────────────────────────────────────────
    {
        id: 1,
        lat: 54.75176,
        lng: 83.09981,
        name: 'Преображенский собор',
        district: 'center',
        difficulty: 'easy',
        hint: 'Главный храм города, ул. Горького'
    },
    {
        id: 2,
        lat: 54.75590,
        lng: 83.09680,
        name: 'Улица Ленина',
        district: 'center',
        difficulty: 'easy',
        hint: 'Центральная улица города'
    },
    {
        id: 3,
        lat: 54.75640,
        lng: 83.09820,
        name: 'Площадь у ДК «Родина»',
        district: 'center',
        difficulty: 'easy',
        hint: 'Дом культуры в центре'
    },
    {
        id: 4,
        lat: 54.75480,
        lng: 83.10050,
        name: 'Улица Красная Сибирь',
        district: 'center',
        difficulty: 'medium',
        hint: 'Улица с историческим названием'
    },
    {
        id: 5,
        lat: 54.75320,
        lng: 83.09580,
        name: 'Парк Победы',
        district: 'center',
        difficulty: 'easy',
        hint: 'Мемориальный парк в центре'
    },
    {
        id: 6,
        lat: 54.75780,
        lng: 83.09740,
        name: 'Улица Свердлова',
        district: 'center',
        difficulty: 'medium',
        hint: 'Рядом с центральной частью'
    },
    {
        id: 7,
        lat: 54.75520,
        lng: 83.09460,
        name: 'Улица Первомайская',
        district: 'center',
        difficulty: 'medium',
        hint: 'Через центр города'
    },
    {
        id: 8,
        lat: 54.75860,
        lng: 83.09520,
        name: 'Улица Герцена',
        district: 'center',
        difficulty: 'hard',
        hint: 'Тихая улица севернее центра'
    },
    {
        id: 9,
        lat: 54.75240,
        lng: 83.09890,
        name: 'Улица Горького',
        district: 'center',
        difficulty: 'easy',
        hint: 'Улица у Преображенского собора'
    },

    // ─── Микрорайон ─────────────────────────────────────────
    {
        id: 10,
        lat: 54.74980,
        lng: 83.08240,
        name: 'Улица Лунная',
        district: 'micro',
        difficulty: 'medium',
        hint: 'Одна из главных улиц микрорайона'
    },
    {
        id: 11,
        lat: 54.75060,
        lng: 83.08520,
        name: 'Улица Боровая',
        district: 'micro',
        difficulty: 'medium',
        hint: 'Спальный район'
    },
    {
        id: 12,
        lat: 54.74890,
        lng: 83.08410,
        name: 'Улица Рогачёва',
        district: 'micro',
        difficulty: 'hard',
        hint: 'Жилые дома микрорайона'
    },
    {
        id: 13,
        lat: 54.74750,
        lng: 83.08360,
        name: 'Улица Черёмушная',
        district: 'micro',
        difficulty: 'hard',
        hint: 'Окраина микрорайона'
    },
    {
        id: 14,
        lat: 54.75120,
        lng: 83.08100,
        name: 'Улица Автолюбителей',
        district: 'micro',
        difficulty: 'hard',
        hint: 'Характерное название улицы'
    },

    // ─── Северный ───────────────────────────────────────────
    {
        id: 15,
        lat: 54.76380,
        lng: 83.08940,
        name: 'Улица Попова',
        district: 'north',
        difficulty: 'medium',
        hint: 'Северная часть Бердска'
    },
    {
        id: 16,
        lat: 54.76260,
        lng: 83.09280,
        name: 'Улица Комсомольская',
        district: 'north',
        difficulty: 'medium',
        hint: 'Район Северный'
    },
    {
        id: 17,
        lat: 54.76490,
        lng: 83.09120,
        name: 'Улица Новая',
        district: 'north',
        difficulty: 'hard',
        hint: 'Новая застройка на севере'
    },
    {
        id: 18,
        lat: 54.76180,
        lng: 83.08860,
        name: 'Улица К. Маркса',
        district: 'north',
        difficulty: 'medium',
        hint: 'Через северную часть'
    },

    // ─── Южный / Вокзал ─────────────────────────────────────
    {
        id: 19,
        lat: 54.74580,
        lng: 83.09340,
        name: 'Улица Вокзальная',
        district: 'south',
        difficulty: 'medium',
        hint: 'Район у станции Бердск'
    },
    {
        id: 20,
        lat: 54.74460,
        lng: 83.09180,
        name: 'Станция Бердск',
        district: 'south',
        difficulty: 'easy',
        hint: 'Железнодорожный вокзал'
    },
    {
        id: 21,
        lat: 54.74640,
        lng: 83.09620,
        name: 'Улица Озёрная',
        district: 'south',
        difficulty: 'hard',
        hint: 'Южная часть города'
    },
    {
        id: 22,
        lat: 54.74720,
        lng: 83.09840,
        name: 'Улица Ушакова',
        district: 'south',
        difficulty: 'hard',
        hint: 'Тихая улица на юге'
    },

    // ─── Раздольный ─────────────────────────────────────────
    {
        id: 23,
        lat: 54.76840,
        lng: 83.07820,
        name: 'Улица Раздольная',
        district: 'razdolny',
        difficulty: 'hard',
        hint: 'Микрорайон Раздольный'
    },
    {
        id: 24,
        lat: 54.76960,
        lng: 83.08040,
        name: 'Улица Весенняя',
        district: 'razdolny',
        difficulty: 'hard',
        hint: 'Зелёный район на окраине'
    },
    {
        id: 25,
        lat: 54.76720,
        lng: 83.07960,
        name: 'Улица Садовая',
        district: 'razdolny',
        difficulty: 'hard',
        hint: 'Частный сектор Раздольного'
    },

    // ─── Молодёжный ─────────────────────────────────────────
    {
        id: 26,
        lat: 54.76080,
        lng: 83.10360,
        name: 'Улица Молодёжная',
        district: 'molodezh',
        difficulty: 'medium',
        hint: 'Современный жилой район'
    },
    {
        id: 27,
        lat: 54.75960,
        lng: 83.10180,
        name: 'Улица Спортивная',
        district: 'molodezh',
        difficulty: 'medium',
        hint: 'Рядом со спортплощадками'
    },
    {
        id: 28,
        lat: 54.76140,
        lng: 83.10540,
        name: 'Улица Строителей',
        district: 'molodezh',
        difficulty: 'hard',
        hint: 'Многоэтажная застройка'
    },

    // ─── Набережная / Обское море ───────────────────────────
    {
        id: 29,
        lat: 54.75920,
        lng: 83.10980,
        name: 'Набережная Бердска',
        district: 'waterfront',
        difficulty: 'easy',
        hint: 'Берег Обского моря'
    },
    {
        id: 30,
        lat: 54.76240,
        lng: 83.10820,
        name: 'Бердский залив',
        district: 'waterfront',
        difficulty: 'medium',
        hint: 'Залив водохранилища'
    },
    {
        id: 31,
        lat: 54.76480,
        lng: 83.10640,
        name: 'Городской пляж',
        district: 'waterfront',
        difficulty: 'easy',
        hint: 'Летний отдых у воды'
    },
    {
        id: 32,
        lat: 54.75740,
        lng: 83.11120,
        name: 'Спуск к воде',
        district: 'waterfront',
        difficulty: 'medium',
        hint: 'Дорога к набережной'
    },

    // ─── Военный городок ────────────────────────────────────
    {
        id: 33,
        lat: 54.74320,
        lng: 83.10460,
        name: 'Военный городок',
        district: 'military',
        difficulty: 'hard',
        hint: 'Бывший военный гарнизон'
    },
    {
        id: 34,
        lat: 54.74200,
        lng: 83.10680,
        name: 'Улица у военного городка',
        district: 'military',
        difficulty: 'hard',
        hint: 'Южная окраина'
    },

    // ─── Новый посёлок ──────────────────────────────────────
    {
        id: 35,
        lat: 54.75360,
        lng: 83.10620,
        name: 'Новый посёлок',
        district: 'novpos',
        difficulty: 'hard',
        hint: 'Район Новый посёлок'
    },
    {
        id: 36,
        lat: 54.75480,
        lng: 83.10440,
        name: 'Улица Островского',
        district: 'novpos',
        difficulty: 'hard',
        hint: 'Восточная часть города'
    },
];

GeoBerdsk.getRandomLocations = function(count, difficulty) {
    let pool = GeoBerdsk.LOCATIONS.slice();
    if (difficulty) {
        pool = pool.filter(loc => loc.difficulty === difficulty);
    }
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, Math.min(count, pool.length));
};

GeoBerdsk.getDistrict = function(districtId) {
    return GeoBerdsk.DISTRICTS.find(d => d.id === districtId);
};

/** Новая локация, которой ещё нет в списке (для замены без панорамы) */
GeoBerdsk.getUnusedLocation = function(usedIds) {
    const used = new Set(usedIds || []);
    const pool = GeoBerdsk.LOCATIONS.filter(l => !used.has(l.id));
    if (!pool.length) return null;
    return pool[Math.floor(Math.random() * pool.length)];
};
