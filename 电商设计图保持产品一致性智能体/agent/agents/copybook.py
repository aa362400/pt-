"""Centralized copy templates for observer replies and proactive questions."""

from __future__ import annotations

OBSERVER_REPLIES = {
    "greet": "👋 你好！我是产品图智能体\n\n我是 **观察智能体**，负责理解你的需求，然后调度 **执行智能体** 帮你干活。\n\n**你可以：**\n1. 📤 **上传产品图片** — 点击输入框左侧的 📎\n2. 💬 **直接告诉我需求** — 比如「帮我生成一组包包的上架图」\n3. 或者先上传图片，我来帮你分析！\n\n> 当前状态：等待上传产品图片",
    "need_image_first": "⏳ 我还没收到你的产品图片呢。\n\n请点击输入框左侧的 **📎** 按钮上传产品照片，或者直接把图片 **拖拽** 到聊天窗口。收到图片后我就能帮你分析并生成了！",
    "ask_analyze": "🔍 好的，我马上开始分析！\n\n我将使用 AI 视觉能力提取以下信息：\n- 产品名称 & 类别\n- 材质 & 颜色\n- 风格 & 关键特征\n- 目标人群 & 使用场景\n\n**观察智能体 → 执行智能体：** 已派发分析任务，请等待结果...",
    "need_generate_first": "⏳ 还没有生成好的图片呢。\n\n请先上传产品图，对我说 **「生成」**，等执行智能体完成后就能下载了。",
}

PROACTIVE_QUESTIONS = {
    "upload": [
        {"id": "product_info", "text": "这是什么产品？", "chips": ["分析一下"]},
        {"id": "platform_target", "text": "主要卖哪个平台？（亚马逊 / Shopify / Lazada 等跨境平台）", "chips": ["选平台"]},
        {"id": "brand_logo", "text": "有品牌名或 Logo 吗？没有也可以先跳过。", "chips": ["设置品牌"]},
    ],
    "post_analyze": [
        {"id": "scene_confirm", "text": "上面的场景推荐符合你的预期吗？要调整还是直接生成？", "chips": ["直接生成", "调整场景"]},
        {"id": "platform_target", "text": "目标平台默认为全部跨境平台，要改吗？", "chips": ["选平台"]},
        {"id": "watermark_need", "text": "需要加水印吗？有的话告诉我路径或稍后上传。", "chips": []},
        {"id": "style_pref", "text": "主图风格有偏好吗？（比如极简白底 / 生活场景感 / 高端质感）", "chips": []},
    ],
}
