// 인스타 접근 키 갱신 — 인스타 로그인 키(graph.instagram.com)는 60일이면 만료돼 매주 갱신해 Secrets에 다시 넣는다.
// 지금 쓰는 키는 Meta 앱의 시스템 사용자 키(페이스북 그래프, 만료 없음)라 대부분 할 일이 없다 — 그런 키는 건너뛴다.
// 인스타 로그인 키를 쓸 때만 GH_PAT(이 저장소 Secrets 쓰기 권한)가 필요하다.
import { execFileSync } from "node:child_process";

const TOKENS = { IG_TOKEN_HUGIDAM: process.env.IG_TOKEN_HUGIDAM, IG_TOKEN_SAJU: process.env.IG_TOKEN_SAJU };
const canStore = Boolean(process.env.GH_TOKEN);
let bad = 0;
for (const [name, token] of Object.entries(TOKENS)) {
  if (!token) { console.log(`${name}: 없음 — 건너뜀`); continue; }
  const ig = await (await fetch(`https://graph.instagram.com/me?fields=username&access_token=${token}`)).json();
  if (ig.error) { console.log(`${name}: 시스템 사용자 키(만료 없음) — 갱신할 필요 없음`); continue; }
  const r = await (await fetch(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${token}`)).json();
  if (r.error || !r.access_token) { console.log(`${name}: 갱신 실패 — ${r.error?.message || "응답 없음"}`); bad++; continue; }
  const days = Math.round((r.expires_in || 0) / 86400);
  if (!canStore) { console.log(`${name}: 갱신됨(${days}일 유효) — 하지만 GH_PAT가 없어 Secrets에 저장하지 못했어요`); bad++; continue; }
  // 키 값은 로그에 남기지 않는다(표준 입력으로 넘김)
  execFileSync("gh", ["secret", "set", name, "--repo", process.env.GITHUB_REPOSITORY], { input: r.access_token });
  console.log(`${name}: 갱신해서 저장함 (${days}일 유효)`);
}
process.exit(bad ? 1 : 0);
