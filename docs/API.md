# Bicamrl API Documentation

## Base URL

```
http://localhost:3456
```

The port can be configured via:
- Environment variable: `PORT=3457 bun run dev`
- Written to `.bicamrl-port` file for GUI discovery

## Endpoints

### System Status

#### GET /status
Get current system and queue status.

**Response:**
```json
{
  "queued": 2,
  "processing": 1,
  "waitingForPermission": 0,
  "totalInteractions": 15,
  "activeAgents": ["wake"]
}
```

### Interactions

#### POST /message
Send a message to the agent system.

**Request Body:**
```json
{
  "content": "What files are in the src directory?"
}
```

**Response:**
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "status": "queued"
}
```

#### GET /interactions
Get all interactions.

**Response:**
```json
[
  {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "type": "query",
    "status": "completed",
    "content": [
      {
        "role": "user",
        "content": "What files are in the src directory?"
      },
      {
        "role": "assistant", 
        "content": "The src directory contains..."
      }
    ],
    "metadata": {
      "tokens": {
        "input": 45,
        "output": 123,
        "total": 168
      },
      "model": "claude-3-opus-20240229",
      "processingTimeMs": 1234
    }
  }
]
```

#### GET /interactions/:id
Get a specific interaction by ID.

**Response:** Same as single item from `/interactions`

### Permissions

#### POST /interactions/:id/permission
Respond to a tool permission request.

**Request Body:**
```json
{
  "approved": true
}
```

**Response:**
```json
{
  "success": true
}
```

**Error Response (400):**
```json
{
  "error": "Interaction not waiting for permission"
}
```

### Real-time Updates

#### GET /stream
Server-Sent Events endpoint for real-time updates.

**Connection:**
```javascript
const eventSource = new EventSource('http://localhost:3456/stream');

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Event:', data);
};
```

**Event Types:**

1. **Connection Established**
```json
{
  "connected": true
}
```

2. **Interaction Posted**
```json
{
  "type": "interaction_posted",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    "interactionId": "123e4567-e89b-12d3-a456-426614174000",
    "type": "query"
  }
}
```

3. **Interaction Processing**
```json
{
  "type": "interaction_processing",
  "timestamp": "2024-01-15T10:30:01Z",
  "data": {
    "interactionId": "123e4567-e89b-12d3-a456-426614174000",
    "agentId": "wake"
  }
}
```

4. **Interaction Updated**
```json
{
  "type": "interaction_updated",
  "timestamp": "2024-01-15T10:30:02Z",
  "data": {
    "interactionId": "123e4567-e89b-12d3-a456-426614174000",
    "status": "waiting_for_permission",
    "metadata": {
      "currentAction": "⊕ 1.2s • 45 tokens"
    }
  }
}
```

5. **Interaction Completed**
```json
{
  "type": "interaction_completed",
  "timestamp": "2024-01-15T10:30:05Z",
  "data": {
    "interactionId": "123e4567-e89b-12d3-a456-426614174000",
    "result": {
      "response": "The src directory contains...",
      "model": "claude-3-opus-20240229",
      "usage": {
        "inputTokens": 45,
        "outputTokens": 123,
        "totalTokens": 168
      }
    }
  }
}
```

## Interaction States

1. **queued** - Waiting to be processed
2. **processing** - Currently being handled by an agent
3. **waiting_for_permission** - Requires user approval for tool use
4. **completed** - Successfully processed
5. **error** - Processing failed

## Tool Permission Flow

When an agent wants to use a tool:

1. Interaction status changes to `waiting_for_permission`
2. Response includes `permission_request` field:
```json
{
  "permission_request": {
    "toolName": "Read",
    "description": "Read the contents of a file from the filesystem",
    "arguments": {
      "file_path": "/path/to/file.txt"
    }
  }
}
```

3. User responds via `POST /interactions/:id/permission`
4. If approved, tool executes and interaction completes
5. If denied, interaction completes with denial message

## Error Handling

All endpoints return appropriate HTTP status codes:

- **200** - Success
- **400** - Bad request (invalid input)
- **404** - Resource not found
- **500** - Internal server error

Error response format:
```json
{
  "error": "Error message description"
}
```

## Rate Limiting

Currently no rate limiting is implemented. Future versions will include:
- Per-IP rate limiting
- Authenticated user quotas
- Configurable limits in Mind.toml