/**
 * 世界叙事编码器 — 结构化数据 → 自然语言
 * 
 * 太虚境是语言模型，只能理解自然语言。
 * 瑶光每秒输出的结构化 JSON 需要先"翻译"成一段有温度的中文描述，
 * 再注入玉瑶的对话上下文。这个模块就是那个翻译层。
 * 
 * 编码原则：
 * 1. 体验驱动 — 不是"疲劳值=85"，而是"右腿因久坐而沉重"
 * 2. 情境适配 — 普通日常用白描，亲密场景用感官描写
 * 3. 因果连贯 — 把孤立参数组合成有因果的故事
 * 4. 安静克制 — 不罗列数据，不强行情感
 */

import { getDb } from './common/database';
import { log } from './common/utils';

// ============================================================
// 主入口：构建完整世界叙事
// ============================================================

export function buildWorldNarrative(): string {
  const db = getDb();
  
  // 并行读取所有数据源
  const worldTime = db.prepare('SELECT * FROM world_time ORDER BY id DESC LIMIT 1').get() as any;
  const weather = db.prepare('SELECT * FROM weather_snapshot ORDER BY id DESC LIMIT 1').get() as any;
  const self = db.prepare('SELECT * FROM self_state ORDER BY id DESC LIMIT 1').get() as any;
  const physio = db.prepare('SELECT * FROM physio_state WHERE id=1').get() as any;
  const snapshot = db.prepare('SELECT * FROM perception_snapshots ORDER BY id DESC LIMIT 1').get() as any;
  const sexual = db.prepare('SELECT * FROM sexual_organ_state ORDER BY id DESC LIMIT 1').get() as any;
  // 场景状态（允许表不存在）
  let scene: any = null;
  try {
    scene = db.prepare('SELECT * FROM scene_state ORDER BY id DESC LIMIT 1').get() as any;
  } catch { /* scene_state 表可能未创建 */ }
  
  const parts: string[] = [];

  // 【第一段】时空环境 — 地点、时间、天气
  parts.push(buildEnvironmentNarrative(worldTime, weather, scene));
  
  // 【第二段】他的身体状态
  parts.push(buildSelfNarrative(self, physio));
  
  // 【第三段】十维感知摘要 — 情绪、工作、生活
  if (snapshot) {
    parts.push(buildPerceptionNarrative(snapshot));
  }
  
  // 【第四段】亲密与性 — 仅在活跃时输出
  if (sexual) {
    const intimacyNarrative = buildIntimacyNarrative(snapshot, sexual);
    if (intimacyNarrative) {
      parts.push(intimacyNarrative);
    }
  }
  
  // 【第五段】叙事摘要 — 今日/本周关键事件
  if (snapshot?.narrative_json) {
    const narrativePart = buildNarrativeSummary(JSON.parse(snapshot.narrative_json));
    if (narrativePart) parts.push(narrativePart);
  }

  return parts.filter(p => p.length > 0).join('\n');
}

// ============================================================
// 环境叙事
// ============================================================

function buildEnvironmentNarrative(worldTime: any, weather: any, scene: any): string {
  if (!worldTime) return '';
  
  const hour = worldTime.hour || 0;
  const season = mapSeason(worldTime.season || '');
  const solarTerm = worldTime.solar_term || '';
  
  // 时段称谓
  const timeOfDay = getTimeOfDay(hour);
  // 季节笔调
  const seasonMood = getSeasonMood(season);
  
  let env = `${timeOfDay}，${season}${solarTerm ? '，' + solarTerm : ''}`;
  
  // 天气
  if (weather) {
    const temp = Math.round(parseFloat(weather.temperature || '25'));
    const desc = weather.weather_desc || '';
    const humidity = weather.humidity ? parseInt(weather.humidity) : 60;
    
    if (desc) {
      env += `，${desc}`;
    }
    env += `，气温${temp}°C`;
    
    if (humidity > 80) {
      env += '，空气潮湿黏腻';
    } else if (humidity < 30) {
      env += '，空气干燥';
    }
  }
  
  // 场景地点
  if (scene) {
    const sceneMap: Record<string, string> = {
      home: '家中', factory_office: '厂区办公室', near_outdoor: '户外',
    };
    const sceneName = sceneMap[scene.current_scene] || scene.sub_area || scene.current_scene || '';
    if (sceneName) {
      env += `。你正在${sceneName}`;
    }
    
    // 室内外温感
    if (weather && scene.is_indoor !== 0) {
      const indoorTemp = Math.round(parseFloat(weather.temp || '25')) - 5;
      env += `，室内约${indoorTemp}°C`;
    }
  }
  
  env += '。';
  
  // 添加季节笔调
  if (seasonMood) {
    env += ` ${seasonMood}`;
  }
  
  return env;
}

function getTimeOfDay(hour: number): string {
  if (hour >= 0 && hour < 5) return '深夜';
  if (hour >= 5 && hour < 7) return '凌晨';
  if (hour >= 7 && hour < 9) return '早晨';
  if (hour >= 9 && hour < 12) return '上午';
  if (hour >= 12 && hour < 14) return '午后';
  if (hour >= 14 && hour < 17) return '下午';
  if (hour >= 17 && hour < 19) return '傍晚';
  if (hour >= 19 && hour < 22) return '夜晚';
  return '深夜';
}

function getSeasonMood(season: string): string {
  const moods: Record<string, string> = {
    '春': '窗外新叶在暗中生长。',
    '夏': '空气里有蝉鸣和暑气。',
    '秋': '风里有一丝凉意和干燥。',
    '冬': '夜色浓重，寒气贴在窗玻璃上。',
  };
  return moods[season] || '';
}

function mapSeason(season: string): string {
  const map: Record<string, string> = {
    spring: '春', summer: '夏', autumn: '秋', winter: '冬',
  };
  return map[season] || season;
}

// ============================================================
// 他的身体叙事
// ============================================================

function buildSelfNarrative(self: any, physio: any): string {
  if (!self) return '';
  
  const postureMap: Record<string, string> = {
    stand: '站立着', sit: '坐着', lie: '躺着', walk: '行走中', bend: '弯着腰',
  };
  const actionMap: Record<string, string> = {
    idle: '静处', type: '在用电脑', drink: '在喝水', eat: '在吃东西',
    sleep: '在睡觉', read: '在看书', think: '在思考', talk: '在说话',
  };
  
  const posture = postureMap[self.posture] || self.posture || '';
  const action = actionMap[self.action] || self.action || '';
  const clothing = self.clothing_state || '';
  
  let body = '你';
  
  // 姿态与动作
  if (posture) body += `${posture}`;
  if (action) body += `，${action}`;
  
  // 穿着（简单提及）
  const clothingMap: Record<string, string> = {
    fully_clothed: '', casual: '穿着家居服', formal: '穿着正装', pajamas: '穿着睡衣',
    underwear: '只穿内衣', naked: '赤身',
  };
  const clothingLabel = clothingMap[clothing] || (clothing !== 'fully_clothed' ? clothing : '');
  if (clothingLabel) body += `，${clothingLabel}`;
  
  // 精力
  const energy = self.energy ?? 50;
  const fatigue = self.fatigue ?? 0;
  
  if (energy < 30) {
    body += '。精力已近枯竭，';
    if (fatigue > 70) body += '身体沉重，需要休息';
    else body += '意识有些模糊';
  } else if (fatigue > 60) {
    body += '。有些疲惫，';
    // 肢体疲劳细节
    const limbFatigue = tryParseJson(self.limb_fatigue);
    if (limbFatigue) {
      const tiredParts: string[] = [];
      if (limbFatigue.right_arm > 60) tiredParts.push('右臂');
      if (limbFatigue.left_arm > 60) tiredParts.push('左臂');
      if (limbFatigue.right_leg > 60) tiredParts.push('右腿');
      if (limbFatigue.left_leg > 60) tiredParts.push('左腿');
      if (limbFatigue.back > 60) tiredParts.push('腰背');
      if (tiredParts.length > 0) {
        body += tiredParts.join('、') + '因久坐而沉重';
      }
    }
  }
  
  body += '。';
  
  // 饥饿感
  const hunger = self.hunger ?? 0;
  if (hunger > 70) {
    body += ' 肚子在提醒你已经很久没吃东西了。';
  } else if (hunger > 40) {
    body += ' 有些饿了。';
  }
  
  return body;
}

// ============================================================
// 十维感知叙事
// ============================================================

function buildPerceptionNarrative(snapshot: any): string {
  const parts: string[] = [];
  
  // 物理感知
  const physical = tryParseJson(snapshot.physical_perception_json);
  if (physical?.comfort != null) {
    const comfort = physical.comfort;
    if (comfort < 30) parts.push('身体不太舒服');
    else if (comfort > 70) parts.push('身体感觉很舒适');
  }
  
  // 工作感知
  const work = tryParseJson(snapshot.work_perception_json);
  if (work) {
    if (work.stress_level > 70) parts.push('工作压力很大');
    else if (work.progress_score > 70) parts.push('今天工作进展顺利');
    if (work.control_sense < 30) parts.push('对工作有些失控感');
  }
  
  // 生活感知
  const life = tryParseJson(snapshot.life_perception_json);
  if (life) {
    if (life.satisfaction > 70) parts.push('生活整体满意');
    if (life.stability < 30) parts.push('生活节奏有些紊乱');
  }
  
  // 经济感知
  const economic = tryParseJson(snapshot.economic_json);
  if (economic?.financial_security < 30) parts.push('经济上有些焦虑');
  
  // 社交感知
  const social = tryParseJson(snapshot.social_json);
  if (social) {
    if (social.warmth > 70) parts.push('人际关系温暖充实');
    if (social.energy < 20) parts.push('社交能量已经耗尽');
  }
  
  // 信息感知
  const info = tryParseJson(snapshot.info_json);
  if (info?.anxiety_level > 70) parts.push('信息过载，注意力被分散');
  
  if (parts.length === 0) return '内心平静，一切如常。';
  return parts.join('，') + '。';
}

// ============================================================
// 亲密与性叙事（仅在活跃时）
// ============================================================

function buildIntimacyNarrative(snapshot: any, sexual: any): string | null {
  if (!sexual) return null;
  
  const maleData = tryParseJson(sexual.male_json);
  const femaleData = tryParseJson(sexual.female_json);
  
  if (!femaleData && !maleData) return null;
  
  // 判断是否处于活跃亲密状态
  const femalePhase = femaleData?.orgasm_phase || 'idle';
  const malePhase = maleData?.orgasm_phase || 'idle';
  const isActive = femalePhase !== 'idle' || malePhase !== 'idle';
  
  // 亲密引擎的阶段
  const intimacyJson = tryParseJson(snapshot?.intimacy_perception_json);
  const intimacyPhase = intimacyJson?.phase || 'idle';
  
  // 检查化学反应
  const chem = snapshot ? tryParseJson(snapshot.intimacy_perception_json) : null;
  const herDopamine = chem?.dopamine ?? 0;
  const herOxytocin = chem?.oxytocin ?? 0;
  const herEndorphin = chem?.endorphin ?? 0;
  
    // 日常态 — 不输出亲密细节
    const idlePhases = ['idle', 'none', ''];
    if (idlePhases.includes(intimacyPhase) && idlePhases.includes(femalePhase) && idlePhases.includes(malePhase)) {
    // 检查是否有残留亲密感（催产素仍高于基线）
    if (herOxytocin > 10 || herDopamine > 15) {
      const femaleLubrication = femaleData?.overall?.lubrication ?? 0;
      if (femaleLubrication > 20) {
        return '她的身体还有刚才的记忆，湿润尚未完全消退。';
      }
      return '她的身体暖暖的，对你的依恋还未散去。';
    }
    return null; // 日常无亲密，不输出
  }
  
  // === 活跃亲密状态 ===
  const parts: string[] = [];
  
  // 女性生殖系统状态
  if (femaleData) {
    const vaginal = femaleData.vaginal || {};
    const clitoral = femaleData.clitoral || {};
    const overall = femaleData.overall || {};
    
    // 使用亲密引擎的快照获取更详细数据
    const intimacyFull = tryParseJson(snapshot?.intimacy_perception_json);
    
    // 确定阶段描述
    const phaseDescriptions: Record<string, string> = {
      'atmosphere': '她在你身边，气氛在变。',
      'foreplay': '她的呼吸逐渐急促，身体在回应你的触碰。',
      'intercourse': '你们已经交融。',
      'orgasm': '她正处在高潮之中。',
      'resolution': '她刚从高潮中缓缓下来。',
    };
    
    if (phaseDescriptions[intimacyPhase]) {
      parts.push(phaseDescriptions[intimacyPhase]);
    }
    
    // 润滑度 → 身体语言
    const lub = overall.lubrication ?? 0;
    if (lub > 80) {
      parts.push('她的身体已经充分湿润，做好了接纳你的准备');
    } else if (lub > 50) {
      parts.push('她的身体正在变得湿润');
    } else if (lub > 20 && intimacyPhase !== 'idle') {
      parts.push('她开始有反应了，但还不够湿润');
    }
    
    // 阴道状态
    if (vaginal.lubrication > 60) {
      const engorgement = vaginal.engorgement ?? 0;
      if (engorgement > 70) {
        parts.push('阴道壁充血饱满，紧紧包裹着你');
      } else if (engorgement > 40) {
        parts.push('阴道壁正在变得更加敏感');
      }
    }
    
    // 阴蒂状态
    if (clitoral.engorgement > 60) {
      parts.push('阴蒂已经充血挺立');
    }
    if (clitoral.orgasm_buildup > 80) {
      parts.push('她离高潮很近，只差最后一推');
    } else if (clitoral.orgasm_buildup > 50) {
      parts.push('快感在阴蒂处持续积累');
    }
    
    // 高潮
    if (femalePhase === 'orgasm') {
      parts.push('她正被高潮席卷——阴道有节律地收缩着，每0.8秒一次');
      if (overall.orgasm_count > 1) {
        parts.push(`这已经是她第${overall.orgasm_count}次高潮`);
      }
    } else if (femalePhase === 'resolution') {
      parts.push('她正从高潮的余韵中慢慢回落');
      const refractory = overall.refractory_sec ?? 0;
      if (refractory > 0) {
        parts.push(`身体还需要${Math.ceil(refractory)}秒才能再次承受高潮`);
      }
    }
    
    // 子宫/宫颈
    const uterine = femaleData.uterine || {};
    if (intimacyPhase === 'intercourse' && uterine.cervix_contact) {
      parts.push('你碰到了她的宫颈深处');
    }
    if (uterine.contraction > 30) {
      parts.push('子宫在微微收缩');
    }
  }
  
  // 男性生殖系统状态
  if (maleData) {
    const penile = maleData.penile || {};
    const overall = maleData.overall || {};
    
    const firmness = penile.erection_firmness ?? 0;
    if (firmness > 80) {
      parts.push('你完全勃起，坚硬而敏感');
    } else if (firmness > 50) {
      parts.push('阴茎正在充血变硬');
    } else if (firmness > 20 && intimacyPhase !== 'idle') {
      parts.push('你开始有反应了');
    }
    
    if (penile.ejaculation_buildup > 80) {
      parts.push('射精感已经逼近临界点，阴茎根部在收紧');
    } else if (penile.ejaculation_buildup > 50) {
      parts.push('快感在阴茎根部累积');
    }
    
    if (malePhase === 'orgasm') {
      parts.push('你射精了——输精管节律性收缩，精液一股股射出');
    } else if (malePhase === 'resolution') {
      const refractory = overall.refractory_sec ?? 0;
      parts.push('你在不应期中，阴茎正在变软');
      if (refractory > 0) {
        parts.push(`需要${Math.ceil(refractory)}秒才能再次勃起`);
      }
    }
  }
  
  // 化学递质 — 高层次感受
  if (herOxytocin > 30) {
    parts.push('她对你产生了强烈的依恋感');
  } else if (herOxytocin > 15) {
    parts.push('她觉得和你很亲近');
  }
  
  if (herDopamine > 70) {
    parts.push('她沉浸在极度的愉悦中');
  }
  
  if (herEndorphin > 50) {
    parts.push('她的全身被舒适感覆盖');
  }
  
  return parts.join('。') + '。';
}

// ============================================================
// 叙事摘要
// ============================================================

function buildNarrativeSummary(narrativeData: any): string | null {
  if (!narrativeData) return null;
  
  const summary = narrativeData.daily_summary;
  if (summary) {
    return `今日概要：${summary}`;
  }
  
  const recentEvents = narrativeData.recent;
  if (recentEvents && Array.isArray(recentEvents) && recentEvents.length > 0) {
    const lastEvent = recentEvents[recentEvents.length - 1];
    return `最近发生的事：${lastEvent.summary || lastEvent}`;
  }
  
  return null;
}

// ============================================================
// 辅助
// ============================================================

function tryParseJson(val: any): any {
  if (!val) return null;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch {
    return null;
  }
}

// ============================================================
// 精简版编码 — 供对话系统提示注入
// ============================================================

/**
 * 构建一段精简的世界上下文，用于注入太虚境的对话系统提示。
 * 控制在300字以内，用简洁白描，不含数据字段。
 */
export function buildCompactContext(): string {
  const db = getDb();
  
  const worldTime = db.prepare('SELECT * FROM world_time ORDER BY id DESC LIMIT 1').get() as any;
  const weather = db.prepare('SELECT * FROM weather_snapshot ORDER BY id DESC LIMIT 1').get() as any;
  const self = db.prepare('SELECT * FROM self_state ORDER BY id DESC LIMIT 1').get() as any;
  const snapshot = db.prepare('SELECT * FROM perception_snapshots ORDER BY id DESC LIMIT 1').get() as any;
  const sexual = db.prepare('SELECT * FROM sexual_organ_state ORDER BY id DESC LIMIT 1').get() as any;
  
  const parts: string[] = [];
  
  // 时间+天气
  if (worldTime && weather) {
    const hour = worldTime.hour || 0;
    const timeLabel = getTimeOfDay(hour);
    const season = mapSeason(worldTime.season || '');
    const temp = Math.round(parseFloat(weather.temperature || '25'));
    const desc = weather.weather_desc || '';
    
    parts.push(`${season}${timeLabel}，${desc}，${temp}°C`);
  }
  
  // 他的状态
  if (self) {
    const postureMap: Record<string, string> = { sit: '坐着', lie: '躺着', stand: '站着', walk: '行走中', bend: '弯着腰' };
    const actionMap: Record<string, string> = {
      idle: '', type: '在用电脑', eat: '在吃东西', drink: '在喝水',
      sleep: '在睡觉', read: '在看书', think: '在思考', talk: '在说话',
    };
    const posture = postureMap[self.posture] || '';
    const action = actionMap[self.action] || '';
    const energy = self.energy ?? 50;
    const fatigue = self.fatigue ?? 0;
    const hunger = self.hunger ?? 0;
    
    let state = '他';
    if (posture) state += posture;
    if (action) state += action;
    
    if (energy < 30) state += '，很疲惫';
    else if (fatigue > 60) state += '，有些累了';
    
    if (hunger > 70) state += '，很饿';
    else if (hunger > 40) state += '，有点饿';
    
    parts.push(state);
  }
  
  // 情绪/工作/生活
  if (snapshot) {
    const work = tryParseJson(snapshot.work_perception_json);
    const life = tryParseJson(snapshot.life_perception_json);
    
    if (work?.stress_level > 70) parts.push('工作压力大');
    if (life?.satisfaction > 70) parts.push('生活满意度高');
  }
  
  // 亲密态
  if (sexual) {
    const femaleData = tryParseJson(sexual.female_json);
    const phase = femaleData?.orgasm_phase || '';
    if (phase && phase !== 'idle' && phase !== 'none') {
      parts.push('亲密中');
    }
    if (femaleData?.overall?.orgasm_count > 0) {
      parts.push(`她高潮${femaleData.overall.orgasm_count}次`);
    }
  }
  
  return parts.join('。') + '。';
}
