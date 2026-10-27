// 里程碑文案配置 —— 可直接修改此文件替换文案（id 请保持唯一且不要随意更改，已解锁记录按 id 存储）
export const SCORE_MILESTONES = [
  { id: 's200', score: 200, title: '觉醒', line1: '认清自己的软弱，是改变的开始。' },
  { id: 's300', score: 300, title: '自律', line1: '自由不是想做什么就做什么，而是能不做什么。' },
  { id: 's500', score: 500, title: '坚韧', line1: '痛苦没有击垮你，它正在塑造你。' },
  { id: 's800', score: 800, title: '克己', line1: '能管住自己的人，才配掌控更大的事。' },
  { id: 's1000', score: 1000, title: '千锤', line1: '一千分，每一分都是你亲手挣来的。' },
  { id: 's1500', score: 1500, title: '铁律', line1: '规则不再是束缚，而是你的骨架。' },
  { id: 's1800', score: 1800, title: '沉稳', line1: '不急不躁，持续向前，这就是力量。' },
  { id: 's2000', score: 2000, title: '精进', line1: '昨天的你，已经追不上今天的你。' },
  { id: 's3000', score: 3000, title: '卓越', line1: '平庸是默认选项，你选择了另一条路。' },
  { id: 's5000', score: 5000, title: '强者', line1: '强大不是天赋，是日复一日的选择。' },
  { id: 's8000', score: 8000, title: '领袖', line1: '先征服自己，才能带领他人。' },
  { id: 's10000', score: 10000, title: '至臻', line1: '你为自己立法，也为自己加冕。' },
];
// 第二行固定格式
export const scoreLine2 = (m) => `您已成为【${m.title}】男性`;

export const ABSTINENCE_MILESTONES = [
  { id: 'a3', days: 3, percent: 40, line1: '欲望来得快去得也快，你撑过了最初的冲动。' },
  { id: 'a7', days: 7, percent: 60, line1: '一周的清醒，你开始重新夺回注意力。' },
  { id: 'a10', days: 10, percent: 70, line1: '习惯正在松动，意志正在变硬。' },
  { id: 'a20', days: 20, percent: 80, line1: '你已经证明，冲动不是命令。' },
  { id: 'a30', days: 30, percent: 88, line1: '一个月的克制，时间和精力回到了你自己手里。' },
  { id: 'a45', days: 45, percent: 95, line1: '多数人在这里放弃，而你还站着。' },
  { id: 'a90', days: 90, percent: null, final: true, line1: '九十天，旧的你已经过去。' },
];
export const abstinenceLine2 = (m) => (m.final ? '恭喜，您已完成了灵魂的蜕变' : `你已超越 ${m.percent}% 男性，请再接再厉`);
