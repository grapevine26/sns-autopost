// 정시 실행 장치(Vercel 크론 → GitHub 실행) 설정을 한 번에 끝내는 스크립트. 이 PC에서 직접 실행한다.
//   node scripts/setup-trigger.mjs
//
// 하는 일
//   1. GitHub 세분화 토큰을 붙여 넣으라고 묻는다(화면에 보이지 않음).
//   2. 그 토큰으로 "시험 실행(게시 안 함)"을 한 번 깨워 권한이 맞는지 확인한다. 틀리면 아무것도 저장하지 않는다.
//   3. Vercel 프로젝트 sns-autopost에 GH_DISPATCH_TOKEN과 CRON_SECRET(무작위로 새로 만듦)을 저장한다.
//   4. Vercel에 다시 배포해 저장한 값이 적용되게 한다.
// 토큰과 비밀값은 화면에 출력하지 않고, 명령줄 인자가 아니라 표준입력으로만 넘긴다.
import readline from "node:readline";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";

const REPO = "grapevine26/sns-autopost";
const SCOPE = "grapevine26s-projects";

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let muted = false;
    rl._writeToOutput = (s) => { if (!muted) rl.output.write(s); };
    rl.question(question, (answer) => { rl.close(); process.stdout.write("\n"); resolve(answer.trim()); });
    muted = true;
  });
}

function vercel(args, stdinValue) {
  return new Promise((resolve, reject) => {
    // Windows에서 npx(.cmd)는 셸을 거쳐야 실행된다. 인자에는 공백·비밀값이 없다(비밀값은 표준입력으로).
    const child = spawn("npx", ["vercel", ...args, "--scope", SCOPE], {
      stdio: [stdinValue == null ? "inherit" : "pipe", "inherit", "inherit"],
      shell: process.platform === "win32",
    });
    if (stdinValue != null) { child.stdin.write(stdinValue); child.stdin.end(); }
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`vercel ${args[0]} ${args[1] || ""} 실패(${code})`))));
  });
}

const token = await askHidden("GitHub 토큰을 붙여 넣고 Enter (화면에는 안 보여요): ");
if (!/^(github_pat_|ghp_)\w+$/.test(token)) {
  console.error("토큰 모양이 아니에요. github_pat_로 시작하는 값을 통째로 붙여 넣어 주세요.");
  process.exit(1);
}

// 권한 확인: 게시하지 않는 시험 실행을 한 번 깨운다(204면 Actions 쓰기 권한이 있다)
const check = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/post.yml/dispatches`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "sns-autopost-setup",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ ref: "main", inputs: { dry_run: "true", prepare_only: "false" } }),
});
if (check.status !== 204) {
  console.error(`토큰 확인 실패(GitHub ${check.status}). 저장소를 sns-autopost로, 권한 Actions를 "Read and write"로 골랐는지 확인해 주세요. 아무것도 저장하지 않았어요.`);
  process.exit(1);
}
console.log("토큰 확인 OK — 시험 실행(게시 안 함)이 하나 시작됐어요.");

await vercel(["env", "add", "GH_DISPATCH_TOKEN", "--environment", "production", "--sensitive", "--force", "--yes"], token);
await vercel(["env", "add", "CRON_SECRET", "--environment", "production", "--sensitive", "--force", "--yes"], randomBytes(32).toString("hex"));
console.log("Vercel에 값 2개 저장 OK. 다시 배포할게요…");
await vercel(["deploy", "--prod", "--yes"]);
console.log("\n끝났어요. 매일 21시·22시(한국 시간)에 Vercel이 GitHub 실행을 깨워요.");
