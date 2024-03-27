import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  entries: [
    'src/index.ts',
  ],
  rollup: {
    emitCJS: true,
    inlineDependencies: true,
  },
  declaration: true,
  externals: [
    'json-schema',
  ],
})
