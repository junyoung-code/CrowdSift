import {
  EyeSlash,
  ShieldCheck,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";

import type {
  PolicyAction,
  PolicySensitivity,
} from "./policy-service";

export type PolicyFormValues = {
  version: number;
  blocked: string;
  allowed: string;
  contextExceptions: string;
  sensitivity: PolicySensitivity;
  cautionAction: PolicyAction;
  riskAction: PolicyAction;
  harmfulTextHidden: boolean;
};

export function PolicyForm({
  action,
  initial,
}: {
  action: (formData: FormData) => void | Promise<void>;
  initial: PolicyFormValues;
}) {
  return (
    <form action={action} className="policy-form">
      <div className="policy-form-heading">
        <div>
          <p>CREATOR POLICY</p>
          <h2>크리에이터별 운영 기준</h2>
        </div>
        <span>
          {initial.version > 0
            ? `현재 버전 ${initial.version}`
            : "아직 저장된 기준 없음"}
        </span>
      </div>

      <div className="policy-principle">
        <ShieldCheck aria-hidden="true" weight="duotone" />
        <div>
          <strong>추천과 실제 조치를 분리합니다</strong>
          <p>
            금지 표현과 일치해도 자동으로 삭제하지 않습니다. 규칙은 주의가 필요한
            댓글을 찾는 데 사용하고, 실제 숨김·삭제는 사용자가 확인합니다.
          </p>
        </div>
      </div>

      <div className="policy-textarea-grid">
        <label>
          <span>주의해서 볼 표현</span>
          <small>
            한 줄에 하나씩. 이 표현이 나오면 등급을 올리지 않고 한 번 더
            확인합니다.
          </small>
          <textarea
            aria-label="주의해서 볼 표현"
            defaultValue={initial.blocked}
            name="blocked"
            placeholder={"반복 광고\n사기 링크\n원치 않는 표현"}
            rows={7}
          />
        </label>
        <label>
          <span>허용할 표현</span>
          <small>
            이 채널에서 칭찬으로 쓰이는 말입니다. 다음 분류부터 이 표현 때문에
            주의로 올리지 않습니다.
          </small>
          <textarea
            aria-label="허용할 표현"
            defaultValue={initial.allowed}
            name="allowed"
            placeholder={"팬덤 별명\n채널에서 허용한 농담"}
            rows={7}
          />
        </label>
        <label>
          <span>맥락 예외</span>
          <small>
            `표현 | 설명` 형식으로 기록해 둡니다. <b>아직 분류에는 쓰이지
            않습니다.</b>
          </small>
          <textarea
            aria-label="맥락 예외"
            defaultValue={initial.contextExceptions}
            name="contextExceptions"
            placeholder={"우리끼리 쓰는 말 | 팬들 사이에서는 칭찬\n게임 용어 | 플레이 맥락에서는 허용"}
            rows={7}
          />
        </label>
      </div>

      <div className="policy-select-grid">
        <label>
          <span>전체 민감도</span>
          <select defaultValue={initial.sensitivity} name="sensitivity">
            <option value="low">낮음 — 명확한 문제 위주</option>
            <option value="standard">표준 — 균형 있게 검토</option>
            <option value="high">높음 — 애매한 댓글도 검토</option>
          </select>
        </label>
        <label>
          <span>주의 댓글 추천</span>
          <select defaultValue={initial.cautionAction} name="cautionAction">
            <option value="none">추천 없음</option>
            <option value="review">사용자 검토</option>
            <option value="hold_for_review">검토 보류</option>
          </select>
          <small>아직 분류에는 쓰이지 않습니다.</small>
        </label>
        <label>
          <span>위험 댓글 추천</span>
          <select defaultValue={initial.riskAction} name="riskAction">
            <option value="review">사용자 검토</option>
            <option value="hold_for_review">검토 보류</option>
            <option value="none">추천 없음</option>
          </select>
          <small>아직 분류에는 쓰이지 않습니다.</small>
        </label>
      </div>

      <label className="harmful-text-setting">
        <input
          defaultChecked={initial.harmfulTextHidden}
          name="harmfulTextHidden"
          type="checkbox"
        />
        <EyeSlash aria-hidden="true" weight="duotone" />
        <span>
          <strong>유해할 수 있는 댓글 원문을 기본으로 가립니다</strong>
          <small>
            Inbox에서 사용자가 직접 펼치기 전까지 원문을 노출하지 않습니다.
          </small>
        </span>
      </label>

      <div className="policy-version-note">
        <WarningCircle aria-hidden="true" weight="fill" />
        <p>
          저장하면 기존 기준을 수정하지 않고 새 버전을 만듭니다. 과거 분석이 어떤
          기준을 사용했는지 계속 추적할 수 있습니다.
        </p>
      </div>

      <button className="button button-primary" type="submit">
        새 운영 기준 버전 저장
      </button>
    </form>
  );
}
