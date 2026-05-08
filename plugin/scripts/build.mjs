import { rollup } from 'rollup';
import config from '../rollup.config.mjs';

const configs = Array.isArray(config) ? config : [config];

try {
  for (const item of configs) {
    const { output, ...inputOptions } = item;
    const bundle = await rollup(inputOptions);
    try {
      const outputs = Array.isArray(output) ? output : [output];
      for (const outputOptions of outputs) {
        await bundle.write(outputOptions);
      }
    } finally {
      await bundle.close();
    }
  }
} catch (err) {
  console.error(err);
  process.exit(1);
}

process.exit(0);
