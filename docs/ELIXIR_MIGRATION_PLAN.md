# Elixir Migration Plan for Bicky

## Executive Summary

The TypeScript implementation has proven the concept but reveals architectural complexity that Elixir/Phoenix can dramatically simplify. Key wins from migration:

- Replace process spawning with lightweight BEAM processes
- Native supervision trees instead of manual process management
- Built-in distributed computing capabilities
- Phoenix LiveView for real-time UI without complex SSE
- Significant complexity reduction while improving reliability

## Phase 1: Foundation (Week 1-2)

### 1.1 Project Setup
```elixir
mix phx.new bicky --no-html --no-assets --database sqlite3
cd bicky
mix ecto.create
```

### 1.2 Core Schemas
```elixir
# lib/bicky/conversations/conversation.ex
schema "conversations" do
  field :source, :string
  field :type, :string
  field :metadata, :map
  
  has_many :messages, Message
  has_many :actor_attachments, ActorAttachment
  
  timestamps()
end

# lib/bicky/messages/message.ex
schema "messages" do
  field :role, :string
  field :content, :text
  field :status, :string
  field :metadata, :map
  
  belongs_to :conversation, Conversation
  
  timestamps()
end
```

### 1.3 Database Migration
- Port SQLite schema to Ecto migrations
- Keep JSON fields as :map type
- Add proper indexes and constraints

## Phase 2: API Layer (Week 2-3)

### 2.1 Phoenix Controllers
```elixir
# lib/bicky_web/controllers/conversation_controller.ex
def index(conn, params) do
  conversations = Conversations.list_conversations(params)
  render(conn, "index.json", conversations: conversations)
end

def create(conn, params) do
  with {:ok, conversation} <- Conversations.create_conversation(params) do
    conn
    |> put_status(:created)
    |> render("show.json", conversation: conversation)
  end
end
```

### 2.2 Message Processing
```elixir
# lib/bicky_web/controllers/message_controller.ex
def create(conn, %{"conversation_id" => conv_id} = params) do
  with {:ok, message} <- Messages.create_message(params),
       :ok <- ActorSupervisor.process_message(conv_id, message) do
    render(conn, "show.json", message: message)
  end
end
```

### 2.3 Router Setup
```elixir
scope "/api", BickyWeb do
  pipe_through :api
  
  resources "/conversations", ConversationController
  post "/message", MessageController, :create
  resources "/worktrees", WorktreeController
  
  # Permissions
  post "/permissions/:request_id/approve", PermissionController, :approve
  post "/permissions/:request_id/deny", PermissionController, :deny
end
```

## Phase 3: Actor System (Week 3-4)

### 3.1 Actor Supervisor
```elixir
# lib/bicky/actors/supervisor.ex
defmodule Bicky.Actors.Supervisor do
  use DynamicSupervisor
  
  def start_actor(conversation_id, actor_type) do
    spec = {
      Bicky.Actors.LLMActor,
      conversation_id: conversation_id,
      type: actor_type
    }
    
    DynamicSupervisor.start_child(__MODULE__, spec)
  end
end
```

### 3.2 LLM Actor GenServer
```elixir
# lib/bicky/actors/llm_actor.ex
defmodule Bicky.Actors.LLMActor do
  use GenServer
  
  def init(args) do
    {:ok, %{
      conversation_id: args[:conversation_id],
      strategy: create_strategy(args[:type]),
      processing: false
    }}
  end
  
  def handle_cast({:process_message, message}, state) do
    # Process with strategy
    response = state.strategy.process(message)
    
    # Broadcast result
    Phoenix.PubSub.broadcast(
      Bicky.PubSub,
      "conversation:#{state.conversation_id}",
      {:message_processed, response}
    )
    
    {:noreply, state}
  end
end
```

### 3.3 Strategy Pattern
```elixir
# lib/bicky/actors/strategies/claude_code.ex
defmodule Bicky.Actors.Strategies.ClaudeCode do
  @behaviour Bicky.Actors.Strategy
  
  def process(conversation, messages) do
    # Call Claude Code SDK
    # Return response
  end
  
  def handle_tool_call(call) do
    # Handle MCP tool permissions
  end
end
```

## Phase 4: Real-time Features (Week 4-5)

### 4.1 Phoenix Channels
```elixir
# lib/bicky_web/channels/conversation_channel.ex
defmodule BickyWeb.ConversationChannel do
  use BickyWeb, :channel
  
  def join("conversation:" <> conversation_id, _params, socket) do
    if authorized?(conversation_id, socket) do
      {:ok, assign(socket, :conversation_id, conversation_id)}
    else
      {:error, %{reason: "unauthorized"}}
    end
  end
  
  def handle_in("message:create", params, socket) do
    # Create message
    # Trigger actor processing
    broadcast!(socket, "message:created", message)
    {:reply, :ok, socket}
  end
end
```

### 4.2 PubSub Integration
```elixir
# Replace SSE with Phoenix PubSub
def subscribe_to_conversation(conversation_id) do
  Phoenix.PubSub.subscribe(Bicky.PubSub, "conversation:#{conversation_id}")
end

def broadcast_update(conversation_id, event) do
  Phoenix.PubSub.broadcast(
    Bicky.PubSub,
    "conversation:#{conversation_id}",
    event
  )
end
```

## Phase 5: Advanced Features (Week 5-6)

### 5.1 Distributed Actors
```elixir
# lib/bicky/actors/distributed_registry.ex
defmodule Bicky.Actors.DistributedRegistry do
  use Horde.Registry
  
  def find_or_start_actor(conversation_id) do
    case Horde.Registry.lookup(__MODULE__, conversation_id) do
      [{pid, _}] -> {:ok, pid}
      [] -> start_actor_on_best_node(conversation_id)
    end
  end
end
```

### 5.2 Event Sourcing (Simplified)
```elixir
# lib/bicky/events/event_log.ex
defmodule Bicky.Events.EventLog do
  use Ecto.Schema
  
  schema "events" do
    field :sequence, :integer
    field :source, :map
    field :action, :map
    field :reversible, :boolean
    
    timestamps()
  end
  
  def append_event(event) do
    # Simple Ecto insert with auto-incrementing sequence
  end
end
```

### 5.3 Tool Permission System
```elixir
# lib/bicky/tools/permission_server.ex
defmodule Bicky.Tools.PermissionServer do
  use GenServer
  
  def request_permission(tool_call) do
    GenServer.call(__MODULE__, {:request_permission, tool_call})
  end
  
  def handle_call({:request_permission, tool_call}, from, state) do
    # Store pending request
    # Broadcast to UI
    # Wait for approval
  end
end
```

## Migration Strategy

### Data Migration
1. Export SQLite data to JSON
2. Import using Ecto changesets
3. Validate data integrity

### API Compatibility
1. Keep same REST endpoints
2. Add deprecation headers for changes
3. Support both SSE and WebSockets during transition

### Rollout Plan
1. Run Elixir service alongside TypeScript
2. Route read traffic to Elixir first
3. Gradually migrate write operations
4. Deprecate TypeScript service

## Performance Improvements

### Expected Gains
- **Memory**: 10x reduction (BEAM processes vs OS processes)
- **Latency**: 5x improvement (no process spawning)
- **Throughput**: 20x increase (concurrent request handling)
- **Reliability**: Built-in supervision and recovery

### Benchmarks to Track
- Message processing time
- Concurrent conversation limit
- Memory per conversation
- Actor spawn time

## Risk Mitigation

### Technical Risks
1. **LLM SDK Compatibility**: May need to wrap Node SDKs
   - Mitigation: Use Elixir HTTP clients directly
   
2. **MCP Protocol Support**: No native Elixir library
   - Mitigation: Implement minimal MCP client

3. **SQLite Performance**: Ecto SQLite adapter limitations
   - Mitigation: Consider PostgreSQL if needed

### Operational Risks
1. **Team Learning Curve**: New language/framework
   - Mitigation: Pair programming, code reviews
   
2. **Deployment Complexity**: BEAM release management
   - Mitigation: Use Mix releases, containerize

## Success Criteria

1. **Feature Parity**: All TypeScript features working
2. **Performance**: 5x improvement in key metrics  
3. **Reliability**: 99.9% uptime without manual intervention
4. **Developer Velocity**: Faster feature development
5. **Operational Simplicity**: Reduced deployment complexity

## Timeline Summary

- **Week 1-2**: Foundation (schemas, migrations, basic API)
- **Week 2-3**: API Layer (controllers, contexts)
- **Week 3-4**: Actor System (GenServers, strategies)
- **Week 4-5**: Real-time (Channels, PubSub)
- **Week 5-6**: Advanced Features (distribution, tools)
- **Week 7-8**: Migration and Testing
- **Week 9-10**: Production Rollout

Total: 10 weeks from start to production