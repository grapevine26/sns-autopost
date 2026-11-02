// 설정 점검 — 접근 키가 맞는지, 어느 계정에 연결됐는지, 오늘 게시 한도, 다음 예정 5편, 영상 주소가 열리는지.
// GitHub Actions의 "점검" 워크플로(check.yml)에서 손으로 실행한다. 아무것도 올리지 않는다.
import { readFileSync } from "node:fs";

const API = `https://graph.instagram.com/${process.env.IG_API_VERSION || "v26.0"}`;
const PAGES_BASE = (process.env.PAGES_BASE || "").replace(/\/$/, "");
const TOKENS = { hugidam: process.env.IG_TOKEN_HUGIDAM, saju: process.env.IG_TOKEN_SAJU };
const queue = JSON.parse(readFileSync("queue.json", "utf8"));
const posted = JSON.parse(readFileSync("posted.json", "utf8"));
const kst = (s) => new Date(s.replace(" ", "T") + ":00+09:00");

let bad = 0;
for (const [account, token] of Object.entries(TOKENS)) {
  console.log(`\n■ ${account}`);
  if (!token) { console.log(`  접근 키 없음 (Secrets에 IG_TOKEN_${account.toUpperCase()}를 넣어 주세요)`); bad++; continue; }
  try {
    const me = await (await fetch(`${API}/me?fields=user_id,username,account_type&access_token=${token}`)).json();
    if (me.error) throw new Error(me.error.message);
    console.log(`  연결된 계정: @${me.username} (${me.account_type})`);
    const lim = await (await fetch(`${API}/${me.user_id}/content_publishing_limit?fields=quota_usage,config&access_token=${token}`)).json();
    if (!lim.error) console.log(`  최근 24시간 게시: ${lim.data?.[0]?.quota_usage ?? "?"} / ${lim.data?.[0]?.config?.quota_total ?? "?"}`);
  } catch (e) { console.log(`  접근 키 오류: ${e.message}`); bad++; }
  const next = queue.filter((q) => q.account === account && !posted[q.id] && kst(q.at) > new Date())
    .sort((a, b) => kst(a.at) - kst(b.at)).slice(0, 5);
  for (const q of next) {
    const ok = PAGES_BASE ? (await fetch(`${PAGES_BASE}/${q.video}`, { method: "HEAD" })).ok : null;
    console.log(`  ${q.at}  ${q.id}  ${q.title || ""}  영상 주소 ${ok === null ? "확인 안 함(PAGES_BASE 없음)" : ok ? "OK" : "열리지 않음 ✗"}`);
    if (ok === false) bad++;
  }
}
process.exit(bad ? 1 : 0);
