// 인스타 릴스 자동 게시 — GitHub Actions가 매시간 실행한다(.github/workflows/post.yml).
//
// queue.json에서 시각이 지난(아직 안 올린) 릴스를 계정마다 한 편씩 골라 인스타 API로 올리고,
// 올린 기록을 posted.json에 남긴다(워크플로가 커밋). 같은 편을 두 번 올리지 않는 근거가 이 파일이다.
//
// 인스타 API(인스타 로그인 방식)는 영상을 "인터넷 주소"로 받는다 — 이 저장소의 GitHub Pages가
// media/ 아래 영상을 공개 주소로 내준다(PAGES_BASE).
//
// 환경변수
//   IG_TOKEN_HUGIDAM, IG_TOKEN_SAJU  계정별 접근 키(저장소 Secrets). 없는 계정은 건너뛴다.
//   PAGES_BASE                        영상 주소 앞부분 (예: https://아이디.github.io/sns-autopost)
//   DRY_RUN=1                         올리지 않고 무엇을 올릴지만 출력
//   LATE_LIMIT_HOURS                  예정 시각에서 이만큼 넘게 지난 편은 올리지 않고 건너뜀 (기본 36)
import { readFileSync, writeFileSync } from "node:fs";

const API = `https://graph.instagram.com/${process.env.IG_API_VERSION || "v26.0"}`;
const DRY = process.env.DRY_RUN === "1";
const LATE_MS = Number(process.env.LATE_LIMIT_HOURS || 36) * 3600_000;
const PAGES_BASE = (process.env.PAGES_BASE || "").replace(/\/$/, "");
const TOKENS = { hugidam: process.env.IG_TOKEN_HUGIDAM, saju: process.env.IG_TOKEN_SAJU };

const queue = JSON.parse(readFileSync("queue.json", "utf8"));
const posted = JSON.parse(readFileSync("posted.json", "utf8"));
const save = () => writeFileSync("posted.json", JSON.stringify(posted, null, 2) + "\n");
const kst = (s) => new Date(s.replace(" ", "T") + ":00+09:00"); // "2026-11-04 21:00" (한국 시간)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ig(method, path, token, params = {}) {
  const url = new URL(API + path);
  const body = new URLSearchParams({ ...params, access_token: token });
  const res = method === "GET"
    ? await fetch(url + "?" + body)
    : await fetch(url, { method, body });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    const e = json.error || {};
    throw new Error(`${method} ${path} → ${res.status} ${e.message || ""} (code ${e.code ?? "-"}/${e.error_subcode ?? "-"})`);
  }
  return json;
}

async function publish(item, token, igId) {
  const videoUrl = `${PAGES_BASE}/${item.video}`;
  // 인스타가 가져가기 전에 우리 쪽에서 먼저 주소가 열리는지 본다(Pages 반영 전이면 여기서 멈춘다)
  const head = await fetch(videoUrl, { method: "HEAD" });
  if (!head.ok) throw new Error(`영상 주소가 안 열려요(${head.status}): ${videoUrl}`);

  // 표지: 준비해 둔 표지 이미지(cover)가 있으면 그 주소를, 없으면 영상 속 장면(thumbOffsetMs)을 쓴다
  const coverUrl = item.cover ? `${PAGES_BASE}/${item.cover}` : null;
  if (coverUrl && !(await fetch(coverUrl, { method: "HEAD" })).ok) throw new Error(`표지 주소가 안 열려요: ${coverUrl}`);
  const container = await ig("POST", `/${igId}/media`, token, {
    media_type: "REELS",
    video_url: videoUrl,
    caption: item.caption,
    share_to_feed: "true",
    ...(coverUrl ? { cover_url: coverUrl } : item.thumbOffsetMs != null ? { thumb_offset: String(item.thumbOffsetMs) } : {}),
  });
  // 영상 처리 대기 — 보통 30초~2분. 최대 8분
  let status = "";
  for (let i = 0; i < 48; i++) {
    await sleep(10_000);
    const s = await ig("GET", `/${container.id}`, token, { fields: "status_code,status" });
    status = s.status_code;
    if (status === "FINISHED") break;
    if (status === "ERROR" || status === "EXPIRED") throw new Error(`영상 처리 실패: ${s.status || status}`);
  }
  if (status !== "FINISHED") throw new Error(`영상 처리가 8분 안에 끝나지 않았어요(${status})`);
  const media = await ig("POST", `/${igId}/media_publish`, token, { creation_id: container.id });
  const info = await ig("GET", `/${media.id}`, token, { fields: "permalink" }).catch(() => ({}));
  return { mediaId: media.id, permalink: info.permalink || "" };
}

const now = Date.now();
let failed = 0;
for (const [account, token] of Object.entries(TOKENS)) {
  const mine = queue.filter((q) => q.account === account && !posted[q.id]).sort((a, b) => kst(a.at) - kst(b.at));
  const due = mine.filter((q) => kst(q.at).getTime() <= now);
  if (!token) {
    if (due.length) console.log(`[${account}] 접근 키(IG_TOKEN_${account.toUpperCase()})가 없어 건너뜀 — 올릴 차례 ${due.length}편`);
    continue;
  }
  // 너무 늦은 편은 올리지 않는다(며칠 밀린 걸 한꺼번에 쏟아내지 않게) — 기록만 남긴다
  for (const q of due.filter((q) => now - kst(q.at).getTime() > LATE_MS)) {
    console.log(`[${account}] ${q.id} 예정 ${q.at} — ${LATE_MS / 3600_000}시간 넘게 지나 건너뜀`);
    if (!DRY) { posted[q.id] = { skipped: "late", at: new Date().toISOString() }; save(); }
  }
  const next = due.find((q) => now - kst(q.at).getTime() <= LATE_MS);
  if (!next) {
    const upcoming = mine.find((q) => kst(q.at).getTime() > now);
    console.log(`[${account}] 지금 올릴 편 없음${upcoming ? ` — 다음: ${upcoming.id} ${upcoming.at}` : " — 대기열 끝"}`);
    continue;
  }
  try {
    const me = await ig("GET", "/me", token, { fields: "user_id,username" });
    console.log(`[${account}] @${me.username} ← ${next.id} (예정 ${next.at}) ${next.title || ""}`);
    if (DRY) { console.log(`  DRY_RUN: ${PAGES_BASE}/${next.video}\n  ${next.caption.split("\n")[0]}`); continue; }
    const r = await publish(next, token, me.user_id);
    posted[next.id] = { ...r, at: new Date().toISOString() };
    save();
    console.log(`  올림 ✓ ${r.permalink}`);
  } catch (e) {
    failed++;
    console.error(`[${account}] ${next.id} 실패: ${e.message}`);
  }
}
// 실패가 있으면 워크플로를 실패로 끝낸다 → GitHub가 메일로 알려 준다. 다음 시간에 같은 편을 다시 시도한다.
process.exit(failed ? 1 : 0);
