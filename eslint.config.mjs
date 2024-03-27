import antfu from '@antfu/eslint-config'

export default antfu(
  {
    ignores: [
      'tests/__fixtures__/**',
    ],
  }
)
