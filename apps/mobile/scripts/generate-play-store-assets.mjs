import { mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = resolve(process.env.PLAY_STORE_OUTPUT_DIR || resolve(root, "dist/play-store"));
const mark = await readFile(resolve(root, "../../public/images/streamient-icon.svg"));
const colors = { accent: "#6c7bff", accentSoft: "#eeecff", background: "#f7f7fb", border: "#e7e5ee", cream: "#fff6df", ink: "#0f0e0c", muted: "#777486", surface: "#ffffff", text: "#211f2c" };

function escapeXml(value) {
	return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function text(x, y, value, size, weight = 500, fill = colors.text, anchor = "start", letterSpacing = 0) {
	return `<text x="${x}" y="${y}" fill="${fill}" font-family="Inter, Arial, sans-serif" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" letter-spacing="${letterSpacing}">${escapeXml(value)}</text>`;
}

function rect(x, y, width, height, radius, fill, stroke = "none", strokeWidth = 0) {
	return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
}

function line(x1, y1, x2, y2, stroke, strokeWidth) {
	return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round"/>`;
}

function screenshotSvg(width, height, screen) {
	const scale = height / 1920;
	const shellWidth = Math.min(width, 1080 * scale);
	const offsetX = (width - shellWidth) / 2;
	const sx = (value) => offsetX + value * scale;
	const sy = (value) => value * scale;
	const ss = (value) => value * scale;
	const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`, rect(0, 0, width, height, 0, "#ecebf4"), rect(offsetX, 0, shellWidth, height, 0, colors.background)];
	parts.push(text(sx(48), sy(50), "9:41", ss(24), 700, colors.text));
	parts.push(rect(sx(932), sy(28), ss(90), ss(30), ss(10), colors.text), rect(sx(938), sy(34), ss(66), ss(18), ss(5), colors.cream));
	parts.push(rect(offsetX, sy(78), shellWidth, sy(104), 0, "#ffffffee"), line(offsetX, sy(182), offsetX + shellWidth, sy(182), colors.border, ss(2)));
	parts.push(rect(sx(38), sy(94), ss(72), ss(72), ss(18), colors.cream, colors.ink, ss(3)), text(sx(74), sy(145), "S", ss(42), 800, colors.accent, "middle"));
	parts.push(text(sx(138), sy(144), screen === "chat" ? "AI Chat" : screen === "search" ? "Search" : "Records", ss(34), 760));
	parts.push(rect(sx(942), sy(103), ss(58), ss(58), ss(29), colors.accent), text(sx(971), sy(143), "AR", ss(20), 750, "#ffffff", "middle"));
	if (screen === "records") parts.push(...recordScreen(sx, sy, ss));
	if (screen === "search") parts.push(...searchScreen(sx, sy, ss));
	if (screen === "chat") parts.push(...chatScreen(sx, sy, ss));
	parts.push(...bottomNav(sx, sy, ss, screen));
	parts.push("</svg>");
	return parts.join("");
}

function recordScreen(sx, sy, ss) {
	const rows = [
		{ badge: "N", color: "#6557d7", soft: "#efedff", title: "Launch positioning", copy: "Final product narrative and homepage messaging", meta: "NOTE · 12 MIN AGO" },
		{ badge: "M", color: "#9b4dc6", soft: "#f7eafa", title: "Use customer language", copy: "Prefer concrete outcomes over feature terminology", meta: "MEMORY · TODAY" },
		{ badge: "U", color: "#0c8b79", soft: "#e1f6f1", title: "Q3 research source", copy: "Competitive notes and market evidence", meta: "URL · YESTERDAY" },
		{ badge: "N", color: "#6557d7", soft: "#efedff", title: "Partner launch checklist", copy: "Owners, dates, dependencies, and open questions", meta: "NOTE · MONDAY" },
	];
	const parts = [text(sx(48), sy(250), "Records", ss(58), 780), text(sx(48), sy(296), "Product Launch · 128 records", ss(25), 520, colors.muted)];
	const chips = [{ label: "All", width: 104, active: true }, { label: "Notes", width: 132 }, { label: "Memories", width: 180 }, { label: "URLs", width: 122 }, { label: "Emails", width: 148 }];
	let chipX = 48;
	for (const chip of chips) {
		parts.push(rect(sx(chipX), sy(336), ss(chip.width), ss(64), ss(32), chip.active ? colors.accent : colors.surface, chip.active ? colors.accent : colors.border, ss(2)));
		parts.push(text(sx(chipX + chip.width / 2), sy(378), chip.label, ss(24), 680, chip.active ? "#ffffff" : colors.muted, "middle"));
		chipX += chip.width + 16;
	}
	rows.forEach((row, index) => {
		const y = 438 + index * 276;
		parts.push(rect(sx(48), sy(y), ss(984), ss(246), ss(28), colors.surface, colors.border, ss(2)));
		parts.push(rect(sx(78), sy(y + 35), ss(90), ss(90), ss(25), row.soft));
		parts.push(text(sx(123), sy(y + 96), row.badge, ss(36), 800, row.color, "middle"));
		parts.push(text(sx(198), sy(y + 76), row.title, ss(34), 740));
		parts.push(text(sx(198), sy(y + 124), row.copy, ss(25), 500, colors.muted));
		parts.push(text(sx(198), sy(y + 176), row.meta, ss(20), 700, "#9793a4", "start", ss(1.2)));
		parts.push(text(sx(982), sy(y + 132), "›", ss(54), 500, "#aaa6b4", "middle"));
	});
	return parts;
}

function searchScreen(sx, sy, ss) {
	const parts = [text(sx(48), sy(250), "Find context fast", ss(54), 780), text(sx(48), sy(296), "Search notes, memories, URLs, and emails", ss(25), 520, colors.muted)];
	parts.push(rect(sx(48), sy(336), ss(984), ss(88), ss(24), colors.surface, colors.accent, ss(3)), text(sx(88), sy(392), "⌕", ss(42), 700, colors.accent), text(sx(146), sy(392), "launch decision", ss(29), 550));
	parts.push(text(sx(48), sy(484), "12 RESULTS", ss(22), 750, colors.muted, "start", ss(1.5)));
	const results = [
		["M", "Decision: phased launch", "Start with design partners, then expand after onboarding feedback.", "MEMORY · Product Launch"],
		["N", "Launch meeting — decisions", "Public beta opens after the first ten teams complete setup.", "NOTE · Product Launch"],
		["U", "Onboarding research", "Evidence supporting a guided first-run experience.", "URL · Research"],
		["E", "Re: Launch timeline", "The partner group confirmed the September window.", "EMAIL · Product Launch"],
	];
	results.forEach((result, index) => {
		const y = 520 + index * 292;
		const palette = result[0] === "M" ? ["#9b4dc6", "#f7eafa"] : result[0] === "U" ? ["#0c8b79", "#e1f6f1"] : result[0] === "E" ? ["#d56d2c", "#fff0e5"] : ["#6557d7", "#efedff"];
		parts.push(rect(sx(48), sy(y), ss(984), ss(260), ss(28), colors.surface, colors.border, ss(2)), rect(sx(78), sy(y + 38), ss(82), ss(82), ss(23), palette[1]), text(sx(119), sy(y + 94), result[0], ss(32), 800, palette[0], "middle"));
		parts.push(text(sx(188), sy(y + 77), result[1], ss(33), 740), text(sx(188), sy(y + 125), result[2], ss(23), 500, colors.muted), text(sx(188), sy(y + 176), result[3], ss(19), 700, "#9793a4", "start", ss(1)));
		parts.push(rect(sx(188), sy(y + 202), ss(214), ss(34), ss(17), colors.accentSoft), text(sx(295), sy(y + 226), "launch decision", ss(17), 700, colors.accent, "middle"));
	});
	return parts;
}

function chatScreen(sx, sy, ss) {
	const parts = [rect(sx(352), sy(220), ss(376), ss(58), ss(29), colors.surface, colors.border, ss(2)), text(sx(540), sy(258), "All projects", ss(22), 680, colors.muted, "middle")];
	parts.push(rect(sx(252), sy(338), ss(780), ss(146), ss(30), colors.accent), text(sx(284), sy(389), "What did we decide about the launch?", ss(28), 650, "#ffffff"), text(sx(284), sy(439), "Summarize the latest decision and owners.", ss(23), 500, "#e8eaff"));
	parts.push(rect(sx(48), sy(536), ss(900), ss(460), ss(30), colors.surface, colors.border, ss(2)), rect(sx(76), sy(570), ss(64), ss(64), ss(18), colors.accentSoft), text(sx(108), sy(614), "✦", ss(28), 800, colors.accent, "middle"));
	parts.push(text(sx(164), sy(607), "Streamient", ss(27), 750), text(sx(82), sy(682), "The team chose a phased public beta:", ss(29), 700));
	parts.push(text(sx(104), sy(742), "1. Invite the ten design-partner teams first.", ss(24), 520), text(sx(104), sy(794), "2. Review onboarding feedback after two weeks.", ss(24), 520), text(sx(104), sy(846), "3. Open access when activation reaches the target.", ss(24), 520));
	parts.push(text(sx(82), sy(912), "Maya owns onboarding; Daniel owns launch operations.", ss(24), 520, colors.muted));
	parts.push(text(sx(82), sy(1056), "SOURCES", ss(20), 750, colors.muted, "start", ss(1.4)), rect(sx(48), sy(1084), ss(456), ss(74), ss(18), colors.accentSoft), text(sx(276), sy(1131), "Launch meeting — decisions", ss(21), 680, colors.accent, "middle"), rect(sx(524), sy(1084), ss(420), ss(74), ss(18), colors.accentSoft), text(sx(734), sy(1131), "Onboarding research", ss(21), 680, colors.accent, "middle"));
	parts.push(rect(sx(48), sy(1390), ss(984), ss(110), ss(32), colors.surface, colors.border, ss(2)), text(sx(88), sy(1459), "Ask your team’s shared memory…", ss(25), 500, "#aaa6b4"), rect(sx(930), sy(1411), ss(78), ss(68), ss(22), colors.accent), text(sx(969), sy(1458), "↑", ss(35), 800, "#ffffff", "middle"));
	return parts;
}

function bottomNav(sx, sy, ss, screen) {
	const active = screen === "chat" ? "AI Chat" : screen === "search" ? "Search" : "Records";
	const parts = [rect(sx(0), sy(1700), ss(1080), ss(220), 0, colors.surface), line(sx(0), sy(1700), sx(1080), sy(1700), colors.border, ss(2))];
	parts.push(text(sx(216), sy(1776), active === "Search" ? "⌕" : "▤", ss(48), 700, active === "AI Chat" ? colors.muted : colors.accent, "middle"), text(sx(216), sy(1830), active === "Search" ? "Search" : "Records", ss(22), 680, active === "AI Chat" ? colors.muted : colors.accent, "middle"));
	parts.push(`<circle cx="${sx(540)}" cy="${sy(1724)}" r="${ss(68)}" fill="${colors.accent}" stroke="${colors.surface}" stroke-width="${ss(12)}"/>`, text(sx(540), sy(1743), "+", ss(58), 500, "#ffffff", "middle"), text(sx(540), sy(1830), "Add", ss(22), 680, colors.muted, "middle"));
	parts.push(text(sx(864), sy(1776), "✦", ss(44), 700, active === "AI Chat" ? colors.accent : colors.muted, "middle"), text(sx(864), sy(1830), "AI Chat", ss(22), 680, active === "AI Chat" ? colors.accent : colors.muted, "middle"));
	return parts;
}

async function writePng(name, svg, width, height, composites = []) {
	await mkdir(outputDir, { recursive: true });
	await sharp(Buffer.from(svg)).resize(width, height).composite(composites).png().toFile(resolve(outputDir, name));
}

const appIconLogo = await sharp(mark).resize(288, 288, { fit: "contain" }).png().toBuffer();
await writePng("app-icon-512.png", `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="${colors.cream}"/></svg>`, 512, 512, [{ input: appIconLogo, left: 112, top: 112 }]);

const featureLogo = await sharp(mark).resize(190, 190, { fit: "contain" }).png().toBuffer();
const featureSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500"><rect width="1024" height="500" fill="${colors.cream}"/><circle cx="975" cy="50" r="220" fill="${colors.accent}" opacity=".14"/><circle cx="930" cy="460" r="170" fill="${colors.ink}" opacity=".08"/>${text(282, 116, "STREAMIENT", 28, 780, colors.accent, "start", 4)}${text(282, 202, "Your team’s memory,", 57, 800, colors.ink)}${text(282, 268, "ready for AI.", 57, 800, colors.ink)}${text(282, 344, "Notes. Memories. URLs. Shared context.", 27, 520, colors.muted)}</svg>`;
await writePng("feature-graphic.png", featureSvg, 1024, 500, [{ input: featureLogo, left: 58, top: 155 }]);

for (const screen of ["records", "search", "chat"]) await writePng(`phone-${screen}.png`, screenshotSvg(1080, 1920, screen), 1080, 1920);
for (const screen of ["records", "chat"]) await writePng(`tablet-7-${screen}.png`, screenshotSvg(1200, 1920, screen), 1200, 1920);
for (const screen of ["records", "chat"]) await writePng(`tablet-10-${screen}.png`, screenshotSvg(1600, 2560, screen), 1600, 2560);

console.log(`Google Play assets: ${outputDir}`);
