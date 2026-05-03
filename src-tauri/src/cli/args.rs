use clap::{Args, Parser, Subcommand, ValueEnum};

#[derive(Debug, Parser)]
#[command(
    name = "echo-profile",
    disable_help_flag = true,
    disable_help_subcommand = true
)]
pub struct CliArgs {
    #[arg(long, global = true)]
    pub json: bool,
    #[command(subcommand)]
    pub command: CliCommand,
}

#[derive(Debug, Subcommand)]
pub enum CliCommand {
    Help(HelpArgs),
    Version,
    List(ListArgs),
    Profile(ProfileArgs),
    Serve(ServeArgs),
}

#[derive(Debug, Args)]
pub struct HelpArgs {
    pub topic: Vec<String>,
}

#[derive(Debug, Args)]
pub struct ServeArgs {
    #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
    pub args: Vec<String>,
}

#[derive(Debug, Args)]
pub struct ListArgs {
    #[command(subcommand)]
    pub command: ListCommand,
}

#[derive(Debug, Subcommand)]
pub enum ListCommand {
    Providers(ProviderListArgs),
    Projects(ProjectListArgs),
    Sessions(SessionListArgs),
}

#[derive(Debug, Args, Default)]
pub struct ProviderListArgs {
    #[arg(long = "provider")]
    pub providers: Vec<String>,
    #[arg(long = "providers")]
    pub providers_csv: Option<String>,
}

#[derive(Debug, Args, Default)]
pub struct ProjectListArgs {
    #[arg(long = "provider")]
    pub providers: Vec<String>,
    #[arg(long = "providers")]
    pub providers_csv: Option<String>,
    #[arg(long, default_value_t = 50)]
    pub limit: usize,
    #[arg(long, default_value_t = 0)]
    pub offset: usize,
    #[arg(long)]
    pub since: Option<String>,
    #[arg(long)]
    pub until: Option<String>,
    #[arg(long)]
    pub no_cache: bool,
}

#[derive(Debug, Args, Default)]
pub struct SessionListArgs {
    #[arg(long = "provider")]
    pub providers: Vec<String>,
    #[arg(long = "providers")]
    pub providers_csv: Option<String>,
    #[arg(long, default_value_t = 50)]
    pub limit: usize,
    #[arg(long, default_value_t = 0)]
    pub offset: usize,
    #[arg(long)]
    pub current_project: bool,
    #[arg(long)]
    pub include_ancestor_projects: bool,
    #[arg(long)]
    pub actual_project_path: Option<String>,
    #[arg(long)]
    pub project_path: Option<String>,
    #[arg(long)]
    pub since: Option<String>,
    #[arg(long)]
    pub until: Option<String>,
    #[arg(long)]
    pub no_cache: bool,
}

#[derive(Debug, Args)]
pub struct ProfileArgs {
    #[command(subcommand)]
    pub command: ProfileCommand,
}

#[derive(Debug, Subcommand)]
pub enum ProfileCommand {
    Collect(CollectArgs),
}

#[derive(Debug, Args)]
#[allow(clippy::struct_excessive_bools)]
pub struct CollectArgs {
    #[arg(long, value_enum)]
    pub scope: CollectScope,
    #[arg(long = "provider")]
    pub providers: Vec<String>,
    #[arg(long = "providers")]
    pub providers_csv: Option<String>,
    #[arg(long)]
    pub current_project: bool,
    #[arg(long)]
    pub include_ancestor_projects: bool,
    #[arg(long)]
    pub actual_project_path: Option<String>,
    #[arg(long)]
    pub project_path: Option<String>,
    #[arg(long)]
    pub session_path: Option<String>,
    #[arg(long, value_enum)]
    pub sample: Option<SampleStrategy>,
    #[arg(long, default_value_t = 30_000)]
    pub budget_chars: usize,
    #[arg(long, default_value_t = 50)]
    pub paste_detect_min_chars: usize,
    #[arg(long, default_value_t = 0.7)]
    pub paste_like_threshold: f64,
    #[arg(long)]
    pub include_paste_like: bool,
    #[arg(long)]
    pub since: Option<String>,
    #[arg(long)]
    pub until: Option<String>,
    #[arg(long, default_value_t = 1000)]
    pub max_sessions_scan: usize,
    #[arg(long, default_value_t = 50_000)]
    pub max_messages_scan: usize,
    #[arg(long)]
    pub no_cache: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, ValueEnum)]
pub enum CollectScope {
    Global,
    Project,
    Session,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, ValueEnum)]
pub enum SampleStrategy {
    Recent,
    Representative,
    Mixed,
    Chronological,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_version_command() {
        let cli = CliArgs::try_parse_from(["echo-profile", "version"]).unwrap();
        assert!(matches!(cli.command, CliCommand::Version));
    }

    #[test]
    fn parses_profile_collect_project_current() {
        let cli = CliArgs::try_parse_from([
            "echo-profile",
            "profile",
            "collect",
            "--scope",
            "project",
            "--current-project",
        ])
        .unwrap();
        let CliCommand::Profile(ProfileArgs {
            command: ProfileCommand::Collect(args),
        }) = cli.command
        else {
            panic!("expected profile collect");
        };
        assert_eq!(args.scope, CollectScope::Project);
        assert!(args.current_project);
    }
}
