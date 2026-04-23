import { generateUuidV4 } from './core-basic'

/**
 * Mock 工具支持的基础数据类型。
 * 这轮只迁旧项目里“轻中型高频”那一组，避免把模板系统一起搬过来增加维护成本。
 */
export type MockDataType = 'name' | 'email' | 'phone' | 'idcard' | 'address' | 'uuid' | 'date'

/**
 * 与旧项目页面保持一致的输出格式。
 * - `lines`：每行一个值，适合快速复制到其他工具。
 * - `json`：数组格式，适合程序消费。
 * - `csv`：旧项目这里是“单列 CSV”，没有表头。
 * - `jsonlines`：每行一个 JSON 字面量，方便流式导入。
 */
export type MockOutputFormat = 'lines' | 'json' | 'csv' | 'jsonlines'

export type MockBuildResult = {
  values: string[]
  output: string
  summary: string
  count: number
}

const SURNAMES = [
  '王',
  '李',
  '张',
  '刘',
  '陈',
  '杨',
  '黄',
  '赵',
  '周',
  '吴',
  '徐',
  '孙',
  '马',
  '朱',
  '胡',
  '郭',
  '何',
  '高',
  '林',
  '罗',
  '郑',
  '梁',
  '谢',
  '宋',
  '唐',
  '许',
  '韩',
  '冯',
  '邓',
  '曹',
  '彭',
  '曾',
  '肖',
  '田',
  '董',
  '袁',
  '潘',
  '于',
  '蒋',
  '蔡',
  '余',
  '杜',
  '叶',
  '程',
  '苏',
  '魏',
  '吕',
  '丁',
  '任',
  '沈'
]

const NAME_CHARS = [
  '伟',
  '芳',
  '娜',
  '秀',
  '敏',
  '静',
  '丽',
  '强',
  '磊',
  '军',
  '洋',
  '勇',
  '艳',
  '杰',
  '娟',
  '涛',
  '明',
  '超',
  '秀',
  '英',
  '华',
  '文',
  '慧',
  '玉',
  '萍',
  '红',
  '鹏',
  '宇',
  '婷',
  '霞',
  '建',
  '亮',
  '雷',
  '东',
  '波',
  '辉',
  '俊',
  '峰',
  '飞',
  '平',
  '阳',
  '健',
  '斌',
  '琳',
  '鑫',
  '云',
  '龙',
  '浩',
  '刚',
  '帆'
]

const PROVINCES = [
  '北京',
  '上海',
  '天津',
  '重庆',
  '河北',
  '山西',
  '辽宁',
  '吉林',
  '黑龙江',
  '江苏',
  '浙江',
  '安徽',
  '福建',
  '江西',
  '山东',
  '河南',
  '湖北',
  '湖南',
  '广东',
  '海南',
  '四川',
  '贵州',
  '云南',
  '陕西',
  '甘肃',
  '青海',
  '台湾',
  '内蒙古',
  '广西',
  '西藏',
  '宁夏',
  '新疆'
]

const STREET_WORDS = [
  '中山',
  '人民',
  '建设',
  '解放',
  '胜利',
  '和平',
  '光明',
  '新华',
  '文化',
  '民主',
  '工业',
  '朝阳',
  '东风',
  '西湖',
  '南京',
  '北京',
  '上海',
  '天府',
  '长江',
  '黄河',
  '春天',
  '幸福',
  '平安',
  '富强'
]

const STREET_TYPES = ['路', '街', '大道', '巷', '弄']

const EMAIL_DOMAINS = [
  'qq.com',
  '163.com',
  '126.com',
  'gmail.com',
  'outlook.com',
  'hotmail.com',
  'sina.com',
  'sohu.com',
  'yahoo.com',
  'foxmail.com'
]

const MOBILE_PREFIXES = [
  '130',
  '131',
  '132',
  '133',
  '134',
  '135',
  '136',
  '137',
  '138',
  '139',
  '145',
  '147',
  '149',
  '150',
  '151',
  '152',
  '153',
  '155',
  '156',
  '157',
  '158',
  '159',
  '162',
  '165',
  '166',
  '167',
  '170',
  '171',
  '172',
  '173',
  '175',
  '176',
  '177',
  '178',
  '180',
  '181',
  '182',
  '183',
  '184',
  '185',
  '186',
  '187',
  '188',
  '189',
  '190',
  '191',
  '192',
  '193',
  '195',
  '196',
  '197',
  '198',
  '199'
]

const ID_CARD_AREA_CODES = [
  '110101',
  '110102',
  '310101',
  '310104',
  '320101',
  '320102',
  '330101',
  '330102',
  '440101',
  '440103',
  '440104',
  '440105',
  '500101',
  '500102',
  '510101',
  '510104',
  '610101',
  '610102'
]

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randomItem<T>(items: readonly T[]): T {
  return items[randomInt(0, items.length - 1)]
}

function randomBoolean(): boolean {
  return Math.random() < 0.5
}

function padZero(value: number, length = 2): string {
  return String(value).padStart(length, '0')
}

/**
 * 旧页面把数量限制在 1..1000。
 * 新实现也保留这个边界，避免用户一次性生成过大文本导致界面卡顿。
 */
export function clampMockCount(input: number): number {
  const count = Number.isFinite(input) ? Math.trunc(input) : 10
  return Math.min(1000, Math.max(1, count || 10))
}

export function randomName(): string {
  const length = randomBoolean() ? 2 : 3
  const surname = randomItem(SURNAMES)
  let name = surname
  for (let index = 1; index < length; index += 1) {
    name += randomItem(NAME_CHARS)
  }
  return name
}

export function randomEmail(): string {
  const prefix = `user${randomInt(1000, 99999)}`
  return `${prefix}@${randomItem(EMAIL_DOMAINS)}`
}

export function randomPhone(): string {
  return `${randomItem(MOBILE_PREFIXES)}${padZero(randomInt(0, 99_999_999), 8)}`
}

/**
 * 这里故意保持旧项目的“轻量 mock”语义。
 * 校验位不走严格算法，而是从常见字符里随机一个，和旧行为保持一致。
 */
export function randomIdCard(): string {
  const areaCode = randomItem(ID_CARD_AREA_CODES)
  const birthYear = randomInt(1970, 2005)
  const birthDate = `${birthYear}${padZero(randomInt(1, 12))}${padZero(randomInt(1, 28))}`
  const sequence = padZero(randomInt(1, 999), 3)
  const checkCode = randomItem(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'X'])
  return `${areaCode}${birthDate}${sequence}${checkCode}`
}

export function randomAddress(): string {
  const province = randomItem(PROVINCES)
  const city = randomItem(['市', '县'])
  const district = randomItem(['区', '县', '市'])
  const street = `${randomItem(STREET_WORDS)}${randomItem(STREET_TYPES)}`
  const number = randomInt(1, 999)
  const building = randomInt(1, 30)
  const unit = randomInt(1, 6)
  const room = `${padZero(randomInt(1, 99))}${padZero(randomInt(1, 10))}`
  return `${province}省${city}${district}${street}${number}号${building}栋${unit}单元${room}`
}

export function randomDate(): string {
  const start = new Date(1970, 0, 1).getTime()
  const end = Date.now()
  return new Date(randomInt(start, end)).toISOString()
}

export function generateMockValue(type: MockDataType): string {
  switch (type) {
    case 'name':
      return randomName()
    case 'email':
      return randomEmail()
    case 'phone':
      return randomPhone()
    case 'idcard':
      return randomIdCard()
    case 'address':
      return randomAddress()
    case 'uuid':
      return generateUuidV4()
    case 'date':
      return randomDate()
    default:
      return randomName()
  }
}

export function generateMockValues(type: MockDataType, count: number): string[] {
  const normalizedCount = clampMockCount(count)
  return Array.from({ length: normalizedCount }, () => generateMockValue(type))
}

/**
 * 旧项目的 CSV 输出不是标准二维表，而是“单列字符串列表”。
 * 这里保持同样的结果，这样用户把旧工具里的内容拷到新工具时不会产生格式落差。
 */
export function serializeMockValues(values: string[], format: MockOutputFormat): string {
  const rows = Array.isArray(values) ? values : []
  switch (format) {
    case 'json':
      return JSON.stringify(rows, null, 2)
    case 'csv':
      return rows.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',\n')
    case 'jsonlines':
      return rows.map((value) => JSON.stringify(value)).join('\n')
    case 'lines':
    default:
      return rows.join('\n')
  }
}

export function buildMockData(
  type: MockDataType,
  count: number,
  format: MockOutputFormat
): MockBuildResult {
  const values = generateMockValues(type, count)
  const output = serializeMockValues(values, format)
  return {
    values,
    output,
    count: values.length,
    summary: [
      `类型: ${type}`,
      `数量: ${values.length}`,
      `格式: ${format}`,
      `首条样例: ${values[0] ?? '无'}`
    ].join('\n')
  }
}
