// 두 프로젝트에 준비된 릴스·캡션·게시 날짜를 읽어 queue.json과 media/를 만든다(내 PC에서 실행).
//   node scripts/build-queue.mjs --from 2026-11-04 [--hugidam-time 21:00] [--saju-time 22:00]
// --from 이전 날짜는 넣지 않는다(이미 손으로 올렸거나 지난 편). 이미 posted.json에 있는 편은 그대로 둔다.
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const FROM = arg("--from");
if (!FROM) { console.error("--from 2026-11-04 처럼 시작 날짜를 주세요"); process.exit(1); }
const T_HUGIDAM = arg("--hugidam-time", "21:00");
const T_SAJU = arg("--saju-time", "22:00");
const YEAR = 2026;
const iso = (md) => { const [m, d] = md.split("/").map(Number); return `${YEAR}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`; };

const items = [];

// ── 후기담: docs/marketing-assets/reels/week*/captions.md (게시 날짜는 릴스 올리기 페이지와 같은 일정) ──
const H = "C:/Users/PC/Desktop/hugidam/docs/marketing-assets/reels";
const H_DATES = { 1: "10/20", 2: "10/21", 3: "10/22", 4: "10/23", 5: "10/26", 6: "10/28", 7: "10/30", 8: "11/2", 9: "11/4", 10: "11/6",
  11: "11/9", 12: "11/11", 13: "11/13", 14: "11/16", 15: "11/18", 16: "11/20", 17: "11/23", 18: "11/25", 19: "11/27", 20: "11/30",
  21: "12/2", 22: "12/4", 23: "12/7", 24: "12/9" };
for (const w of readdirSync(H).filter((d) => /^week\d$/.test(d))) {
  const md = readFileSync(`${H}/${w}/captions.md`, "utf8");
  for (const m of md.matchAll(/## (\d+) · ([^\n]+?) — `([^`]+)`\n\n```\n([\s\S]*?)```/g)) {
    const n = Number(m[1]);
    const date = iso(H_DATES[n]);
    if (date < FROM) continue;
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
for (const r of reels) {
  const date = iso(r.date);
  if (date < FROM) continue;
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
