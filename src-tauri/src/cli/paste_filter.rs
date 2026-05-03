#[derive(Debug, Clone, Copy)]
pub struct PasteFilterConfig {
    pub min_chars: usize,
    pub threshold: f64,
    pub include_paste_like: bool,
}

#[derive(Debug, Clone)]
pub struct PasteLikeResult {
    pub is_paste_like: bool,
    pub ratio: f64,
    pub features: Vec<&'static str>,
}

pub fn should_filter_paste_like(text: &str, config: &PasteFilterConfig) -> bool {
    !config.include_paste_like && is_paste_like(text, config).is_paste_like
}

pub fn is_paste_like(text: &str, config: &PasteFilterConfig) -> PasteLikeResult {
    if config.include_paste_like || text.chars().count() < config.min_chars {
        return PasteLikeResult {
            is_paste_like: false,
            ratio: 0.0,
            features: Vec::new(),
        };
    }

    let lines: Vec<&str> = text.lines().collect();
    let total_lines = lines.len().max(1);
    let mut paste_lines = 0usize;
    let mut features = Vec::new();

    let fenced_ratio = fenced_code_ratio(&lines);
    if fenced_ratio > 0.0 {
        features.push("fenced_code");
    }

    let diff_lines = count_matching_lines(&lines, is_diff_line);
    if diff_lines > 0 {
        features.push("diff");
    }

    let structured_lines = count_matching_lines(&lines, is_structured_line);
    if structured_lines > 0 {
        features.push("structured_data");
    }

    let log_lines = count_matching_lines(&lines, is_log_or_trace_line);
    if log_lines > 0 {
        features.push("log_or_trace");
    }

    let shell_lines = count_matching_lines(&lines, is_shell_output_line);
    if shell_lines > 0 {
        features.push("shell_output");
    }

    let long_lines = lines
        .iter()
        .filter(|line| line.chars().count() >= 140)
        .count();
    if long_lines > 0 {
        features.push("long_lines");
    }

    paste_lines = paste_lines.max((fenced_ratio * total_lines as f64).round() as usize);
    paste_lines = paste_lines.max(diff_lines);
    paste_lines = paste_lines.max(structured_lines);
    paste_lines = paste_lines.max(log_lines);
    paste_lines = paste_lines.max(shell_lines);
    paste_lines = paste_lines.max(long_lines);

    let non_natural_ratio = non_natural_line_ratio(&lines);
    if non_natural_ratio >= config.threshold {
        features.push("low_natural_language_ratio");
    }

    let ratio = (paste_lines as f64 / total_lines as f64).max(non_natural_ratio);
    PasteLikeResult {
        is_paste_like: ratio >= config.threshold,
        ratio,
        features,
    }
}

fn fenced_code_ratio(lines: &[&str]) -> f64 {
    let mut in_fence = false;
    let mut fenced = 0usize;
    for line in lines {
        if line.trim_start().starts_with("```") || line.trim_start().starts_with("~~~") {
            in_fence = !in_fence;
            fenced += 1;
            continue;
        }
        if in_fence {
            fenced += 1;
        }
    }
    fenced as f64 / lines.len().max(1) as f64
}

fn count_matching_lines(lines: &[&str], predicate: fn(&str) -> bool) -> usize {
    lines.iter().filter(|line| predicate(line.trim())).count()
}

fn is_diff_line(line: &str) -> bool {
    line.starts_with("diff --git")
        || line.starts_with("@@")
        || line.starts_with("+++")
        || line.starts_with("---")
        || line.starts_with('+')
        || line.starts_with('-')
}

fn is_structured_line(line: &str) -> bool {
    if line.is_empty() {
        return false;
    }
    let starts_structured = matches!(line.chars().next(), Some('{' | '}' | '[' | ']' | '<'));
    starts_structured
        || line.contains(": {")
        || line.contains(": [")
        || line.starts_with('"') && line.contains(':')
        || line.starts_with('-') && line.contains(':')
}

fn is_log_or_trace_line(line: &str) -> bool {
    line.starts_with("at ")
        || line.contains("stack backtrace")
        || line.contains("Traceback (most recent call last)")
        || line.contains("Exception")
        || line.contains(" ERROR ")
        || line.contains(" WARN ")
        || line.starts_with("error[")
}

fn is_shell_output_line(line: &str) -> bool {
    line.starts_with('$')
        || line.starts_with('>')
        || line.starts_with("❯")
        || line.starts_with("Compiling ")
        || line.starts_with("Finished ")
        || line.starts_with("Running ")
}

fn non_natural_line_ratio(lines: &[&str]) -> f64 {
    let non_natural = lines
        .iter()
        .filter(|line| {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                return false;
            }
            let chars = trimmed.chars().count();
            let alpha = trimmed.chars().filter(|ch| ch.is_alphabetic()).count();
            let symbols = trimmed
                .chars()
                .filter(|ch| !ch.is_alphanumeric() && !ch.is_whitespace())
                .count();
            chars >= 20 && (alpha * 3 < chars || symbols * 3 > chars)
        })
        .count();
    non_natural as f64 / lines.len().max(1) as f64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn short_input_bypasses_detection() {
        let cfg = PasteFilterConfig {
            min_chars: 50,
            threshold: 0.7,
            include_paste_like: false,
        };
        assert!(!is_paste_like("ok", &cfg).is_paste_like);
    }

    #[test]
    fn dominant_code_block_is_paste_like() {
        let text = "```rust\nfn main() {}\nfn other() {}\n```";
        let cfg = PasteFilterConfig {
            min_chars: 10,
            threshold: 0.7,
            include_paste_like: false,
        };
        assert!(is_paste_like(text, &cfg).is_paste_like);
    }

    #[test]
    fn include_paste_like_bypasses_filtering() {
        let cfg = PasteFilterConfig {
            min_chars: 10,
            threshold: 0.7,
            include_paste_like: true,
        };
        assert!(!should_filter_paste_like("```\ncode\n```", &cfg));
    }
}
