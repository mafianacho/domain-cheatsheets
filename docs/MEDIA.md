# 그림 · 영상 가이드 (MEDIA)

## 그림

| 항목 | 규칙 |
|---|---|
| 위치 | `assets/<시트 id>/<용어 id>.svg` (예: `assets/ui-design/hero-section.svg`) |
| 형식 | SVG 우선. 사진이 꼭 필요하면 직접 찍었거나 사용권이 확실한 PNG/WebP (가로 640px 이하) |
| 크기 | `viewBox="0 0 320 200"`, 시트에는 `width="320"`로 넣음 |
| 색 | 배경 `#0f172a`, 면 `#1e293b`·`#334155`, 선 `#475569`, 강조 `#f59e0b`, 보조 강조 `#38bdf8`, 글자 `#e2e8f0` |
| 글자 | 그림 안 글자는 최소로. 쓴다면 `font-family="system-ui, sans-serif"` |
| 움직임 | 모션·효과 용어는 SVG 안 `<style>` CSS 애니메이션 허용(GitHub에서 재생됨). 애니메이션이 꺼진 정지 상태만 봐도 뜻이 통하게 그리고, `<style>` 끝에 `@media (prefers-reduced-motion: reduce){*{animation:none!important;transition:none!important}}`를 넣음(`npm run check`가 검사) |
| 금지 | `<script>`, `on*=` 이벤트 속성, 외부 `href`, 남의 이미지·스크린샷·로고 |
| 대체 텍스트 | `alt`에 "무엇을 보여주는 그림인지" 한국어로 |

## 영상 (YouTube)

치트시트는 나중에 YouTube 해설 영상과 짝을 이룹니다. 저장소에는 영상 파일을 올리지 않고 **링크만** 둡니다.

- **시트 하나 = 영상 하나**를 기본으로 합니다. 시트 front matter의 `video:`에 영상 링크를 넣습니다.
- 영상의 챕터는 시트의 `##` 분류 순서를 그대로 따릅니다. 시트의 분류·용어 순서가 곧 대본 순서입니다.
- 용어별 구간은 `- **영상**: https://youtu.be/<id>?t=<초>`로 연결합니다.
- 짧은 클립(쇼츠)은 용어 하나를 다룹니다. 그 링크도 같은 `영상` 필드에 넣습니다.
- 링크는 `https://youtu.be/…`, `https://www.youtube.com/watch?v=…`, `https://www.youtube.com/playlist?list=…`만 허용합니다(`npm run check`가 검사).
- 영상 설명란에는 해당 시트 GitHub 링크를 넣어 시청자가 바로 시트로 올 수 있게 합니다.
- 영상에 쓰는 그림은 `assets/`의 SVG를 그대로 쓰면 저장소와 영상의 그림이 같아집니다.
