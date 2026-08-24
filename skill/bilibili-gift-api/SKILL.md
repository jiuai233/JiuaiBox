---
name: bilibili-gift-api
description: Use when working with Bilibili live-stream gift / blind-box data — fetching monthly gift streams, computing blind-box profit/loss, gift statistics, or login-state handling. Covers the revenue stream API, blind-gift records API, pagination pitfalls (dedup required), date range limits, and price/battery conversions.
---

# Bilibili 直播礼物数据（Skill）

面向 B 站直播"主播收益 / 礼物流水 / 盲盒玩法"的数据处理知识。本 skill 适用于：抓取月度礼物流水、统计盲盒盈亏、礼物排行分析、盲盒内容物/概率查询、登录态复用。

## 1. 数据口径（务必区分）

| 口径 | 数据源 | 含义 |
|---|---|---|
| **投喂侧** | `blindGiftStream` | 当前登录用户**作为观众开盒**的记录（消费支出） |
| **主播收益侧** | `getReceivedGiftStream` 流水 | 直播间收到的所有礼物（含盲盒产出） |
| **直播间接收到开盒** | 收益流水识别 / 开放平台 | 观众在直播间投喂盲盒的次数与产出 |

关键事实：
- **盲盒投喂本身不入收益流水**（流水里只有开出的礼物；盲盒 gift_id 如 32251 不会出现在流水中）
- 两个口径数字互相独立：投喂 3 次 ≠ 直播间收到 104 次，都可能是"对的"
- 盲盒专属礼物（如星光铃铛 35208、好运柚叶 35311）在流水中出现 ≈ 观众开盒产出；普通礼物（爱心抱枕/棉花糖/电影票）可能直送也可能盲盒产出，无法 100% 归因

## 2. 核心接口

### 2.1 礼物流水（主播收益）

`POST https://api.live.bilibili.com/xlive/revenue/v1/giftStream/getReceivedGiftStream`

`Content-Type: application/x-www-form-urlencoded`，参数：
- `page`（**从 0 开始**）、`gift_id`（0=全部）、`begin_date`/`end_date`（YYYYMMDD）、`uname`、`goods_id`、`csrf_token`/`csrf`（= bili_jct cookie 值）

响应 `data`：`total_page`（页面总数）、`total_count`（总记录数，**毛数**）、`list[]`（每条：`time, receive_title, room_id, uid, uname, gift_id, gift_name, goods_id, num, hamster`）

⚠️ 不要传 `page_size`（实测干扰，可能致 `total_count=0`）。

### 2.2 盲盒开奖记录（投喂侧）

`GET https://api.live.bilibili.com/xlive/fuxi-interface/gift/blindGiftStream?nextId=0&month=&pageSize=100`

- `data.list[]`：`originalGiftId/Name`（投喂的盲盒）、`giftId/Name`（开出礼物）、`giftNum`、`timestamp`、`rname`（主播）、`id`（记录 id）
- 分页：`data.params = { nextId, month, isMore }`；**`isMore` 是数字**（1=还有，0=结束）；翻页用上一条记录 `id` 作为 `nextId`，`month` 用返回的月份
- ⚠️ `Boolean(0) === false` 会漏页 —— 必须用 `Number(isMore) === 1` 判断
- 记录仅保留最近约 2 个自然月

### 2.3 礼物字典 / 面板

- `GET https://api.live.bilibili.com/xlive/revenue/v2/giftStream/getGiftTypes` — 分类+礼物字典（礼物道具/大航海/醒目留言），含 `goods_id/gift_id/name`
- `GET https://api.live.bilibili.com/xlive/web-room/v1/giftPanel/roomGiftList?platform=pc&room_id=<room>&area_parent_id=9&area_id=746&source=live&build=0&ruid=<uid>` — 直播间可直送礼物（含 price、img_basic 图标、盲盒 desc）

### 2.4 盲盒内容物 + 公示概率（社区数据源）

`GET https://gift.shuvi.moe/api/blind-gifts` — 23+ 个盲盒的完整内容物与官方公示概率（含多倍率档位，如心动盲盒开浪漫城堡：初始 0.04% → 5倍 0.2%）

## 3. 抓取铁律（违反会得到错误结论）

1. **必须翻完全部分页**：`page = 0 → total_page - 1`，每页 20 条；空页/出错重试，绝不提前 break
2. **必须去重**：该接口分页是"时间游标"实现，同一时间戳多条记录会跨页重复返回，`total_count` 是**毛数**。按 `time + gift_id + uid + num + hamster` 唯一键去重（实测 7 月：12275 毛 → 8209 唯一）
3. **0 结果先复核**：`total_count=0` 可能是接口偶发/参数问题（如误带 page_size），先换参数/口径复核再下结论
4. 完整性判据：循环完整跑完 `total_page` 且重跑后唯一条数不再增加
5. `end_date` **不能是今天/未来**（否则 `code=1301000`）；数据保留近 **180 天**；单次跨度建议 ≤31 天

## 4. 已知限制与错误码

| 事项 | 说明 |
|---|---|
| 数据保留期 | 收益流水近 180 天；盲盒记录近 2 个自然月 |
| `end_date` | 今天/未来 → `1301000`；用昨天及以前 |
| `-101` | 未登录/风控：检查 cookie 与请求头（Referer/Origin/UA）一致性 |
| `412` | 风控：降频重试 |
| 偶发 0 | 整月查询偶发返回 `total_count=0`，重试恢复 |

## 5. 单位换算

- 1 元 = 10 电池；礼物标价单位是电池
- 金仓鼠 = 主播税前收益：**1 电池礼物 ≈ 50 金仓鼠**（1 元 = 500 金仓鼠）
- 换算：`battery = hamster / 50`

## 6. 盲盒盈亏计算

- 投喂侧：`盈亏 = Σ(开出礼物价值) − Σ(盲盒价格)`（盲盒价 + 礼物价来自 2.4 数据源）
- 主播侧：从收益流水识别盲盒产出礼物（JOIN 盲盒内容物表），`电池收益 = Σ(hamster) / 50`
- 常规档长期负期望（心动盲盒期望 ≈ 140.6 电池 < 150 成本）；活动倍率档转正

## 7. 登录态（安全）

- Cookie 必需：`SESSDATA`（登录）、`bili_jct`（CSRF，POST 时作 `csrf_token`/`csrf`）
- 推荐用 Playwright storageState JSON 管理登录态
- **严禁把 cookie/storageState 提交到仓库或日志**

## 8. 参考脚本

仓库内参考实现（本地工具 local-gift-dashboard）：
- `bili.mjs` — API 客户端（含分页去重、超时重试、进度回调）
- `db.mjs` — SQLite 层（流水/盲盒/价格/图标）
- `fetch-gift-stream.mjs` — 月度流水抓取模板（翻全页 + 去重 + 校验）
- `blindbox-pnl.mjs` — 盲盒盈亏双口径统计
