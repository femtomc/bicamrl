use futures::stream::StreamExt;
use reqwest::Client;
use serde_json::{json, Value};
use std::sync::mpsc;

pub enum SSEMessage {
    Connected,
    InteractionUpdate { id: String, data: Value },
    Error(String),
}

pub async fn connect_sse(base_url: String, session_id: Option<String>, tx: mpsc::Sender<SSEMessage>) {
    let url = match session_id {
        Some(id) => format!("{}/sessions/{}/stream", base_url, id),
        None => format!("{}/stream", base_url)
    };
    let client = Client::new();
    
    loop {
        match client.get(&url).send().await {
            Ok(response) => {
                let mut stream = response.bytes_stream();
                let mut buffer = String::new();
                
                while let Some(item) = stream.next().await {
                    match item {
                        Ok(bytes) => {
                            if let Ok(text) = std::str::from_utf8(&bytes) {
                                buffer.push_str(text);
                                
                                // Process complete SSE messages
                                while let Some(pos) = buffer.find("\n\n") {
                                    let message = buffer.drain(..pos+2).collect::<String>();
                                    
                                    // Handle keep-alive messages
                                    if message.starts_with(":") {
                                        continue; // Skip keep-alive
                                    }
                                    
                                    if let Some(data_line) = message.strip_prefix("data: ") {
                                        let data_line = data_line.trim();
                                        if let Ok(json) = serde_json::from_str::<Value>(data_line) {
                                            if json.get("connected").is_some() {
                                                let _ = tx.send(SSEMessage::Connected);
                                            } else if let Some(event_type) = json.get("type").and_then(|v| v.as_str()) {
                                                match event_type {
                                                    "interaction:created" | "interaction:updated" => {
                                                        if let Some(data) = json.get("data") {
                                                            if let Some(interaction) = data.get("interaction") {
                                                                if let Some(id) = interaction.get("id").and_then(|v| v.as_str()) {
                                                                    let _ = tx.send(SSEMessage::InteractionUpdate {
                                                                        id: id.to_string(),
                                                                        data: interaction.clone()
                                                                    });
                                                                }
                                                            }
                                                        }
                                                    }
                                                    "message:added" | "message:updated" => {
                                                        if let Some(data) = json.get("data") {
                                                            if let Some(interaction_id) = data.get("interactionId").and_then(|v| v.as_str()) {
                                                                // For message events, we need to fetch the full interaction
                                                                // Send an update event with the interaction ID
                                                                let _ = tx.send(SSEMessage::InteractionUpdate {
                                                                    id: interaction_id.to_string(),
                                                                    data: json!({ "refetch": true })
                                                                });
                                                            }
                                                        }
                                                    }
                                                    _ => {}
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        Err(e) => {
                            let _ = tx.send(SSEMessage::Error(e.to_string()));
                            break;
                        }
                    }
                }
            }
            Err(e) => {
                let _ = tx.send(SSEMessage::Error(e.to_string()));
            }
        }
        
        // Wait before reconnecting
        tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
    }
}