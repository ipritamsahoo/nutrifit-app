import csv
import sys
import os

try:
    with open(r"e:\nutrifit-app\Verified_MuscleWiki_Data.csv", "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        row = next(reader)
        print("Columns:", reader.fieldnames)
        print("First row:", row)
except Exception as e:
    print("Error:", e)
