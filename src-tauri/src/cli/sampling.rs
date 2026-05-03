use std::collections::HashSet;

use chrono::{DateTime, Utc};
use serde::Serialize;

use super::args::SampleStrategy;

#[derive(Debug, Clone)]
pub struct MessageCandidate {
    pub id: String,
    pub provider: String,
    pub session_path: String,
    pub project_path: String,
    pub actual_project_path: String,
    pub timestamp: DateTime<Utc>,
    pub session_last_timestamp: DateTime<Utc>,
    pub text: String,
}

#[derive(Debug, Clone, Copy)]
pub struct SamplingConfig {
    pub budget_chars: usize,
    pub strategy: SampleStrategy,
}

#[derive(Debug, Clone, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OmittedCounts {
    pub paste_like: usize,
    pub over_budget: usize,
    pub single_message_over_budget: usize,
    pub scan_limit_sessions: usize,
    pub scan_limit_messages: usize,
    pub non_text_messages: usize,
}

impl OmittedCounts {
    pub fn add_assign(&mut self, other: &Self) {
        self.paste_like += other.paste_like;
        self.over_budget += other.over_budget;
        self.single_message_over_budget += other.single_message_over_budget;
        self.scan_limit_sessions += other.scan_limit_sessions;
        self.scan_limit_messages += other.scan_limit_messages;
        self.non_text_messages += other.non_text_messages;
    }
}

#[derive(Debug, Clone)]
pub struct SamplingResult {
    pub messages: Vec<MessageCandidate>,
    pub omitted: OmittedCounts,
    pub used_chars: usize,
}

pub fn select_messages(
    candidates: Vec<MessageCandidate>,
    config: SamplingConfig,
) -> SamplingResult {
    let mut ordered = match config.strategy {
        SampleStrategy::Chronological => chronological(candidates),
        SampleStrategy::Recent => recent(candidates),
        SampleStrategy::Representative => representative(candidates),
        SampleStrategy::Mixed => mixed(candidates, config.budget_chars),
    };

    let mut selected = Vec::new();
    let mut used_chars = 0usize;
    let mut omitted = OmittedCounts::default();

    for candidate in ordered.drain(..) {
        let len = candidate.text.chars().count();
        if used_chars + len > config.budget_chars {
            omitted.over_budget += 1;
            continue;
        }
        used_chars += len;
        selected.push(candidate);
    }

    selected.sort_by_key(|candidate| candidate.timestamp);

    SamplingResult {
        messages: selected,
        omitted,
        used_chars,
    }
}

fn chronological(mut candidates: Vec<MessageCandidate>) -> Vec<MessageCandidate> {
    candidates.sort_by_key(|candidate| candidate.timestamp);
    candidates
}

fn recent(mut candidates: Vec<MessageCandidate>) -> Vec<MessageCandidate> {
    candidates.sort_by(|left, right| {
        right
            .session_last_timestamp
            .cmp(&left.session_last_timestamp)
            .then_with(|| left.timestamp.cmp(&right.timestamp))
    });
    candidates
}

fn representative(mut candidates: Vec<MessageCandidate>) -> Vec<MessageCandidate> {
    candidates.sort_by(|left, right| {
        profile_value_score(right)
            .cmp(&profile_value_score(left))
            .then_with(|| left.provider.cmp(&right.provider))
            .then_with(|| left.project_path.cmp(&right.project_path))
            .then_with(|| left.session_path.cmp(&right.session_path))
            .then_with(|| left.timestamp.cmp(&right.timestamp))
    });
    candidates
}

fn mixed(candidates: Vec<MessageCandidate>, budget_chars: usize) -> Vec<MessageCandidate> {
    let half_budget = budget_chars / 2;
    let mut selected = Vec::new();
    let mut seen = HashSet::new();
    let mut used_recent = 0usize;

    for candidate in recent(candidates.clone()) {
        let len = candidate.text.chars().count();
        if used_recent + len > half_budget && !selected.is_empty() {
            continue;
        }
        used_recent += len;
        seen.insert(candidate.id.clone());
        selected.push(candidate);
        if used_recent >= half_budget {
            break;
        }
    }

    for candidate in representative(candidates) {
        if seen.insert(candidate.id.clone()) {
            selected.push(candidate);
        }
    }

    selected
}

fn profile_value_score(candidate: &MessageCandidate) -> usize {
    let text = candidate.text.as_str();
    let keywords = [
        "我希望",
        "我想要",
        "不要",
        "不用",
        "请用",
        "更简洁",
        "更详细",
        "必须",
        "保持",
        "不要动",
        "不要依赖",
        "不对",
        "不是这个意思",
        "你漏了",
        "我选择",
        "我倾向",
        "我推荐",
        "我担心",
        "先讨论",
        "先设计",
        "一步一步",
        "用 skill",
        "不要直接实现",
    ];
    let keyword_score = keywords
        .iter()
        .filter(|keyword| text.contains(**keyword))
        .count()
        * 10;
    let length_score = (text.chars().count() / 200).min(10);
    keyword_score + length_score
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cli::args::SampleStrategy;
    use chrono::{TimeZone, Utc};

    fn candidate(id: &str, len: usize) -> MessageCandidate {
        candidate_at(id, len, 1)
    }

    fn candidate_at(id: &str, len: usize, second: u32) -> MessageCandidate {
        MessageCandidate {
            id: id.to_string(),
            provider: "codex".to_string(),
            session_path: format!("session-{id}"),
            project_path: "codex:///repo".to_string(),
            actual_project_path: "/repo".to_string(),
            timestamp: Utc.with_ymd_and_hms(2026, 4, 30, 0, 0, second).unwrap(),
            session_last_timestamp: Utc.with_ymd_and_hms(2026, 4, 30, 0, 0, second).unwrap(),
            text: "x".repeat(len),
        }
    }

    #[test]
    fn budget_never_truncates_messages() {
        let messages = vec![
            candidate("a", 5),
            candidate("too_long", 20),
            candidate("b", 5),
        ];
        let result = select_messages(
            messages,
            SamplingConfig {
                budget_chars: 10,
                strategy: SampleStrategy::Chronological,
            },
        );
        assert_eq!(
            result
                .messages
                .iter()
                .map(|m| m.id.as_str())
                .collect::<Vec<_>>(),
            vec!["a", "b"]
        );
        assert_eq!(result.omitted.over_budget, 1);
    }

    #[test]
    fn final_output_is_chronological() {
        let messages = vec![candidate_at("new", 5, 2), candidate_at("old", 5, 1)];
        let result = select_messages(
            messages,
            SamplingConfig {
                strategy: SampleStrategy::Recent,
                budget_chars: 100,
            },
        );
        assert_eq!(result.messages[0].id, "old");
    }
}
