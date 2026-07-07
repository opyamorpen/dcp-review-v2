#!/usr/bin/env python3
"""Main entry point: Build DCP Review Center User Manual PDF."""
import sys
import os

# Ensure we run from the manual directory
os.chdir(os.path.dirname(os.path.abspath(__file__)))

from build_manual import ManualPDF
from content_p1 import build_manual
from content_p2 import build_content_p2
from content_p3 import build_content_p3
from content_p4 import build_content_p4

def main():
    pdf = ManualPDF()
    
    # Check CJK font availability
    if not pdf.cjk_font:
        print("WARNING: No CJK font found! Chinese characters may not render correctly.")
        print("Install a CJK font (e.g., fonts-wqy-microhei) for proper rendering.")
    else:
        print(f"Using CJK font: {pdf.cjk_font}")
    
    # Build all content parts
    build_manual(pdf)
    build_content_p2(pdf)
    build_content_p3(pdf)
    build_content_p4(pdf)
    
    # Output
    output_path = os.path.join(os.path.dirname(__file__), 'DCP_Review_Center_User_Manual_v1.29.0.pdf')
    pdf.output(output_path)
    file_size = os.path.getsize(output_path)
    print(f"\nPDF generated successfully!")
    print(f"Path: {output_path}")
    print(f"Size: {file_size:,} bytes ({file_size/1024:.1f} KB)")
    print(f"Pages: {pdf.page_no()}")

if __name__ == '__main__':
    main()