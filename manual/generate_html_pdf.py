#!/usr/bin/env python3
"""Main: Build HTML from all content parts and generate PDF via weasyprint."""
import sys, os

sys.path.insert(0, '/root/.hermes/hermes-agent/venv/lib/python3.12/site-packages')

os.chdir(os.path.dirname(os.path.abspath(__file__)))

from gen_html_p1 import sections as s1, HTML_HEADER, HTML_FOOTER
from gen_html_p2 import sections as s2
from gen_html_p3 import sections as s3

# Combine all sections
all_sections = s1 + s2 + s3

# Build full HTML
full_html = HTML_HEADER + '\n'.join(all_sections) + HTML_FOOTER

# Write HTML for debugging
html_path = os.path.join(os.path.dirname(__file__), 'DCP_Manual.html')
with open(html_path, 'w', encoding='utf-8') as f:
    f.write(full_html)
print(f"HTML written: {html_path} ({len(full_html):,} chars)")

# Generate PDF
from weasyprint import HTML as WHTML
output_path = os.path.join(os.path.dirname(__file__), 'DCP_Review_Center_User_Manual_v1.29.0.pdf')

print("Generating PDF...")
doc = WHTML(string=full_html).render()
doc.write_pdf(output_path)

file_size = os.path.getsize(output_path)
page_count = len(doc.pages)
print(f"\nPDF generated successfully!")
print(f"Path: {output_path}")
print(f"Size: {file_size:,} bytes ({file_size/1024:.1f} KB)")
print(f"Pages: {page_count}")