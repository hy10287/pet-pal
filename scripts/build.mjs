import { mkdirSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { build } from "esbuild";
import { deflateSync } from "node:zlib";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

execSync("npx tsc -p tsconfig.json", { cwd: root, stdio: "inherit" });

await build({
  entryPoints: [join(root, "src/renderer/pet.ts")],
  bundle: true,
  outfile: join(root, "dist/renderer/pet.js"),
  platform: "browser",
  format: "iife",
  target: "es2020",
  sourcemap: true,
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "info",
});

mkdirSync(join(root, "dist/renderer"), { recursive: true });
copyFileSync(join(root, "src/renderer/pet.html"), join(root, "dist/renderer/pet.html"));
copyFileSync(join(root, "src/renderer/pet.css"), join(root, "dist/renderer/pet.css"));

writePngIcon(join(root, "assets/icon.png"));

function writePngIcon(path) {
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path)) return;
  const size = 32;
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = x - 16;
      const dy = y - 16;
      const inside = dx * dx + dy * dy <= 14 * 14;
      const i = (y * size + x) * 4;
      if (inside) {
        pixels[i] = 79;
        pixels[i + 1] = 214;
        pixels[i + 2] = 192;
        pixels[i + 3] = 255;
      }
    }
  }
  writeFileSync(path, encodePng(size, size, pixels));
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const chunks = [
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ];
  return Buffer.concat(chunks);
}

function chunk(type, data) {
  const name = Buffer.from(type);
  const payload = Buffer.concat([name, data]);
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  payload.copy(out, 4);
  out.writeUInt32BE(crc32(payload), 8 + data.length);
  return out;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
