// 인스타 접근 키 갱신 — 장기 접근 키는 60일이면 만료된다. 매주 갱신해서 새 키를 저장소 Secrets에 다시 넣는다.
// Secrets를 바꾸려면 GitHub 개인 접근 토큰(GH_PAT, 이 저장소의 Secrets 쓰기 권한)이 필요하다 — 없으면 갱신 결과만 알려 주고 실패로 끝내
// (GitHub가 메일로 알려 줌) 손으로 바꾸게 한다.
import { execFileSync } from "node:child_process";

const TOKENS = { IG_TOKEN_HUGIDAM: process.env.IG_TOKEN_HUGIDAM, IG_TOKEN_SAJU: process.env.IG_TOKEN_SAJU };
const canStore = Boolean(process.env.GH_TOKEN);
let bad = 0;
for (const [name, token] of Object.entries(TOKENS)) {
  if (!token) { console.log(`${name}: 없음 — 건너뜀`); continue; }
  const r = await (await fetch(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${token}`)).json();
  if (r.error || !r.access_token) { console.log(`${name}: 갱신 실패 — ${r.error?.message || "응답 없음"}`); bad++; continue; }
  const days = Math.round((r.expires_in || 0) / 86400);
  if (!canStore) { console.log(`${name}: 갱신됨(${days}일 유효) — 하지만 GH_PAT가 없어 Secrets에 저장하지 못했어요`); bad++; continue; }
  // 키 값은 로그에 남기지 않는다(표준 입력으로 넘김)
  execFileSync("gh", ["secret", "set", name, "--repo", process.env.GITHUB_REPOSITORY], { input: r.access_token });
  console.log(`${name}: 갱신해서 저장함 (${days}일 유효)`);
}
process.exit(bad ? 1 : 0);
