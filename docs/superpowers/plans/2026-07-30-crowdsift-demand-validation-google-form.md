# CrowdSift Demand Validation Google Form Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create and verify a live Google Form that measures YouTube creators' harmful-comment experience, current behavior, CrowdSift feature demand, willingness to pay, and beta interest.

**Architecture:** Build one native Google Form with seven sections. Use answer-based section navigation for the YouTube-operator screener and the optional beta-contact path, keep responses anonymous by default, and verify the complete respondent flow in Preview before sharing the observed form URL.

**Tech Stack:** Google Forms, Google Drive, authenticated in-app browser

## Global Constraints

- Use the exact approved content in `docs/superpowers/specs/2026-07-30-crowdsift-demand-validation-google-form-design.md`.
- Do not enable automatic email collection, sign-in requirements, or one-response limits.
- Do not describe CrowdSift as automatically deleting comments without creator confirmation.
- Do not claim to determine or guarantee whether legal action is possible.
- Preserve the distinction between source comments and sanitized feedback.
- Never invent useful feedback when an example contains abuse without a useful signal.
- Return only form and edit URLs observed from Google Forms; never synthesize URLs.

---

### Task 1: Create and configure the native Google Form

**Files:**
- Read: `docs/superpowers/specs/2026-07-30-crowdsift-demand-validation-google-form-design.md`
- Create remotely: one native Google Form

**Interfaces:**
- Consumes: approved title, introduction, privacy constraints, and completion message
- Produces: an editable Google Form with anonymous-response settings

- [ ] **Step 1: Open Google Forms in the authenticated browser**

Navigate to `https://forms.google.com/`. If authentication is required, stop and ask the user to sign in in the selected browser.

- [ ] **Step 2: Create a blank form**

Create exactly one blank form. Do not use a template because the approved structure and wording are custom.

- [ ] **Step 3: Set the title and introduction**

Set the title to `YouTube 댓글 관리 경험 및 AI 댓글 도구 수요 조사` and copy the approved description exactly from the design spec.

- [ ] **Step 4: Configure response settings**

Set:

- automatic email collection: off
- sign-in requirement: off
- limit to one response: off
- shuffle question order: off
- progress bar: on
- edit after submission: off
- automatic response receipt: off
- quiz mode: off

- [ ] **Step 5: Set the confirmation message**

Use the exact approved completion message from the design spec.

### Task 2: Create screening, experience, and behavior sections

**Files:**
- Read: `docs/superpowers/specs/2026-07-30-crowdsift-demand-validation-google-form-design.md`
- Modify remotely: the Google Form created in Task 1

**Interfaces:**
- Consumes: Questions 1–11 and their required-state definitions
- Produces: Sections 1–3 with the first eligibility branch and all pre-concept behavior questions

- [ ] **Step 1: Create Section 1 and Question 1**

Create `응답 대상 확인`. Add the required multiple-choice screener. Route `예` to Section 2 and `아니요` to submit the form.

- [ ] **Step 2: Create Section 2 and Questions 2–7**

Create `채널과 댓글 관리 경험`. Add each question, type, option, scale label, and required state exactly as specified.

- [ ] **Step 3: Create Section 3 and Questions 8–11**

Create `댓글을 계속 읽는 이유와 현재 대응 방식`. Add each question, type, option, and required state exactly as specified.

- [ ] **Step 4: Inspect Questions 1–11**

Confirm that service concept copy does not appear before Question 12 and that optional checkbox questions remain optional.

### Task 3: Create concept, pricing, contact, and free-response sections

**Files:**
- Read: `docs/superpowers/specs/2026-07-30-crowdsift-demand-validation-google-form-design.md`
- Modify remotely: the Google Form created in Task 1

**Interfaces:**
- Consumes: approved concept copy, example, Questions 12–19, and beta-contact branching
- Produces: Sections 4–7 and the complete respondent journey

- [ ] **Step 1: Create Section 4 and its concept description**

Create `CrowdSift 서비스 콘셉트 평가`. Copy the five product statements, legal limitation, source example, and sanitized-feedback example exactly.

- [ ] **Step 2: Add Questions 12–15**

Create the feature-usefulness multiple-choice grid and the use-intent, preferred-automation, and concern questions with exact rows, columns, options, and required states.

- [ ] **Step 3: Create Section 5 and Questions 16–17**

Create `지불 의향과 베타 테스트`. Add the price question and beta-interest question. Route both positive/maybe beta choices to Section 6 and the negative choice to Section 7.

- [ ] **Step 4: Create Section 6 and Question 18**

Create `선택적 연락처`. Add the optional short-answer email question and apply email-address response validation. Continue to Section 7.

- [ ] **Step 5: Create Section 7 and Question 19**

Create `자유 의견`. Add the optional paragraph question and submit after this section.

### Task 4: Preview and verify the live form

**Files:**
- Read: `docs/superpowers/specs/2026-07-30-crowdsift-demand-validation-google-form-design.md`
- Inspect remotely: edit view and Preview view of the created Google Form

**Interfaces:**
- Consumes: completed form from Tasks 1–3
- Produces: verified edit URL, respondent URL, and a concise validation report

- [ ] **Step 1: Verify structural counts**

Confirm that the form has seven sections and Questions 1–19 in order.

- [ ] **Step 2: Verify the eligible respondent path**

In Preview, select `예` for Question 1 and confirm the path reaches Sections 2–5. Select a positive beta response and confirm Section 6 appears before Section 7.

- [ ] **Step 3: Verify the ineligible respondent path**

Reload Preview, select `아니요` for Question 1, and confirm the form ends without exposing the remaining survey.

- [ ] **Step 4: Verify the no-contact path**

Reload Preview, follow the eligible path, select `참여 의향 없음` for Question 17, and confirm Section 6 is skipped while Section 7 remains available.

- [ ] **Step 5: Verify settings and wording**

Confirm anonymous-response settings, required/optional states, masked harmful-language example, creator-confirmation wording, evidence-preservation wording, and legal limitation.

- [ ] **Step 6: Return observed URLs**

Copy the edit URL and respondent URL exactly as shown by Google Forms. Do not submit a test response unless required for verifying a route, and if a test response is submitted, identify and remove only that response.
