use crate::types::*;
use reqwest::Client;

pub struct ApiClient {
    client: Client,
    pub base_url: String,
}

impl ApiClient {
    pub fn new(base_url: String) -> Self {
        Self {
            client: Client::new(),
            base_url,
        }
    }

    pub async fn send_message(&self, request: SendMessageRequest) -> Result<SendMessageResponse, String> {
        let resp = self
            .client
            .post(format!("{}/message", self.base_url))
            .json(&request)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !resp.status().is_success() {
            return Err(format!("Failed to send message: {}", resp.status()));
        }

        resp.json::<SendMessageResponse>()
            .await
            .map_err(|e| e.to_string())
    }


    pub async fn get_interactions(&self) -> Result<Vec<serde_json::Value>, String> {
        let resp = self
            .client
            .get(format!("{}/interactions", self.base_url))
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !resp.status().is_success() {
            return Err(format!("Failed to get interactions: {}", resp.status()));
        }

        resp.json::<Vec<serde_json::Value>>()
            .await
            .map_err(|e| e.to_string())
    }

    pub async fn get_interaction(&self, id: &str) -> Result<serde_json::Value, String> {
        let resp = self
            .client
            .get(format!("{}/interactions/{}", self.base_url, id))
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !resp.status().is_success() {
            return Err(format!("Failed to get interaction: {}", resp.status()));
        }

        resp.json::<serde_json::Value>()
            .await
            .map_err(|e| e.to_string())
    }

    pub async fn respond_to_permission(&self, interaction_id: &str, approved: bool) -> Result<(), String> {
        // The server expects a full result submission for permission responses
        let result = if approved {
            serde_json::json!({
                "response": "Permission granted",
                "metadata": {
                    "permissionResponse": {
                        "approved": true
                    }
                }
            })
        } else {
            serde_json::json!({
                "response": "Permission denied",
                "metadata": {
                    "permissionResponse": {
                        "approved": false
                    }
                }
            })
        };

        let resp = self
            .client
            .post(format!("{}/interactions/{}/result", self.base_url, interaction_id))
            .json(&result)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !resp.status().is_success() {
            return Err(format!("Failed to respond to permission: {}", resp.status()));
        }

        Ok(())
    }

    pub async fn get_worktrees(&self) -> Result<Vec<Worktree>, String> {
        let resp = self
            .client
            .get(format!("{}/worktrees", self.base_url))
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !resp.status().is_success() {
            return Err(format!("Failed to get worktrees: {}", resp.status()));
        }

        resp.json::<Vec<Worktree>>()
            .await
            .map_err(|e| e.to_string())
    }

    pub async fn create_worktree(&self, request: CreateWorktreeRequest) -> Result<Worktree, String> {
        let resp = self
            .client
            .post(format!("{}/worktrees", self.base_url))
            .json(&request)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !resp.status().is_success() {
            return Err(format!("Failed to create worktree: {}", resp.status()));
        }

        resp.json::<Worktree>()
            .await
            .map_err(|e| e.to_string())
    }
}