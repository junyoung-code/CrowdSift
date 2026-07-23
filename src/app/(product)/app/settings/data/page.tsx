import { DataDeletionForm } from "./data-deletion-form";

export default function DataSettingsPage() {
  return (
    <div className="data-settings-page">
      <div className="page-heading">
        <div>
          <p>DATA SETTINGS</p>
          <h1>데이터 설정</h1>
          <span>
            CommentHawk가 보관하는 workspace 데이터를 확인하고 삭제할 수
            있습니다.
          </span>
        </div>
      </div>

      <section className="data-settings-card">
        <h2>데이터 보관 원칙</h2>
        <ul>
          <li>원본 YouTube 댓글과 AI 분석 결과를 서로 다른 레코드로 보관합니다.</li>
          <li>사용자의 수정·승인·거절 피드백도 원문과 분리해 기록합니다.</li>
          <li>숨김·삭제 같은 실제 조치는 명시적인 확인 없이는 실행하지 않습니다.</li>
        </ul>
      </section>

      <DataDeletionForm />
    </div>
  );
}
