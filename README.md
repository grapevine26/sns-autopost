# sns-autopost — 인스타 릴스 자동 게시

후기담·사주(묘연) 두 인스타 계정에 준비된 릴스를 **정해진 시각에 자동으로** 올린다.

- **실행:** GitHub Actions가 매시간 `queue.json`을 보고, 시각이 지난 편을 계정마다 한 편씩 올린다(`scripts/post.mjs`). PC가 꺼져 있어도 된다.
- **영상 주소:** 인스타 API는 영상을 인터넷 주소로 받는다. 이 저장소의 GitHub Pages가 `media/` 영상을 공개 주소로 내준다.
- **기록:** 올린 편은 `posted.json`에 남고(자동 커밋), 같은 편은 두 번 올리지 않는다.
- **알림:** 실패하면 워크플로가 실패로 끝나고 GitHub가 메일을 보낸다. 다음 시간에 같은 편을 다시 시도한다. 예정에서 36시간 넘게 밀린 편은 올리지 않고 건너뛴다.

## 알아 둘 한계

1. **인스타 음악을 넣을 수 없다.** 인스타 라이선스 음악은 앱에서만 붙는다. API로 올린 릴스는 영상 그대로(지금은 무음) 올라간다.
2. **시각은 대략이다.** GitHub 예약 실행은 몇 분~수십 분 늦을 수 있다. 21:00 예정이면 보통 21:10~21:30 사이에 올라간다.
3. **저장소가 공개다.** GitHub Pages(무료)로 영상 주소를 내주려면 공개 저장소여야 한다. 아직 안 올라간 영상·캡션도 저장소에서 보인다. 접근 키는 Secrets에 있어 보이지 않는다.
4. **접근 키는 60일마다 만료된다.** 매주 자동 갱신한다(아래 5단계의 GH_PAT가 있을 때).

## 처음 설정 (한 번만)

### 1. GitHub 저장소 만들기

1. github.com에서 **New repository**를 누른다.
2. 이름에 `sns-autopost`를 쓰고, **Public**을 고르고, README 추가는 끄고 만든다.
3. 이 폴더에서 아래 명령을 차례로 실행한다(`<아이디>`는 GitHub 아이디).

```bash
git remote add origin https://github.com/<아이디>/sns-autopost.git
```

```bash
git push -u origin main
```

### 2. GitHub Pages 켜기

1. 저장소 **Settings → Pages**로 간다.
2. **Source**를 `Deploy from a branch`, **Branch**를 `main` / `/(root)`로 고르고 저장한다.
3. 1~2분 뒤 `https://<아이디>.github.io/sns-autopost/media/hugidam/09.mp4`가 브라우저에서 재생되는지 본다.

### 3. Meta 앱 만들기와 접근 키 받기

화면 이름은 Meta가 자주 바꾼다. 아래와 다르면 같은 뜻의 메뉴를 고른다.

1. developers.facebook.com에 로그인하고 **내 앱 → 앱 만들기**를 누른다.
2. 사용 사례에서 **Instagram에서 메시지 및 콘텐츠 관리**(Instagram API)를 고르고 앱을 만든다.
3. 앱의 **앱 역할 → 역할**에서 두 인스타 계정을 **Instagram 테스터**로 초대한다.
4. 각 인스타 계정에서 초대를 수락한다(인스타 웹 **설정 → 웹사이트 권한 → 앱 및 웹사이트 → 테스터 초대**).
5. 앱의 **Instagram 로그인을 사용한 API 설정** 화면에서 **계정 추가**로 두 계정을 연결한다.
6. 계정마다 **토큰 생성**을 눌러 접근 키를 받는다. 권한에 `instagram_business_basic`과 `instagram_business_content_publish`가 있어야 한다.

### 4. 접근 키를 Secrets에 넣기

접근 키는 두 방식 중 하나면 된다(`scripts/lib.mjs`).

- **계정별 인스타 로그인 토큰(60일):** Meta 앱 "2. 액세스 토큰 생성"에서 계정마다 받은 키. 아래 2·3번처럼 `IG_TOKEN_HUGIDAM`, `IG_TOKEN_SAJU`에 넣는다. 매주 자동 갱신(5단계 GH_PAT 필요).
- **시스템 사용자 토큰(만료 없음):** 하나로 두 계정. `IG_SYSTEM_TOKEN`에 넣고, 점검 결과에 계정 ID가 안 잡히면 저장소 Variables에 `IG_USER_ID_HUGIDAM`·`IG_USER_ID_SAJU`를 넣는다. 이때는 5단계가 필요 없다.


1. 저장소 **Settings → Secrets and variables → Actions → New repository secret**을 누른다.
2. 이름 `IG_TOKEN_HUGIDAM`에 후기담 계정의 접근 키를 넣는다.
3. 이름 `IG_TOKEN_SAJU`에 사주 계정의 접근 키를 넣는다.

### 5. (권장) 자동 갱신용 GH_PAT 넣기

1. GitHub **Settings → Developer settings → Fine-grained tokens → Generate new token**을 누른다.
2. **Repository access**는 `sns-autopost`만, **Permissions → Secrets**는 `Read and write`로 고른다.
3. 만든 토큰을 저장소 Secrets에 이름 `GH_PAT`로 넣는다.

GH_PAT가 없으면 "접근 키 갱신"이 매주 실패 메일을 보낸다. 그때는 3-6단계로 새 키를 받아 4단계처럼 바꾼다(60일 안에).

### 6. 확인하기

1. 저장소 **Actions → 점검 → Run workflow**를 누른다. 두 계정 이름, 게시 한도, 다음 예정 5편, 영상 주소 OK가 보이면 된다.
2. **Actions → 릴스 자동 게시 → Run workflow**를 `dry_run` 체크한 채로 누른다. 지금 올릴 차례인 편(있다면)이 표시되고, 실제로는 올리지 않는다.

이제부터 매시간 자동으로 돈다.

## 대기열 바꾸기

- **시각 바꾸기:** `queue.json`에서 그 편의 `"at"`을 고친다(한국 시간, `"2026-11-04 21:00"` 형식). 커밋해서 올리면 다음 실행부터 반영된다.
- **한 편 빼기:** `queue.json`에서 그 항목을 지운다.
- **처음부터 다시 만들기:** 이 PC에서 실행한다. `--start`부터 `--every`일마다 한 편씩(기본 매일) 날짜를 매기고, 이미 올린 편(posted.json)은 건너뛴다.

```bash
node scripts/build-queue.mjs --start 2026-11-04 --every 1 --hugidam-time 21:00 --saju-time 22:00
```

- **새 릴스 추가:** 영상을 `media/<계정>/`에 넣고 `queue.json`에 항목을 더한다.

```json
{ "id": "saju-r17", "account": "saju", "at": "2026-11-23 22:00", "title": "제목", "video": "media/saju/r17.mp4", "caption": "캡션과 해시태그", "thumbOffsetMs": 400 }
```

`id`는 겹치면 안 된다. 표지는 `"cover": "media/saju/r17.jpg"`(표지 이미지, JPEG)가 있으면 그걸 쓰고, 없으면 `thumbOffsetMs`(영상 속 장면의 시각, 밀리초)를 쓴다.
