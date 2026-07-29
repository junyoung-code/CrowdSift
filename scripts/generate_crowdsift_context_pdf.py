#!/usr/bin/env python3
"""Generate the canonical CrowdSift product-context PDF from Markdown."""

from __future__ import annotations

import re
from html import escape
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    PageTemplate,
    Paragraph,
    Preformatted,
    Spacer,
)


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs" / "product-context.md"
OUTPUT = ROOT / "docs" / "CrowdSift_Project_Context_v1.0.pdf"
FONT_PATH = Path("/System/Library/Fonts/Supplemental/AppleGothic.ttf")
FONT_NAME = "AppleGothic"


def inline_markup(text: str) -> str:
    """Escape Markdown text and retain simple bold/code emphasis."""

    placeholders: list[str] = []

    def stash(value: str) -> str:
        placeholders.append(value)
        return f"@@MARKUP{len(placeholders) - 1}@@"

    text = re.sub(
        r"`([^`]+)`",
        lambda match: stash(
            f'<font name="{FONT_NAME}" backColor="#EEF3FF">'
            f'{escape(match.group(1))}</font>'
        ),
        text,
    )
    text = re.sub(
        r"\*\*([^*]+)\*\*",
        lambda match: stash(f"<b>{escape(match.group(1))}</b>"),
        text,
    )
    rendered = escape(text)
    for index, value in enumerate(placeholders):
        rendered = rendered.replace(f"@@MARKUP{index}@@", value)
    return rendered


def build_styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    navy = colors.HexColor("#0B1F44")
    blue = colors.HexColor("#2B6CFF")
    slate = colors.HexColor("#566A8A")

    return {
        "title": ParagraphStyle(
            "CrowdSiftTitle",
            parent=base["Title"],
            fontName=FONT_NAME,
            fontSize=28,
            leading=36,
            textColor=navy,
            alignment=TA_CENTER,
            spaceAfter=18,
        ),
        "subtitle": ParagraphStyle(
            "CrowdSiftSubtitle",
            parent=base["Normal"],
            fontName=FONT_NAME,
            fontSize=10,
            leading=16,
            textColor=blue,
            alignment=TA_CENTER,
            spaceAfter=24,
        ),
        "h2": ParagraphStyle(
            "CrowdSiftH2",
            parent=base["Heading2"],
            fontName=FONT_NAME,
            fontSize=17,
            leading=23,
            textColor=navy,
            spaceBefore=14,
            spaceAfter=8,
            keepWithNext=True,
        ),
        "h3": ParagraphStyle(
            "CrowdSiftH3",
            parent=base["Heading3"],
            fontName=FONT_NAME,
            fontSize=13,
            leading=19,
            textColor=blue,
            spaceBefore=10,
            spaceAfter=6,
            keepWithNext=True,
        ),
        "body": ParagraphStyle(
            "CrowdSiftBody",
            parent=base["BodyText"],
            fontName=FONT_NAME,
            fontSize=9.5,
            leading=16,
            textColor=colors.HexColor("#243858"),
            spaceAfter=7,
            wordWrap="CJK",
        ),
        "bullet": ParagraphStyle(
            "CrowdSiftBullet",
            parent=base["BodyText"],
            fontName=FONT_NAME,
            fontSize=9.2,
            leading=15,
            leftIndent=13,
            firstLineIndent=-8,
            textColor=colors.HexColor("#243858"),
            spaceAfter=4,
            wordWrap="CJK",
        ),
        "code": ParagraphStyle(
            "CrowdSiftCode",
            parent=base["Code"],
            fontName=FONT_NAME,
            fontSize=8.4,
            leading=14,
            leftIndent=10,
            rightIndent=10,
            borderColor=colors.HexColor("#D7E2F7"),
            borderWidth=0.7,
            borderPadding=9,
            backColor=colors.HexColor("#F5F8FF"),
            textColor=navy,
            spaceBefore=3,
            spaceAfter=10,
            wordWrap="CJK",
        ),
        "footer": ParagraphStyle(
            "CrowdSiftFooter",
            parent=base["Normal"],
            fontName=FONT_NAME,
            fontSize=8,
            textColor=slate,
            alignment=TA_CENTER,
        ),
    }


def page_decoration(canvas, doc) -> None:
    width, height = A4
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor("#DDE7F8"))
    canvas.setLineWidth(0.6)
    canvas.line(20 * mm, height - 16 * mm, width - 20 * mm, height - 16 * mm)
    canvas.setFillColor(colors.HexColor("#2B6CFF"))
    canvas.setFont(FONT_NAME, 8)
    canvas.drawString(20 * mm, height - 12.5 * mm, "CrowdSift · Product Context v1.0")
    canvas.setFillColor(colors.HexColor("#667A99"))
    canvas.drawCentredString(width / 2, 11 * mm, f"{doc.page}")
    canvas.restoreState()


def markdown_story(markdown: str, styles: dict[str, ParagraphStyle]):
    lines = markdown.splitlines()
    story = []
    paragraph_lines: list[str] = []
    code_lines: list[str] = []
    in_code = False

    def flush_paragraph() -> None:
        if not paragraph_lines:
            return
        text = " ".join(line.strip() for line in paragraph_lines)
        story.append(Paragraph(inline_markup(text), styles["body"]))
        paragraph_lines.clear()

    for line in lines:
        stripped = line.rstrip()

        if stripped.startswith("```"):
            flush_paragraph()
            if in_code:
                story.append(
                    Preformatted(
                        "\n".join(code_lines),
                        styles["code"],
                        maxLineLength=82,
                    )
                )
                code_lines.clear()
                in_code = False
            else:
                in_code = True
            continue

        if in_code:
            code_lines.append(stripped)
            continue

        if not stripped:
            flush_paragraph()
            continue

        if stripped.startswith("# "):
            flush_paragraph()
            title = stripped[2:].strip()
            story.extend(
                [
                    Spacer(1, 12 * mm),
                    Paragraph(inline_markup(title), styles["title"]),
                    Paragraph(
                        "한국 YouTube 크리에이터를 위한 AI 댓글 운영 도구",
                        styles["subtitle"],
                    ),
                ]
            )
            continue

        if stripped.startswith("## "):
            flush_paragraph()
            story.append(Paragraph(inline_markup(stripped[3:]), styles["h2"]))
            continue

        if stripped.startswith("### "):
            flush_paragraph()
            story.append(Paragraph(inline_markup(stripped[4:]), styles["h3"]))
            continue

        bullet_match = re.match(r"^[-*]\s+(.+)$", stripped)
        numbered_match = re.match(r"^(\d+)\.\s+(.+)$", stripped)
        if bullet_match:
            flush_paragraph()
            story.append(
                Paragraph(
                    f"•&nbsp;&nbsp;{inline_markup(bullet_match.group(1))}",
                    styles["bullet"],
                )
            )
            continue

        if numbered_match:
            flush_paragraph()
            story.append(
                Paragraph(
                    f"{numbered_match.group(1)}.&nbsp;&nbsp;"
                    f"{inline_markup(numbered_match.group(2))}",
                    styles["bullet"],
                )
            )
            continue

        paragraph_lines.append(stripped)

    flush_paragraph()
    if code_lines:
        story.append(Preformatted("\n".join(code_lines), styles["code"]))

    return story


def main() -> None:
    if not FONT_PATH.exists():
        raise FileNotFoundError(f"Required Korean font not found: {FONT_PATH}")

    pdfmetrics.registerFont(TTFont(FONT_NAME, str(FONT_PATH)))
    styles = build_styles()

    doc = BaseDocTemplate(
        str(OUTPUT),
        pagesize=A4,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
        topMargin=23 * mm,
        bottomMargin=18 * mm,
        title="CrowdSift Product Context",
        author="CrowdSift",
        subject="Canonical implementation context for CrowdSift",
    )
    frame = Frame(
        doc.leftMargin,
        doc.bottomMargin,
        doc.width,
        doc.height,
        id="content",
    )
    doc.addPageTemplates(
        [PageTemplate(id="CrowdSift", frames=[frame], onPage=page_decoration)]
    )

    markdown = SOURCE.read_text(encoding="utf-8")
    story = markdown_story(markdown, styles)
    story.append(
        KeepTogether(
            [
                Spacer(1, 8),
                Paragraph(
                    "이 문서는 docs/product-context.md에서 자동 생성되었습니다.",
                    styles["footer"],
                ),
            ]
        )
    )
    doc.build(story)
    print(OUTPUT)


if __name__ == "__main__":
    main()
