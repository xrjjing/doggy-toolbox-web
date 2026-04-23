import type { ToolDefinition } from './types'

/**
 * 工具工作台目录。
 * 这里只注册展示元数据，不绑定执行实现，避免目录层和算法层耦合。
 */
export const toolCatalog: ToolDefinition[] = [
  {
    key: 'base64',
    title: 'Base64',
    description: 'UTF-8 文本与 Base64 互转，保留旧项目内容识别思路。',
    accent: 'amber'
  },
  {
    key: 'url',
    title: 'URL',
    description: '支持单条和批量 URL 编解码，保留非法编码错误提示。',
    accent: 'orange'
  },
  {
    key: 'uuid',
    title: 'UUID',
    description: '生成 UUID v4，后续可扩展到批量与格式选项。',
    accent: 'yellow'
  },
  {
    key: 'hash',
    title: 'Hash',
    description: 'MD5 / SHA-256 文本摘要，兼容旧工具的 UTF-8 语义。',
    accent: 'green'
  },
  {
    key: 'time',
    title: 'Time',
    description: 'Unix 时间戳与标准时间互转，保留 UTC / UTC+8 视角。',
    accent: 'teal'
  },
  {
    key: 'json',
    title: 'JSON',
    description: '格式化、校验、常见错误修复和字段排序。',
    accent: 'cyan'
  },
  {
    key: 'text',
    title: 'Text',
    description: '去重、排序、去空行、行号处理等高频文本操作。',
    accent: 'blue'
  },
  {
    key: 'unicode',
    title: 'Unicode',
    description: '支持 \\uXXXX、\\xXX 和 HTML 实体互转。',
    accent: 'indigo'
  },
  {
    key: 'radix',
    title: 'Radix',
    description: '2/8/10/16 进制自动识别与 BigInt 转换。',
    accent: 'violet'
  },
  {
    key: 'naming',
    title: 'Naming',
    description: 'camel / pascal / snake / kebab 等命名风格转换。',
    accent: 'pink'
  },
  {
    key: 'jwt',
    title: 'JWT',
    description: '解析 JWT header / payload / signature，并提示 exp 过期风险。',
    accent: 'amber'
  },
  {
    key: 'hmac',
    title: 'HMAC',
    description: '按“secret --- message”输入生成 HMAC-SHA256 摘要。',
    accent: 'orange'
  },
  {
    key: 'html-entity',
    title: 'HTML Entity',
    description: 'HTML 实体编码 / 解码，承接旧项目 HTML 实体工具。',
    accent: 'yellow'
  },
  {
    key: 'charcount',
    title: 'Char Count',
    description: '统计字符、字节、行数、中文、英文单词、数字和空白。',
    accent: 'green'
  },
  {
    key: 'text-sort',
    title: 'Text Sort',
    description: '文本排序、反转、去空行、加行号和标题化。',
    accent: 'teal'
  },
  {
    key: 'mask',
    title: 'Data Mask',
    description: '手机号、邮箱、身份证、姓名和 JSON 字段脱敏。',
    accent: 'cyan'
  },
  {
    key: 'regex',
    title: 'Regex',
    description: '按“pattern /flags --- text”输入测试正则匹配。',
    accent: 'blue'
  },
  {
    key: 'sql',
    title: 'SQL',
    description: 'SQL 格式化、压缩和表名提取的轻量实现。',
    accent: 'indigo'
  },
  {
    key: 'csv',
    title: 'CSV',
    description: 'CSV 转 JSON，或 JSON 数组转 CSV。',
    accent: 'violet'
  },
  {
    key: 'markdown',
    title: 'Markdown',
    description: 'Markdown 标题、列表、粗体、行内代码转 HTML 预览。',
    accent: 'pink'
  },
  {
    key: 'color',
    title: 'Color',
    description: 'HEX / RGB 转 HEX、RGB、HSL 和 CSS 变量。',
    accent: 'amber'
  },
  {
    key: 'cron',
    title: 'Cron',
    description: '解析 5 段 Cron 表达式的分、时、日、月、周含义。',
    accent: 'orange'
  },
  {
    key: 'password',
    title: 'Password',
    description: '生成本地随机密码，默认长度 20，限制 8 到 128。',
    accent: 'yellow'
  },
  {
    key: 'json-schema',
    title: 'JSON Schema',
    description: '从 JSON 样例推断基础 JSON Schema。',
    accent: 'green'
  },
  {
    key: 'jsonpath',
    title: 'JSONPath',
    description: '支持 $.a.b、数组下标和 * 通配的轻量 JSONPath 查询。',
    accent: 'teal'
  },
  {
    key: 'toml',
    title: 'TOML',
    description: '解析常见 TOML key/value 与 section 为 JSON。',
    accent: 'cyan'
  },
  {
    key: 'ua',
    title: 'User Agent',
    description: '识别 UA 中的浏览器、系统、移动端和渲染引擎线索。',
    accent: 'blue'
  },
  {
    key: 'ip',
    title: 'IP',
    description: 'IPv4 / CIDR 基础检查，输出整数、十六进制和内网判断。',
    accent: 'indigo'
  },
  {
    key: 'b64hex',
    title: 'Base64 / Hex',
    description: 'Base64 与 Hex 内容识别和互转。',
    accent: 'violet'
  },
  {
    key: 'datecalc',
    title: 'Date Calc',
    description: '按“日期\\n天数”计算日期加减；或两行日期计算相差天数。',
    accent: 'pink'
  },
  {
    key: 'data-convert',
    title: 'Data Convert',
    description: 'JSON 对象与 key=value 行互转。',
    accent: 'amber'
  },
  {
    key: 'qrcode',
    title: 'QR Code',
    description: '二维码生成、PNG 导出与图片复制，承接旧项目自定义颜色和容错等级能力。',
    accent: 'orange'
  },
  {
    key: 'img-base64',
    title: 'Image Base64',
    description: '图片文件与 Base64 / Data URI 双向转换，支持拖拽、预览和下载。',
    accent: 'teal'
  },
  {
    key: 'rsa',
    title: 'RSA',
    description: 'RSA-OAEP 密钥生成、PEM 校验和 Base64 / Hex 加解密。',
    accent: 'violet'
  },
  {
    key: 'websocket',
    title: 'WebSocket',
    description: 'WebSocket 连接测试、收发消息、自动重连和 JSON 格式化预览。',
    accent: 'blue'
  },
  {
    key: 'mock',
    title: 'Mock',
    description: '生成姓名、邮箱、手机号、身份证、地址、UUID、日期等测试数据。',
    accent: 'amber'
  },
  {
    key: 'diff',
    title: 'Diff',
    description: '文本 / JSON 双栏对比，支持差异摘要、方向应用和 JSON 格式化。',
    accent: 'orange'
  },
  {
    key: 'crypto',
    title: 'Crypto',
    description: 'AES / DES ECB + PKCS7 对称加密，支持 Base64 / Hex 和 key 自动调整。',
    accent: 'yellow'
  },
  {
    key: 'git',
    title: 'Git',
    description: '可视化生成常见 Git 命令，覆盖提交、分支、日志、变基等场景。',
    accent: 'green'
  },
  {
    key: 'docker',
    title: 'Docker',
    description: '生成 Docker run/build/compose 等常见命令，承接旧项目多场景表单。',
    accent: 'teal'
  },
  {
    key: 'docker-service',
    title: 'Docker Service',
    description: '生成 Docker Service create/update/scale/logs 等命令。',
    accent: 'cyan'
  },
  {
    key: 'docker-swarm',
    title: 'Docker Swarm',
    description: '生成 Swarm / Stack 集群与编排命令，覆盖 init/join/deploy 等场景。',
    accent: 'blue'
  },
  {
    key: 'nginx',
    title: 'Nginx',
    description: '根据模板生成反向代理、SSL、SPA、负载均衡、限流等配置片段。',
    accent: 'indigo'
  }
]
