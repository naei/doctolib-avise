import { build, context } from 'esbuild';
import { copyFileSync, cpSync, mkdirSync, readFileSync } from 'fs';
import sharp from 'sharp';

const isWatch = process.argv.includes('--watch');

mkdirSync('dist', { recursive: true });
mkdirSync('dist/icons', { recursive: true });

// Static files
copyFileSync('manifest.json', 'dist/manifest.json');
copyFileSync('content.css', 'dist/content.css');
copyFileSync('src/popup.html', 'dist/popup.html');
cpSync('src/_locales', 'dist/_locales', { recursive: true });

// PNG icons from the source SVG
const svgContent = readFileSync('src/icons/icon.svg');
for (const size of [16, 48, 128]) {
  await sharp(svgContent).resize(size, size).png().toFile(`dist/icons/icon${size}.png`);
}
console.log('🖼️  Icons generated → dist/icons/');

const buildOptions = {
  entryPoints: [
    { in: 'src/background.js', out: 'background' },
    { in: 'src/popup.js',      out: 'popup' },
    { in: 'content.js',        out: 'content' },
  ],
  bundle: false,
  minify: true,
  outdir: 'dist',
};

if (isWatch) {
  const ctx = await context(buildOptions);
  await ctx.watch();
  console.log('👀  Watch mode active...');
} else {
  await build(buildOptions);
  console.log('✅  Build done → dist/');
}
