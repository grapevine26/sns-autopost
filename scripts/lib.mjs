// 계정·접근 키 해석 — 두 방식을 지원한다.
//
// A. 시스템 사용자 토큰(권장): Meta 앱 "Instagram API setup with Unified login"에서 만든 만료 없는 토큰 하나로
//    두 계정 모두 올린다. 호스트는 graph.facebook.com.
//      IG_SYSTEM_TOKEN            (Secrets) 시스템 사용자 액세스 토큰
//      IG_USER_ID_HUGIDAM/SAJU    (Variables, 선택) 인스타 계정 ID. 없으면 accounts.json의 아이디로 찾는다.
// B. 인스타 로그인 토큰(예전 방식, 60일 만료): 계정마다 IG_TOKEN_HUGIDAM / IG_TOKEN_SAJU. 호스트는 graph.instagram.com.
import { readFileSync } from "node:fs";

const V = process.env.IG_API_VERSION || "v26.0";
export const ACCOUNTS = JSON.parse(readFileSync("accounts.json", "utf8")); // { hugidam: { username, igId }, saju: { username, igId } }

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

// 시스템 사용자 토큰이 볼 수 있는 인스타 계정 목록 — 페이지에 연결된 계정과 비즈니스 포트폴리오 소유 계정 둘 다 본다
async function discover(token) {
  const found = new Map();
  try {
    const pages = await call("graph.facebook.com", "GET", "/me/accounts", token, { fields: "instagram_business_account{id,username}", limit: "100" });
    for (const p of pages.data || []) if (p.instagram_business_account) found.set(p.instagram_business_account.username, p.instagram_business_account.id);
  } catch { /* 페이지 권한이 없으면 건너뜀 */ }
  try {
    const biz = await call("graph.facebook.com", "GET", "/me/businesses", token, { fields: "id", limit: "20" });
    for (const b of biz.data || []) {
      for (const edge of ["owned_instagram_accounts", "instagram_accounts"]) {
        try {
          const r = await call("graph.facebook.com", "GET", `/${b.id}/${edge}`, token, { fields: "id,username", limit: "100" });
          for (const a of r.data || []) if (a.username) found.set(a.username, a.id);
        } catch { /* 이 경로를 못 보면 다음 경로 */ }
      }
    }
  } catch { /* 비즈니스 목록 권한이 없으면 건너뜀 */ }
  return found;
}

/** 계정마다 { host, token, igId, username } 또는 { error } */
export async function resolveAccounts() {
  const out = {};
  const sys = process.env.IG_SYSTEM_TOKEN;
  let found = null;
  for (const name of Object.keys(ACCOUNTS)) {
    const up = name.toUpperCase();
    if (sys) {
      let igId = process.env[`IG_USER_ID_${up}`] || ACCOUNTS[name].igId;
      if (!igId) {
        found ??= await discover(sys);
        igId = found.get(ACCOUNTS[name].username);
      }
      if (!igId) { out[name] = { error: `인스타 계정 ID를 못 찾음 — 저장소 Variables에 IG_USER_ID_${up}를 넣어 주세요(점검 결과의 목록 참고)` }; continue; }
      const me = await call("graph.facebook.com", "GET", `/${igId}`, sys, { fields: "username" }).catch((e) => ({ error: e.message }));
      if (!me.error) { out[name] = { host: "graph.facebook.com", token: sys, igId, username: me.username }; continue; }
      found ??= await discover(sys);
      const hit = found.get(ACCOUNTS[name].username);
      if (hit) { out[name] = { host: "graph.facebook.com", token: sys, igId: hit, username: ACCOUNTS[name].username }; continue; }
      const who = await call("graph.facebook.com", "GET", "/me", sys, { fields: "id,name" }).catch((e) => ({ error: e.message }));
      const perms = await call("graph.facebook.com", "GET", "/me/permissions", sys).catch(() => ({ data: [] }));
      out[name] = { error: `${me.error} / 키 주인: ${who.error || `${who.name} (${who.id})`} / 권한: ${(perms.data || []).filter((p) => p.status === "granted").map((p) => p.permission).join(",") || "?"}` };
    } else if (process.env[`IG_TOKEN_${up}`]) {
      const token = process.env[`IG_TOKEN_${up}`];
      // 계정별 키는 두 종류가 나온다: 인스타 로그인 키(graph.instagram.com)와, 비즈니스 포트폴리오를 거쳐 만든
      // 페이스북 그래프 키(graph.facebook.com, "EAA…"). 앞쪽이 "Cannot parse access token"이면 뒤쪽으로 본다.
      const me = await call("graph.instagram.com", "GET", "/me", token, { fields: "user_id,username" }).catch((e) => ({ error: e.message }));
      if (!me.error) { out[name] = { host: "graph.instagram.com", token, igId: me.user_id, username: me.username }; continue; }
      const igId = process.env[`IG_USER_ID_${up}`] || ACCOUNTS[name].igId;
      const fb = igId
        ? await call("graph.facebook.com", "GET", `/${igId}`, token, { fields: "username" }).catch((e) => ({ error: e.message }))
        : { error: "인스타 계정 ID 없음(accounts.json의 igId)" };
      if (!fb.error) { out[name] = { host: "graph.facebook.com", token, igId, username: fb.username }; continue; }
      // ID로 못 보면, 이 키가 볼 수 있는 계정 중 아이디가 같은 것을 찾는다(포트폴리오 경유 키는 ID가 다를 수 있다)
      const seen = await discover(token);
      const hit = seen.get(ACCOUNTS[name].username);
      if (hit) { out[name] = { host: "graph.facebook.com", token, igId: hit, username: ACCOUNTS[name].username }; continue; }
      const who = await call("graph.facebook.com", "GET", "/me", token, { fields: "id,name" }).catch((e) => ({ error: e.message }));
      out[name] = { error: `인스타 로그인: ${me.error} / 페이스북 그래프: ${fb.error} / 이 키의 주인: ${who.error || `${who.name} (${who.id})`} / 이 키로 보이는 인스타 계정: ${[...seen].map(([u, i]) => `@${u}(${i})`).join(", ") || "없음"}` };
    } else {
      out[name] = { error: "접근 키 없음(IG_SYSTEM_TOKEN 또는 IG_TOKEN_" + up + ")" };
    }
  }
  return { accounts: out, discovered: found };
}
