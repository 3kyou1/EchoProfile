use chrono::{DateTime, Duration, NaiveDate, TimeZone, Utc};

use super::output::CliError;

#[derive(Debug, Clone, Copy, Default)]
pub struct TimeRange {
    pub since: Option<DateTime<Utc>>,
    pub until: Option<DateTime<Utc>>,
}

impl TimeRange {
    pub fn from_args(
        since: Option<&str>,
        until: Option<&str>,
        now: DateTime<Utc>,
    ) -> Result<Self, CliError> {
        let range = Self {
            since: since.map(|value| parse_time_arg(value, now)).transpose()?,
            until: until.map(|value| parse_time_arg(value, now)).transpose()?,
        };
        if let (Some(since), Some(until)) = (range.since, range.until) {
            if since > until {
                return Err(CliError::new(
                    "INVALID_TIME_RANGE",
                    "--since must be earlier than or equal to --until.",
                ));
            }
        }
        Ok(range)
    }

    pub fn contains(&self, timestamp: DateTime<Utc>) -> bool {
        if self.since.is_some_and(|since| timestamp < since) {
            return false;
        }
        if self.until.is_some_and(|until| timestamp > until) {
            return false;
        }
        true
    }
}

pub fn parse_time_arg(value: &str, now: DateTime<Utc>) -> Result<DateTime<Utc>, CliError> {
    if let Some(relative) = parse_relative_time(value, now) {
        return Ok(relative);
    }

    if let Ok(datetime) = DateTime::parse_from_rfc3339(value) {
        return Ok(datetime.with_timezone(&Utc));
    }

    if let Ok(date) = NaiveDate::parse_from_str(value, "%Y-%m-%d") {
        let datetime = date.and_hms_opt(0, 0, 0).ok_or_else(|| {
            CliError::new("INVALID_TIME_RANGE", format!("Invalid date value: {value}"))
        })?;
        return Ok(Utc.from_utc_datetime(&datetime));
    }

    Err(CliError::new(
        "INVALID_TIME_RANGE",
        format!("Invalid time value: {value}"),
    ))
}

pub fn parse_rfc3339_opt(value: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .map(|datetime| datetime.with_timezone(&Utc))
        .ok()
}

fn parse_relative_time(value: &str, now: DateTime<Utc>) -> Option<DateTime<Utc>> {
    if value.len() < 2 {
        return None;
    }
    let (amount, unit) = value.split_at(value.len() - 1);
    let amount = amount.parse::<i64>().ok()?;
    if amount < 0 {
        return None;
    }
    let duration = match unit {
        "d" => Duration::days(amount),
        "h" => Duration::hours(amount),
        "m" => Duration::minutes(amount),
        _ => return None,
    };
    Some(now - duration)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{TimeZone, Utc};

    fn fixed_now() -> chrono::DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 4, 30, 12, 0, 0).unwrap()
    }

    #[test]
    fn parses_iso_date_as_start_of_day_utc() {
        let parsed = parse_time_arg("2026-04-30", fixed_now()).unwrap();
        assert_eq!(parsed.to_rfc3339(), "2026-04-30T00:00:00+00:00");
    }

    #[test]
    fn parses_relative_days() {
        let now = fixed_now();
        let parsed = parse_time_arg("30d", now).unwrap();
        assert_eq!(parsed, now - chrono::Duration::days(30));
    }
}
