#!/usr/bin/env python3
"""Generate DCP Review Center User Manual PDF."""
import sys
sys.path.insert(0, '/root/.hermes/hermes-agent/venv/lib/python3.12/site-packages')
from fpdf import FPDF
import os

class ManualPDF(FPDF):
    def __init__(self):
        super().__init__('P', 'mm', 'A4')
        # Try to use a CJK font
        font_dir = '/usr/share/fonts'
        cjk_font = None
        # First try /tmp extracted fonts
        for tmp_font in ['/tmp/wqy-microhei.ttf', '/tmp/NotoSansCJKsc-Regular.ttf']:
            if os.path.exists(tmp_font):
                cjk_font = tmp_font
                break
        # Then search system fonts
        if not cjk_font:
            for root, dirs, files in os.walk(font_dir):
                for f in files:
                    if f.endswith('.ttf') and any(k in f.lower() for k in ['noto', 'cjk', 'wqy', 'wenquan', 'simsun', 'simhei', 'droid', 'source']):
                        cjk_font = os.path.join(root, f)
                        break
                if cjk_font:
                    break
        self.cjk_font = cjk_font
        if cjk_font:
            self.add_font('CJK', '', cjk_font)
            self.add_font('CJK', 'B', cjk_font)
        self.set_auto_page_break(True, 20)

    def header(self):
        if self.page_no() > 1:
            self.set_font('CJK', '', 8) if self.cjk_font else self.set_font('Helvetica', '', 8)
            self.set_text_color(150)
            self.cell(0, 8, 'DCP Review Center v1.29.0 - User Manual', align='C')
            self.ln(4)

    def footer(self):
        self.set_y(-15)
        self.set_font('CJK', '', 8) if self.cjk_font else self.set_font('Helvetica', '', 8)
        self.set_text_color(150)
        self.cell(0, 10, f'Page {self.page_no()}/{{nb}}', align='C')

    def title_page(self):
        self.add_page()
        self.ln(40)
        self.set_font('CJK', 'B', 28) if self.cjk_font else self.set_font('Helvetica', 'B', 28)
        self.set_text_color(22, 119, 255)
        self.cell(0, 15, 'DCP Review Center', align='C')
        self.ln(16)
        self.set_font('CJK', '', 20) if self.cjk_font else self.set_font('Helvetica', '', 20)
        self.set_text_color(80)
        self.cell(0, 12, 'User Manual', align='C')
        self.ln(20)
        self.set_font('CJK', '', 12) if self.cjk_font else self.set_font('Helvetica', '', 12)
        self.set_text_color(120)
        self.cell(0, 10, 'Version 1.29.0', align='C')
        self.ln(8)
        self.cell(0, 10, 'ONES Plugin - Team-level DCP/TR Review Management', align='C')
        self.ln(8)
        self.cell(0, 10, 'App ID: 709xehle  |  Mode: Organization', align='C')

    def section_title(self, text):
        self.ln(4)
        self.set_font('CJK', 'B', 16) if self.cjk_font else self.set_font('Helvetica', 'B', 16)
        self.set_text_color(22, 119, 255)
        self.cell(0, 10, text)
        self.ln(12)
        self.set_draw_color(22, 119, 255)
        self.line(self.l_margin, self.get_y(), self.w - self.r_margin, self.get_y())
        self.ln(4)

    def sub_title(self, text):
        self.ln(2)
        self.set_font('CJK', 'B', 13) if self.cjk_font else self.set_font('Helvetica', 'B', 13)
        self.set_text_color(50)
        self.cell(0, 8, text)
        self.ln(10)

    def body(self, text):
        self.set_font('CJK', '', 10) if self.cjk_font else self.set_font('Helvetica', '', 10)
        self.set_text_color(60)
        self.multi_cell(0, 6, text)
        self.ln(2)

    def bullet(self, text, indent=5):
        self.set_font('CJK', '', 10) if self.cjk_font else self.set_font('Helvetica', '', 10)
        self.set_text_color(60)
        x = self.l_margin + indent
        self.set_x(x)
        self.cell(4, 5, chr(8226))
        self.multi_cell(self.w - self.r_margin - x - 4, 5, text)

    def note_box(self, text):
        self.set_fill_color(240, 245, 255)
        self.set_draw_color(22, 119, 255)
        y = self.get_y()
        self.rect(self.l_margin + 3, y, self.w - self.l_margin - self.r_margin - 6, 0, 'D')
        self.set_font('CJK', '', 9) if self.cjk_font else self.set_font('Helvetica', '', 9)
        self.set_text_color(22, 119, 255)
        self.set_x(self.l_margin + 8)
        self.multi_cell(self.w - self.l_margin - self.r_margin - 16, 5, text)
        self.set_text_color(60)

    def table_row(self, cells, widths, header=False):
        if header:
            self.set_fill_color(22, 119, 255)
            self.set_text_color(255)
            self.set_font('CJK', 'B', 9) if self.cjk_font else self.set_font('Helvetica', 'B', 9)
        else:
            self.set_fill_color(250, 250, 250) if self.page_no() % 2 == 0 else self.set_fill_color(255, 255, 255)
            self.set_text_color(60)
            self.set_font('CJK', '', 9) if self.cjk_font else self.set_font('Helvetica', '', 9)
        for i, (cell, w) in enumerate(zip(cells, widths)):
            self.cell(w, 7, str(cell), border=1, fill=True)
        self.ln()

print("ManualPDF class ready")