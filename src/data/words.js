// TODO: заменить на fetch к Apps Script Web App API (GET /words, /user_words и т.д.)
// Структура полей уже соответствует схеме листов words + user_words.
export const WORDS = [
  { id: "1", ru: "я", uz: "men", topic: "Местоимения", level: "A1", stage: 5, decay: 0, examples: [
    { uz: "Men talabaman.", ru: "Я студент." },
    { uz: "Men har kuni maktabga boraman.", ru: "Я каждый день хожу в школу." },
    { uz: "Men bugun ishga kech qoldim.", ru: "Я сегодня опоздал на работу." },
    { uz: "Men bu masalani hal qilish uchun ko'p vaqt sarfladim.", ru: "Я потратил много времени, чтобы решить эту проблему." },
    { uz: "Men charchadim, bugun uyda qolaman.", ru: "Я устал, сегодня останусь дома." },
  ]},
  { id: "2", ru: "ты", uz: "sen", topic: "Местоимения", level: "A1", stage: 5, decay: 0.6, examples: [
    { uz: "Sen yoshsan.", ru: "Ты молодой." },
    { uz: "Sen qayerdan kelding?", ru: "Ты откуда приехал?" },
    { uz: "Sen menga yordam bera olasanmi?", ru: "Ты можешь мне помочь?" },
    { uz: "Sen har doim vaqtida kelasan, bu menga yoqadi.", ru: "Ты всегда приходишь вовремя, это мне нравится." },
    { uz: "Sen-chi, bugun bo'shmisan?", ru: "А ты, ты сегодня свободен?" },
  ]},
  { id: "3", ru: "он, она, оно", uz: "u", topic: "Местоимения", level: "A1", stage: 4, decay: 0, examples: [
    { uz: "U mening do'stim.", ru: "Он мой друг." },
    { uz: "U bozorga ketdi.", ru: "Она пошла на рынок." },
    { uz: "U kitob o'qishni yaxshi ko'radi.", ru: "Он любит читать книги." },
    { uz: "U bu yil universitetni tugatadi.", ru: "Он в этом году закончит университет." },
    { uz: "U hali kelmadi, kutyapmiz.", ru: "Он ещё не пришёл, ждём." },
  ]},
  { id: "4", ru: "мы", uz: "biz", topic: "Местоимения", level: "A1", stage: 3, decay: 0, examples: [
    { uz: "Biz do'stmiz.", ru: "Мы друзья." },
    { uz: "Biz uyda o'tiribmiz.", ru: "Мы сидим дома." },
    { uz: "Biz dam olish kuni sayrga boramiz.", ru: "Мы в выходной пойдём гулять." },
    { uz: "Biz bu loyihani vaqtida tugatishimiz kerak.", ru: "Нам нужно закончить этот проект вовремя." },
    { uz: "Biz, qani, ketdikmi?", ru: "Ну что, мы пошли?" },
  ]},
  { id: "5", ru: "вы", uz: "siz", topic: "Местоимения", level: "A1", stage: 2, decay: 0, examples: [
    { uz: "Siz o'qituvchimisiz?", ru: "Вы учитель?" },
    { uz: "Siz qayerda yashaysiz?", ru: "Где вы живёте?" },
    { uz: "Siz bu haqda nima deb o'ylaysiz?", ru: "Что вы думаете об этом?" },
    { uz: "Siz bergan maslahat juda foydali bo'ldi.", ru: "Совет, который вы дали, оказался очень полезным." },
    { uz: "Siz ham boryapsizmi bizga?", ru: "Вы тоже идёте с нами?" },
  ]},
  { id: "6", ru: "они", uz: "ular", topic: "Местоимения", level: "A1", stage: 1, decay: 0, examples: [
    { uz: "Ular bolalar.", ru: "Они дети." },
    { uz: "Ular maktabda o'qiydi.", ru: "Они учатся в школе." },
    { uz: "Ular bugun bizning uyimizga kelishadi.", ru: "Они сегодня придут к нам домой." },
    { uz: "Ular bu masalani hal qilish uchun yig'ilish o'tkazishdi.", ru: "Они провели собрание, чтобы решить этот вопрос." },
    { uz: "Ular, bilasanmi, yana kechikishdi.", ru: "Они, знаешь, опять опоздали." },
  ]},
  { id: "7", ru: "Здравствуй!", uz: "Salom!", topic: "Приветствия", level: "A1", stage: 0, decay: 0, examples: [
    { uz: "Salom, men Aziz.", ru: "Здравствуй, я Азиз." },
    { uz: "Salom, qalaysan?", ru: "Здравствуй, как ты?" },
    { uz: "Salom, uzoq vaqtdan beri ko'rinmaysan.", ru: "Здравствуй, давно тебя не видно." },
    { uz: "Salom dedim-u, lekin u javob bermadi.", ru: "Я поздоровался, но он не ответил." },
    { uz: "Salom-a, qaerlarda yurubsan?", ru: "Привет, где ты пропадал?" },
  ]},
  { id: "23", ru: "Спасибо!", uz: "Rahmat!", topic: "Благодарность", level: "A1", stage: 0, decay: 0, examples: [
    { uz: "Rahmat!", ru: "Спасибо!" },
    { uz: "Rahmat, juda yordam berdingiz.", ru: "Спасибо, вы очень помогли." },
    { uz: "Sovg'a uchun katta rahmat aytaman.", ru: "Большое спасибо за подарок." },
    { uz: "Yordamingiz uchun qanchalik rahmat aytsam ham ozlik qiladi.", ru: "Сколько бы я ни благодарил за вашу помощь, всё равно мало." },
    { uz: "Rahmat-a, juda kerak edi!", ru: "Спасибо, это было очень кстати!" },
  ]},
];

// реальный порядок тем и объём слов по уровням — из мастер-листа `words`
export const LEVELS = [
  {
    level: "A1",
    subtitle: "998 слов · база для разговора",
    topics: [
      { id: 1, name: "Местоимения", count: 6, status: "done" },
      { id: 2, name: "Приветствия. Прощания. Извинения. Благодарность", count: 35, status: "done" },
      { id: 3, name: "Обращения", count: 6, status: "done" },
      { id: 4, name: "Числа от 1 до 100", count: 38, status: "current" },
      { id: 10, name: "Самые важные глаголы — 1", count: 28, status: "locked" },
      { id: 11, name: "Самые важные глаголы — 2", count: 44, status: "locked" },
      { id: 14, name: "Цвета", count: 32, status: "locked" },
      { id: 15, name: "Вопросы", count: 19, status: "locked" },
    ],
  },
  {
    level: "A2",
    subtitle: "3 370 слов · расширение словаря",
    topics: [
      { id: 5, name: "Числа от 100", count: 15, status: "locked" },
      { id: 6, name: "Числа. Порядковые числительные", count: 10, status: "locked" },
      { id: 12, name: "Самые важные глаголы — 3", count: 40, status: "locked" },
    ],
  },
  {
    level: "B1",
    subtitle: "3 196 слов · беглая речь",
    topics: [
      { id: 7, name: "Числа. Дроби", count: 8, status: "locked" },
      { id: 62, name: "Черты характера. Личность", count: 59, status: "locked" },
    ],
  },
  {
    level: "B2",
    subtitle: "1 208 слов · свободное владение",
    topics: [
      { id: 106, name: "Производство", count: 55, status: "locked" },
      { id: 117, name: "Отрасли и виды бизнеса", count: 70, status: "locked" },
    ],
  },
];
