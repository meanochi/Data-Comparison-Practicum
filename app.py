# -*- coding: utf-8 -*-
"""ממשק ווב להשוואת קבצי DAT מול קבצי PDF.

הרצה:  python app.py  ואז לפתוח בדפדפן  http://localhost:5000
"""
import os
import tempfile

from flask import Flask, render_template, request

from comparison.comparator import compare_all
from comparison.dat_parser import parse_dat_bytes
from comparison.pdf_parser import parse_pdf_file

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024  # 50MB


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/compare", methods=["POST"])
def compare():
    dat_file = request.files.get("dat_file")
    pdf_files = [f for f in request.files.getlist("pdf_files") if f and f.filename]

    if not dat_file or not dat_file.filename:
        return render_template("index.html", error="יש לבחור קובץ DAT")
    if not pdf_files:
        return render_template("index.html", error="יש לבחור לפחות קובץ PDF אחד")

    dat_result = parse_dat_bytes(dat_file.read())

    pdf_results = []
    for f in pdf_files:
        # pdfplumber עובד עם קובץ בדיסק - שמירה זמנית
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            f.save(tmp)
            tmp_path = tmp.name
        try:
            pdf_results.append((f.filename, parse_pdf_file(tmp_path)))
        finally:
            os.unlink(tmp_path)

    results, warnings = compare_all(dat_result, pdf_results)
    summary = {
        "total": len(results),
        "match": sum(1 for r in results if r.status == "match"),
        "mismatch": sum(1 for r in results if r.status == "mismatch"),
        "missing": sum(1 for r in results if r.status in ("missing_pdf", "missing_dat")),
        "error": sum(1 for r in results if r.status == "error"),
    }
    return render_template(
        "results.html",
        results=results,
        warnings=warnings,
        summary=summary,
        dat_name=dat_file.filename,
    )


if __name__ == "__main__":
    app.run(debug=True, host="127.0.0.1", port=5000)
