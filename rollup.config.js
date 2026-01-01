import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';

export default [
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.js',
      format: 'es',
    },
    plugins: [resolve(), typescript({ declaration: true, declarationDir: 'dist' })],
    external: ['commander', 'glob', 'fs', 'path', 'child_process', 'url'],
  },
  {
    input: 'src/cli.ts',
    output: {
      file: 'dist/cli.js',
      format: 'es',
      banner: '#!/usr/bin/env node',
    },
    plugins: [resolve(), typescript()],
    external: ['commander', 'glob', 'fs', 'path', 'child_process', 'url'],
  },
];
