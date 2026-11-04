// 인스타 릴스 자동 게시 — GitHub Actions가 매시간 실행한다(.github/workflows/post.yml).
//
// queue.json에서 시각이 지난(아직 안 올린) 릴스를 계정마다 한 편씩 골라 인스타 API로 올리고,
// 올린 기록을 posted.json에 남긴다(워크플로가 커밋). 같은 편을 두 번 올리지 않는 근거가 이 파일이다.
//
// 인스타 API(인스타 로그인 방식)는 영상을 "인터넷 주소"로 받는다 — 이 저장소의 GitHub Pages가
// media/ 아래 영상을 공개 주소로 내준다(PAGES_BASE).
//
// 환경변수
//   IG_SYSTEM_TOKEN                   시스템 사용자 토큰 하나로 두 계정(권장, 만료 없음) — 자세한 건 scripts/lib.mjs
//   IG_TOKEN_HUGIDAM, IG_TOKEN_SAJU  (예전 방식) 계정별 인스타 로그인 접근 키. 없는 계정은 건너뛴다.
//   PAGES_BASE                        영상 주소 앞부분 (예: https://아이디.github.io/sns-autopost)
//   DRY_RUN=1                         올리지 않고 무엇을 올릴지만 출력
//   LATE_LIMIT_HOURS                  예정 시각에서 이만큼 넘게 지나도록 못 올린 편은 지금 올리지 않고,
//                                     그 계정의 남은 편을 하루 단위로 미룬다 (기본 2)
import { readFileSync, writeFileSync } from "node:fs";
import { call, resolveAccounts } from "./lib.mjs";

const DRY = process.env.DRY_RUN === "1";
const PREPARE = process.env.PREPARE_ONLY === "1";
// GitHub 예약 실행은 몇 시간씩 안 돌 때가 있다(2026-11-04: 19:51 이후 6시간 넘게 0회 → 21·22시 편을 놓침).
// 그러다 새벽에 돌면 밤 9시 편이 새벽 4시에 올라가므로, 많이 늦은 편은 올리지 않고 다음 날 같은 시각으로 민다.
// 건너뛰지 않고 미루는 이유: 준비한 편이 하나도 사라지지 않고, 하루 한 편 간격도 그대로 유지된다.
const LATE_MS = Number(process.env.LATE_LIMIT_HOURS || 2) * 3600_000;
const DAY_MS = 86_400_000;
const PAGES_BASE = (process.env.PAGES_BASE || "").replace(/\/$/, "");

const queue = JSON.parse(readFileSync("queue.json", "utf8"));
const posted = JSON.parse(readFileSync("posted.json", "utf8"));
const save = () => writeFileSync("posted.json", JSON.stringify(posted, null, 2) + "\n");
const kst = (s) => new Date(s.replace(" ", "T") + ":00+09:00"); // "2026-11-04 21:00" (한국 시간)
const kstText = (ms) => new Date(ms + 9 * 3600_000).toISOString().slice(0, 16).replace("T", " "); // kst()의 반대
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function publish(item, acc) {
  const ig = (method, path, params) => call(acc.host, method, path, acc.token, params);
  const igId = acc.igId;
  const videoUrl = `${PAGES_BASE}/${item.video}`;
  // 인스타가 가져가기 전에 우리 쪽에서 먼저 주소가 열리는지 본다(Pages 반영 전이면 여기서 멈춘다)
  const head = await fetch(videoUrl, { method: "HEAD" });
  if (!head.ok) throw new Error(`영상 주소가 안 열려요(${head.status}): ${videoUrl}`);

  // 표지: 준비해 둔 표지 이미지(cover)가 있으면 그 주소를, 없으면 영상 속 장면(thumbOffsetMs)을 쓴다
  const coverUrl = item.cover ? `${PAGES_BASE}/${item.cover}` : null;
  if (coverUrl && !(await fetch(coverUrl, { method: "HEAD" })).ok) throw new Error(`표지 주소가 안 열려요: ${coverUrl}`);
  const container = await ig("POST", `/${igId}/media`, {
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
    const s = await ig("GET", `/${container.id}`, { fields: "status_code,status" });
    status = s.status_code;
    if (status === "FINISHED") break;
    if (status === "ERROR" || status === "EXPIRED") throw new Error(`영상 처리 실패: ${s.status || status}`);
  }
  if (status !== "FINISHED") throw new Error(`영상 처리가 8분 안에 끝나지 않았어요(${status})`);
  // 시험 모드: 인스타가 영상·표지·캡션을 받아 처리까지 끝내는지만 보고 게시하지 않는다(만든 컨테이너는 24시간 뒤 사라짐)
  if (PREPARE) return { prepared: container.id };
  const media = await ig("POST", `/${igId}/media_publish`, { creation_id: container.id });
  const info = await ig("GET", `/${media.id}`, { fields: "permalink" }).catch(() => ({}));
  return { mediaId: media.id, permalink: info.permalink || "" };
}

const now = Date.now();
let failed = 0;
let queueChanged = false;
const { accounts } = await resolveAccounts();
for (const [account, acc] of Object.entries(accounts)) {
  const mine = queue.filter((q) => q.account === account && !posted[q.id]).sort((a, b) => kst(a.at) - kst(b.at));
  // 제때 못 올린 편이 있으면 그 계정의 남은 편을 모두 같은 날수만큼 미룬다(하루 한 편 간격 유지).
  // 미룬 결과가 아직 늦음 허용 범위 안이면(예: 어제 편을 놓쳤고 지금이 오늘 21:30) 바로 아래에서 지금 올린다.
  const first = mine[0];
  if (first && !PREPARE && now - kst(first.at).getTime() > LATE_MS) {
    const days = Math.ceil((now - LATE_MS - kst(first.at).getTime()) / DAY_MS);
    const was = first.at;
    for (const q of mine) q.at = kstText(kst(q.at).getTime() + days * DAY_MS);
    queueChanged = true;
    // 실패로 끝내 GitHub가 메일을 보내게 한다 — 실행이 제때 안 돈 걸 알아야 하므로
    failed++;
    console.error(`[${account}] ${first.id}(예정 ${was})를 제때 못 올려 남은 ${mine.length}편을 ${days}일씩 미뤘어요 → ${first.id} ${first.at}`);
  }
  const due = mine.filter((q) => kst(q.at).getTime() <= now);
  if (acc.error) {
    if (due.length) { console.error(`[${account}] 올릴 차례 ${due.length}편이 있지만 계정 연결 실패: ${acc.error}`); failed++; }
    continue;
  }
  const next = PREPARE ? mine[0] : due[0];
  if (!next) {
    const upcoming = mine.find((q) => kst(q.at).getTime() > now);
    console.log(`[${account}] 지금 올릴 편 없음${upcoming ? ` — 다음: ${upcoming.id} ${upcoming.at}` : " — 대기열 끝"}`);
    continue;
  }
  try {
    console.log(`[${account}] @${acc.username} ← ${next.id} (예정 ${next.at}) ${next.title || ""}`);
    if (DRY) { console.log(`  DRY_RUN: ${PAGES_BASE}/${next.video}\n  ${next.caption.split("\n")[0]}`); continue; }
    const r = await publish(next, acc);
    if (r.prepared) { console.log(`  시험 통과 ✓ 인스타가 영상 처리까지 끝냄(게시는 안 함)`); continue; }
    posted[next.id] = { ...r, at: new Date().toISOString() };
    save();
    console.log(`  올림 ✓ ${r.permalink}`);
  } catch (e) {
    failed++;
    console.error(`[${account}] ${next.id} 실패: ${e.message}`);
  }
}
if (queueChanged && !DRY) writeFileSync("queue.json", JSON.stringify(queue, null, 2) + "\n");
// 실패가 있으면 워크플로를 실패로 끝낸다 → GitHub가 메일로 알려 준다. 다음 실행에서 같은 편을 다시 시도한다.
process.exit(failed ? 1 : 0);
