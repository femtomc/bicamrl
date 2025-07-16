use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenUsage {
    pub input: u32,
    pub output: u32,
    pub total: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InteractionMetadata {
    pub tokens: Option<TokenUsage>,
    pub model: Option<String>,
    pub processing_time_ms: Option<u64>,
    pub current_action: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolPermissionRequest {
    #[serde(rename = "toolName")]
    pub tool_name: String,
    pub description: String,
    pub arguments: serde_json::Value,
    #[serde(rename = "requestId")]
    pub request_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub id: String,
    pub content: String,
    pub response: Option<String>,
    pub status: MessageStatus,
    pub metadata: Option<InteractionMetadata>,
    pub pending_tool_permission: Option<ToolPermissionRequest>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MessageStatus {
    Pending,
    Processing,
    Completed,
    Error,
    WaitingForPermission,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueueStatus {
    #[serde(rename = "queueSize")]
    pub queue_size: usize,
    pub processing: usize,
    pub completed: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SendMessageResponse {
    pub id: String,
    #[serde(rename = "type")]
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Worktree {
    pub id: String,
    pub path: String,
    pub branch: Option<String>,
    #[serde(rename = "baseCommit")]
    pub base_commit: Option<String>,
    pub status: WorktreeStatus,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WorktreeStatus {
    Active,
    Inactive,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SendMessageRequest {
    pub content: String,
    pub metadata: Option<serde_json::Value>,
    #[serde(rename = "worktreeId")]
    pub worktree_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateWorktreeRequest {
    pub branch: String,
    #[serde(rename = "baseBranch")]
    pub base_branch: Option<String>,
    pub path: Option<String>,
}