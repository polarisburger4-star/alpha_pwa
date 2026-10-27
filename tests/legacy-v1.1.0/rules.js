// 积分规则常量（单一事实来源；规则页、计分、导出均引用此处）
export const LEVELS = ['差', '一般', '良好', '优秀'];
export const STRESS_LEVELS = ['轻', '中', '高', 'EM'];
export const LEVEL_VALUE = { '差': 1, '一般': 2, '良好': 3, '优秀': 4 };
export const STRESS_VALUE = { '轻': 1, '中': 2, '高': 3, 'EM': 4 };
export const TRAINING = { high: '高质量', partial: '部分完成' };

export const CUTOFF = { h: 23, m: 30 };          // 打卡截止 23:30
export const EARLY_BED_BEFORE = 23 * 60 + 30;    // 入睡早于 23:30
export const EARLY_WAKE_BY = 7 * 60 + 30;        // 起床不晚于 07:30
export const REMINDER = { h: 19, m: 30 };

// 手动勾选的每日任务
export const TASKS = [
  { key: 'microHabit', label: '微习惯（洗衣/洗碗/晾衣任选其一）', points: 1 },
  { key: 'noMasturbation', label: '当天没有手淫', points: 3 },
  { key: 'chores', label: '完成一项30分钟以上家务', points: 3 },
  { key: 'study', label: '专注学习至少1小时', points: 6 },
  { key: 'reading', label: '专注阅读半小时', points: 3 },
  { key: 'vocab', label: '当日背单词', points: 2 },
  { key: 'approach', label: '搭讪异性并成功索要联系方式', points: 8 },
  { key: 'podcast', label: '收听15分钟podcast', points: 2 },
  { key: 'horseStance', label: '蹲马步5分钟', points: 1 },
  { key: 'meditation', label: '冥想15分钟', points: 2 },
];

// 自动结算的加分项
export const AUTO_BONUS = {
  trainingHigh: { label: '训练：高质量', points: 5 },
  trainingPartial: { label: '训练：部分完成', points: 2 },
  mentalGood: { label: '精神状态良好或优秀', points: 2 },
  psychGood: { label: '心理状态良好或优秀', points: 2 },
  onTime: { label: '按时打卡', points: 1 },
  sleep7: { label: '睡眠≥7小时', points: 2 },
};

export const DEDUCTIONS = {
  relapse: { label: '手淫（破戒申报）', points: -10 },
  missed: { label: '漏打卡', points: -2 },
  sleepLow: { label: '睡眠<5小时', points: -5 },
  mentalLow2: { label: '精神状态连续2天为一般或差', points: -6 },
};

// 连续成就
export const STREAKS = {
  abstinence: { label: '克制手淫', cycle: null, rewards: { 3: 5, 7: 12, 23: 50, 30: 70 } },
  earlyRise: { label: '早睡早起', cycle: 30, rewards: { 7: 10, 21: 33, 30: 66 } },
  vocab: { label: '背单词', cycle: 30, rewards: { 7: 7, 30: 50 } },
};

export const QUICK_PICKS = {
  period: ['清晨', '上午', '下午', '傍晚', '深夜', '凌晨'],
  medium: ['短视频', '图片', '视频网站', '小说', '想象', '其他'],
  trigger: ['无聊', '压力', '失眠', '孤独', '刷手机', '其他'],
};
