// Vercel 크론이 정해진 시각(vercel.json)에 부르는 함수. GitHub의 "릴스 자동 게시" 워크플로를 깨운다.
//
// 왜 필요한가: GitHub 예약 실행(schedule)은 정시를 보장하지 않는다. 2026-11-04에는 10분마다로 걸어 둔
// 예약이 19:51 이후 6시간 넘게 한 번도 돌지 않아 21·22시 첫 편을 놓쳤다. 반면 API로 직접 실행하는
// workflow_dispatch는 몇 초 안에 시작한다. 그래서 "언제"는 Vercel 크론이, "올리기"는 지금처럼 GitHub가 맡는다.
// 워크플로는 올릴 차례가 된 편만 올리므로, 여러 번 깨워도 같은 편이 두 번 올라가지 않는다.
//
// 환경변수 (Vercel 프로젝트 sns-autopost, Production)
//   CRON_SECRET        Vercel 크론이 "Authorization: Bearer <값>"으로 보내는 값. 없으면 모든 요청을 거부한다.
//   GH_DISPATCH_TOKEN  GitHub 세분화 토큰(fine-grained). 저장소 sns-autopost 하나, 권한은 Actions 읽기·쓰기만.
//   GH_REPO            (선택) 기본값 grapevine26/sns-autopost
export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  const token = process.env.GH_DISPATCH_TOKEN;
  if (!token) {
    console.error("[trigger] GH_DISPATCH_TOKEN이 없어 GitHub 실행을 깨우지 못함");
    return res.status(500).json({ ok: false, error: "GH_DISPATCH_TOKEN missing" });
  }
  const repo = process.env.GH_REPO || "grapevine26/sns-autopost";
  const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/post.yml/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "sns-autopost-trigger",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: "main", inputs: { dry_run: "false", prepare_only: "false" } }),
  });
  if (r.status !== 204) {
    // 401: 토큰 만료·오타, 403/404: 토큰에 이 저장소의 Actions 쓰기 권한이 없음
    console.error(`[trigger] GitHub 응답 ${r.status}: ${(await r.text()).slice(0, 300)}`);
    return res.status(502).json({ ok: false, githubStatus: r.status });
  }
  console.log(`[trigger] ${repo} 게시 워크플로를 깨움 (${req.headers["x-vercel-cron-schedule"] || "수동 실행"})`);
  return res.status(200).json({ ok: true });
}
