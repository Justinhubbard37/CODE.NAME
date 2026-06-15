//! Pure Rust command-policy registry for the Phase 1 security spine.
//!
//! This module intentionally does not enforce policy on live Tauri commands yet.
//! It defines the command inventory, gate/risk classifications, and sanitized
//! denial helpers that later Phase 1 slices can call from command handlers.

#![allow(dead_code)]

use std::fmt;

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Gate {
    Tools,
    Network,
    Filesystem,
}

impl Gate {
    pub fn as_str(self) -> &'static str {
        match self {
            Gate::Tools => "tools",
            Gate::Network => "network",
            Gate::Filesystem => "filesystem",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GateRequirement {
    Always(Gate),
    Conditional { gate: Gate, reason: &'static str },
    ReviewRequired { gate: Gate, reason: &'static str },
}

impl GateRequirement {
    pub fn gate(self) -> Gate {
        match self {
            GateRequirement::Always(gate)
            | GateRequirement::Conditional { gate, .. }
            | GateRequirement::ReviewRequired { gate, .. } => gate,
        }
    }

    pub fn is_always(self) -> bool {
        matches!(self, GateRequirement::Always(_))
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum RiskLevel {
    None,
    Low,
    Medium,
    High,
    Critical,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CommandRisk {
    pub secret_exposure: RiskLevel,
    pub network: RiskLevel,
    pub filesystem: RiskLevel,
    pub tool_sidecar: RiskLevel,
}

impl CommandRisk {
    pub const fn new(
        secret_exposure: RiskLevel,
        network: RiskLevel,
        filesystem: RiskLevel,
        tool_sidecar: RiskLevel,
    ) -> Self {
        Self {
            secret_exposure,
            network,
            filesystem,
            tool_sidecar,
        }
    }

    pub fn is_secret_related(self) -> bool {
        self.secret_exposure != RiskLevel::None
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PolicyPriority {
    Normal,
    High,
    Critical,
    ReviewRequired,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CommandPolicy {
    pub command: &'static str,
    pub required_gates: &'static [GateRequirement],
    pub risk: CommandRisk,
    pub rationale: &'static str,
    pub priority: PolicyPriority,
    pub replacement: Option<&'static str>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct GateSnapshot {
    pub tools: bool,
    pub network: bool,
    pub filesystem: bool,
}

impl GateSnapshot {
    pub const fn new(tools: bool, network: bool, filesystem: bool) -> Self {
        Self {
            tools,
            network,
            filesystem,
        }
    }

    pub fn is_open(self, gate: Gate) -> bool {
        match gate {
            Gate::Tools => self.tools,
            Gate::Network => self.network,
            Gate::Filesystem => self.filesystem,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GateValues {
    pub filesystem: bool,
    pub network: bool,
    pub tools: bool,
}

impl GateValues {
    pub const fn new(filesystem: bool, network: bool, tools: bool) -> Self {
        Self {
            filesystem,
            network,
            tools,
        }
    }

    pub fn is_open(self, gate: Gate) -> bool {
        match gate {
            Gate::Tools => self.tools,
            Gate::Network => self.network,
            Gate::Filesystem => self.filesystem,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct GatePolicyCeiling {
    pub max_filesystem: bool,
    pub max_network: bool,
    pub max_tools: bool,
}

impl Default for GatePolicyCeiling {
    fn default() -> Self {
        Self {
            max_filesystem: true,
            max_network: true,
            max_tools: true,
        }
    }
}

impl GatePolicyCeiling {
    pub const fn new(max_filesystem: bool, max_network: bool, max_tools: bool) -> Self {
        Self {
            max_filesystem,
            max_network,
            max_tools,
        }
    }

    pub fn allows(self, gate: Gate) -> bool {
        match gate {
            Gate::Tools => self.max_tools,
            Gate::Network => self.max_network,
            Gate::Filesystem => self.max_filesystem,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LockedGate {
    pub gate: &'static str,
    pub reason: &'static str,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectiveGateState {
    pub filesystem: bool,
    pub network: bool,
    pub tools: bool,
    pub changed_by_policy: bool,
    pub locked_gates: Vec<LockedGate>,
}

impl EffectiveGateState {
    pub fn values(&self) -> GateValues {
        GateValues::new(self.filesystem, self.network, self.tools)
    }
}

pub fn apply_gate_policy(requested: GateValues, ceiling: GatePolicyCeiling) -> EffectiveGateState {
    let filesystem = requested.filesystem && ceiling.max_filesystem;
    let network = requested.network && ceiling.max_network;
    let tools = requested.tools && ceiling.max_tools;

    let mut locked_gates = Vec::new();
    if requested.filesystem && !ceiling.max_filesystem {
        locked_gates.push(LockedGate {
            gate: Gate::Filesystem.as_str(),
            reason: "filesystem gate is locked closed by Rust policy",
        });
    }
    if requested.network && !ceiling.max_network {
        locked_gates.push(LockedGate {
            gate: Gate::Network.as_str(),
            reason: "network gate is locked closed by Rust policy",
        });
    }
    if requested.tools && !ceiling.max_tools {
        locked_gates.push(LockedGate {
            gate: Gate::Tools.as_str(),
            reason: "tools gate is locked closed by Rust policy",
        });
    }

    EffectiveGateState {
        filesystem,
        network,
        tools,
        changed_by_policy: filesystem != requested.filesystem
            || network != requested.network
            || tools != requested.tools,
        locked_gates,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PolicyErrorCode {
    UnknownCommand,
    GateClosed,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PolicyError {
    pub code: PolicyErrorCode,
    pub command: String,
    pub gate: Option<Gate>,
    pub message: &'static str,
}

impl PolicyError {
    pub fn unknown_command(command: &str) -> Self {
        Self {
            code: PolicyErrorCode::UnknownCommand,
            command: sanitize_identifier(command),
            gate: None,
            message: "Command is not registered in the policy registry.",
        }
    }

    pub fn gate_closed(command: &str, gate: Gate) -> Self {
        Self {
            code: PolicyErrorCode::GateClosed,
            command: sanitize_identifier(command),
            gate: Some(gate),
            message: "Command blocked by security policy.",
        }
    }
}

impl fmt::Display for PolicyError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self.gate {
            Some(gate) => write!(
                f,
                "policy denied command '{}' because the {} gate is closed",
                self.command,
                gate.as_str()
            ),
            None => write!(f, "policy denied command '{}'", self.command),
        }
    }
}

pub type PolicyResult<T> = Result<T, PolicyError>;

const NO_GATES: &[GateRequirement] = &[];
const TOOLS_GATE: &[GateRequirement] = &[GateRequirement::Always(Gate::Tools)];
const FILESYSTEM_GATE: &[GateRequirement] = &[GateRequirement::Always(Gate::Filesystem)];
const SIDE_EFFECTFUL_SIDECAR: &[GateRequirement] = &[
    GateRequirement::Always(Gate::Tools),
    GateRequirement::Conditional {
        gate: Gate::Network,
        reason:
            "sidecar agent execution can reach cloud providers depending on sidecar configuration",
    },
];
const SIDECAR_COMMUNITIES: &[GateRequirement] = &[
    GateRequirement::Always(Gate::Tools),
    GateRequirement::Conditional {
        gate: Gate::Network,
        reason: "community summarization can invoke the sidecar agent model",
    },
];
const BROWSER_OPEN: &[GateRequirement] = &[
    GateRequirement::Always(Gate::Tools),
    GateRequirement::Always(Gate::Network),
];
const SIDECAR_POOL_CREATE: &[GateRequirement] = &[
    GateRequirement::Always(Gate::Tools),
    GateRequirement::Conditional {
        gate: Gate::Network,
        reason: "browser and agent pool leases can lead to network-capable sidecar work",
    },
];
const MODEL_NETWORK_CONDITIONAL: &[GateRequirement] = &[GateRequirement::Conditional {
    gate: Gate::Network,
    reason: "provider endpoint may be cloud, internet, or a localhost proxy to cloud",
}];
const KB_LOCAL_FILESYSTEM: &[GateRequirement] = &[GateRequirement::Conditional {
    gate: Gate::Filesystem,
    reason: "SQLite knowledge-base commands read and write the app-local database",
}];
const LOG_DIR_REVIEW: &[GateRequirement] = &[GateRequirement::ReviewRequired {
    gate: Gate::Filesystem,
    reason: "path disclosure is status-like but still exposes a filesystem location",
}];

const fn risk(
    secret_exposure: RiskLevel,
    network: RiskLevel,
    filesystem: RiskLevel,
    tool_sidecar: RiskLevel,
) -> CommandRisk {
    CommandRisk::new(secret_exposure, network, filesystem, tool_sidecar)
}

pub const COMMAND_POLICIES: &[CommandPolicy] = &[
    CommandPolicy {
        command: "sidecar_info",
        required_gates: NO_GATES,
        risk: risk(RiskLevel::Low, RiskLevel::None, RiskLevel::None, RiskLevel::Low),
        rationale: "Status command; bearer token is skipped during serialization.",
        priority: PolicyPriority::Normal,
        replacement: None,
    },
    CommandPolicy {
        command: "sidecar_restart",
        required_gates: TOOLS_GATE,
        risk: risk(RiskLevel::Low, RiskLevel::Low, RiskLevel::Low, RiskLevel::High),
        rationale: "Restarts a managed external sidecar process.",
        priority: PolicyPriority::High,
        replacement: None,
    },
    CommandPolicy {
        command: "sidecar_send",
        required_gates: SIDE_EFFECTFUL_SIDECAR,
        risk: risk(RiskLevel::Medium, RiskLevel::High, RiskLevel::Low, RiskLevel::High),
        rationale: "Sends prompt text into the sidecar agent; sidecar model behavior may be cloud-capable.",
        priority: PolicyPriority::Critical,
        replacement: None,
    },
    CommandPolicy {
        command: "sidecar_stream",
        required_gates: SIDE_EFFECTFUL_SIDECAR,
        risk: risk(RiskLevel::Medium, RiskLevel::High, RiskLevel::Low, RiskLevel::High),
        rationale: "Streams prompt text into the sidecar agent; sidecar model behavior may be cloud-capable.",
        priority: PolicyPriority::Critical,
        replacement: None,
    },
    CommandPolicy {
        command: "set_gates",
        required_gates: NO_GATES,
        risk: risk(RiskLevel::None, RiskLevel::High, RiskLevel::High, RiskLevel::High),
        rationale: "Mutates security gate state and must be constrained by later role/policy checks.",
        priority: PolicyPriority::Critical,
        replacement: None,
    },
    CommandPolicy {
        command: "sidecar_cancel",
        required_gates: NO_GATES,
        risk: risk(RiskLevel::None, RiskLevel::None, RiskLevel::None, RiskLevel::Low),
        rationale: "Teardown/control command; should remain available to stop in-flight work.",
        priority: PolicyPriority::Normal,
        replacement: None,
    },
    CommandPolicy {
        command: "sidecar_tool_result",
        required_gates: TOOLS_GATE,
        risk: risk(RiskLevel::Medium, RiskLevel::Medium, RiskLevel::Low, RiskLevel::High),
        rationale: "Returns frontend tool output to the sidecar execution loop.",
        priority: PolicyPriority::Critical,
        replacement: None,
    },
    CommandPolicy {
        command: "sidecar_embed",
        required_gates: TOOLS_GATE,
        risk: risk(RiskLevel::Low, RiskLevel::Low, RiskLevel::None, RiskLevel::Medium),
        rationale: "Calls sidecar embedding endpoint; currently local but still a sidecar tool boundary.",
        priority: PolicyPriority::High,
        replacement: None,
    },
    CommandPolicy {
        command: "sidecar_communities",
        required_gates: SIDECAR_COMMUNITIES,
        risk: risk(RiskLevel::Medium, RiskLevel::High, RiskLevel::Low, RiskLevel::High),
        rationale: "Calls sidecar graph community summarization, which can invoke an agent model.",
        priority: PolicyPriority::Critical,
        replacement: None,
    },
    CommandPolicy {
        command: "sidecar_browser_open",
        required_gates: BROWSER_OPEN,
        risk: risk(RiskLevel::Medium, RiskLevel::Critical, RiskLevel::Medium, RiskLevel::Critical),
        rationale: "Drives browser navigation through the sidecar and must be gated before URL policy is added.",
        priority: PolicyPriority::Critical,
        replacement: None,
    },
    CommandPolicy {
        command: "sidecar_pool_create",
        required_gates: SIDECAR_POOL_CREATE,
        risk: risk(RiskLevel::Low, RiskLevel::High, RiskLevel::Medium, RiskLevel::High),
        rationale: "Allocates sidecar-controlled browser or agent resources.",
        priority: PolicyPriority::Critical,
        replacement: None,
    },
    CommandPolicy {
        command: "sidecar_pool_release",
        required_gates: NO_GATES,
        risk: risk(RiskLevel::None, RiskLevel::None, RiskLevel::Low, RiskLevel::Medium),
        rationale: "Teardown command; should remain available to release sidecar resources.",
        priority: PolicyPriority::Normal,
        replacement: None,
    },
    CommandPolicy {
        command: "sidecar_health",
        required_gates: NO_GATES,
        risk: risk(RiskLevel::None, RiskLevel::Low, RiskLevel::None, RiskLevel::Low),
        rationale: "Status probe against loopback sidecar health endpoint.",
        priority: PolicyPriority::Normal,
        replacement: None,
    },
    CommandPolicy {
        command: "model_list",
        required_gates: MODEL_NETWORK_CONDITIONAL,
        risk: risk(RiskLevel::High, RiskLevel::High, RiskLevel::None, RiskLevel::None),
        rationale: "Lists provider models and may use secrets against cloud or cloud-proxy endpoints.",
        priority: PolicyPriority::Critical,
        replacement: None,
    },
    CommandPolicy {
        command: "model_stream",
        required_gates: MODEL_NETWORK_CONDITIONAL,
        risk: risk(RiskLevel::High, RiskLevel::High, RiskLevel::None, RiskLevel::None),
        rationale: "Streams chat through provider endpoint and may use secrets against cloud or cloud-proxy endpoints.",
        priority: PolicyPriority::Critical,
        replacement: None,
    },
    CommandPolicy {
        command: "kb_init",
        required_gates: KB_LOCAL_FILESYSTEM,
        risk: risk(RiskLevel::None, RiskLevel::None, RiskLevel::Low, RiskLevel::None),
        rationale: "Initializes the app-local SQLite knowledge base.",
        priority: PolicyPriority::High,
        replacement: None,
    },
    CommandPolicy {
        command: "kb_stats",
        required_gates: KB_LOCAL_FILESYSTEM,
        risk: risk(RiskLevel::None, RiskLevel::None, RiskLevel::Low, RiskLevel::None),
        rationale: "Reads aggregate counts from the app-local SQLite knowledge base.",
        priority: PolicyPriority::Normal,
        replacement: None,
    },
    CommandPolicy {
        command: "kb_ingest_text",
        required_gates: KB_LOCAL_FILESYSTEM,
        risk: risk(RiskLevel::Low, RiskLevel::None, RiskLevel::Medium, RiskLevel::None),
        rationale: "Stores user-provided text and deterministic chunks in the app-local SQLite knowledge base.",
        priority: PolicyPriority::High,
        replacement: None,
    },
    CommandPolicy {
        command: "kb_search",
        required_gates: KB_LOCAL_FILESYSTEM,
        risk: risk(RiskLevel::Low, RiskLevel::None, RiskLevel::Low, RiskLevel::None),
        rationale: "Searches local SQLite chunks and records a local retrieval event.",
        priority: PolicyPriority::Normal,
        replacement: None,
    },
    CommandPolicy {
        command: "kb_get_document",
        required_gates: KB_LOCAL_FILESYSTEM,
        risk: risk(RiskLevel::Low, RiskLevel::None, RiskLevel::Low, RiskLevel::None),
        rationale: "Reads document metadata and optional chunks from the app-local SQLite knowledge base.",
        priority: PolicyPriority::Normal,
        replacement: None,
    },
    CommandPolicy {
        command: "kb_graph_projection",
        required_gates: KB_LOCAL_FILESYSTEM,
        risk: risk(RiskLevel::Low, RiskLevel::None, RiskLevel::Low, RiskLevel::None),
        rationale: "Reads local SQLite documents, chunks, entities, and relationships as graph-ready projection data.",
        priority: PolicyPriority::Normal,
        replacement: None,
    },
    CommandPolicy {
        command: "secret_get",
        required_gates: NO_GATES,
        risk: risk(RiskLevel::Critical, RiskLevel::None, RiskLevel::None, RiskLevel::None),
        rationale: "Deprecated compatibility command; must deny raw keychain secret reads.",
        priority: PolicyPriority::Critical,
        replacement: Some("secret_present"),
    },
    CommandPolicy {
        command: "secret_present",
        required_gates: NO_GATES,
        risk: risk(RiskLevel::Low, RiskLevel::None, RiskLevel::None, RiskLevel::None),
        rationale: "Presence-only keychain query that does not expose raw secret material.",
        priority: PolicyPriority::High,
        replacement: None,
    },
    CommandPolicy {
        command: "secret_set",
        required_gates: NO_GATES,
        risk: risk(RiskLevel::High, RiskLevel::None, RiskLevel::None, RiskLevel::None),
        rationale: "Writes secret material into the OS keychain.",
        priority: PolicyPriority::High,
        replacement: None,
    },
    CommandPolicy {
        command: "secret_delete",
        required_gates: NO_GATES,
        risk: risk(RiskLevel::High, RiskLevel::None, RiskLevel::None, RiskLevel::None),
        rationale: "Deletes secret material from the OS keychain.",
        priority: PolicyPriority::High,
        replacement: None,
    },
    CommandPolicy {
        command: "get_log_dir",
        required_gates: LOG_DIR_REVIEW,
        risk: risk(RiskLevel::None, RiskLevel::None, RiskLevel::Low, RiskLevel::None),
        rationale: "Returns a filesystem path; later enforcement must decide whether path disclosure is allowed as status.",
        priority: PolicyPriority::ReviewRequired,
        replacement: None,
    },
    CommandPolicy {
        command: "open_log_dir",
        required_gates: FILESYSTEM_GATE,
        risk: risk(RiskLevel::None, RiskLevel::None, RiskLevel::Medium, RiskLevel::None),
        rationale: "Opens a filesystem location in the OS file manager.",
        priority: PolicyPriority::High,
        replacement: None,
    },
    CommandPolicy {
        command: "set_crash_consent",
        required_gates: NO_GATES,
        risk: risk(RiskLevel::None, RiskLevel::None, RiskLevel::Low, RiskLevel::None),
        rationale: "Toggles crash-report collection; status/control command but affects later file writes.",
        priority: PolicyPriority::High,
        replacement: None,
    },
    CommandPolicy {
        command: "get_crash_consent",
        required_gates: NO_GATES,
        risk: risk(RiskLevel::None, RiskLevel::None, RiskLevel::None, RiskLevel::None),
        rationale: "Status-only crash consent query.",
        priority: PolicyPriority::Normal,
        replacement: None,
    },
    CommandPolicy {
        command: "append_js_crash_log",
        required_gates: FILESYSTEM_GATE,
        risk: risk(RiskLevel::Medium, RiskLevel::None, RiskLevel::High, RiskLevel::None),
        rationale: "Writes frontend crash data to disk; crash content can contain sensitive application state.",
        priority: PolicyPriority::Critical,
        replacement: None,
    },
    CommandPolicy {
        command: "get_crash_reports",
        required_gates: FILESYSTEM_GATE,
        risk: risk(RiskLevel::Medium, RiskLevel::None, RiskLevel::Medium, RiskLevel::None),
        rationale: "Reads crash report filenames from disk.",
        priority: PolicyPriority::High,
        replacement: None,
    },
    CommandPolicy {
        command: "clear_crash_reports",
        required_gates: FILESYSTEM_GATE,
        risk: risk(RiskLevel::None, RiskLevel::None, RiskLevel::High, RiskLevel::None),
        rationale: "Deletes crash report files from disk.",
        priority: PolicyPriority::Critical,
        replacement: None,
    },
    CommandPolicy {
        command: "open_crash_folder",
        required_gates: FILESYSTEM_GATE,
        risk: risk(RiskLevel::None, RiskLevel::None, RiskLevel::Medium, RiskLevel::None),
        rationale: "Opens a filesystem location in the OS file manager.",
        priority: PolicyPriority::High,
        replacement: None,
    },
];

pub fn policy_for_command(command: &str) -> Option<&'static CommandPolicy> {
    COMMAND_POLICIES
        .iter()
        .find(|policy| policy.command == command)
}

pub fn required_gates_for(command: &str) -> Option<&'static [GateRequirement]> {
    policy_for_command(command).map(|policy| policy.required_gates)
}

pub fn policy_requires_gate(command: &str, gate: Gate) -> bool {
    required_gates_for(command)
        .map(|requirements| requirements.iter().any(|req| req.gate() == gate))
        .unwrap_or(false)
}

pub fn require_gate(command: &str, gate: Gate, gate_open: bool) -> PolicyResult<()> {
    match policy_for_command(command) {
        Some(_) if !policy_requires_gate(command, gate) => Ok(()),
        Some(_) if gate_open => Ok(()),
        Some(_) => Err(PolicyError::gate_closed(command, gate)),
        None => Err(PolicyError::unknown_command(command)),
    }
}

pub fn require_gates(command: &str, gates: GateSnapshot) -> PolicyResult<()> {
    let policy =
        policy_for_command(command).ok_or_else(|| PolicyError::unknown_command(command))?;
    for requirement in policy.required_gates {
        if requirement.is_always() {
            let gate = requirement.gate();
            if !gates.is_open(gate) {
                return Err(PolicyError::gate_closed(command, gate));
            }
        }
    }
    Ok(())
}

fn sanitize_identifier(input: &str) -> String {
    let mut out = String::with_capacity(input.len().min(64));
    for ch in input.chars().take(64) {
        if ch.is_ascii_alphanumeric() || ch == '_' || ch == '-' {
            out.push(ch);
        } else if !out.is_empty() {
            break;
        } else {
            out.push('_');
        }
    }
    if out.is_empty() {
        "unknown".to_string()
    } else {
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    fn registered_tauri_commands_from_lib_rs() -> Vec<String> {
        let source = include_str!("lib.rs");
        let start = source
            .find("tauri::generate_handler![")
            .expect("generate_handler list should exist");
        let list = &source[start..];
        let end = list.find("])").expect("generate_handler list should close");
        list[..end]
            .lines()
            .filter_map(|line| {
                let trimmed = line.trim().trim_end_matches(',');
                let (_, command) = trimmed.rsplit_once("::")?;
                if command.is_empty() || command.contains('!') {
                    None
                } else {
                    Some(command.to_string())
                }
            })
            .collect()
    }

    #[test]
    fn registry_covers_every_registered_tauri_command() {
        let registered = registered_tauri_commands_from_lib_rs();
        assert!(
            !registered.is_empty(),
            "registered command list should not be empty"
        );

        for command in registered {
            assert!(
                policy_for_command(&command).is_some(),
                "missing policy for registered Tauri command {command}"
            );
        }
    }

    #[test]
    fn registry_has_no_duplicate_command_names() {
        let mut seen = HashSet::new();
        for policy in COMMAND_POLICIES {
            assert!(
                seen.insert(policy.command),
                "duplicate policy for command {}",
                policy.command
            );
        }
    }

    #[test]
    fn policy_lookup_succeeds_for_known_command() {
        let policy = policy_for_command("sidecar_stream").expect("sidecar_stream policy");
        assert_eq!(policy.command, "sidecar_stream");
        assert_eq!(policy.priority, PolicyPriority::Critical);
    }

    #[test]
    fn policy_lookup_fails_safely_for_unknown_command() {
        assert!(policy_for_command("not_a_real_command").is_none());
        let err = require_gates("not_a_real_command", GateSnapshot::new(true, true, true))
            .expect_err("unknown command should fail closed");
        assert_eq!(err.code, PolicyErrorCode::UnknownCommand);
        assert_eq!(err.command, "not_a_real_command");
    }

    #[test]
    fn tools_gate_commands_are_classified() {
        for command in [
            "sidecar_restart",
            "sidecar_send",
            "sidecar_stream",
            "sidecar_tool_result",
            "sidecar_embed",
            "sidecar_communities",
            "sidecar_browser_open",
            "sidecar_pool_create",
        ] {
            assert!(
                policy_requires_gate(command, Gate::Tools),
                "{command} should require the Tools gate"
            );
        }
    }

    #[test]
    fn filesystem_gate_commands_are_classified() {
        for command in [
            "open_log_dir",
            "append_js_crash_log",
            "get_crash_reports",
            "clear_crash_reports",
            "open_crash_folder",
        ] {
            assert!(
                policy_requires_gate(command, Gate::Filesystem),
                "{command} should require the Filesystem gate"
            );
        }
    }

    #[test]
    fn secret_commands_are_marked_secret_related() {
        for command in [
            "secret_get",
            "secret_present",
            "secret_set",
            "secret_delete",
        ] {
            let policy = policy_for_command(command).expect("secret command policy");
            assert!(
                policy.risk.is_secret_related(),
                "{command} should be secret-related"
            );
        }
    }

    #[test]
    fn secret_get_is_critical_and_has_replacement() {
        let policy = policy_for_command("secret_get").expect("secret_get policy");
        assert_eq!(policy.risk.secret_exposure, RiskLevel::Critical);
        assert_eq!(policy.priority, PolicyPriority::Critical);
        assert_eq!(policy.replacement, Some("secret_present"));
    }

    #[test]
    fn denial_error_formatting_is_sanitized() {
        let err = PolicyError::gate_closed(
            "sidecar_send Bearer sk-test-api-key prompt super-secret",
            Gate::Tools,
        );
        let formatted = err.to_string();
        for forbidden in ["Bearer", "sk-test-api-key", "prompt", "super-secret"] {
            assert!(
                !formatted.contains(forbidden),
                "denial should not contain sensitive token '{forbidden}'"
            );
        }
        assert_eq!(err.command, "sidecar_send");
    }

    #[test]
    fn required_gate_open_allows_and_closed_denies() {
        require_gates("sidecar_send", GateSnapshot::new(true, true, true))
            .expect("open tools gate should allow always-required Tools command");

        let err = require_gates("sidecar_send", GateSnapshot::new(false, true, true))
            .expect_err("closed tools gate should deny sidecar_send");
        assert_eq!(err.code, PolicyErrorCode::GateClosed);
        assert_eq!(err.gate, Some(Gate::Tools));
    }

    #[test]
    fn conditional_network_requirement_is_represented() {
        let requirements = required_gates_for("model_stream").expect("model_stream gates");
        assert!(requirements.iter().any(|req| matches!(
            req,
            GateRequirement::Conditional {
                gate: Gate::Network,
                ..
            }
        )));
    }

    #[test]
    fn get_log_dir_is_explicitly_marked_for_filesystem_review() {
        let policy = policy_for_command("get_log_dir").expect("get_log_dir policy");
        assert_eq!(policy.priority, PolicyPriority::ReviewRequired);
        assert!(policy.required_gates.iter().any(|req| matches!(
            req,
            GateRequirement::ReviewRequired {
                gate: Gate::Filesystem,
                ..
            }
        )));
    }

    #[test]
    fn fully_open_ceiling_applies_requested_gates() {
        let requested = GateValues::new(true, false, true);
        let effective = apply_gate_policy(requested, GatePolicyCeiling::default());
        assert_eq!(effective.values(), requested);
        assert!(!effective.changed_by_policy);
        assert!(effective.locked_gates.is_empty());
    }

    #[test]
    fn closing_gates_is_always_allowed() {
        let requested = GateValues::new(false, false, false);
        let ceiling = GatePolicyCeiling::new(false, false, false);
        let effective = apply_gate_policy(requested, ceiling);
        assert_eq!(effective.values(), requested);
        assert!(!effective.changed_by_policy);
        assert!(effective.locked_gates.is_empty());
    }

    #[test]
    fn network_lock_keeps_requested_network_open_closed() {
        let effective = apply_gate_policy(
            GateValues::new(true, true, true),
            GatePolicyCeiling::new(true, false, true),
        );
        assert_eq!(effective.values(), GateValues::new(true, false, true));
        assert!(effective.changed_by_policy);
        assert!(effective
            .locked_gates
            .iter()
            .any(|locked| locked.gate == "network"));
    }

    #[test]
    fn tools_lock_keeps_requested_tools_open_closed() {
        let effective = apply_gate_policy(
            GateValues::new(true, true, true),
            GatePolicyCeiling::new(true, true, false),
        );
        assert_eq!(effective.values(), GateValues::new(true, true, false));
        assert!(effective.changed_by_policy);
        assert!(effective
            .locked_gates
            .iter()
            .any(|locked| locked.gate == "tools"));
    }

    #[test]
    fn filesystem_lock_keeps_requested_filesystem_open_closed() {
        let effective = apply_gate_policy(
            GateValues::new(true, true, true),
            GatePolicyCeiling::new(false, true, true),
        );
        assert_eq!(effective.values(), GateValues::new(false, true, true));
        assert!(effective.changed_by_policy);
        assert!(effective
            .locked_gates
            .iter()
            .any(|locked| locked.gate == "filesystem"));
    }

    #[test]
    fn multiple_locked_gates_remain_closed() {
        let effective = apply_gate_policy(
            GateValues::new(true, true, true),
            GatePolicyCeiling::new(false, false, true),
        );
        assert_eq!(effective.values(), GateValues::new(false, false, true));
        assert_eq!(effective.locked_gates.len(), 2);
    }

    #[test]
    fn gate_policy_result_is_deterministic() {
        let requested = GateValues::new(true, true, true);
        let ceiling = GatePolicyCeiling::new(false, true, false);
        let first = apply_gate_policy(requested, ceiling);
        let second = apply_gate_policy(requested, ceiling);
        assert_eq!(first, second);
    }

    #[test]
    fn gate_policy_response_does_not_contain_sensitive_data() {
        let effective = apply_gate_policy(
            GateValues::new(true, true, true),
            GatePolicyCeiling::new(false, false, false),
        );
        let serialized = serde_json::to_string(&effective).expect("serialize effective gates");
        for forbidden in ["Bearer", "token", "api", "secret", "prompt", "sk-"] {
            assert!(
                !serialized.to_lowercase().contains(forbidden),
                "effective gate response should not contain sensitive term '{forbidden}'"
            );
        }
    }
}
