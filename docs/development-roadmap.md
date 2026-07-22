# CommentHawk 개발 로드맵

이 문서는 CommentHawk를 구현하기 위한 큰 개발 흐름을 보여줍니다. 각 노드는 계획이며 현재 완료 상태를 의미하지 않습니다.

```mermaid
flowchart TD
    ROOT["CommentHawk 구현 로드맵"]
    MVP["통합 MVP: 실제 댓글 수집 → AI 분석 → 사용자 검토·조치"]

    subgraph FRONTEND["1. Frontend"]
        direction TB
        F0["화면과 사용자 경험"]
        F1["Front-end 공통 기반과 디자인 시스템"]
        F2["서비스 소개와 사용자 웹 페이지"]
        F3["대시보드와 Comment Inbox"]
        F4["로딩·빈 상태·오류·연결 해제 화면"]
        F5["반응형·키보드·접근성 검증"]
        FD["Frontend 준비 완료"]
        F0 --> F1 --> F2 --> F3 --> F4 --> F5 --> FD
    end

    subgraph BACKEND["2. Backend"]
        direction TB
        B0["연결과 데이터"]
        B1["Supabase 스키마와 원본 데이터 분리"]
        B2["앱 인증과 Google OAuth 경계"]
        B3["YouTube 영상과 댓글 20–50개 수집"]
        B4["페이지네이션·중복 방지·재시도"]
        B5["동기화 상태와 감사 로그"]
        BD["Backend 준비 완료"]
        B0 --> B1 --> B2 --> B3 --> B4 --> B5 --> BD
    end

    subgraph AI["3. AI"]
        direction TB
        A0["분류와 인사이트"]
        A1["댓글 분류 카테고리와 신뢰도 계약"]
        A2["구조화 출력·스키마 검증·재시도"]
        A3["의미를 보존한 정제 피드백"]
        A4["Q&A Radar와 Signal Digest"]
        A5["한국어 평가셋·품질·비용 관리"]
        AD["AI 준비 완료"]
        A0 --> A1 --> A2 --> A3 --> A4 --> A5 --> AD
    end

    subgraph SECURITY["4. Security"]
        direction TB
        S0["권한과 보호"]
        S1["Secret과 refresh token 보호"]
        S2["RLS·테넌트 격리·최소 권한"]
        S3["증거 저장 후 사용자 승인 조치"]
        S4["보관·내보내기·삭제 정책"]
        S5["실패 복구·속도 제한·안전한 로그"]
        SD["Security 준비 완료"]
        S0 --> S1 --> S2 --> S3 --> S4 --> S5 --> SD
    end

    ROOT --> F0
    ROOT --> B0
    ROOT --> A0
    ROOT --> S0
    FD --> MVP
    BD --> MVP
    AD --> MVP
    SD --> MVP

    classDef roadmap fill:#0f172a,color:#ffffff,stroke:#0f172a,stroke-width:2px
    classDef frontend fill:#dbeafe,color:#1e3a8a,stroke:#60a5fa
    classDef backend fill:#e0e7ff,color:#312e81,stroke:#818cf8
    classDef ai fill:#ede9fe,color:#581c87,stroke:#a78bfa
    classDef security fill:#ffedd5,color:#7c2d12,stroke:#fb923c
    classDef goal fill:#dcfce7,color:#14532d,stroke:#4ade80,stroke-width:2px

    class ROOT roadmap
    class F0,FD frontend
    class B0,BD backend
    class A0,AD ai
    class S0,SD security
    class MVP goal
```

## 수정 방법

1. 이 파일의 Mermaid 코드에서 노드나 연결선을 수정합니다.
2. 변경 내용을 Git 커밋으로 남깁니다.
3. 팀 작업에서는 Pull Request로 검토한 뒤 병합합니다.

실제 작업 상태와 담당자 관리는 추후 GitHub Issues 또는 GitHub Projects를 단일 원본으로 사용합니다.
