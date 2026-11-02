// 설정 점검 — 접근 키가 맞는지, 어느 계정에 연결됐는지, 오늘 게시 한도, 다음 예정 5편, 영상·표지 주소가 열리는지.
// GitHub Actions의 "점검" 워크플로(check.yml)에서 손으로 실행한다. 아무것도 올리지 않는다.
import { readFileSync } from "node:fs";
import { call, resolveAccounts } from "./lib.mjs";

const PAGES_BASE = (process.env.PAGES_BASE || "").replace(/\/$/, "");
const queue = JSON.parse(readFileSync("queue.json", "utf8"));
const posted = JSON.parse(readFileSync("posted.json", "utf8"));
const kst = (s) => new Date(s.replace(" ", "T") + ":00+09:00");
const opens = async (path) => (PAGES_BASE ? (await fetch(`${PAGES_BASE}/${path}`, { method: "HEAD" })).ok : null);

const { accounts } = await resolveAccounts();

let bad = 0;
for (const [account, acc] of Object.entries(accounts)) {
  console.log(`\n■ ${account}`);
  if (acc.error) { console.log(`  ✗ ${acc.error}`); bad++; continue; }
  console.log(`  연결된 계정: @${acc.username} (ID ${acc.igId}, ${acc.host}, 키 ${acc.via})`);
  const lim = await call(acc.host, "GET", `/${acc.igId}/content_publishing_limit`, acc.token, { fields: "quota_usage,config" }).catch(() => null);
  if (lim) console.log(`  최근 24시간 게시: ${lim.data?.[0]?.quota_usage ?? "?"} / ${lim.data?.[0]?.config?.quota_total ?? "?"}`);
  const next = queue.filter((q) => q.account === account && !posted[q.id] && kst(q.at) > new Date())
    .sort((a, b) => kst(a.at) - kst(b.at)).slice(0, 5);
  for (const q of next) {
    const v = await opens(q.video), c = q.cover ? await opens(q.cover) : true;
    const mark = v === null ? "주소 확인 안 함(PAGES_BASE 없음)" : v && c ? "영상·표지 OK" : "영상·표지 주소가 안 열림 ✗";
    console.log(`  ${q.at}  ${q.id}  ${q.title || ""}  ${mark}`);
    if (v === false || c === false) bad++;
  }
}
process.exit(bad ? 1 : 0);
