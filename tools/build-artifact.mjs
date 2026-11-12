// Bouwt één zelfstandige pagina (CSS + JS inline) om als Claude-artifact te publiceren.
// Gebruik: node tools/build-artifact.mjs <pad-naar-esbuild-binary> <uitvoermap>
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const [esbuild, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const js = execFileSync(esbuild, [path.join(root, 'js/main.js'), '--bundle', '--format=iife', '--minify-whitespace', '--target=es2020'], { maxBuffer: 1 << 26 }).toString();
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script type="module"'));
const page = `<title>Watt Blitz</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
${css}
</style>
${body}
<script>
${js.replace(/<\/script/gi, '<\\/script')}
</script>
`;
fs.writeFileSync(path.join(out, 'watt-blitz.html'), page);
console.log(`watt-blitz.html: ${(page.length / 1024).toFixed(0)} kB`);
