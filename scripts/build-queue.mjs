// 두 프로젝트에 준비된 릴스·캡션을 읽어 게시 일정을 매기고 queue.json과 media/를 만든다(내 PC에서 실행).
//   node scripts/build-queue.mjs --start 2026-11-04 [--hugidam-from 3] [--saju-from 1] [--every 1]
//                                [--hugidam-time 21:00] [--saju-time 22:00]
// 일정: --start부터 --every일마다 한 편(기본 매일). 2026-11-03 기준 손으로 못 올린 편이 밀려 있어
// (후기담은 02편까지만 올림, 사주는 0편) 원래 날짜 대신 이 규칙으로 다시 매긴다. posted.json에 있는 편은 건너뛴다.
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const START = arg("--start");
if (!START) { console.error("--start 2026-11-04 처럼 시작 날짜를 주세요"); process.exit(1); }
const H_FROM = Number(arg("--hugidam-from", "3")), S_FROM = Number(arg("--saju-from", "1"));
const EVERY = Number(arg("--every", "1"));
const posted = existsSync("posted.json") ? JSON.parse(readFileSync("posted.json", "utf8")) : {};
function* dates(start) {
  const d = new Date(start + "T12:00:00Z");
  while (true) { yield d.toISOString().slice(0, 10); d.setUTCDate(d.getUTCDate() + EVERY); }
}
const T_HUGIDAM = arg("--hugidam-time", "21:00");
const T_SAJU = arg("--saju-time", "22:00");

const items = [];

// ── 후기담: docs/marketing-assets/reels/week*/captions.md (번호 순서대로) ──
const H = "C:/Users/PC/Desktop/hugidam/docs/marketing-assets/reels";
const hDates = dates(START);
const hugidamList = [];
for (const w of readdirSync(H).filter((d) => /^week\d$/.test(d))) {
  const md = readFileSync(`${H}/${w}/captions.md`, "utf8");
  for (const m of md.matchAll(/## (\d+) · ([^\n]+?) — `([^`]+)`\n\n```\n([\s\S]*?)```/g)) hugidamList.push({ w, m });
}
hugidamList.sort((a, b) => Number(a.m[1]) - Number(b.m[1]));
for (const { w, m } of hugidamList) {
  {
    const n = Number(m[1]);
    if (n < H_FROM || posted[`hugidam-${String(n).padStart(2, "0")}`]) continue;
    const date = hDates.next().value;
    const id = `hugidam-${String(n).padStart(2, "0")}`;
    const video = `media/hugidam/${String(n).padStart(2, "0")}.mp4`;
    copyFileSync(`${H}/${w}/${m[3]}`, video);
    const cover = video.replace(".mp4", ".jpg");
    copyFileSync(`${H}/${w}/${m[3].replace(".mp4", "_cover.jpg")}`, cover);
    // 표지 = 첫 장면이 자리 잡은 프레임(render.cjs가 표지를 첫 장면 끝 0.05초 전에서 뜬다)
    items.push({ id, account: "hugidam", at: `${date} ${T_HUGIDAM}`, title: m[2].replace(/^[A-D]\d\d\s*/, ""), video, cover, caption: m[4].trimEnd(), thumbOffsetMs: 3900 });
  }
}

// ── 사주(묘연): saju/marketing/reels/series/upload — make-upload.mjs가 만든 게시 순서·날짜·캡션 ──
const S = "C:/Users/PC/Desktop/saju/marketing/reels/series/upload";
const html = readFileSync(`${S}/index.html`, "utf8");
const reels = JSON.parse(html.match(/const REELS = (\[[\s\S]*?\]);/)?.[1] || html.match(/(\[\{"n":1[\s\S]*?\}\])/)[1]);
const sDates = dates(START);
for (const r of reels) {
  if (r.n < S_FROM || posted[`saju-r${String(r.n).padStart(2, "0")}`]) continue;
  const date = sDates.next().value;
  const key = "r" + String(r.n).padStart(2, "0");
  const video = `media/saju/${key}.mp4`;
  copyFileSync(`${S}/v/${key}.mp4`, video);
  const cover = `media/saju/${key}.jpg`;
  copyFileSync(`${S}/v/${key}.jpg`, cover);
  // 표지 = 그리드 커버와 같은 첫 장면(골든 윈도우만 1.4초) — make-upload.mjs와 같은 값
  items.push({ id: `saju-${key}`, account: "saju", at: `${date} ${T_SAJU}`, title: r.title, video, cover, caption: r.caption.trimEnd(), thumbOffsetMs: r.title === "골든 윈도우" ? 1400 : 400 });
}

items.sort((a, b) => a.at.localeCompare(b.at) || a.account.localeCompare(b.account));
writeFileSync("queue.json", JSON.stringify(items, null, 2) + "\n");
const by = (a) => items.filter((i) => i.account === a);
console.log(`queue.json: 후기담 ${by("hugidam").length}편(${by("hugidam")[0]?.at} ~ ${by("hugidam").at(-1)?.at}), 사주 ${by("saju").length}편(${by("saju")[0]?.at} ~ ${by("saju").at(-1)?.at})`);
