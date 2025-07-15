use iced::{Element, Length};
use iced::widget::{column, container, row, text, Space};
use crate::fonts;

#[derive(Debug, Clone)]
pub enum Fragment {
    Text(String),
    Code(String),
    CodeBlock { language: Option<String>, content: String },
}

pub fn parse_markdown(content: &str) -> Vec<Fragment> {
    let mut fragments = Vec::new();
    let mut current_text = String::new();
    let mut chars = content.chars().peekable();
    
    while let Some(ch) = chars.next() {
        if ch == '`' {
            // Check if it's a code block (```)
            if chars.peek() == Some(&'`') {
                chars.next(); // consume second `
                if chars.peek() == Some(&'`') {
                    chars.next(); // consume third `
                    
                    // Push any accumulated text
                    if !current_text.is_empty() {
                        fragments.push(Fragment::Text(current_text.clone()));
                        current_text.clear();
                    }
                    
                    // Check for language specifier
                    let mut language = String::new();
                    while let Some(&ch) = chars.peek() {
                        if ch == '\n' {
                            chars.next();
                            break;
                        }
                        language.push(chars.next().unwrap());
                    }
                    
                    // Collect code block content
                    let mut code_content = String::new();
                    let mut found_end = false;
                    
                    while let Some(ch) = chars.next() {
                        if ch == '`' && chars.peek() == Some(&'`') {
                            chars.next(); // consume second `
                            if chars.peek() == Some(&'`') {
                                chars.next(); // consume third `
                                found_end = true;
                                break;
                            } else {
                                code_content.push('`');
                                code_content.push('`');
                            }
                        } else {
                            code_content.push(ch);
                        }
                    }
                    
                    if found_end {
                        fragments.push(Fragment::CodeBlock {
                            language: if language.is_empty() { None } else { Some(language) },
                            content: code_content,
                        });
                    } else {
                        // Unclosed code block, treat as text
                        current_text.push_str("```");
                        current_text.push_str(&language);
                        if !language.is_empty() {
                            current_text.push('\n');
                        }
                        current_text.push_str(&code_content);
                    }
                    continue;
                }
            }
            
            // Inline code
            if !current_text.is_empty() {
                fragments.push(Fragment::Text(current_text.clone()));
                current_text.clear();
            }
            
            let mut code_content = String::new();
            let mut found_end = false;
            
            while let Some(ch) = chars.next() {
                if ch == '`' {
                    found_end = true;
                    break;
                }
                code_content.push(ch);
            }
            
            if found_end && !code_content.is_empty() {
                fragments.push(Fragment::Code(code_content));
            } else {
                // Unclosed inline code, treat as text
                current_text.push('`');
                current_text.push_str(&code_content);
            }
        } else {
            current_text.push(ch);
        }
    }
    
    // Push any remaining text
    if !current_text.is_empty() {
        fragments.push(Fragment::Text(current_text));
    }
    
    fragments
}

pub fn render_fragments<'a, Message: 'a>(fragments: &'a [Fragment]) -> Element<'a, Message> {
    use crate::theme;
    
    let mut elements: Vec<Element<Message>> = Vec::new();
    let mut current_paragraph: Vec<Element<Message>> = Vec::new();
    
    for fragment in fragments {
        match fragment {
            Fragment::Text(content) => {
                // Split by newlines to handle paragraphs
                let lines: Vec<&str> = content.split('\n').collect();
                for (i, line) in lines.iter().enumerate() {
                    if i > 0 {
                        // New paragraph
                        if !current_paragraph.is_empty() {
                            elements.push(
                                row(current_paragraph.drain(..))
                                    .spacing(4)
                                    .into()
                            );
                        }
                        elements.push(Space::with_height(8).into());
                    }
                    
                    if !line.trim().is_empty() {
                        current_paragraph.push(
                            text(*line)
                                .size(14)
                                .font(fonts::BERKELEY_MONO)
                                .color(theme::Colors::TEXT)
                                .into()
                        );
                    }
                }
            }
            Fragment::Code(content) => {
                current_paragraph.push(
                    container(
                        text(content)
                            .size(13)
                            .font(fonts::BERKELEY_MONO)
                            .color(theme::Colors::PRIMARY)
                    )
                    .padding([2, 6])
                    .style(|theme| theme::code_container(theme))
                    .into()
                );
            }
            Fragment::CodeBlock { language, content } => {
                // Flush current paragraph
                if !current_paragraph.is_empty() {
                    elements.push(
                        row(current_paragraph.drain(..))
                            .spacing(4)
                            .into()
                    );
                }
                
                // Add spacing before code block
                elements.push(Space::with_height(8).into());
                
                // Code block with optional language label
                let mut code_block = column![];
                
                if let Some(lang) = language {
                    if !lang.is_empty() {
                        code_block = code_block.push(
                            container(
                                text(lang)
                                    .size(11)
                                    .color(theme::Colors::TEXT_DIM)
                                    .font(fonts::BERKELEY_MONO_BOLD)
                            )
                            .padding(6)
                        );
                    }
                }
                
                code_block = code_block.push(
                    container(
                        text(content.trim_end())
                            .size(13)
                            .font(fonts::BERKELEY_MONO)
                            .color(theme::Colors::TEXT)
                    )
                    .padding(12)
                    .width(Length::Fill)
                );
                
                elements.push(
                    container(code_block)
                        .width(Length::Fill)
                        .style(|theme| theme::code_container(theme))
                        .into()
                );
                
                // Add spacing after code block
                elements.push(Space::with_height(8).into());
            }
        }
    }
    
    // Flush any remaining paragraph content
    if !current_paragraph.is_empty() {
        elements.push(
            row(current_paragraph.into_iter())
                .spacing(4)
                .into()
        );
    }
    
    column(elements)
        .spacing(4)
        .width(Length::Fill)
        .into()
}