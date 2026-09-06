// Generates every favicon variant and the social-preview image from src/assets. Run with `npm run icons`.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = new URL('..', import.meta.url).pathname;
const asset = (f) => path.join(root, 'src/assets', f);
const out = (f) => path.join(root, 'public', f);
await mkdir(out(''), { recursive: true });

const favicon = await readFile(asset('favicon-source.svg'));
const mark = await readFile(asset('logo-dark.svg'));

// Rounded corners for the square icon so it sits well on home screens and in tab strips.
const rounded = (size, radius) =>
  Buffer.from(
    `<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" fill="#fff"/></svg>`,
  );
const square = async (size, radius = Math.round(size * 0.18)) =>
  sharp(favicon)
    .resize(size, size)
    .composite([{ input: rounded(size, radius), blend: 'dest-in' }])
    .png()
    .toBuffer();

const png = {};
for (const size of [16, 32, 48, 180, 192, 512])
  png[size] = await square(size, size <= 48 ? Math.round(size * 0.22) : undefined);

await writeFile(out('favicon.svg'), favicon);
await writeFile(out('favicon-16x16.png'), png[16]);
await writeFile(out('favicon-32x32.png'), png[32]);
await writeFile(out('apple-touch-icon.png'), await square(180, 0));
await writeFile(out('android-chrome-192x192.png'), png[192]);
await writeFile(out('android-chrome-512x512.png'), png[512]);

// favicon.ico: an ICO container holding the 16, 32 and 48 px PNGs.
const entries = [16, 32, 48].map((s) => png[s]);
const header = Buffer.alloc(6 + 16 * entries.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(entries.length, 4);
let offset = header.length;
entries.forEach((buf, i) => {
  const size = [16, 32, 48][i];
  const o = 6 + i * 16;
  header.writeUInt8(size, o);
  header.writeUInt8(size, o + 1);
  header.writeUInt8(0, o + 2);
  header.writeUInt8(0, o + 3);
  header.writeUInt16LE(1, o + 4);
  header.writeUInt16LE(32, o + 6);
  header.writeUInt32LE(buf.length, o + 8);
  header.writeUInt32LE(offset, o + 12);
  offset += buf.length;
});
await writeFile(out('favicon.ico'), Buffer.concat([header, ...entries]));

await writeFile(
  out('site.webmanifest'),
  `${JSON.stringify(
    {
      name: 'sigmx',
      short_name: 'sigmx',
      icons: [
        { src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
        { src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
      ],
      theme_color: '#23262f',
      background_color: '#23262f',
      display: 'standalone',
    },
    null,
    2,
  )}\n`,
);

// Social preview: the mark and the wordmark on the brand background, 1200 × 630.
const markPng = await sharp(mark).resize({ height: 300 }).png().toBuffer();
const markWidth = (await sharp(markPng).metadata()).width;
const text = Buffer.from(`<svg width="1200" height="630">
  <style>
    .word { font: 700 150px 'IBM Plex Sans', 'Helvetica Neue', Arial, sans-serif; fill: #fff; letter-spacing: -6px; }
    .line { font: 400 40px 'IBM Plex Sans', 'Helvetica Neue', Arial, sans-serif; fill: #b6bcc9; }
  </style>
  <text x="${140 + markWidth + 50}" y="330" class="word">sigmx</text>
  <text x="140" y="500" class="line">The power of a modern framework,</text>
  <text x="140" y="552" class="line">in a runtime the browser barely notices.</text>
</svg>`);
await sharp({ create: { width: 1200, height: 630, channels: 4, background: '#23262f' } })
  .composite([
    { input: markPng, left: 140, top: 100 },
    { input: text, left: 0, top: 0 },
  ])
  .png()
  .toFile(out('og.png'));
console.log('icons written to public/');
