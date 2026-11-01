# Domain Cheatsheets MCP Server

AI 에이전트가 [치트시트](../README.md)를 직접 찾아보게 해 주는 [MCP](https://modelcontextprotocol.io) 서버입니다.
저장소의 `cheatsheets/*.md`를 그대로 읽으므로, 시트를 고치면 서버 내용도 같이 바뀝니다.

## 제공 기능

| 이름 | 종류 | 하는 일 |
|---|---|---|
| `list_domains` | tool | 도메인 목록, 요약, 분류, 용어 수 (`tag`로 거르기) |
| `search_terms` | tool | 한국어·영어로 용어 검색. 사용자의 애매한 말을 정확한 용어로 연결 |
| `get_term` | tool | 용어 카드: 정의, AI 요청 예시, 헷갈리는 말, 확인 질문, 그림·페이지 링크 |
| `get_cheatsheet` | tool | 시트 전체 또는 분류 하나를 마크다운으로 |
| `cheatsheet://{domain}` | resource | 시트 전체 마크다운 |
| `sync_up` | prompt | 작업 전에 시트 용어로 요청을 다시 정리하고 확인 질문을 하게 하는 프롬프트 |

모든 도구는 읽기 전용입니다. 외부 네트워크 호출이나 파일 쓰기를 하지 않습니다.

## 설치

Node.js 22 이상이 필요합니다.

```bash
git clone https://github.com/mafianacho/domain-cheatsheets.git
cd domain-cheatsheets/mcp-server
npm ci
npm run build
```

## 로컬 연결 (stdio)

MCP 클라이언트 설정에 아래처럼 넣습니다. 경로는 내려받은 위치로 바꿉니다.

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

Claude Code에서는 이렇게 추가할 수 있습니다.

```bash
claude mcp add domain-cheatsheets -- node /path/to/domain-cheatsheets/mcp-server/dist/src/stdio.js
```

## HTTP 서버 (Streamable HTTP)

여러 에이전트가 함께 쓰는 서버로 띄울 때 사용합니다. 세션을 저장하지 않는(stateless) 방식입니다.

```bash
HOST=127.0.0.1 PORT=8787 npm run start:http
# POST http://127.0.0.1:8787/mcp   ← MCP 엔드포인트
# GET  http://127.0.0.1:8787/healthz
```

인증이 없으므로 공개 인터넷에 열 때는 앞단에 리버스 프록시와 요청량 제한을 두세요.

## 환경 변수

| 변수 | 기본값 | 뜻 |
|---|---|---|
| `CHEATSHEETS_ROOT` | 저장소 루트 자동 탐지 | `cheatsheets/`가 있는 폴더 |
| `CHEATSHEETS_PAGE_BASE` | `https://github.com/mafianacho/domain-cheatsheets/blob/main/` | 시트 페이지 링크의 앞부분 |
| `CHEATSHEETS_RAW_BASE` | `https://raw.githubusercontent.com/mafianacho/domain-cheatsheets/main/` | 그림 링크의 앞부분 |
| `HOST`, `PORT` | `127.0.0.1`, `8787` | HTTP 서버 주소 |

## 개발

```bash
npm run generate   # 시트의 '한눈에 보기' 표와 README 도메인 목록 갱신
npm run previews   # README용 시트별 미리보기 GIF (assets/previews/) 생성, Chrome 필요 (CHROME_BIN)
npm run check      # 시트 형식·그림·링크·자동 생성 구역 검사 (CI와 같음)
npm test           # 파서 + MCP(stdio, HTTP) 시험
```

시트 형식은 [docs/FORMAT.md](../docs/FORMAT.md)에 있습니다.
