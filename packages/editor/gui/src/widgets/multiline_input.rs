use iced::widget::{container, text_input};
use iced::{Element, Length, Border, Color};

pub struct MultilineInput {
    placeholder: String,
}

impl MultilineInput {
    pub fn new() -> Self {
        Self {
            placeholder: "Type a message... (Enter to send)".to_string(),
        }
    }
}

pub fn multiline_input_view<'a, Message>(
    input: &'a MultilineInput,
    value: &'a str,
    on_change: impl Fn(String) -> Message + 'a,
    on_submit: Message,
) -> Element<'a, Message> 
where
    Message: Clone + 'a,
{
    let input_widget = text_input(&input.placeholder, value)
        .on_input(on_change)
        .on_submit(on_submit)
        .size(14)
        .padding(12);

    container(input_widget)
        .width(Length::Fill)
        .style(|_theme| container::Style {
            background: Some(iced::Background::Color(Color::from_rgb(0.15, 0.15, 0.15))),
            border: Border {
                color: Color::from_rgb(0.3, 0.3, 0.3),
                width: 1.0,
                radius: 8.0.into(),
            },
            ..Default::default()
        })
        .into()
}