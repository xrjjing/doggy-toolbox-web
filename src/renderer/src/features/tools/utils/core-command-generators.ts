/**
 * 旧项目大型命令生成器迁移工具集。
 *
 * 这批函数只负责“把结构化参数安全地拼成命令或配置文本”，不直接依赖 DOM、Vue 或 Electron。
 * 这样做有两个目的：
 * 1. 高级面板可以专注做交互、状态切换和预览，不把字符串拼装逻辑分散到模板里。
 * 2. Vitest 可以直接覆盖主要场景，避免 UI 改动时把老命令规则悄悄改坏。
 */

export type CommandResult = {
  command: string
  description: string
  warnings: string[]
}

export type TemplateCommand = {
  name: string
  command: string
  description: string
  category: string
}

export type GitScene =
  | 'commit'
  | 'branch'
  | 'log'
  | 'reset'
  | 'clone'
  | 'merge'
  | 'stash'
  | 'rebase'
  | 'cherry-pick'
  | 'tag'
  | 'remote'
  | 'revert'

export type DockerScene =
  | 'run'
  | 'build'
  | 'compose'
  | 'exec'
  | 'logs'
  | 'ps'
  | 'images'
  | 'container'
  | 'network'
  | 'volume'
  | 'prune'
  | 'cp'

export type DockerServiceScene = 'create' | 'update' | 'scale' | 'logs' | 'ps' | 'ls' | 'rm'

export type DockerSwarmScope = 'swarm' | 'stack'

export type DockerSwarmScene = 'init' | 'join' | 'leave' | 'update' | 'unlock'

export type DockerStackScene = 'deploy' | 'ls' | 'ps' | 'services' | 'rm'

export type NginxTemplateKey =
  | 'reverseProxy'
  | 'staticSite'
  | 'spa'
  | 'ssl'
  | 'loadBalance'
  | 'rateLimit'
  | 'cors'
  | 'fileUpload'

export type NginxGeneratedResult = {
  config: string
  summary: string
  warnings: string[]
  error?: string
}

export type NginxTemplateField = {
  key: string
  label: string
  type: 'text' | 'number' | 'checkbox' | 'select'
  placeholder?: string
  options?: Array<{ label: string; value: string }>
  helper?: string
}

/**
 * Nginx 动态模板字段定义。
 * 高级面板直接消费这份元数据，就能保持“切换模板 -> 渲染当前模板字段”的旧项目交互方式。
 */
export const NGINX_TEMPLATE_FIELDS: Record<NginxTemplateKey, NginxTemplateField[]> = {
  reverseProxy: [
    {
      key: 'proxyPass',
      label: '代理地址',
      type: 'text',
      placeholder: 'http://127.0.0.1:8080',
      helper: '必须是 http 或 https 开头的后端地址'
    },
    {
      key: 'proxyTimeout',
      label: '超时时间（秒）',
      type: 'number',
      placeholder: '60',
      helper: '会同时作用于 connect/send/read timeout'
    },
    {
      key: 'websocket',
      label: '启用 WebSocket 头部透传',
      type: 'checkbox'
    }
  ],
  staticSite: [
    {
      key: 'rootPath',
      label: '站点根目录',
      type: 'text',
      placeholder: '/var/www/html'
    },
    {
      key: 'indexFile',
      label: '首页文件',
      type: 'text',
      placeholder: 'index.html'
    },
    {
      key: 'gzip',
      label: '启用 Gzip 压缩',
      type: 'checkbox'
    },
    {
      key: 'cacheControl',
      label: '启用静态资源长缓存',
      type: 'checkbox'
    }
  ],
  spa: [
    {
      key: 'rootPath',
      label: '前端产物目录',
      type: 'text',
      placeholder: '/var/www/html'
    }
  ],
  ssl: [
    {
      key: 'sslCert',
      label: '证书路径',
      type: 'text',
      placeholder: '/etc/nginx/ssl/cert.pem'
    },
    {
      key: 'sslKey',
      label: '私钥路径',
      type: 'text',
      placeholder: '/etc/nginx/ssl/key.pem'
    },
    {
      key: 'rootPath',
      label: '站点根目录',
      type: 'text',
      placeholder: '/var/www/html'
    },
    {
      key: 'hsts',
      label: '启用 HSTS',
      type: 'checkbox'
    }
  ],
  loadBalance: [
    {
      key: 'upstreamName',
      label: 'Upstream 名称',
      type: 'text',
      placeholder: 'backend'
    },
    {
      key: 'servers',
      label: '后端服务器列表',
      type: 'text',
      placeholder: '127.0.0.1:8001,127.0.0.1:8002',
      helper: '多个后端用英文逗号分隔'
    },
    {
      key: 'algorithm',
      label: '负载算法',
      type: 'select',
      options: [
        { label: '默认轮询', value: '' },
        { label: 'ip_hash', value: 'ip_hash' },
        { label: 'least_conn', value: 'least_conn' }
      ]
    }
  ],
  rateLimit: [
    {
      key: 'zoneName',
      label: '限流 Zone 名称',
      type: 'text',
      placeholder: 'api_limit'
    },
    {
      key: 'rateLimit',
      label: '速率（r/s）',
      type: 'number',
      placeholder: '10'
    },
    {
      key: 'burstLimit',
      label: '突发上限',
      type: 'number',
      placeholder: '20'
    }
  ],
  cors: [
    {
      key: 'allowOrigin',
      label: '允许来源',
      type: 'text',
      placeholder: '*'
    },
    {
      key: 'allowMethods',
      label: '允许方法',
      type: 'text',
      placeholder: 'GET, POST, PUT, DELETE, OPTIONS'
    }
  ],
  fileUpload: [
    {
      key: 'maxBodySize',
      label: '最大上传大小（MB）',
      type: 'number',
      placeholder: '100'
    },
    {
      key: 'uploadPath',
      label: '上传路由',
      type: 'text',
      placeholder: '/upload'
    }
  ]
}

function buildCommandResult(
  command: string,
  description: string,
  warnings: string[] = []
): CommandResult {
  return {
    command,
    description,
    warnings
  }
}

/**
 * 统一做 POSIX shell 参数转义。
 * 旧项目的 Git 和 Docker 页面本质是“生成给终端执行的文本”，这里优先保证复制后可直接在常见 shell 使用。
 */
export function shellQuote(value: string | number | boolean | null | undefined): string {
  const text = String(value ?? '')
  if (!text) return "''"
  if (!/[\s'"$`\\!*?#&|()<>[\]{};]/.test(text)) {
    return text
  }
  return `'${text.replace(/'/g, `'\\''`)}'`
}

function pushFlag(parts: string[], enabled: boolean | undefined, flag: string): void {
  if (enabled) {
    parts.push(flag)
  }
}

function pushOption(
  parts: string[],
  flag: string,
  value: string | number | undefined | null
): void {
  if (value === undefined || value === null || String(value).trim() === '') return
  parts.push(`${flag} ${shellQuote(String(value).trim())}`)
}

function pushMultiOption(
  parts: string[],
  flag: string,
  values: string[] | undefined,
  warnings?: string[],
  warningLabel?: string
): void {
  if (!values?.length) return
  values.forEach((value) => parts.push(`${flag} ${shellQuote(value)}`))
  if (warnings && warningLabel) {
    warnings.push(`${warningLabel} 共 ${values.length} 项`)
  }
}

function ensureRequired(value: string | undefined | null, fieldName: string): string {
  const text = String(value ?? '').trim()
  if (!text) {
    throw new Error(`${fieldName}不能为空`)
  }
  return text
}

function parseCommaSeparated(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function parseWhitespaceSeparated(value: string): string[] {
  return value
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function withCountDescription(base: string, count: number, label: string): string {
  return `${base}（${label}${count} 项）`
}

export function formatWarnings(warnings: string[]): string {
  return warnings.length ? warnings.map((item) => `- ${item}`).join('\n') : '无额外提醒'
}

export function summarizeCommandResult(result: CommandResult): string {
  return [
    result.description,
    result.warnings.length ? '风险提示:' : '风险提示: 无',
    formatWarnings(result.warnings)
  ]
    .filter(Boolean)
    .join('\n')
}

export type GitCommitOptions = {
  all?: boolean
  amend?: boolean
  noVerify?: boolean
}

export function generateGitCommitCommand(
  message: string,
  options: GitCommitOptions = {}
): CommandResult {
  const commitMessage = ensureRequired(message, '提交消息')
  const parts = ['git commit']
  const warnings: string[] = []

  pushFlag(parts, options.all, '-a')
  pushFlag(parts, options.amend, '--amend')
  if (options.noVerify) {
    parts.push('--no-verify')
    warnings.push('已跳过 Git hooks，请确认本地校验不是必须环节')
  }
  parts.push(`-m ${shellQuote(commitMessage)}`)

  if (options.amend) {
    warnings.push('该命令会改写最新一次提交历史')
  }

  return buildCommandResult(parts.join(' '), '生成 Git commit 命令', warnings)
}

export type GitBranchAction = 'create' | 'delete' | 'list' | 'rename' | 'switch'

export type GitBranchOptions = {
  newName?: string
  force?: boolean
  remote?: boolean
  track?: boolean
}

export function generateGitBranchCommand(
  action: GitBranchAction,
  name: string,
  options: GitBranchOptions = {}
): CommandResult {
  const parts = ['git']
  const warnings: string[] = []

  switch (action) {
    case 'create': {
      const branch = ensureRequired(name, '分支名称')
      parts.push('branch')
      pushFlag(parts, options.track, '--track')
      parts.push(shellQuote(branch))
      return buildCommandResult(parts.join(' '), `创建分支 ${branch}`, warnings)
    }
    case 'delete': {
      const branch = ensureRequired(name, '分支名称')
      parts.push('branch', options.force ? '-D' : '-d', shellQuote(branch))
      warnings.push(options.force ? '强制删除分支会跳过未合并检查' : '删除前请确认分支改动已经合并')
      return buildCommandResult(parts.join(' '), `删除分支 ${branch}`, warnings)
    }
    case 'list': {
      parts.push('branch')
      pushFlag(parts, options.remote, '-r')
      return buildCommandResult(
        parts.join(' '),
        options.remote ? '列出远程分支' : '列出本地分支',
        warnings
      )
    }
    case 'rename': {
      const oldName = ensureRequired(name, '原分支名称')
      const newName = ensureRequired(options.newName, '新分支名称')
      parts.push('branch', '-m', shellQuote(oldName), shellQuote(newName))
      warnings.push('重命名后如果远端已存在同名旧分支，还需要手动同步远端')
      return buildCommandResult(parts.join(' '), `重命名分支 ${oldName} -> ${newName}`, warnings)
    }
    case 'switch': {
      const branch = ensureRequired(name, '分支名称')
      parts.push('switch', shellQuote(branch))
      return buildCommandResult(parts.join(' '), `切换到分支 ${branch}`, warnings)
    }
    default:
      throw new Error(`不支持的分支操作：${action}`)
  }
}

export type GitLogOptions = {
  oneline?: boolean
  graph?: boolean
  maxCount?: number
  author?: string
  grep?: string
}

export function generateGitLogCommand(options: GitLogOptions = {}): CommandResult {
  const parts = ['git log']
  pushFlag(parts, options.oneline, '--oneline')
  pushFlag(parts, options.graph, '--graph')
  if (options.maxCount && Number.isInteger(options.maxCount) && options.maxCount > 0) {
    parts.push(`-n ${options.maxCount}`)
  }
  if (options.author?.trim()) {
    parts.push(`--author=${shellQuote(options.author.trim())}`)
  }
  if (options.grep?.trim()) {
    parts.push(`--grep=${shellQuote(options.grep.trim())}`)
  }
  return buildCommandResult(parts.join(' '), '查看 Git 提交历史', [])
}

export type GitResetMode = 'soft' | 'mixed' | 'hard'

export function generateGitResetCommand(mode: GitResetMode, ref: string): CommandResult {
  const parts = ['git reset']
  const warnings: string[] = []
  const normalizedRef = ref.trim()

  if (mode === 'soft') {
    parts.push('--soft')
  } else if (mode === 'mixed') {
    parts.push('--mixed')
  } else if (mode === 'hard') {
    parts.push('--hard')
    warnings.push('hard reset 会直接丢弃工作区和暂存区修改')
  } else {
    throw new Error('重置模式必须是 soft、mixed 或 hard')
  }

  if (normalizedRef) {
    parts.push(shellQuote(normalizedRef))
  }

  return buildCommandResult(parts.join(' '), `执行 ${mode} 模式 reset`, warnings)
}

export type GitCloneOptions = {
  branch?: string
  targetDir?: string
  depth?: number
  recursive?: boolean
  singleBranch?: boolean
}

export function generateGitCloneCommand(url: string, options: GitCloneOptions = {}): CommandResult {
  const repoUrl = ensureRequired(url, '仓库 URL')
  const parts = ['git clone']
  const warnings: string[] = []

  if (options.branch?.trim()) {
    parts.push(`-b ${shellQuote(options.branch.trim())}`)
  }
  if (options.depth && Number.isInteger(options.depth) && options.depth > 0) {
    parts.push(`--depth ${options.depth}`)
    warnings.push('浅克隆只保留部分历史，后续某些 Git 操作可能受限')
  }
  pushFlag(parts, options.singleBranch, '--single-branch')
  pushFlag(parts, options.recursive, '--recursive')
  parts.push(shellQuote(repoUrl))
  if (options.targetDir?.trim()) {
    parts.push(shellQuote(options.targetDir.trim()))
  }

  return buildCommandResult(parts.join(' '), '克隆仓库', warnings)
}

export type GitMergeOptions = {
  noFf?: boolean
  squash?: boolean
  message?: string
}

export function generateGitMergeCommand(
  branch: string,
  options: GitMergeOptions = {}
): CommandResult {
  const targetBranch = ensureRequired(branch, '要合并的分支')
  const parts = ['git merge']
  const warnings: string[] = []

  pushFlag(parts, options.noFf, '--no-ff')
  if (options.squash) {
    parts.push('--squash')
    warnings.push('squash merge 不会保留原始提交图谱')
  }
  if (options.message?.trim()) {
    parts.push(`-m ${shellQuote(options.message.trim())}`)
  }
  parts.push(shellQuote(targetBranch))

  return buildCommandResult(parts.join(' '), `合并分支 ${targetBranch}`, warnings)
}

export type GitStashAction = 'save' | 'list' | 'pop' | 'apply' | 'drop' | 'clear'

export type GitStashOptions = {
  message?: string
  index?: number
  keepIndex?: boolean
}

export function generateGitStashCommand(
  action: GitStashAction,
  options: GitStashOptions = {}
): CommandResult {
  const parts = ['git stash']
  const warnings: string[] = []

  switch (action) {
    case 'save':
      parts.push('push')
      pushFlag(parts, options.keepIndex, '--keep-index')
      if (options.message?.trim()) {
        parts.push(`-m ${shellQuote(options.message.trim())}`)
      }
      return buildCommandResult(parts.join(' '), '暂存当前工作区', warnings)
    case 'list':
      parts.push('list')
      return buildCommandResult(parts.join(' '), '查看 stash 列表', warnings)
    case 'pop':
    case 'apply':
    case 'drop': {
      parts.push(action)
      if (options.index !== undefined) {
        parts.push(`stash@{${options.index}}`)
      }
      if (action === 'drop') {
        warnings.push('drop 会删除指定 stash，请确认不再需要该暂存内容')
      }
      return buildCommandResult(parts.join(' '), `执行 stash ${action}`, warnings)
    }
    case 'clear':
      parts.push('clear')
      warnings.push('clear 会清空全部 stash 记录')
      return buildCommandResult(parts.join(' '), '清空所有 stash', warnings)
    default:
      throw new Error(`不支持的 stash 操作：${action}`)
  }
}

export type GitRebaseOptions = {
  interactive?: boolean
  onto?: string
}

export function generateGitRebaseCommand(
  branch: string,
  options: GitRebaseOptions = {}
): CommandResult {
  const target = ensureRequired(branch, '变基目标分支')
  const parts = ['git rebase']
  const warnings: string[] = ['rebase 会改写提交历史，推送前请确认团队协作约束']

  pushFlag(parts, options.interactive, '-i')
  if (options.onto?.trim()) {
    parts.push(`--onto ${shellQuote(options.onto.trim())}`)
  }
  parts.push(shellQuote(target))

  return buildCommandResult(parts.join(' '), `变基到 ${target}`, warnings)
}

export type GitCherryPickOptions = {
  noCommit?: boolean
  edit?: boolean
  signoff?: boolean
  mainline?: number
}

export function generateGitCherryPickCommand(
  commits: string,
  options: GitCherryPickOptions = {}
): CommandResult {
  const commitText = ensureRequired(commits, '提交哈希')
  const parts = ['git cherry-pick']
  const warnings: string[] = []

  pushFlag(parts, options.noCommit, '-n')
  pushFlag(parts, options.edit, '-e')
  pushFlag(parts, options.signoff, '-s')
  if (options.mainline && Number.isInteger(options.mainline) && options.mainline > 0) {
    parts.push(`-m ${options.mainline}`)
  }
  parts.push(commitText)

  if (parseWhitespaceSeparated(commitText).length > 1) {
    warnings.push('本次会连续挑选多个提交，遇到冲突需要逐个处理')
  }

  return buildCommandResult(parts.join(' '), '执行 cherry-pick', warnings)
}

export type GitTagAction = 'create' | 'delete' | 'push' | 'list'

export type GitTagOptions = {
  annotate?: boolean
  message?: string
  remote?: string
  force?: boolean
}

export function generateGitTagCommand(
  action: GitTagAction,
  tagName: string,
  options: GitTagOptions = {}
): CommandResult {
  const warnings: string[] = []

  if (action === 'list') {
    return buildCommandResult('git tag --list', '列出全部标签', warnings)
  }

  const normalizedTag = ensureRequired(tagName, '标签名称')

  if (action === 'create') {
    if (options.annotate && options.message?.trim()) {
      return buildCommandResult(
        `git tag -a ${shellQuote(normalizedTag)} -m ${shellQuote(options.message.trim())}`,
        `创建附注标签 ${normalizedTag}`,
        warnings
      )
    }
    return buildCommandResult(
      `git tag ${shellQuote(normalizedTag)}`,
      `创建轻量标签 ${normalizedTag}`,
      warnings
    )
  }

  if (action === 'delete') {
    warnings.push('这只会删除本地标签，远端标签需要额外处理')
    return buildCommandResult(
      `git tag -d ${shellQuote(normalizedTag)}`,
      `删除本地标签 ${normalizedTag}`,
      warnings
    )
  }

  if (action === 'push') {
    const remote = options.remote?.trim() || 'origin'
    const forcePart = options.force ? ' -f' : ''
    if (options.force) {
      warnings.push('强制推送标签可能覆盖远端同名标签')
    }
    return buildCommandResult(
      `git push${forcePart} ${shellQuote(remote)} ${shellQuote(normalizedTag)}`,
      `推送标签 ${normalizedTag}`,
      warnings
    )
  }

  throw new Error(`不支持的标签操作：${action}`)
}

export type GitRemoteAction = 'add' | 'set-url' | 'remove' | 'show' | 'rename'

export function generateGitRemoteCommand(
  action: GitRemoteAction,
  name: string,
  value = ''
): CommandResult {
  const remoteName = name.trim() || 'origin'
  const warnings: string[] = []

  if (action === 'add') {
    const url = ensureRequired(value, '远程仓库 URL')
    return buildCommandResult(
      `git remote add ${shellQuote(remoteName)} ${shellQuote(url)}`,
      `添加远程仓库 ${remoteName}`,
      warnings
    )
  }

  if (action === 'set-url') {
    const url = ensureRequired(value, '新 URL')
    warnings.push('修改远端地址后，已有 CI 或脚本配置可能也要同步')
    return buildCommandResult(
      `git remote set-url ${shellQuote(remoteName)} ${shellQuote(url)}`,
      `修改远程仓库 ${remoteName} 地址`,
      warnings
    )
  }

  if (action === 'remove') {
    warnings.push('删除 remote 只影响本地仓库配置，不会删除远端真实仓库')
    return buildCommandResult(
      `git remote remove ${shellQuote(remoteName)}`,
      `删除远程仓库 ${remoteName}`,
      warnings
    )
  }

  if (action === 'show') {
    return buildCommandResult(
      `git remote show ${shellQuote(remoteName)}`,
      `查看远程仓库 ${remoteName}`,
      warnings
    )
  }

  if (action === 'rename') {
    const newName = ensureRequired(value, '新远程仓库名称')
    return buildCommandResult(
      `git remote rename ${shellQuote(remoteName)} ${shellQuote(newName)}`,
      `重命名远程仓库 ${remoteName} -> ${newName}`,
      warnings
    )
  }

  throw new Error(`不支持的远程操作：${action}`)
}

export type GitRevertOptions = {
  noCommit?: boolean
  noEdit?: boolean
  edit?: boolean
  mainline?: number
}

export function generateGitRevertCommand(
  commits: string,
  options: GitRevertOptions = {}
): CommandResult {
  const commitText = ensureRequired(commits, '提交哈希')
  const parts = ['git revert']
  const warnings: string[] = []

  pushFlag(parts, options.noCommit, '-n')
  if (options.noEdit) {
    parts.push('--no-edit')
  } else {
    pushFlag(parts, options.edit, '-e')
  }
  if (options.mainline && Number.isInteger(options.mainline) && options.mainline > 0) {
    parts.push(`-m ${options.mainline}`)
  }
  parts.push(commitText)

  warnings.push('revert 会额外生成反向提交，不会直接抹掉原历史')
  return buildCommandResult(parts.join(' '), '撤销指定提交', warnings)
}

export function getGitCommandTemplates(): TemplateCommand[] {
  return [
    {
      name: '初始化仓库',
      command: 'git init',
      description: '在当前目录初始化 Git 仓库',
      category: '基础'
    },
    {
      name: '查看状态',
      command: 'git status',
      description: '查看工作区和暂存区状态',
      category: '基础'
    },
    {
      name: '添加所有修改',
      command: 'git add .',
      description: '把当前目录修改加入暂存区',
      category: '基础'
    },
    {
      name: '推送主分支',
      command: 'git push origin main',
      description: '把 main 推送到 origin',
      category: '远程'
    },
    {
      name: '拉取最新代码',
      command: 'git pull --rebase',
      description: '先更新远端再做 rebase',
      category: '远程'
    },
    {
      name: '查看远端',
      command: 'git remote -v',
      description: '列出远端仓库地址',
      category: '远程'
    },
    {
      name: '清理未跟踪文件',
      command: 'git clean -fd',
      description: '删除未跟踪文件和目录',
      category: '清理'
    },
    {
      name: '查看提交详情',
      command: 'git show HEAD',
      description: '查看当前提交详情',
      category: '排查'
    }
  ]
}

export type DockerRunOptions = {
  detach?: boolean
  interactive?: boolean
  rm?: boolean
  privileged?: boolean
  name?: string
  hostname?: string
  user?: string
  workdir?: string
  network?: string
  restart?: string
  memory?: string
  cpus?: string
  ports?: string[]
  volumes?: string[]
  env?: string[]
  link?: string[]
  command?: string
}

export function generateDockerRunCommand(
  image: string,
  options: DockerRunOptions = {}
): CommandResult {
  const targetImage = ensureRequired(image, '镜像名称')
  const parts = ['docker run']
  const warnings: string[] = []

  pushFlag(parts, options.detach, '-d')
  pushFlag(parts, options.interactive, '-it')
  pushFlag(parts, options.rm, '--rm')
  if (options.privileged) {
    parts.push('--privileged')
    warnings.push('privileged 会给容器较高宿主机权限')
  }
  pushOption(parts, '--name', options.name)
  pushOption(parts, '-h', options.hostname)
  pushOption(parts, '-u', options.user)
  pushOption(parts, '-w', options.workdir)
  pushOption(parts, '--network', options.network)
  pushOption(parts, '--restart', options.restart)
  pushOption(parts, '--memory', options.memory)
  pushOption(parts, '--cpus', options.cpus)
  pushMultiOption(parts, '-p', options.ports)
  pushMultiOption(parts, '-v', options.volumes)
  pushMultiOption(parts, '-e', options.env)
  pushMultiOption(parts, '--link', options.link)
  parts.push(shellQuote(targetImage))
  if (options.command?.trim()) {
    parts.push(options.command.trim())
  }

  return buildCommandResult(parts.join(' '), `运行容器镜像 ${targetImage}`, warnings)
}

export type DockerBuildOptions = {
  tag?: string
  file?: string
  buildArg?: string[]
  noCache?: boolean
  pull?: boolean
  rm?: boolean
  target?: string
  platform?: string
}

export function generateDockerBuildCommand(
  path: string,
  options: DockerBuildOptions = {}
): CommandResult {
  const buildPath = ensureRequired(path, '构建路径')
  const parts = ['docker build']
  const warnings: string[] = []

  pushOption(parts, '-t', options.tag)
  pushOption(parts, '-f', options.file)
  pushFlag(parts, options.noCache, '--no-cache')
  pushFlag(parts, options.pull, '--pull')
  if (options.rm !== false) {
    parts.push('--rm')
  }
  pushOption(parts, '--target', options.target)
  pushOption(parts, '--platform', options.platform)
  pushMultiOption(parts, '--build-arg', options.buildArg)
  parts.push(shellQuote(buildPath))

  if (options.noCache) {
    warnings.push('禁用缓存会拉长构建时间')
  }

  return buildCommandResult(parts.join(' '), `构建镜像上下文 ${buildPath}`, warnings)
}

export type DockerComposeAction =
  | 'up'
  | 'down'
  | 'start'
  | 'stop'
  | 'restart'
  | 'ps'
  | 'logs'
  | 'build'
  | 'pull'
  | 'exec'

export type DockerComposeOptions = {
  file?: string
  projectName?: string
  service?: string[]
  detach?: boolean
  build?: boolean
  noBuild?: boolean
  volumes?: boolean
  removeOrphans?: boolean
  follow?: boolean
  tail?: number
}

export function generateDockerComposeCommand(
  action: DockerComposeAction,
  options: DockerComposeOptions = {}
): CommandResult {
  const parts = ['docker compose']
  const warnings: string[] = []

  pushOption(parts, '-f', options.file)
  pushOption(parts, '-p', options.projectName)
  parts.push(action)

  if (action === 'up') {
    pushFlag(parts, options.detach, '-d')
    pushFlag(parts, options.build, '--build')
    pushFlag(parts, options.noBuild, '--no-build')
    pushFlag(parts, options.removeOrphans, '--remove-orphans')
  } else if (action === 'down') {
    pushFlag(parts, options.volumes, '-v')
    pushFlag(parts, options.removeOrphans, '--remove-orphans')
    if (options.volumes) {
      warnings.push('down -v 会把关联卷一并删除')
    }
  } else if (action === 'logs') {
    pushFlag(parts, options.follow, '-f')
    if (options.tail !== undefined && options.tail >= 0) {
      parts.push(`--tail ${options.tail}`)
    }
  }

  if (options.service?.length) {
    options.service.forEach((item) => parts.push(shellQuote(item)))
  }

  return buildCommandResult(parts.join(' '), `执行 docker compose ${action}`, warnings)
}

export type DockerExecOptions = {
  interactive?: boolean
  detach?: boolean
  user?: string
  workdir?: string
  env?: string[]
}

export function generateDockerExecCommand(
  container: string,
  command: string,
  options: DockerExecOptions = {}
): CommandResult {
  const targetContainer = ensureRequired(container, '容器名称')
  const execCommand = ensureRequired(command, '执行命令')
  const parts = ['docker exec']

  pushFlag(parts, options.interactive, '-it')
  pushFlag(parts, options.detach, '-d')
  pushOption(parts, '-u', options.user)
  pushOption(parts, '-w', options.workdir)
  pushMultiOption(parts, '-e', options.env)
  parts.push(shellQuote(targetContainer), execCommand)

  return buildCommandResult(parts.join(' '), `在容器 ${targetContainer} 中执行命令`, [])
}

export type DockerLogsOptions = {
  follow?: boolean
  tail?: number
  timestamps?: boolean
  since?: string
  until?: string
}

export function generateDockerLogsCommand(
  container: string,
  options: DockerLogsOptions = {}
): CommandResult {
  const targetContainer = ensureRequired(container, '容器名称')
  const parts = ['docker logs']

  pushFlag(parts, options.follow, '-f')
  pushFlag(parts, options.timestamps, '-t')
  if (options.tail !== undefined && options.tail >= 0) {
    parts.push(`--tail ${options.tail}`)
  }
  pushOption(parts, '--since', options.since)
  pushOption(parts, '--until', options.until)
  parts.push(shellQuote(targetContainer))

  return buildCommandResult(parts.join(' '), `查看容器 ${targetContainer} 日志`, [])
}

export type DockerPsOptions = {
  all?: boolean
  quiet?: boolean
  size?: boolean
  filter?: string
  format?: string
}

export function generateDockerPsCommand(options: DockerPsOptions = {}): CommandResult {
  const parts = ['docker ps']
  pushFlag(parts, options.all, '-a')
  pushFlag(parts, options.quiet, '-q')
  pushFlag(parts, options.size, '-s')
  pushOption(parts, '--filter', options.filter)
  pushOption(parts, '--format', options.format)
  return buildCommandResult(parts.join(' '), '列出容器', [])
}

export type DockerImagesOptions = {
  all?: boolean
  quiet?: boolean
  digests?: boolean
  filter?: string
  format?: string
}

export function generateDockerImagesCommand(options: DockerImagesOptions = {}): CommandResult {
  const parts = ['docker images']
  pushFlag(parts, options.all, '-a')
  pushFlag(parts, options.quiet, '-q')
  pushFlag(parts, options.digests, '--digests')
  pushOption(parts, '--filter', options.filter)
  pushOption(parts, '--format', options.format)
  return buildCommandResult(parts.join(' '), '列出镜像', [])
}

export type DockerContainerAction = 'stop' | 'start' | 'restart' | 'rm'

export type DockerContainerOptions = {
  force?: boolean
  volumes?: boolean
  time?: number
}

export function generateDockerContainerCommand(
  action: DockerContainerAction,
  containers: string[],
  options: DockerContainerOptions = {}
): CommandResult {
  if (!containers.length) {
    throw new Error('至少提供一个容器名称')
  }
  const parts = [`docker ${action}`]
  const warnings: string[] = []

  if (action === 'rm') {
    pushFlag(parts, options.force, '-f')
    pushFlag(parts, options.volumes, '-v')
    warnings.push('删除容器前请确认内部数据是否已经持久化')
  }
  if (action === 'stop' && options.time !== undefined) {
    parts.push(`-t ${options.time}`)
  }
  containers.forEach((item) => parts.push(shellQuote(item)))

  return buildCommandResult(
    parts.join(' '),
    withCountDescription(`容器 ${action}`, containers.length, '容器'),
    warnings
  )
}

export type DockerNetworkAction =
  | 'create'
  | 'ls'
  | 'rm'
  | 'inspect'
  | 'connect'
  | 'disconnect'
  | 'prune'

export type DockerNetworkOptions = {
  driver?: string
  subnet?: string
  gateway?: string
  ipRange?: string
  internal?: boolean
  attachable?: boolean
  filter?: string
  container?: string
  ip?: string
  alias?: string
  force?: boolean
}

export function generateDockerNetworkCommand(
  action: DockerNetworkAction,
  name: string,
  options: DockerNetworkOptions = {}
): CommandResult {
  const warnings: string[] = []

  if (action === 'create') {
    const networkName = ensureRequired(name, '网络名称')
    const parts = ['docker network create']
    pushOption(parts, '-d', options.driver)
    pushOption(parts, '--subnet', options.subnet)
    pushOption(parts, '--gateway', options.gateway)
    pushOption(parts, '--ip-range', options.ipRange)
    pushFlag(parts, options.internal, '--internal')
    pushFlag(parts, options.attachable, '--attachable')
    parts.push(shellQuote(networkName))
    return buildCommandResult(parts.join(' '), `创建网络 ${networkName}`, warnings)
  }

  if (action === 'ls') {
    const parts = ['docker network ls']
    pushOption(parts, '--filter', options.filter)
    return buildCommandResult(parts.join(' '), '列出网络', warnings)
  }

  if (action === 'rm') {
    const networkName = ensureRequired(name, '网络名称')
    warnings.push('删除网络前请确认没有容器仍在使用')
    return buildCommandResult(
      `docker network rm ${shellQuote(networkName)}`,
      `删除网络 ${networkName}`,
      warnings
    )
  }

  if (action === 'inspect') {
    const networkName = ensureRequired(name, '网络名称')
    return buildCommandResult(
      `docker network inspect ${shellQuote(networkName)}`,
      `查看网络 ${networkName}`,
      warnings
    )
  }

  if (action === 'connect') {
    const networkName = ensureRequired(name, '网络名称')
    const container = ensureRequired(options.container, '容器名称')
    const parts = ['docker network connect']
    pushOption(parts, '--ip', options.ip)
    pushOption(parts, '--alias', options.alias)
    parts.push(shellQuote(networkName), shellQuote(container))
    return buildCommandResult(
      parts.join(' '),
      `连接容器 ${container} 到网络 ${networkName}`,
      warnings
    )
  }

  if (action === 'disconnect') {
    const networkName = ensureRequired(name, '网络名称')
    const container = ensureRequired(options.container, '容器名称')
    const parts = ['docker network disconnect']
    pushFlag(parts, options.force, '-f')
    parts.push(shellQuote(networkName), shellQuote(container))
    return buildCommandResult(
      parts.join(' '),
      `断开容器 ${container} 与网络 ${networkName}`,
      warnings
    )
  }

  warnings.push('prune 会清理全部未使用网络')
  return buildCommandResult('docker network prune -f', '清理未使用网络', warnings)
}

export type DockerVolumeAction = 'create' | 'ls' | 'rm' | 'inspect' | 'prune'

export type DockerVolumeOptions = {
  driver?: string
  label?: string[]
  opt?: string[]
  filter?: string
  quiet?: boolean
  force?: boolean
  all?: boolean
}

export function generateDockerVolumeCommand(
  action: DockerVolumeAction,
  name: string,
  options: DockerVolumeOptions = {}
): CommandResult {
  const warnings: string[] = []

  if (action === 'create') {
    const volumeName = ensureRequired(name, '卷名称')
    const parts = ['docker volume create']
    pushOption(parts, '-d', options.driver)
    pushMultiOption(parts, '--label', options.label)
    pushMultiOption(parts, '-o', options.opt)
    parts.push(shellQuote(volumeName))
    return buildCommandResult(parts.join(' '), `创建卷 ${volumeName}`, warnings)
  }

  if (action === 'ls') {
    const parts = ['docker volume ls']
    pushOption(parts, '--filter', options.filter)
    pushFlag(parts, options.quiet, '-q')
    return buildCommandResult(parts.join(' '), '列出卷', warnings)
  }

  if (action === 'rm') {
    const volumeName = ensureRequired(name, '卷名称')
    warnings.push('删除卷前请确认数据已备份')
    return buildCommandResult(
      `docker volume rm ${shellQuote(volumeName)}`,
      `删除卷 ${volumeName}`,
      warnings
    )
  }

  if (action === 'inspect') {
    const volumeName = ensureRequired(name, '卷名称')
    return buildCommandResult(
      `docker volume inspect ${shellQuote(volumeName)}`,
      `查看卷 ${volumeName}`,
      warnings
    )
  }

  const parts = ['docker volume prune -f']
  pushFlag(parts, options.all, '-a')
  warnings.push('prune 会清理全部未使用卷')
  return buildCommandResult(parts.join(' '), '清理未使用卷', warnings)
}

export type DockerPruneOptions = {
  force?: boolean
  all?: boolean
  volumes?: boolean
  filter?: string
}

export function generateDockerPruneCommand(options: DockerPruneOptions = {}): CommandResult {
  const parts = ['docker system prune']
  const warnings = ['该命令会清理未使用资源，请确认当前宿主机没有待保留对象']

  pushFlag(parts, options.force, '-f')
  pushFlag(parts, options.all, '-a')
  pushFlag(parts, options.volumes, '--volumes')
  pushOption(parts, '--filter', options.filter)

  return buildCommandResult(parts.join(' '), '清理 Docker 系统资源', warnings)
}

export type DockerCpOptions = {
  archive?: boolean
  followLink?: boolean
}

export function generateDockerCpCommand(
  source: string,
  dest: string,
  options: DockerCpOptions = {}
): CommandResult {
  const from = ensureRequired(source, '源路径')
  const to = ensureRequired(dest, '目标路径')
  const parts = ['docker cp']
  const warnings: string[] = []

  pushFlag(parts, options.archive, '-a')
  pushFlag(parts, options.followLink, '-L')
  parts.push(shellQuote(from), shellQuote(to))

  if (!from.includes(':') && to.includes(':')) {
    warnings.push('正在复制到容器，请确认目标目录权限')
  } else if (from.includes(':') && !to.includes(':')) {
    warnings.push('正在从容器导出文件，请确认宿主机目标路径存在')
  }

  return buildCommandResult(parts.join(' '), '复制容器与宿主机文件', warnings)
}

export function getDockerCommandTemplates(): TemplateCommand[] {
  return [
    {
      name: '运行 Nginx',
      command: 'docker run -d --name nginx -p 80:80 nginx:alpine',
      description: '启动一个轻量 Nginx 容器',
      category: '常用服务'
    },
    {
      name: '运行 Redis',
      command: 'docker run -d --name redis -p 6379:6379 redis:alpine',
      description: '启动 Redis 服务',
      category: '常用服务'
    },
    {
      name: '进入容器 Shell',
      command: 'docker exec -it CONTAINER /bin/sh',
      description: '以交互方式进入容器',
      category: '调试'
    },
    {
      name: '实时查看日志',
      command: 'docker logs -f --tail 100 CONTAINER',
      description: '跟随查看最近 100 行日志',
      category: '调试'
    },
    {
      name: '清理未使用资源',
      command: 'docker system prune -f',
      description: '清理未使用的容器、网络和镜像缓存',
      category: '清理'
    }
  ]
}

export type DockerServiceCreateOptions = {
  image?: string
  name?: string
  replicas?: number
  publish?: string[]
  networks?: string[]
  endpointMode?: string
  cpuLimit?: string
  cpuReserve?: string
  memoryLimit?: string
  memoryReserve?: string
  updateParallelism?: number
  updateDelay?: string
  updateFailureAction?: string
  mounts?: string[]
}

export function generateDockerServiceCreateCommand(
  options: DockerServiceCreateOptions = {}
): CommandResult {
  const image = ensureRequired(options.image, '镜像名称')
  const name = ensureRequired(options.name, '服务名称')
  const parts = ['docker service create', `--name ${shellQuote(name)}`]

  if (options.replicas !== undefined) {
    parts.push(`--replicas ${options.replicas}`)
  }
  pushMultiOption(parts, '--publish', options.publish)
  pushMultiOption(parts, '--network', options.networks)
  pushOption(parts, '--endpoint-mode', options.endpointMode)
  pushOption(parts, '--limit-cpu', options.cpuLimit)
  pushOption(parts, '--reserve-cpu', options.cpuReserve)
  pushOption(parts, '--limit-memory', options.memoryLimit)
  pushOption(parts, '--reserve-memory', options.memoryReserve)
  if (options.updateParallelism !== undefined) {
    parts.push(`--update-parallelism ${options.updateParallelism}`)
  }
  pushOption(parts, '--update-delay', options.updateDelay)
  pushOption(parts, '--update-failure-action', options.updateFailureAction)
  pushMultiOption(parts, '--mount', options.mounts)
  parts.push(shellQuote(image))

  return buildCommandResult(parts.join(' '), `创建服务 ${name}`, [])
}

export type DockerServiceUpdateOptions = Omit<DockerServiceCreateOptions, 'name'> & {
  name?: string
}

export function generateDockerServiceUpdateCommand(
  serviceName: string,
  options: DockerServiceUpdateOptions = {}
): CommandResult {
  const name = ensureRequired(serviceName, '服务名称')
  const parts = ['docker service update']
  const warnings: string[] = []

  pushOption(parts, '--image', options.image)
  if (options.replicas !== undefined) {
    parts.push(`--replicas ${options.replicas}`)
  }
  pushMultiOption(parts, '--publish-add', options.publish)
  pushMultiOption(parts, '--network-add', options.networks)
  pushOption(parts, '--endpoint-mode', options.endpointMode)
  pushOption(parts, '--limit-cpu', options.cpuLimit)
  pushOption(parts, '--reserve-cpu', options.cpuReserve)
  pushOption(parts, '--limit-memory', options.memoryLimit)
  pushOption(parts, '--reserve-memory', options.memoryReserve)
  if (options.updateParallelism !== undefined) {
    parts.push(`--update-parallelism ${options.updateParallelism}`)
  }
  pushOption(parts, '--update-delay', options.updateDelay)
  pushOption(parts, '--update-failure-action', options.updateFailureAction)
  pushMultiOption(parts, '--mount-add', options.mounts)
  parts.push(shellQuote(name))

  warnings.push('update 只会追加 publish/network/mount，不会自动移除旧配置')
  return buildCommandResult(parts.join(' '), `更新服务 ${name}`, warnings)
}

export function generateDockerServiceScaleCommand(
  serviceName: string,
  replicas: number | string
): CommandResult {
  const name = ensureRequired(serviceName, '服务名称')
  const replicaText = ensureRequired(String(replicas ?? ''), '副本数量')
  return buildCommandResult(
    `docker service scale ${shellQuote(name)}=${replicaText}`,
    `调整服务 ${name} 副本数`,
    []
  )
}

export type DockerServiceLogsOptions = {
  follow?: boolean
  timestamps?: boolean
  tail?: number
}

export function generateDockerServiceLogsCommand(
  serviceName: string,
  options: DockerServiceLogsOptions = {}
): CommandResult {
  const name = ensureRequired(serviceName, '服务名称')
  const parts = ['docker service logs']
  pushFlag(parts, options.follow, '--follow')
  pushFlag(parts, options.timestamps, '--timestamps')
  if (options.tail !== undefined) {
    parts.push(`--tail ${options.tail}`)
  }
  parts.push(shellQuote(name))
  return buildCommandResult(parts.join(' '), `查看服务 ${name} 日志`, [])
}

export function generateDockerServicePsCommand(serviceName: string): CommandResult {
  const name = ensureRequired(serviceName, '服务名称')
  return buildCommandResult(`docker service ps ${shellQuote(name)}`, `查看服务 ${name} 任务`, [])
}

export function generateDockerServiceLsCommand(): CommandResult {
  return buildCommandResult('docker service ls', '列出所有服务', [])
}

export function generateDockerServiceRmCommand(serviceNames: string[]): CommandResult {
  if (!serviceNames.length) {
    throw new Error('至少提供一个服务名称')
  }
  const warnings = ['移除 service 不会自动清理对应镜像和卷']
  return buildCommandResult(
    ['docker service rm', ...serviceNames.map((item) => shellQuote(item))].join(' '),
    withCountDescription('删除 Docker Service', serviceNames.length, '服务'),
    warnings
  )
}

export type DockerSwarmInitOptions = {
  advertiseAddr?: string
  listenAddr?: string
  forceNewCluster?: boolean
}

export function generateDockerSwarmInitCommand(
  options: DockerSwarmInitOptions = {}
): CommandResult {
  const parts = ['docker swarm init']
  const warnings: string[] = []
  pushOption(parts, '--advertise-addr', options.advertiseAddr)
  pushOption(parts, '--listen-addr', options.listenAddr)
  if (options.forceNewCluster) {
    parts.push('--force-new-cluster')
    warnings.push('force-new-cluster 会尝试把当前节点提升为新集群根节点')
  }
  return buildCommandResult(parts.join(' '), '初始化 Swarm 集群', warnings)
}

export type DockerSwarmJoinOptions = {
  token?: string
  advertiseAddr?: string
  listenAddr?: string
}

export function generateDockerSwarmJoinCommand(
  addr: string,
  options: DockerSwarmJoinOptions = {}
): CommandResult {
  const managerAddr = ensureRequired(addr, 'Manager 地址')
  const token = ensureRequired(options.token, 'Join Token')
  const parts = ['docker swarm join', `--token ${shellQuote(token)}`]
  pushOption(parts, '--advertise-addr', options.advertiseAddr)
  pushOption(parts, '--listen-addr', options.listenAddr)
  parts.push(shellQuote(managerAddr))
  return buildCommandResult(parts.join(' '), '加入 Swarm 集群', [])
}

export type DockerSwarmLeaveOptions = {
  force?: boolean
}

export function generateDockerSwarmLeaveCommand(
  options: DockerSwarmLeaveOptions = {}
): CommandResult {
  const warnings: string[] = []
  const parts = ['docker swarm leave']
  if (options.force) {
    parts.push('--force')
    warnings.push('force leave 可能让 manager 节点直接退出，需确认仲裁状态')
  }
  return buildCommandResult(parts.join(' '), '离开 Swarm 集群', warnings)
}

export type DockerSwarmUpdateOptions = {
  autolock?: boolean | null
  certExpiry?: string
  dispatcherHeartbeat?: string
}

export function generateDockerSwarmUpdateCommand(
  options: DockerSwarmUpdateOptions = {}
): CommandResult {
  const parts = ['docker swarm update']
  if (options.autolock === true) {
    parts.push('--autolock=true')
  } else if (options.autolock === false) {
    parts.push('--autolock=false')
  }
  pushOption(parts, '--cert-expiry', options.certExpiry)
  pushOption(parts, '--dispatcher-heartbeat', options.dispatcherHeartbeat)
  return buildCommandResult(parts.join(' '), '更新 Swarm 配置', [])
}

export function generateDockerSwarmUnlockCommand(): CommandResult {
  return buildCommandResult('docker swarm unlock', '解锁 Swarm 集群', [
    '执行时仍需交互输入 unlock key'
  ])
}

export type DockerStackDeployOptions = {
  composeFiles?: string[]
  withRegistryAuth?: boolean
  prune?: boolean
  resolveImage?: string
}

export function generateDockerStackDeployCommand(
  stackName: string,
  options: DockerStackDeployOptions = {}
): CommandResult {
  const name = ensureRequired(stackName, 'Stack 名称')
  const parts = ['docker stack deploy']
  const warnings: string[] = []

  if (!options.composeFiles?.length) {
    throw new Error('至少提供一个 compose 文件')
  }

  options.composeFiles.forEach((file) => parts.push(`-c ${shellQuote(file)}`))
  pushFlag(parts, options.withRegistryAuth, '--with-registry-auth')
  if (options.prune) {
    parts.push('--prune')
    warnings.push('prune 会移除当前 stack 中已经不存在于 compose 文件里的服务')
  }
  if (options.resolveImage?.trim() && options.resolveImage.trim() !== 'always') {
    parts.push(`--resolve-image ${shellQuote(options.resolveImage.trim())}`)
  }
  parts.push(shellQuote(name))

  return buildCommandResult(parts.join(' '), `部署 Stack ${name}`, warnings)
}

export function generateDockerStackLsCommand(): CommandResult {
  return buildCommandResult('docker stack ls', '列出 Stack', [])
}

export function generateDockerStackPsCommand(stackName: string): CommandResult {
  const name = ensureRequired(stackName, 'Stack 名称')
  return buildCommandResult(`docker stack ps ${shellQuote(name)}`, `查看 Stack ${name} 任务`, [])
}

export function generateDockerStackServicesCommand(stackName: string): CommandResult {
  const name = ensureRequired(stackName, 'Stack 名称')
  return buildCommandResult(
    `docker stack services ${shellQuote(name)}`,
    `查看 Stack ${name} 服务`,
    []
  )
}

export function generateDockerStackRmCommand(stackNames: string[]): CommandResult {
  if (!stackNames.length) {
    throw new Error('至少提供一个 Stack 名称')
  }
  const warnings = ['rm 只移除 Stack 资源定义，不会删除所有宿主机残留文件']
  return buildCommandResult(
    ['docker stack rm', ...stackNames.map((item) => shellQuote(item))].join(' '),
    withCountDescription('移除 Stack', stackNames.length, 'Stack'),
    warnings
  )
}

type NginxValidationMap = Record<string, string>

const NGINX_REGEX: NginxValidationMap = {
  serverName: '^[a-zA-Z0-9._*-]+$',
  upstreamName: '^[a-zA-Z_][a-zA-Z0-9_]*$',
  zoneName: '^[a-zA-Z_][a-zA-Z0-9_]*$',
  origin: '^(\\*|https?://[a-zA-Z0-9._:-]+)$',
  methods: '^[A-Z, ]+$',
  path: '^[a-zA-Z0-9./_-]+$',
  url: '^https?://[a-zA-Z0-9._:-]+[a-zA-Z0-9./_:-]*$',
  serverList: '^[a-zA-Z0-9._:-]+(,[a-zA-Z0-9._:-]+)*$'
}

function containsDangerousChars(value: string): boolean {
  return /[\r\n;`${}]/.test(value)
}

function validateByPattern(
  value: string,
  patternKey: keyof typeof NGINX_REGEX,
  displayName: string
): string | null {
  if (!value.trim()) return null
  if (containsDangerousChars(value)) {
    return `${displayName} 包含危险字符`
  }
  const regexp = new RegExp(NGINX_REGEX[patternKey])
  return regexp.test(value) ? null : `${displayName} 格式无效`
}

function validatePort(value: string, displayName: string): string | null {
  if (!value.trim()) return null
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 65535
    ? null
    : `${displayName} 必须在 1-65535 之间`
}

function validatePositiveInt(value: string, displayName: string): string | null {
  if (!value.trim()) return null
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? null : `${displayName} 必须是正整数`
}

function normalizeNginxBoolean(value: string): boolean {
  return value === 'true'
}

function buildNginxServerHeader(serverName: string, listenPort: string): string[] {
  return [
    'server {',
    `    listen ${listenPort || '80'};`,
    `    server_name ${serverName || 'example.com'};`
  ]
}

export function generateNginxConfig(
  template: NginxTemplateKey,
  baseOptions: Record<string, string>
): NginxGeneratedResult {
  const serverName = String(baseOptions.serverName ?? '').trim()
  const listenPort = String(baseOptions.listenPort ?? '').trim()
  const warnings: string[] = []
  const errors = [
    validateByPattern(serverName, 'serverName', 'server_name'),
    validatePort(listenPort, '监听端口')
  ].filter(Boolean) as string[]

  const opts = Object.fromEntries(
    Object.entries(baseOptions).map(([key, value]) => [key, String(value ?? '').trim()])
  )

  if (template === 'reverseProxy') {
    errors.push(
      ...([
        validateByPattern(opts.proxyPass || '', 'url', '代理地址'),
        validatePositiveInt(opts.proxyTimeout || '', '超时时间')
      ].filter(Boolean) as string[])
    )
    if (errors.length) {
      return { config: '', summary: '', warnings: [], error: errors.join('；') }
    }
    const lines = buildNginxServerHeader(serverName, listenPort)
    lines.push('', '    location / {')
    lines.push(`        proxy_pass ${opts.proxyPass || 'http://127.0.0.1:8080'};`)
    lines.push('        proxy_http_version 1.1;')
    lines.push('        proxy_set_header Host $host;')
    lines.push('        proxy_set_header X-Real-IP $remote_addr;')
    lines.push('        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;')
    lines.push('        proxy_set_header X-Forwarded-Proto $scheme;')
    if (opts.proxyTimeout) {
      lines.push(`        proxy_connect_timeout ${opts.proxyTimeout}s;`)
      lines.push(`        proxy_send_timeout ${opts.proxyTimeout}s;`)
      lines.push(`        proxy_read_timeout ${opts.proxyTimeout}s;`)
    }
    if (normalizeNginxBoolean(opts.websocket || 'false')) {
      lines.push('        proxy_set_header Upgrade $http_upgrade;')
      lines.push('        proxy_set_header Connection "upgrade";')
    }
    lines.push('    }', '}')
    return {
      config: lines.join('\n'),
      summary: '生成反向代理模板',
      warnings
    }
  }

  if (template === 'staticSite') {
    errors.push(
      ...([
        validateByPattern(opts.rootPath || '', 'path', '站点根目录'),
        validateByPattern(opts.indexFile || '', 'path', '首页文件')
      ].filter(Boolean) as string[])
    )
    if (errors.length) {
      return { config: '', summary: '', warnings: [], error: errors.join('；') }
    }
    const lines = buildNginxServerHeader(serverName, listenPort)
    lines.push(`    root ${opts.rootPath || '/var/www/html'};`)
    lines.push(`    index ${opts.indexFile || 'index.html'};`)
    if (normalizeNginxBoolean(opts.gzip || 'false')) {
      lines.push('', '    gzip on;')
      lines.push('    gzip_vary on;')
      lines.push('    gzip_min_length 1024;')
      lines.push(
        '    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;'
      )
    }
    if (normalizeNginxBoolean(opts.cacheControl || 'false')) {
      lines.push('', '    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {')
      lines.push('        expires 30d;')
      lines.push('        add_header Cache-Control "public, immutable";')
      lines.push('    }')
    }
    lines.push('', '    location / {')
    lines.push('        try_files $uri $uri/ =404;')
    lines.push('    }', '}')
    return {
      config: lines.join('\n'),
      summary: '生成静态站点模板',
      warnings
    }
  }

  if (template === 'spa') {
    errors.push(
      ...([validateByPattern(opts.rootPath || '', 'path', '前端产物目录')].filter(
        Boolean
      ) as string[])
    )
    if (errors.length) {
      return { config: '', summary: '', warnings: [], error: errors.join('；') }
    }
    return {
      config: [
        ...buildNginxServerHeader(serverName, listenPort),
        `    root ${opts.rootPath || '/var/www/html'};`,
        '    index index.html;',
        '',
        '    gzip on;',
        '    gzip_vary on;',
        '    gzip_min_length 1024;',
        '    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;',
        '',
        '    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {',
        '        expires 30d;',
        '        add_header Cache-Control "public, immutable";',
        '    }',
        '',
        '    location / {',
        '        try_files $uri $uri/ /index.html;',
        '    }',
        '}'
      ].join('\n'),
      summary: '生成 SPA 模板',
      warnings: ['SPA 回退规则会把未知路径回退到 index.html']
    }
  }

  if (template === 'ssl') {
    errors.push(
      ...([
        validateByPattern(opts.sslCert || '', 'path', '证书路径'),
        validateByPattern(opts.sslKey || '', 'path', '私钥路径'),
        validateByPattern(opts.rootPath || '', 'path', '站点根目录')
      ].filter(Boolean) as string[])
    )
    if (errors.length) {
      return { config: '', summary: '', warnings: [], error: errors.join('；') }
    }
    return {
      config: [
        '# HTTP -> HTTPS 重定向',
        'server {',
        '    listen 80;',
        `    server_name ${serverName || 'example.com'};`,
        '    return 301 https://$server_name$request_uri;',
        '}',
        '',
        'server {',
        '    listen 443 ssl http2;',
        `    server_name ${serverName || 'example.com'};`,
        '',
        `    ssl_certificate ${opts.sslCert || '/etc/nginx/ssl/cert.pem'};`,
        `    ssl_certificate_key ${opts.sslKey || '/etc/nginx/ssl/key.pem'};`,
        '    ssl_protocols TLSv1.2 TLSv1.3;',
        '    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;',
        '    ssl_prefer_server_ciphers on;',
        '    ssl_session_cache shared:SSL:10m;',
        '    ssl_session_timeout 10m;',
        ...(normalizeNginxBoolean(opts.hsts || 'false')
          ? [
              '',
              '    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;'
            ]
          : []),
        '',
        `    root ${opts.rootPath || '/var/www/html'};`,
        '    index index.html;',
        '',
        '    location / {',
        '        try_files $uri $uri/ =404;',
        '    }',
        '}'
      ].join('\n'),
      summary: '生成 SSL/HTTPS 模板',
      warnings: normalizeNginxBoolean(opts.hsts || 'false')
        ? ['启用 HSTS 后，浏览器会在一段时间内强制走 HTTPS']
        : warnings
    }
  }

  if (template === 'loadBalance') {
    errors.push(
      ...([
        validateByPattern(opts.upstreamName || '', 'upstreamName', 'Upstream 名称'),
        validateByPattern(opts.servers || '', 'serverList', '后端服务器列表')
      ].filter(Boolean) as string[])
    )
    if (errors.length) {
      return { config: '', summary: '', warnings: [], error: errors.join('；') }
    }
    const servers = parseCommaSeparated(opts.servers || '127.0.0.1:8001,127.0.0.1:8002')
    const upstreamName = opts.upstreamName || 'backend'
    return {
      config: [
        `upstream ${upstreamName} {`,
        ...(opts.algorithm === 'ip_hash' ? ['    ip_hash;'] : []),
        ...(opts.algorithm === 'least_conn' ? ['    least_conn;'] : []),
        ...servers.map((server) => `    server ${server};`),
        '}',
        '',
        ...buildNginxServerHeader(serverName, listenPort),
        '',
        '    location / {',
        `        proxy_pass http://${upstreamName};`,
        '        proxy_http_version 1.1;',
        '        proxy_set_header Host $host;',
        '        proxy_set_header X-Real-IP $remote_addr;',
        '        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;',
        '    }',
        '}'
      ].join('\n'),
      summary: '生成负载均衡模板',
      warnings: [`后端节点数：${servers.length}`]
    }
  }

  if (template === 'rateLimit') {
    errors.push(
      ...([
        validateByPattern(opts.zoneName || '', 'zoneName', 'Zone 名称'),
        validatePositiveInt(opts.rateLimit || '', '限流速率'),
        validatePositiveInt(opts.burstLimit || '', '突发上限')
      ].filter(Boolean) as string[])
    )
    if (errors.length) {
      return { config: '', summary: '', warnings: [], error: errors.join('；') }
    }
    const zoneName = opts.zoneName || 'api_limit'
    return {
      config: [
        `limit_req_zone $binary_remote_addr zone=${zoneName}:10m rate=${opts.rateLimit || '10'}r/s;`,
        '',
        ...buildNginxServerHeader(serverName, listenPort),
        '',
        '    location /api/ {',
        `        limit_req zone=${zoneName} burst=${opts.burstLimit || '20'} nodelay;`,
        '        limit_req_status 429;',
        '        error_page 429 = @too_many_requests;',
        '        proxy_pass http://127.0.0.1:8080;',
        '    }',
        '',
        '    location @too_many_requests {',
        '        default_type application/json;',
        `        return 429 '{"error":"Too Many Requests"}';`,
        '    }',
        '}'
      ].join('\n'),
      summary: '生成限流模板',
      warnings: ['limit_req_zone 通常放在 http 块，集成时请确认插入位置']
    }
  }

  if (template === 'cors') {
    errors.push(
      ...([
        validateByPattern(opts.allowOrigin || '', 'origin', '允许来源'),
        validateByPattern(opts.allowMethods || '', 'methods', '允许方法')
      ].filter(Boolean) as string[])
    )
    if (errors.length) {
      return { config: '', summary: '', warnings: [], error: errors.join('；') }
    }
    return {
      config: [
        ...buildNginxServerHeader(serverName, listenPort),
        '',
        `    add_header Access-Control-Allow-Origin "${opts.allowOrigin || '*'}";`,
        `    add_header Access-Control-Allow-Methods "${opts.allowMethods || 'GET, POST, PUT, DELETE, OPTIONS'}";`,
        '    add_header Access-Control-Allow-Headers "Content-Type, Authorization, X-Requested-With";',
        '    add_header Access-Control-Max-Age 86400;',
        '',
        "    if ($request_method = 'OPTIONS') {",
        '        return 204;',
        '    }',
        '',
        '    location / {',
        '        proxy_pass http://127.0.0.1:8080;',
        '    }',
        '}'
      ].join('\n'),
      summary: '生成 CORS 模板',
      warnings: opts.allowOrigin === '*' ? ['生产环境请确认是否允许所有来源'] : warnings
    }
  }

  if (template === 'fileUpload') {
    errors.push(
      ...([
        validatePositiveInt(opts.maxBodySize || '', '最大上传大小'),
        validateByPattern(opts.uploadPath || '', 'path', '上传路径')
      ].filter(Boolean) as string[])
    )
    if (errors.length) {
      return { config: '', summary: '', warnings: [], error: errors.join('；') }
    }
    return {
      config: [
        ...buildNginxServerHeader(serverName, listenPort),
        '',
        `    client_max_body_size ${opts.maxBodySize || '100'}m;`,
        '    client_body_buffer_size 10m;',
        '    client_body_timeout 300s;',
        '',
        `    location ${opts.uploadPath || '/upload'} {`,
        '        proxy_pass http://127.0.0.1:8080;',
        '        proxy_request_buffering off;',
        '        proxy_read_timeout 300s;',
        '    }',
        '}'
      ].join('\n'),
      summary: '生成文件上传模板',
      warnings: ['大文件上传通常还需要同步调整应用层超时和磁盘空间']
    }
  }

  return {
    config: '',
    summary: '',
    warnings: [],
    error: `未知模板：${template}`
  }
}

export function validateNginxConfig(config: string): string[] {
  const warnings: string[] = []
  const text = config.trim()
  if (!text) {
    warnings.push('配置为空')
    return warnings
  }

  const opening = (text.match(/{/g) || []).length
  const closing = (text.match(/}/g) || []).length
  if (opening !== closing) {
    warnings.push('花括号数量不平衡，请检查 server/location/upstream 块是否闭合')
  }
  if (
    !/server\s*{/.test(text) &&
    !/limit_req_zone/.test(text) &&
    !/upstream\s+\w+\s*{/.test(text)
  ) {
    warnings.push('配置片段里没有找到明显的 server/upstream/http 级指令')
  }
  if (/proxy_pass\s+http:\/\/127\.0\.0\.1:8080/.test(text)) {
    warnings.push('仍在使用默认后端地址，请确认是否需要替换')
  }
  return warnings
}
