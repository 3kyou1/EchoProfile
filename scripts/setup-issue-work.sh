#!/bin/bash
# setup-issue-work.sh - GitHub 이슈 분석 및 작업 환경 자동 세팅
#
# 사용법: ./scripts/setup-issue-work.sh <issue-number>
# 예시:   ./scripts/setup-issue-work.sh 47

set -e

ISSUE_NUMBER=$1
REPO="jhlee0409/claude-code-history-viewer"

if [ -z "$ISSUE_NUMBER" ]; then
    echo "사용법: $0 <issue-number>"
    echo "예시: $0 47"
    exit 1
fi

echo "🔍 이슈 #$ISSUE_NUMBER 분석 중..."

# 이슈 정보 가져오기
ISSUE_JSON=$(gh issue view "$ISSUE_NUMBER" --repo "$REPO" --json number,title,body,labels,state)

ISSUE_TITLE=$(echo "$ISSUE_JSON" | jq -r '.title')
ISSUE_BODY=$(echo "$ISSUE_JSON" | jq -r '.body')
ISSUE_STATE=$(echo "$ISSUE_JSON" | jq -r '.state')
ISSUE_LABELS=$(echo "$ISSUE_JSON" | jq -r '.labels[].name' 2>/dev/null | tr '\n' ', ' | sed 's/,$//')

if [ "$ISSUE_STATE" != "OPEN" ]; then
    echo "⚠️  이슈 #$ISSUE_NUMBER 는 이미 닫혀있습니다."
    read -p "계속 진행하시겠습니까? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# 브랜치명 생성
SLUG=$(echo "$ISSUE_TITLE" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//' | sed 's/-$//' | cut -c1-40)
BRANCH_NAME="issue-${ISSUE_NUMBER}-${SLUG}"

echo ""
echo "📋 이슈 정보:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "번호: #$ISSUE_NUMBER"
echo "제목: $ISSUE_TITLE"
echo "라벨: ${ISSUE_LABELS:-없음}"
echo "브랜치: $BRANCH_NAME"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 브랜치 생성 확인
read -p "브랜치를 생성하고 작업을 시작하시겠습니까? (Y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Nn]$ ]]; then
    echo "취소되었습니다."
    exit 0
fi

# 최신 main 가져오기
echo "📥 최신 main 브랜치 가져오는 중..."
git fetch origin main

# 브랜치 생성 및 체크아웃
echo "🌿 브랜치 생성 중: $BRANCH_NAME"
git checkout -b "$BRANCH_NAME" origin/main 2>/dev/null || git checkout "$BRANCH_NAME"

# 작업 컨텍스트 파일 생성
CONTEXT_FILE=".claude/issue-context.md"
mkdir -p .claude

cat > "$CONTEXT_FILE" << EOF
# 현재 작업 이슈: #$ISSUE_NUMBER

## 이슈 정보
- **제목:** $ISSUE_TITLE
- **라벨:** ${ISSUE_LABELS:-없음}
- **브랜치:** $BRANCH_NAME
- **링크:** https://github.com/$REPO/issues/$ISSUE_NUMBER

## 이슈 본문
$ISSUE_BODY

## 작업 체크리스트
- [ ] 요구사항 분석
- [ ] 관련 코드 탐색
- [ ] 구현
- [ ] 테스트
- [ ] PR 생성

## 분석 노트
<!-- Claude Code가 분석한 내용을 여기에 기록 -->

EOF

echo ""
echo "✅ 작업 환경 준비 완료!"
echo ""
echo "📁 컨텍스트 파일: $CONTEXT_FILE"
echo ""
echo "🚀 다음 단계:"
echo "  1. Claude Code 시작: claude"
echo "  2. 이슈 분석 요청: \"이슈 #$ISSUE_NUMBER 분석해서 작업 계획 세워줘\""
echo "  3. 작업 완료 후 PR: gh pr create --fill"
echo ""
