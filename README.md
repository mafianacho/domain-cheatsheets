# Domain Cheatsheets

**모르는 분야도 AI에게 정확히 시킬 수 있게.** 도메인별 용어 사전입니다.

UI 디자인, 모션, 3D 모델링 같은 기술 분야부터 법, 패션, 건설, 회계 같은 전문 분야까지 담습니다.
용어마다 그림, 한 줄 정의, AI에게 그대로 보낼 수 있는 요청 문장이 붙어 있습니다.
사람은 이 페이지에서 바로 찾아보고, AI 에이전트는 [MCP 서버](mcp-server/README.md)로 같은 내용을 읽습니다.

> 목표는 **사용자와 AI의 싱크업**입니다. 사용자는 정확한 단어로 요청하고, AI는 같은 단어로 확인하고 작업합니다.

## 도메인 목록

<!-- index:start -->
<!-- 이 구역은 자동 생성됩니다. `cd mcp-server && npm run generate` -->

도메인 7개 · 용어 222개

### 기술 · 디자인

| 도메인 | 이럴 때 펼쳐 보세요 | 용어 |
|---|---|---:|
| [3D 모델링 · 3D Modeling](cheatsheets/3d-modeling.md) | 3D 모델·캐릭터·소품을 AI나 3D 아티스트에게 주문하거나 검수할 때 쓰는 형태·표면·움직임·렌더·파일 용어 | 30 |
| [모션 디자인 · Motion Design](cheatsheets/motion-design.md) | 앱·웹·영상 인트로·로고에 움직임을 넣고 싶은데 뭐라고 말해야 할지 모를 때 펼치는 타이밍·이징·기법·형식 용어 | 28 |
| [UI 디자인 · UI Design](cheatsheets/ui-design.md) | 화면의 레이아웃·내비게이션·컴포넌트·효과를 AI에게 말로 정확히 설명해야 할 때 펼치는 용어집 | 36 |

### 전문 분야

| 도메인 | 이럴 때 펼쳐 보세요 | 용어 |
|---|---|---:|
| [회계 · 세무 기초 · Accounting & Tax Basics](cheatsheets/accounting.md) | 재무제표를 읽고, 세무사와 대화하고, AI에게 장부·대시보드를 시킬 때 필요한 회계·세무 기본 용어 | 32 |
| [건설 · 인테리어 · Construction & Interior](cheatsheets/construction.md) | 가게·집 공사, 작은 건물 신축, 시공사 견적서·도면을 볼 때 쓰는 도면·면적·구조·마감·계약 용어 | 34 |
| [패션 · Fashion](cheatsheets/fashion.md) | 옷을 AI 이미지 생성기·스타일리스트·봉제 공장에 정확히 설명해야 할 때 쓰는 실루엣·디테일·소재·무늬·생산 용어 | 32 |
| [법률 기초 · Law Basics](cheatsheets/law.md) | 계약·분쟁·지식재산·개인정보·사업 관련 법률 용어를 모를 때, AI나 변호사에게 정확히 말하기 위해 여는 시트 | 30 |

<!-- index:end -->

## 이렇게 쓰세요

**1. 사람이 직접 볼 때**
도메인 시트를 열고 그림을 훑어 원하는 모양을 찾습니다. 용어 아래 `AI에게 이렇게` 문장을 복사해 AI에게 보냅니다.

**2. AI에게 시트를 같이 주고 싶을 때**
시트 링크나 파일 내용을 대화에 붙이고 이렇게 말합니다.

```text
이 치트시트의 용어로 내 요청을 다시 정리해 줘.
모르는 부분은 시트의 '확인 질문'을 참고해서 먼저 물어보고, 정리가 끝나면 작업을 시작해.
```

**3. 에이전트가 직접 찾게 할 때 (MCP)**
Claude, Cursor, Codex 같은 MCP 클라이언트에 이 저장소의 MCP 서버를 연결하면, 에이전트가 필요한 용어를 스스로 검색합니다.

```json
{
  "mcpServers": {
    "domain-cheatsheets": {
      "command": "node",
      "args": ["/path/to/domain-cheatsheets/mcp-server/dist/src/stdio.js"]
    }
  }
}
```

설치와 HTTP 서버 실행 방법은 [mcp-server/README.md](mcp-server/README.md)에 있습니다.

## 저장소 구조

```text
README.md            ← 지금 이 페이지 (도메인 목록)
cheatsheets/         ← 도메인별 시트. 파일 하나에 그 도메인의 모든 용어
assets/<도메인>/     ← 시트에 들어가는 그림 (SVG)
docs/                ← 작성 규칙(FORMAT), 템플릿, 그림·영상 가이드
mcp-server/          ← AI 에이전트용 MCP 서버 (stdio · Streamable HTTP)
```

## 기여하기

새 도메인이나 용어를 추가하고 싶다면 [CONTRIBUTING.md](CONTRIBUTING.md)와 [작성 규칙](docs/FORMAT.md)을 봐 주세요.
그림과 영상 규칙은 [docs/MEDIA.md](docs/MEDIA.md)에 있습니다.

## 주의

법, 회계, 건설처럼 전문 분야 시트는 용어를 이해하고 대화하기 위한 참고 자료입니다.
법률·세무·회계·안전 판단을 대신하지 않으니, 실제 결정은 해당 분야 전문가와 확인하세요.

## 라이선스

[Apache License 2.0](LICENSE) · Made by [마피아나초](https://mafianacho.com)
