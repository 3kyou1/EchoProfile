pub mod archive;
pub mod claude_settings;
pub mod debug;
pub mod feedback;
pub mod figure_pool;
pub mod fs_utils;
pub mod llm;
pub mod mcp_presets;
pub mod metadata;
pub mod multi_provider;
pub mod project;
pub mod session;
pub mod settings;
pub mod stats;
pub mod unified_presets;
pub mod watcher;
pub mod wsl;

#[cfg(test)]
mod proptest_examples;
