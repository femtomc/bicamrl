use iced::Task as Command;
use bicky_editor_core::{Action, reduce};
use super::{BickyApp, Message};

impl BickyApp {
    pub fn update(&mut self, message: Message) -> Command<Message> {
        log_debug!("update", "Received message: {:?}", message);
        
        match message {
            Message::CoreAction(action) => {
                log_info!("update", "Processing core action: {:?}", action);
                let (new_state, effects) = reduce(&self.core_state, &action);
                self.core_state = new_state;
                
                // Input clearing is now handled automatically through core state
                
                log_debug!("update", "Core action produced {} effects", effects.len());
                crate::effects::handle_effects(self.runtime.clone(), effects)
            }
            
            Message::InputChanged(value) => {
                log_debug!("update", "Input changed: {}", value);
                // Update core state through action
                let action = Action::InputChanged { content: value };
                let (new_state, effects) = reduce(&self.core_state, &action);
                self.core_state = new_state;
                log_debug!("update", "Current input: {}", self.core_state.input);
                crate::effects::handle_effects(self.runtime.clone(), effects)
            }
            
            Message::ConversationsLoaded(Ok(conversations)) => {
                log_info!("update", "Conversations loaded: {} conversations", conversations.len());
                let action = Action::ConversationsLoaded { conversations };
                let (new_state, effects) = reduce(&self.core_state, &action);
                self.core_state = new_state;
                crate::effects::handle_effects(self.runtime.clone(), effects)
            }
            
            Message::ConversationsLoaded(Err(error)) => {
                log_error!("update", "Failed to load conversations: {}", error);
                Command::none()
            }
            
            Message::WorktreesLoaded(Ok(worktrees)) => {
                log_info!("update", "Worktrees loaded: {} worktrees", worktrees.len());
                let action = Action::WorktreesLoaded { worktrees };
                let (new_state, effects) = reduce(&self.core_state, &action);
                self.core_state = new_state;
                crate::effects::handle_effects(self.runtime.clone(), effects)
            }
            
            Message::WorktreesLoaded(Err(error)) => {
                log_error!("update", "Failed to load worktrees: {}", error);
                Command::none()
            }
            
            Message::SendMessage => {
                log_info!("update", "SendMessage triggered, forwarding to CoreAction");
                // Just forward to the CoreAction handler to avoid duplication
                self.update(Message::CoreAction(Action::SendMessage))
            }
            
            Message::ApprovePermission { request_id } => {
                let action = Action::RespondToPermission { 
                    message_id: request_id.clone(), 
                    approved: true 
                };
                let (new_state, effects) = reduce(&self.core_state, &action);
                self.core_state = new_state;
                crate::effects::handle_effects(self.runtime.clone(), effects)
            }
            
            Message::DenyPermission { request_id } => {
                let action = Action::RespondToPermission { 
                    message_id: request_id.clone(), 
                    approved: false 
                };
                let (new_state, effects) = reduce(&self.core_state, &action);
                self.core_state = new_state;
                crate::effects::handle_effects(self.runtime.clone(), effects)
            }
            
            Message::Tick => {
                // Check for actions from runtime
                if let Ok(action) = self.action_receiver.try_recv() {
                    log_debug!("update", "Tick received action from runtime: {:?}", action);
                    return self.update(Message::CoreAction(action));
                }
                
                // No tick action, just return none
                Command::none()
            }
            
            Message::Noop => Command::none(),
            
            // Keyboard handling
            Message::HandleEscape => {
                if self.core_state.command_palette.open {
                    self.update(Message::CoreAction(Action::CloseCommandPalette))
                } else if self.core_state.agent_selector.open {
                    self.update(Message::CoreAction(Action::CloseAgentSelector))
                } else if let Some(idx) = self.core_state.active_conversation {
                    // Check if agent is processing
                    if let Some(conv) = self.core_state.conversations.get(idx) {
                        if conv.current_action.is_some() {
                            self.update(Message::CoreAction(Action::InterruptAgent { conversation_idx: idx }))
                        } else {
                            Command::none()
                        }
                    } else {
                        Command::none()
                    }
                } else {
                    Command::none()
                }
            }
            
            Message::HandleArrowDown => {
                if self.core_state.command_palette.open {
                    self.update(Message::CoreAction(Action::SelectNextCommand))
                } else {
                    Command::none()
                }
            }
            
            Message::HandleArrowUp => {
                if self.core_state.command_palette.open {
                    self.update(Message::CoreAction(Action::SelectPreviousCommand))
                } else {
                    Command::none()
                }
            }
            
            Message::HandleEnter => {
                if self.core_state.command_palette.open {
                    self.update(Message::CoreAction(Action::ExecuteSelectedCommand))
                } else {
                    self.update(Message::SendMessage)
                }
            }
            
            _ => Command::none(),
        }
    }
}