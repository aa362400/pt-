"""Centralized copy templates for observer replies and proactive questions."""

from __future__ import annotations

OBSERVER_REPLIES = {
    "greet": "👋 text！textyesenglish_textagent\n\ntextyes **textagent**，english_text，english_text **textagent** english_text。\n\n**english_text：**\n1. 📤 **english_textimage** — textinputenglish_text 📎\n2. 💬 **english_text** — text「textgenerationenglish_textlistingtext」\n3. english_textimage，english_text！\n\n> textstatus：english_textimage",
    "need_image_first": "⏳ english_textimagetext。\n\nenglish_textinputenglish_text **📎** english_text，english_textimage **text** english_text。textimageenglish_textgenerationtext！",
    "ask_analyze": "🔍 text，english_text！\n\nenglish_text AI visualenglish_text：\n- english_text & text\n- text & text\n- text & english_text\n- english_text & textscene\n\n**textagent → textagent：** english_texttask，english_text...",
    "need_generate_first": "⏳ textyesgenerationtextimagetext。\n\nenglish_text，english_text **「generation」**，english_textagentcompletedenglish_text。",
}

PROACTIVE_QUESTIONS = {
    "upload": [
        {"id": "product_info", "text": "textyesenglish_text？", "chips": ["english_text"]},
        {"id": "platform_target", "text": "english_textplatform？（english_text / Shopify / Lazada english_textplatform）", "chips": ["textplatform"]},
        {"id": "brand_logo", "text": "yesenglish_text Logo text？textyesenglish_text。", "chips": ["english_text"]},
    ],
    "post_analyze": [
        {"id": "scene_confirm", "text": "english_textsceneenglish_text？english_textyestextgeneration？", "chips": ["textgeneration", "textscene"]},
        {"id": "platform_target", "text": "textplatformenglish_textalltextplatform，english_text？", "chips": ["textplatform"]},
        {"id": "watermark_need", "text": "english_text？yesenglish_text。", "chips": []},
        {"id": "style_pref", "text": "english_textyesenglish_text？（english_text / textscenetext / english_text）", "chips": []},
    ],
}
