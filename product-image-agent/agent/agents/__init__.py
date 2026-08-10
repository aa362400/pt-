"""
产品图智能体 — Multi-Agent v2 架构

架构：
  ┌─────────────┐      ┌──────────────┐      ┌─────────────────────────────┐
  │   用户       │◄────►│ 观察智能体    │─────►│ 执行编排器 (Orchestrator)    │
  │  (聊天界面)   │      │ (Observer)   │      │                             │
  └─────────────┘      └──────────────┘      │  Analyst → Generator        │
                            │   ▲             │       → Layout → QA         │
                            │   │  监督验证     └─────────────────────────────┘
                            └───┴──────────────────┘

- 观察智能体：与用户对话，理解意图，派发任务，验证结果
- 执行编排器：协调 4 个专业子智能体按管线顺序执行
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
