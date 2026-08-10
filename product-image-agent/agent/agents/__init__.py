"""
english_textagent — Multi-Agent v2 text

text：
  ┌─────────────┐      ┌──────────────┐      ┌─────────────────────────────┐
  │   user       │◄────►│ textagent    │─────►│ english_text (Orchestrator)    │
  │  (english_text)   │      │ (Observer)   │      │                             │
  └─────────────┘      └──────────────┘      │  Analyst → Generator        │
                            │   ▲             │       → Layout → QA         │
                            │   │  english_text     └─────────────────────────────┘
                            └───┴──────────────────┘

- textagent：textusertext，english_text，texttask，english_text
- english_text：text 4 english_textagentenglish_text
"""

from .observer import ObserverAgent
from .executor import ExecutorAgent
from .orchestrator import OrchestratorBrain
from .analyst import AnalystAgent
from .generator import GeneratorAgent
from .qa import QAAgent
from .layout import LayoutAgent
from .researcher import ResearcherAgent
from .toolkit import AgentToolkit
from .base_agent import BaseSubAgent
from .protocol import AgentMessage, make_task, make_report, validate_report
from .registry import CapabilityRegistry
from .pipeline import Pipeline, Step, LoopEdge
from .telemetry import Telemetry

__all__ = [
    "ObserverAgent",
    "ExecutorAgent",
    "OrchestratorBrain",
    "AnalystAgent",
    "GeneratorAgent",
    "QAAgent",
    "LayoutAgent",
    "ResearcherAgent",
    "AgentToolkit",
    "BaseSubAgent",
    "AgentMessage",
    "make_task",
    "make_report",
    "validate_report",
    "CapabilityRegistry",
    "Pipeline",
    "Step",
    "LoopEdge",
    "Telemetry",
]
