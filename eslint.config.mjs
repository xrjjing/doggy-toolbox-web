import prettier from '@electron-toolkit/eslint-config-prettier'
import vue from 'eslint-plugin-vue'
import vueTs from '@vue/eslint-config-typescript'

export default [
  {
    ignores: ['out', 'release', 'dist', 'node_modules']
  },
  ...vue.configs['flat/recommended'],
  ...vueTs(),
  prettier,
  {
    files: ['**/*.{ts,vue}'],
    rules: {
      'vue/multi-word-component-names': 'off'
    }
  }
]
