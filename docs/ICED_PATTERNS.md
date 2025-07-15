# Iced Patterns for Bicamrl GUI Development

## Quick Reference

### Basic Application Structure
```rust
use iced::{Element, Task, Theme};

fn main() -> iced::Result {
    iced::application(update, view)
        .theme(|_| Theme::Dark)
        .run()
}

fn update(state: &mut State, message: Message) -> Task<Message> {
    match message {
        Message::DoSomething => {
            // Update state
            Task::none()
        }
        Message::AsyncOperation => {
            Task::perform(async_work(), Message::AsyncComplete)
        }
    }
}

fn view(state: &State) -> Element<Message> {
    // Build UI here
}
```

## Core Patterns for Bicamrl

### 1. Application Setup (iced 0.13+)
```rust
// Modern iced uses procedural API, not Application trait
iced::application(update, view)
    .window_size((1200, 800))
    .theme(|_| Theme::Dark)
    .subscription(subscription)
    .run()
```

### 2. State Management
```rust
#[derive(Default)]
struct BickyGui {
    // UI State
    current_session: Option<Session>,
    interaction_input: String,
    
    // Domain State
    api_client: ApiClient,
    sessions: Vec<Session>,
    interactions: Vec<Interaction>,
    
    // Status
    queue_status: Option<InteractionQueueStatus>,
    error_message: Option<String>,
}
```

### 3. Message Pattern
```rust
#[derive(Debug, Clone)]
enum Message {
    // User Actions
    CreateSession,
    SelectSession(String),
    SendInteraction,
    InputChanged(String),
    
    // Async Results
    SessionCreated(Result<Session, String>),
    InteractionsLoaded(Result<Vec<Interaction>, String>),
    
    // Real-time Updates
    StreamEvent(StreamingEvent),
    
    // Widget Operations
    FocusInput,
    ScrollToBottom,
}
```

### 4. Update with Tasks (not Commands!)
```rust
fn update(state: &mut BickyGui, message: Message) -> Task<Message> {
    match message {
        Message::CreateSession => {
            let client = state.api_client.clone();
            Task::perform(
                async move {
                    client.create_session(request).await
                        .map_err(|e| e.to_string())
                },
                Message::SessionCreated,
            )
        }
        Message::SessionCreated(Ok(session)) => {
            state.current_session = Some(session);
            Task::none()
        }
        // Batch multiple tasks
        Message::RefreshAll => {
            Task::batch([
                load_sessions(),
                fetch_queue_status(),
            ])
        }
    }
}
```

### 5. View Construction
```rust
fn view(state: &BickyGui) -> Element<Message> {
    let sidebar = column![
        text("Sessions").size(20),
        button("New Session").on_press(Message::CreateSession),
        scrollable(
            Column::with_children(
                state.sessions.iter().map(|s| session_item(s))
            )
        ).height(Length::Fill)
    ]
    .spacing(10)
    .padding(10)
    .width(Fixed(250));
    
    let main_content = container(
        if let Some(session) = &state.current_session {
            interaction_view(state, session)
        } else {
            empty_state()
        }
    )
    .style(container::rounded_box)
    .padding(20);
    
    row![sidebar, main_content].into()
}
```

### 6. Subscriptions for Real-time Updates
```rust
fn subscription(state: &BickyGui) -> Subscription<Message> {
    if let Some(session) = &state.current_session {
        sse_subscription(session.id.clone())
            .map(Message::StreamEvent)
    } else {
        Subscription::none()
    }
}

// Custom subscription
fn sse_subscription(session_id: String) -> Subscription<StreamingEvent> {
    Subscription::run_with_id(
        format!("sse-{}", session_id),
        stream::unfold(
            SseState::new(session_id),
            |state| async move {
                // SSE logic here
            }
        )
    )
}
```

### 7. Widget Styling
```rust
use iced::widget::{button, container};
use iced::theme;

// Using built-in styles
button("Click me")
    .style(button::primary)
    .on_press(Message::Click)

// Custom styling with closures
container(content)
    .style(|theme: &Theme, status| {
        let palette = theme.extended_palette();
        container::Style {
            background: Some(palette.background.weak.color.into()),
            border: Border {
                color: palette.primary.strong.color,
                width: 1.0,
                radius: 8.0.into(),
            },
            ..Default::default()
        }
    })
```

### 8. Keyed Lists for Performance
```rust
use iced::widget::keyed_column;

keyed_column(
    state.interactions.iter().map(|interaction| {
        (
            interaction.id.clone(), // Key
            interaction_widget(interaction) // Element
        )
    })
)
```

### 9. Focus Management
```rust
use iced::widget::{text_input, Id};

let input_id = Id::new("interaction-input");

// In view
text_input("Type here...", &state.input)
    .id(input_id.clone())
    .on_input(Message::InputChanged)

// In update
Message::FocusInput => {
    text_input::focus(input_id)
}
```

### 10. Error Handling Pattern
```rust
fn view(state: &BickyGui) -> Element<Message> {
    let content = main_view(state);
    
    if let Some(error) = &state.error_message {
        column![
            error_banner(error),
            content
        ].into()
    } else {
        content
    }
}

fn error_banner(message: &str) -> Element<Message> {
    container(
        row![
            text(message).style(Color::from_rgb(1.0, 0.0, 0.0)),
            button("×").on_press(Message::ClearError)
        ]
        .spacing(10)
        .align_y(Alignment::Center)
    )
    .style(container::bordered_box)
    .padding(10)
    .into()
}
```

## Important Notes

### API Changes in iced 0.13+
- **No more `Command`**: Use `Task` instead
- **No more `Application` trait**: Use `iced::application()` function
- **Theme styling**: Use closures instead of theme variants
- **Widget imports**: Most widgets are in `iced::widget`

### Common Gotchas
1. **Clone for async**: Always clone what you need before async blocks
2. **Task vs Subscription**: Tasks for one-time ops, Subscriptions for streams
3. **Length::Fill**: Use sparingly, can cause layout issues
4. **State in widgets**: Use widget operations, not direct mutation
5. **Theme consistency**: Define custom theme early and use throughout

### Performance Tips
1. Use `keyed_column` for dynamic lists
2. Minimize state clones in view function
3. Use `lazy` widgets for expensive computations
4. Profile with `iced::debug` feature

### Bicamrl-Specific Patterns

#### Split Editor Layout
```rust
use iced::widget::pane_grid;

// State
pane_grid: pane_grid::State<PaneContent>,

// View
pane_grid(&state.pane_grid)
    .on_drag(Message::PaneDragged)
    .on_resize(10, Message::PaneResized)
```

#### Rich Text Display
```rust
use iced::widget::markdown;

markdown(&interaction.content)
    .on_link(Message::LinkClicked)
```

#### Async LLM Integration
```rust
fn send_to_llm(content: String) -> Task<Message> {
    Task::perform(
        async move {
            let response = llm_client.complete(content).await?;
            Ok(response)
        },
        |result| Message::LLMResponse(result)
    )
}
```