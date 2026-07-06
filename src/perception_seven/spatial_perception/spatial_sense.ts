/**
 * 空间感知 — 房间大小/拥挤度/开阔度 → 安全感/自由感/压抑度
 */
import { clamp } from '../../common/utils';

export interface SpatialPerception {
  /** 当前场景 */
  current_scene: string;
  /** 房间面积感（平方米等效） */
  area_feel: number;
  /** 拥挤度 0-100（0=空旷, 100=极度拥挤） */
  crowdedness: number;
  /** 开阔度 0-100（0=完全封闭, 100=完全开阔） */
  openness: number;
  /** 天花板高度感（米） */
  ceiling_height: number;
  /** 自然光比例 0-100 */
  natural_light_ratio: number;
  /** 安全感 0-100 */
  safety_feeling: number;
  /** 自由感 0-100 */
  freedom_feeling: number;
  /** 压抑度 0-100（反向） */
  oppression_level: number;
  /** 空间舒适度 0-100 */
  spatial_comfort: number;
}

// 默认场景配置
const SCENE_CONFIGS: Record<string, Partial<SpatialPerception>> = {
  home: {
    current_scene: '居家',
    area_feel: 85,
    crowdedness: 15,
    openness: 40,
    ceiling_height: 2.8,
    natural_light_ratio: 45,
    safety_feeling: 85,
    freedom_feeling: 75,
  },
  office: {
    current_scene: '办公室',
    area_feel: 40,
    crowdedness: 45,
    openness: 25,
    ceiling_height: 3.0,
    natural_light_ratio: 30,
    safety_feeling: 55,
    freedom_feeling: 40,
  },
  outdoor: {
    current_scene: '近郊户外',
    area_feel: 500,
    crowdedness: 20,
    openness: 90,
    ceiling_height: 999,
    natural_light_ratio: 100,
    safety_feeling: 60,
    freedom_feeling: 90,
  },
};

let currentScene = 'home';

export function setScene(scene: string): void {
  if (SCENE_CONFIGS[scene]) {
    currentScene = scene;
  }
}

export function getSpatialPerception(): SpatialPerception {
  const config = SCENE_CONFIGS[currentScene];
  
  const oppressionLevel = clamp(100 - (config.openness || 50) * 0.7 - (config.ceiling_height || 3) * 10, 0, 100);
  const spatialComfort = clamp(
    (100 - (config.crowdedness || 50)) * 0.4 +
    (config.openness || 50) * 0.3 +
    Math.min((config.area_feel || 50) / 2, 50) * 0.3,
    0, 100
  );

  return {
    current_scene: config.current_scene || '未知',
    area_feel: config.area_feel || 50,
    crowdedness: config.crowdedness || 30,
    openness: config.openness || 50,
    ceiling_height: config.ceiling_height || 2.8,
    natural_light_ratio: config.natural_light_ratio || 50,
    safety_feeling: config.safety_feeling || 50,
    freedom_feeling: config.freedom_feeling || 50,
    oppression_level: Math.round(oppressionLevel),
    spatial_comfort: Math.round(spatialComfort),
  };
}
