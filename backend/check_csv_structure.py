import csv
import json

file_path = r"e:\nutrifit-app\Verified_MuscleWiki_Data.csv"
try:
    with open(file_path, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        headers = reader.fieldnames
        print(f"Headers: {headers}")
        rows = []
        for i, row in enumerate(reader):
            rows.append(row)
            if i >= 4:
                break
        for row in rows:
            print(row)
except Exception as e:
    print(f"Error: {e}")
