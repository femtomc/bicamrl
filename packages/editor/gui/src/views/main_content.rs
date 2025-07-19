use iced::widget::{button, column, container, row, scrollable, text, Column, Space};
use iced::{Element, Length};
use bicky_editor_core::types::{Message as CoreMessage, MessageRole, MessageStatus};
use bicky_editor_core::{Action};
use crate::app::{BickyApp, Message};
use crate::theme;
use crate::views;

pub fn view_main_content(app: &BickyApp) -> Element<Message> {
    let state = &app.core_state;
    
    log_debug!("view", "view_main_content called, active_conversation: {:?}", state.active_conversation);
    
    // Header bar with minimal chrome
    let header = view_header(app);
    
    // Message area
    let message_area = if let Some(conv_idx) = state.active_conversation {
        if let Some(conv) = state.conversations.get(conv_idx) {
            log_debug!("view", "Rendering conversation {}, current_action: {:?}", conv.id, conv.current_action);
            let messages = conv.messages.iter().map(|msg| {
                view_message(msg)
            });
            
            let mut message_column = Column::with_children(messages.collect::<Vec<_>>())
                .spacing(16)
                .padding([20, 24]);
                
            // Add thinking animation if processing
            if let Some(current_action) = &conv.current_action {
                log_info!("view", "Rendering current_action: {}", current_action);
                message_column = message_column.push(
                    container(
                        row![
                            text("Bicky").size(13).color(theme::TEXT_PRIMARY),
                            Space::with_width(8),
                            text(current_action).size(13).color(theme::TEXT_MUTED),
                        ]
                        .spacing(4)
                        .align_y(iced::Alignment::Center)
                    )
                    .padding([8, 12])
                    .width(Length::Fill)
                    .style(|theme| theme::container_message_assistant(theme))
                );
            } else {
                log_debug!("view", "No current_action for conversation");
            }
            
            scrollable(message_column)
                .width(Length::Fill)
                .height(Length::Fill)
                .id(scrollable::Id::new("messages"))
                .into()
        } else {
            empty_view()
        }
    } else {
        empty_view()
    };
    
    // Status bar with input
    let status_bar = view_status_bar(app);
    
    column![header, message_area, status_bar]
        .spacing(0)
        .width(Length::Fill)
        .height(Length::Fill)
        .into()
}

fn view_header(app: &BickyApp) -> Element<Message> {
    let state = &app.core_state;
    
    let mut header_content = vec![];
    
    // No toggle button - use Cmd+B instead
    
    // Conversation title
    if let Some(conv_idx) = state.active_conversation {
        if let Some(conv) = state.conversations.get(conv_idx) {
            header_content.push(Space::with_width(12).into());
            header_content.push(
                text(conv.title.clone().unwrap_or_else(|| "New Conversation".to_string()))
                    .size(14)
                    .into()
            );
            
            // Agent badges removed from header - shown in status bar only
        }
    }
    
    header_content.push(Space::with_width(Length::Fill).into());
    
    // Export moved to command palette
    
    container(
        row(header_content)
            .spacing(8)
            .align_y(iced::Alignment::Center)
            .padding([8, 16])
    )
    .width(Length::Fill)
    .style(|theme| theme::container_header(theme))
    .into()
}

fn view_status_bar(app: &BickyApp) -> Element<Message> {
    let state = &app.core_state;
    
    let mut status_items = vec![];
    
    // Worktree indicator - show conversation's worktree context
    if let Some(conv_idx) = state.active_conversation {
        if let Some(conv) = state.conversations.get(conv_idx) {
            if let Some(worktree_id) = &conv.worktree_id {
                // Find the worktree details
                if let Some(worktree) = state.available_worktrees.iter().find(|w| &w.id == worktree_id) {
                    status_items.push(
                        button(
                            row![
                                text(crate::symbols::symbols::GIT_BRANCH).size(12).color(theme::Colors::PRIMARY),
                                Space::with_width(4),
                                text(worktree.branch.as_deref().unwrap_or("unknown")).size(12),
                            ]
                            .align_y(iced::Alignment::Center)
                        )
                        .on_press(Message::CoreAction(Action::ToggleWorktreeDropdown))
                        .padding([4, 8])
                        .style(|theme, _| iced::widget::button::Style {
                            background: Some(iced::Background::Color(theme::Colors::SURFACE_LIGHT)),
                            text_color: theme::Colors::TEXT,
                            border: iced::Border {
                                color: theme::Colors::BORDER,
                                width: 1.0,
                                radius: 4.0.into(),
                            },
                            ..Default::default()
                        })
                        .into()
                    );
                } else {
                    // Worktree selector when no worktree is set
                    status_items.push(
                        button(
                            text("Select worktree").size(12).color(theme::Colors::TEXT_DIM)
                        )
                        .on_press(Message::CoreAction(Action::ToggleWorktreeDropdown))
                        .padding([4, 8])
                        .style(|theme, _| theme::button_ghost(theme))
                        .into()
                    );
                }
            } else {
                // No worktree set for this conversation
                status_items.push(
                    button(
                        text("Select worktree").size(12).color(theme::Colors::TEXT_DIM)
                    )
                    .on_press(Message::CoreAction(Action::ToggleWorktreeDropdown))
                    .padding([4, 8])
                    .style(|theme, _| theme::button_ghost(theme))
                    .into()
                );
            }
        }
    }
    
    status_items.push(Space::with_width(12).into());
    
    // Agent indicator and interrupt button
    if let Some(conv_idx) = state.active_conversation {
        if let Some(conv) = state.conversations.get(conv_idx) {
            if let Some(agents) = &conv.attached_agents {
                for agent in agents {
                    let badge_color = match agent.agent_type.as_str() {
                        "claude-code" => theme::BLUE,
                        "lm-studio" => theme::GREEN,
                        _ => theme::TEXT_MUTED,
                    };
                    
                    status_items.push(
                        container(
                            text(&agent.agent_type)
                                .size(11)
                                .color(badge_color)
                        )
                        .padding([2, 6])
                        .style(move |theme| theme::container_badge(theme, badge_color))
                        .into()
                    );
                    status_items.push(Space::with_width(8).into());
                }
            }
            
            // Show interrupt button if agent is processing
            if conv.current_action.is_some() {
                status_items.push(
                    button(
                        row![
                            text(crate::symbols::symbols::STOP).size(12),
                            Space::with_width(4),
                            text("Interrupt").size(12)
                        ]
                        .align_y(iced::Alignment::Center)
                    )
                    .on_press(Message::CoreAction(Action::InterruptAgent { 
                        conversation_idx: conv_idx 
                    }))
                    .padding([4, 8])
                    .style(|theme, _| theme::button_destructive(theme))
                    .into()
                );
                status_items.push(Space::with_width(8).into());
            }
        }
    }
    
    // Show attached agents and agent button
    if let Some(conv_idx) = state.active_conversation {
        if let Some(conv) = state.conversations.get(conv_idx) {
            status_items.push(Space::with_width(8).into());
            
            // Show attached agents if any
            if let Some(agents) = &conv.attached_agents {
                if !agents.is_empty() {
                    for agent in agents {
                        status_items.push(
                            container(
                                row![
                                    text(crate::symbols::symbols::ROBOT).size(12),
                                    Space::with_width(4),
                                    text(&agent.agent_type).size(12)
                                ]
                                .align_y(iced::Alignment::Center)
                            )
                            .padding([4, 8])
                            .style(|theme| theme::container_surface(theme))
                            .into()
                        );
                        status_items.push(Space::with_width(4).into());
                    }
                }
            }
            
            // Add "Attach agent" button
            status_items.push(
                button(
                    row![
                        text("+").size(12),
                        Space::with_width(4),
                        text("Attach agent").size(12)
                    ]
                    .align_y(iced::Alignment::Center)
                )
                .on_press(Message::CoreAction(Action::OpenAgentSelector { 
                    conversation_idx: conv_idx 
                }))
                .padding([4, 8])
                .style(|theme, _| theme::button_ghost(theme))
                .into()
            );
        }
    }
    
    status_items.push(Space::with_width(Length::Fill).into());
    
    // Input area (send button removed - use Enter key)
    let input = crate::widgets::multiline_input_view(&app.multiline_input, &app.core_state.input, Message::InputChanged, Message::SendMessage);
    status_items.push(input);
    
    container(
        row(status_items)
            .spacing(0)
            .align_y(iced::Alignment::Center)
            .padding([8, 12])
    )
    .width(Length::Fill)
    .style(|theme| theme::container_surface(theme))
    .into()
}

fn view_message<'a>(msg: &'a CoreMessage) -> Element<'a, Message> {
    let role_text = match msg.role {
        MessageRole::User => "You",
        MessageRole::Assistant => "Bicky",
        MessageRole::System => "System",
        MessageRole::Tool => "Tool",
    };
    
    // Status shown through opacity instead of icons
    let opacity = match msg.status {
        MessageStatus::Pending => 0.6,
        MessageStatus::Processing => 0.8,
        MessageStatus::Completed => 1.0,
        MessageStatus::Error | MessageStatus::Failed => 1.0,
        MessageStatus::WaitingForPermission => 0.8,
    };
    
    let is_error = matches!(msg.status, MessageStatus::Error | MessageStatus::Failed);
    
    let header = text(role_text)
        .size(13)
        .color(if is_error { theme::Colors::ERROR } else { theme::TEXT_PRIMARY });
    
    let content = container(
        text(&msg.content).size(13)
    )
    .padding([6, 0]);
    
    let is_user = msg.role == MessageRole::User;
    container(
        column![header, content]
            .spacing(4)
    )
    .width(Length::Fill)
    .padding([10, 14])
    .style(move |theme| {
        let mut style = if is_user {
            theme::container_message_user(theme)
        } else {
            theme::container_message_assistant(theme)
        };
        // Apply opacity through background color alpha
        if let Some(iced::Background::Color(mut color)) = style.background {
            color.a *= opacity;
            style.background = Some(iced::Background::Color(color));
        }
        style
    })
    .into()
}

fn empty_view<'a>() -> Element<'a, Message> {
    container(
        column![
            text("No conversation selected")
                .size(18)
                .color(theme::TEXT_MUTED),
            text("Select a conversation or create a new one")
                .size(13)
                .color(theme::Colors::TEXT_DIM)
        ]
        .spacing(8)
        .align_x(iced::Alignment::Center)
    )
    .width(Length::Fill)
    .height(Length::Fill)
    .center_x(Length::Fill)
    .center_y(Length::Fill)
    .into()
}