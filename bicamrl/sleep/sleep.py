"""Core Sleep implementation."""

import asyncio
import json
import logging
import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional, Protocol

from ..core.llm_service import LLMService
from ..core.memory import Memory
from ..core.pattern_detector import PatternDetector
from ..core.world_model import WorldModelInferencer
from ..storage.hybrid_store import HybridStore
from .role_manager import RoleManager
from .role_proposer import RoleProposer
from .roles import CommandRole

# World model functionality now integrated into core.world_model

logger = logging.getLogger(__name__)


class LLMProvider(Protocol):
    """Protocol for LLM providers."""

    async def analyze(self, prompt: str, **kwargs) -> str:
        """Analyze content and return insights."""
        ...

    async def generate(self, prompt: str, **kwargs) -> str:
        """Generate content based on prompt."""
        ...


class AnalysisType(Enum):
    """Types of analysis the KBM can perform."""

    PATTERN_MINING = "pattern_mining"
    CONTEXT_OPTIMIZATION = "context_optimization"
    PROMPT_ENHANCEMENT = "prompt_enhancement"
    KNOWLEDGE_CONSOLIDATION = "knowledge_consolidation"
    ERROR_ANALYSIS = "error_analysis"


@dataclass
class Observation:
    """Single observation of main instance behavior."""

    timestamp: datetime
    interaction_type: str
    query: str
    context_used: Dict[str, Any]
    response: str
    tokens_used: int
    latency: float
    success: bool
    metadata: Dict[str, Any] = None


@dataclass
class Insight:
    """Insight derived from analysis."""

    type: AnalysisType
    confidence: float
    description: str
    recommendations: List[str]
    data: Dict[str, Any]
    timestamp: datetime = None

    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.now()


class Sleep:
    """Sleep for background processing and knowledge base optimization through meta-cognitive analysis."""

    def __init__(
        self,
        memory: Memory,
        llm_providers: Dict[str, LLMProvider],
        config: Optional[Dict[str, Any]] = None,
        hybrid_store: Optional[HybridStore] = None,
    ):
        self.memory = memory
        self.llms = llm_providers
        self.config = config or {}
        self.hybrid_store = hybrid_store

        # Configuration
        self.batch_size = self.config.get("batch_size", 10)
        self.analysis_interval = self.config.get("analysis_interval", 300)  # 5 minutes
        self.min_confidence = self.config.get("min_confidence", 0.7)

        # Sleep state
        self.observation_queue = asyncio.Queue()
        self.insights_cache = []
        self.is_running = False
        self._tasks = []

        # Role management with hybrid store for better discovery
        self.role_manager = RoleManager(memory, hybrid_store, config)
        self.current_role: Optional[CommandRole] = None

        # World model integration
        self.world_model: Optional[WorldModelInferencer] = None
        self.llm_service: Optional[LLMService] = None

        # Map of role to provider IDs for multi-agent support
        self.role_providers = self._build_role_provider_map()

    async def start(self):
        """Start the sleep background tasks."""
        if self.is_running:
            return

        self.is_running = True

        # Initialize world model and LLM service
        self.world_model = WorldModelInferencer(self.memory)
        self.llm_service = LLMService(
            {
                "llm_providers": self.config.get("llm_providers", {}),
                "default_provider": list(self.llms.keys())[0] if self.llms else "mock",
            }
        )

        # Create and inject role proposer into role manager
        self.role_manager.role_proposer = RoleProposer(
            memory=self.memory,
            world_model=self.world_model,
            llm_service=self.llm_service,
            hybrid_store=self.hybrid_store,
        )

        # Initialize role manager
        await self.role_manager.initialize()

        # Start background tasks
        self._tasks = [
            asyncio.create_task(self._observation_processor()),
            asyncio.create_task(self._periodic_analyzer()),
            asyncio.create_task(self._insight_applicator()),
            asyncio.create_task(self._role_monitor()),
        ]

        logger.info("Sleep started with role management")

    async def stop(self):
        """Stop the sleep background tasks."""
        self.is_running = False

        # Cancel all tasks
        for task in self._tasks:
            task.cancel()

        # Wait for tasks to complete
        await asyncio.gather(*self._tasks, return_exceptions=True)

        logger.info("Sleep stopped")

    async def observe(self, observation: Observation):
        """Add an observation to the queue for processing."""
        # Add role context to observation
        if self.current_role:
            if observation.metadata is None:
                observation.metadata = {}
            observation.metadata["active_role"] = self.current_role.name
            observation.metadata["role_confidence"] = self.current_role.confidence_threshold

        await self.observation_queue.put(observation)

        # Immediate analysis for critical observations
        if self._is_critical(observation):
            await self._immediate_analysis(observation)

    def _is_critical(self, observation: Observation) -> bool:
        """Determine if an observation requires immediate analysis."""
        # High latency
        if observation.latency > 10.0:
            return True

        # Failure
        if not observation.success:
            return True

        # High token usage
        if observation.tokens_used > 10000:
            return True

        return False

    async def _immediate_analysis(self, observation: Observation):
        """Perform immediate analysis on critical observations."""
        try:
            # Analyze the specific issue
            if not observation.success:
                insight = await self._analyze_failure(observation)
            elif observation.latency > 10.0:
                insight = await self._analyze_performance(observation)
            else:
                insight = await self._analyze_resource_usage(observation)

            if insight and insight.confidence >= self.min_confidence:
                self.insights_cache.append(insight)
                await self._apply_insight(insight)

        except Exception as e:
            logger.error(f"Immediate analysis failed: {e}")

    async def _observation_processor(self):
        """Process observations from the queue."""
        batch = []

        while self.is_running:
            try:
                # Collect observations into batches
                timeout = 1.0 if batch else None
                observation = await asyncio.wait_for(self.observation_queue.get(), timeout=timeout)
                batch.append(observation)

                # Process batch when full or on timeout
                if len(batch) >= self.batch_size:
                    await self._process_observation_batch(batch)
                    batch = []

            except asyncio.TimeoutError:
                # Process partial batch on timeout
                if batch:
                    await self._process_observation_batch(batch)
                    batch = []

            except Exception as e:
                logger.error(f"Observation processing error: {e}")

    async def _process_observation_batch(self, observations: List[Observation]):
        """Process a batch of observations."""
        try:
            # Log to memory for pattern detection
            for obs in observations:
                await self.memory.log_interaction(
                    action=obs.interaction_type,
                    file_path=obs.metadata.get("file_path") if obs.metadata else None,
                    details={
                        "query": obs.query[:200],  # Truncate for storage
                        "tokens": obs.tokens_used,
                        "latency": obs.latency,
                        "success": obs.success,
                    },
                )

            # Run pattern detection
            pattern_detector = PatternDetector(self.memory)
            new_patterns = await pattern_detector.check_for_patterns()

            if new_patterns:
                logger.info(f"Detected {len(new_patterns)} new patterns")

        except Exception as e:
            logger.error(f"Batch processing error: {e}")

    async def _periodic_analyzer(self):
        """Run periodic deep analysis."""
        while self.is_running:
            try:
                await asyncio.sleep(self.analysis_interval)

                # Get recent interactions
                recent = await self.memory.get_recent_context(limit=100)

                # Run various analyses
                insights = []

                # Pattern mining
                pattern_insights = await self._mine_patterns(recent)
                insights.extend(pattern_insights)

                # Context optimization
                context_insights = await self._optimize_context(recent)
                insights.extend(context_insights)

                # Knowledge consolidation
                consolidation_insights = await self._consolidate_knowledge()
                insights.extend(consolidation_insights)

                # Cache high-confidence insights
                for insight in insights:
                    if insight.confidence >= self.min_confidence:
                        self.insights_cache.append(insight)

                logger.info(f"Periodic analysis generated {len(insights)} insights")

            except Exception as e:
                logger.error(f"Periodic analysis error: {e}")

    async def _mine_patterns(self, recent_context: Dict[str, Any]) -> List[Insight]:
        """Mine patterns from recent interactions."""
        # Support multiple analyzers for pattern mining
        analyzer_providers = self._get_providers_for_role("analyzer")
        if not analyzer_providers:
            return []

        try:
            # Get patterns from memory
            patterns = await self.memory.get_all_patterns()

            # Prepare prompt for LLM analysis
            prompt = f"""Analyze the following patterns detected in the system:

Patterns:
{json.dumps(patterns[:10], indent=2, default=str)}

Recent Context:
{json.dumps(recent_context, indent=2, default=str)}

Provide insights about:
1. Which patterns are most valuable
2. Which patterns might be problematic
3. Opportunities for automation
4. Potential improvements

Return as JSON with structure:
{{
    "valuable_patterns": [...],
    "problematic_patterns": [...],
    "automation_opportunities": [...],
    "improvements": [...]
}}"""

            # Use the first available analyzer for now
            # In future, could parallelize across multiple analyzers
            response = await self.llms[analyzer_providers[0]].analyze(prompt)

            analysis = json.loads(response)  # Let JSON errors fail!

            insights = []

            # Convert analysis to insights
            if "valuable_patterns" in analysis:
                for pattern in analysis["valuable_patterns"]:
                    insights.append(
                        Insight(
                            type=AnalysisType.PATTERN_MINING,
                            confidence=0.8,
                            description=f"Valuable pattern identified: {pattern.get('name', 'Unknown')}",
                            recommendations=[
                                pattern.get("recommendation", "Continue using this pattern")
                            ],
                            data=pattern,
                        )
                    )

            if "automation_opportunities" in analysis:
                for opp in analysis["automation_opportunities"]:
                    insights.append(
                        Insight(
                            type=AnalysisType.PATTERN_MINING,
                            confidence=0.9,
                            description=f"Automation opportunity: {opp.get('description', 'Unknown')}",
                            recommendations=opp.get("steps", []),
                            data=opp,
                        )
                    )

            return insights

        except Exception as e:
            logger.error(f"Pattern mining error: {e}")
            return []

    async def _optimize_context(self, recent_context: Dict[str, Any]) -> List[Insight]:
        """Optimize context usage based on recent interactions."""
        optimizer_providers = self._get_providers_for_role("optimizer")
        if not optimizer_providers:
            return []

        try:
            # Analyze context effectiveness
            top_files = recent_context.get("top_files", [])

            prompt = f"""Analyze context usage patterns:

Most accessed files:
{json.dumps(top_files, indent=2)}

Total interactions: {recent_context.get("total_interactions", 0)}

Provide optimization suggestions:
1. Which files should always be in context?
2. Which files are accessed together?
3. What context is missing?
4. How to organize context better?

Format as JSON with confidence scores."""

            response = await self.llms[optimizer_providers[0]].analyze(prompt)

            # Create context optimization insight
            insight = Insight(
                type=AnalysisType.CONTEXT_OPTIMIZATION,
                confidence=0.8,
                description="Context usage analysis",
                recommendations=[
                    f"Always include: {', '.join([f['file'] for f in top_files[:3]])}"
                ],
                data={"analysis": response},
            )

            return [insight]

        except Exception as e:
            logger.error(f"Context optimization error: {e}")
            return []

    async def _consolidate_knowledge(self) -> List[Insight]:
        """Consolidate and compress knowledge base."""
        try:
            # Get all patterns
            patterns = await self.memory.get_all_patterns()

            # Group similar patterns
            similar_groups = self._group_similar_patterns(patterns)

            insights = []
            for group in similar_groups:
                if len(group) > 1:
                    insight = Insight(
                        type=AnalysisType.KNOWLEDGE_CONSOLIDATION,
                        confidence=0.9,
                        description=f"Found {len(group)} similar patterns that can be merged",
                        recommendations=[
                            f"Merge patterns: {', '.join([p['name'] for p in group[:3]])}"
                        ],
                        data={"patterns": group},
                    )
                    insights.append(insight)

            return insights

        except Exception as e:
            logger.error(f"Knowledge consolidation error: {e}")
            return []

    def _group_similar_patterns(self, patterns: List[Dict]) -> List[List[Dict]]:
        """Group patterns by similarity."""
        # Simple grouping by pattern type for now
        groups = {}
        for pattern in patterns:
            key = pattern.get("pattern_type", "unknown")
            if key not in groups:
                groups[key] = []
            groups[key].append(pattern)

        return [group for group in groups.values() if len(group) > 1]

    async def _analyze_failure(self, observation: Observation) -> Optional[Insight]:
        """Analyze a failed interaction."""
        analyzer_providers = self._get_providers_for_role("analyzer")
        if not analyzer_providers:
            return None

        try:
            prompt = f"""Analyze this failed interaction:

Query: {observation.query}
Context used: {json.dumps(observation.context_used, indent=2)}
Error/Response: {observation.response}

Identify:
1. Root cause of failure
2. Missing context or knowledge
3. How to prevent similar failures

Provide specific recommendations."""

            analysis = await self.llms[analyzer_providers[0]].analyze(prompt)

            return Insight(
                type=AnalysisType.ERROR_ANALYSIS,
                confidence=0.85,
                description="Failure analysis",
                recommendations=[analysis],
                data={"observation": observation.__dict__, "analysis": analysis},
            )

        except Exception as e:
            logger.error(f"Failure analysis error: {e}")
            return None

    async def _analyze_performance(self, observation: Observation) -> Optional[Insight]:
        """Analyze performance issues."""
        return Insight(
            type=AnalysisType.CONTEXT_OPTIMIZATION,
            confidence=0.75,
            description=f"High latency detected: {observation.latency}s",
            recommendations=[
                "Reduce context size",
                "Pre-compute common queries",
                "Cache frequent responses",
            ],
            data={"latency": observation.latency},
        )

    async def _analyze_resource_usage(self, observation: Observation) -> Optional[Insight]:
        """Analyze resource usage."""
        return Insight(
            type=AnalysisType.CONTEXT_OPTIMIZATION,
            confidence=0.7,
            description=f"High token usage: {observation.tokens_used}",
            recommendations=[
                "Compress context",
                "Use more specific queries",
                "Remove redundant information",
            ],
            data={"tokens": observation.tokens_used},
        )

    async def _insight_applicator(self):
        """Apply insights to improve the system."""
        while self.is_running:
            try:
                await asyncio.sleep(60)  # Check every minute

                # Process cached insights
                while self.insights_cache:
                    insight = self.insights_cache.pop(0)
                    await self._apply_insight(insight)

            except Exception as e:
                logger.error(f"Insight application error: {e}")

    async def _apply_insight(self, insight: Insight):
        """Apply a single insight to improve the system."""
        try:
            if insight.type == AnalysisType.PATTERN_MINING:
                # Add discovered pattern to the pattern store
                pattern_data = insight.data
                if "type" in pattern_data and "description" in pattern_data:
                    await self.memory.store.add_pattern(
                        {
                            "name": f"Sleep: {pattern_data['description'][:50]}",
                            "description": pattern_data["description"],
                            "pattern_type": pattern_data["type"],
                            "sequence": [],  # Will be filled by pattern detector
                            "confidence": insight.confidence,
                            "source": "sleep_analysis",
                        }
                    )

            elif insight.type == AnalysisType.CONTEXT_OPTIMIZATION:
                # Store context optimization preferences
                for rec in insight.recommendations:
                    if rec.startswith("Always include:"):
                        files = rec.replace("Always include:", "").strip()
                        await self.memory.store.add_preference(
                            {
                                "key": "always_include_files",
                                "value": files,
                                "category": "context",
                                "confidence": insight.confidence,
                                "source": "sleep",
                            }
                        )

            elif insight.type == AnalysisType.ERROR_ANALYSIS:
                # Store error patterns for future prevention
                await self.memory.store.add_pattern(
                    {
                        "name": "Error pattern",
                        "description": insight.description,
                        "pattern_type": "error",
                        "sequence": [],
                        "confidence": insight.confidence,
                        "metadata": insight.data,
                    }
                )

            logger.info(f"Applied insight: {insight.type.value}")

        except Exception as e:
            logger.error(f"Failed to apply insight: {e}")

    async def get_prompt_recommendation(
        self, query: str, current_context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Get prompt enhancement recommendations."""
        enhancer_providers = self._get_providers_for_role("enhancer")
        if not enhancer_providers:
            return {"enhanced": query, "reasoning": "No enhancer LLM available"}

        try:
            # Get relevant patterns
            patterns = await self.memory.get_all_patterns()
            preferences = await self.memory.get_preferences()

            prompt = f"""Enhance this query for better results:

Original query: {query}
Current context files: {current_context.get("files", [])}
Known patterns: {len(patterns)}
Preferences: {json.dumps(preferences, indent=2)}

Provide:
1. Enhanced query with better specificity
2. Relevant context to include
3. Examples from similar past queries
4. Suggested output format

Return as JSON."""

            response = await self.llms[enhancer_providers[0]].generate(prompt)

            try:
                enhancement = json.loads(response)
                return {
                    "original": query,
                    "enhanced": enhancement.get("query", query),
                    "context_suggestions": enhancement.get("context", []),
                    "examples": enhancement.get("examples", []),
                    "format": enhancement.get("format", ""),
                    "reasoning": enhancement.get("reasoning", ""),
                }
            except json.JSONDecodeError:
                return {"enhanced": query, "reasoning": "Failed to parse enhancement"}

        except Exception as e:
            logger.error(f"Prompt recommendation error: {e}")
            return {"enhanced": query, "reasoning": f"Error: {str(e)}"}

    async def _role_monitor(self):
        """Monitor and update active roles based on context."""
        while self.is_running:
            try:
                await asyncio.sleep(30)  # Check every 30 seconds

                # Get current context
                recent_context = await self.memory.get_recent_context(limit=20)
                context = {
                    "task_description": "",
                    "files": [f["file"] for f in recent_context.get("top_files", [])],
                    "recent_actions": [
                        i.get("action", "") for i in recent_context.get("recent_interactions", [])
                    ],
                }

                # Update active role
                new_role = await self.role_manager.get_active_role(context)
                if new_role != self.current_role:
                    self.current_role = new_role
                    logger.info(f"Active role changed to: {new_role.name if new_role else 'None'}")

                    # Create insight about role change
                    if new_role:
                        insight = Insight(
                            type=AnalysisType.CONTEXT_OPTIMIZATION,
                            confidence=0.8,
                            description=f"Role activated: {new_role.name}",
                            recommendations=[new_role.description],
                            data={
                                "role": new_role.name,
                                "triggers": [t.pattern for t in new_role.context_triggers],
                            },
                        )
                        self.insights_cache.append(insight)

            except Exception as e:
                logger.error(f"Role monitoring error: {e}")

    async def get_role_based_prompt(self, query: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """Get prompt enhanced with role-specific context."""
        # Update role based on current context
        self.current_role = await self.role_manager.get_active_role(context)

        result = {
            "original": query,
            "enhanced": query,
            "role": None,
            "role_context": "",
            "reasoning": "",
        }

        if self.current_role:
            result["role"] = self.current_role.name
            result["role_context"] = self.current_role.to_prompt_context()

            # Enhance query with role-specific modifiers
            enhanced_parts = [query]

            # Add tool preferences hint
            if self.current_role.tool_preferences:
                top_tools = sorted(self.current_role.tool_preferences.items(), key=lambda x: -x[1])[
                    :3
                ]
                if top_tools:
                    tool_hint = f"(Consider using: {', '.join([t[0] for t in top_tools])})"
                    enhanced_parts.append(tool_hint)

            result["enhanced"] = " ".join(enhanced_parts)
            result["reasoning"] = f"Applied '{self.current_role.name}' role based on context"

            # Update role performance based on usage
            await self.role_manager.update_role_performance(self.current_role.name, True)

        return result

    async def get_role_statistics(self) -> Dict[str, Any]:
        """Get role usage statistics."""
        return self.role_manager.get_role_statistics()

    async def get_role_recommendations(self, context: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Get role recommendations for a given context."""
        return await self.role_manager.get_role_recommendations(context)

    async def get_world_model_proposals(
        self, recent_interactions: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Get goal-directed proposals based on world model understanding."""
        if not self.world_model:
            logger.warning("World model not initialized")
            return []

        proposals = []

        try:
            # Update world model with recent interactions
            for interaction in recent_interactions:
                await self.world_model.infer_from_interaction(interaction)

            # Get current world state
            insights = self.world_model.get_insights()

            # Generate proposals based on world state
            if insights.get("recent_goals"):
                # Analyze goals to propose next actions
                generator_providers = self._get_providers_for_role("generator")
                if generator_providers:
                    prompt = f"""Based on the following world model insights, suggest 3-5 goal-directed proposals:

World Model Insights:
- Domain: {insights.get("domain", "unknown")}
- Recent Goals: {json.dumps(insights.get("recent_goals", []), indent=2)}
- Success Rate: {insights.get("success_rate", 0):.2%}
- Entity Types: {", ".join(insights.get("discovered_entity_types", [])[:5])}
- Common Relations: {", ".join(insights.get("discovered_relation_types", [])[:5])}

Generate proposals that:
1. Help achieve unfinished goals
2. Address areas with low success rates
3. Explore related entities or patterns
4. Suggest improvements based on failures

Format as JSON array of proposals with: type, description, confidence, rationale"""

                    response = await self.llms[generator_providers[0]].generate(prompt)

                    try:
                        generated_proposals = json.loads(response)
                        if isinstance(generated_proposals, list):
                            proposals.extend(generated_proposals[:5])  # Limit to 5
                    except json.JSONDecodeError:
                        logger.error("Failed to parse generated proposals")

            # Add proposals based on success patterns
            if insights.get("success_rate", 0) < 0.7:
                proposals.append(
                    {
                        "type": "IMPROVEMENT",
                        "description": "Review and improve error handling in recent workflows",
                        "confidence": 0.8,
                        "rationale": f"Success rate is {insights.get('success_rate', 0):.1%}, indicating room for improvement",
                    }
                )

            # Add domain-specific proposals
            if insights.get("domain") == "coding":
                if "test" not in str(insights.get("discovered_entity_types", [])).lower():
                    proposals.append(
                        {
                            "type": "QUALITY",
                            "description": "Add test coverage for recent changes",
                            "confidence": 0.7,
                            "rationale": "No test-related entities detected in recent interactions",
                        }
                    )

            # Track proposals in world model for feedback loop
            for proposal in proposals:
                proposal["id"] = str(uuid.uuid4())
                proposal["timestamp"] = datetime.now().isoformat()

            return proposals

        except Exception as e:
            logger.error(f"Error generating world model proposals: {e}")
            return []

    def _calculate_recent_success_rate(self, interactions: List[Dict[str, Any]]) -> float:
        """Calculate success rate from recent interactions."""
        if not interactions:
            return 1.0

        successes = sum(1 for i in interactions if i.get("success", False))
        return successes / len(interactions)

    async def update_world_model_from_feedback(
        self, proposal_id: str, feedback: str, success: bool
    ):
        """Update world model based on feedback on proposals."""
        if not self.world_model:
            logger.warning("World model not initialized for feedback processing")
            return

        try:
            # Create a feedback interaction to update world model
            feedback_interaction = {
                "interaction_id": proposal_id,
                "timestamp": datetime.now().isoformat(),
                "user_query": f"Feedback on proposal: {feedback}",
                "success": success,
                "feedback": feedback,
                "feedback_type": "APPROVAL" if success else "CORRECTION",
                "actions_taken": [
                    {
                        "action": "proposal_feedback",
                        "status": "completed",
                        "result": {"success": success},
                    }
                ],
            }

            # Update world model with feedback
            await self.world_model.infer_from_interaction(feedback_interaction)

            # If this was a correction, analyze what went wrong
            if not success and self.llm_service:
                analyzer_providers = self._get_providers_for_role("analyzer")
                if analyzer_providers:
                    prompt = f"""Analyze this proposal feedback to improve future suggestions:

Proposal ID: {proposal_id}
Feedback: {feedback}
Success: {success}

What can we learn from this feedback to improve future proposals?
Provide insights about:
1. What was misunderstood
2. What constraints were missed
3. How to adjust future proposals

Format as JSON with: lesson, constraint, adjustment"""

                    response = await self.llms[analyzer_providers[0]].analyze(prompt)

                    try:
                        insights = json.loads(response)
                        # Store these insights as constraints in world model
                        if self.world_model.current_world:
                            constraints = self.world_model.current_world.constraints
                            constraints[f"feedback_{proposal_id}"] = {
                                "lesson": insights.get("lesson", ""),
                                "constraint": insights.get("constraint", ""),
                                "adjustment": insights.get("adjustment", ""),
                                "timestamp": datetime.now().isoformat(),
                            }
                    except json.JSONDecodeError:
                        logger.error("Failed to parse feedback insights")

            logger.info(
                "World model updated with feedback",
                extra={
                    "proposal_id": proposal_id,
                    "success": success,
                    "world_state_entities": (
                        len(self.world_model.current_world.entities)
                        if self.world_model.current_world
                        else 0
                    ),
                },
            )

        except Exception as e:
            logger.error(f"Error updating world model from feedback: {e}")

    async def get_current_world_understanding(self) -> Dict[str, Any]:
        """Get the current world model understanding."""
        if not self.world_model:
            return {"status": "world_model_not_initialized"}

        try:
            # Get world model insights
            insights = self.world_model.get_insights()
            current_world = self.world_model.current_world

            # Build comprehensive understanding
            understanding = {
                "status": "active",
                "domain": {
                    "name": insights.get("domain", "unknown"),
                    "confidence": insights.get("domain_confidence", 0.0),
                },
                "entities": {
                    "total": insights.get("total_entities", 0),
                    "types": insights.get("discovered_entity_types", []),
                    "recent": [],
                },
                "relations": {
                    "total": insights.get("total_relations", 0),
                    "types": insights.get("discovered_relation_types", []),
                    "strong_patterns": [],
                },
                "goals": {
                    "total": len(insights.get("recent_goals", [])),
                    "achieved": sum(
                        1 for g in insights.get("recent_goals", []) if g.get("achieved")
                    ),
                    "recent": insights.get("recent_goals", [])[:5],
                },
                "metrics": {
                    "success_rate": insights.get("success_rate", 0),
                    "interaction_count": insights.get("interaction_count", 0),
                    "entity_diversity": insights.get("entity_type_diversity", 0),
                    "relation_diversity": insights.get("relation_type_diversity", 0),
                },
                "constraints": current_world.constraints if current_world else {},
                "learning_progress": {
                    "domain_stability": self._calculate_domain_stability(),
                    "pattern_emergence": (
                        len(current_world.relations) / max(1, len(current_world.entities))
                        if current_world
                        else 0
                    ),
                    "goal_achievement_trend": self._calculate_goal_trend(
                        insights.get("recent_goals", [])
                    ),
                },
            }

            # Add top entities by interaction
            if current_world and current_world.entities:
                sorted_entities = sorted(
                    current_world.entities.values(),
                    key=lambda e: e.properties.get("interaction_count", 0),
                    reverse=True,
                )
                understanding["entities"]["recent"] = [
                    {
                        "id": e.id,
                        "type": e.type,
                        "properties": dict(list(e.properties.items())[:3]),  # First 3 properties
                    }
                    for e in sorted_entities[:5]
                ]

            # Add strong relation patterns
            if current_world and current_world.relations:
                strong_relations = [r for r in current_world.relations if r.confidence > 0.7]
                understanding["relations"]["strong_patterns"] = [
                    {
                        "type": r.type,
                        "source": r.source_id,
                        "target": r.target_id,
                        "confidence": r.confidence,
                        "count": r.observed_count,
                    }
                    for r in sorted(strong_relations, key=lambda r: r.confidence, reverse=True)[:5]
                ]

            return understanding

        except Exception as e:
            logger.error(f"Error getting world understanding: {e}")
            return {"status": "error", "error": str(e)}

    def _build_role_provider_map(self) -> Dict[str, List[str]]:
        """Build a map of roles to provider IDs from configuration."""
        role_map = defaultdict(list)

        # Get role mappings from config
        role_config = self.config.get("roles", {})

        # If roles are mapped to single providers, convert to lists
        for role, provider in role_config.items():
            if isinstance(provider, str):
                # Single provider specified
                if provider in self.llms:
                    role_map[role].append(provider)
            elif isinstance(provider, list):
                # Multiple providers specified
                for p in provider:
                    if p in self.llms:
                        role_map[role].append(p)

        # Add defaults if not specified
        if "analyzer" not in role_map:
            # Use all providers that can analyze
            role_map["analyzer"] = [p for p in self.llms.keys() if p != "mock"]

        if "generator" not in role_map:
            role_map["generator"] = role_map["analyzer"].copy()

        if "optimizer" not in role_map:
            role_map["optimizer"] = role_map["analyzer"].copy()

        if "enhancer" not in role_map:
            role_map["enhancer"] = role_map["generator"].copy()

        return dict(role_map)

    def _get_providers_for_role(self, role: str) -> List[str]:
        """Get list of provider IDs that can handle a specific role."""
        providers = self.role_providers.get(role, [])

        # Filter out any that are no longer available
        available = [p for p in providers if p in self.llms]

        # Fallback to any available provider if none configured
        if not available and self.llms:
            available = [next(iter(self.llms.keys()))]

        return available

    def _calculate_domain_stability(self) -> float:
        """Calculate how stable the domain understanding is."""
        if not self.world_model or not self.world_model.current_world:
            return 0.0

        # Domain stability based on confidence and interaction count
        domain_confidence = self.world_model.current_world.domain_confidence
        interaction_count = self.world_model.current_world.interaction_count

        # More interactions = more stable understanding
        stability = domain_confidence * min(1.0, interaction_count / 50)
        return stability

    def _calculate_goal_trend(self, recent_goals: List[Dict[str, Any]]) -> float:
        """Calculate trend in goal achievement rate."""
        if len(recent_goals) < 2:
            return 0.0

        # Split goals into first half and second half
        mid = len(recent_goals) // 2
        first_half = recent_goals[:mid]
        second_half = recent_goals[mid:]

        # Calculate achievement rates
        first_rate = sum(1 for g in first_half if g.get("achieved")) / max(1, len(first_half))
        second_rate = sum(1 for g in second_half if g.get("achieved")) / max(1, len(second_half))

        # Return trend (-1 to 1), handle division by zero
        return float(second_rate - first_rate)
