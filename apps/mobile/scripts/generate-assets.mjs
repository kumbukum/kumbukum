import { mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mark = await readFile(resolve(root, "../../public/images/streamient-icon.svg"));
const background = "#fff6df";

async function render(output, width, height, markSize, transparent = false) {
	await mkdir(dirname(output), { recursive: true });
	const logo = await sharp(mark).resize(markSize, markSize, { fit: "contain" }).png().toBuffer();
	const image = sharp({ create: { width, height, channels: 4, background: transparent ? { alpha: 0, b: 0, g: 0, r: 0 } : background } }).composite([{ input: logo, left: Math.round((width - markSize) / 2), top: Math.round((height - markSize) / 2) }]);
	if (!transparent) image.removeAlpha();
	await image.png().toFile(output);
}

await render(resolve(root, "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"), 1024, 1024, 760);
for (const name of ["splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"]) await render(resolve(root, `ios/App/App/Assets.xcassets/Splash.imageset/${name}`), 2732, 2732, 560);

const legacyIcons = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const adaptiveIcons = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };
for (const [density, size] of Object.entries(legacyIcons)) {
	await render(resolve(root, `android/app/src/main/res/mipmap-${density}/ic_launcher.png`), size, size, Math.round(size * 0.64));
	await render(resolve(root, `android/app/src/main/res/mipmap-${density}/ic_launcher_round.png`), size, size, Math.round(size * 0.64));
}
for (const [density, size] of Object.entries(adaptiveIcons)) await render(resolve(root, `android/app/src/main/res/mipmap-${density}/ic_launcher_foreground.png`), size, size, Math.round(size * 0.48), true);

const splashes = {
	"drawable/splash.png": [480, 320],
	"drawable-land-mdpi/splash.png": [480, 320],
	"drawable-land-hdpi/splash.png": [800, 480],
	"drawable-land-xhdpi/splash.png": [1280, 720],
	"drawable-land-xxhdpi/splash.png": [1600, 960],
	"drawable-land-xxxhdpi/splash.png": [1920, 1280],
	"drawable-port-mdpi/splash.png": [320, 480],
	"drawable-port-hdpi/splash.png": [480, 800],
	"drawable-port-xhdpi/splash.png": [720, 1280],
	"drawable-port-xxhdpi/splash.png": [960, 1600],
	"drawable-port-xxxhdpi/splash.png": [1280, 1920],
};
for (const [name, [width, height]] of Object.entries(splashes)) await render(resolve(root, `android/app/src/main/res/${name}`), width, height, Math.round(Math.min(width, height) * 0.2));
