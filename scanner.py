import asyncio
import csv
import httpx
from pathlib import Path

async def check_url(client, sem, row):
    async with sem:
        try:
            musclewiki_url = row.get("Video Link (Male)")
            if not musclewiki_url or "musclewiki.com" not in musclewiki_url:
                return row, False
                
            path = musclewiki_url.split("musclewiki.com/")[1].strip("/")
            parts = path.split("/")
            
            if len(parts) >= 4:
                equipment_slug = parts[0]
                gender = parts[1]
                muscle = parts[2]
                exercise_slug = parts[-1] 
                
                equipment = "-".join([word.capitalize() for word in equipment_slug.split("-")])
                target_filename = f"{gender}-{equipment}-{exercise_slug}-front.mp4"
                
                import urllib.parse
                target_filename = urllib.parse.quote(target_filename)
                check_url = f"https://media.musclewiki.com/media/uploads/videos/branded/{target_filename}"
                
                r = await client.head(check_url, timeout=5.0)
                if r.status_code in (200, 206):
                    return row, True
        except Exception:
            pass
            
        return row, False

async def main():
    csv_path = Path("MuscleWiki_Data_Collection.csv")
    out_path = Path("Verified_MuscleWiki_Data.csv")
    
    if not csv_path.exists():
        print("CSV not found.")
        return
        
    rows = []
    with open(csv_path, 'r', encoding='utf-8-sig', errors='replace') as f:
        reader = csv.DictReader(f)
        fields = reader.fieldnames
        for r in reader:
            rows.append(r)
            
    print(f"Loaded {len(rows)} exercises. Starting scan...")
    
    sem = asyncio.Semaphore(20)  # 20 concurrent requests
    verified_rows = []
    broken_count = 0
    
    async with httpx.AsyncClient() as client:
        tasks = [check_url(client, sem, row) for row in rows]
        results = await asyncio.gather(*tasks)
        
        for row, is_valid in results:
            if is_valid:
                verified_rows.append(row)
            else:
                broken_count += 1
                
    print(f"Scan complete. Found {len(verified_rows)} working videos and {broken_count} broken videos.")
    
    with open(out_path, 'w', encoding='utf-8-sig', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(verified_rows)
        
    print(f"Saved working data to {out_path.name}")

if __name__ == "__main__":
    asyncio.run(main())
