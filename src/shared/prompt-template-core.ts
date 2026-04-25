import type { PromptVariable } from './ipc-contract'

const VARIABLE_PATTERN = /\{\{(\w+)(?::([^}|]+))?(?:\|([^}]+))?\}\}/g

export function parsePromptVariables(content: string): PromptVariable[] {
  const variables: PromptVariable[] = []
  const seen = new Set<string>()
  const pattern = new RegExp(VARIABLE_PATTERN)

  for (const match of String(content ?? '').matchAll(pattern)) {
    const name = match[1]
    if (seen.has(name)) continue
    seen.add(name)

    const defaultValue = match[2] ?? ''
    const options =
      match[3]
        ?.split('|')
        .map((option) => option.trim())
        .filter(Boolean) ?? []

    variables.push({
      name,
      type: options.length > 0 ? 'select' : 'text',
      defaultValue: defaultValue || options[0] || '',
      options
    })
  }

  return variables
}

export function fillPromptTemplate(content: string, values: Record<string, string> = {}): string {
  return String(content ?? '').replace(
    VARIABLE_PATTERN,
    (_full, name: string, defaultValue = '', optionsText = '') => {
      if (Object.prototype.hasOwnProperty.call(values, name)) {
        return values[name]
      }

      const options = String(optionsText)
        .split('|')
        .map((option) => option.trim())
        .filter(Boolean)

      return options[0] || defaultValue || ''
    }
  )
}
