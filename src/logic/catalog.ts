import type { ShapeId } from './types'

/** Display info for goods shown in the showcase. Values are placeholders. */
export type CatalogEntry = {
  readonly name: string
  readonly origin: string
  readonly description: string
  readonly value: number
}

export const CATALOG: Partial<Record<ShapeId, CatalogEntry>> = {
  book: {
    name: '魔法书',
    origin: '雪松镇图书馆的旧藏',
    description: '皮革封面，四角包着黄铜。封面上的法阵偶尔会自己亮一下，翻开后全是空白页。',
    value: 18,
  },
  mug: {
    name: '木酒杯',
    origin: '矮人酒馆的标准杯',
    description: '橡木桶板拼成，两道铁箍。据说装满麦酒后，杯子会比喝酒的人先醉。',
    value: 4,
  },
  potion: {
    name: '魔药瓶',
    origin: '来路不明的炼金铺',
    description: '紫色药水一直在瓶里缓慢旋转。标签上的字被人刮掉了，只剩一个“勿”字。',
    value: 25,
  },
  dragon: {
    name: '龙形雕像',
    origin: '某位收藏家的遗物',
    description: '青铜铸造，眼睛是两颗绿宝石。半夜路过展示柜时，总觉得它的头换了个方向。',
    value: 120,
  },
}
