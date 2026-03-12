import { build, context } from 'esbuild';
import { copyFileSync, mkdirSync, readFileSync } from 'fs';
import sharp from 'sharp';

const isWatch = process.argv.includes('--watch');

mkdirSync('dist', { recursive: true });
mkdirSync('dist/icons', { recursive: true });

// Fichiers statiques
copyFileSync('manifest.json', 'dist/manifest.json');
copyFileSync('content.css', 'dist/content.css');
copyFileSync('src/popup.html', 'dist/popup.html');

// Icônes PNG depuis le SVG source
const svgContent = readFileSync('src/icons/icon.svg');
for (const size of [16, 48, 128]) {
  await sharp(svgContent).resize(size, size).png().toFile(`dist/icons/icon${size}.png`);
}
console.log('🖼️  Icônes générées → dist/icons/');

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
  console.log('👀  Watch mode actif...');
} else {
  await build(buildOptions);
  console.log('✅  Build terminé → dist/');
}
