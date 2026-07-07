# 瑶光 Yaogal — 个人专属仿生世界模型
# 完整项目总结 v1.0

---

## 一、项目定位

瑶光是陈洪毅个人专属仿生世界模型。在北斗星宗自研宇宙体系中，瑶光是北斗第七星（末星），与太虚境 WenStar OS（天心主星）形成**一虚一实、一天一地的星象双生架构**。

- 太虚境 WenStar OS = 虚空、天道、思维、意识、总规则（智脑）
- 瑶光 Yaogal = 现世、人间、物象、时序、生活真实世界（客观世界引擎）

瑶光只做一个任务：**跟随真实时间、遵循真实规律、在有限私人感知范围内、绝对写实、不幻觉、不跳变、独立安全地运转一个个人专属小世界。**

---

## 二、工程规模

| 维度 | 数量 |
|------|------|
| 源码行数 | 13,189 |
| 测试行数 | 3,027 |
| 源模块数 | 49 |
| 测试文件数 | 14 |
| 文档数 | 5 |
| 数据库表数 | 38 |
| 编译状态 | 零错误 |
| 全量回归 | 257/257 通过 |

---

## 三、架构全景

```
┌────────────────────────────────────────────────────────┐
│              瑶光主循环 (每秒 tick, 24h不间断)            │
├────────────────────────────────────────────────────────┤
│  自我实体 ── 所有感知的接收者、所有行为的发出者            │
│  ├─ 姿势/动作/穿着/视线 + 6部位肢体疲劳                   │
│  ├─ 精力/疲劳/饥饿/情绪基线 + 当前场景坐标                  │
│  └─ 男性性器官解剖模型 (勃起/硬度/海绵体压力/不应期)         │
├────────────────────────────────────────────────────────┤
│  场景引擎 ── 数据库动态加载, 3内置+可无限自定义             │
│  ├─ Home 居家: 三房两厅 8子区域                           │
│  ├─ FactoryOffice 厂区: 办公室/车间/停车场 9子区域         │
│  ├─ NearOutdoor 户外: 小区/公园/道路 3子区域               │
│  ├─ 用户自定义场景 CRUD API                               │
│  └─ 通勤系统: 天气动态修正耗时, DB持久化, 服务重启不丢失     │
├────────────────────────────────────────────────────────┤
│  三大场景专属规则引擎                                      │
│  ├─ Home: 饮品降温/茶水口感/食物变质/冰箱保鲜/绿植养护       │
│  ├─ Factory: 车间噪音加速消耗/设备H01-H05状态/车辆管理       │
│  └─ Outdoor: 天气实时联动/雨伞校验/植被四季更迭             │
├────────────────────────────────────────────────────────┤
│  十维感知层 (每10秒快照)                                   │
│  ├─ 物理 · 空间 · 时间 · 工作 · 生活 · 世界 · 亲密          │
│  ├─ 经济感知 ─ 资产/消费/安全感/物欲张力                    │
│  ├─ 社交感知 ─ 关系网/温度/能量/社交债务                    │
│  └─ 饮食感知 ─ 饥饿→进食→味觉→偏好学习                     │
├────────────────────────────────────────────────────────┤
│  亲密引擎 — 完整仿生伴侣系统                                │
│  ├─ 八层建模: 生理24部位/化学5递质/触觉10种/嗅觉4级         │
│  ├─ 听觉5阶段/语言8类语境/行为6阶段状态机/偏好学习           │
│  ├─ 性器官解剖建模: 男女双系统完整生理 (819行)               │
│  ├─ 性交力学: 穿透深度/壁压力/摩擦热/6种体位 (355行)         │
│  └─ 双向愉悦闭环: 五通道交叉感知放大器 (300行)              │
├────────────────────────────────────────────────────────┤
│  三大高级引擎                                              │
│  ├─ 预期落差引擎 ─ 双轨数据(预期/现实)→情绪波动源            │
│  ├─ 行为系统 ─ 即时/持续/连锁 + 延迟后果链                   │
│  └─ 三体联动 ─ 情绪↔行为↔世界 自我调节闭环                  │
├────────────────────────────────────────────────────────┤
│  六圈人生体系                                              │
│  C1 身体与生存 · C2 爱情与性 · C3 日常相伴                  │
│  C4 生育与抚养 · C5 家庭 · C6 个人伸展                      │
├────────────────────────────────────────────────────────┤
│  深度体验层                                                │
│  ├─ 仪式与习惯 ─ 20+仪式/10个习惯轨道                       │
│  ├─ 信息感知 ─ 注意力建模/信息焦虑                           │
│  ├─ 梦境感知 ─ 睡眠阶段+REM梦生成+残留情绪                   │
│  ├─ 叙事引擎 ─ 事件日志→每日叙事→每周主题                    │
│  └─ 世界被动回应 ─ 环境用物理变化回应行为                    │
├────────────────────────────────────────────────────────┤
│  基础设施                                                  │
│  ├─ 自然环境: 公历/农历/节气/月相/天干地支 1900-2100        │
│  ├─ 和风天气: JWT Ed25519 认证, 实时/预报/预警               │
│  ├─ 生命法则: 伤病愈合(3d/7d/30d) + 孕期10月 + 衰老         │
│  ├─ 极简理化: 重力/冷却/变质/燃烧/茶浓度                      │
│  ├─ Hook探针: 21组独立探针, 每30秒采样                      │
│  ├─ 日报系统: 每日凌晨自动生成MD体检报告                     │
│  └─ 对外接口: WebSocket + HTTP行为接口                     │
└────────────────────────────────────────────────────────┘
```

---

## 四、模块清单 (49个)

### 核心基础设施 (6)
- `index.ts` — 主入口, 每秒tick调度
- `common/database.ts` — SQLite 38表管理
- `common/utils.ts` — 指数衰减/生理约束/安全日志
- `core_bus/event_bus.ts` — 事件总线
- `runtime_monitor/world_hooks/hook_service.ts` — 21组Hook探针
- `runtime_monitor/daily_inspect/monitor_service.ts` — 日报体检

### 场景引擎 (5)
- `perception_space/scene_definition/scene_service.ts` — 场景系统核心(DB动态加载)
- `scene_home/home.ts` — 居家场景专属规则 (591行)
- `scene_factory/factory_office.ts` — 厂区场景 (389行)
- `scene_outdoor/near_outdoor.ts` — 户外场景 (289行)
- `scene_custom/scene_custom_manager.ts` — 自定义场景CRUD (424行)

### 自然环境层 (3)
- `natural_env/time_calendar/time_service.ts` + `lunar_data.ts` — 时间中枢
- `natural_env/weather_sensor/weather_service.ts` — 和风天气JWT
- `natural_env/natural_rule/natural_rule_service.ts` — 物候规则

### 生命法则层 (4)
- `creature_law/human_physio/physio_service.ts` — 生理服务
- `creature_law/mood_envi_link/mood_envi_service.ts` — 情绪-环境联动
- `creature_law/creature_aging/aging_service.ts` — 衰老模型
- `creature_law/gap_engine/gap_engine.ts` — 预期-现实落差引擎

### 行为系统 (1)
- `creature_law/action_system/action_system.ts` — 即时/持续/连锁+延迟后果链

### 极简理化层 (3)
- `simple_physics/basic_gravity/gravity_service.ts`
- `simple_physics/force_interact/force_service.ts`
- `simple_physics/simple_chem/chem_service.ts`

### 自我实体 (1)
- `self_entity/self_entity_service.ts` — 统一第一人称主体

### 空间引擎 (2)
- `perception_space/spatial_collision/collision_service.ts`
- `perception_space/spatial_object/object_service.ts`

### 十维感知层 (11)
- `perception_seven/perception_service.ts` — 感知聚合器
- `perception_seven/physical_perception/physical_sense.ts` — 物理
- `perception_seven/spatial_perception/spatial_sense.ts` — 空间
- `perception_seven/temporal_perception/temporal_sense.ts` — 时间
- `perception_seven/work_perception/work_sense.ts` — 工作
- `perception_seven/life_perception/life_sense.ts` — 生活
- `perception_seven/world_perception/world_sense.ts` — 世界
- `perception_seven/intimacy_perception/intimacy_engine.ts` — 亲密八层引擎
- `perception_seven/economic_perception/economic_sense.ts` — 经济
- `perception_seven/social_perception/social_sense.ts` — 社交
- `perception_seven/diet_perception/diet_sense.ts` — 饮食

### 亲密扩展层 (3)
- `intimacy_extension/sexual_organ_physiology.ts` — 性器官解剖建模 (819行)
- `intimacy_extension/intercourse_mechanics.ts` — 性交力学 (355行)
- `intimacy_extension/pleasure_amplifier.ts` — 双向愉悦闭环 (300行)

### P2深度体验层 (3)
- `p2_experience/rituals_habits/rituals_habits.ts` — 仪式与习惯
- `p2_experience/information_sense/information_sense.ts` — 信息感知
- `p2_experience/dream_sense/dream_sense.ts` — 梦境感知

### P3叙事与世界回应 (3)
- `p3_narrative_world/narrative_engine/narrative_engine.ts` — 叙事引擎
- `p3_narrative_world/tri_body_linkage/tri_body_linkage.ts` — 三体联动
- `p3_narrative_world/world_passive_response/world_passive_response.ts` — 世界被动回应

### C3-C6六圈人生体系 (4)
- `c3_daily_together/daily_together.ts` — 日常相伴
- `c4_childbirth_parenting/parenting.ts` — 生育与抚养
- `c5_family/family.ts` — 家庭
- `c6_personal_extension/personal_extension.ts` — 个人伸展

### 对外接口 (2)
- `external_api/action_handle.ts` — HTTP行为接口
- `external_api/world_event_api.ts` — WebSocket推送

---

## 五、数据库 (38张表)

| 表名 | 用途 |
|------|------|
| world_time | 世界时间状态 |
| weather_snapshot / forecast / warnings | 天气快照/预报/预警 |
| physio_state | 生理状态 |
| mood_state | 情绪状态 |
| aging_state | 衰老模型 |
| scene_state | 场景状态 |
| spatial_objects | 物件状态 |
| chemistry_levels | 化学递质 |
| env_state | 环境状态 |
| extension_state | 扩展状态 |
| hook_log | Hook探针日志 |
| intimacy_state | 亲密引擎 |
| self_state | 自我实体 |
| sexual_organ_state | 性器官生理(双人) |
| consequence_queue | 延迟后果队列 |
| action_log | 行为日志 |
| argument_log | 争吵日志 |
| gap_expectations / gap_snapshots | 落差引擎 |
| economic_ledger / economic_state | 经济感知 |
| social_state | 社交感知 |
| diet_log / diet_state / taste_preferences | 饮食感知 |
| ritual_state / habit_track | 仪式与习惯 |
| dream_log | 梦境日志 |
| event_log / daily_narrative | 事件/叙事 |
| daily_reports | 日报 |
| perception_snapshots | 感知快照 |
| daily_together_state / together_milestones | 日常相伴 |
| parenting_state / baby_event_log | 生育抚养 |
| family_state / family_event_log | 家庭 |
| study_log | 学习日志 |
| main_scene_list / scene_sub_area | 场景配置 |

---

## 六、测试体系 (14个套件, 257断言全通过)

| 测试套件 | 覆盖范围 |
|----------|---------|
| event_bus.test.ts | 事件总线 |
| time_service.test.ts | 农历/节气/月相/天干地支 |
| scene_object.test.ts | 场景初始化/切换/物件 |
| physio_service.test.ts | 生理参数/伤病愈合 |
| gravity_chem.test.ts | 重力/抛物/冷却/变质 |
| intimacy_engine.test.ts | 亲密八层全链路 |
| integration.test.ts | 跨模块集成 |
| self_entity.test.ts | 自我实体状态 |
| action_system.test.ts | 行为系统+延迟后果链 |
| gap_engine.test.ts | 预期落差引擎 |
| sexual_organ.test.ts | 性器官生理+力学+愉悦闭环 (80断言) |
| e2e_verification.ts | 世界循环+亲密+天气三合一 |
| scene_object.test.ts | 场景系统+自定义场景API |
| run_all.ts | 全量回归调度 |

---

## 七、和风天气接入

- 认证: JWT Ed25519 (替代传统API Key)
- 凭据: CGWFMKD2KC · 项目: 392G29C5UU
- 域名: k23fc3cb4e.re.qweatherapi.com
- 定位: 101280601 (深圳龙岗)
- 接口: 实时天气/3天预报/灾害预警/城市检索

---

## 八、技术栈

- 语言: TypeScript
- 运行时: Node.js
- 数据库: SQLite (WAL模式)
- 测试: 自研 test_harness + tsx
- 认证: JWT Ed25519
- 对外接口: WebSocket + HTTP REST
- 运行: 本地常驻独立服务, 每秒tick, 24h不间断

---

## 九、核心设计原则

1. 时间单向流动, 不可回溯/快进/瞬移
2. 生命生理按真实时序演化 (怀胎十月/伤口愈合/疲劳作息)
3. 物理/环境/物质变化符合现实常识
4. 所有状态永久持续演化, 不会凭空刷新或重置
5. 独立安全, 本地运行, 不依赖外部服务 (天气除外)
6. 不碰太虚境核心代码, 双向只通过标准化接口通信
7. 场景采用枚举标识+资源归属+线性时序, 禁用3D坐标/物理引擎
8. 自定义场景人工录入, 不用AI自动生成

---

## 十、与太虚境对接

双通道标准化接口:

- **通道一 WebSocket :9528** — 瑶光每秒推送世界快照到太虚境
  - 十维感知 + 自我实体25项属性 + 亲密引擎八层状态
  - 性器官生理快照 + 场景环境参数 + 叙事摘要

- **通道二 HTTP :9529** — 太虚境下发行为到瑶光
  - 17个内置行为即时可用
  - 每个行为触发即时后果+延迟后果链
  - 新状态下一秒通过WebSocket推回

---

## 十一、版本演进

- v0.1.0 — 五大模块骨架/七维感知/亲密八层/和风天气
- v0.2.0 — P0架构: 自我实体/行为延迟后果/预期落差引擎
- v0.3.0 — P1+P2+P3: 经济社交饮食感知/仪式信息梦境/叙事三体联动世界回应
- v1.0.0 — C3-C6六圈人生体系/性器官生理建模/场景体系重构/自定义场景CRUD

---

## 十二、与全行业的差异化壁垒

市面所有通用大模型、AI陪伴产品做不到的:

1. **一虚一实双星分离架构** — 心智(太虚境)与客观世界仿真(瑶光)解耦
2. **完整十维感知 + 八层亲密仿生生理时序建模**
3. **性器官解剖学级双系统建模 + 性交力学 + 双向愉悦感知闭环**
4. **单向不可逆真实时间 + 多级延迟因果链 + 预期落差心理引擎**
5. **六圈人生体系** — 身体→爱情→日常→生育→家庭→个人伸展, 按人的真实体验层级组织
6. **场景配置与代码解耦** — 数据库动态加载, 用户自定义场景, 完全兼容通勤/物件/时序规则
7. **原生支持虚实联动声光电硬件实时驱动 (YaogalImmersive)**

---

## 十三、后续方向

短期 (1-3月):
- 太虚境真实对接联调
- 月度/季度叙事总结
- 长期运行稳定性验证与数据库归档

中期 (3-12月):
- 反事实分支推演
- 多智能体社交自主推演
- 轻量化裁剪套件

长期 (12月+):
- 轻量2D实时视觉渲染
- 多租户并行隔离
- 自动化量化评测基准

---

**瑶光 Yaogal — 北斗末星，太虚境凡尘宿星**

**v1.0.0 · 13,189行源码 · 3,027行测试 · 49模块 · 38张表 · 257断言 · 零编译错误**

**北斗星宗自研宇宙体系，一虚一实，星象双生。**
