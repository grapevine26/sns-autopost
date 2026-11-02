// 계정·접근 키 해석.
//
// 넣어 둘 수 있는 키(저장소 Secrets) — 있는 것만 쓴다:
//   IG_TOKEN_HUGIDAM, IG_TOKEN_SAJU   계정별 키
//   IG_SYSTEM_TOKEN                   시스템 사용자 키(만료 없음, 두 계정에 배정돼 있으면 하나로 충분)
// 키 종류도 두 가지다 — 인스타 로그인 키(graph.instagram.com)와 페이스북 그래프 키(graph.facebook.com, "EAA…").
// 계정마다 "그 계정 전용 키 → 시스템 키 → 다른 계정 키" 순서로, 두 주소에 모두 물어보고 처음 통하는 조합을 쓴다.
// 2026-11-02 설정 때 Meta 화면이 키를 어떤 종류로 주는지 일정하지 않아서(포트폴리오 경유 여부에 따라 다름) 이렇게 둔다.
import { readFileSync } from "node:fs";

const V = process.env.IG_API_VERSION || "v26.0";
export const ACCOUNTS = JSON.parse(readFileSync("accounts.json", "utf8")); // { hugidam: { username, igId }, ... }

export async function call(host, method, path, token, params = {}) {
  const url = new URL(`https://${host}/${V}${path}`);
  const body = new URLSearchParams({ ...params, access_token: token });
  const res = method === "GET" ? await fetch(url + "?" + body) : await fetch(url, { method, body });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    const e = json.error || {};
    throw new Error(`${method} ${path} → ${res.status} ${e.message || ""} (code ${e.code ?? "-"}/${e.error_subcode ?? "-"})`);
  }
  return json;
}

// 이 키 하나로 이 계정에 닿는지 — 닿으면 { host, igId, username }
async function reach(token, name) {
  const want = ACCOUNTS[name];
  const ig = await call("graph.instagram.com", "GET", "/me", token, { fields: "user_id,username" }).catch(() => null);
  if (ig && ig.username === want.username) return { host: "graph.instagram.com", igId: ig.user_id, username: ig.username };
  const igId = process.env[`IG_USER_ID_${name.toUpperCase()}`] || want.igId;
  if (igId) {
    const fb = await call("graph.facebook.com", "GET", `/${igId}`, token, { fields: "username" }).catch(() => null);
    if (fb && fb.username === want.username) return { host: "graph.facebook.com", igId, username: fb.username };
  }
  return null;
}

async function describe(token) {
  const who = await call("graph.facebook.com", "GET", "/me", token, { fields: "id,name" }).catch(() => null);
  if (who) return `페이스북 그래프 키 · 주인 ${who.name}`;
  const ig = await call("graph.instagram.com", "GET", "/me", token, { fields: "username" }).catch(() => null);
  return ig ? `인스타 로그인 키 · @${ig.username}` : "해석할 수 없는 키";
}

/** 계정마다 { host, token, igId, username, via } 또는 { error } */
export async function resolveAccounts() {
  const keys = Object.entries({
    IG_TOKEN_HUGIDAM: process.env.IG_TOKEN_HUGIDAM,
    IG_TOKEN_SAJU: process.env.IG_TOKEN_SAJU,
    IG_SYSTEM_TOKEN: process.env.IG_SYSTEM_TOKEN,
  }).filter(([, v]) => v);
  const rank = (k, own) => (k === own ? 0 : k === "IG_SYSTEM_TOKEN" ? 1 : 2);
  const out = {};
  for (const name of Object.keys(ACCOUNTS)) {
    const own = `IG_TOKEN_${name.toUpperCase()}`;
    const order = [...keys].sort(([a], [b]) => rank(a, own) - rank(b, own));
    let hit = null;
    for (const [keyName, token] of order) {
      const r = await reach(token, name);
      if (r) { hit = { ...r, token, via: keyName }; break; }
    }
    if (hit) { out[name] = hit; continue; }
    const tried = [];
    for (const [keyName, token] of order) tried.push(`${keyName}(${await describe(token)})`);
    out[name] = { error: `@${ACCOUNTS[name].username}에 닿는 키가 없어요 — 시도한 키: ${tried.join(", ") || "없음"}` };
  }
  return { accounts: out };
}
