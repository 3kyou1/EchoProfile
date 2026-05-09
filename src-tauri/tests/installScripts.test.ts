import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../..");

function readScript(name: string): string {
  return fs.readFileSync(path.join(root, name), "utf8");
}

describe("installer scripts", () => {
  it("keeps shell installers executable", () => {
    for (const scriptName of ["install-cli.sh", "install-agent.sh", "install-server.sh"]) {
      const mode = fs.statSync(path.join(root, scriptName)).mode;
      expect(mode & 0o111, `${scriptName} should be executable`).not.toBe(0);
    }
  });

  it("provides a provider-agnostic CLI installer", () => {
    const script = readScript("install-cli.sh");

    expect(script).toContain('REPO="3kyou1/EchoProfile"');
    expect(script).toContain('BINARY_NAME="echo-profile"');
    expect(script).toContain("echo-profile version");
    expect(script).not.toContain("WebUI Server Installer");
    expect(script).not.toContain("--serve");
  });

  it("provides an agent installer that installs CLI plus EchoProfile skills", () => {
    const script = readScript("install-agent.sh");

    expect(script).toContain("install-cli.sh");
    expect(script).toContain("echo-profile-user-profile");
    expect(script).toContain("figure-pool-generator");
    expect(script).toContain("CODEX_HOME");
    expect(script).toContain('VERSION="${VERSION:-}" INSTALL_DIR="${INSTALL_DIR:-}" sh');
    expect(script).toContain("skills");
    expect(script).toContain("echo-profile list providers");
  });

  it("keeps the legacy server installer pointed at the current repository", () => {
    const script = readScript("install-server.sh");

    expect(script).toContain('REPO="3kyou1/EchoProfile"');
    expect(script).not.toContain("jhlee0409/echo-profile");
  });

  it("documents provider-agnostic agent installation in both READMEs", () => {
    const englishReadme = readScript("README.md");
    const chineseReadme = readScript("README.zh-CN.md");

    for (const readme of [englishReadme, chineseReadme]) {
      expect(readme).toContain("install-agent.sh");
      expect(readme).toContain("install-cli.sh");
      expect(readme).toContain("echo-profile list providers");
      expect(readme).toContain("Aider");
      expect(readme).toContain("Claude Code");
      expect(readme).toContain("Codex CLI");
      expect(readme).toContain("Gemini CLI");
      expect(readme).toContain("OpenCode");
    }

    expect(englishReadme).not.toContain("Codex skills or other agents");
    expect(chineseReadme).not.toContain("Codex skill 或其他 agent");
  });
});
