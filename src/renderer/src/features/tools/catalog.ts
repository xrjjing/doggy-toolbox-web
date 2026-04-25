import type { ToolCategoryDefinition, ToolDefinition } from './types'

export const toolCategories: ToolCategoryDefinition[] = [
  {
    key: 'encoding-format',
    label: '编码与格式转换',
    description: '文本编码、结构化格式、预览与互转工具。'
  },
  {
    key: 'security-crypto',
    label: '安全与加密',
    description: '摘要、签名、加解密与敏感信息处理。'
  },
  {
    key: 'text-content',
    label: '文本与内容处理',
    description: '文本整理、分析、匹配、预览与格式化。'
  },
  {
    key: 'network-protocol',
    label: '网络、协议与接口',
    description: '网络协议、接口辅助与联机调试工具。'
  },
  {
    key: 'time-data-devops',
    label: '时间、数据生成与 DevOps',
    description: '时间计算、测试数据、命令生成与工程辅助。'
  }
]

/**
 * 工具工作台目录。
 * 这里只注册展示元数据，不绑定执行实现，避免目录层和算法层耦合。
 */
export const toolCatalog: ToolDefinition[] = [
  {
    key: 'base64',
    category: 'encoding-format',
    title: 'Base64',
    description: 'UTF-8 文本与 Base64 互转，保留旧项目内容识别思路。',
    accent: 'amber'
  },
  {
    key: 'url',
    category: 'encoding-format',
    title: 'URL',
    description: '支持单条和批量 URL 编解码，保留非法编码错误提示。',
    accent: 'orange'
  },
  {
    key: 'uuid',
    category: 'time-data-devops',
    title: 'UUID',
    description: '生成 UUID v4，后续可扩展到批量与格式选项。',
    accent: 'yellow'
  },
  {
    key: 'hash',
    category: 'security-crypto',
    title: 'Hash',
    description: 'MD5 / SHA-256 文本摘要，兼容旧工具的 UTF-8 语义。',
    accent: 'green'
  },
  {
    key: 'time',
    category: 'time-data-devops',
    title: 'Time',
    description: 'Unix 时间戳与标准时间互转，保留 UTC / UTC+8 视角。',
    accent: 'teal'
  },
  {
    key: 'json',
    category: 'encoding-format',
    title: 'JSON',
    description: '格式化、校验、常见错误修复和字段排序。',
    accent: 'cyan'
  },
  {
    key: 'text',
    category: 'text-content',
    title: 'Text',
    description: '去重、排序、去空行、行号处理等高频文本操作。',
    accent: 'blue'
  },
  {
    key: 'unicode',
    category: 'encoding-format',
    title: 'Unicode',
    description: '支持 \\uXXXX、\\xXX 和 HTML 实体互转。',
    accent: 'indigo'
  },
  {
    key: 'radix',
    category: 'encoding-format',
    title: 'Radix',
    description: '2/8/10/16 进制自动识别与 BigInt 转换。',
    accent: 'violet'
  },
  {
    key: 'naming',
    category: 'text-content',
    title: 'Naming',
    description: 'camel / pascal / snake / kebab 等命名风格转换。',
    accent: 'pink'
  },
  {
    key: 'jwt',
    category: 'security-crypto',
    title: 'JWT',
    description: '解析 JWT header / payload / signature，并提示 exp 过期风险。',
    accent: 'amber'
  },
  {
    key: 'hmac',
    category: 'security-crypto',
    title: 'HMAC',
    description: '按“secret --- message”输入生成 HMAC-SHA256 摘要。',
    accent: 'orange'
  },
  {
    key: 'html-entity',
    category: 'encoding-format',
    title: 'HTML Entity',
    description: 'HTML 实体编码 / 解码，承接旧项目 HTML 实体工具。',
    accent: 'yellow'
  },
  {
    key: 'charcount',
    category: 'text-content',
    title: 'Char Count',
    description: '统计字符、字节、行数、中文、英文单词、数字和空白。',
    accent: 'green'
  },
  {
    key: 'text-sort',
    category: 'text-content',
    title: 'Text Sort',
    description: '文本排序、反转、去空行、加行号和标题化。',
    accent: 'teal'
  },
  {
    key: 'mask',
    category: 'security-crypto',
    title: 'Data Mask',
    description: '手机号、邮箱、身份证、姓名和 JSON 字段脱敏。',
    accent: 'cyan'
  },
  {
    key: 'regex',
    category: 'text-content',
    title: 'Regex',
    description: '按“pattern /flags --- text”输入测试正则匹配。',
    accent: 'blue'
  },
  {
    key: 'sql',
    category: 'time-data-devops',
    title: 'SQL',
    description: 'SQL 格式化、压缩和表名提取的轻量实现。',
    accent: 'indigo'
  },
  {
    key: 'csv',
    category: 'encoding-format',
    title: 'CSV',
    description: 'CSV 转 JSON，或 JSON 数组转 CSV。',
    accent: 'violet'
  },
  {
    key: 'markdown',
    category: 'encoding-format',
    title: 'Markdown',
    description: 'Markdown 标题、列表、粗体、行内代码转 HTML 预览。',
    accent: 'pink'
  },
  {
    key: 'color',
    category: 'encoding-format',
    title: 'Color',
    description: 'HEX / RGB 转 HEX、RGB、HSL 和 CSS 变量。',
    accent: 'amber'
  },
  {
    key: 'cron',
    category: 'time-data-devops',
    title: 'Cron',
    description: '解析 5 段 Cron 表达式的分、时、日、月、周含义。',
    accent: 'orange'
  },
  {
    key: 'password',
    category: 'security-crypto',
    title: 'Password',
    description: '生成本地随机密码，默认长度 20，限制 8 到 128。',
    accent: 'yellow'
  },
  {
    key: 'json-schema',
    category: 'encoding-format',
    title: 'JSON Schema',
    description: '从 JSON 样例推断基础 JSON Schema。',
    accent: 'green'
  },
  {
    key: 'jsonpath',
    category: 'encoding-format',
    title: 'JSONPath',
    description: '支持 $.a.b、数组下标和 * 通配的轻量 JSONPath 查询。',
    accent: 'teal'
  },
  {
    key: 'toml',
    category: 'encoding-format',
    title: 'TOML',
    description: '解析常见 TOML key/value 与 section 为 JSON。',
    accent: 'cyan'
  },
  {
    key: 'ua',
    category: 'network-protocol',
    title: 'User Agent',
    description: '识别 UA 中的浏览器、系统、移动端和渲染引擎线索。',
    accent: 'blue'
  },
  {
    key: 'ip',
    category: 'network-protocol',
    title: 'IP',
    description: 'IPv4 / CIDR 基础检查，输出整数、十六进制和内网判断。',
    accent: 'indigo'
  },
  {
    key: 'b64hex',
    category: 'encoding-format',
    title: 'Base64 / Hex',
    description: 'Base64 与 Hex 内容识别和互转。',
    accent: 'violet'
  },
  {
    key: 'datecalc',
    category: 'time-data-devops',
    title: 'Date Calc',
    description: '按“日期\\n天数”计算日期加减；或两行日期计算相差天数。',
    accent: 'pink'
  },
  {
    key: 'data-convert',
    category: 'encoding-format',
    title: 'Data Convert',
    description: 'JSON 对象与 key=value 行互转。',
    accent: 'amber'
  },
  {
    key: 'qrcode',
    category: 'network-protocol',
    title: 'QR Code',
    description: '二维码生成、PNG 导出与图片复制，承接旧项目自定义颜色和容错等级能力。',
    accent: 'orange'
  },
  {
    key: 'img-base64',
    category: 'encoding-format',
    title: 'Image Base64',
    description: '图片文件与 Base64 / Data URI 双向转换，支持拖拽、预览和下载。',
    accent: 'teal'
  },
  {
    key: 'rsa',
    category: 'security-crypto',
    title: 'RSA',
    description: 'RSA-OAEP 密钥生成、PEM 校验和 Base64 / Hex 加解密。',
    accent: 'violet'
  },
  {
    key: 'websocket',
    category: 'network-protocol',
    title: 'WebSocket',
    description: 'WebSocket 连接测试、收发消息、自动重连和 JSON 格式化预览。',
    accent: 'blue'
  },
  {
    key: 'mock',
    category: 'time-data-devops',
    title: 'Mock',
    description: '生成姓名、邮箱、手机号、身份证、地址、UUID、日期等测试数据。',
    accent: 'amber'
  },
  {
    key: 'diff',
    category: 'text-content',
    title: 'Diff',
    description: '文本 / JSON 双栏对比，支持差异摘要、方向应用和 JSON 格式化。',
    accent: 'orange'
  },
  {
    key: 'crypto',
    category: 'security-crypto',
    title: 'Crypto',
    description: 'AES / DES ECB + PKCS7 对称加密，支持 Base64 / Hex 和 key 自动调整。',
    accent: 'yellow'
  },
  {
    key: 'git',
    category: 'time-data-devops',
    title: 'Git',
    description: '可视化生成常见 Git 命令，覆盖提交、分支、日志、变基等场景。',
    accent: 'green'
  },
  {
    key: 'docker',
    category: 'time-data-devops',
    title: 'Docker',
    description: '生成 Docker run/build/compose 等常见命令，承接旧项目多场景表单。',
    accent: 'teal'
  },
  {
    key: 'docker-service',
    category: 'time-data-devops',
    title: 'Docker Service',
    description: '生成 Docker Service create/update/scale/logs 等命令。',
    accent: 'cyan'
  },
  {
    key: 'docker-swarm',
    category: 'time-data-devops',
    title: 'Docker Swarm',
    description: '生成 Swarm / Stack 集群与编排命令，覆盖 init/join/deploy 等场景。',
    accent: 'blue'
  },
  {
    key: 'nginx',
    category: 'network-protocol',
    title: 'Nginx',
    description: '根据模板生成反向代理、SSL、SPA、负载均衡、限流等配置片段。',
    accent: 'indigo'
  }
]
