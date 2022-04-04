const { build } = require('esbuild');
const path = require('path');

function productionEnabled() {
  return process.argv.length > 2 && process.argv[2] === 'production';
}

function watchEnabled() {
  return process.argv.length > 3 && process.argv[3] == 'watch';
}

(async () => {
  const browserOptions = {
    entryPoints: [
      path.resolve(__dirname, 'src/index.ts'),
      path.resolve(__dirname, 'src/player/video/decoderWorker/worker.ts'),
      path.resolve(__dirname, 'src/player/audio/decoderWorker/worker.ts'),
      path.resolve(__dirname, 'src/player/audio/rendererWorker/worker.ts'),
      path.resolve(__dirname, 'src/media/format/demuxerMP4Box.ts'),
      path.resolve(__dirname, 'src/media/codec/decoderWebCodecs.ts'),
    ],
    minify: productionEnabled(),
    bundle: true,
    watch: !watchEnabled()
      ? false
      : {
          onRebuild(error, result) {
            if (error) console.error('[esbuild-browser] Watch build failed:', error);
            else console.log('[esbuild-browser] Watch build succeeded:', result);
          },
        },
    target: 'es2020',
    platform: 'browser',
    format: 'esm',
    outdir: path.resolve(__dirname, 'public'),
    tsconfig: path.resolve(__dirname, 'src/tsconfig.json'),
  };
  await build(browserOptions);

  if (browserOptions.watch) {
    console.log('[esbuild-browser] Watching for browser bundling...');
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
